import { db, getSettings, type Client, type Doc, type Expense, type Member, type Punch, type Settings } from './db';
import { costOf, hoursOf } from './punch';
import { docTotals, round2 } from './utils';

export interface JobProfit {
  doc: Doc;
  client?: Client;
  revenue: number; // avant taxes
  materials: number; // reçus liés (avant taxes)
  km: number;
  kmCost: number;
  hours: number;
  labor: number;
  other: number;
  cost: number;
  profit: number;
  margin: number; // %
  perHour?: number; // profit par heure travaillée
}

/** Calcule la rentabilité de chaque facture de la période. */
export async function profitByInvoice(from: string, to: string): Promise<{ rows: JobProfit[]; overhead: number; s: Settings }> {
  const s = await getSettings();
  const [docs, expenses, trips, clients, punches, members] = await Promise.all([db.docs.where('type').equals('invoice').toArray(), db.expenses.toArray(), db.trips.toArray(), db.clients.toArray(), db.punches.toArray(), db.members.toArray()]);
  const laborFor = laborFromPunches(punches, members, s);
  const cmap = new Map(clients.map((c) => [c.id!, c]));
  const invs = docs.filter((d) => d.date >= from && d.date <= to && d.status !== 'draft' && d.status !== 'cancelled');

  // Km: trajet propre à la facture, ou part de la route du jour (aller au job + part égale du retour)
  const kmFor = (d: Doc): number => {
    let k = 0;
    if (d.tripId) k += trips.find((t) => t.id === d.tripId)?.totalKm ?? 0;
    if (d.jobId) {
      const legs = trips.filter((t) => t.source === 'auto-agenda' && t.routeDate === d.jobDate);
      k += legs.filter((t) => t.jobId === d.jobId).reduce((a, t) => a + t.totalKm, 0);
      const ret = legs.filter((t) => !t.jobId).reduce((a, t) => a + t.totalKm, 0);
      const stops = legs.filter((t) => t.jobId).length || 1;
      k += ret / stops;
    }
    return round2(k);
  };

  const rows: JobProfit[] = invs.map((d) => computeRow(d, s, expenses, kmFor, cmap.get(d.clientId), laborFor));
  // Frais généraux: dépenses de la période qui ne sont liées à aucune facture
  const overhead = round2(expenses.filter((e) => e.date >= from && e.date <= to && !e.docId).reduce((a, e) => a + e.subtotal, 0));
  return { rows: rows.sort((a, b) => b.profit - a.profit), overhead, s };
}

/** Rentabilité d'une seule facture (même en brouillon). */
export async function profitOfDoc(docId: number): Promise<JobProfit | null> {
  const d = await db.docs.get(docId);
  if (!d) return null;
  const { rows } = await profitByInvoice('0000-01-01', '9999-12-31').catch(() => ({ rows: [] as JobProfit[] }));
  const found = rows.find((r) => r.doc.id === docId);
  if (found) return found;
  const s = await getSettings();
  const [expenses, trips, punches, members] = await Promise.all([db.expenses.toArray(), db.trips.toArray(), db.punches.toArray(), db.members.toArray()]);
  const kmFor = (x: Doc) => round2((x.tripId ? trips.find((t) => t.id === x.tripId)?.totalKm ?? 0 : 0));
  return computeRow(d, s, expenses, kmFor, await db.clients.get(d.clientId), laborFromPunches(punches, members, s));
}

type LaborFn = (d: Doc) => { hours: number; labor: number } | null;

/** Heures et coût de main-d'œuvre selon les pointages du job (s'il y en a). */
function laborFromPunches(punches: Punch[], members: Member[], s: Settings): LaborFn {
  return (d) => {
    if (!d.jobId) return null;
    const ps = punches.filter((p) => p.jobId === d.jobId);
    if (!ps.length) return null;
    return {
      hours: round2(ps.reduce((a, p) => a + hoursOf(p), 0)),
      labor: round2(ps.reduce((a, p) => a + hoursOf(p) * costOf(p.memberId, members, s.laborCostPerHour), 0)),
    };
  };
}

function computeRow(d: Doc, s: Settings, expenses: Expense[], kmFor: (d: Doc) => number, client?: Client, laborFor?: LaborFn): JobProfit {
  const revenue = docTotals(d, s).subtotal;
  const materials = round2(expenses.filter((e) => e.docId === d.id).reduce((a, e) => a + e.subtotal, 0));
  const km = kmFor(d);
  const kmCost = round2(km * s.kmCost);
  const fromPunches = laborFor?.(d);
  const hours = fromPunches?.hours ?? d.hoursWorked ?? 0;
  const labor = fromPunches?.labor ?? round2(hours * s.laborCostPerHour);
  const other = d.otherCost ?? 0;
  const cost = round2(materials + kmCost + labor + other);
  const profit = round2(revenue - cost);
  return {
    doc: d, client, revenue, materials, km, kmCost, hours, labor, other, cost, profit,
    margin: revenue ? Math.round((profit / revenue) * 1000) / 10 : 0,
    perHour: hours ? round2(profit / hours + (s.laborCostPerHour || 0)) : undefined,
  };
}
