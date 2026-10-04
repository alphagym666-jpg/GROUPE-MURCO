import { useLiveQuery } from 'dexie-react-hooks';
import { CircleCheck, Copy, MessageSquare, Plus, Share2, UserMinus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { errMsg, useConfirm, useToast } from '../components/Toast';
import { smsLink } from '../lib/agenda';
import { db, type Member, type MemberRole } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { shareLink } from '../lib/native';
import { useSyncState } from '../lib/sync';
import { blankMember, inviteLink, MEMBER_COLORS, revokeMember, ROLE_LABEL } from '../lib/team';
import { money } from '../lib/utils';

const ROLE_HELP: Record<MemberRole, string> = {
  employe: 'Voit ses jobs à l’agenda, prend des photos et pointe ses heures. Ne voit pas les prix ni l’argent.',
  vendeur: 'En plus: les demandes (CRM), les clients et les soumissions. Commission sur ses ventes payées.',
  admin: 'Accès complet (comme toi), sauf les invitations.',
};

/** Équipe: employés et vendeurs, invitations, coûts horaires et commissions. */
export default function Team() {
  const st = useSyncState();
  const [edit, setEdit] = useState<Member | null>(null);
  const members = useLiveQuery(() => db.members.toArray(), []) ?? [];
  const active = members.filter((m) => m.active);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Users size={14} /> {active.length} membre{active.length > 1 ? 's' : ''}</div>
          <h1>Équipe</h1>
        </div>
        <div className="actions">
          <Link className="btn" to="/temps">Feuilles de temps</Link>
          <button className="btn accent" onClick={() => setEdit(blankMember(members.length))}><Plus size={17} /> Ajouter</button>
        </div>
      </div>
      {(st.status === 'off' || st.status === 'signedout') && (
        <div className="notice">Pour que tes employés aient l’app sur leur téléphone, active la synchronisation (Paramètres → Synchronisation). Tu peux quand même ajouter ton équipe maintenant.</div>
      )}
      <div className="card">
        {members.length === 0 ? (
          <div className="empty"><Users size={34} /> Ajoute tes employés et vendeurs: ils pointent leurs heures, voient leurs jobs et prennent les photos.</div>
        ) : (
          <table className="list">
            <thead><tr><th>Nom</th><th>Rôle</th><th className="num hide-mobile">Coût / h</th><th className="num hide-mobile">Commission</th><th>Accès</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="click" onClick={() => setEdit(m)} style={m.active ? undefined : { opacity: 0.5 }}>
                  <td><span className="dot" style={{ background: m.color }} /> <strong>{m.name}</strong><div className="small muted">{m.phone || m.email}</div></td>
                  <td>{ROLE_LABEL[m.role]}</td>
                  <td className="num hide-mobile">{money(m.hourlyCost)}</td>
                  <td className="num hide-mobile">{m.commissionRate ? `${m.commissionRate} %` : '—'}</td>
                  <td>{!m.active ? <span className="badge gray">Retiré</span> : m.uid ? <span className="badge green"><CircleCheck size={11} /> Connecté</span> : <span className="badge amber">Invitation à envoyer</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && <MemberModal m={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function MemberModal({ m, onClose }: { m: Member; onClose: () => void }) {
  const notify = useToast();
  const ask = useConfirm();
  const s = useSettings();
  const [x, setX] = useState(m);
  const up = (p: Partial<Member>) => setX((v) => ({ ...v, ...p }));
  const link = x.id ? inviteLink(x) : null;
  const msg = `Salut ${x.name.split(' ')[0]}! Voici ton accès à l’app de ${s.companyName} (agenda, pointage, photos): `;

  const save = async () => {
    if (!x.name.trim()) return notify('Le nom est requis.', 'err');
    const id = await db.members.put(x);
    setX({ ...x, id });
    notify('Membre enregistré');
    if (m.id) onClose();
  };

  return (
    <Modal title={m.id ? x.name : 'Nouveau membre'} onClose={onClose}>
      <div className="form-grid">
        <label className="field full">Nom *<input id="mb-name" autoFocus={!m.id} value={x.name} onChange={(e) => up({ name: e.target.value })} /></label>
        <label className="field">Téléphone<input id="mb-phone" type="tel" value={x.phone} onChange={(e) => up({ phone: e.target.value })} /></label>
        <label className="field">Courriel<input id="mb-email" type="email" value={x.email} onChange={(e) => up({ email: e.target.value })} /></label>
        <label className="field full">Rôle
          <select id="mb-role" value={x.role} onChange={(e) => up({ role: e.target.value as MemberRole })}>
            {(['employe', 'vendeur', 'admin'] as MemberRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <span className="small muted" style={{ fontWeight: 400 }}>{ROLE_HELP[x.role]}</span>
        </label>
        <label className="field">Coût horaire ($)<input id="mb-cost" type="number" inputMode="decimal" value={x.hourlyCost || ''} onChange={(e) => up({ hourlyCost: Number(e.target.value) })} /></label>
        <label className="field">Commission (%)<input id="mb-com" type="number" inputMode="decimal" value={x.commissionRate || ''} onChange={(e) => up({ commissionRate: Number(e.target.value) })} /></label>
        <div className="field full">Couleur dans l’agenda
          <div className="swatches">
            {MEMBER_COLORS.map((c) => (
              <button key={c} type="button" className={x.color === c ? 'on' : ''} style={{ background: c }} aria-label={`Couleur ${c}`} onClick={() => up({ color: c })} />
            ))}
          </div>
        </div>
      </div>

      {x.id && x.active && (
        <div className="card flat" style={{ marginTop: 14 }}>
          <h3>Invitation</h3>
          {link ? (
            <>
              <div className="small muted" style={{ marginBottom: 6 }}>Envoie ce lien à {x.name.split(' ')[0] || 'ton employé'}: il crée son mot de passe et a l’app sur son téléphone.</div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Lien d’invitation" />
                <button className="btn icon-btn" onClick={async () => { try { await navigator.clipboard.writeText(link); notify('Lien copié'); } catch { notify('Sélectionne et copie le lien.', 'err'); } }} aria-label="Copier"><Copy size={16} /></button>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {x.phone && <a className="btn small" href={smsLink(x.phone, msg + link)}><MessageSquare size={14} /> Texto</a>}
                <button className="btn small" onClick={() => void shareLink('Invitation', msg, link)}><Share2 size={14} /> Partager</button>
              </div>
            </>
          ) : (
            <div className="small muted">Active la synchronisation pour créer le lien d’invitation.</div>
          )}
        </div>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        {x.id && x.active && (
          <button className="btn small danger" onClick={async () => {
            if (!(await ask({ title: `Retirer l’accès de ${x.name}?`, message: 'Ses heures et photos restent dans tes dossiers.', confirm: 'Retirer', danger: true }))) return;
            try {
              await revokeMember(x);
              notify('Accès retiré');
              onClose();
            } catch (e) {
              notify(errMsg(e), 'err');
            }
          }}><UserMinus size={14} /> Retirer l’accès</button>
        )}
        {x.id && !x.active && <button className="btn small" onClick={() => up({ active: true })}>Réactiver</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Fermer</button>
        <button className="btn accent" onClick={save}>{x.id ? 'Enregistrer' : 'Créer et inviter'}</button>
      </div>
    </Modal>
  );
}
