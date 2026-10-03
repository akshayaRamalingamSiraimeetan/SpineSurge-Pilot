import { describe, expect, it } from 'vitest';
import type { Measurement } from '@/lib/canvas/CanvasManager';
import { isPlanMeasurement, parseResultLine, preopVsPlanRows, registerMeasurements } from './plan';

const m = (toolKey: string, points: { x: number; y: number }[], timestamp = 1, result = ''): Measurement =>
    ({ id: `${toolKey}-${timestamp}`, toolKey, points, fragmentId: null, timestamp, result });

// PSO: hinge B anterior (right), upper cut to A, lower cut to C
const PSO = m('ost-pso', [{ x: 200, y: 460 }, { x: 400, y: 500 }, { x: 200, y: 540 }], 10);

describe('plan registration', () => {
    it('moves preop landmarks on the upper piece with the bone, leaves the lower piece alone', () => {
        const sva = m('sva', [{ x: 300, y: 100 }, { x: 250, y: 900 }], 1, 'SVA: 50.0 px');
        const [reg] = registerMeasurements([sva, PSO]).filter((x) => x.toolKey === 'sva');
        expect(reg.points[0]).not.toEqual(sva.points[0]);    // C7 (upper piece) moved
        expect(reg.points[1]).toEqual(sva.points[1]);        // S1 (lower piece) stayed
        expect(reg.result).not.toBe(sva.result);             // SVA re-measured
    });

    it('never moves plan measurements and is a no-op without osteotomies', () => {
        const ms = [m('cobb', [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }])];
        expect(registerMeasurements(ms)).toBe(ms);
        expect(registerMeasurements([PSO])[0]).toBe(PSO);
        expect(isPlanMeasurement(PSO)).toBe(true);
    });

    it('builds preop vs plan rows per result line, px → mm with calibration', () => {
        expect(parseResultLine('SVA: 50.0 px', 0.5)).toEqual({ key: 'SVA', value: 25, unit: 'mm' });
        const pre = [m('pelvis', [], 1, 'PI: 50.0°\nPT: 20.0°\nSS: 30.0°')];
        const plan = [{ ...pre[0], result: 'PI: 50.0°\nPT: 15.0°\nSS: 35.0°' }];
        const rows = preopVsPlanRows(pre, plan, { pelvis: 'Pelvis' }, null);
        expect(rows.map((r) => r.diff)).toEqual(['0.0°', '-5.0°', '+5.0°']);
        expect(rows[1].changed).toBe(true);
    });

    it('shows each named measurement once, whichever tool measured it, and leaves targets out', () => {
        const pelvis = m('pelvis', [], 1, 'PI: 50.0°\nPT: 20.0°\nSS: 30.0°');
        const pill = m('pi_ll', [], 2, 'PI: 52.0°\nLL: 45.0°\nPI - LL: 7.0°');
        const rows = preopVsPlanRows([pelvis, pill], [pelvis, pill], {}, null, ['ll']);
        const names = rows.map((r) => r.name);
        expect(names.filter((n) => n.startsWith('Pelvic Incidence'))).toHaveLength(1);
        expect(rows.find((r) => r.name.startsWith('Pelvic Incidence'))!.preop).toBe('52.0°'); // latest tool wins
        expect(names.some((n) => n.startsWith('Lumbar Lordosis'))).toBe(false);            // target
        expect(names).toContain('PI-LL Mismatch');
    });
});
