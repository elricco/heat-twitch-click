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
