// Assistant: on dit (ou écrit) ce qu'on veut, l'app comprend l'intention et propose l'action à confirmer.
// Sans Internet ni IA: mots-clés, nombres et dates en français québécois.
import { wordsToNumbers } from './voice.ts';
import { findWhen } from './voiceJob.ts';

export type IntentKind = 'planifier' | 'facturer' | 'payee' | 'relancer' | 'depense' | 'deplacer' | 'fini' | 'combien' | 'horaire' | 'afaire' | 'commander';

export interface Intent {
  kind: IntentKind;
  clientId?: number;
  date?: string; // date dite (déplacer, horaire)
  time?: string;
  amount?: number;
  method?: string; // mode de paiement
  category?: string; // catégorie de dépense
  vendor?: string;
  period?: 'jour' | 'semaine' | 'mois' | 'annee';
  items?: { description: string; qty: number; unit: string }[]; // commande au fournisseur
}

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ');

/** Client nommé dans la phrase (« de Girard », « chez Mme Roy »). */
export function matchClient<T extends { id?: number; name: string }>(text: string, clients: T[]): T | undefined {
  const t = ` ${norm(text).replace(/[^a-z0-9]+/g, ' ')} `;
  let best: T | undefined;
  let bestScore = 0;
  for (const c of clients) {
    const words = norm(c.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !['mme', 'madame', 'monsieur', 'famille', 'inc', 'enr'].includes(w));
    if (!words.length) continue;
    const hit = words.filter((w) => t.includes(` ${w} `)).length;
    const score = hit / words.length + hit * 0.01;
    if (hit && score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

const VENDORS: [RegExp, string, string][] = [
  [/petro/, 'Petro-Canada', 'Essence'], [/shell/, 'Shell', 'Essence'], [/esso/, 'Esso', 'Essence'], [/ultramar/, 'Ultramar', 'Essence'],
  [/couche[-\s]?tard/, 'Couche-Tard', 'Essence'], [/irving/, 'Irving', 'Essence'], [/crevier/, 'Crevier', 'Essence'], [/sonic/, 'Sonic', 'Essence'],
  [/home depot/, 'Home Depot', 'Matériaux'], [/rona/, 'Rona', 'Matériaux'], [/reno[-\s]?depot/, 'Réno-Dépôt', 'Matériaux'], [/canac/, 'Canac', 'Matériaux'],
  [/\bbmr\b/, 'BMR', 'Matériaux'], [/patrick morin/, 'Patrick Morin', 'Matériaux'],
  [/sherwin/, 'Sherwin-Williams', 'Matériaux'], [/benjamin moore|\bbm\b/, 'Benjamin Moore', 'Matériaux'], [/\bsico\b/, 'Sico', 'Matériaux'], [/dulux/, 'Dulux', 'Matériaux'],
  [/lowe/, 'Lowe’s', 'Matériaux'], [/kent\b/, 'Kent', 'Matériaux'], [/deschenes|deschênes/, 'Deschênes', 'Matériaux'], [/emco/, 'Emco', 'Matériaux'], [/lumen/, 'Lumen', 'Matériaux'],
  [/canadian tire/, 'Canadian Tire', 'Outils et équipement'], [/princess auto/, 'Princess Auto', 'Outils et équipement'],
  [/tim horton/, 'Tim Hortons', 'Repas'], [/mcdo|mcdonald/, 'McDonald’s', 'Repas'], [/subway/, 'Subway', 'Repas'],
];

const CATEGORY: [RegExp, string][] = [
  [/essence|gaz|carburant|diesel|plein/, 'Essence'],
  [/materiaux|materiel|bois|vis|clous|scellant|gouttieres?\b|peinture/, 'Matériaux'],
  [/outil|echelle|equipement|perceuse/, 'Outils et équipement'],
  [/garage|pneus?|huile|mecanique|changement d huile/, 'Entretien véhicule'],
  [/repas|diner|dejeuner|souper|lunch|cafe|resto/, 'Repas'],
  [/location/, 'Location équipement'],
  [/sous[-\s]?trait/, 'Sous-traitance'],
  [/telephone|cellulaire|internet/, 'Téléphone / Internet'],
  [/pub|publicite|facebook|google ads/, 'Publicité'],
];


const UNITS: [RegExp, string][] = [
  [/^(gallons?|gal)$/, 'gallon'], [/^pintes?$/, 'pinte'], [/^(chaudieres?|seaux?|chaudiere)$/, 'chaudière'], [/^boites?$/, 'boîte'], [/^sacs?$/, 'sac'],
  [/^feuilles?$/, 'feuille'], [/^rouleaux?$/, 'rouleau'], [/^tubes?$/, 'tube'], [/^(pieds?|pi)$/, 'pi'], [/^(paquets?|ballots?)$/, 'paquet'], [/^(litres?|l)$/, 'litre'],
];
/** « commande 3 gallons de blanc et 2 rouleaux de ruban chez Rona » → articles. */
export function parseOrderItems(input: string): { description: string; qty: number; unit: string }[] {
  let t = wordsToNumbers(norm(input));
  t = t.replace(/^.*?\b(commande[rz]?|commandes|acheter|achete|j ai besoin d|besoin d|il me faut|ca me prend)\b\s*(moi\s+)?/, '');
  t = t.replace(/\s+(chez|au|a la|pour)\s+.*$/, '');
  return t.split(/\s*(?:,|\bet\b|\bpuis\b|\bplus\b)\s*/).map((piece) => {
    const m = piece.trim().match(/^(\d+(?:[.,]\d+)?)?\s*([a-z]+)?\s*(?:de |d )?(.*)$/);
    if (!m) return null;
    let qty = m[1] ? Number(m[1].replace(',', '.')) : 1;
    let unit = 'unité';
    let desc = m[3] ?? '';
    const u = UNITS.find(([re]) => m[2] && re.test(m[2]));
    if (u) unit = u[1];
    else desc = `${m[2] ?? ''} ${desc}`;
    desc = desc.replace(/^(de |d |du |des )/, '').trim();
    if (!m[1] && !u) qty = 1;
    return desc ? { description: desc.charAt(0).toUpperCase() + desc.slice(1), qty, unit } : null;
  }).filter((x): x is { description: string; qty: number; unit: string } => !!x);
}

export function detectIntent<T extends { id?: number; name: string }>(input: string, clients: T[], today: string): Intent {
  const t = norm(input);
  const tn = wordsToNumbers(t);
  const client = matchClient(input, clients);
  const clientId = client?.id;

  // « une soumission à faire pour… », « planifie… »: c'est une job à créer, pas « ma liste à faire »
  if (/\b(soumission|estimation|planifi\w*)\b/.test(t) && !/\b(relanc|factur)/.test(t)) return { kind: 'planifier', clientId };

  if (/\b(quoi faire|a confirmer|mes taches|liste a faire|qu est[-\s]ce que j ai a faire|j ai quoi a faire|mes affaires a faire|mes choses a faire)\b/.test(t)) return { kind: 'afaire' };

  if (/\b(combien|chiffre d affaires|mes ventes|mes revenus|j ai fait combien|ca donne combien|mon mois|mon annee)\b/.test(t)) {
    const period = /\bsemaine\b/.test(t) ? 'semaine' : /\b(annee|an)\b/.test(t) ? 'annee' : /\b(aujourd hui|journee)\b/.test(t) ? 'jour' : 'mois';
    return { kind: 'combien', period };
  }

  if (/\b(horaire|agenda|cedule|mes jobs|j ai quoi|qu est[-\s]ce que j ai|c est quoi ma journee|ma journee|ma semaine)\b/.test(t)) {
    const w = findWhen(tn, today);
    return { kind: 'horaire', date: w.date, period: /\bsemaine\b/.test(t) ? 'semaine' : 'jour' };
  }

  if (/\brelanc/.test(t)) return { kind: 'relancer', clientId };

  // « Commande 3 gallons de blanc chez Rona », « faut que j'achète 2 sacs de coulis »
  if (/\b(commande[rz]?|commandes|fournisseur|faut que j achete|il me faut acheter)\b/.test(t) && !/\bfactur/.test(t)) {
    const v = VENDORS.find(([re]) => re.test(t));
    const m = input.match(/\b(?:chez|au)\s+([A-ZÀ-Ý][\p{L}'’-]*(?:\s+[A-ZÀ-Ý][\p{L}'’-]*)*)/u);
    const w = /\bpour\b/.test(t) ? findWhen(tn, today) : null;
    return { kind: 'commander', clientId, vendor: v?.[1] ?? m?.[1], items: parseOrderItems(input), date: w && w.rest !== tn ? w.date : undefined };
  }

  // « Girard a payé », « reçu le paiement de Roy en comptant »
  if (/\b(a paye|ont paye|paye|payee|recu (le |son |mon )?paiement|recu l argent|encaisse)\b/.test(t) && !/\bfactur(e|er|es)\s+(la|le|les)?\s*job/.test(t)) {
    const method = /\b(comptant|cash|argent)\b/.test(t) ? 'Comptant' : /\b(interac|virement|transfert)\b/.test(t) ? 'Virement Interac' : /\bcheque\b/.test(t) ? 'Chèque' : /\b(carte|credit|debit)\b/.test(t) ? 'Carte' : undefined;
    return { kind: 'payee', clientId, method };
  }

  if (/\bfactur/.test(t)) return { kind: 'facturer', clientId };

  // Dépense: « 45 $ d'essence chez Petro-Canada », « reçu de 120 piastres au Home Depot »
  const money = tn.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:\$|dollars?|piastres?|piasses?|bucks?)/) ?? (/\b(depense|achete|achat|recu de|plein)\b/.test(t) ? tn.match(/(\d+(?:[.,]\d{1,2})?)/) : null);
  if (money && /\b(depense|achete|achat|recu|essence|gaz|plein|materiaux|repas|diner|dinner|lunch|outil|chez|au|a la)\b/.test(t) && !/\b(pieds?|pi|fenetres?|heures?)\b/.test(t)) {
    let category: string | undefined;
    let vendor: string | undefined;
    for (const [re, label, cat] of VENDORS) {
      if (re.test(t)) {
        vendor = label;
        category = cat;
        break;
      }
    }
    if (!vendor) {
      const m = input.match(/\b(?:chez|au|à la|a la)\s+([A-ZÀ-Ý][\p{L}'’-]*(?:\s+[A-ZÀ-Ý][\p{L}'’-]*)*)/u);
      if (m) vendor = m[1];
    }
    for (const [re, cat] of CATEGORY) if (!category && re.test(t)) category = cat;
    return { kind: 'depense', amount: Number(money[1].replace(',', '.')), category: category ?? 'Autre', vendor };
  }

  if (/\b(deplace|deplacer|reporte|reporter|remets?|bouge|change la date|decale)\b/.test(t)) {
    const w = findWhen(tn, today);
    return { kind: 'deplacer', clientId, date: w.rest !== tn ? w.date : undefined, time: w.time };
  }

  if (/\b(j ai fini|c est fini|fini|terminee?|termine|completee?|j ai fait la job|job faite|c est fait)\b/.test(t)) return { kind: 'fini', clientId };

  return { kind: 'planifier', clientId };
}
