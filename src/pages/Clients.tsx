import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientFormModal } from '../components/ClientForm';
import { db } from '../lib/db';
import { useSettings } from '../lib/hooks';
import { docTotals, money } from '../lib/utils';

export default function Clients() {
  const nav = useNavigate();
  const s = useSettings();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const data = useLiveQuery(async () => {
    const [clients, docs] = await Promise.all([db.clients.orderBy('name').toArray(), db.docs.where('type').equals('invoice').toArray()]);
    return { clients, docs };
  }, []);
  if (!data) return null;
  const rows = data.clients.filter((c) => `${c.name} ${c.contact} ${c.email} ${c.phone} ${c.address}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="page-head">
        <h1>Clients</h1>
        <button className="btn accent" onClick={() => setAdding(true)}>+ Nouveau client</button>
      </div>
      <div className="card">
        <input placeholder="Rechercher un client…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
        {rows.length === 0 ? (
          <div className="empty">Aucun client. Ajoute ton premier client!</div>
        ) : (
          <table className="list">
            <thead><tr><th>Client</th><th className="hide-mobile">Contact</th><th className="num">Facturé</th><th className="num">À recevoir</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const inv = data.docs.filter((d) => d.clientId === c.id && d.status !== 'draft' && d.status !== 'cancelled');
                const billed = inv.reduce((a, d) => a + docTotals(d, s).total, 0);
                const due = inv.filter((d) => d.status !== 'paid').reduce((a, d) => a + docTotals(d, s).balance, 0);
                return (
                  <tr key={c.id} className="click" onClick={() => nav(`/clients/${c.id}`)}>
                    <td><strong>{c.name}</strong><div className="small muted">{c.address}</div></td>
                    <td className="hide-mobile">{c.contact}<div className="small muted">{c.email} {c.phone}</div></td>
                    <td className="num">{money(billed)}</td>
                    <td className="num">{due > 0 ? <strong>{money(due)}</strong> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {adding && <ClientFormModal onClose={() => setAdding(false)} onSaved={(id) => nav(`/clients/${id}`)} />}
    </>
  );
}
