import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, ArrowRight, Bell, ClipboardList, Copy, Globe, Inbox, Mail, MessageSquare, Phone, Plus, QrCode, Trash2, X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AddressInput } from '../components/AddressInput';
import { Modal } from '../components/Modal';
import { errMsg, useConfirm, useToast } from '../components/Toast';
import { smsLink } from '../lib/agenda';
import { blankLead, leadFormLink, leadToQuote, note, OPEN_STAGES, publishLeadForm, setStage, SOURCE_LABEL, STAGES, STAGE_LABEL } from '../lib/crm';
import { db, saveSettings, type Lead, type LeadSource, type LeadStage } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { useSyncState } from '../lib/sync';
import { addDays, downloadBlob, money, todayISO } from '../lib/utils';

const age = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'aujourd’hui' : d === 1 ? 'hier' : `il y a ${d} j`;
};

export default function Leads() {
  const notify = useToast();
  const [edit, setEdit] = useState<Lead | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const leads = useLiveQuery(() => db.leads.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('new')) {
      setEdit(blankLead());
      setParams({}, { replace: true });
    }
  }, [params, setParams]);
  const members = useLiveQuery(() => db.members.toArray(), []) ?? [];
  const today = todayISO();

  const stats = useMemo(() => {
    const open = leads.filter((l) => OPEN_STAGES.includes(l.stage));
    const since = addDays(today, -90);
    const closed = leads.filter((l) => (l.stage === 'gagne' || l.stage === 'perdu') && l.createdAt.slice(0, 10) >= since);
    const won = closed.filter((l) => l.stage === 'gagne').length;
    const bySource = new Map<string, number>();
    leads.filter((l) => l.createdAt.slice(0, 7) === today.slice(0, 7)).forEach((l) => bySource.set(l.source, (bySource.get(l.source) ?? 0) + 1));
    return {
      month: leads.filter((l) => l.createdAt.slice(0, 7) === today.slice(0, 7)).length,
      due: open.filter((l) => l.nextAction && l.nextAction <= today).length,
      pipeline: open.reduce((a, l) => a + (l.value || 0), 0),
      rate: closed.length ? Math.round((won / closed.length) * 100) : null,
      bySource: [...bySource.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [leads, today]);

  const move = async (l: Lead, dir: -1 | 1) => {
    const i = STAGES.findIndex((s) => s.key === l.stage);
    const next = STAGES[Math.min(STAGES.length - 1, Math.max(0, i + dir))];
    if (next.key === 'perdu') return setEdit({ ...l, stage: 'perdu' });
    await setStage(l.id!, next.key);
    notify(`${l.name} → ${next.label}`);
  };

  const columns = STAGES.filter((s) => showClosed || OPEN_STAGES.includes(s.key));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Inbox size={14} /> CRM</div>
          <h1>Demandes</h1>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setFormOpen(true)}><Globe size={17} /> Mon formulaire en ligne</button>
          <button className="btn accent" onClick={() => setEdit(blankLead())}><Plus size={17} /> Demande</button>
        </div>
      </div>

      <div className="grid kpi">
        <div className="card"><div className="label">Nouvelles ce mois</div><div className="value">{stats.month}</div><div className="sub">{stats.bySource.slice(0, 3).map(([k, v]) => `${SOURCE_LABEL[k as LeadSource]} ${v}`).join(' · ') || '—'}</div></div>
        <div className={`card ${stats.due ? 'hot' : ''}`}><div className="label">À relancer</div><div className="value">{stats.due}</div><div className="sub">aujourd’hui ou en retard</div></div>
        <div className="card"><div className="label">Valeur en cours</div><div className="value">{money(stats.pipeline)}</div><div className="sub">demandes ouvertes</div></div>
        <div className="card"><div className="label">Taux de conversion</div><div className="value">{stats.rate === null ? '—' : `${stats.rate} %`}</div><div className="sub">90 derniers jours</div></div>
      </div>

      <div className="row" style={{ marginBottom: 10 }}>
        <label className="check"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> Voir les gagnées et perdues</label>
      </div>

      <div className="board">
        {columns.map((col) => {
          const list = leads.filter((l) => l.stage === col.key);
          return (
            <section key={col.key} className="board-col">
              <div className="board-head"><span className={`badge ${col.tone}`}>{list.length}</span> {col.label}</div>
              {list.length === 0 && <div className="small muted" style={{ padding: 8 }}>—</div>}
              {list.map((l) => {
                const late = l.nextAction && l.nextAction <= today && OPEN_STAGES.includes(l.stage);
                const m = members.find((x) => x.id === l.assignedTo);
                return (
                  <article key={l.id} className={`lead-card ${late ? 'late' : ''}`}>
                    <button className="lead-main" onClick={() => setEdit(l)}>
                      <div className="row" style={{ gap: 6 }}>
                        <strong>{l.name}</strong>
                        <span className="spacer" />
                        {l.value > 0 && <span className="small">{money(l.value)}</span>}
                      </div>
                      <div className="small">{l.service || l.message.slice(0, 60)}</div>
                      <div className="small muted">{SOURCE_LABEL[l.source]} · {age(l.createdAt)}{m ? ` · ${m.name}` : ''}</div>
                      {l.nextAction && OPEN_STAGES.includes(l.stage) && (
                        <div className={`small ${late ? '' : 'muted'}`} style={late ? { color: 'var(--red)', fontWeight: 700 } : undefined}><Bell size={12} /> {l.nextAction === today ? 'Relancer aujourd’hui' : late ? `Relance en retard (${l.nextAction})` : `Relance le ${l.nextAction}`}</div>
                      )}
                    </button>
                    <div className="lead-actions">
                      {l.phone && <a className="btn small icon-btn" href={`tel:${l.phone}`} aria-label="Appeler"><Phone size={14} /></a>}
                      {l.phone && <a className="btn small icon-btn" href={smsLink(l.phone, `Bonjour ${l.name.split(' ')[0]}, `)} aria-label="Texto"><MessageSquare size={14} /></a>}
                      <span className="spacer" />
                      <button className="btn small icon-btn" disabled={col.key === 'nouveau'} onClick={() => move(l, -1)} aria-label="Étape précédente"><ArrowLeft size={14} /></button>
                      <button className="btn small icon-btn" disabled={col.key === 'perdu'} onClick={() => move(l, 1)} aria-label="Étape suivante"><ArrowRight size={14} /></button>
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>

      {edit && <LeadModal lead={edit} onClose={() => setEdit(null)} />}
      {formOpen && <FormModal onClose={() => setFormOpen(false)} />}
    </>
  );
}

function LeadModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const notify = useToast();
  const ask = useConfirm();
  const nav = useNavigate();
  const [l, setL] = useState<Lead>(lead);
  const [msg, setMsg] = useState('');
  const members = useLiveQuery(() => db.members.filter((m) => m.active).toArray(), []) ?? [];
  const up = (p: Partial<Lead>) => setL((x) => ({ ...x, ...p }));

  const save = async (patch: Partial<Lead> = {}) => {
    if (!l.name.trim()) {
      notify('Le nom est requis.', 'err');
      return null;
    }
    const rec: Lead = { ...l, ...patch };
    if (!lead.id) rec.history = [note(`Créée (${SOURCE_LABEL[rec.source]})`), ...rec.history];
    if (lead.id && lead.stage !== rec.stage) rec.history = [...rec.history, note(`Étape: ${STAGE_LABEL[rec.stage]}`)];
    const id = await db.leads.put(rec);
    return id;
  };

  const quote = async () => {
    const id = await save();
    if (!id) return;
    try {
      const qid = await leadToQuote(id);
      onClose();
      nav(`/doc/${qid}`);
    } catch (e) {
      notify(errMsg(e), 'err');
    }
  };

  return (
    <Modal title={lead.id ? l.name : 'Nouvelle demande'} onClose={onClose}>
      <div className="form-grid">
        <label className="field full">Nom *<input id="lead-name" autoFocus={!lead.id} value={l.name} onChange={(e) => up({ name: e.target.value })} /></label>
        <label className="field">Téléphone<input id="lead-phone" type="tel" value={l.phone} onChange={(e) => up({ phone: e.target.value })} /></label>
        <label className="field">Courriel<input id="lead-email" type="email" value={l.email} onChange={(e) => up({ email: e.target.value })} /></label>
        <label className="field full">Adresse<AddressInput value={l.address} onChange={(v) => up({ address: v, geo: undefined })} onPick={(label, geo) => up({ address: label, geo })} /></label>
        <label className="field full">Service demandé<input id="lead-service" value={l.service} onChange={(e) => up({ service: e.target.value })} placeholder="ex.: Nettoyage de gouttières" /></label>
        <label className="field full">Message / détails<textarea id="lead-message" value={l.message} onChange={(e) => up({ message: e.target.value })} /></label>
        <label className="field">Source
          <select id="lead-source" value={l.source} onChange={(e) => up({ source: e.target.value as LeadSource })}>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field">Étape
          <select id="lead-stage" value={l.stage} onChange={(e) => up({ stage: e.target.value as LeadStage })}>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label className="field">Valeur estimée ($)<input id="lead-value" type="number" inputMode="decimal" value={l.value || ''} onChange={(e) => up({ value: Number(e.target.value) })} /></label>
        <label className="field">Responsable
          <select id="lead-assigned" value={l.assignedTo ?? ''} onChange={(e) => up({ assignedTo: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">Moi</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="field">Prochaine relance<input id="lead-next" type="date" value={l.nextAction ?? ''} onChange={(e) => up({ nextAction: e.target.value || undefined })} /></label>
        <label className="field">Quoi faire<input id="lead-nextnote" value={l.nextNote ?? ''} placeholder="Rappeler, aller mesurer…" onChange={(e) => up({ nextNote: e.target.value })} /></label>
        {l.stage === 'perdu' && <label className="field full">Raison de la perte<input id="lead-lost" value={l.lostReason ?? ''} placeholder="Trop cher, pas de réponse, a choisi un autre…" onChange={(e) => up({ lostReason: e.target.value })} /></label>}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        {l.phone && <a className="btn small" href={`tel:${l.phone}`}><Phone size={14} /> Appeler</a>}
        {l.phone && <a className="btn small" href={smsLink(l.phone, `Bonjour ${l.name.split(' ')[0]}, merci pour votre demande! `)}><MessageSquare size={14} /> Texto</a>}
        {l.email && <a className="btn small" href={`mailto:${l.email}`}><Mail size={14} /> Courriel</a>}
      </div>

      {lead.id && (
        <div style={{ marginTop: 14 }}>
          <h3>Historique</h3>
          <div className="row" style={{ flexWrap: 'nowrap', marginBottom: 6 }}>
            <input value={msg} placeholder="Ajouter une note (appel, visite…)" onChange={(e) => setMsg(e.target.value)} aria-label="Note" />
            <button className="btn small" disabled={!msg.trim()} onClick={() => { up({ history: [...l.history, note(msg.trim())] }); setMsg(''); }}>Ajouter</button>
          </div>
          <div className="small" style={{ maxHeight: 140, overflow: 'auto' }}>
            {[...l.history].reverse().map((h, i) => <div key={i}><span className="muted">{new Date(h.at).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' })}</span> — {h.text}</div>)}
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        {lead.id && <button className="btn small danger" onClick={async () => {
          if (!(await ask({ title: `Supprimer la demande de ${l.name}?`, confirm: 'Supprimer', danger: true }))) return;
          const copy = { ...lead };
          await db.leads.delete(lead.id!);
          onClose();
          notify('Demande supprimée', 'ok', { label: 'Annuler', run: () => void db.leads.put(copy) });
        }}><Trash2 size={14} /></button>}
        <span className="spacer" />
        {l.quoteId ? (
          <button className="btn" onClick={() => { onClose(); nav(`/doc/${l.quoteId}`); }}><ClipboardList size={16} /> Voir la soumission</button>
        ) : (
          <button className="btn primary" onClick={quote}><ClipboardList size={16} /> Créer la soumission</button>
        )}
        <button className="btn accent" onClick={async () => { if (await save()) { notify('Demande enregistrée'); onClose(); } }}>Enregistrer</button>
      </div>
    </Modal>
  );
}

function FormModal({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const st = useSyncState();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState<boolean | null>(null);
  const [source, setSource] = useState<LeadSource>('formulaire');
  const [qr, setQr] = useState('');
  const link = st.status === 'off' || st.status === 'signedout' ? null : leadFormLink(source);

  useEffect(() => {
    if (link) QRCode.toDataURL(link, { width: 520, margin: 1, color: { dark: '#23262b', light: '#ffffff' } }).then(setQr).catch(() => setQr(''));
  }, [link]);

  const toggle = async (on: boolean) => {
    setOn(on);
    setBusy(true);
    try {
      await saveSettings({ leadForm: on });
      await publishLeadForm(on);
      notify(on ? 'Formulaire en ligne activé' : 'Formulaire désactivé');
    } catch (e) {
      setOn(null);
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Mon formulaire « Demander une soumission »" onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0 }}>
        Une page où tes clients demandent une soumission. Mets le lien dans tes pubs Facebook, ta fiche Google, ton site, ou imprime le code QR (camion, accroche-porte). Chaque demande arrive ici, dans « Nouvelles », avec sa source.
      </p>
      {!link ? (
        <div className="notice">Le formulaire en ligne utilise la synchronisation: connecte-toi dans Paramètres → Synchronisation.</div>
      ) : (
        <>
          <label className="check"><input type="checkbox" checked={on ?? s.leadForm} disabled={busy} onChange={(e) => toggle(e.target.checked)} /> Formulaire activé</label>
          <label className="field" style={{ marginTop: 10 }}>Texte d’accueil
            <textarea rows={2} value={s.leadFormIntro} onChange={(e) => saveSettings({ leadFormIntro: e.target.value })} onBlur={() => s.leadForm && publishLeadForm(true).catch(() => undefined)} />
          </label>
          <div className="seg" style={{ margin: '12px 0' }}>
            {(['formulaire', 'facebook', 'google', 'site'] as LeadSource[]).map((k) => <button key={k} className={source === k ? 'on' : ''} onClick={() => setSource(k)}>{SOURCE_LABEL[k]}</button>)}
          </div>
          <div className="small muted">Un lien par source: tu sauras d’où viennent tes clients.</div>
          <div className="row" style={{ flexWrap: 'nowrap', marginTop: 8 }}>
            <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Lien du formulaire" />
            <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(link); notify('Lien copié'); } catch { notify('Sélectionne et copie le lien.', 'err'); } }}><Copy size={16} /></button>
          </div>
          {qr && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <img src={qr} alt="Code QR du formulaire" style={{ width: 200, height: 200, borderRadius: 10, border: '1px solid var(--line)' }} />
              <div><button className="btn small" onClick={async () => downloadBlob(await (await fetch(qr)).blob(), `QR_formulaire_${source}.png`)}><QrCode size={14} /> Télécharger le code QR</button></div>
            </div>
          )}
          {!s.leadForm && <div className="notice" style={{ marginTop: 10 }}>Active le formulaire pour que le lien fonctionne.</div>}
        </>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}><button className="btn" onClick={onClose}><X size={16} /> Fermer</button></div>
    </Modal>
  );
}
