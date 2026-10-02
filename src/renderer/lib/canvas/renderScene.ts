import type { CanvasData, Measurement } from './CanvasManager';
import { getPolygonCenter } from './GeometryUtils';
import { MeasurementSystem } from '@/features/measurements/MeasurementSystem';
import {
    drawWedgeOsteotomy,
    drawDeformedSuperiorSegment,
    drawResection,
} from '@/features/measurements/planning/PlanningTools';
import { drawScrew, drawRod, drawCage, drawPlate, drawImplantHandles } from '@/features/measurements/planning/ImplantRenderer';

/**
 * Pure scene renderer: X-ray fragments + measurements + implants in WORLD
 * (image-pixel) coordinates. The caller sets the view transform on `ctx`.
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
}

const OSTEOTOMY_KEYS = ['ost-pso', 'ost-spo', 'ost-resect', 'ost-open'];
let scratchCtx: CanvasRenderingContext2D | null = null;

export function renderScene(ctx: CanvasRenderingContext2D, data: CanvasData, o: SceneOptions) {
    const { ek } = o;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = `brightness(${o.brightness}%) contrast(${o.contrast + o.sharpness / 2}%) saturate(${100 + o.sharpness / 4}%)`;

    // Pre-pass: osteotomy primitives (rays, angles) are computed while drawing.
    if (!scratchCtx) scratchCtx = document.createElement('canvas').getContext('2d')!;
    data.measurements.forEach((m) => {
        if (!OSTEOTOMY_KEYS.includes(m.toolKey)) return;
        if (m.toolKey === 'ost-resect') drawResection(scratchCtx!, m, ek);
        else drawWedgeOsteotomy(scratchCtx!, m, ek);
    });

    // Fragments (image pieces, clipped to their polygons)
    data.fragments.forEach((frag: any) => {
        if (frag.isSourceOf) return;
        const img = o.getImage(frag.image);
        const activePlanning = data.measurements.find(
            (m) => m.fragmentId === frag.id && OSTEOTOMY_KEYS.includes(m.toolKey),
        );
        ctx.save();
        ctx.beginPath();
        frag.polygon.forEach((p: { x: number; y: number }, i: number) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.clip();

        const pivot = frag.pivot || getPolygonCenter(frag.polygon);
        ctx.translate(pivot.x, pivot.y);
        if (!activePlanning || activePlanning.toolKey !== 'ost-resect') {
            ctx.rotate((frag.rotation * Math.PI) / 180);
        }
        ctx.translate(-pivot.x, -pivot.y);
        if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, frag.imageX, frag.imageY, frag.imageWidth, frag.imageHeight);
        }
        ctx.restore();
    });
    ctx.filter = 'none';

    const bounds = data.fragments.reduce(
        (acc, frag) => ({
            minY: Math.min(acc.minY, ...frag.polygon.map((p) => p.y)),
            maxY: Math.max(acc.maxY, ...frag.polygon.map((p) => p.y)),
        }),
        { minY: Infinity, maxY: -Infinity },
    );

    data.measurements.forEach((m) => {
        if (m.measurement?.isCalibration) return;
        if (o.measurementFilter && !o.measurementFilter(m)) return;

        if (OSTEOTOMY_KEYS.includes(m.toolKey)) {
            const targetFrag = data.fragments.find((f) => f.id === m.fragmentId) || data.fragments[0];
            if (targetFrag) {
                const img = o.getImage(targetFrag.image);
                if (img.complete && img.naturalWidth > 0) {
                    if (m.toolKey === 'ost-resect') drawResection(ctx, m, ek);
                    else if (m.toolKey !== 'ost-open') drawDeformedSuperiorSegment(ctx, img, m, targetFrag);
                }
            }
        }

        MeasurementSystem.draw(
            ctx,
            m,
            ek,
            o.displayRatio,
            bounds.minY === Infinity ? undefined : bounds,
            o.calibrationEnabledAt,
        );
    });

    (data.implants || []).forEach((i: any) => {
        const sel = !!o.selectedImplantId && i.id === o.selectedImplantId;
        if (i.type === 'screw') drawScrew(ctx, i.position, i.angle, i.properties, ek, i.properties.color, sel);
        else if (i.type === 'cage') drawCage(ctx, i.position, i.angle, i.properties, ek, i.properties.color, sel);
        else if (i.type === 'rod') drawRod(ctx, i.properties.points, ek, i.properties.diameter || 6, i.properties.color, sel);
        else if (i.type === 'plate') drawPlate(ctx, i.position, i.angle, i.properties, ek, i.properties.color, sel);
        if (sel) drawImplantHandles(ctx, i, ek);
    });
}
