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

  // Farbskala Gelb (t=0, wenige Klicks) -> Rot (t=1, viele Klicks), stufenlos über Orange.
  function scaleColor(t) {
    const k = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
    return { r: 255, g: Math.round(220 * (1 - k)), b: 0 };
  }

  // Hervorhebungs-Stufen je Bereich (Zone oder Cluster) mit { share }.
  //   'color': nur der Spitzenreiter (share > 0, bei Gleichstand der erste) -> { alpha: 1, t: 1 }.
  //   'scale': alle mit share > 0 -> { alpha: 1, t: share / maxShare } (relativ zum Spitzenreiter).
  // Alles andere (und mode 'off') -> { alpha: 0, t: 0 }.
  function highlightLevels(items, mode) {
    const off = { alpha: 0, t: 0 };
    if (mode !== 'color' && mode !== 'scale') return items.map(() => off);
    let top = -1;
    let max = 0;
    items.forEach((it, i) => { if (it.share > max) { max = it.share; top = i; } });
    return items.map((it, i) => {
      if (top === -1 || it.share <= 0) return off;
      if (mode === 'color') return i === top ? { alpha: 1, t: 1 } : off;
      return { alpha: 1, t: it.share / max };
    });
  }

  const api = { parseZones, pointInPolygon, centroid, tallyZones, scaleColor, highlightLevels };
  if (typeof window !== 'undefined') window.HeatZones = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
