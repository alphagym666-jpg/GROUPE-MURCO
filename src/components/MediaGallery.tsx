import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Share2, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, type Media, type MediaKind } from '../lib/db';
import { addPhotos, KIND_LABEL, type MediaLink } from '../lib/media';
import { errMsg, useToast } from './Toast';

function useObjectUrl(b?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!b) return setUrl(undefined);
    const u = URL.createObjectURL(b);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [b]);
  return url;
}

function Thumb({ m, onOpen }: { m: Media; onOpen: () => void }) {
  const url = useObjectUrl(m.blob);
  return (
    <button className="ph" onClick={onOpen} aria-label={`Photo ${KIND_LABEL[m.kind]}`}>
      {url && <img src={url} alt="" loading="lazy" />}
      <span className="tag">{KIND_LABEL[m.kind]}</span>
    </button>
  );
}

interface Props {
  link: MediaLink;
  /** Photos à afficher: par défaut celles liées au même document / job. */
  kinds?: MediaKind[];
  addKinds?: MediaKind[];
  title?: string;
  autoOpenCamera?: boolean;
}

/** Galerie de photos (avant / après / paiement) avec prise de photo directe. */
export function MediaGallery({ link, kinds, addKinds = ['avant', 'apres'], title = 'Photos', autoOpenCamera }: Props) {
  const notify = useToast();
  const cam = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<MediaKind>(addKinds[0]);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const list =
    useLiveQuery(async () => {
      let rows: Media[] = [];
      if (link.docId) rows = await db.media.where('docId').equals(link.docId).toArray();
      if (link.jobId) {
        const more = await db.media.where('jobId').equals(link.jobId).toArray();
        const seen = new Set(rows.map((r) => r.id));
        rows = [...rows, ...more.filter((r) => !seen.has(r.id))];
      }
      if (!link.docId && !link.jobId && link.clientId) rows = await db.media.where('clientId').equals(link.clientId).toArray();
      return rows.filter((r) => !kinds || kinds.includes(r.kind)).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
    }, [link.docId, link.jobId, link.clientId, kinds?.join()]) ?? [];

  useEffect(() => {
    if (autoOpenCamera) setTimeout(() => cam.current?.click(), 300);
  }, [autoOpenCamera]);

  const add = async (fl: FileList | null) => {
    if (!fl?.length) return;
    if (!link.docId && !link.jobId && !link.clientId) return notify('Enregistre d’abord, puis ajoute les photos.', 'err');
    setBusy(true);
    try {
      const ids = await addPhotos(fl, kind, link);
      notify(`${ids.length} photo${ids.length > 1 ? 's' : ''} ajoutée${ids.length > 1 ? 's' : ''}`);
    } catch (e) {
      notify(errMsg(e), 'err');
    } finally {
      setBusy(false);
      if (cam.current) cam.current.value = '';
      if (files.current) files.current.value = '';
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="badge gray">{list.length}</span>
        <div className="spacer" />
        {addKinds.length > 1 && (
          <div className="seg" role="group" aria-label="Type de photo">
            {addKinds.map((k) => (
              <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
            ))}
          </div>
        )}
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => add(e.target.files)} />
      <input ref={files} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      <div className="gallery">
        <button className="add" onClick={() => cam.current?.click()} disabled={busy}>
          <Camera size={22} /> {busy ? 'Ajout…' : `Photo ${KIND_LABEL[kind].toLowerCase()}`}
        </button>
        <button className="add" onClick={() => files.current?.click()} disabled={busy}>
          <ImagePlus size={22} /> Depuis la galerie
        </button>
        {list.map((m, i) => <Thumb key={m.id} m={m} onOpen={() => setOpen(i)} />)}
      </div>
      {open !== null && list[open] && <Lightbox list={list} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function Lightbox({ list, index, onIndex, onClose }: { list: Media[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const notify = useToast();
  const m = list[index];
  const url = useObjectUrl(m?.blob);
  const file = useMemo(() => (m?.blob ? new File([m.blob], m.name || 'photo.jpg', { type: m.type }) : null), [m]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < list.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [index, list.length, onClose, onIndex]);

  if (!m) return null;

  const remove = async () => {
    const copy = { ...m };
    await db.media.delete(m.id!);
    onClose();
    notify('Photo supprimée', 'ok', { label: 'Annuler', run: () => void db.media.put(copy) });
  };
  const share = async () => {
    try {
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: KIND_LABEL[m.kind] });
      else if (url) window.open(url, '_blank');
    } catch {
      /* partage annulé */
    }
  };
  const setKind = (k: MediaKind) => db.media.update(m.id!, { kind: k });

  return (
    <div className="lightbox" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {url && <img src={url} alt={m.caption || KIND_LABEL[m.kind]} />}
      <div className="bar">
        <button className="btn small" onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Précédente"><ChevronLeft size={18} /></button>
        <span className="small">{index + 1} / {list.length} · {new Date(m.takenAt).toLocaleDateString('fr-CA')}</span>
        <button className="btn small" onClick={() => onIndex(index + 1)} disabled={index === list.length - 1} aria-label="Suivante"><ChevronRight size={18} /></button>
      </div>
      <div className="bar">
        {(['avant', 'apres', 'job', 'paiement'] as MediaKind[]).map((k) => (
          <button key={k} className="btn small" style={m.kind === k ? { background: 'var(--amber)', color: 'var(--on-amber)' } : undefined} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="bar">
        <button className="btn small" onClick={share}><Share2 size={16} /> Partager</button>
        <button className="btn small" onClick={remove}><Trash2 size={16} /> Supprimer</button>
        <button className="btn small" onClick={onClose}><X size={16} /> Fermer</button>
      </div>
    </div>
  );
}

/** Petit sélecteur « photo de preuve » (argent comptant, bordereau de dépôt). */
export function ProofPhoto({ mediaId, onChange, link, label = 'Photo de preuve' }: { mediaId?: number; onChange: (id?: number) => void; link: MediaLink; label?: string }) {
  const notify = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const m = useLiveQuery(() => (mediaId ? db.media.get(mediaId) : undefined), [mediaId]);
  const url = useObjectUrl(m?.blob);
  const [open, setOpen] = useState(false);
  return (
    <div className="row">
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        try {
          const [id] = await addPhotos([f], 'paiement', link);
          onChange(id);
        } catch (err) {
          notify(errMsg(err), 'err');
        }
      }} />
      {url ? (
        <>
          <button className="ph" style={{ width: 56, height: 56, padding: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }} onClick={() => setOpen(true)} aria-label="Voir la preuve">
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </button>
          <button className="btn small" onClick={() => ref.current?.click()}>Reprendre</button>
          <button className="btn small ghost" onClick={() => onChange(undefined)}>Retirer</button>
        </>
      ) : (
        <button className="btn small" onClick={() => ref.current?.click()}><Camera size={16} /> {label}</button>
      )}
      {open && m && <Lightbox list={[m]} index={0} onIndex={() => undefined} onClose={() => setOpen(false)} />}
    </div>
  );
}
