import { Check, CreditCard, Crown, ExternalLink, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PRODUCT } from '../brand';
import { errMsg, useToast } from '../components/Toast';
import { openBillingPortal, startSubscription, useBilling } from '../lib/billing';
import { useSettings } from '../lib/hooks';
import { PLANS, planOf } from '../lib/plans';
import { useSyncState } from '../lib/sync';
import { formatDate } from '../lib/utils';

/** Forfaits, essai gratuit et gestion de l'abonnement (Stripe). */
export default function Subscription() {
  const b = useBilling();
  const s = useSettings();
  const st = useSyncState();
  const notify = useToast();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState('');
  const owner = st.role === 'owner' || st.role === 'admin';

  useEffect(() => {
    if (params.get('abo') === 'ok') notify('Merci! Ton abonnement est activé (la confirmation peut prendre quelques secondes).');
  }, [params, notify]);

  const go = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      location.href = await fn();
    } catch (e) {
      notify(errMsg(e), 'err');
      setBusy('');
    }
  };

  const current = planOf(b.plan);
  const head =
    b.kind === 'founder' ? { t: 'Membre fondateur', d: `Merci d’avoir été parmi les premiers: ${PRODUCT.name} est gratuit pour ton entreprise, à vie.`, tone: 'ok' } :
    b.kind === 'active' ? { t: `Forfait ${current?.name ?? ''} actif`, d: b.cancelAtPeriodEnd ? `Annulé: l’accès se termine le ${formatDate((b.periodEnd ?? '').slice(0, 10))}.` : b.periodEnd ? `Prochain renouvellement le ${formatDate(b.periodEnd.slice(0, 10))}.` : '', tone: 'ok' } :
    b.kind === 'trial' ? { t: `Essai gratuit: ${b.daysLeft} jour${(b.daysLeft ?? 0) > 1 ? 's' : ''} restant${(b.daysLeft ?? 0) > 1 ? 's' : ''}`, d: 'Toutes les fonctions sont ouvertes pendant l’essai, sans carte de crédit. Quand tu choisis un forfait, il commence tout de suite et se renouvelle chaque mois.', tone: 'info' } :
    b.kind === 'past_due' ? { t: 'Paiement en retard', d: 'Le dernier paiement a échoué. Mets ta carte à jour pour éviter l’interruption.', tone: 'err' } :
    b.kind === 'expired' ? { t: 'Ton essai est terminé', d: 'Tes données sont en sécurité: tu peux les consulter et les exporter. Choisis un forfait pour recommencer à créer des factures et des jobs.', tone: 'err' } :
    { t: 'Version sur cet appareil', d: 'Crée ton compte (Paramètres → Synchronisation) pour utiliser l’app sur plusieurs appareils et avec ton équipe.', tone: 'info' };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Crown size={14} /> {PRODUCT.name}</div>
          <h1>Abonnement</h1>
        </div>
        {b.kind === 'active' || b.kind === 'past_due' ? (
          <button className="btn" disabled={!!busy || !owner} onClick={() => void go('portal', () => openBillingPortal(s.paymentsEndpoint))}><ExternalLink size={16} /> Gérer mon abonnement</button>
        ) : null}
      </div>

      <div className={`notice ${head.tone}`} style={{ display: 'grid', gap: 4 }}>
        <strong style={{ fontSize: '1.05rem' }}>{head.t}</strong>
        {head.d && <span>{head.d}</span>}
      </div>

      {b.kind !== 'founder' && (
        <div className="sub-plans">
          {PLANS.map((p) => {
            const isCur = b.kind === 'active' && b.plan === p.key;
            return (
              <div key={p.key} className={`card sub-plan ${p.highlight ? 'hot' : ''} ${isCur ? 'cur' : ''}`}>
                {p.highlight && <div className="lp-badge">Le plus populaire</div>}
                <h2 style={{ margin: 0 }}>{p.name}</h2>
                <div className="sub-price"><b>{p.price} $</b><span>/mois</span></div>
                <div className="small muted">{p.pitch} · taxes en sus</div>
                <ul>{p.features.map((f) => <li key={f}><Check size={15} /> {f}</li>)}</ul>
                {isCur ? (
                  <button className="btn block" disabled><Check size={16} /> Ton forfait</button>
                ) : (
                  <button className={`btn block ${p.highlight || s.wantedPlan === p.key ? 'accent' : ''}`} disabled={!!busy || !owner || st.status !== 'ok'}
                    onClick={() => void go(p.key, () => (b.kind === 'active' ? openBillingPortal(s.paymentsEndpoint) : startSubscription(p.key, s.paymentsEndpoint)))}>
                    <CreditCard size={16} /> {busy === p.key ? 'Ouverture…' : b.kind === 'active' ? 'Changer pour ce forfait' : 'Choisir ce forfait'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!owner && <p className="small muted">Seul le propriétaire de l’entreprise peut gérer l’abonnement.</p>}
      <p className="small muted" style={{ marginTop: 12 }}><Sparkles size={12} /> Paiement sécurisé par Stripe. Annulable en tout temps; l’accès continue jusqu’à la fin du mois payé. Tes données restent disponibles pour l’exportation.</p>
    </>
  );
}
