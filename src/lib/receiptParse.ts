// Lecture du texte d'un reçu (sorti de l'OCR): montant total, TPS, TVQ, date, commerce, catégorie.
// Aucune dépendance: testé dans tests/receipt.test.ts.

export interface ReceiptGuess {
  total?: number;
  subtotal?: number;
  tps?: number;
  tvq?: number;
  date?: string; // YYYY-MM-DD
  vendor?: string;
  category?: string;
  confidence: number; // 0 à 1
}

const VENDORS: [RegExp, string, string][] = [
  [/petro[\s-]?canada|petro[\s-]?can/i, 'Petro-Canada', 'Essence'],
  [/\bshell\b/i, 'Shell', 'Essence'],
  [/\besso\b/i, 'Esso', 'Essence'],
  [/ultramar/i, 'Ultramar', 'Essence'],
  [/couche[\s-]?tard|circle\s?k/i, 'Couche-Tard', 'Essence'],
  [/\birving\b/i, 'Irving', 'Essence'],
  [/crevier/i, 'Crevier', 'Essence'],
  [/\bsonic\b/i, 'Sonic', 'Essence'],
  [/pioneer/i, 'Pioneer', 'Essence'],
  [/costco\s*(gas|essence)/i, 'Costco Essence', 'Essence'],
  [/\brona\b/i, 'Rona', 'Matériaux'],
  [/home\s?depot/i, 'Home Depot', 'Matériaux'],
  [/r[ée]no[\s-]?d[ée]p[oô]t/i, 'Réno-Dépôt', 'Matériaux'],
  [/\bbmr\b/i, 'BMR', 'Matériaux'],
  [/canac/i, 'Canac', 'Matériaux'],
  [/patrick\s?morin/i, 'Patrick Morin', 'Matériaux'],
  [/lowe'?s/i, "Lowe's", 'Matériaux'],
  [/home\s?hardware/i, 'Home Hardware', 'Matériaux'],
  [/quincaillerie/i, 'Quincaillerie', 'Matériaux'],
  [/canadian\s?tire/i, 'Canadian Tire', 'Outils et équipement'],
  [/princess\s?auto/i, 'Princess Auto', 'Outils et équipement'],
  [/tim\s?horton/i, 'Tim Hortons', 'Repas'],
  [/mc\s?donald/i, "McDonald's", 'Repas'],
  [/subway/i, 'Subway', 'Repas'],
  [/a\s?&\s?w\b/i, 'A&W', 'Repas'],
  [/st[\s-]?hubert/i, 'St-Hubert', 'Repas'],
  [/restaurant|resto\b|caf[ée]\b|pizzeria|casse[\s-]?cro[uû]te/i, '', 'Repas'],
  [/bureau\s?en\s?gros|staples/i, 'Bureau en Gros', 'Fournitures de bureau'],
  [/vid[ée]otron|\bbell\b|rogers|telus|\bfizz\b|koodo|fido/i, '', 'Téléphone / Internet'],
  [/garage|m[ée]canique|pneus?|speedy|midas|kal\s?tire|lave[\s-]?auto/i, '', 'Entretien véhicule'],
  [/location|simplex|loue[\s-]?froid|lou[ée] tout/i, '', 'Location équipement'],
  [/costco|walmart|maxi\b|\biga\b|metro\b|provigo|super\s?c/i, '', 'Matériaux'],
];

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, janvier: 1, january: 1,
  fev: 2, fevr: 2, fevrier: 2, feb: 2, february: 2,
  mar: 3, mars: 3, march: 3,
  avr: 4, avril: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juil: 7, juillet: 7, jul: 7, july: 7,
  aou: 8, aout: 8, aug: 8, august: 8,
  sep: 9, sept: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, decembre: 12, december: 12,
};

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Montants sur une ligne: « 12,34 », « 1 234.56 », « $45.00 », « 45,00$ ». */
export function amountsIn(line: string): number[] {
  const out: number[] = [];
  const re = /(?<![\d.,])(\d{1,3}(?:[  ]\d{3})+|\d+)[.,](\d{2})(?!\d)/g;
  for (const m of line.matchAll(re)) out.push(Number(m[1].replace(/[  ]/g, '') + '.' + m[2]));
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
function valid(y: number, m: number, d: number, today: Date): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  const diff = (today.getTime() - dt.getTime()) / 86400000;
  if (diff < -2 || diff > 800) return null; // reçu de moins de ~2 ans, pas dans le futur
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function findDate(text: string, today = new Date()): string | undefined {
  const t = strip(text).toLowerCase();
  // 2026-10-02 / 2026/10/02
  for (const m of t.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    const r = valid(+m[1], +m[2], +m[3], today);
    if (r) return r;
  }
  // 02 oct 2026 / 2 octobre 2026 / oct 02 2026 / oct 2, 2026
  for (const m of t.matchAll(/\b(\d{1,2})[\s-]*([a-z]{3,9})\.?[\s-]*(\d{2,4})\b/g)) {
    const mo = MONTHS[m[2]];
    if (mo) {
      const r = valid(+m[3], mo, +m[1], today);
      if (r) return r;
    }
  }
  for (const m of t.matchAll(/\b([a-z]{3,9})\.?[\s-]*(\d{1,2}),?[\s-]*(\d{2,4})\b/g)) {
    const mo = MONTHS[m[1]];
    if (mo) {
      const r = valid(+m[3], mo, +m[2], today);
      if (r) return r;
    }
  }
  // 02/10/2026 ou 10/02/2026: au Québec, jour/mois en premier; on garde la date la plus plausible
  for (const m of t.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    const dm = valid(y, b, a, today);
    const md = valid(y, a, b, today);
    if (dm && md) {
      // les deux possibles: la plus récente (sans dépasser aujourd'hui)
      return dm > md ? dm : md;
    }
    if (dm || md) return (dm || md)!;
  }
  return undefined;
}

const LINE = {
  sub: /\b(sous[\s-]?total|subtotal|s\/total|sous-tot)\b/,
  tps: /\b(tps|t\.p\.s|gst|g\.s\.t|tx\s?fed|taxe\s?fed)/,
  tvq: /\b(tvq|t\.v\.q|qst|q\.s\.t|tx\s?prov|taxe\s?prov)/,
  total: /\b(total|montant|a\s?payer|grand\s?total|balance|du\b|amount|achat|purchase|debit|visa|mastercard|master|amex|paiement)\b/,
  notTotal: /\b(sous[\s-]?total|subtotal|tps|tvq|gst|qst|economies|epargne|rabais|remise|change|monnaie|points|litres?|\/l\b)/,
};

export function parseReceipt(text: string, today = new Date()): ReceiptGuess {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const low = lines.map((l) => strip(l).toLowerCase());
  const g: ReceiptGuess = { confidence: 0 };
  const last = (i: number) => {
    const a = amountsIn(lines[i]);
    return a.length ? a[a.length - 1] : undefined;
  };

  low.forEach((l, i) => {
    if (g.subtotal === undefined && LINE.sub.test(l)) g.subtotal = last(i);
    else if (g.tps === undefined && LINE.tps.test(l) && !LINE.tvq.test(l)) g.tps = last(i);
    else if (g.tvq === undefined && LINE.tvq.test(l)) g.tvq = last(i);
  });

  // Total: ligne « TOTAL » (pas sous-total, pas taxe); sinon le plus gros montant
  const totals: number[] = [];
  low.forEach((l, i) => {
    if (LINE.total.test(l) && !LINE.notTotal.test(l)) {
      const v = last(i) ?? (i + 1 < lines.length ? amountsIn(lines[i + 1])[0] : undefined);
      if (v !== undefined) totals.push(v);
    }
  });
  const all = lines.flatMap((l) => amountsIn(l));
  if (totals.length) g.total = Math.max(...totals);
  else if (all.length) g.total = Math.max(...all);

  // Cohérence: sous-total + taxes = total
  if (g.total !== undefined && g.subtotal !== undefined && g.tps !== undefined && g.tvq !== undefined) {
    const sum = Math.round((g.subtotal + g.tps + g.tvq) * 100) / 100;
    if (Math.abs(sum - g.total) <= 0.02) g.confidence += 0.4;
    else if (totals.length === 0) g.total = sum;
  } else if (g.total !== undefined && g.tps !== undefined && g.subtotal === undefined) {
    // Déduit le sous-total
    g.subtotal = Math.round((g.total - g.tps - (g.tvq ?? 0)) * 100) / 100;
  }
  if (g.total !== undefined) g.confidence += totals.length ? 0.3 : 0.1;

  g.date = findDate(text, today);
  if (g.date) g.confidence += 0.15;

  const full = lines.join('\n');
  for (const [re, name, cat] of VENDORS) {
    if (re.test(full)) {
      g.category = cat;
      if (name) g.vendor = name;
      break;
    }
  }
  if (!g.vendor) {
    const first = lines.slice(0, 5).find((l) => (l.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length >= 4 && !/\d{3}/.test(l) && !/^(re[cç]u|facture|bienvenue|welcome|merci)/i.test(strip(l)));
    if (first) g.vendor = first.replace(/[^\p{L}\p{N}&' .-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  }
  if (g.vendor) g.confidence += 0.15;
  g.confidence = Math.min(1, Math.round(g.confidence * 100) / 100);
  return g;
}
