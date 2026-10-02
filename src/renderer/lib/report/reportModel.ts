import type { AppState } from '@/lib/store';
import type { Measurement, Patient, ReportSectionConfig, Visit } from '@/lib/store/types';
import { getDefaultReportConfig } from '@/features/report/defaultConfig';
import { renderCaseImage, isReportMeasurement, type RenderedImage } from './renderCaseImage';
import { screwLength, trajectoryAngles } from '@/features/planning3d/implantModel';

/**
 * ONE description of a report, built from the active case. The on-screen
 * preview and the PDF both render this — so they always show the same
 * images, rows and sections (BUGS RPT-06, RPT-12, RPT-13).
 */
export interface ReportImage extends RenderedImage { label: string }

export interface ComparisonRow { parameter: string; a: string; b: string; diff: string }
export interface MeasurementRow { parameter: string; level: string; value: string }
export interface ImplantRow { type: string; location: string; size: string }

export interface ReportModel {
    kind: 'single' | 'comparison' | 'planning3d';
    refNo: string;
    planDate: string;
    patient: Patient | null;
    visit: Visit | null;
    /** Where the exported PDF is filed — from the active context, never guessed (RPT-08). */
    contextId: string | null;
    visitId: string | null;
    studyId: string | null;
    surgeon: { name: string; title: string; department: string };
    sections: ReportSectionConfig[];
    images: ReportImage[];
    measurementRows: MeasurementRow[];
    comparisonRows: ComparisonRow[];
    implantRows: ImplantRow[];
    notes: string;
    preOpDate: string | null;
    postOpDate: string | null;
}

const firstLine = (r: unknown) => {
    if (typeof r === 'number') return r.toFixed(1);
    if (typeof r === 'string') return r.split('\n')[0];
    return '—';
};

const parseValue = (s: string): { num: number; unit: string } | null => {
    const m = s.match(/(-?\d+(?:\.\d+)?)\s*(°|mm²|mm|px²|px|%)?/);
    return m ? { num: parseFloat(m[1]), unit: m[2] ?? '' } : null;
};

/**
 * Pair A/B measurements by tool + occurrence (1st Cobb ↔ 1st Cobb, 2nd ↔ 2nd),
 * keep rows that exist on only one side, and use the measured unit (RPT-07).
 */
export function buildComparisonRows(left: Measurement[], right: Measurement[]): ComparisonRow[] {
    const keyed = (list: Measurement[]) => {
        const seen = new Map<string, number>();
        return list.filter(isReportMeasurement).map((m) => {
            const n = (seen.get(m.toolKey) ?? 0) + 1;
            seen.set(m.toolKey, n);
            return { key: `${m.toolKey}#${n}`, m, n };
        });
    };
    const A = keyed(left);
    const B = keyed(right);
    const bByKey = new Map(B.map((x) => [x.key, x]));
    const rows: ComparisonRow[] = [];
    const label = (x: { m: Measurement; n: number }, total: number) =>
        `${x.m.toolKey.toUpperCase()}${total > 1 ? ` ${x.n}` : ''}`;
    const countOf = (k: string) => Math.max(A.filter((x) => x.m.toolKey === k).length, B.filter((x) => x.m.toolKey === k).length);

    const diffOf = (a: string, b: string) => {
        const pa = parseValue(a);
        const pb = parseValue(b);
        if (!pa || !pb || pa.unit !== pb.unit) return '—';
        const d = pb.num - pa.num;
        return `${d > 0 ? '+' : ''}${d.toFixed(1)}${pa.unit === '°' ? '°' : pa.unit ? ` ${pa.unit}` : ''}`;
    };

    for (const a of A) {
        const b = bByKey.get(a.key);
        const va = firstLine(a.m.result);
        const vb = b ? firstLine(b.m.result) : '—';
        rows.push({ parameter: label(a, countOf(a.m.toolKey)), a: va, b: vb, diff: b ? diffOf(va, vb) : '—' });
        if (b) bByKey.delete(a.key);
    }
    for (const b of bByKey.values()) {
        rows.push({ parameter: label(b, countOf(b.m.toolKey)), a: '—', b: firstLine(b.m.result), diff: '—' });
    }
    return rows;
}

const dateStamp = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

export interface BuildOptions { withImages?: boolean }

export async function buildReportModel(state: AppState, opts: BuildOptions = { withImages: true }): Promise<ReportModel> {
    const ctx = state.contexts.find((c) => c.id === state.activeContextId) ?? null;
    const ctxState = state.contextStates.find((s) => s.contextId === state.activeContextId);
    const reportConfig = ctxState?.reportConfig ?? getDefaultReportConfig();
    const patient = state.patients.find((p) => p.id === state.activePatientId) ?? null;
    const studyId = ctx?.studyIds?.[0] ?? null;
    const study = patient?.studies.find((s) => s.id === studyId)
        ?? patient?.visits.flatMap((v) => v.studies ?? []).find((s) => s.id === studyId);
    const visitId = ctx?.visitId ?? study?.visitId ?? null;
    const visit = patient?.visits.find((v) => v.id === visitId) ?? null;

    const kind: ReportModel['kind'] = state.isDicomMode
        ? 'planning3d'
        : state.isComparisonMode && reportConfig.reportType !== 'single' ? 'comparison' : 'single';

    const now = new Date();
    const model: ReportModel = {
        kind,
        refNo: `SS-${dateStamp(now)}-${(state.activeContextId ?? state.activePatientId ?? 'LOCAL').replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}`,
        planDate: now.toLocaleDateString(),
        patient,
        visit,
        contextId: state.activeContextId,
        visitId,
        studyId,
        surgeon: {
            name: state.user?.name || '—',
            title: state.user?.title || state.user?.designation || '—',
            department: state.user?.subsection || 'Spine Surgery',
        },
        sections: [...reportConfig.sections].filter((s) => s.enabled).sort((a, b) => a.order - b.order),
        images: [],
        measurementRows: [],
        comparisonRows: [],
        implantRows: [],
        notes: ctxState?.toolState?.clinicalNotes ?? '',
        preOpDate: null,
        postOpDate: null,
    };

    if (kind === 'comparison') {
        const { left, right } = state.comparison;
        model.comparisonRows = buildComparisonRows(left.measurements, right.measurements);
        const scanDate = (url: string | null) =>
            url ? patient?.studies.flatMap((s) => s.scans).find((sc) => sc.imageUrl === url)?.date ?? null : null;
        model.preOpDate = scanDate(left.image);
        model.postOpDate = scanDate(right.image);
        if (opts.withImages) {
            for (const [side, label] of [['left', 'PRE-OPERATIVE'], ['right', 'POST-OPERATIVE']] as const) {
                const pane = state.comparison[side];
                if (!pane.image) continue;
                const img = await renderCaseImage({
                    image: pane.image, measurements: pane.measurements, implants: pane.implants,
                    canvas: { ...pane.canvas }, manager: state.managers[side],
                });
                model.images.push({ ...img, label });
            }
        }
    } else if (kind === 'single') {
        const measurements = ctxState?.measurements ?? state.measurements;
        const implants = ctxState?.implants ?? state.implants;
        model.measurementRows = measurements.filter(isReportMeasurement).map((m) => ({
            parameter: m.toolKey.toUpperCase(),
            level: [m.measurement?.level, m.measurement?.comments].filter(Boolean).join(' — ') || '—',
            value: firstLine(m.result),
        }));
        const ratio = state.canvas.calibrationApplied ? state.canvas.pixelToMm : null;
        const mm = (px: number) => (ratio ? `${(px * ratio).toFixed(1)} mm` : `${px.toFixed(0)} px`);
        model.implantRows = implants.map((i: any) => ({
            type: String(i.type),
            location: i.properties?.level ?? '—',
            size: i.type === 'screw' ? `${mm(i.properties?.diameter ?? 0)} × ${mm(i.properties?.length ?? 0)}`
                : i.type === 'cage' ? `${mm(i.properties?.width ?? 0)} × ${mm(i.properties?.height ?? 0)}`
                : i.type === 'rod' ? `Ø ${mm(i.properties?.diameter ?? 0)}` : '—',
        }));
        const image = state.currentImage ?? ctxState?.currentImage ?? null;
        if (opts.withImages && image) {
            const img = await renderCaseImage({
                image, measurements, implants, canvas: { ...state.canvas }, manager: state.managers.main,
            });
            model.images.push({ ...img, label: 'PLANNING IMAGE' });
        }
    } else {
        model.implantRows = state.threeDImplants.map((i) => {
            if (i.type === 'screw') {
                const a = trajectoryAngles(i);
                return {
                    type: 'Pedicle screw',
                    location: `${i.level ?? '—'} ${i.side === 'L' ? 'Left' : i.side === 'R' ? 'Right' : ''}`.trim(),
                    size: `${i.diameter} × ${screwLength(i).toFixed(1)} mm · ${a.transverse.toFixed(0)}° / ${a.sagittal.toFixed(0)}°`,
                };
            }
            if (i.type === 'rod') {
                const length = i.points.slice(1).reduce((acc, p, k) => acc + Math.hypot(p[0] - i.points[k][0], p[1] - i.points[k][1], p[2] - i.points[k][2]), 0);
                return { type: 'Rod', location: '—', size: `Ø ${i.diameter} × ${length.toFixed(0)} mm` };
            }
            return { type: 'Interbody cage', location: i.level ?? '—', size: `${i.size.map((v) => v.toFixed(0)).join(' × ')} mm` };
        });
    }
    return model;
}

/** Can a report be produced from this model? (shared by preview + export button) */
export function reportHasContent(m: ReportModel): boolean {
    if (m.kind === 'planning3d') return m.implantRows.length > 0;
    if (m.kind === 'comparison') return m.comparisonRows.length > 0 || m.images.length > 0;
    return m.measurementRows.length > 0 || m.implantRows.length > 0 || m.images.length > 0;
}
