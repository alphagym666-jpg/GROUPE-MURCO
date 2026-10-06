import { useEffect, useState } from 'react';
import type { GeoPoint } from './db';

// Prévisions météo (16 jours) pour planifier les jobs extérieurs: Open-Meteo, gratuit et sans clé.
export interface DayWeather {
  code: number; // code météo WMO
  tmax: number;
  tmin: number;
  pop: number; // probabilité de précipitations (%)
  snow?: number; // neige prévue (cm)
}

export type WeatherKind = 'soleil' | 'nuageux' | 'couvert' | 'brouillard' | 'bruine' | 'pluie' | 'neige' | 'orage';

export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return 'soleil';
  if (code === 2) return 'nuageux';
  if (code === 3) return 'couvert';
  if (code === 45 || code === 48) return 'brouillard';
  if (code >= 51 && code <= 57) return 'bruine';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'pluie';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'neige';
  if (code >= 95) return 'orage';
  return 'nuageux';
}

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  soleil: 'Ensoleillé', nuageux: 'Partiellement nuageux', couvert: 'Couvert', brouillard: 'Brouillard',
  bruine: 'Bruine', pluie: 'Pluie', neige: 'Neige', orage: 'Orages',
};

/** Journée à risque pour du travail extérieur (pluie, neige, orage, ou forte probabilité). */
export const badWeather = (w?: DayWeather) => !!w && (['pluie', 'neige', 'orage'].includes(weatherKind(w.code)) || w.pop >= 70);

const CACHE_KEY = 'murco.weather2';
const TTL = 3 * 3600_000;

async function fetchWeather(geo: GeoPoint): Promise<Record<string, DayWeather>> {
  const key = `${geo.lat.toFixed(2)},${geo.lon.toFixed(2)}`;
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as { key: string; at: number; days: Record<string, DayWeather> } | null;
    if (c && c.key === key && Date.now() - c.at < TTL) return c.days;
  } catch {
    /* cache illisible */
  }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,snowfall_sum&timezone=America%2FToronto&forecast_days=16';
  const r = await fetch(url);
  if (!r.ok) throw new Error('météo indisponible');
  const j = (await r.json()) as { daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[]; snowfall_sum?: (number | null)[] } };
  const days: Record<string, DayWeather> = {};
  j.daily.time.forEach((d, i) => {
    days[d] = {
      code: j.daily.weather_code[i],
      tmax: Math.round(j.daily.temperature_2m_max[i]),
      tmin: Math.round(j.daily.temperature_2m_min[i]),
      pop: j.daily.precipitation_probability_max[i] ?? 0,
      snow: Math.round((j.daily.snowfall_sum?.[i] ?? 0) * 10) / 10,
    };
  });
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key, at: Date.now(), days }));
  } catch {
    /* stockage plein */
  }
  return days;
}

export function useWeather(geo?: GeoPoint): Record<string, DayWeather> {
  const [days, setDays] = useState<Record<string, DayWeather>>({});
  const lat = geo?.lat;
  const lon = geo?.lon;
  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    let alive = true;
    fetchWeather({ lat, lon })
      .then((d) => alive && setDays(d))
      .catch(() => undefined); // hors-ligne: pas de météo, l'agenda fonctionne quand même
    return () => {
      alive = false;
    };
  }, [lat, lon]);
  return days;
}
