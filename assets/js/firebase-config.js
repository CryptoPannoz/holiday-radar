/**
 * Configurazione Firebase del progetto `str-holiday-radar`.
 *
 * Se questi campi tornassero vuoti, il cancello dichiara che l'accesso non è
 * attivo e rimanda alla repo: non si apre comunque.
 *
 * Configurato il 5 agosto 2026 sul progetto `str-holiday-radar`: app web
 * registrata, provider Google ed Email link attivi, Firestore creato con le
 * regole del README, dominio `bebroggi.it` autorizzato.
 *
 * Se un giorno servisse un dominio nuovo, va aggiunto in
 * Authentication → Settings → Domini autorizzati, altrimenti il login parte
 * e fallisce con "dominio non autorizzato".
 *
 * Queste chiavi NON sono segrete: le API key web di Firebase identificano il
 * progetto, non autorizzano nulla. Ciò che protegge i dati sono le regole di
 * sicurezza di Firestore — quelle da incollare stanno nel README.
 */

export const firebaseConfig = {
  apiKey: 'AIzaSyCs2JNz5BkSBvQ80r9DDm6lALlglfAx-eg',
  authDomain: 'str-holiday-radar.firebaseapp.com',
  projectId: 'str-holiday-radar',
  appId: '1:671920042026:web:121ff2524ce29ed9a5d353',
};

/** Collezione dove finiscono i contatti raccolti. */
export const LEADS_COLLECTION = 'leads';

/** Versione dell'SDK caricata da CDN. */
export const FIREBASE_VERSION = '10.14.1';
