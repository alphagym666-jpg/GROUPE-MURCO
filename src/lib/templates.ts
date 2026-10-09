import type { JobType } from './agendaPrefs';
import { db, DEFAULT_SERVICES, MURCO_SETTINGS, remoteTx, saveSettings, type Service } from './db';

// Modèles de départ par métier: codes de prix prêts à utiliser (modifiables dans « Codes et prix »).
export interface Trade {
  key: string;
  label: string;
  emoji: string;
  desc: string;
  group: TradeGroup;
  services: Omit<Service, 'id' | 'order'>[];
  types: JobType[]; // types de jobs de l'agenda pour ce métier
}

export type TradeGroup = 'terrain' | 'construction' | 'nettoyage' | 'specialise' | 'autre';
export const TRADE_GROUPS: { key: TradeGroup; label: string }[] = [
  { key: 'terrain', label: 'Extérieur et terrain' },
  { key: 'construction', label: 'Construction et rénovation' },
  { key: 'nettoyage', label: 'Ménage et nettoyage' },
  { key: 'specialise', label: 'Services spécialisés' },
  { key: 'autre', label: 'Autre' },
];

/** Type de job (agenda): clé, libellé, icône, couleur sobre, mots du titre qui le reconnaissent. */
const ty = (key: string, label: string, icon: string, color: string, match?: string): JobType => ({ key, label, icon, color, match });
const ESTIM = ty('estimation', 'Estimation', 'clipboard', '#5f6b7a', 'estim|soumis|[ée]valu|visite');
const URG = ty('urgence', 'Urgence', 'siren', '#9b3d4a', 'urgen|d[ée]g[aâ]t|bris');

const s = (code: string, name: string, unit: string, price: number, minimum = 0, notes = '') => ({ code, name, unit, price, minimum, notes });

export const TRADES: Trade[] = [
  {
    key: 'exterieur', label: 'Entretien extérieur', emoji: '🏠', desc: 'Gouttières, vitres, lavage à pression, feuilles',
    group: 'terrain',
    types: [ty('gouttieres', 'Gouttières', 'droplets', '#2f7d6d', 'goutti'), ty('vitres', 'Vitres', 'sparkles', '#3d5a99', 'vitre|fen[eê]tre'), ty('pression', 'Lavage à pression', 'spray', '#2c6e8f', 'pression'), ty('feuilles', 'Feuilles et terrain', 'leaf', '#7a6a2f', 'feuille|ramass|terrain'), ESTIM],
    services: DEFAULT_SERVICES.map(({ order: _o, ...x }) => x),
  },
  {
    key: 'paysagement', label: 'Paysagement et pelouse', emoji: '🌿', desc: 'Tonte, taille, plates-bandes, ouverture et fermeture',
    group: 'terrain',
    types: [ty('tonte', 'Tonte', 'leaf', '#2f7d6d', 'tonte|gazon|pelouse'), ty('taille', 'Taille', 'trees', '#4f6b3a', 'taille|haie'), ty('amenagement', 'Aménagement', 'shovel', '#7a6a2f', 'am[ée]nag|plate|paillis|plant'), ty('saison', 'Ouverture / fermeture', 'house', '#3d5a99', 'ouverture|fermeture'), ESTIM],
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
    group: 'construction',
    types: [ty('interieur', 'Intérieur', 'paint', '#3d5a99', 'int[ée]rieur|mur|plafond|chambre|salon|cuisine'), ty('exterieur', 'Extérieur', 'house', '#2f7d6d', 'ext[ée]rieur|galerie|cl[oô]ture|balcon'), ty('preparation', 'Préparation', 'brush', '#a4572b', 'pr[ée]par|sabl|pl[aâ]tre'), ESTIM],
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
    group: 'nettoyage',
    types: [ty('regulier', 'Ménage régulier', 'sparkles', '#2f7d6d', 'r[ée]gulier|hebdo|aux 2'), ty('grand', 'Grand ménage', 'spray', '#3d5a99', 'grand'), ty('construction', 'Après construction', 'hardhat', '#a4572b', 'construction|chantier|r[ée]no'), ty('commercial', 'Commercial', 'house', '#5f6b7a', 'bureau|commercial|commerce')],
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
    group: 'terrain',
    types: [ty('tournee', 'Déneigement', 'snowflake', '#2c6e8f', 'd[ée]neig|tourn|entr[ée]e'), ty('toiture', 'Toiture', 'house', '#3d5a99', 'toit'), ty('abrasif', 'Abrasif', 'shovel', '#7a6a2f', 'sel|abrasif|sable'), URG],
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
    group: 'construction',
    types: [ty('demolition', 'Démolition', 'hammer', '#9b3d4a', 'd[ée]mol'), ty('ceramique', 'Céramique', 'ruler', '#3d5a99', 'c[ée]ramique|tuile'), ty('gypse', 'Gypse', 'hardhat', '#a4572b', 'gypse|joint'), ty('plancher', 'Plancher', 'ruler', '#7a6a2f', 'plancher'), ESTIM],
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
    key: 'calfeutrage', label: 'Calfeutrage, isolation et revêtement', emoji: '🧱', desc: 'Calfeutrage, isolation, peinture et pose de revêtement extérieur', group: 'construction',
    types: [ty('calfeutrage', 'Calfeutrage', 'spray', '#2c6e8f', 'calfeut|caulk|joint|mastic'), ty('isolation', 'Isolation', 'hardhat', '#a4572b', 'isol|entretoit|giclée|soufflée'), ty('peinture', 'Peinture extérieure', 'paint', '#3d5a99', 'peintur|teintur|repeind'), ty('revetement', 'Revêtement', 'house', '#2f7d6d', 'rev[êe]tement|vinyle|canexel|d[ée]claire|bardage'), ESTIM],
    services: [
      // Calfeutrage
      s('CAR', 'Arrachage de l’ancien calfeutrage', 'pi lin', 1.5, 0, 'Coupe, grattage et nettoyage du joint.'),
      s('CAJ', 'Calfeutrage de joints (fourni et posé)', 'pi lin', 3.5, 150, 'Mastic haute performance, joints de revêtement, coins et jonctions.'),
      s('CAF', 'Calfeutrage du contour des fenêtres et portes', 'fenêtre', 65, 150, 'Une fenêtre ou une porte = un contour complet.'),
      s('CAX', 'Calfeutrage de brique et maçonnerie', 'pi lin', 4.5, 150),
      s('CAB', 'Fond de joint (tige de mousse)', 'pi lin', 0.85, 0, 'Pour les joints profonds.'),
      s('CAS', 'Mousse isolante coupe-air autour des ouvertures', 'fenêtre', 35, 0),
      s('CAM', 'Mastic (cartouches, matériel)', 'cartouche', 14, 0, 'Ton coût + ta marge.'),
      s('JOI', 'Jointoiement de maçonnerie (mortier)', 'pi²', 22, 300),
      s('SLN', 'Solins (pose ou remplacement)', 'pi lin', 16, 0),
      // Isolation
      s('ISD', 'Retrait de l’ancien isolant', 'pi²', 1.25, 300),
      s('ISE', 'Isolation soufflée d’entretoit (R-50)', 'pi²', 2.25, 600),
      s('ISM', 'Isolation de murs (laine ou panneaux)', 'pi²', 2.6, 400),
      s('ISP', 'Isolation mousse giclée (2 po)', 'pi²', 4.75, 500),
      s('ISR', 'Isolant rigide extérieur sous le revêtement', 'pi²', 2.9, 400),
      s('ISC', 'Pare-air / pare-vapeur (membrane)', 'pi²', 0.95, 0),
      s('ISB', 'Isolation des solives de rive', 'pi lin', 7, 0),
      // Revêtement extérieur et peinture
      s('REO', 'Retrait du revêtement existant', 'pi²', 1.5, 500),
      s('RVP', 'Pose de revêtement extérieur (main-d’œuvre)', 'pi²', 4.75, 1000, 'Matériaux en plus (code MAT).'),
      s('REM', 'Réparation ou remplacement de bois pourri', 'pi lin', 14, 0),
      s('REG', 'Grattage et sablage', 'pi²', 0.85, 0),
      s('REA', 'Apprêt (primer) sur revêtement', 'pi²', 0.65, 0),
      s('REP', 'Peinture de revêtement extérieur (2 couches)', 'pi²', 2.45, 600, 'Pi² = longueur des murs × hauteur.'),
      s('RES', 'Teinture ou protecteur (bois, cèdre)', 'pi²', 2.1, 500),
      s('REB', 'Peinture de brique ou maçonnerie', 'pi²', 2.9, 500),
      s('REF', 'Peinture des fascias, soffites et cadrages', 'pi lin', 3.25, 0),
      s('REC', 'Peinture de portes et fenêtres (extérieur)', 'unité', 95, 0),
      s('REQ', 'Galerie, balcon et garde-corps (peinture ou teinture)', 'pi²', 3.75, 250),
      // Suppléments
      s('SH2', 'Supplément hauteur — 2e étage', 'pi²', 0.4, 0),
      s('SH3', 'Supplément hauteur — 3e étage', 'pi²', 0.85, 0),
      s('NAC', 'Location de nacelle (livraison incluse)', 'jour', 475, 0),
      s('ECH', 'Échafaudage (montage et démontage)', 'forfait', 425, 0),
      s('TRV', 'Supplément déplacement (travel)', 'km', 0.95, 0, 'Au-delà de 40 km aller-retour.'),
      s('ACC', 'Supplément accès difficile (pente, terrain étroit)', 'forfait', 175, 0),
      s('PRO', 'Protection et bâchage (plantes, vitres, sol)', 'forfait', 125, 0),
      s('URG', 'Supplément urgence / fin de semaine', 'forfait', 150, 0),
      // Divers
      s('MOH', 'Main-d’œuvre à l’heure', 'heure', 65, 0, 'Extras et travaux imprévus.'),
      s('MAT', 'Matériaux (coût + marge)', 'forfait', 0, 0, 'Entre le montant réel.'),
      s('CON', 'Conteneur / disposition des déchets', 'forfait', 450, 0),
      s('NET', 'Nettoyage de fin de chantier', 'heure', 55, 0),
    ],
  },
  {
    key: 'plomberie', label: 'Plomberie', emoji: '🚰', desc: 'Appels de service, débouchage, chauffe-eau, installations', group: 'construction',
    types: [ty('service', 'Appel de service', 'wrench', '#3d5a99', 'service|fuite|r[ée]par'), ty('installation', 'Installation', 'droplets', '#2f7d6d', 'install|chauffe|toilette|robinet|lavabo'), ty('debouchage', 'Débouchage', 'spray', '#7a6a2f', 'd[ée]bouch|drain'), URG, ESTIM],
    services: [
      s('SER', 'Appel de service (1re heure)', 'forfait', 125, 0, 'Déplacement et diagnostic inclus.'),
      s('HR', 'Heure supplémentaire', 'heure', 95, 0),
      s('DEB', 'Débouchage', 'forfait', 175, 0),
      s('CHE', 'Installation de chauffe-eau', 'forfait', 450, 0, 'Sans le chauffe-eau.'),
      s('ROB', 'Installation de robinet', 'unité', 120, 0),
      s('TOI', 'Installation de toilette', 'unité', 250, 0),
      s('URG', 'Supplément urgence (soir, fin de semaine)', 'forfait', 150, 0),
      s('MAT', 'Pièces (coût + marge)', 'forfait', 0, 0, 'Entre le montant réel.'),
    ],
  },
  {
    key: 'electricite', label: 'Électricité', emoji: '⚡', desc: 'Service, prises, luminaires, panneaux, bornes de recharge', group: 'construction',
    types: [ty('service', 'Appel de service', 'zap', '#a4572b', 'service|panne|r[ée]par'), ty('installation', 'Installation', 'lightbulb', '#3d5a99', 'install|lumi|prise|borne|panneau'), URG, ESTIM],
    services: [
      s('SER', 'Appel de service (1re heure)', 'forfait', 130, 0),
      s('HR', 'Heure supplémentaire', 'heure', 100, 0),
      s('PRI', 'Ajout de prise ou d’interrupteur', 'unité', 145, 0),
      s('LUM', 'Installation de luminaire', 'unité', 110, 0),
      s('PAN', 'Remplacement de panneau 200 A', 'forfait', 2200, 0),
      s('BOR', 'Installation de borne de recharge', 'forfait', 1200, 0, 'Sans la borne.'),
      s('MAT', 'Matériel électrique (coût + marge)', 'forfait', 0, 0),
    ],
  },
  {
    key: 'toiture', label: 'Toiture', emoji: '🏚️', desc: 'Bardeaux, membrane, réparations, inspections', group: 'construction',
    types: [ty('refection', 'Réfection', 'house', '#3d5a99', 'r[ée]fection|bardeau|refaire|toiture'), ty('reparation', 'Réparation', 'hammer', '#a4572b', 'r[ée]par|fuite|solin'), ty('inspection', 'Inspection', 'clipboard', '#5f6b7a', 'inspect|estim|soumis')],
    services: [
      s('BAR', 'Pose de bardeaux d’asphalte', 'carré', 350, 0, 'Carré = 100 pi².'),
      s('ARR', 'Arrachage de l’ancienne couverture', 'carré', 120, 0),
      s('ELA', 'Membrane élastomère (toit plat)', 'pi²', 9, 0),
      s('SOL', 'Solins', 'pi lin', 18, 0),
      s('REP', 'Réparation', 'heure', 85, 0),
      s('CON', 'Conteneur / disposition', 'forfait', 450, 0),
    ],
  },
  {
    key: 'piscine', label: 'Entretien de piscines', emoji: '🏊', desc: 'Ouvertures, fermetures, entretien, analyse d’eau', group: 'terrain',
    types: [ty('ouverture', 'Ouverture', 'droplets', '#2c6e8f', 'ouverture'), ty('fermeture', 'Fermeture', 'snowflake', '#5f6b7a', 'fermeture'), ty('entretien', 'Entretien', 'sparkles', '#2f7d6d', 'entretien|visite|analyse'), URG],
    services: [
      s('OUV', 'Ouverture de piscine', 'forfait', 250, 0),
      s('FER', 'Fermeture de piscine', 'forfait', 250, 0),
      s('ENT', 'Entretien hebdomadaire', 'visite', 75, 0),
      s('ANA', 'Analyse de l’eau', 'forfait', 15, 0),
      s('TOI', 'Changement de toile', 'forfait', 3500, 0),
      s('PRO', 'Produits (chlore, sel…)', 'forfait', 0, 0),
    ],
  },
  {
    key: 'arboriculture', label: 'Arboriculture et émondage', emoji: '🌳', desc: 'Abattage, élagage, essouchement, déchiquetage', group: 'terrain',
    types: [ty('abattage', 'Abattage', 'trees', '#4f6b3a', 'abatt|couper'), ty('elagage', 'Élagage', 'leaf', '#2f7d6d', '[ée]lag|[ée]mond|taille'), ty('essouchement', 'Essouchement', 'shovel', '#7a6a2f', 'souche'), URG, ESTIM],
    services: [
      s('ABA', 'Abattage d’arbre', 'arbre', 650, 0, 'Selon la hauteur et l’accès.'),
      s('ELA', 'Élagage', 'heure', 95, 0),
      s('ESS', 'Essouchement', 'souche', 175, 0),
      s('DEC', 'Déchiquetage des branches', 'heure', 120, 0),
      s('RAM', 'Ramassage et disposition', 'forfait', 150, 0),
    ],
  },
  {
    key: 'extermination', label: 'Extermination', emoji: '🐜', desc: 'Fourmis, souris, guêpes, punaises de lit', group: 'specialise',
    types: [ty('traitement', 'Traitement', 'spray', '#a4572b', 'traitement|fourmi|souris|punaise|gu[eê]pe|rat'), ty('inspection', 'Inspection', 'clipboard', '#5f6b7a', 'inspect'), ty('suivi', 'Suivi', 'circle', '#2f7d6d', 'suivi')],
    services: [
      s('INS', 'Inspection', 'forfait', 95, 0),
      s('FOU', 'Traitement fourmis', 'forfait', 175, 0),
      s('SOU', 'Traitement souris', 'forfait', 225, 0),
      s('GUE', 'Nid de guêpes', 'forfait', 150, 0),
      s('PUN', 'Punaises de lit', 'forfait', 450, 0, 'Par logement, 2 visites.'),
      s('SUI', 'Visite de suivi', 'visite', 85, 0),
    ],
  },
  {
    key: 'demenagement', label: 'Déménagement', emoji: '🚚', desc: 'Équipes à l’heure, livraisons, pianos, boîtes', group: 'specialise',
    types: [ty('demenagement', 'Déménagement', 'truck', '#3d5a99', 'd[ée]m[ée]nag'), ty('livraison', 'Livraison', 'truck', '#2f7d6d', 'livr|transport'), ESTIM],
    services: [
      s('EQ2', '2 déménageurs + camion', 'heure', 130, 3),
      s('EQ3', '3 déménageurs + camion', 'heure', 165, 3),
      s('DEP', 'Frais de déplacement', 'forfait', 75, 0),
      s('PIA', 'Piano', 'forfait', 250, 0),
      s('BOI', 'Boîtes', 'boîte', 3.5, 0),
      s('EMB', 'Matériel d’emballage', 'forfait', 40, 0),
    ],
  },
  {
    key: 'tapis', label: 'Nettoyage de tapis et meubles', emoji: '🛋️', desc: 'Tapis, escaliers, divans, matelas', group: 'nettoyage',
    types: [ty('tapis', 'Tapis', 'spray', '#3d5a99', 'tapis|moquette|escalier'), ty('meubles', 'Meubles', 'sparkles', '#2f7d6d', 'divan|sofa|fauteuil|matelas|meuble')],
    services: [
      s('TAP', 'Nettoyage de tapis', 'pi²', 0.35, 120),
      s('ESC', 'Escalier', 'marche', 4, 0),
      s('DIV', 'Divan 3 places', 'unité', 120, 0),
      s('FAU', 'Fauteuil', 'unité', 60, 0),
      s('MAT', 'Matelas', 'unité', 75, 0),
      s('TAC', 'Traitement de taches tenaces', 'forfait', 35, 0),
    ],
  },
  {
    key: 'auto', label: 'Esthétique automobile', emoji: '🚗', desc: 'Lavage mobile, intérieur, polissage, céramique', group: 'nettoyage',
    types: [ty('lavage', 'Lavage', 'droplets', '#2c6e8f', 'lavage'), ty('esthetique', 'Esthétique', 'sparkles', '#3d5a99', 'esth[ée]tique|polis|c[ée]ramique|int[ée]rieur')],
    services: [
      s('LAV', 'Lavage extérieur', 'véhicule', 45, 0),
      s('INT', 'Intérieur complet', 'véhicule', 120, 0),
      s('EST', 'Esthétique complète', 'véhicule', 220, 0),
      s('POL', 'Polissage', 'véhicule', 250, 0),
      s('CER', 'Protection céramique', 'véhicule', 800, 0),
      s('SHA', 'Shampoing des sièges', 'véhicule', 80, 0),
    ],
  },
  {
    key: 'informatique', label: 'Soutien informatique', emoji: '💻', desc: 'Dépannage, réseaux, caméras, installation', group: 'specialise',
    types: [ty('depannage', 'Dépannage', 'wrench', '#3d5a99', 'd[ée]pann|virus|lent|r[ée]par'), ty('installation', 'Installation', 'zap', '#2f7d6d', 'install|r[ée]seau|wifi|cam[ée]ra')],
    services: [
      s('HR', 'Soutien technique', 'heure', 85, 1),
      s('ORD', 'Installation d’un ordinateur', 'unité', 120, 0),
      s('WIF', 'Réseau Wi-Fi', 'forfait', 150, 0),
      s('REC', 'Récupération de données', 'forfait', 200, 0),
      s('CAM', 'Installation de caméra', 'unité', 175, 0),
      s('DEP', 'Frais de déplacement', 'forfait', 30, 0),
    ],
  },
  {
    key: 'toilettage', label: 'Toilettage d’animaux', emoji: '🐶', desc: 'Toilettage mobile, bains, coupe de griffes', group: 'specialise',
    types: [ty('toilettage', 'Toilettage', 'sparkles', '#3d5a99', 'toilett|coupe|tonte'), ty('bain', 'Bain', 'droplets', '#2c6e8f', 'bain')],
    services: [
      s('PET', 'Toilettage petit chien', 'animal', 70, 0),
      s('MOY', 'Toilettage chien moyen', 'animal', 90, 0),
      s('GRA', 'Toilettage grand chien', 'animal', 120, 0),
      s('CHA', 'Toilettage chat', 'animal', 95, 0),
      s('GRI', 'Coupe de griffes', 'animal', 20, 0),
      s('DEP', 'Frais de déplacement', 'forfait', 15, 0),
    ],
  },
  {
    key: 'general', label: 'Autre métier', emoji: '🧰', desc: 'Une liste de base à adapter',
    group: 'autre',
    types: [ty('service', 'Service', 'wrench', '#3d5a99'), ty('installation', 'Installation', 'hammer', '#2f7d6d', 'install|pose|montage'), ty('reparation', 'Réparation', 'wrench', '#a4572b', 'r[ée]par|remplac'), ESTIM, URG],
    services: [
      s('HR', 'Main-d’œuvre à l’heure', 'heure', 60, 0),
      s('FOR', 'Travaux à forfait', 'forfait', 0, 0, 'Entre le prix convenu.'),
      s('MAT', 'Matériaux', 'forfait', 0, 0),
      s('DEP', 'Frais de déplacement', 'forfait', 30, 0),
    ],
  },
];

export const tradeOf = (key?: string) => TRADES.find((t) => t.key === key);

/** Types de jobs de l'agenda pour les métiers choisis (sans doublons, 8 au plus). */
export function tradeTypes(keys: string[]): JobType[] {
  const out: JobType[] = [];
  for (const k of keys) for (const t of tradeOf(k)?.types ?? []) if (!out.some((x) => x.key === t.key)) out.push(t);
  return out.slice(0, 8);
}

/** Liste de prix de plusieurs métiers réunis (un code déjà pris garde la première version). */
export function tradeServices(keys: string[]): Omit<Service, 'id' | 'order'>[] {
  const out: Omit<Service, 'id' | 'order'>[] = [];
  for (const k of keys.length ? keys : ['general']) for (const sv of tradeOf(k)?.services ?? []) if (!out.some((x) => x.code === sv.code)) out.push(sv);
  return out;
}

/** Installe la liste de prix d'un métier (remplace la liste actuelle). */
export async function applyTrade(key: string | string[], opts: { cloudWins?: boolean } = {}) {
  const keys = (Array.isArray(key) ? key : [key]).filter((k) => tradeOf(k));
  const rows = tradeServices(keys).map((x, i) => ({ ...x, order: i, id: i + 1 }));
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

/** Ajoute les codes de prix d'autres métiers sans toucher à la liste actuelle. Retourne le nombre ajouté. */
export async function addTradeServices(keys: string[]): Promise<number> {
  const cur = await db.services.toArray();
  const fresh = tradeServices(keys).filter((x) => !cur.some((c) => c.code === x.code));
  const start = cur.reduce((m, c) => Math.max(m, c.order), -1) + 1;
  await db.services.bulkAdd(fresh.map((x, i) => ({ ...x, order: start + i })));
  return fresh.length;
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
