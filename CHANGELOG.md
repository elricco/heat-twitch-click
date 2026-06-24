# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
und das Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

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

[0.1.0]: https://github.com/elricco/heat-twitch-click/releases/tag/v0.1.0
