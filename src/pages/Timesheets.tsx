import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Download, MapPin, Timer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '../components/Modal';
import { useConfirm, useToast } from '../components/Toast';
import { db, type Punch } from '../lib/db';
import { mapsLink } from '../lib/geo';
import { useSettings } from '../lib/hooks';
import { costOf, hoursOf, localDay, punchFlags, weekDays, weekStart } from '../lib/punch';
import { addDays, downloadBlob, money, toCSV, todayISO } from '../lib/utils';
import { PageHero } from '../components/PageHero';

const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const h2 = (h: number) => (h ? h.toFixed(2).replace('.', ',') : '—');
const toLocalInput = (iso?: string) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

/** Feuilles de temps de l'équipe (propriétaire). */
export default function Timesheets() {
  const s = useSettings();
  const notify = useToast();
  const [ws, setWs] = useState(weekStart(todayISO()));
  const [edit, setEdit] = useState<Punch | null>(null);
  const days = weekDays(ws);
  const data = useLiveQuery(async () => {
    const [punches, members, jobs, clients] = await Promise.all([db.punches.toArray(), db.members.toArray(), db.jobs.toArray(), db.clients.toArray()]);
    const week = punches.filter((p) => localDay(p.start) >= days[0] && localDay(p.start) <= days[6]).sort((a, b) => a.start.localeCompare(b.start));
    return { week, members, jobs: new Map(jobs.map((j) => [j.id!, j])), clients: new Map(clients.map((c) => [c.id!, c])), onSite: punches.filter((p) => !p.end).sort((a, b) => a.start.localeCompare(b.start)) };
  }, [ws]);
  if (!data) return null;

  const people = new Map<number, string>();
  data.week.forEach((p) => people.set(p.memberId, p.name));
  const rows = [...people.entries()].map(([id, name]) => {
    const mine = data.week.filter((p) => p.memberId === id);
    const perDay = days.map((d) => mine.filter((p) => localDay(p.start) === d).reduce((a, p) => a + hoursOf(p), 0));
    const total = perDay.reduce((a, b) => a + b, 0);
    const rate = costOf(id, data.members, s.laborCostPerHour);
    return { id, name, perDay, total, cost: total * rate, flags: mine.reduce((a, p) => a + punchFlags(p).length, 0) };
  });

  const toCheck = data.week.filter((p) => !p.approved && punchFlags(p).length > 0).length;
  const hm = (h: number) => `${Math.floor(h)} h ${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

  const exportCsv = () => {
    const out: unknown[][] = [['Employé', 'Date', 'Début', 'Fin', 'Pause (min)', 'Heures', 'Job', 'Client', 'Distance début (m)', 'Distance fin (m)', 'Approuvé', 'Remarques']];
    data.week.forEach((p) => {
      const j = p.jobId ? data.jobs.get(p.jobId) : undefined;
      out.push([p.name, localDay(p.start), new Date(p.start).toLocaleTimeString('fr-CA'), p.end ? new Date(p.end).toLocaleTimeString('fr-CA') : '', p.breakMin, hoursOf(p), j?.title ?? '', j ? data.clients.get(j.clientId)?.name ?? '' : '', p.startDistM ?? '', p.endDistM ?? '', p.approved ? 'Oui' : 'Non', punchFlags(p).join(' / ')]);
    });
    downloadBlob(new Blob([toCSV(out)], { type: 'text/csv;charset=utf-8' }), `Feuilles_de_temps_${ws}.csv`);
  };

  return (
    <>
      <PageHero
        eyebrow={<><Timer size={14} /> Semaine du {new Date(ws + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}</>}
        title="Feuilles de temps"
        actions={
          <>
            <button className="agh-btn icon" onClick={() => setWs(addDays(ws, -7))} aria-label="Semaine précédente"><ChevronLeft size={18} /></button>
            <button className="agh-btn" onClick={() => setWs(weekStart(todayISO()))}>Cette semaine</button>
            <button className="agh-btn icon" onClick={() => setWs(addDays(ws, 7))} aria-label="Semaine suivante"><ChevronRight size={18} /></button>
            <button className="agh-btn solid keep" onClick={exportCsv}><Download size={16} /> Excel (paie)</button>
          </>
        }
      >
        <div className="agh-eyebrow" style={{ marginTop: 16, marginBottom: 8 }}><span className="live-dot" /> En ce moment</div>
        {data.onSite.length === 0 ? (
          <div className="agh-sub">Personne n’est pointé en ce moment.</div>
        ) : (
          <div className="agh-avatars">
            {data.onSite.map((p) => {
              const m = data.members.find((x) => x.id === p.memberId);
              const j = p.jobId ? data.jobs.get(p.jobId) : undefined;
              const far = (p.startDistM ?? 0) > 300;
              return (
                <button key={p.id} className={`agh-person ${far ? 'far' : ''}`} onClick={() => setEdit(p)} title={far ? 'Punch in loin du chantier' : undefined}>
                  <i style={{ background: m?.color ?? 'var(--brand-deeper)' }}>{p.name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()}</i>
                  <span style={{ textAlign: 'left' }}>
                    <strong>{p.name.split(' ')[0]}</strong> · {hm(hoursOf(p))}
                    <small>{j ? data.clients.get(j.clientId)?.name ?? j.title : 'Sans job précis'} · depuis {new Date(p.start).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}</small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="agh-stats" style={{ marginTop: 14 }}>
          <div><b>{h2(rows.reduce((a, r) => a + r.total, 0))} h</b><span>cette semaine</span></div>
          <div><b>{money(rows.reduce((a, r) => a + r.cost, 0))}</b><span>de main-d’œuvre</span></div>
          {toCheck > 0 && <div className="warn"><b><AlertTriangle size={15} /> {toCheck}</b><span>à vérifier</span></div>}
        </div>
      </PageHero>

      <div className="card table-wrap">
        {rows.length === 0 ? <div className="empty">Aucun pointage cette semaine.</div> : (
          <table className="list">
            <thead><tr><th>Employé</th>{days.map((d, i) => <th key={d} className="num hide-mobile">{DOW[i]} {d.slice(8)}</th>)}<th className="num">Total</th><th className="num">Coût</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong>{r.flags > 0 && <div className="small" style={{ color: 'var(--red)' }}><AlertTriangle size={12} /> {r.flags} à vérifier</div>}</td>
                  {r.perDay.map((h, i) => <td key={i} className="num hide-mobile">{h2(h)}</td>)}
                  <td className="num"><strong>{h2(r.total)}</strong></td>
                  <td className="num">{money(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Pointages de la semaine</h2>
        <table className="list"><tbody>
          {data.week.map((p) => {
            const j = p.jobId ? data.jobs.get(p.jobId) : undefined;
            const flags = punchFlags(p);
            return (
              <tr key={p.id} className="click" onClick={() => setEdit(p)}>
                <td>{p.name}<div className="small muted">{localDay(p.start)}</div></td>
                <td>{new Date(p.start).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })} → {p.end ? new Date(p.end).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '…'}
                  <div className="small muted">{j ? `${data.clients.get(j.clientId)?.name ?? ''} — ${j.title}` : 'Sans job'}</div>
                  {flags.map((f) => <div key={f} className="small" style={{ color: 'var(--red)' }}>{f}</div>)}
                </td>
                <td className="num">{h2(hoursOf(p))} h{p.approved && <div><span className="badge green"><Check size={11} /> Approuvé</span></div>}</td>
              </tr>
            );
          })}
        </tbody></table>
      </div>

      {edit && (
        <PunchModal p={edit} onClose={() => setEdit(null)} onSaved={(msg) => { setEdit(null); notify(msg); }} />
      )}
    </>
  );
}

/** Corriger, approuver ou supprimer un pointage (propriétaire / admin). */
export function PunchModal({ p, onClose, onSaved }: { p: Punch; onClose: () => void; onSaved: (msg: string) => void }) {
  const ask = useConfirm();
  const [x, setX] = useState(p);
  const fromLocal = (v: string) => (v ? new Date(v).toISOString() : undefined);
  return (
    <Modal title={`Pointage — ${p.name}`} onClose={onClose}>
      <div className="form-grid">
        <label className="field">Début<input type="datetime-local" value={toLocalInput(x.start)} onChange={(e) => setX({ ...x, start: fromLocal(e.target.value) ?? x.start })} /></label>
        <label className="field">Fin<input type="datetime-local" value={toLocalInput(x.end)} onChange={(e) => setX({ ...x, end: fromLocal(e.target.value) })} /></label>
        <label className="field">Pause (min)<input type="number" value={x.breakMin || ''} onChange={(e) => setX({ ...x, breakMin: Number(e.target.value) })} /></label>
        <label className="field full">Note<input value={x.note} onChange={(e) => setX({ ...x, note: e.target.value })} /></label>
      </div>
      {p.endManual && <div className="notice small" style={{ marginTop: 10 }}>Heure de fin entrée à la main par {p.name} le {new Date(p.endManual.at).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })} — raison : {p.endManual.reason}. Vérifie et approuve.</div>}
      <div className="row small" style={{ marginTop: 10 }}>
        {x.startGeo && <a href={mapsLink(x.startGeo)} target="_blank" rel="noreferrer"><MapPin size={12} /> Position du punch in</a>}
        {x.endGeo && <a href={mapsLink(x.endGeo)} target="_blank" rel="noreferrer"><MapPin size={12} /> Position du punch out</a>}
      </div>
      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn danger" style={{ marginRight: 'auto' }} onClick={async () => {
          if (!(await ask({ title: 'Supprimer ce pointage?', message: `${p.name} — ${localDay(p.start)}. Les heures seront retirées des feuilles de temps et de la rentabilité.`, confirm: 'Supprimer', danger: true }))) return;
          await db.punches.delete(p.id!);
          onSaved('Pointage supprimé');
        }}><Trash2 size={15} /> Supprimer</button>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn" onClick={async () => { await db.punches.put({ ...x, approved: !x.approved }); onSaved('Pointage mis à jour'); }}>{x.approved ? 'Retirer l’approbation' : 'Approuver'}</button>
        <button className="btn accent" onClick={async () => { await db.punches.put(x); onSaved('Pointage mis à jour'); }}>Enregistrer</button>
      </div>
    </Modal>
  );
}
