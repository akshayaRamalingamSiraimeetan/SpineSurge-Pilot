/* Coordinate-mapping proof for the osteotomy canvas. screenToWorld and worldToScreen must be exact
 * inverses, and the fit must keep aspect ratio and centre the image — the invariants that keep
 * cut/wedge points landing where the surgeon clicked regardless of viewport size. */
import { describe, it, expect } from 'vitest';
import { computeFitTransform, screenToWorld, worldToScreen, zoomAbout, MIN_SCALE, MAX_SCALE } from './fitTransform';

describe('fitTransform', () => {
  it('contains a portrait image in a landscape viewport, centred, aspect-preserved', () => {
    const t = computeFitTransform(800, 1600, 1000, 1000);
    expect(t.scale).toBeCloseTo(1000 / 1600, 9); // limited by height
    // image width on screen = 800 * scale = 500 → centred → offsetX = 250
    expect(t.offsetX).toBeCloseTo((1000 - 800 * t.scale) / 2, 9);
    expect(t.offsetY).toBeCloseTo(0, 9);
  });

  it('round-trips screen↔world for arbitrary points', () => {
    const t = computeFitTransform(1024, 768, 640, 480, 12);
    for (const [wx, wy] of [[0, 0], [1024, 768], [513.7, 211.2]]) {
      const s = worldToScreen(wx, wy, t);
      const w = screenToWorld(s.x, s.y, t);
      expect(w.x).toBeCloseTo(wx, 6);
      expect(w.y).toBeCloseTo(wy, 6);
    }
  });

  it('zoomAbout keeps the image point under the cursor fixed', () => {
    const t = computeFitTransform(1000, 1000, 800, 600);
    const anchor = { x: 250, y: 175 };
    const before = screenToWorld(anchor.x, anchor.y, t);
    const zoomed = zoomAbout(t, 2.5, anchor.x, anchor.y);
    const after = screenToWorld(anchor.x, anchor.y, zoomed);
    expect(zoomed.scale).toBeCloseTo(t.scale * 2.5, 9);
    expect(after.x).toBeCloseTo(before.x, 6); // same world point still under the cursor
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('zoomAbout clamps scale to [MIN_SCALE, MAX_SCALE]', () => {
    const t = { scale: 1, offsetX: 0, offsetY: 0 };
    expect(zoomAbout(t, 1000, 0, 0).scale).toBeCloseTo(MAX_SCALE, 9);
    expect(zoomAbout(t, 0.00001, 0, 0).scale).toBeCloseTo(MIN_SCALE, 9);
  });

  it('degrades gracefully on zero-size inputs (no NaN/Infinity)', () => {
    const t = computeFitTransform(0, 0, 500, 500);
    expect(Number.isFinite(t.scale)).toBe(true);
    expect(Number.isFinite(t.offsetX)).toBe(true);
    const w = screenToWorld(10, 10, t);
    expect(Number.isFinite(w.x)).toBe(true);
  });
});
