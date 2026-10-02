import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { SyncBadge } from '../components/SyncBadge';
import { db } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { docTotals, formatDate, km, kmAllowance, money, statusClass, statusLabel, todayISO } from '../lib/utils';

export default function Dashboard() {
  const s = useSettings();
  const nav = useNavigate();
  const year = todayISO().slice(0, 4);
  const month = todayISO().slice(0, 7);
  const data = useLiveQuery(async () => {
    const [docs, expenses, trips, clients] = await Promise.all([db.docs.toArray(), db.expenses.toArray(), db.trips.toArray(), db.clients.toArray()]);
    return { docs, expenses, trips, clients: new Map(clients.map((c) => [c.id!, c])) };
  }, []);
  if (!data) return null;

  const invoices = data.docs.filter((d) => d.type === 'invoice' && d.status !== 'draft' && d.status !== 'cancelled');
  const yInv = invoices.filter((d) => d.date.startsWith(year));
  const mInv = invoices.filter((d) => d.date.startsWith(month));
  const sum = (arr: typeof invoices, k: 'subtotal' | 'tps' | 'tvq' | 'total' | 'paid' | 'balance') => arr.reduce((a, d) => a + docTotals(d, s)[k], 0);
  const unpaid = invoices.filter((d) => d.status === 'sent' || d.status === 'partial').sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pendingQuotes = data.docs.filter((d) => d.type === 'quote' && d.status === 'sent');
  const yExp = data.expenses.filter((e) => e.date.startsWith(year));
  const yTrips = data.trips.filter((t) => t.date.startsWith(year));
  const yKm = yTrips.reduce((a, t) => a + t.totalKm, 0);
  const tpsNet = sum(yInv, 'tps') - yExp.reduce((a, e) => a + e.tps, 0);
  const tvqNet = sum(yInv, 'tvq') - yExp.reduce((a, e) => a + e.tvq, 0);

  const missing = [
    !s.address && 'adresse de la compagnie',
    !s.homeAddress && 'adresse de domicile (départ du journal de bord)',
    s.chargeTaxes && !s.tpsNumber && 'numéro de TPS',
    s.chargeTaxes && !s.tvqNumber && 'numéro de TVQ',
    !s.postalCode && 'code postal',
    !s.googleClientId && 'connexion Gmail',
  ].filter(Boolean) as string[];

  const recent = [
    ...data.docs.map((d) => ({ date: d.updatedAt, label: `${d.type === 'invoice' ? 'Facture' : 'Soumission'} ${d.number} — ${data.clients.get(d.clientId)?.name ?? ''}`, to: `/doc/${d.id}` })),
    ...data.expenses.map((e) => ({ date: e.createdAt, label: `Reçu ${e.category} — ${e.vendor || ''} ${money(e.total)}`, to: `/depenses/${e.id}` })),
    ...data.trips.map((t) => ({ date: t.createdAt, label: `Déplacement ${km(t.totalKm)} — ${t.reason}`, to: '/km' })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bonjour{s.ownerName ? ` ${s.ownerName.split(' ')[0]}` : ''} 👋</h1>
          <div className="muted small">{s.companyName} — {formatDate(todayISO())}</div>
          <div className="hide-desktop" style={{ marginTop: 6 }}><SyncBadge top /></div>
        </div>
        <div className="actions">
          <button className="btn accent" onClick={() => nav('/doc/new?type=invoice')}>+ Facture</button>
          <button className="btn primary" onClick={() => nav('/doc/new?type=quote')}>+ Soumission</button>
          <button className="btn" onClick={() => nav('/depenses/new')}>📷 Reçu</button>
          <button className="btn" onClick={() => nav('/km?add=1')}>🚗 Déplacement</button>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="notice">
          ⚙️ Pour compléter ta configuration, ajoute: <strong>{missing.join(', ')}</strong>. <Link to="/parametres">Aller aux paramètres →</Link>
        </div>
      )}

      <div className="grid kpi">
        <div className="card"><div className="label">Ventes {year} (av. taxes)</div><div className="value">{money(sum(yInv, 'subtotal'))}</div><div className="sub">Ce mois: {money(sum(mInv, 'subtotal'))}</div></div>
        <div className="card"><div className="label">À recevoir</div><div className="value">{money(sum(unpaid, 'balance'))}</div><div className="sub">{unpaid.length} facture(s) impayée(s)</div></div>
        <div className="card"><div className="label">Soumissions en attente</div><div className="value">{pendingQuotes.length}</div><div className="sub">{money(sum(pendingQuotes, 'subtotal'))}</div></div>
        <div className="card"><div className="label">Km d’affaires {year}</div><div className="value">{km(yKm)}</div><div className="sub">≈ {money(kmAllowance(yKm, s))} déductibles</div></div>
        <div className="card"><div className="label">Dépenses {year}</div><div className="value">{money(yExp.reduce((a, e) => a + e.subtotal, 0))}</div><div className="sub">{yExp.length} reçu(s)</div></div>
        <div className="card"><div className="label">Taxes nettes à remettre</div><div className="value">{money(tpsNet + tvqNet)}</div><div className="sub">TPS {money(tpsNet)} · TVQ {money(tvqNet)}</div></div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Factures à encaisser</h2>
          {unpaid.length === 0 ? (
            <div className="empty">Aucune facture impayée 🎉</div>
          ) : (
            <table className="list">
              <tbody>
                {unpaid.slice(0, 8).map((d) => (
                  <tr key={d.id} className="click" onClick={() => nav(`/doc/${d.id}`)}>
                    <td><strong>{d.number}</strong><div className="small muted">{data.clients.get(d.clientId)?.name}</div></td>
                    <td><span className={statusClass(d)}>{statusLabel(d)}</span><div className="small muted">éch. {d.dueDate}</div></td>
                    <td className="num">{money(docTotals(d, s).balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>Activité récente</h2>
          {recent.length === 0 ? (
            <div className="empty">Commence par créer un client ou une facture.</div>
          ) : (
            <table className="list">
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} className="click" onClick={() => nav(r.to)}>
                    <td>{r.label}<div className="small muted">{new Date(r.date).toLocaleString('fr-CA')}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
