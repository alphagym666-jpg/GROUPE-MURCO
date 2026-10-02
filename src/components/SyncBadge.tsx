import { Link } from 'react-router-dom';
import { useSyncState } from '../lib/sync';

/** Pastille d'état de la synchronisation entre appareils. */
export function SyncBadge({ top = false }: { top?: boolean }) {
  const st = useSyncState();
  const [dot, label] =
    st.status === 'ok'
      ? ['ok', 'Synchronisé']
      : st.status === 'syncing' || st.status === 'connecting'
        ? ['busy', 'Synchronisation…']
        : st.status === 'error'
          ? ['err', 'Erreur de synchro']
          : st.status === 'signedout'
            ? ['', 'Synchro: non connecté']
            : ['', 'Synchro désactivée'];
  return (
    <Link to="/parametres" className={`sync-pill ${top ? 'top' : ''}`} title={st.error ?? st.email ?? ''}>
      <span className={`sync-dot ${dot}`} />
      {label}
    </Link>
  );
}
