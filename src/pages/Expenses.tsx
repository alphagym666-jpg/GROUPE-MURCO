import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, EXPENSE_CATEGORIES, type Expense } from '../lib/db';
import { km, money, todayISO } from '../lib/utils';

function Thumb({ e }: { e: Expense }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!e.photo || !e.photoType?.startsWith('image/')) return;
    const u = URL.createObjectURL(e.photo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [e.photo, e.photoType]);
  if (url) return <img src={url} className="thumb" alt="" />;
  return <div className="thumb" style={{ display: 'grid', placeItems: 'center' }}>{e.photo ? '' : ''}</div>;
}

export default function Expenses() {
  const nav = useNavigate();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [cat, setCat] = useState('');
  const all = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray(), []) ?? [];
  const rows = all.filter((e) => (!month || e.date.startsWith(month)) && (!cat || e.category === cat));
  const sum = (k: 'subtotal' | 'tps' | 'tvq' | 'total') => rows.reduce((a, e) => a + e[k], 0);

  return (
    <>
      <div className="page-head">
        <h1>Reçus et dépenses</h1>
        <button className="btn accent" onClick={() => nav('/depenses/new')}>Ajouter un reçu</button>
      </div>
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 'auto' }} />
          <button className="btn small" onClick={() => setMonth('')}>Tous les mois</button>
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Toutes catégories</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid kpi">
          <div className="card"><div className="label">Total</div><div className="value">{money(sum('total'))}</div><div className="sub">{rows.length} reçu(s)</div></div>
          <div className="card"><div className="label">TPS à réclamer</div><div className="value">{money(sum('tps'))}</div></div>
          <div className="card"><div className="label">TVQ à réclamer</div><div className="value">{money(sum('tvq'))}</div></div>
        </div>
        {rows.length === 0 ? (
          <div className="empty">Aucun reçu pour cette période. Prends ton reçu en photo: la date et le lieu sont lus automatiquement.</div>
        ) : (
          <table className="list">
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="click" onClick={() => nav(`/depenses/${e.id}`)}>
                  <td style={{ width: 60 }}><Thumb e={e} /></td>
                  <td>
                    <strong>{e.vendor || e.category}</strong>
                    <div className="small muted">{e.date} · {e.category}</div>
                    {e.locationLabel && <div className="small muted">{e.locationLabel}{e.kmFromHome !== undefined ? ` · ${km(e.kmFromHome)} de chez toi` : ''}</div>}
                  </td>
                  <td className="num"><strong>{money(e.total)}</strong>{e.tripId && <div className="small muted">au journal</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
