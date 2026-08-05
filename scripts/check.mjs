#!/usr/bin/env node
/**
 * Controlli di sanità sui dati generati.
 *
 * Serve a impedire che una risposta vuota o malformata di un'API a monte venga
 * committata al posto dei dati buoni: senza questo, un'ora di disservizio
 * altrui diventerebbe un sito che dice "nessuna vacanza".
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRIES, CITIES, AIRPORTS } from './geo-source.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = async (p) => JSON.parse(await readFile(join(DATA, p), 'utf8'));

const problems = [];
const fail = (msg) => problems.push(msg);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const meta = await read('meta.json');
const cities = await read('cities.json');
const airports = await read('airports.json');

if (!Array.isArray(meta.years) || meta.years.length < 2) fail('meta.years dovrebbe coprire almeno due anni');
if (cities.length !== CITIES.length) fail(`cities.json ha ${cities.length} voci, la sorgente ne ha ${CITIES.length}`);
if (airports.length !== AIRPORTS.length) fail(`airports.json ha ${airports.length} voci, la sorgente ne ha ${AIRPORTS.length}`);

for (const city of cities) {
  if (Math.abs(city.lat) > 90 || Math.abs(city.lon) > 180) fail(`coordinate fuori range: ${city.n}`);
  if (!(city.p > 0)) fail(`popolazione mancante o nulla: ${city.n}`);
}

const first = `${meta.years[0]}-01-01`;
const last = `${meta.years[meta.years.length - 1]}-12-31`;
let totalPublic = 0;
let totalSchool = 0;

for (const country of COUNTRIES) {
  let market;
  try {
    market = await read(`markets/${country.c}.json`);
  } catch {
    fail(`manca il file del mercato ${country.c}`);
    continue;
  }

  // Ogni paese europeo ha almeno otto giorni festivi l'anno: meno significa risposta troncata.
  const minPublic = 8 * meta.years.length;
  if (market.public.length < minPublic) {
    fail(`${country.c}: solo ${market.public.length} festività su ${meta.years.length} anni (attese ≥ ${minPublic})`);
  }
  totalPublic += market.public.length;
  totalSchool += market.school.length;

  for (const h of market.public) {
    if (!ISO_DATE.test(h.date)) fail(`${country.c}: data non valida "${h.date}"`);
    else if (h.date < first || h.date > last) fail(`${country.c}: festività fuori orizzonte (${h.date})`);
    if (!h.name) fail(`${country.c}: festività senza nome il ${h.date}`);
  }

  for (const s of market.school) {
    if (!ISO_DATE.test(s.start) || !ISO_DATE.test(s.end)) fail(`${country.c}: periodo scolastico con date non valide`);
    else if (s.end < s.start) fail(`${country.c}: periodo scolastico che finisce prima di iniziare (${s.start})`);
  }

  if (country.school && market.school.length === 0) {
    console.warn(`  ⚠︎  ${country.c}: nessuna vacanza scolastica (la fonte potrebbe non pubblicarle ancora)`);
  }
}

// Le scolastiche sono la parte di valore di Pro: se crollano, meglio non pubblicare.
if (totalSchool < 400) fail(`solo ${totalSchool} periodi scolastici in totale: sospetto`);

if (problems.length) {
  console.error(`\n✗ ${problems.length} problemi:\n`);
  problems.forEach((p) => console.error(`   - ${p}`));
  process.exit(1);
}

console.log(
  `✓ dati coerenti — ${COUNTRIES.length} mercati, ${totalPublic} festività, ${totalSchool} periodi scolastici, ` +
    `${cities.length} città, ${airports.length} aeroporti (anni ${meta.years.join('–')})`,
);
