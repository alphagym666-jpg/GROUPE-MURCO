import { db, type Client, type Doc, type Media, type Settings } from './db';
import { D, docLangOf } from './docLang';
import { mediaForPdf } from './media';
import { buildDocPdf, type PdfPhoto } from './pdf';

/** PDF de la facture/soumission, avec les photos avant/après si demandé. */
export async function makeDocPdf(doc: Doc, client: Client | undefined, s: Settings): Promise<Blob> {
  const photos: PdfPhoto[] = [];
  if (doc.pdfPhotos && doc.id) {
    let media: Media[] = await db.media.where('docId').equals(doc.id).toArray();
    if (doc.jobId) {
      const seen = new Set(media.map((m) => m.id));
      media = [...media, ...(await db.media.where('jobId').equals(doc.jobId).toArray()).filter((m) => !seen.has(m.id))];
    }
    const order = { avant: 0, job: 1, apres: 2, paiement: 3, autre: 4 };
    media = media.filter((m) => m.kind !== 'paiement').sort((a, b) => order[a.kind] - order[b.kind] || a.takenAt.localeCompare(b.takenAt));
    for (const m of media) {
      const p = await mediaForPdf(m);
      if (p) photos.push({ ...p, label: D[docLangOf(doc, client)].kinds[m.kind] ?? m.kind });
    }
  }
  return buildDocPdf(doc, client, s, photos).output('blob');
}
