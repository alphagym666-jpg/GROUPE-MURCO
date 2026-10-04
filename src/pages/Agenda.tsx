import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle, ArrowDown, ArrowUp, Bell, CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, Cloud, CloudDrizzle, CloudFog, CloudLightning,
  CloudRain, CloudSnow, CloudSun, FileText, Inbox, MapPin, Navigation, Phone, Plus, Repeat, Route, Search, Shuffle, Sun, Users, type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { JobDoneSheet } from '../components/JobDoneSheet';
import { Modal } from '../components/Modal';
import { ReminderModal } from '../components/ReminderModal';
import { errMsg, useToast } from '../components/Toast';
import { completeJob, dayRouteLink, ensureDayRoute, JOB_STATUS_LABEL, jobToInvoice, optimizeDay, syncDayRoute } from '../lib/agenda';
import { OPEN_STAGES } from '../lib/crm';
import { db, saveSettings, type Client, type Job, type Lead, type Member } from '../lib/db';
import { geocode } from '../lib/geo';
import { useSettings } from '../lib/hooks';
import { weekStart } from '../lib/punch';
import { useSyncState } from '../lib/sync';
import { MEMBER_COLORS } from '../lib/team';
import { addDays, formatDate, km, lineAmount, money, todayISO, toISODate } from '../lib/utils';
import { badWeather, useWeather, WEATHER_LABEL, weatherKind, type DayWeather, type WeatherKind } from '../lib/weather';

type View = 'jour' | 'semaine' | 'mois' | 'liste';
const VIEWS: { key: View; label: string }[] = [
  { key: 'jour', label: 'Jour' },
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois', label: 'Mois' },
  { key: 'liste', label: 'Liste' },
];
const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const H_START = 6; // grille horaire: 6 h à 21 h
const H_END = 21;
const HOUR_PX = 52;
const OWNER_COLOR = '#e0922f';
const VIEW_KEY = 'murco.agendaView';

const WEATHER_ICON: Record<WeatherKind, LucideIcon> = {
  soleil: Sun, nuageux: CloudSun, couvert: Cloud, brouillard: CloudFog, bruine: CloudDrizzle, pluie: CloudRain, neige: CloudSnow, orage: CloudLightning,
};

function monthGrid(month: string): string[] {
  const first = new Date(month + '-01T12:00:00');
  const offset = (first.getDay() + 6) % 7; // lundi = 0
  const start = addDays(toISODate(first), -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

const jobTotal = (j: Job) => j.items.reduce((a, it) => a + lineAmount(it), 0);
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(d + 'T12:00:00').toLocaleDateString('fr-CA', opts);
const hoursTxt = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`;

/** Jobs avec une heure qui se chevauchent pour une même personne (ou toi, si non assigné). */
function conflicts(list: Job[]): Set<number> {
  const out = new Set<number>();
  const timed = list.filter((j) => j.time && j.status !== 'annule');
  for (let i = 0; i < timed.length; i++) {
    for (let k = i + 1; k < timed.length; k++) {
      const a = timed[i];
      const b = timed[k];
      const pa = a.assignees?.length ? a.assignees : [0];
      const pb = b.assignees?.length ? b.assignees : [0];
      if (!pa.some((p) => pb.includes(p))) continue;
      const a0 = toMin(a.time);
      const b0 = toMin(b.time);
      if (a0 < b0 + (b.durationMin || 60) && b0 < a0 + (a.durationMin || 60)) {
        out.add(a.id!);
        out.add(b.id!);
      }
    }
  }
  return out;
}

export default function Agenda() {
  const nav = useNavigate();
  const notify = useToast();
  const s = useSettings();
  const st = useSyncState();
  const isEmp = st.role === 'employe';
  const canEdit = !isEmp;
  const showMoney = !isEmp;
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const sel = params.get('d') || today;
  const view: View = (params.get('v') as View) || (() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as View) || (matchMedia('(max-width: 860px)').matches ? 'jour' : 'semaine');
    } catch {
      return 'jour';
    }
  })();
  const [who, setWho] = useState<string>('tous'); // tous | moi | <memberId>
  const [showDone, setShowDone] = useState(true);
  const [showLeads, setShowLeads] = useState(true);
  const [q, setQ] = useState('');
  const [remind, setRemind] = useState<Job | null>(null);
  const [postpone, setPostpone] = useState<{ jobs: Job[]; label: string } | null>(null);
  const [busy, setBusy] = useState('');
  const weather = useWeather(s.homeGeo);

  // Position du domicile pour la météo (une seule fois)
  useEffect(() => {
    if (!s.homeGeo && s.homeAddress) geocode(s.homeAddress).then((r) => r && saveSettings({ homeGeo: r.geo })).catch(() => undefined);
  }, [s.homeGeo, s.homeAddress]);

  const range = useMemo((): [string, string] => {
    if (view === 'jour') return [sel, sel];
    if (view === 'semaine') {
      const w = weekStart(sel);
      return [w, addDays(w, 6)];
    }
    if (view === 'mois') {
      const g = monthGrid(sel.slice(0, 7));
      return [g[0], g[41]];
    }
    return [sel, addDays(sel, 59)];
  }, [view, sel]);

  const data = useLiveQuery(async () => {
    const [jobs, clients, members, trips, leads] = await Promise.all([
      db.jobs.where('date').between(range[0], range[1], true, true).toArray(),
      db.clients.toArray(),
      db.members.toArray(),
      db.trips.where('routeDate').equals(sel).toArray(),
      isEmp || (range[0] < today ? today : range[0]) > range[1]
        ? Promise.resolve([] as Lead[])
        : db.leads.where('nextAction').between(range[0] < today ? today : range[0], range[1], true, true).toArray().catch(() => [] as Lead[]),
    ]);
    const tomorrow = addDays(today, 1);
    const toRemind = canEdit ? (await db.jobs.where('date').between(today, tomorrow, true, true).toArray()).filter((j) => j.status === 'planifie' && !j.remindedAt) : [];
    return {
      jobs,
      clients: new Map(clients.map((c) => [c.id!, c])),
      members: new Map(members.map((m) => [m.id!, m])),
      memberList: members.filter((m) => m.active),
      trips,
      leads: leads.filter((l) => OPEN_STAGES.includes(l.stage)),
      toRemind,
    };
  }, [range[0], range[1], sel, isEmp]);

  useEffect(() => {
    if (st.role === 'owner' || st.role === 'admin') void ensureDayRoute(sel);
  }, [sel, st.role]);

  const go = (d: string, v: View = view) => {
    setParams({ d, v }, { replace: true });
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const shift = (n: number) => {
    if (view === 'jour') go(addDays(sel, n));
    else if (view === 'semaine') go(addDays(sel, 7 * n));
    else if (view === 'liste') go(addDays(sel, 30 * n));
    else {
      const d = new Date(sel.slice(0, 7) + '-01T12:00:00');
      d.setMonth(d.getMonth() + n);
      go(toISODate(d));
    }
  };

  if (!data) return null;

  const memberColor = (m?: Member) => (!m ? OWNER_COLOR : m.color === '#e0901f' ? MEMBER_COLORS[m.id! % MEMBER_COLORS.length] : m.color); // ancien orange = couleur du patron
  const colorOf = (j: Job) => (j.assignees?.length ? memberColor(data.members.get(j.assignees[0])) : OWNER_COLOR);
  const ql = q.trim().toLowerCase();
  const visible = data.jobs.filter((j) => {
    if (j.status === 'annule') return false;
    if (isEmp && !j.assignees?.includes(st.memberId!)) return false;
    if (!showDone && j.status !== 'planifie') return false;
    if (who === 'moi' && j.assignees?.length) return false; // « Moi » = jobs sans employé assigné
    if (/^\d+$/.test(who) && !j.assignees?.includes(Number(who))) return false;
    if (ql) {
      const c = data.clients.get(j.clientId);
      if (![c?.name, j.title, j.address, c?.address, c?.phone].some((x) => x?.toLowerCase().includes(ql))) return false;
    }
    return true;
  });
  const byDay = new Map<string, Job[]>();
  visible.forEach((j) => byDay.set(j.date, [...(byDay.get(j.date) ?? []), j]));
  const sortDay = (list: Job[]) => [...list].sort((a, b) => (a.time && b.time ? toMin(a.time) - toMin(b.time) : a.time ? -1 : b.time ? 1 : a.order - b.order));
  const leadsOn = (d: string) => (showLeads ? data.leads.filter((l) => l.nextAction === d) : []);
  const conflictIds = new Set<number>();
  byDay.forEach((list) => conflicts(list).forEach((id) => conflictIds.add(id)));

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

  /** Glisser-déposer (ordi): déplacer un job à une autre journée / heure. */
  const onDrop = (e: DragEvent, date: string, time?: string) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('text/job'));
    if (!id || !canEdit) return;
    void run('Déplacer', async () => {
      const j = await db.jobs.get(id);
      if (!j || j.status !== 'planifie') return;
      const from = j.date;
      await db.jobs.update(id, { date, ...(time !== undefined ? { time } : {}), remindedAt: date === from ? j.remindedAt : undefined });
      if (from !== date) await syncDayRoute(from);
      notify(`Job déplacé au ${formatDate(date)}${time ? ` à ${time}` : ''}`);
    });
  };
  const dropProps = (date: string, time?: string) =>
    canEdit ? { onDragOver: (e: DragEvent) => e.preventDefault(), onDrop: (e: DragEvent) => onDrop(e, date, time) } : {};
  const dragProps = (j: Job) =>
    canEdit && j.status === 'planifie' ? { draggable: true, onDragStart: (e: DragEvent) => e.dataTransfer.setData('text/job', String(j.id)) } : {};

  // ---------- Résumé de la période ----------
  const inRange = visible.filter((j) => j.date >= range[0] && j.date <= range[1]);
  const planned = inRange.filter((j) => j.status === 'planifie');
  const periodMin = inRange.reduce((a, j) => a + (j.durationMin || 0), 0);
  const periodTotal = inRange.reduce((a, j) => a + jobTotal(j), 0);
  const unassigned = data.memberList.length ? planned.filter((j) => !j.assignees?.length).length : 0;

  const title =
    view === 'jour' ? dayLabel(sel) :
    view === 'semaine' ? `Semaine du ${dayLabel(range[0], { day: 'numeric', month: 'long' })}` :
    view === 'mois' ? new Date(sel.slice(0, 7) + '-01T12:00:00').toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' }) :
    `À partir du ${dayLabel(sel, { day: 'numeric', month: 'long' })}`;

  const ctx: Ctx = { data, colorOf, memberColor, conflictIds, weather, showMoney, canEdit, dragProps, dropProps, leadsOn, nav };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><CalendarDays size={14} /> Agenda</div>
          <h1 style={{ textTransform: 'capitalize' }}>{title}</h1>
        </div>
        <div className="actions">
          <button className="btn icon-btn" onClick={() => shift(-1)} aria-label="Précédent"><ChevronLeft size={18} /></button>
          <button className="btn" onClick={() => go(today)}>Aujourd’hui</button>
          <button className="btn icon-btn" onClick={() => shift(1)} aria-label="Suivant"><ChevronRight size={18} /></button>
          {canEdit && <button className="btn accent" onClick={() => nav(`/job/new?d=${sel}`)}><Plus size={17} /> Job</button>}
        </div>
      </div>

      <div className="ag-toolbar">
        <div className="seg ag-views" role="tablist">
          {VIEWS.map((v) => <button key={v.key} role="tab" aria-selected={view === v.key} className={view === v.key ? 'on' : ''} onClick={() => go(sel, v.key)}>{v.label}</button>)}
        </div>
        <label className="ag-date"><CalendarClock size={16} /><input type="date" value={sel} onChange={(e) => e.target.value && go(e.target.value)} aria-label="Aller à la date" /></label>
      </div>

      <div className="chips ag-filters">
        {!isEmp && data.memberList.length > 0 && (
          <>
            <button className={`chip-btn ${who === 'tous' ? 'on' : ''}`} onClick={() => setWho('tous')}><Users size={14} /> Tous</button>
            <button className={`chip-btn ${who === 'moi' ? 'on' : ''}`} onClick={() => setWho('moi')}><span className="dot" style={{ background: OWNER_COLOR }} /> Moi</button>
            {data.memberList.filter((m) => m.role !== 'vendeur').map((m) => (
              <button key={m.id} className={`chip-btn ${who === String(m.id) ? 'on' : ''}`} onClick={() => setWho(String(m.id))}><span className="dot" style={{ background: memberColor(m) }} /> {m.name.split(' ')[0]}</button>
            ))}
          </>
        )}
        <button className={`chip-btn ${!showDone ? 'on' : ''}`} onClick={() => setShowDone((x) => !x)}>{showDone ? 'Cacher les jobs faits' : 'Jobs faits cachés'}</button>
        {!isEmp && <button className={`chip-btn ${showLeads ? 'on' : ''}`} onClick={() => setShowLeads((x) => !x)}><Inbox size={14} /> Relances</button>}
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

      {view !== 'liste' && (
        <div className="ag-stats">
          <div><b>{inRange.length}</b><span>job{inRange.length > 1 ? 's' : ''}</span></div>
          <div><b>{hoursTxt(periodMin)}</b><span>prévues</span></div>
          {showMoney && <div><b>{money(periodTotal)}</b><span>de travaux</span></div>}
          {conflictIds.size > 0 && <div className="warn"><b><AlertTriangle size={15} /> {conflictIds.size}</b><span>en conflit</span></div>}
          {unassigned > 0 && <div className="warn"><b>{unassigned}</b><span>sans employé</span></div>}
        </div>
      )}

      {view === 'jour' && (
        <DayView ctx={ctx} date={sel} jobs={sortDay(byDay.get(sel) ?? [])} trips={data.trips} busy={busy} run={run} s={s}
          onRemind={setRemind} onPostpone={(jobs, label) => setPostpone({ jobs, label })} isEmp={isEmp} />
      )}
      {view === 'semaine' && <WeekView ctx={ctx} start={range[0]} byDay={byDay} sortDay={sortDay} today={today} onPick={(d) => go(d, 'jour')} />}
      {view === 'mois' && <MonthView ctx={ctx} month={sel.slice(0, 7)} sel={sel} today={today} byDay={byDay} sortDay={sortDay} onPick={(d) => go(d, 'jour')} />}
      {view === 'liste' && (
        <ListView ctx={ctx} from={sel} byDay={byDay} sortDay={sortDay} today={today} q={q} setQ={setQ} onPick={(d) => go(d, 'jour')} />
      )}

      {remind && <ReminderModal job={remind} client={data.clients.get(remind.clientId)} onClose={() => setRemind(null)} />}
      {postpone && <PostponeModal jobs={postpone.jobs} label={postpone.label} from={sel} weather={weather} onClose={() => setPostpone(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------

interface Ctx {
  data: { clients: Map<number, Client>; members: Map<number, Member>; memberList: Member[] };
  colorOf: (j: Job) => string;
  memberColor: (m?: Member) => string;
  conflictIds: Set<number>;
  weather: Record<string, DayWeather>;
  showMoney: boolean;
  canEdit: boolean;
  dragProps: (j: Job) => object;
  dropProps: (date: string, time?: string) => object;
  leadsOn: (d: string) => Lead[];
  nav: (to: string) => void;
}

function WeatherChip({ w, full = false }: { w?: DayWeather; full?: boolean }) {
  if (!w) return null;
  const k = weatherKind(w.code);
  const Icon = WEATHER_ICON[k];
  return (
    <span className={`wx ${badWeather(w) ? 'bad' : ''}`} title={`${WEATHER_LABEL[k]} · ${w.tmin}° / ${w.tmax}° · ${w.pop} % de précipitations`}>
      <Icon size={full ? 18 : 14} /> {w.tmax}°{full && <> / {w.tmin}° · {WEATHER_LABEL[k]}{w.pop ? ` · ${w.pop} %` : ''}</>}
    </span>
  );
}

function JobBlock({ ctx, j, style, compact = false }: { ctx: Ctx; j: Job; style?: CSSProperties; compact?: boolean }) {
  const c = ctx.data.clients.get(j.clientId);
  const who = (j.assignees ?? []).map((id) => ctx.data.members.get(id)?.name.split(' ')[0]).filter(Boolean).join(', ');
  return (
    <Link to={`/job/${j.id}`} className={`jb ${j.status} ${ctx.conflictIds.has(j.id!) ? 'conflict' : ''} ${compact ? 'compact' : ''}`}
      style={{ ...style, ['--c' as string]: ctx.colorOf(j) }} {...ctx.dragProps(j)}>
      <span className="jb-t">{j.time ? `${j.time} ` : ''}<strong>{c?.name ?? 'Client'}</strong></span>
      {!compact && <span className="jb-s">{j.title}{who ? ` · ${who}` : ''}{ctx.showMoney && jobTotal(j) ? ` · ${money(jobTotal(j))}` : ''}</span>}
      {ctx.conflictIds.has(j.id!) && <AlertTriangle size={12} className="jb-warn" aria-label="Conflit d’horaire" />}
    </Link>
  );
}

function LeadItem({ l }: { l: Lead }) {
  return (
    <Link to="/demandes" className="jb lead compact">
      <span className="jb-t"><Phone size={11} /> Relance <strong>{l.name}</strong></span>
    </Link>
  );
}

/** Grille horaire d'une ou plusieurs journées. */
function TimeGrid({ ctx, days, byDay, onPick, today }: { ctx: Ctx; days: string[]; byDay: Map<string, Job[]>; onPick?: (d: string) => void; today: string }) {
  const hours = Array.from({ length: H_END - H_START }, (_, i) => H_START + i);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  return (
    <div className="tg" style={{ ['--cols' as string]: days.length }}>
      <div className="tg-head">
        <div />
        {days.map((d) => (
          <button key={d} className={`tg-day ${d === today ? 'today' : ''}`} onClick={() => onPick?.(d)} disabled={!onPick}>
            <span>{dayLabel(d, { weekday: 'short' })}</span> <b>{Number(d.slice(8))}</b>
            <WeatherChip w={ctx.weather[d]} />
          </button>
        ))}
      </div>
      <div className="tg-allday">
        <div className="tg-lbl">Journée</div>
        {days.map((d) => (
          <div key={d} className="tg-cell" {...ctx.dropProps(d, '')}>
            {(byDay.get(d) ?? []).filter((j) => !j.time).map((j) => <JobBlock key={j.id} ctx={ctx} j={j} compact />)}
            {ctx.leadsOn(d).map((l) => <LeadItem key={l.id} l={l} />)}
          </div>
        ))}
      </div>
      <div className="tg-body" style={{ height: (H_END - H_START) * HOUR_PX }}>
        <div className="tg-hours">
          {hours.map((h) => <div key={h} style={{ height: HOUR_PX }}>{h} h</div>)}
        </div>
        {days.map((d) => {
          const timed = (byDay.get(d) ?? []).filter((j) => j.time);
          // colonnes côte à côte quand des jobs se chevauchent
          const lanes: number[] = [];
          const placed = timed
            .sort((a, b) => toMin(a.time) - toMin(b.time))
            .map((j) => {
              const start = toMin(j.time);
              const end = start + Math.max(30, j.durationMin || 60);
              let lane = lanes.findIndex((e) => e <= start);
              if (lane < 0) lane = lanes.push(end) - 1;
              else lanes[lane] = end;
              return { j, start, end, lane };
            });
          const n = Math.max(1, lanes.length);
          return (
            <div key={d} className={`tg-col ${d === today ? 'today' : ''}`}>
              {hours.map((h) => (
                <button key={h} className="tg-slot" style={{ height: HOUR_PX }} aria-label={`Nouveau job ${formatDate(d)} ${h} h`}
                  onClick={() => ctx.canEdit && ctx.nav(`/job/new?d=${d}&t=${fmtMin(h * 60)}`)} {...ctx.dropProps(d, fmtMin(h * 60))} />
              ))}
              {d === today && nowMin >= H_START * 60 && nowMin <= H_END * 60 && <div className="tg-now" style={{ top: ((nowMin - H_START * 60) / 60) * HOUR_PX }} />}
              {placed.map(({ j, start, end, lane }) => (
                <JobBlock key={j.id} ctx={ctx} j={j} style={{
                  position: 'absolute',
                  top: (Math.max(start - H_START * 60, 0) / 60) * HOUR_PX,
                  height: Math.max(26, ((Math.min(end, H_END * 60) - Math.max(start, H_START * 60)) / 60) * HOUR_PX - 2),
                  left: `calc(${(lane / n) * 100}% + 2px)`,
                  width: `calc(${100 / n}% - 4px)`,
                }} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({ ctx, date, jobs, trips, busy, run, s, onRemind, onPostpone, isEmp }: {
  ctx: Ctx; date: string; jobs: Job[]; trips: { id?: number; jobId?: number; totalKm: number; durationMin?: number; reason: string }[];
  busy: string; run: (l: string, fn: () => Promise<void>) => Promise<void>; s: { homeAddress: string };
  onRemind: (j: Job) => void; onPostpone: (jobs: Job[], label: string) => void; isEmp: boolean;
}) {
  const notify = useToast();
  const routeJobs = [...jobs].sort((a, b) => a.order - b.order);
  const legs = [...trips].sort((a, b) => a.id! - b.id!);
  const dayKm = legs.reduce((a, t) => a + t.totalKm, 0);
  const w = ctx.weather[date];
  const planned = jobs.filter((j) => j.status === 'planifie');
  const leads = ctx.leadsOn(date);

  const move = (i: number, d: -1 | 1) =>
    run('Ordre', async () => {
      const list = [...routeJobs];
      const k = i + d;
      if (k < 0 || k >= list.length) return;
      [list[i], list[k]] = [list[k], list[i]];
      await Promise.all(list.map((x, n) => db.jobs.update(x.id!, { order: n })));
      if (list.some((x) => x.status !== 'planifie')) await syncDayRoute(date);
    });
  const [doneJob, setDoneJob] = useState<{ job: Job; km: number } | null>(null);
  const done = (j: Job) =>
    run('Fait', async () => {
      const r = await completeJob(j.id!, ctx.canEdit);
      const routeKm = r.trips.reduce((a, t) => a + t.totalKm, 0);
      if (r.next) notify(`Job terminé · prochain planifié le ${formatDate(r.next.date)}`);
      setDoneJob({ job: { ...j, status: 'fait' }, km: routeKm });
    });
  const invoice = (j: Job) =>
    run('Facture', async () => {
      ctx.nav(`/doc/${await jobToInvoice(j.id!)}`);
    });

  return (
    <div className="grid two ag-day" style={{ alignItems: 'start' }}>
      {doneJob && <JobDoneSheet job={doneJob.job} client={ctx.data.clients.get(doneJob.job.clientId)} canBill={ctx.showMoney} routeKm={doneJob.km} onClose={() => setDoneJob(null)} />}
      <div className="card" style={{ padding: 10 }}>
        {w && (
          <div className={`wx-banner ${badWeather(w) ? 'bad' : ''}`}>
            <WeatherChip w={w} full />
            {badWeather(w) && planned.length > 0 && ctx.canEdit && (
              <button className="btn small" onClick={() => onPostpone(planned, `les ${planned.length} job${planned.length > 1 ? 's' : ''} du ${formatDate(date)}`)}><CalendarClock size={14} /> Reporter la journée</button>
            )}
          </div>
        )}
        <TimeGrid ctx={ctx} days={[date]} byDay={new Map([[date, jobs]])} today={todayISO()} />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2 style={{ marginBottom: 2 }}>Route du jour</h2>
            <div className="small muted">{jobs.length} job{jobs.length > 1 ? 's' : ''}{dayKm ? ` · ${km(dayKm)} de route` : ''}{leads.length ? ` · ${leads.length} relance${leads.length > 1 ? 's' : ''}` : ''}</div>
          </div>
          {ctx.canEdit && planned.length > 0 && (
            <button className="btn small" onClick={() => onPostpone(planned, `les ${planned.length} job${planned.length > 1 ? 's' : ''} du ${formatDate(date)}`)}><CalendarClock size={14} /> Reporter</button>
          )}
        </div>
        {jobs.length > 1 && (
          <div className="row" style={{ marginBottom: 12 }}>
            {ctx.canEdit && <button className="btn small" disabled={!!busy} onClick={() => run('Optimiser', async () => { await optimizeDay(date); notify(jobs.some((x) => x.time) ? 'Ordre optimisé (les jobs avec une heure gardent leur heure)' : 'Ordre optimisé (trajet le plus court)'); })}><Shuffle size={15} /> Optimiser l’ordre</button>}
            <button className="btn small" onClick={() => run('Route', async () => { const l = await dayRouteLink(date); if (l) window.open(l, '_blank'); else notify('Ajoute des adresses aux jobs.', 'err'); })}><Navigation size={15} /> Route dans Google Maps</button>
          </div>
        )}
        {leads.map((l) => (
          <div key={l.id} className="job-card lead">
            <div className="stop"><Phone size={15} /></div>
            <div className="body">
              <div className="title">Relancer {l.name}</div>
              <div className="small muted">{l.service || 'Demande'}{l.phone ? ` · ${l.phone}` : ''}</div>
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                {l.phone && <a className="btn small" href={`tel:${l.phone}`}><Phone size={14} /> Appeler</a>}
                <Link className="btn small" to="/demandes">Ouvrir la demande</Link>
              </div>
            </div>
          </div>
        ))}
        {jobs.length === 0 ? (
          <div className="empty">
            <CalendarDays size={34} />
            <div>Rien de prévu ce jour-là.</div>
            {ctx.canEdit && <button className="btn accent" onClick={() => ctx.nav(`/job/new?d=${date}`)}><Plus size={16} /> Planifier un job</button>}
          </div>
        ) : (
          <div>
            {routeJobs.map((j, i) => {
              const c = ctx.data.clients.get(j.clientId);
              const leg = legs.find((t) => t.jobId === j.id);
              const who = (j.assignees ?? []).map((id) => ctx.data.members.get(id)).filter(Boolean) as Member[];
              return (
                <div key={j.id}>
                  {leg && <div className="leg"><Route size={13} /> {km(leg.totalKm)}{leg.durationMin ? ` · ${leg.durationMin} min` : ''}</div>}
                  <div className={`job-card ${j.status}`} style={{ ['--c' as string]: ctx.colorOf(j) }}>
                    <div className="stop">{j.status === 'planifie' ? i + 1 : <Check size={16} />}</div>
                    <div className="body">
                      <div className="row" style={{ gap: 6 }}>
                        <Link to={`/job/${j.id}`} className="title" style={{ color: 'var(--ink)' }}>{c?.name ?? 'Client'}</Link>
                        {j.time && <span className="badge gray">{j.time}{j.durationMin ? ` · ${hoursTxt(j.durationMin)}` : ''}</span>}
                        <span className={`badge ${j.status === 'planifie' ? 'blue' : j.status === 'fait' ? 'green' : 'gray'}`}>{JOB_STATUS_LABEL[j.status]}</span>
                        {ctx.conflictIds.has(j.id!) && <span className="badge red"><AlertTriangle size={11} /> Conflit</span>}
                        {j.recurrence !== 'none' && <Repeat size={14} className="muted" aria-label="Récurrent" />}
                        {j.remindedAt && <Bell size={14} className="muted" aria-label="Rappel envoyé" />}
                      </div>
                      <div className="small">{j.title}{ctx.showMoney && jobTotal(j) ? ` · ${money(jobTotal(j))}` : ''}</div>
                      {(j.address || c?.address) && <div className="small muted row" style={{ gap: 4 }}><MapPin size={13} /> {j.address || c?.address}</div>}
                      {who.length > 0 && <div className="small row" style={{ gap: 6, marginTop: 2 }}>{who.map((m) => <span key={m.id} className="who"><span className="dot" style={{ background: ctx.memberColor(m) }} /> {m.name.split(' ')[0]}</span>)}</div>}
                      <div className="row" style={{ marginTop: 8, gap: 6 }}>
                        {j.status === 'planifie' && <button className="btn small accent" disabled={!!busy} onClick={() => done(j)}><Check size={15} /> Fait</button>}
                        {(j.address || c?.address) && <a className="btn small" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(j.address || c?.address || '')}`} target="_blank" rel="noreferrer"><Navigation size={15} /> Y aller</a>}
                        {!isEmp && (j.docId ? (
                          <Link className="btn small" to={`/doc/${j.docId}`}><FileText size={15} /> Facture</Link>
                        ) : (
                          <button className="btn small" disabled={!!busy} onClick={() => invoice(j)}><FileText size={15} /> Facturer</button>
                        ))}
                        {ctx.canEdit && j.status === 'planifie' && <button className="btn small" onClick={() => onRemind(j)}><Bell size={15} /> Rappel</button>}
                        {ctx.canEdit && j.status === 'planifie' && <button className="btn small" onClick={() => onPostpone([j], c?.name ?? 'ce job')}><CalendarClock size={15} /> Reporter</button>}
                        {ctx.canEdit && (
                          <>
                            <span className="spacer" />
                            <button className="btn small icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter"><ArrowUp size={15} /></button>
                            <button className="btn small icon-btn" onClick={() => move(i, 1)} disabled={i === routeJobs.length - 1} aria-label="Descendre"><ArrowDown size={15} /></button>
                          </>
                        )}
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
  );
}

function WeekView({ ctx, start, byDay, sortDay, today, onPick }: { ctx: Ctx; start: string; byDay: Map<string, Job[]>; sortDay: (l: Job[]) => Job[]; today: string; onPick: (d: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <>
      {/* Ordi: grille horaire de la semaine (glisser un job pour le déplacer) */}
      <div className="card hide-mobile" style={{ padding: 10 }}>
        <TimeGrid ctx={ctx} days={days} byDay={byDay} onPick={onPick} today={today} />
        {ctx.canEdit && <div className="small muted" style={{ marginTop: 8 }}>Glisse un job pour le changer de journée ou d’heure. Clique une case vide pour planifier un job à cette heure.</div>}
      </div>
      {/* Cellulaire: une ligne par journée */}
      <div className="week-list hide-desktop">
        {days.map((d) => {
          const list = sortDay(byDay.get(d) ?? []);
          const leads = ctx.leadsOn(d);
          const min = list.reduce((a, j) => a + (j.durationMin || 0), 0);
          return (
            <div key={d} className={`wl-day ${d === today ? 'today' : ''}`}>
              <button className="wl-head" onClick={() => onPick(d)}>
                <span className="wl-date"><b>{Number(d.slice(8))}</b><span>{dayLabel(d, { weekday: 'short' })}</span></span>
                <span className="wl-sum">{list.length ? `${list.length} job${list.length > 1 ? 's' : ''} · ${hoursTxt(min)}` : 'Libre'}</span>
                <WeatherChip w={ctx.weather[d]} />
                <ChevronRight size={16} className="muted" />
              </button>
              {(list.length > 0 || leads.length > 0) && (
                <div className="wl-items">
                  {list.map((j) => <JobBlock key={j.id} ctx={ctx} j={j} />)}
                  {leads.map((l) => <LeadItem key={l.id} l={l} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function MonthView({ ctx, month, sel, today, byDay, sortDay, onPick }: { ctx: Ctx; month: string; sel: string; today: string; byDay: Map<string, Job[]>; sortDay: (l: Job[]) => Job[]; onPick: (d: string) => void }) {
  const days = monthGrid(month);
  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="cal">
        {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
        {days.map((d) => {
          const list = sortDay(byDay.get(d) ?? []);
          const leads = ctx.leadsOn(d);
          const w = ctx.weather[d];
          return (
            <div key={d} role="button" tabIndex={0}
              className={`day ${d.slice(0, 7) !== month ? 'out' : ''} ${d === today ? 'today' : ''} ${d === sel ? 'sel' : ''}`}
              onClick={() => onPick(d)} onKeyDown={(e) => e.key === 'Enter' && onPick(d)}
              aria-label={`${formatDate(d)}: ${list.length} job(s)`} {...ctx.dropProps(d)}>
              <span className="day-top"><span className="dnum">{Number(d.slice(8))}</span>{w && <span className={`wx-mini ${badWeather(w) ? 'bad' : ''}`}>{(() => { const I = WEATHER_ICON[weatherKind(w.code)]; return <I size={12} />; })()}</span>}</span>
              <span className="chips-row">
                {list.slice(0, 3).map((j) => (
                  <span key={j.id} className={`chip ${j.status} ${ctx.conflictIds.has(j.id!) ? 'conflict' : ''}`} style={{ ['--c' as string]: ctx.colorOf(j) }}
                    onClick={(e) => { e.stopPropagation(); ctx.nav(`/job/${j.id}`); }} {...ctx.dragProps(j)}>
                    {j.time ? `${j.time} ` : ''}{ctx.data.clients.get(j.clientId)?.name ?? j.title}
                  </span>
                ))}
                {leads.length > 0 && <span className="chip lead">{leads.length} relance{leads.length > 1 ? 's' : ''}</span>}
                {list.length > 3 && <span className="more">+{list.length - 3}</span>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="cal-legend small muted">
        <span><span className="dot" style={{ background: OWNER_COLOR }} /> Toi</span>
        {ctx.data.memberList.filter((m) => m.role !== 'vendeur').map((m) => <span key={m.id}><span className="dot" style={{ background: ctx.memberColor(m) }} /> {m.name.split(' ')[0]}</span>)}
        {ctx.canEdit && <span className="hide-mobile">· Glisse un job sur une autre journée pour le déplacer</span>}
      </div>
    </div>
  );
}

function ListView({ ctx, from, byDay, sortDay, today, q, setQ, onPick }: {
  ctx: Ctx; from: string; byDay: Map<string, Job[]>; sortDay: (l: Job[]) => Job[]; today: string; q: string; setQ: (v: string) => void; onPick: (d: string) => void;
}) {
  const days = Array.from({ length: 60 }, (_, i) => addDays(from, i)).filter((d) => (byDay.get(d)?.length ?? 0) > 0 || ctx.leadsOn(d).length > 0);
  return (
    <div className="card">
      <label className="row ag-search"><Search size={16} className="muted" /><input placeholder="Chercher un client, une adresse, un job…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {days.length === 0 ? (
        <div className="empty"><CalendarDays size={34} /> Rien de prévu dans les 60 prochains jours{q ? ' pour cette recherche' : ''}.</div>
      ) : days.map((d) => {
        const list = sortDay(byDay.get(d) ?? []);
        return (
          <div key={d} className="al-day">
            <button className={`al-head ${d === today ? 'today' : ''}`} onClick={() => onPick(d)}>
              <span style={{ textTransform: 'capitalize' }}>{dayLabel(d)}</span>
              <WeatherChip w={ctx.weather[d]} />
            </button>
            {list.map((j) => <JobBlock key={j.id} ctx={ctx} j={j} />)}
            {ctx.leadsOn(d).map((l) => <LeadItem key={l.id} l={l} />)}
          </div>
        );
      })}
    </div>
  );
}

/** Reporter un job ou toute la journée (pluie, imprévu). */
function PostponeModal({ jobs, label, from, weather, onClose }: { jobs: Job[]; label: string; from: string; weather: Record<string, DayWeather>; onClose: () => void }) {
  const notify = useToast();
  const [date, setDate] = useState(addDays(from, 1));
  const [time, setTime] = useState(jobs.length === 1 ? jobs[0].time : '');
  const nextMonday = addDays(weekStart(from), 7);
  // Prochaine journée de semaine sans mauvais temps prévu
  const nextGood = (() => {
    for (let i = 1; i <= 14; i++) {
      const d = addDays(from, i);
      const dow = new Date(d + 'T12:00:00').getDay();
      if (dow !== 0 && dow !== 6 && weather[d] && !badWeather(weather[d])) return d;
    }
    return null;
  })();
  const options: [string, string][] = [[addDays(from, 1), 'Demain'], [nextMonday, 'Lundi prochain'], [addDays(from, 7), 'Dans 1 semaine']];
  if (nextGood) options.unshift([nextGood, 'Prochain beau jour']);

  const apply = async () => {
    for (const j of jobs) await db.jobs.update(j.id!, { date, remindedAt: undefined, ...(jobs.length === 1 ? { time } : {}) });
    await syncDayRoute(from).catch(() => undefined);
    notify(`${jobs.length > 1 ? `${jobs.length} jobs reportés` : 'Job reporté'} au ${formatDate(date)}${jobs.length === 1 && time ? ` à ${time}` : ''}. Pense à prévenir ${jobs.length > 1 ? 'les clients' : 'le client'} (bouton Rappel).`);
    onClose();
  };

  return (
    <Modal title={`Reporter ${label}`} onClose={onClose}>
      <div className="chips" style={{ marginBottom: 12 }}>
        {options.map(([d, l]) => (
          <button key={l} className={`chip-btn ${date === d ? 'on' : ''}`} onClick={() => setDate(d)}>
            {l} · {dayLabel(d, { weekday: 'short', day: 'numeric' })} {weather[d] && <WeatherChip w={weather[d]} />}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <label className="field">Nouvelle date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {jobs.length === 1 && <label className="field">Heure<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>}
      </div>
      {weather[date] && <div className={`notice ${badWeather(weather[date]) ? 'err' : 'ok'}`} style={{ marginTop: 12 }}>Météo prévue le {formatDate(date)}: <WeatherChip w={weather[date]} full /></div>}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn accent" onClick={() => void apply()}><CalendarClock size={16} /> Reporter</button>
      </div>
    </Modal>
  );
}
