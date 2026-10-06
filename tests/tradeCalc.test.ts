// Calculs de matériaux par métier: node --experimental-strip-types tests/tradeCalc.test.ts
import assert from 'node:assert/strict';
import { plural, drywallCalc, floorCalc, gutterCalc, mulchCalc, paintBuy, paintCalc, tileCalc, cleanCalc } from '../src/lib/tradeCalc.ts';

// Formats d'achat: 4 gal et plus → une chaudière; une fraction ≤ ½ → des pintes
assert.deepEqual(paintBuy(2.2), { pails: 0, gallons: 2, quarts: 1, total: 2.25 });
assert.deepEqual(paintBuy(2.7), { pails: 0, gallons: 3, quarts: 0, total: 3 });
assert.deepEqual(paintBuy(3.8), { pails: 1, gallons: 0, quarts: 0, total: 5 });
assert.deepEqual(paintBuy(6), { pails: 1, gallons: 1, quarts: 0, total: 6 });
assert.equal(paintBuy(0).total, 0);

// Chambre 12 × 10 × 8, 1 porte, 1 fenêtre, plafond, 2 couches, 375 pi²/gal, sans marge
const room = { name: 'Chambre', length: 12, width: 10, height: 8, doors: 1, windows: 1, ceiling: true };
const p = paintCalc({ rooms: [room], extraArea: 0, coats: 2, coverage: 375, primer: false, margin: 0, inStock: 0 });
assert.equal(p.wallArea, 316); // 2 × 22 × 8 − 21 − 15
assert.equal(p.ceilingArea, 120);
assert.equal(p.wallGallons, 1.7);
assert.deepEqual(p.wallBuy, { pails: 0, gallons: 2, quarts: 0, total: 2 });
assert.equal(p.ceilingGallons, 0.6);
assert.equal(p.leftover, 0.7); // 0,3 murs + 0,4 plafond
// Avec 1 gallon de reste de la même couleur: on en achète moins
const p2 = paintCalc({ rooms: [room], extraArea: 0, coats: 2, coverage: 375, primer: false, margin: 0, inStock: 1 });
assert.equal(p2.wallBuy.total, 1); // 0,7 gal manquant → 1 gallon (moins cher que 3 pintes)
assert.equal(p2.leftover, 0.7);
const p3 = paintCalc({ rooms: [room], extraArea: 0, coats: 2, coverage: 375, primer: false, margin: 0, inStock: 1.4 });
assert.deepEqual(p3.wallBuy, { pails: 0, gallons: 0, quarts: 2, total: 0.5 }); // 0,3 gal manquant → 2 pintes

const t = tileCalc({ area: 100, waste: 10, boxCoverage: 12 });
assert.equal(t.boxes, 10); // 110 / 12 = 9,2 → 10
assert.equal(t.thinset, 2);
assert.equal(t.grout, 2);

const d = drywallCalc({ wallArea: 800, ceilingArea: 200, sheetSize: 32, waste: 10 });
assert.equal(d.sheets, 35); // 1100 / 32 = 34,4
assert.equal(d.mudPails, 3);

const f = floorCalc({ length: 15, width: 12, waste: 10, boxCoverage: 20, underlay: true });
assert.equal(f.area, 180);
assert.equal(f.boxes, 10); // 198 / 20
assert.equal(f.underlayRolls, 2);
assert.equal(f.moulding, 60); // 54 × 1,1 = 59,4

const m = mulchCalc({ area: 300, depthIn: 3, bagCuFt: 2 });
assert.equal(m.cuFt, 75);
assert.equal(m.yards, 2.8);
assert.equal(m.bags, 38);

const g = gutterCalc({ length: 40, width: 28, storeys: 2 });
assert.equal(g.gutters, 84);
assert.equal(g.downspouts, 3);

assert.deepEqual(cleanCalc({ area: 1300, kind: 'regulier', workers: 2 }), { hours: 2, duration: 1 });
assert.equal(plural('gallon', 2), 'gallons');
assert.equal(plural('chaudière de 5 gal', 3), 'chaudières de 5 gal');
assert.equal(plural('rouleau', 2), 'rouleaux');
assert.equal(plural('pi lin', 60), 'pi lin');
assert.equal(plural('verge³', 3), 'verge³');
assert.equal(plural('boîte', 1), 'boîte');
console.log('calculs par métier: 32 cas OK');
