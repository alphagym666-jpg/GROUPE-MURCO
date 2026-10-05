import Dexie, { type Table } from 'dexie';
import type { AgendaPrefs } from './agendaPrefs';

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Champ technique de synchronisation: moment de la dernière modification (ms). */
interface Synced {
  _u?: number;
}

export interface Settings extends Synced {
  id: 'main';
  // Compagnie
  ownerName: string;
  companyName: string;
  legalName: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email: string;
  website: string;
  neq: string;
  tpsNumber: string;
  tvqNumber: string;
  rbqNumber: string;
  logo?: string; // data URL
  // Domicile / point de départ du journal de bord
  homeAddress: string;
  homeGeo?: GeoPoint;
  // Taxes
  chargeTaxes: boolean;
  tpsRate: number;
  tvqRate: number;
  // Numérotation
  invoicePrefix: string;
  nextInvoiceNumber: number;
  quotePrefix: string;
  nextQuoteNumber: number;
  paymentTermsDays: number;
  quoteValidityDays: number;
  invoiceNotes: string;
  quoteNotes: string;
  paymentInstructions: string;
  invoiceConditions: string;
  // Journal de bord
  autoTripFromInvoices: boolean;
  autoTripRoundTrip: boolean;
  kmRateFirst5000: number;
  kmRateAfter5000: number;
  vehicle: string;
  // Rentabilité et taxes
  laborCostPerHour: number; // coût d'une heure de main-d'œuvre (0 = ton propre temps)
  kmCost: number; // coût réel d'un km (essence, usure)
  taxFiling: 'mensuel' | 'trimestriel' | 'annuel';
  // Avis clients et formulaire de demande
  googleReviewUrl: string;
  leadForm: boolean;
  setupDone?: string[]; // étapes de démarrage cochées à la main (ex.: codes vérifiés)
  setupHidden?: boolean; // liste « Démarrage » masquée
  trade?: string; // métier choisi au démarrage (modèle de codes et prix)
  setupComplete?: boolean; // assistant de démarrage terminé
  agenda?: Partial<AgendaPrefs>; // personnalisation de l'agenda
  brandColor?: string; // couleur de l'entreprise (#rrggbb)
  monthlyGoal?: number; // objectif de revenus du mois
  dashTiles?: string[]; // tuiles cachées du tableau de bord
  wantedPlan?: string; // forfait choisi sur la page de vente
  accountCreatedAt?: string; // création du compte du propriétaire (début de l'essai; employés compris)
  invoiceNotesEn?: string; // textes en anglais (clients anglophones)
  quoteNotesEn?: string;
  paymentInstructionsEn?: string;
  invoiceConditionsEn?: string;
  termsAcceptedAt?: string; // consentement aux conditions et à la politique de confidentialité (Loi 25)
  leadFormIntro: string;
  // Paiement par carte (Stripe, via les fonctions Firebase)
  cardPayments: boolean;
  paymentsEndpoint: string; // ex.: https://northamerica-northeast1-<projet>.cloudfunctions.net
  // Google Maps (distances et adresses)
  googleMapsKey: string;
  canadaPostKey?: string; // Postes Canada AddressComplete (adresses officielles pendant la saisie)
  todoSnooze?: Record<string, string>; // « À confirmer »: éléments remis à plus tard (clé → date de retour)
  // Gmail / Comptable
  googleClientId: string;
  accountantName: string;
  accountantEmail: string;
  emailSignature: string;
}

export interface Client extends Synced {
  id?: number;
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  geo?: GeoPoint;
  notes: string;
  lang?: 'fr' | 'en'; // langue des documents envoyés à ce client
  createdAt: string;
}

export interface LineItem {
  code?: string;
  description: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  minimum?: number; // montant minimum de la ligne
  calc?: CalcRow[]; // mesures du calculateur (pi², pi lin)
}

export interface CalcRow {
  label: string;
  a: number; // longueur
  b: number; // hauteur / largeur
}

/** Code de job / liste de prix (ex.: NDG = Nettoyage de gouttières, 1,50 $/pi lin, minimum 150 $). */
export interface Service extends Synced {
  id?: number;
  code: string;
  name: string;
  nameEn?: string; // description en anglais (documents des clients anglophones)
  unit: string;
  price: number;
  minimum: number;
  notes: string;
  order: number;
}

export const UNITS = ['pi lin', 'pi²', 'fenêtre', 'sac', 'heure', 'forfait', 'unité', 'jour', 'm²', 'porte'] as const;

export type DocType = 'invoice' | 'quote';
export type DocStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'accepted' | 'refused' | 'cancelled';

export interface Payment {
  date: string;
  amount: number;
  method: string;
  mediaId?: number; // photo de l'argent comptant / du bordereau de dépôt
  note?: string;
  ref?: string; // référence externe (paiement Stripe)
}

export interface Signature {
  name: string;
  at: string; // ISO
  image?: string; // data URL PNG de la signature
}

export interface Doc extends Synced {
  id?: number;
  type: DocType;
  number: string;
  clientId: number;
  date: string; // YYYY-MM-DD
  dueDate: string;
  jobDate: string;
  lang?: 'fr' | 'en'; // langue du document (sinon celle du client)
  jobAddress: string;
  jobGeo?: GeoPoint;
  title: string; // description courte de la job (sert de raison pour le journal de bord)
  items: LineItem[];
  applyTps: boolean;
  applyTvq: boolean;
  discount?: number; // rabais ($, avant taxes)
  deposit?: number; // dépôt déjà reçu ($)
  notes: string;
  status: DocStatus;
  payments: Payment[];
  sourceQuoteId?: number;
  convertedInvoiceId?: number;
  tripId?: number;
  jobId?: number; // job de l'agenda d'où vient la facture
  depositMediaId?: number; // photo du dépôt reçu
  pdfPhotos?: boolean; // joindre les photos avant/après au PDF
  hoursWorked?: number; // heures travaillées (rentabilité)
  salesRepId?: number; // vendeur (commission)
  leadId?: number; // demande d'où vient la soumission
  projectId?: number;
  review?: Review; // avis du client (portail)
  reviewRequestedAt?: string;
  otherCost?: number; // autres coûts directs non liés à un reçu (sous-traitant…)
  portalToken?: string; // lien client (portail)
  signature?: Signature; // acceptation signée en ligne
  viewedAt?: string; // vu par le client dans le portail
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type JobStatus = 'planifie' | 'fait' | 'facture' | 'annule';
export type Recurrence = 'none' | 'weekly' | 'monthly' | 'yearly' | 'months';

/** Job à l'agenda (travaux planifiés). */
export interface Job extends Synced {
  id?: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM ('' = dans la journée)
  durationMin: number;
  clientId: number;
  address: string;
  geo?: GeoPoint;
  title: string;
  items: LineItem[];
  notes: string;
  status: JobStatus;
  order: number; // ordre dans la route du jour
  recurrence: Recurrence;
  recurEveryMonths?: number;
  nextJobId?: number;
  docId?: number;
  doneAt?: string;
  remindedAt?: string;
  assignees?: number[]; // employés assignés (membres)
  projectId?: number;
  type?: string; // type de job (couleur + émoji dans l'agenda)
  color?: string; // couleur choisie à la main
  createdAt: string;
}

export type MediaKind = 'avant' | 'apres' | 'job' | 'paiement' | 'autre';

/** Photo (job avant/après, preuve de paiement comptant ou de dépôt…). */
export interface Media extends Synced {
  id?: number;
  kind: MediaKind;
  blob?: Blob;
  type: string;
  name: string;
  sig?: string;
  caption: string;
  takenAt: string; // ISO
  geo?: GeoPoint;
  docId?: number;
  jobId?: number;
  clientId?: number;
  createdAt: string;
}

export interface Trip extends Synced {
  id?: number;
  date: string;
  fromLabel: string;
  fromGeo?: GeoPoint;
  toLabel: string;
  toGeo?: GeoPoint;
  oneWayKm: number;
  roundTrip: boolean;
  totalKm: number;
  reason: string;
  clientId?: number;
  docId?: number;
  expenseId?: number;
  source: 'auto-facture' | 'auto-recu' | 'auto-agenda' | 'manuel';
  routeDate?: string; // trajet enchaîné de la journée (agenda)
  jobId?: number;
  distanceMethod: 'google' | 'route' | 'estimation' | 'manuel';
  durationMin?: number;
  createdAt: string;
}

export const EXPENSE_CATEGORIES = [
  'Essence',
  'Matériaux',
  'Outils et équipement',
  'Entretien véhicule',
  'Repas',
  'Location équipement',
  'Sous-traitance',
  'Assurances',
  'Téléphone / Internet',
  'Fournitures de bureau',
  'Publicité',
  'Frais bancaires',
  'Autre',
] as const;

export interface ExpenseOrigin {
  kind: 'maison' | 'job' | 'autre';
  label: string;
  geo: GeoPoint;
  jobId?: number;
  docId?: number;
  clientId?: number;
}

export interface Expense extends Synced {
  id?: number;
  date: string;
  vendor: string;
  category: string;
  subtotal: number;
  tps: number;
  tvq: number;
  total: number;
  paymentMethod: string;
  notes: string;
  photo?: Blob;
  photoName?: string;
  photoType?: string;
  locationLabel: string;
  geo?: GeoPoint;
  geoSource?: 'photo' | 'gps' | 'adresse' | 'recu';
  kmFromHome?: number;
  origin?: ExpenseOrigin; // d'où je partais (domicile, une job, autre)
  originKm?: number; // km aller, du point de départ au commerce
  clientId?: number;
  docId?: number;
  projectId?: number;
  tripId?: number;
  photoSig?: string; // empreinte de la photo (synchronisation)
  ocrText?: string; // texte lu sur le reçu (recherche)
  ocrAuto?: boolean; // montants remplis par la lecture automatique
  createdAt: string;
}

export interface EmailLog extends Synced {
  id?: number;
  date: string;
  to: string;
  subject: string;
  clientId?: number;
  docId?: number;
  gmailId?: string;
  kind: 'facture' | 'soumission' | 'comptable' | 'autre';
}

export interface Review {
  stars: number; // 1 à 5
  comment?: string;
  at: string;
  toGoogle?: boolean; // redirigé vers Google
}

export type LeadStage = 'nouveau' | 'contacte' | 'visite' | 'soumission' | 'gagne' | 'perdu';
export type LeadSource = 'formulaire' | 'facebook' | 'google' | 'reference' | 'telephone' | 'site' | 'autre';

/** Demande entrante (prospect) — CRM. */
export interface Lead extends Synced {
  id?: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  geo?: GeoPoint;
  service: string;
  message: string;
  source: LeadSource;
  stage: LeadStage;
  value: number; // valeur estimée ($)
  nextAction?: string; // date de relance YYYY-MM-DD
  nextNote?: string;
  assignedTo?: number; // membre (vendeur)
  clientId?: number;
  quoteId?: number;
  lostReason?: string;
  history: { at: string; text: string }[];
  createdAt: string;
}

export type MemberRole = 'employe' | 'vendeur' | 'admin';

/** Membre de l'équipe (employé, vendeur). */
export interface Member extends Synced {
  id?: number;
  name: string;
  email: string;
  phone: string;
  role: MemberRole;
  access?: 'pointage' | 'complet'; // employé: app Pointage seulement, ou pointage + agenda et photos
  hourlyCost: number; // coût horaire (salaire + charges)
  commissionRate: number; // % sur les ventes payées
  active: boolean;
  inviteCode: string;
  uid?: string; // compte Firebase une fois l'invitation acceptée
  color: string;
  createdAt: string;
}

/** Pointage (punch in / out) avec position GPS. */
export interface Punch extends Synced {
  id?: number;
  memberId: number; // 0 = propriétaire
  name: string;
  jobId?: number;
  projectId?: number;
  clientId?: number;
  start: string; // ISO
  end?: string;
  startGeo?: GeoPoint;
  endGeo?: GeoPoint;
  startDistM?: number; // distance du chantier au punch in (mètres)
  endDistM?: number;
  breakMin: number;
  note: string;
  approved?: boolean;
  /** Heure de fin entrée à la main par l'employé (oubli, batterie à plat…) */
  endManual?: { reason: string; at: string };
  createdAt: string;
}

export type ProjectStatus = 'estimation' | 'en_cours' | 'termine' | 'annule';

/** Projet (chantier de plusieurs jours / plusieurs jobs). */
export interface Project extends Synced {
  id?: number;
  name: string;
  clientId: number;
  address: string;
  status: ProjectStatus;
  budget: number;
  start: string;
  end: string;
  notes: string;
  createdAt: string;
}

class MurcoDB extends Dexie {
  settings!: Table<Settings, string>;
  clients!: Table<Client, number>;
  docs!: Table<Doc, number>;
  trips!: Table<Trip, number>;
  expenses!: Table<Expense, number>;
  emails!: Table<EmailLog, number>;
  services!: Table<Service, number>;
  jobs!: Table<Job, number>;
  media!: Table<Media, number>;
  leads!: Table<Lead, number>;
  members!: Table<Member, number>;
  punches!: Table<Punch, number>;
  projects!: Table<Project, number>;

  constructor() {
    // Identifiants uniques globaux (pas d'auto-incrément) pour synchroniser plusieurs appareils.
    super('murco');
    this.version(1).stores({
      settings: 'id',
      clients: 'id, name, email',
      docs: 'id, type, number, clientId, date, status',
      trips: 'id, date, docId, expenseId, clientId',
      expenses: 'id, date, category, docId, clientId',
      emails: 'id, date, clientId, docId',
      services: 'id, code, order',
    });
    this.version(2).stores({
      trips: 'id, date, docId, expenseId, clientId, routeDate',
      jobs: 'id, date, clientId, status, docId',
      media: 'id, docId, jobId, clientId, kind',
    });
    this.version(3).stores({
      leads: 'id, stage, source, nextAction, createdAt',
      members: 'id, role, inviteCode, uid',
      punches: 'id, memberId, jobId, projectId, start',
      projects: 'id, clientId, status',
      docs: 'id, type, number, clientId, date, status, projectId, salesRepId',
      jobs: 'id, date, clientId, status, docId, projectId',
      expenses: 'id, date, category, docId, clientId, projectId',
    });
    // Arrivée des autres entreprises: les réglages par défaut deviennent vides.
    // Les appareils existants (Groupe Murco) gardent leurs informations; _u = 0 → le nuage a toujours priorité.
    this.version(4).stores({}).upgrade(async (tx) => {
      (tx.idbtrans as unknown as Record<string, unknown>)[REMOTE_FLAG] = true;
      const t = tx.table('settings');
      const cur = (await t.get('main')) as Partial<Settings> | undefined;
      await t.put({ ...MURCO_SETTINGS, _u: 0, ...(cur ?? {}), id: 'main', trade: cur?.trade ?? 'exterieur', setupComplete: true });
    });
  }
}

export const db = new MurcoDB();

export const SYNC_TABLES = ['settings', 'clients', 'docs', 'trips', 'expenses', 'emails', 'services', 'jobs', 'media', 'leads', 'members', 'punches', 'projects'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

let lastId = 0;
/** Identifiant numérique unique (horodatage + aléatoire), sans collision entre appareils. */
export function genId(): number {
  let id = Date.now() * 1024 + Math.floor(Math.random() * 1024);
  if (id <= lastId) id = lastId + 1;
  lastId = id;
  return id;
}

export interface LocalChange {
  table: SyncTable;
  type: 'put' | 'delete';
  keys: unknown[];
  values?: unknown[];
}
type ChangeListener = (c: LocalChange) => void;
const listeners = new Set<ChangeListener>();
export function onLocalChange(fn: ChangeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Marque une transaction comme venant du nuage (pas d'horodatage, pas de renvoi). */
export const REMOTE_FLAG = '__murcoRemote';

/** Exécute des écritures sans horodatage ni renvoi au nuage (données venant du nuage). */
export function remoteTx<T>(tables: Table[], fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', tables, async (tx) => {
    (tx.idbtrans as unknown as Record<string, unknown>)[REMOTE_FLAG] = true;
    return fn();
  });
}

// Intercepte toutes les écritures: attribue l'id, horodate (_u) et avertit la synchronisation.
db.use({
  stack: 'dbcore',
  name: 'murco-sync',
  create(down) {
    return {
      ...down,
      table(name) {
        const t = down.table(name);
        if (!(SYNC_TABLES as readonly string[]).includes(name)) return t;
        return {
          ...t,
          mutate(req) {
            const remote = !!(req.trans as unknown as Record<string, unknown>)[REMOTE_FLAG];
            if (!remote && (req.type === 'add' || req.type === 'put')) {
              const now = Date.now();
              const values = req.values.map((v) => ({ ...(v as object), id: (v as { id?: unknown }).id ?? genId(), _u: now }));
              req = { ...req, values } as typeof req;
              if (req.type === 'put' && req.changeSpec) req = { ...req, changeSpec: { ...req.changeSpec, _u: now } };
            }
            return t.mutate(req).then((res) => {
              if (!remote && listeners.size) {
                let change: LocalChange | null = null;
                if (req.type === 'add' || req.type === 'put') {
                  const keys = req.values.map((v) => (v as { id: unknown }).id);
                  change = { table: name as SyncTable, type: 'put', keys, values: req.values as unknown[] };
                } else if (req.type === 'delete') {
                  change = { table: name as SyncTable, type: 'delete', keys: req.keys as unknown[] };
                }
                // Hors de la transaction en cours (la synchro fait ses propres écritures)
                if (change) setTimeout(() => listeners.forEach((fn) => fn(change)), 0);
              }
              return res;
            });
          },
        };
      },
    };
  },
});

/** Réglages de départ d'une nouvelle entreprise (remplis par l'assistant de démarrage). */
export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  ownerName: '',
  companyName: '',
  legalName: '',
  address: '',
  city: '',
  province: 'QC',
  postalCode: '',
  phone: '',
  email: '',
  website: '',
  neq: '',
  tpsNumber: '',
  tvqNumber: '',
  rbqNumber: '',
  homeAddress: '',
  chargeTaxes: false,
  tpsRate: 5,
  tvqRate: 9.975,
  invoicePrefix: 'F-',
  nextInvoiceNumber: 1001,
  quotePrefix: 'S-',
  nextQuoteNumber: 1001,
  paymentTermsDays: 0,
  quoteValidityDays: 30,
  invoiceNotes: 'Merci de votre confiance !',
  quoteNotes: 'Cette soumission est valide 30 jours. Les travaux débuteront à la réception de votre acceptation.',
  paymentInstructions: 'Virement Interac, comptant ou chèque.',
  invoiceConditions: 'Paiement dû selon l’échéance indiquée.',
  autoTripFromInvoices: true,
  autoTripRoundTrip: true,
  kmRateFirst5000: 0.72,
  kmRateAfter5000: 0.66,
  vehicle: '',
  laborCostPerHour: 0,
  kmCost: 0.72,
  taxFiling: 'annuel',
  googleReviewUrl: '',
  leadForm: false,
  leadFormIntro: 'Décrivez votre projet, on vous revient rapidement avec une soumission.',
  cardPayments: false,
  paymentsEndpoint: '',
  googleMapsKey: '',
  googleClientId: '',
  accountantName: '',
  accountantEmail: '',
  emailSignature: '',
};

/** Réglages de Groupe Murco (comptes existants avant l'arrivée des autres entreprises). */
export const MURCO_SETTINGS: Settings = {
  id: 'main',
  ownerName: 'Samuel Michea',
  companyName: 'Groupe Murco',
  legalName: '9568-5590 Québec inc.',
  address: '16, rue Fortin',
  city: 'Sherrington',
  province: 'QC',
  postalCode: '',
  phone: '514-232-1837',
  email: 'info@groupemurco.com',
  website: '',
  neq: '',
  tpsNumber: '',
  tvqNumber: '',
  rbqNumber: '',
  homeAddress: '16, rue Fortin, Sherrington, QC',
  chargeTaxes: false,
  tpsRate: 5,
  tvqRate: 9.975,
  invoicePrefix: 'F-',
  nextInvoiceNumber: 1001,
  quotePrefix: 'S-',
  nextQuoteNumber: 1001,
  paymentTermsDays: 0,
  quoteValidityDays: 30,
  invoiceNotes: 'Merci de votre confiance !',
  quoteNotes: 'Cette soumission est valide 30 jours. Les travaux débuteront à la réception de votre acceptation.',
  paymentInstructions: 'Virement Interac à info@groupemurco.com, comptant ou chèque.',
  invoiceConditions: 'Paiement dû selon l’échéance indiquée. Chèque libellé à l’ordre de 9568-5590 Québec inc.',
  autoTripFromInvoices: true,
  autoTripRoundTrip: true,
  kmRateFirst5000: 0.72,
  kmRateAfter5000: 0.66,
  vehicle: '',
  laborCostPerHour: 0,
  kmCost: 0.72,
  taxFiling: 'annuel',
  googleReviewUrl: '',
  leadForm: false,
  leadFormIntro: 'Décrivez votre projet, on vous revient rapidement avec une soumission.',
  cardPayments: false,
  paymentsEndpoint: '',
  googleMapsKey: '',
  googleClientId: '',
  accountantName: '',
  accountantEmail: '',
  emailSignature: 'Samuel Michea\nGroupe Murco',
};

/** Liste de prix de départ (reprise de ton chiffrier). */
export const DEFAULT_SERVICES: Omit<Service, 'id'>[] = [
  { code: 'NDG', name: 'Nettoyage de gouttières', unit: 'pi lin', price: 1.5, minimum: 150, notes: 'Vider les feuilles, enlever la boue, rincer les descentes.' },
  { code: 'PGM', name: 'Protège-gouttières — matériel', unit: 'pi lin', price: 4.5, minimum: 0, notes: 'Grillage en aluminium. Ton coût + ta marge.' },
  { code: 'PGI', name: 'Protège-gouttières — installation', unit: 'pi lin', price: 4, minimum: 0, notes: 'Même nombre de pi lin que le matériel.' },
  { code: 'LAP', name: 'Lavage à pression — revêtement', unit: 'pi²', price: 0.3, minimum: 200, notes: 'Vinyle, alu, brique. Pi² = longueur des murs × hauteur.' },
  { code: 'LVE', name: 'Lavage de vitres extérieures', unit: 'fenêtre', price: 15, minimum: 100, notes: 'Nombre de fenêtres.' },
  { code: 'SUP', name: 'Supplément hauteur (2e / 3e étage)', unit: 'fenêtre', price: 5, minimum: 0, notes: 'Nb de fenêtres en hauteur.' },
  { code: 'RAM', name: 'Ramassage de feuilles / fermeture de terrain', unit: 'pi²', price: 0.04, minimum: 125, notes: 'Superficie du terrain.' },
  { code: 'SAC', name: 'Sacs de feuilles (fourniture + disposition)', unit: 'sac', price: 3, minimum: 0, notes: '' },
  { code: 'HR', name: 'Main-d’œuvre à l’heure', unit: 'heure', price: 55, minimum: 0, notes: 'Extras.' },
  { code: 'DEP', name: 'Frais de déplacement', unit: 'forfait', price: 25, minimum: 0, notes: 'Clients plus loin.' },
].map((x, i) => ({ ...x, order: i }));

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('main');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: 'main' });
}

/** Attribue le prochain numéro de facture/soumission et incrémente le compteur. */
export async function takeNextNumber(type: DocType): Promise<string> {
  return db.transaction('rw', db.settings, db.docs, async () => {
    const s = await getSettings();
    const prefix = type === 'invoice' ? s.invoicePrefix : s.quotePrefix;
    let n = type === 'invoice' ? s.nextInvoiceNumber : s.nextQuoteNumber;
    // Évite les doublons si le compteur a été modifié à la main
    while (await db.docs.where('number').equals(`${prefix}${n}`).count()) n++;
    await db.settings.put({ ...s, ...(type === 'invoice' ? { nextInvoiceNumber: n + 1 } : { nextQuoteNumber: n + 1 }) });
    return `${prefix}${n}`;
  });
}
