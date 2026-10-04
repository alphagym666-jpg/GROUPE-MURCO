// Test de la lecture des reçus: node --experimental-strip-types tests/receipt.test.ts
import assert from 'node:assert/strict';
import { parseReceipt, findDate, amountsIn } from '../src/lib/receiptParse.ts';

const today = new Date(2026, 9, 4);
const cases: [string, Partial<ReturnType<typeof parseReceipt>>][] = [
  [`PETRO-CANADA
1234 BOUL. LABELLE
BLAINVILLE QC
2026/10/02 14:31
POMPE 4  ORDINAIRE
45,123 L @ 1,689 $/L
SOUS-TOTAL      66,28
TPS 123456789   3,31
TVQ 1234567890  6,61
TOTAL          76,20 $
VISA          76,20`, { vendor: 'Petro-Canada', category: 'Essence', total: 76.2, subtotal: 66.28, tps: 3.31, tvq: 6.61, date: '2026-10-02' }],
  [`RONA L'ENTREPOT
Sherrington
02/10/26  09:12
VIS A BOIS #8 x 2     12.98
GOUTTIERE ALU 10PI    34.99
Sub-total             47.97
GST/TPS 5%             2.40
QST/TVQ 9.975%         4.79
TOTAL                 55.16
DEBIT                 55.16`, { vendor: 'Rona', category: 'Matériaux', total: 55.16, tps: 2.4, tvq: 4.79, date: '2026-10-02' }],
  [`Tim Hortons #1234
Oct 3, 2026 7:45 AM
1 Grand café     2,45
1 Bagel          3,10
Total            6,38`, { vendor: 'Tim Hortons', category: 'Repas', total: 6.38, date: '2026-10-03' }],
  [`QUINCAILLERIE BEAUDOIN
3 OCT 2026
Montant à payer  1 234,56 $`, { category: 'Matériaux', total: 1234.56, date: '2026-10-03' }],
];
for (const [text, exp] of cases) {
  const g = parseReceipt(text, today);
  for (const [k, v] of Object.entries(exp)) assert.deepEqual((g as Record<string, unknown>)[k], v, `${k} — ${text.split('\n')[0]} → ${JSON.stringify(g)}`);
}
assert.deepEqual(amountsIn('TOTAL 1 234,56 $ et 12.30'), [1234.56, 12.3]);
assert.equal(findDate('le 31/12/2027', today), undefined); // futur
console.log(`reçus: ${cases.length} cas OK`);
