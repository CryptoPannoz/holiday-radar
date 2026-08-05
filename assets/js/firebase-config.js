/**
 * Configurazione Firebase — DA COMPILARE.
 *
 * Finché `apiKey` e `projectId` sono vuoti il sito funziona lo stesso: il
 * cancello mostra "Continue without signing in" e nessuno viene tracciato.
 * Appena incolli qui i valori del tuo progetto, il login diventa reale.
 *
 * Come ottenerli (5 minuti, servono i tuoi account Google — non posso farlo io):
 *   1. console.firebase.google.com → Add project → chiamalo "holiday-radar"
 *   2. Build → Authentication → Get started → abilita "Google" e "Email link
 *      (passwordless sign-in)"
 *   3. Build → Firestore Database → Create database → modalità produzione
 *   4. Project settings → General → Your apps → Web (</>) → registra l'app
 *      e copia qui l'oggetto firebaseConfig
 *   5. Authentication → Settings → Authorized domains → aggiungi
 *      "cryptopannoz.github.io"
 *
 * Queste chiavi NON sono segrete: le API key web di Firebase identificano il
 * progetto, non autorizzano nulla. Ciò che protegge i dati sono le regole di
 * sicurezza di Firestore — quelle da incollare stanno nel README.
 */

export const firebaseConfig = {
  apiKey: '',
  authDomain: 'str-holiday-radar.firebaseapp.com',
  projectId: 'str-holiday-radar',
  appId: '',
};

/** Collezione dove finiscono i contatti raccolti. */
export const LEADS_COLLECTION = 'leads';

/** Versione dell'SDK caricata da CDN. */
export const FIREBASE_VERSION = '10.14.1';
