import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  collection,
  getDoc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { useSyncExternalStore } from 'react';
import { db, onLocalChange, remoteTx, SYNC_TABLES, type SyncTable } from './db';
import { blobToBase64 } from './utils';

/*
 * Synchronisation entre appareils (téléphone, ordi…) avec Firebase (Google), forfait gratuit.
 * - Chaque appareil garde une copie complète (fonctionne hors-ligne).
 * - Chaque modification est horodatée (_u); la plus récente gagne.
 * - Les suppressions sont des « pierres tombales » (_deleted) pour se propager partout.
 * - Les photos de reçus sont stockées à part (collection « photos »).
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  emulator?: boolean; // tests locaux
}

const CONFIG_KEY = 'murco.firebase';
const PENDING_DELETES = 'murco.pendingDeletes';

export interface SyncState {
  status: 'off' | 'signedout' | 'connecting' | 'syncing' | 'ok' | 'error';
  email?: string;
  lastSync?: number;
  error?: string;
  configured: boolean;
}

let state: SyncState = { status: 'off', configured: false };
const subs = new Set<() => void>();
function setState(p: Partial<SyncState>) {
  state = { ...state, ...p };
  subs.forEach((f) => f());
}
export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
}

/** Accepte le JSON ou le bout de code copié de la console Firebase (const firebaseConfig = {...}). */
export function parseFirebaseConfig(text: string): FirebaseConfig | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const j = JSON.parse(t);
    if (j.apiKey && j.projectId) return j;
  } catch {
    /* format JS */
  }
  const out: Record<string, string | boolean> = {};
  for (const m of t.matchAll(/(\w+)\s*:\s*["']([^"']+)["']/g)) out[m[1]] = m[2];
  if (/emulator\s*:\s*true/.test(t)) out.emulator = true;
  if (!out.apiKey || !out.projectId) return null;
  out.authDomain ||= `${out.projectId}.firebaseapp.com`;
  return out as unknown as FirebaseConfig;
}

export function getFirebaseConfig(): FirebaseConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  // Configuration intégrée au moment de la compilation (optionnel)
  const env = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
  return env ? parseFirebaseConfig(env) : null;
}

export function saveFirebaseConfig(cfg: FirebaseConfig | null) {
  try {
    if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* ignore */
  }
}

/** Lien à ouvrir sur un autre appareil pour lui donner la même configuration. */
export function deviceLink(): string | null {
  const cfg = getFirebaseConfig();
  if (!cfg) return null;
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
  return `${location.origin}${location.pathname}#/parametres?sync=${encodeURIComponent(b64)}`;
}

export function configFromLink(param: string): FirebaseConfig | null {
  try {
    return parseFirebaseConfig(decodeURIComponent(escape(atob(param))));
  } catch {
    return null;
  }
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let fs: Firestore | null = null;
let user: User | null = null;
let unsubs: Unsubscribe[] = [];
let stopLocal: (() => void) | null = null;

/** Accès Firestore pour les autres modules (portail client). */
export function syncContext(): { fs: Firestore; uid: string } | null {
  return fs && user ? { fs, uid: user.uid } : null;
}
const attachListeners = new Set<() => (() => void) | void>();
/** Exécuté à chaque connexion au compte (ex.: écoute du portail client). */
export function onSyncAttach(fn: () => (() => void) | void) {
  attachListeners.add(fn);
}
const localDocHooks = new Set<(table: SyncTable, v: Record<string, unknown>) => void>();
export function onSyncedPut(fn: (table: SyncTable, v: Record<string, unknown>) => void) {
  localDocHooks.add(fn);
}

function base() {
  return `users/${user!.uid}`;
}

export function startSync(): void {
  const cfg = getFirebaseConfig();
  if (!cfg || app) {
    setState({ configured: !!cfg, status: cfg ? state.status : 'off' });
    return;
  }
  try {
    app = initializeApp(cfg, 'murco');
    auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence], popupRedirectResolver: browserPopupRedirectResolver });
    fs = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    if (cfg.emulator) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(fs, '127.0.0.1', 8080);
    }
  } catch (e) {
    setState({ configured: true, status: 'error', error: msg(e) });
    return;
  }
  setState({ configured: true, status: 'signedout' });
  onAuthStateChanged(auth, (u) => {
    detach();
    user = u;
    if (u) attach();
    else setState({ status: 'signedout', email: undefined });
  });
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function authError(e: unknown): Error {
  const code = (e as { code?: string }).code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Courriel ou mot de passe invalide.',
    'auth/wrong-password': 'Mot de passe invalide.',
    'auth/user-not-found': 'Aucun compte avec ce courriel. Crée-le d’abord.',
    'auth/email-already-in-use': 'Ce courriel a déjà un compte: connecte-toi.',
    'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
    'auth/invalid-email': 'Courriel invalide.',
    'auth/operation-not-allowed': 'Active « Courriel/Mot de passe » (ou Google) dans Firebase → Authentication.',
    'auth/unauthorized-domain': `Ajoute ${location.hostname} dans Firebase → Authentication → Paramètres → Domaines autorisés.`,
    'auth/popup-blocked': 'Fenêtre bloquée: autorise les fenêtres surgissantes ou utilise courriel + mot de passe.',
    'auth/network-request-failed': 'Pas de connexion Internet.',
  };
  return new Error(map[code] ?? msg(e));
}

export async function signInEmail(email: string, password: string, create = false) {
  if (!auth) throw new Error('Synchronisation non configurée.');
  try {
    if (create) await createUserWithEmailAndPassword(auth, email.trim(), password);
    else await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (e) {
    throw authError(e);
  }
}

export async function signInGoogle() {
  if (!auth) throw new Error('Synchronisation non configurée.');
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    throw authError(e);
  }
}

export async function resetPassword(email: string) {
  if (!auth) throw new Error('Synchronisation non configurée.');
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (e) {
    throw authError(e);
  }
}

export async function signOutSync() {
  if (auth) await signOut(auth);
}

function detach() {
  unsubs.forEach((u) => u());
  unsubs = [];
  stopLocal?.();
  stopLocal = null;
}

type Rec = Record<string, unknown> & { id: number | string; _u?: number; _deleted?: boolean };

const keyOf = (table: SyncTable, id: string): number | string => (table === 'settings' ? id : Number(id));

/** Tables qui contiennent un fichier (photo): champ du fichier, de l'empreinte, du nom et du type. */
const BLOBS: Partial<Record<SyncTable, { field: string; sig: string; name: string; type: string }>> = {
  expenses: { field: 'photo', sig: 'photoSig', name: 'photoName', type: 'photoType' },
  media: { field: 'blob', sig: 'sig', name: 'name', type: 'type' },
};

function clean(table: SyncTable, v: Rec): Rec {
  const cfg = BLOBS[table];
  if (!cfg) return v;
  const rest = { ...v };
  delete rest[cfg.field];
  return rest;
}

const photoSig = (b: Blob) => `${b.size}-${b.type}`;
const fileDocId = (table: SyncTable, id: unknown) => `${table}-${id}`;

/** Réduit une photo pour qu'elle tienne dans un document Firestore (< 1 Mo). */
async function shrinkForCloud(b: Blob): Promise<Blob> {
  if (b.size < 650_000) return b;
  if (!b.type.startsWith('image/')) throw new Error('Fichier trop lourd (max. 650 Ko)');
  const bmp = await createImageBitmap(b);
  for (const [max, q] of [[1400, 0.72], [1100, 0.62], [850, 0.55]] as const) {
    const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * sc);
    c.height = Math.round(bmp.height * sc);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', q));
    if (out && out.size < 650_000) return out;
  }
  throw new Error('Photo trop lourde pour la synchronisation');
}

async function pushRecord(table: SyncTable, v: Rec) {
  if (!fs || !user) return;
  const rec = { ...clean(table, v) };
  const cfg = BLOBS[table];
  const file = cfg ? v[cfg.field] : undefined;
  if (cfg && file instanceof Blob) {
    const sig = photoSig(file);
    if (rec[cfg.sig] !== sig) {
      rec[cfg.sig] = sig;
      // garde la même empreinte localement, sans changer l'horodatage
      const t = db.table(table);
      await remoteTx([t], () => t.update(v.id, { [cfg.sig]: sig }));
      try {
        const small = await shrinkForCloud(file);
        await setDoc(doc(fs, base(), 'files', fileDocId(table, v.id)), {
          data: await blobToBase64(small),
          type: small.type,
          name: (v[cfg.name] as string) ?? 'photo.jpg',
          sig,
        });
      } catch (e) {
        setState({ error: `Photo non synchronisée: ${msg(e)}` });
      }
    }
  }
  await setDoc(doc(fs, base(), table, String(v.id)), rec);
}

async function pushDelete(table: SyncTable, id: unknown) {
  if (!fs || !user) {
    // hors connexion au compte: on retient la suppression pour plus tard
    try {
      const list = JSON.parse(localStorage.getItem(PENDING_DELETES) ?? '[]') as [string, unknown, number][];
      list.push([table, id, Date.now()]);
      localStorage.setItem(PENDING_DELETES, JSON.stringify(list));
    } catch {
      /* ignore */
    }
    return;
  }
  await setDoc(doc(fs, base(), table, String(id)), { id, _deleted: true, _u: Date.now() });
}

async function fetchFile(table: SyncTable, id: unknown): Promise<{ blob: Blob; name: string; type: string } | null> {
  if (!fs || !user) return null;
  const snap = await getDoc(doc(fs, base(), 'files', fileDocId(table, id)));
  if (!snap.exists()) return null;
  const d = snap.data() as { data: string; type: string; name: string };
  const bin = atob(d.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: d.type }), name: d.name, type: d.type };
}

/** Applique un enregistrement venant du nuage s'il est plus récent que la copie locale. */
async function applyRemote(table: SyncTable, remote: Rec) {
  const t = db.table(table);
  const key = keyOf(table, String(remote.id));
  const local = (await t.get(key)) as Rec | undefined;
  const ru = remote._u ?? 0;
  const lu = local?._u ?? -1;
  if (local && lu > ru && !remote._deleted) {
    await pushRecord(table, local); // la copie locale est plus récente (modifiée hors-ligne)
    return;
  }
  if (remote._deleted) {
    if (local && lu <= ru) await remoteTx([t], () => t.delete(key));
    return;
  }
  if (local && lu === ru) return;
  let rec: Rec = { ...remote, id: key };
  const cfg = BLOBS[table];
  if (cfg) {
    const keepLocal = () => ({ [cfg.field]: local![cfg.field], [cfg.name]: local![cfg.name], [cfg.type]: local![cfg.type] });
    if (local?.[cfg.field] && local[cfg.sig] === remote[cfg.sig]) rec = { ...rec, ...keepLocal() };
    else if (remote[cfg.sig]) {
      const f = await fetchFile(table, key).catch(() => null);
      if (f) rec = { ...rec, [cfg.field]: f.blob, [cfg.name]: f.name, [cfg.type]: f.type };
      else if (local?.[cfg.field]) rec = { ...rec, ...keepLocal() };
    }
  }
  await remoteTx([t], () => t.put(rec));
}

function attach() {
  if (!fs || !user) return;
  setState({ status: 'syncing', email: user.email ?? undefined, error: undefined });

  // Suppressions faites avant la connexion
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_DELETES) ?? '[]') as [SyncTable, unknown, number][];
    localStorage.removeItem(PENDING_DELETES);
    list.forEach(([table, id, at]) => setDoc(doc(fs!, base(), table, String(id)), { id, _deleted: true, _u: at }));
  } catch {
    /* ignore */
  }

  // Local → nuage
  stopLocal = onLocalChange((c) => {
    const job =
      c.type === 'put'
        ? Promise.all((c.values ?? []).map(async (v) => {
            await pushRecord(c.table, v as Rec);
            localDocHooks.forEach((fn) => fn(c.table, v as Rec));
          }))
        : Promise.all(c.keys.map((k) => pushDelete(c.table, k)));
    job.then(() => setState({ lastSync: Date.now() })).catch((e) => setState({ status: 'error', error: msg(e) }));
  });

  attachListeners.forEach((fn) => {
    const stop = fn();
    if (stop) unsubs.push(stop);
  });

  // Nuage → local (temps réel)
  let pendingFirst = SYNC_TABLES.length;
  for (const table of SYNC_TABLES) {
    let first = true;
    let queue = Promise.resolve();
    const u = onSnapshot(
      collection(fs, base(), table),
      (snap) => {
        const changes = snap.docChanges().filter((ch) => ch.type !== 'removed');
        const isFirst = first;
        first = false;
        queue = queue.then(async () => {
          for (const ch of changes) await applyRemote(table, { ...(ch.doc.data() as Rec), id: ch.doc.id });
          if (isFirst) {
            // Envoie ce qui n'existe que sur cet appareil
            const remoteIds = new Set(snap.docs.map((d) => d.id));
            const locals = (await db.table(table).toArray()) as Rec[];
            for (const l of locals) if (!remoteIds.has(String(l.id))) await pushRecord(table, l);
            if (--pendingFirst === 0) setState({ status: 'ok', lastSync: Date.now() });
          } else setState({ lastSync: Date.now() });
        }).catch((e) => setState({ status: 'error', error: msg(e) }));
      },
      (e) => setState({ status: 'error', error: msg(e).includes('permission') ? 'Accès refusé: vérifie les règles Firestore (voir README).' : msg(e) }),
    );
    unsubs.push(u);
  }
}
