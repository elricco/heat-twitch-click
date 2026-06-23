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

const { pointInPolygon, centroid } = require('../js/heat-overlay.js');
const unitSquare = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

test('pointInPolygon: Punkt innen', () => {
  assert.strictEqual(pointInPolygon({ x: 0.5, y: 0.5 }, unitSquare), true);
});

test('pointInPolygon: Punkt außen', () => {
  assert.strictEqual(pointInPolygon({ x: 1.5, y: 0.5 }, unitSquare), false);
});

test('pointInPolygon: nicht-konvexes Viereck', () => {
  // Chevron mit Einkerbung unten: Reflex-Ecke bei (0.5, 0.4).
  const dart = [{ x: 0, y: 0 }, { x: 0.5, y: 0.4 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }];
  assert.strictEqual(pointInPolygon({ x: 0.5, y: 0.7 }, dart), true);   // im Körper
  assert.strictEqual(pointInPolygon({ x: 0.5, y: 0.2 }, dart), false);  // in der Einkerbung
});

test('centroid: Einheitsquadrat -> Mitte', () => {
  assert.deepStrictEqual(centroid(unitSquare), { x: 0.5, y: 0.5 });
});
