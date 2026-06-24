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

  const api = { evaluateZones, parseActions };
  if (typeof window !== 'undefined') window.HeatActions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
