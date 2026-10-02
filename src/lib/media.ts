import { db, type Media, type MediaKind } from './db';
import { compressImage, readPhotoInfo } from './receipt';

export const KIND_LABEL: Record<MediaKind, string> = {
  avant: 'Avant',
  apres: 'Après',
  job: 'Job',
  paiement: 'Paiement',
  autre: 'Autre',
};

export interface MediaLink {
  docId?: number;
  jobId?: number;
  clientId?: number;
}

/** Enregistre une photo (réduite, avec date et position GPS de la photo si présentes). */
export async function addPhoto(file: File, kind: MediaKind, link: MediaLink, caption = ''): Promise<number> {
  const info = await readPhotoInfo(file);
  const c = await compressImage(file);
  const now = new Date().toISOString();
  return db.media.add({
    kind,
    blob: c.blob,
    type: c.type,
    name: c.name,
    caption,
    takenAt: info.date ? new Date(info.date + 'T12:00:00').toISOString() : now,
    geo: info.geo,
    ...link,
    createdAt: now,
  } as Media);
}

export async function addPhotos(files: FileList | File[], kind: MediaKind, link: MediaLink): Promise<number[]> {
  const ids: number[] = [];
  for (const f of Array.from(files)) ids.push(await addPhoto(f, kind, link));
  return ids;
}

export function blobToDataURL(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

/** Image prête pour le PDF (JPEG, dimensions connues). */
export async function mediaForPdf(m: Media): Promise<{ data: string; w: number; h: number } | null> {
  if (!m.blob || !m.type.startsWith('image/')) return null;
  try {
    const bmp = await createImageBitmap(m.blob);
    const max = 1400;
    const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * sc);
    c.height = Math.round(bmp.height * sc);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/jpeg', 0.8), w: c.width, h: c.height };
  } catch {
    return null;
  }
}
