# 📡 Holiday Radar

**When are your guests free to travel?**

A free tool for short-term rental hosts. Enter your property address, choose how far
guests will realistically travel, and get the public holidays, bridge days and school
holidays of every market that can actually reach you — as a calendar, a list, or a CSV.

Built by a host who got tired of discovering that half of Bavaria was on holiday the
week after he dropped his rates.

---

## Why this exists

Most hosts price against their own country's calendar. But a villa on Lake Orta is not
sold to Italy — it is sold to whoever can get there. And the single strongest predictor
of when those people book is when their children are out of school.

That data is public, free, and almost nobody uses it, because it is scattered across
sixteen German *Länder*, three French zones, twelve Dutch regions and twenty-six Swiss
cantons, each on its own schedule. Holiday Radar puts it in one place, filtered to the
markets that are actually yours.

## What it does

1. **Works out who can reach you.** Real driving times to 131 European metro areas,
   measured through the road network — not a circle drawn on a map. The difference
   matters: an 8-hour circle around Lake Orta contains Paris; the motorway does not
   (Paris is 9h 12m). Markets out of driving range are checked against a flight radius
   instead.
2. **Collects every day off in those markets.** Public holidays, bridge days and long
   weekends, plus school holidays with region-by-region detail where the source has it.
3. **Scores each week** by how many reachable people are actually off, so you can see
   which weeks justify a price increase and which need a campaign aimed at one country.
4. **Exports** to CSV, iCalendar (`.ics`) or JSON.

## Hosting

Plain static files. It runs on GitHub Pages with nothing else behind it — no server,
no build step, no API keys, no database. The holiday data is committed to the repo as
JSON and refreshed monthly by a GitHub Action, so the site never depends on a third-party
API being up when a visitor loads it.

To run it locally:

```bash
npm run dev
```

Then open <http://localhost:8080>.

## Data sources

| Data | Source | Licence |
|---|---|---|
| Public holidays & long weekends | [Nager.Date](https://date.nager.at) | open |
| School holidays (regional) | [OpenHolidays API](https://openholidaysapi.org) | CC-BY 4.0 |
| Driving times | [OSRM](https://project-osrm.org) demo server | ODbL (OpenStreetMap) |
| Geocoding & map tiles | [Photon](https://photon.komoot.io) / [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL |

Holiday dates change and sources occasionally lag. Always confirm against an official
source before committing money to a campaign.

### Refreshing the data

```bash
npm run build:data && npm run check
```

`build:data` rewrites everything under `data/`; `check` refuses to let obviously broken
output through (a country with too few holidays, dates outside the horizon, a collapsed
school-holiday set). The same two commands run monthly in CI.

## What the numbers mean

Two figures in the interface are **weighted estimates, not measurements**, and the code
says so where they are computed:

- **Weighted reach** discounts each metro area by how hard it is for its people to come.
  Someone two hours away counts almost in full; someone eight hours away counts about a
  fifth; someone who has to fly counts at most 15%. Flying filters out guests with young
  children, dogs, bikes or skis, and without that discount a distant capital always
  outranks the neighbour down the road — which is the wrong advice to give a host.
- **Demand score** is the reachable population multiplied by how much of each country is
  actually off that week. School holidays weigh most (families book whole weeks), long
  weekends next, a lone public holiday least.

Both are for ranking markets and weeks against each other. Neither is a booking forecast.

## Free vs Pro

| | Free | Pro |
|---|---|---|
| Public holidays & bridge days | ✅ | ✅ |
| School holidays, region by region | — | ✅ |
| Weekly demand scoring | — | ✅ |
| Markets at once | 5 | unlimited |
| Horizon | 12 months | 24 months |
| Export | CSV | CSV, `.ics`, JSON |

### Licensing

**The Pro check runs entirely in the browser, and anyone who reads this repository can
bypass it.** That is a deliberate trade-off for v1: the site stays static, free to host,
and needs no accounts. A key is valid when `SHA-256("holiday-radar|v1|" + key)` starts
with six zeros, so keys can be minted offline and verified without any secret in the
public code:

```bash
npm run keygen -- 3
```

If Pro ever earns real money, move the check server-side (a payment webhook issuing
signed, expiring tokens) — this scheme will not defend revenue on its own.

To wire up payment, set `CHECKOUT_URL` in [`assets/js/config.js`](assets/js/config.js).
While it is empty the button points at the waitlist instead.

## Project layout

```
index.html              the whole interface
assets/js/app.js        orchestration and rendering
assets/js/analysis.js   reach, weighting, weekly scoring — the interesting part
assets/js/geo.js        geocoding, distances, drive-time matrix
assets/js/export.js     CSV / ICS / JSON generation
assets/js/pro.js        licence gate (see caveat above)
scripts/build-data.mjs  fetches and freezes the holiday data
scripts/geo-source.mjs  hand-curated cities, countries and airports
scripts/check.mjs       sanity checks that guard the CI refresh
data/                   generated — do not edit by hand
```

## Contributing

The city and airport lists in `scripts/geo-source.mjs` are hand-curated and certainly
incomplete outside western Europe. Pull requests adding metro areas (with population of
the functional urban area, not the municipality) are welcome.

## Licence

MIT — see [LICENSE](LICENSE). The holiday data belongs to its respective sources under
their own terms.
