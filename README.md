# Heat Click-Cluster Overlay

Ein OBS-Overlay, das Zuschauer-Klicks auf den Twitch-Videoplayer live zu Hotspot-Kreisen
clustert. Die Klick-Daten liefert die [Heat](https://github.com/scottgarner/Heat) Twitch
Extension. Bis zu 5 Kreise; jeder zeigt seinen prozentualen Anteil an den Klicks innerhalb
eines gleitenden Zeitfensters. Ein Kreis erscheint erst ab einem Mindestanteil (Threshold).

Reiner Proof of Concept: nur Visualisierung — kein Backend, keine Dependencies, kein Build.

![Stil: Ring + Prozent-Label, Cluster wandern weich mit der Crowd]

## Schnellstart

1. **`config.html` öffnen** (Doppelklick genügt, oder über einen lokalen Server – siehe unten).
2. **Sim-Modus** anhaken und **Auto-Klicks** auf z. B. `30` stellen → in der Live-Vorschau
   entstehen Kreise. Alternativ: für Live-Betrieb die **Twitch-Channel-ID** eintragen.
3. **„Kopieren"** klickt die fertige OBS-URL in die Zwischenablage.
4. In **OBS**: `+` → *Browser* → URL einfügen, Breite/Höhe = Stream-Auflösung (z. B. 1920×1080),
   Hintergrund transparent lassen.

> Die Heat Extension muss vom Kanalinhaber im Twitch-Dashboard aktiviert sein, damit echte
> Klicks ankommen.

## Dateien

```
overlay.html          OBS-Overlay (transparent, vollflächiges Canvas)
config.html           Einstell-UI + Live-Vorschau + OBS-URL-Generator (merkt Werte in localStorage)
js/heat-overlay.js    Logik: source / buffer / clusterer / renderer
CLAUDE.md             Projektdoku
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

## Nicht im Scope (PoC)

Nutzer-Identität, Aktions-Schicht (OBS-Steuerung, Webhooks, n8n), Persistenz, eigenes Relay.
Das sind die nächsten Ausbauschritte.
