import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { db, UNITS, type Service } from '../lib/db';
import { money } from '../lib/utils';

/** Liste de prix: le CODE est ce que tu tapes dans la facture. */
export default function Services() {
  const notify = useToast();
  const list = useLiveQuery(() => db.services.orderBy('order').toArray(), []);
  const [rows, setRows] = useState<Service[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (list && !dirty) setRows(list);
  }, [list, dirty]);

  const up = (i: number, p: Partial<Service>) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
    setDirty(true);
  };

  const save = async () => {
    const codes = rows.map((r) => r.code.trim().toUpperCase());
    const dup = codes.find((c, i) => c && codes.indexOf(c) !== i);
    if (dup) return notify(`Le code ${dup} est en double.`, 'err');
    if (codes.some((c) => !c)) return notify('Chaque ligne doit avoir un code.', 'err');
    const original = new Map((list ?? []).map((r) => [r.id, JSON.stringify(r)]));
    const changed = rows
      .map((r, i) => ({ ...r, code: r.code.trim().toUpperCase(), order: i }))
      .filter((r) => !r.id || original.get(r.id) !== JSON.stringify(r));
    if (changed.length) await db.services.bulkPut(changed);
    const keep = new Set(rows.map((r) => r.id));
    const removed = (list ?? []).filter((r) => !keep.has(r.id)).map((r) => r.id!);
    if (removed.length) await db.services.bulkDelete(removed);
    setDirty(false);
    notify('Liste de prix enregistrée ✔');
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    setDirty(true);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Codes et liste de prix</h1>
          <div className="small muted">Le CODE est ce que tu tapes dans la facture: le service, l’unité, le prix et le minimum s’affichent tout seuls.</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => { setRows([...rows, { code: '', name: '', unit: 'forfait', price: 0, minimum: 0, notes: '', order: rows.length }]); setDirty(true); }}>+ Code</button>
          <button className="btn accent" onClick={save} disabled={!dirty}>💾 Enregistrer</button>
        </div>
      </div>
      <div className="card table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Code</th>
              <th>Service (affiché sur la facture)</th>
              <th style={{ width: 110 }}>Unité</th>
              <th style={{ width: 100 }}>Prix / unité</th>
              <th style={{ width: 110 }}>Minimum / ligne</th>
              <th className="hide-mobile">Notes (pour toi)</th>
              <th style={{ width: 110 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `n${i}`}>
                <td><input className="code-input" value={r.code} onChange={(e) => up(i, { code: e.target.value.toUpperCase() })} aria-label="Code" /></td>
                <td><input value={r.name} onChange={(e) => up(i, { name: e.target.value })} aria-label="Service" /></td>
                <td>
                  <input list="units-svc" value={r.unit} onChange={(e) => up(i, { unit: e.target.value })} aria-label="Unité" />
                </td>
                <td><input type="number" inputMode="decimal" step="0.01" value={r.price} onChange={(e) => up(i, { price: Number(e.target.value) })} aria-label="Prix" /></td>
                <td><input type="number" inputMode="decimal" step="0.01" value={r.minimum} onChange={(e) => up(i, { minimum: Number(e.target.value) })} aria-label="Minimum" /></td>
                <td className="hide-mobile"><input value={r.notes} onChange={(e) => up(i, { notes: e.target.value })} aria-label="Notes" /></td>
                <td>
                  <div className="row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                    <button className="btn small" onClick={() => move(i, -1)} aria-label="Monter">↑</button>
                    <button className="btn small" onClick={() => move(i, 1)} aria-label="Descendre">↓</button>
                    <button className="btn small danger" onClick={() => { setRows(rows.filter((_, j) => j !== i)); setDirty(true); }} aria-label="Supprimer">✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="units-svc">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        {dirty && <div className="notice" style={{ marginTop: 12 }}>Modifications non enregistrées.</div>}
      </div>
      <div className="card">
        <h2>Aide-mémoire</h2>
        <div className="svc-grid">
          {rows.filter((r) => r.code).map((r) => (
            <div key={r.code} className="small" style={{ padding: 6 }}>
              <b style={{ color: 'var(--orange-d)' }}>{r.code}</b> {r.name} <span className="muted">({money(r.price)} / {r.unit}{r.minimum ? `, min. ${money(r.minimum)}` : ''})</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
