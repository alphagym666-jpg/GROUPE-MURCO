// Test de la commande vocale complète: node --experimental-strip-types tests/voiceJob.test.ts
import assert from 'node:assert/strict';
import { parseJobCommand } from '../src/lib/voiceJob.ts';

const S = [
  ['NDG', 'Nettoyage de gouttières', 'pi lin'], ['PGM', 'Protège-gouttières — matériel', 'pi lin'], ['PGI', 'Protège-gouttières — installation', 'pi lin'],
  ['LAP', 'Lavage à pression — revêtement', 'pi²'], ['LVE', 'Lavage de vitres extérieures', 'fenêtre'], ['HR', 'Main-d’œuvre à l’heure', 'heure'],
].map(([code, name, unit]) => ({ code, name, unit }));
const C = [{ id: 1, name: 'Mme Tremblay' }, { id: 2, name: 'Jean Gagnon' }, { id: 3, name: 'Mme Roy' }];
const today = '2026-10-05'; // lundi

const a = parseJobCommand('Véronique Girard 12 rue des Pins à Laval entretien de gouttières 60 pieds linéaires mardi à 9 h', S, C, today);
assert.equal(a.clientName, 'Véronique Girard');
assert.equal(a.isNew, true);
assert.equal(a.address, '12 rue des Pins, Laval');
assert.equal(a.date, '2026-10-06');
assert.equal(a.time, '09:00');
assert.deepEqual(a.lines, [{ code: 'NDG', quantity: 60 }]);

const b = parseJobCommand('nouveau client Marc-André Côté, 450 555 1234, 3450 boulevard Saint-Martin Ouest, Laval, lavage de vitres 14 fenêtres demain matin', S, C, today);
assert.equal(b.clientName, 'Marc-André Côté');
assert.equal(b.phone, '450-555-1234');
assert.equal(b.address, '3450 boulevard Saint-Martin Ouest, Laval');
assert.equal(b.date, '2026-10-06');
assert.equal(b.time, '08:00');
assert.deepEqual(b.lines, [{ code: 'LVE', quantity: 14 }]);

const c = parseJobCommand('chez Tremblay nettoyage de gouttières cent vingt pieds le 14 octobre en après-midi', S, C, today);
assert.equal(c.clientId, 1);
assert.equal(c.isNew, false);
assert.equal(c.date, '2026-10-14');
assert.equal(c.time, '13:00');
assert.deepEqual(c.lines, [{ code: 'NDG', quantity: 120 }]);

const d = parseJobCommand('Sylvie Roy 88 chemin du Lac Sherrington protège-gouttières matériel 80 pieds et installation 80 pieds vendredi', S, C, today);
assert.equal(d.clientName, 'Sylvie Roy');
assert.equal(d.isNew, true);
assert.equal(d.address, '88 chemin du Lac Sherrington');
assert.equal(d.date, '2026-10-09');
assert.deepEqual(d.lines, [{ code: 'PGM', quantity: 80 }, { code: 'PGI', quantity: 80 }]);

const e = parseJobCommand('Planifie une visite chez Véronique Girard 12 rue des Pins Laval jeudi à 10 h', S, C, today);
assert.equal(e.kind, 'visite');
assert.equal(e.clientName, 'Véronique Girard');
assert.equal(e.address, '12 rue des Pins Laval');
assert.equal(e.date, '2026-10-08');
assert.equal(e.time, '10:00');
assert.deepEqual(e.lines, []);

const f = parseJobCommand('mets une estimation pour Jean Gagnon demain après-midi', S, C, today);
assert.equal(f.kind, 'visite');
assert.equal(f.clientId, 2);
assert.equal(f.date, '2026-10-06');
assert.equal(f.time, '13:00');
assert.equal(a.kind, 'job');

const g = parseJobCommand('chez Roy lavage de vitres 10 fenêtres demain', S, C, today);
assert.equal(g.clientId, 3);
console.log('commande vocale: 7 cas OK');
