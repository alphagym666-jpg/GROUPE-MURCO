import { useLiveQuery } from 'dexie-react-hooks';
import { CountUp } from '../components/CountUp';
import { Onboarding } from '../components/Onboarding';
import { RelanceModal } from '../components/RelanceModal';
import {
  AlertTriangle, Bell, CalendarDays, CalendarPlus, Camera, Car, CircleCheck, ClipboardList, Clock, Eye, FileText, Inbox, MapPin, Phone, Plus, Search, Star, Zap,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SyncBadge } from '../components/SyncBadge';
import { db, type Client, type Doc } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { OPEN_STAGES } from '../lib/crm';
import { addDays, docTotals, km, kmAllowance, lineAmount, money, statusClass, statusLabel, todayISO } from '../lib/utils';

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

export default function Dashboard({ onSearch }: { onSearch?: () => void }) {
  const s = useSettings();
  const nav = useNavigate();
  const today = todayISO();
  const year = today.slice(0, 4);
  const [relance, setRelance] = useState<{ doc: Doc; client?: Client; pdf?: Blob; mode: 'choose' | 'mail' } | null>(null);

  const data = useLiveQuery(async () => {
    const [docs, expenses, trips, clients, jobsToday, leads, punches] = await Promise.all([
      db.docs.toArray(),
      db.expenses.toArray(),
      db.trips.toArray(),
      db.clients.toArray(),
      db.jobs.where('date').equals(today).toArray(),
      db.leads.toArray(),
      db.punches.toArray(),
    ]);
    return { docs, expenses, trips, clients: new Map(clients.map((c) => [c.id!, c])), jobsToday, leads, onSite: punches.filter((p) => !p.end) };
  }, [today]);
  if (!data) return null;

  const invoices = data.docs.filter((d) => d.type === 'invoice' && d.status !== 'draft' && d.status !== 'cancelled');
  const tt = (d: Doc) => docTotals(d, s);
  const yInv = invoices.filter((d) => d.date.startsWith(year));
  const mInv = invoices.filter((d) => d.date.startsWith(today.slice(0, 7)));
  const sum = (arr: Doc[], k: 'subtotal' | 'tps' | 'tvq' | 'total' | 'paid' | 'balance') => arr.reduce((a, d) => a + tt(d)[k], 0);
  const unpaid = invoices.filter((d) => d.status === 'sent' || d.status === 'partial').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = unpaid.filter((d) => d.dueDate < today);
  const quotes = data.docs.filter((d) => d.type === 'quote' && (d.status === 'sent' || (d.status === 'accepted' && !d.convertedInvoiceId))).sort((a, b) => b.date.localeCompare(a.date));
  const yExp = data.expenses.filter((e) => e.date.startsWith(year));
  const yKm = data.trips.filter((t) => t.date.startsWith(year)).reduce((a, t) => a + t.totalKm, 0);
  const tpsNet = sum(yInv, 'tps') - yExp.reduce((a, e) => a + e.tps, 0);
  const tvqNet = sum(yInv, 'tvq') - yExp.reduce((a, e) => a + e.tvq, 0);
  const jobsToday = data.jobsToday.filter((j) => j.status !== 'annule').sort((a, b) => a.order - b.order);

  // Revenus des 12 derniers mois (avant taxes)
  const months: { key: string; label: string; v: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today + 'T12:00:00');
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: MONTHS[d.getMonth()], v: invoices.filter((x) => x.date.startsWith(key)).reduce((a, x) => a + tt(x).subtotal, 0) });
  }
  const maxM = Math.max(1, ...months.map((m) => m.v));
  // Revenus par code de job (année en cours)
  const byCode = new Map<string, number>();
  yInv.forEach((d) =>
    d.items.forEach((it) => {
      const k = it.code || 'Autre';
      byCode.set(k, (byCode.get(k) ?? 0) + lineAmount(it));
    }),
  );
  const codes = [...byCode.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const maxC = Math.max(1, ...codes.map((c) => c[1]));

  const missing = [!s.postalCode && 'code postal', s.chargeTaxes && !s.tpsNumber && 'numéro de TPS', !s.googleMapsKey && 'clé Google Maps'].filter(Boolean) as string[];


  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Bon matin' : hour < 18 ? 'Bonjour' : 'Bonsoir';

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{hello}{s.ownerName ? ` ${s.ownerName.split(' ')[0]}` : ''}</h1>
          <div className="hide-desktop" style={{ marginTop: 8 }}><SyncBadge top /></div>
        </div>
        <div className="actions">
          <button className="btn hide-mobile" onClick={onSearch}><Search size={17} /> Rechercher <span className="small muted">Ctrl K</span></button>
          <button className="btn accent hide-mobile" onClick={() => nav('/express')}><Zap size={17} /> Facture express</button>
          <button className="btn primary hide-mobile" onClick={() => nav('/doc/new?type=quote')}><ClipboardList size={17} /> Soumission</button>
          <button className="btn hide-mobile" onClick={() => nav('/depenses/new')}><Camera size={17} /> Reçu</button>
        </div>
      </div>

      <div className="quick-tiles">
        <button onClick={() => nav('/express')}><Zap size={22} /> Facture express</button>
        <button onClick={() => nav('/job/new')}><CalendarPlus size={22} /> Job</button>
        <button onClick={() => nav('/depenses/new')}><Camera size={22} /> Reçu</button>
        <button onClick={() => nav('/doc/new?type=quote')}><ClipboardList size={22} /> Soumission</button>
      </div>

      <Onboarding s={s} />
      {s.setupHidden && missing.length > 0 && <div className="notice">À compléter: <strong>{missing.join(', ')}</strong>. <Link to="/parametres">Paramètres →</Link></div>}

      <div className="grid kpi">
        <div className="card hot"><div className="label">Ventes {year}</div><div className="value"><CountUp value={sum(yInv, 'subtotal')} format={money} /></div><div className="sub">ce mois-ci: {money(sum(mInv, 'subtotal'))}</div></div>
        <div className="card"><div className="label">À recevoir</div><div className="value"><CountUp value={sum(unpaid, 'balance')} format={money} /></div><div className="sub">{unpaid.length} facture(s){overdue.length ? ` · ${overdue.length} en retard` : ''}</div></div>
        <div className="card"><div className="label">Km {year}</div><div className="value"><CountUp value={yKm} format={(n) => km(Math.round(n))} /></div><div className="sub">≈ {money(kmAllowance(yKm, s))} déductibles</div></div>
        <div className="card">
          <div className="label">{s.chargeTaxes ? 'Taxes à remettre' : `Dépenses ${year}`}</div>
          <div className="value"><CountUp value={s.chargeTaxes ? tpsNet + tvqNet : yExp.reduce((a, e) => a + e.subtotal, 0)} format={money} /></div>
          <div className="sub">{s.chargeTaxes ? `TPS ${money(tpsNet)} · TVQ ${money(tvqNet)}` : `${yExp.length} reçu(s)`}</div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-head"><CalendarDays size={18} /><h2>Aujourd’hui</h2><span className="spacer" /><Link className="btn small" to="/agenda">Agenda</Link></div>
          {jobsToday.length === 0 ? (
            <div className="empty" style={{ padding: 18 }}>
              <div>Aucun job planifié aujourd’hui.</div>
              <button className="btn small" onClick={() => nav('/job/new')}><Plus size={15} /> Planifier un job</button>
            </div>
          ) : (
            jobsToday.map((j, i) => {
              const c = data.clients.get(j.clientId);
              return (
                <Link key={j.id} to={`/job/${j.id}`} className={`job-card ${j.status}`} style={{ color: 'var(--ink)' }}>
                  <div className="stop">{j.status === 'planifie' ? i + 1 : <CircleCheck size={16} />}</div>
                  <div className="body">
                    <div className="title">{c?.name ?? 'Client'} {j.time && <span className="badge gray">{j.time}</span>}</div>
                    <div className="small">{j.title}</div>
                    {(j.address || c?.address) && <div className="small muted"><MapPin size={12} /> {j.address || c?.address}</div>}
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <div className="card">
          <div className="card-head">{overdue.length ? <AlertTriangle size={18} color="var(--red)" /> : <FileText size={18} />}<h2>À encaisser</h2></div>
          {unpaid.length === 0 ? (
            <div className="empty" style={{ padding: 18 }}><CircleCheck size={30} /> Tout est payé.</div>
          ) : (
            <table className="list">
              <tbody>
                {unpaid.slice(0, 6).map((d) => {
                  const c = data.clients.get(d.clientId);
                  const late = d.dueDate < today;
                  return (
                    <tr key={d.id}>
                      <td onClick={() => nav(`/doc/${d.id}`)} style={{ cursor: 'pointer' }}>
                        <strong>{d.number}</strong> <span className={statusClass(d)}>{statusLabel(d)}</span>
                        <div className="small muted">{c?.name}{d.viewedAt ? ' · vue par le client' : ''}</div>
                      </td>
                      <td className="num">{money(tt(d).balance)}</td>
                      <td style={{ width: 1 }}>{late && <button className="btn small" onClick={() => setRelance({ doc: d, client: c, mode: 'choose' })}><Bell size={14} /> Relancer</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <div className="card-head"><h2>Revenus — 12 derniers mois</h2></div>
          <div className="bars" role="img" aria-label="Revenus par mois">
            {months.map((m) => (
              <div key={m.key} className="b" title={`${m.key}: ${money(m.v)}`}>
                {m.v > 0 && <span className="val">{m.v >= 1000 ? `${Math.round(m.v / 100) / 10}k` : Math.round(m.v)}</span>}
                <div className={`bar ${m.key === today.slice(0, 7) ? 'cur' : ''}`} style={{ height: `${(m.v / maxM) * 100}%` }} />
                <span className="lbl">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Par code de job — {year}</h2></div>
          {codes.length === 0 ? (
            <div className="empty" style={{ padding: 18 }}>Les ventes par code apparaîtront ici.</div>
          ) : (
            codes.map(([code, v]) => (
              <div key={code} className="hbar">
                <b>{code}</b>
                <div className="track"><div className="fill" style={{ width: `${(v / maxC) * 100}%` }} /></div>
                <span className="num small">{money(v)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid three">
        <div className="card">
          <div className="card-head"><Inbox size={18} /><h2>Demandes à relancer</h2><span className="spacer" /><Link className="btn small" to="/demandes">CRM</Link></div>
          {(() => {
            const due = data.leads.filter((l) => OPEN_STAGES.includes(l.stage) && l.nextAction && l.nextAction <= today);
            const fresh = data.leads.filter((l) => l.stage === 'nouveau');
            if (!due.length && !fresh.length) return <div className="small muted">Rien à relancer. Les nouvelles demandes arrivent ici.</div>;
            return (
              <>
                {fresh.length > 0 && <div className="small" style={{ marginBottom: 6 }}><span className="badge amber">{fresh.length} nouvelle{fresh.length > 1 ? 's' : ''}</span></div>}
                {due.slice(0, 5).map((l) => (
                  <div key={l.id} className="row small" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                    <strong>{l.name}</strong><span className="muted">{l.nextNote || l.service}</span><span className="spacer" />
                    {l.phone && <a href={`tel:${l.phone}`} aria-label="Appeler"><Phone size={14} /></a>}
                  </div>
                ))}
              </>
            );
          })()}
        </div>
        <div className="card">
          <div className="card-head"><Star size={18} /><h2>Avis clients</h2></div>
          {(() => {
            const rv = data.docs.filter((d) => d.review).sort((a, b) => b.review!.at.localeCompare(a.review!.at));
            const avg = rv.length ? rv.reduce((a, d) => a + d.review!.stars, 0) / rv.length : 0;
            const toAsk = data.docs.filter((d) => d.type === 'invoice' && d.status === 'paid' && !d.reviewRequestedAt && !d.review && d.date >= addDays(today, -45));
            return (
              <>
                {rv.length > 0 ? <div className="value" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem' }}>{avg.toFixed(1)} ★ <span className="small muted">({rv.length} avis)</span></div> : <div className="small muted">Aucun avis encore.</div>}
                {rv.slice(0, 2).map((d) => d.review!.comment && <div key={d.id} className="small" style={{ marginTop: 4 }}>« {d.review!.comment} » — {data.clients.get(d.clientId)?.name}</div>)}
                {toAsk.length > 0 && <div className="small" style={{ marginTop: 8 }}>{toAsk.length} job(s) payée(s) sans demande d’avis: <Link to={`/doc/${toAsk[0].id}`}>demander</Link></div>}
              </>
            );
          })()}
        </div>
        <div className="card">
          <div className="card-head"><Clock size={18} /><h2>Sur le terrain</h2><span className="spacer" /><Link className="btn small" to="/temps">Heures</Link></div>
          {data.onSite.length === 0 ? <div className="small muted">Personne n’est pointé en ce moment.</div> : data.onSite.map((p) => (
            <div key={p.id} className="row small" style={{ padding: '4px 0' }}>
              <span className="dot" style={{ background: 'var(--green)' }} /> <strong>{p.name}</strong>
              <span className="muted">depuis {new Date(p.start).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}</span>
              {(p.startDistM ?? 0) > 300 && <span className="badge red">loin du chantier</span>}
            </div>
          ))}
        </div>
      </div>

      {quotes.length > 0 && (
        <div className="card">
          <div className="card-head"><ClipboardList size={18} /><h2>Soumissions en cours</h2></div>
          <table className="list">
            <tbody>
              {quotes.slice(0, 6).map((d) => (
                <tr key={d.id} className="click" onClick={() => nav(`/doc/${d.id}`)}>
                  <td><strong>{d.number}</strong> — {data.clients.get(d.clientId)?.name}<div className="small muted">{d.title}</div></td>
                  <td>
                    {d.signature ? <span className="badge green">Signée</span> : d.viewedAt ? <span className="badge blue"><Eye size={12} /> Vue</span> : <span className="badge gray">Envoyée</span>}
                    {d.status === 'accepted' && !d.convertedInvoiceId && <div className="small muted">à facturer</div>}
                  </td>
                  <td className="num">{money(tt(d).total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row hide-desktop" style={{ marginTop: 8 }}>
        <Link className="btn" to="/km"><Car size={16} /> Journal de bord</Link>
        <Link className="btn" to="/depenses/new"><Camera size={16} /> Reçu</Link>
      </div>

      {relance && <RelanceModal doc={relance.doc} client={relance.client} onClose={() => setRelance(null)} />}
    </>
  );
}
