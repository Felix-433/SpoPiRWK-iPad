# SpoPi RWK – iPad-Version

Eigenständige Version von SpoPi RWK für das iPad. Anders als die PC-Version
läuft hier kein Server: Die App besteht nur aus statischen Dateien und
speichert alle Daten (Vereine, Schützen, Wettkämpfe, Ergebnisse) lokal im
Browser (`localStorage`). Einmal geladen bzw. zum Home-Bildschirm hinzugefügt,
funktioniert sie komplett offline – der PC muss dafür nicht laufen.

Die Daten dieser App sind **nicht** mit der PC-Version synchronisiert; beide
haben ihren eigenen, unabhängigen Datenstand.

## Lokal testen

```bash
npm run dev
```

Läuft anschließend unter http://localhost:5500

## Deployment (GitHub Pages)

Über GitHub Pages veröffentlichen, damit iOS Safari die Seite über HTTPS lädt
(nötig für den Service Worker und "Zum Home-Bildschirm").

## Auf dem iPad installieren

1. Die veröffentlichte HTTPS-URL in Safari öffnen
2. Teilen-Button → **Zum Home-Bildschirm**
