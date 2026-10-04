// Paiement des factures par carte de crédit (Stripe), appelé depuis le lien client (portail).
// Déploiement: voir README (« Paiement par carte »). Clés gardées dans Secret Manager.
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import Stripe from 'stripe';
import { HttpError, planCheckout, type PortalForPayment } from './checkout.js';

initializeApp();
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const region = 'northamerica-northeast1'; // Montréal

/** Crée la page de paiement Stripe pour le solde de la facture. */
export const createCheckout = onRequest({ region, cors: true, secrets: [STRIPE_SECRET_KEY] }, async (req, res) => {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST seulement');
    const { token, returnUrl } = (req.body ?? {}) as { token?: string; returnUrl?: string };
    if (!token || typeof token !== 'string' || token.length > 64) throw new HttpError(400, 'Lien invalide');
    const snap = await getFirestore().doc(`portal/${token}`).get();
    const portal = snap.data() as PortalForPayment | undefined;
    const plan = planCheckout(portal, String(returnUrl ?? ''));
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const back = String(returnUrl).split('?')[0];
    const query = String(returnUrl).includes('?') ? `${String(returnUrl).split('?')[1]}&` : '';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      currency: 'cad',
      locale: 'fr-CA',
      line_items: [{ quantity: 1, price_data: { currency: 'cad', unit_amount: plan.amountCents, product_data: { name: plan.description } } }],
      metadata: { token },
      payment_intent_data: { metadata: { token }, description: plan.description },
      success_url: `${back}?${query}paid=1`,
      cancel_url: `${back}${query ? '?' + query.slice(0, -1) : ''}`,
    });
    res.json({ url: session.url });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    res.status(status).json({ error: e instanceof Error ? e.message : 'Erreur' });
  }
});

/** Stripe confirme le paiement: on l'inscrit sur le portail, l'app l'ajoute à la facture. */
export const stripeWebhook = onRequest({ region, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  const stripe = new Stripe(STRIPE_SECRET_KEY.value());
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, String(req.headers['stripe-signature'] ?? ''), STRIPE_WEBHOOK_SECRET.value());
  } catch {
    res.status(400).send('Signature invalide');
    return;
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object as Stripe.Checkout.Session;
    const token = s.metadata?.token;
    if (token && s.payment_status === 'paid' && s.amount_total) {
      await getFirestore().doc(`portal/${token}`).update({
        cardPayments: FieldValue.arrayUnion({ id: s.id, amount: s.amount_total / 100, at: new Date().toISOString(), method: 'Carte de crédit' }),
      });
    }
  }
  res.json({ received: true });
});
