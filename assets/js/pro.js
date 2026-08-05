/**
 * Sblocco delle funzioni Pro.
 *
 * ATTENZIONE, limite noto e voluto: il controllo avviene interamente nel
 * browser, quindi è un cancello morbido — chi sa leggere il codice lo aggira.
 * Va bene per partire (il sito resta statico, nessun server, nessun account),
 * ma se Pro diventa una fonte di reddito reale il controllo va spostato lato
 * server. Vedi README, sezione "Licensing".
 *
 * Le chiavi non stanno in nessuna lista: sono valide se l'hash della chiave
 * comincia con un prefisso concordato. Si generano offline con
 * `npm run keygen` e si verificano qui senza segreti nel codice pubblico.
 */

const STORAGE_KEY = 'holiday-radar.license';
const NAMESPACE = 'holiday-radar|v1|';
const REQUIRED_PREFIX = '000000';

const listeners = new Set();
let unlocked = false;

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function normaliseKey(key) {
  return String(key || '').trim().toUpperCase().replace(/\s+/g, '');
}

export async function isValidKey(key) {
  const clean = normaliseKey(key);
  if (!/^HR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(clean)) return false;
  const hash = await sha256Hex(NAMESPACE + clean);
  return hash.startsWith(REQUIRED_PREFIX);
}

export function isPro() {
  return unlocked;
}

export function onProChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function announce() {
  listeners.forEach((fn) => fn(unlocked));
}

/** Rilegge la chiave salvata. Da chiamare una volta all'avvio. */
export async function restore() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    return false; // storage bloccato: si resta sul piano gratuito
  }
  if (saved && (await isValidKey(saved))) {
    unlocked = true;
    announce();
  }
  return unlocked;
}

export async function unlock(key) {
  if (!(await isValidKey(key))) return false;
  try {
    localStorage.setItem(STORAGE_KEY, normaliseKey(key));
  } catch {
    /* sessione in sola lettura: sblocco valido solo finché la pagina è aperta */
  }
  unlocked = true;
  announce();
  return true;
}

export function lock() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* niente da rimuovere */
  }
  unlocked = false;
  announce();
}
