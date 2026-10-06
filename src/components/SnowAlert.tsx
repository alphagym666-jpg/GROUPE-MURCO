import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Snowflake } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, type Settings } from '../lib/db';
import { activeTrades } from '../lib/orders';
import { addDays, todayISO } from '../lib/utils';
import { useWeather } from '../lib/weather';

/** Accueil (déneigement): neige prévue dans les 3 prochains jours → tournée à planifier. */
export function SnowAlert({ s }: { s: Settings }) {
  const on = activeTrades(s).includes('deneigement');
  const wx = useWeather(on ? s.homeGeo : undefined);
  const n = useLiveQuery(() => (on ? db.clients.filter((c) => !!c.snowContract).count() : 0), [on]) ?? 0;
  if (!on) return null;
  const threshold = s.snowThresholdCm ?? 5;
  const day = [0, 1, 2].map((i) => addDays(todayISO(), i)).find((d) => (wx[d]?.snow ?? 0) >= threshold);
  if (!day) return null;
  const when = day === todayISO() ? 'aujourd’hui' : new Date(day + 'T12:00:00').toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric' });
  return (
    <Link to="/metier?m=deneigement&outil=snow" className="snow-alert">
      <Snowflake size={20} />
      <span><b>{String(wx[day].snow).replace('.', ',')} cm de neige prévus {when}</b><small>{n ? `${n} client${n > 1 ? 's' : ''} sous contrat — planifie la tournée` : 'Choisis tes clients sous contrat pour planifier la tournée'}</small></span>
      <ChevronRight size={18} />
    </Link>
  );
}
