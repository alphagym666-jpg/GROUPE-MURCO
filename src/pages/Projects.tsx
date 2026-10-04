import { useLiveQuery } from 'dexie-react-hooks';
import { Briefcase, ChevronLeft, MapPin, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AddressInput } from '../components/AddressInput';
import { Modal } from '../components/Modal';
import { useConfirm, useToast } from '../components/Toast';
import { db, type Project, type ProjectStatus } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { costOf, hoursOf } from '../lib/punch';
import { docTotals, money, round2, todayISO } from '../lib/utils';

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: string }> = {
  estimation: { label: 'Estimation', tone: 'amber' },
  en_cours: { label: 'En cours', tone: 'blue' },
  termine: { label: 'Terminé', tone: 'green' },
  annule: { label: 'Annulé', tone: 'gray' },
};

const blank = (): Project => ({ name: '', clientId: 0, address: '', status: 'en_cours', budget: 0, start: todayISO(), end: '', notes: '', createdAt: new Date().toISOString() });

/** Chiffres d'un projet: budget, facturé, coûts (dépenses + main-d'œuvre), profit. */
async function projectNumbers(id: number) {
  const s = await (await import('../lib/db')).getSettings();
  const [docs, expenses, jobs, punches, members] = await Promise.all([
    db.docs.where('projectId').equals(id).toArray(),
    db.expenses.where('projectId').equals(id).toArray(),
    db.jobs.where('projectId').equals(id).toArray(),
    db.punches.toArray(),
    db.members.toArray(),
  ]);
  const jobIds = new Set(jobs.map((j) => j.id));
  const ps = punches.filter((p) => p.projectId === id || (p.jobId && jobIds.has(p.jobId)));
  const invoiced = round2(docs.filter((d) => d.type === 'invoice' && d.status !== 'draft' && d.status !== 'cancelled').reduce((a, d) => a + docTotals(d, s).subtotal, 0));
  const quoted = round2(docs.filter((d) => d.type === 'quote' && d.status !== 'refused' && d.status !== 'cancelled').reduce((a, d) => a + docTotals(d, s).subtotal, 0));
  const materials = round2(expenses.reduce((a, e) => a + e.subtotal, 0));
  const hours = round2(ps.reduce((a, p) => a + hoursOf(p), 0));
  const labor = round2(ps.reduce((a, p) => a + hoursOf(p) * costOf(p.memberId, members, s.laborCostPerHour), 0));
  return { docs, expenses, jobs, punches: ps, invoiced, quoted, materials, hours, labor, cost: round2(materials + labor), profit: round2(invoiced - materials - labor) };
}

export default function Projects() {
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const data = useLiveQuery(async () => {
    const [projects, clients] = await Promise.all([db.projects.toArray(), db.clients.toArray()]);
    const nums = await Promise.all(projects.map((p) => projectNumbers(p.id!)));
    return { rows: projects.map((p, i) => ({ p, n: nums[i] })).sort((a, b) => b.p.start.localeCompare(a.p.start)), clients: new Map(clients.map((c) => [c.id!, c])) };
  }, []);
  if (!data) return null;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Briefcase size={14} /> {data.rows.filter((r) => r.p.status === 'en_cours').length} en cours</div>
          <h1>Projets</h1>
        </div>
        <button className="btn accent" onClick={() => setCreating(true)}><Plus size={17} /> Projet</button>
      </div>
      {data.rows.length === 0 ? (
        <div className="card empty"><Briefcase size={34} /> Un projet regroupe les jobs, soumissions, factures, dépenses et heures d’un gros chantier pour suivre le budget.</div>
      ) : (
        <div className="grid three">
          {data.rows.map(({ p, n }) => {
            const ref = p.budget || n.quoted;
            const used = ref ? Math.round((n.cost / ref) * 100) : 0;
            return (
              <button key={p.id} className="card proj-card" onClick={() => nav(`/projets/${p.id}`)}>
                <div className="row"><strong>{p.name}</strong><span className="spacer" /><span className={`badge ${PROJECT_STATUS[p.status].tone}`}>{PROJECT_STATUS[p.status].label}</span></div>
                <div className="small muted">{data.clients.get(p.clientId)?.name}</div>
                <div className="proj-nums">
                  <div><span>Budget</span><b>{money(ref)}</b></div>
                  <div><span>Facturé</span><b>{money(n.invoiced)}</b></div>
                  <div><span>Coûts</span><b>{money(n.cost)}</b></div>
                </div>
                <div className="track" style={{ background: 'var(--surface-2)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, used)}%`, height: '100%', background: used > 90 ? 'var(--red)' : 'var(--amber)' }} />
                </div>
                <div className="small muted">{used} % du budget en coûts · {n.hours} h</div>
              </button>
            );
          })}
        </div>
      )}
      {creating && <ProjectModal onClose={() => setCreating(false)} onSaved={(id) => nav(`/projets/${id}`)} />}
    </>
  );
}

function ProjectModal({ initial, onClose, onSaved }: { initial?: Project; onClose: () => void; onSaved?: (id: number) => void }) {
  const notify = useToast();
  const [p, setP] = useState<Project>(initial ?? blank());
  const clients = useLiveQuery(() => db.clients.orderBy('name').toArray(), []) ?? [];
  const up = (x: Partial<Project>) => setP((v) => ({ ...v, ...x }));
  return (
    <Modal title={initial ? 'Modifier le projet' : 'Nouveau projet'} onClose={onClose}>
      <div className="form-grid">
        <label className="field full">Nom du projet *<input id="pj-name" autoFocus value={p.name} placeholder="ex.: Rénovation toiture Tremblay" onChange={(e) => up({ name: e.target.value })} /></label>
        <label className="field full">Client *
          <select id="pj-client" value={p.clientId || ''} onChange={(e) => { const c = clients.find((x) => x.id === Number(e.target.value)); up({ clientId: Number(e.target.value), address: p.address || c?.address || '' }); }}>
            <option value="">— Choisir —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field full">Adresse<AddressInput value={p.address} onChange={(v) => up({ address: v })} /></label>
        <label className="field">Budget ($)<input id="pj-budget" type="number" inputMode="decimal" value={p.budget || ''} onChange={(e) => up({ budget: Number(e.target.value) })} /></label>
        <label className="field">Statut
          <select id="pj-status" value={p.status} onChange={(e) => up({ status: e.target.value as ProjectStatus })}>
            {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="field">Début<input type="date" value={p.start} onChange={(e) => up({ start: e.target.value })} /></label>
        <label className="field">Fin prévue<input type="date" value={p.end} onChange={(e) => up({ end: e.target.value })} /></label>
        <label className="field full">Notes<textarea value={p.notes} onChange={(e) => up({ notes: e.target.value })} /></label>
      </div>
      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn accent" onClick={async () => {
          if (!p.name.trim() || !p.clientId) return notify('Nom et client requis.', 'err');
          const id = await db.projects.put(p);
          notify('Projet enregistré');
          onSaved?.(id);
          onClose();
        }}><Save size={16} /> Enregistrer</button>
      </div>
    </Modal>
  );
}

export function ProjectDetail() {
  const { id } = useParams();
  const pid = Number(id);
  const nav = useNavigate();
  const ask = useConfirm();
  const notify = useToast();
  const s = useSettings();
  const [editing, setEditing] = useState(false);
  const [n, setN] = useState<Awaited<ReturnType<typeof projectNumbers>> | null>(null);
  const p = useLiveQuery(() => db.projects.get(pid), [pid]);
  const client = useLiveQuery(() => (p ? db.clients.get(p.clientId) : undefined), [p?.clientId]);
  const tick = useLiveQuery(async () => `${await db.docs.count()}-${await db.expenses.count()}-${await db.punches.count()}-${await db.jobs.count()}-${(await db.docs.toArray()).reduce((a, d) => a + (d._u ?? 0), 0)}`, []);
  useEffect(() => { projectNumbers(pid).then(setN); }, [pid, tick]);
  if (!p || !n) return null;
  const ref = p.budget || n.quoted;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link to="/projets" className="row" style={{ gap: 4 }}><ChevronLeft size={14} /> Projets</Link></div>
          <h1>{p.name} <span className={`badge ${PROJECT_STATUS[p.status].tone}`} style={{ verticalAlign: 'middle' }}>{PROJECT_STATUS[p.status].label}</span></h1>
          <div className="small muted">{client?.name}{p.address ? <> · <MapPin size={12} /> {p.address}</> : null}</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setEditing(true)}>Modifier</button>
          <button className="btn" onClick={() => nav(`/job/new?client=${p.clientId}&project=${pid}`)}><Plus size={16} /> Job</button>
          <button className="btn primary" onClick={() => nav(`/doc/new?type=quote&client=${p.clientId}&project=${pid}`)}><Plus size={16} /> Soumission</button>
          <button className="btn accent" onClick={() => nav(`/doc/new?type=invoice&client=${p.clientId}&project=${pid}`)}><Plus size={16} /> Facture</button>
        </div>
      </div>

      <div className="grid kpi">
        <div className="card"><div className="label">Budget</div><div className="value">{money(ref)}</div><div className="sub">{p.budget ? 'fixé' : 'selon les soumissions'}</div></div>
        <div className="card"><div className="label">Facturé</div><div className="value">{money(n.invoiced)}</div><div className="sub">{ref ? `${Math.round((n.invoiced / ref) * 100)} % du budget` : ''}</div></div>
        <div className="card"><div className="label">Coûts</div><div className="value">{money(n.cost)}</div><div className="sub">matériaux {money(n.materials)} · main-d’œuvre {money(n.labor)}</div></div>
        <div className="card hot"><div className="label">Profit à date</div><div className="value">{money(n.profit)}</div><div className="sub">{n.hours} h travaillées</div></div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Jobs ({n.jobs.length})</h2>
          <table className="list"><tbody>
            {n.jobs.sort((a, b) => a.date.localeCompare(b.date)).map((j) => (
              <tr key={j.id} className="click" onClick={() => nav(`/job/${j.id}`)}><td>{j.date}</td><td>{j.title}</td><td><span className="badge gray">{j.status}</span></td></tr>
            ))}
          </tbody></table>
        </div>
        <div className="card">
          <h2>Soumissions et factures ({n.docs.length})</h2>
          <table className="list"><tbody>
            {n.docs.map((d) => (
              <tr key={d.id} className="click" onClick={() => nav(`/doc/${d.id}`)}><td><strong>{d.number}</strong><div className="small muted">{d.title}</div></td><td className="num">{money(docTotals(d, s).subtotal)}</td></tr>
            ))}
          </tbody></table>
        </div>
        <div className="card">
          <h2>Dépenses ({n.expenses.length})</h2>
          <table className="list"><tbody>
            {n.expenses.map((e) => (
              <tr key={e.id} className="click" onClick={() => nav(`/depenses/${e.id}`)}><td>{e.date}</td><td>{e.vendor || e.category}</td><td className="num">{money(e.subtotal)}</td></tr>
            ))}
          </tbody></table>
          <button className="btn small" style={{ marginTop: 8 }} onClick={() => nav(`/depenses/new?project=${pid}`)}><Plus size={14} /> Reçu pour ce projet</button>
        </div>
        <div className="card">
          <h2>Heures ({n.hours} h)</h2>
          <table className="list"><tbody>
            {[...new Map(n.punches.map((x) => [x.memberId, x.name])).entries()].map(([mid, name]) => {
              const h = n.punches.filter((x) => x.memberId === mid).reduce((a, x) => a + hoursOf(x), 0);
              return <tr key={mid}><td>{name}</td><td className="num">{round2(h)} h</td></tr>;
            })}
          </tbody></table>
        </div>
      </div>
      {p.notes && <div className="card"><h2>Notes</h2><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{p.notes}</p></div>}
      <button className="btn danger small" onClick={async () => {
        if (!(await ask({ title: 'Supprimer ce projet?', message: 'Les jobs, factures et dépenses restent; ils ne seront plus regroupés.', confirm: 'Supprimer', danger: true }))) return;
        await db.projects.delete(pid);
        notify('Projet supprimé');
        nav('/projets');
      }}><Trash2 size={14} /> Supprimer le projet</button>
      {editing && <ProjectModal initial={p} onClose={() => setEditing(false)} />}
    </>
  );
}
