import { describe, it, expect } from 'vitest';
import { clipSegmentToSlab, raySegmentDistance, rayPlane, type Vec3 } from './vec3';
import { makeScrew, migrateImplant, screwLength, trajectoryAngles, translateImplant, withScrewLength, PA_DIRECTION } from './implantModel';

const close = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe('implant model', () => {
    it('screw spans exactly entry→tip with the requested length', () => {
        const s = makeScrew([0, 50, 0], PA_DIRECTION, { length: 45, diameter: 6.5 });
        expect(screwLength(s)).toBeCloseTo(45);
        close(s.tip, [0, 5, 0]);
        expect(trajectoryAngles(s).transverse).toBeCloseTo(0);
        expect(trajectoryAngles(s).sagittal).toBeCloseTo(0);
    });

    it('length edit keeps the entry point', () => {
        const s = withScrewLength(makeScrew([1, 2, 3], [0.6, -0.8, 0], { length: 40, diameter: 6 }), 50);
        close(s.entry, [1, 2, 3]);
        expect(screwLength(s)).toBeCloseTo(50);
    });

    it('translate moves both ends', () => {
        const s = translateImplant(makeScrew([0, 0, 0], PA_DIRECTION, { length: 10, diameter: 5 }), [1, 1, 1]);
        close(s.entry, [1, 1, 1]);
        close(s.tip, [1, -9, 1]);
    });

    it('migrates legacy tip-anchored screws (default PA direction)', () => {
        const m = migrateImplant({ id: 'x', type: 'screw', position: [0, 0, 0], direction: [0, -1, 0], properties: { length: 40, diameter: 6 } });
        expect(m?.type).toBe('screw');
        if (m?.type !== 'screw') return;
        close(m.tip, [0, 0, 0]);
        close(m.entry, [0, 40, 0]);
    });
});

describe('vec3 helpers', () => {
    it('ray/plane and ray/segment', () => {
        close(rayPlane([0, 0, 10], [0, 0, -1], [0, 0, 0], [0, 0, 1])!, [0, 0, 0]);
        const h = raySegmentDistance([0, 0, 10], [0, 0, -1], [-5, 2, 0], [5, 2, 0]);
        expect(h.distance).toBeCloseTo(2);
    });

    it('slab clipping', () => {
        expect(clipSegmentToSlab([0, 0, -10], [0, 0, 10], [0, 0, 0], [0, 0, 1], 1)).toEqual([0.45, 0.55]);
        expect(clipSegmentToSlab([0, 0, 5], [0, 0, 10], [0, 0, 0], [0, 0, 1], 1)).toBeNull();
        expect(clipSegmentToSlab([-3, 0, 0], [3, 0, 0], [0, 0, 0], [0, 0, 1], 1)).toEqual([0, 1]);
    });
});
