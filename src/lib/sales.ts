import { OPEN_STAGES } from './crm';
import { db, getSettings, type LeadSource } from './db';
import { docTotals, round2 } from './utils';

export interface RepStats {
  id: number; // 0 = propriétaire
  name: string;
  quotes: number;
  won: number;
  quoted: number; // valeur des soumissions
  sales: number; // factures émises (avant taxes)
  paid: number; // factures payées (avant taxes)
  rate: number; // % commission
  commission: number;
}

/** Ventes de la période: demandes, soumissions, conversion, commissions par vendeur. */
export async function salesReport(from: string, to: string) {
  const s = await getSettings();
  const [leads, docs, members] = await Promise.all([db.leads.toArray(), db.docs.toArray(), db.members.toArray()]);
  const inR = (d: string) => d >= from && d <= to;
  const L = leads.filter((l) => inR(l.createdAt.slice(0, 10)));
  const won = L.filter((l) => l.stage === 'gagne').length;
  const lost = L.filter((l) => l.stage === 'perdu').length;
  const bySource = new Map<LeadSource, { n: number; won: number }>();
  L.forEach((l) => {
    const x = bySource.get(l.source) ?? { n: 0, won: 0 };
    bySource.set(l.source, { n: x.n + 1, won: x.won + (l.stage === 'gagne' ? 1 : 0) });
  });
  const quotes = docs.filter((d) => d.type === 'quote' && inR(d.date) && d.status !== 'draft' && d.status !== 'cancelled');
  const accepted = quotes.filter((d) => d.status === 'accepted' || d.signature || d.convertedInvoiceId);
  const invoices = docs.filter((d) => d.type === 'invoice' && inR(d.date) && d.status !== 'draft' && d.status !== 'cancelled');

  const reps = new Map<number, RepStats>();
  const rep = (id: number): RepStats => {
    if (!reps.has(id)) {
      const m = members.find((x) => x.id === id);
      reps.set(id, { id, name: m?.name ?? (s.ownerName || 'Moi'), quotes: 0, won: 0, quoted: 0, sales: 0, paid: 0, rate: m?.commissionRate ?? 0, commission: 0 });
    }
    return reps.get(id)!;
  };
  quotes.forEach((d) => {
    const r = rep(d.salesRepId ?? 0);
    r.quotes += 1;
    r.quoted += docTotals(d, s).subtotal;
    if (accepted.includes(d)) r.won += 1;
  });
  invoices.forEach((d) => {
    const r = rep(d.salesRepId ?? 0);
    const t = docTotals(d, s);
    r.sales += t.subtotal;
    if (d.status === 'paid') r.paid += t.subtotal;
  });
  reps.forEach((r) => {
    r.quoted = round2(r.quoted);
    r.sales = round2(r.sales);
    r.paid = round2(r.paid);
    r.commission = round2((r.paid * r.rate) / 100);
  });

  return {
    leads: L.length,
    open: leads.filter((l) => OPEN_STAGES.includes(l.stage)).length,
    won,
    lost,
    leadRate: won + lost ? Math.round((won / (won + lost)) * 100) : null,
    bySource: [...bySource.entries()].sort((a, b) => b[1].n - a[1].n),
    quotes: quotes.length,
    accepted: accepted.length,
    quoteRate: quotes.length ? Math.round((accepted.length / quotes.length) * 100) : null,
    quotedValue: round2(quotes.reduce((a, d) => a + docTotals(d, s).subtotal, 0)),
    avgQuote: quotes.length ? round2(quotes.reduce((a, d) => a + docTotals(d, s).subtotal, 0) / quotes.length) : 0,
    reps: [...reps.values()].sort((a, b) => b.sales - a.sales),
  };
}
