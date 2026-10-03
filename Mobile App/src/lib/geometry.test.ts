// Run: npm test   (node's built-in test runner, no extra deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleAt, cobbAngle, measure, mmPerPx } from './geometry.ts';

const line = (deg: number, cy = 0) => {
  const r = (deg * Math.PI) / 180;
  return [{ x: -50 * Math.cos(r), y: cy - 50 * Math.sin(r) }, { x: 50 * Math.cos(r), y: cy + 50 * Math.sin(r) }];
};
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≉ ${b}`);

test('cobb is independent of click direction', () => {
  const [a1, a2] = line(10), [b1, b2] = line(-10, 300);
  close(cobbAngle(a1, a2, b1, b2), 20);
  close(cobbAngle(a2, a1, b2, b1), 20);
});

test('cobb reports curves above 90°', () => {
  const [a1, a2] = line(55), [b1, b2] = line(-55, 300);
  close(cobbAngle(a1, a2, b1, b2), 110);
});

test('angle at vertex', () => {
  close(angleAt({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }), 90);
});

test('calibrated distance in mm', () => {
  const cal = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] as [{ x: number; y: number }, { x: number; y: number }], mm: 50 };
  close(mmPerPx(cal)!, 0.5);
  const v = measure({ type: 'distance', points: [{ x: 0, y: 0 }, { x: 0, y: 40 }] }, cal)!;
  close(v.value, 20);
  assert.equal(v.unit, 'mm');
});
