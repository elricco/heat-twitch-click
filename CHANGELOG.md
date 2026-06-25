# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
und das Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

## [0.2.0] - 2026-06-25

Aktions-Zonen: Heat-Klicks lösen Streamer.Bot-Actions aus.

### Added

- **Aktions-Zonen (Streamer.Bot)** — transparente `actions.html`-Bridge: pro fester Zone wird
  die absolute Klickzahl im gleitenden Fenster getrackt; beim Schwellenwert (Cooldown + Hysterese)
  wird eine **benannte Streamer.Bot-Action** per WebSocket `DoAction` ausgelöst. Optionaler
  Auth-Handshake (SHA256-Challenge-Response). Kein Puffern bei Verbindungsverlust, unabhängige
  Reconnects für Heat und Streamer.Bot.
- **Dritter Config-Modus „Aktions-Zonen"** mit Action-Feldern pro Zone (Action-Name, `enter`,
  `rearm`, `cooldown`), Streamer.Bot-Feldern (WebSocket-URL, Token) und **Dry-Run-Vorschau**
  (evaluiert + loggt, sendet aber nicht).
- **Kompakter Verbindungs-Indikator** in der Bridge: farbcodierte SVG-Icons für Heat und
  Streamer.Bot (grün = bereit/verbunden, orange = getrennt/Reconnect, rot = Fehler/Auth,
  blau = Sim/Test), per `status=1` einblendbar. Ausführliches Panel (Zonen + Trigger-Log) nur
  im Dry-Run.
- **Modul-Split**: Zonen-Geometrie (`js/heat-zones.js`), Quellen + Buffer (`js/heat-core.js`),
  Aktions-Trigger + Bridge (`js/heat-actions.js`). Jedes Modul unabhängig testbar.
- **Neue URL-Parameter** (`actions.html`): `sb`, `sbtoken`, `actions`, `dryrun`, `status`.
- **Zonen-Labels** („Zone N") in der Canvas-Vorschau der Config.
- **Tests**: `test/heat-zones.test.js`, `test/heat-core.test.js`, `test/heat-actions.test.js`
  (`evaluateZones`, `parseActions`, `buildDoAction`, `computeAuth`, `createBuffer`).

### Changed

- `js/heat-overlay.js` in fokussierte Module aufgeteilt; lädt jetzt `heat-zones.js` und
  `heat-core.js`. Rendering-Verhalten unverändert.
- `actions.html` ist als OBS-Browser-Quelle **transparent/unsichtbar** (vorher opakes Panel);
  Sichtbarkeit gesteuert über `status` (Indikator) und `dryrun` (Detail-Panel).

### Fixed

- Config-Aktions-Modus: **Fokusverlust** beim Tippen in Zonen-Inputs (Liste wurde pro Tastendruck
  neu gebaut) — wird jetzt nur bei echtem Moduswechsel neu aufgebaut.
- Config-Aktions-Modus: überlaufendes Layout — `enter`/`rearm`/`cooldown` in eigener Zeile mit
  Labels, Action-Name in voller Breite.
- Bridge-Statusanzeige: HTML-Escaping der Action-Namen (`innerHTML`).

## [0.1.0] - 2026-06-24

Erster Release des Proof of Concept.

### Added

- **Heat Click-Cluster Overlay** — transparentes, vollflächiges OBS-Overlay (`overlay.html`),
  das Zuschauer-Klicks der [Heat](https://github.com/scottgarner/Heat) Twitch Extension live
  zu bis zu 5 Hotspot-Kreisen clustert; jeder Kreis zeigt seinen prozentualen Anteil im
  gleitenden Zeitfenster.
- **Entkoppelte Architektur** in `js/heat-overlay.js`: Source (`HeatSource` WebSocket /
  `SimSource` Mausklicks) → Buffer (Ringpuffer, gleitendes Fenster) → cluster (Greedy-Radius-Merge)
  → Renderer (weiche Interpolation von Position, Anteil und Opacity).
- **Sim-Modus** mit optionalen Auto-Klicks zum Testen ohne Live-Stream.
- **Config-Seite** (`config.html`): Einstell-UI mit Live-Vorschau (iframe), OBS-URL-Generator,
  „Kopieren"-Button und Persistenz der zuletzt genutzten Werte in `localStorage`. Kein Backend.
- **Zweiter Overlay-Modus `zones`**: feste 4-Punkt-Zonen statt Auto-Cluster
  (`tallyZones`, Point-in-Polygon-Shares), mit 4-Punkt-Editor auf 16:9-Stage und optionalem
  Referenzbild als Hintergrund.
- **`grow`-Schalter**: feste Kreisgröße (nur Prozentzahl) als Alternative zum Mitwachsen mit
  dem Anteil.
- **URL-Parameter** zur Steuerung: `channel`, `sim`, `autoclicks`, `window`, `threshold`,
  `maxCircles`, `mergeRadius`, `status`, `mode`, `zones`, `grow`.
- **GitHub-Pages-Einstiegspunkt** (`index.html`, Redirect auf config.html); Projekt läuft
  unverändert statisch als GitHub Page.
- **Dokumentation**: README (Schnellstart, Channel-ID finden, URL-Parameter, Heat-Kurzfassung)
  und CLAUDE.md (Projektstruktur, Datenfluss, verifizierte Heat-Fakten).
- **Node-Test-Harness** (`test/heat-overlay.test.js`) für die reine Logik (parseZones,
  pointInPolygon, centroid, tallyZones).

[0.2.0]: https://github.com/elricco/heat-twitch-click/releases/tag/v0.2.0
[0.1.0]: https://github.com/elricco/heat-twitch-click/releases/tag/v0.1.0
