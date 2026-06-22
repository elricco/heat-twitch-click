# Heat Click-Cluster Overlay — Design (PoC)

**Datum:** 2026-06-22
**Status:** genehmigt, in Umsetzung

## Ziel

Ein OBS-Overlay, das Zuschauer-Klicks auf den Twitch-Videoplayer (geliefert von der
[Heat](https://github.com/scottgarner/Heat) Extension) live zu Hotspot-Kreisen clustert.
Bis zu 5 Kreise; jeder zeigt seinen prozentualen Anteil an den Klicks innerhalb eines
gleitenden Zeitfensters. Ein Kreis erscheint erst ab einem Mindestanteil (Threshold).

Reiner Proof of Concept: nur Visualisierung. **Keine** Aktions-Schicht, **keine**
Persistenz, **keine** Auswertung der Nutzer-Identität.

## Heat — verifizierte Fakten (aus dem Repo)

- WebSocket: `wss://heat-api.j38.net/channel/<channelId>` (channelId = numerische Twitch-User-ID).
- Klick-Nachricht (JSON): `{ type: "click", x, y, id }`.
- `x`, `y` sind **normalisiert (0..1)** relativ zur Videofläche → auflösungsunabhängig.
- `id` = Twitch-User-ID, oder `A…` (anonym) / `U…` (nicht geteilt). Im PoC ungenutzt.
- Offizieller Client reconnectet nach 1 s bei Verbindungsabbruch.

## Architektur

Selbst-enthaltenes statisches Projekt, kein Build, kein Server. Logik getrennt von der
HTML-Hülle, damit das Overlay sowohl in OBS als auch im Config-iframe identisch läuft.

```
Datenquelle (HeatSource | SimSource)  --onClick(x,y)-->  Buffer (gleitendes Fenster)
                                                              |
   jeden Frame (requestAnimationFrame):  Buffer.current() -> Clusterer -> Renderer
```

### Bausteine (`js/heat-overlay.js`)

1. **Source** — gemeinsames Interface `onClick(x, y)`, beide normalisiert 0..1.
   - `HeatSource`: WebSocket, parst `click`-Events, Auto-Reconnect nach 1 s.
   - `SimSource`: echte Pointer-Klicks aufs Canvas + optionale Auto-Klicks, die um
     3–5 driftende Hotspots gestreut werden (Demo ohne Publikum).
2. **Buffer** — hält Klicks der letzten `windowMs`, verwirft ältere bei jedem Tick.
3. **Clusterer** — Greedy-Radius-Merge: jeder Klick geht in den nächsten Cluster
   innerhalb `mergeRadius` (sonst neuer Cluster); Schwerpunkt inkrementell gemittelt.
   Sortiert nach Größe, `slice(maxCircles)`, filtert `share < threshold` raus.
   `share = clusterKlicks / gesamtKlicksImFenster`.
4. **Renderer** — Canvas. Matcht Cluster über Frames per Nähe an bestehende Visuals,
   interpoliert Position/Anteil/Opacity weich (Kreise gleiten & faden statt zu springen).
   Stil **Ring + Label**: halbtransparente Füllung, kräftiger Ring, große Prozentzahl
   mittig; Radius skaliert mit Anteil.

### Dateien

```
overlay.html         OBS-Overlay (transparent, Canvas vollflächig)
config.html          Einstell-UI + Live-Vorschau + OBS-URL-Generator (localStorage)
js/heat-overlay.js   source / buffer / clusterer / renderer + init()
CLAUDE.md            Projektdoku
.gitignore
docs/superpowers/specs/2026-06-22-heat-click-cluster-overlay-design.md
```

## URL-Parameter (alle optional, live nachjustierbar)

| Param        | Default | Bedeutung |
|--------------|---------|-----------|
| `channel`    | —       | Twitch-Channel-ID für Live-Heat. Fehlt sie, läuft Sim-Modus. |
| `sim`        | `0`     | `1` erzwingt Sim-Modus (ignoriert `channel`). |
| `autoclicks` | `0`     | Sim: automatische Klicks pro Sekunde (0 = nur echte Mausklicks). |
| `window`     | `12`    | Gleitendes Fenster in Sekunden. |
| `threshold`  | `10`    | Mindestanteil in % für einen Kreis. |
| `maxCircles` | `5`     | Max. Anzahl Kreise. |
| `mergeRadius`| `8`     | Cluster-Merge-Radius in % der Breite (normalisierte Einheiten). |
| `status`     | `0`     | `1` zeigt ein kleines Status-Badge (Verbindung/Modus). |

## Config-Seite (`config.html`)

- Formular für alle Parameter oben; Werte in `localStorage` gemerkt.
- Live-`<iframe>` mit `overlay.html?…&status=1` auf Karo-Hintergrund (Transparenz prüfbar),
  aktualisiert bei jeder Änderung.
- „OBS-URL kopieren": baut die absolute `overlay.html?…`-URL und kopiert sie in die Zwischenablage.

## Bewusst ausgelassen (YAGNI)

Identitäts-/`id`-Auswertung, Aktions-Schicht (OBS-Steuerung, Webhooks, n8n),
Persistenz, eigenes Relay/Backend, Anti-Spam jenseits des Zeitfensters.

## Bekannte PoC-Vereinfachungen

- `mergeRadius` arbeitet in normalisierten Einheiten; da das Bild nicht quadratisch ist,
  entspricht gleiche normalisierte Distanz nicht exakt gleicher Pixeldistanz. Für den PoC ok.
- Keine Glättung von Klick-Bursts außer dem Zeitfenster.
