import { CircleCheck, Phone, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AddressInput } from '../components/AddressInput';
import { errMsg, useToast } from '../components/Toast';
import { loadPublicProfile, submitLead, type PublicProfile } from '../lib/crm';
import { portalFs } from '../lib/portal';

/** Page publique « Demander une soumission » (à mettre dans une pub Facebook, Google, un site, un QR code). */
export default function LeadForm() {
  const { owner = '' } = useParams();
  const [params] = useSearchParams();
  const cfg = params.get('c');
  const source = params.get('s') || 'formulaire';
  const notify = useToast();
  const [p, setP] = useState<PublicProfile | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', service: '', message: '' });
  const [hp, setHp] = useState(''); // piège à robots
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const opened = useRef(Date.now());

  useEffect(() => {
    try {
      loadPublicProfile(portalFs(cfg), owner).then(setP).catch((e) => setErr(errMsg(e)));
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [owner, cfg]);

  if (err) return <div className="portal"><div className="notice err">{err}</div></div>;
  if (p === undefined) return <div className="portal"><div className="empty">Chargement…</div></div>;
  if (!p || !p.leadForm) return <div className="portal"><div className="notice err">Ce formulaire n’est pas disponible pour le moment.</div></div>;

  const up = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hp || Date.now() - opened.current < 2500) return setSent(true); // robot
    if (f.name.trim().length < 2) return notify('Écris ton nom.', 'err');
    if (!f.phone.trim() && !f.email.trim()) return notify('Laisse un téléphone ou un courriel pour qu’on te rappelle.', 'err');
    setBusy(true);
    try {
      await submitLead(portalFs(cfg), owner, { ...f, name: f.name.trim(), source });
      setSent(true);
    } catch (e2) {
      notify(errMsg(e2), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portal" style={{ maxWidth: 620 }}>
      <div className="portal-head">
        <div>
          {p.logo && <img src={p.logo} alt="" style={{ maxHeight: 56, maxWidth: 200, display: 'block', marginBottom: 8 }} />}
          <div className="co">{p.name}</div>
          {p.phone && <a className="small" href={`tel:${p.phone}`}><Phone size={13} /> {p.phone}</a>}
        </div>
        <div className="doc"><div className="k" style={{ fontSize: '1.2rem' }}>DEMANDE DE SOUMISSION</div></div>
      </div>
      {sent ? (
        <div className="card" style={{ textAlign: 'center', padding: 30 }}>
          <CircleCheck size={52} color="var(--green)" />
          <h1 style={{ marginTop: 10 }}>Merci!</h1>
          <p>Ta demande est bien reçue. {p.name} te revient très bientôt.</p>
        </div>
      ) : (
        <form className="card" onSubmit={send}>
          <p style={{ marginTop: 0 }}>{p.intro}</p>
          <div className="form-grid">
            <label className="field full">Nom *<input id="lf-name" autoComplete="name" value={f.name} onChange={(e) => up('name', e.target.value)} /></label>
            <label className="field">Téléphone<input id="lf-phone" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => up('phone', e.target.value)} /></label>
            <label className="field">Courriel<input id="lf-email" type="email" autoComplete="email" value={f.email} onChange={(e) => up('email', e.target.value)} /></label>
            <label className="field full">Adresse des travaux<AddressInput value={f.address} onChange={(v) => up('address', v)} /></label>
            <label className="field full">Service
              <select id="lf-service" value={f.service} onChange={(e) => up('service', e.target.value)}>
                <option value="">— Choisir —</option>
                {p.services.map((x) => <option key={x}>{x}</option>)}
                <option>Autre</option>
              </select>
            </label>
            <label className="field full">Ton projet<textarea id="lf-message" rows={4} value={f.message} placeholder="Grandeur, nombre d’étages, quand tu aimerais que ce soit fait…" onChange={(e) => up('message', e.target.value)} /></label>
            <input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1 }} name="website" />
          </div>
          <button className="btn accent big block" style={{ marginTop: 14 }} disabled={busy}><Send size={18} /> {busy ? 'Envoi…' : 'Envoyer ma demande'}</button>
          <p className="small muted" style={{ textAlign: 'center' }}>Tes informations servent seulement à te préparer une soumission.</p>
        </form>
      )}
    </div>
  );
}
