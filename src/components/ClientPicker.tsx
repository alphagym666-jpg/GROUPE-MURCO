import { useLiveQuery } from 'dexie-react-hooks';
import { Clock, MapPin, Phone, Search, UserPlus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, type Client } from '../lib/db';
import { ClientFormModal, emptyClient } from './ClientForm';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digits = (s: string) => s.replace(/\D/g, '');

/**
 * Choix du client par recherche: tape quelques lettres (ou le téléphone), les clients récents en premier,
 * et « Nouveau client » au même endroit.
 */
export function ClientPicker({ value, onChange, autoFocus = false }: { value: number; onChange: (id: number) => void; autoFocus?: boolean }) {
  const clients = useLiveQuery(() => db.clients.toArray(), []) ?? [];
  // Clients récents: ceux des dernières factures, soumissions et jobs
  const recentIds = useLiveQuery(async () => {
    const [docs, jobs] = await Promise.all([db.docs.toArray(), db.jobs.toArray()]);
    const ev = [...docs.map((d) => ({ c: d.clientId, t: d.updatedAt || d.createdAt })), ...jobs.map((j) => ({ c: j.clientId, t: j.createdAt }))];
    ev.sort((a, b) => (b.t || '').localeCompare(a.t || ''));
    return [...new Set(ev.map((e) => e.c).filter((c) => c > 0))].slice(0, 6);
  }, []) ?? [];
  const selected = clients.find((c) => c.id === value);
  const [open, setOpen] = useState(!value && autoFocus);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [creating, setCreating] = useState<Client | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const t = norm(q.trim());
    if (!t) {
      const rec = recentIds.map((id) => clients.find((c) => c.id === id)).filter(Boolean) as Client[];
      return { list: rec.length ? rec : [...clients].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 6), recent: rec.length > 0 };
    }
    const d = digits(q);
    const list = clients
      .map((c) => {
        const name = norm(c.name);
        const score = name.startsWith(t) ? 3 : name.split(/\s+/).some((w) => w.startsWith(t)) ? 2 : [name, norm(c.contact), norm(c.address), norm(c.email)].some((x) => x.includes(t)) || (d.length >= 3 && digits(c.phone).includes(d)) ? 1 : 0;
        return { c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
      .slice(0, 8)
      .map((x) => x.c);
    return { list, recent: false };
  }, [q, clients, recentIds]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);
  useEffect(() => setHi(0), [q]);
  // Fermer en touchant ailleurs
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node) && value) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, value]);

  const pick = (id: number) => {
    onChange(id);
    setOpen(false);
    setQ('');
  };
  const startNew = () => {
    const t = q.trim();
    setCreating({ ...emptyClient(), ...(digits(t).length >= 7 && digits(t).length === t.replace(/[\s().-]/g, '').length ? { phone: t } : { name: t }) });
  };
  const total = results.list.length + 1; // + « Nouveau client »

  if (selected && !open) {
    return (
      <button type="button" className="cp-selected" onClick={() => setOpen(true)} aria-label={`Client: ${selected.name}. Changer`}>
        <span className="cp-avatar">{selected.name.slice(0, 1).toUpperCase()}</span>
        <span className="grow">
          <strong>{selected.name}</strong>
          <small>{[selected.phone, selected.address].filter(Boolean).join(' · ') || 'Aucune coordonnée'}</small>
        </span>
        <span className="cp-change">Changer</span>
      </button>
    );
  }

  return (
    <div className="cp" ref={boxRef}>
      <div className="cp-input">
        <Search size={17} className="muted" />
        <input
          ref={inputRef}
          value={q}
          placeholder="Chercher un client (nom, téléphone, adresse)…"
          aria-label="Chercher un client"
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(total - 1, h + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
            else if (e.key === 'Enter') {
              e.preventDefault();
              if (hi < results.list.length) pick(results.list[hi].id!);
              else startNew();
            } else if (e.key === 'Escape' && value) setOpen(false);
          }}
        />
        {value > 0 && <button type="button" className="icon-btn" aria-label="Fermer" onClick={() => setOpen(false)}><X size={16} /></button>}
      </div>
      {open && (
        <div className="cp-list" role="listbox">
          {results.recent && <div className="cp-head"><Clock size={12} /> Récents</div>}
          {results.list.map((c, i) => (
            <button type="button" key={c.id} role="option" aria-selected={i === hi} className={`cp-item ${i === hi ? 'hi' : ''} ${c.id === value ? 'on' : ''}`} onMouseEnter={() => setHi(i)} onClick={() => pick(c.id!)}>
              <span className="cp-avatar">{c.name.slice(0, 1).toUpperCase()}</span>
              <span className="grow">
                <strong>{c.name}</strong>
                <small>
                  {c.phone && <><Phone size={11} /> {c.phone} </>}
                  {c.address && <><MapPin size={11} /> {c.address}</>}
                </small>
              </span>
            </button>
          ))}
          {q.trim() && results.list.length === 0 && <div className="cp-empty">Aucun client « {q.trim()} ».</div>}
          <button type="button" className={`cp-item cp-new ${hi === results.list.length ? 'hi' : ''}`} onMouseEnter={() => setHi(results.list.length)} onClick={startNew}>
            <span className="cp-avatar"><UserPlus size={16} /></span>
            <span className="grow"><strong>{q.trim() ? `Nouveau client « ${q.trim()} »` : 'Nouveau client'}</strong></span>
          </button>
        </div>
      )}
      {creating && <ClientFormModal initial={creating} onClose={() => setCreating(null)} onSaved={(id) => { setCreating(null); pick(id); }} />}
    </div>
  );
}
