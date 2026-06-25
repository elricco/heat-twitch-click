# Aktions-Zonen: Heat-Klicks → Streamer.Bot

**Datum:** 2026-06-24
**Status:** Design (genehmigt, vor Implementierungsplan)

## Zweck

Ein dritter Overlay-Modus, der Zuschauer-Klicks (aus der Heat Twitch Extension) nicht
visualisiert, sondern als **Trigger** nutzt: Überschreitet eine fest definierte Zone im
gleitenden Zeitfenster eine Klick-Schwelle, ruft eine schlanke Bridge eine **benannte
Streamer.Bot-Action** auf. Was diese Action tut (z. B. einen Link in den Twitch-Chat
posten), liegt vollständig in Streamer.Bot — die Bridge bleibt ein dummer Trigger.

Damit erweitern wir den PoC bewusst um die bisher als YAGNI/out-of-scope geführte
„Aktions-Schicht". Heat bleibt dabei in seiner Rolle (reines Klick-Reporting); es gibt
weiterhin kein eigenes Backend, keine Persistenz, keine Identitäts-Auswertung.

### Nicht im Scope (YAGNI)

- Öffnen von Links im Browser des einzelnen Zuschauers (geht mit Heat architektonisch
  nicht; dafür wäre eine eigene interaktive Twitch-Extension nötig — separates Projekt).
- Puffern/Queueing von Triggern bei Streamer.Bot-Ausfall (verspätete Trigger sind wertlos).
- Auswertung der Heat-`id` (anonyme Klicks; kein @mention/Whisper).
- Beliebige Aktionslogik in der Bridge (lebt in Streamer.Bot).

## Entscheidungen (aus dem Brainstorming)

| Thema | Entscheidung |
|---|---|
| Trigger-Modell | Schwellenwert pro Zone (nicht per Einzelklick) |
| Messgröße | **Absolute Klickzahl** im Zeitfenster (robust gegen wenig Gesamttraffic) |
| Re-Arm | **Cooldown + Hysterese**: nach Feuern Sperrzeit *und* Abkühlen unter `rearm` |
| Struktur | **Eigene headless Bridge-Seite** `actions.html`, entkoppelt vom Rendering |
| Zone → Inhalt | Zone mappt auf **benannte Streamer.Bot-Action**; Bridge bleibt dumm |
| Transport | Streamer.Bot **WebSocket** `DoAction` (per Name), optionales Auth-Token |
| Offline-Verhalten | Kein Puffern; Trigger verwerfen + loggen; unabhängige Reconnects |
| Code-Reuse | Geometrie + Source/Buffer in geteilte Module extrahieren (Modul-Split) |
| Config | Dritter Modus „Aktions-Zonen" im bestehenden Mode-Dropdown |

## Architektur

Vier fokussierte Module statt eines Monolithen; alle ohne Build-Step, ohne Dependencies,
lauffähig per `file://` und auf GitHub Pages.

```
js/heat-zones.js     NEU. Reine Zonen-Geometrie: parseZones, pointInPolygon,
                     centroid, tallyZones. Keine DOM-/WS-Abhängigkeit.
                     Browser: window.HeatZones · Node: module.exports.
js/heat-core.js      NEU. I/O-Quellen + Buffer: HeatSource, SimSource, createBuffer.
                     Kein Rendering. Browser: window.HeatCore.
js/heat-overlay.js   GEÄNDERT. Geometrie + Source/Buffer raus (lädt heat-zones.js,
                     heat-core.js). Behält Rendering, cluster, init. Sonst unverändert.
js/heat-actions.js   NEU. Bridge: nutzt HeatCore (Source+Buffer) + HeatZones (tally),
                     Trigger-Maschine, Streamer.Bot-Client, init(). Browser: window.HeatActions.
actions.html         NEU. Headless Bridge-Seite (kein Canvas). Lädt heat-zones.js,
                     heat-core.js, heat-actions.js → HeatActions.init().
                     Rendert nur ein Status-Panel.
config.html          GEÄNDERT. Dritter Mode „Aktions-Zonen": baut actions.html-URL,
                     reused Zonen-Editor, Action-Felder pro Zone, Streamer.Bot-Felder.
```

### Modulgrenzen

- **heat-zones** — *Was:* Zonen-Geometrie. *Wie nutzen:* `tallyZones(clicks, zones) → [{x,y,count,share}]`.
  *Abhängt von:* nichts.
- **heat-core** — *Was:* liefert normalisierte Klicks + hält sie im Fenster. *Wie nutzen:*
  `HeatSource(channel, onClick, log)` / `SimSource(...)`, `createBuffer(windowMs)`.
  *Abhängt von:* WebSocket/DOM (I/O).
- **heat-actions** — *Was:* wertet Zonen-Schwellen aus und feuert Streamer.Bot-Actions.
  *Abhängt von:* heat-zones, heat-core, WebSocket.
- **config.html** — *Was:* erzeugt die Artefakt-URLs, kennt keine Laufzeitlogik.

## Datenfluss (Bridge)

```
Heat-WS ──onClick(x,y)──► Buffer (gleitendes Fenster, windowMs)
                              │
  alle 250 ms (setInterval, NICHT requestAnimationFrame):
    counts = tallyZones(buffer.current(), zones).map(z => z.count)
                              │
                       Trigger-Maschine (pro Zone)
                              │ fire
                       Streamer.Bot-Client ──DoAction──► Streamer.Bot
```

**`setInterval` statt `requestAnimationFrame`:** Die Bridge ist headless/unsichtbar; als
versteckte OBS-Browser-Quelle oder Hintergrund-Tab drosselt der Browser rAF stark. Ein
fester 250-ms-Tick wertet deterministisch aus, unabhängig von Sichtbarkeit. Es wird nichts
gerendert.

## Trigger-Maschine

### Konfiguration pro Zone

| Feld | Bedeutung | Default |
|---|---|---|
| `action` | Streamer.Bot-Action-Name (oder GUID) | — (Pflicht) |
| `enter` | absolute Klickzahl im Fenster, ab der gefeuert wird (oberer Schwellwert) | 20 |
| `rearm` | Klickzahl, unter die die Zone fallen muss, um wieder scharf zu werden | `floor(enter/2)` |
| `cooldown` | Sperrzeit **in Sekunden** nach dem Feuern (konsistent zu `window`) | 60 |

`rearm < enter` wird erzwungen (sonst Dauerfeuer). Zone ohne `action` wird übersprungen.
Die Bridge rechnet `cooldown` beim Laden in ms um (`*1000`), die Trigger-Maschine arbeitet
intern in ms (`now` via `performance.now()`).

### Laufzeitzustand pro Zone

`{ armed: boolean, cooldownUntil: number }` — Start: `armed = true`, `cooldownUntil = 0`.

### Auswertung je Tick (reine Funktion)

`evaluateZones(states, counts, now, cfg) → { states, fires }`

Pro Zone `i` mit `count = counts[i]`:

```
feuern, wenn:        armed && count >= enter && now >= cooldownUntil
  → fires.push(i); armed = false; cooldownUntil = now + cooldown

wieder scharf, wenn: !armed && count <= rearm && now >= cooldownUntil
  → armed = true
```

Beide Bedingungen zusammen (Cooldown **und** Hysterese) verhindern Dauerfeuer *und*
Flackern an der Schwelle: Nach dem Feuern muss die Sperrzeit ablaufen **und** die Zone
real abkühlen, bevor sie erneut feuert.

Defense in depth: zusätzlich kann die Streamer.Bot-Action selbst einen eigenen Cooldown
prüfen (letzte Auslösung) — Bridge drosselt grob, Action fein/global.

## Streamer.Bot-Transport

**Verbindung:** WebSocket zu Streamer.Bot (Default `ws://127.0.0.1:8080/`, per Config
überschreibbar). Eigener Reconnect-Loop mit Backoff (analog `HeatSource`), robust gegen
Streamer.Bot-Neustart. Heat- und Streamer.Bot-Verbindung sind unabhängig.

**Feuern (verifiziertes Protokoll, [docs.streamer.bot](https://docs.streamer.bot/api/websocket/requests)):**

```json
{
  "request": "DoAction",
  "id": "heat:<zone>:<timestamp>",
  "action": { "name": "<zone.action>" },
  "args": { "zone": "<name>", "count": 23, "share": 0.31, "channel": "<id>" }
}
```

Action per **Name** (menschenlesbar, in config.html eintragbar); GUID optional, falls
Namen nicht eindeutig sind. `buildDoAction(zone, count, share, channel)` ist eine reine
Funktion (testbar), getrennt vom WS-Versand.

**Auth:** Der Streamer.Bot-WS-Server kann optional Authentifizierung verlangen (Default
aus). Optionales Token in der Config; ohne Token wird der ungesicherte Standardpfad
genutzt. Der Auth-Handshake wird von Anfang an mitgebaut.

**Eigenschaften:**
- Fire-and-forget mit Logging (nicht blockierend auf Antwort warten).
- Kein Puffern bei Verbindungsverlust — Trigger werden verworfen + geloggt.

## URL-Parameter (actions.html)

Wiederverwendet aus dem Overlay: `channel`, `sim`, `autoclicks`, `window`, `zones`
(identische Codierung wie heute). Neu:

| Param | Default | Bedeutung |
|---|---|---|
| `sb` | `ws://127.0.0.1:8080/` | Streamer.Bot-WebSocket-URL |
| `sbtoken` | — | optionales Auth-Token |
| `actions` | — | pro Zone, index-gleich zu `zones`, `;`-getrennt |
| `dryrun` | `0` | `1` = Maschine läuft + loggt, sendet aber kein DoAction |
| `status` | `1` | Status-Panel (bei der Bridge standardmäßig an) |

**`actions`-Codierung:** je Zone vier Felder `enter|rearm|cooldown|<Action-Name>` (`cooldown`
in Sekunden), der Action-Name `encodeURIComponent`-kodiert (erlaubt Leer-/Sonderzeichen).
Zonen per `;` getrennt, exakt index-gleich zur `zones`-Liste. Beispiel (zwei Zonen):

```
actions=20|10|60|Link%20posten;15|8|45|Discord
```

Fehlt zu einer Zone der `actions`-Eintrag oder der Action-Name, wird sie übersprungen.

## config.html — Erweiterung

**Mode-Dropdown** bekommt eine dritte Option:

```
Cluster (automatische Hotspots)   → overlay.html?mode=cluster
Zonen (feste Vierecke, sichtbar)  → overlay.html?mode=zones
Aktions-Zonen (Streamer.Bot)      → actions.html
```

Der Modus bestimmt **Zielartefakt und die eine URL-Box** (keine zweite URL-Box):
„Aktions-Zonen" erzeugt die `actions.html?…`-Bridge-URL.

**Zonen-Datenmodell** erweitert sich um Action-Metadata:

```js
state.zones[i] = { points:[…], action:'', enter:20, rearm:10, cooldown:60 }
```

`points` und der bestehende Zeichen-Editor bleiben unverändert.

**Feld-Sichtbarkeit im Aktions-Modus** (über `applyModeVisibility()`):
- aus: Cluster/Kreis-Felder (Threshold %, Max. Kreise, Merge-Radius, „Kreise wachsen").
- an: Zonen-Editor inkl. **Umrissen** (`editor-layer` sichtbar wie im Zonen-Modus, damit
  man sieht, wo Zonen liegen) — aber **ohne** Prozent-Vorschau.
- an: pro Zonen-Zeile die Felder **Action-Name, enter, rearm, cooldown**.
- an: neues Fieldset „Streamer.Bot" mit **WS-URL** und **Token**.
- `window` (Zeitfenster) bleibt sichtbar (geteilt).

**Live-Vorschau im Aktions-Modus:** Das Vorschau-iframe lädt `actions.html` mit `dryrun=1`
— die Trigger-Maschine läuft und loggt „Zone X → Action Y würde feuern", **sendet aber
kein DoAction**. Gefahrloses Testen der Schwellen/Zonen ohne Streamer.Bot-Spam. Die
kopierte OBS-URL enthält `dryrun` nicht.

`state.zones` wird bereits in localStorage gespeichert; die neuen Felder laufen automatisch mit.

## actions.html — Status-Panel

Kein Canvas. Zeigt:
- Heat-Verbindung (verbunden/getrennt · Channel oder Sim).
- Streamer.Bot-Verbindung (verbunden/getrennt · URL · Auth ok/fehlgeschlagen).
- Log der letzten Trigger: `Zone 2 → "Link posten" · 23 Klicks` (im `dryrun` mit Vermerk
  „(dry-run, nicht gesendet)").
- Markierung ungültiger Zonen (kein Action-Name).

Dient zugleich als **Mixed-Content-Testgerät**: URL öffnen und sehen, ob die
`ws://127.0.0.1`-Verbindung aus dem (ggf. https-)Kontext zu Streamer.Bot steht.

## Fehlerbehandlung & Randfälle

| Fall | Verhalten |
|---|---|
| Streamer.Bot offline | Reconnect-Loop mit Backoff; Trigger verworfen + geloggt; Panel „getrennt" |
| Heat offline | Eigener Reconnect (bestehende HeatSource-Logik); Verbindungen unabhängig |
| Zone ohne Action-Name | übersprungen (feuert nie) + im Panel markiert |
| `rearm >= enter` | auf `enter-1` (bzw. sicheren Wert) korrigiert, sonst Dauerfeuer |
| Action existiert nicht in Streamer.Bot | Antwort geloggt, kein Crash (fire-and-forget) |
| Auth verlangt, Token fehlt/falsch | Handshake-Fehler geloggt, Reconnect |
| `dryrun=1` | gesamte Maschine läuft, `sendDoAction()` ist no-op + Log |

## Tests

Node, headless, ohne Framework (wie die bestehenden `module.exports`-Tests). Leitprinzip:
**reine Logik von I/O trennen**, damit der interessante Teil ohne Mocks testbar ist.

- **heat-zones**: `parseZones`, `pointInPolygon`, `tallyZones`, `centroid` — bestehende
  Tests bleiben gültig, nur der Import-Pfad zieht um.
- **Trigger-Maschine**: `evaluateZones(states, counts, now, cfg)` als reine Funktion —
  deterministische Tests für feuern / Cooldown / Hysterese / Re-Arm / Mehrzonen.
- **Streamer.Bot-Client**: `buildDoAction(zone, count, share, channel)` (reine Funktion,
  JSON-Bau) wird getestet; der WS-Versand selbst nicht (I/O).
- **actions.html**: Headless-Verifikation per Chrome `--screenshot` /
  `--virtual-time-budget` — Status-Panel rendert; `dryrun` feuert nicht.

## Offene Verifikation vor/in der Implementierung

**Mixed-Content / localhost:** Ob eine über `https://…github.io` geladene `actions.html`
eine `ws://127.0.0.1:8080`-Verbindung öffnen darf, ist nicht garantiert (CEF-/Browser-
Version). `localhost`/`127.0.0.1` gelten meist als „potentially trustworthy" und sind vom
Mixed-Content-Blocking ausgenommen — aber **vor dem Ausbau in der OBS-Browser-Quelle
testen** (genau dafür dient das Status-Panel). Fällt es aus: `actions.html` lokal per
`file://`/`http://localhost` laden oder Streamer.Bot auf `wss` umstellen.

## Verifizierte Fakten

- Streamer.Bot WebSocket `DoAction`-Format (Name|GUID + `args`), optionale Auth:
  <https://docs.streamer.bot/api/websocket/requests>
- Heat-Fakten unverändert (siehe CLAUDE.md): WS `wss://heat-api.j38.net/channel/<id>`,
  Klick `{type:"click", x, y, id}`, `x`/`y` normalisiert 0..1.
