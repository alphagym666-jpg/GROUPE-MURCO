import { saveSettings, type Job, type Settings } from './db';
import { useSettings } from './hooks';

// Personnalisation de l'agenda (gardée dans les réglages de l'entreprise, donc pareille sur tous les appareils).

export interface JobType {
  key: string;
  label: string;
  emoji: string;
  color: string;
}

export type ColorBy = 'employe' | 'type' | 'statut' | 'client';
export type AgendaTheme = 'auto' | 'marque' | 'aurore' | 'ocean' | 'foret' | 'braise' | 'graphite';
export type Density = 'compact' | 'normal' | 'aere';

export interface AgendaPrefs {
  colorBy: ColorBy;
  theme: AgendaTheme;
  startHour: number;
  endHour: number;
  weekends: boolean;
  density: Density;
  showMoney: boolean;
  showWeather: boolean;
  defaultView: '' | 'jour' | 'semaine' | 'mois' | 'liste';
  types: JobType[];
}

export const DEFAULT_TYPES: JobType[] = [
  { key: 'entretien', label: 'Entretien', emoji: '🧽', color: '#0ea5a4' },
  { key: 'installation', label: 'Installation', emoji: '🔧', color: '#6d5dfc' },
  { key: 'reparation', label: 'Réparation', emoji: '🛠️', color: '#f97316' },
  { key: 'estimation', label: 'Estimation', emoji: '📋', color: '#2563eb' },
  { key: 'urgence', label: 'Urgence', emoji: '🚨', color: '#e11d48' },
];

export const DEFAULT_AGENDA: AgendaPrefs = {
  colorBy: 'employe',
  theme: 'auto',
  startHour: 6,
  endHour: 21,
  weekends: true,
  density: 'normal',
  showMoney: true,
  showWeather: true,
  defaultView: '',
  types: DEFAULT_TYPES,
};

export const THEMES: { key: AgendaTheme; label: string; css: string }[] = [
  { key: 'auto', label: 'Selon la météo', css: 'linear-gradient(135deg, #f7b733, #fc4a1a 45%, #4a6cf7)' },
  { key: 'marque', label: 'Ma couleur', css: 'linear-gradient(135deg, color-mix(in srgb, var(--amber) 70%, #fff), var(--amber) 45%, color-mix(in srgb, var(--amber) 50%, #000))' },
  { key: 'aurore', label: 'Aurore', css: 'linear-gradient(135deg, #ff9a5a, #ff5e8a 50%, #8b5cf6)' },
  { key: 'ocean', label: 'Océan', css: 'linear-gradient(135deg, #12c2e9, #2b6ef2 55%, #3d2ea8)' },
  { key: 'foret', label: 'Forêt', css: 'linear-gradient(135deg, #a8e063, #1f9d6c 50%, #0d5546)' },
  { key: 'braise', label: 'Braise', css: 'linear-gradient(135deg, #f6d365, #f0912a 45%, #c2362f)' },
  { key: 'graphite', label: 'Graphite', css: 'linear-gradient(135deg, #5b6170, #2a2e36 55%, #15171b)' },
];

/** Thème « auto »: la couleur du bandeau suit la météo du jour. */
export function themeFor(theme: AgendaTheme, weatherKind?: string): string {
  if (theme !== 'auto') return THEMES.find((t) => t.key === theme)!.css;
  switch (weatherKind) {
    case 'soleil':
      return 'linear-gradient(135deg, #ffcf5a, #ff8a3d 50%, #f0577a)';
    case 'nuageux':
      return 'linear-gradient(135deg, #ffc76b, #f28a5c 45%, #5b7bd5)';
    case 'pluie':
    case 'bruine':
    case 'orage':
      return 'linear-gradient(135deg, #5f8cd8, #3a4f9e 55%, #262c55)';
    case 'neige':
      return 'linear-gradient(135deg, #b9e3ff, #7aa7f0 50%, #5a63c8)';
    case 'couvert':
    case 'brouillard':
      return 'linear-gradient(135deg, #8f9bb3, #5b6684 55%, #343a52)';
    default:
      return THEMES.find((t) => t.key === 'aurore')!.css;
  }
}

export const DENSITY_PX: Record<Density, number> = { compact: 40, normal: 52, aere: 68 };

/** Couleurs vives pour « couleur par client ». */
const VIVID = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];
export const clientColor = (id: number) => VIVID[Math.abs(id) % VIVID.length];

export const STATUS_COLOR: Record<string, string> = { planifie: '#3b82f6', fait: '#16a34a', facture: '#8b8f98', annule: '#9ca3af' };

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
  const a = { ...DEFAULT_AGENDA, ...(s.agenda ?? {}) };
  if (!a.types?.length) a.types = DEFAULT_TYPES;
  if (a.endHour <= a.startHour) a.endHour = Math.min(24, a.startHour + 1);
  return a;
}

export function useAgendaPrefs(): AgendaPrefs {
  return agendaPrefs(useSettings());
}

export async function saveAgendaPrefs(s: Settings, patch: Partial<AgendaPrefs>): Promise<void> {
  await saveSettings({ agenda: { ...(s.agenda ?? {}), ...patch } });
}
