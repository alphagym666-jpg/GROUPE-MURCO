import { saveSettings, type Job, type Settings } from './db';
import { useSettings } from './hooks';

// Personnalisation de l'agenda (gardée dans les réglages de l'entreprise, donc pareille sur tous les appareils).

export interface JobType {
  key: string;
  label: string;
  icon?: string; // clé de JOB_ICONS
  emoji?: string; // ancien format (ignoré)
  color: string;
}

export type ColorBy = 'employe' | 'type' | 'statut' | 'client';
export type Density = 'compact' | 'normal' | 'aere';

export interface AgendaPrefs {
  colorBy: ColorBy;
  startHour: number;
  endHour: number;
  weekends: boolean;
  density: Density;
  showMoney: boolean;
  showWeather: boolean;
  defaultView: '' | 'jour' | 'semaine' | 'mois' | 'liste';
  types: JobType[];
}

/** Palette sobre (lisible sur fond clair et sombre, jamais criarde). */
export const JOB_COLORS = ['#3d5a99', '#2f7d6d', '#a4572b', '#6b5b95', '#9b3d4a', '#4a7a35', '#8a6d2c', '#2d6e8e', '#5f6b7a'];

export const DEFAULT_TYPES: JobType[] = [
  { key: 'entretien', label: 'Entretien', icon: 'sparkles', color: '#2f7d6d' },
  { key: 'installation', label: 'Installation', icon: 'wrench', color: '#3d5a99' },
  { key: 'reparation', label: 'Réparation', icon: 'hammer', color: '#a4572b' },
  { key: 'estimation', label: 'Estimation', icon: 'clipboard', color: '#5f6b7a' },
  { key: 'urgence', label: 'Urgence', icon: 'siren', color: '#9b3d4a' },
];
// Premières couleurs offertes (trop vives): remplacées par la palette sobre
const OLD_DEFAULT: Record<string, string> = { '#0ea5a4': '#2f7d6d', '#6d5dfc': '#3d5a99', '#f97316': '#a4572b', '#2563eb': '#5f6b7a', '#e11d48': '#9b3d4a', '#14b8a6': '#2f7d6d' };

export const DEFAULT_AGENDA: AgendaPrefs = {
  colorBy: 'employe',
  startHour: 6,
  endHour: 21,
  weekends: true,
  density: 'normal',
  showMoney: true,
  showWeather: true,
  defaultView: '',
  types: DEFAULT_TYPES,
};

export const DENSITY_PX: Record<Density, number> = { compact: 40, normal: 52, aere: 68 };

export const clientColor = (id: number) => JOB_COLORS[Math.abs(id) % JOB_COLORS.length];

export const STATUS_COLOR: Record<string, string> = { planifie: '#3d5a99', fait: '#2f7d6d', facture: '#8a8f98', annule: '#a3a7ae' };

/** Type deviné à partir de la description quand la job n'en a pas. */
export function guessType(j: Pick<Job, 'title' | 'type'>, types: JobType[]): JobType | undefined {
  if (j.type) return types.find((t) => t.key === j.type);
  const t = j.title.toLowerCase();
  const rules: [RegExp, string][] = [
    [/estim|soumis|évalu|evalu|visite/, 'estimation'],
    [/urgen|dégât|degat|fuite|bris/, 'urgence'],
    [/install|pose|montage/, 'installation'],
    [/répar|repar|correct|remplac/, 'reparation'],
    [/lavage|nettoy|entretien|tonte|gouttière|gouttiere|vitre|déneig|deneig|pression/, 'entretien'],
  ];
  const k = rules.find(([re]) => re.test(t))?.[1];
  return k ? types.find((x) => x.key === k) : undefined;
}

export function agendaPrefs(s: Settings): AgendaPrefs {
  const a = { ...DEFAULT_AGENDA, ...(s.agenda ?? {}) } as AgendaPrefs;
  if (!a.types?.length) a.types = DEFAULT_TYPES;
  a.types = a.types.map((t) => ({
    ...t,
    icon: t.icon ?? DEFAULT_TYPES.find((d) => d.key === t.key)?.icon ?? 'circle',
    color: OLD_DEFAULT[t.color?.toLowerCase()] ?? t.color,
  }));
  if (a.endHour <= a.startHour) a.endHour = Math.min(24, a.startHour + 1);
  return a;
}

export function useAgendaPrefs(): AgendaPrefs {
  return agendaPrefs(useSettings());
}

export async function saveAgendaPrefs(s: Settings, patch: Partial<AgendaPrefs>): Promise<void> {
  await saveSettings({ agenda: { ...(s.agenda ?? {}), ...patch } });
}
