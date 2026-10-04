import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDown, ArrowUp, Bell, CalendarDays, Check, ChevronLeft, ChevronRight, FileText, MapPin, Navigation, Plus, Repeat, Route, Shuffle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ReminderModal } from '../components/ReminderModal';
import { errMsg, useToast } from '../components/Toast';
import { completeJob, dayRouteLink, ensureDayRoute, JOB_STATUS_LABEL, jobToInvoice, optimizeDay, syncDayRoute } from '../lib/agenda';
import { db, type Job } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { useSyncState } from '../lib/sync';
import { addDays, formatDate, km, lineAmount, money, todayISO, toISODate } from '../lib/utils';

const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function monthGrid(month: string): string[] {
  const first = new Date(month + '-01T12:00:00');
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const start = addDays(toISODate(first), -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const jobTotal = (j: Job) => j.items.reduce((a, it) => a + lineAmount(it), 0);

export default function Agenda() {
  const nav = useNavigate();
  const notify = useToast();
  const s = useSettings();
  const st = useSyncState();
  const isEmp = st.role === 'employe';
  const showMoney = !isEmp;
  const [params, setParams] = useSearchParams();
  const sel = params.get('d') || todayISO();
  const [month, setMonth] = useState(sel.slice(0, 7));
  const [remind, setRemind] = useState<Job | null>(null);
  const [busy, setBusy] = useState('');
  const today = todayISO();

  const days = useMemo(() => monthGrid(month), [month]);
  const data = useLiveQuery(async () => {
    const [jobs, clients, trips] = await Promise.all([
      db.jobs.where('date').between(days[0], days[41], true, true).toArray(),
      db.clients.toArray(),
      db.trips.where('routeDate').equals(sel).toArray(),
    ]);
    const tomorrow = addDays(today, 1);
    const toRemind = (await db.jobs.where('date').between(today, tomorrow, true, true).toArray()).filter((j) => j.status === 'planifie' && !j.remindedAt);
    return { jobs, clients: new Map(clients.map((c) => [c.id!, c])), trips, toRemind };
  }, [days, sel]);

  useEffect(() => {
    if (st.role === 'owner' || st.role === 'admin') void ensureDayRoute(sel);
  }, [sel, st.role]);

  const select = (d: string) => {
    setParams({ d }, { replace: true });
    if (d.slice(0, 7) !== month) setMonth(d.slice(0, 7));
  };
  const shiftMonth = (n: number) => {
    const d = new Date(month + '-01T12:00:00');
    d.setMonth(d.getMonth() + n);
    setMonth(toISODate(d).slice(0, 7));
  };

  if (!data) return null;
  const byDay = new Map<string, Job[]>();
  data.jobs.filter((j) => j.status !== 'annule' && (!isEmp || j.assignees?.includes(st.memberId!))).forEach((j) => byDay.set(j.date, [...(byDay.get(j.date) ?? []), j]));
  const dayJobs = (byDay.get(sel) ?? []).sort((a, b) => a.order - b.order);
  const legs = [...data.trips].sort((a, b) => a.id! - b.id!);
  const dayKm = legs.reduce((a, t) => a + t.totalKm, 0);
  const dayTotal = dayJobs.reduce((a, j) => a + jobTotal(j), 0);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy('');
    }
  };

  const move = (i: number, d: -1 | 1) =>
    run('Ordre', async () => {
      const list = [...dayJobs];
      const j = i + d;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      await Promise.all(list.map((x, k) => db.jobs.update(x.id!, { order: k })));
      if (list.some((x) => x.status !== 'planifie')) await syncDayRoute(sel);
    });

  const done = (j: Job) =>
    run('Fait', async () => {
      const r = await completeJob(j.id!, !isEmp && st.role !== 'vendeur');
      const kmTxt = r.trips.length ? ` · route du jour ${km(r.trips.reduce((a, t) => a + t.totalKm, 0))}` : '';
      notify(`Job terminé${kmTxt}${r.next ? ` · prochain le ${formatDate(r.next.date)}` : ''}`);
    });

  const invoice = (j: Job) =>
    run('Facture', async () => {
      const id = await jobToInvoice(j.id!);
      nav(`/doc/${id}`);
    });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><CalendarDays size={14} /> {new Date(month + '-01T12:00:00').toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' })}</div>
          <h1>Agenda</h1>
        </div>
        <div className="actions">
          <button className="btn icon-btn" onClick={() => shiftMonth(-1)} aria-label="Mois précédent"><ChevronLeft size={18} /></button>
          <button className="btn" onClick={() => select(today)}>Aujourd’hui</button>
          <button className="btn icon-btn" onClick={() => shiftMonth(1)} aria-label="Mois suivant"><ChevronRight size={18} /></button>
          {!isEmp && <button className="btn accent" onClick={() => nav(`/job/new?d=${sel}`)}><Plus size={17} /> Job</button>}
        </div>
      </div>

      {data.toRemind.length > 0 && (
        <div className="notice row">
          <Bell size={16} />
          <span><strong>{data.toRemind.length}</strong> client{data.toRemind.length > 1 ? 's' : ''} à rappeler pour aujourd’hui ou demain:</span>
          {data.toRemind.slice(0, 4).map((j) => (
            <button key={j.id} className="btn small" onClick={() => setRemind(j)}>{data.clients.get(j.clientId)?.name ?? 'Client'}</button>
          ))}
        </div>
      )}

      <div className="grid two" style={{ alignItems: 'start' }}>
        <div className="card" style={{ padding: 10 }}>
          <div className="cal">
            {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
            {days.map((d) => {
              const list = (byDay.get(d) ?? []).sort((a, b) => a.order - b.order);
              return (
                <button
                  key={d}
                  className={`day ${d.slice(0, 7) !== month ? 'out' : ''} ${d === today ? 'today' : ''} ${d === sel ? 'sel' : ''}`}
                  onClick={() => select(d)}
                  aria-label={`${formatDate(d)}: ${list.length} job(s)`}
                >
                  <span className="dnum">{Number(d.slice(8))}</span>
                  <span className="chips-row">
                    {list.slice(0, 2).map((j) => (
                      <span key={j.id} className={`chip ${j.status}`}>{data.clients.get(j.clientId)?.name ?? j.title}</span>
                    ))}
                    {list.length > 2 && <span className="more">+{list.length - 2}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2 style={{ marginBottom: 2 }}>{new Date(sel + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
              <div className="small muted">
                {dayJobs.length} job{dayJobs.length > 1 ? 's' : ''}{showMoney && dayTotal ? ` · ${money(dayTotal)} prévus` : ''}{dayKm ? ` · ${km(dayKm)} de route` : ''}
              </div>
            </div>
          </div>
          {dayJobs.length > 0 && (
            <div className="row" style={{ marginBottom: 12 }}>
              <button className="btn small" disabled={!!busy || dayJobs.length < 2} onClick={() => run('Optimiser', async () => { await optimizeDay(sel); notify(dayJobs.some((x) => x.time) ? 'Ordre optimisé (les jobs avec une heure gardent leur heure)' : 'Ordre optimisé (trajet le plus court)'); })}><Shuffle size={15} /> Optimiser l’ordre</button>
              <button className="btn small" onClick={() => run('Route', async () => { const l = await dayRouteLink(sel); if (l) window.open(l, '_blank'); else notify('Ajoute des adresses aux jobs.', 'err'); })}><Navigation size={15} /> Route dans Google Maps</button>
            </div>
          )}
          {dayJobs.length === 0 ? (
            <div className="empty">
              <CalendarDays size={34} />
              <div>Rien de prévu ce jour-là.</div>
              <button className="btn accent" onClick={() => nav(`/job/new?d=${sel}`)}><Plus size={16} /> Planifier un job</button>
            </div>
          ) : (
            <div>
              {dayJobs.map((j, i) => {
                const c = data.clients.get(j.clientId);
                const leg = legs.find((t) => t.jobId === j.id);
                return (
                  <div key={j.id}>
                    {leg && <div className="leg"><Route size={13} /> {km(leg.totalKm)}{leg.durationMin ? ` · ${leg.durationMin} min` : ''}</div>}
                    <div className={`job-card ${j.status}`}>
                      <div className="stop">{j.status === 'planifie' ? i + 1 : <Check size={16} />}</div>
                      <div className="body">
                        <div className="row" style={{ gap: 6 }}>
                          <Link to={`/job/${j.id}`} className="title" style={{ color: 'var(--ink)' }}>{c?.name ?? 'Client'}</Link>
                          {j.time && <span className="badge gray">{j.time}</span>}
                          <span className={`badge ${j.status === 'planifie' ? 'blue' : j.status === 'fait' ? 'green' : 'gray'}`}>{JOB_STATUS_LABEL[j.status]}</span>
                          {j.recurrence !== 'none' && <Repeat size={14} className="muted" aria-label="Récurrent" />}
                          {j.remindedAt && <Bell size={14} className="muted" aria-label="Rappel envoyé" />}
                        </div>
                        <div className="small">{j.title}{showMoney && jobTotal(j) ? ` · ${money(jobTotal(j))}` : ''}</div>
                        {(j.address || c?.address) && <div className="small muted row" style={{ gap: 4 }}><MapPin size={13} /> {j.address || c?.address}</div>}
                        <div className="row" style={{ marginTop: 8, gap: 6 }}>
                          {j.status === 'planifie' && <button className="btn small accent" disabled={!!busy} onClick={() => done(j)}><Check size={15} /> Fait</button>}
                          {isEmp ? null : j.docId ? (
                            <Link className="btn small" to={`/doc/${j.docId}`}><FileText size={15} /> Facture</Link>
                          ) : (
                            <button className="btn small" disabled={!!busy} onClick={() => invoice(j)}><FileText size={15} /> Facturer</button>
                          )}
                          {j.status === 'planifie' && <button className="btn small" onClick={() => setRemind(j)}><Bell size={15} /> Rappel</button>}
                          <span className="spacer" />
                          <button className="btn small icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter"><ArrowUp size={15} /></button>
                          <button className="btn small icon-btn" onClick={() => move(i, 1)} disabled={i === dayJobs.length - 1} aria-label="Descendre"><ArrowDown size={15} /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {legs.length > 0 && legs[legs.length - 1].reason.startsWith('Retour') && (
                <div className="leg"><Route size={13} /> Retour au domicile: {km(legs[legs.length - 1].totalKm)}</div>
              )}
              <p className="small muted" style={{ marginTop: 12 }}>
                Quand tu marques un job « Fait », la route de la journée (domicile → jobs → domicile) s’inscrit toute seule au <Link to="/km">journal de bord</Link>.
                {!s.homeAddress && ' Ajoute ton adresse de domicile dans Paramètres.'}
              </p>
            </div>
          )}
        </div>
      </div>
      {remind && <ReminderModal job={remind} client={data.clients.get(remind.clientId)} onClose={() => setRemind(null)} />}
    </>
  );
}
