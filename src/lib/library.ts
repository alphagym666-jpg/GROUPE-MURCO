import JSZip from 'jszip';
import { db, getSettings, type Client } from './db';
import { makeDocPdf } from './docPdf';
import { KIND_LABEL } from './media';
import { docFileName } from './pdf';
import { docTotals, safeFileName } from './utils';

/** Tout ce que contient le classeur: reçus, photos de jobs, preuves de paiement, factures et soumissions. */
export type LibType = 'recu' | 'photo' | 'preuve' | 'facture' | 'soumission';

export const LIB_LABEL: Record<LibType, string> = {
  recu: 'Reçus',
  photo: 'Photos de jobs',
  preuve: 'Preuves de paiement',
  facture: 'Factures',
  soumission: 'Soumissions',
};

export interface LibItem {
  key: string;
  type: LibType;
  date: string; // YYYY-MM-DD
  title: string;
  subtitle: string;
  tag: string;
  amount?: number;
  clientId?: number;
  category?: string;
  blob?: Blob;
  blobType?: string;
  to: string; // fiche liée
  search: string;
  fileName: string;
  docId?: number;
}

const MONTHS = ['01 - Janvier', '02 - Février', '03 - Mars', '04 - Avril', '05 - Mai', '06 - Juin', '07 - Juillet', '08 - Août', '09 - Septembre', '10 - Octobre', '11 - Novembre', '12 - Décembre'];
export const monthFolder = (date: string) => `${date.slice(0, 4)}/${MONTHS[Number(date.slice(5, 7)) - 1] ?? date.slice(5, 7)}`;
const ext = (type?: string) => (type?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');

export async function loadLibrary(): Promise<{ items: LibItem[]; clients: Map<number, Client> }> {
  const s = await getSettings();
  const [expenses, media, docs, clientList, jobs] = await Promise.all([db.expenses.toArray(), db.media.toArray(), db.docs.toArray(), db.clients.toArray(), db.jobs.toArray()]);
  const clients = new Map(clientList.map((c) => [c.id!, c]));
  const docsById = new Map(docs.map((d) => [d.id!, d]));
  const jobsById = new Map(jobs.map((j) => [j.id!, j]));
  const items: LibItem[] = [];

  for (const e of expenses) {
    const c = e.clientId ? clients.get(e.clientId) : undefined;
    items.push({
      key: `e${e.id}`,
      type: 'recu',
      date: e.date,
      title: e.vendor || e.category,
      subtitle: [e.category, c?.name].filter(Boolean).join(' · '),
      tag: e.category,
      amount: e.total,
      clientId: e.clientId,
      category: e.category,
      blob: e.photo,
      blobType: e.photoType,
      to: `/depenses/${e.id}`,
      search: [e.vendor, e.category, e.notes, e.locationLabel, e.ocrText, c?.name].join(' '),
      fileName: `${e.date}_${safeFileName(e.category)}_${safeFileName(e.vendor || 'recu')}_${e.id}.${ext(e.photoType)}`,
    });
  }
  for (const m of media) {
    const d = m.docId ? docsById.get(m.docId) : undefined;
    const j = m.jobId ? jobsById.get(m.jobId) : undefined;
    const cid = m.clientId ?? d?.clientId ?? j?.clientId;
    const c = cid ? clients.get(cid) : undefined;
    const date = m.takenAt.slice(0, 10);
    const type: LibType = m.kind === 'paiement' ? 'preuve' : 'photo';
    items.push({
      key: `m${m.id}`,
      type,
      date,
      title: c?.name ?? KIND_LABEL[m.kind],
      subtitle: [KIND_LABEL[m.kind], d?.number, j?.title ?? d?.title].filter(Boolean).join(' · '),
      tag: KIND_LABEL[m.kind],
      clientId: cid,
      blob: m.blob,
      blobType: m.type,
      to: d ? `/doc/${d.id}` : j ? `/job/${j.id}` : c ? `/clients/${c.id}` : '/classeur',
      search: [c?.name, m.caption, d?.number, d?.title, j?.title, KIND_LABEL[m.kind]].join(' '),
      fileName: `${date}_${safeFileName(c?.name ?? 'client')}_${safeFileName(KIND_LABEL[m.kind])}${d ? '_' + safeFileName(d.number) : ''}_${m.id}.${ext(m.type)}`,
    });
  }
  for (const d of docs) {
    if (d.status === 'cancelled') continue;
    const c = clients.get(d.clientId);
    items.push({
      key: `d${d.id}`,
      type: d.type === 'invoice' ? 'facture' : 'soumission',
      date: d.date,
      title: `${d.number} — ${c?.name ?? ''}`,
      subtitle: d.title,
      tag: d.signature ? 'Signée' : d.type === 'invoice' ? 'Facture' : 'Soumission',
      amount: docTotals(d, s).total,
      clientId: d.clientId,
      to: `/doc/${d.id}`,
      search: [d.number, d.title, d.jobAddress, c?.name, d.items.map((i) => `${i.code} ${i.description}`).join(' ')].join(' '),
      fileName: docFileName(d, c),
      docId: d.id,
    });
  }
  items.sort((a, b) => b.date.localeCompare(a.date) || a.type.localeCompare(b.type));
  return { items, clients };
}

/** ZIP bien classé: Année / Mois / Type / fichiers. */
export async function zipItems(items: LibItem[]): Promise<Blob> {
  const s = await getSettings();
  const zip = new JSZip();
  for (const it of items) {
    const folder = `${monthFolder(it.date)}/${LIB_LABEL[it.type]}`;
    if (it.blob) zip.file(`${folder}/${it.fileName}`, it.blob);
    else if (it.docId) {
      const d = await db.docs.get(it.docId);
      if (d) zip.file(`${folder}/${it.fileName}`, await makeDocPdf(d, await db.clients.get(d.clientId), s));
    }
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
