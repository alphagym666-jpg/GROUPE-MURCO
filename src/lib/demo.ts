import { db, getSettings, takeNextNumber } from './db';
import { addDays, todayISO } from './utils';

// Exemple pour essayer l'app en 30 secondes: un client, une soumission et une job d'aujourd'hui.
// Tout est marqué « [exemple] » pour pouvoir le retirer d'un clic, sans toucher aux vraies données.
const TAG = '[exemple]';

export async function countDemo(): Promise<number> {
  return db.clients.filter((c) => c.notes === TAG).count();
}

export async function loadDemo(): Promise<void> {
  if ((await countDemo()) > 0) return;
  const s = await getSettings();
  const today = todayISO();
  const now = new Date().toISOString();
  const clientId = (await db.clients.add({
    name: 'Nathalie Tremblay (exemple)', contact: 'Nathalie Tremblay', email: '', phone: '', address: '123 rue des Érables, Saint-Jean-sur-Richelieu', notes: TAG, createdAt: now,
  })) as number;
  const items = [
    { description: 'Nettoyage de gouttières', unit: 'pi lin', quantity: 120, unitPrice: 1.5, minimum: 150 },
    { description: 'Lavage de vitres', unit: 'fenêtre', quantity: 12, unitPrice: 8 },
  ];
  const number = await takeNextNumber('quote');
  await db.docs.add({
    type: 'quote', number, clientId, date: today, dueDate: addDays(today, s.quoteValidityDays || 30), jobDate: '', jobAddress: '123 rue des Érables, Saint-Jean-sur-Richelieu',
    title: 'Exemple de soumission', items, applyTps: s.chargeTaxes, applyTvq: s.chargeTaxes, notes: TAG, status: 'draft', payments: [], createdAt: now, updatedAt: now,
  });
  await db.jobs.add({
    date: today, time: '09:00', durationMin: 90, clientId, address: '123 rue des Érables, Saint-Jean-sur-Richelieu', title: 'Exemple de job', items: [], notes: TAG,
    status: 'planifie', order: 0, recurrence: 'none', createdAt: now,
  });
}

export async function clearDemo(): Promise<void> {
  const ids = (await db.clients.filter((c) => c.notes === TAG).toArray()).map((c) => c.id!).filter(Boolean);
  for (const id of ids) {
    await db.docs.where('clientId').equals(id).delete();
    await db.jobs.where('clientId').equals(id).delete();
    await db.clients.delete(id);
  }
}
