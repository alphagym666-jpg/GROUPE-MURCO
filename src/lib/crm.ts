import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, getSettings, takeNextNumber, type Doc, type Lead, type LeadSource, type LeadStage } from './db';
import { publicBase } from './native';
import { getFirebaseConfig, onSyncAttach, syncContext } from './sync';
import { addDays, todayISO } from './utils';

export const STAGES: { key: LeadStage; label: string; tone: string }[] = [
  { key: 'nouveau', label: 'Nouvelles', tone: 'amber' },
  { key: 'contacte', label: 'Contactées', tone: 'blue' },
  { key: 'visite', label: 'Visite / estimation', tone: 'blue' },
  { key: 'soumission', label: 'Soumission envoyée', tone: 'blue' },
  { key: 'gagne', label: 'Gagnées', tone: 'green' },
  { key: 'perdu', label: 'Perdues', tone: 'gray' },
];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label])) as Record<LeadStage, string>;
export const OPEN_STAGES: LeadStage[] = ['nouveau', 'contacte', 'visite', 'soumission'];

export const SOURCE_LABEL: Record<LeadSource, string> = {
  formulaire: 'Formulaire web',
  facebook: 'Facebook',
  google: 'Google',
  site: 'Site web',
  reference: 'Référence',
  telephone: 'Téléphone',
  autre: 'Autre',
};

export function blankLead(): Lead {
  return {
    name: '', phone: '', email: '', address: '', service: '', message: '', source: 'telephone', stage: 'nouveau', value: 0,
    nextAction: todayISO(), history: [], createdAt: new Date().toISOString(),
  };
}

export const note = (text: string) => ({ at: new Date().toISOString(), text });

export async function setStage(id: number, stage: LeadStage, extra: Partial<Lead> = {}) {
  const l = await db.leads.get(id);
  if (!l || l.stage === stage) {
    if (l && Object.keys(extra).length) await db.leads.update(id, extra);
    return;
  }
  const next: Partial<Lead> = { stage, history: [...l.history, note(`Étape: ${STAGE_LABEL[stage]}`)], ...extra };
  if (stage === 'gagne' || stage === 'perdu') next.nextAction = undefined;
  else if (!l.nextAction) next.nextAction = addDays(todayISO(), 2);
  await db.leads.update(id, next);
}

/** Crée le client (au besoin) et la soumission à partir de la demande. */
export async function leadToQuote(id: number): Promise<number> {
  const l = await db.leads.get(id);
  if (!l) throw new Error('Demande introuvable');
  if (l.quoteId && (await db.docs.get(l.quoteId))) return l.quoteId;
  const s = await getSettings();
  let clientId = l.clientId;
  if (!clientId) {
    const existing = (await db.clients.toArray()).find((c) => (l.phone && c.phone.replace(/\D/g, '') === l.phone.replace(/\D/g, '')) || (l.email && c.email.toLowerCase() === l.email.toLowerCase()));
    clientId = existing?.id ?? (await db.clients.add({ name: l.name, contact: '', email: l.email, phone: l.phone, address: l.address, geo: l.geo, notes: l.message, createdAt: new Date().toISOString() }));
  }
  const now = new Date().toISOString();
  const date = todayISO();
  const quote: Doc = {
    type: 'quote', number: await takeNextNumber('quote'), clientId, date, dueDate: addDays(date, s.quoteValidityDays), jobDate: '',
    jobAddress: l.address, jobGeo: l.geo, title: l.service, items: [{ code: '', description: l.service, unit: '', quantity: 1, unitPrice: l.value || 0 }],
    applyTps: s.chargeTaxes, applyTvq: s.chargeTaxes, notes: s.quoteNotes, status: 'draft', payments: [], leadId: id, salesRepId: l.assignedTo,
    createdAt: now, updatedAt: now,
  };
  const qid = await db.docs.add(quote);
  await db.leads.update(id, { clientId, quoteId: qid, stage: 'soumission', history: [...l.history, note(`Soumission ${quote.number} créée`)], nextAction: addDays(date, 3), nextNote: 'Suivi de la soumission' });
  return qid;
}

/** Met la demande à jour selon la soumission (acceptée → gagnée, refusée → perdue). */
export async function syncLeadFromDoc(d: Doc) {
  if (!d.leadId) return;
  if (d.type === 'quote' && (d.status === 'accepted' || d.signature || d.convertedInvoiceId)) await setStage(d.leadId, 'gagne', { value: 0 });
  else if (d.type === 'quote' && d.status === 'refused') await setStage(d.leadId, 'perdu', { lostReason: 'Soumission refusée' });
}

// ---------- Formulaire public ----------

/** Publie (ou retire) la page publique de l'entreprise pour le formulaire de demande. */
export async function publishLeadForm(enabled: boolean): Promise<void> {
  const ctx = syncContext();
  if (!ctx) throw new Error('Le formulaire en ligne utilise la synchronisation: connecte-toi dans Paramètres → Synchronisation.');
  const s = await getSettings();
  const services = (await db.services.orderBy('order').toArray()).map((x) => x.name);
  await setDoc(doc(ctx.fs, 'public', ctx.workspace), {
    leadForm: enabled,
    name: s.companyName,
    logo: s.logo && s.logo.length < 300_000 ? s.logo : null,
    color: s.brandColor ?? null,
    phone: s.phone,
    email: s.email,
    intro: s.leadFormIntro,
    services,
    updatedAt: new Date().toISOString(),
  });
}

export function leadFormLink(source?: LeadSource): string | null {
  const ctx = syncContext();
  const cfg = getFirebaseConfig();
  if (!ctx || !cfg) return null;
  const built = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
  const params = new URLSearchParams();
  if (source) params.set('s', source);
  if (!built) params.set('c', btoa(JSON.stringify({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId, emulator: cfg.emulator })).replace(/=+$/, ''));
  return `${publicBase()}#/demande/${ctx.workspace}?${params.toString()}`;
}

/** Identifiant numérique stable à partir de l'identifiant Firestore (pas de doublon si 2 appareils importent). */
function stableId(s: string): number {
  let h1 = 0x811c9dc5;
  let h2 = 0x1234567;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822519);
  }
  return (Math.abs(h1) % 2 ** 21) * 2 ** 31 + (Math.abs(h2) % 2 ** 31);
}

// Les demandes envoyées par le formulaire arrivent dans l'app (et sont retirées de la boîte)
onSyncAttach(() => {
  const ctx = syncContext();
  if (!ctx || !['owner', 'admin', 'vendeur'].includes(ctx.role)) return;
  return onSnapshot(collection(ctx.fs, 'inbox', ctx.workspace, 'leads'), async (snap) => {
    for (const d of snap.docs) {
      const x = d.data() as { name: string; phone: string; email: string; address: string; service: string; message: string; source?: string; at: string };
      const id = stableId(d.id);
      if (!(await db.leads.get(id))) {
        await db.leads.put({
          ...blankLead(),
          id,
          name: x.name, phone: x.phone, email: x.email, address: x.address, service: x.service, message: x.message,
          source: (x.source as LeadSource) || 'formulaire',
          createdAt: x.at || new Date().toISOString(),
          history: [note('Reçue par le formulaire en ligne')],
        });
      }
      await deleteDoc(d.ref).catch(() => undefined);
    }
  });
});

// ---------- Côté visiteur (page publique) ----------
export interface PublicProfile {
  leadForm: boolean;
  name: string;
  logo?: string | null;
  color?: string | null;
  phone: string;
  email: string;
  intro: string;
  services: string[];
}

export async function loadPublicProfile(fs: import('firebase/firestore').Firestore, owner: string): Promise<PublicProfile | null> {
  const snap = await getDoc(doc(fs, 'public', owner));
  return snap.exists() ? (snap.data() as PublicProfile) : null;
}

export async function submitLead(fs: import('firebase/firestore').Firestore, owner: string, data: { name: string; phone: string; email: string; address: string; service: string; message: string; source: string }) {
  await addDoc(collection(fs, 'inbox', owner, 'leads'), { ...data, at: new Date().toISOString() });
}
