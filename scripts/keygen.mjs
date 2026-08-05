#!/usr/bin/env node
/**
 * Genera chiavi Pro valide.
 *
 * Una chiave è valida se SHA-256("holiday-radar|v1|" + chiave) comincia con sei
 * zeri esadecimali. Non esiste nessuna lista da tenere aggiornata e nessun
 * segreto nel codice pubblico: trovare una chiave costa qualche milione di hash,
 * verificarla ne costa uno.
 *
 * Uso:  npm run keygen -- 5
 */

import { createHash, randomInt } from 'node:crypto';

const NAMESPACE = 'holiday-radar|v1|';
const REQUIRED_PREFIX = '000000';
// Niente I, O, 0, 1: chi ricopia una chiave a mano non deve indovinare.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const hash = (key) => createHash('sha256').update(NAMESPACE + key).digest('hex');

const randomKey = () => {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `HR-${group()}-${group()}-${group()}`;
};

function mint() {
  let tries = 0;
  for (;;) {
    const key = randomKey();
    tries++;
    if (hash(key).startsWith(REQUIRED_PREFIX)) return { key, tries };
  }
}

const count = Math.max(1, Number(process.argv[2]) || 1);
console.log(`Generating ${count} Pro key${count > 1 ? 's' : ''}…\n`);
for (let i = 0; i < count; i++) {
  const started = Date.now();
  const { key, tries } = mint();
  console.log(`  ${key}   (${tries.toLocaleString('en-GB')} hashes, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
}
console.log('\nKeys are unlocked in the browser under Pro → "Have a key?".');
