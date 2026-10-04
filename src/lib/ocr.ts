import { parseReceipt, type ReceiptGuess } from './receiptParse';

// Lecture du texte d'une photo de reçu, entièrement sur l'appareil (aucun envoi sur Internet).
// Moteur Tesseract + modèle français, servis depuis l'app (public/ocr).

type Worker = { recognize: (img: Blob | HTMLCanvasElement) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };
let workerP: Promise<Worker> | null = null;

function base(): string {
  return new URL('./ocr/', document.baseURI).href;
}

async function getWorker(onProgress?: (p: number) => void): Promise<Worker> {
  if (!workerP) {
    workerP = (async () => {
      const { createWorker } = await import('tesseract.js');
      const w = await createWorker('fra', 1, {
        workerPath: base() + 'worker.min.js',
        corePath: base() + 'core/',
        langPath: base() + 'lang',
        gzip: true,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') onProgress?.(m.progress);
        },
      });
      return w as unknown as Worker;
    })().catch((e) => {
      workerP = null;
      throw e;
    });
  }
  return workerP;
}

/** Prépare la photo: taille raisonnable, niveaux de gris et contraste (meilleure lecture). */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const max = 2000;
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * sc);
  c.height = Math.round(bmp.height * sc);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, (g - 128) * 1.5 + 140));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function readReceipt(file: Blob, onProgress?: (p: number) => void): Promise<{ text: string; guess: ReceiptGuess }> {
  if (!file.type.startsWith('image/')) throw new Error('La lecture automatique fonctionne avec une photo (pas un PDF).');
  const w = await getWorker(onProgress);
  const { data } = await w.recognize(await prepare(file));
  return { text: data.text, guess: parseReceipt(data.text) };
}
