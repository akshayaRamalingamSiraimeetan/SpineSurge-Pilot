import type { PlanCage, PlanImplant, PlanRod, PlanScrew } from '@/lib/store/types';
import { add, cross, dist, norm, scale, sub, type Vec3 } from './vec3';

/**
 * 3D implant model — everything in LPS world millimetres, so all four views
 * (axial / sagittal / coronal / 3D) read the same numbers.
 *
 * screw: entry (head) → tip; length = |tip − entry|
 * rod:   polyline through control points
 * cage:  centre + orthonormal axes (X = width, Y = height), size [w, d, h]
 */

/** Posterior → anterior in LPS (+Y is posterior). Default screw trajectory. */
export const PA_DIRECTION: Vec3 = [0, -1, 0];

export const screwLength = (s: PlanScrew) => dist(s.entry, s.tip);
export const screwDir = (s: PlanScrew) => norm(sub(s.tip, s.entry));

export function makeScrew(entry: Vec3, dir: Vec3, opts: { length: number; diameter: number; level?: string; side?: 'L' | 'R' }): PlanScrew {
    return {
        id: crypto.randomUUID(),
        type: 'screw',
        entry,
        tip: add(entry, scale(norm(dir), opts.length)),
        diameter: opts.diameter,
        level: opts.level,
        side: opts.side,
    };
}

/** Rod through the given points (needs ≥ 2). */
export function makeRod(points: Vec3[], diameter = 5.5): PlanRod {
    return { id: crypto.randomUUID(), type: 'rod', points, diameter };
}

/**
 * Cage centred at `center`, lying in the plane whose normal is `viewNormal`
 * (so it appears face-on in the view it was placed in).
 */
export function makeCage(center: Vec3, viewNormal: Vec3, viewUp: Vec3, size: [number, number, number] = [26, 10, 12]): PlanCage {
    const axisY = norm(viewUp);
    const axisX = norm(cross(axisY, viewNormal));
    return { id: crypto.randomUUID(), type: 'cage', center, axisX, axisY, size };
}

export const cageAxisZ = (c: PlanCage) => norm(cross(c.axisX, c.axisY));

/** The 8 corners of the cage box (for outlines / hit testing). */
export function cageCorners(c: PlanCage): Vec3[] {
    const [w, d, h] = c.size;
    const z = cageAxisZ(c);
    const out: Vec3[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        out.push(add(c.center, add(scale(c.axisX, (sx * w) / 2), add(scale(c.axisY, (sy * h) / 2), scale(z, (sz * d) / 2)))));
    }
    return out;
}

/** Move every point of an implant by `delta`. */
export function translateImplant<T extends PlanImplant>(imp: T, delta: Vec3): T {
    switch (imp.type) {
        case 'screw': return { ...imp, entry: add(imp.entry, delta), tip: add(imp.tip, delta) };
        case 'rod': return { ...imp, points: imp.points.map((p) => add(p, delta)) };
        case 'cage': return { ...imp, center: add(imp.center, delta) };
    }
    return imp;
}

/** Clinical trajectory angles from the LPS direction (posterior→anterior = 0°). */
export function trajectoryAngles(s: PlanScrew) {
    const [x, y, z] = screwDir(s);
    return {
        /** axial plane: medial/lateral convergence */
        transverse: (Math.atan2(x, -y) * 180) / Math.PI,
        /** sagittal plane: cranial(+)/caudal(−) tilt */
        sagittal: (Math.atan2(z, -y) * 180) / Math.PI,
    };
}

/** Set screw length keeping the entry point fixed. */
export function withScrewLength(s: PlanScrew, length: number): PlanScrew {
    return { ...s, tip: add(s.entry, scale(screwDir(s), length)) };
}

// ── Legacy migration ────────────────────────────────────────────────────────
// Old screws: { position (tip/pivot), direction, properties{length, diameter,
// medialAngle, caudalAngle, depth} } with angles about world axes.
const rotX = (v: Vec3, deg: number): Vec3 => {
    const r = (deg * Math.PI) / 180;
    return [v[0], v[1] * Math.cos(r) - v[2] * Math.sin(r), v[1] * Math.sin(r) + v[2] * Math.cos(r)];
};
const rotZ = (v: Vec3, deg: number): Vec3 => {
    const r = (deg * Math.PI) / 180;
    return [v[0] * Math.cos(r) - v[1] * Math.sin(r), v[0] * Math.sin(r) + v[1] * Math.cos(r), v[2]];
};

/** Convert any stored 3D implant (legacy or current) to the current model. */
export function migrateImplant(raw: any): PlanImplant | null {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.type === 'screw' && Array.isArray(raw.entry) && Array.isArray(raw.tip)) return raw as PlanScrew;
    if (raw.type === 'rod' && Array.isArray(raw.points) && Array.isArray(raw.points[0])) return raw as PlanRod;
    if (raw.type === 'cage' && Array.isArray(raw.center)) return raw as PlanCage;

    if (raw.type === 'screw' && Array.isArray(raw.position)) {
        const p = raw.properties ?? {};
        let dir = norm((raw.direction ?? PA_DIRECTION) as Vec3);
        if (p.caudalAngle) dir = rotX(dir, p.caudalAngle);
        if (p.medialAngle) dir = rotZ(dir, p.medialAngle);
        dir = norm(dir);
        const tip = add(raw.position as Vec3, scale(dir, p.depth ?? 0));
        const length = p.length ?? 40;
        return {
            id: raw.id ?? crypto.randomUUID(),
            type: 'screw',
            entry: sub(tip, scale(dir, length)),
            tip,
            diameter: p.diameter ?? 6.5,
            level: raw.level,
            side: raw.side,
            color: p.color,
        };
    }
    return null;
}

export const migrateImplants = (list: unknown): PlanImplant[] =>
    Array.isArray(list) ? list.map(migrateImplant).filter((x): x is PlanImplant => !!x) : [];
