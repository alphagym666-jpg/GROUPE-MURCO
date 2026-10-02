import type { GeoPoint } from './db';

// Services cartographiques gratuits basés sur OpenStreetMap (aucune clé requise).
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM = 'https://router.project-osrm.org';

export interface GeocodeResult {
  geo: GeoPoint;
  label: string;
}

export async function geocode(address: string): Promise<GeocodeResult | null> {
  const q = address.trim();
  if (!q) return null;
  const url = `${NOMINATIM}/search?format=json&limit=1&countrycodes=ca&accept-language=fr&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Géocodage impossible (${res.status})`);
  const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  if (!data.length) return null;
  return { geo: { lat: Number(data[0].lat), lon: Number(data[0].lon) }, label: data[0].display_name };
}

export async function reverseGeocode(geo: GeoPoint): Promise<string> {
  try {
    const url = `${NOMINATIM}/reverse?format=json&accept-language=fr&lat=${geo.lat}&lon=${geo.lon}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return `${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)}`;
    const data = (await res.json()) as { display_name?: string; name?: string; address?: Record<string, string> };
    const a = data.address ?? {};
    const short = [data.name, [a.house_number, a.road].filter(Boolean).join(' '), a.city ?? a.town ?? a.village]
      .filter((x) => x && x.trim())
      .join(', ');
    return short || data.display_name || `${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)}`;
  } catch {
    return `${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)}`;
  }
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface RouteResult {
  km: number;
  method: 'route' | 'estimation';
}

/** Distance routière (en voiture). Si le service ne répond pas: vol d'oiseau × 1,3. */
export async function drivingDistance(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  try {
    const url = `${OSRM}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as { code: string; routes?: { distance: number }[] };
      if (data.code === 'Ok' && data.routes?.length) {
        return { km: Math.round((data.routes[0].distance / 1000) * 10) / 10, method: 'route' };
      }
    }
  } catch {
    /* on retombe sur l'estimation */
  }
  return { km: Math.round(haversineKm(from, to) * 1.3 * 10) / 10, method: 'estimation' };
}

export function currentPosition(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS non disponible sur cet appareil'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.message || 'Position refusée')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

export function mapsLink(geo?: GeoPoint, label?: string): string {
  if (geo) return `https://www.google.com/maps/search/?api=1&query=${geo.lat},${geo.lon}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label ?? '')}`;
}

export function directionsLink(from: string | GeoPoint, to: string | GeoPoint): string {
  const f = typeof from === 'string' ? from : `${from.lat},${from.lon}`;
  const t = typeof to === 'string' ? to : `${to.lat},${to.lon}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(f)}&destination=${encodeURIComponent(t)}&travelmode=driving`;
}
