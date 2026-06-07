/**
 * Core Logic Flow (Mental Model) - Layer 1 & 2
 * Parametric Surgical Model & Analytic Geometry
 * Everything is in Patient Space (mm, LPS)
 */

export type Vec3 = [number, number, number];

export interface PedicleScrewParams {
    id: string;
    entry: Vec3;          // Entry point in world coordinates (mm)
    axis: Vec3;           // Normalized direction vector
    length: number;       // total length in mm
    coreDiameter: number; // core shaft diameter in mm
    headDiameter: number; // tulip head diameter in mm
    color: string;
}

// --- Layer 1: Parametric Math Helpers ---

export function mag(v: Vec3): number {
    return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
}

export function normalize(v: Vec3): Vec3 {
    const m = mag(v);
    if (m === 0) return [0, 0, 0];
    return [v[0] / m, v[1] / m, v[2] / m];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a: Vec3, b: Vec3): Vec3 {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(v: Vec3, s: number): Vec3 {
    return [v[0] * s, v[1] * s, v[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Calculates the distance from a point to a plane.
 */
export function distToPlane(point: Vec3, planePoint: Vec3, planeNormal: Vec3): number {
    return Math.abs(dot(sub(point, planePoint), planeNormal));
}

/**
 * Projects a point onto a plane along the plane normal.
 */
export function projectPointToPlane(point: Vec3, planePoint: Vec3, planeNormal: Vec3): Vec3 {
    const d = dot(sub(point, planePoint), planeNormal);
    return sub(point, scale(planeNormal, d));
}

// --- Layer 2: Analytic Geometry ---

/**
 * Calculates the 3D position of the screw tip.
 */
export function getScrewTip(p: PedicleScrewParams): Vec3 {
    return add(p.entry, scale(p.axis, p.length));
}

/**
 * PART D — Analytical intersection of a cylinder with a plane.
 * This function implements the logic for "realism" by treating the screw 
 * as a finite right circular cylinder.
 */
export function intersectCylinderWithPlane(
    p: PedicleScrewParams,
    planePoint: Vec3,
    planeNormal: Vec3
): {
    center: Vec3;
    rMinor: number;
    rMajor: number;
    axisDirInPlane: Vec3;
    cosTheta: number;
} | null {
    const A = p.entry;
    const D = p.axis;
    const radius = p.coreDiameter / 2;
    const P0 = planePoint;
    const N = planeNormal;

    // Step 1 — Math Setup (User Spec)
    const d0 = dot(sub(A, P0), N);
    const cosTheta = dot(D, N);
    const absCosTheta = Math.abs(cosTheta);
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));

    // Step 2 — Decide if the screw appears in this slice (User Spec)
    if (sinTheta > 1e-6) {
        if (Math.abs(d0) > radius / sinTheta) {
            return null; // slice misses the cylinder entirely
        }
    } else {
        // Parallel case: sinTheta is 0. Check distance to axis.
        if (Math.abs(d0) > radius) return null;
    }

    // Step 3 — Compute Finite Intersection (Segment Check)
    const denom = cosTheta;
    if (Math.abs(denom) < 1e-6) {
        // Parallel case handled above. 
        // For a "realistic" view, if it's parallel and within radius, 
        // we could return the axis projection, but user said "ellipse or circle".
        return null;
    }

    const t = -d0 / denom; // distance along axis to intersection

    // Finite length check (Shaft + Head)
    if (t < - (p.headDiameter * 0.4) || t > p.length) {
        return null;
    }

    // Step 4 — Compute ellipse parameters (Part C Step 3)
    const center = add(A, scale(D, t));
    const rMinor = radius;
    const rMajor = radius / Math.max(absCosTheta, 1e-3);

    // Orientation: Projection of axis onto plane
    let axisDirInPlane = sub(D, scale(N, cosTheta));
    if (mag(axisDirInPlane) < 1e-6) {
        axisDirInPlane = [1, 0, 0]; // Default for perpendicular
    } else {
        axisDirInPlane = normalize(axisDirInPlane);
    }

    return { center, rMinor, rMajor, axisDirInPlane, cosTheta };
}

/**
 * Converts pitch and yaw angles (degrees) to a normalized 3D direction vector.
 */
export function vectorFromAngles(pitchDeg: number, yawDeg: number): Vec3 {
    const p = (pitchDeg * Math.PI) / 180;
    const y = (yawDeg * Math.PI) / 180;
    return normalize([
        Math.sin(y) * Math.cos(p),
        Math.sin(p),
        Math.cos(y) * Math.cos(p),
    ]);
}

/**
 * Converts a normalized direction vector to pitch and yaw angles (degrees).
 */
export function anglesFromVector(v: Vec3): { pitch: number; yaw: number } {
    const [x, y, z] = normalize(v);
    const pitch = Math.asin(Math.max(-1, Math.min(1, y))) * (180 / Math.PI);
    const yaw = Math.atan2(x, z) * (180 / Math.PI);
    return { pitch, yaw };
}

/**
 * Calculates the final entry and tip positions after applying rotations and depth.
 * Matches the logic used in CornerstoneViewer.tsx for 3D actors (Tip-Anchored).
 */
export function getTransformedScrewTrajectory(
    position: Vec3, // This is the Landmark / Anchor point
    direction: Vec3, // Initial direction (default [0,-1,0] Anterior)
    properties: { length: number; caudalAngle?: number; medialAngle?: number; depth?: number }
): { entry: Vec3; tip: Vec3 } {
    const { length, caudalAngle = 0, medialAngle = 0, depth = 0 } = properties;

    // 1. Baseline: Start with normalized direction (Head to Tip)
    // Initial: direction is [0, -1, 0] (Anterior - into the bone)
    let forward = normalize(direction);

    // 2. Apply Rotations (Pivoting around the Anchor Point)
    // Clinical: X-Rotation (Caudal/Cranial), Z-Rotation (Medial/Lateral)
    const rx = (caudalAngle * Math.PI) / 180;
    const rz = (medialAngle * Math.PI) / 180;

    // Apply rotation transformations
    if (rx !== 0) {
        const y = forward[1] * Math.cos(rx) - forward[2] * Math.sin(rx);
        const z = forward[1] * Math.sin(rx) + forward[2] * Math.cos(rx);
        forward = [forward[0], y, z];
    }
    if (rz !== 0) {
        const x = forward[0] * Math.cos(rz) - forward[1] * Math.sin(rz);
        const y = forward[0] * Math.sin(rz) + forward[1] * Math.cos(rz);
        forward = [x, y, forward[2]];
    }

    forward = normalize(forward);

    // 3. Calculate Tip and Entry
    // depth > 0 pushes the screw deeper along its oriented axis.
    // The landmark 'position' is the start point of rotation/pivot.
    const finalTip = [
        position[0] + forward[0] * depth,
        position[1] + forward[1] * depth,
        position[2] + forward[2] * depth
    ] as Vec3;

    // Entry (Head) is exactly 'length' behind the Tip.
    const finalEntry = [
        finalTip[0] - forward[0] * length,
        finalTip[1] - forward[1] * length,
        finalTip[2] - forward[2] * length
    ] as Vec3;

    return { entry: finalEntry, tip: finalTip };
}
