import { describe, expect, it } from 'vitest';
import {
    measurementsDiffer,
    resolveActiveMeasurements,
    syncManagerMeasurements,
} from './measurementSync';
import type { Measurement } from './CanvasManager';

const sample = (id: string): Measurement => ({
    id,
    toolKey: 'cobb',
    fragmentId: null,
    points: [{ x: 1, y: 2 }],
    result: '10°',
    timestamp: 1,
});

describe('measurementSync', () => {
    it('detects measurement id differences', () => {
        expect(measurementsDiffer([sample('a')], [sample('b')])).toBe(true);
        expect(measurementsDiffer([sample('a')], [sample('a')])).toBe(false);
    });

    it('prefers active context measurements over store fallback', () => {
        const resolved = resolveActiveMeasurements({
            activeContextId: 'ctx-1',
            contextStates: [{ contextId: 'ctx-1', measurements: [sample('ctx')] }],
            measurements: [sample('store')],
        });
        expect(resolved[0].id).toBe('ctx');
    });

    it('syncs manager measurements without mutating source arrays', () => {
        const source = [sample('m1')];
        const manager = {
            current: {
                data: {
                    measurements: [],
                },
            },
        };

        syncManagerMeasurements(manager, source);
        expect(manager.current.data.measurements).toHaveLength(1);
        expect(manager.current.data.measurements[0].id).toBe('m1');
        expect(source[0].points).not.toBe(manager.current.data.measurements[0].points);
    });
});
