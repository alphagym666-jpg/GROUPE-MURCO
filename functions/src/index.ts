// Paiement des factures par carte de crédit (Stripe), appelé depuis le lien client (portail).
// Déploiement: voir README (« Paiement par carte »). Clés gardées dans Secret Manager.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import Stripe from 'stripe';
import { billingFromSubscription, planSubscription, withParam, type PlanKey } from './billing.js';
import { HttpError, planCheckout, type PortalForPayment } from './checkout.js';

initializeApp();
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const region = 'northamerica-northeast1'; // Montréal
// Prix Stripe des forfaits (fichier functions/.env: STRIPE_PRICE_SOLO=price_…)
const PRICE_SOLO = defineString('STRIPE_PRICE_SOLO', { default: '' });
const PRICE_EQUIPE = defineString('STRIPE_PRICE_EQUIPE', { default: '' });
const PRICE_PRO = defineString('STRIPE_PRICE_PRO', { default: '' });
const prices = (): Record<PlanKey, string> => ({ solo: PRICE_SOLO.value(), equipe: PRICE_EQUIPE.value(), pro: PRICE_PRO.value() });

/** Utilisateur connecté (jeton Firebase envoyé par l'app). */
async function caller(req: { headers: Record<string, string | string[] | undefined> }) {
  const h = String(req.headers.authorization ?? '');
  if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Connexion requise');
  try {
    return await getAuth().verifyIdToken(h.slice(7));
  } catch {
    throw new HttpError(401, 'Session expirée: reconnecte-toi');
  }
}
const statusOf = (e: unknown) => (e as { status?: number }).status ?? 500;
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Erreur');

/** Abonnement: ouvre la page de paiement Stripe pour le forfait choisi. */
export const createSubscription = onRequest({ region, cors: true, secrets: [STRIPE_SECRET_KEY] }, async (req, res) => {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST seulement');
    const user = await caller(req);
    const { plan, price, returnUrl } = planSubscription(req.body?.plan, req.body?.returnUrl, prices());
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const ref = getFirestore().doc(`billing/${user.uid}`);
    let customerId = (await ref.get()).data()?.customerId as string | undefined;
    if (!customerId) {
      const c = await stripe.customers.create({ email: user.email, metadata: { uid: user.uid } });
      customerId = c.id;
      await ref.set({ customerId, status: 'none', updatedAt: new Date().toISOString() }, { merge: true });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      locale: req.body?.lang === 'en' ? 'en' : 'fr-CA',
      client_reference_id: user.uid,
      subscription_data: { metadata: { uid: user.uid, plan } },
      success_url: withParam(returnUrl, 'abo', 'ok'),
      cancel_url: returnUrl,
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(statusOf(e)).json({ error: errText(e) });
  }
});

/** Gérer l'abonnement (changer de forfait, carte, factures, annuler) dans le portail Stripe. */
export const billingPortal = onRequest({ region, cors: true, secrets: [STRIPE_SECRET_KEY] }, async (req, res) => {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'POST seulement');
    const user = await caller(req);
    const returnUrl = String(req.body?.returnUrl ?? '');
    if (!/^https?:\/\//.test(returnUrl)) throw new HttpError(400, 'Adresse de retour invalide');
    const customerId = (await getFirestore().doc(`billing/${user.uid}`).get()).data()?.customerId as string | undefined;
    if (!customerId) throw new HttpError(404, 'Aucun abonnement pour ce compte');
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const s = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    res.json({ url: s.url });
  } catch (e) {
    res.status(statusOf(e)).json({ error: errText(e) });
  }
});

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
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const uid = sub.metadata?.uid;
    if (uid) await getFirestore().doc(`billing/${uid}`).set(billingFromSubscription(sub as never, prices()), { merge: true });
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
