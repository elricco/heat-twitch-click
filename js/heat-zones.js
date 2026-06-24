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
