// Analyse d'une dictée du genre:
//   « NDG 120 pieds et lavage de vitres 12 fenêtres chez Tremblay »
// → client Tremblay, NDG × 120, LVE × 12.
// Fonctionne sans Internet ni IA: codes, mots-clés des services et nombres.

export interface VoiceService {
  code: string;
  name: string;
  unit: string;
}
export interface VoiceClient {
  id?: number;
  name: string;
}
export interface VoiceResult {
  clientId?: number;
  clientName?: string;
  lines: { code: string; quantity: number }[];
  leftovers: string[];
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ');

const STOP = new Set(['de', 'des', 'du', 'la', 'le', 'les', 'et', 'a', 'au', 'aux', 'pour', 'sur', 'en', 'un', 'une', 'avec', 'materiel', 'installation', 'fourniture', 'disposition']);
const UNIT = '(?:pieds?|pi2|pi|carres?|lineaires?|lin|fenetres?|sacs?|heures?|h|forfaits?|unites?|metres?)\\b';

const SMALL: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13,
  quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, cents: 100, mille: 1000,
};

/** Convertit les nombres écrits en lettres simples (« vingt cinq », « cent vingt ») en chiffres. */
export function wordsToNumbers(text: string): string {
  const tokens = text.split(/\s+/);
  const out: string[] = [];
  let acc: number | null = null;
  let cur = 0;
  const flush = () => {
    if (acc !== null) out.push(String(acc + cur));
    acc = null;
    cur = 0;
  };
  for (const raw of tokens) {
    const t = raw.replace(/-/g, '');
    const parts = raw.split('-');
    if (parts.length > 1 && parts.every((p) => p in SMALL)) {
      // ex.: « vingt-cinq »
      acc ??= 0;
      cur += parts.reduce((a, p) => a + SMALL[p], 0);
      continue;
    }
    if (t in SMALL && t !== 'un' && t !== 'une') {
      acc ??= 0;
      const v = SMALL[t];
      if (v === 100) cur = (cur || 1) * 100;
      else if (v === 1000) {
        acc += (cur || 1) * 1000;
        cur = 0;
      } else cur += v;
      continue;
    }
    if ((t === 'un' || t === 'une') && acc !== null) {
      cur += 1;
      continue;
    }
    flush();
    out.push(raw);
  }
  flush();
  return out.join(' ');
}

function keywords(name: string): string[] {
  return norm(name)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .map((w) => w.replace(/s$/, ''));
}

function findClient(text: string, clients: VoiceClient[]): { client?: VoiceClient; rest: string } {
  const m = text.match(/\b(chez|pour|client|cliente)\s+(madame|monsieur|mme|m\.?)?\s*([a-z0-9-]+(?:\s+[a-z0-9-]+)?)/);
  let best: VoiceClient | undefined;
  let bestScore = 0;
  for (const c of clients) {
    const words = norm(c.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !['mme', 'madame', 'monsieur'].includes(w));
    const target = m ? m[3] : text;
    const score = words.filter((w) => new RegExp(`\\b${w}\\b`).test(target)).length;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  let rest = text;
  if (m) rest = text.replace(m[0], ' ');
  else if (best) for (const w of norm(best.name).split(/[^a-z0-9]+/).filter((x) => x.length >= 3)) rest = rest.replace(new RegExp(`\\b${w}\\b`, 'g'), ' ');
  return { client: best, rest };
}

export function parseDictation(input: string, services: VoiceService[], clients: VoiceClient[]): VoiceResult {
  let text = wordsToNumbers(norm(input));
  text = text.replace(/(\d),(\d)/g, '$1.$2');
  const { client, rest } = findClient(text, clients);
  text = rest;

  // Codes épelés: « n d g » → « ndg »
  for (const s of services) {
    const c = s.code.toLowerCase();
    const spelled = c.split('').join('\\s*\\.?\\s*');
    text = text.replace(new RegExp(`\\b${spelled}\\b`, 'g'), ` ${c} `);
  }

  const segments = text.split(/\s*(?:,|;|\bet\b|\bplus\b|\bpuis\b|\bavec\b)\s*/).filter((x) => x.trim());
  const lines: VoiceResult['lines'] = [];
  const leftovers: string[] = [];
  const kw = services.map((s) => ({ s, words: keywords(s.name) }));

  // Un segment peut contenir plusieurs couples « service nombre unité »:
  // chaque morceau = texte avant le nombre + nombre + unité; le texte qui suit le dernier nombre reste avec lui.
  const pieces: { text: string; hasNum: boolean }[] = [];
  for (const seg of segments) {
    const re = new RegExp(`[^\\d]*?\\d+(?:\\.\\d+)?(?:\\s*${UNIT})*`, 'g');
    const found = seg.match(re) ?? [];
    if (!found.length) {
      pieces.push({ text: seg, hasNum: false });
      continue;
    }
    const tail = seg.slice(found.join('').length);
    found[found.length - 1] += tail;
    found.forEach((f) => pieces.push({ text: f, hasNum: true }));
  }

  for (const { text: piece, hasNum } of pieces) {
    const clean = piece.replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    const numMatch = clean.match(/\d+(?:\.\d+)?/);
    const qty = numMatch ? Number(numMatch[0]) : 1;
    const words = clean.split(/[^a-z0-9.]+/).filter(Boolean).map((w) => w.replace(/s$/, ''));
    let best: VoiceService | undefined;
    let bestScore = 0;
    for (const { s, words: ks } of kw) {
      let score = words.includes(s.code.toLowerCase()) ? 10 : 0;
      score += ks.filter((k) => words.some((w) => w === k || (w.length >= 5 && k.startsWith(w)) || (k.length >= 5 && w.startsWith(k)))).length;
      // « protège-gouttières »: ne pas confondre avec le nettoyage
      if (/protege/.test(clean) && /protege/i.test(norm(s.name))) score += 1;
      if (/install/.test(clean) && /install/.test(norm(s.name))) score += 1;
      if (/(materiel|materiau|grillage)/.test(clean) && /materiel/.test(norm(s.name))) score += 1;
      if (/deplac/.test(clean) && /deplac/.test(norm(s.name))) score += 1;
      if (/(hauteur|etage)/.test(clean) && /hauteur/.test(norm(s.name))) score += 1;
      if (score > bestScore) {
        best = s;
        bestScore = score;
      }
    }
    if (best && bestScore > 0) {
      const existing = lines.find((l) => l.code === best!.code);
      if (existing) {
        if (hasNum) existing.quantity += qty;
      } else lines.push({ code: best.code, quantity: qty });
    } else if (clean.replace(/\d|\.|\s/g, '')) leftovers.push(clean);
  }

  return { clientId: client?.id, clientName: client?.name, lines, leftovers };
}
