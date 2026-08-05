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
  if (!res.ok) throw new Error(`Servizio di geocodifica non disponibile (HTTP ${res.status})`);
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
  if (!res.ok) throw new Error(`Servizio percorsi non disponibile (HTTP ${res.status})`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.durations?.[0]) throw new Error('Il servizio percorsi non ha restituito risultati');

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

/* ---------- geometria per la forma del raggio di guida ---------- */

const toDeg = (rad) => (rad * 180) / Math.PI;

/** Rotta iniziale dal punto a al punto b, in gradi da nord. */
export function bearing(a, b) {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Punto raggiunto partendo da `origin` per `km` lungo la rotta `deg`. */
export function destination(origin, deg, km) {
  const δ = km / 6371;
  const θ = toRad(deg);
  const φ1 = toRad(origin.lat);
  const λ1 = toRad(origin.lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lon: ((toDeg(λ2) + 540) % 360) - 180 };
}

/**
 * Le città sotto questa distanza non dicono nulla di utile sulla velocità di
 * percorrenza: un'ora per fare trenta chilometri di tangenziale non significa
 * che in sei ore se ne facciano centottanta.
 */
const SPEED_SAMPLE_MIN_KM = 150;
/** Ampiezza del cono entro cui una città informa la direzione che si sta stimando. */
const ANGLE_SIGMA_DEG = 28;

/**
 * Forma della zona raggiungibile in auto entro `maxHours`.
 *
 * Non è un cerchio e non vuole esserlo: per ogni direzione si stima la velocità
 * media effettiva usando le città realmente misurate in quel settore, pesate per
 * quanto sono allineate. Il risultato si allunga lungo le autostrade e si
 * strozza dove ci sono le montagne, che è esattamente la differenza fra questo
 * strumento e un compasso puntato sulla mappa.
 *
 * Resta un'approssimazione — la frontiera vera si otterrebbe solo con
 * un'isocrona calcolata sul grafo stradale — ed è etichettata come tale.
 */
export function driveReachShape(origin, cities, driveHours, maxHours, { steps = 72 } = {}) {
  const samples = [];
  cities.forEach((city, index) => {
    const hours = driveHours?.get(index);
    const crow = haversine(origin, city);
    if (!hours || hours <= 0 || crow < SPEED_SAMPLE_MIN_KM) return;
    samples.push({ deg: bearing(origin, city), speed: crow / hours });
  });

  if (samples.length < 3) return null;

  const fallback = samples.reduce((sum, s) => sum + s.speed, 0) / samples.length;
  const radii = [];

  for (let i = 0; i < steps; i++) {
    const deg = (i * 360) / steps;
    let weighted = 0;
    let total = 0;
    for (const s of samples) {
      let diff = Math.abs(s.deg - deg) % 360;
      if (diff > 180) diff = 360 - diff;
      const w = Math.exp(-((diff / ANGLE_SIGMA_DEG) ** 2));
      weighted += s.speed * w;
      total += w;
    }
    radii.push((total > 0.05 ? weighted / total : fallback) * maxHours);
  }

  // Smorzatura circolare: senza, una singola città isolata produce una punta.
  const smooth = radii.map((_, i) => {
    const a = radii[(i - 1 + steps) % steps];
    const b = radii[i];
    const c = radii[(i + 1) % steps];
    return (a + 2 * b + c) / 4;
  });

  return smooth.map((km, i) => {
    const p = destination(origin, (i * 360) / steps, Math.max(8, Math.min(2200, km)));
    return [p.lat, p.lon];
  });
}
