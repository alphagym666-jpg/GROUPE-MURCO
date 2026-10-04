import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Clock, MapPin, Play, Square, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errMsg, useToast } from '../components/Toast';
import { db, type Punch } from '../lib/db';
import { hoursOf, localDay, openPunch, punchFlags, startPunch, stopPunch, weekStart, whoAmI, type Me } from '../lib/punch';
import { useSyncState } from '../lib/sync';
import { todayISO } from '../lib/utils';

const hm = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });

/** Pointage (punch in / punch out) avec la position GPS. */
export default function PunchPage() {
  const st = useSyncState();
  const notify = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [jobId, setJobId] = useState<number | ''>('');
  const [breakMin, setBreakMin] = useState(0);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const today = todayISO();

  useEffect(() => { whoAmI(st.memberId).then(setMe); }, [st.memberId]);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const data = useLiveQuery(async () => {
    if (!me) return null;
    const [jobs, clients, mine] = await Promise.all([
      db.jobs.where('date').equals(today).toArray(),
      db.clients.toArray(),
      db.punches.where('memberId').equals(me.memberId).toArray(),
    ]);
    const visible = jobs.filter((j) => j.status !== 'annule' && (me.memberId === 0 || !j.assignees?.length || j.assignees.includes(me.memberId)));
    return { jobs: visible.sort((a, b) => a.order - b.order), clients: new Map(clients.map((c) => [c.id!, c])), mine: mine.sort((a, b) => b.start.localeCompare(a.start)), open: await openPunch(me.memberId) };
  }, [me, today]);

  if (!me || !data) return null;
  const todayPunches = data.mine.filter((p) => localDay(p.start) === today);
  const ws = weekStart(today);
  const weekH = data.mine.filter((p) => localDay(p.start) >= ws).reduce((a, p) => a + hoursOf(p), 0);
  const todayH = todayPunches.reduce((a, p) => a + hoursOf(p), 0);
  const open = data.open;
  const openJob = open?.jobId ? data.jobs.find((j) => j.id === open.jobId) : undefined;

  const start = async () => {
    setBusy(true);
    try {
      const p = await startPunch(me, jobId || undefined);
      notify(`Punch in à ${time(p.start)}${p.startDistM !== undefined ? ` · ${p.startDistM < 1000 ? `${p.startDistM} m` : `${(p.startDistM / 1000).toFixed(1)} km`} du chantier` : ''}`);
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };
  const stop = async (p: Punch) => {
    setBusy(true);
    try {
      const done = await stopPunch(p, breakMin);
      notify(`Punch out — ${hm(hoursOf(done))} travaillées`);
      setBreakMin(0);
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="express">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Clock size={14} /> {me.name}</div>
          <h1>Pointage</h1>
        </div>
      </div>

      <div className={`card punch-card ${open ? 'on' : ''}`}>
        {open ? (
          <>
            <div className="small muted">En cours depuis {time(open.start)}</div>
            <div className="punch-clock">{hm(hoursOf(open))}</div>
            <div className="small">{openJob ? `${data.clients.get(openJob.clientId)?.name ?? ''} — ${openJob.title}` : 'Sans job précis'}</div>
            {punchFlags(open).filter((f) => !f.startsWith('Pas de punch out')).map((f) => <div key={f} className="small" style={{ color: 'var(--red)' }}><AlertTriangle size={12} /> {f}</div>)}
            <label className="field" style={{ margin: '14px auto 10px', maxWidth: 220 }}>Pause (minutes)
              <input type="number" inputMode="numeric" value={breakMin || ''} placeholder="0" onChange={(e) => setBreakMin(Number(e.target.value))} />
            </label>
            <button className="btn big block punch-btn stop" disabled={busy} onClick={() => stop(open)}><Square size={22} /> Punch out</button>
          </>
        ) : (
          <>
            <label className="field" style={{ textAlign: 'left' }}>Job
              <select value={jobId} onChange={(e) => setJobId(e.target.value ? Number(e.target.value) : '')} aria-label="Job">
                <option value="">— Sans job précis —</option>
                {data.jobs.map((j) => <option key={j.id} value={j.id}>{j.time ? `${j.time} · ` : ''}{data.clients.get(j.clientId)?.name ?? 'Client'} — {j.title}</option>)}
              </select>
            </label>
            <button className="btn big block punch-btn" disabled={busy} onClick={start}><Play size={22} /> Punch in</button>
            <div className="small muted" style={{ marginTop: 8 }}><MapPin size={12} /> Ta position est enregistrée au début et à la fin.</div>
          </>
        )}
      </div>

      <div className="grid kpi" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card"><div className="label">Aujourd’hui</div><div className="value">{hm(todayH)}</div></div>
        <div className="card"><div className="label">Cette semaine</div><div className="value">{hm(weekH)}</div></div>
      </div>

      <div className="card">
        <h2><Timer size={17} style={{ verticalAlign: '-3px' }} /> Aujourd’hui</h2>
        {todayPunches.length === 0 ? <div className="small muted">Aucun pointage aujourd’hui.</div> : (
          <table className="list"><tbody>
            {todayPunches.map((p) => {
              const j = p.jobId ? data.jobs.find((x) => x.id === p.jobId) : undefined;
              return (
                <tr key={p.id}>
                  <td>{time(p.start)} → {p.end ? time(p.end) : '…'}<div className="small muted">{j ? data.clients.get(j.clientId)?.name : 'Sans job'}{p.breakMin ? ` · pause ${p.breakMin} min` : ''}</div></td>
                  <td className="num">{hm(hoursOf(p))}</td>
                </tr>
              );
            })}
          </tbody></table>
        )}
        {(st.role === 'owner' || st.role === 'admin') && <Link className="btn small" style={{ marginTop: 10 }} to="/temps">Feuilles de temps de l’équipe</Link>}
      </div>
    </div>
  );
}
