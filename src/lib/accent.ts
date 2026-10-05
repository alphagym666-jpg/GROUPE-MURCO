// Couleur de l'entreprise: appliquée à toute l'app (boutons, bandeaux), aux PDF et à la page client.

export const DEFAULT_ACCENT = '#e0901f';
export const ACCENT_SWATCHES = ['#e0901f', '#e4572e', '#d6336c', '#7c3aed', '#2563eb', '#0891b2', '#0f9d6c', '#65a30d', '#ca8a04', '#334155'];
const KEY = 'murco.accent';

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
  return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0];
}
const toHex = (c: RGB) => '#' + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Luminance relative (WCAG). */
function lum([r, g, b]: RGB): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Texte lisible sur la couleur (noir ou blanc). */
export function onColor(hex: string): string {
  const c = hexToRgb(hex);
  return contrast(c, [255, 255, 255]) >= contrast(c, [29, 31, 34]) ? '#ffffff' : '#1d1f22';
}

/** Version de la couleur assez foncée (fond clair) ou assez pâle (fond sombre) pour du texte. */
function inkOn(c: RGB, bg: RGB): RGB {
  const toward: RGB = lum(bg) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  let x = c;
  for (let i = 0; i < 20 && contrast(x, bg) < 4.6; i++) x = mix(x, toward, 0.08);
  return x;
}

/** Version foncée pour les bandeaux (texte blanc toujours lisible). */
function deep(c: RGB, min: number): RGB {
  let x = c;
  for (let i = 0; i < 30 && contrast(x, [255, 255, 255]) < min; i++) x = mix(x, [10, 8, 20], 0.07);
  return x;
}

export function accentPalette(hex: string) {
  const c = hexToRgb(hex);
  const light: RGB = [243, 242, 239];
  const dark: RGB = [20, 21, 23];
  const d1 = deep(c, 3.2);
  return {
    deep: toHex(d1),
    deeper: toHex(mix(deep(c, 5.5), [30, 16, 60], 0.18)),
    base: toHex(c),
    on: onColor(hex),
    inkLight: toHex(inkOn(c, [255, 255, 255])),
    softLight: toHex(mix(c, light, 0.86)),
    inkDark: toHex(inkOn(c, [28, 30, 33])),
    softDark: toHex(mix(c, dark, 0.78)),
  };
}

export function applyAccent(hex?: string) {
  const color = /^#[0-9a-f]{6}$/i.test(hex ?? '') ? hex! : DEFAULT_ACCENT;
  try {
    localStorage.setItem(KEY, color);
  } catch {
    /* ignore */
  }
  let el = document.getElementById('accent-vars') as HTMLStyleElement | null;
  if (color.toLowerCase() === DEFAULT_ACCENT) {
    el?.remove(); // couleur d'origine: les valeurs de la feuille de style
    return;
  }
  const p = accentPalette(color);
  const darkVars = `--amber-ink:${p.inkDark};--amber-soft:${p.softDark};`;
  const css =
    `:root{--amber:${p.base};--on-amber:${p.on};--amber-ink:${p.inkLight};--amber-soft:${p.softLight};--brand-deep:${p.deep};--brand-deeper:${p.deeper};}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme='light']){${darkVars}}}` +
    `:root[data-theme='dark']{${darkVars}}`;
  if (!el) {
    el = document.createElement('style');
    el.id = 'accent-vars';
    document.head.appendChild(el);
  }
  el.textContent = css;
}

/** Au démarrage, avant la lecture des réglages: dernière couleur connue (pas de flash orange). */
export function applyStoredAccent() {
  try {
    const c = localStorage.getItem(KEY);
    if (c) applyAccent(c);
  } catch {
    /* ignore */
  }
}

/** Couleur dominante d'un logo (ignore le blanc, le noir, le gris et la transparence). */
export async function colorFromLogo(src: string): Promise<string | null> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const n = 64;
  const cv = document.createElement('canvas');
  cv.width = n;
  cv.height = n;
  const g = cv.getContext('2d');
  if (!g) return null;
  g.drawImage(img, 0, 0, n, n);
  const px = g.getImageData(0, 0, n, n).data;
  const buckets = new Map<number, { w: number; r: number; g: number; b: number }>();
  for (let i = 0; i < px.length; i += 4) {
    const [r, gg, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, gg, b);
    const min = Math.min(r, gg, b);
    const sat = max ? (max - min) / max : 0;
    if (sat < 0.28 || max < 50 || (max > 240 && sat < 0.35)) continue;
    let h = 0;
    if (max === r) h = ((gg - b) / (max - min)) % 6;
    else if (max === gg) h = (b - r) / (max - min) + 2;
    else h = (r - gg) / (max - min) + 4;
    const key = Math.round(((h * 60 + 360) % 360) / 20);
    const w = sat * (max / 255);
    const e = buckets.get(key) ?? { w: 0, r: 0, g: 0, b: 0 };
    e.w += w;
    e.r += r * w;
    e.g += gg * w;
    e.b += b * w;
    buckets.set(key, e);
  }
  const best = [...buckets.values()].sort((a, b) => b.w - a.w)[0];
  if (!best || best.w < 3) return null;
  return toHex([best.r / best.w, best.g / best.w, best.b / best.w]);
}
