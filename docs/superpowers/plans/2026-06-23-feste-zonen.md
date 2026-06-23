# Feste Zonen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen zweiten Overlay-Modus `zones` bauen, in dem feste, in der Config per 4-Punkt-Klick platzierte Vierecke den Klick-Anteil messen und als Kreis (bestehendes `drawCircle`) am Zonen-Schwerpunkt rendern.

**Architecture:** `js/heat-overlay.js` bekommt vier neue reine Funktionen (`parseZones`, `pointInPolygon`, `centroid`, `tallyZones`) plus einen `createZoneRenderer`, der `drawCircle` wiederverwendet. `init()`/`frame()` verzweigt nach `mode`. `config.html` bekommt einen Modus-Umschalter und einen Zonen-Editor (4-Punkt-Erfassung auf einer 16:9-Stage mit optionalem Referenzbild). Zonen reisen als kompakter URL-Param.

**Tech Stack:** Vanilla JS (IIFE, kein Build), HTML/CSS, Canvas 2D. Tests: Node v20 eingebauter Test-Runner (`node --test`, `node:test`/`node:assert`) — keine Dependencies.

## Global Constraints

- Kein Build-Step, kein Server, keine npm-Dependencies. Auch keine Test-Dependencies — nur Node-Builtins.
- Bestehender `cluster`-Modus bleibt unverändert (Default).
- Klick- und Zonen-Koordinaten sind normalisiert `0..1`.
- Zone-Repräsentation überall: Array von genau 4 Punkten `[{x,y},{x,y},{x,y},{x,y}]`.
- URL-Zonenformat: pro Zone `x1,y1,x2,y2,x3,y3,x4,y4`, Zonen durch `;` getrennt, auf 4 Nachkommastellen gerundet.
- `js/heat-overlay.js` muss sowohl im Browser (`<script src>`) als auch via `require()` in Node ladbar sein: `window`-Zuweisung guarden, reine Funktionen via `module.exports` exportieren.
- DOM/Canvas-Tasks werden manuell im Browser verifiziert (kein Browser-Test-Framework — würde das Dependency-Verbot brechen).
- Commit-Messages enden mit `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Dateienüberblick

| Datei | Änderung | Verantwortung |
|-------|----------|---------------|
| `js/heat-overlay.js` | modify | Zonen-Parser, Geometrie, `tallyZones`, `createZoneRenderer`, Modus-Weiche, Node-Export |
| `test/heat-overlay.test.js` | create | Node-Tests für die reinen Zonen-Funktionen |
| `config.html` | modify | Modus-Umschalter, Zonenliste, 4-Punkt-Editor, Referenzbild, URL-Bau, localStorage |
| `CLAUDE.md` | modify | Param-Tabelle + Datenfluss-Notiz |
| `README.md` | modify | Param-Tabelle |
| `overlay.html` | — | keine Änderung nötig |

---

## Task 1: Test-Harness + `parseZones`

**Files:**
- Modify: `js/heat-overlay.js` (neue Funktion `parseZones` im IIFE; Node-Export-Guard am Dateiende)
- Test: `test/heat-overlay.test.js` (neu)

**Interfaces:**
- Produces: `parseZones(str: string): Array<Array<{x:number,y:number}>>` — jede innere Liste hat genau 4 Punkte; ungültige/unvollständige Segmente werden verworfen.
- Produces (Datei): `module.exports = { parseZones }` (in späteren Tasks erweitert).

- [ ] **Step 1: Node-Export-Guard am Ende von `js/heat-overlay.js` einbauen**

Ersetze die letzte Zeile `  window.HeatOverlay = { init };` durch:

```js
  if (typeof window !== 'undefined') window.HeatOverlay = { init };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseZones };
  }
```

(`init` ist weiterhin in Scope; der Browser-Pfad bleibt identisch. `module` existiert nur unter Node.)

- [ ] **Step 2: `parseZones` direkt vor dem Bootstrap-Abschnitt (`// ---- Bootstrap`) einfügen**

```js
  // ---- Zonen: URL-String -> Liste von 4-Punkt-Vierecken --------------------
  function parseZones(str) {
    if (!str) return [];
    return String(str).split(';').map((seg) => {
      const n = seg.split(',').map((v) => parseFloat(v));
      if (n.length !== 8 || n.some((v) => !Number.isFinite(v))) return null;
      return [
        { x: n[0], y: n[1] },
        { x: n[2], y: n[3] },
        { x: n[4], y: n[5] },
        { x: n[6], y: n[7] },
      ];
    }).filter(Boolean);
  }
```

- [ ] **Step 3: Test-Datei `test/heat-overlay.test.js` schreiben**

```js
const test = require('node:test');
const assert = require('node:assert');
const { parseZones } = require('../js/heat-overlay.js');

test('parseZones: leerer/fehlender Input ergibt []', () => {
  assert.deepStrictEqual(parseZones(''), []);
  assert.deepStrictEqual(parseZones(null), []);
  assert.deepStrictEqual(parseZones(undefined), []);
});

test('parseZones: eine gültige Zone wird zu 4 Punkten', () => {
  const zones = parseZones('0.1,0.2,0.3,0.2,0.3,0.5,0.1,0.5');
  assert.strictEqual(zones.length, 1);
  assert.deepStrictEqual(zones[0], [
    { x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 },
    { x: 0.3, y: 0.5 }, { x: 0.1, y: 0.5 },
  ]);
});

test('parseZones: mehrere Zonen per Semikolon', () => {
  const zones = parseZones('0,0,1,0,1,1,0,1;0.2,0.2,0.4,0.2,0.4,0.4,0.2,0.4');
  assert.strictEqual(zones.length, 2);
});

test('parseZones: kaputte Segmente werden verworfen, gültige bleiben', () => {
  const zones = parseZones('0,0,1,0,1,1,0,1;1,2,3;abc');
  assert.strictEqual(zones.length, 1);
});
```

- [ ] **Step 4: Tests laufen lassen — müssen grün sein**

Run: `node --test`
Expected: 4 Tests `pass`, 0 `fail`.

- [ ] **Step 5: Commit**

```bash
git add js/heat-overlay.js test/heat-overlay.test.js
git commit -m "feat(zones): parseZones + Node-Test-Harness

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `pointInPolygon` + `centroid`

**Files:**
- Modify: `js/heat-overlay.js` (zwei reine Funktionen; Export erweitern)
- Test: `test/heat-overlay.test.js`

**Interfaces:**
- Consumes: nichts aus früheren Tasks.
- Produces: `pointInPolygon(pt: {x,y}, poly: Array<{x,y}>): boolean` (Ray-Casting, funktioniert auch nicht-konvex).
- Produces: `centroid(poly: Array<{x,y}>): {x:number,y:number}` (Mittel der Eckpunkte).

- [ ] **Step 1: Failing Tests ergänzen (ans Ende von `test/heat-overlay.test.js`)**

```js
const { pointInPolygon, centroid } = require('../js/heat-overlay.js');
const unitSquare = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

test('pointInPolygon: Punkt innen', () => {
  assert.strictEqual(pointInPolygon({ x: 0.5, y: 0.5 }, unitSquare), true);
});

test('pointInPolygon: Punkt außen', () => {
  assert.strictEqual(pointInPolygon({ x: 1.5, y: 0.5 }, unitSquare), false);
});

test('pointInPolygon: nicht-konvexes Viereck', () => {
  // Pfeil-/Dart-Form (eine Ecke nach innen gezogen)
  const dart = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 0.4 }, { x: 1, y: 1 }];
  assert.strictEqual(pointInPolygon({ x: 0.2, y: 0.5 }, dart), true);
  assert.strictEqual(pointInPolygon({ x: 0.8, y: 0.5 }, dart), false);
});

test('centroid: Einheitsquadrat -> Mitte', () => {
  assert.deepStrictEqual(centroid(unitSquare), { x: 0.5, y: 0.5 });
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `node --test`
Expected: FAIL — `pointInPolygon is not a function` / `centroid is not a function`.

- [ ] **Step 3: Funktionen in `js/heat-overlay.js` direkt nach `parseZones` einfügen**

```js
  // Standard-Ray-Casting; korrekt auch für nicht-konvexe Vierecke.
  function pointInPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const hit = ((yi > pt.y) !== (yj > pt.y)) &&
        (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  function centroid(poly) {
    let sx = 0, sy = 0;
    for (const p of poly) { sx += p.x; sy += p.y; }
    return { x: sx / poly.length, y: sy / poly.length };
  }
```

- [ ] **Step 4: Export erweitern**

Ändere `module.exports = { parseZones };` zu:

```js
    module.exports = { parseZones, pointInPolygon, centroid };
```

- [ ] **Step 5: Tests laufen lassen — müssen grün sein**

Run: `node --test`
Expected: alle Tests `pass`.

- [ ] **Step 6: Commit**

```bash
git add js/heat-overlay.js test/heat-overlay.test.js
git commit -m "feat(zones): pointInPolygon + centroid

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `tallyZones`

**Files:**
- Modify: `js/heat-overlay.js` (`tallyZones`; Export erweitern)
- Test: `test/heat-overlay.test.js`

**Interfaces:**
- Consumes: `pointInPolygon`, `centroid` (Task 2).
- Produces: `tallyZones(clicks: Array<{x,y}>, zones: Array<Array<{x,y}>>): Array<{x,y,count,share}>` — ein Eintrag pro Zone (index-gleich), `x`/`y` = Schwerpunkt, `share = count/total` (Nenner = alle Klicks), bei `total === 0` ist `share === 0`. Alle Zonen werden zurückgegeben, auch leere.

- [ ] **Step 1: Failing Tests ergänzen**

```js
const { tallyZones } = require('../js/heat-overlay.js');

test('tallyZones: Shares über alle Klicks, eine Zone pro Eingang', () => {
  const left = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 0, y: 1 }];
  const right = [{ x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 1 }];
  const clicks = [{ x: 0.1, y: 0.5 }, { x: 0.2, y: 0.5 }, { x: 0.9, y: 0.5 }, { x: 0.99, y: 0.99 }];
  const out = tallyZones(clicks, [left, right]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].count, 2);
  assert.strictEqual(out[0].share, 0.5);
  assert.strictEqual(out[1].count, 2);
  assert.ok(Math.abs(out[0].x - 0.25) < 1e-9); // Schwerpunkt linke Zone
});

test('tallyZones: überlappende Zonen zählen denselben Klick doppelt', () => {
  const big = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const small = [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.6 }, { x: 0.4, y: 0.6 }];
  const out = tallyZones([{ x: 0.5, y: 0.5 }], [big, small]);
  assert.strictEqual(out[0].count, 1);
  assert.strictEqual(out[1].count, 1);
});

test('tallyZones: keine Klicks -> share 0, Zonen bleiben erhalten', () => {
  const z = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const out = tallyZones([], [z]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].count, 0);
  assert.strictEqual(out[0].share, 0);
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `node --test`
Expected: FAIL — `tallyZones is not a function`.

- [ ] **Step 3: `tallyZones` in `js/heat-overlay.js` nach `centroid` einfügen**

```js
  // Zählt Klicks je Zone (Point-in-Polygon). Nenner = alle Klicks im Fenster.
  // Zonen dürfen überlappen; ein Klick zählt in jede ihn enthaltende Zone.
  function tallyZones(clicks, zones) {
    const total = clicks.length;
    return zones.map((poly) => {
      let count = 0;
      if (total) for (const c of clicks) { if (pointInPolygon(c, poly)) count++; }
      const ctr = centroid(poly);
      return { x: ctr.x, y: ctr.y, count, share: total ? count / total : 0 };
    });
  }
```

- [ ] **Step 4: Export erweitern**

```js
    module.exports = { parseZones, pointInPolygon, centroid, tallyZones };
```

- [ ] **Step 5: Tests laufen lassen — müssen grün sein**

Run: `node --test`
Expected: alle Tests `pass`.

- [ ] **Step 6: Commit**

```bash
git add js/heat-overlay.js test/heat-overlay.test.js
git commit -m "feat(zones): tallyZones (Point-in-Polygon-Shares)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Overlay-Integration (`readConfig`, `createZoneRenderer`, Modus-Weiche)

**Files:**
- Modify: `js/heat-overlay.js` (`readConfig`, `createZoneRenderer`, `init`)

**Interfaces:**
- Consumes: `parseZones`, `tallyZones` (Tasks 1, 3); bestehendes `drawCircle`, `createBuffer`, `setupCanvas`, Sources.
- Produces: `createZoneRenderer(canvas): { track(zones), draw() }` — `track` nimmt die `tallyZones`-Ausgabe (Array mit `{x,y,share}`), `draw` rendert je Zone einen Kreis via `drawCircle`. Positionen sind fix; `share`/Opacity werden weich interpoliert.

**Verifikation:** manuell im Browser (kein DOM-Testframework).

- [ ] **Step 1: `readConfig` um `mode` und `zones` erweitern**

Im `return {...}`-Objekt von `readConfig` (nach `status: ...`) ergänzen:

```js
      mode: p.get('mode') === 'zones' ? 'zones' : 'cluster',
      zones: parseZones(p.get('zones')),
```

- [ ] **Step 2: `createZoneRenderer` direkt vor `// ---- Canvas an Device-Pixel anpassen` einfügen**

```js
  // ---- ZoneRenderer: fixe Kreise an Zonen-Schwerpunkten -------------------
  function createZoneRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    let visuals = []; // index-gleich zu den Zonen: {x,y, share,tshare, op}
    const MOVE = 0.18; // Anteil-Lerp
    const FADE = 0.08; // Opacity-Lerp

    function track(zones) {
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        if (!visuals[i]) visuals[i] = { x: z.x, y: z.y, share: z.share, tshare: z.share, op: 0 };
        visuals[i].x = z.x; // Position ist fix (Schwerpunkt)
        visuals[i].y = z.y;
        visuals[i].tshare = z.share;
      }
      visuals.length = zones.length; // entfernte Zonen fallen weg
    }

    function draw() {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      for (const v of visuals) {
        v.share += (v.tshare - v.share) * MOVE;
        v.op += (1 - v.op) * FADE;
      }
      // Größte zuletzt zeichnen, damit sie oben liegt.
      const ordered = visuals.slice().sort((a, b) => a.share - b.share);
      for (const v of ordered) drawCircle(ctx, v, W, H);
    }

    return { track, draw };
  }
```

(`drawCircle` liest `v.x, v.y, v.share, v.op` — alle vorhanden.)

- [ ] **Step 3: Modus-Weiche in `init()` einbauen**

Ersetze in `init()` den Block ab `const renderer = createRenderer(canvas);` bis zum abschließenden `requestAnimationFrame(frame);` durch:

```js
    if (cfg.mode === 'zones') {
      const zoneRenderer = createZoneRenderer(canvas);
      const zoneFrame = () => {
        const clicks = buffer.current();
        zoneRenderer.track(tallyZones(clicks, cfg.zones));
        zoneRenderer.draw();
        requestAnimationFrame(zoneFrame);
      };
      requestAnimationFrame(zoneFrame);
    } else {
      const renderer = createRenderer(canvas);
      const frame = () => {
        const clicks = buffer.current();
        const clusters = cluster(clicks, cfg.mergeRadius, cfg.maxCircles, cfg.threshold);
        renderer.track(clusters);
        renderer.draw();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
```

- [ ] **Step 4: Node-Tests weiterhin grün (Regression)**

Run: `node --test`
Expected: alle bisherigen Tests `pass` (kein Browser nötig — nur Sicherstellung, dass die Datei syntaktisch lädt).

- [ ] **Step 5: Manuell im Browser verifizieren**

Öffne im Browser (Doppelklick auf Datei genügt):
`overlay.html?sim=1&autoclicks=30&mode=zones&zones=0.05,0.05,0.45,0.05,0.45,0.95,0.05,0.95;0.55,0.05,0.95,0.05,0.95,0.95,0.55,0.95&status=1`

Erwartung:
- Zwei Kreise erscheinen, zentriert in linker bzw. rechter Bildhälfte (Schwerpunkte ~25%/50% und ~75%/50%).
- Prozentwerte summieren sich grob zu ~100% (Sim streut über beide Hälften).
- Klickt man manuell viel in eine Hälfte, wächst dort der Kreis/Prozent.
- Ohne `mode=zones` (oder `mode=cluster`) verhält sich das Overlay exakt wie bisher (Cluster).

- [ ] **Step 6: Commit**

```bash
git add js/heat-overlay.js
git commit -m "feat(zones): Overlay-Modus zones (readConfig, ZoneRenderer, Weiche)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Config — Modus-Umschalter, Zonenliste, URL-/localStorage-Plumbing

**Files:**
- Modify: `config.html` (HTML-Fieldsets + Script: State, Rendering der Liste, `buildParams`, `writeForm`/`readForm`, localStorage)

**Interfaces:**
- Consumes: bestehendes Overlay (Task 4) liest `mode`/`zones` aus der URL.
- Produces (Script-intern): `state.mode: 'cluster'|'zones'`, `state.zones: Array<{points: Array<{x,y}>}>` (0–4 Punkte je Zone); `encodeZones(zones): string` und `renderZoneList()`. Task 6 hängt die 4-Punkt-Erfassung an dieselbe Struktur.

**Verifikation:** manuell im Browser.

- [ ] **Step 1: Modus-Fieldset + Zonen-Fieldset ins HTML einfügen**

Direkt nach dem öffnenden `<form class="panel" id="form">`-Titelblock (nach dem `</div>` des `<h1>`-Blocks, vor `<fieldset><legend>Quelle</legend>`) einfügen:

```html
    <fieldset>
      <legend>Modus</legend>
      <div class="field">
        <label for="mode">Overlay-Modus</label>
        <select id="mode">
          <option value="cluster">Cluster (automatische Hotspots)</option>
          <option value="zones">Zonen (feste Vierecke)</option>
        </select>
        <div class="hint">„Zonen" misst Klick-Anteile in selbst platzierten Bereichen.</div>
      </div>
    </fieldset>
```

Direkt vor dem `<fieldset><legend>OBS-URL</legend>`-Block einfügen:

```html
    <fieldset id="zonesFs">
      <legend>Zonen</legend>
      <div id="zoneList"></div>
      <button type="button" class="secondary" id="addZoneBtn">+ Zone hinzufügen</button>
      <div class="hint" style="margin-top:8px">
        „Editieren" → 4 Punkte in der Vorschau anklicken. Reihenfolge im Uhrzeigersinn empfohlen.
      </div>
    </fieldset>
```

- [ ] **Step 2: CSS für die Zonenliste ergänzen (im `<style>`-Block, vor `/* Vorschau */`)**

```css
    .zone-row { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--line); }
    .zone-row:last-of-type { border-bottom: 0; }
    .zone-row .name { flex: 1; font-size: 13px; }
    .zone-row .state { font-size: 11.5px; color: var(--muted); }
    .zone-row button { padding: 6px 10px; font-size: 12px; }
    .zone-row.editing { outline: 1px solid var(--accent); border-radius: 6px; }
```

- [ ] **Step 3: Script-State und Zonenliste-Rendering einbauen**

Ersetze im `<script>` die Zeile
`const fields = ['channel', 'sim', 'autoclicks', 'window', 'threshold', 'maxCircles', 'mergeRadius', 'status'];`
durch:

```js
    const fields = ['channel', 'sim', 'autoclicks', 'window', 'threshold', 'maxCircles', 'mergeRadius', 'status', 'mode'];
    const round4 = (v) => Math.round(v * 1e4) / 1e4;
    let state = { zones: [] }; // zones: [{ points: [{x,y}, ...] }]  (0..4 Punkte)
    let editingIndex = null;   // von Task 6 genutzt

    function encodeZones(zones) {
      return zones
        .filter((z) => z.points.length === 4)
        .map((z) => z.points.map((p) => round4(p.x) + ',' + round4(p.y)).join(','))
        .join(';');
    }

    function renderZoneList() {
      const list = el('zoneList');
      list.innerHTML = '';
      state.zones.forEach((z, i) => {
        const row = document.createElement('div');
        row.className = 'zone-row' + (editingIndex === i ? ' editing' : '');
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = 'Zone ' + (i + 1);
        const st = document.createElement('span');
        st.className = 'state';
        st.textContent = z.points.length + '/4';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'secondary';
        edit.textContent = editingIndex === i ? 'Klicke 4 Punkte …' : 'Editieren';
        edit.addEventListener('click', () => startEdit(i));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'secondary';
        del.textContent = 'Löschen';
        del.addEventListener('click', () => {
          state.zones.splice(i, 1);
          if (editingIndex === i) editingIndex = null;
          renderZoneList();
          update();
        });
        row.append(name, st, edit, del);
        list.appendChild(row);
      });
    }
```

- [ ] **Step 4: Platzhalter-`startEdit` einfügen (wird in Task 6 ersetzt)**

Damit der „Editieren"-Button in diesem Task nicht crasht, vorläufig:

```js
    function startEdit(i) { editingIndex = i; renderZoneList(); }
```

- [ ] **Step 5: „+ Zone hinzufügen", Modus-Sichtbarkeit, `buildParams`, `readForm`/`writeForm` erweitern**

„Add"-Handler und Modus-Sichtbarkeit (nach den bestehenden Event-Bindings, z. B. nach dem `fields.forEach(...)`-Block) ergänzen:

```js
    el('addZoneBtn').addEventListener('click', () => {
      state.zones.push({ points: [] });
      renderZoneList();
      update();
    });

    function applyModeVisibility() {
      el('zonesFs').style.display = el('mode').value === 'zones' ? '' : 'none';
    }
```

In `buildParams(v, forceStatus)` vor `return p.toString();` einfügen:

```js
      if (v.mode === 'zones') {
        p.set('mode', 'zones');
        const z = encodeZones(state.zones);
        if (z) p.set('zones', z);
      }
```

In `readForm()` das zurückgegebene Objekt um `mode: el('mode').value` ergänzen.

In `writeForm(v)` ergänzen: `el('mode').value = v.mode || 'cluster';`

- [ ] **Step 6: Zonen in localStorage persistieren + beim Laden wiederherstellen**

In `update()` direkt nach `const v = readForm();` die Persistenz erweitern — ersetze
`localStorage.setItem(STORE_KEY, JSON.stringify(v));`
durch:

```js
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...v, zones: state.zones }));
      applyModeVisibility();
```

Im Init-Block am Dateiende ersetze
`try { writeForm(JSON.parse(localStorage.getItem(STORE_KEY))); } catch (e) { /* noop */ }`
durch:

```js
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved) {
        writeForm(saved);
        if (Array.isArray(saved.zones)) state.zones = saved.zones;
      }
    } catch (e) { /* noop */ }
    renderZoneList();
```

- [ ] **Step 7: Manuell im Browser verifizieren**

Öffne `config.html`. Erwartung:
- Modus-Dropdown vorhanden; bei „Cluster" ist das Zonen-Fieldset ausgeblendet, bei „Zonen" sichtbar.
- „+ Zone hinzufügen" fügt „Zone 1" mit Status `0/4` hinzu; „Löschen" entfernt sie.
- Im Zonen-Modus ohne vollständige Zonen enthält die OBS-URL `mode=zones`, aber keinen `zones`-Param.
- Reload behält Modus und Zonen-Einträge (localStorage).
- „Editieren" markiert die Zeile (Platzhalter), ohne Fehler in der Konsole.

- [ ] **Step 8: Commit**

```bash
git add config.html
git commit -m "feat(zones): Config-Modus-Umschalter + Zonenliste + URL/localStorage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Config — 4-Punkt-Editor auf 16:9-Stage mit Referenzbild

**Files:**
- Modify: `config.html` (Stage-HTML/CSS, Editor-Canvas, Referenzbild, `startEdit`/Erfassungslogik ersetzt den Platzhalter aus Task 5)

**Interfaces:**
- Consumes: `state.zones`, `editingIndex`, `renderZoneList`, `update`, `round4` (Task 5).
- Produces: voll funktionsfähiges `startEdit(i)`; schreibt 4 normalisierte Punkte in `state.zones[i].points`.

**Verifikation:** manuell im Browser.

- [ ] **Step 1: Stage auf 16:9 fixieren + Editor-Layer-CSS (im `<style>`-Block)**

Ändere die `.stage`-Regel: ersetze `flex: 1;` durch `width: 100%; aspect-ratio: 16 / 9;`.

Ergänze danach:

```css
    .editor-bg, .editor-layer { position: absolute; inset: 0; width: 100%; height: 100%; display: none; }
    .editor-bg { object-fit: fill; z-index: 2; }
    .editor-layer { z-index: 3; cursor: crosshair; }
    body.editing .editor-layer { display: block; }
    .editor-toolbar { display: flex; gap: 8px; align-items: center; }
    .editor-toolbar .note { flex: 1; }
```

- [ ] **Step 2: Editor-Elemente ins Stage-HTML einfügen**

Ersetze
`<div class="stage"><iframe id="preview" title="Overlay-Vorschau"></iframe></div>`
durch:

```html
    <div class="stage">
      <iframe id="preview" title="Overlay-Vorschau"></iframe>
      <img id="refImage" class="editor-bg" alt="">
      <canvas id="editor" class="editor-layer"></canvas>
    </div>
    <div class="editor-toolbar">
      <span class="note" id="editorHint">Im Zonen-Modus „Editieren" wählen, dann 4 Punkte klicken.</span>
      <button type="button" class="secondary" id="refBtn">Referenzbild laden</button>
      <input type="file" id="refInput" accept="image/*" style="display:none">
    </div>
```

- [ ] **Step 3: `startEdit` (Platzhalter aus Task 5) durch echte Erfassung ersetzen**

```js
    const editor = el('editor');
    const ectx = editor.getContext('2d');

    function startEdit(i) {
      editingIndex = i;
      state.zones[i].points = [];
      document.body.classList.add('editing');
      const ref = el('refImage');
      if (ref.src) ref.style.display = 'block'; // nur während des Editierens als Backdrop
      sizeEditor();
      drawEditor();
      renderZoneList();
    }

    function finishEdit() {
      editingIndex = null;
      document.body.classList.remove('editing');
      el('refImage').style.display = 'none'; // Live-Vorschau (Kreise) wieder freigeben
      renderZoneList();
      update();
    }

    function sizeEditor() {
      editor.width = editor.clientWidth;
      editor.height = editor.clientHeight;
    }

    function drawEditor() {
      ectx.clearRect(0, 0, editor.width, editor.height);
      if (editingIndex === null) return;
      const pts = state.zones[editingIndex].points;
      ectx.lineWidth = 2;
      ectx.strokeStyle = 'rgba(255,122,60,0.95)';
      ectx.fillStyle = 'rgba(255,122,60,0.95)';
      ectx.beginPath();
      pts.forEach((p, k) => {
        const x = p.x * editor.width, y = p.y * editor.height;
        if (k === 0) ectx.moveTo(x, y); else ectx.lineTo(x, y);
      });
      if (pts.length === 4) ectx.closePath();
      ectx.stroke();
      for (const p of pts) {
        ectx.beginPath();
        ectx.arc(p.x * editor.width, p.y * editor.height, 5, 0, Math.PI * 2);
        ectx.fill();
      }
    }

    editor.addEventListener('pointerdown', (e) => {
      if (editingIndex === null) return;
      const r = editor.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      const pts = state.zones[editingIndex].points;
      pts.push({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
      renderZoneList(); // Status n/4 aktualisieren
      drawEditor();
      if (pts.length === 4) finishEdit();
    });

    window.addEventListener('resize', () => { if (editingIndex !== null) { sizeEditor(); drawEditor(); } });
```

- [ ] **Step 4: Referenzbild-Laden verdrahten**

```js
    el('refBtn').addEventListener('click', () => el('refInput').click());
    el('refInput').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const img = el('refImage');
      img.src = URL.createObjectURL(file);
      if (editingIndex !== null) img.style.display = 'block'; // nur im Editiermodus zeigen
    });
```

- [ ] **Step 5: Manuell im Browser verifizieren**

Öffne `config.html`, Modus „Zonen":
- „+ Zone hinzufügen", dann „Editieren": Zeile markiert, Status zeigt hochzählend `1/4 … 4/4`.
- 4 Klicks in die Vorschau zeichnen Punkte + verbindendes Viereck; nach dem 4. Klick endet der Editiermodus automatisch.
- Danach erscheint in der Live-Vorschau ein Kreis im Schwerpunkt der Zone (Sim-Klicks vorausgesetzt: `sim` an, `autoclicks` z. B. 30); die OBS-URL enthält jetzt `zones=…`.
- „Referenzbild laden" zeigt ein gewähltes Bild formatfüllend (16:9) als Hintergrund; Klicks landen passgenau darauf.
- „Editieren" einer bestehenden Zone setzt die Punkte zurück und erlaubt Neusetzen.

- [ ] **Step 6: Commit**

```bash
git add config.html
git commit -m "feat(zones): 4-Punkt-Editor mit Referenzbild auf 16:9-Stage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Dokumentation (CLAUDE.md + README.md)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: `CLAUDE.md` — Param-Tabelle erweitern**

Füge in der Tabelle „URL-Parameter (overlay.html)" nach der `status`-Zeile zwei Zeilen ein:

```markdown
| `mode`       | `cluster` | `zones` aktiviert feste Zonen statt Auto-Cluster. |
| `zones`      | —       | Feste Vierecke `x1,y1,…,x4,y4`, Zonen per `;` getrennt (nur `mode=zones`). |
```

- [ ] **Step 2: `CLAUDE.md` — Datenfluss-Notiz ergänzen**

Ergänze unter dem „Datenfluss"-Abschnitt nach dem Code-Block einen Absatz:

```markdown
Im Modus `zones` ersetzt `tallyZones(clicks, zones)` das Clustern: pro fester Zone
(4-Punkt-Viereck) wird der Klick-Anteil im Fenster gezählt und via `createZoneRenderer`
als Kreis am Zonen-Schwerpunkt gerendert (Umriss nur im Config-Editor). `cluster` bleibt
der Default-Modus.
```

- [ ] **Step 3: `README.md` — Param-Tabelle erweitern**

Füge in der Tabelle „URL-Parameter (overlay.html)" nach der `status`-Zeile ein:

```markdown
| `mode`       | `cluster` | `zones` = feste Zonen statt Auto-Cluster. |
| `zones`      | —       | Feste Vierecke `x1,y1,…,x4,y4`, mehrere durch `;` (nur `mode=zones`). |
```

- [ ] **Step 4: Verifizieren**

Run: `git diff --stat`
Expected: `CLAUDE.md` und `README.md` geändert; keine offenen Platzhalter (`grep -n "TODO\|TBD" CLAUDE.md README.md` liefert nichts).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs(zones): mode/zones-Parameter dokumentieren

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Abschluss-Verifikation (nach allen Tasks)

- [ ] `node --test` → alle Tests grün.
- [ ] `overlay.html?sim=1&autoclicks=30&mode=zones&zones=…` zeigt Kreise an den Zonen-Schwerpunkten.
- [ ] `config.html`: kompletter Flow (Modus wählen → Zone hinzufügen → 4 Punkte klicken → Kreis in Vorschau → URL kopieren) funktioniert.
- [ ] `overlay.html` ohne `mode`/mit `mode=cluster` verhält sich unverändert (Regression).
