// Commandes au fournisseur (bons de commande) et outils par métier.
import { db, type OrderItem, type PurchaseOrder, type Settings } from './db';
import { TRADES } from './templates';
import { plural } from './tradeCalc';
import { formatDate } from './utils';

/** Métiers actifs (plusieurs possibles: ex. entretien extérieur + déneigement). */
export function activeTrades(s: Pick<Settings, 'trades' | 'trade'>): string[] {
  const list = s.trades?.length ? s.trades : [s.trade ?? 'exterieur'];
  return list.filter((k) => TRADES.some((t) => t.key === k));
}

export type ToolKey = 'paint' | 'tile' | 'drywall' | 'floor' | 'mulch' | 'gutter' | 'clean' | 'snow' | 'hourly' | 'roof' | 'pool' | 'move';
export const TOOL_LABEL: Record<ToolKey, { title: string; desc: string }> = {
  paint: { title: 'Calculateur de peinture', desc: 'Gallons à acheter par pièce, et combien il va te rester' },
  tile: { title: 'Céramique', desc: 'Boîtes de tuiles, colle et coulis' },
  drywall: { title: 'Gypse', desc: 'Feuilles, vis, composé et ruban' },
  floor: { title: 'Plancher', desc: 'Boîtes, sous-plancher et moulures' },
  mulch: { title: 'Paillis, terre, gravier', desc: 'Verges cubes ou nombre de sacs' },
  gutter: { title: 'Gouttières', desc: 'Pieds de gouttière, descentes et coudes' },
  clean: { title: 'Temps de ménage', desc: 'Heures selon la superficie et l’équipe' },
  snow: { title: 'Tempêtes et tournée', desc: 'Neige prévue, clients sous contrat, tournée en un geste' },
  hourly: { title: 'Temps et matériel', desc: 'Prix d’une job: heures, équipe, pièces avec ta marge' },
  roof: { title: 'Toiture', desc: 'Carrés, paquets de bardeaux, membrane, larmiers' },
  pool: { title: 'Piscine', desc: 'Volume d’eau, chlore choc, sel et stabilisant' },
  move: { title: 'Déménagement', desc: 'Volume, camion, heures et boîtes selon le logement' },
};
export const TRADE_TOOLS: Record<string, ToolKey[]> = {
  peinture: ['paint', 'hourly'],
  renovation: ['tile', 'drywall', 'floor', 'paint', 'hourly'],
  paysagement: ['mulch', 'hourly'],
  exterieur: ['gutter', 'paint'],
  menage: ['clean'],
  deneigement: ['snow'],
  plomberie: ['hourly'],
  electricite: ['hourly'],
  toiture: ['roof', 'hourly'],
  piscine: ['pool'],
  arboriculture: ['mulch', 'hourly'],
  extermination: ['hourly'],
  demenagement: ['move'],
  tapis: ['clean'],
  auto: ['hourly'],
  informatique: ['hourly'],
  toilettage: [],
  general: ['hourly', 'paint', 'tile', 'drywall', 'floor', 'mulch'],
};

export async function nextOrderNumber(): Promise<string> {
  const all = await db.orders.toArray();
  const max = all.reduce((m, o) => Math.max(m, Number(o.number.replace(/\D/g, '')) || 0), 1000);
  return `BC-${max + 1}`;
}

/** Nouvelle commande (brouillon) à partir d'une liste de matériaux. */
export async function createOrder(items: OrderItem[], extra: Partial<PurchaseOrder> = {}): Promise<number> {
  const all = await db.orders.orderBy('createdAt').toArray();
  // Fournisseur nommé: ses coordonnées de la dernière commande; sinon le dernier fournisseur utilisé
  const named = extra.supplier?.trim().toLowerCase();
  const prev = named ? [...all].reverse().find((o) => o.supplier.trim().toLowerCase() === named) : all[all.length - 1];
  return db.orders.add({
    number: await nextOrderNumber(),
    supplier: prev?.supplier ?? '',
    supplierEmail: prev?.supplierEmail ?? '',
    supplierPhone: prev?.supplierPhone ?? '',
    items: items.filter((i) => i.qty > 0).map((i) => ({ ...i })),
    pickup: true,
    notes: '',
    status: 'brouillon',
    createdAt: new Date().toISOString(),
    ...extra,
  });
}

const qtyTxt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** Texte de la commande (courriel, texto ou partage). */
export function orderText(o: PurchaseOrder, company: string, ref?: string): string {
  const lines = o.items.filter((i) => i.description.trim()).map((i) => `• ${qtyTxt(i.qty)} ${plural(i.unit, i.qty)} — ${i.description}`);
  return [
    `Bonjour${o.supplier ? ` ${o.supplier}` : ''},`,
    '',
    `Voici une commande de ${company || 'notre entreprise'} (${o.number}${ref ? ` · ${ref}` : ''}):`,
    '',
    ...lines,
    '',
    o.neededBy ? `${o.pickup ? 'Je passe la chercher' : 'Livraison souhaitée'} le ${formatDate(o.neededBy)}.` : o.pickup ? 'Je passe la chercher.' : 'Livraison souhaitée.',
    o.notes.trim() ? `\n${o.notes.trim()}` : '',
    'Merci de me confirmer la disponibilité et le prix.',
    '',
    company,
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

export const ORDER_STATUS: Record<PurchaseOrder['status'], { label: string; cls: string }> = {
  brouillon: { label: 'À envoyer', cls: 'gray' },
  envoyee: { label: 'Envoyée', cls: 'blue' },
  recue: { label: 'Reçue', cls: 'green' },
};
