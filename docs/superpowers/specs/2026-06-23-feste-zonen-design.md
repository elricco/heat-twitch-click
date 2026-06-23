# Feste Zonen — Design

Ein zweiter Overlay-Modus neben dem bestehenden Auto-Cluster. Statt Klicks
automatisch zu Hotspots zu clustern, definiert der Nutzer in der Config **feste,
frei platzierte Vierecke** (Zonen). Im Overlay wird pro Zone gemessen, welcher
Anteil der Klicks im gleitenden Zeitfenster hineinfällt, und genau wie bisher als
Kreis (Ring + %-Label) visualisiert — nur sitzt der Kreis ortsfest im Zonen-Mittelpunkt.

Reiner Proof of Concept, konsistent zur bestehenden Architektur: kein Backend,
keine Persistenz außer `localStorage`-Komfort, keine Identitäts-Auswertung.

## Modus-Konzept

Neuer URL-Param `mode`:

- `cluster` (Default) — bisheriges Verhalten, unverändert.
- `zones` — neuer Zonen-Modus.

Beide Modi schließen sich aus (entweder/oder). In `cluster`-Modus läuft alles wie
heute; in `zones`-Modus wird `cluster()` **nicht** aufgerufen.

## Datenfluss (Zonen-Modus)

```
Source (HeatSource | SimSource) --onClick(x,y)--> Buffer (gleitendes Fenster)
   pro Frame: Buffer.current() -> tallyZones(clicks, zones) -> ZoneRenderer
```

Source und Buffer bleiben **unverändert**. Es kommen zwei neue, entkoppelte
Bausteine in `js/heat-overlay.js` dazu, symmetrisch zu `cluster` / `createRenderer`:

### `tallyZones(clicks, zones)`

- Zählt für jede Zone, wie viele Klicks im Viereck liegen (Point-in-Polygon).
- Liefert pro Zone `{ share }`; Nenner = **alle** Klicks im Fenster (wie der
  Cluster-`share`).
- Zonen dürfen sich überlappen; ein Klick zählt in **jede** ihn enthaltende Zone
  (Summe der Shares kann >100% sein).
- Klicks außerhalb aller Zonen tauchen nirgends auf.
- Alle definierten Zonen werden zurückgegeben, auch bei `share == 0`.

Point-in-Polygon: Standard-Ray-Casting über die 4 Eckpunkte (funktioniert auch für
nicht-konvexe Vierecke). Der Zonen-Schwerpunkt (Mittel der 4 Ecken) wird als
Zeichenposition mitgeführt.

### `createZoneRenderer(canvas)`

- Rendert pro Zone **genau einen Kreis** über das bestehende `drawCircle` —
  identisches Visual (Füllung + Ring + Prozent-Label).
- Position ist **fix** = Zonen-Schwerpunkt. Kein Cluster-Tracking nötig (im
  Gegensatz zu `createRenderer`).
- Kreisgröße wächst **frei** mit dem Anteil (gleiche Formel wie heute:
  `radius = minDim * (0.06 + share * 0.20)`), nicht auf die Zonengröße gedeckelt.
- `share` und Opacity werden weich interpoliert (gleiche Lerp-Konstanten wie der
  Cluster-Renderer), damit Werte nicht springen.
- Der **Viereck-Umriss wird im Overlay nicht gezeichnet** — nur die Kreise. Der
  Umriss existiert ausschließlich im Config-Editor als Platzierungshilfe.

`drawCircle` wird unverändert wiederverwendet.

## Parameter-Geltung im Zonen-Modus

| Param        | Im Zonen-Modus |
|--------------|----------------|
| `window`     | gilt (Klicks im Fenster). |
| `threshold`  | **ohne Wirkung** — alle Zonen werden gezeigt, auch 0%. |
| `maxCircles` | **ohne Wirkung**. |
| `mergeRadius`| **ohne Wirkung**. |
| `channel`/`sim`/`autoclicks`/`status` | unverändert. |

## URL-Datenformat

```
mode=zones
zones=x1,y1,x2,y2,x3,y3,x4,y4 ; <nächste Zone> ; …
```

- Pro Zone 4 Eckpunkte = 8 Zahlen, normalisiert 0..1, auf 4 Nachkommastellen
  gerundet (pixelgenau bei 1920 Breite).
- Zonen durch `;` getrennt, Zahlen innerhalb einer Zone durch `,`.
- Beispiel einer Zone: `0.10,0.20,0.30,0.20,0.30,0.50,0.10,0.50`.
- Parser in `overlay.html`: split `;` → je Segment 8 Floats parsen → 4 Punkte.
  Segmente, die nicht 8 gültige Zahlen ergeben, werden **verworfen** (defensive
  Robustheit, kein harter Fehler).
- Kein Base64 — bewusst lesbar/debugbar, passt zum schlanken Ethos. Für 5 Zonen
  ~240 Zeichen, unkritisch für eine URL.

### Ergänzung der Param-Tabelle (CLAUDE.md / README)

| Param   | Default   | Bedeutung |
|---------|-----------|-----------|
| `mode`  | `cluster` | `zones` aktiviert den Zonen-Modus. |
| `zones` | —         | Liste fester Vierecke (s. o.), nur in `mode=zones`. |

## Config-Editor (`config.html`)

### Modus-Umschalter

Ein Umschalter (Cluster / Zonen) oben in der Konfiguration. Bei `zones` erscheint
ein neues Fieldset „Zonen"; die Cluster-spezifischen Felder (`threshold`,
`maxCircles`, `mergeRadius`) bleiben sichtbar, sind aber im Zonen-Modus
funktionslos (dürfen ausgegraut werden — optional).

### Zonen-Fieldset

- **„+ Zone hinzufügen"** legt eine leere Zone an. Liste darunter: „Zone 1",
  „Zone 2" …
- Pro Zonen-Zeile:
  - **„Editieren"** — startet die 4-Punkt-Erfassung.
  - **„Löschen"** — entfernt die Zone.
  - Status-Anzeige: „0/4" … „4/4 Punkte".

### 4-Punkt-Erfassung

- „Editieren" aktiviert eine transparente **Klick-Ebene über der Vorschau-Stage**.
- Optionaler Button **„Referenzbild laden"** legt ein Standbild (lokale
  `URL.createObjectURL`) als Backdrop — reine Platzierungshilfe, **nicht** in der
  URL, nicht im Overlay.
- Der Nutzer klickt **4 Punkte**; jeder Klick setzt eine Ecke, das Viereck wird
  live mitgezeichnet (Punkte + verbindende Linien).
- Nach dem 4. Klick ist die Zone fertig, der Editiermodus endet automatisch.
- **Re-Editieren** = erneut „Editieren" → alle 4 Punkte neu setzen.
- Koordinaten werden relativ zur Stage normalisiert (0..1) gespeichert.

### Stage-Koordinatenraum

Die Vorschau-Stage wird auf **16:9 fixiert** (`aspect-ratio: 16/9`, ersetzt das
heutige `flex: 1`). Ein Referenzbild füllt sie formatfüllend (`object-fit: fill`).
Damit teilen sich Stage, Referenzbild und das echte 1920×1080-OBS-Output denselben
0..1-Koordinatenraum: ein Klick bei 50%/50% in der Config ist exakt die Bildmitte
im Stream. (Heat-Klicks sind ohnehin auf die Videofläche normalisiert.)

### Live-Vorschau

Der bestehende iframe der Stage erhält die Zonen über die generierte URL und zeigt
sofort die Kreise im Zonen-Modus (Sim-Klicks zählen pro Zone). Während des
Editierens liegt — falls geladen — das Referenzbild als Backdrop über dem iframe.

### Persistenz

Zonen werden zusätzlich in `localStorage` gespeichert (wie die übrigen
Config-Felder), damit sie Reloads überleben. Quelle der Wahrheit für OBS bleibt die
kopierte URL.

## Komponenten-Übersicht

| Baustein | Datei | Verantwortung |
|----------|-------|---------------|
| `tallyZones` | `js/heat-overlay.js` | Point-in-Polygon-Zählung, Shares pro Zone. |
| `createZoneRenderer` | `js/heat-overlay.js` | Kreise an Zonen-Schwerpunkten via `drawCircle`. |
| Zonen-Parser | `js/heat-overlay.js` | `zones`-Param → Liste von 4-Punkt-Vierecken. |
| Modus-Weiche | `js/heat-overlay.js` `init()`/`frame()` | wählt cluster- vs. zones-Pfad. |
| Zonen-Editor | `config.html` | Modus-Umschalter, Zonenliste, 4-Punkt-Erfassung, Referenzbild, URL-Bau. |

## Fehlerbehandlung & Randfälle

- Kaputte/unvollständige `zones`-Segmente werden verworfen, Overlay läuft weiter.
- `mode=zones` ohne `zones` → Overlay läuft, zeigt nichts (kein Fehler).
- Entartete Zone (alle 4 Punkte gleich / Nullfläche) → enthält nie Klicks,
  share = 0, harmlos.
- Überlappende Zonen sind erlaubt und gewollt.

## Bewusst NICHT im Scope (YAGNI)

- Eckpunkte einzeln per Drag verschieben (späteres Nice-to-have).
- Zonen-Namen/Labels (verworfen — nur Umriss + %).
- Umriss im Overlay (nur Kreis im Overlay).
- Mehr als 4 Punkte / beliebige Polygone.
- Cluster und Zonen gleichzeitig.
- Persistenz/Transport jenseits URL + `localStorage`.
