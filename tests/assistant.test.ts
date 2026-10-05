// Test de l'assistant: node --experimental-strip-types tests/assistant.test.ts
import assert from 'node:assert/strict';
import { detectIntent } from '../src/lib/assistant.ts';

const C = [{ id: 1, name: 'Véronique Girard' }, { id: 2, name: 'Mme Roy' }, { id: 3, name: 'Famille Gagnon' }];
const T = '2026-10-05';
const d = (t: string) => detectIntent(t, C, T);

assert.deepEqual([d('facture la job de Girard').kind, d('facture la job de Girard').clientId], ['facturer', 1]);
assert.deepEqual(d('Roy a payé en comptant'), { kind: 'payee', clientId: 2, method: 'Comptant' });
assert.deepEqual(d('j’ai reçu le paiement de Gagnon par virement'), { kind: 'payee', clientId: 3, method: 'Virement Interac' });
assert.equal(d('relance les factures en retard').kind, 'relancer');
assert.deepEqual(d('45 $ d’essence chez Petro-Canada'), { kind: 'depense', amount: 45, category: 'Essence', vendor: 'Petro-Canada' });
assert.deepEqual(d('dépense de 120,50 au Home Depot pour du bois'), { kind: 'depense', amount: 120.5, category: 'Matériaux', vendor: 'Home Depot' });
assert.deepEqual(d('déplace la job de Roy à vendredi'), { kind: 'deplacer', clientId: 2, date: '2026-10-09', time: undefined });
assert.deepEqual(d('reporte Girard à demain 13 h'), { kind: 'deplacer', clientId: 1, date: '2026-10-06', time: '13:00' });
assert.deepEqual(d('j’ai fini la job chez Gagnon'), { kind: 'fini', clientId: 3 });
assert.deepEqual(d('combien j’ai fait ce mois-ci'), { kind: 'combien', period: 'mois' });
assert.deepEqual(d('combien cette semaine'), { kind: 'combien', period: 'semaine' });
assert.deepEqual(d('c’est quoi mon horaire demain'), { kind: 'horaire', date: '2026-10-06', period: 'jour' });
assert.equal(d('qu’est-ce que j’ai à faire').kind, 'afaire');
assert.equal(d('Véronique Girard 12 rue des Pins à Laval entretien de gouttières 60 pieds linéaires mardi à 9 h').kind, 'planifier');
assert.equal(d('Planifie une visite chez Sylvie Roy 88 chemin du Lac jeudi à 10 h').kind, 'planifier');
console.log('assistant: 15 cas OK');
