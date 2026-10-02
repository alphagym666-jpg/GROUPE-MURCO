import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, type DocType } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { docTotals, money, statusClass, statusLabel, todayISO } from '../lib/utils';

const FILTERS: Record<DocType, { key: string; label: string }[]> = {
  invoice: [
    { key: 'all', label: 'Toutes' },
    { key: 'unpaid', label: 'À encaisser' },
    { key: 'late', label: 'En retard' },
    { key: 'paid', label: 'Payées' },
    { key: 'draft', label: 'Brouillons' },
  ],
  quote: [
    { key: 'all', label: 'Toutes' },
    { key: 'sent', label: 'En attente' },
    { key: 'accepted', label: 'Acceptées' },
    { key: 'refused', label: 'Refusées' },
    { key: 'draft', label: 'Brouillons' },
  ],
};

export default function DocList({ type }: { type: DocType }) {
  const nav = useNavigate();
  const s = useSettings();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const data = useLiveQuery(async () => {
    const [docs, clients] = await Promise.all([db.docs.where('type').equals(type).toArray(), db.clients.toArray()]);
    return { docs: docs.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)), clients: new Map(clients.map((c) => [c.id!, c])) };
  }, [type]);
  if (!data) return null;
  const today = todayISO();
  const isInvoice = type === 'invoice';

  const rows = data.docs.filter((d) => {
    const c = data.clients.get(d.clientId);
    const text = `${d.number} ${d.title} ${d.jobAddress} ${c?.name ?? ''}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    switch (filter) {
      case 'unpaid': return d.status === 'sent' || d.status === 'partial';
      case 'late': return (d.status === 'sent' || d.status === 'partial') && d.dueDate < today;
      case 'all': return true;
      default: return d.status === filter;
    }
  });
  const total = rows.reduce((a, d) => a + docTotals(d, s).total, 0);

  return (
    <>
      <div className="page-head">
        <h1>{isInvoice ? 'Factures' : 'Soumissions'}</h1>
        <button className="btn accent" onClick={() => nav(`/doc/new?type=${type}`)}>+ Nouvelle {isInvoice ? 'facture' : 'soumission'}</button>
      </div>
      <div className="tabs">
        {FILTERS[type].map((f) => (
          <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      <div className="card">
        <input placeholder="Rechercher (no, client, job, adresse)…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
        {rows.length === 0 ? (
          <div className="empty">Aucune {isInvoice ? 'facture' : 'soumission'} ici.</div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Client / Job</th>
                  <th className="hide-mobile">Date</th>
                  <th>Statut</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const tt = docTotals(d, s);
                  return (
                    <tr key={d.id} className="click" onClick={() => nav(`/doc/${d.id}`)}>
                      <td><strong>{d.number}</strong></td>
                      <td>
                        {data.clients.get(d.clientId)?.name ?? '—'}
                        <div className="small muted">{d.title}{d.jobAddress ? ` · 📍 ${d.jobAddress}` : ''}</div>
                      </td>
                      <td className="hide-mobile">{d.date}</td>
                      <td><span className={statusClass(d)}>{statusLabel(d)}</span></td>
                      <td className="num">
                        {money(tt.total)}
                        {isInvoice && tt.paid > 0 && tt.balance > 0 && <div className="small muted">solde {money(tt.balance)}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={3} className="hide-mobile"></td><td><strong>Total</strong></td><td className="num"><strong>{money(total)}</strong></td></tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
