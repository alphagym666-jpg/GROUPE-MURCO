import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle, Bell, CalendarDays, Camera, Car, CircleCheck, ClipboardList, Eye, FileText, MapPin, Plus, Search, Zap,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Modal } from '../components/Modal';
import { SendEmailModal } from '../components/SendEmailModal';
import { SyncBadge } from '../components/SyncBadge';
import { useToast } from '../components/Toast';
import { smsLink } from '../lib/agenda';
import { db, type Client, type Doc } from '../lib/db';
import { makeDocPdf } from '../lib/docPdf';
import { useSettings } from '../lib/hooks';
import { docFileName } from '../lib/pdf';
import { docTotals, formatDate, km, kmAllowance, lineAmount, money, statusClass, statusLabel, todayISO } from '../lib/utils';

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

export default function Dashboard({ onSearch }: { onSearch?: () => void }) {
  const s = useSettings();
  const nav = useNavigate();
  const notify = useToast();
  const today = todayISO();
  const year = today.slice(0, 4);
  const [relance, setRelance] = useState<{ doc: Doc; client?: Client; pdf?: Blob; mode: 'choose' | 'mail' } | null>(null);

  const data = useLiveQuery(async () => {
    const [docs, expenses, trips, clients, jobsToday] = await Promise.all([
      db.docs.toArray(),
      db.expenses.toArray(),
      db.trips.toArray(),
      db.clients.toArray(),
      db.jobs.where('date').equals(today).toArray(),
    ]);
    return { docs, expenses, trips, clients: new Map(clients.map((c) => [c.id!, c])), jobsToday };
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

  const relanceText = (d: Doc, c?: Client) =>
    `Bonjour ${c?.contact || c?.name || ''}, petit rappel: la facture ${d.number} de ${money(tt(d).balance)} était payable le ${formatDate(d.dueDate)}. ${s.paymentInstructions} Merci! ${s.ownerName.split(' ')[0] || s.companyName}`;

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
          <button className="btn accent" onClick={() => nav('/express')}><Zap size={17} /> Facture express</button>
          <button className="btn primary hide-mobile" onClick={() => nav('/doc/new?type=quote')}><ClipboardList size={17} /> Soumission</button>
          <button className="btn hide-mobile" onClick={() => nav('/depenses/new')}><Camera size={17} /> Reçu</button>
        </div>
      </div>

      {missing.length > 0 && <div className="notice">À compléter: <strong>{missing.join(', ')}</strong>. <Link to="/parametres">Paramètres →</Link></div>}

      <div className="grid kpi">
        <div className="card hot"><div className="label">Ventes {year}</div><div className="value">{money(sum(yInv, 'subtotal'))}</div><div className="sub">ce mois-ci: {money(sum(mInv, 'subtotal'))}</div></div>
        <div className="card"><div className="label">À recevoir</div><div className="value">{money(sum(unpaid, 'balance'))}</div><div className="sub">{unpaid.length} facture(s){overdue.length ? ` · ${overdue.length} en retard` : ''}</div></div>
        <div className="card"><div className="label">Km {year}</div><div className="value">{km(yKm)}</div><div className="sub">≈ {money(kmAllowance(yKm, s))} déductibles</div></div>
        <div className="card">
          <div className="label">{s.chargeTaxes ? 'Taxes à remettre' : `Dépenses ${year}`}</div>
          <div className="value">{s.chargeTaxes ? money(tpsNet + tvqNet) : money(yExp.reduce((a, e) => a + e.subtotal, 0))}</div>
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

      {relance?.mode === 'choose' && (
        <Modal title={`Relancer — ${relance.doc.number}`} onClose={() => setRelance(null)}>
          <p style={{ marginTop: 0 }}>{relanceText(relance.doc, relance.client)}</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {relance.client?.phone && <a className="btn" href={smsLink(relance.client.phone, relanceText(relance.doc, relance.client))}>Texto</a>}
            <button className="btn accent" onClick={async () => setRelance({ ...relance, pdf: await makeDocPdf(relance.doc, relance.client, s), mode: 'mail' })}>Courriel avec la facture</button>
          </div>
        </Modal>
      )}
      {relance?.mode === 'mail' && relance.pdf && (
        <SendEmailModal
          title={`Relance — ${relance.doc.number}`}
          to={relance.client?.email ?? ''}
          subject={`Rappel — facture ${relance.doc.number} (${s.companyName})`}
          body={relanceText(relance.doc, relance.client)}
          attachments={[{ filename: docFileName(relance.doc, relance.client), mimeType: 'application/pdf', blob: relance.pdf }]}
          onClose={() => setRelance(null)}
          onSent={async ({ gmailId, to, subject }) => {
            await db.emails.add({ date: new Date().toISOString(), to, subject, clientId: relance.doc.clientId, docId: relance.doc.id, gmailId, kind: 'facture' });
            notify('Relance envoyée');
          }}
        />
      )}
    </>
  );
}
