import { describe, expect, it } from 'vitest';
import type { Measurement } from '@/lib/canvas/CanvasManager';
import { assessMeasurement, inferAnterior } from './clinicalRanges';

const m = (toolKey: string, points: { x: number; y: number }[], timestamp = 1): Measurement =>
    ({ id: toolKey + timestamp, toolKey, points, fragmentId: null, timestamp });
const ctx = { age: 35, mmPerPx: 1, pi: null, anterior: null } as const;

describe('clinical colour ranges', () => {
    it('Cobb: ≤10° healthy, 10–20° borderline, >20° abnormal', () => {
        const cobb = (deg: number) => {
            const r = (deg * Math.PI) / 180;
            return m('cobb', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100 * Math.cos(r), y: 100 + 100 * Math.sin(r) }]);
        };
        expect(assessMeasurement(cobb(5), '', ctx).status).toBe('good');
        expect(assessMeasurement(cobb(15), '', ctx).status).toBe('borderline');
        expect(assessMeasurement(cobb(30), '', ctx).status).toBe('bad');
    });

    it('SVA uses the age band and needs calibration', () => {
        const sva = m('sva', [{ x: 145, y: 0 }, { x: 100, y: 500 }]); // 45 mm
        expect(assessMeasurement(sva, '', { ...ctx, age: 35 }).status).toBe('borderline'); // <40: 30–50
        expect(assessMeasurement(sva, '', { ...ctx, age: 70 }).status).toBe('good');       // >60: 0–50
        expect(assessMeasurement(sva, '', { ...ctx, mmPerPx: null }).status).toBeNull();
        expect(assessMeasurement(sva, '', { ...ctx, age: null }).status).toBeNull();
    });

    it('T1SPi sign follows the facing direction', () => {
        // hip axis at (300, 600); T1 slightly to the right of it
        const spi = m('t1spi', [{ x: 280, y: 600 }, { x: 320, y: 600 }, { x: 280, y: 600 }, { x: 320, y: 600 }, { x: 330, y: 100 }]);
        expect(assessMeasurement(spi, '', { ...ctx, anterior: 1 }).status).toBe('borderline');  // +3.4° forward
        expect(assessMeasurement(spi, '', { ...ctx, anterior: -1 }).status).toBe('good');       // −3.4°
        expect(assessMeasurement(spi, '', ctx).status).toBeNull();                               // facing unknown
    });

    it('infers facing from SSA (S1 anterior point)', () => {
        expect(inferAnterior([m('ssa', [{ x: 0, y: 0 }, { x: 100, y: 500 }, { x: 160, y: 520 }])])).toBe(1);
        expect(inferAnterior([m('ssa', [{ x: 0, y: 0 }, { x: 160, y: 500 }, { x: 100, y: 520 }])])).toBe(-1);
    });

    it('does not judge tools outside the tables', () => {
        expect(assessMeasurement(m('vbm', [{ x: 0, y: 0 }]), '', ctx).status).toBeNull();
    });
});
