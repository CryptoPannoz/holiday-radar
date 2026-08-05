/**
 * Bilingue italiano/inglese.
 *
 * Il testo fisso della pagina è marcato con `data-i18n` e viene riscritto da
 * `applyStatic()`; il testo generato dal codice passa da `t()`. La lingua si
 * sceglie dall'interruttore in alto, si ricorda nel browser e viaggia nell'URL,
 * così un link condiviso arriva nella lingua di chi lo ha mandato.
 *
 * Regola: mai sostituire l'innerHTML di un contenitore che ha dentro bottoni o
 * campi — si porterebbero via i gestori di eventi. Per quei casi si marca solo
 * il pezzo di testo, non il genitore.
 */

const STORAGE_KEY = 'holiday-radar.lang';

export const LANGS = ['it', 'en'];

const DICT = {
  it: {
    'meta.title': 'Holiday Radar — quando sono liberi di viaggiare i tuoi ospiti',
    'nav.how': 'Come funziona',
    'nav.signin': 'Accedi',
    'nav.signedIn': 'Accesso fatto',
    'nav.signoutTitle': 'Accesso come {email} — clicca per uscire',

    'hero.title1': 'Quando sono liberi di viaggiare',
    'hero.title2': 'i tuoi ospiti?',
    'hero.lede':
      "Metti la tua casa sulla mappa, dì quanto lontano arriva chi viene a trovarti, e guarda tutti i giorni di vacanza dei mercati che possono raggiungerti. Le vacanze scolastiche dei tuoi vicini di frontiera prevedono il tuo calendario meglio di quelle italiane.",

    'step1.label': "Dov'è la tua casa?",
    'step1.placeholder': 'es. Via Novara 38, Orta San Giulio',
    'step1.go': 'Vai',
    'step1.example': "prova con Villa Volpe, Lago d'Orta",
    'step1.locate': 'usa la mia posizione',
    'step1.orclick': 'oppure clicca sulla mappa',
    'step1.aria': 'Mappa della tua casa e dei mercati raggiungibili',

    'step2.label': 'Raggio in auto',
    'step2.note': 'La forma segue i tempi di strada reali, non è un cerchio.',
    'step3.label': 'Raggio in aereo',
    'step3.note': "Distanza in linea d'aria dalla tua casa.",
    'step3.noteEst': "In linea d'aria — circa {h} porta a porta.",
    'step3.noteOff': 'Mercati aerei esclusi.',
    'step3.off': 'spento',
    'step4.label': 'Periodo',
    'step4.from': 'Inizio del periodo',
    'step4.to': 'Fine del periodo',
    'step4.note': 'Dati disponibili fino a tutto il {year}.',

    'mapkey.home': 'la tua casa',
    'mapkey.drive': 'raggio in auto',
    'mapkey.fly': 'raggio in aereo',

    'markets.label': 'Mercati — scegline quanti vuoi',
    'markets.inRadius': 'solo quelli nel raggio',
    'markets.all': 'tutti e 30',
    'markets.none': 'nessuno',

    'results.calendarTitle': 'Calendario delle occasioni',
    'results.calendarLede':
      'Dove le barre si sovrappongono, più mercati sono in vacanza insieme. Dove una barra è sola, quella settimana è tutta per una campagna mirata.',
    'results.bestTitle': 'Le settimane migliori in arrivo',
    'tabs.dates': 'Tutte le date',
    'tabs.markets': 'Dettaglio mercati',
    'export.csv': 'Esporta CSV',
    'export.ics': 'Esporta calendario (.ics)',
    'export.json': 'Esporta JSON',

    'gate.title': 'I tuoi risultati sono pronti',
    'gate.lede':
      'Accedi e si sblocca tutto quello che c\'è sotto: vacanze scolastiche regione per regione, punteggio settimanale della domanda e tutte le esportazioni. È gratis, e resta gratis.',
    'gate.ledeUnavailable':
      "L'accesso non è ancora attivo su questa installazione. Nel frattempo puoi scaricare il codice e usarlo senza limiti.",
    'gate.google': 'Continua con Google',
    'gate.emailPlaceholder': 'tu@esempio.it',
    'gate.emailBtn': 'Mandami un link',
    'gate.emailAria': 'La tua email',
    'gate.fine1':
      'Conservo il tuo indirizzo email e le ricerche che fai, così so a chi è utile questo strumento e posso avvisarti quando migliora. Non vendo niente a nessuno e non passo i dati a inserzionisti; puoi chiedermi di cancellarli quando vuoi.',
    'gate.fine2': 'Preferisci di no? È tutto open source —',
    'gate.fineLink': 'scaricalo ed eseguilo da te',
    'gate.fine3': ', senza accesso e senza limiti.',
    'gate.opening': 'Apro Google…',
    'gate.sending': 'Invio…',
    'gate.linkSent': 'Link inviato a {email}. Aprilo su questo dispositivo e sei dentro.',

    'auth.badDomain': 'Questo dominio non è ancora autorizzato nel progetto Firebase.',
    'auth.notEnabled': 'Questo metodo di accesso non è abilitato nel progetto Firebase.',
    'auth.badEmail': 'Questo indirizzo email non sembra valido.',
    'auth.network': 'Problema di rete — controlla la connessione e riprova.',
    'auth.failed': 'Accesso non riuscito.',
    'auth.confirmEmail': "Conferma l'indirizzo email a cui è stato inviato il link:",

    'cta.title': 'Sapere le date è la metà facile',
    'cta.body':
      "Trasformarle in tariffe, soggiorni minimi e un annuncio che esce nella lingua giusta è l'altra metà. Se preferisci che qualcuno lo faccia insieme a te sulla tua casa, scrivimi.",
    'cta.link': 'Parliamone',

    'how.title': 'Come funziona',
    'how.1title': '1 · Chi può raggiungerti',
    'how.1body':
      "I tempi di guida verso 131 aree metropolitane europee sono misurati sulla rete stradale vera. La forma disegnata sulla mappa è interpolata da quelle misure: si allunga lungo le autostrade e si strozza dove ci sono le montagne. Un cerchio di otto ore attorno al Lago d'Orta contiene Parigi; l'autostrada no, Parigi è a 9h 12m.",
    'how.2title': '2 · Quando sono liberi',
    'how.2body':
      'Festività e ponti da Nager.Date, vacanze scolastiche da OpenHolidays con il dettaglio regionale dove esiste. I sedici Länder tedeschi e le tre zone francesi sfalsano apposta le vacanze scolastiche, ed è proprio questo che le rende aggredibili una alla volta.',
    'how.3title': '3 · Dove stanno i soldi',
    'how.3body':
      'Ogni settimana ha un punteggio in base a quante persone raggiungibili sono davvero libere. Una settimana in cui si ferma una sola regione vicina è una campagna mirata; una in cui se ne fermano quattro insieme è un aumento di prezzo.',
    'how.foot':
      "Tutti i calcoli avvengono nel tuo browser. L'indirizzo che scrivi va a un servizio di geocodifica per diventare coordinate, e le coordinate della casa vanno a un servizio di navigazione per misurare i tempi di guida: nient'altro esce dal tuo computer.",

    'footer.warning':
      'Le date cambiano e le fonti a volte sono in ritardo: verifica su una fonte ufficiale prima di investire soldi in una campagna.',
    'footer.credit': 'Open source, licenza MIT. Fatto da un host, per gli host —',
    'footer.stamp': 'Dati aggiornati al {date}.',

    'busy.working': 'Attendo…',
    'busy.finding': 'Cerco…',
    'busy.measuring': 'Misuro…',
    'busy.locating': 'Localizzo…',

    'err.loadDb': "Non riesco a caricare l'archivio delle vacanze. {msg}",
    'err.noPlace': 'Nessun luogo corrisponde a questo indirizzo. Prova ad aggiungere il comune o la nazione.',
    'err.noGeo': 'Questo browser non può condividere la posizione.',
    'err.geoDenied': 'Permesso di geolocalizzazione negato.',
    'err.nothingExport': "Non c'è ancora niente da esportare.",

    'badge.airport': 'Aeroporto più vicino: {code} · {km} km',
    'badge.estimated': 'Servizio percorsi non raggiungibile — tempi di guida stimati.',
    'badge.dropped': 'punto sulla mappa',
    'badge.myLocation': 'La mia posizione',
    'badge.saved': 'Casa salvata',
    'badge.exampleDetail': 'Orta San Giulio, Piemonte',

    'stats.markets': 'mercati scelti',
    'stats.drive': 'persone entro {h} di auto',
    'stats.fly': 'in più entro {km} km di volo',
    'stats.dates': 'date nel periodo',
    'stats.schoolWeeks': 'settimane con vacanze scolastiche',
    'stats.bestWeek': 'settimana migliore · punteggio {n}',
    'stats.noWeek': 'nessuna settimana con punteggio',

    'timeline.empty': 'Scegli almeno un mercato per vedere il calendario.',
    'timeline.demand': 'Punteggio settimanale della domanda — quanta parte del tuo mercato raggiungibile è ferma',
    'timeline.weekTip': 'Settimana del {date} — punteggio domanda {n}/100',
    'timeline.reachTip': '{market} — bacino ponderato {reach}',
    'key.public': 'festività',
    'key.school': 'vacanza scolastica (più sottile = meno regioni)',
    'key.bridge': 'ponte',
    'key.demand': 'punteggio settimanale',

    'gap.none': 'Per {market} non esistono dati sulle vacanze scolastiche: solo festività nazionali.',
    'gap.late': 'Le date scolastiche di {market} non sono ancora pubblicate così avanti. Le festività invece sono complete.',
    'tip.nationwide': 'tutto il paese',
    'tip.regions': '{n} regioni',
    'tip.region': '1 regione',

    'advice.nothing': 'Niente in programma: settimana da riempire con qualcosa che non siano le vacanze.',
    'advice.single': 'Questa settimana la traina da solo un mercato: {market}. Vale una campagna mirata.',
    'advice.strong': '{n} mercati sono fermi insieme: qui tieni la tariffa invece di scontare.',
    'advice.overlap': '{n} mercati si sovrappongono: buona settimana per imporre un soggiorno minimo.',
    'advice.partial': 'Solo vacanze parziali: assomiglia a una settimana normale più di quanto sembri.',

    'card.off': 'Fermi: ',
    'card.nothing': 'Niente in programma.',
    'card.schools': '{n}% scuole',
    'card.bridge': 'ponte',
    'card.holiday': 'festività',
    'card.noWeeks': 'Nessuna settimana con punteggio in questo periodo.',

    'type.public': 'festività',
    'type.school': 'scuole',
    'type.bridge': 'ponte',

    'list.empty': 'Nessuna data in questo periodo per i mercati scelti.',
    'list.h.market': 'Mercato',
    'list.h.type': 'Tipo',
    'list.h.dates': 'Date',
    'list.h.nights': 'Notti',
    'list.h.what': 'Cosa',
    'list.h.share': 'Quota ferma',
    'list.h.regions': 'Regioni',
    'list.showing': "Mostro le prime {shown} date su {total} — l'esportazione le contiene tutte.",

    'mk.empty': 'Allarga il raggio per intercettare dei mercati.',
    'mk.h.market': 'Mercato',
    'mk.h.nearest': 'Città più vicina',
    'mk.h.drive': 'Auto',
    'mk.h.flight': 'Aereo',
    'mk.h.byCar': 'In auto',
    'mk.h.byAir': 'In aereo',
    'mk.h.reach': 'Bacino ponderato',
    'mk.note':
      'Il bacino ponderato sconta le persone in base a quanto è faticoso raggiungerti: chi sta a due ore conta quasi per intero, chi sta a otto ore conta circa un quinto, e chi deve volare conta al massimo il {pct}%. Serve a ordinare i mercati fra loro, non è una previsione di prenotazioni.',
  },

  en: {
    'meta.title': 'Holiday Radar — find out when your guests are free to travel',
    'nav.how': 'How it works',
    'nav.signin': 'Sign in',
    'nav.signedIn': 'Signed in',
    'nav.signoutTitle': 'Signed in as {email} — click to sign out',

    'hero.title1': 'When are your guests',
    'hero.title2': 'free to travel?',
    'hero.lede':
      "Drop your property on the map, say how far people will travel to reach it, and see every day off in every market that can. Your neighbours' school holidays predict your calendar better than your own do.",

    'step1.label': 'Where is your property?',
    'step1.placeholder': 'e.g. Via Novara 38, Orta San Giulio',
    'step1.go': 'Go',
    'step1.example': 'try Villa Volpe, Lake Orta',
    'step1.locate': 'use my location',
    'step1.orclick': 'or click the map',
    'step1.aria': 'Map of your property and its reachable markets',

    'step2.label': 'Drive radius',
    'step2.note': 'Shape follows real road times, not a circle.',
    'step3.label': 'Flight radius',
    'step3.note': 'Straight-line distance from your property.',
    'step3.noteEst': 'Straight line — roughly {h} door to door.',
    'step3.noteOff': 'Flight markets excluded.',
    'step3.off': 'off',
    'step4.label': 'Horizon',
    'step4.from': 'Horizon start',
    'step4.to': 'Horizon end',
    'step4.note': 'Data available through {year}.',

    'mapkey.home': 'your property',
    'mapkey.drive': 'drive reach',
    'mapkey.fly': 'flight reach',

    'markets.label': 'Markets — pick as many as you like',
    'markets.inRadius': 'within my radius',
    'markets.all': 'all 30',
    'markets.none': 'none',

    'results.calendarTitle': 'Opportunity calendar',
    'results.calendarLede':
      'Where the bars overlap, several markets are off at once. Where a bar stands alone, one campaign has the week to itself.',
    'results.bestTitle': 'Best weeks ahead',
    'tabs.dates': 'All dates',
    'tabs.markets': 'Market breakdown',
    'export.csv': 'Export CSV',
    'export.ics': 'Export calendar (.ics)',
    'export.json': 'Export JSON',

    'gate.title': 'Your results are ready',
    'gate.lede':
      'Sign in and everything below unlocks — school holidays region by region, the weekly demand score, and all exports. It is free, and it stays free.',
    'gate.ledeUnavailable':
      'Sign-in is not switched on for this deployment yet. In the meantime you can download the code and run it without limits.',
    'gate.google': 'Continue with Google',
    'gate.emailPlaceholder': 'you@example.com',
    'gate.emailBtn': 'Email me a link',
    'gate.emailAria': 'Your email',
    'gate.fine1':
      'I keep your email address and the searches you run, so I know who finds this useful and can tell you when it improves. Nothing is sold on or passed to advertisers, and you can ask me to delete it at any time.',
    'gate.fine2': 'Rather not? The whole thing is open source —',
    'gate.fineLink': 'clone it and run it yourself',
    'gate.fine3': ', no sign-in, no limits.',
    'gate.opening': 'Opening Google…',
    'gate.sending': 'Sending…',
    'gate.linkSent': 'Link sent to {email}. Open it on this device and you are in.',

    'auth.badDomain': 'This domain is not authorised in the Firebase project yet.',
    'auth.notEnabled': 'That sign-in method is not enabled in the Firebase project.',
    'auth.badEmail': 'That email address does not look right.',
    'auth.network': 'Network problem — check the connection and try again.',
    'auth.failed': 'Sign-in failed.',
    'auth.confirmEmail': 'Confirm the email address this link was sent to:',

    'cta.title': 'Knowing the dates is the easy half',
    'cta.body':
      'Turning them into rates, minimum stays and a listing that shows up in the right language is the other half. If you would rather have someone do that with you for your property, say hello.',
    'cta.link': 'Talk it through',

    'how.title': 'How it works',
    'how.1title': '1 · Who can reach you',
    'how.1body':
      'Real driving times to 131 European metro areas, measured through the road network. The shape drawn on the map is interpolated from those measurements, so it stretches along motorways and pinches where mountains get in the way. An eight-hour circle around Lake Orta contains Paris; the motorway does not — Paris is 9h 12m.',
    'how.2title': '2 · When they are off',
    'how.2body':
      'Public holidays and bridge days from Nager.Date, school holidays from the OpenHolidays API with regional detail where it exists. Germany\'s sixteen Länder and France\'s three zones stagger their school breaks on purpose, which is exactly what makes them bookable one at a time.',
    'how.3title': '3 · Where the money is',
    'how.3body':
      'Each week is scored by how many reachable people are actually off. A week when one nearby region breaks is a targeted campaign; a week when four break at once is a price increase.',
    'how.foot':
      'Everything is computed in your browser. The address you type goes to a geocoder to become coordinates, and your property\'s coordinates go to a routing service to measure drive times — nothing else leaves your machine.',

    'footer.warning':
      'Dates change and sources occasionally lag: confirm against an official source before committing money to a campaign.',
    'footer.credit': 'Open source, MIT. Built by a host, for hosts —',
    'footer.stamp': 'Holiday data refreshed {date}.',

    'busy.working': 'Working…',
    'busy.finding': 'Finding…',
    'busy.measuring': 'Measuring…',
    'busy.locating': 'Locating…',

    'err.loadDb': 'Could not load the holiday database. {msg}',
    'err.noPlace': 'No place matched that address. Try adding the town or country.',
    'err.noGeo': 'This browser cannot share a location.',
    'err.geoDenied': 'Location permission denied.',
    'err.nothingExport': 'Nothing to export yet.',

    'badge.airport': 'Nearest hub: {code} · {km} km',
    'badge.estimated': 'Routing unavailable — drive times estimated.',
    'badge.dropped': 'dropped pin',
    'badge.myLocation': 'My location',
    'badge.saved': 'Saved property',
    'badge.exampleDetail': 'Orta San Giulio, Piedmont, Italy',

    'stats.markets': 'markets selected',
    'stats.drive': 'people within {h} drive',
    'stats.fly': 'more within {km} km flight',
    'stats.dates': 'dates in horizon',
    'stats.schoolWeeks': 'weeks with school holidays',
    'stats.bestWeek': 'best week · score {n}',
    'stats.noWeek': 'no scored week',

    'timeline.empty': 'Pick at least one market to see the calendar.',
    'timeline.demand': 'Weekly demand score — how much of your reachable market is off',
    'timeline.weekTip': 'Week of {date} — demand score {n}/100',
    'timeline.reachTip': '{market} — weighted reach {reach}',
    'key.public': 'public holiday',
    'key.school': 'school holiday (thinner = fewer regions)',
    'key.bridge': 'long weekend / bridge day',
    'key.demand': 'weekly demand score',

    'gap.none': 'No school-holiday data is published for {market} — public holidays only.',
    'gap.late': 'School dates for {market} are not published this far ahead yet. Public holidays are complete.',
    'tip.nationwide': 'nationwide',
    'tip.regions': '{n} regions',
    'tip.region': '1 region',

    'advice.nothing': 'Nothing scheduled — a week to fill with something other than holidays.',
    'advice.single': '{market} alone drives this week — worth a campaign aimed at it specifically.',
    'advice.strong': '{n} markets are properly off at once — hold your rate here rather than discount.',
    'advice.overlap': '{n} markets overlap — good week for a minimum-stay rule.',
    'advice.partial': 'Partial holidays only — closer to a normal week than it looks.',

    'card.off': 'Off: ',
    'card.nothing': 'Nothing scheduled.',
    'card.schools': '{n}% schools',
    'card.bridge': 'long weekend',
    'card.holiday': 'holiday',
    'card.noWeeks': 'No scored weeks in this horizon.',

    'type.public': 'public',
    'type.school': 'school',
    'type.bridge': 'bridge',

    'list.empty': 'No dates in this horizon for the selected markets.',
    'list.h.market': 'Market',
    'list.h.type': 'Type',
    'list.h.dates': 'Dates',
    'list.h.nights': 'Nights',
    'list.h.what': 'What',
    'list.h.share': 'Share off',
    'list.h.regions': 'Regions',
    'list.showing': 'Showing the first {shown} of {total} dates — the export contains all of them.',

    'mk.empty': 'Widen the radius to pick up markets.',
    'mk.h.market': 'Market',
    'mk.h.nearest': 'Nearest city',
    'mk.h.drive': 'Drive',
    'mk.h.flight': 'Flight',
    'mk.h.byCar': 'By car',
    'mk.h.byAir': 'By air',
    'mk.h.reach': 'Weighted reach',
    'mk.note':
      'Weighted reach discounts people by how hard it is for them to come: someone two hours away counts almost fully, someone eight hours away about a fifth, and someone who has to fly at most {pct}%. It ranks markets against each other — it is not a forecast of bookings.',
  },
};

let current = 'it';

export function getLang() {
  return current;
}

/** Tag di locale per date e numeri. */
export function locale() {
  return current === 'en' ? 'en-GB' : 'it-IT';
}

export function detectLang() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {
    /* storage bloccato: si decide dal browser */
  }
  // Italiano di default solo per chi ha il browser in italiano; gli altri in inglese.
  return (navigator.language || '').toLowerCase().startsWith('it') ? 'it' : 'en';
}

export function setLang(lang) {
  if (!LANGS.includes(lang)) return current;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* si ripartirà dalla lingua del browser */
  }
  document.documentElement.lang = lang;
  document.title = t('meta.title');
  return current;
}

/** `t('stats.drive', { h: '6h' })` */
export function t(key, vars) {
  let out = DICT[current][key] ?? DICT.it[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

/** Nome di un mercato o di una città nella lingua corrente. */
export const localName = (obj) =>
  current === 'en' ? obj?.nameEn || obj?.nEn || obj?.name || obj?.n || '' : obj?.name || obj?.n || '';

/**
 * Riscrive il testo fisso della pagina. Tocca solo nodi marcati, mai i genitori
 * che contengono controlli, così i gestori di eventi restano attaccati.
 */
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-ph]').forEach((node) => {
    node.placeholder = t(node.dataset.i18nPh);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  });
}
