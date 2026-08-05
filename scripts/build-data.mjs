#!/usr/bin/env node
/**
 * Scarica festività, ponti e vacanze scolastiche e li congela in /data.
 *
 * Il sito non chiama mai queste API a runtime: legge i JSON generati qui.
 * Così la pagina è istantanea, funziona anche se una fonte è giù, e non
 * consuma rate limit altrui. Rigenerare con `npm run build:data` o via
 * GitHub Action (mensile).
 *
 * Fonti:
 *   - date.nager.at      → festività nazionali + ponti (LongWeekend)
 *   - openholidaysapi.org → vacanze scolastiche, con dettaglio regionale
 */

import { writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRIES, CITIES } from './geo-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

const NAGER = 'https://date.nager.at/api/v3';
const OPENH = 'https://openholidaysapi.org';

const START_YEAR = Number(process.env.START_YEAR) || new Date().getUTCFullYear();
const YEARS = Number(process.env.YEARS) || 3; // anno corrente + 2 → orizzonte 24 mesi sempre coperto
const years = Array.from({ length: YEARS }, (_, i) => START_YEAR + i);

async function getJSON(url, { allow404 = false } = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'holiday-radar/1.0 (+https://github.com/CryptoPannoz/holiday-radar)' },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 404 || res.status === 400) {
        if (allow404) return null;
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === 4) throw new Error(`${url} → ${err.message}`);
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
}

const enName = (arr) => {
  if (!Array.isArray(arr)) return '';
  return (arr.find((x) => x.language === 'EN') || arr[0] || {}).text || '';
};

/**
 * Le API restituiscono più campi di quelli che servono: qui si tiene solo il necessario.
 *
 * Si scartano i tipi "Observance": sono ricorrenze commemorative in cui si lavora
 * normalmente (la Lettonia ne ha 33 l'anno). Per un host contano solo i giorni in
 * cui la gente è davvero libera di partire.
 */
const DAY_OFF_TYPES = new Set(['Public', 'Bank']);

function slimPublic(list) {
  return (list || [])
    .filter((h) => (h.types || []).some((t) => DAY_OFF_TYPES.has(t)))
    .map((h) => ({
      date: h.date,
      name: h.name,
      local: h.localName !== h.name ? h.localName : undefined,
      regional: h.global === false || undefined,
      counties: h.counties || undefined,
    }));
}

function slimBridges(list) {
  return (list || [])
    .filter((w) => w.dayCount >= 3)
    .map((w) => ({
      start: w.startDate,
      end: w.endDate,
      days: w.dayCount,
      bridge: w.needBridgeDay ? w.bridgeDays : undefined,
    }));
}

function slimSchool(list) {
  return (list || []).map((h) => ({
    start: h.startDate,
    end: h.endDate,
    name: enName(h.name).replace(/\s+holidays?$/i, '').trim() || enName(h.name),
    nationwide: h.nationwide === true || undefined,
    subs: h.nationwide ? undefined : (h.subdivisions || []).map((s) => s.code),
  }));
}

/** Vacanze scolastiche identiche in più Länder arrivano come record separati: le fondo. */
function mergeSchool(entries) {
  const byKey = new Map();
  for (const e of entries) {
    const key = `${e.start}|${e.end}|${e.name}|${e.nationwide ? 'N' : 'R'}`;
    const found = byKey.get(key);
    if (found) {
      if (e.subs) found.subs = [...new Set([...(found.subs || []), ...e.subs])];
    } else {
      byKey.set(key, { ...e, subs: e.subs ? [...e.subs] : undefined });
    }
  }
  return [...byKey.values()].sort((a, b) => a.start.localeCompare(b.start));
}

async function buildCountry(country) {
  const { c } = country;
  const out = { country: c, name: country.name, nameEn: country.nameEn, flag: country.flag, public: [], bridges: [], school: [], subdivisions: [] };

  for (const year of years) {
    const [pub, lw] = await Promise.all([
      getJSON(`${NAGER}/PublicHolidays/${year}/${c}`, { allow404: true }),
      getJSON(`${NAGER}/LongWeekend/${year}/${c}`, { allow404: true }),
    ]);
    out.public.push(...slimPublic(pub));
    out.bridges.push(...slimBridges(lw));
  }
  out.public.sort((a, b) => a.date.localeCompare(b.date));
  out.bridges.sort((a, b) => a.start.localeCompare(b.start));

  if (country.school) {
    const subs = await getJSON(`${OPENH}/Subdivisions?countryIsoCode=${c}&languageIsoCode=EN`, { allow404: true });
    out.subdivisions = (subs || [])
      .map((s) => ({ code: s.code, short: s.shortName || s.code.split('-')[1] || s.code, name: enName(s.name) }))
      .filter((s) => s.name);

    const from = `${years[0]}-01-01`;
    const to = `${years[years.length - 1]}-12-31`;
    const school = await getJSON(
      `${OPENH}/SchoolHolidays?countryIsoCode=${c}&languageIsoCode=EN&validFrom=${from}&validTo=${to}`,
      { allow404: true },
    );
    out.school = mergeSchool(slimSchool(school));
  }

  return out;
}

async function main() {
  await rm(join(DATA, 'markets'), { recursive: true, force: true });
  await mkdir(join(DATA, 'markets'), { recursive: true });

  console.log(`Anni: ${years.join(', ')} — ${COUNTRIES.length} mercati\n`);

  const index = [];
  // Sequenziale a piccoli lotti: le API sono gratuite, non le si martella.
  for (let i = 0; i < COUNTRIES.length; i += 4) {
    const batch = COUNTRIES.slice(i, i + 4);
    const results = await Promise.all(batch.map(buildCountry));
    for (const r of results) {
      await writeFile(join(DATA, 'markets', `${r.country}.json`), JSON.stringify(r));
      index.push({
        c: r.country,
        name: r.name,
        nameEn: r.nameEn,
        flag: r.flag,
        publicCount: r.public.length,
        bridgeCount: r.bridges.length,
        schoolCount: r.school.length,
        subdivisions: r.subdivisions.length,
      });
      console.log(
        `  ${r.flag} ${r.country} ${String(r.name).padEnd(16)} ` +
          `${String(r.public.length).padStart(3)} fest.  ${String(r.bridges.length).padStart(3)} ponti  ` +
          `${String(r.school.length).padStart(4)} scol.  ${r.subdivisions.length ? r.subdivisions.length + ' regioni' : ''}`,
      );
    }
  }

  await writeFile(join(DATA, 'cities.json'), JSON.stringify(CITIES));
  await writeFile(
    join(DATA, 'meta.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        years,
        markets: index.sort((a, b) => a.name.localeCompare(b.name)),
        cities: CITIES.length,
        sources: [
          { name: 'Nager.Date', url: 'https://date.nager.at', use: 'public holidays & long weekends' },
          { name: 'OpenHolidays API', url: 'https://openholidaysapi.org', use: 'school holidays (regional)' },
        ],
      },
      null,
      2,
    ),
  );

  const totals = index.reduce(
    (a, m) => ({ p: a.p + m.publicCount, b: a.b + m.bridgeCount, s: a.s + m.schoolCount }),
    { p: 0, b: 0, s: 0 },
  );
  console.log(`\nTotale: ${totals.p} festività, ${totals.b} ponti, ${totals.s} periodi scolastici.`);
}

main().catch((err) => {
  console.error('BUILD FALLITA:', err.message);
  process.exit(1);
});
