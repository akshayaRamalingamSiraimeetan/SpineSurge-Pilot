import { describe, expect, it } from 'vitest';
import type { Measurement } from '@/lib/canvas/CanvasManager';
import { autoFillLandmarks, collectLandmarks, landmarkCount } from './landmarks';
import { computeMeasurementResult } from './results';
import { familyOf, toolColor, FAMILY_COLORS } from '@/lib/canvas/annotationStyle';

const m = (toolKey: string, points: { x: number; y: number }[], timestamp = 1): Measurement =>
    ({ id: `${toolKey}-${timestamp}`, toolKey, points, fragmentId: null, timestamp });

// Femoral heads (2 diameters) + S1 endplate
const PELVIS = [
    { x: 300, y: 600 }, { x: 360, y: 600 },
    { x: 310, y: 610 }, { x: 370, y: 610 },
    { x: 260, y: 420 }, { x: 200, y: 380 },
];

describe('landmark reuse', () => {
    it('pre-fills femoral heads and S1 from a pelvis measurement into PI-LL', () => {
        const known = collectLandmarks([m('pelvis', PELVIS)]);
        const filled = autoFillLandmarks('pi_ll', [], known);
        expect(filled).toEqual(PELVIS);           // only the two L1 points remain
        expect(landmarkCount('pi_ll') - filled.length).toBe(2);
    });

    it('fills later landmarks after the user clicks a tool-specific point', () => {
        const known = collectLandmarks([m('pelvis', PELVIS)]);
        // TPA: 4 femoral points known, T1 unknown → stop; after clicking T1, S1 is appended
        expect(autoFillLandmarks('tpa', [], known)).toHaveLength(4);
        const afterT1 = autoFillLandmarks('tpa', [...PELVIS.slice(0, 4), { x: 250, y: 100 }], known);
        expect(afterT1).toHaveLength(7);
        expect(afterT1[5]).toEqual(PELVIS[4]);   // S1 anterior
        expect(afterT1[6]).toEqual(PELVIS[5]);   // S1 posterior
    });

    it('maps landmarks by name, not index (SSA lists S1 posterior before anterior)', () => {
        const known = collectLandmarks([m('pelvis', PELVIS), m('sva', [{ x: 240, y: 80 }, PELVIS[5]], 2)]);
        expect(autoFillLandmarks('ssa', [], known)).toEqual([{ x: 240, y: 80 }, PELVIS[5], PELVIS[4]]);
    });

    it('uses the most recent measurement when a landmark was placed twice', () => {
        const moved = PELVIS.map((p) => ({ x: p.x + 5, y: p.y }));
        const known = collectLandmarks([m('pelvis', moved, 5), m('pelvis', PELVIS, 1)]);
        expect(autoFillLandmarks('pelvis', [], known)[0]).toEqual(moved[0]);
    });

    it('leaves tools without a landmark schema untouched', () => {
        const known = collectLandmarks([m('pelvis', PELVIS)]);
        expect(autoFillLandmarks('cobb', [{ x: 1, y: 1 }], known)).toEqual([{ x: 1, y: 1 }]);
    });
});

describe('computeMeasurementResult', () => {
    it('matches the pelvic parameter format used by the panel', () => {
        const r = computeMeasurementResult('pelvis', PELVIS)!;
        expect(r).toMatch(/^PI: [\d.]+°\nPT: [\d.]+°\nSS: [\d.]+°$/);
    });
    it('returns undefined until enough points exist', () => {
        expect(computeMeasurementResult('cobb', [{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBeUndefined();
    });
    it('computes a 3-point angle at the middle vertex', () => {
        expect(computeMeasurementResult('angle-3pt', [{ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }])).toBe('3 pt angle: 90.0°');
    });
});

describe('tool colour families', () => {
    it('follows the left-sidebar tabs', () => {
        expect(familyOf('pelvis')).toBe('alignment');
        expect(familyOf('tpa')).toBe('extended');
        expect(familyOf('stenosis')).toBe('morphology');
        expect(familyOf('ost-pso')).toBe('planning');
        expect(familyOf('angle-3pt')).toBe('generic');
        expect(toolColor('line')).toBe(FAMILY_COLORS.generic);
    });
});
