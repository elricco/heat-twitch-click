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
    };
  }

  // ---- Quellen: liefern normalisierte Klicks onClick(x, y) -----------------
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
      ws.addEventListener('close', () => {
        log('Heat getrennt · Reconnect …');
        setTimeout(connect, 1000);
      });
      ws.addEventListener('error', () => { try { ws.close(); } catch (e) { /* noop */ } });
    }
    connect();
  }

  function SimSource(canvas, onClick, autoclicksPerSec, log) {
    // Echte Mausklicks aufs Overlay erzeugen Test-Daten.
    canvas.style.pointerEvents = 'auto';
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      onClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    });

    // Optional: automatische Klicks, gestreut um ein paar driftende Hotspots.
    if (autoclicksPerSec > 0) {
      const count = 3 + Math.floor(Math.random() * 3); // 3..5 Hotspots
      const hotspots = [];
      for (let i = 0; i < count; i++) {
        hotspots.push({
          x: 0.15 + Math.random() * 0.7,
          y: 0.15 + Math.random() * 0.7,
          vx: (Math.random() - 0.5) * 0.0008,
          vy: (Math.random() - 0.5) * 0.0008,
          weight: 0.4 + Math.random(),
        });
      }
      const clamp01 = (v) => Math.min(1, Math.max(0, v));
      const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      setInterval(() => {
        // Hotspots leicht driften lassen (mit Abprallen an den Rändern).
        for (const h of hotspots) {
          h.x += h.vx; h.y += h.vy;
          if (h.x < 0.1 || h.x > 0.9) h.vx *= -1;
          if (h.y < 0.1 || h.y > 0.9) h.vy *= -1;
        }
        // Gewichteten Hotspot wählen und Klick darum streuen.
        const total = hotspots.reduce((s, h) => s + h.weight, 0);
        let r = Math.random() * total;
        let pick = hotspots[0];
        for (const h of hotspots) { r -= h.weight; if (r <= 0) { pick = h; break; } }
        onClick(clamp01(pick.x + gauss() * 0.06), clamp01(pick.y + gauss() * 0.06));
      }, 1000 / autoclicksPerSec);
    }
    log(autoclicksPerSec > 0 ? 'Sim-Modus · Auto-Klicks' : 'Sim-Modus · klicke ins Bild');
  }

  // ---- Buffer: Klicks im gleitenden Zeitfenster ----------------------------
  function createBuffer(windowMs) {
    const clicks = [];
    return {
      push(x, y) { clicks.push({ x, y, t: performance.now() }); },
      current() {
        const cutoff = performance.now() - windowMs;
        while (clicks.length && clicks[0].t < cutoff) clicks.shift();
        return clicks;
      },
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
  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    let visuals = []; // {x,y, tx,ty, share,tshare, op,top}
    const MOVE = 0.18; // Position/Anteil-Lerp
    const FADE = 0.08; // Opacity-Lerp
    const MATCH_DIST2 = 0.04; // ~0.2 normalisierte Distanz: gleicher Kreis

    function track(clusters) {
      const used = new Set();
      for (const cl of clusters) {
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
          visuals.push({ x: cl.x, y: cl.y, tx: cl.x, ty: cl.y, share: cl.share, tshare: cl.share, op: 0, top: 1 });
          used.add(visuals.length - 1);
        } else {
          const v = visuals[best];
          v.tx = cl.x; v.ty = cl.y; v.tshare = cl.share; v.top = 1;
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
      }
      visuals = visuals.filter((v) => !(v.top === 0 && v.op < 0.02));

      // Größte zuletzt zeichnen, damit sie oben liegen.
      const ordered = visuals.slice().sort((a, b) => a.share - b.share);
      for (const v of ordered) drawCircle(ctx, v, W, H);
    }

    return { track, draw };
  }

  function drawCircle(ctx, v, W, H) {
    const minDim = Math.min(W, H);
    const radius = minDim * (0.06 + v.share * 0.20);
    const x = v.x * W;
    const y = v.y * H;
    const pct = Math.round(v.share * 100);

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, v.op));

    // Füllung
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 90, 40, 0.20)';
    ctx.fill();

    // Ring
    ctx.lineWidth = Math.max(3, radius * 0.06);
    ctx.strokeStyle = 'rgba(255, 120, 60, 0.95)';
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

  // ---- Bootstrap -----------------------------------------------------------
  function init() {
    const cfg = readConfig();
    const canvas = document.getElementById('overlay');
    const statusEl = document.getElementById('status');
    if (cfg.status) document.body.classList.add('show-status');
    const log = (msg) => { if (statusEl) statusEl.textContent = msg; };

    setupCanvas(canvas);
    const buffer = createBuffer(cfg.windowMs);
    const onClick = (x, y) => buffer.push(x, y);

    if (cfg.sim) {
      SimSource(canvas, onClick, cfg.autoclicks, log);
    } else {
      HeatSource(cfg.channel, onClick, log);
    }

    const renderer = createRenderer(canvas);
    function frame() {
      const clicks = buffer.current();
      const clusters = cluster(clicks, cfg.mergeRadius, cfg.maxCircles, cfg.threshold);
      renderer.track(clusters);
      renderer.draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (typeof window !== 'undefined') window.HeatOverlay = { init };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseZones, pointInPolygon, centroid };
  }
})();
