// Abonnements (logique sans dépendance, testée dans billing.test.ts).

/** Erreur avec code HTTP (sans dépendance, pour les tests). */
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

export type PlanKey = 'solo' | 'equipe' | 'pro';
export const PLAN_KEYS: PlanKey[] = ['solo', 'equipe', 'pro'];

export interface BillingDoc {
  status: string; // statut Stripe: trialing, active, past_due, canceled, unpaid, incomplete…
  plan?: PlanKey;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  subscriptionId?: string;
  customerId?: string;
  updatedAt: string;
}

/** Valide la demande d'abonnement et choisit le prix Stripe. */
export function planSubscription(plan: unknown, returnUrl: unknown, prices: Record<PlanKey, string>): { plan: PlanKey; price: string; returnUrl: string } {
  if (typeof plan !== 'string' || !PLAN_KEYS.includes(plan as PlanKey)) throw fail(400, 'Forfait inconnu');
  if (typeof returnUrl !== 'string' || !/^https?:\/\//.test(returnUrl) || returnUrl.length > 500) throw fail(400, 'Adresse de retour invalide');
  const price = prices[plan as PlanKey];
  if (!price || !price.startsWith('price_')) throw fail(503, 'Ce forfait n’est pas encore configuré');
  return { plan: plan as PlanKey, price, returnUrl };
}

/** Ajoute un paramètre à une adresse de l'app (les adresses utilisent # pour les pages). */
export function withParam(url: string, key: string, value: string): string {
  const [base, hash = ''] = url.split('#');
  const sep = hash.includes('?') ? '&' : '?';
  return hash ? `${base}#${hash}${sep}${key}=${value}` : `${base}${base.includes('?') ? '&' : '?'}${key}=${value}`;
}

/** Abonnement Stripe → document « billing » lu par l'app. */
export function billingFromSubscription(sub: {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  items?: { data: { current_period_end?: number; price?: { id: string } }[] };
  current_period_end?: number;
}, prices: Record<PlanKey, string>): BillingDoc {
  const priceId = sub.items?.data?.[0]?.price?.id;
  const plan = (PLAN_KEYS.find((k) => prices[k] === priceId) ?? sub.metadata?.plan) as PlanKey | undefined;
  const end = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
  return {
    status: sub.status,
    plan: plan && PLAN_KEYS.includes(plan) ? plan : undefined,
    currentPeriodEnd: end ? new Date(end * 1000).toISOString() : undefined,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    subscriptionId: sub.id,
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    updatedAt: new Date().toISOString(),
  };
}
