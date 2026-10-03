import type { Measurement, Point } from "@/lib/canvas/CanvasManager";
import { getMidpoint } from "@/lib/canvas/GeometryUtils";
import { calculateCobbAngle } from "./quick/CobbAngle";
import { calculateSpinalCurvature } from "./quick/SpinalCurvatures";
import { calculatePelvicParameters } from "./quick/PelvicParams";
import { calculatePILL } from "./quick/PI_LL";
import { calculatePO, calculateTPA, calculateSSA, calculateCBVA } from "./deformity/DeformityTools";
import { getHipAxisCenter } from "./deformity/tools/BaseTools";

/**
 * Clinical colour coding of measurement values (BUGS UI8-05).
 *
 *   good       → healthy range        (green)
 *   borderline → borderline range     (yellow)
 *   bad        → abnormal             (red)
 *   null       → not judged by the app (normal text colour)
 *
 * Values are recomputed from the points, not parsed from text, so signs can be
 * resolved against the image:
 *   • The patient's facing direction (anterior = +1 → image right, −1 → left)
 *     comes from landmarks already on the case: femoral heads lie anterior to
 *     the sacrum (Pelvis / PI-LL / TPA / SPA), and SSA marks S1 anterior.
 *   • T1SPi and ODHA are positive when the vertebra / dens lies anterior to the
 *     hip axis (forward inclination). Without a known facing they are not judged.
 *   • Symmetric criteria (Cobb, PO, CBVA, PI-LL, SVA, TS, AVT) use magnitudes.
 * Distances need calibration (mm); uncalibrated distances are not judged.
 * Age-corrected tools need the patient's age; LL needs PI on the same case.
 */
export type RangeStatus = 'good' | 'borderline' | 'bad' | null;
export interface Assessment { status: RangeStatus; range: string }
export interface AssessContext {
    age: number | null;
    /** mm per px when calibration applies to this measurement, else null */
    mmPerPx: number | null;
    /** Latest PI on the case (for LL) */
    pi: number | null;
    /** +1 = patient faces image right, −1 = left, null = unknown */
    anterior: 1 | -1 | null;
}

/** [lowBad, lowBorder, highBorder, highBad]: healthy = [lowBorder, highBorder]. */
type Band = { healthy: [number, number]; borderline: [number, number]; noRed?: boolean; unit: string };

const classify = (v: number, b: Band): RangeStatus => {
    if (v >= b.healthy[0] && v <= b.healthy[1]) return 'good';
    if (v >= b.borderline[0] && v <= b.borderline[1]) return 'borderline';
    return b.noRed ? 'borderline' : 'bad';
};
const fmt = (b: Band) => `${b.healthy[0]}–${b.healthy[1]}${b.unit}`;
const band = (healthy: [number, number], borderline: [number, number], unit = '°', noRed = false): Band =>
    ({ healthy, borderline, unit, noRed });

/** Table 1 — no age correction */
const FIXED: Record<string, Band> = {
    cobb: band([0, 10], [0, 20]),
    ts: band([0, 10], [0, 20], ' mm'),
    avt: band([0, 10], [0, 20], ' mm'),
    po: band([0, 3], [0, 5]),
    pi: band([40, 70], [-Infinity, Infinity], '°', true),     // anatomical: never red
    pi_ll: band([-10, 10], [-20, 20]),
    t1spi: band([-8, 0], [-10, 5]),
    ssa: band([120, 140], [115, 145]),
    odha: band([-2, 4], [-6, 6]),
    cbva: band([-10, 10], [-20, 20]),
};

/** Table 2 — age corrected: [<40, 40–60, >60] */
const BY_AGE: Record<string, [Band, Band, Band]> = {
    sva: [band([0, 30], [0, 50], ' mm'), band([0, 40], [0, 60], ' mm'), band([0, 50], [0, 70], ' mm')],
    tk: [band([20, 45], [15, 55]), band([25, 50], [20, 60]), band([30, 60], [25, 70])],
    cl: [band([15, 35], [10, 45]), band([15, 40], [10, 50]), band([20, 45], [15, 55])],
    tpa: [band([0, 10], [0, 15]), band([0, 12], [0, 18]), band([0, 15], [0, 20])],
};
const ageBand = (key: string, age: number | null): Band | null => {
    if (age == null || !(age > 0)) return null;
    const bands = BY_AGE[key];
    return age < 40 ? bands[0] : age <= 60 ? bands[1] : bands[2];
};

const judge = (value: number | null, b: Band | null): Assessment =>
    value == null || !b || !Number.isFinite(value) ? { status: null, range: b ? fmt(b) : '' } : { status: classify(value, b), range: fmt(b) };

/** Angle (deg) of hip→point from vertical; positive when the point is anterior. */
function signedInclination(hip: Point, p: Point, anterior: 1 | -1): number {
    return (Math.atan2((p.x - hip.x) * anterior, hip.y - p.y) * 180) / Math.PI;
}

/** Facing direction from the landmarks on the case (see header). */
export function inferAnterior(measurements: Measurement[]): 1 | -1 | null {
    for (const m of [...measurements].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))) {
        const p = m.points;
        if ((m.toolKey === 'pelvis' && p.length >= 6) || (m.toolKey === 'pi_ll' && p.length >= 8)) {
            const d = calculatePelvicParameters(p.slice(0, 6));
            if (d) return d.hipAxisCenter.x >= d.s1_center.x ? 1 : -1;
        }
        if ((m.toolKey === 'tpa' || m.toolKey === 'spa') && p.length >= 7) {
            const hip = getHipAxisCenter(p);
            if (hip) return hip.x >= getMidpoint(p[5], p[6]).x ? 1 : -1;
        }
        if (m.toolKey === 'ssa' && p.length >= 3) return p[2].x >= p[1].x ? 1 : -1;
    }
    return null;
}

/** Latest PI on the case (Pelvis or PI-LL). */
export function latestPI(measurements: Measurement[]): number | null {
    for (const m of [...measurements].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))) {
        if (m.toolKey === 'pelvis' && m.points.length >= 6) return calculatePelvicParameters(m.points)?.pi ?? null;
        if (m.toolKey === 'pi_ll' && m.points.length >= 8) return calculatePILL(m.points)?.pi ?? null;
    }
    return null;
}

/**
 * Assessment of one value of a measurement. `line` is the result line key for
 * multi-value tools ('PI', 'LL', 'PI - LL', …); '' for the main value.
 */
export function assessMeasurement(m: Measurement, line: string, ctx: AssessContext): Assessment {
    const p = m.points;
    const mm = (px: number) => (ctx.mmPerPx ? px * ctx.mmPerPx : null);
    switch (m.toolKey) {
        case 'cobb':
            return judge(p.length >= 4 ? Math.abs(calculateCobbAngle(p).angle) : null, FIXED.cobb);
        case 'ts': case 'avt':
            return judge(p.length >= 3 ? mm(Math.abs(p[0].x - getMidpoint(p[1], p[2]).x)) : null, FIXED[m.toolKey]);
        case 'po':
            return judge(p.length >= 2 ? calculatePO(p)?.angle ?? null : null, FIXED.po);
        case 'pelvis': {
            if (line !== 'PI') return { status: null, range: '' };
            return judge(p.length >= 6 ? calculatePelvicParameters(p)?.pi ?? null : null, FIXED.pi);
        }
        case 'pi_ll': {
            const d = p.length >= 8 ? calculatePILL(p) : null;
            if (line === 'PI') return judge(d?.pi ?? null, FIXED.pi);
            if (line === 'LL') return assessLL(d?.ll ?? null, d?.pi ?? null);
            if (line.replace(/\s/g, '') === 'PI-LL') return judge(d ? d.pi - d.ll : null, FIXED.pi_ll);
            return { status: null, range: '' };
        }
        case 't1spi': case 'odha': {
            const hip = p.length >= 5 ? getHipAxisCenter(p) : null;
            const v = hip && ctx.anterior ? signedInclination(hip, p[4], ctx.anterior) : null;
            return judge(v, FIXED[m.toolKey]);
        }
        case 'ssa':
            return judge(p.length >= 3 ? calculateSSA(p)?.angle ?? null : null, FIXED.ssa);
        case 'cbva': {
            const d = p.length >= 2 ? calculateCBVA(p) : null;
            let a = d ? d.angle : null;
            if (a != null) { while (a > 180) a -= 360; while (a < -180) a += 360; }
            return judge(a == null ? null : Math.abs(a), FIXED.cbva);
        }
        case 'sva':
            return judge(p.length >= 2 ? mm(Math.abs(p[0].x - p[1].x)) : null, ageBand('sva', ctx.age));
        case 'tk': case 'cl':
            return judge(p.length >= 4 ? calculateSpinalCurvature(p).angle : null, ageBand(m.toolKey, ctx.age));
        case 'll':
            return assessLL(p.length >= 4 ? calculateSpinalCurvature(p).angle : null, ctx.pi);
        case 'tpa':
            return judge(p.length >= 7 ? calculateTPA(p)?.angle ?? null : null, ageBand('tpa', ctx.age));
        default:
            return { status: null, range: '' };
    }
}

/** LL is judged against PI: |LL − PI| ≤ 9° healthy, ≤ 15° borderline, else abnormal. */
function assessLL(ll: number | null, pi: number | null): Assessment {
    if (ll == null || pi == null) return { status: null, range: 'PI ± 9°' };
    const d = Math.abs(ll - pi);
    return { status: d <= 9 ? 'good' : d <= 15 ? 'borderline' : 'bad', range: `PI ± 9° (${(pi - 9).toFixed(0)}–${(pi + 9).toFixed(0)}°)` };
}

export const STATUS_COLOR: Record<Exclude<RangeStatus, null>, string> = {
    good: 'var(--range-good)',
    borderline: 'var(--range-borderline)',
    bad: 'var(--range-bad)',
};
