import type { Measurement, Point } from './CanvasManager';
import { calculateResectionPrimitives } from '@/features/measurements/planning/PlanningTools';
import { splitPolygonByLine, isPointInPolygon } from './GeometryUtils';
import { GeometryEngine } from './GeometryEngine';
import { TransformationCalculator } from './TransformationCalculator';
import type { Fragment as SplitterFragment } from './FragmentSplitter';

/**
 * Osteotomies as a pure function of their measurements (BUGS UI6-01 / UI6-04).
 *
 * The X-ray is split into pieces by each osteotomy, in the order they were
 * planned: the fixed piece stays, the mobile piece gets a rigid transform, and
 * a resected wedge/slab is dropped. Nothing is cut destructively, so undo,
 * redo, reload and the report all show exactly the planned state.
 *
 *   PSO / SPO  (A, hinge B, C): wedge between rays BA and BC is removed; the
 *              piece beyond BA rotates about B until BA lies on BC. The piece
 *              beyond BC (the lower cut) stays where it is.
 *   Resection  (two lines): slab between the lines is removed; the upper piece
 *              is rotated + translated so its line lies on the lower line.
 *   Opening    (A–F): the original opening-wedge model (OpenOsteotomyOperation):
 *              CD is extended to the image edges and the image split in two;
 *              the upper half is aligned to AB and the lower half to EF
 *              (TransformationCalculator), opening a gap along the cut.
 */
export interface RigidTransform { center: Point; angle: number; translate: Point }
export interface PieceOp { clip: Point[]; transform?: RigidTransform }
export interface Piece { ops: PieceOp[] }
export interface ImageBox { minX: number; minY: number; maxX: number; maxY: number }
/** Regions an osteotomy splits the plane into; parts without a transform stay put. */
type Partition = PieceOp[];

const OSTEOTOMY_KEYS = new Set(['ost-pso', 'ost-spo', 'ost-resect', 'ost-open']);
export const isOsteotomy = (m: Measurement) => OSTEOTOMY_KEYS.has(m.toolKey);

const wrap = (a: number) => {
    while (a <= -Math.PI) a += 2 * Math.PI;
    while (a > Math.PI) a -= 2 * Math.PI;
    return a;
};

/** Polygon: centre + arc from angle a0 sweeping by `sweep` (signed) at radius R. */
function fan(c: Point, a0: number, sweep: number, R: number): Point[] {
    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
    const pts: Point[] = [{ ...c }];
    for (let i = 0; i <= steps; i++) {
        const a = a0 + (sweep * i) / steps;
        pts.push({ x: c.x + Math.cos(a) * R, y: c.y + Math.sin(a) * R });
    }
    return pts;
}

/** Half-plane (as a big polygon) on the side of line (p, dir) that `toward` lies on. */
function halfPlane(p: Point, dir: Point, toward: Point, R: number): Point[] {
    const len = Math.hypot(dir.x, dir.y) || 1;
    const d = { x: dir.x / len, y: dir.y / len };
    let n = { x: -d.y, y: d.x };
    if ((toward.x - p.x) * n.x + (toward.y - p.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    const a = { x: p.x - d.x * R, y: p.y - d.y * R };
    const b = { x: p.x + d.x * R, y: p.y + d.y * R };
    return [a, b, { x: b.x + n.x * R, y: b.y + n.y * R }, { x: a.x + n.x * R, y: a.y + n.y * R }];
}

/** Regions (with their transforms) one osteotomy splits the image into. */
export function osteotomyPartition(m: Measurement, R: number, image?: ImageBox): Partition | null {
    const p = m.points;
    if (m.toolKey === 'ost-pso' || m.toolKey === 'ost-spo') {
        if (p.length < 3) return null;
        const [A, B, C] = p;
        const aA = Math.atan2(A.y - B.y, A.x - B.x);
        const aC = Math.atan2(C.y - B.y, C.x - B.x);
        const diff = wrap(aC - aA);                 // wedge, from BA to BC
        if (Math.abs(diff) < 1e-4) return null;
        const side = Math.PI - Math.abs(diff) / 2;  // each piece's angular span
        const s = Math.sign(diff);
        return [
            { clip: fan(B, aC, s * side, R) },                                                   // beyond BC: stays
            { clip: fan(B, aA, -s * side, R), transform: { center: B, angle: diff, translate: { x: 0, y: 0 } } }, // beyond BA
        ];
    }
    if (m.toolKey === 'ost-resect') {
        const prim = p.length >= 4 ? calculateResectionPrimitives(p) : null;
        if (!prim) return null;
        const { targetRay: t, movingRay: mv } = prim;
        const dir = (a: number) => ({ x: Math.cos(a), y: Math.sin(a) });
        return [
            { clip: halfPlane(t.origin, dir(t.angle), { x: 2 * t.origin.x - mv.origin.x, y: 2 * t.origin.y - mv.origin.y }, R) },
            {
                clip: halfPlane(mv.origin, dir(mv.angle), { x: 2 * mv.origin.x - t.origin.x, y: 2 * mv.origin.y - t.origin.y }, R),
                transform: { center: mv.origin, angle: prim.rotationAngleRad, translate: prim.translation },
            },
        ];
    }
    if (m.toolKey === 'ost-open') {
        if (p.length < 6 || !image) return null;
        return openOsteotomyPartition(p, image);
    }
    return null;
}

/**
 * Opening wedge exactly as OpenOsteotomyOperation computed it: split the image
 * rectangle along the extended cut line, then align each half with its
 * reference line using TransformationCalculator.
 */
function openOsteotomyPartition(p: Point[], image: ImageBox): Partition | null {
    const [A, B, C, D, E, F] = p;
    const rectBounds = { x: image.minX, y: image.minY, width: image.maxX - image.minX, height: image.maxY - image.minY };
    const cut = GeometryEngine.extrapolateToImageBounds(C, D, rectBounds);
    if (!cut) return null;
    const rect: Point[] = [
        { x: image.minX, y: image.minY }, { x: image.maxX, y: image.minY },
        { x: image.maxX, y: image.maxY }, { x: image.minX, y: image.maxY },
    ];
    const halves = splitPolygonByLine(rect, cut.start, cut.end);
    if (halves.length !== 2) return null;
    const avgY = (poly: Point[]) => poly.reduce((a, q) => a + q.y, 0) / poly.length;
    const [upper, lower] = avgY(halves[0]) < avgY(halves[1]) ? halves : [halves[1], halves[0]];
    const asFragment = (poly: Point[], id: string): SplitterFragment => {
        const xs = poly.map((q) => q.x), ys = poly.map((q) => q.y);
        const minX = Math.min(...xs), minY = Math.min(...ys);
        return {
            id, polygon: poly, pixels: undefined as unknown as ImageData, // pixels are not used for transforms
            bounds: { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY },
        };
    };
    const lineCD = GeometryEngine.createLine(cut.start, cut.end);
    const up = TransformationCalculator.calculateUpperTransform(asFragment(upper, 'upper'), GeometryEngine.createLine(A, B), lineCD);
    const lo = TransformationCalculator.calculateLowerTransform(asFragment(lower, 'lower'), GeometryEngine.createLine(E, F), lineCD);
    // Lines have no direction: the extended cut's direction comes from where it
    // meets the image edges, not from C→D. Without wrapping, a reference line
    // drawn the "other way" gives ~180° and the half flips upside down (UI8-04).
    const undirected = (a: number) => {
        let r = wrap(a);
        if (r > Math.PI / 2) r -= Math.PI;
        else if (r <= -Math.PI / 2) r += Math.PI;
        return r;
    };
    const toRigid = (t: { rotation: number; translation: Point; center: Point }): RigidTransform =>
        ({ center: t.center, angle: undirected(t.rotation), translate: t.translation });
    return [
        { clip: upper, transform: toRigid(up) },
        { clip: lower, transform: toRigid(lo) },
    ];
}

/** Pieces after applying every osteotomy in planning order (oldest first). */
export function buildPieces(measurements: Measurement[], R: number, image?: ImageBox): Piece[] {
    let pieces: Piece[] = [{ ops: [] }];
    [...measurements]
        .filter(isOsteotomy)
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
        .forEach((m) => {
            const parts = osteotomyPartition(m, R, image);
            if (!parts) return;
            pieces = pieces.flatMap((pc) => parts.map((part) => ({ ops: [...pc.ops, part] })));
        });
    return pieces;
}

/**
 * Set up `ctx` for one piece: newest operation outermost — its transform, then
 * its clip (expressed in the coordinates before that transform), and so on.
 * Draw the image afterwards, inside ctx.save()/restore().
 */
export function applyPiece(ctx: CanvasRenderingContext2D, piece: Piece) {
    for (let i = piece.ops.length - 1; i >= 0; i--) {
        const { clip, transform: t } = piece.ops[i];
        if (t) {
            ctx.translate(t.translate.x, t.translate.y);
            ctx.translate(t.center.x, t.center.y);
            ctx.rotate(t.angle);
            ctx.translate(-t.center.x, -t.center.y);
        }
        ctx.beginPath();
        clip.forEach((q, j) => (j === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
        ctx.closePath();
        ctx.clip();
    }
}

/** Apply one rigid transform (rotate about centre, then translate) to a point. */
export function applyRigid(p: Point, t: RigidTransform): Point {
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
    const dx = p.x - t.center.x, dy = p.y - t.center.y;
    return { x: t.center.x + dx * c - dy * s + t.translate.x, y: t.center.y + dx * s + dy * c + t.translate.y };
}

/**
 * Where an image point ends up after the planned osteotomies: it moves with
 * the bone piece it lies on (UI9-05 — landmarks stay registered to the image).
 * Points in a resected wedge/slab stay where they are.
 */
export function mapPointThroughOsteotomies(p: Point, osteotomies: Measurement[], R: number, image?: ImageBox): Point {
    let q = { ...p };
    [...osteotomies]
        .filter(isOsteotomy)
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
        .forEach((m) => {
            const parts = osteotomyPartition(m, R, image);
            const part = parts?.find((pt) => isPointInPolygon(q, pt.clip));
            if (part?.transform) q = applyRigid(q, part.transform);
        });
    return q;
}
