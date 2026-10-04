import { deleteDoc, doc } from 'firebase/firestore';
import { db } from './db';
import { syncContext } from './sync';

// Loi 25: droits des clients de l'entreprise (accès, portabilité, suppression).

/** Toutes les données liées à un client, dans un fichier JSON lisible (demande d'accès). */
export async function exportClientData(clientId: number): Promise<Blob> {
  const client = await db.clients.get(clientId);
  if (!client) throw new Error('Client introuvable');
  const [docs, jobs, trips, expenses, emails, media, leads, projects] = await Promise.all([
    db.docs.where('clientId').equals(clientId).toArray(),
    db.jobs.where('clientId').equals(clientId).toArray(),
    db.trips.where('clientId').equals(clientId).toArray(),
    db.expenses.where('clientId').equals(clientId).toArray(),
    db.emails.where('clientId').equals(clientId).toArray(),
    db.media.where('clientId').equals(clientId).toArray(),
    db.leads.filter((l) => l.clientId === clientId).toArray(),
    db.projects.where('clientId').equals(clientId).toArray(),
  ]);
  const strip = <T extends object>(x: T) => Object.fromEntries(Object.entries(x).filter(([k, v]) => !k.startsWith('_') && !(v instanceof Blob)));
  const data = {
    exportéLe: new Date().toISOString(),
    client: strip(client),
    soumissionsEtFactures: docs.map((d) => strip({ ...d, signature: d.signature ? { name: d.signature.name, at: d.signature.at } : undefined })),
    jobs: jobs.map(strip),
    deplacements: trips.map(strip),
    depensesLiees: expenses.map(strip),
    courriels: emails.map(strip),
    photos: media.map((m) => ({ id: m.id, type: m.kind, date: m.createdAt })),
    demandes: leads.map(strip),
    projets: projects.map(strip),
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

/**
 * Suppression demandée par un client: ses renseignements personnels sont effacés,
 * mais les montants des factures restent (registres comptables à garder 6 ans).
 */
export async function anonymizeClient(clientId: number): Promise<void> {
  const client = await db.clients.get(clientId);
  if (!client) throw new Error('Client introuvable');
  const ctx = syncContext();
  const docs = await db.docs.where('clientId').equals(clientId).toArray();
  for (const d of docs) {
    if (d.portalToken && ctx) await deleteDoc(doc(ctx.fs, 'portal', d.portalToken)).catch(() => undefined);
    await db.docs.update(d.id!, {
      jobAddress: '',
      jobGeo: undefined,
      portalToken: undefined,
      signature: d.signature ? { name: 'Client anonymisé', at: d.signature.at } : undefined,
      review: d.review ? { ...d.review, comment: undefined } : undefined,
    });
  }
  for (const j of await db.jobs.where('clientId').equals(clientId).toArray()) await db.jobs.update(j.id!, { address: '', geo: undefined, notes: '' });
  for (const t of await db.trips.where('clientId').equals(clientId).toArray()) await db.trips.update(t.id!, { toLabel: 'Client anonymisé' });
  for (const e of await db.emails.where('clientId').equals(clientId).toArray()) await db.emails.update(e.id!, { to: '' });
  await db.media.bulkDelete(await db.media.where('clientId').equals(clientId).primaryKeys());
  const leads = await db.leads.filter((l) => l.clientId === clientId || (!!client.phone && l.phone === client.phone)).toArray();
  await db.leads.bulkDelete(leads.map((l) => l.id!));
  await db.clients.update(clientId, { name: `Client anonymisé #${String(clientId).slice(-4)}`, contact: '', email: '', phone: '', address: '', geo: undefined, notes: '' });
}
