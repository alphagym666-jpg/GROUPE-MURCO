// node --experimental-strip-types src/billing.test.ts
import assert from 'node:assert/strict';
import { billingFromSubscription, planSubscription, withParam } from './billing.ts';

const prices = { solo: 'price_S', equipe: 'price_E', pro: 'price_P' };
assert.deepEqual(planSubscription('equipe', 'https://x.io/#/abonnement', prices), { plan: 'equipe', price: 'price_E', returnUrl: 'https://x.io/#/abonnement' });
assert.throws(() => planSubscription('gold', 'https://x.io', prices), /Forfait inconnu/);
assert.throws(() => planSubscription('solo', 'javascript:alert(1)', prices), /retour invalide/);
assert.throws(() => planSubscription('pro', 'https://x.io', { ...prices, pro: '' }), /pas encore configuré/);
assert.equal(withParam('https://x.io/app/#/abonnement', 'abo', 'ok'), 'https://x.io/app/#/abonnement?abo=ok');
assert.equal(withParam('https://x.io/#/abonnement?a=1', 'abo', 'ok'), 'https://x.io/#/abonnement?a=1&abo=ok');
const b = billingFromSubscription({ id: 'sub_1', status: 'active', customer: 'cus_1', metadata: { uid: 'u1', plan: 'solo' }, items: { data: [{ current_period_end: 1790000000, price: { id: 'price_P' } }] } }, prices);
assert.equal(b.plan, 'pro');
assert.equal(b.customerId, 'cus_1');
assert.equal(b.currentPeriodEnd, new Date(1790000000 * 1000).toISOString());
console.log('abonnements: 8 cas OK');
