# G-Tracker

iPhone-Web-App zum Mitschreiben vom Verdienst in der bluegarage: Schichten, Trinkgeld, Stunden, Bar → Geldtasche oder Einzahlen, Kalender.

## Aufbau

- `index.html` – die ganze App (kein Framework)
- `sw.js` – Offline-Cache
- `manifest.webmanifest` – Name, Farben und Icons für den Home-Bildschirm
- `build.mjs` – kopiert alles nach `public/` und zeichnet die App-Icons (keine Abhängigkeiten)
- `vercel.json` – Build-Befehl `node build.mjs`, Ausgabeordner `public`

## Deployen

Vercel-Projekt `garagentracker`. Manuell: `npx vercel --prod` im Ordner.

## Daten

Alles liegt nur am Handy (localStorage), kein Account, keine Cloud.
Zuerst zum Home-Bildschirm hinzufügen, dann eintragen – Safari und die Home-Bildschirm-App speichern getrennt.
Ab und zu unter „Mehr → Backup speichern“ sichern.
