import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileText, Phone } from 'lucide-react';
import { ClientFormModal } from '../components/ClientForm';
import { SwipeRow } from '../components/SwipeRow';
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
          <>
          <div className="doc-cards hide-desktop">
            {rows.map((c) => {
              const inv = data.docs.filter((d) => d.clientId === c.id && d.status !== 'draft' && d.status !== 'cancelled');
              const due = inv.filter((d) => d.status !== 'paid').reduce((a, d) => a + docTotals(d, s).balance, 0);
              return (
                <SwipeRow key={c.id} onTap={() => nav(`/clients/${c.id}`)}
                  left={c.phone ? { label: 'Appeler', icon: <Phone size={18} />, tone: 'green', run: () => { location.href = `tel:${c.phone}`; } } : undefined}
                  right={{ label: 'Facturer', icon: <FileText size={18} />, tone: 'blue', run: () => nav(`/doc/new?type=invoice&client=${c.id}`) }}>
                  <div className="doc-card">
                    <span className="cp-avatar">{c.name.slice(0, 1).toUpperCase()}</span>
                    <span className="grow">
                      <strong>{c.name}</strong>
                      <small>{[c.phone, c.address].filter(Boolean).join(' · ') || '—'}</small>
                    </span>
                    {due > 0 && <span className="doc-amt"><b>{money(due)}</b><small>à recevoir</small></span>}
                    <ChevronRight size={16} className="muted" />
                  </div>
                </SwipeRow>
              );
            })}
            <div className="small muted swipe-hint">Astuce: glisse un client vers la droite pour l’appeler, vers la gauche pour lui faire une facture.</div>
          </div>
          <table className="list hide-mobile">
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
          </>
        )}
      </div>
      {adding && <ClientFormModal onClose={() => setAdding(false)} onSaved={(id) => nav(`/clients/${id}`)} />}
    </>
  );
}
