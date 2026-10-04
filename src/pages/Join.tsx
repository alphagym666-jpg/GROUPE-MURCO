import { CircleCheck, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { errMsg, useToast } from '../components/Toast';
import { configFromLink, getFirebaseConfig, parseFirebaseConfig, saveFirebaseConfig, signInEmail, useSyncState } from '../lib/sync';
import { acceptInvite, ROLE_LABEL } from '../lib/team';

/** L'employé ouvre le lien d'invitation: crée son compte et rejoint l'entreprise. */
export default function Join() {
  const [params] = useSearchParams();
  const owner = params.get('o') ?? '';
  const code = params.get('i') ?? '';
  const c = params.get('c');
  const st = useSyncState();
  const nav = useNavigate();
  const notify = useToast();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  // Configuration Firebase reçue dans le lien
  useEffect(() => {
    if (!c || getFirebaseConfig()) return;
    let cfg = null;
    try {
      const j = JSON.parse(atob(decodeURIComponent(c)));
      cfg = parseFirebaseConfig(JSON.stringify({ authDomain: `${j.projectId}.firebaseapp.com`, ...j }));
    } catch {
      cfg = configFromLink(c);
    }
    if (cfg) {
      saveFirebaseConfig(cfg);
      location.reload();
    }
  }, [c]);

  // Une fois connecté: accepter l'invitation
  useEffect(() => {
    if (!owner || !code || done || busy) return;
    if (st.email && st.workspace && st.workspace !== owner && st.status !== 'signedout') {
      setBusy(true);
      acceptInvite(owner, code)
        .then((r) => setDone(`${r.name} — ${ROLE_LABEL[r.role]}`))
        .catch((e) => notify(errMsg(e), 'err'))
        .finally(() => setBusy(false));
    } else if (st.workspace === owner && st.role !== 'owner') setDone(ROLE_LABEL[st.role]);
  }, [st.email, st.workspace, st.status, st.role, owner, code, done, busy, notify]);

  const login = async (create: boolean) => {
    setBusy(true);
    try {
      await signInEmail(email, pw, create);
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  if (!owner || !code) return <div className="portal"><div className="notice err">Lien d’invitation incomplet.</div></div>;

  return (
    <div className="portal" style={{ maxWidth: 520 }}>
      <div className="card" style={{ textAlign: 'center' }}>
        {done ? (
          <>
            <CircleCheck size={52} color="var(--green)" />
            <h1 style={{ marginTop: 10 }}>Bienvenue dans l’équipe!</h1>
            <p>{done}</p>
            <button className="btn accent big block" onClick={() => nav('/pointage')}>Ouvrir mon pointage</button>
            <p className="small muted">Ajoute l’app à ton écran d’accueil (Partager → « Sur l’écran d’accueil » sur iPhone, ⋮ → « Installer » sur Android).</p>
          </>
        ) : (
          <>
            <Users size={40} />
            <h1 style={{ marginTop: 8 }}>Invitation</h1>
            <p>Crée ton accès pour voir tes jobs, pointer tes heures et prendre les photos.</p>
            {st.status === 'off' ? (
              <div className="notice">Préparation…</div>
            ) : st.email ? (
              <div className="notice info">{busy ? 'Connexion à l’équipe…' : `Connecté: ${st.email}`}</div>
            ) : (
              <div className="grid" style={{ gap: 10, textAlign: 'left' }}>
                <label className="field">Ton courriel<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                <label className="field">Choisis un mot de passe<input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
                <button className="btn accent big" disabled={busy} onClick={() => login(true)}>Créer mon accès</button>
                <button className="btn" disabled={busy} onClick={() => login(false)}>J’ai déjà un accès — me connecter</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
