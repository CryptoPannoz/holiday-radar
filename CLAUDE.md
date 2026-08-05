# Holiday Radar — istruzioni per Claude

Tool pubblico e open source per host di affitti brevi: dato l'indirizzo di una casa,
dice quando sono in vacanza i mercati che possono davvero raggiungerla.

- **Repo**: `CryptoPannoz/holiday-radar` (pubblico)
- **Deploy**: GitHub Pages da `main`, cartella root. Push su `main` = deploy.
- **Stack**: HTML + CSS + JavaScript a moduli ES. Nessun framework, nessun build step.
  Node serve solo per gli script in `scripts/`. Firebase si carica da CDN solo se
  configurato.
- **Lingua dell'interfaccia**: inglese (è un prodotto internazionale). I commenti nel
  codice sono in italiano, come nel resto del workspace.

## Il flusso, in ordine

La mappa è la prima schermata. I passi sono numerati a schermo: (1) proprietà sulla mappa,
(2) raggio auto, (3) raggio volo, (4) orizzonte, (5) mercati → risultati sfocati finché
non si fa login.

## Regole del progetto

- **`data/` è generata**: non modificarla a mano. Si rigenera con `npm run build:data`,
  e `npm run check` deve passare prima di committare.
- **Niente chiamate alle API delle festività a runtime.** Il sito legge solo i JSON in
  `data/`. Le API si interrogano soltanto dallo script di build e dalla GitHub Action
  mensile: così la pagina è veloce, non consuma rate limit altrui e non si rompe se una
  fonte è giù.
- **Geocoding e routing sono a runtime** (Photon e OSRM) perché dipendono dall'indirizzo
  digitato. Sono servizi pubblici gratuiti: la ricerca è in debounce e il routing fa
  **una** sola richiesta con tutte le destinazioni. Non moltiplicare le chiamate.
- **I tempi di guida si misurano una volta sola per proprietà.** Muovere il cursore del
  raggio non deve toccare la rete: la forma si ricalcola dai tempi già in memoria.
- **Il raggio di guida non è un cerchio.** È interpolato dalle velocità reali per
  direzione (`driveReachShape` in `geo.js`). Se qualcuno lo semplifica in un cerchio,
  il tool perde la sua unica ragione di esistere rispetto a un compasso su una mappa.
- **I coefficienti di ponderazione in `analysis.js` sono stime dichiarate, non misure.**
  Se li cambi, aggiorna anche il testo che li spiega nell'interfaccia e nel README:
  un host prende decisioni di prezzo su questi numeri e deve sapere cosa sono.
- **Il velo sui risultati è CSS, non sicurezza.** I dati sono già nel DOM. È scritto nel
  cancello e nel README; non spacciarlo per protezione.
- **Assenza di dato ≠ assenza di vacanze.** Dove la fonte non copre un calendario
  scolastico compare un `?` con la spiegazione. Non rimuoverlo: una riga vuota letta come
  "lì non vanno in vacanza" è un errore che costa soldi a chi usa il tool.

## Privacy

Si raccolgono email e ricerche in Firestore, e lo si dichiara nel cancello prima del
login. Se aggiungi campi raccolti, aggiorna anche quel testo — non ampliare la raccolta
in silenzio.

## Comandi

```bash
npm run build:data     # riscarica festività e vacanze scolastiche in data/
npm run check          # controlli di sanità sui dati generati
npm run dev            # server statico locale su :8080
```

## Punti aperti

- `assets/js/firebase-config.js` è vuoto: finché lo resta, il cancello mostra "Continue
  without signing in" e nessuno viene tracciato. Istruzioni complete nel README.
- `CONTACT_URL` in `assets/js/config.js` è vuoto: la sezione consulenza resta nascosta.
- Le liste di città e aeroporti in `scripts/geo-source.mjs` coprono bene l'Europa
  occidentale e male il resto.
- OpenHolidays non pubblica le scolastiche di UK, Scandinavia, Grecia e Lettonia, e per
  l'Italia si ferma a metà 2026.
- Il server OSRM usato è quello dimostrativo pubblico: regge il traffico attuale, ma se
  il sito cresce va sostituito (matrice precalcolata a build time, o istanza propria).
