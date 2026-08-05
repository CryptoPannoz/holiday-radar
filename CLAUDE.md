# Holiday Radar — istruzioni per Claude

Tool pubblico e open source per host di affitti brevi: dato l'indirizzo di una casa,
dice quando sono in vacanza i mercati che possono davvero raggiungerla.

- **Repo**: `CryptoPannoz/holiday-radar` (pubblico)
- **Deploy**: GitHub Pages da `main`, cartella root. Push su `main` = deploy.
- **Stack**: HTML + CSS + JavaScript a moduli ES. Nessun framework, nessun build step,
  nessuna chiave API. Node serve solo per gli script in `scripts/`.
- **Lingua dell'interfaccia**: inglese (è un prodotto internazionale). I commenti nel
  codice sono in italiano, come nel resto del workspace.

## Regole del progetto

- **`data/` è generata**: non modificarla a mano. Si rigenera con `npm run build:data`,
  e `npm run check` deve passare prima di committare.
- **Niente chiamate alle API delle festività a runtime.** Il sito legge solo i JSON in
  `data/`. Le API si interrogano soltanto dallo script di build e dalla GitHub Action
  mensile: così la pagina è veloce, non consuma rate limit altrui e non si rompe se una
  fonte è giù.
- **Geocoding e routing invece sono a runtime** (Photon e OSRM), perché dipendono
  dall'indirizzo che l'utente digita. Entrambi sono servizi pubblici gratuiti: vanno
  chiamati con parsimonia (la ricerca è già in debounce, il routing fa **una** sola
  richiesta con tutte le destinazioni).
- **I coefficienti di ponderazione in `analysis.js` sono stime dichiarate, non misure.**
  Se li cambi, aggiorna anche il testo che li spiega nell'interfaccia e nel README:
  un host prende decisioni di prezzo su questi numeri e deve sapere cosa sono.
- **Il gate Pro è lato browser e aggirabile.** È una scelta consapevole per la v1, ed è
  scritto nel README. Non spacciarlo per sicuro. Se serve protezione vera, va spostato
  su server.

## Comandi

```bash
npm run build:data     # riscarica festività e vacanze scolastiche in data/
npm run check          # controlli di sanità sui dati generati
npm run keygen -- 3    # genera 3 chiavi Pro (proof-of-work, ~20-80s l'una)
npm run dev            # server statico locale su :8080
```

## Punti aperti

- `CHECKOUT_URL` in `assets/js/config.js` è vuoto: finché lo resta, il bottone Pro manda
  alla waitlist invece che a un pagamento.
- Le liste di città e aeroporti in `scripts/geo-source.mjs` coprono bene l'Europa
  occidentale e male il resto.
- OpenHolidays non pubblica le vacanze scolastiche di UK, Irlanda del Nord, Scandinavia,
  Grecia e Lettonia: per quei mercati esistono solo le festività nazionali.
- Il server OSRM usato è quello dimostrativo pubblico: regge il traffico attuale, ma se
  il sito cresce va sostituito (matrice precalcolata a build time, o istanza propria).
