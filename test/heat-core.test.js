const test = require('node:test');
const assert = require('node:assert');
const { createBuffer } = require('../js/heat-core.js');

test('createBuffer: verwirft Klicks älter als das Fenster', () => {
  let t = 1000;
  const buf = createBuffer(500, () => t);
  buf.push(0.1, 0.1);          // t=1000
  t = 1200; buf.push(0.2, 0.2); // t=1200
  t = 1400;
  assert.strictEqual(buf.current().length, 2); // beide < 500ms alt
  t = 1600;
  const cur = buf.current();   // 1000 ist jetzt 600ms alt -> raus
  assert.strictEqual(cur.length, 1);
  assert.strictEqual(cur[0].x, 0.2);
});
