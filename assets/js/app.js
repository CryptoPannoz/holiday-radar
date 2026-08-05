/**
 * Orchestrazione e interfaccia.
 *
 * Il flusso segue i numeri sullo schermo: (1) metti la casa sulla mappa,
 * (2) quanto lontano guidano, (3) quanto lontano volano, (4) che periodo,
 * (5) quali mercati → risultati. Ogni passo ridisegna solo ciò che dipende da lui,
 * e i due raggi si ridisegnano senza toccare la rete perché i tempi di guida
 * sono già stati misurati una volta sola.
 */

import { loadMeta, loadCities, loadAirports, loadMarket } from './data.js';
import { geocode, reverseGeocode, driveTimes, haversine, flightHours, driveReachShape } from './geo.js';
import {
  computeReach,
  buildEvents,
  buildWeeks,
  topWeeks,
  parseDate,
  fmtDate,
  FLY_WEIGHT,
} from './analysis.js';
import { toCSV, toICS, download, slug } from './export.js';
import * as auth from './auth.js';
import { CONTACT_URL, TOP_WEEKS, DEFAULT_HORIZON_MONTHS } from './config.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const state = {
  meta: null,
  cities: [],
  airports: [],
  property: null,
  driveHours: null,
  reach: null,
  nearAirports: [],
  markets: new Map(),
  selected: new Set(),
  manualSelection: false,
  maxDrive: 6,
  maxFly: 1500,
  from: null,
  to: null,
  events: [],
  weeks: [],
  view: 'list',
  routingEstimated: false,
  unlocked: false,
};

/* ---------- formattazione ---------- */

const fmtHours = (h) => {
  if (h === null || h === undefined || !isFinite(h)) return '—';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins === 60 ? `${whole + 1}h` : mins ? `${whole}h ${String(mins).padStart(2, '0')}m` : `${whole}h`;
};

/** La popolazione arriva in migliaia. */
const fmtPeople = (thousands) => {
  if (!thousands) return '0';
  if (thousands >= 1000) return `${(thousands / 1000).toFixed(thousands >= 10000 ? 0 : 1)}M`;
  return `${Math.round(thousands)}k`;
};

const fmtDay = (iso) =>
  parseDate(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDayYear = (iso) =>
  parseDate(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const monthValue = (date) => date.toISOString().slice(0, 7);
const monthStart = (value) => `${value}-01`;
const monthEnd = (value) => {
  const [y, m] = value.split('-').map(Number);
  return fmtDate(new Date(Date.UTC(y, m, 0)));
};
const addMonths = (value, n) => {
  const [y, m] = value.split('-').map(Number);
  return monthValue(new Date(Date.UTC(y, m - 1 + n, 1)));
};

const marketName = (code) => state.meta?.markets.find((m) => m.c === code)?.name || code;
const marketFlag = (code) => state.meta?.markets.find((m) => m.c === code)?.flag || '';

/* ---------- avvio ---------- */

async function init() {
  wireEvents();
  setupHorizonDefaults();

  try {
    [state.meta, state.cities, state.airports] = await Promise.all([loadMeta(), loadCities(), loadAirports()]);
    $('#data-stamp').textContent = `Dati aggiornati al ${state.meta.generatedAt}.`;
    clampHorizonToData();
  } catch (err) {
    showError(`Non riesco a caricare l'archivio delle vacanze. ${err.message}`);
    return;
  }

  initMap();
  initAuth();

  const restored = readStateFromURL() || readStateFromStorage();
  if (restored) await setProperty(restored, { silent: true });
}

function setupHorizonDefaults() {
  const today = new Date();
  const from = monthValue(today);
  $('#horizon-from').value = from;
  $('#horizon-to').value = addMonths(from, DEFAULT_HORIZON_MONTHS - 1);
  state.from = $('#horizon-from').value;
  state.to = $('#horizon-to').value;
}

/** L'orizzonte non può uscire dagli anni effettivamente scaricati. */
function clampHorizonToData() {
  const years = state.meta?.years || [];
  if (!years.length) return;
  const min = `${years[0]}-01`;
  const max = `${years[years.length - 1]}-12`;
  $('#horizon-from').min = min;
  $('#horizon-from').max = max;
  $('#horizon-to').min = min;
  $('#horizon-to').max = max;
  if (state.from < min) state.from = $('#horizon-from').value = min;
  if (state.to > max) state.to = $('#horizon-to').value = max;
  $('#horizon-note').textContent = `Dati disponibili fino a tutto il ${years[years.length - 1]}.`;
}

function wireEvents() {
  $('#search-form').addEventListener('submit', onSubmit);
  $('#address').addEventListener('input', onAddressInput);
  $('#address').addEventListener('keydown', onSuggestionKeys);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.field-grow')) hideSuggestions();
  });

  $('#use-example').addEventListener('click', () =>
    setProperty({ label: 'Villa Volpe', detail: 'Orta San Giulio, Piemonte', lat: 45.7975, lon: 8.4186 }),
  );
  $('#use-locate').addEventListener('click', onLocate);

  $('#drive-range').addEventListener('input', (e) => {
    state.maxDrive = Number(e.target.value);
    $('#drive-out').textContent = fmtHours(state.maxDrive);
    drawRadii();
    scheduleRadiusUpdate();
  });
  $('#fly-range').addEventListener('input', (e) => {
    state.maxFly = Number(e.target.value);
    $('#fly-out').textContent = state.maxFly ? `${state.maxFly.toLocaleString('it-IT')} km` : 'spento';
    $('#fly-note').textContent = state.maxFly
      ? `In linea d'aria — circa ${fmtHours(flightHours(state.maxFly))} porta a porta.`
      : 'Mercati aerei esclusi.';
    drawRadii();
    scheduleRadiusUpdate();
  });

  $('#horizon-from').addEventListener('change', onHorizonChange);
  $('#horizon-to').addEventListener('change', onHorizonChange);

  $('#markets-reset').addEventListener('click', () => {
    state.manualSelection = false;
    autoSelectMarkets();
    refreshTimeline();
  });
  $('#markets-all').addEventListener('click', () => {
    state.manualSelection = true;
    state.selected = new Set(state.meta.markets.map((m) => m.c));
    refreshTimeline();
  });
  $('#markets-none').addEventListener('click', () => {
    state.manualSelection = true;
    state.selected = new Set();
    refreshTimeline();
  });

  document.querySelectorAll('.tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      state.view = tab.dataset.view;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      ['list', 'markets'].forEach((v) => {
        $(`#view-${v}`).hidden = v !== state.view;
      });
    }),
  );

  $('#export-csv').addEventListener('click', () => exportAs('csv'));
  $('#export-ics').addEventListener('click', () => exportAs('ics'));
  $('#export-json').addEventListener('click', () => exportAs('json'));

  $('#signin-google').addEventListener('click', onGoogleSignIn);
  $('#email-form').addEventListener('submit', onEmailSignIn);
  $('#gate-skip').addEventListener('click', () => unlock({ signedIn: false }));
  $('#account-btn').addEventListener('click', onAccountButton);

  if (CONTACT_URL) $('#cta-link').href = CONTACT_URL;
}

/* ---------- autenticazione ---------- */

async function initAuth() {
  const configured = auth.isConfigured();
  if (!configured) {
    // Firebase non ancora collegato: il tool non deve risultare rotto per questo.
    $('#gate-fallback').hidden = false;
    $('#gate-lede').textContent =
      'L\'accesso non è ancora attivo su questa installazione: è tutto aperto, procedi pure.';
    $('#signin-google').disabled = true;
    $('#email-form').hidden = true;
    $('#account-btn').hidden = true;
    return;
  }
  auth.onUserChange((user) => {
    if (user) {
      unlock({ signedIn: true });
      $('#account-btn').textContent = user.email ? user.email.split('@')[0] : 'Accesso fatto';
      $('#account-btn').title = `Accesso come ${user.email || 'sconosciuto'} — clicca per uscire`;
    } else {
      state.unlocked = false;
      $('#account-btn').textContent = 'Accedi';
      $('#account-btn').title = '';
      applyGate();
    }
  });
  await auth.init();
}

async function onGoogleSignIn() {
  setGateStatus('Apro Google…');
  try {
    await auth.signInWithGoogle();
  } catch (err) {
    setGateStatus(friendlyAuthError(err), true);
  }
}

async function onEmailSignIn(e) {
  e.preventDefault();
  const email = $('#email-input').value.trim();
  if (!email) return;
  setGateStatus('Invio…');
  try {
    await auth.sendEmailLink(email);
    setGateStatus(`Link inviato a ${email}. Aprilo su questo dispositivo e sei dentro.`);
  } catch (err) {
    setGateStatus(friendlyAuthError(err), true);
  }
}

function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code.includes('unauthorized-domain')) return 'Questo dominio non è ancora autorizzato nel progetto Firebase.';
  if (code.includes('operation-not-allowed')) return 'Questo metodo di accesso non è abilitato nel progetto Firebase.';
  if (code.includes('invalid-email')) return 'Questo indirizzo email non sembra valido.';
  if (code.includes('network')) return 'Problema di rete — controlla la connessione e riprova.';
  return err?.message || 'Accesso non riuscito.';
}

function setGateStatus(message, isError = false) {
  const box = $('#gate-status');
  box.hidden = !message;
  box.textContent = message || '';
  box.classList.toggle('is-error', isError);
}

async function onAccountButton() {
  if (!auth.currentUser()) {
    $('#results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  await auth.signOut();
  setGateStatus(null);
}

function unlock({ signedIn }) {
  state.unlocked = true;
  applyGate();
  if (signedIn) {
    setGateStatus(null);
    recordCurrentSearch();
  }
}

function applyGate() {
  const section = $('#results-section');
  section.classList.toggle('is-locked', !state.unlocked);
  $('#gate').hidden = state.unlocked;
  $('#cta').hidden = !state.unlocked || !CONTACT_URL;
  // Sotto il velo la tabulazione non deve poter entrare.
  section.querySelectorAll('button, input, a').forEach((node) => {
    if (node.closest('.gate')) return;
    node.tabIndex = state.unlocked ? 0 : -1;
  });
}

let recordTimer = null;
function recordCurrentSearch() {
  if (!auth.currentUser() || !state.property) return;
  clearTimeout(recordTimer);
  // Una riga per ricerca, non una per movimento di cursore.
  recordTimer = setTimeout(() => {
    auth.recordSearch({
      property: { label: state.property.label, lat: state.property.lat, lon: state.property.lon },
      driveHours: state.maxDrive,
      flightKm: state.maxFly,
      horizon: { from: state.from, to: state.to },
      markets: [...state.selected],
      topMarket: [...state.reach.byCountry.values()].sort((a, b) => b.reach - a.reach)[0]?.c || null,
    });
  }, 4000);
}

/* ---------- mappa ---------- */

let map = null;
let layers = { drive: null, fly: null, home: null, cities: null };

function initMap() {
  if (typeof L === 'undefined') return;
  map = L.map('map', { scrollWheelZoom: false, zoomControl: false }).setView([48.5, 9.5], 5);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  layers.cities = L.layerGroup().addTo(map);

  map.on('click', async (e) => {
    const { lat, lng: lon } = e.latlng;
    const place = (await reverseGeocode(lat, lon)) || {
      label: `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
      detail: 'punto sulla mappa',
      lat,
      lon,
    };
    setProperty(place);
  });
}

/**
 * Disegna i due raggi. Il volo è un cerchio perché la distanza in linea d'aria
 * lo è davvero; la guida no, e disegnarla come tale sarebbe la bugia che questo
 * strumento esiste per evitare.
 */
function drawRadii() {
  if (!map || !state.property) return;
  const origin = state.property;

  if (layers.fly) layers.fly.remove();
  layers.fly = null;
  if (state.maxFly > 0) {
    layers.fly = L.circle([origin.lat, origin.lon], {
      radius: state.maxFly * 1000,
      color: getCSS('--fly'),
      weight: 1.5,
      dashArray: '6 5',
      fillColor: getCSS('--fly'),
      fillOpacity: 0.07,
      interactive: false,
    }).addTo(map);
  }

  if (layers.drive) layers.drive.remove();
  layers.drive = null;
  const shape = driveReachShape(origin, state.cities, state.driveHours, state.maxDrive);
  if (shape) {
    layers.drive = L.polygon(shape, {
      color: getCSS('--accent'),
      weight: 2,
      fillColor: getCSS('--accent'),
      fillOpacity: 0.16,
      interactive: false,
      smoothFactor: 1,
    }).addTo(map);
  }

  if (layers.home) layers.home.remove();
  layers.home = L.circleMarker([origin.lat, origin.lon], {
    radius: 8,
    color: '#fff',
    weight: 2,
    fillColor: '#dc2626',
    fillOpacity: 1,
  })
    .bindTooltip(origin.label, { direction: 'top' })
    .addTo(map);
}

function getCSS(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#0f766e';
}

function drawCities() {
  if (!map || !layers.cities) return;
  layers.cities.clearLayers();
  for (const city of state.reach.cities) {
    if (city.access === 'out' || !state.selected.has(city.c)) continue;
    const drive = city.access === 'drive';
    layers.cities.addLayer(
      L.circleMarker([city.lat, city.lon], {
        radius: Math.max(3.5, Math.min(13, Math.sqrt(city.p) / 9)),
        color: drive ? getCSS('--accent') : getCSS('--fly'),
        fillColor: drive ? getCSS('--accent') : getCSS('--fly'),
        fillOpacity: 0.5,
        weight: 1,
      }).bindTooltip(
        `<b>${city.n}</b><br>${
          drive
            ? `${fmtHours(city.driveH)} drive`
            : `${Math.round(city.crowKm)} km flight · ~${fmtHours(city.flightH)} door to door`
        }<br>${fmtPeople(city.p)} people`,
      ),
    );
  }
}

function fitMap() {
  if (!map) return;
  const bounds = layers.drive?.getBounds?.();
  const flyBounds = layers.fly?.getBounds?.();
  let target = bounds;
  if (flyBounds) target = target ? target.extend(flyBounds) : flyBounds;
  if (target?.isValid?.()) map.fitBounds(target.pad(0.06));
  setTimeout(() => map.invalidateSize(), 60);
}

/* ---------- ricerca indirizzo ---------- */

let suggestTimer = null;
let suggestController = null;
let suggestions = [];
let activeSuggestion = -1;

function onAddressInput(e) {
  const query = e.target.value.trim();
  clearTimeout(suggestTimer);
  if (query.length < 3) return hideSuggestions();
  // Il geocoder è un servizio gratuito altrui: si interroga quando l'utente si ferma.
  suggestTimer = setTimeout(() => fetchSuggestions(query), 320);
}

async function fetchSuggestions(query) {
  suggestController?.abort();
  suggestController = new AbortController();
  try {
    suggestions = await geocode(query, { signal: suggestController.signal });
    renderSuggestions();
  } catch (err) {
    if (err.name !== 'AbortError') hideSuggestions();
  }
}

function renderSuggestions() {
  const list = $('#suggestions');
  list.textContent = '';
  if (!suggestions.length) return hideSuggestions();
  activeSuggestion = -1;
  suggestions.forEach((s) => {
    const li = el('li');
    li.textContent = s.label;
    li.appendChild(el('small', null, s.detail));
    li.addEventListener('click', () => {
      hideSuggestions();
      setProperty(s);
    });
    list.appendChild(li);
  });
  list.hidden = false;
}

function hideSuggestions() {
  $('#suggestions').hidden = true;
  activeSuggestion = -1;
}

function onSuggestionKeys(e) {
  const list = $('#suggestions');
  if (list.hidden || !suggestions.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    activeSuggestion = (activeSuggestion + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === activeSuggestion)));
  } else if (e.key === 'Enter' && activeSuggestion >= 0) {
    e.preventDefault();
    hideSuggestions();
    setProperty(suggestions[activeSuggestion]);
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
}

async function onSubmit(e) {
  e.preventDefault();
  hideSuggestions();
  const query = $('#address').value.trim();
  if (!query) return;
  setBusy(true, 'Cerco…');
  try {
    const results = await geocode(query, { limit: 1 });
    if (!results.length) throw new Error('Nessun luogo corrisponde a questo indirizzo. Prova ad aggiungere il comune o la nazione.');
    await setProperty(results[0]);
  } catch (err) {
    showError(err.message);
    setBusy(false);
  }
}

function onLocate() {
  if (!navigator.geolocation) return showError('Questo browser non può condividere la posizione.');
  setBusy(true, 'Localizzo…');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const place = (await reverseGeocode(lat, lon)) || { label: 'La mia posizione', detail: '', lat, lon };
      await setProperty(place);
    },
    () => {
      showError('Permesso di geolocalizzazione negato.');
      setBusy(false);
    },
    { timeout: 10000 },
  );
}

/* ---------- stato principale ---------- */

async function setProperty(place, { silent = false } = {}) {
  state.property = place;
  showError(null);
  setBusy(true, 'Misuro…');

  try {
    state.driveHours = await driveTimes(place, state.cities);
    state.routingEstimated = false;
  } catch {
    // Il router pubblico può essere momentaneamente giù: si continua con una stima dichiarata.
    state.driveHours = null;
    state.routingEstimated = true;
  }

  computeAirports();
  recomputeReach();
  if (!state.manualSelection) autoSelectMarkets();

  $('#map-search').classList.add('is-compact');
  $('#stepbar').hidden = false;
  $('#markets-bar').hidden = false;
  $('#results-section').hidden = false;
  $('#map-key').hidden = false;
  renderPropertyBadge();
  drawRadii();
  fitMap();

  await refreshTimeline();
  setBusy(false);
  persistState();
  if (!silent) $('#stepbar').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderPropertyBadge() {
  const badge = $('#map-badge');
  badge.hidden = false;
  badge.textContent = '';
  badge.appendChild(el('b', null, state.property.label));
  badge.appendChild(el('span', null, state.property.detail || `${state.property.lat.toFixed(3)}, ${state.property.lon.toFixed(3)}`));
  if (state.nearAirports[0]) {
    badge.appendChild(
      el('span', null, `Aeroporto più vicino: ${state.nearAirports[0].i} · ${Math.round(state.nearAirports[0].crowKm)} km`),
    );
  }
  if (state.routingEstimated) {
    badge.appendChild(el('span', 'muted', 'Servizio percorsi non raggiungibile — tempi di guida stimati.'));
  }
}

function computeAirports() {
  state.nearAirports = state.airports
    .map((a) => ({ ...a, crowKm: haversine(state.property, a) }))
    .sort((a, b) => a.crowKm - b.crowKm)
    .slice(0, 5);
}

function recomputeReach() {
  state.reach = computeReach({
    origin: state.property,
    cities: state.cities,
    driveHours: state.driveHours,
    maxDriveHours: state.maxDrive,
    maxFlightKm: state.maxFly,
  });
}

function autoSelectMarkets() {
  state.selected = new Set(
    [...state.reach.byCountry.values()].filter((m) => m.access !== 'out').map((m) => m.c),
  );
}

let radiusTimer = null;
function scheduleRadiusUpdate() {
  clearTimeout(radiusTimer);
  radiusTimer = setTimeout(async () => {
    recomputeReach();
    if (!state.manualSelection) autoSelectMarkets();
    await refreshTimeline();
    persistState();
  }, 200);
}

function onHorizonChange() {
  const from = $('#horizon-from').value;
  const to = $('#horizon-to').value;
  if (!from || !to) return;
  if (to < from) $('#horizon-to').value = from;
  state.from = $('#horizon-from').value;
  state.to = $('#horizon-to').value;
  clampHorizonToData();
  refreshTimeline();
  persistState();
}

async function refreshTimeline() {
  const codes = [...state.selected];
  const missing = codes.filter((c) => !state.markets.has(c));
  const loaded = await Promise.allSettled(missing.map(loadMarket));
  loaded.forEach((r) => {
    if (r.status === 'fulfilled') state.markets.set(r.value.country, r.value);
  });

  const from = monthStart(state.from);
  const to = monthEnd(state.to);

  state.events = codes
    .map((c) => state.markets.get(c))
    .filter(Boolean)
    .flatMap((market) => buildEvents(market, from, to));

  state.weeks = buildWeeks({
    events: state.events,
    from,
    to,
    reachByCountry: state.reach.byCountry,
    countries: codes,
  });

  render();
  recordCurrentSearch();
}

/* ---------- rendering ---------- */

function render() {
  renderMarketChips();
  renderSummary();
  drawCities();
  renderTimeline();
  renderWeekCards();
  renderList();
  renderMarkets();
  applyGate();
}

function renderMarketChips() {
  const box = $('#market-chips');
  box.textContent = '';
  const rows = [...state.reach.byCountry.values()]
    .filter((m) => state.meta.markets.some((x) => x.c === m.c))
    .sort((a, b) => b.reach - a.reach || marketName(a.c).localeCompare(marketName(b.c)));

  for (const m of rows) {
    const on = state.selected.has(m.c);
    const chip = el('label', `chip${on ? ' is-on' : ''}${m.access === 'out' ? ' is-far' : ''}`);
    const input = el('input');
    input.type = 'checkbox';
    input.checked = on;
    input.addEventListener('change', () => {
      state.manualSelection = true;
      if (input.checked) state.selected.add(m.c);
      else state.selected.delete(m.c);
      refreshTimeline();
      persistState();
    });
    chip.appendChild(input);
    chip.append(`${marketFlag(m.c)} ${marketName(m.c)}`);
    chip.appendChild(
      el(
        'span',
        'chip-reach',
        m.access === 'drive' ? fmtHours(m.bestDriveH) : m.access === 'fly' ? `${Math.round(m.bestCrowKm)}km` : '·',
      ),
    );
    box.appendChild(chip);
  }
}

function renderSummary() {
  const box = $('#summary');
  box.textContent = '';

  const selected = [...state.selected].map((c) => state.reach.byCountry.get(c)).filter(Boolean);
  const drivePop = selected.reduce((sum, m) => sum + m.popDrive, 0);
  const flyPop = selected.reduce((sum, m) => sum + m.popFly, 0);
  const best = topWeeks(state.weeks, 1)[0];
  const schoolWeeks = state.weeks.filter((w) => [...w.byCountry.values()].some((c) => c.schoolCoverage > 0)).length;

  const stats = [
    [String(state.selected.size), 'mercati scelti'],
    [fmtPeople(drivePop), `persone entro ${fmtHours(state.maxDrive)} di auto`],
    [fmtPeople(flyPop), `in più entro ${state.maxFly.toLocaleString('it-IT')} km di volo`],
    [String(state.events.length), 'date nel periodo'],
    [String(schoolWeeks), 'settimane con vacanze scolastiche'],
    [best ? fmtDay(best.start) : '—', best ? `settimana migliore · punteggio ${best.scorePct}` : 'nessuna settimana con punteggio'],
  ];

  for (const [value, label] of stats) {
    const stat = el('div', 'stat');
    stat.appendChild(el('b', null, value));
    stat.appendChild(el('span', null, label));
    box.appendChild(stat);
  }
}

/* -- timeline -- */

function horizonScale() {
  const start = parseDate(monthStart(state.from));
  const end = parseDate(monthEnd(state.to));
  const totalDays = Math.max(1, (end - start) / 86400000 + 1);
  const pct = (iso) => ((parseDate(iso) - start) / 86400000 / totalDays) * 100;
  return { start, end, totalDays, pct };
}

function monthSpans() {
  const spans = [];
  let cursor = state.from;
  while (cursor <= state.to) {
    spans.push({
      value: cursor,
      label: parseDate(monthStart(cursor)).toLocaleDateString('it-IT', { month: 'short', timeZone: 'UTC' }),
      year: cursor.slice(2, 4),
      start: monthStart(cursor),
      end: monthEnd(cursor),
    });
    cursor = addMonths(cursor, 1);
  }
  return spans;
}

function renderTimeline() {
  const wrap = $('#timeline');
  wrap.textContent = '';

  if (!state.selected.size) {
    wrap.appendChild(el('p', 'view-empty', 'Scegli almeno un mercato per vedere il calendario.'));
    return;
  }

  const { pct, totalDays } = horizonScale();
  const months = monthSpans();
  const board = el('div', 'timeline');

  // riga dei mesi
  const monthRow = el('div', 'tl-months');
  for (const m of months) {
    const cell = el('div', 'tl-month', m.label === 'Jan' ? `${m.label} ${m.year}` : m.label);
    const width = ((parseDate(m.end) - parseDate(m.start)) / 86400000 + 1) / totalDays;
    cell.style.flex = `0 0 ${width * 100}%`;
    monthRow.appendChild(cell);
  }
  board.appendChild(monthRow);

  // istogramma della domanda, allineato alla stessa scala di date
  const demand = el('div', 'tl-demand');
  demand.style.position = 'relative';
  const best = new Set(topWeeks(state.weeks, TOP_WEEKS).map((w) => w.start));
  for (const week of state.weeks) {
    const bar = el('div', `tl-demand-bar${best.has(week.start) ? ' is-top' : ''}`);
    bar.style.position = 'absolute';
    bar.style.left = `${pct(week.start)}%`;
    bar.style.width = `${(7 / totalDays) * 100}%`;
    bar.style.bottom = '0';
    bar.style.height = `${Math.max(2, week.scorePct)}%`;
    bar.title = `Settimana del ${fmtDayYear(week.start)} — punteggio domanda ${week.scorePct}/100`;
    demand.appendChild(bar);
  }
  board.appendChild(demand);
  board.appendChild(el('div', 'tl-demand-label', 'Punteggio settimanale della domanda — quanta parte del tuo mercato raggiungibile è ferma'));

  // una corsia per mercato, ordinata per peso
  const codes = [...state.selected].sort(
    (a, b) => (state.reach.byCountry.get(b)?.reach || 0) - (state.reach.byCountry.get(a)?.reach || 0),
  );
  const byCountry = new Map(codes.map((c) => [c, []]));
  for (const ev of state.events) byCountry.get(ev.c)?.push(ev);

  for (const code of codes) {
    const row = el('div', 'tl-row');
    const label = el('div', 'tl-label');
    label.append(`${marketFlag(code)} ${marketName(code)} `);
    const reach = state.reach.byCountry.get(code);
    label.appendChild(el('span', 'tl-reach', reach ? fmtPeople(reach.reach) : ''));
    label.title = `${marketName(code)} — bacino ponderato ${reach ? fmtPeople(reach.reach) : '0'}`;

    // Una riga senza barre viola non significa "qui non vanno in vacanza": spesso
    // significa che la fonte non ha ancora pubblicato quel calendario scolastico.
    // Senza dirlo, l'assenza di dato si legge come assenza di domanda.
    const gap = schoolGapFor(code);
    if (gap) {
      const mark = el('span', 'tl-nodata', '?');
      mark.title = gap;
      label.appendChild(mark);
    }
    row.appendChild(label);

    const track = el('div', 'tl-track');
    const grid = el('div', 'tl-grid');
    for (const m of months.slice(1)) {
      const line = el('i');
      line.style.left = `${pct(m.start)}%`;
      grid.appendChild(line);
    }
    track.appendChild(grid);

    const events = byCountry.get(code) || [];
    // ordine di disegno: le scuole fanno da fondo, i ponti sopra, le feste in cima
    const order = { school: 0, bridge: 1, public: 2 };
    for (const ev of [...events].sort((a, b) => order[a.type] - order[b.type])) {
      const bar = el('div', `tl-bar tl-${ev.type}`);
      const left = Math.max(0, pct(ev.start));
      bar.style.left = `${left}%`;
      if (ev.type !== 'public') {
        const right = Math.min(100, pct(ev.end) + (1 / totalDays) * 100);
        bar.style.width = `${Math.max(0.25, right - left)}%`;
      }
      if (ev.type === 'school' && ev.coverage < 1) {
        bar.style.opacity = String(0.3 + ev.coverage * 0.55);
        bar.style.height = `${0.5 + ev.coverage * 0.55}rem`;
      }
      bar.title = tooltipFor(ev);
      track.appendChild(bar);
    }

    row.appendChild(track);
    board.appendChild(row);
  }

  const key = el('div', 'tl-key');
  for (const [cls, text] of [
    ['k-public', 'festività'],
    ['k-school', 'vacanza scolastica (più sottile = meno regioni)'],
    ['k-bridge', 'ponte'],
    ['k-demand', 'punteggio settimanale'],
  ]) {
    const span = el('span');
    span.appendChild(el('i', `key-swatch ${cls}`));
    span.append(text);
    key.appendChild(span);
  }
  board.appendChild(key);

  wrap.appendChild(board);
}

/**
 * Perché un mercato non ha vacanze scolastiche a schermo. Restituisce null
 * quando i dati ci sono davvero, così il segnalino compare solo dove serve.
 */
function schoolGapFor(code) {
  const market = state.markets.get(code);
  if (!market) return null;
  if (state.events.some((ev) => ev.c === code && ev.type === 'school')) return null;
  if (!market.school.length) {
    return `Per ${marketName(code)} non esistono dati sulle vacanze scolastiche: solo festività nazionali.`;
  }
  return `Le date scolastiche di ${marketName(code)} non sono ancora pubblicate così avanti. Le festività invece sono complete.`;
}

function tooltipFor(ev) {
  const when = ev.start === ev.end ? fmtDayYear(ev.start) : `${fmtDayYear(ev.start)} → ${fmtDayYear(ev.end)}`;
  const who = ev.regions.length
    ? `${ev.regions.length} region${ev.regions.length > 1 ? 'i' : 'e'}: ${ev.regions.slice(0, 8).join(', ')}${ev.regions.length > 8 ? '…' : ''}`
    : 'tutto il paese';
  return `${marketName(ev.c)} · ${ev.type}\n${ev.name}\n${when}\n${who}`;
}

/* -- schede settimane migliori -- */

function renderWeekCards() {
  const box = $('#week-cards');
  box.textContent = '';
  const best = topWeeks(state.weeks, TOP_WEEKS);

  if (!best.length) {
    box.appendChild(el('p', 'view-empty', 'Nessuna settimana con punteggio in questo periodo.'));
    return;
  }

  for (const week of best) {
    const card = el('div', 'week-card');
    const score = el('span', 'wk-score', `${week.scorePct}`);
    card.appendChild(score);
    card.appendChild(el('h4', null, `${fmtDay(week.start)} – ${fmtDayYear(week.end)}`));

    const off = [...week.byCountry.entries()]
      .filter(([, cell]) => cell.intensity > 0)
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 5);

    const who = el('p', 'wk-who');
    if (off.length) {
      who.append('Fermi: ');
      off.forEach(([code, cell], i) => {
        const label = cell.schoolCoverage > 0 ? `${Math.round(cell.schoolCoverage * 100)}% scuole` : cell.bridge ? 'ponte' : 'festività';
        const strong = el('b', null, `${marketFlag(code)} ${marketName(code)}`);
        who.appendChild(strong);
        who.append(` (${label})${i < off.length - 1 ? ', ' : ''}`);
      });
    } else {
      who.append('Niente in programma.');
    }
    card.appendChild(who);

    card.appendChild(el('p', 'wk-note', weekAdvice(week, off)));
    box.appendChild(card);
  }
}

/**
 * Cosa farsene della settimana. Serve a distinguere i casi, non a riempire lo
 * spazio: dire "diversi mercati si sovrappongono" su ogni scheda non aiuta
 * nessuno. Conta chi porta il valore, non quanti sono in vacanza.
 */
function weekAdvice(week, off) {
  if (!off.length) return 'Niente in programma: settimana da riempire con qualcosa che non siano le vacanze.';

  const total = off.reduce((sum, [, cell]) => sum + cell.value, 0) || 1;
  const [topCode, topCell] = off[0];
  const share = topCell.value / total;
  const strong = off.filter(([, cell]) => cell.intensity >= 0.5).length;

  if (share >= 0.5) {
    return `Questa settimana la traina da solo un mercato: ${marketName(topCode)}. Vale una campagna mirata.`;
  }
  if (strong >= 4) {
    return `${strong} mercati sono fermi insieme: qui tieni la tariffa invece di scontare.`;
  }
  if (strong >= 2) {
    return `${strong} mercati si sovrappongono: buona settimana per imporre un soggiorno minimo.`;
  }
  return 'Solo vacanze parziali: assomiglia a una settimana normale più di quanto sembri.';
}

/* -- elenco date -- */

const MAX_LIST_ROWS = 500;

/** Le etichette dei tipi di evento mostrate all'utente. */
const TYPE_LABEL = { public: 'festività', school: 'scuole', bridge: 'ponte' };

function renderList() {
  const view = $('#view-list');
  view.textContent = '';
  if (!state.events.length) {
    view.appendChild(el('p', 'view-empty', 'Nessuna data in questo periodo per i mercati scelti.'));
    return;
  }

  const table = el('table', 'data');
  const thead = el('thead');
  const hr = el('tr');
  ['Mercato', 'Tipo', 'Date', 'Notti', 'Cosa', 'Quota ferma', 'Regioni'].forEach((h) => hr.appendChild(el('th', null, h)));
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  const rows = [...state.events].sort((a, b) => a.start.localeCompare(b.start));
  for (const ev of rows.slice(0, MAX_LIST_ROWS)) {
    const tr = el('tr');
    tr.appendChild(el('td', null, `${marketFlag(ev.c)} ${marketName(ev.c)}`));
    const typeCell = el('td');
    typeCell.appendChild(el('span', `tag tag-${ev.type}`, TYPE_LABEL[ev.type] || ev.type));
    tr.appendChild(typeCell);
    tr.appendChild(el('td', 'nowrap', ev.start === ev.end ? fmtDay(ev.start) : `${fmtDay(ev.start)} → ${fmtDay(ev.end)}`));
    tr.appendChild(el('td', 'num', ev.nights ? String(ev.nights) : '—'));
    tr.appendChild(el('td', null, ev.name));
    tr.appendChild(el('td', 'num', `${Math.round(ev.coverage * 100)}%`));
    tr.appendChild(el('td', 'regions', ev.regions.length ? ev.regions.join(', ') : 'tutto il paese'));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  view.appendChild(table);

  if (rows.length > MAX_LIST_ROWS) {
    view.appendChild(
      el('p', 'note', `Mostro le prime ${MAX_LIST_ROWS} date su ${rows.length} — l'esportazione le contiene tutte.`),
    );
  }
}

/* -- dettaglio mercati -- */

function renderMarkets() {
  const view = $('#view-markets');
  view.textContent = '';

  const rows = [...state.reach.byCountry.values()]
    .filter((m) => m.access !== 'out' || state.selected.has(m.c))
    .sort((a, b) => b.reach - a.reach);
  if (!rows.length) {
    view.appendChild(el('p', 'view-empty', 'Allarga il raggio per intercettare dei mercati.'));
    return;
  }
  const maxReach = rows[0].reach || 1;

  const table = el('table', 'data');
  const thead = el('thead');
  const hr = el('tr');
  ['Mercato', 'Città più vicina', 'Auto', 'Aereo', 'In auto', 'In aereo', 'Bacino ponderato'].forEach((h) =>
    hr.appendChild(el('th', null, h)),
  );
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const m of rows) {
    const tr = el('tr');
    tr.appendChild(el('td', null, `${marketFlag(m.c)} ${marketName(m.c)}`));
    tr.appendChild(el('td', null, m.nearest ? m.nearest.n : '—'));
    tr.appendChild(el('td', 'num', fmtHours(m.bestDriveH)));
    tr.appendChild(
      el('td', 'num', isFinite(m.bestCrowKm) ? `${Math.round(m.bestCrowKm)} km · ${fmtHours(flightHours(m.bestCrowKm))}` : '—'),
    );
    tr.appendChild(el('td', 'num', fmtPeople(m.popDrive)));
    tr.appendChild(el('td', 'num', fmtPeople(m.popFly)));

    const reachCell = el('td');
    const bar = el('div', 'bar');
    const fill = el('i');
    fill.style.width = `${Math.round((m.reach / maxReach) * 100)}%`;
    bar.appendChild(fill);
    reachCell.appendChild(bar);
    reachCell.appendChild(el('span', 'muted', fmtPeople(m.reach)));
    tr.appendChild(reachCell);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  view.appendChild(table);
  view.appendChild(
    el(
      'p',
      'note',
      'Il bacino ponderato sconta le persone in base a quanto è faticoso raggiungerti: chi sta a due ore conta quasi per intero, ' +
        `chi sta a otto ore conta circa un quinto, e chi deve volare conta al massimo il ${Math.round(FLY_WEIGHT * 100)}%. ` +
        'Serve a ordinare i mercati fra loro, non è una previsione di prenotazioni.',
    ),
  );
}

/* ---------- esportazioni ---------- */

function buildRows() {
  return [...state.events]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((ev) => {
      const reach = state.reach.byCountry.get(ev.c);
      return {
        market: ev.c,
        market_name: marketName(ev.c),
        type: ev.type,
        start: ev.start,
        end: ev.end,
        nights: ev.nights,
        name: ev.name,
        coverage_pct: Math.round(ev.coverage * 100),
        regions: ev.regions.join('; '),
        access: reach?.access || '',
        drive_hours: reach?.bestDriveH != null ? reach.bestDriveH.toFixed(1) : '',
        flight_km: reach && isFinite(reach.bestCrowKm) ? Math.round(reach.bestCrowKm) : '',
        reachable_people: reach ? Math.round(reach.reach * 1000) : '',
      };
    });
}

function exportAs(format) {
  if (!state.unlocked) return;
  const rows = buildRows();
  if (!rows.length) return showError('Non c\'è ancora niente da esportare.');
  const name = `holiday-radar-${slug(state.property.label)}-${state.from}-to-${state.to}`;

  if (format === 'csv') download(`${name}.csv`, toCSV(rows), 'text/csv');
  else if (format === 'ics') download(`${name}.ics`, toICS(rows, { propertyLabel: state.property.label }), 'text/calendar');
  else
    download(
      `${name}.json`,
      JSON.stringify(
        {
          property: state.property,
          radius: { driveHours: state.maxDrive, flightKm: state.maxFly, flyWeight: FLY_WEIGHT },
          horizon: { from: state.from, to: state.to },
          markets: [...state.selected].map((c) => ({ code: c, ...state.reach.byCountry.get(c) })),
          weeks: state.weeks.map((w) => ({ start: w.start, week: w.week, score: w.scorePct })),
          dates: rows,
          sources: state.meta.sources,
          generatedAt: state.meta.generatedAt,
        },
        null,
        2,
      ),
      'application/json',
    );
}

/* ---------- persistenza ---------- */

function persistState() {
  if (!state.property) return;
  const payload = {
    label: state.property.label,
    detail: state.property.detail,
    lat: state.property.lat,
    lon: state.property.lon,
    drive: state.maxDrive,
    fly: state.maxFly,
    from: state.from,
    to: state.to,
  };
  try {
    localStorage.setItem('holiday-radar.property', JSON.stringify(payload));
  } catch {
    /* niente storage: si perde solo la comodità di ritrovare la casa al rientro */
  }
  const params = new URLSearchParams({
    lat: state.property.lat.toFixed(5),
    lon: state.property.lon.toFixed(5),
    label: state.property.label,
    drive: String(state.maxDrive),
    fly: String(state.maxFly),
    from: state.from,
    to: state.to,
  });
  history.replaceState(null, '', `?${params}${location.hash}`);
}

function applySaved(saved) {
  if (Number.isFinite(saved.drive)) {
    state.maxDrive = saved.drive;
    $('#drive-range').value = String(saved.drive);
    $('#drive-out').textContent = fmtHours(saved.drive);
  }
  if (Number.isFinite(saved.fly)) {
    state.maxFly = saved.fly;
    $('#fly-range').value = String(saved.fly);
    $('#fly-out').textContent = saved.fly ? `${saved.fly.toLocaleString('it-IT')} km` : 'spento';
  }
  if (saved.from) {
    state.from = saved.from;
    $('#horizon-from').value = saved.from;
  }
  if (saved.to) {
    state.to = saved.to;
    $('#horizon-to').value = saved.to;
  }
  clampHorizonToData();
}

function readStateFromURL() {
  const params = new URLSearchParams(location.search);
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) return null;
  const saved = {
    label: params.get('label') || 'Casa salvata',
    detail: '',
    lat,
    lon,
    drive: Number(params.get('drive')) || undefined,
    fly: params.get('fly') !== null ? Number(params.get('fly')) : undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
  };
  applySaved(saved);
  $('#address').value = saved.label;
  return saved;
}

function readStateFromStorage() {
  let raw = null;
  try {
    raw = localStorage.getItem('holiday-radar.property');
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (!Number.isFinite(saved.lat) || !Number.isFinite(saved.lon)) return null;
    applySaved(saved);
    $('#address').value = saved.label || '';
    return saved;
  } catch {
    return null;
  }
}

/* ---------- stato interfaccia ---------- */

function setBusy(busy, message) {
  const btn = $('#search-btn');
  btn.disabled = busy;
  btn.textContent = busy ? message || 'Attendo…' : 'Vai';
  if (busy) {
    btn.prepend(el('i', 'spinner'));
    showError(null);
  }
}

function showError(message) {
  const box = $('#search-error');
  box.hidden = !message;
  box.textContent = message || '';
}

init();
