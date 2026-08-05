/**
 * Configurazione del prodotto. Unico file da toccare per collegare i contatti.
 */

/**
 * Dove finisce chi clicca "Parliamone" in fondo ai risultati: la vendita di
 * consulenza. Può essere un `mailto:`, un Calendly, un form.
 * Se torna vuoto la sezione si nasconde — meglio niente che un bottone morto.
 *
 * Nota: la sezione compare solo a chi ha fatto l'accesso, quindi l'indirizzo
 * non è esposto ai raccoglitori di email che leggono la pagina pubblica.
 */
export const CONTACT_URL = 'mailto:bebroggi@gmail.com';

/** Quante settimane migliori mostrare come schede sotto la timeline. */
export const TOP_WEEKS = 6;

/**
 * Quanti mesi copre l'orizzonte proposto all'apertura. I dati arrivano fino a
 * due anni avanti, ma un anno è la finestra su cui un host pianifica davvero.
 */
export const DEFAULT_HORIZON_MONTHS = 12;
