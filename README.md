# Heat Click-Cluster Overlay

Ein OBS-Overlay, das Zuschauer-Klicks auf den Twitch-Videoplayer live zu Hotspot-Kreisen
clustert. Die Klick-Daten liefert die [Heat](https://github.com/scottgarner/Heat) Twitch
Extension. Bis zu 5 Kreise; jeder zeigt seinen prozentualen Anteil an den Klicks innerhalb
eines gleitenden Zeitfensters. Ein Kreis erscheint erst ab einem Mindestanteil (Threshold).

Reiner Proof of Concept: nur Visualisierung — kein Backend, keine Dependencies, kein Build.

![Config-Seite mit Live-Vorschau: Klick-Hotspots als Kreise mit ihrem prozentualen Anteil](images/heat-twitch-click.png)

## Schnellstart

1. **`config.html` öffnen** (Doppelklick genügt, oder über einen lokalen Server – siehe unten).
2. **Sim-Modus** anhaken und **Auto-Klicks** auf z. B. `30` stellen → in der Live-Vorschau
   entstehen Kreise. Alternativ: für Live-Betrieb die **Twitch-Channel-ID** eintragen.
3. **„Kopieren"** klickt die fertige OBS-URL in die Zwischenablage.
4. In **OBS**: `+` → *Browser* → URL einfügen, Breite/Höhe = Stream-Auflösung (z. B. 1920×1080),
   Hintergrund transparent lassen.

> Die [Heat Twitch Extension](https://dashboard.twitch.tv/extensions/cr20njfkgll4okyrhag7xxph270sqk)
> muss vom Kanalinhaber im Twitch-Dashboard installiert und aktiviert sein, damit echte
> Klicks ankommen.

## Online nutzen (GitHub Pages)

Das Projekt ist rein statisch und läuft direkt als GitHub Page – ohne lokale Dateien zu verteilen:

- **Einstieg / OBS-URL-Generator:** <https://elricco.github.io/heat-twitch-click/>
- **Overlay direkt (für die OBS-Browser-Quelle):** <https://elricco.github.io/heat-twitch-click/overlay.html>

Der „Kopieren"-Button erzeugt automatisch die passende `github.io`-URL (relativ aufgelöst).
Über HTTPS gibt es kein Mixed-Content-Problem, weil Heat per `wss://` (sicher) angebunden ist –
für OBS ist dieser Link daher angenehmer als ein lokaler `file://`-Pfad.

> Pages-Quelle: Repo-**Settings → Pages → Deploy from a branch → `main` / `/ (root)`**.

## Channel-ID finden

Heat braucht die **numerische** Twitch-User-ID des Kanals (nicht den Anzeigenamen).

- **Am einfachsten – [DecAPI](https://decapi.me/):** im Browser
  `https://decapi.me/twitch/id/DEIN_USERNAME` aufrufen → gibt direkt die Zahl zurück
  (z. B. `97032862`). Kein Login nötig.
- **Converter-Tool:** z. B. [streamweasels.com](https://www.streamweasels.com/tools/convert-twitch-username-to-user-id/)
  – Username eintippen, ID ablesen.
- **Offiziell per Twitch-API** (nur falls du ohnehin eine App/Token hast):
  `GET https://api.twitch.tv/helix/users?login=DEIN_USERNAME` → Feld `id`.

Die Zahl ins Feld „Twitch-Channel-ID" der `config.html` eintragen. Bleibt das Overlay leer,
ist meist die Extension nicht aktiv oder es klickt gerade niemand – dann erst im Sim-Modus testen.

## Dateien

```
index.html            Einstiegspunkt für GitHub Pages → leitet auf config.html weiter
overlay.html          OBS-Overlay (transparent, vollflächiges Canvas, Cluster/Zonen)
actions.html          Aktions-Bridge zu Streamer.Bot (unsichtbar, Status-Panel)
config.html           Einstell-UI + Live-Vorschau + OBS-URL-Generator (merkt Werte in localStorage)
js/heat-overlay.js    Rendering + Cluster-Logik
js/heat-zones.js      Zonen-Geometrie (Point-in-Polygon, etc.)
js/heat-core.js       Quellen (HeatSource, SimSource) + Buffer
js/heat-actions.js    Aktions-Bridge (Trigger, Streamer.Bot WebSocket)
CLAUDE.md             Projektdoku (Datenfluss, URL-Parameter)
docs/superpowers/specs Design-Dokument
```

## URL-Parameter (overlay.html)

| Param        | Default | Bedeutung |
|--------------|---------|-----------|
| `channel`    | —       | Twitch-Channel-ID (numerisch) für Live-Heat. Fehlt sie → Sim-Modus. |
| `sim`        | `0`     | `1` erzwingt Sim-Modus (ignoriert `channel`). |
| `autoclicks` | `0`     | Sim: automatische Klicks pro Sekunde (0 = nur echte Mausklicks). |
| `window`     | `12`    | Gleitendes Zeitfenster in Sekunden. |
| `threshold`  | `10`    | Mindestanteil in % für einen Kreis. |
| `maxCircles` | `5`     | Max. Anzahl Kreise. |
| `mergeRadius`| `8`     | Cluster-Merge-Radius in % der Breite. |
| `status`     | `0`     | `1` zeigt ein kleines Status-Badge (Verbindung/Modus). |
| `mode`       | `cluster` | `zones` = feste Zonen statt Auto-Cluster. |
| `zones`      | —       | Feste Vierecke `x1,y1,…,x4,y4`, mehrere durch `;` (nur `mode=zones`). |
| `grow`       | `1`     | `0` = feste Kreisgröße (nur Prozentzahl), Kreise wachsen nicht mit dem Anteil. |

`config.html` baut diese URL für dich zusammen.

## Braucht es einen Server?

Im Normalbetrieb **nein** – OBS lädt `overlay.html` direkt per `file://`-Pfad, und der
WebSocket zu Heat läuft auch von dort. Ein lokaler Server (`python3 -m http.server`) hilft nur,
falls dein OBS/Browser bei `file://` zickt oder der „Kopieren"-Button zuverlässig die
Clipboard-API nutzen soll (die braucht http/localhost).

## So funktioniert Heat (Kurzfassung)

- WebSocket: `wss://heat-api.j38.net/channel/<channelId>` (channelId = numerische Twitch-User-ID).
- Klick-Nachricht: `{ type: "click", x, y, id }` mit **x/y normalisiert (0..1)** → auflösungsunabhängig.
- `id` = Twitch-User-ID, oder `A…` (anonym) / `U…` (Identität nicht geteilt). Im PoC ungenutzt.

## Aktions-Zonen (Streamer.Bot)

Ein dritter Overlay-Modus triggert **Streamer.Bot-Actions** aufgrund von Klick-Schwellen pro Zone:

- **config.html** bietet einen dritten Modus „Aktions-Zonen (Streamer.Bot)":
  - Zonen editieren wie im Zonen-Modus.
  - Pro Zone: Action-Name + Schwellen angeben (`enter` = Klicks bis Trigger, `rearm` = zurücksetzen,
    `cooldown` = Sperrzeit in Sekunden).
- **actions.html** ist eine unsichtbare Browser-Quelle in OBS:
  - Trägt die gleichen Zonen und Klick-Daten wie das Overlay.
  - Evaluiert pro Zone: absolute Klickzahl im gleitenden Fenster → Trigger (Cooldown + Hysterese)
    → DoAction-Request an Streamer.Bot WebSocket.
  - Status-Panel zeigt Heat-Verbindung, Streamer.Bot-Status, Trigger-Log und Zone-Markierungen.
- **Streamer.Bot Verbindung:**
  - WebSocket-URL (default `ws://127.0.0.1:8080/`) und optionales Auth-Token konfigurierbar.
  - Sendet benannte Actions per Zone; Arguments: Zone-Index, Klickzahl, Anteil, Channel.
  - SHA256×2-Auth unterstützt (falls aktiviert in Streamer.Bot).
- **Hinweis Mixed-Content:** `actions.html` von HTTPS (GitHub Pages) zu `ws://127.0.0.1` kann
  blockiert werden; dann `actions.html` lokal laden (`file://`) oder Streamer.Bot über `wss://`.
- **Dry-Run (`?dryrun=1`):** testet Schwellen/Hysterese ohne an Streamer.Bot zu senden.

**Nicht im Scope:**

Nutzer-Identität, OBS-Steuerung, Webhooks, n8n-Integration, Persistenz, eigenes Relay.
Das sind weitere Ausbauschritte.
