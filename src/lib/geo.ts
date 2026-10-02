import { getSettings, type GeoPoint } from './db';

// Distances et adresses: Google Maps quand une clé est configurée (Paramètres → Google Maps),
// sinon services gratuits OpenStreetMap (aucune clé requise).
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM = 'https://router.project-osrm.org';

/* eslint-disable @typescript-eslint/no-explicit-any */
type GMaps = any;

async function mapsKey(): Promise<string> {
  return (await getSettings()).googleMapsKey?.trim() ?? '';
}

let mapsPromise: Promise<GMaps> | null = null;
let mapsPromiseKey = '';
/** Charge l'API JavaScript de Google Maps (une seule fois). */
export function loadGoogleMaps(key: string): Promise<GMaps> {
  const w = window as any;
  if (mapsPromise && mapsPromiseKey === key) return mapsPromise;
  mapsPromiseKey = key;
  mapsPromise = new Promise((resolve, reject) => {
    if (w.google?.maps?.importLibrary) return resolve(w.google.maps);
    w.__murcoMapsReady = () => resolve(w.google.maps);
    w.gm_authFailure = () => {
      mapsLastError = 'Clé Google Maps refusée (vérifie la clé et les API activées).';
    };
    const sc = document.createElement('script');
    sc.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&language=fr&region=CA&callback=__murcoMapsReady`;
    sc.async = true;
    sc.onerror = () => {
      mapsPromise = null;
      reject(new Error('Impossible de charger Google Maps.'));
    };
    document.head.appendChild(sc);
  });
  return mapsPromise;
}

/** Dernière erreur Google (pour l'afficher dans Paramètres). */
export let mapsLastError = '';

export interface GeocodeResult {
  geo: GeoPoint;
  label: string;
}

async function googleGeocode(key: string, req: Record<string, unknown>): Promise<{ geo: GeoPoint; label: string } | null> {
  const maps = await loadGoogleMaps(key);
  const { Geocoder } = await maps.importLibrary('geocoding');
  const r = await new Geocoder().geocode({ ...req, region: 'ca', language: 'fr' });
  const first = r.results?.[0];
  if (!first) return null;
  return { geo: { lat: first.geometry.location.lat(), lon: first.geometry.location.lng() }, label: first.formatted_address };
}

export async function geocode(address: string): Promise<GeocodeResult | null> {
  const q = address.trim();
  if (!q) return null;
  const key = await mapsKey();
  if (key) {
    try {
      const r = await googleGeocode(key, { address: q });
      mapsLastError = '';
      if (r) return r;
    } catch (e) {
      mapsLastError = `Géocodage Google: ${e instanceof Error ? e.message : e}`;
    }
  }
  const url = `${NOMINATIM}/search?format=json&limit=1&countrycodes=ca&accept-language=fr&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Géocodage impossible (${res.status})`);
  const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  if (!data.length) return null;
  return { geo: { lat: Number(data[0].lat), lon: Number(data[0].lon) }, label: data[0].display_name };
}

export async function reverseGeocode(geo: GeoPoint): Promise<string> {
  const fallback = `${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)}`;
  const key = await mapsKey();
  if (key) {
    try {
      const r = await googleGeocode(key, { location: { lat: geo.lat, lng: geo.lon } });
      if (r) return r.label;
    } catch {
      /* repli OpenStreetMap */
    }
  }
  try {
    const url = `${NOMINATIM}/reverse?format=json&accept-language=fr&lat=${geo.lat}&lon=${geo.lon}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { display_name?: string; name?: string; address?: Record<string, string> };
    const a = data.address ?? {};
    const short = [data.name, [a.house_number, a.road].filter(Boolean).join(' '), a.city ?? a.town ?? a.village]
      .filter((x) => x && x.trim())
      .join(', ');
    return short || data.display_name || fallback;
  } catch {
    return fallback;
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
  method: 'google' | 'route' | 'estimation';
  durationMin?: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Distance en voiture selon Google Maps (Routes API, puis Directions de l'API JavaScript). */
async function googleDistance(key: string, from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  const ll = (g: GeoPoint) => ({ location: { latLng: { latitude: g.lat, longitude: g.lon } } });
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration' },
      body: JSON.stringify({ origin: ll(from), destination: ll(to), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', units: 'METRIC' }),
    });
    if (res.ok) {
      const data = (await res.json()) as { routes?: { distanceMeters?: number; duration?: string }[] };
      const r = data.routes?.[0];
      if (r?.distanceMeters) {
        mapsLastError = '';
        return { km: round1(r.distanceMeters / 1000), method: 'google', durationMin: r.duration ? Math.round(parseInt(r.duration) / 60) : undefined };
      }
    } else {
      mapsLastError = `Routes API (${res.status}) — active « Routes API » dans Google Cloud.`;
    }
  } catch {
    /* on essaie l'API JavaScript */
  }
  const maps = await loadGoogleMaps(key);
  const { DirectionsService } = await maps.importLibrary('routes');
  const r = await new DirectionsService().route({
    origin: { lat: from.lat, lng: from.lon },
    destination: { lat: to.lat, lng: to.lon },
    travelMode: 'DRIVING',
  });
  const leg = r.routes?.[0]?.legs?.[0];
  if (!leg?.distance) throw new Error('Aucun itinéraire Google');
  mapsLastError = '';
  return { km: round1(leg.distance.value / 1000), method: 'google', durationMin: leg.duration ? Math.round(leg.duration.value / 60) : undefined };
}

/** Distance routière (en voiture). Google Maps si configuré, sinon OpenStreetMap, sinon vol d'oiseau × 1,3. */
export async function drivingDistance(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  const key = await mapsKey();
  if (key) {
    try {
      return await googleDistance(key, from, to);
    } catch (e) {
      mapsLastError ||= `Itinéraire Google: ${e instanceof Error ? e.message : e}`;
    }
  }
  try {
    const url = `${OSRM}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as { code: string; routes?: { distance: number; duration: number }[] };
      if (data.code === 'Ok' && data.routes?.length) {
        return { km: round1(data.routes[0].distance / 1000), method: 'route', durationMin: Math.round(data.routes[0].duration / 60) };
      }
    }
  } catch {
    /* on retombe sur l'estimation */
  }
  return { km: round1(haversineKm(from, to) * 1.3), method: 'estimation' };
}

export interface AddressSuggestion {
  label: string;
  resolve: () => Promise<GeocodeResult | null>;
}

let sessionToken: unknown = null;
/** Suggestions d'adresses Google Maps pendant la saisie (nécessite « Places API (New) »). */
export async function suggestAddresses(input: string): Promise<AddressSuggestion[]> {
  const key = await mapsKey();
  if (!key || input.trim().length < 3) return [];
  const maps = await loadGoogleMaps(key);
  const { AutocompleteSuggestion, AutocompleteSessionToken } = await maps.importLibrary('places');
  sessionToken ||= new AutocompleteSessionToken();
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken,
    includedRegionCodes: ['ca'],
    language: 'fr',
  });
  return (suggestions ?? [])
    .filter((s: any) => s.placePrediction)
    .slice(0, 5)
    .map((s: any) => ({
      label: s.placePrediction.text.toString(),
      resolve: async () => {
        const place = s.placePrediction.toPlace();
        await place.fetchFields({ fields: ['location', 'formattedAddress'] });
        sessionToken = null;
        if (!place.location) return null;
        return { geo: { lat: place.location.lat(), lon: place.location.lng() }, label: s.placePrediction.text.toString() };
      },
    }));
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

const place = (p: string | GeoPoint) => (typeof p === 'string' ? p : `${p.lat},${p.lon}`);

/** Ouvre l'itinéraire dans Google Maps (app sur téléphone, site sur ordi). */
export function directionsLink(from: string | GeoPoint, to: string | GeoPoint): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place(from))}&destination=${encodeURIComponent(place(to))}&travelmode=driving`;
}

/** Carte intégrée du trajet (Maps Embed API, gratuite). */
export function embedDirectionsUrl(key: string, from: string | GeoPoint, to: string | GeoPoint): string {
  return `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(key)}&origin=${encodeURIComponent(place(from))}&destination=${encodeURIComponent(place(to))}&mode=driving&language=fr&region=CA`;
}
