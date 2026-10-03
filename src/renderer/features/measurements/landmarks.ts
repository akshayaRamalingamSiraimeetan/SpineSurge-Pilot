import type { Point } from "@/lib/canvas/GeometryUtils";
import type { Measurement } from "@/lib/canvas/CanvasManager";

/**
 * Anatomical landmark reuse (BUGS UI5-08).
 *
 * Many tools are built from the same landmarks (femoral heads, S1 endplate,
 * C7 centroid, …). Each tool lists which landmark every click represents
 * (null = tool-specific point). When a tool starts, landmarks already placed
 * by earlier measurements are filled in, so the user only clicks the rest.
 * The same table is the basis for the planned skeleton overlay (UI5-09).
 */
export type LandmarkId =
    | 'FH1_A' | 'FH1_B' | 'FH2_A' | 'FH2_B'
    | 'S1_ANT' | 'S1_POST'
    | 'C7_CENTROID' | 'T1_CENTROID' | 'T9_CENTROID' | 'DENS_TIP'
    | 'L1_SUP_ANT' | 'L1_SUP_POST';

const FEMORAL: LandmarkId[] = ['FH1_A', 'FH1_B', 'FH2_A', 'FH2_B'];

export const TOOL_LANDMARKS: Record<string, (LandmarkId | null)[]> = {
    pelvis: [...FEMORAL, 'S1_ANT', 'S1_POST'],
    pi_ll: [...FEMORAL, 'S1_ANT', 'S1_POST', 'L1_SUP_ANT', 'L1_SUP_POST'],
    ll: ['L1_SUP_ANT', 'L1_SUP_POST', 'S1_ANT', 'S1_POST'],
    tpa: [...FEMORAL, 'T1_CENTROID', 'S1_ANT', 'S1_POST'],
    spa: [...FEMORAL, 'C7_CENTROID', 'S1_ANT', 'S1_POST'],
    t1spi: [...FEMORAL, 'T1_CENTROID'],
    t9spi: [...FEMORAL, 'T9_CENTROID'],
    odha: [...FEMORAL, 'DENS_TIP'],
    ssa: ['C7_CENTROID', 'S1_POST', 'S1_ANT'],
    sva: ['C7_CENTROID', 'S1_POST'],
    c7pl: ['C7_CENTROID'],
    csvl: ['S1_ANT', 'S1_POST'],
    ts: ['C7_CENTROID', 'S1_ANT', 'S1_POST'],
    avt: [null, 'S1_ANT', 'S1_POST'],
};

export const LANDMARK_NAMES: Record<LandmarkId, string> = {
    FH1_A: 'Femoral head 1', FH1_B: 'Femoral head 1', FH2_A: 'Femoral head 2', FH2_B: 'Femoral head 2',
    S1_ANT: 'S1 endplate', S1_POST: 'S1 endplate',
    C7_CENTROID: 'C7 centroid', T1_CENTROID: 'T1 centroid', T9_CENTROID: 'T9 centroid', DENS_TIP: 'Dens tip',
    L1_SUP_ANT: 'L1 superior endplate', L1_SUP_POST: 'L1 superior endplate',
};

/** Latest known position of every landmark in these measurements. */
export function collectLandmarks(measurements: Measurement[]): Map<LandmarkId, Point> {
    const known = new Map<LandmarkId, Point>();
    [...measurements]
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
        .forEach((m) => {
            const schema = TOOL_LANDMARKS[m.toolKey];
            if (!schema) return;
            schema.forEach((id, i) => {
                if (id && m.points[i]) known.set(id, { ...m.points[i] });
            });
        });
    return known;
}

/**
 * Append already-known landmarks for the next clicks of `toolKey`, starting
 * after `points`. Stops at the first landmark that is not known yet.
 */
export function autoFillLandmarks(toolKey: string | null, points: Point[], known: Map<LandmarkId, Point>): Point[] {
    const schema = toolKey ? TOOL_LANDMARKS[toolKey] : undefined;
    if (!schema) return points;
    const out = [...points];
    while (out.length < schema.length) {
        const id = schema[out.length];
        const p = id ? known.get(id) : undefined;
        if (!p) break;
        out.push({ ...p });
    }
    return out;
}

export const landmarkCount = (toolKey: string | null) => (toolKey ? TOOL_LANDMARKS[toolKey]?.length ?? 0 : 0);
