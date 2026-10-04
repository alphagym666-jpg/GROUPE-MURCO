import { useSyncExternalStore } from 'react';

// Langue de l'interface publique (page de vente, inscription, pages légales) et des documents envoyés aux clients.
export type Lang = 'fr' | 'en';
const KEY = 'murco.lang';

function initial(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'fr' || v === 'en') return v;
  } catch {
    /* ignore */
  }
  return typeof navigator !== 'undefined' && /^en\b/i.test(navigator.language) && !/CA-FR|fr/i.test(navigator.languages?.join(',') ?? '') ? 'en' : 'fr';
}

let lang: Lang = initial();
const subs = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}
export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l === 'en' ? 'en-CA' : 'fr-CA';
  subs.forEach((f) => f());
}
export function useLang(): Lang {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => lang,
  );
}
/** Petit utilitaire: texte selon la langue. */
export const tr = (l: Lang, fr: string, en: string) => (l === 'en' ? en : fr);
