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

export type ToolKey = 'paint' | 'tile' | 'drywall' | 'floor' | 'mulch' | 'gutter' | 'clean' | 'snow';
export const TOOL_LABEL: Record<ToolKey, { title: string; desc: string }> = {
  paint: { title: 'Calculateur de peinture', desc: 'Gallons à acheter par pièce, et combien il va te rester' },
  tile: { title: 'Céramique', desc: 'Boîtes de tuiles, colle et coulis' },
  drywall: { title: 'Gypse', desc: 'Feuilles, vis, composé et ruban' },
  floor: { title: 'Plancher', desc: 'Boîtes, sous-plancher et moulures' },
  mulch: { title: 'Paillis, terre, gravier', desc: 'Verges cubes ou nombre de sacs' },
  gutter: { title: 'Gouttières', desc: 'Pieds de gouttière, descentes et coudes' },
  clean: { title: 'Temps de ménage', desc: 'Heures selon la superficie et l’équipe' },
  snow: { title: 'Tempêtes et tournée', desc: 'Neige prévue, clients sous contrat, tournée en un geste' },
};
export const TRADE_TOOLS: Record<string, ToolKey[]> = {
  peinture: ['paint'],
  renovation: ['tile', 'drywall', 'floor', 'paint'],
  paysagement: ['mulch'],
  exterieur: ['gutter', 'paint'],
  menage: ['clean'],
  deneigement: ['snow'],
  general: ['paint', 'tile', 'drywall', 'floor', 'mulch'],
};

export async function nextOrderNumber(): Promise<string> {
  const all = await db.orders.toArray();
  const max = all.reduce((m, o) => Math.max(m, Number(o.number.replace(/\D/g, '')) || 0), 1000);
  return `BC-${max + 1}`;
}

/** Nouvelle commande (brouillon) à partir d'une liste de matériaux. */
export async function createOrder(items: OrderItem[], extra: Partial<PurchaseOrder> = {}): Promise<number> {
  const last = (await db.orders.orderBy('createdAt').last()) ?? undefined;
  return db.orders.add({
    number: await nextOrderNumber(),
    supplier: last?.supplier ?? '',
    supplierEmail: last?.supplierEmail ?? '',
    supplierPhone: last?.supplierPhone ?? '',
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
