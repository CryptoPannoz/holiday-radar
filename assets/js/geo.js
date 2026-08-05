/**
 * Geocoding, distanze e tempi di guida reali.
 *
 * L'unica cosa che esce dal browser dell'utente è l'indirizzo che digita
 * (verso il geocoder) e le coordinate della proprietà (verso il router).
 */

const PHOTON = 'https://photon.komoot.io/api/';
const OSRM = 'https://router.project-osrm.org';

/**
 * OSRM pubblico accetta un numero limitato di coordinate per richiesta.
 * Si mandano solo le destinazioni plausibili, prefiltrate in linea d'aria.
 */
const MAX_TABLE_POINTS = 95;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Distanza in linea d'aria, km. */
export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Stima del tempo porta-a-porta in aereo: il volo puro è la parte piccola.
 * Un'ora e mezza copre check-in, sicurezza, imbarco e ritiro bagagli; mezz'ora
 * copre rullaggio e attese. Serve a confrontare mercati, non a prenotare.
 */
export function flightHours(km) {
  return 1.5 + 0.5 + km / 750;
}

export async function geocode(query, { limit = 6, signal } = {}) {
  const url = `${PHOTON}?q=${encodeURIComponent(query)}&limit=${limit}&lang=en`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geocoder unavailable (HTTP ${res.status})`);
  const data = await res.json();
  return (data.features || [])
    .filter((f) => f.geometry?.coordinates?.length === 2)
    .map((f) => {
      const p = f.properties || {};
      const [lon, lat] = f.geometry.coordinates;
      const streetLine = [p.name, p.housenumber].filter(Boolean).join(' ');
      const place = [p.city || p.town || p.village || p.county, p.state, p.country]
        .filter(Boolean)
        .join(', ');
      return { label: streetLine || place, detail: place, lat, lon, country: p.countrycode };
    });
}

export async function reverseGeocode(lat, lon, { signal } = {}) {
  const res = await fetch(`${PHOTON}reverse?lat=${lat}&lon=${lon}&lang=en`, { signal });
  if (!res.ok) return null;
  const data = await res.json();
  const p = data.features?.[0]?.properties;
  if (!p) return null;
  const streetLine = [p.name, p.housenumber].filter(Boolean).join(' ');
  const place = [p.city || p.town || p.village || p.county, p.state, p.country].filter(Boolean).join(', ');
  return { label: streetLine || place, detail: place, lat, lon, country: p.countrycode };
}

/**
 * Tempi di guida reali dall'origine a ogni destinazione, in una sola chiamata.
 *
 * Le destinazioni troppo lontane in linea d'aria vengono scartate prima: non
 * possono rientrare in nessun raggio di guida ragionevole, e tenerle dentro
 * sprecherebbe l'unico slot di richiesta.
 *
 * Restituisce una Map indice→ore. Le destinazioni non raggiungibili su strada
 * (isole senza ponte, per esempio) semplicemente non compaiono.
 */
export async function driveTimes(origin, destinations, { maxCrowKm = 1600, signal } = {}) {
  const candidates = destinations
    .map((d, index) => ({ index, crow: haversine(origin, d), d }))
    .filter((c) => c.crow <= maxCrowKm)
    .sort((a, b) => a.crow - b.crow)
    .slice(0, MAX_TABLE_POINTS - 1);

  const result = new Map();
  if (!candidates.length) return result;

  const coords = [origin, ...candidates.map((c) => c.d)]
    .map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`)
    .join(';');

  const res = await fetch(`${OSRM}/table/v1/driving/${coords}?sources=0&annotations=duration`, { signal });
  if (!res.ok) throw new Error(`Routing service unavailable (HTTP ${res.status})`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.durations?.[0]) throw new Error('Routing service returned no result');

  const row = data.durations[0];
  candidates.forEach((c, i) => {
    const seconds = row[i + 1];
    if (typeof seconds === 'number') result.set(c.index, seconds / 3600);
  });
  return result;
}

/**
 * Fallback quando il router non risponde: distanza in linea d'aria corretta per
 * la tortuosità della rete stradale e una media autostradale realistica con soste.
 * È una stima dichiarata come tale nell'interfaccia, non un dato di navigazione.
 */
export function estimateDriveHours(crowKm) {
  return (crowKm * 1.28) / 88;
}
