import { describe, expect, it } from 'vitest';
import { calibrationFor } from './caseState';
import type { ContextState } from './types';

const cal = { pixelToMm: 0.2, calibrationApplied: true, calibrationEnabledAt: 1 };
const ctx = (id: string, image: string | undefined, toolState: Record<string, unknown> = {}): ContextState =>
    ({ contextId: id, measurements: [], implants: [], annotations: [], toolState, currentImage: image });

describe('calibrationFor (CAL-01)', () => {
    it("uses the session's own calibration", () => {
        const own = { ...cal, pixelToMm: 0.5 };
        const a = ctx('a', 'http://h/uploads/x.png', { calibration: own });
        expect(calibrationFor({ contextStates: [a, ctx('b', '/uploads/x.png', { calibration: cal })] }, a)).toBe(own);
    });

    it('reuses the calibration of the same image from another session (host-independent)', () => {
        const a = ctx('a', 'https://demo/uploads/x.png');
        const b = ctx('b', '/uploads/x.png', { calibration: cal });
        expect(calibrationFor({ contextStates: [a, b] }, a)).toEqual(cal);
    });

    it('reuses a calibration made when the image was Compare Image B', () => {
        const a = ctx('a', '/uploads/x.png');
        const b = ctx('b', '/uploads/y.png', { comparisonB: { image: 'http://h/uploads/x.png', calibration: cal } });
        expect(calibrationFor({ contextStates: [a, b] }, a)).toEqual(cal);
    });

    it('never borrows from a different image', () => {
        const a = ctx('a', '/uploads/x.png');
        const b = ctx('b', '/uploads/y.png', { calibration: cal });
        expect(calibrationFor({ contextStates: [a, b] }, a)).toBeUndefined();
    });
});
