// Logique de paiement (sans dépendance): validations et montant à charger.

export interface PortalForPayment {
  token: string;
  owner: string;
  company: { name: string; cardPayments?: boolean };
  doc: { kind: 'invoice' | 'quote'; number: string; totals: { balance: number; total: number } };
  cardPayments?: { id: string; amount: number }[];
}

export interface CheckoutPlan {
  amountCents: number;
  description: string;
}

/** Montant restant à payer par carte (solde moins les paiements par carte déjà reçus). */
export function planCheckout(p: PortalForPayment | undefined, returnUrl: string): CheckoutPlan {
  if (!p) throw new HttpError(404, 'Lien introuvable');
  if (p.doc.kind !== 'invoice') throw new HttpError(400, 'Seules les factures se paient en ligne');
  if (!p.company.cardPayments) throw new HttpError(403, 'Le paiement par carte n’est pas activé');
  if (!/^https?:\/\//.test(returnUrl)) throw new HttpError(400, 'Adresse de retour invalide');
  const already = (p.cardPayments ?? []).reduce((a, x) => a + x.amount, 0);
  const due = Math.round((p.doc.totals.balance - already) * 100);
  if (due < 50) throw new HttpError(400, 'Cette facture est déjà payée');
  if (due > 5_000_000) throw new HttpError(400, 'Montant trop élevé pour un paiement en ligne');
  return { amountCents: due, description: `Facture ${p.doc.number} — ${p.company.name}` };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
