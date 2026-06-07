import { describe, expect, it } from 'vitest';
import { boneOpacityPoints, DEFAULT_HU_THRESHOLD } from './volumePresets';

describe('boneOpacityPoints', () => {
  it('matches the old viewer control points at the default threshold', () => {
    expect(boneOpacityPoints(DEFAULT_HU_THRESHOLD)).toEqual([
      [299, 0],
      [300, 0],
      [350, 0.2],
      [600, 0.6],
      [3000, 0.9],
    ]);
  });

  it('shifts the soft-tissue cutoff with the threshold but pins the dense-bone anchor', () => {
    const pts = boneOpacityPoints(500);
    expect(pts[0]).toEqual([499, 0]);
    expect(pts[1]).toEqual([500, 0]);
    expect(pts[pts.length - 1]).toEqual([3000, 0.9]);
  });

  it('is monotonically non-decreasing in opacity', () => {
    const ys = boneOpacityPoints(300).map(([, y]) => y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1]);
  });
});
