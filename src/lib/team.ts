import { collection, deleteDoc, doc, getDoc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db, type Member, type MemberRole } from './db';
import { publicBase } from './native';
import { getFirebaseConfig, onSyncAttach, onSyncedPut, reattach, syncContext } from './sync';

/*
 * Équipe: le propriétaire invite des employés / vendeurs par un lien.
 * - users/{proprio}/invites/{code} : invitation (rôle, membre)
 * - memberships/{uidEmployé}       : lien employé → entreprise (vérifié par les règles Firestore)
 */

export const ROLE_LABEL: Record<MemberRole | 'owner', string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  vendeur: 'Vendeur',
  employe: 'Employé',
};

export const MEMBER_COLORS = ['#e0901f', '#2b63c6', '#157f5b', '#9b3fb5', '#c2362f', '#0e8a8a', '#7a5c2e'];

export function newInviteCode(): string {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, '').slice(0, 12);
}

export function blankMember(n = 0): Member {
  return {
    name: '', email: '', phone: '', role: 'employe', hourlyCost: 25, commissionRate: 0, active: true,
    inviteCode: newInviteCode(), color: MEMBER_COLORS[n % MEMBER_COLORS.length], createdAt: new Date().toISOString(),
  };
}

/** Lien d'invitation à envoyer à l'employé. */
export function inviteLink(m: Member): string | null {
  const ctx = syncContext();
  const cfg = getFirebaseConfig();
  if (!ctx || !cfg) return null;
  const c = btoa(JSON.stringify({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId, emulator: cfg.emulator })).replace(/=+$/, '');
  return `${publicBase()}#/rejoindre?o=${encodeURIComponent(ctx.workspace)}&i=${encodeURIComponent(m.inviteCode)}&c=${encodeURIComponent(c)}`;
}

// Le propriétaire publie / retire les invitations quand il modifie un membre
onSyncedPut((table, v) => {
  if (table !== 'members') return;
  const ctx = syncContext();
  if (!ctx || ctx.role !== 'owner') return;
  const m = v as unknown as Member;
  const ref = doc(ctx.fs, 'users', ctx.workspace, 'invites', m.inviteCode);
  if (m.active) void setDoc(ref, { memberId: m.id, role: m.role, name: m.name }).catch(() => undefined);
  else void deleteDoc(ref).catch(() => undefined);
});

// Le propriétaire voit quels employés ont accepté l'invitation (et peut les retirer)
onSyncAttach(() => {
  const ctx = syncContext();
  if (!ctx || ctx.role !== 'owner') return;
  return onSnapshot(query(collection(ctx.fs, 'memberships'), where('ownerUid', '==', ctx.workspace)), async (snap) => {
    for (const d of snap.docs) {
      const ms = d.data() as { memberId: number; email?: string };
      const m = await db.members.get(ms.memberId);
      if (m && m.uid !== d.id) await db.members.update(m.id!, { uid: d.id });
    }
  });
});

/** L'employé accepte l'invitation (après s'être connecté). */
export async function acceptInvite(ownerUid: string, code: string): Promise<{ name: string; role: MemberRole }> {
  const ctx = syncContext();
  if (!ctx) throw new Error('Connecte-toi d’abord (courriel et mot de passe).');
  const inv = await getDoc(doc(ctx.fs, 'users', ownerUid, 'invites', code));
  if (!inv.exists()) throw new Error('Invitation invalide ou retirée. Demande un nouveau lien à ton patron.');
  const d = inv.data() as { memberId: number; role: MemberRole; name: string };
  await setDoc(doc(ctx.fs, 'memberships', ctx.uid), { ownerUid, inviteCode: code, memberId: d.memberId, role: d.role, at: new Date().toISOString() });
  await reattach();
  return { name: d.name, role: d.role };
}

/** Retire l'accès d'un employé (le propriétaire). */
export async function revokeMember(m: Member): Promise<void> {
  const ctx = syncContext();
  if (ctx && m.uid) await deleteDoc(doc(ctx.fs, 'memberships', m.uid)).catch(() => undefined);
  await db.members.update(m.id!, { active: false, uid: undefined });
}
