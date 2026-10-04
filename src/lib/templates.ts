import { db, DEFAULT_SERVICES, MURCO_SETTINGS, remoteTx, saveSettings, type Service } from './db';

// Modèles de départ par métier: codes de prix prêts à utiliser (modifiables dans « Codes et prix »).
export interface Trade {
  key: string;
  label: string;
  emoji: string;
  desc: string;
  services: Omit<Service, 'id' | 'order'>[];
}

const s = (code: string, name: string, unit: string, price: number, minimum = 0, notes = '') => ({ code, name, unit, price, minimum, notes });

export const TRADES: Trade[] = [
  {
    key: 'exterieur', label: 'Entretien extérieur', emoji: '🏠', desc: 'Gouttières, vitres, lavage à pression, feuilles',
    services: DEFAULT_SERVICES.map(({ order: _o, ...x }) => x),
  },
  {
    key: 'paysagement', label: 'Paysagement et pelouse', emoji: '🌿', desc: 'Tonte, taille, plates-bandes, ouverture et fermeture',
    services: [
      s('TON', 'Tonte de pelouse', 'pi²', 0.012, 45, 'Superficie gazonnée.'),
      s('BOR', 'Bordures et coupe-bordure', 'pi lin', 0.25, 0),
      s('TAI', 'Taille de haie', 'pi lin', 3, 120, 'Longueur × hauteur moyenne.'),
      s('PLB', 'Entretien de plates-bandes', 'heure', 55, 0),
      s('PAI', 'Paillis (fourni et étendu)', 'verge³', 95, 0),
      s('OUV', 'Ouverture de terrain (printemps)', 'forfait', 175, 0),
      s('FER', 'Fermeture de terrain (automne)', 'forfait', 195, 0),
      s('AER', 'Aération de la pelouse', 'pi²', 0.03, 120),
      s('HR', 'Main-d’œuvre à l’heure', 'heure', 55, 0),
      s('DEP', 'Frais de déplacement', 'forfait', 25, 0),
    ],
  },
  {
    key: 'peinture', label: 'Peinture', emoji: '🎨', desc: 'Murs, plafonds, boiseries, extérieur',
    services: [
      s('MUR', 'Peinture de murs (2 couches)', 'pi²', 1.6, 250, 'Surface murale.'),
      s('PLA', 'Peinture de plafond', 'pi²', 1.9, 150),
      s('BOI', 'Boiseries et cadrages', 'pi lin', 2.5, 0),
      s('POR', 'Porte (2 côtés)', 'porte', 85, 0),
      s('PRE', 'Préparation (plâtre, sablage)', 'heure', 55, 0),
      s('EXT', 'Peinture extérieure', 'pi²', 2.4, 400),
      s('PEI', 'Peinture fournie', 'gallon', 70, 0),
      s('HR', 'Main-d’œuvre à l’heure', 'heure', 55, 0),
    ],
  },
  {
    key: 'menage', label: 'Ménage et entretien', emoji: '🧽', desc: 'Résidentiel, commercial, après construction',
    services: [
      s('REG', 'Ménage régulier', 'heure', 45, 120),
      s('GRA', 'Grand ménage', 'heure', 50, 200),
      s('APC', 'Ménage après construction', 'pi²', 0.3, 300),
      s('FRI', 'Intérieur du frigo', 'forfait', 40, 0),
      s('FOU', 'Intérieur du four', 'forfait', 45, 0),
      s('VIT', 'Vitres intérieures', 'fenêtre', 8, 0),
      s('COM', 'Entretien commercial', 'heure', 42, 0),
      s('DEP', 'Frais de déplacement', 'forfait', 20, 0),
    ],
  },
  {
    key: 'deneigement', label: 'Déneigement', emoji: '❄️', desc: 'Contrats de saison, à l’appel, toitures',
    services: [
      s('SAI', 'Contrat de saison — entrée', 'forfait', 450, 0, 'Payable en 2 ou 3 versements.'),
      s('APP', 'Déneigement à l’appel', 'passage', 55, 0),
      s('TOI', 'Déneigement de toiture', 'heure', 85, 0),
      s('ESC', 'Escaliers et balcons', 'passage', 20, 0),
      s('SEL', 'Épandage d’abrasif', 'passage', 25, 0),
      s('COM', 'Stationnement commercial', 'heure', 140, 0),
    ],
  },
  {
    key: 'renovation', label: 'Rénovation et construction', emoji: '🔨', desc: 'Céramique, gypse, plancher, menuiserie',
    services: [
      s('CER', 'Pose de céramique', 'pi²', 9, 0),
      s('GYP', 'Pose et tirage de joints (gypse)', 'pi²', 3.5, 0),
      s('PLA', 'Pose de plancher flottant', 'pi²', 4, 0),
      s('DEM', 'Démolition', 'heure', 60, 0),
      s('MAT', 'Matériaux (coût + marge)', 'forfait', 0, 0, 'Entre le montant réel.'),
      s('CON', 'Conteneur / disposition', 'forfait', 450, 0),
      s('HR', 'Main-d’œuvre à l’heure', 'heure', 65, 0),
      s('DEP', 'Frais de déplacement', 'forfait', 35, 0),
    ],
  },
  {
    key: 'general', label: 'Autre métier', emoji: '🧰', desc: 'Une liste de base à adapter',
    services: [
      s('HR', 'Main-d’œuvre à l’heure', 'heure', 60, 0),
      s('FOR', 'Travaux à forfait', 'forfait', 0, 0, 'Entre le prix convenu.'),
      s('MAT', 'Matériaux', 'forfait', 0, 0),
      s('DEP', 'Frais de déplacement', 'forfait', 30, 0),
    ],
  },
];

export const tradeOf = (key?: string) => TRADES.find((t) => t.key === key);

/** Installe la liste de prix d'un métier (remplace la liste actuelle). */
export async function applyTrade(key: string, opts: { cloudWins?: boolean } = {}) {
  const t = tradeOf(key) ?? TRADES[TRADES.length - 1];
  const rows = t.services.map((x, i) => ({ ...x, order: i, id: i + 1 }));
  if (opts.cloudWins) {
    // Identifiants fixes et _u = 0: une liste déjà modifiée ailleurs n'est jamais écrasée
    await remoteTx([db.services], () => db.services.bulkPut(rows.map((r) => ({ ...r, _u: 0 }))));
  } else {
    await db.transaction('rw', db.services, async () => {
      await db.services.clear();
      await db.services.bulkPut(rows);
    });
  }
}

// Démarrage terminé? (l'écran attend avant de décider: accueil, page de vente ou assistant)
let booted = false;
const bootSubs = new Set<() => void>();
export const isBooted = () => booted;
export function onBooted(fn: () => void): () => void {
  bootSubs.add(fn);
  return () => bootSubs.delete(fn);
}

/** Démarrage de l'app: données de démonstration (tests, présentation) ou codes du métier si la liste est vide. */
export async function bootstrap(): Promise<void> {
  try {
    await bootstrapInner();
  } finally {
    if (!booted) {
      booted = true;
      bootSubs.forEach((f) => f());
    }
  }
}

async function bootstrapInner(): Promise<void> {
  try {
    if (localStorage.getItem('murco.preset') === 'murco' && !localStorage.getItem('murco.presetDone')) {
      localStorage.setItem('murco.presetDone', '1');
      const cur = await db.settings.get('main');
      if (!cur?.companyName) await saveSettings({ ...MURCO_SETTINGS, trade: 'exterieur', setupComplete: true });
    }
  } catch {
    /* ignore */
  }
  const st = await db.settings.get('main');
  if (st?.trade && (await db.services.count()) === 0) await applyTrade(st.trade, { cloudWins: true });
}
