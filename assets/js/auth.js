/**
 * Login e raccolta contatti.
 *
 * A cosa serve: il tool è gratuito per tutti, ma sapere chi lo usa vale più del
 * prezzo che si potrebbe chiedere. Chi non vuole registrarsi clona la repo e se
 * lo esegue da solo — è scritto nel cancello e nel README, non è una trappola.
 *
 * ATTENZIONE, limite dichiarato: il velo sui risultati è CSS. I dati sono già
 * nel DOM e chiunque apra gli strumenti per sviluppatori li vede. Non è una
 * misura di sicurezza, è un invito a presentarsi.
 *
 * L'SDK Firebase viene caricato da CDN solo se la configurazione esiste: senza,
 * la pagina non fa nemmeno una richiesta di rete in più.
 */

import { firebaseConfig, LEADS_COLLECTION, FIREBASE_VERSION } from './firebase-config.js';

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const EMAIL_PENDING_KEY = 'holiday-radar.pendingEmail';

const listeners = new Set();
let sdk = null;
let auth = null;
let db = null;
let user = null;
let started = false;

export const isConfigured = () => Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
export const currentUser = () => user;

export function onUserChange(fn) {
  listeners.add(fn);
  fn(user);
  return () => listeners.delete(fn);
}

const announce = () => listeners.forEach((fn) => fn(user));

async function loadSDK() {
  if (sdk) return sdk;
  const [app, authMod, storeMod] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);
  sdk = { app, authMod, storeMod };
  return sdk;
}

/**
 * Avvia Firebase e ripristina la sessione. Va chiamata una volta all'avvio.
 * Non lancia mai: se qualcosa non va si resta semplicemente senza login, perché
 * un errore di autenticazione non deve impedire di usare uno strumento gratuito.
 */
export async function init() {
  if (!isConfigured() || started) return isConfigured();
  started = true;
  try {
    const { app, authMod, storeMod } = await loadSDK();
    const instance = app.initializeApp(firebaseConfig);
    auth = authMod.getAuth(instance);
    db = storeMod.getFirestore(instance);

    authMod.onAuthStateChanged(auth, (u) => {
      user = u ? { uid: u.uid, email: u.email, name: u.displayName || '', provider: u.providerData?.[0]?.providerId || '' } : null;
      announce();
    });

    await completeEmailLinkSignIn(authMod);
    return true;
  } catch (err) {
    console.warn('[holiday-radar] auth unavailable:', err.message);
    return false;
  }
}

/** Se si torna sulla pagina dal link ricevuto per email, chiude il giro qui. */
async function completeEmailLinkSignIn(authMod) {
  if (!authMod.isSignInWithEmailLink(auth, window.location.href)) return;
  let email = null;
  try {
    email = localStorage.getItem(EMAIL_PENDING_KEY);
  } catch {
    /* storage bloccato */
  }
  // Aprire il link su un dispositivo diverso da quello che l'ha chiesto è normale.
  if (!email) email = window.prompt('Conferma l\'indirizzo email a cui è stato inviato il link:');
  if (!email) return;

  await authMod.signInWithEmailLink(auth, email, window.location.href);
  try {
    localStorage.removeItem(EMAIL_PENDING_KEY);
  } catch {
    /* niente da rimuovere */
  }
  // Via i parametri del link, altrimenti restano nella barra e nei preferiti.
  const url = new URL(window.location.href);
  ['apiKey', 'oobCode', 'mode', 'lang', 'continueUrl'].forEach((p) => url.searchParams.delete(p));
  window.history.replaceState(null, '', url.toString());
}

export async function signInWithGoogle() {
  const { authMod } = await loadSDK();
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await authMod.signInWithPopup(auth, provider);
  } catch (err) {
    // Popup bloccato dal browser: si ripiega sul redirect, che passa sempre.
    if (/popup-blocked|popup-closed|cancelled-popup/.test(err.code || '')) {
      await authMod.signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

export async function sendEmailLink(email) {
  const { authMod } = await loadSDK();
  const url = new URL(window.location.href);
  url.hash = '';
  await authMod.sendSignInLinkToEmail(auth, email, { url: url.toString(), handleCodeInApp: true });
  try {
    localStorage.setItem(EMAIL_PENDING_KEY, email);
  } catch {
    /* si chiederà l'indirizzo al ritorno */
  }
}

export async function signOut() {
  if (!auth) return;
  const { authMod } = await loadSDK();
  await authMod.signOut(auth);
}

/**
 * Registra il contatto e la ricerca appena fatta.
 *
 * Si tiene volutamente poco: chi è, cosa ha cercato e quando. Nessun
 * identificatore di navigazione, nessuna profilazione. Se fallisce non succede
 * niente di visibile: l'utente ha comunque i suoi risultati.
 */
export async function recordSearch(payload) {
  if (!db || !user) return;
  let storeMod;
  try {
    ({ storeMod } = await loadSDK());
  } catch (err) {
    console.warn('[holiday-radar] SDK non disponibile:', err.message);
    return;
  }
  const { doc, setDoc, getDoc, addDoc, collection, serverTimestamp, increment } = storeMod;
  const leadRef = doc(db, LEADS_COLLECTION, user.uid);

  /**
   * La lettura serve solo a non riscrivere `firstSeenAt` a ogni ricerca, quindi
   * è facoltativa e ha il suo try/catch. Prima era in linea con le scritture:
   * le regole negavano ogni lettura, l'eccezione usciva dal blocco e il
   * contatto non veniva mai salvato — un campo accessorio faceva cadere tutto.
   */
  let isNew = false;
  try {
    isNew = !(await getDoc(leadRef)).exists();
  } catch {
    isNew = false;
  }

  const profile = {
    email: user.email || null,
    name: user.name || null,
    provider: user.provider || null,
    lastSeenAt: serverTimestamp(),
    searchCount: increment(1),
  };
  if (isNew) profile.firstSeenAt = serverTimestamp();

  // Le due scritture sono indipendenti: se una fallisce l'altra deve passare.
  const results = await Promise.allSettled([
    setDoc(leadRef, profile, { merge: true }),
    addDoc(collection(db, LEADS_COLLECTION, user.uid, 'searches'), { ...payload, at: serverTimestamp() }),
  ]);

  results
    .filter((r) => r.status === 'rejected')
    .forEach((r) => console.warn('[holiday-radar] scrittura rifiutata:', r.reason?.message || r.reason));
}
