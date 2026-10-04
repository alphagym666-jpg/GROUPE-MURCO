// État de l'abonnement (logique pure, testée dans tests/billing.test.ts).

export type BillingKind = 'local' | 'founder' | 'trial' | 'active' | 'past_due' | 'expired';

export interface BillingInfo {
  kind: BillingKind;
  plan?: string;
  daysLeft?: number; // essai ou fin de période annulée
  periodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  canWrite: boolean; // créer et modifier (sinon lecture et exportation seulement)
}

export interface BillingRecord {
  status?: string;
  plan?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

const DAY = 864e5;

/**
 * accountCreatedAt: création du compte du propriétaire; record: document « billing » écrit par Stripe.
 * Sans compte (app sur un seul appareil): pas de restriction.
 */
export function billingState(o: { signedIn: boolean; accountCreatedAt?: string; record?: BillingRecord | null; now?: Date; foundersBefore: string; trialDays: number }): BillingInfo {
  const now = (o.now ?? new Date()).getTime();
  if (!o.signedIn || !o.accountCreatedAt) return { kind: 'local', canWrite: true };
  const created = new Date(o.accountCreatedAt).getTime();
  const r = o.record;
  if (r?.status === 'active' || r?.status === 'trialing') {
    const end = r.currentPeriodEnd ? new Date(r.currentPeriodEnd).getTime() : undefined;
    return { kind: 'active', plan: r.plan, periodEnd: r.currentPeriodEnd, cancelAtPeriodEnd: r.cancelAtPeriodEnd, daysLeft: end ? Math.max(0, Math.ceil((end - now) / DAY)) : undefined, canWrite: true };
  }
  if (r?.status === 'past_due') return { kind: 'past_due', plan: r.plan, canWrite: true };
  if (created < new Date(o.foundersBefore).getTime()) return { kind: 'founder', canWrite: true };
  const trialEnd = created + o.trialDays * DAY;
  if (now < trialEnd) return { kind: 'trial', daysLeft: Math.ceil((trialEnd - now) / DAY), canWrite: true };
  return { kind: 'expired', plan: r?.plan, canWrite: false };
}
