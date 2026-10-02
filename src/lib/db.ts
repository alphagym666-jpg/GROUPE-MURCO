import Dexie, { type Table } from 'dexie';

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Settings {
  id: 'main';
  // Compagnie
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
  // Journal de bord
  autoTripFromInvoices: boolean;
  autoTripRoundTrip: boolean;
  kmRateFirst5000: number;
  kmRateAfter5000: number;
  vehicle: string;
  // Gmail / Comptable
  googleClientId: string;
  accountantName: string;
  accountantEmail: string;
  emailSignature: string;
}

export interface Client {
  id?: number;
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  geo?: GeoPoint;
  notes: string;
  createdAt: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export type DocType = 'invoice' | 'quote';
export type DocStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'accepted' | 'refused' | 'cancelled';

export interface Payment {
  date: string;
  amount: number;
  method: string;
}

export interface Doc {
  id?: number;
  type: DocType;
  number: string;
  clientId: number;
  date: string; // YYYY-MM-DD
  dueDate: string;
  jobDate: string;
  jobAddress: string;
  jobGeo?: GeoPoint;
  title: string; // description courte de la job (sert de raison pour le journal de bord)
  items: LineItem[];
  applyTps: boolean;
  applyTvq: boolean;
  notes: string;
  status: DocStatus;
  payments: Payment[];
  sourceQuoteId?: number;
  convertedInvoiceId?: number;
  tripId?: number;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Trip {
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
  source: 'auto-facture' | 'auto-recu' | 'manuel';
  distanceMethod: 'route' | 'estimation' | 'manuel';
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

export interface Expense {
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
  geoSource?: 'photo' | 'gps' | 'adresse';
  kmFromHome?: number;
  clientId?: number;
  docId?: number;
  tripId?: number;
  createdAt: string;
}

export interface EmailLog {
  id?: number;
  date: string;
  to: string;
  subject: string;
  clientId?: number;
  docId?: number;
  gmailId?: string;
  kind: 'facture' | 'soumission' | 'comptable' | 'autre';
}

class MurcoDB extends Dexie {
  settings!: Table<Settings, string>;
  clients!: Table<Client, number>;
  docs!: Table<Doc, number>;
  trips!: Table<Trip, number>;
  expenses!: Table<Expense, number>;
  emails!: Table<EmailLog, number>;

  constructor() {
    super('murco-gestion');
    this.version(1).stores({
      settings: 'id',
      clients: '++id, name, email',
      docs: '++id, type, number, clientId, date, status, [type+date]',
      trips: '++id, date, docId, expenseId, clientId',
      expenses: '++id, date, category, docId, clientId',
      emails: '++id, date, clientId, docId',
    });
  }
}

export const db = new MurcoDB();

export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  companyName: 'Groupe Murco Inc.',
  legalName: 'Groupe Murco Inc.',
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
  tpsRate: 5,
  tvqRate: 9.975,
  invoicePrefix: 'F-',
  nextInvoiceNumber: 1001,
  quotePrefix: 'S-',
  nextQuoteNumber: 1001,
  paymentTermsDays: 30,
  quoteValidityDays: 30,
  invoiceNotes: 'Merci de votre confiance!',
  quoteNotes: 'Cette soumission est valide 30 jours. Les travaux débuteront à la réception de votre acceptation.',
  paymentInstructions: 'Paiement par virement Interac, chèque ou comptant.',
  autoTripFromInvoices: true,
  autoTripRoundTrip: true,
  kmRateFirst5000: 0.72,
  kmRateAfter5000: 0.66,
  vehicle: '',
  googleClientId: '',
  accountantName: '',
  accountantEmail: '',
  emailSignature: 'Groupe Murco Inc.',
};

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
