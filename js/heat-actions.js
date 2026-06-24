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

  const api = { evaluateZones, parseActions, buildDoAction, sha256b64, computeAuth, createSbClient, init };
  if (typeof window !== 'undefined') window.HeatActions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
