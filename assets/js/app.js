/**
 * Orchestrazione e interfaccia.
 *
 * Il flusso è: indirizzo → chi ti raggiunge → quali mercati → quando sono liberi
 * → cosa esportare. Ogni passaggio ridisegna solo ciò che dipende da lui.
 */

import { loadMeta, loadCities, loadAirports, loadMarket } from './data.js';
import { geocode, reverseGeocode, driveTimes, haversine, flightHours } from './geo.js';
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
import * as pro from './pro.js';
import { CHECKOUT_URL, WAITLIST_URL, FREE_LIMITS } from './config.js';

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
  view: 'calendar',
  routingEstimated: false,
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
  parseDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const monthValue = (date) => date.toISOString().slice(0, 7);
const monthStart = (value) => `${value}-01`;
const monthEnd = (value) => {
  const [y, m] = value.split('-').map(Number);
  return fmtDate(new Date(Date.UTC(y, m, 0)));
};
const monthsBetween = (from, to) => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
};

const marketName = (code) => state.meta?.markets.find((m) => m.c === code)?.name || code;
const marketFlag = (code) => state.meta?.markets.find((m) => m.c === code)?.flag || '';

/* ---------- avvio ---------- */

async function init() {
  wireEvents();

  const today = new Date();
  $('#horizon-from').value = monthValue(today);
  $('#horizon-to').value = monthValue(new Date(Date.UTC(today.getUTCFullYear() + 1, today.getUTCMonth(), 1)));
  state.from = $('#horizon-from').value;
  state.to = $('#horizon-to').value;

  await pro.restore();
  reflectPro();

  try {
    [state.meta, state.cities, state.airports] = await Promise.all([loadMeta(), loadCities(), loadAirports()]);
    $('#data-stamp').textContent = `Holiday data refreshed ${state.meta.generatedAt}.`;
  } catch (err) {
    showError(`Could not load the holiday database. ${err.message}`);
    return;
  }

  const restored = readStateFromURL() || readStateFromStorage();
  if (restored) await setProperty(restored, { silent: true });
}

function wireEvents() {
  $('#search-form').addEventListener('submit', onSubmit);
  $('#address').addEventListener('input', onAddressInput);
  $('#address').addEventListener('keydown', onSuggestionKeys);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.field-grow')) hideSuggestions();
  });

  $('#use-example').addEventListener('click', () =>
    setProperty({ label: 'Villa Volpe', detail: 'Orta San Giulio, Piedmont, Italy', lat: 45.7975, lon: 8.4186, country: 'it' }),
  );
  $('#use-locate').addEventListener('click', onLocate);

  $('#drive-range').addEventListener('input', (e) => {
    state.maxDrive = Number(e.target.value);
    $('#drive-out').textContent = fmtHours(state.maxDrive);
    scheduleRadiusUpdate();
  });
  $('#fly-range').addEventListener('input', (e) => {
    state.maxFly = Number(e.target.value);
    $('#fly-out').innerHTML = state.maxFly
      ? `${state.maxFly.toLocaleString('en-GB')}&nbsp;km`
      : 'off';
    scheduleRadiusUpdate();
  });

  $('#horizon-from').addEventListener('change', onHorizonChange);
  $('#horizon-to').addEventListener('change', onHorizonChange);
  $('#markets-reset').addEventListener('click', () => {
    state.manualSelection = false;
    autoSelectMarkets();
    refreshTimeline();
  });

  document.querySelectorAll('.tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      state.view = tab.dataset.view;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      ['calendar', 'list', 'markets'].forEach((v) => {
        $(`#view-${v}`).hidden = v !== state.view;
      });
    }),
  );

  $('#export-csv').addEventListener('click', () => exportAs('csv'));
  $('#export-ics').addEventListener('click', () => exportAs('ics'));
  $('#export-json').addEventListener('click', () => exportAs('json'));

  $('#pro-unlock').addEventListener('click', onUnlock);
  $('#pro-cta').addEventListener('click', (e) => {
    if (!CHECKOUT_URL) {
      e.preventDefault();
      window.open(WAITLIST_URL, '_blank', 'noopener');
    }
  });
  if (CHECKOUT_URL) $('#pro-cta').href = CHECKOUT_URL;

  pro.onProChange(() => {
    reflectPro();
    if (state.property) {
      clampHorizonToPlan();
      autoSelectMarkets({ keepManual: true });
      refreshTimeline();
    }
  });
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
  suggestions.forEach((s, i) => {
    const li = el('li');
    li.textContent = s.label;
    li.appendChild(el('small', null, s.detail));
    li.addEventListener('click', () => {
      hideSuggestions();
      setProperty(s);
    });
    li.dataset.index = String(i);
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
    activeSuggestion =
      (activeSuggestion + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length;
    [...list.children].forEach((li, i) =>
      li.setAttribute('aria-selected', String(i === activeSuggestion)),
    );
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
  setBusy(true, 'Finding your property…');
  try {
    const results = await geocode(query, { limit: 1 });
    if (!results.length) throw new Error('No place matched that address. Try adding the town or country.');
    await setProperty(results[0]);
  } catch (err) {
    showError(err.message);
    setBusy(false);
  }
}

function onLocate() {
  if (!navigator.geolocation) return showError('This browser cannot share a location.');
  setBusy(true, 'Locating…');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const place = (await reverseGeocode(lat, lon)) || { label: 'My location', detail: '', lat, lon };
      await setProperty(place);
    },
    () => {
      showError('Location permission denied.');
      setBusy(false);
    },
    { timeout: 10000 },
  );
}

/* ---------- stato principale ---------- */

async function setProperty(place, { silent = false } = {}) {
  state.property = place;
  showError(null);
  setBusy(true, 'Measuring drive times…');

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
  await refreshTimeline();

  $('#app').hidden = false;
  setBusy(false);
  persistState();
  if (!silent) $('#app').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function autoSelectMarkets({ keepManual = false } = {}) {
  if (keepManual && state.manualSelection) return enforceMarketLimit();
  const ranked = [...state.reach.byCountry.values()]
    .filter((m) => m.access !== 'out')
    .sort((a, b) => b.reach - a.reach);
  const limit = pro.isPro() ? ranked.length : FREE_LIMITS.markets;
  state.selected = new Set(ranked.slice(0, limit).map((m) => m.c));
}

/** Il piano gratuito tiene i mercati più grandi e lascia cadere il resto. */
function enforceMarketLimit() {
  if (pro.isPro() || state.selected.size <= FREE_LIMITS.markets) return;
  const kept = [...state.selected]
    .map((c) => state.reach.byCountry.get(c))
    .filter(Boolean)
    .sort((a, b) => b.reach - a.reach)
    .slice(0, FREE_LIMITS.markets)
    .map((m) => m.c);
  state.selected = new Set(kept);
}

let radiusTimer = null;
function scheduleRadiusUpdate() {
  clearTimeout(radiusTimer);
  radiusTimer = setTimeout(async () => {
    recomputeReach();
    if (!state.manualSelection) autoSelectMarkets();
    await refreshTimeline();
    persistState();
  }, 180);
}

function onHorizonChange() {
  const from = $('#horizon-from').value;
  const to = $('#horizon-to').value;
  if (!from || !to) return;
  if (to < from) {
    $('#horizon-to').value = from;
  }
  state.from = $('#horizon-from').value;
  state.to = $('#horizon-to').value;
  clampHorizonToPlan();
  refreshTimeline();
  persistState();
}

/** Il piano gratuito si ferma a dodici mesi. */
function clampHorizonToPlan() {
  if (pro.isPro()) return;
  if (monthsBetween(state.from, state.to) <= FREE_LIMITS.months) return;
  const [y, m] = state.from.split('-').map(Number);
  const capped = new Date(Date.UTC(y, m - 1 + FREE_LIMITS.months - 1, 1));
  state.to = monthValue(capped);
  $('#horizon-to').value = state.to;
}

async function refreshTimeline() {
  enforceMarketLimit();
  const codes = [...state.selected];
  const missing = codes.filter((c) => !state.markets.has(c));
  const loaded = await Promise.allSettled(missing.map(loadMarket));
  loaded.forEach((r) => {
    if (r.status === 'fulfilled') state.markets.set(r.value.country, r.value);
  });

  const from = monthStart(state.from);
  const to = monthEnd(state.to);
  const includeSchool = pro.isPro();

  state.events = codes
    .map((c) => state.markets.get(c))
    .filter(Boolean)
    .flatMap((market) => buildEvents(market, from, to, { includeSchool }));

  state.weeks = buildWeeks({
    events: state.events,
    from,
    to,
    reachByCountry: state.reach.byCountry,
    countries: codes,
  });

  render();
}

/* ---------- rendering ---------- */

function render() {
  renderProperty();
  renderMarketList();
  renderAirports();
  renderSummary();
  renderMap();
  renderCalendar();
  renderList();
  renderMarkets();
  reflectPro();
}

function renderProperty() {
  const card = $('#property-card');
  card.textContent = '';
  card.appendChild(el('strong', null, state.property.label));
  card.appendChild(el('span', null, state.property.detail || `${state.property.lat.toFixed(3)}, ${state.property.lon.toFixed(3)}`));
  if (state.routingEstimated) {
    card.appendChild(
      el('span', 'limit-note', 'Routing service unreachable — drive times are estimated from distance.'),
    );
  }
}

function renderMarketList() {
  const box = $('#market-list');
  box.textContent = '';
  const rows = [...state.reach.byCountry.values()]
    .filter((m) => state.meta.markets.some((x) => x.c === m.c))
    .sort((a, b) => b.reach - a.reach || marketName(a.c).localeCompare(marketName(b.c)));

  for (const m of rows) {
    const row = el('label', 'market-row' + (m.access === 'out' ? ' is-out' : ''));
    const input = el('input');
    input.type = 'checkbox';
    input.checked = state.selected.has(m.c);
    input.addEventListener('change', () => {
      state.manualSelection = true;
      if (input.checked) state.selected.add(m.c);
      else state.selected.delete(m.c);
      refreshTimeline();
      persistState();
    });
    row.appendChild(input);
    row.appendChild(el('span', 'mkt-name', `${marketFlag(m.c)} ${marketName(m.c)}`));
    row.appendChild(
      el(
        'span',
        'mkt-reach',
        m.access === 'drive' ? fmtHours(m.bestDriveH) : m.access === 'fly' ? `${Math.round(m.bestCrowKm)}km` : '—',
      ),
    );
    box.appendChild(row);
  }

  const note = $('#limit-note');
  if (!pro.isPro()) {
    note.hidden = false;
    note.textContent = `Free plan: ${state.selected.size}/${FREE_LIMITS.markets} markets, 12-month horizon, public holidays only.`;
  } else {
    note.hidden = true;
  }
}

function renderAirports() {
  const box = $('#airports');
  box.textContent = '';
  box.appendChild(el('h4', null, 'Nearest airports'));
  const ul = el('ul');
  for (const a of state.nearAirports) {
    const li = el('li');
    const left = el('span');
    left.appendChild(el('code', null, a.i));
    left.append(` ${a.n}`);
    li.appendChild(left);
    li.appendChild(el('span', 'muted', `${Math.round(a.crowKm)} km`));
    ul.appendChild(li);
  }
  box.appendChild(ul);
  box.appendChild(
    el('p', 'control-note', 'These hubs decide which far-away markets are realistically yours.'),
  );
}

function renderSummary() {
  const box = $('#summary');
  box.textContent = '';

  const selected = [...state.selected].map((c) => state.reach.byCountry.get(c)).filter(Boolean);
  const drivePop = selected.reduce((sum, m) => sum + m.popDrive, 0);
  const flyPop = selected.reduce((sum, m) => sum + m.popFly, 0);
  const best = topWeeks(state.weeks, 1)[0];

  const stats = [
    [String(state.selected.size), 'markets selected'],
    [fmtPeople(drivePop), `people within ${fmtHours(state.maxDrive)} drive`],
    [fmtPeople(flyPop), `more within ${state.maxFly.toLocaleString('en-GB')} km flight`],
    [String(state.events.length), 'dates in horizon'],
    [best ? `${fmtDay(best.start)}` : '—', best ? `best week (score ${best.scorePct})` : 'no scored week'],
  ];

  for (const [value, label] of stats) {
    const stat = el('div', 'stat');
    stat.appendChild(el('b', null, value));
    stat.appendChild(el('span', null, label));
    box.appendChild(stat);
  }
}

let map = null;
let markerLayer = null;

function renderMap() {
  if (typeof L === 'undefined') return;
  if (!map) {
    map = L.map('map', { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
  }
  markerLayer.clearLayers();

  const home = L.circleMarker([state.property.lat, state.property.lon], {
    radius: 8,
    color: '#dc2626',
    fillColor: '#dc2626',
    fillOpacity: 1,
    weight: 2,
  }).bindTooltip(state.property.label);
  markerLayer.addLayer(home);

  const points = [[state.property.lat, state.property.lon]];
  for (const city of state.reach.cities) {
    if (city.access === 'out' || !state.selected.has(city.c)) continue;
    const drive = city.access === 'drive';
    const marker = L.circleMarker([city.lat, city.lon], {
      radius: Math.max(4, Math.min(14, Math.sqrt(city.p) / 9)),
      color: drive ? '#0f766e' : '#64748b',
      fillColor: drive ? '#0f766e' : '#64748b',
      fillOpacity: 0.55,
      weight: 1,
    }).bindTooltip(
      `<b>${city.n}</b><br>${drive ? `${fmtHours(city.driveH)} drive` : `${Math.round(city.crowKm)} km flight (~${fmtHours(city.flightH)} door to door)`}<br>${fmtPeople(city.p)} people`,
    );
    markerLayer.addLayer(marker);
    points.push([city.lat, city.lon]);
  }

  map.fitBounds(L.latLngBounds(points).pad(0.12));
  setTimeout(() => map.invalidateSize(), 60);
}

/* -- calendario opportunità -- */

function renderCalendar() {
  const view = $('#view-calendar');
  view.textContent = '';

  if (!state.weeks.length || !state.selected.size) {
    view.appendChild(el('p', 'view-empty', 'Select at least one market to see the calendar.'));
    return;
  }

  const table = el('table', 'cal');
  const codes = [...state.selected].sort(
    (a, b) => (state.reach.byCountry.get(b)?.reach || 0) - (state.reach.byCountry.get(a)?.reach || 0),
  );

  // intestazione: i mesi raggruppano le settimane
  const thead = el('thead');
  const monthRow = el('tr');
  monthRow.appendChild(el('th'));
  let currentMonth = null;
  let monthCell = null;
  for (const week of state.weeks) {
    const label = parseDate(week.start).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    if (label !== currentMonth) {
      currentMonth = label;
      monthCell = el('th', 'cal-month', label);
      monthCell.colSpan = 1;
      monthRow.appendChild(monthCell);
    } else {
      monthCell.colSpan += 1;
    }
  }
  thead.appendChild(monthRow);
  table.appendChild(thead);

  const tbody = el('tbody');

  // riga punteggio
  if (pro.isPro()) {
    const scoreRow = el('tr', 'row-score');
    scoreRow.appendChild(el('th', null, 'Demand'));
    for (const week of state.weeks) {
      const td = el('td');
      const bar = el('div', 'score-bar');
      const fill = el('i', 'score-fill');
      fill.style.height = `${week.scorePct}%`;
      bar.appendChild(fill);
      bar.title = `Week of ${fmtDay(week.start)} — score ${week.scorePct}/100`;
      td.appendChild(bar);
      scoreRow.appendChild(td);
    }
    tbody.appendChild(scoreRow);
  }

  for (const code of codes) {
    const tr = el('tr');
    tr.appendChild(el('th', null, `${marketFlag(code)} ${marketName(code)}`));
    for (const week of state.weeks) {
      const cell = week.byCountry.get(code);
      const td = el('td');
      const box = el('div', 'cell');
      const hasSchool = cell.schoolCoverage > 0;
      const hasPublic = cell.publicDays.length > 0;
      if (hasSchool && hasPublic) box.classList.add('has-both');
      else if (hasSchool) box.classList.add('has-school');
      else if (hasPublic) box.classList.add('has-public');
      if (cell.bridge) box.classList.add('has-bridge');
      if (hasSchool && cell.schoolCoverage < 0.34) box.dataset.partial = '1';
      else if (hasSchool && cell.schoolCoverage < 0.67) box.dataset.partial = '2';

      const bits = cell.events.map((ev) =>
        ev.type === 'school'
          ? `School: ${ev.name}${ev.regions.length ? ` (${ev.regions.length} regions)` : ''}`
          : ev.type === 'bridge'
            ? `Bridge: ${ev.name}`
            : `Holiday: ${ev.name}`,
      );
      box.title = `${marketName(code)} — week of ${fmtDay(week.start)}\n${bits.join('\n') || 'nothing on'}`;
      td.appendChild(box);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  view.appendChild(table);

  const key = el('div', 'cal-key');
  const entries = [
    ['k-public', 'public holiday'],
    ['k-school', 'school holiday (faded = only some regions)'],
    ['k-bridge', 'long weekend / bridge day'],
  ];
  if (pro.isPro()) entries.push(['k-score', 'weekly demand score']);
  for (const [cls, label] of entries) {
    const span = el('span');
    span.appendChild(el('i', `key-swatch ${cls}`));
    span.append(label);
    key.appendChild(span);
  }
  view.appendChild(key);

  if (!pro.isPro()) {
    const upsell = el('p', 'control-note');
    upsell.append('School holidays and weekly demand scoring are Pro. ');
    const link = el('a', null, 'See what Pro adds');
    link.href = '#pro';
    upsell.appendChild(link);
    upsell.append('.');
    view.appendChild(upsell);
  }
}

/* -- elenco date -- */

const MAX_LIST_ROWS = 500;

function renderList() {
  const view = $('#view-list');
  view.textContent = '';
  if (!state.events.length) {
    view.appendChild(el('p', 'view-empty', 'No dates in this horizon for the selected markets.'));
    return;
  }

  const table = el('table', 'data');
  const thead = el('thead');
  const hr = el('tr');
  ['Market', 'Type', 'Dates', 'Nights', 'What', 'Share off', 'Regions'].forEach((h) =>
    hr.appendChild(el('th', null, h)),
  );
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  const rows = [...state.events].sort((a, b) => a.start.localeCompare(b.start));
  for (const ev of rows.slice(0, MAX_LIST_ROWS)) {
    const tr = el('tr');
    tr.appendChild(el('td', null, `${marketFlag(ev.c)} ${marketName(ev.c)}`));
    const typeCell = el('td');
    typeCell.appendChild(el('span', `tag tag-${ev.type}`, ev.type));
    tr.appendChild(typeCell);
    tr.appendChild(
      el('td', null, ev.start === ev.end ? fmtDay(ev.start) : `${fmtDay(ev.start)} → ${fmtDay(ev.end)}`),
    );
    tr.appendChild(el('td', 'num', ev.nights ? String(ev.nights) : '—'));
    tr.appendChild(el('td', null, ev.name));
    tr.appendChild(el('td', 'num', `${Math.round(ev.coverage * 100)}%`));
    tr.appendChild(el('td', 'regions', ev.regions.length ? ev.regions.join(', ') : 'nationwide'));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  view.appendChild(table);

  if (rows.length > MAX_LIST_ROWS) {
    view.appendChild(
      el('p', 'control-note', `Showing the first ${MAX_LIST_ROWS} of ${rows.length} dates — the export contains all of them.`),
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
    view.appendChild(el('p', 'view-empty', 'Widen the radius to pick up markets.'));
    return;
  }
  const maxReach = rows[0].reach || 1;

  const table = el('table', 'data');
  const thead = el('thead');
  const hr = el('tr');
  ['Market', 'Nearest city', 'Drive', 'Flight', 'By car', 'By air', 'Weighted reach'].forEach((h) =>
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
      'control-note',
      'Weighted reach discounts people by how hard it is for them to come: someone two hours away counts almost fully, ' +
        `someone eight hours away counts about a fifth, and someone who has to fly counts at most ${Math.round(FLY_WEIGHT * 100)}%. ` +
        'It ranks markets against each other — it is not a forecast of bookings.',
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
  if (format !== 'csv' && !pro.isPro()) {
    document.querySelector('#pro').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const rows = buildRows();
  if (!rows.length) return showError('Nothing to export yet.');
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

/* ---------- pro ---------- */

async function onUnlock() {
  const key = window.prompt('Paste your Holiday Radar Pro key (HR-XXXX-XXXX-XXXX):');
  if (key === null) return;
  const ok = await pro.unlock(key);
  const status = $('#pro-status');
  status.hidden = false;
  status.textContent = ok
    ? 'Pro unlocked — school holidays, demand scoring and all exports are on.'
    : 'That key was not recognised. Check for typos, or get in touch if it should work.';
}

function reflectPro() {
  const on = pro.isPro();
  document.querySelectorAll('[data-pro]').forEach((btn) => btn.classList.toggle('is-locked', !on));
  const status = $('#pro-status');
  if (on) {
    status.hidden = false;
    status.textContent = 'Pro is active on this browser.';
  }
  if (!CHECKOUT_URL) $('#pro-cta').textContent = 'Join the waitlist';
}

/* ---------- persistenza ---------- */

function persistState() {
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
    $('#fly-out').innerHTML = saved.fly ? `${saved.fly.toLocaleString('en-GB')}&nbsp;km` : 'off';
  }
  if (saved.from) {
    state.from = saved.from;
    $('#horizon-from').value = saved.from;
  }
  if (saved.to) {
    state.to = saved.to;
    $('#horizon-to').value = saved.to;
  }
  clampHorizonToPlan();
}

function readStateFromURL() {
  const params = new URLSearchParams(location.search);
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) return null;
  const saved = {
    label: params.get('label') || 'Saved property',
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
  btn.textContent = busy ? message || 'Working…' : 'Scan markets';
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
