# Aktions-Zonen (Heat → Streamer.Bot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein dritter Overlay-Modus „Aktions-Zonen", der Heat-Klicks pro fester Zone zu einer Klick-Schwelle aggregiert und beim Überschreiten eine benannte Streamer.Bot-Action per WebSocket auslöst.

**Architecture:** Bestehende `js/heat-overlay.js` wird in fokussierte Module zerlegt (`heat-zones.js` = Geometrie, `heat-core.js` = Quellen+Buffer). Eine neue headless Bridge `actions.html` + `js/heat-actions.js` nutzt diese Module, wertet alle 250 ms Zonen-Schwellen aus (reine Funktion `evaluateZones`) und feuert per `DoAction` an Streamer.Bot. `config.html` bekommt den dritten Modus.

**Tech Stack:** Vanilla JS (kein Build, keine Dependencies), `node:test` für Unit-Tests, Web Crypto (`crypto.subtle`) für den optionalen Streamer.Bot-Auth-Handshake, headless Chrome zur DOM-Verifikation.

## Global Constraints

- Kein Build-Step, kein Server, keine Dependencies — Dateien laufen per `file://` und auf GitHub Pages.
- Alle geteilten JS-Module: Dual-Export — Browser `window.HeatX = {…}` UND Node `module.exports = {…}` (für Tests).
- Klick-Koordinaten sind normalisiert `0..1`.
- `cooldown` in Config & URL ist in **Sekunden**; intern in der Trigger-Maschine in **ms**.
- `rearm < enter` ist invariant (sonst Dauerfeuer) — bei `rearm >= enter` auf `max(0, enter-1)` klemmen.
- `enter|rearm|cooldown|<Action-Name>`-Felder pro Zone, Action-Name `encodeURIComponent`-kodiert; Zonen per `;`, index-gleich zur `zones`-Liste.
- Tests laufen mit `node --test`.
- Spec: `docs/superpowers/specs/2026-06-24-streamerbot-aktions-zonen-design.md`.

---

## File Structure

- `js/heat-zones.js` (NEU) — reine Geometrie: `parseZones`, `pointInPolygon`, `centroid`, `tallyZones`.
- `js/heat-core.js` (NEU) — I/O-Quellen + Buffer: `HeatSource`, `SimSource`, `createBuffer`.
- `js/heat-actions.js` (NEU) — `evaluateZones`, `parseActions`, `buildDoAction`, `sha256b64`, `computeAuth`, `createSbClient`, `init`.
- `js/heat-overlay.js` (GEÄNDERT) — Geometrie + Quellen/Buffer raus, konsumiert `window.HeatZones` / `window.HeatCore`.
- `actions.html` (NEU) — headless Bridge mit Status-Panel.
- `config.html` (GEÄNDERT) — dritter Modus „Aktions-Zonen".
- `overlay.html` (GEÄNDERT) — zusätzliche Script-Tags.
- `test/heat-zones.test.js` (NEU) — verschobene Geometrie-Tests.
- `test/heat-core.test.js` (NEU) — `createBuffer`-Fenster.
- `test/heat-actions.test.js` (NEU) — `evaluateZones`, `parseActions`, `buildDoAction`, `computeAuth`.
- `test/heat-overlay.test.js` (GELÖSCHT) — Inhalt wandert nach `heat-zones.test.js`.

---

### Task 1: Geometrie nach `js/heat-zones.js` extrahieren

**Files:**
- Create: `js/heat-zones.js`
- Create: `test/heat-zones.test.js` (Inhalt aus `test/heat-overlay.test.js`)
- Delete: `test/heat-overlay.test.js`
- Modify: `js/heat-overlay.js` (Geometrie + `module.exports` entfernen, Aufrufstellen auf `window.HeatZones` umstellen)
- Modify: `overlay.html` (Script-Tag vor `heat-overlay.js`)

**Interfaces:**
- Produces: `window.HeatZones` / `module.exports` = `{ parseZones(str)→Array<[{x,y}×4]>, pointInPolygon({x,y}, poly)→bool, centroid(poly)→{x,y}, tallyZones(clicks, zones)→Array<{x,y,count,share}> }`.

- [ ] **Step 1: `js/heat-zones.js` anlegen** (Funktionskörper unverändert aus heat-overlay.js übernehmen)

```js
/*
 * Heat — reine Zonen-Geometrie (keine DOM-/WS-Abhängigkeit).
 * Browser: window.HeatZones · Node: module.exports.
 */
(function () {
  'use strict';

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

  function tallyZones(clicks, zones) {
    const total = clicks.length;
    return zones.map((poly) => {
      let count = 0;
      if (total) for (const c of clicks) { if (pointInPolygon(c, poly)) count++; }
      const ctr = centroid(poly);
      return { x: ctr.x, y: ctr.y, count, share: total ? count / total : 0 };
    });
  }

  const api = { parseZones, pointInPolygon, centroid, tallyZones };
  if (typeof window !== 'undefined') window.HeatZones = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
```

- [ ] **Step 2: Tests verschieben** — `test/heat-overlay.test.js` löschen, `test/heat-zones.test.js` mit identischem Inhalt anlegen, aber erste Zeile auf das neue Modul ändern:

```js
const { parseZones, pointInPolygon, centroid, tallyZones } = require('../js/heat-zones.js');
```

(Alle übrigen Tests aus der alten Datei wörtlich übernehmen.)

- [ ] **Step 3: Tests laufen lassen — müssen grün sein**

Run: `node --test`
Expected: PASS (alle Geometrie-Tests), keine `Cannot find module`-Fehler.

- [ ] **Step 4: `js/heat-overlay.js` entschlacken**

In `js/heat-overlay.js`:
- Funktionen `parseZones` (Z. 285–297), `pointInPolygon` (Z. 299–310), `centroid` (Z. 312–316), `tallyZones` (Z. 318–328) **löschen**.
- `readConfig`: `zones: parseZones(p.get('zones')),` ersetzen durch `zones: window.HeatZones.parseZones(p.get('zones')),`.
- `zoneFrame`: `zoneRenderer.track(tallyZones(clicks, cfg.zones));` ersetzen durch `zoneRenderer.track(window.HeatZones.tallyZones(clicks, cfg.zones));`.
- `module.exports`-Block am Ende **löschen** (Geometrie lebt jetzt in heat-zones.js):

```js
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseZones, pointInPolygon, centroid, tallyZones };
  }
```

(Die Zeile `if (typeof window !== 'undefined') window.HeatOverlay = { init };` bleibt.)

- [ ] **Step 5: `overlay.html` — Script-Tag ergänzen** (vor heat-overlay.js)

```html
  <script src="js/heat-zones.js"></script>
  <script src="js/heat-overlay.js"></script>
```

- [ ] **Step 6: Overlay headless verifizieren** (Cluster-Modus rendert noch)

Run:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --screenshot=/tmp/overlay-smoke.png --window-size=800,450 --virtual-time-budget=2500 \
  "file://$(pwd)/overlay.html?sim=1&autoclicks=60&status=1"
```
Expected: Befehl endet ohne Fehler, `/tmp/overlay-smoke.png` zeigt Kreise + Status-Badge „Sim-Modus".

- [ ] **Step 7: Commit**

```bash
git add js/heat-zones.js test/heat-zones.test.js js/heat-overlay.js overlay.html
git rm test/heat-overlay.test.js
git commit -m "refactor: Zonen-Geometrie in js/heat-zones.js extrahieren"
```

---

### Task 2: Quellen + Buffer nach `js/heat-core.js` extrahieren

**Files:**
- Create: `js/heat-core.js`
- Create: `test/heat-core.test.js`
- Modify: `js/heat-overlay.js` (HeatSource/SimSource/createBuffer entfernen, Aufrufstellen auf `window.HeatCore` umstellen)
- Modify: `overlay.html` (Script-Tag)

**Interfaces:**
- Produces: `window.HeatCore` / `module.exports` = `{ HeatSource(channel, onClick, log), SimSource(canvas, onClick, autoclicksPerSec, log), createBuffer(windowMs, now?)→{ push(x,y), current()→Array<{x,y,t}> } }`.
- `createBuffer` nimmt optional `now` (Default `() => performance.now()`) für deterministische Tests.

- [ ] **Step 1: Failing test für `createBuffer`-Fenster**

`test/heat-core.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { createBuffer } = require('../js/heat-core.js');

test('createBuffer: verwirft Klicks älter als das Fenster', () => {
  let t = 1000;
  const buf = createBuffer(500, () => t);
  buf.push(0.1, 0.1);          // t=1000
  t = 1200; buf.push(0.2, 0.2); // t=1200
  t = 1400;
  assert.strictEqual(buf.current().length, 2); // beide < 500ms alt
  t = 1600;
  const cur = buf.current();   // 1000 ist jetzt 600ms alt -> raus
  assert.strictEqual(cur.length, 1);
  assert.strictEqual(cur[0].x, 0.2);
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `node --test test/heat-core.test.js`
Expected: FAIL mit „Cannot find module '../js/heat-core.js'".

- [ ] **Step 3: `js/heat-core.js` anlegen** (Quellen wörtlich aus heat-overlay.js, `createBuffer` mit injizierbarer Uhr)

```js
/*
 * Heat — Quellen + Buffer (I/O, kein Rendering).
 * Browser: window.HeatCore · Node: module.exports (createBuffer für Tests).
 */
(function () {
  'use strict';

  function HeatSource(channel, onClick, log) {
    function connect() {
      const ws = new WebSocket('wss://heat-api.j38.net/channel/' + channel);
      ws.addEventListener('open', () => log('Heat verbunden · Channel ' + channel));
      ws.addEventListener('message', (ev) => {
        let data;
        try { data = JSON.parse(ev.data); } catch (e) { return; }
        if (data && data.type === 'click') {
          const x = parseFloat(data.x);
          const y = parseFloat(data.y);
          if (Number.isFinite(x) && Number.isFinite(y)) onClick(x, y);
        }
      });
      ws.addEventListener('close', () => { log('Heat getrennt · Reconnect …'); setTimeout(connect, 1000); });
      ws.addEventListener('error', () => { try { ws.close(); } catch (e) { /* noop */ } });
    }
    connect();
  }

  function SimSource(canvas, onClick, autoclicksPerSec, log) {
    if (canvas) {
      canvas.style.pointerEvents = 'auto';
      canvas.addEventListener('pointerdown', (e) => {
        const r = canvas.getBoundingClientRect();
        onClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      });
    }
    if (autoclicksPerSec > 0) {
      const count = 3 + Math.floor(Math.random() * 3);
      const hotspots = [];
      for (let i = 0; i < count; i++) {
        hotspots.push({
          x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.7,
          vx: (Math.random() - 0.5) * 0.0008, vy: (Math.random() - 0.5) * 0.0008,
          weight: 0.4 + Math.random(),
        });
      }
      const clamp01 = (v) => Math.min(1, Math.max(0, v));
      const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      setInterval(() => {
        for (const h of hotspots) {
          h.x += h.vx; h.y += h.vy;
          if (h.x < 0.1 || h.x > 0.9) h.vx *= -1;
          if (h.y < 0.1 || h.y > 0.9) h.vy *= -1;
        }
        const total = hotspots.reduce((s, h) => s + h.weight, 0);
        let r = Math.random() * total;
        let pick = hotspots[0];
        for (const h of hotspots) { r -= h.weight; if (r <= 0) { pick = h; break; } }
        onClick(clamp01(pick.x + gauss() * 0.06), clamp01(pick.y + gauss() * 0.06));
      }, 1000 / autoclicksPerSec);
    }
    log(autoclicksPerSec > 0 ? 'Sim-Modus · Auto-Klicks' : 'Sim-Modus · klicke ins Bild');
  }

  function createBuffer(windowMs, now) {
    const clock = now || (() => performance.now());
    const clicks = [];
    return {
      push(x, y) { clicks.push({ x, y, t: clock() }); },
      current() {
        const cutoff = clock() - windowMs;
        while (clicks.length && clicks[0].t < cutoff) clicks.shift();
        return clicks;
      },
    };
  }

  const api = { HeatSource, SimSource, createBuffer };
  if (typeof window !== 'undefined') window.HeatCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
```

(Hinweis: `SimSource` erhält einen `if (canvas)`-Guard, damit die Bridge ohne Canvas dieselbe Quelle nutzen kann.)

- [ ] **Step 4: Test grün**

Run: `node --test test/heat-core.test.js`
Expected: PASS.

- [ ] **Step 5: `js/heat-overlay.js` entschlacken**

- Funktionen `HeatSource` (Z. 37–57), `SimSource` (Z. 59–98), `createBuffer` (Z. 101–111) **löschen**.
- In `init`: `const buffer = createBuffer(cfg.windowMs);` → `const buffer = window.HeatCore.createBuffer(cfg.windowMs);`
- In `init`: `SimSource(canvas, onClick, cfg.autoclicks, log);` → `window.HeatCore.SimSource(canvas, onClick, cfg.autoclicks, log);`
- In `init`: `HeatSource(cfg.channel, onClick, log);` → `window.HeatCore.HeatSource(cfg.channel, onClick, log);`

- [ ] **Step 6: `overlay.html` — Script-Tag ergänzen**

```html
  <script src="js/heat-zones.js"></script>
  <script src="js/heat-core.js"></script>
  <script src="js/heat-overlay.js"></script>
```

- [ ] **Step 7: Overlay headless verifizieren** (wie Task 1, Step 6) — Kreise + Status erscheinen weiterhin.

Run:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --screenshot=/tmp/overlay-smoke2.png --window-size=800,450 --virtual-time-budget=2500 \
  "file://$(pwd)/overlay.html?sim=1&autoclicks=60&status=1"
```
Expected: kein Fehler, Kreise sichtbar.

- [ ] **Step 8: Commit**

```bash
git add js/heat-core.js test/heat-core.test.js js/heat-overlay.js overlay.html
git commit -m "refactor: Quellen + Buffer in js/heat-core.js extrahieren"
```

---

### Task 3: Trigger-Maschine `evaluateZones` (rein)

**Files:**
- Create: `js/heat-actions.js` (erster Teil: nur `evaluateZones` + Export-Gerüst)
- Create: `test/heat-actions.test.js`

**Interfaces:**
- Produces: `evaluateZones(states, counts, now, cfg) → { states, fires }`
  - `states`: `Array<{ armed:boolean, cooldownUntil:number }>` (Länge = Zonen)
  - `counts`: `Array<number>` (Klicks pro Zone im Fenster)
  - `now`: number (ms)
  - `cfg`: `Array<{ action:string, enter:number, rearm:number, cooldown:number }>` (`cooldown` in **ms**)
  - Rückgabe: neue `states` (nicht mutiert) + `fires`: `Array<number>` (gefeuerte Zonen-Indizes)
  - Zonen mit leerem `action` feuern nie.

- [ ] **Step 1: Failing tests**

`test/heat-actions.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const { evaluateZones } = require('../js/heat-actions.js');

const cfg1 = [{ action: 'A', enter: 20, rearm: 10, cooldown: 60000 }];
const armed = () => [{ armed: true, cooldownUntil: 0 }];

test('feuert beim Überschreiten von enter', () => {
  const { states, fires } = evaluateZones(armed(), [20], 1000, cfg1);
  assert.deepStrictEqual(fires, [0]);
  assert.strictEqual(states[0].armed, false);
  assert.strictEqual(states[0].cooldownUntil, 1000 + 60000);
});

test('feuert nicht unter enter', () => {
  const { fires } = evaluateZones(armed(), [19], 1000, cfg1);
  assert.deepStrictEqual(fires, []);
});

test('feuert nicht erneut während Cooldown, auch über enter', () => {
  const st = [{ armed: false, cooldownUntil: 50000 }];
  const { fires } = evaluateZones(st, [30], 40000, cfg1);
  assert.deepStrictEqual(fires, []);
});

test('wird erst scharf, wenn count <= rearm UND Cooldown vorbei', () => {
  const st = [{ armed: false, cooldownUntil: 50000 }];
  let r = evaluateZones(st, [12], 60000, cfg1); // count(12) > rearm(10) -> bleibt unscharf
  assert.strictEqual(r.states[0].armed, false);
  r = evaluateZones(r.states, [10], 61000, cfg1); // count<=rearm & Cooldown vorbei -> scharf
  assert.strictEqual(r.states[0].armed, true);
});

test('Zone ohne Action feuert nie', () => {
  const cfg = [{ action: '', enter: 1, rearm: 0, cooldown: 1000 }];
  const { fires } = evaluateZones(armed(), [99], 1000, cfg);
  assert.deepStrictEqual(fires, []);
});

test('mehrere Zonen unabhängig', () => {
  const cfg = [
    { action: 'A', enter: 5, rearm: 2, cooldown: 1000 },
    { action: 'B', enter: 5, rearm: 2, cooldown: 1000 },
  ];
  const st = [{ armed: true, cooldownUntil: 0 }, { armed: true, cooldownUntil: 0 }];
  const { fires } = evaluateZones(st, [5, 1], 100, cfg);
  assert.deepStrictEqual(fires, [0]);
});
```

- [ ] **Step 2: Tests schlagen fehl**

Run: `node --test test/heat-actions.test.js`
Expected: FAIL „Cannot find module '../js/heat-actions.js'".

- [ ] **Step 3: `js/heat-actions.js` mit `evaluateZones` anlegen**

```js
/*
 * Heat — Aktions-Bridge: Zonen-Schwellen -> Streamer.Bot DoAction.
 * Browser: window.HeatActions · Node: module.exports (reine Funktionen für Tests).
 */
(function () {
  'use strict';

  // Reine Trigger-Maschine. Mutiert die Eingabe nicht.
  function evaluateZones(states, counts, now, cfg) {
    const out = states.map((s) => ({ armed: s.armed, cooldownUntil: s.cooldownUntil }));
    const fires = [];
    for (let i = 0; i < out.length; i++) {
      const c = cfg[i];
      const s = out[i];
      const count = counts[i] || 0;
      if (!c || !c.action) continue; // ohne Action: nie feuern
      if (s.armed && count >= c.enter && now >= s.cooldownUntil) {
        fires.push(i);
        s.armed = false;
        s.cooldownUntil = now + c.cooldown;
      } else if (!s.armed && count <= c.rearm && now >= s.cooldownUntil) {
        s.armed = true;
      }
    }
    return { states: out, fires };
  }

  const api = { evaluateZones };
  if (typeof window !== 'undefined') window.HeatActions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
```

- [ ] **Step 4: Tests grün**

Run: `node --test test/heat-actions.test.js`
Expected: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add js/heat-actions.js test/heat-actions.test.js
git commit -m "feat: Trigger-Maschine evaluateZones (Cooldown + Hysterese)"
```

---

### Task 4: `parseActions` — URL-Param zu Zonen-Config (rein)

**Files:**
- Modify: `js/heat-actions.js` (Funktion + Export ergänzen)
- Modify: `test/heat-actions.test.js` (Tests ergänzen)

**Interfaces:**
- Produces: `parseActions(str, zonesLen) → Array<{ action:string, enter:number, rearm:number, cooldown:number }>`
  - Länge immer `zonesLen` (fehlende/kaputte Einträge: `{ action:'', enter:0, rearm:0, cooldown:0 }`).
  - Format pro Zone `enter|rearm|cooldown|<encodeURIComponent(name)>`, Zonen per `;`.
  - `cooldown` im String in **Sekunden** → Rückgabe in **ms** (`*1000`).
  - Invariante: `rearm` auf `max(0, enter-1)` klemmen, falls `rearm >= enter`.

- [ ] **Step 1: Failing tests** (an `test/heat-actions.test.js` anhängen)

```js
const { parseActions } = require('../js/heat-actions.js');

test('parseActions: zwei Zonen, Sekunden -> ms, Name dekodiert', () => {
  const out = parseActions('20|10|60|Link%20posten;15|8|45|Discord', 2);
  assert.deepStrictEqual(out[0], { action: 'Link posten', enter: 20, rearm: 10, cooldown: 60000 });
  assert.deepStrictEqual(out[1], { action: 'Discord', enter: 15, rearm: 8, cooldown: 45000 });
});

test('parseActions: fehlende Einträge werden auf Länge gepolstert (skip)', () => {
  const out = parseActions('20|10|60|A', 3);
  assert.strictEqual(out.length, 3);
  assert.strictEqual(out[1].action, '');
  assert.strictEqual(out[2].action, '');
});

test('parseActions: rearm>=enter wird auf enter-1 geklemmt', () => {
  const out = parseActions('20|25|60|A', 1);
  assert.strictEqual(out[0].rearm, 19);
});

test('parseActions: leerer Name -> skip-Eintrag', () => {
  const out = parseActions('20|10|60|', 1);
  assert.strictEqual(out[0].action, '');
});

test('parseActions: leerer/fehlender String -> alle skip', () => {
  const out = parseActions('', 2);
  assert.strictEqual(out.length, 2);
  assert.ok(out.every((e) => e.action === ''));
});
```

- [ ] **Step 2: Tests schlagen fehl**

Run: `node --test test/heat-actions.test.js`
Expected: FAIL „parseActions is not a function".

- [ ] **Step 3: `parseActions` implementieren** (in `js/heat-actions.js`, vor dem `api`-Objekt)

```js
  function parseActions(str, zonesLen) {
    const skip = () => ({ action: '', enter: 0, rearm: 0, cooldown: 0 });
    const out = [];
    const segs = str ? String(str).split(';') : [];
    for (let i = 0; i < zonesLen; i++) {
      const seg = segs[i];
      if (!seg) { out.push(skip()); continue; }
      const f = seg.split('|');
      const enter = parseInt(f[0], 10);
      let rearm = parseInt(f[1], 10);
      const cooldownSec = parseInt(f[2], 10);
      const action = f[3] ? decodeURIComponent(f[3]) : '';
      if (!action || !Number.isFinite(enter)) { out.push(skip()); continue; }
      if (!Number.isFinite(rearm) || rearm >= enter) rearm = Math.max(0, enter - 1);
      out.push({
        action,
        enter,
        rearm,
        cooldown: (Number.isFinite(cooldownSec) ? cooldownSec : 0) * 1000,
      });
    }
    return out;
  }
```

Und `api` erweitern: `const api = { evaluateZones, parseActions };`

- [ ] **Step 4: Tests grün**

Run: `node --test test/heat-actions.test.js`
Expected: PASS (11 Tests).

- [ ] **Step 5: Commit**

```bash
git add js/heat-actions.js test/heat-actions.test.js
git commit -m "feat: parseActions (URL-Param -> Zonen-Action-Config)"
```

---

### Task 5: `buildDoAction` + Auth-Hash (rein)

**Files:**
- Modify: `js/heat-actions.js`
- Modify: `test/heat-actions.test.js`

**Interfaces:**
- Produces:
  - `buildDoAction({ zone, action, count, share, channel, now }) → object` (Streamer.Bot `DoAction`-JSON).
  - `sha256b64(str) → Promise<string>` (Browser: `crypto.subtle`; Node-Test: `crypto`-Fallback).
  - `computeAuth(password, salt, challenge) → Promise<string>` (zwei verkettete SHA256→base64).

- [ ] **Step 1: Failing tests** (anhängen)

```js
const { buildDoAction, computeAuth } = require('../js/heat-actions.js');

test('buildDoAction: korrektes DoAction-JSON', () => {
  const msg = buildDoAction({ zone: 'Z1', action: 'Link posten', count: 23, share: 0.31, channel: '97032862', now: 1700000000000 });
  assert.strictEqual(msg.request, 'DoAction');
  assert.strictEqual(msg.id, 'heat:Z1:1700000000000');
  assert.deepStrictEqual(msg.action, { name: 'Link posten' });
  assert.deepStrictEqual(msg.args, { zone: 'Z1', count: 23, share: 0.31, channel: '97032862' });
});

test('computeAuth: bekannter Vektor (zwei verkettete sha256->base64)', async () => {
  // secret = base64(sha256('pw'+'salt')); auth = base64(sha256(secret+'chal'))
  const crypto = require('crypto');
  const secret = crypto.createHash('sha256').update('pw' + 'salt', 'utf8').digest('base64');
  const expected = crypto.createHash('sha256').update(secret + 'chal', 'utf8').digest('base64');
  const got = await computeAuth('pw', 'salt', 'chal');
  assert.strictEqual(got, expected);
});
```

- [ ] **Step 2: Tests schlagen fehl**

Run: `node --test test/heat-actions.test.js`
Expected: FAIL „buildDoAction is not a function".

- [ ] **Step 3: Implementieren** (in `js/heat-actions.js`)

```js
  function buildDoAction(o) {
    return {
      request: 'DoAction',
      id: 'heat:' + o.zone + ':' + o.now,
      action: { name: o.action },
      args: { zone: o.zone, count: o.count, share: o.share, channel: o.channel },
    };
  }

  // SHA256 -> base64. Browser via Web Crypto, Node-Test via crypto.
  async function sha256b64(str) {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(str, 'utf8').digest('base64');
  }

  async function computeAuth(password, salt, challenge) {
    const secret = await sha256b64(password + salt);
    return await sha256b64(secret + challenge);
  }
```

Und `api` erweitern: `const api = { evaluateZones, parseActions, buildDoAction, sha256b64, computeAuth };`

- [ ] **Step 4: Tests grün**

Run: `node --test test/heat-actions.test.js`
Expected: PASS (13 Tests).

- [ ] **Step 5: Commit**

```bash
git add js/heat-actions.js test/heat-actions.test.js
git commit -m "feat: buildDoAction + Streamer.Bot Auth-Hash (computeAuth)"
```

---

### Task 6: Streamer.Bot-Client, `init()` und `actions.html`

**Files:**
- Modify: `js/heat-actions.js` (`createSbClient`, `readConfig`, `init`)
- Create: `actions.html`

**Interfaces:**
- Consumes: `window.HeatZones.{parseZones,tallyZones}`, `window.HeatCore.{HeatSource,SimSource,createBuffer}`, sowie die in Tasks 3–5 erstellten reinen Funktionen.
- Produces: `window.HeatActions.init()` — liest URL-Params, baut Quelle+Buffer+Maschine+Client, tickt alle 250 ms.
- `createSbClient({ url, token, log, onStatus }) → { send(obj), isReady()→bool }` — WS mit Reconnect/Backoff, optionalem Auth-Handshake, fire-and-forget.

- [ ] **Step 1: `createSbClient` implementieren** (in `js/heat-actions.js`)

```js
  function createSbClient(o) {
    let ws = null, ready = false, backoff = 1000;
    function setStatus(s) { o.onStatus && o.onStatus(s); }
    function connect() {
      ws = new WebSocket(o.url);
      ws.addEventListener('open', () => { backoff = 1000; setStatus('verbunden'); });
      ws.addEventListener('message', async (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m && m.request === 'Hello') {
          if (m.authentication && o.token) {
            const auth = await computeAuth(o.token, m.authentication.salt, m.authentication.challenge);
            ws.send(JSON.stringify({ request: 'Authenticate', id: 'heat:auth', authentication: auth }));
          } else {
            ready = true; setStatus('bereit');
          }
        } else if (m && m.id === 'heat:auth') {
          if (m.status === 'ok') { ready = true; setStatus('bereit (auth)'); }
          else { setStatus('Auth fehlgeschlagen'); }
        }
      });
      ws.addEventListener('close', () => {
        ready = false; setStatus('getrennt · Reconnect …');
        setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 15000);
      });
      ws.addEventListener('error', () => { try { ws.close(); } catch (e) { /* noop */ } });
    }
    connect();
    return {
      isReady: () => ready,
      send: (obj) => {
        if (!ws || ws.readyState !== 1) { o.log && o.log('Streamer.Bot nicht verbunden — verworfen'); return; }
        ws.send(JSON.stringify(obj));
      },
    };
  }
```

(Hinweis: Streamer.Bot akzeptiert `DoAction` direkt nach `Hello`/`Authenticate`; `ready` wird nicht hart erzwungen, `send` prüft nur den Socket-Zustand — verspätete Trigger werden nicht gepuffert.)

- [ ] **Step 2: `readConfig` + `init` implementieren** (in `js/heat-actions.js`)

```js
  function readConfig() {
    const p = new URLSearchParams(location.search);
    const num = (k, d) => { const v = parseFloat(p.get(k)); return Number.isFinite(v) ? v : d; };
    const channel = (p.get('channel') || '').trim();
    const zones = window.HeatZones.parseZones(p.get('zones'));
    return {
      channel,
      sim: p.get('sim') === '1' || !channel,
      autoclicks: Math.max(0, num('autoclicks', 0)),
      windowMs: Math.max(1, num('window', 12)) * 1000,
      zones,
      actions: parseActions(p.get('actions'), zones.length),
      sb: (p.get('sb') || 'ws://127.0.0.1:8080/').trim(),
      sbtoken: (p.get('sbtoken') || '').trim(),
      dryrun: p.get('dryrun') === '1',
    };
  }

  function init() {
    const cfg = readConfig();
    const panel = window.HeatPanel; // Status-Panel-API aus actions.html (Step 3)
    const buffer = window.HeatCore.createBuffer(cfg.windowMs);
    const onClick = (x, y) => buffer.push(x, y);

    if (cfg.sim) window.HeatCore.SimSource(null, onClick, cfg.autoclicks, (m) => panel.heat(m));
    else window.HeatCore.HeatSource(cfg.channel, onClick, (m) => panel.heat(m));

    let sb = null;
    if (!cfg.dryrun) sb = createSbClient({ url: cfg.sb, token: cfg.sbtoken, log: (m) => panel.log(m), onStatus: (s) => panel.sb(s) });
    else panel.sb('dry-run (kein Versand)');

    panel.zones(cfg.zones, cfg.actions);

    let states = cfg.zones.map(() => ({ armed: true, cooldownUntil: 0 }));
    setInterval(() => {
      const tally = window.HeatZones.tallyZones(buffer.current(), cfg.zones);
      const counts = tally.map((z) => z.count);
      const res = evaluateZones(states, counts, performance.now(), cfg.actions);
      states = res.states;
      for (const i of res.fires) {
        const a = cfg.actions[i];
        const msg = buildDoAction({ zone: 'Zone ' + (i + 1), action: a.action, count: counts[i], share: tally[i].share, channel: cfg.channel, now: Date.now() });
        if (cfg.dryrun) panel.fire(i + 1, a.action, counts[i], true);
        else { sb.send(msg); panel.fire(i + 1, a.action, counts[i], false); }
      }
    }, 250);
  }
```

Und `api` final erweitern: `const api = { evaluateZones, parseActions, buildDoAction, sha256b64, computeAuth, createSbClient, init };`
Sowie am Dateiende sicherstellen: `if (typeof window !== 'undefined') window.HeatActions = api;` (bereits vorhanden).

- [ ] **Step 3: `actions.html` mit Status-Panel anlegen**

```html
<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Heat — Aktions-Bridge</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0f1115; color: #e7eaf0;
      font: 13px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
    .wrap { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .row { display: flex; gap: 10px; }
    .badge { padding: 4px 9px; border-radius: 6px; background: #1f232c; }
    .ok { color: #7CFC9A; } .warn { color: #ffb070; }
    #log { background: #181b22; border-radius: 8px; padding: 8px; height: 60vh; overflow: auto;
      font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
    .zone { color: #9aa3b2; } .skip { color: #ff7a6a; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="row">
      <span class="badge">Heat: <span id="heat">…</span></span>
      <span class="badge">Streamer.Bot: <span id="sb">…</span></span>
    </div>
    <div id="zones"></div>
    <div id="log"></div>
  </div>
  <script src="js/heat-zones.js"></script>
  <script src="js/heat-core.js"></script>
  <script src="js/heat-actions.js"></script>
  <script>
    const el = (id) => document.getElementById(id);
    function line(html) {
      const d = document.createElement('div'); d.innerHTML = html;
      el('log').prepend(d);
    }
    window.HeatPanel = {
      heat: (m) => { el('heat').textContent = m; },
      sb: (s) => { el('sb').textContent = s; el('sb').className = /bereit|verbunden/.test(s) ? 'ok' : 'warn'; },
      log: (m) => line('<span class="warn">' + m + '</span>'),
      zones: (zones, actions) => {
        el('zones').innerHTML = zones.map((z, i) => {
          const a = actions[i];
          return a && a.action
            ? '<span class="badge zone">Zone ' + (i + 1) + ' → "' + a.action + '" (enter ' + a.enter + ')</span>'
            : '<span class="badge skip">Zone ' + (i + 1) + ' → keine Action (skip)</span>';
        }).join(' ');
      },
      fire: (n, action, count, dry) => line('<b>Zone ' + n + '</b> → "' + action + '" · ' + count + ' Klicks' + (dry ? ' <span class="zone">(dry-run, nicht gesendet)</span>' : '')),
    };
    HeatActions.init();
  </script>
</body>
</html>
```

- [ ] **Step 4: Bestehende Tests bleiben grün**

Run: `node --test`
Expected: PASS (alle Module).

- [ ] **Step 5: Bridge headless im dry-run verifizieren** (feuert, sendet aber nicht)

Zone deckt die gesamte Fläche ab, niedriges `enter`, viele Auto-Klicks → garantierter dry-run-Treffer:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --screenshot=/tmp/actions-dryrun.png --window-size=600,500 --virtual-time-budget=4000 \
  "file://$(pwd)/actions.html?sim=1&autoclicks=80&window=12&zones=0,0,1,0,1,1,0,1&actions=5|2|60|Testaktion&dryrun=1"
```
Expected: kein Fehler; `/tmp/actions-dryrun.png` zeigt „Streamer.Bot: dry-run", Zone-Badge „Zone 1 → Testaktion" und mindestens eine Log-Zeile „Zone 1 → Testaktion … (dry-run, nicht gesendet)".

- [ ] **Step 6: Commit**

```bash
git add js/heat-actions.js actions.html
git commit -m "feat: Streamer.Bot-Client, init() und actions.html Status-Panel"
```

---

### Task 7: `config.html` — dritter Modus „Aktions-Zonen"

**Files:**
- Modify: `config.html`

**Interfaces:**
- Consumes: nichts Neues zur Laufzeit; erzeugt `actions.html?…`-URLs nach dem Spec-Schema.
- Produces: UI für Mode `actions`, Zonen-Action-Felder, Streamer.Bot-Felder, dry-run-Vorschau.

- [ ] **Step 1: Mode-Option ergänzen** (im `<select id="mode">`, nach der `zones`-Option)

```html
          <option value="actions">Aktions-Zonen (Streamer.Bot)</option>
```

- [ ] **Step 2: Streamer.Bot-Fieldset ergänzen** (nach dem `zonesFs`-Fieldset)

```html
    <fieldset id="sbFs">
      <legend>Streamer.Bot</legend>
      <div class="field">
        <label for="sb">WebSocket-URL</label>
        <input type="text" id="sb" placeholder="ws://127.0.0.1:8080/">
      </div>
      <div class="field">
        <label for="sbtoken">Auth-Token (optional)</label>
        <input type="text" id="sbtoken" placeholder="leer = keine Authentifizierung">
      </div>
      <div class="hint">Pro Zone unten Action-Name + Schwellen setzen. „enter" = Klicks im Fenster bis Auslösung, „rearm" = darunter wird wieder scharf, „cooldown" = Sperrzeit (Sek.).</div>
    </fieldset>
```

- [ ] **Step 3: CSS — Zonen-Umrisse auch im Aktions-Modus zeigen** (Regel `body.zones-mode .editor-layer`)

Ersetze:
```css
    body.zones-mode .editor-layer { display: block; }
```
durch:
```css
    body.zones-mode .editor-layer, body.actions-mode .editor-layer { display: block; }
```

- [ ] **Step 4: JS — Felder & Datenmodell erweitern**

In `config.html`-Script:
- `fields`-Array um die neuen Inputs erweitern:
```js
    const fields = ['channel', 'sim', 'autoclicks', 'window', 'threshold', 'maxCircles', 'mergeRadius', 'status', 'mode', 'grow', 'sb', 'sbtoken'];
```
- `readForm()` um `sb` und `sbtoken` ergänzen:
```js
        sb: el('sb').value.trim(),
        sbtoken: el('sbtoken').value.trim(),
```
- `writeForm(v)` um:
```js
      el('sb').value = v.sb || '';
      el('sbtoken').value = v.sbtoken || '';
```

- [ ] **Step 5: JS — Zonen-Zeile bekommt Action-Felder** (in `renderZoneList`, vor `row.append(...)`)

Ersetze `row.append(name, st, edit, del);` durch eine modusabhängige Variante:
```js
        if (el('mode').value === 'actions') {
          const z = state.zones[i];
          if (z.action === undefined) { z.action = ''; z.enter = 20; z.rearm = 10; z.cooldown = 60; }
          const mk = (key, ph, w) => {
            const inp = document.createElement('input');
            inp.type = key === 'action' ? 'text' : 'number';
            inp.placeholder = ph; inp.value = z[key]; inp.style.width = w;
            inp.addEventListener('input', () => {
              z[key] = key === 'action' ? inp.value : Number(inp.value);
              update();
            });
            return inp;
          };
          row.append(name, st, mk('action', 'Action-Name', '120px'),
            mk('enter', 'enter', '64px'), mk('rearm', 'rearm', '64px'),
            mk('cooldown', 'cd s', '56px'), edit, del);
        } else {
          row.append(name, st, edit, del);
        }
```

- [ ] **Step 6: JS — `applyModeVisibility` erweitern**

Ersetze den Body von `applyModeVisibility()`:
```js
    function applyModeVisibility() {
      const mode = el('mode').value;
      const zonesLike = mode === 'zones' || mode === 'actions';
      el('zonesFs').style.display = zonesLike ? '' : 'none';
      el('sbFs').style.display = mode === 'actions' ? '' : 'none';
      el('editorToolbar').style.display = zonesLike ? 'flex' : 'none';
      // Cluster/Kreis-Felder im Aktions-Modus ausblenden
      const clusterFs = el('threshold').closest('fieldset');
      clusterFs.style.display = mode === 'actions' ? 'none' : '';
      document.body.classList.toggle('zones-mode', mode === 'zones');
      document.body.classList.toggle('actions-mode', mode === 'actions');
      applyRefVisibility();
      renderZoneList(); // Action-Felder je nach Modus ein-/ausblenden
      if (zonesLike) { sizeEditor(); drawEditor(); }
    }
```

Außerdem in `applyRefVisibility()` die Bedingung `el('mode').value === 'zones'` ersetzen durch `(el('mode').value === 'zones' || el('mode').value === 'actions')` (Referenzbild auch im Aktions-Modus sichtbar).

- [ ] **Step 7: JS — `encodeActions` + Artefakt-/Param-Bau**

Neue Funktion (neben `encodeZones`):
```js
    function encodeActions(zones) {
      return zones.filter((z) => z.points.length === 4).map((z) =>
        [z.enter ?? 20, z.rearm ?? 10, z.cooldown ?? 60, encodeURIComponent(z.action || '')].join('|')
      ).join(';');
    }
```

`buildParams(v, forceStatus)` um einen Aktions-Zweig erweitern (am Ende vor `return`):
```js
      if (v.mode === 'actions') {
        const z = encodeZones(state.zones);
        if (z) p.set('zones', z);
        const a = encodeActions(state.zones);
        if (a) p.set('actions', a);
        if (v.sb) p.set('sb', v.sb);
        if (v.sbtoken) p.set('sbtoken', v.sbtoken);
      }
```
(Cluster-/`threshold`-Params bleiben für die anderen Modi unverändert; sie schaden in `actions.html` nicht, da dort ignoriert.)

`overlayBase()` durch eine modusabhängige Basis ersetzen:
```js
    function artifactBase(mode) {
      return new URL(mode === 'actions' ? 'actions.html' : 'overlay.html', location.href).href;
    }
```

In `update()`:
```js
      const v = readForm();
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...v, zones: state.zones }));
      applyModeVisibility();

      const base = artifactBase(v.mode);
      const obsUrl = base + '?' + buildParams(v, false);
      el('obsUrl').value = obsUrl;

      // Vorschau: Status erzwingen; im Aktions-Modus dry-run, damit nichts gesendet wird.
      let previewUrl = base + '?' + buildParams(v, true);
      if (v.mode === 'actions') previewUrl += '&dryrun=1';
      const iframe = el('preview');
      if (iframe.src !== previewUrl) iframe.src = previewUrl;
```

- [ ] **Step 8: Headless verifizieren — config erzeugt korrekte Bridge-URL**

Run:
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --dump-dom --virtual-time-budget=2000 "file://$(pwd)/config.html" 2>/dev/null | grep -o 'actions.html' | head -1
```
Expected: leer (Default-Modus ist cluster) — kein Fehler. Danach manuell im Browser: Modus „Aktions-Zonen" wählen, Zone zeichnen, Action-Name setzen → `obsUrl` zeigt `actions.html?...&zones=...&actions=20|10|60|...`. Vorschau-iframe lädt mit `&dryrun=1`.

- [ ] **Step 9: Vollständige Test-Suite**

Run: `node --test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add config.html
git commit -m "feat: config.html — Modus Aktions-Zonen (Streamer.Bot-URL-Generator)"
```

---

### Task 8: Dokumentation

**Files:**
- Modify: `CLAUDE.md` (URL-Parameter-Tabelle, Datenfluss, Projektstruktur)
- Modify: `README.md` (neuer Modus, OBS-Einbindung der Bridge)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: `CLAUDE.md` — Projektstruktur** um die neuen Dateien ergänzen (`actions.html`, `js/heat-zones.js`, `js/heat-core.js`, `js/heat-actions.js`) und den Datenfluss um die Bridge.

- [ ] **Step 2: `CLAUDE.md` — URL-Parameter** eine zweite Tabelle „actions.html" ergänzen mit `sb`, `sbtoken`, `actions`, `dryrun` und dem `actions`-Codierungs-Beispiel `20|10|60|Link%20posten;…`.

- [ ] **Step 3: `CLAUDE.md` — „Bewusst NICHT im Scope"** anpassen: die Aktions-Schicht ist jetzt teilweise umgesetzt (nur Streamer.Bot-Trigger via Bridge); Identitäts-Auswertung, Persistenz, eigenes Relay bleiben out-of-scope.

- [ ] **Step 4: `README.md`** — kurzer Abschnitt „Aktions-Zonen": was es tut, dass `actions.html` als zusätzliche (unsichtbare) OBS-Browser-Quelle läuft, Streamer.Bot-Action per Name, der Mixed-Content-Hinweis (`ws://127.0.0.1` ggf. lokal laden) und dry-run zum Testen.

- [ ] **Step 5: `CHANGELOG.md`** — neuen Eintrag „Aktions-Zonen (Heat → Streamer.Bot)" mit Modul-Split.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md CHANGELOG.md
git commit -m "docs: Aktions-Zonen in CLAUDE.md, README, CHANGELOG"
```

---

## Self-Review

**Spec coverage:**
- Modul-Split (heat-zones/heat-core/heat-overlay/heat-actions) → Tasks 1, 2, 3–6. ✓
- Trigger-Maschine (absolute Klickzahl, Cooldown + Hysterese, Re-Arm, skip ohne Action) → Task 3. ✓
- 250-ms-Tick statt rAF → Task 6 (init). ✓
- Zone → benannte Streamer.Bot-Action, DoAction per Name + args → Tasks 5, 6. ✓
- Optionaler Auth-Handshake (Hello/Authenticate, SHA256×2) → Tasks 5, 6. ✓
- Kein Puffern bei Offline, unabhängige Reconnects → Task 6 (createSbClient). ✓
- URL-Schema `sb`, `sbtoken`, `actions`, `dryrun`, `cooldown` in Sek. → Tasks 4, 6, 7. ✓
- config.html dritter Modus, Action-Felder pro Zone, dry-run-Vorschau, Zonen-Umrisse sichtbar, Cluster-Felder aus → Task 7. ✓
- actions.html Status-Panel (Heat/SB/Trigger-Log/skip-Markierung) als Mixed-Content-Testgerät → Task 6. ✓
- Tests (heat-zones verschoben, evaluateZones, parseActions, buildDoAction, computeAuth, createBuffer) → Tasks 1–5. ✓
- Mixed-Content-Verifikation → README-Hinweis (Task 8) + Status-Panel (Task 6). ✓

**Placeholder scan:** Keine TBD/TODO; alle Code-Schritte enthalten vollständigen Code; Verifikations-Schritte enthalten konkrete Befehle + erwartete Ergebnisse.

**Type consistency:** `evaluateZones(states, counts, now, cfg)` einheitlich; `cfg`-Einträge `{action,enter,rearm,cooldown(ms)}` stammen aus `parseActions` (Task 4) und werden in `init` (Task 6) erzeugt; `buildDoAction({zone,action,count,share,channel,now})` einheitlich Task 5↔6; `createSbClient({url,token,log,onStatus})` einheitlich; `window.HeatPanel.{heat,sb,log,zones,fire}` Task 6 Step 2 ↔ Step 3 konsistent.
