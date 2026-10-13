import { RefreshCw } from 'lucide-react';
import { useState } from 'react';

/** Mise à jour depuis l'app: vide les caches puis recharge la dernière version du site. */
export function UpdateCard() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const update = async () => {
    setBusy(true);
    setMsg('Recherche de la dernière version…');
    const root = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
    try {
      const r = await fetch(`${root}version.json?t=${Date.now()}`, { cache: 'no-store' });
      const v = r.ok ? ((await r.json()) as { sha: string }) : null;
      if (v && v.sha === __APP_VERSION__.sha) {
        setMsg('Tu as déjà la dernière version.');
        setBusy(false);
        return;
      }
    } catch {
      /* hors ligne: on essaie quand même */
    }
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((g) => g.unregister()));
      }
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* ok */
    }
    setMsg('Mise à jour…');
    location.replace(`${root}?v=${Date.now()}${location.hash}`);
  };

  return (
    <div className="card">
      <h2>Mise à jour de l’app</h2>
      <p className="small muted">Version installée: {__APP_VERSION__.sha}. L’app charge la dernière version du site; ce bouton force le rechargement tout de suite.</p>
      <button className="btn primary" disabled={busy} onClick={() => void update()}>
        <RefreshCw size={16} /> Mettre à jour maintenant
      </button>
      {msg && <div className="small" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
