import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, CircleCheck, Circle, Rocket, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db, saveSettings, type Settings } from '../lib/db';
import { useSyncState } from '../lib/sync';

interface Step {
  key: string;
  title: string;
  desc: string;
  to: string;
  done: boolean;
  optional?: boolean;
  err?: string;
}

/** Liste « Démarrage »: ce qu'il reste à configurer pour que tout fonctionne (km, synchro, formulaire…). */
export function Onboarding({ s }: { s: Settings }) {
  const st = useSyncState();
  const [showDone, setShowDone] = useState(false);
  const counts = useLiveQuery(async () => ({
    sent: await db.docs.filter((d) => d.status !== 'draft').count(),
    members: await db.members.count(),
  }), []);
  if (!counts || s.setupHidden) return null;
  const manual = s.setupDone ?? [];
  const steps: Step[] = [
    { key: 'compagnie', title: 'Infos de ta compagnie', desc: 'Nom, adresse, code postal et téléphone sur tes factures', to: '/parametres?s=compagnie', done: !!(s.companyName && s.address && s.postalCode && s.phone) },
    { key: 'logo', title: 'Ton logo', desc: 'Il apparaît sur les factures, soumissions et le portail client', to: '/parametres?s=compagnie', done: !!s.logo },
    { key: 'domicile', title: 'Ton domicile', desc: 'Point de départ des km du journal de bord', to: '/parametres?s=domicile', done: !!(s.homeAddress && s.homeGeo) },
    {
      key: 'sync', title: 'Synchro ordi ↔ cellulaire', desc: 'Connecte-toi avec le même compte sur chaque appareil', to: '/parametres?s=sync', done: st.status === 'ok',
      err: st.status === 'error' ? 'Erreur de synchro: vérifie les règles Firebase (Paramètres → Synchronisation)' : undefined,
    },
    { key: 'codes', title: 'Tes codes et prix', desc: 'Vérifie tes prix (NDG, LVE, LAP…) avant ta première facture', to: '/codes', done: manual.includes('codes') },
    { key: 'premiere', title: 'Ta première facture envoyée', desc: 'Essaie la facture express: client, codes, envoyer', to: '/express', done: counts.sent > 0 },
    { key: 'maps', title: 'Clé Google Maps', desc: 'Km identiques à Google Maps et adresses qui se complètent', to: '/parametres?s=maps', done: !!s.googleMapsKey, optional: true },
    { key: 'formulaire', title: 'Formulaire de demandes en ligne', desc: 'Lien et code QR pour tes pubs, ta fiche Google, ton camion', to: '/demandes', done: s.leadForm, optional: true },
    { key: 'equipe', title: 'Ton équipe', desc: 'Invite tes employés: agenda, pointage et photos sur leur cell', to: '/equipe', done: counts.members > 0, optional: true },
  ];
  const req = steps.filter((x) => !x.optional);
  const doneReq = req.filter((x) => x.done).length;
  const allDone = steps.every((x) => x.done);
  if (allDone) return null;
  const pct = Math.round((steps.filter((x) => x.done).length / steps.length) * 100);
  const next = steps.find((x) => !x.done);

  return (
    <div className="card onboard">
      <div className="card-head">
        <div>
          <h2 style={{ marginBottom: 2 }}><Rocket size={18} style={{ verticalAlign: '-3px' }} /> Démarrage</h2>
          <div className="small muted">{doneReq} / {req.length} étapes essentielles{doneReq === req.length ? ' — c’est prêt! Le reste est facultatif.' : ''}</div>
        </div>
        <button className="btn small icon-btn" aria-label="Masquer la liste Démarrage" title="Masquer" onClick={() => void saveSettings({ setupHidden: true })}><X size={16} /></button>
      </div>
      <div className="onboard-bar"><span style={{ width: `${pct}%` }} /></div>
      <div className="onboard-list">
        {steps.filter((x) => showDone || !x.done).map((x) => (
          <Link key={x.key} to={x.to} className={`onboard-step ${x.done ? 'done' : ''} ${x === next ? 'next' : ''}`}>
            {x.done ? <CircleCheck size={22} className="ok" /> : <Circle size={22} />}
            <span className="grow">
              <strong>{x.title}</strong>{x.optional && <em> · facultatif</em>}
              <small className={x.err ? 'err' : ''}>{x.err ?? x.desc}</small>
            </span>
            {!x.done && <ChevronRight size={18} className="muted" />}
          </Link>
        ))}
        {steps.some((x) => x.done) && (
          <button type="button" className="onboard-toggle" onClick={() => setShowDone((v) => !v)}>
            <CircleCheck size={16} /> {showDone ? 'Cacher les étapes faites' : `${steps.filter((x) => x.done).length} étape${steps.filter((x) => x.done).length > 1 ? 's' : ''} déjà faite${steps.filter((x) => x.done).length > 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </div>
  );
}

/** Coche une étape faite « à la main » (ex.: l'utilisateur a ouvert ses codes et prix). */
export async function markSetupDone(key: string, s: Settings) {
  if (s.setupDone?.includes(key)) return;
  await saveSettings({ setupDone: [...(s.setupDone ?? []), key] });
}
