import { db, getSettings } from './db';
import { docTotals } from './utils';

export interface AuditIssue {
  level: 'erreur' | 'attention';
  text: string;
  to: string;
}

const CASH = /comptant|ch[eè]que|d[ée]p[oô]t au comptoir/i;

/** Ce qui manque avant d'envoyer le dossier au comptable (pour la période). */
export async function auditPeriod(from: string, to: string): Promise<AuditIssue[]> {
  const s = await getSettings();
  const inR = (d: string) => d >= from && d <= to;
  const [expenses, docs, trips, clients] = await Promise.all([db.expenses.toArray(), db.docs.toArray(), db.trips.toArray(), db.clients.toArray()]);
  const cname = new Map(clients.map((c) => [c.id, c.name]));
  const out: AuditIssue[] = [];

  for (const e of expenses.filter((x) => inR(x.date))) {
    const label = `${e.date} — ${e.vendor || e.category}`;
    if (!e.photo) out.push({ level: 'erreur', text: `Reçu sans photo: ${label}`, to: `/depenses/${e.id}` });
    if (!e.total) out.push({ level: 'erreur', text: `Reçu sans montant: ${label}`, to: `/depenses/${e.id}` });
    if (e.ocrAuto && e.total > 500) out.push({ level: 'attention', text: `Gros montant lu automatiquement (${e.total.toFixed(2)} $), à vérifier: ${label}`, to: `/depenses/${e.id}` });
  }
  for (const d of docs.filter((x) => x.type === 'invoice' && inR(x.date) && x.status !== 'cancelled')) {
    const label = `${d.number} — ${cname.get(d.clientId) ?? ''}`;
    if (d.status === 'draft') out.push({ level: 'attention', text: `Facture encore en brouillon: ${label}`, to: `/doc/${d.id}` });
    d.payments.forEach((p) => {
      if (CASH.test(p.method) && !p.mediaId) out.push({ level: 'erreur', text: `Paiement ${p.method.toLowerCase()} de ${p.amount.toFixed(2)} $ sans photo de preuve: ${label}`, to: `/doc/${d.id}` });
    });
    if ((d.deposit ?? 0) > 0 && !d.depositMediaId) out.push({ level: 'attention', text: `Dépôt de ${d.deposit!.toFixed(2)} $ sans photo: ${label}`, to: `/doc/${d.id}` });
    const t = docTotals(d, s);
    if ((d.status === 'sent' || d.status === 'partial') && d.dueDate < to && t.balance > 0) out.push({ level: 'attention', text: `Facture impayée (${t.balance.toFixed(2)} $): ${label}`, to: `/doc/${d.id}` });
  }
  for (const t of trips.filter((x) => inR(x.date))) {
    if (!t.reason?.trim()) out.push({ level: 'erreur', text: `Déplacement sans raison le ${t.date} (${t.totalKm} km)`, to: '/km' });
  }
  if (s.chargeTaxes && (!s.tpsNumber || !s.tvqNumber)) out.push({ level: 'erreur', text: 'Numéros de TPS/TVQ manquants dans Paramètres', to: '/parametres' });
  return out;
}
