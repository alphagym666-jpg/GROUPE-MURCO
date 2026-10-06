// Recherche de clients tolérante aux fautes de dictée: node --experimental-strip-types tests/fuzzy.test.ts
import assert from 'node:assert/strict';
import { findClients } from '../src/lib/fuzzy.ts';

const C = [{ id: 1, name: 'Denise Lapointe' }, { id: 2, name: 'Mme Roy' }, { id: 3, name: 'Philippe Gagnon' }, { id: 4, name: 'Clinique Bouchard' }];
assert.equal(findClients('Deniz', C)[0].id, 1);
assert.equal(findClients('Dénise', C)[0].id, 1);
assert.equal(findClients('Lapoint', C)[0].id, 1);
assert.equal(findClients('Filip Gagnon', C)[0].id, 3);
assert.equal(findClients('madame Roy', C)[0].id, 2);
assert.equal(findClients('Boucharde', C)[0].id, 4);
assert.deepEqual(findClients('Tremblay', C), []);
console.log('recherche de clients: 7 cas OK');
