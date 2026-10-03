import type { CanvasData, Measurement } from './CanvasManager';
import { getPolygonCenter } from './GeometryUtils';
import { beginAnnotation, beginLabelDeferral, flushDeferredLabels, setLabelRecording } from './annotationStyle';
import { applyPiece, buildPieces } from './osteotomyPieces';
import { MeasurementSystem } from '@/features/measurements/MeasurementSystem';
import { isPlanMeasurement, registerMeasurements } from '@/features/planning2d/plan';
import { drawScrew, drawRod, drawCage, drawPlate, drawImplantHandles, drawImplantDimensions } from '@/features/measurements/planning/ImplantRenderer';

/**
 * Pure scene renderer: X-ray + measurements + implants in WORLD (image-pixel)
 * coordinates. The caller sets the view transform on `ctx`.
 *
 * Layers, bottom to top (UI6-04):
 *   1. image pieces — the X-ray split/moved by the planned osteotomies
 *   2. measurement lines and points, clipped to the image
 *   3. implants
 *   4. measurement labels (not clipped — they may sit outside the image)
 *
 * Shared by the live canvas (CanvasWorkspace) and the report renderer
 * (lib/report/renderCaseImage) so a report shows exactly what the canvas shows
 * (BUGS RPT-01, RPT-16).
 */
export interface SceneOptions {
    /** Effective scale (screen px per image px) — keeps strokes/labels constant on screen. */
    ek: number;
    getImage: (src: string | HTMLImageElement) => HTMLImageElement;
    brightness: number;
    contrast: number;
    sharpness: number;
    /** mm per px when calibration is applied, else null. */
    displayRatio: number | null;
    calibrationEnabledAt: number | null;
    /** Only draw these measurements (report: selected ones). Default: all. */
    measurementFilter?: (m: Measurement) => boolean;
    selectedImplantId?: string | null;
    /** Live canvas only: key under which label boxes are recorded for hit-testing (getLabelRegions). */
    labelScene?: string;
    /** Live canvas: measurements switched off in the panel (eye) keep their cut but draw no lines/labels. */
    hideUnselected?: boolean;
    /**
     * 'assessment' — preop only: original image, no plan measurements, no implants.
     * 'planning'   — the plan: cut image, preop measurements registered to the moved
     *                bone (re-measured), plan measurements and implants.
     * 'all'        — everything as stored (legacy).
     */
    view?: 'assessment' | 'planning' | 'all';
}

export function renderScene(ctx: CanvasRenderingContext2D, data: CanvasData, o: SceneOptions) {
    const { ek } = o;
    const view = o.view ?? 'all';
    const stored = data.measurements.filter((m) => !m.measurement?.isCalibration && (!o.measurementFilter || o.measurementFilter(m)));
    const visible = view === 'assessment' ? stored.filter((m) => !isPlanMeasurement(m)) : stored;

    const box = data.fragments.reduce(
        (acc, frag) => {
            frag.polygon.forEach((p) => {
                acc.minX = Math.min(acc.minX, p.x); acc.maxX = Math.max(acc.maxX, p.x);
                acc.minY = Math.min(acc.minY, p.y); acc.maxY = Math.max(acc.maxY, p.y);
            });
            return acc;
        },
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    );
    const hasBox = Number.isFinite(box.minX);
    const bounds = { minY: box.minY, maxY: box.maxY };
    // Planning: preop landmarks follow the bone pieces they lie on (UI9-05).
    const annotated = view === 'planning' ? registerMeasurements(visible, hasBox ? box : undefined) : visible;

    // 1. Image pieces (osteotomies applied in planning order)
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = `brightness(${o.brightness}%) contrast(${o.contrast + o.sharpness / 2}%) saturate(${100 + o.sharpness / 4}%)`;
    const R = hasBox ? 4 * Math.max(box.maxX - box.minX, box.maxY - box.minY, 1) : 20000;
    const pieces = buildPieces(visible, R, hasBox ? box : undefined);
    pieces.forEach((piece) => {
        data.fragments.forEach((frag) => {
            const img = o.getImage(frag.image);
            if (!img.complete || img.naturalWidth === 0) return;
            ctx.save();
            applyPiece(ctx, piece);
            ctx.beginPath();
            frag.polygon.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            ctx.closePath();
            ctx.clip();
            const pivot = frag.pivot || getPolygonCenter(frag.polygon);
            ctx.translate(pivot.x, pivot.y);
            ctx.rotate(((frag.rotation || 0) * Math.PI) / 180);
            ctx.translate(-pivot.x, -pivot.y);
            ctx.drawImage(img, frag.imageX, frag.imageY, frag.imageWidth, frag.imageHeight);
            ctx.restore();
        });
    });
    ctx.filter = 'none';

    // 2. Lines and points stay inside the image; labels are queued (UI6-03).
    setLabelRecording(o.labelScene ?? null);
    beginLabelDeferral();
    ctx.save();
    if (hasBox) {
        ctx.beginPath();
        ctx.rect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);
        ctx.clip();
    }
    annotated.forEach((m) => {
        if (o.hideUnselected && m.selected === false) return;
        beginAnnotation(m.id);
        MeasurementSystem.draw(ctx, m, ek, o.displayRatio, hasBox ? bounds : undefined, o.calibrationEnabledAt);
    });
    beginAnnotation(null);
    ctx.restore();

    // 3. Implants
    (view === 'assessment' ? [] : data.implants || []).forEach((i) => {
        const sel = !!o.selectedImplantId && i.id === o.selectedImplantId;
        const props = i.properties ?? {};
        if (i.type === 'screw' && i.position) drawScrew(ctx, i.position, i.angle, props, ek, props.color, sel);
        else if (i.type === 'cage' && i.position) drawCage(ctx, i.position, i.angle, props, ek, props.color, sel);
        else if (i.type === 'rod') drawRod(ctx, props.points, ek, props.diameter || 6, props.color, sel);
        else if (i.type === 'plate' && i.position) drawPlate(ctx, i.position, i.angle, props, ek, props.color, sel);
        if (sel) drawImplantHandles(ctx, i, ek);
    });

    // 4. Labels on top of everything
    flushDeferredLabels(ctx);
    setLabelRecording(null);
    const selImp = view === 'assessment' ? undefined : (data.implants || []).find((i) => !!o.selectedImplantId && i.id === o.selectedImplantId);
    if (selImp) drawImplantDimensions(ctx, selImp, ek, o.displayRatio);
}
