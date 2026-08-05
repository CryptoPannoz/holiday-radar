/**
 * Configurazione del prodotto. Unico file da toccare per collegare i contatti.
 */

/**
 * Dove finisce chi clicca "Talk it through" in fondo ai risultati: la vendita
 * di consulenza. Può essere un `mailto:`, un Calendly, un form.
 * Finché è vuoto la sezione resta nascosta — meglio niente che un bottone morto.
 */
export const CONTACT_URL = '';

/** Quante settimane migliori mostrare come schede sotto la timeline. */
export const TOP_WEEKS = 6;

/**
 * Quanti mesi copre l'orizzonte proposto all'apertura. I dati arrivano fino a
 * due anni avanti, ma un anno è la finestra su cui un host pianifica davvero.
 */
export const DEFAULT_HORIZON_MONTHS = 12;
