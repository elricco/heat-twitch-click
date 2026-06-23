# Heat Click-Cluster Overlay

Ein statisches OBS-Overlay, das Zuschauer-Klicks auf den Twitch-Videoplayer (geliefert
von der [Heat](https://github.com/scottgarner/Heat) Extension) live zu Hotspot-Kreisen
clustert. Bis zu 5 Kreise; jeder zeigt seinen prozentualen Anteil an den Klicks innerhalb
eines gleitenden Zeitfensters. Reiner Proof of Concept — nur Visualisierung.

## Projektstruktur

```
overlay.html          OBS-Overlay (transparent, vollflächiges Canvas). Lädt js/heat-overlay.js.
config.html           Einstell-UI + Live-Vorschau (iframe) + OBS-URL-Generator. Kein Backend.
js/heat-overlay.js    Gesamte Logik: source / buffer / clusterer / renderer + init().
docs/superpowers/specs/  Design-Dokument(e).
```

Kein Build-Step, kein Server, keine Dependencies. Dateien direkt per `file://` oder einem
beliebigen statischen Server ausliefern. Einstieg immer über **config.html**.

## Datenfluss

```
Source (HeatSource | SimSource) --onClick(x,y)--> Buffer (gleitendes Fenster)
   pro Frame (requestAnimationFrame): Buffer.current() -> cluster() -> Renderer
```

Im Modus `zones` ersetzt `tallyZones(clicks, zones)` das Clustern: pro fester Zone
(4-Punkt-Viereck) wird der Klick-Anteil im Fenster gezählt und via `createZoneRenderer`
als Kreis am Zonen-Schwerpunkt gerendert (Umriss nur im Config-Editor). `cluster` bleibt
der Default-Modus.

Die vier Bausteine in `js/heat-overlay.js` sind bewusst entkoppelt:
- **Source** — gemeinsames Interface `onClick(x, y)` (beide 0..1 normalisiert).
  `HeatSource` = echter WebSocket; `SimSource` = Mausklicks + optionale Auto-Klicks.
- **createBuffer(windowMs)** — Ringpuffer, verwirft Klicks älter als das Fenster.
- **cluster(...)** — Greedy-Radius-Merge → Top-N Cluster über Threshold, mit `share`.
- **createRenderer(canvas)** — `track()` matcht Cluster per Nähe an bestehende Visuals,
  `draw()` interpoliert Position/Anteil/Opacity weich (Ring + Prozent-Label).

## Heat — verifizierte Fakten

- WebSocket: `wss://heat-api.j38.net/channel/<channelId>` — `channelId` = **numerische**
  Twitch-User-ID des Kanals (nicht der Name).
- Klick-Nachricht (JSON): `{ type: "click", x, y, id }`.
- `x`, `y` sind **normalisiert (0..1)** relativ zur Videofläche → auflösungsunabhängig.
- `id` = Twitch-User-ID, oder `A…` (anonym) / `U…` (Identität nicht geteilt). **Im PoC ungenutzt.**
- Die Extension muss vom Kanalinhaber im Twitch-Dashboard aktiviert sein; viele Klicks
  kommen anonym; Twitch-Stream-Delay bedeutet, Zuschauer klicken aufs Bild der Vergangenheit.

## URL-Parameter (overlay.html)

| Param        | Default | Bedeutung |
|--------------|---------|-----------|
| `channel`    | —       | Twitch-Channel-ID für Live-Heat. Fehlt sie → automatisch Sim-Modus. |
| `sim`        | `0`     | `1` erzwingt Sim-Modus (ignoriert `channel`). |
| `autoclicks` | `0`     | Sim: automatische Klicks pro Sekunde (0 = nur echte Mausklicks). |
| `window`     | `12`    | Gleitendes Zeitfenster in Sekunden. |
| `threshold`  | `10`    | Mindestanteil in % für einen Kreis. |
| `maxCircles` | `5`     | Max. Anzahl Kreise. |
| `mergeRadius`| `8`     | Cluster-Merge-Radius in % der Breite (normalisierte Einheiten). |
| `status`     | `0`     | `1` zeigt ein kleines Status-Badge (Verbindung/Modus). |
| `mode`       | `cluster` | `zones` aktiviert feste Zonen statt Auto-Cluster. |
| `zones`      | —       | Feste Vierecke `x1,y1,…,x4,y4`, Zonen per `;` getrennt (nur `mode=zones`). |

`config.html` generiert diese URL und merkt die zuletzt genutzten Werte in `localStorage`.

## In OBS einbinden

1. `config.html` öffnen, Channel-ID eintragen (oder Sim-Modus), Werte justieren, „Kopieren".
2. In OBS: `+` → **Browser** → URL einfügen, Breite/Höhe = Stream-Auflösung (z. B. 1920×1080),
   Hintergrund transparent lassen.

## Bewusst NICHT im Scope (YAGNI)

Identitäts-/`id`-Auswertung, Aktions-Schicht (OBS-Steuerung, Webhooks, n8n), Persistenz,
eigenes Relay/Backend, Anti-Spam jenseits des Zeitfensters. Erweiterungen bitte erst nach
kurzem Brainstorming/Design ergänzen.
