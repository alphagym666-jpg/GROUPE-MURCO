// Test de l'analyse de la dictée: node --experimental-strip-types tests/voice.test.ts
import assert from 'node:assert/strict';
import { parseDictation } from "../src/lib/voice.ts";

const S = [
  ['NDG', 'Nettoyage de gouttières', 'pi lin'], ['PGM', 'Protège-gouttières — matériel', 'pi lin'], ['PGI', 'Protège-gouttières — installation', 'pi lin'],
  ['LAP', 'Lavage à pression — revêtement', 'pi²'], ['LVE', 'Lavage de vitres extérieures', 'fenêtre'], ['SUP', 'Supplément hauteur (2e / 3e étage)', 'fenêtre'],
  ['RAM', 'Ramassage de feuilles / fermeture de terrain', 'pi²'], ['SAC', 'Sacs de feuilles (fourniture + disposition)', 'sac'],
  ['HR', 'Main-d’œuvre à l’heure', 'heure'], ['DEP', 'Frais de déplacement', 'forfait'],
].map(([code, name, unit]) => ({ code, name, unit }));
const C = [{ id: 1, name: 'Mme Tremblay' }, { id: 2, name: 'Jean Gagnon' }];

const cases: [string, number | undefined, [string, number][]][] = [
  ['NDG 120 pieds et lavage de vitres 12 fenêtres chez Tremblay', 1, [['NDG', 120], ['LVE', 12]]],
  ['Nettoyage de gouttières cent vingt pieds pour Gagnon', 2, [['NDG', 120]]],
  ['protège-gouttières matériel 80 pieds et installation 80 pieds', undefined, [['PGM', 80], ['PGI', 80]]],
  ['lavage à pression 1440 pieds carrés, 5 sacs de feuilles', undefined, [['LAP', 1440], ['SAC', 5]]],
  ['n d g 150 lve 20 sup 6', undefined, [['NDG', 150], ['LVE', 20], ['SUP', 6]]],
  ['deux heures de main-d\'œuvre et déplacement', undefined, [['HR', 2], ['DEP', 1]]],
];
for (const [text, client, lines] of cases) {
  const r = parseDictation(text, S, C);
  assert.equal(r.clientId, client, text);
  assert.deepEqual(r.lines.map((l) => [l.code, l.quantity]), lines, text);
}
console.log(`dictée: ${cases.length} cas OK`);
