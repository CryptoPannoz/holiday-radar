/**
 * Accesso ai dati congelati in /data. Nessuna chiamata alle API delle festività
 * a runtime: quelle girano solo nella GitHub Action che rigenera i file.
 */

const cache = new Map();

async function loadJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const promise = fetch(path, { cache: 'default' }).then((res) => {
    if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
    return res.json();
  });
  cache.set(path, promise);
  return promise;
}

export const loadMeta = () => loadJSON('data/meta.json');
export const loadCities = () => loadJSON('data/cities.json');
export const loadAirports = () => loadJSON('data/airports.json');
export const loadMarket = (code) => loadJSON(`data/markets/${code}.json`);

/** Carica in parallelo i mercati richiesti, saltando quelli che non esistono. */
export async function loadMarkets(codes) {
  const settled = await Promise.allSettled(codes.map(loadMarket));
  return settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
}
