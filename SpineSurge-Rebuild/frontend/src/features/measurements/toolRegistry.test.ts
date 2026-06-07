/* Tool-registry wiring test. The clinical numbers are already locked by the golden parity suite;
 * this proves the registry plumbs points → calculator → calibration-formatted rows correctly:
 * right point counts, right row shape, lengths follow calibration, angles are calibration-invariant. */
import { describe, it, expect } from 'vitest';
import type { Point } from '@/lib/canvas/GeometryUtils';
import { TOOL_SPECS, isWiredTool } from './toolRegistry';

const p = (x: number, y: number): Point => ({ x, y });
const uncal = { pixelToMm: null };
const cal = { pixelToMm: 0.5 };

describe('toolRegistry', () => {
  it('exposes the core wired tools with sane point counts', () => {
    for (const t of ['Cobb', 'SVA', 'PI-LL', 'Pelvis', 'CMC', 'VBM', 'TK', 'LL', 'CL']) {
      expect(TOOL_SPECS[t]).toBeDefined();
    }
    expect(TOOL_SPECS.Cobb.pointsNeeded).toBe(4);
    expect(TOOL_SPECS.SVA.pointsNeeded).toBe(2);
    expect(TOOL_SPECS['PI-LL'].pointsNeeded).toBe(8);
    expect(TOOL_SPECS.Pelvis.pointsNeeded).toBe(6);
    // every spec is internally consistent
    for (const spec of Object.values(TOOL_SPECS)) {
      expect(spec.pointsNeeded).toBeGreaterThan(0);
      expect(typeof spec.compute).toBe('function');
      expect(typeof spec.raw).toBe('function');
    }
  });

  it('isWiredTool guards unknown tools', () => {
    expect(isWiredTool('Cobb')).toBe(true);
    expect(isWiredTool('Annotation')).toBe(false); // a manual tool, not wired to a calculator
    expect(isWiredTool(null)).toBe(false);
  });

  it('Cobb returns one angle row in degrees (~20° for ±10° endplates)', () => {
    const rows = TOOL_SPECS.Cobb.compute(
      [p(0, 0), p(100, -17.6327), p(0, 100), p(100, 117.6327)],
      uncal,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Cobb Angle');
    expect(rows[0].display).toMatch(/^20\.0°$/);
  });

  it('SVA length follows calibration (px uncalibrated, mm calibrated at half scale)', () => {
    const pts = [p(110, 50), p(100, 300)];
    const px = TOOL_SPECS.SVA.compute(pts, uncal)[0].display;
    const mm = TOOL_SPECS.SVA.compute(pts, cal)[0].display;
    expect(px).toMatch(/px$/);
    expect(mm).toMatch(/mm$/);
    const pxVal = Number.parseFloat(px);
    const mmVal = Number.parseFloat(mm);
    expect(mmVal).toBeCloseTo(pxVal * 0.5, 6); // calibration scales the number, not just the unit
  });

  it('PI-LL yields PI, LL and mismatch rows, all in degrees (calibration-invariant)', () => {
    const pts = [
      p(300, 400), p(320, 400), p(360, 400), p(380, 400),
      p(250, 360), p(290, 380), p(255, 150), p(300, 160),
    ];
    const a = TOOL_SPECS['PI-LL'].compute(pts, uncal);
    const b = TOOL_SPECS['PI-LL'].compute(pts, cal);
    expect(a.map((r) => r.label)).toEqual([
      'Pelvic Incidence (PI)',
      'Lumbar Lordosis (LL)',
      'PI – LL Mismatch',
    ]);
    expect(a.every((r) => r.display.endsWith('°'))).toBe(true);
    expect(b).toEqual(a); // angles do not change with calibration
  });

  it('exposes the full deformity suite (coronal + sagittal) with correct point counts', () => {
    const expected: Record<string, number> = {
      TS: 3, AVT: 3, PO: 2, RVAD: 6, // coronal
      TPA: 7, SSA: 3, SPA: 7, T1SPi: 5, T9SPi: 5, ODHA: 5, CBVA: 2, // sagittal
    };
    for (const [abbr, count] of Object.entries(expected)) {
      expect(isWiredTool(abbr)).toBe(true);
      expect(TOOL_SPECS[abbr].pointsNeeded).toBe(count);
    }
  });

  it('PO is a calibration-invariant angle; TS length follows calibration', () => {
    const po = TOOL_SPECS.PO.compute([p(100, 200), p(300, 100)], uncal);
    expect(po).toHaveLength(1);
    expect(po[0].display).toMatch(/°$/);
    expect(TOOL_SPECS.PO.compute([p(100, 200), p(300, 100)], cal)).toEqual(po); // invariant

    const tsPts = [p(120, 60), p(180, 400), p(220, 400)];
    const tsPx = Number.parseFloat(TOOL_SPECS.TS.compute(tsPts, uncal)[0].display);
    const tsMm = Number.parseFloat(TOOL_SPECS.TS.compute(tsPts, cal)[0].display);
    expect(tsMm).toBeCloseTo(tsPx * 0.5, 6);
  });

  it('RVAD returns right/left rib angles and the difference, all in degrees', () => {
    const rows = TOOL_SPECS.RVAD.compute(
      [p(360, 200), p(420, 230), p(240, 200), p(180, 235), p(280, 210), p(340, 215)],
      uncal,
    );
    expect(rows.map((r) => r.label)).toEqual(['Rib Angle (Right)', 'Rib Angle (Left)', 'RVAD']);
    expect(rows.every((r) => r.display.endsWith('°'))).toBe(true);
  });

  it('T1SPi/T9SPi/ODHA share the SPi math and report a non-negative angle', () => {
    const pts = [p(280, 400), p(300, 400), p(360, 400), p(380, 400), p(330, 120)];
    for (const abbr of ['T1SPi', 'T9SPi', 'ODHA']) {
      const rows = TOOL_SPECS[abbr].compute(pts, uncal);
      expect(rows).toHaveLength(1);
      expect(Number.parseFloat(rows[0].display)).toBeGreaterThanOrEqual(0);
      expect(TOOL_SPECS[abbr].raw(pts).angle.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('VBM splits its multi-line output into labelled rows and honours calibration', () => {
    const corners = [p(0, 0), p(40, 2), p(42, 35), p(2, 33)];
    const px = TOOL_SPECS.VBM.compute(corners, uncal);
    const mm = TOOL_SPECS.VBM.compute(corners, cal);
    expect(px.length).toBeGreaterThan(1);
    expect(px.some((r) => r.display.endsWith('px'))).toBe(true);
    expect(mm.some((r) => r.display.endsWith('mm'))).toBe(true);
  });
});
