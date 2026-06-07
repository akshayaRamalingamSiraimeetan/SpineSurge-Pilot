/* Step 8b parity/behavior lock for PedicleLogic.
 *
 * PedicleLogic's volume-probing functions read a live Cornerstone volume via the global `cache`, so
 * they can't be parity-locked through the node golden suite. Instead we mock `cache.getVolume` with a
 * deterministic SYNTHETIC volume and pin the ported functions' outputs to hand-verifiable values.
 * The module was copied verbatim from the old repo (proven by `diff` at port time — see
 * test/divergences.md), so these pinned values equal the old behavior.
 *
 * Synthetic volume: 10×10×10, spacing 1, origin 0; voxel = 1000 (bone) where x ≥ 5, else −1024.
 * Index order: x + y*nx + z*nx*ny (matches PedicleLogic's worldToIJK).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cache } from '@cornerstonejs/core';
import {
  calculatePedicleAxis,
  calculateScrewDistance,
  probeBoneBoundary,
  estimateScrewDimensions,
  calculateBoneContact,
  formatCoordinateData,
} from './PedicleLogic';

const NX = 10;
const NY = 10;
const NZ = 10;
const data = new Int16Array(NX * NY * NZ);
for (let z = 0; z < NZ; z++) {
  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) {
      data[z * NX * NY + y * NX + x] = x >= 5 ? 1000 : -1024;
    }
  }
}

const fakeVolume = {
  getScalarData: () => data,
  dimensions: [NX, NY, NZ] as [number, number, number],
  spacing: [1, 1, 1] as [number, number, number],
  origin: [0, 0, 0] as [number, number, number],
};

function mockCache() {
  vi.spyOn(cache, 'getVolume').mockReturnValue(
    fakeVolume as unknown as ReturnType<typeof cache.getVolume>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('PedicleLogic — pure helpers', () => {
  it('calculatePedicleAxis normalizes (vap - pip)', () => {
    expect(calculatePedicleAxis([8, 5, 5], [2, 5, 5])).toEqual([1, 0, 0]);
    const diag = calculatePedicleAxis([0, 3, 4], [0, 0, 0]);
    expect(diag[0]).toBeCloseTo(0, 12);
    expect(diag[1]).toBeCloseTo(0.6, 12);
    expect(diag[2]).toBeCloseTo(0.8, 12);
  });

  it('calculateScrewDistance is the Euclidean magnitude', () => {
    expect(calculateScrewDistance([0, 0, 0], [3, 4, 0])).toBeCloseTo(5, 12);
    expect(calculateScrewDistance([0, 0, 0], [2, 3, 6])).toBeCloseTo(7, 12);
  });

  it('formatCoordinateData renders 1-decimal LPS', () => {
    expect(formatCoordinateData([1.234, -5, 10.55])).toBe('[1.2, -5.0, 10.6]');
  });
});

describe('PedicleLogic — volume probing (synthetic volume, mocked cache)', () => {
  it('returns null when no volume is cached', () => {
    vi.spyOn(cache, 'getVolume').mockReturnValue(undefined as unknown as ReturnType<typeof cache.getVolume>);
    expect(probeBoneBoundary('v', [0, 5, 5], [1, 0, 0])).toBeNull();
    expect(calculateBoneContact('v', [6, 5, 5], [1, 0, 0], 3, 6.5)).toBe(0);
  });

  it('probeBoneBoundary marches to the first bone voxel', () => {
    mockCache();
    // From x=0 toward +x, bone starts at x=5 → first hit at [5,5,5].
    expect(probeBoneBoundary('v', [0, 5, 5], [1, 0, 0])).toEqual([5, 5, 5]);
  });

  it('probeBoneBoundary returns null when the ray never reaches bone', () => {
    mockCache();
    // From x=1 toward -x: only soft tissue / out of bounds.
    expect(probeBoneBoundary('v', [1, 5, 5], [-1, 0, 0])).toBeNull();
  });

  it('estimateScrewDimensions clamps short pedicles to the 30mm minimum', () => {
    mockCache();
    // pip on bone (x=8) → boneEntry [8,5,5]; |vap-boneEntry| = 6 → round(6/5)*5 = 5 → clamp → 30.
    expect(estimateScrewDimensions('v', [2, 5, 5], [8, 5, 5])).toEqual({ diameter: 6.5, length: 30 });
  });

  it('estimateScrewDimensions falls back to 40mm when no cortical entry is found', () => {
    mockCache();
    // Both points in soft tissue, axis points away from bone → probe miss → default length 40.
    expect(estimateScrewDimensions('v', [2, 5, 5], [1, 5, 5])).toEqual({ diameter: 6.5, length: 40 });
  });

  it('calculateBoneContact is 100% fully inside bone and 0% in soft tissue', () => {
    mockCache();
    expect(calculateBoneContact('v', [6, 5, 5], [1, 0, 0], 3, 6.5)).toBe(100);
    expect(calculateBoneContact('v', [1, 5, 5], [-1, 0, 0], 3, 6.5)).toBe(0);
  });
});
