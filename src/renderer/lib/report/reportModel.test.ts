import { describe, it, expect } from 'vitest';
import { buildComparisonRows } from './reportModel';

const m = (id: string, toolKey: string, result: string, extra: any = {}) =>
    ({ id, toolKey, result, points: [], fragmentId: null, timestamp: 0, ...extra });

describe('buildComparisonRows (RPT-07)', () => {
    it('pairs by tool + occurrence, keeps one-sided rows, uses measured unit', () => {
        const rows = buildComparisonRows(
            [m('a1', 'cobb', 'COBB: 40.0°'), m('a2', 'cobb', 'COBB: 22.0°'), m('a3', 'sva', 'SVA: 50.0 mm')],
            [m('b1', 'cobb', 'COBB: 15.0°'), m('b2', 'cobb', 'COBB: 10.0°'), m('b3', 'll', 'LL: 45.0°')],
        );
        expect(rows).toEqual([
            { parameter: 'COBB 1', a: 'COBB: 40.0°', b: 'COBB: 15.0°', diff: '-25.0°' },
            { parameter: 'COBB 2', a: 'COBB: 22.0°', b: 'COBB: 10.0°', diff: '-12.0°' },
            { parameter: 'SVA', a: 'SVA: 50.0 mm', b: '—', diff: '—' },
            { parameter: 'LL', a: '—', b: 'LL: 45.0°', diff: '—' },
        ]);
    });

    it('excludes unselected and calibration measurements', () => {
        const rows = buildComparisonRows(
            [m('a1', 'cobb', 'COBB: 40.0°', { selected: false }), m('a2', 'calibration', '10 mm', { measurement: { isCalibration: true } })],
            [],
        );
        expect(rows).toEqual([]);
    });
});
