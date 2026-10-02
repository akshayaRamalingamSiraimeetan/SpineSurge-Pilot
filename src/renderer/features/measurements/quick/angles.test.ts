import { describe, it, expect } from 'vitest';
import { endplateAngleDeg } from '@/lib/canvas/GeometryUtils';
import { calculateCobbAngle } from './CobbAngle';
import { calculatePelvicParameters } from './PelvicParams';

const line = (deg: number, cx = 0, cy = 0, len = 100) => {
    const r = (deg * Math.PI) / 180;
    return [
        { x: cx - (Math.cos(r) * len) / 2, y: cy - (Math.sin(r) * len) / 2 },
        { x: cx + (Math.cos(r) * len) / 2, y: cy + (Math.sin(r) * len) / 2 },
    ];
};

describe('endplateAngleDeg', () => {
    it('is independent of click direction (BUGS CV-01)', () => {
        const [a1, a2] = line(10);
        const [b1, b2] = line(-10, 0, 300);
        expect(endplateAngleDeg(a1, a2, b1, b2)).toBeCloseTo(20, 5);
        expect(endplateAngleDeg(a2, a1, b1, b2)).toBeCloseTo(20, 5);
        expect(endplateAngleDeg(a2, a1, b2, b1)).toBeCloseTo(20, 5);
    });

    it('reports curves above 90° (BUGS CV-17)', () => {
        const [a1, a2] = line(55);
        const [b1, b2] = line(-55, 0, 300);
        expect(endplateAngleDeg(a1, a2, b1, b2)).toBeCloseTo(110, 5);
    });

    it('Cobb uses it', () => {
        const [a1, a2] = line(170 - 180); // heading 170° clicked right→left
        const [b1, b2] = line(-170 + 180, 0, 300);
        expect(calculateCobbAngle([a2, a1, b1, b2]).angle).toBeCloseTo(20, 5);
    });
});

describe('pelvic incidence (BUGS CV-02)', () => {
    // Build a pelvis with SS=40°, PT=15° → PI = 55°, facing left or right.
    const build = (facing: 1 | -1) => {
        const hip = { x: 0, y: 0 };
        const ptRad = (15 * Math.PI) / 180;
        const dist = 100;
        // S1 midpoint is posterior-superior of the hip axis.
        const s1 = { x: -facing * Math.sin(ptRad) * dist, y: -Math.cos(ptRad) * dist };
        const ssRad = (40 * Math.PI) / 180;
        const half = 20;
        // Endplate slopes down toward anterior.
        const ant = { x: s1.x + facing * Math.cos(ssRad) * half, y: s1.y + Math.sin(ssRad) * half };
        const post = { x: s1.x - facing * Math.cos(ssRad) * half, y: s1.y - Math.sin(ssRad) * half };
        return [
            { x: -5, y: 0 }, { x: 5, y: 0 },     // femoral head 1 (diameter)
            { x: -5, y: 0.0001 }, { x: 5, y: 0.0001 },
            post, ant,
        ].map((p, i) => (i < 4 ? { x: p.x + hip.x, y: p.y + hip.y } : p));
    };

    it('right-facing', () => {
        const r = calculatePelvicParameters(build(1))!;
        expect(r.ss).toBeCloseTo(40, 3);
        expect(r.pt).toBeCloseTo(15, 3);
        expect(r.pi).toBeCloseTo(55, 3);
    });

    it('left-facing', () => {
        const r = calculatePelvicParameters(build(-1))!;
        expect(r.ss).toBeCloseTo(40, 3);
        expect(r.pt).toBeCloseTo(15, 3);
        expect(r.pi).toBeCloseTo(55, 3);
    });
});
