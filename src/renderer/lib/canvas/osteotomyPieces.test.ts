import { describe, expect, it } from 'vitest';
import type { Measurement, Point } from './CanvasManager';
import { buildPieces, osteotomyPartition } from './osteotomyPieces';
import { isPointInPolygon } from './GeometryUtils';

const m = (toolKey: string, points: Point[], timestamp = 1): Measurement =>
    ({ id: toolKey + timestamp, toolKey, points, fragmentId: null, timestamp });

const rotate = (p: Point, c: Point, a: number): Point => ({
    x: c.x + (p.x - c.x) * Math.cos(a) - (p.y - c.y) * Math.sin(a),
    y: c.y + (p.x - c.x) * Math.sin(a) + (p.y - c.y) * Math.cos(a),
});

// Hinge anterior (right), posterior points on the left: upper cut BA, lower cut BC.
const B = { x: 400, y: 500 };
const A = { x: 200, y: 460 };
const C = { x: 200, y: 540 };

describe('PSO / SPO partition', () => {
    const [keepPart, movePart] = osteotomyPartition(m('ost-pso', [A, B, C]), 5000)!;
    const part = { keep: keepPart.clip, move: movePart.clip, transform: movePart.transform! };

    it('keeps the lower piece (beyond BC) and moves the upper piece (beyond BA)', () => {
        expect(isPointInPolygon({ x: 300, y: 700 }, part.keep)).toBe(true);
        expect(isPointInPolygon({ x: 300, y: 300 }, part.move)).toBe(true);
        expect(isPointInPolygon({ x: 300, y: 700 }, part.move)).toBe(false);
    });

    it('drops the wedge between the two cuts', () => {
        const inWedge = { x: 250, y: 500 };
        expect(isPointInPolygon(inWedge, part.keep)).toBe(false);
        expect(isPointInPolygon(inWedge, part.move)).toBe(false);
    });

    it('rotates the upper cut line onto the lower cut line about the hinge', () => {
        const t = part.transform;
        const moved = rotate(A, t.center, t.angle);
        const cross = (moved.x - B.x) * (C.y - B.y) - (moved.y - B.y) * (C.x - B.x);
        expect(Math.abs(cross)).toBeLessThan(1e-6);
    });
});

describe('opening wedge (original model)', () => {
    const IMG = { minX: 0, minY: 0, maxX: 800, maxY: 1000 };
    // A–B upper reference, C–D cut, E–F lower reference
    const pts = [{ x: 200, y: 300 }, { x: 600, y: 280 }, { x: 150, y: 500 }, { x: 650, y: 500 }, { x: 200, y: 700 }, { x: 600, y: 720 }];
    const parts = osteotomyPartition(m('ost-open', pts), 5000, IMG)!;

    it('splits the image along the extended cut and moves both halves', () => {
        expect(parts).toHaveLength(2);
        expect(parts.every((p) => !!p.transform)).toBe(true);
        expect(isPointInPolygon({ x: 400, y: 200 }, parts[0].clip)).toBe(true);  // upper half first
        expect(isPointInPolygon({ x: 400, y: 800 }, parts[1].clip)).toBe(true);
    });

    it('rotates each half by the angle between the cut and its reference line', () => {
        const ang = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.atan2(b.y - a.y, b.x - a.x);
        expect(Math.abs(parts[0].transform!.angle - (ang(pts[0], pts[1]) - ang(pts[2], pts[3])))).toBeLessThan(1e-6);
        expect(Math.abs(parts[1].transform!.angle - (ang(pts[4], pts[5]) - ang(pts[2], pts[3])))).toBeLessThan(1e-6);
    });

    it('needs the image box', () => {
        expect(osteotomyPartition(m('ost-open', pts), 5000)).toBeNull();
    });
});

describe('buildPieces', () => {
    it('splits once per osteotomy (fixed + mobile piece each time)', () => {
        expect(buildPieces([], 5000)).toHaveLength(1);
        expect(buildPieces([m('ost-pso', [A, B, C]), m('cobb', [A, B, C, A])], 5000)).toHaveLength(2);
        expect(buildPieces([m('ost-pso', [A, B, C], 1), m('ost-spo', [A, B, C], 2)], 5000)).toHaveLength(4);
    });

    it('ignores incomplete osteotomies', () => {
        expect(buildPieces([m('ost-pso', [A, B])], 5000)).toHaveLength(1);
    });
});

describe('opening wedge — reference lines drawn in opposite directions', () => {
    it('never flips a half (rotation stays within ±90°)', () => {
        const IMG = { minX: 0, minY: 0, maxX: 800, maxY: 1000 };
        // AB drawn right→left, CD left→right, EF right→left, lines close together
        const pts = [{ x: 600, y: 480 }, { x: 200, y: 470 }, { x: 150, y: 500 }, { x: 650, y: 500 }, { x: 600, y: 530 }, { x: 200, y: 520 }];
        const parts = osteotomyPartition({ id: 'o', toolKey: 'ost-open', points: pts, fragmentId: null, timestamp: 1 }, 5000, IMG)!;
        parts.forEach((p) => expect(Math.abs(p.transform!.angle)).toBeLessThan(Math.PI / 4));
    });
});
