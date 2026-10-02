/** Minimal 3D vector math (LPS world coordinates, millimetres). */
export type Vec3 = [number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: Vec3, b: Vec3) => len(sub(a, b));
export const norm = (a: Vec3): Vec3 => {
    const l = len(a);
    return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 1];
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));

/** Component of v perpendicular to unit normal n. */
export const projectOnPlane = (v: Vec3, n: Vec3): Vec3 => sub(v, scale(n, dot(v, n)));

/** Signed distance of p from the plane (point o, unit normal n). */
export const planeDistance = (p: Vec3, o: Vec3, n: Vec3) => dot(sub(p, o), n);

/** Intersection of the ray (origin, dir) with a plane; null if parallel. */
export function rayPlane(origin: Vec3, dir: Vec3, planePoint: Vec3, planeNormal: Vec3): Vec3 | null {
    const denom = dot(dir, planeNormal);
    if (Math.abs(denom) < 1e-9) return null;
    const t = dot(sub(planePoint, origin), planeNormal) / denom;
    return add(origin, scale(dir, t));
}

/** Shortest distance between a ray (origin, unit dir) and segment [a, b]. */
export function raySegmentDistance(origin: Vec3, dir: Vec3, a: Vec3, b: Vec3): { distance: number; t: number; s: number } {
    const u = dir;
    const v = sub(b, a);
    const w = sub(origin, a);
    const A = dot(u, u), B = dot(u, v), C = dot(v, v), D = dot(u, w), E = dot(v, w);
    const den = A * C - B * B;
    let s = den > 1e-9 ? (A * E - B * D) / den : 0; // along segment (0..1)
    s = Math.max(0, Math.min(1, s));
    const pSeg = add(a, scale(v, s));
    let t = dot(sub(pSeg, origin), u) / A; // along ray
    t = Math.max(0, t);
    const pRay = add(origin, scale(u, t));
    return { distance: dist(pRay, pSeg), t, s };
}

/**
 * Clip segment [a, b] to the slab |dist(p, plane)| <= half.
 * Returns the parametric range [t0, t1] (0..1) inside the slab, or null.
 */
export function clipSegmentToSlab(a: Vec3, b: Vec3, planePoint: Vec3, n: Vec3, half: number): [number, number] | null {
    const da = planeDistance(a, planePoint, n);
    const db = planeDistance(b, planePoint, n);
    const dd = db - da;
    let t0 = 0, t1 = 1;
    if (Math.abs(dd) < 1e-9) return Math.abs(da) <= half ? [0, 1] : null;
    const ta = (-half - da) / dd;
    const tb = (half - da) / dd;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    return t0 <= t1 ? [t0, t1] : null;
}
