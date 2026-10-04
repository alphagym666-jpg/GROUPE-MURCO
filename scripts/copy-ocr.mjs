// Copie les fichiers de lecture de reçus (OCR) dans public/ocr pour qu'ils fonctionnent hors-ligne
// et dans l'app mobile (pas de CDN).
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'ocr');
mkdirSync(join(out, 'core'), { recursive: true });
mkdirSync(join(out, 'lang'), { recursive: true });
copyFileSync(join(nm, 'tesseract.js/dist/worker.min.js'), join(out, 'worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  copyFileSync(join(nm, 'tesseract.js-core', f), join(out, 'core', f));
}
copyFileSync(join(nm, '@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz'), join(out, 'lang', 'fra.traineddata.gz'));
console.log('OCR: fichiers copiés dans public/ocr');
