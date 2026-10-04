import { db, getSettings } from './db';
import { docTotals, round2 } from './utils';

export interface TaxPeriod {
  label: string;
  from: string;
  to: string;
  sales: number; // ventes avant taxes (factures émises)
  tpsCollected: number;
  tvqCollected: number;
  tpsPaid: number; // CTI (TPS payée sur les dépenses)
  tvqPaid: number; // RTI (TVQ payée sur les dépenses)
  tpsNet: number;
  tvqNet: number;
  invoices: number;
  receipts: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

export function periodsOfYear(year: number, freq: 'mensuel' | 'trimestriel' | 'annuel'): { label: string; from: string; to: string }[] {
  if (freq === 'annuel') return [{ label: `Année ${year}`, from: `${year}-01-01`, to: `${year}-12-31` }];
  if (freq === 'trimestriel')
    return [1, 2, 3, 4].map((q) => ({ label: `T${q} ${year}`, from: `${year}-${pad(q * 3 - 2)}-01`, to: `${year}-${pad(q * 3)}-${lastDay(year, q * 3)}` }));
  const names = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  return names.map((n, i) => ({ label: `${n} ${year}`, from: `${year}-${pad(i + 1)}-01`, to: `${year}-${pad(i + 1)}-${lastDay(year, i + 1)}` }));
}

/** TPS/TVQ d'une période: perçues sur les factures (date de facture), payées sur les reçus. */
export async function taxReport(periods: { label: string; from: string; to: string }[]): Promise<TaxPeriod[]> {
  const s = await getSettings();
  const [docs, expenses] = await Promise.all([db.docs.where('type').equals('invoice').toArray(), db.expenses.toArray()]);
  const invs = docs.filter((d) => d.status !== 'draft' && d.status !== 'cancelled');
  return periods.map((p) => {
    const inR = (d: string) => d >= p.from && d <= p.to;
    const iv = invs.filter((d) => inR(d.date));
    const ex = expenses.filter((e) => inR(e.date));
    const t = iv.map((d) => docTotals(d, s));
    const sales = round2(t.reduce((a, x) => a + x.subtotal, 0));
    const tpsCollected = round2(t.reduce((a, x) => a + x.tps, 0));
    const tvqCollected = round2(t.reduce((a, x) => a + x.tvq, 0));
    const tpsPaid = s.chargeTaxes ? round2(ex.reduce((a, e) => a + e.tps, 0)) : 0;
    const tvqPaid = s.chargeTaxes ? round2(ex.reduce((a, e) => a + e.tvq, 0)) : 0;
    return { ...p, sales, tpsCollected, tvqCollected, tpsPaid, tvqPaid, tpsNet: round2(tpsCollected - tpsPaid), tvqNet: round2(tvqCollected - tvqPaid), invoices: iv.length, receipts: ex.length };
  });
}

export interface SmallSupplier {
  quarters: { label: string; sales: number }[]; // 4 derniers trimestres civils (incluant l'actuel)
  rolling: number;
  current: number;
  limit: number;
}

/** Suivi du seuil de petit fournisseur (30 000 $ de ventes taxables). */
export async function smallSupplierStatus(today = new Date()): Promise<SmallSupplier> {
  const s = await getSettings();
  const docs = (await db.docs.where('type').equals('invoice').toArray()).filter((d) => d.status !== 'draft' && d.status !== 'cancelled');
  const qs: { label: string; from: string; to: string }[] = [];
  let y = today.getFullYear();
  let q = Math.floor(today.getMonth() / 3) + 1;
  for (let i = 0; i < 4; i++) {
    qs.unshift({ label: `T${q} ${y}`, from: `${y}-${pad(q * 3 - 2)}-01`, to: `${y}-${pad(q * 3)}-${lastDay(y, q * 3)}` });
    q -= 1;
    if (q === 0) {
      q = 4;
      y -= 1;
    }
  }
  const quarters = qs.map((p) => ({ label: p.label, sales: round2(docs.filter((d) => d.date >= p.from && d.date <= p.to).reduce((a, d) => a + docTotals(d, s).subtotal, 0)) }));
  return { quarters, rolling: round2(quarters.reduce((a, x) => a + x.sales, 0)), current: quarters[3].sales, limit: 30000 };
}
