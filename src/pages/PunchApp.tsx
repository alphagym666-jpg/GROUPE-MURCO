import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Coffee, LogOut, MapPin, Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CompanyMark } from '../components/CompanyMark';
import { errMsg, useConfirm, useToast } from '../components/Toast';
import { db } from '../lib/db';
import { haptic } from '../lib/feel';
import { useSettings } from '../lib/hooks';
import { hoursOf, localDay, openPunch, punchFlags, startPunch, stopPunch, weekStart, whoAmI, type Me } from '../lib/punch';
import { signOutSync, useSyncState } from '../lib/sync';
import { todayISO } from '../lib/utils';

const hm = (h: number) => `${Math.floor(h)} h ${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });

/**
 * App « Pointage » des employés: un seul gros bouton punch in / punch out, relié à l'app de l'entrepreneur.
 * Ouverte par pointage.html (installable à part sur l'écran d'accueil) ou pour les employés en accès « Pointage seulement ».
 */
export default function PunchApp() {
  const s = useSettings();
  const st = useSyncState();
  const notify = useToast();
  const ask = useConfirm();
  const [me, setMe] = useState<Me | null>(null);
  const [jobId, setJobId] = useState<number | ''>('');
  const [breakMin, setBreakMin] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const today = todayISO();

  const memberRec = useLiveQuery(() => (st.memberId ? db.members.get(st.memberId) : undefined), [st.memberId]);
  useEffect(() => { whoAmI(st.memberId).then(setMe); }, [st.memberId, memberRec]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
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
    return { jobs: visible.sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.order - b.order), clients: new Map(clients.map((c) => [c.id!, c])), mine: mine.sort((a, b) => b.start.localeCompare(a.start)), open: await openPunch(me.memberId) };
  }, [me, today]);

  // Une seule job aujourd'hui: déjà choisie
  useEffect(() => {
    if (data && !data.open && jobId === '' && data.jobs.length === 1) setJobId(data.jobs[0].id!);
  }, [data, jobId]);

  if (!me || !data) return <div className="pa"><div className="pa-loading">Chargement…</div></div>;
  const open = data.open;
  const todayPunches = data.mine.filter((p) => localDay(p.start) === today);
  const ws = weekStart(today);
  const weekH = data.mine.filter((p) => localDay(p.start) >= ws).reduce((a, p) => a + hoursOf(p), 0);
  const todayH = todayPunches.reduce((a, p) => a + hoursOf(p), 0);
  const openJob = open?.jobId ? data.jobs.find((j) => j.id === open.jobId) : undefined;
  const jobLabel = (id?: number) => {
    const j = id ? data.jobs.find((x) => x.id === id) : undefined;
    return j ? `${data.clients.get(j.clientId)?.name ?? 'Client'} — ${j.title}` : 'Sans job précis';
  };

  const toggle = async () => {
    setBusy(true);
    try {
      if (open) {
        const done = await stopPunch(open, breakMin);
        haptic('success');
        notify(`Punch out — ${hm(hoursOf(done))} travaillées`);
        setBreakMin(0);
      } else {
        const p = await startPunch(me, jobId || undefined);
        haptic('success');
        notify(`Punch in à ${time(p.start)}${p.startDistM !== undefined ? ` · ${p.startDistM < 1000 ? `${p.startDistM} m` : `${(p.startDistM / 1000).toFixed(1)} km`} du chantier` : ''}`);
      }
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`pa ${open ? 'on' : ''}`}>
      <header className="pa-head">
        <CompanyMark s={s} size={34} />
        <div className="grow">
          <strong>{s.companyName || 'Pointage'}</strong>
          <small><span className={`pa-dot ${st.status === 'ok' ? 'ok' : st.status === 'error' ? 'err' : ''}`} /> {me.name}</small>
        </div>
        <button className="pa-icon" aria-label="Me déconnecter" onClick={async () => { if (await ask({ title: 'Te déconnecter?', message: 'Tes heures restent enregistrées.', confirm: 'Déconnexion' })) await signOutSync(); }}><LogOut size={18} /></button>
      </header>

      <main className="pa-main">
        <div className="pa-status">{open ? `Au travail depuis ${time(open.start)}` : todayPunches.length ? 'Pas en service' : 'Prêt à commencer'}</div>
        <div className="pa-clock">{open ? clock(now - new Date(open.start).getTime() - (breakMin || 0) * 60_000) : hm(todayH)}</div>
        <div className="pa-sub">{open ? jobLabel(openJob?.id ?? open.jobId) : 'aujourd’hui'}</div>
        {open && punchFlags(open).filter((f) => !f.startsWith('Pas de punch out')).map((f) => <div key={f} className="pa-flag"><AlertTriangle size={13} /> {f}</div>)}

        <button className={`pa-btn ${open ? 'stop' : ''}`} disabled={busy} onClick={() => void toggle()} aria-label={open ? 'Punch out' : 'Punch in'}>
          <span className="pa-ring" />
          {open ? <Square size={44} fill="currentColor" /> : <Play size={48} fill="currentColor" />}
          <b>{busy ? '…' : open ? 'PUNCH OUT' : 'PUNCH IN'}</b>
        </button>

        {open ? (
          <div className="pa-break">
            <div className="pa-label"><Coffee size={14} /> Pause prise</div>
            <div className="pa-chips">
              {[0, 15, 30, 45, 60].map((m) => <button key={m} className={breakMin === m ? 'on' : ''} onClick={() => setBreakMin(m)}>{m ? `${m} min` : 'Aucune'}</button>)}
            </div>
          </div>
        ) : (
          <div className="pa-jobs">
            <div className="pa-label">Sur quelle job?</div>
            {data.jobs.map((j) => (
              <button key={j.id} className={jobId === j.id ? 'on' : ''} onClick={() => setJobId(jobId === j.id ? '' : j.id!)}>
                <strong>{j.time ? `${j.time} · ` : ''}{data.clients.get(j.clientId)?.name ?? 'Client'}</strong>
                <small>{j.title}{j.address ? ` · ${j.address}` : ''}</small>
              </button>
            ))}
            <button className={jobId === '' ? 'on' : ''} onClick={() => setJobId('')}><strong>Sans job précis</strong><small>Atelier, achats, déplacement…</small></button>
          </div>
        )}
        <div className="pa-gps"><MapPin size={12} /> Ta position est enregistrée au punch in et au punch out seulement.</div>
      </main>

      <footer className="pa-foot">
        <div><span>Aujourd’hui</span><b>{hm(todayH)}</b></div>
        <div><span>Cette semaine</span><b>{hm(weekH)}</b></div>
        <div><span>Pointages</span><b>{todayPunches.length}</b></div>
      </footer>
    </div>
  );
}
