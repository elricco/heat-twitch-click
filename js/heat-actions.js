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
