import assert from 'node:assert/strict';
import { planCheckout } from './checkout.ts';

const base = { token: 't', owner: 'u', company: { name: 'Groupe Murco', cardPayments: true }, doc: { kind: 'invoice' as const, number: 'F-1001', totals: { balance: 462, total: 562 } } };
assert.deepEqual(planCheckout(base, 'https://x.io/#/p/t'), { amountCents: 46200, description: 'Facture F-1001 — Groupe Murco' });
assert.equal(planCheckout({ ...base, cardPayments: [{ id: 'a', amount: 200 }] }, 'https://x').amountCents, 26200);
assert.throws(() => planCheckout({ ...base, cardPayments: [{ id: 'a', amount: 462 }] }, 'https://x'), /déjà payée/);
assert.throws(() => planCheckout({ ...base, doc: { ...base.doc, kind: 'quote' } }, 'https://x'), /factures/);
assert.throws(() => planCheckout({ ...base, company: { name: 'X' } }, 'https://x'), /pas activé/);
assert.throws(() => planCheckout(base, 'javascript:alert(1)'), /retour/);
console.log('paiement: 6 cas OK');
