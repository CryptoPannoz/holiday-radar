/**
 * Il cuore del tool: chi può raggiungerti, quando è libero, e quanto vale.
 *
 * Tutte le date sono stringhe 'YYYY-MM-DD' e vengono manipolate in UTC, così il
 * fuso di chi guarda la pagina non sposta mai una vacanza di un giorno.
 */

import { haversine, flightHours, estimateDriveHours } from './geo.js';

/**
 * Ponderazione dei bacini. Sono coefficienti dichiarati, non misure: servono a
 * ordinare i mercati fra loro, non a stimare prenotazioni.
 *
 * Due correzioni, entrambe necessarie perché il conteggio grezzo mente:
 *
 * 1. La distanza conta anche dentro il raggio. Chi sta a due ore viene per un
 *    weekend qualsiasi; chi sta a otto ore viene una volta l'anno e solo se ha
 *    una settimana intera. Contarli alla pari fa sembrare enormi i mercati che
 *    stanno appena dentro il limite.
 * 2. Volare filtra pesantemente. Serve un aeroporto comodo a entrambi i capi,
 *    costa di più e taglia fuori chi viaggia con bambini piccoli, cani, bici o
 *    sci. Senza questo sconto una capitale lontana scavalca sempre il vicino
 *    di casa — ed è il consiglio sbagliato da dare a un host.
 */
const DRIVE_HALF_LIFE_H = 4;
const FLY_BASE = 0.15;
const FLY_HALF_LIFE_KM = 1200;

/** Peso di un bacino raggiungibile in auto: 1 sotto casa, ~0.5 a quattro ore, ~0.2 a otto. */
export const driveDecay = (hours) => 1 / (1 + (hours / DRIVE_HALF_LIFE_H) ** 2);

/** Peso di un bacino raggiungibile in aereo, già scontato rispetto all'auto. */
export const flyDecay = (km) => FLY_BASE / (1 + (km / FLY_HALF_LIFE_KM) ** 2);

/** Quanto vale, al massimo, una persona che deve volare rispetto a una che guida. */
export const FLY_WEIGHT = FLY_BASE;

/* ---------- date ---------- */

export const parseDate = (s) => new Date(`${s}T00:00:00Z`);
export const fmtDate = (d) => d.toISOString().slice(0, 10);

export function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/** Lunedì della settimana che contiene la data (settimana ISO). */
export function mondayOf(date) {
  const d = new Date(date.getTime());
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}

export function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() + 6) % 7) - 3);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export const nightsBetween = (start, end) =>
  Math.round((parseDate(end) - parseDate(start)) / 86400000);

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart <= bEnd && bStart <= aEnd;

/* ---------- chi ti raggiunge ---------- */

/**
 * Classifica ogni area metropolitana come raggiungibile in auto, in aereo o
 * fuori portata, e aggrega per paese.
 *
 * `driveHours` è la mappa indice→ore restituita dal router; dove manca si usa
 * una stima, segnalata con `estimated` così l'interfaccia può dirlo.
 */
export function computeReach({ origin, cities, driveHours, maxDriveHours, maxFlightKm }) {
  const scored = cities.map((city, index) => {
    const crowKm = haversine(origin, city);
    const measured = driveHours?.get(index);
    const driveH = measured ?? (crowKm <= 1600 ? estimateDriveHours(crowKm) : null);
    const entry = {
      ...city,
      index,
      crowKm,
      driveH,
      estimated: measured === undefined,
      flightH: flightHours(crowKm),
      access: 'out',
    };
    if (driveH !== null && driveH <= maxDriveHours) {
      entry.access = 'drive';
      entry.weight = driveDecay(driveH);
    } else if (crowKm <= maxFlightKm) {
      entry.access = 'fly';
      entry.weight = flyDecay(crowKm);
    } else {
      entry.weight = 0;
    }
    return entry;
  });

  const byCountry = new Map();
  for (const city of scored) {
    if (!byCountry.has(city.c)) {
      byCountry.set(city.c, {
        c: city.c,
        popDrive: 0,
        popFly: 0,
        reach: 0,
        bestDriveH: null,
        bestCrowKm: Infinity,
        nearest: null,
        driveCities: [],
        flyCities: [],
      });
    }
    const m = byCountry.get(city.c);
    if (city.crowKm < m.bestCrowKm) {
      m.bestCrowKm = city.crowKm;
      m.nearest = city;
    }
    if (city.driveH !== null && (m.bestDriveH === null || city.driveH < m.bestDriveH)) {
      m.bestDriveH = city.driveH;
    }
    if (city.access === 'drive') {
      m.popDrive += city.p;
      m.reach += city.p * city.weight;
      m.driveCities.push(city);
    } else if (city.access === 'fly') {
      m.popFly += city.p;
      m.reach += city.p * city.weight;
      m.flyCities.push(city);
    }
  }

  for (const m of byCountry.values()) {
    m.access = m.popDrive > 0 ? 'drive' : m.popFly > 0 ? 'fly' : 'out';
  }

  return { cities: scored, byCountry };
}

/* ---------- quando sono liberi ---------- */

/**
 * Appiattisce i dati di un mercato in eventi confrontabili, limitati all'orizzonte.
 *
 * `coverage` è la quota di paese realmente coinvolta: una vacanza scolastica in
 * 4 Länder su 16 non è un paese in vacanza, ed è proprio questa differenza che
 * rende alcune settimane aggredibili e altre no.
 */
export function buildEvents(market, from, to, { includeSchool = true } = {}) {
  const events = [];
  const subTotal = market.subdivisions?.length || 0;
  const subName = new Map((market.subdivisions || []).map((s) => [s.code, s.short || s.name]));

  for (const h of market.public) {
    if (h.date < from || h.date > to) continue;
    events.push({
      c: market.country,
      type: 'public',
      start: h.date,
      end: h.date,
      nights: 0,
      name: h.local ? `${h.name} (${h.local})` : h.name,
      coverage: h.regional ? 0.35 : 1,
      regional: !!h.regional,
      regions: h.counties || [],
    });
  }

  for (const b of market.bridges) {
    if (b.end < from || b.start > to) continue;
    events.push({
      c: market.country,
      type: 'bridge',
      start: b.start,
      end: b.end,
      nights: nightsBetween(b.start, b.end),
      name: `${b.days}-day weekend${b.bridge?.length ? ` (bridge day ${b.bridge.join(', ')})` : ''}`,
      coverage: 1,
      regional: false,
      regions: [],
      bridgeDays: b.bridge || [],
    });
  }

  if (includeSchool) {
    for (const s of market.school) {
      if (s.end < from || s.start > to) continue;
      const subs = s.nationwide ? null : s.subs || [];
      events.push({
        c: market.country,
        type: 'school',
        start: s.start,
        end: s.end,
        nights: nightsBetween(s.start, s.end),
        name: s.name,
        coverage: s.nationwide || !subTotal ? 1 : Math.min(1, subs.length / subTotal),
        regional: !s.nationwide,
        regions: s.nationwide ? [] : subs.map((code) => subName.get(code) || code),
        subs,
        subTotal,
      });
    }
  }

  return events.sort((a, b) => a.start.localeCompare(b.start));
}

/* ---------- quanto vale ---------- */

/**
 * Un giorno festivo isolato muove poche prenotazioni; un ponte muove weekend
 * lunghi; le vacanze scolastiche muovono settimane intere di famiglie, che per
 * una casa intera sono il cliente che paga di più. L'intensità riflette questa
 * scala, e vince il segnale più forte presente nella settimana.
 */
function weekIntensity(cell) {
  let intensity = cell.schoolCoverage;
  if (cell.bridge) intensity = Math.max(intensity, 0.5);
  if (cell.publicDays.length) intensity = Math.max(intensity, 0.3);
  return Math.min(1, intensity);
}

/**
 * Costruisce la griglia settimanale. Ogni cella dice, per un mercato, quanta
 * parte di quel paese è ferma in quella settimana; il punteggio della settimana
 * è la popolazione raggiungibile moltiplicata per quell'intensità.
 */
export function buildWeeks({ events, from, to, reachByCountry, countries }) {
  const first = mondayOf(parseDate(from));
  const last = mondayOf(parseDate(to));
  const weeks = [];

  for (let d = first; d <= last; d = addDays(d, 7)) {
    const start = fmtDate(d);
    const end = fmtDate(addDays(d, 6));
    const byCountry = new Map(
      countries.map((c) => [
        c,
        { publicDays: [], bridge: false, schoolSubs: new Set(), schoolFull: false, schoolCoverage: 0, events: [] },
      ]),
    );
    weeks.push({ start, end, week: isoWeekNumber(d), byCountry, score: 0, scorePct: 0 });
  }

  const indexByStart = new Map(weeks.map((w, i) => [w.start, i]));
  const weekIndexFor = (dateStr) => indexByStart.get(fmtDate(mondayOf(parseDate(dateStr))));

  for (const ev of events) {
    const startIdx = weekIndexFor(ev.start);
    const endIdx = weekIndexFor(ev.end);
    const lo = Math.max(0, startIdx ?? 0);
    const hi = Math.min(weeks.length - 1, endIdx ?? weeks.length - 1);
    if (startIdx === undefined && endIdx === undefined) continue;

    for (let i = lo; i <= hi; i++) {
      const week = weeks[i];
      const cell = week.byCountry.get(ev.c);
      if (!cell) continue;
      if (!overlaps(ev.start, ev.end, week.start, week.end)) continue;
      cell.events.push(ev);

      if (ev.type === 'public') cell.publicDays.push(ev);
      else if (ev.type === 'bridge') cell.bridge = true;
      else if (ev.type === 'school') {
        if (!ev.subs) cell.schoolFull = true;
        else ev.subs.forEach((s) => cell.schoolSubs.add(s));
        cell.subTotal = ev.subTotal;
      }
    }
  }

  let max = 0;
  for (const week of weeks) {
    let score = 0;
    for (const [country, cell] of week.byCountry) {
      cell.schoolCoverage = cell.schoolFull
        ? 1
        : cell.subTotal
          ? Math.min(1, cell.schoolSubs.size / cell.subTotal)
          : 0;
      cell.intensity = weekIntensity(cell);
      const reach = reachByCountry.get(country)?.reach || 0;
      cell.value = reach * cell.intensity;
      score += cell.value;
    }
    week.score = score;
    if (score > max) max = score;
  }
  for (const week of weeks) week.scorePct = max ? Math.round((week.score / max) * 100) : 0;

  return weeks;
}

/** Settimane migliori, escluse quelle già passate. */
export function topWeeks(weeks, count = 5) {
  const today = fmtDate(new Date());
  return weeks
    .filter((w) => w.end >= today && w.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}
