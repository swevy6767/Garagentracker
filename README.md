# G-Tracker

iPhone-Web-App zum Mitschreiben vom Verdienst in der bluegarage: Schichten, Trinkgeld, Stunden, Kalender, Statistik – mit automatischer Cloud-Sicherung.

## Aufbau

- `index.html` – die ganze App (kein Framework)
- `api/sync.js` – Cloud-Sicherung über einen privaten Vercel-Blob-Speicher (Einträge werden pro Schicht zusammengeführt, tägliche Sicherungskopie, die letzten 30 bleiben)
- `sw.js` – Offline-Cache
- `manifest.webmanifest` – Name, Farben und Icons für den Home-Bildschirm
- `build.mjs` – kopiert alles nach `public/` und zeichnet die App-Icons (keine Abhängigkeiten)
- `vercel.json` – Build-Befehl `node build.mjs`, Ausgabeordner `public`

## Deployen

Vercel-Projekt `garagentracker`. Manuell: `npx vercel --prod` im Ordner.

## Daten

Jede Schicht wird sofort am Handy gespeichert (localStorage) und automatisch in die Cloud gesichert.
Voraussetzung: im Vercel-Projekt ist ein **privater Blob-Speicher** verbunden (setzt `BLOB_READ_WRITE_TOKEN`).
Test: `/api/sync?selftest=1` muss `{"ok":true}` liefern.
Mit dem Sync-Code (Mehr → Cloud-Sicherung) holt man die Daten auf jedes Gerät zurück.
