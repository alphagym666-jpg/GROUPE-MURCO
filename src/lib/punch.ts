import { jobGeo } from './agenda';
import { db, getSettings, type GeoPoint, type Job, type Member, type Punch } from './db';
import { currentPosition, haversineKm } from './geo';
import { addDays, toISODate } from './utils';

/** Distance au-delà de laquelle un pointage est signalé « loin du chantier ». */
export const FAR_M = 300;

export interface Me {
  memberId: number; // 0 = propriétaire
  name: string;
  hourlyCost: number;
}

export async function whoAmI(memberId?: number): Promise<Me> {
  if (memberId) {
    const m = await db.members.get(memberId);
    if (m) return { memberId, name: m.name, hourlyCost: m.hourlyCost };
    // Fiche pas encore synchronisée sur ce téléphone: on garde quand même le bon numéro d'employé
    return { memberId, name: 'Employé', hourlyCost: 0 };
  }
  const s = await getSettings();
  return { memberId: 0, name: s.ownerName || 'Moi', hourlyCost: s.laborCostPerHour };
}

export async function openPunch(memberId: number): Promise<Punch | undefined> {
  return (await db.punches.where('memberId').equals(memberId).toArray()).find((p) => !p.end);
}

async function where(): Promise<GeoPoint | undefined> {
  try {
    return await currentPosition();
  } catch {
    return undefined; // GPS refusé: le pointage est quand même enregistré (signalé sans position)
  }
}

async function distTo(job: Job | undefined, g?: GeoPoint): Promise<number | undefined> {
  if (!job || !g) return undefined;
  const target = await jobGeo(job, await db.clients.get(job.clientId)).catch(() => null);
  if (!target) return undefined;
  return Math.round(haversineKm(g, target.geo) * 1000);
}

export async function startPunch(me: Me, jobId?: number, note = ''): Promise<Punch> {
  const g = await where();
  const job = jobId ? await db.jobs.get(jobId) : undefined;
  const p: Punch = {
    memberId: me.memberId,
    name: me.name,
    jobId,
    projectId: job?.projectId,
    clientId: job?.clientId,
    start: new Date().toISOString(),
    startGeo: g,
    startDistM: await distTo(job, g),
    breakMin: 0,
    note,
    createdAt: new Date().toISOString(),
  };
  p.id = await db.punches.add(p);
  return p;
}

export async function stopPunch(p: Punch, breakMin = 0, note?: string): Promise<Punch> {
  const g = await where();
  const job = p.jobId ? await db.jobs.get(p.jobId) : undefined;
  const patch: Partial<Punch> = { end: new Date().toISOString(), endGeo: g, endDistM: await distTo(job, g), breakMin };
  if (note !== undefined) patch.note = note;
  await db.punches.update(p.id!, patch);
  return { ...p, ...patch };
}

/** Punch out après coup: l'employé entre l'heure où il a vraiment fini (pas de GPS, signalé au patron). */
export async function stopPunchAt(p: Punch, endISO: string, breakMin: number, reason: string): Promise<Punch> {
  const end = new Date(endISO).getTime();
  if (Number.isNaN(end)) throw new Error('Heure de fin invalide.');
  if (end <= new Date(p.start).getTime()) throw new Error('L’heure de fin doit être après ton punch in.');
  if (end > Date.now() + 60_000) throw new Error('L’heure de fin ne peut pas être dans le futur.');
  const patch: Partial<Punch> = { end: new Date(end).toISOString(), endGeo: undefined, endDistM: undefined, breakMin, endManual: { reason: reason.trim() || 'Non précisée', at: new Date().toISOString() } };
  await db.punches.update(p.id!, patch);
  return { ...p, ...patch };
}

/** Punch resté ouvert trop longtemps (app fermée, batterie à plat, oubli). */
export function looksForgotten(p: Punch, now = Date.now()): boolean {
  return !p.end && (now - new Date(p.start).getTime() > 12 * 3600000 || localDay(p.start) !== toISODate(new Date(now)));
}

/** Heures travaillées (pause déduite). */
export function hoursOf(p: Punch, now = Date.now()): number {
  const end = p.end ? new Date(p.end).getTime() : now;
  const h = (end - new Date(p.start).getTime()) / 3600000 - (p.breakMin || 0) / 60;
  return Math.max(0, Math.round(h * 100) / 100);
}

export function punchFlags(p: Punch): string[] {
  const f: string[] = [];
  if (!p.end) f.push('Pas de punch out');
  if (!p.startGeo) f.push('Sans position GPS');
  if ((p.startDistM ?? 0) > FAR_M) f.push(`Punch in à ${(p.startDistM! / 1000).toFixed(1)} km du chantier`);
  if ((p.endDistM ?? 0) > FAR_M) f.push(`Punch out à ${(p.endDistM! / 1000).toFixed(1)} km du chantier`);
  if (p.endManual) f.push(`Fin entrée à la main — ${p.endManual.reason}`);
  if (hoursOf(p) > 12) f.push('Plus de 12 h');
  return f;
}

/** Lundi de la semaine d'une date. */
export function weekStart(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const localDay = (iso: string) => toISODate(new Date(iso));

/** Coût horaire d'un membre (0 = propriétaire → réglage « main-d'œuvre »). */
export function costOf(memberId: number, members: Member[], ownerCost: number): number {
  return memberId ? members.find((m) => m.id === memberId)?.hourlyCost ?? 0 : ownerCost;
}
