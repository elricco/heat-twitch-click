/*
 * Heat Click-Cluster Overlay — core logic
 *
 * Empfängt normalisierte Klicks (0..1) aus der Heat Twitch Extension (oder einem
 * Simulator), hält sie in einem gleitenden Zeitfenster, clustert sie zu Hotspots
 * und rendert bis zu N Kreise mit Prozent-Label auf ein transparentes Canvas.
 *
 * Bewusst kein Backend, keine Persistenz, keine Identitäts-Auswertung (PoC).
 */
(function () {
  'use strict';

  // '#ff3b30' / 'ff3b30' / 'f30' -> {r,g,b}, sonst null.
  function parseHex(str) {
    let h = String(str || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  // Hervorhebungsfarbe eines Visuals: Skala -> Gelb..Rot, Farbe -> gewählte Farbe.
  function hlTint(cfg, t) {
    return cfg.hl === 'scale' ? window.HeatZones.scaleColor(t) : cfg.hlColor;
  }

  const mix = (a, b, k) => Math.round(a + (b - a) * k);

  // ---- Konfiguration aus URL-Parametern -----------------------------------
  function readConfig() {
    const p = new URLSearchParams(location.search);
    const num = (key, def) => {
      const v = parseFloat(p.get(key));
      return Number.isFinite(v) ? v : def;
    };
    const channel = (p.get('channel') || '').trim();
    return {
      channel,
      sim: p.get('sim') === '1' || !channel, // ohne Channel automatisch Sim-Modus
      autoclicks: Math.max(0, num('autoclicks', 0)), // Sim: Klicks/Sekunde
      windowMs: Math.max(1, num('window', 12)) * 1000,
      threshold: Math.max(0, num('threshold', 10)) / 100, // Anteil 0..1
      maxCircles: Math.max(1, Math.round(num('maxCircles', 5))),
      mergeRadius: Math.max(0.01, num('mergeRadius', 8)) / 100, // Anteil der Breite
      status: p.get('status') === '1',
      mode: p.get('mode') === 'zones' ? 'zones' : 'cluster',
      zones: window.HeatZones.parseZones(p.get('zones')),
      grow: p.get('grow') !== '0', // false = feste Kreisgröße, nur Prozentzahl
      hl: p.get('hl') === 'color' || p.get('hl') === 'scale' ? p.get('hl') : 'off',
      hlColor: parseHex(p.get('hlcolor')) || { r: 255, g: 59, b: 48 },
    };
  }


  // ---- Clusterer: Greedy-Radius-Merge --------------------------------------
  // Liefert Cluster {x, y, count, share}, absteigend nach count, auf maxCircles
  // begrenzt und auf share >= threshold gefiltert.
  function cluster(clicks, mergeRadius, maxCircles, threshold) {
    const total = clicks.length;
    if (!total) return [];
    const r2 = mergeRadius * mergeRadius;
    const clusters = [];
    for (const c of clicks) {
      let best = null;
      let bestD = r2;
      for (const cl of clusters) {
        const dx = c.x - cl.x;
        const dy = c.y - cl.y;
        const d = dx * dx + dy * dy;
        if (d <= bestD) { bestD = d; best = cl; }
      }
      if (best) {
        best.count++;
        best.sx += c.x; best.sy += c.y;
        best.x = best.sx / best.count;
        best.y = best.sy / best.count;
      } else {
        clusters.push({ x: c.x, y: c.y, sx: c.x, sy: c.y, count: 1 });
      }
    }
    clusters.sort((a, b) => b.count - a.count);
    return clusters
      .slice(0, maxCircles)
      .map((cl) => ({ x: cl.x, y: cl.y, count: cl.count, share: cl.count / total }))
      .filter((cl) => cl.share >= threshold);
  }

  // ---- Renderer: Canvas, weiche Übergänge ----------------------------------
  function createRenderer(canvas, cfg) {
    const grow = cfg.grow;
    const ctx = canvas.getContext('2d');
    let visuals = []; // {x,y, tx,ty, share,tshare, op,top}
    const MOVE = 0.18; // Position/Anteil-Lerp
    const FADE = 0.08; // Opacity-Lerp
    const MATCH_DIST2 = 0.04; // ~0.2 normalisierte Distanz: gleicher Kreis

    function track(clusters) {
      const used = new Set();
      const levels = window.HeatZones.highlightLevels(clusters, cfg.hl);
      for (let ci = 0; ci < clusters.length; ci++) {
        const cl = clusters[ci];
        const lv = levels[ci];
        let best = -1;
        let bestD = MATCH_DIST2;
        for (let i = 0; i < visuals.length; i++) {
          if (used.has(i)) continue;
          const dx = visuals[i].tx - cl.x;
          const dy = visuals[i].ty - cl.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = i; }
        }
        if (best === -1) {
          visuals.push({ x: cl.x, y: cl.y, tx: cl.x, ty: cl.y, share: cl.share, tshare: cl.share, op: 0, top: 1, hl: 0, thl: lv.alpha, t: lv.t, tt: lv.t });
          used.add(visuals.length - 1);
        } else {
          const v = visuals[best];
          v.tx = cl.x; v.ty = cl.y; v.tshare = cl.share; v.top = 1;
          v.thl = lv.alpha; v.tt = lv.t;
          used.add(best);
        }
      }
      // Nicht mehr getroffene Visuals ausblenden.
      for (let i = 0; i < visuals.length; i++) {
        if (!used.has(i)) visuals[i].top = 0;
      }
    }

    function draw() {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      for (const v of visuals) {
        v.x += (v.tx - v.x) * MOVE;
        v.y += (v.ty - v.y) * MOVE;
        v.share += (v.tshare - v.share) * MOVE;
        v.op += (v.top - v.op) * FADE;
        v.hl += (v.thl - v.hl) * MOVE;
        v.t += (v.tt - v.t) * MOVE;
      }
      visuals = visuals.filter((v) => !(v.top === 0 && v.op < 0.02));

      // Größte zuletzt zeichnen, damit sie oben liegen.
      const ordered = visuals.slice().sort((a, b) => a.share - b.share);
      for (const v of ordered) drawCircle(ctx, v, W, H, grow, v.hl > 0.01 ? { tint: hlTint(cfg, v.t), k: v.hl } : null);
    }

    return { track, draw };
  }

  function drawCircle(ctx, v, W, H, grow, hl) {
    const minDim = Math.min(W, H);
    // grow !== false: Radius wächst mit dem Anteil (deutlich flacher als früher).
    // grow === false: feste Kreisgröße, es zählt nur die Prozentzahl.
    const radius = grow === false
      ? minDim * 0.085
      : minDim * (0.045 + v.share * 0.09);
    const x = v.x * W;
    const y = v.y * H;
    const pct = Math.round(v.share * 100);

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, v.op));

    // Füllung
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = hl
      ? 'rgba(' + mix(255, hl.tint.r, hl.k) + ',' + mix(90, hl.tint.g, hl.k) + ',' + mix(40, hl.tint.b, hl.k) + ',' + (0.20 + 0.40 * hl.k) + ')'
      : 'rgba(255, 90, 40, 0.20)';
    ctx.fill();

    // Ring
    ctx.lineWidth = Math.max(3, radius * 0.06);
    ctx.strokeStyle = hl
      ? 'rgba(' + mix(255, hl.tint.r, hl.k) + ',' + mix(120, hl.tint.g, hl.k) + ',' + mix(60, hl.tint.b, hl.k) + ',0.95)'
      : 'rgba(255, 120, 60, 0.95)';
    ctx.stroke();

    // Prozent-Label
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.max(14, radius * 0.55) + 'px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = radius * 0.18;
    ctx.fillText(pct + '%', x, y);

    ctx.restore();
  }

  // Nur die Prozentzahl (ohne Kreis), z. B. in hervorgehobenen Zonenflächen.
  function drawPercent(ctx, v, W, H, grow) {
    const minDim = Math.min(W, H);
    const size = Math.max(14, minDim * (grow === false ? 0.05 : 0.035 + v.share * 0.06));
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, v.op));
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + size + 'px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = size * 0.25;
    ctx.fillText(Math.round(v.share * 100) + '%', v.x * W, v.y * H);
    ctx.restore();
  }

  // ---- ZoneRenderer: fixe Kreise an Zonen-Schwerpunkten -------------------
  function createZoneRenderer(canvas, cfg) {
    const grow = cfg.grow;
    const ctx = canvas.getContext('2d');
    let visuals = []; // index-gleich zu den Zonen: {x,y, share,tshare, op}
    const MOVE = 0.18; // Anteil-Lerp
    const FADE = 0.08; // Opacity-Lerp

    function track(zones) {
      const levels = window.HeatZones.highlightLevels(zones, cfg.hl);
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        if (!visuals[i]) visuals[i] = { x: z.x, y: z.y, share: z.share, tshare: z.share, op: 0, hl: 0, thl: 0, t: 0, tt: 0 };
        visuals[i].thl = levels[i].alpha;
        visuals[i].tt = levels[i].t;
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
        v.hl += (v.thl - v.hl) * MOVE;
        v.t += (v.tt - v.t) * MOVE;
      }
      // Hervorgehobene Zonenflächen unter den Kreisen.
      if (cfg.hl !== 'off') {
        visuals.forEach((v, i) => {
          const poly = cfg.zones[i];
          if (!poly || v.hl < 0.01) return;
          const c = hlTint(cfg, v.t);
          ctx.save();
          ctx.beginPath();
          poly.forEach((pt, j) => (j ? ctx.lineTo(pt.x * W, pt.y * H) : ctx.moveTo(pt.x * W, pt.y * H)));
          ctx.closePath();
          ctx.globalAlpha = Math.min(1, v.hl);
          ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.35)';
          ctx.fill();
          ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.004);
          ctx.strokeStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',0.9)';
          ctx.stroke();
          ctx.restore();
        });
      }
      // Mit Hervorhebung zeigen die gefärbten Flächen den Stand — statt Kreisen nur die Prozentzahl.
      if (cfg.hl !== 'off') {
        for (const v of visuals) drawPercent(ctx, v, W, H, grow);
        return;
      }
      // Größte zuletzt zeichnen, damit sie oben liegt.
      const ordered = visuals.slice().sort((a, b) => a.share - b.share);
      for (const v of ordered) drawCircle(ctx, v, W, H, grow, null);
    }

    return { track, draw };
  }

  // ---- Canvas an Device-Pixel anpassen -------------------------------------
  function setupCanvas(canvas) {
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    }
    resize();
    window.addEventListener('resize', resize);
  }

  // ---- Bootstrap -----------------------------------------------------------
  function init() {
    const cfg = readConfig();
    const canvas = document.getElementById('overlay');
    const statusEl = document.getElementById('status');
    if (cfg.status) document.body.classList.add('show-status');
    const log = (msg) => { if (statusEl) statusEl.textContent = msg; };

    setupCanvas(canvas);
    const buffer = window.HeatCore.createBuffer(cfg.windowMs);
    const onClick = (x, y) => buffer.push(x, y);

    if (cfg.sim) {
      window.HeatCore.SimSource(canvas, onClick, cfg.autoclicks, log);
    } else {
      window.HeatCore.HeatSource(cfg.channel, onClick, log);
    }

    if (cfg.mode === 'zones') {
      const zoneRenderer = createZoneRenderer(canvas, cfg);
      const zoneFrame = () => {
        const clicks = buffer.current();
        zoneRenderer.track(window.HeatZones.tallyZones(clicks, cfg.zones));
        zoneRenderer.draw();
        requestAnimationFrame(zoneFrame);
      };
      requestAnimationFrame(zoneFrame);
    } else {
      const renderer = createRenderer(canvas, cfg);
      const frame = () => {
        const clicks = buffer.current();
        const clusters = cluster(clicks, cfg.mergeRadius, cfg.maxCircles, cfg.threshold);
        renderer.track(clusters);
        renderer.draw();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
  }

  if (typeof window !== 'undefined') window.HeatOverlay = { init };
})();
