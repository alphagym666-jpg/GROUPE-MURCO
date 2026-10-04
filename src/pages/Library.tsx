import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, CheckSquare, ClipboardList, Download, ExternalLink, FileText, FolderOpen, Search, Square, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errMsg, useToast } from '../components/Toast';
import { EXPENSE_CATEGORIES } from '../lib/db';
import { LIB_LABEL, loadLibrary, zipItems, type LibItem, type LibType } from '../lib/library';
import { downloadBlob, money, todayISO } from '../lib/utils';

const TYPES: LibType[] = ['recu', 'photo', 'preuve', 'facture', 'soumission'];
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Tile({ it, selected, selecting, onOpen, onToggle }: { it: LibItem; selected: boolean; selecting: boolean; onOpen: () => void; onToggle: () => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!it.blob || !it.blobType?.startsWith('image/')) return;
    const u = URL.createObjectURL(it.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [it.blob, it.blobType]);
  const Icon = it.type === 'soumission' ? ClipboardList : FileText;
  return (
    <div className={`lib-tile ${selected ? 'sel' : ''}`}>
      <button className="lib-thumb" onClick={selecting ? onToggle : onOpen} aria-label={it.title}>
        {url ? <img src={url} alt="" loading="lazy" /> : <Icon size={30} />}
        <span className={`lib-tag t-${it.type}`}>{it.tag}</span>
      </button>
      <div className="lib-meta">
        <div className="lib-title">{it.title}</div>
        <div className="small muted">{it.date}{it.amount !== undefined ? ` · ${money(it.amount)}` : ''}</div>
        {it.subtitle && <div className="small muted lib-sub">{it.subtitle}</div>}
      </div>
      <button className="lib-check" onClick={onToggle} aria-label={selected ? 'Retirer de la sélection' : 'Sélectionner'}>
        {selected ? <CheckSquare size={18} /> : <Square size={18} />}
      </button>
    </div>
  );
}

/** Classeur: tous les reçus, photos, preuves de paiement et documents, classés par mois. */
export default function Library() {
  const nav = useNavigate();
  const notify = useToast();
  const data = useLiveQuery(loadLibrary, []);
  const [type, setType] = useState<LibType | ''>('');
  const [year, setYear] = useState(todayISO().slice(0, 4));
  const [month, setMonth] = useState('');
  const [client, setClient] = useState('');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [view, setView] = useState<LibItem | null>(null);
  const [busy, setBusy] = useState(false);

  const years = useMemo(() => [...new Set([todayISO().slice(0, 4), ...(data?.items ?? []).map((i) => i.date.slice(0, 4))])].sort().reverse(), [data]);
  const shown = useMemo(() => {
    if (!data) return [];
    const words = norm(q).split(/\s+/).filter(Boolean);
    return data.items.filter((i) => {
      if (type && i.type !== type) return false;
      if (year && !i.date.startsWith(year)) return false;
      if (month && i.date.slice(5, 7) !== month) return false;
      if (client && String(i.clientId) !== client) return false;
      if (cat && i.category !== cat) return false;
      if (words.length) {
        const hay = norm(`${i.title} ${i.subtitle} ${i.tag} ${i.search}`);
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [data, type, year, month, client, cat, q]);

  const groups = useMemo(() => {
    const m = new Map<string, LibItem[]>();
    shown.forEach((i) => m.set(i.date.slice(0, 7), [...(m.get(i.date.slice(0, 7)) ?? []), i]));
    return [...m.entries()];
  }, [shown]);

  const counts = useMemo(() => {
    const c: Partial<Record<LibType, number>> = {};
    (data?.items ?? []).filter((i) => !year || i.date.startsWith(year)).forEach((i) => (c[i.type] = (c[i.type] ?? 0) + 1));
    return c;
  }, [data, year]);

  const toggle = (k: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });

  const download = async (items: LibItem[]) => {
    if (!items.length) return notify('Rien à télécharger.', 'err');
    setBusy(true);
    try {
      downloadBlob(await zipItems(items), `Murco_classeur_${year || 'tout'}${month ? '-' + month : ''}.zip`);
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;
  const selItems = shown.filter((i) => sel.has(i.key));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><FolderOpen size={14} /> {shown.length} document{shown.length > 1 ? 's' : ''}</div>
          <h1>Classeur</h1>
        </div>
        <div className="actions">
          {sel.size > 0 && <button className="btn" onClick={() => setSel(new Set())}><X size={16} /> {sel.size} sélectionné{sel.size > 1 ? 's' : ''}</button>}
          <button className="btn accent" disabled={busy} onClick={() => download(sel.size ? selItems : shown)}>
            <Archive size={17} /> {busy ? 'Préparation…' : sel.size ? 'Télécharger la sélection' : 'Tout télécharger (ZIP classé)'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ flexWrap: 'nowrap', marginBottom: 10 }}>
          <Search size={18} className="muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher: Shell, Tremblay, F-1001, essence, gouttières…" aria-label="Chercher dans le classeur" />
        </div>
        <div className="tabs" style={{ marginBottom: 10 }}>
          <button className={type === '' ? 'on' : ''} onClick={() => setType('')}>Tout</button>
          {TYPES.map((t) => <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{LIB_LABEL[t]} <span className="muted">{counts[t] ?? 0}</span></button>)}
        </div>
        <div className="row">
          <select value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 'auto' }} aria-label="Année">
            {years.map((y) => <option key={y}>{y}</option>)}
            <option value="">Toutes les années</option>
          </select>
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 'auto' }} aria-label="Mois">
            <option value="">Tous les mois</option>
            {MONTH_NAMES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
          <select value={client} onChange={(e) => setClient(e.target.value)} style={{ width: 'auto' }} aria-label="Client">
            <option value="">Tous les clients</option>
            {[...data.clients.values()].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {(type === '' || type === 'recu') && (
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 'auto' }} aria-label="Catégorie">
              <option value="">Toutes catégories</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>

      {groups.length === 0 && <div className="card empty"><FolderOpen size={34} /> Rien dans le classeur pour ces filtres.</div>}
      {groups.map(([ym, list]) => (
        <section key={ym} style={{ marginBottom: 18 }}>
          <div className="lib-month">
            <h2>{MONTH_NAMES[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</h2>
            <span className="small muted">{list.length} document{list.length > 1 ? 's' : ''}</span>
            <span className="spacer" />
            <button className="btn small ghost" onClick={() => setSel((s) => new Set([...s, ...list.map((i) => i.key)]))}>Tout sélectionner</button>
          </div>
          <div className="lib-grid">
            {list.map((it) => (
              <Tile key={it.key} it={it} selected={sel.has(it.key)} selecting={sel.size > 0} onToggle={() => toggle(it.key)} onOpen={() => (it.blob && it.blobType?.startsWith('image/') ? setView(it) : nav(it.to))} />
            ))}
          </div>
        </section>
      ))}

      {view && <Viewer it={view} onClose={() => setView(null)} />}
    </>
  );
}

function Viewer({ it, onClose }: { it: LibItem; onClose: () => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!it.blob) return;
    const u = URL.createObjectURL(it.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [it]);
  return (
    <div className="lightbox" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {url && <img src={url} alt={it.title} />}
      <div className="bar"><strong>{it.title}</strong><span className="small">{it.date}{it.amount !== undefined ? ` · ${money(it.amount)}` : ''}</span></div>
      <div className="bar">
        <Link className="btn small" to={it.to}><ExternalLink size={16} /> Ouvrir la fiche</Link>
        {it.blob && <button className="btn small" onClick={() => downloadBlob(it.blob!, it.fileName)}><Download size={16} /> Télécharger</button>}
        <button className="btn small" onClick={onClose}><X size={16} /> Fermer</button>
      </div>
    </div>
  );
}
