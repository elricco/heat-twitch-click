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
