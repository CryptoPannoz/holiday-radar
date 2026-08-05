#!/usr/bin/env node
/**
 * Copia l'applicazione dentro il sito personale, dove sta la versione pubblica.
 *
 * Questa repo resta la fonte del codice (ed è quella open source che la gente
 * clona); bebroggi.it/tools/holiday-radar/ è dove il tool vive davvero. Tenere
 * due copie va bene solo se allinearle è un comando, non un lavoro manuale:
 * questo è quel comando.
 *
 * Uso:  npm run deploy:site
 */

import { cp, rm, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = resolve(ROOT, '..', 'alberto-broggi-site');
const TARGET = join(SITE, 'tools', 'holiday-radar');

/** Quello che serve al browser, più gli script per rigenerare i dati in CI. */
const PAYLOAD = ['index.html', 'assets', 'data', 'scripts', 'package.json', 'README.md', 'LICENSE'];

if (!existsSync(SITE)) {
  console.error(`Non trovo il sito in ${SITE}.`);
  console.error('Clona CryptoPannoz/alberto-broggi-site accanto a questa cartella.');
  process.exit(1);
}

// Si azzera la destinazione: se un file sparisce qui, deve sparire anche là.
await rm(TARGET, { recursive: true, force: true });
await mkdir(TARGET, { recursive: true });

for (const entry of PAYLOAD) {
  const from = join(ROOT, entry);
  if (!existsSync(from)) {
    console.warn(`  ⚠︎  salto ${entry} (non esiste)`);
    continue;
  }
  await cp(from, join(TARGET, entry), { recursive: true });
  console.log(`  ✓ ${entry}`);
}

const markets = await readdir(join(TARGET, 'data', 'markets'));
console.log(`\nPubblicato in ${TARGET}`);
console.log(`${markets.length} mercati copiati. Ora committa e pusha il sito.`);
