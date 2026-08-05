# 📡 Holiday Radar

**When are your guests free to travel?**

A free tool for short-term rental hosts. Drop your property on the map, say how far
guests will realistically travel to reach it, and get the public holidays, bridge days
and school holidays of every market that can — as a timeline, a list, or a CSV.

Built by a host who got tired of discovering that half of Bavaria was on holiday the
week after he dropped his rates.

---

## Why this exists

Most hosts price against their own country's calendar. But a villa on Lake Orta is not
sold to Italy — it is sold to whoever can get there. And the strongest predictor of when
those people book is when their children are out of school.

That data is public, free, and almost nobody uses it, because it is scattered across
sixteen German *Länder*, three French zones, twelve Dutch regions and twenty-six Swiss
cantons, each on its own schedule. Holiday Radar puts it in one place, filtered to the
markets that are actually yours.

## How it works

1. **Put the property on the map** — search an address, use your location, or click the map.
2. **Set the drive radius.** The shape drawn on the map is not a circle. Real driving
   times to 131 European metro areas are measured through the road network, and the
   reachable area is interpolated from them, so it stretches along motorways and pinches
   where mountains get in the way. Around Lake Orta an eight-hour *circle* contains Paris;
   the motorway does not — Paris is 9h 12m.
3. **Set the flight radius.** This one genuinely is a circle: it is straight-line distance,
   the simple version on purpose.
4. **Choose the horizon**, up to the end of the loaded data.
5. **Pick your markets** — as many as you like.

You get a timeline of every day off in those markets, a weekly demand score, the best
weeks ahead with a note on what to do about each, and exports.

## Sign-in, and what I keep

The tool is free and stays free, but the results are behind a sign-in: Google or an email
link. That exists for one reason — so I know who finds this useful and can tell them when
it gets better. I keep the email address and the searches run (property location, radii,
horizon, markets). Nothing else, nothing sold on.

**There is no "continue without an account" button.** If you would rather not sign in, the
whole thing is open source: clone this repository and run it yourself, no sign-in and no
limits. That is the deliberate alternative, and the gate says so.

**The blur over the results is not a security measure.** The data is already in the page
and anyone who opens developer tools can read it. It is an invitation to say hello, not a
lock — which is exactly why the escape hatch above is the honest one.

Until the Firebase config below is filled in, sign-in cannot work at all: the gate then
says so plainly and points at the repository, rather than pretending to accept a login.

## Languages

Italian and English, switched from the toggle in the header. The choice is remembered in
the browser and travels in the URL (`?lang=en`), so a shared link opens in the language it
was shared in. Country and city names are translated in the data itself
(`scripts/geo-source.mjs` carries `nameEn` / `nEn`), and dates follow the chosen locale.
Adding a third language means adding one block to `assets/js/i18n.js` and one name field
per country.

### Turning sign-in on

Until [`assets/js/firebase-config.js`](assets/js/firebase-config.js) is filled in, the
gate shows a "Continue without signing in" button and nothing is collected. To switch it
on:

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. **Authentication → Get started** → enable **Google** and **Email link (passwordless)**
3. **Firestore Database → Create database** → production mode
4. **Project settings → Your apps → Web** → copy the config object into `firebase-config.js`
5. **Authentication → Settings → Authorized domains** → add your Pages domain

Firebase web API keys are not secrets — they identify the project, they do not grant
access. What protects the data are the Firestore rules. These allow each signed-in person
to write only their own record, and nobody to read anything from the browser (you read
the leads from the Firebase console):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leads/{uid} {
      allow read: if false;
      allow write: if request.auth != null && request.auth.uid == uid;
      match /searches/{doc} {
        allow read: if false;
        allow create: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

Selling something to those contacts later is a separate conversation you have to have
honestly — say so when you collect the address, which is what the gate does.

## Hosting

Plain static files. It runs on GitHub Pages with nothing behind it — no server, no build
step, no API keys in the code, no database of its own. The holiday data is committed as
JSON and refreshed monthly by a GitHub Action, so the site never depends on a third-party
API being up when a visitor loads it.

```bash
npm run dev     # http://localhost:8080
```

## Data sources

| Data | Source | Licence |
|---|---|---|
| Public holidays & long weekends | [Nager.Date](https://date.nager.at) | open |
| School holidays (regional) | [OpenHolidays API](https://openholidaysapi.org) | CC-BY 4.0 |
| Driving times | [OSRM](https://project-osrm.org) demo server | ODbL (OpenStreetMap) |
| Geocoding & map tiles | [Photon](https://photon.komoot.io) / [OpenStreetMap](https://www.openstreetmap.org/copyright) | ODbL |

Coverage is uneven and the tool says so: markets whose school calendar is missing, or not
published that far ahead, carry a **?** next to their name rather than an empty row.
Italy, for one, currently has no school dates beyond mid-2026 — that is the source, not a
bug, and an empty row must never be read as "nobody there takes holidays".

Dates change. Confirm against an official source before committing money to a campaign.

### Refreshing the data

```bash
npm run build:data && npm run check
```

`build:data` rewrites everything under `data/`; `check` refuses to let obviously broken
output through (a country with too few holidays, dates outside the horizon, a collapsed
school-holiday set). Both run monthly in CI.

## What the numbers mean

Two figures are **weighted estimates, not measurements**, and the code says so where they
are computed:

- **Weighted reach** discounts each metro area by how hard it is for its people to come.
  Someone two hours away counts almost in full; someone eight hours away about a fifth;
  someone who has to fly at most 15%. Flying filters out guests with young children, dogs,
  bikes or skis, and without that discount a distant capital always outranks the neighbour
  down the road — which is the wrong advice to give a host.
- **Demand score** is reachable population multiplied by how much of each country is
  actually off that week. School holidays weigh most (families book whole weeks), long
  weekends next, a lone public holiday least.

Both rank markets and weeks against each other. Neither is a booking forecast.

## Project layout

```
index.html                  the whole interface
assets/js/app.js            orchestration and rendering
assets/js/analysis.js       reach, weighting, weekly scoring — the interesting part
assets/js/geo.js            geocoding, distances, drive-time matrix, reach shape
assets/js/auth.js           sign-in and lead capture
assets/js/firebase-config.js  ← fill this in to switch sign-in on
assets/js/export.js         CSV / ICS / JSON generation
scripts/build-data.mjs      fetches and freezes the holiday data
scripts/geo-source.mjs      hand-curated cities, countries and airports
scripts/check.mjs           sanity checks that guard the CI refresh
data/                       generated — do not edit by hand
```

## Contributing

The city and airport lists in `scripts/geo-source.mjs` are hand-curated and certainly
incomplete outside western Europe. Pull requests adding metro areas (population of the
functional urban area, not the municipality) are welcome.

## Licence

MIT — see [LICENSE](LICENSE). The holiday data belongs to its sources under their own terms.
