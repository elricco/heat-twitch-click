# Heat Click-Cluster Overlay

Ein statisches OBS-Overlay, das Zuschauer-Klicks auf den Twitch-Videoplayer (geliefert
von der [Heat](https://github.com/scottgarner/Heat) Extension) live zu Hotspot-Kreisen
clustert. Bis zu 5 Kreise; jeder zeigt seinen prozentualen Anteil an den Klicks innerhalb
eines gleitenden Zeitfensters. Reiner Proof of Concept — nur Visualisierung.

## Projektstruktur

```
index.html            Einstiegspunkt für GitHub Pages. Meta-Refresh-Redirect auf config.html.
overlay.html          OBS-Overlay (transparent, vollflächiges Canvas). Lädt js/heat-overlay.js.
actions.html          Aktions-Bridge (transparent/unsichtbar, optional kompakter Indikator). Lädt js/heat-zones.js, 
                      js/heat-core.js, js/heat-actions.js.
config.html           Einstell-UI + Live-Vorschau (iframe) + OBS-URL-Generator. Kein Backend.
js/heat-overlay.js    Rendering + Cluster-Logik + init() für Cluster-/Zonen-Overlay.
js/heat-zones.js      Reine Zonen-Geometrie: parseZones, pointInPolygon, centroid, tallyZones.
js/heat-core.js       Quellen + Buffer: HeatSource (WebSocket), SimSource (Maus), createBuffer.
js/heat-actions.js    Aktions-Bridge: evaluateZones, parseActions, buildDoAction, createSbClient.
docs/superpowers/specs/  Design-Dokument(e).
```

Kein Build-Step, kein Server, keine Dependencies. Dateien direkt per `file://` oder einem
beliebigen statischen Server ausliefern. Einstieg immer über **config.html**.

**Deployment:** Läuft unverändert als GitHub Page (statisch, kein Build). Pages-Quelle =
`main` / `/ (root)`; `index.html` redirectet auf config.html, damit die Wurzel-URL nicht 404t.
Live: <https://elricco.github.io/heat-twitch-click/>. config.html baut die Overlay-URL relativ
(`new URL('overlay.html', location.href)`), funktioniert daher unter `file://` und auf Pages.

## Datenfluss

### Overlay (cluster / zones)

```
Source (HeatSource | SimSource) --onClick(x,y)--> Buffer (gleitendes Fenster)
   pro Frame (requestAnimationFrame): Buffer.current() -> cluster() / tallyZones() -> Renderer
```

Im Modus `cluster` (Default) clustert `cluster(...)` Klicks zu Hotspots; pro Frame
wird der Renderer aktualisiert (weiche Animation).

Im Modus `zones` ersetzt `tallyZones(clicks, zones)` das Clustern: pro fester Zone
(4-Punkt-Viereck) wird der Klick-Anteil im Fenster gezählt und als Kreis am Zonen-Schwerpunkt
gerendert (Umrisse nur im Config-Editor). `js/heat-overlay.js` lädt `js/heat-zones.js`.

### Actions-Bridge (Streamer.Bot)

```
Source (HeatSource | SimSource) --onClick(x,y)--> Buffer (gleitendes Fenster)
   alle 250 ms: Buffer.current() -> tallyZones() -> evaluateZones()
      -> Trigger (pro Zone: Cooldown + Hysterese) -> Streamer.Bot DoAction (über WebSocket)
```

`actions.html` (transparent/unsichtbar, optionaler Verbindungs-Indikator) nutzt `js/heat-zones.js`, `js/heat-core.js` und
`js/heat-actions.js`. Pro Zone wird die absolute Klickzahl im Fenster getrackt (kein Anteil);
bei Schwellenwert (Cooldown + Hysterese) wird eine benannte Streamer.Bot-Action ausgelöst
oder im Dry-Run-Modus nur geloggt.

Die Bausteine sind bewusst entkoppelt:
- **Source** — gemeinsames Interface `onClick(x, y)` (beide 0..1 normalisiert).
  `HeatSource` = echter WebSocket; `SimSource` = Mausklicks + optionale Auto-Klicks.
- **createBuffer(windowMs)** — Ringpuffer, verwirft Klicks älter als das Fenster.
- **cluster(...)** — Greedy-Radius-Merge → Top-N Cluster über Threshold (nur Overlay).
- **tallyZones(clicks, zones)** — zählt pro Zone die Klicks (Overlay + Bridge).
- **evaluateZones(states, counts, now, cfg)** — Trigger-Maschine mit Cooldown/Hysterese (nur Bridge).
- **createRenderer(canvas)** — `track()` / `draw()` mit weicher Interpolation (nur Overlay).
- **createSbClient({ url, token, log, onStatus })** — Streamer.Bot WebSocket + Auth-Handshake (nur Bridge).

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
| `grow`       | `1`     | `0` = feste Kreisgröße (nur Prozentzahl), Kreise wachsen nicht mit dem Anteil. |

`config.html` generiert diese URL und merkt die zuletzt genutzten Werte in `localStorage`.

## URL-Parameter (actions.html)

`actions.html` (Aktions-Bridge zu Streamer.Bot) teilt die Quellen-Parameter mit `overlay.html`
(`channel`, `sim`, `autoclicks`, `window`, `zones`) und hat zusätzlich:

| Param        | Default | Bedeutung |
|--------------|---------|-----------|
| `sb`         | `ws://127.0.0.1:8080/` | Streamer.Bot WebSocket-URL. |
| `sbtoken`    | —       | Auth-Token für Streamer.Bot (optional). |
| `actions`    | —       | Pro Zone: `enter\|rearm\|cooldown\|<action>`, Zonen durch `;` getrennt. Beispiel: `20\|10\|60\|Link%20posten;15\|8\|45\|Discord` — Zone 1 triggert bei ≥20 Klicks, re-armed bei ≤10, Sperrzeit 60 Sek., Action-Name „Link posten". |
| `dryrun`     | `0`     | `1` = evaluieren + loggen + ausführliches Detail-Panel (Zonen + Trigger-Log) zeigen, aber nicht an Streamer.Bot senden (Config-Vorschau / Schwellen testen). |
| `status`     | `0`     | `1` zeigt den kompakten Verbindungs-Indikator (Heat- + Streamer.Bot-Icon, farbcodiert). Default: nichts sichtbar → die Bridge ist als OBS-Quelle vollständig transparent. |

**Sichtbarkeit:** `actions.html` hat einen transparenten Hintergrund und rendert standardmäßig
nichts (unsichtbare OBS-Quelle). `status=1` blendet unten links einen kleinen, farbcodierten
Verbindungs-Indikator ein (grün = bereit/verbunden, orange = getrennt/Reconnect, rot = Fehler/Auth,
blau = Sim/Test). Das ausführliche Panel (Zonen + Trigger-Log) erscheint nur mit `dryrun=1` (so
nutzt es die Config-Vorschau). Die Config-Checkbox „Status-Badge anzeigen" steuert `status`.

**Codierung von `actions`:** `enter` = Klicks im gleitenden Fenster bis Auslösung (Ganzzahl),
`rearm` = Klicks zum Zurücksetzen auf scharf (Ganzzahl, automatisch auf `max(0, enter-1)` wenn ungültig),
`cooldown` = Sperrzeit nach Trigger in **Sekunden** (Ganzzahl), `action` = Streamer.Bot-Action-Name
(mit `encodeURIComponent` codiert, z. B. `Link%20posten`). Ohne Action pro Zone: Zone wird übersprungen (skip).

## In OBS einbinden

### Cluster/Zonen-Overlay

1. `config.html` öffnen, Modus „Cluster" oder „Zonen" wählen, Channel-ID eintragen (oder Sim-Modus),
   Werte justieren, „Kopieren".
2. In OBS: `+` → **Browser** → URL einfügen, Breite/Höhe = Stream-Auflösung (z. B. 1920×1080),
   Hintergrund transparent lassen.

### Aktions-Zonen (Streamer.Bot)

1. `config.html` öffnen, Modus „Aktions-Zonen (Streamer.Bot)" wählen.
2. Zonen editieren (4 Punkte je Zone), pro Zone Action-Name + Schwellen (enter, rearm, cooldown)
   eintragen.
3. Streamer.Bot WebSocket-URL + optionales Auth-Token eingeben.
4. „Kopieren" → die fertige `actions.html`-URL in OBS als **zweite, unsichtbare Browser-Quelle**
   einfügen (oder als separate Window/Source je nach OBS-Setup). Status-Panel zeigt immer
   Heat-Verbindung, Streamer.Bot-Status, Zone-Action-Badges und Trigger-Log.
5. **Hinweis Mixed-Content:** `actions.html` über HTTPS (GitHub Pages) kann auf `ws://127.0.0.1`
   (lokal) stoßen; moderne Browser blockieren das ggf. In OBS/CEF sollte es funktionieren, aber
   falls nicht: entweder `actions.html` lokal laden (`file://`), oder Streamer.Bot über
   `wss://` (TLS) erreichbar machen. Dry-Run (`?dryrun=1`) testet Schwellen ohne Versand.

## Bewusst NICHT im Scope (YAGNI)

Identitäts-/`id`-Auswertung, OBS-Steuerung, Webhooks, n8n-Integration, Persistenz,
eigenes Relay/Backend. Die Aktions-Schicht ist **teilweise** umgesetzt: Streamer.Bot-Trigger
per Zone über die `actions.html`-Bridge funktioniert; OBS-Steuerung, Webhooks, n8n bleiben
zukünftige Ausbauschritte. Erweiterungen bitte erst nach kurzem Brainstorming/Design ergänzen.
