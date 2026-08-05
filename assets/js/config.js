/**
 * Configurazione del prodotto. Unico file da toccare per collegare il pagamento
 * o cambiare i limiti del piano gratuito.
 */

/**
 * Link di checkout (Stripe Payment Link, Lemon Squeezy, Gumroad...).
 * Finché è vuoto la pagina mostra un invito a scrivere invece di un bottone
 * che non porta da nessuna parte.
 */
export const CHECKOUT_URL = '';

/** Dove finisce chi vuole Pro prima che il checkout esista. */
export const WAITLIST_URL = 'https://github.com/CryptoPannoz/holiday-radar/discussions';

/** Cosa si può fare senza chiave. */
export const FREE_LIMITS = {
  markets: 5,
  months: 12,
  school: false,
  calendarScore: false,
  formats: ['csv'],
};
