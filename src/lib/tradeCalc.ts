// Calculs de matériaux par métier (peinture, céramique, gypse, plancher, paillis, gouttières, ménage).
// Fonctions pures, testées: tests/tradeCalc.test.ts. Les rendements par défaut sont des moyennes
// de l'industrie au Québec; chaque calculateur permet de les ajuster.

export interface Material {
  description: string;
  qty: number;
  unit: string;
}

const ceil = (n: number) => Math.ceil(n - 1e-9);
const r1 = (n: number) => Math.round(n * 10) / 10;
export const L_PER_GAL = 3.785;

// ---------------------------------------------------------------- Peinture

export interface Room {
  name: string;
  length: number; // pi
  width: number; // pi
  height: number; // pi
  doors: number;
  windows: number;
  ceiling: boolean;
}
export interface PaintInput {
  rooms: Room[];
  extraArea: number; // pi² ajoutés à la main (murs extérieurs, corridors…)
  coats: number;
  coverage: number; // pi² par gallon (≈ 350-400)
  primer: boolean; // une couche d'apprêt (≈ 300 pi²/gal)
  margin: number; // % de marge (retouches, absorption)
  inStock: number; // gallons déjà en main (restes de la même couleur)
}
export const DOOR_SQFT = 21; // porte standard 3 × 7
export const WINDOW_SQFT = 15;

export interface PaintBuy {
  pails: number; // chaudières de 5 gallons (18,9 L)
  gallons: number; // gallons (3,78 L)
  quarts: number; // pintes (0,95 L)
  total: number; // gallons achetés
}
export interface PaintResult {
  wallArea: number;
  ceilingArea: number;
  wallGallons: number;
  ceilingGallons: number;
  primerGallons: number;
  wallBuy: PaintBuy;
  ceilingBuy: PaintBuy;
  primerBuy: PaintBuy;
  leftover: number; // gallons qui vont rester (murs + plafonds + apprêt)
  materials: Material[];
}

/** Format le moins cher pour une quantité (chaudières de 5 gal, puis gallons, puis pintes). */
export function paintBuy(need: number): PaintBuy {
  if (need <= 0) return { pails: 0, gallons: 0, quarts: 0, total: 0 };
  let pails = Math.floor(need / 5);
  let rest = need - pails * 5;
  // 4 gallons et plus: une chaudière de plus coûte moins cher
  if (rest > 3.5) {
    pails += 1;
    rest = 0;
  }
  let gallons = Math.floor(rest + 1e-9);
  const frac = rest - gallons;
  let quarts = 0;
  if (frac > 0.5 + 1e-9) gallons += 1;
  else if (frac > 1e-9) quarts = ceil(frac / 0.25);
  return { pails, gallons, quarts, total: pails * 5 + gallons + quarts * 0.25 };
}

export function roomWallArea(r: Room): number {
  const area = 2 * (r.length + r.width) * r.height - r.doors * DOOR_SQFT - r.windows * WINDOW_SQFT;
  return Math.max(0, area);
}

export function paintCalc(i: PaintInput): PaintResult {
  const wallArea = Math.round(i.rooms.reduce((a, r) => a + roomWallArea(r), 0) + Math.max(0, i.extraArea));
  const ceilingArea = Math.round(i.rooms.filter((r) => r.ceiling).reduce((a, r) => a + r.length * r.width, 0));
  const m = 1 + Math.max(0, i.margin) / 100;
  const cov = i.coverage > 0 ? i.coverage : 375;
  const wallGallons = r1((wallArea * Math.max(1, i.coats) * m) / cov);
  const ceilingGallons = r1((ceilingArea * Math.max(1, i.coats) * m) / cov);
  const primerGallons = i.primer ? r1(((wallArea + ceilingArea) * m) / 300) : 0;
  const wallBuy = paintBuy(Math.max(0, wallGallons - Math.max(0, i.inStock)));
  const ceilingBuy = paintBuy(ceilingGallons);
  const primerBuy = paintBuy(primerGallons);
  // Ce qui reste après la job: achats + restes déjà en main − ce qui est utilisé
  const leftover = r1(wallBuy.total + Math.max(0, i.inStock) - wallGallons + ceilingBuy.total - ceilingGallons + primerBuy.total - primerGallons);
  const materials: Material[] = [];
  const add = (label: string, b: PaintBuy) => {
    if (b.pails) materials.push({ description: label, qty: b.pails, unit: 'chaudière de 5 gal' });
    if (b.gallons) materials.push({ description: label, qty: b.gallons, unit: 'gallon' });
    if (b.quarts) materials.push({ description: label, qty: b.quarts, unit: 'pinte' });
  };
  add('Peinture murs', wallBuy);
  add('Peinture plafond', ceilingBuy);
  add('Apprêt', primerBuy);
  return { wallArea, ceilingArea, wallGallons, ceilingGallons, primerGallons, wallBuy, ceilingBuy, primerBuy, leftover: Math.max(0, leftover), materials };
}

/** « 2 gallons », « 3 chaudières de 5 gal », « 4 rouleaux » — les unités de mesure (pi lin, verge³) restent. */
export function plural(unit: string, qty: number): string {
  if (qty <= 1 || !unit) return unit;
  const [first, ...rest] = unit.split(' ');
  if (/[sx³²]$/.test(first) || /^(pi|po|lb|kg|l|ml|m)$/i.test(first)) return unit;
  return [first + (/eau$/.test(first) ? 'x' : 's'), ...rest].join(' ');
}

export const buyLabel = (b: PaintBuy) =>
  [b.pails && `${b.pails} chaudière${b.pails > 1 ? 's' : ''} de 5 gal`, b.gallons && `${b.gallons} gallon${b.gallons > 1 ? 's' : ''}`, b.quarts && `${b.quarts} pinte${b.quarts > 1 ? 's' : ''}`]
    .filter(Boolean).join(' + ') || 'rien à acheter';

// ---------------------------------------------------------------- Céramique

export interface TileInput { area: number; waste: number; boxCoverage: number }
export function tileCalc(i: TileInput) {
  const area = Math.max(0, i.area);
  const withWaste = area * (1 + Math.max(0, i.waste) / 100);
  const boxes = i.boxCoverage > 0 ? ceil(withWaste / i.boxCoverage) : 0;
  const thinset = ceil(area / 60); // sac de 50 lb ≈ 60 pi² (truelle 1/4 × 3/8)
  const grout = ceil(area / 75); // sac de 10 lb ≈ 75 pi² (joints 1/8 po)
  const materials: Material[] = [
    { description: 'Tuiles de céramique (boîtes)', qty: boxes, unit: 'boîte' },
    { description: 'Colle (mortier-colle) 50 lb', qty: thinset, unit: 'sac' },
    { description: 'Coulis 10 lb', qty: grout, unit: 'sac' },
  ].filter((m) => m.qty > 0);
  return { area: Math.round(area), withWaste: Math.round(withWaste), boxes, thinset, grout, materials };
}

// ---------------------------------------------------------------- Gypse

export interface DrywallInput { wallArea: number; ceilingArea: number; sheetSize: 32 | 48; waste: number }
export function drywallCalc(i: DrywallInput) {
  const area = Math.max(0, i.wallArea) + Math.max(0, i.ceilingArea);
  const sheets = ceil((area * (1 + Math.max(0, i.waste) / 100)) / i.sheetSize);
  const screwBoxes = ceil((sheets * (i.sheetSize === 48 ? 45 : 32)) / 1000); // ≈ 1 vis / pi²
  const mudPails = ceil(sheets / 12); // chaudière de composé ≈ 12 feuilles
  const tapeRolls = ceil((area * 0.37) / 250); // ≈ 370 pi de ruban / 1000 pi², rouleau 250 pi
  const materials: Material[] = [
    { description: `Feuilles de gypse 4 × ${i.sheetSize === 48 ? 12 : 8}`, qty: sheets, unit: 'feuille' },
    { description: 'Vis à gypse (boîte de 1000)', qty: screwBoxes, unit: 'boîte' },
    { description: 'Composé à joints (chaudière)', qty: mudPails, unit: 'chaudière' },
    { description: 'Ruban à joints 250 pi', qty: tapeRolls, unit: 'rouleau' },
  ].filter((m) => m.qty > 0);
  return { area: Math.round(area), sheets, screwBoxes, mudPails, tapeRolls, materials };
}

// ---------------------------------------------------------------- Plancher

export interface FloorInput { length: number; width: number; waste: number; boxCoverage: number; underlay: boolean }
export function floorCalc(i: FloorInput) {
  const area = Math.max(0, i.length) * Math.max(0, i.width);
  const boxes = i.boxCoverage > 0 ? ceil((area * (1 + Math.max(0, i.waste) / 100)) / i.boxCoverage) : 0;
  const underlayRolls = i.underlay ? ceil((area * 1.05) / 100) : 0; // rouleau ≈ 100 pi²
  const moulding = ceil(2 * (Math.max(0, i.length) + Math.max(0, i.width)) * 1.1); // plinthes + 10 %
  const materials: Material[] = [
    { description: 'Plancher (boîtes)', qty: boxes, unit: 'boîte' },
    { description: 'Sous-plancher (rouleau 100 pi²)', qty: underlayRolls, unit: 'rouleau' },
    { description: 'Moulures / quart-de-rond', qty: moulding, unit: 'pi lin' },
  ].filter((m) => m.qty > 0);
  return { area: Math.round(area), boxes, underlayRolls, moulding, materials };
}

// ---------------------------------------------------------------- Paillis / terre / gravier

export interface MulchInput { area: number; depthIn: number; bagCuFt: number }
export function mulchCalc(i: MulchInput) {
  const cuFt = (Math.max(0, i.area) * Math.max(0, i.depthIn)) / 12;
  const yards = r1(cuFt / 27);
  const bags = i.bagCuFt > 0 ? ceil(cuFt / i.bagCuFt) : 0;
  const materials: Material[] = [
    { description: 'En vrac', qty: yards, unit: 'verge³' },
  ].filter((m) => m.qty > 0);
  return { cuFt: r1(cuFt), yards, bags, materials, bagMaterials: [{ description: `Sacs de ${i.bagCuFt} pi³`, qty: bags, unit: 'sac' }] as Material[] };
}

// ---------------------------------------------------------------- Gouttières

export interface GutterInput { length: number; width: number; storeys: number }
export function gutterCalc(i: GutterInput) {
  // Gouttières sur les deux longs côtés; une descente par 35 pi de gouttière (minimum 2)
  const gutters = ceil(2 * Math.max(0, i.length) * 1.05);
  const downspouts = Math.max(2, ceil(gutters / 35));
  const downspoutFt = downspouts * (Math.max(1, i.storeys) * 10 + 2);
  const materials: Material[] = [
    { description: 'Gouttière', qty: gutters, unit: 'pi lin' },
    { description: 'Descente pluviale', qty: downspoutFt, unit: 'pi lin' },
    { description: 'Coudes', qty: downspouts * 3, unit: 'unité' },
    { description: 'Bouts de gouttière', qty: 4, unit: 'unité' },
  ];
  return { gutters, downspouts, downspoutFt, materials };
}

// ---------------------------------------------------------------- Ménage

export interface CleanInput { area: number; kind: 'regulier' | 'grand' | 'construction'; workers: number }
export const CLEAN_RATE: Record<CleanInput['kind'], number> = { regulier: 650, grand: 350, construction: 250 }; // pi² / heure / personne
export function cleanCalc(i: CleanInput) {
  const hours = Math.max(0, i.area) / CLEAN_RATE[i.kind];
  const perWorker = hours / Math.max(1, i.workers);
  const round = (h: number) => Math.ceil(h * 4) / 4; // au quart d'heure
  return { hours: round(hours), duration: round(perWorker) };
}
