import type { Fragment, Implant, Measurement } from '@/lib/canvas/CanvasManager';
import { mapPointThroughOsteotomies, isOsteotomy, type ImageBox } from '@/lib/canvas/osteotomyPieces';
import { computeMeasurementResult } from '@/features/measurements/results';
import { useAppStore } from '@/lib/store';
import { METRICS, metricForLine, metricValue, resultLines } from './metrics';

/**
 * 2D surgical plans (BUGS UI9-05).
 *
 * The working plan = the osteotomies + planning measurements + implants in
 * the open case. Preop (assessment) measurements are never edited by a plan:
 * in Planning they are shown REGISTERED — every landmark moves with the bone
 * piece it lies on — and re-measured, giving the "plan" values.
 *
 * Saving snapshots the working plan as Plan 1, 2, … in the session's
 * toolState.plans; the report shows every saved plan. Unsaved changes are a
 * draft only.
 */
export const PLAN_TOOL_KEYS = new Set(['ost-pso', 'ost-spo', 'ost-resect', 'ost-open', 'itilt']);
export const isPlanMeasurement = (m: Measurement) => PLAN_TOOL_KEYS.has(m.toolKey);

/** Target value per metric key (features/planning2d/metrics.ts). */
export type PlanTargets = Record<string, number>;

export interface SavedPlan {
    id: string;
    name: string;
    savedAt: string;
    measurements: Measurement[];   // planning measurements (osteotomies, instr. level)
    implants: Implant[];
    targets: PlanTargets;
}

export function imageBoxOf(fragments: Pick<Fragment, 'polygon'>[]): ImageBox | undefined {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    fragments.forEach((f) => f.polygon.forEach((p) => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }));
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : undefined;
}
export const pieceRadius = (box?: ImageBox) => (box ? 4 * Math.max(box.maxX - box.minX, box.maxY - box.minY, 1) : 20000);

/**
 * Preop measurements as they look after the plan: points (and label anchors)
 * carried through the osteotomies, results recomputed. Planning measurements
 * are returned unchanged.
 */
export function registerMeasurements(measurements: Measurement[], box?: ImageBox): Measurement[] {
    const osteotomies = measurements.filter(isOsteotomy);
    if (osteotomies.length === 0) return measurements;
    const R = pieceRadius(box);
    const map = (p: { x: number; y: number }) => mapPointThroughOsteotomies(p, osteotomies, R, box);
    return measurements.map((m) => {
        if (isPlanMeasurement(m)) return m;
        const points = m.points.map(map);
        const lp = m.measurement?.labelPos;
        return {
            ...m,
            points,
            result: computeMeasurementResult(m.toolKey, points, m) ?? m.result,
            measurement: m.measurement ? { ...m.measurement, ...(lp ? { labelPos: map(lp) } : {}) } : m.measurement,
        };
    });
}

/** Numbers + unit from a result line; px → mm when a ratio is given. */
export function parseResultLine(line: string, mmPerPx: number | null): { key: string; value: number; unit: string } | null {
    const [rawKey, rest] = line.includes(':') ? [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)] : ['', line];
    const m = rest.match(/(-?\d+(?:\.\d+)?)\s*(°|mm²|mm|px²|px|%)?/);
    if (!m) return null;
    let value = parseFloat(m[1]);
    let unit = m[2] ?? '';
    if (mmPerPx && unit === 'px') { value *= mmPerPx; unit = 'mm'; }
    if (mmPerPx && unit === 'px²') { value *= mmPerPx * mmPerPx; unit = 'mm²'; }
    return { key: rawKey.trim(), value, unit };
}

export interface CompareRow { name: string; preop: string; plan: string; diff: string; changed: boolean }

const fmtVal = (v: number, u: string) => `${v.toFixed(1)}${u === '°' || u === '%' ? u : u ? ` ${u}` : ''}`;
const row = (name: string, a: { value: number; unit: string }, b: { value: number; unit: string } | null): CompareRow => {
    const d = b ? b.value - a.value : null;
    return {
        name,
        preop: fmtVal(a.value, a.unit),
        plan: b ? fmtVal(b.value, b.unit) : '—',
        diff: d == null ? '—' : `${d > 0 ? '+' : ''}${fmtVal(d, a.unit)}`,
        changed: d != null && Math.abs(d) >= 0.05,
    };
};

/**
 * Preop vs plan (UI10-01): one row per named measurement (PI, LL, SVA, … —
 * whichever tool measured it, latest wins), then per-instance rows for tools
 * that can repeat (Cobb at several levels, VBM, …). Metrics in `exclude` (the
 * targets) are left out — they have their own table.
 */
export function preopVsPlanRows(
    preop: Measurement[], planned: Measurement[], names: Record<string, string>, mmPerPx: number | null, exclude: string[] = [],
): CompareRow[] {
    const rows: CompareRow[] = [];
    const visible = preop.filter((m) => !isPlanMeasurement(m) && m.selected !== false && !m.measurement?.isCalibration && m.toolKey !== 'c7pl' && m.toolKey !== 'csvl');

    // 1. Named measurements, once each
    METRICS.filter((mt) => !mt.multi && !exclude.includes(mt.key)).forEach((mt) => {
        const a = metricValue(visible, mt.key, mmPerPx);
        if (a) rows.push(row(mt.label, a, metricValue(planned, mt.key, mmPerPx)));
    });

    // 2. Everything that isn't a named measurement, per instance
    const byId = new Map(planned.map((m) => [m.id, m]));
    visible.forEach((m) => {
        const multiMetric = METRICS.find((mt) => mt.multi && mt.sources.some((s) => s.tool === m.toolKey));
        if (multiMetric && exclude.includes(multiMetric.key)) return;
        const a = resultLines(m, mmPerPx);
        const b = resultLines(byId.get(m.id) ?? m, mmPerPx);
        a.forEach((line, i) => {
            const metric = metricForLine(m.toolKey, line.key, i);
            if (metric && !metric.multi) return; // already in section 1 (or a target)
            const tool = names[m.toolKey] ?? m.toolKey.toUpperCase();
            const level = m.measurement?.level ? ` (${m.measurement.level})` : '';
            const name = a.length > 1 && line.key ? `${tool} · ${line.key}` : `${tool}${level}`;
            rows.push(row(name, line, b[i] ?? null));
        });
    });
    return rows;
}

// ── Saved plans (session toolState) ─────────────────────────────────────

const activeCtx = () => {
    const st = useAppStore.getState();
    return st.activeContextId ? st.contextStates.find((c) => c.contextId === st.activeContextId) ?? null : null;
};
type PlanToolState = { plans?: SavedPlan[]; targets?: PlanTargets } | null | undefined;
export const getSavedPlans = (toolState: PlanToolState): SavedPlan[] => (Array.isArray(toolState?.plans) ? toolState.plans : []);
export const getTargets = (toolState: PlanToolState): PlanTargets => toolState?.targets ?? {};

function writeToolState(patch: Record<string, unknown>) {
    const st = useAppStore.getState();
    const ctx = activeCtx();
    if (!st.activeContextId || !ctx) return false;
    void st.updateContextState(st.activeContextId, { toolState: { ...(ctx.toolState ?? {}), ...patch } });
    return true;
}

export function setTargets(targets: PlanTargets) {
    return writeToolState({ targets });
}

/** Snapshot the working plan as a new saved plan (or overwrite `replaceId`). */
export function saveWorkingPlan(replaceId?: string): SavedPlan | null {
    const st = useAppStore.getState();
    const ctx = activeCtx();
    if (!ctx) return null;
    const mgr = st.managers.main;
    const data = mgr?.current?.data;
    const measurements: Measurement[] = (data?.measurements ?? ctx.measurements ?? []).filter(isPlanMeasurement);
    const implants: Implant[] = (data?.implants ?? ctx.implants ?? []) as Implant[];
    const plans = getSavedPlans(ctx.toolState);
    const existing = replaceId ? plans.find((p) => p.id === replaceId) : undefined;
    const plan: SavedPlan = {
        id: existing?.id ?? `plan-${crypto.randomUUID()}`,
        name: existing?.name ?? `Plan ${plans.length + 1}`,
        savedAt: new Date().toISOString(),
        measurements: JSON.parse(JSON.stringify(measurements)),
        implants: JSON.parse(JSON.stringify(implants)),
        targets: { ...getTargets(ctx.toolState) },
    };
    const next = existing ? plans.map((p) => (p.id === existing.id ? plan : p)) : [...plans, plan];
    writeToolState({ plans: next, activePlanId: plan.id });
    return plan;
}

export function deleteSavedPlan(id: string) {
    const ctx = activeCtx();
    if (!ctx) return;
    const plans = getSavedPlans(ctx.toolState).filter((p) => p.id !== id)
        // keep names in order: Plan 1, Plan 2, …
        .map((p, i) => ({ ...p, name: /^Plan \d+$/.test(p.name) ? `Plan ${i + 1}` : p.name }));
    writeToolState({ plans, ...(ctx.toolState?.activePlanId === id ? { activePlanId: null } : {}) });
}

/**
 * Make a saved plan (or an empty plan) the working plan. One undo step on the
 * canvas; preop measurements are untouched.
 */
export async function loadPlan(plan: SavedPlan | null) {
    const st = useAppStore.getState();
    const mgr = st.managers.main;
    if (!mgr?.current) return;
    const keep = mgr.current.data.measurements.filter((m: Measurement) => !isPlanMeasurement(m));
    const next = await mgr.applyOperation('REPLACE_PLAN', {
        measurements: [...keep, ...(plan ? JSON.parse(JSON.stringify(plan.measurements)) : [])],
        implants: plan ? JSON.parse(JSON.stringify(plan.implants)) : [],
    });
    if (st.activeContextId) {
        const ctx = activeCtx();
        await st.updateContextState(st.activeContextId, {
            measurements: next.data.measurements,
            implants: next.data.implants,
            toolState: { ...(ctx?.toolState ?? {}), activePlanId: plan?.id ?? null, ...(plan ? { targets: plan.targets } : {}) },
        });
    } else {
        st.setMeasurements(next.data.measurements);
        st.setImplants(next.data.implants);
    }
}
