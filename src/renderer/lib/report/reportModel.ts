import type { AppState } from '@/lib/store';
import type { Measurement, Patient, ReportDocumentSettings, ReportSectionConfig, Visit } from '@/lib/store/types';
import { getReportConfig } from './useReportConfig';
import { renderCaseImage, isReportMeasurement, type RenderedImage } from './renderCaseImage';
import { rodLength, screwLength, trajectoryAngles } from '@/features/planning3d/implantModel';
import { useSettings } from '@/lib/settings';
import { captureViewer } from '@/features/planning3d/capture';
import { getSavedPlans, imageBoxOf, isPlanMeasurement, preopVsPlanRows, registerMeasurements, type CompareRow } from '@/features/planning2d/plan';
import { metricByKey, metricValue } from '@/features/planning2d/metrics';

/**
 * ONE description of a report, built from the active case. The on-screen
 * preview and the PDF both render this — so they always show the same
 * images, rows and sections (BUGS RPT-06, RPT-12, RPT-13).
 */
export interface ReportImage extends RenderedImage { label: string; /** full page width, stacked (3D screenshots) */ fullWidth?: boolean }

export interface ComparisonRow { parameter: string; a: string; b: string; diff: string }
export interface MeasurementRow { parameter: string; level: string; value: string }
export interface ImplantRow { type: string; location: string; size: string }
export interface TargetRow { parameter: string; measured: string; target: string; diff: string; plan: string }
/** One saved 2D plan (UI9-05): its image, target table, preop-vs-plan table and implants. */
export interface PlanReport {
    name: string;
    savedAt: string;
    image: ReportImage | null;
    osteotomies: string[];
    targetRows: TargetRow[];
    compareRows: CompareRow[];
    implantRows: ImplantRow[];
}

/**
 * The report covers the whole case: Assessment (measurements), Planning
 * (2D + 3D implants), Compare (Image B). A section is only rendered when its
 * source has data.
 */
export interface ReportModel {
    refNo: string;
    planDate: string;
    patient: Patient | null;
    visit: Visit | null;
    /** Where the exported PDF is filed — from the active context, never guessed (RPT-08). */
    contextId: string | null;
    visitId: string | null;
    studyId: string | null;
    surgeon: { name: string; title: string; department: string };
    doc: ReportDocumentSettings;
    sections: ReportSectionConfig[];
    images: ReportImage[];
    measurementRows: MeasurementRow[];
    comparisonRows: ComparisonRow[];
    /** 3D (CT) plan implants; 2D implants are listed per saved plan */
    implantRows: ImplantRow[];
    plans: PlanReport[];
    notes: string;
    hasComparison: boolean;
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
    const config = getReportConfig(state);
    const patient = state.patients.find((p) => p.id === state.activePatientId) ?? null;
    const studyId = ctx?.studyIds?.[0] ?? null;
    const study = patient?.studies.find((s) => s.id === studyId)
        ?? patient?.visits.flatMap((v) => v.studies ?? []).find((s) => s.id === studyId);
    const visitId = ctx?.visitId ?? study?.visitId ?? null;
    const visit = patient?.visits.find((v) => v.id === visitId) ?? null;

    const now = new Date();
    // Preop measurements only — plans are reported per saved plan (UI9-05)
    const allMeasurements = ctxState?.measurements ?? state.measurements;
    const measurements = allMeasurements.filter((m) => !isPlanMeasurement(m));
    const B = state.comparison.right;
    // Image B and the A/B table only appear while the Comparison section is on (UI6-10).
    const comparisonOn = config.sections.some((s) => s.type === 'compare_table' && s.enabled);
    const hasComparison = comparisonOn && (!!B.image || B.measurements.length > 0);
    const settings = useSettings.getState();

    const model: ReportModel = {
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
            department: config.document!.department || state.user?.subsection || 'Spine Surgery',
        },
        doc: {
            ...config.document!,
            logo: config.document!.logo === undefined ? settings.defaultLogo : config.document!.logo,
            institution: config.document!.institution || settings.defaultInstitution,
        },
        sections: [...config.sections].filter((s) => s.enabled).sort((a, b) => a.order - b.order),
        images: [],
        measurementRows: measurements.filter(isReportMeasurement).map((m) => ({
            parameter: m.toolKey.toUpperCase(),
            level: [m.measurement?.level, m.measurement?.comments].filter(Boolean).join(' — ') || '—',
            value: firstLine(m.result),
        })),
        comparisonRows: hasComparison ? buildComparisonRows(measurements, B.measurements) : [],
        implantRows: [],
        plans: [],
        notes: ctxState?.toolState?.clinicalNotes ?? '',
        hasComparison,
        preOpDate: null,
        postOpDate: null,
    };

    // Planning: 3D plan (CT); 2D plans are reported per saved plan below
    const ratio = state.canvas.calibrationApplied ? state.canvas.pixelToMm : null;
    const mm = (px: number) => (ratio ? `${(px * ratio).toFixed(1)} mm` : `${px.toFixed(0)} px`);
    const implantRow = (i: any): ImplantRow => ({
        type: i.type === 'screw' ? 'Screw' : i.type === 'cage' ? 'Cage' : i.type === 'rod' ? 'Rod' : String(i.type),
        location: i.properties?.level ?? '—',
        size: i.type === 'screw' ? `${mm(i.properties?.length ?? 0)} × Ø${mm(i.properties?.diameter ?? 0)}`
            : i.type === 'cage' ? `${mm(i.properties?.width ?? 0)} × ${mm(i.properties?.height ?? 0)} · ${(i.properties?.wedgeAngle ?? 0).toFixed(0)}°`
            : i.type === 'rod' ? `Ø ${mm(i.properties?.diameter ?? 0)}` : '—',
    });
    for (const i of state.threeDImplants) {
        if (i.type === 'screw') {
            const a = trajectoryAngles(i);
            model.implantRows.push({
                type: 'Pedicle screw',
                location: `${i.level ?? '—'} ${i.side === 'L' ? 'Left' : i.side === 'R' ? 'Right' : ''}`.trim(),
                size: `${i.diameter} × ${screwLength(i).toFixed(1)} mm · ${a.transverse.toFixed(0)}° / ${a.sagittal.toFixed(0)}°`,
            });
        } else if (i.type === 'rod') {
            const length = rodLength(i.points);
            model.implantRows.push({ type: 'Rod', location: '—', size: `Ø ${i.diameter} × ${length.toFixed(0)} mm` });
        } else {
            model.implantRows.push({ type: 'Interbody cage', location: i.level ?? '—', size: `${i.size.map((v) => v.toFixed(0)).join(' × ')} mm` });
        }
    }

    const scanDate = (url: string | null | undefined) =>
        url ? patient?.studies.flatMap((s) => s.scans).find((sc) => sc.imageUrl === url)?.date ?? null : null;
    const imageA = state.currentImage ?? ctxState?.currentImage ?? null;
    model.preOpDate = scanDate(imageA);
    model.postOpDate = scanDate(B.image);

    // Saved 2D plans: each re-measured on its planned image
    const names: Record<string, string> = { tk: 'Thoracic Kyphosis', ll: 'Lumbar Lordosis', sva: 'SVA', cobb: 'Cobb', cl: 'Cervical Lordosis', pelvis: 'Pelvic Parameters', pi_ll: 'PI-LL', tpa: 'TPA', spa: 'SPA', ssa: 'SSA' };
    const fragBox = (state.managers.main?.current?.data.fragments ?? []) as { polygon: { x: number; y: number }[] }[];
    const box = imageBoxOf(fragBox);
    for (const plan of state.isDicomMode ? [] : getSavedPlans(ctxState?.toolState)) {
        const withPlan = [...measurements, ...plan.measurements];
        const planned = registerMeasurements(withPlan, box);
        const f = (v: number, u: string) => `${v.toFixed(1)}${u === '°' ? '°' : ` ${u}`}`;
        const report: PlanReport = {
            name: plan.name,
            savedAt: plan.savedAt,
            image: null,
            osteotomies: plan.measurements.filter((m) => m.toolKey.startsWith('ost-')).map((m) => String(m.result || m.toolKey)),
            targetRows: settings.targetKeys.map((key) => {
                const mt = metricByKey(key);
                const pre = mt ? metricValue(measurements, key, ratio) : null;
                if (!mt || !pre) return null;
                const pl = metricValue(planned, key, ratio);
                const target = plan.targets?.[key];
                return {
                    parameter: mt.label,
                    measured: f(pre.value, pre.unit),
                    target: target != null ? f(target, pre.unit) : '—',
                    diff: target != null ? `${target - pre.value > 0 ? '+' : ''}${f(target - pre.value, pre.unit)}` : '—',
                    plan: pl ? f(pl.value, pl.unit) : '—',
                };
            }).filter((r): r is TargetRow => !!r),
            compareRows: preopVsPlanRows(measurements.filter(isReportMeasurement), planned, names, ratio, settings.targetKeys),
            implantRows: plan.implants.map(implantRow),
        };
        if (opts.withImages && imageA) {
            const img = await renderCaseImage({
                image: imageA, measurements: withPlan, implants: plan.implants, canvas: { ...state.canvas },
                manager: state.managers.main ?? state.managers.left, view: 'planning',
            });
            report.image = { ...img, label: plan.name.toUpperCase() };
        }
        model.plans.push(report);
    }

    if (opts.withImages) {
        // CT/MR: screenshot of the 4-view planning layout + the 3D view (UI10-07)
        if (state.isDicomMode) {
            const cap = await captureViewer();
            if (cap) {
                model.images.push({ dataUrl: cap.fourUp, width: cap.width, height: cap.height, label: 'AXIAL · SAGITTAL · CORONAL · 3D', fullWidth: true });
                if (cap.threeD) model.images.push({ dataUrl: cap.threeD, width: 1200, height: 900, label: '3D VIEW', fullWidth: true });
            }
        }
        if (imageA && !state.isDicomMode) {
            const img = await renderCaseImage({
                image: imageA, measurements, implants: [], canvas: { ...state.canvas },
                manager: state.managers.main ?? state.managers.left, view: 'assessment',
            });
            model.images.push({ ...img, label: hasComparison && B.image ? 'IMAGE A · PREOP' : 'PREOP' });
        }
        if (hasComparison && B.image) {
            const img = await renderCaseImage({
                image: B.image, measurements: B.measurements, implants: B.implants, canvas: { ...B.canvas }, manager: state.managers.right,
            });
            model.images.push({ ...img, label: 'IMAGE B' });
        }
    }
    return model;
}

/** Can a report be produced from this model? (shared by preview + export button) */
export function reportHasContent(m: ReportModel): boolean {
    return m.images.length > 0 || m.measurementRows.length > 0 || m.implantRows.length > 0 || m.comparisonRows.length > 0 || m.plans.length > 0;
}
