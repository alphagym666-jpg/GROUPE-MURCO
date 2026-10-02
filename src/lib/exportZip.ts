import JSZip from 'jszip';
import { db, getSettings, type Client } from './db';
import { buildLogbookPdf, buildSummaryPdf, docFileName, docPdfBlob } from './pdf';
import { docTotals, formatDate, safeFileName, STATUS_LABELS, toCSV } from './utils';

export interface ExportOptions {
  from: string; // YYYY-MM-DD inclusif
  to: string;
  includeQuotes: boolean;
  includePhotos: boolean;
}

/**
 * Génère le dossier complet pour le comptable (ZIP):
 * sommaire PDF, factures PDF, reçus (photos), journal de bord PDF + CSV, et fichiers CSV/Excel.
 */
export async function buildAccountantZip(o: ExportOptions): Promise<{ blob: Blob; filename: string }> {
  const s = await getSettings();
  const inRange = (d: string) => d >= o.from && d <= o.to;
  const clients = new Map<number, Client>((await db.clients.toArray()).map((c) => [c.id!, c]));
  const docs = (await db.docs.toArray()).filter((d) => inRange(d.date));
  const invoices = docs.filter((d) => d.type === 'invoice').sort((a, b) => a.date.localeCompare(b.date));
  const quotes = docs.filter((d) => d.type === 'quote').sort((a, b) => a.date.localeCompare(b.date));
  const expenses = (await db.expenses.toArray()).filter((e) => inRange(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const trips = (await db.trips.toArray()).filter((t) => inRange(t.date)).sort((a, b) => a.date.localeCompare(b.date));

  const period = `${formatDate(o.from)} au ${formatDate(o.to)}`;
  const zip = new JSZip();
  const root = zip.folder(`Murco_${o.from}_au_${o.to}`)!;

  root.file(
    '00_Sommaire_comptable.pdf',
    buildSummaryPdf({ period, invoices: invoices.map((doc) => ({ doc, client: clients.get(doc.clientId) })), expenses, trips }, s),
  );

  // Factures
  const fInv = root.folder('01_Factures')!;
  const invRows: unknown[][] = [['No', 'Date', 'Échéance', 'Client', 'Description', 'Lieu', 'Montant des lignes', 'Rabais', 'Sous-total', 'TPS', 'TVQ', 'Total', 'Dépôt', 'Payé (incl. dépôt)', 'Solde', 'Statut', 'Codes']];
  for (const d of invoices) {
    const c = clients.get(d.clientId);
    fInv.file(docFileName(d, c), docPdfBlob(d, c, s));
    const tt = docTotals(d, s);
    invRows.push([d.number, d.date, d.dueDate, c?.name, d.title, d.jobAddress, tt.lines, tt.discount, tt.subtotal, tt.tps, tt.tvq, tt.total, tt.deposit, tt.paid, tt.balance, STATUS_LABELS[d.status], d.items.map((i) => i.code).filter(Boolean).join(' ')]);
  }
  root.file('Factures.csv', toCSV(invRows));

  if (o.includeQuotes && quotes.length) {
    const fQ = root.folder('02_Soumissions')!;
    const qRows: unknown[][] = [['No', 'Date', 'Client', 'Description', 'Sous-total', 'Total', 'Statut']];
    for (const d of quotes) {
      const c = clients.get(d.clientId);
      fQ.file(docFileName(d, c), docPdfBlob(d, c, s));
      const tt = docTotals(d, s);
      qRows.push([d.number, d.date, c?.name, d.title, tt.subtotal, tt.total, STATUS_LABELS[d.status]]);
    }
    root.file('Soumissions.csv', toCSV(qRows));
  }

  // Dépenses + reçus
  const fExp = root.folder('03_Recus_depenses')!;
  const expRows: unknown[][] = [['Date', 'Fournisseur', 'Catégorie', 'Sous-total', 'TPS', 'TVQ', 'Total', 'Paiement', 'Lieu', 'Km du domicile', 'Notes', 'Fichier reçu']];
  for (const e of expenses) {
    let fname = '';
    if (o.includePhotos && e.photo) {
      const ext = (e.photoName?.split('.').pop() || (e.photoType?.split('/')[1] ?? 'jpg')).toLowerCase();
      fname = `${e.date}_${safeFileName(e.category)}_${safeFileName(e.vendor || 'recu')}_${e.id}.${ext}`;
      fExp.folder(safeFileName(e.category))!.file(fname, e.photo);
      fname = `${safeFileName(e.category)}/${fname}`;
    }
    expRows.push([e.date, e.vendor, e.category, e.subtotal, e.tps, e.tvq, e.total, e.paymentMethod, e.locationLabel, e.kmFromHome ?? '', e.notes, fname]);
  }
  root.file('Depenses.csv', toCSV(expRows));

  // Journal de bord
  const fKm = root.folder('04_Journal_de_bord')!;
  fKm.file('Journal_de_bord.pdf', buildLogbookPdf(trips, s, period));
  const tripRows: unknown[][] = [['Date', 'Départ', 'Destination', 'Raison', 'Aller-retour', 'Km aller', 'Km total', 'Méthode']];
  trips.forEach((t) => tripRows.push([t.date, t.fromLabel, t.toLabel, t.reason, t.roundTrip ? 'Oui' : 'Non', t.oneWayKm, t.totalKm, t.distanceMethod]));
  fKm.file('Journal_de_bord.csv', toCSV(tripRows));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { blob, filename: `Murco_comptable_${o.from}_au_${o.to}.zip` };
}

/** Sauvegarde complète (incluant les photos) pour changer d'appareil ou se protéger. */
export async function buildBackup(): Promise<Blob> {
  const zip = new JSZip();
  const expenses = await db.expenses.toArray();
  const photos = zip.folder('photos')!;
  const expNoBlob = expenses.map((e) => {
    const { photo, ...rest } = e;
    if (photo) photos.file(String(e.id), photo);
    return { ...rest, hasPhoto: !!photo };
  });
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await db.settings.toArray(),
    clients: await db.clients.toArray(),
    docs: await db.docs.toArray(),
    trips: await db.trips.toArray(),
    expenses: expNoBlob,
    emails: await db.emails.toArray(),
    services: await db.services.toArray(),
  };
  zip.file('data.json', JSON.stringify(data));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export async function restoreBackup(file: Blob): Promise<void> {
  const zip = await JSZip.loadAsync(file);
  const json = await zip.file('data.json')?.async('string');
  if (!json) throw new Error('Fichier de sauvegarde invalide.');
  const data = JSON.parse(json);
  const expenses = await Promise.all(
    (data.expenses ?? []).map(async (e: Record<string, unknown>) => {
      const { hasPhoto, ...rest } = e;
      if (hasPhoto) {
        const f = zip.file(`photos/${e.id}`);
        if (f) return { ...rest, photo: new Blob([await f.async('arraybuffer')], { type: (e.photoType as string) || 'image/jpeg' }) };
      }
      return rest;
    }),
  );
  await db.transaction('rw', [db.settings, db.clients, db.docs, db.trips, db.expenses, db.emails, db.services], async () => {
    await Promise.all([db.settings.clear(), db.clients.clear(), db.docs.clear(), db.trips.clear(), db.expenses.clear(), db.emails.clear()]);
    if (data.services?.length) {
      await db.services.clear();
      await db.services.bulkPut(data.services);
    }
    await db.settings.bulkPut(data.settings ?? []);
    await db.clients.bulkPut(data.clients ?? []);
    await db.docs.bulkPut(data.docs ?? []);
    await db.trips.bulkPut(data.trips ?? []);
    await db.expenses.bulkPut(expenses);
    await db.emails.bulkPut(data.emails ?? []);
  });
}
