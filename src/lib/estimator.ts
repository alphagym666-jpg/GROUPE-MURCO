// Estimateur de projet: photo + description + questions → liste de matériaux, quantités, coûts estimés et liens d'achat.
// L'IA propose, l'utilisateur corrige: rien n'est créé sans qu'il confirme.
import { getAI, getGenerativeModel, Schema, VertexAIBackend, type Part } from 'firebase/ai';
import { AI_TIMEOUT_MS, MODELS, notFound, overQuota } from './ai';
import type { MaterialPrice } from './db';
import { firebaseApp } from './sync';

export interface EstQuestion {
  id: string;
  question: string;
  type: 'choix' | 'nombre' | 'texte';
  options?: string[];
  unit?: string;
}
export interface EstMaterial {
  name: string; // ex.: « Revêtement de vinyle, carré de 100 pi² »
  query: string; // mots à chercher chez les fournisseurs
  category: string;
  qty: number;
  unit: string;
  price: number; // $ CA par unité (estimé, ou ton prix du catalogue)
  note?: string;
  source: 'estime' | 'catalogue';
  store?: string;
  url?: string;
}
export interface EstResult {
  summary: string;
  materials: EstMaterial[];
  hours: number;
  tips: string[];
  assumptions: string[];
}

export const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- Liens d'achat (pages de recherche vérifiées; BMR et Patrick Morin via une recherche Google limitée à leur site) ----------
export const STORES: { key: string; label: string; url: (q: string) => string }[] = [
  { key: 'homedepot', label: 'Home Depot', url: (q) => `https://www.homedepot.ca/search?q=${encodeURIComponent(q)}` },
  { key: 'rona', label: 'Rona', url: (q) => `https://www.rona.ca/fr/recherche?q=${encodeURIComponent(q)}` },
  { key: 'canac', label: 'Canac', url: (q) => `https://www.canac.ca/fr/search?q=${encodeURIComponent(q)}` },
  { key: 'bmr', label: 'BMR', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(`site:bmr.ca ${q}`)}` },
  { key: 'patrickmorin', label: 'Patrick Morin', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(`site:patrickmorin.com ${q}`)}` },
  { key: 'canadiantire', label: 'Canadian Tire', url: (q) => `https://www.canadiantire.ca/fr/search-results.html?q=${encodeURIComponent(q)}` },
];

/** Prix du catalogue de l'utilisateur pour un matériau (correspondance sur le nom ou les mots cherchés). */
export function bookMatch(book: MaterialPrice[] | undefined, m: { name: string; query: string }): MaterialPrice | undefined {
  const a = norm(m.query || m.name);
  const b = norm(m.name);
  return (book ?? []).find((p) => p.key === a || p.key === b || (a.length > 5 && (p.key.includes(a) || a.includes(p.key))));
}

// ---------- Appels à l'IA ----------
const SYSTEM = `Tu es un estimateur de construction et de rénovation au Québec (Canada). Tu aides un entrepreneur à préparer une soumission: tu listes TOUS les matériaux nécessaires avec les bonnes quantités.
Règles: français du Québec; produits qu'on trouve chez Home Depot, Rona, BMR, Canac, Patrick Morin; unités canadiennes (pi, pi², pi lin, boîte, sac, feuille, rouleau, tube, gallon, litre, unité); ajoute les pertes habituelles (10 à 15 % selon le matériau); n'oublie pas les petits matériaux (vis, clous, colle, scellant, ruban, membrane, fixations, solins, finition) ni la sécurité ou la protection au besoin; respecte le Code de construction du Québec (vapeur, isolation, étanchéité).
Prix: estimation réaliste en $ CA avant taxes, par unité d'achat, au prix courant d'une grande quincaillerie. Sois honnête: c'est une estimation, pas un prix garanti.`;

const withTimeout = <T,>(p: Promise<T>) =>
  new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout: l’IA ne répond pas')), 60000);
    p.then(
      (v) => {
        clearTimeout(t);
        res(v);
      },
      (e) => {
        clearTimeout(t);
        rej(e);
      },
    );
  });

async function generate(parts: (string | Part)[], schema: ReturnType<typeof Schema.object>): Promise<unknown> {
  const app = firebaseApp();
  if (!app) throw new Error('Firebase n’est pas configuré');
  const ai = getAI(app, { backend: new VertexAIBackend('global') });
  let last: unknown;
  for (const m of MODELS) {
    try {
      const model = getGenerativeModel(
        ai,
        { model: m, systemInstruction: SYSTEM, generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: schema } },
        { timeout: Math.max(AI_TIMEOUT_MS, 60000) },
      );
      const r = await withTimeout(model.generateContent(parts));
      return JSON.parse(r.response.text());
    } catch (e) {
      last = e;
      if (!notFound(e) && !overQuota(e)) throw e;
    }
  }
  throw last;
}

const imgParts = (photos: string[]): Part[] => photos.map((p) => ({ inlineData: { mimeType: 'image/jpeg', data: p.replace(/^data:image\/\w+;base64,/, '') } }));

/** Réduit une photo (max 1280 px, JPEG) pour l'envoyer à l'IA sans exploser les données du cell. */
export async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Photo illisible'));
      i.src = url;
    });
    const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Étape 1: l'IA regarde les photos, lit la description et pose les questions qui manquent. */
export async function askQuestions(job: string, photos: string[]): Promise<{ summary: string; questions: EstQuestion[] }> {
  const schema = Schema.object({
    properties: {
      summary: Schema.string({ description: 'Ce que tu as compris du projet, en une ou deux phrases' }),
      questions: Schema.array({
        items: Schema.object({
          properties: {
            id: Schema.string(),
            question: Schema.string(),
            type: Schema.enumString({ enum: ['choix', 'nombre', 'texte'] }),
            options: Schema.array({ items: Schema.string() }),
            unit: Schema.string({ description: 'Unité si la réponse est un nombre (pi, pi², po…)' }),
          },
          optionalProperties: ['options', 'unit'],
        }),
      }),
    },
  });
  const prompt = `Projet décrit par l'entrepreneur:
« ${job} »
${photos.length ? `${photos.length} photo(s) jointe(s): observe l'état actuel, les matériaux en place, les obstacles et ce qu'on peut estimer.\n` : ''}
Pose entre 4 et 10 questions COURTES et utiles pour calculer les matériaux avec précision (dimensions: longueurs, hauteurs, nombre d'ouvertures; choix de matériaux ou de finition; options comme plancher chauffant, isolation, type de support; état actuel). Ne repose pas une information déjà donnée ou visible sur les photos. Pour un choix, donne 2 à 5 options. Pour une dimension, type « nombre » avec l'unité.`;
  const r = (await generate([prompt, ...imgParts(photos)], schema)) as { summary?: string; questions?: EstQuestion[] };
  return {
    summary: r.summary ?? '',
    questions: (r.questions ?? []).filter((q) => q.question).slice(0, 12).map((q, i) => ({ ...q, id: q.id || `q${i}` })),
  };
}

/** Étape 2: la liste complète des matériaux avec quantités, prix estimés et heures. */
export async function estimateMaterials(job: string, photos: string[], answers: { question: string; answer: string }[], extra = ''): Promise<EstResult> {
  const schema = Schema.object({
    properties: {
      summary: Schema.string(),
      materials: Schema.array({
        items: Schema.object({
          properties: {
            name: Schema.string({ description: 'Nom clair du produit avec le format, ex.: « Membrane Schluter Kerdi, rouleau 5 x 3,28 pi »' }),
            query: Schema.string({ description: '2 à 5 mots génériques en français pour chercher ce produit chez un fournisseur, sans marque' }),
            category: Schema.string(),
            quantity: Schema.number(),
            unit: Schema.string(),
            unit_price: Schema.number({ description: '$ CA par unité d’achat, avant taxes (estimation)' }),
            note: Schema.string({ description: 'Détail utile: pertes comptées, calcul rapide, variante' }),
          },
          optionalProperties: ['note'],
        }),
      }),
      hours: Schema.number({ description: 'Heures de main-d’œuvre estimées (total des heures-personne)' }),
      tips: Schema.array({ items: Schema.string() }),
      assumptions: Schema.array({ items: Schema.string() }),
    },
  });
  const prompt = `Projet:
« ${job} »

Réponses de l'entrepreneur:
${answers.map((a) => `- ${a.question} → ${a.answer || '(non précisé)'}`).join('\n') || '(aucune)'}
${extra ? `\nPrécisions: ${extra}\n` : ''}${photos.length ? `\n${photos.length} photo(s) jointe(s).\n` : ''}
Produis la liste COMPLÈTE des matériaux à acheter pour réaliser ce projet, regroupés par catégorie, avec quantités arrondies à l'unité d'achat (boîtes, rouleaux, feuilles…), prix estimés, les heures de main-d'œuvre, 3 à 6 conseils (pièges, ordre des travaux, permis ou normes à vérifier) et tes hypothèses (ce que tu as supposé faute d'information).`;
  const r = (await generate([prompt, ...imgParts(photos)], schema)) as {
    summary?: string;
    hours?: number;
    tips?: string[];
    assumptions?: string[];
    materials?: { name: string; query?: string; category?: string; quantity: number; unit?: string; unit_price?: number; note?: string }[];
  };
  return {
    summary: r.summary ?? '',
    hours: Math.max(0, Number(r.hours) || 0),
    tips: r.tips ?? [],
    assumptions: r.assumptions ?? [],
    materials: (r.materials ?? [])
      .filter((m) => m.name)
      .map((m) => ({
        name: m.name,
        query: m.query || m.name,
        category: m.category || 'Matériaux',
        qty: Math.max(0, Number(m.quantity) || 0),
        unit: m.unit || 'unité',
        price: Math.max(0, Number(m.unit_price) || 0),
        note: m.note,
        source: 'estime' as const,
      })),
  };
}

export interface ProductSearch {
  text: string; // ce que Google a trouvé (produits et prix lus sur les pages)
  sources: { title: string; domain: string; url: string }[];
}

/** Cherche de vrais produits (magasin, nom, prix lu sur la page) avec la recherche Google. Les liens viennent de Google, jamais inventés. */
export async function findProducts(m: { name: string; query: string; unit: string }): Promise<ProductSearch> {
  const app = firebaseApp();
  if (!app) throw new Error('Firebase n’est pas configuré');
  const ai = getAI(app, { backend: new VertexAIBackend('global') });
  const prompt = `Trouve des produits RÉELS à acheter au Québec (Canada) pour: « ${m.name} » (mots clés: ${m.query}; unité d'achat: ${m.unit}).
Cherche sur les sites de Home Depot Canada, Rona, BMR, Canac, Patrick Morin, Canadian Tire. Réponds en français avec 3 à 5 lignes, une par produit, au format:
• Magasin — Nom exact du produit (format) — prix en $ CA
Règles: n'écris un prix que s'il est lu dans les résultats de recherche; sinon écris « prix à confirmer ». N'invente aucun produit ni aucun prix. Aucun lien dans le texte.`;
  let last: unknown;
  for (const mod of MODELS) {
    try {
      const model = getGenerativeModel(ai, { model: mod, tools: [{ googleSearch: {} }], generationConfig: { temperature: 0.1 } }, { timeout: 60000 });
      const r = await withTimeout(model.generateContent(prompt));
      const gm = r.response.candidates?.[0]?.groundingMetadata;
      const seen = new Set<string>();
      const sources = (gm?.groundingChunks ?? [])
        .map((c) => c.web)
        .filter((w): w is NonNullable<typeof w> => !!w?.uri)
        .map((w) => ({ title: w.title ?? w.domain ?? 'Page', domain: w.domain ?? w.title ?? '', url: w.uri as string }))
        .filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)))
        .slice(0, 8);
      return { text: r.response.text().trim(), sources };
    } catch (e) {
      last = e;
      if (!notFound(e) && !overQuota(e)) throw e;
    }
  }
  throw last;
}
