import { useLiveQuery } from 'dexie-react-hooks';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { db } from '../lib/db';
import { useSyncState } from '../lib/sync';

/**
 * Notes administrateur (« job:12 », « client:4 »): gardées dans une table à part que les téléphones
 * des employés ne reçoivent jamais (règles Firestore). Invisible pour un employé ou un vendeur.
 */
export function AdminNote({ refKey, placeholder }: { refKey: string; placeholder?: string }) {
  const st = useSyncState();
  const row = useLiveQuery(() => db.adminNotes.where('ref').equals(refKey).last(), [refKey]);
  const [txt, setTxt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { if (txt === null && row !== undefined) setTxt(row?.text ?? ''); }, [row, txt]);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (st.role === 'employe' || st.role === 'vendeur') return null;
  const save = (v: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const cur = await db.adminNotes.where('ref').equals(refKey).last();
      if (cur) await db.adminNotes.update(cur.id!, { text: v, updatedAt: new Date().toISOString() });
      else if (v.trim()) await db.adminNotes.add({ ref: refKey, text: v, updatedAt: new Date().toISOString() });
    }, 500);
  };
  return (
    <label className="field full admin-note">
      <span className="row" style={{ gap: 6 }}><ShieldCheck size={15} /> Notes administrateur <span className="small muted">— pas visibles par les employés</span></span>
      <textarea rows={2} value={txt ?? ''} placeholder={placeholder ?? 'Prix négocié, client difficile, marge…'} onChange={(e) => { setTxt(e.target.value); save(e.target.value); }} />
    </label>
  );
}
