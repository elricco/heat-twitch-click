const test = require('node:test');
const assert = require('node:assert');
const { evaluateZones } = require('../js/heat-actions.js');

const cfg1 = [{ action: 'A', enter: 20, rearm: 10, cooldown: 60000 }];
const armed = () => [{ armed: true, cooldownUntil: 0 }];

test('feuert beim Überschreiten von enter', () => {
  const { states, fires } = evaluateZones(armed(), [20], 1000, cfg1);
  assert.deepStrictEqual(fires, [0]);
  assert.strictEqual(states[0].armed, false);
  assert.strictEqual(states[0].cooldownUntil, 1000 + 60000);
});

test('feuert nicht unter enter', () => {
  const { fires } = evaluateZones(armed(), [19], 1000, cfg1);
  assert.deepStrictEqual(fires, []);
});

test('feuert nicht erneut während Cooldown, auch über enter', () => {
  const st = [{ armed: false, cooldownUntil: 50000 }];
  const { fires } = evaluateZones(st, [30], 40000, cfg1);
  assert.deepStrictEqual(fires, []);
});

test('wird erst scharf, wenn count <= rearm UND Cooldown vorbei', () => {
  const st = [{ armed: false, cooldownUntil: 50000 }];
  let r = evaluateZones(st, [12], 60000, cfg1); // count(12) > rearm(10) -> bleibt unscharf
  assert.strictEqual(r.states[0].armed, false);
  r = evaluateZones(r.states, [10], 61000, cfg1); // count<=rearm & Cooldown vorbei -> scharf
  assert.strictEqual(r.states[0].armed, true);
});

test('Zone ohne Action feuert nie', () => {
  const cfg = [{ action: '', enter: 1, rearm: 0, cooldown: 1000 }];
  const { fires } = evaluateZones(armed(), [99], 1000, cfg);
  assert.deepStrictEqual(fires, []);
});

test('mehrere Zonen unabhängig', () => {
  const cfg = [
    { action: 'A', enter: 5, rearm: 2, cooldown: 1000 },
    { action: 'B', enter: 5, rearm: 2, cooldown: 1000 },
  ];
  const st = [{ armed: true, cooldownUntil: 0 }, { armed: true, cooldownUntil: 0 }];
  const { fires } = evaluateZones(st, [5, 1], 100, cfg);
  assert.deepStrictEqual(fires, [0]);
});
