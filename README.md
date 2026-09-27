# G-Tracker

iPhone-Web-App zum Mitschreiben vom Verdienst in der bluegarage: Schichten, Trinkgeld, Stunden, Kalender, Statistik – mit automatischer Cloud-Sicherung.

## Aufbau

- `index.html` – die ganze App (kein Framework)
- `api/push.js` – Push-Anmeldung, Test-Nachricht, VAPID-Schlüssel (wird einmal erzeugt und im privaten Speicher abgelegt)
- `api/remind.js` – Cron um 07:00 und 08:00 UTC, sendet nur wenn es in Österreich 9 Uhr ist: „Heute arbeiten“ an Tagen mit geplanter Schicht
- `api/remind-evening.js` – Cron um 21:00 und 22:00 UTC, sendet nur um 23 Uhr österreichischer Zeit: „Wie war’s?“, solange die Schicht offen ist
- `api/_messages.js` – Texte für beide Erinnerungen (jeden Tag ein anderer)
- `api/cal.js` – Kalender-Abo (webcal) mit geplanten und gearbeiteten Schichten; Schlüssel ist der Hash des Sync-Codes
- `api/sync.js` – Cloud-Sicherung über einen privaten Vercel-Blob-Speicher (Einträge werden pro Schicht zusammengeführt, tägliche Sicherungskopie, die letzten 30 bleiben)
- `sw.js` – Offline-Cache
- `manifest.webmanifest` – Name, Farben und Icons für den Home-Bildschirm
- `icons/` – App-Icons (aus dem bluegarage-„b“)
- `build.mjs` – kopiert App und Icons nach `public/` (keine Abhängigkeiten)
- `vercel.json` – Build-Befehl `node build.mjs`, Ausgabeordner `public`

## Deployen

Vercel-Projekt `garagentracker`. Manuell: `npx vercel --prod` im Ordner.

## Daten

Jede Schicht wird sofort am Handy gespeichert (localStorage) und automatisch in die Cloud gesichert.
Voraussetzung: im Vercel-Projekt ist ein **privater Blob-Speicher** verbunden (setzt `BLOB_READ_WRITE_TOKEN`).
Test: `/api/sync?selftest=1` muss `{"ok":true}` liefern.
Mit dem Sync-Code (Mehr → Cloud-Sicherung) holt man die Daten auf jedes Gerät zurück.
