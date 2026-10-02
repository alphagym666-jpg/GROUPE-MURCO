export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'murco.theme';

export function getTheme(): ThemePref {
  try {
    return (localStorage.getItem(KEY) as ThemePref) || 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: ThemePref = getTheme()) {
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0e0f11' : '#23262b');
}

export function setTheme(t: ThemePref) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  applyTheme(t);
}

/** Système → sombre → clair → système… */
export function cycleTheme(): ThemePref {
  const order: ThemePref[] = ['system', 'dark', 'light'];
  const next = order[(order.indexOf(getTheme()) + 1) % order.length];
  setTheme(next);
  return next;
}
