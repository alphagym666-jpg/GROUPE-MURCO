import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Client, Doc, Settings, Trip, Expense } from './db';
import { companyAddressLines, docTotals, lineAmount, lineHitsMinimum, formatDate, km, kmAllowance, money } from './utils';

const NAVY: [number, number, number] = [15, 42, 68];
const ORANGE: [number, number, number] = [245, 166, 35];

// jsPDF (polices standard) ne gère que le Latin-1: on remplace les caractères hors plage.
function t(s: string | undefined | null): string {
  return (s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, '->')
    .replace(/[–—]/g, '-')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/[  ]/g, ' ')
    .replace(/[^\x00-\xFF]/g, '');
}

const m = (n: number) => t(money(n));
const pct = (n: number) => t(`${new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 3 }).format(n)} %`);

function header(pdf: jsPDF, s: Settings, title: string) {
  const W = pdf.internal.pageSize.getWidth();
  let x = 15;
  if (s.logo) {
    try {
      const props = pdf.getImageProperties(s.logo);
      const h = 22;
      const w = Math.min(60, (props.width / props.height) * h);
      pdf.addImage(s.logo, 15, 12, w, h);
      x = 15 + w + 5;
    } catch {
      /* logo invalide: on l'ignore */
    }
  }
  pdf.setTextColor(...NAVY);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text(t(s.companyName), x, 18);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(60);
  const info = [
    ...companyAddressLines(s),
    [s.phone, s.email].filter(Boolean).join('  |  '),
    s.ownerName,
    s.website,
    s.rbqNumber ? `Licence RBQ: ${s.rbqNumber}` : '',
  ].filter(Boolean);
  info.forEach((line, i) => pdf.text(t(line), x, 23 + i * 4));

  pdf.setTextColor(...NAVY);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(t(title), W - 15, 20, { align: 'right' });
  pdf.setDrawColor(...ORANGE);
  pdf.setLineWidth(1);
  pdf.line(15, 42, W - 15, 42);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(40);
}

function footer(pdf: jsPDF, s: Settings) {
  const pages = pdf.getNumberOfPages();
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(120);
    const taxes = [s.neq && `NEQ: ${s.neq}`, s.chargeTaxes && s.tpsNumber && `TPS: ${s.tpsNumber}`, s.chargeTaxes && s.tvqNumber && `TVQ: ${s.tvqNumber}`]
      .filter(Boolean)
      .join('   ');
    pdf.text(t(`${s.legalName || s.companyName}   ${taxes}`), 15, H - 8);
    pdf.text(`Page ${i} / ${pages}`, W - 15, H - 8, { align: 'right' });
  }
}

export function buildDocPdf(doc: Doc, client: Client | undefined, s: Settings): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'letter' });
  const W = pdf.internal.pageSize.getWidth();
  const isInvoice = doc.type === 'invoice';
  header(pdf, s, isInvoice ? 'FACTURE' : 'SOUMISSION');

  // Bloc infos document (droite)
  pdf.setFontSize(9);
  pdf.setTextColor(40);
  const meta: [string, string][] = [
    [isInvoice ? 'No de facture' : 'No de soumission', doc.number],
    ['Date', formatDate(doc.date)],
    [isInvoice ? 'Échéance' : 'Valide jusqu’au', isInvoice && (!doc.dueDate || doc.dueDate <= doc.date) ? 'Sur réception' : formatDate(doc.dueDate)],
  ];
  if (doc.jobDate) meta.push(['Date des travaux', formatDate(doc.jobDate)]);
  meta.forEach(([k, v], i) => {
    pdf.setFont('helvetica', 'bold');
    pdf.text(t(k), W - 65, 50 + i * 5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(t(v), W - 15, 50 + i * 5, { align: 'right' });
  });

  // Client (gauche)
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...NAVY);
  pdf.text(isInvoice ? 'FACTURÉ À' : 'PRÉPARÉ POUR', 15, 50);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(40);
  const clientLines = [client?.name, client?.contact, client?.address, client?.phone, client?.email].filter(Boolean) as string[];
  let y = 55;
  clientLines.forEach((l) => {
    const wrapped = pdf.splitTextToSize(t(l), 95) as string[];
    pdf.text(wrapped, 15, y);
    y += wrapped.length * 4.5;
  });
  if (doc.jobAddress) {
    y += 2;
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...NAVY);
    pdf.text('LIEU DES TRAVAUX', 15, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(40);
    const wrapped = pdf.splitTextToSize(t(doc.jobAddress), 95) as string[];
    pdf.text(wrapped, 15, y);
    y += wrapped.length * 4.5;
  }
  y = Math.max(y, 50 + meta.length * 5) + 4;

  if (doc.title) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...NAVY);
    const wrapped = pdf.splitTextToSize(t(doc.title), W - 30) as string[];
    pdf.text(wrapped, 15, y + 2);
    y += wrapped.length * 5 + 2;
  }

  const items = doc.items.filter((it) => it.description.trim() || it.unitPrice || it.code);
  const qty = (n: number) => t(new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 2 }).format(n || 0));
  autoTable(pdf, {
    startY: y + 2,
    head: [['Code', 'Description', 'Qté', 'Unité', 'Prix / unité', 'Montant']],
    body: items.map((it) => [
      t(it.code ?? ''),
      t(it.description) + (lineHitsMinimum(it) ? `\n(minimum ${m(it.minimum ?? 0)})` : ''),
      qty(it.quantity),
      t(it.unit ?? ''),
      m(it.unitPrice),
      m(lineAmount(it)),
    ]),
    theme: 'striped',
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 15, fontStyle: 'bold', textColor: [217, 138, 11] },
      2: { halign: 'right', cellWidth: 16 },
      3: { cellWidth: 18 },
      4: { halign: 'right', cellWidth: 26 },
      5: { halign: 'right', cellWidth: 28 },
    },
    didParseCell: (h) => {
      if (h.section === 'head' && [2, 4, 5].includes(h.column.index)) h.cell.styles.halign = 'right';
    },
    margin: { left: 15, right: 15, bottom: 20 },
  });

  const tot = docTotals(doc, s);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ty = ((pdf as any).lastAutoTable?.finalY ?? y + 20) + 6;
  if (ty > pdf.internal.pageSize.getHeight() - 70) {
    pdf.addPage();
    ty = 20;
  }
  const rows: [string, string, boolean?][] = [];
  if (tot.discount > 0) {
    rows.push(['Sous-total', m(tot.lines)]);
    rows.push(['Rabais', m(-tot.discount)]);
  }
  if (tot.discount > 0 || doc.applyTps || doc.applyTvq) rows.push([tot.discount > 0 ? 'Après rabais' : 'Sous-total', m(tot.subtotal)]);
  if (doc.applyTps) rows.push([`TPS (${pct(s.tpsRate)})`, m(tot.tps)]);
  if (doc.applyTvq) rows.push([`TVQ (${pct(s.tvqRate)})`, m(tot.tvq)]);
  rows.push(['TOTAL', m(tot.total), true]);
  if (tot.deposit > 0) rows.push(['Dépôt reçu', m(-tot.deposit)]);
  if (isInvoice && tot.paid - tot.deposit > 0) rows.push(['Paiements reçus', m(-(tot.paid - tot.deposit))]);
  if (tot.paid > 0) rows.push([isInvoice ? 'SOLDE À PAYER' : 'SOLDE', m(tot.balance), true]);
  pdf.setFontSize(10);
  rows.forEach(([k, v, bold]) => {
    if (bold) {
      pdf.setFillColor(...NAVY);
      pdf.rect(W - 85, ty - 4.5, 70, 7, 'F');
      pdf.setTextColor(255);
      pdf.setFont('helvetica', 'bold');
    } else {
      pdf.setTextColor(40);
      pdf.setFont('helvetica', 'normal');
    }
    pdf.text(t(k), W - 82, ty);
    pdf.text(v, W - 17, ty, { align: 'right' });
    ty += 7;
  });

  ty += 4;
  pdf.setTextColor(40);
  pdf.setFontSize(8.5);
  const notes = [
    doc.notes,
    isInvoice && s.paymentInstructions ? `Modes de paiement : ${s.paymentInstructions}` : '',
    isInvoice ? s.invoiceConditions : '',
  ].filter((x) => x && x.trim());
  notes.forEach((n) => {
    const wrapped = pdf.splitTextToSize(t(n), W - 30) as string[];
    pdf.setFont('helvetica', 'normal');
    pdf.text(wrapped, 15, ty);
    ty += wrapped.length * 4 + 3;
  });

  if (!isInvoice) {
    ty += 10;
    if (ty > pdf.internal.pageSize.getHeight() - 30) {
      pdf.addPage();
      ty = 30;
    }
    pdf.setDrawColor(120);
    pdf.setLineWidth(0.3);
    pdf.line(15, ty, 95, ty);
    pdf.line(115, ty, W - 15, ty);
    pdf.setFontSize(8);
    pdf.text('Signature du client (acceptation)', 15, ty + 4);
    pdf.text('Date', 115, ty + 4);
  }

  footer(pdf, s);
  return pdf;
}

export function docPdfBlob(doc: Doc, client: Client | undefined, s: Settings): Blob {
  return buildDocPdf(doc, client, s).output('blob');
}

export function docFileName(doc: Doc, client?: Client): string {
  const kind = doc.type === 'invoice' ? 'Facture' : 'Soumission';
  const c = (client?.name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
  return `${kind}_${doc.number}${c ? '_' + c : ''}.pdf`;
}

/** Journal de bord conforme (date, destination, raison, km). */
export function buildLogbookPdf(trips: Trip[], s: Settings, period: string): Blob {
  const pdf = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'landscape' });
  header(pdf, s, 'JOURNAL DE BORD');
  pdf.setFontSize(10);
  pdf.setTextColor(40);
  pdf.text(t(`Période: ${period}`), 15, 50);
  pdf.text(t(`Point de départ: ${s.homeAddress || '-'}`), 15, 55);
  if (s.vehicle) pdf.text(t(`Véhicule: ${s.vehicle}`), 15, 60);
  const total = trips.reduce((a, b) => a + b.totalKm, 0);
  autoTable(pdf, {
    startY: s.vehicle ? 65 : 60,
    head: [['Date', 'Départ', 'Destination', 'Raison (affaires)', 'A/R', 'Km']],
    body: trips.map((tr) => [tr.date, t(tr.fromLabel), t(tr.toLabel), t(tr.reason), tr.roundTrip ? 'Oui' : 'Non', t(km(tr.totalKm))]),
    foot: [['', '', '', 'TOTAL', '', t(km(total))]],
    theme: 'striped',
    headStyles: { fillColor: NAVY },
    footStyles: { fillColor: ORANGE, textColor: 20 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 22 }, 4: { cellWidth: 12 }, 5: { halign: 'right', cellWidth: 22 } },
    margin: { left: 15, right: 15, bottom: 20 },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fy = (pdf as any).lastAutoTable.finalY + 8;
  pdf.setFontSize(9);
  pdf.text(
    t(`Total: ${km(total)}   |   Allocation estimée (taux ${money(s.kmRateFirst5000)} / ${money(s.kmRateAfter5000)} par km): ${money(kmAllowance(total, s))}`),
    15,
    fy,
  );
  footer(pdf, s);
  return pdf.output('blob');
}

export interface SummaryData {
  period: string;
  invoices: { doc: Doc; client?: Client }[];
  expenses: Expense[];
  trips: Trip[];
}

export function buildSummaryPdf(d: SummaryData, s: Settings): Blob {
  const pdf = new jsPDF({ unit: 'mm', format: 'letter' });
  header(pdf, s, 'SOMMAIRE COMPTABLE');
  pdf.setFontSize(10);
  pdf.setTextColor(40);
  pdf.text(t(`Période: ${d.period}`), 15, 50);

  const inv = d.invoices.filter((x) => x.doc.status !== 'cancelled' && x.doc.status !== 'draft');
  const sums = inv.reduce(
    (a, { doc }) => {
      const tt = docTotals(doc, s);
      a.sub += tt.subtotal;
      a.tps += tt.tps;
      a.tvq += tt.tvq;
      a.total += tt.total;
      a.paid += tt.paid;
      return a;
    },
    { sub: 0, tps: 0, tvq: 0, total: 0, paid: 0 },
  );
  const ex = d.expenses.reduce(
    (a, e) => ({ sub: a.sub + e.subtotal, tps: a.tps + e.tps, tvq: a.tvq + e.tvq, total: a.total + e.total }),
    { sub: 0, tps: 0, tvq: 0, total: 0 },
  );
  const totalKm = d.trips.reduce((a, b) => a + b.totalKm, 0);

  autoTable(pdf, {
    startY: 56,
    head: [['Revenus (factures émises)', '']],
    body: [
      ['Nombre de factures', String(inv.length)],
      ['Ventes avant taxes', m(sums.sub)],
      ['TPS perçue', m(sums.tps)],
      ['TVQ perçue', m(sums.tvq)],
      ['Total facturé', m(sums.total)],
      ['Encaissé', m(sums.paid)],
      ['Comptes clients (à recevoir)', m(sums.total - sums.paid)],
    ],
    theme: 'grid',
    headStyles: { fillColor: NAVY },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  });
  autoTable(pdf, {
    head: [['Dépenses (reçus)', '']],
    body: [
      ['Nombre de reçus', String(d.expenses.length)],
      ['Dépenses avant taxes', m(ex.sub)],
      ['TPS payée (CTI)', m(ex.tps)],
      ['TVQ payée (RTI)', m(ex.tvq)],
      ['Total des dépenses', m(ex.total)],
    ],
    theme: 'grid',
    headStyles: { fillColor: NAVY },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  });
  autoTable(pdf, {
    head: [['Taxes à remettre (estimation)', '']],
    body: [
      ['TPS nette (perçue - CTI)', m(sums.tps - ex.tps)],
      ['TVQ nette (perçue - RTI)', m(sums.tvq - ex.tvq)],
    ],
    theme: 'grid',
    headStyles: { fillColor: ORANGE, textColor: 20 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  });
  const byCat = new Map<string, number>();
  d.expenses.forEach((e) => byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.subtotal));
  autoTable(pdf, {
    head: [['Dépenses par catégorie (avant taxes)', '']],
    body: [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [t(k), m(v)]),
    theme: 'grid',
    headStyles: { fillColor: NAVY },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 15, right: 15 },
  });
  autoTable(pdf, {
    head: [['Kilométrage', '']],
    body: [
      ['Déplacements', String(d.trips.length)],
      ['Km d’affaires', t(km(totalKm))],
      ['Allocation estimée', m(kmAllowance(totalKm, s))],
    ],
    theme: 'grid',
    headStyles: { fillColor: NAVY },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 15, right: 15, bottom: 20 },
  });
  footer(pdf, s);
  return pdf.output('blob');
}
