import { db, getSettings, type Doc, type Expense, type GeoPoint, type Trip } from './db';
import { drivingDistance, geocode } from './geo';
import { todayISO } from './utils';

export async function ensureHomeGeo(): Promise<{ label: string; geo: GeoPoint }> {
  const s = await getSettings();
  if (!s.homeAddress) throw new Error("Ajoute ton adresse de domicile dans Paramètres pour calculer les km.");
  if (s.homeGeo) return { label: s.homeAddress, geo: s.homeGeo };
  const r = await geocode(s.homeAddress);
  if (!r) throw new Error("Adresse de domicile introuvable. Vérifie-la dans Paramètres.");
  await db.settings.update('main', { homeGeo: r.geo });
  return { label: s.homeAddress, geo: r.geo };
}

export function docTripReason(doc: Doc, clientName?: string): string {
  const what = doc.title?.trim() || doc.items[0]?.description || 'Travaux';
  const label = doc.type === 'invoice' ? 'Facture' : 'Soumission';
  return `${what} — ${clientName ?? 'client'} (${label} ${doc.number})`;
}

/**
 * Crée ou met à jour automatiquement l'entrée du journal de bord liée à une facture:
 * domicile → adresse de la job (aller-retour), raison = la job effectuée.
 */
export async function syncTripForDoc(docId: number, opts: { force?: boolean } = {}): Promise<Trip | null> {
  const s = await getSettings();
  const doc = await db.docs.get(docId);
  if (!doc) return null;
  if (!opts.force && !(doc.type === 'invoice' && s.autoTripFromInvoices)) return null;
  const client = await db.clients.get(doc.clientId);
  const address = doc.jobAddress?.trim() || client?.address?.trim();
  if (!address) return null;

  const home = await ensureHomeGeo();
  let dest = doc.jobAddress?.trim() ? doc.jobGeo : client?.geo;
  if (!dest) {
    const g = await geocode(address);
    if (!g) throw new Error(`Adresse introuvable: « ${address} ». Précise la ville et le code postal.`);
    dest = g.geo;
    if (doc.jobAddress?.trim()) await db.docs.update(docId, { jobGeo: dest });
    else if (client?.id) await db.clients.update(client.id, { geo: dest });
  }

  const existing = doc.tripId ? await db.trips.get(doc.tripId) : undefined;
  const date = doc.jobDate || doc.date || todayISO();
  const reason = docTripReason(doc, client?.name);

  // Si l'utilisateur a corrigé les km à la main, on respecte sa valeur.
  let oneWayKm = existing?.oneWayKm ?? 0;
  let method: Trip['distanceMethod'] = existing?.distanceMethod ?? 'route';
  let durationMin = existing?.durationMin;
  const destChanged =
    !existing?.toGeo || existing.toGeo.lat !== dest.lat || existing.toGeo.lon !== dest.lon || existing.fromLabel !== home.label;
  if (!existing || opts.force || (existing.distanceMethod !== 'manuel' && destChanged)) {
    const r = await drivingDistance(home.geo, dest);
    oneWayKm = r.km;
    method = r.method;
    durationMin = r.durationMin;
  }
  const roundTrip = existing?.roundTrip ?? s.autoTripRoundTrip;
  const trip: Trip = {
    ...(existing ?? { createdAt: new Date().toISOString(), source: 'auto-facture' as const }),
    date,
    fromLabel: home.label,
    fromGeo: home.geo,
    toLabel: address,
    toGeo: dest,
    oneWayKm,
    roundTrip,
    totalKm: Math.round(oneWayKm * (roundTrip ? 2 : 1) * 10) / 10,
    reason,
    clientId: doc.clientId,
    docId,
    distanceMethod: method,
    durationMin,
  };
  const id = await db.trips.put(trip);
  if (doc.tripId !== id) await db.docs.update(docId, { tripId: id });
  return { ...trip, id };
}

/** Déplacement domicile → lieu du reçu (ex.: station d'essence). */
export async function syncTripForExpense(expenseId: number, roundTrip = true): Promise<Trip | null> {
  const exp = await db.expenses.get(expenseId);
  if (!exp?.geo) return null;
  const home = await ensureHomeGeo();
  const existing = exp.tripId ? await db.trips.get(exp.tripId) : undefined;
  let oneWayKm = exp.kmFromHome;
  let method: Trip['distanceMethod'] = 'route';
  if (oneWayKm === undefined) {
    const r = await drivingDistance(home.geo, exp.geo);
    oneWayKm = r.km;
    method = r.method;
    await db.expenses.update(expenseId, { kmFromHome: oneWayKm });
  }
  const trip: Trip = {
    ...(existing ?? { createdAt: new Date().toISOString(), source: 'auto-recu' as const }),
    date: exp.date,
    fromLabel: home.label,
    fromGeo: home.geo,
    toLabel: exp.locationLabel || exp.vendor,
    toGeo: exp.geo,
    oneWayKm,
    roundTrip: existing?.roundTrip ?? roundTrip,
    totalKm: Math.round(oneWayKm * ((existing?.roundTrip ?? roundTrip) ? 2 : 1) * 10) / 10,
    reason: expenseReason(exp),
    clientId: exp.clientId,
    expenseId,
    distanceMethod: existing?.distanceMethod ?? method,
  };
  const id = await db.trips.put(trip);
  if (exp.tripId !== id) await db.expenses.update(expenseId, { tripId: id });
  return { ...trip, id };
}

export function expenseReason(exp: Expense): string {
  const base = `${exp.category}${exp.vendor ? ' — ' + exp.vendor : ''}`;
  return exp.notes ? `${base} (${exp.notes})` : base;
}

export async function deleteDocCascade(docId: number) {
  const doc = await db.docs.get(docId);
  if (doc?.tripId) {
    const t = await db.trips.get(doc.tripId);
    if (t?.source === 'auto-facture') await db.trips.delete(doc.tripId);
  }
  await db.docs.delete(docId);
}
