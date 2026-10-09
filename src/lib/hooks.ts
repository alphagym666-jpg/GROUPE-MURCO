import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_SETTINGS, db, withMurcoDefaults, type Settings } from './db';

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('main'), []);
  return withMurcoDefaults({ ...DEFAULT_SETTINGS, ...(s ?? {}) });
}
