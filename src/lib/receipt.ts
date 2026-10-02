import exifr from 'exifr';
import type { GeoPoint } from './db';
import { toISODate } from './utils';

export interface PhotoInfo {
  geo?: GeoPoint;
  date?: string;
}

/** Lit la position GPS et la date de prise de vue dans la photo (si l'appareil les a enregistrées). */
export async function readPhotoInfo(file: Blob): Promise<PhotoInfo> {
  const out: PhotoInfo = {};
  try {
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      out.geo = { lat: gps.latitude, lon: gps.longitude };
    }
  } catch {
    /* pas de GPS */
  }
  try {
    const meta = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
    const d: Date | undefined = meta?.DateTimeOriginal ?? meta?.CreateDate;
    if (d instanceof Date && !isNaN(d.getTime())) out.date = toISODate(d);
  } catch {
    /* pas de date */
  }
  return out;
}

/** Réduit la photo (max 1800 px, JPEG) pour économiser l'espace. Les PDF sont gardés tels quels. */
export async function compressImage(file: File): Promise<{ blob: Blob; name: string; type: string }> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return { blob: file, name: file.name, type: file.type };
  try {
    const bmp = await createImageBitmap(file);
    const max = 1800;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob || blob.size > file.size) return { blob: file, name: file.name, type: file.type };
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg', type: 'image/jpeg' };
  } catch {
    return { blob: file, name: file.name, type: file.type };
  }
}

/** Ventile un total TTC en sous-total + TPS + TVQ. */
export function splitTaxes(total: number, tpsRate: number, tvqRate: number) {
  const sub = Math.round((total / (1 + (tpsRate + tvqRate) / 100)) * 100) / 100;
  const tps = Math.round(((sub * tpsRate) / 100) * 100) / 100;
  const tvq = Math.round((total - sub - tps) * 100) / 100;
  return { subtotal: sub, tps, tvq };
}

/** Pièce jointe importée depuis Gmail, en attente d'être transformée en dépense. */
export const pendingImport: { file: File | null; vendor?: string; date?: string } = { file: null };
