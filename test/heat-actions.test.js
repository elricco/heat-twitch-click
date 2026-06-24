const test = require('node:test');
const assert = require('node:assert');
const { evaluateZones, parseActions } = require('../js/heat-actions.js');

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

test('parseActions: zwei Zonen, Sekunden -> ms, Name dekodiert', () => {
  const out = parseActions('20|10|60|Link%20posten;15|8|45|Discord', 2);
  assert.deepStrictEqual(out[0], { action: 'Link posten', enter: 20, rearm: 10, cooldown: 60000 });
  assert.deepStrictEqual(out[1], { action: 'Discord', enter: 15, rearm: 8, cooldown: 45000 });
});

test('parseActions: fehlende Einträge werden auf Länge gepolstert (skip)', () => {
  const out = parseActions('20|10|60|A', 3);
  assert.strictEqual(out.length, 3);
  assert.strictEqual(out[1].action, '');
  assert.strictEqual(out[2].action, '');
});

test('parseActions: rearm>=enter wird auf enter-1 geklemmt', () => {
  const out = parseActions('20|25|60|A', 1);
  assert.strictEqual(out[0].rearm, 19);
});

test('parseActions: leerer Name -> skip-Eintrag', () => {
  const out = parseActions('20|10|60|', 1);
  assert.strictEqual(out[0].action, '');
});

test('parseActions: leerer/fehlender String -> alle skip', () => {
  const out = parseActions('', 2);
  assert.strictEqual(out.length, 2);
  assert.ok(out.every((e) => e.action === ''));
});
