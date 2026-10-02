import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection, connectFirestoreEmulator, doc, getDoc, initializeFirestore, onSnapshot, query, setDoc, updateDoc, where, type Firestore,
} from 'firebase/firestore';
import { db, getSettings, type Doc, type LineItem, type Signature } from './db';
import { configFromLink, getFirebaseConfig, onSyncAttach, onSyncedPut, syncContext, type FirebaseConfig } from './sync';
import { companyAddressLines, docTotals, type Totals } from './utils';

/*
 * Portail client: le client ouvre un lien (sans compte) pour voir sa soumission ou sa facture,
 * accepter la soumission avec sa signature, et voir comment payer.
 * Les données publiées sont une copie (users/… reste privé). Voir firestore.rules.
 */

export interface PortalData {
  owner: string;
  token: string;
  company: {
    name: string;
    legalName: string;
    owner: string;
    lines: string[];
    phone: string;
    email: string;
    logo?: string;
    paymentInstructions: string;
    conditions: string;
    tpsRate: number;
    tvqRate: number;
    tpsNumber: string;
    tvqNumber: string;
    chargeTaxes: boolean;
  };
  client: { name: string; address: string };
  doc: {
    kind: 'invoice' | 'quote';
    number: string;
    date: string;
    dueDate: string;
    jobDate: string;
    title: string;
    jobAddress: string;
    items: LineItem[];
    applyTps: boolean;
    applyTvq: boolean;
    discount: number;
    deposit: number;
    notes: string;
    status: Doc['status'];
    totals: Totals;
  };
  signature?: Signature | null;
  viewedAt?: string | null;
  updatedAt: string;
}

function newToken(): string {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function buildPortalData(d: Doc, token: string, owner: string): Promise<Omit<PortalData, 'signature' | 'viewedAt'>> {
  const s = await getSettings();
  const c = await db.clients.get(d.clientId);
  return {
    owner,
    token,
    company: {
      name: s.companyName,
      legalName: s.legalName,
      owner: s.ownerName,
      lines: companyAddressLines(s),
      phone: s.phone,
      email: s.email,
      logo: s.logo && s.logo.length < 300_000 ? s.logo : undefined,
      paymentInstructions: s.paymentInstructions,
      conditions: s.invoiceConditions,
      tpsRate: s.tpsRate,
      tvqRate: s.tvqRate,
      tpsNumber: s.tpsNumber,
      tvqNumber: s.tvqNumber,
      chargeTaxes: s.chargeTaxes,
    },
    client: { name: c?.name ?? '', address: c?.address ?? '' },
    doc: {
      kind: d.type,
      number: d.number,
      date: d.date,
      dueDate: d.dueDate,
      jobDate: d.jobDate,
      title: d.title,
      jobAddress: d.jobAddress,
      items: d.items.map(({ calc: _calc, ...it }) => it),
      applyTps: d.applyTps,
      applyTvq: d.applyTvq,
      discount: d.discount ?? 0,
      deposit: d.deposit ?? 0,
      notes: d.notes,
      status: d.status,
      totals: docTotals(d, s),
    },
    updatedAt: new Date().toISOString(),
  };
}

/** Publie (ou met à jour) la page client et retourne le lien à envoyer. */
export async function publishPortal(docId: number): Promise<string> {
  const ctx = syncContext();
  if (!ctx) throw new Error('Le lien client utilise la synchronisation: connecte-toi dans Paramètres → Synchronisation.');
  const d = await db.docs.get(docId);
  if (!d) throw new Error('Document introuvable');
  const token = d.portalToken || newToken();
  await setDoc(doc(ctx.fs, 'portal', token), await buildPortalData(d, token, ctx.uid), { merge: true });
  if (!d.portalToken) await db.docs.update(docId, { portalToken: token });
  return portalLink(token);
}

export function portalLink(token: string): string {
  const base = `${location.origin}${location.pathname}#/p/${token}`;
  const built = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
  if (built) return base;
  const cfg = getFirebaseConfig();
  if (!cfg) return base;
  const { apiKey, authDomain, projectId, appId, emulator } = cfg;
  const b64 = btoa(JSON.stringify({ apiKey, authDomain, projectId, appId, emulator })).replace(/=+$/, '');
  return `${base}?c=${encodeURIComponent(b64)}`;
}

// Côté propriétaire: republie quand le document change, et reçoit les signatures.
onSyncedPut((table, v) => {
  if (table !== 'docs' || !v.portalToken) return;
  const ctx = syncContext();
  if (!ctx) return;
  void buildPortalData(v as unknown as Doc, v.portalToken as string, ctx.uid).then((data) => setDoc(doc(ctx.fs, 'portal', v.portalToken as string), data, { merge: true })).catch(() => undefined);
});

onSyncAttach(() => {
  const ctx = syncContext();
  if (!ctx) return;
  return onSnapshot(query(collection(ctx.fs, 'portal'), where('owner', '==', ctx.uid)), async (snap) => {
    for (const ch of snap.docChanges()) {
      const p = ch.doc.data() as PortalData;
      const local = (await db.docs.filter((d) => d.portalToken === p.token).toArray())[0];
      if (!local?.id) continue;
      const patch: Partial<Doc> = {};
      if (p.viewedAt && p.viewedAt !== local.viewedAt) patch.viewedAt = p.viewedAt;
      if (p.signature && !local.signature) {
        patch.signature = p.signature;
        if (local.type === 'quote' && (local.status === 'draft' || local.status === 'sent')) patch.status = 'accepted';
      }
      if (Object.keys(patch).length) await db.docs.update(local.id, patch);
    }
  });
});

// ---------- Côté client (page publique, sans compte) ----------
let viewApp: FirebaseApp | null = null;
let viewFs: Firestore | null = null;

function portalFs(cfgParam: string | null): Firestore {
  if (viewFs) return viewFs;
  const cfg: FirebaseConfig | null = (cfgParam ? configFromLinkLoose(cfgParam) : null) ?? getFirebaseConfig();
  if (!cfg) throw new Error('Lien incomplet. Demande un nouveau lien à l’entreprise.');
  viewApp = initializeApp(cfg, 'murco-portal');
  viewFs = initializeFirestore(viewApp, { ignoreUndefinedProperties: true });
  if (cfg.emulator) connectFirestoreEmulator(viewFs, '127.0.0.1', 8080);
  return viewFs;
}

function configFromLinkLoose(p: string): FirebaseConfig | null {
  try {
    const j = JSON.parse(atob(decodeURIComponent(p)));
    if (j.apiKey && j.projectId) return { authDomain: `${j.projectId}.firebaseapp.com`, ...j };
  } catch {
    /* ancien format */
  }
  return configFromLink(p);
}

export async function loadPortal(token: string, cfgParam: string | null): Promise<PortalData | null> {
  const fs = portalFs(cfgParam);
  const snap = await getDoc(doc(fs, 'portal', token));
  if (!snap.exists()) return null;
  const data = snap.data() as PortalData;
  if (!data.viewedAt) {
    try {
      await updateDoc(doc(fs, 'portal', token), { viewedAt: new Date().toISOString() });
    } catch {
      /* lecture seule */
    }
  }
  return data;
}

export async function signPortal(token: string, cfgParam: string | null, sig: Signature): Promise<void> {
  const fs = portalFs(cfgParam);
  await updateDoc(doc(fs, 'portal', token), { signature: sig });
}
