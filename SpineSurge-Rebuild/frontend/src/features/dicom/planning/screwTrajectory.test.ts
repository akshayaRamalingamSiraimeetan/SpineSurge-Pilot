import { describe, expect, it } from 'vitest';
import { defaultScrewProperties, makeScrew, reconcileScrewSize, screwTrajectory } from './screwTrajectory';

describe('defaultScrewProperties', () => {
  it('uses the level catalog (lumbar L4 → 5.0mm × 35mm, orange)', () => {
    const p = defaultScrewProperties('L4');
    expect(p.diameter).toBe(5.0);
    expect(p.length).toBe(35);
    expect(p.color).toBe('#f97316');
  });

  it('falls back to the lumbar default for an unknown level', () => {
    expect(defaultScrewProperties('ZZ').diameter).toBe(5.0);
  });
});

describe('makeScrew', () => {
  it('anchors a screw at the world point with the level defaults and anterior direction', () => {
    const s = makeScrew('s1', [10, 20, 30], 'T1', 'L', 'sim1');
    expect(s.position).toEqual([10, 20, 30]);
    expect(s.direction).toEqual([0, -1, 0]);
    expect(s.level).toBe('T1');
    expect(s.side).toBe('L');
    expect(s.simulationId).toBe('sim1');
    expect(s.properties.diameter).toBe(3.5); // upper-thoracic first measurement
  });
});

describe('screwTrajectory', () => {
  it('places the tip at depth along the axis and the entry one length behind it', () => {
    const screw = makeScrew('s1', [0, 0, 0], 'L4', 'L');
    screw.properties = { ...screw.properties, length: 40, depth: 40, caudalAngle: 0, medialAngle: 0 };
    const { entry, tip } = screwTrajectory(screw);
    // direction [0,-1,0], depth 40 → tip at y = -40; entry one length (40) behind tip → y = 0.
    expect(tip[1]).toBeCloseTo(-40, 6);
    expect(entry[1]).toBeCloseTo(0, 6);
  });
});

describe('reconcileScrewSize', () => {
  it('snaps a length to the nearest offered value for the chosen diameter', () => {
    // Lumbar 6.0mm offers [40,45,50]; 47 → 45.
    expect(reconcileScrewSize('L4', 6.0, 47)).toEqual({ diameter: 6.0, length: 45 });
  });

  it('clamps an unavailable diameter to the first catalog entry', () => {
    expect(reconcileScrewSize('L4', 99, 40).diameter).toBe(5.0);
  });
});
