import type { Point } from "./GeometryUtils";

/**
 * One visual language for every 2D annotation (BUGS UI5-07).
 *
 * Colour = tool family (the left-sidebar tab the tool lives in):
 *   generic → white · alignment → orange-red · extended → lime ·
 *   morphology → cyan · planning → yellow.
 * Every tool draws with the helpers below, so line widths, dash pattern,
 * points, arcs and labels are identical everywhere. All sizes are screen
 * pixels; pass the effective scale `k` (screen px per image px).
 */

export type ToolFamily = 'generic' | 'alignment' | 'extended' | 'morphology' | 'planning';

export const FAMILY_COLORS: Record<ToolFamily, string> = {
    generic: '#ffffff',
    alignment: '#ff6a3d',
    extended: '#a3e635',
    morphology: '#22d3ee',
    planning: '#facc15',
};

const FAMILY_OF: Record<string, ToolFamily> = {
    // Alignment
    cobb: 'alignment', pelvis: 'alignment', pi_ll: 'alignment', sva: 'alignment',
    tk: 'alignment', ll: 'alignment', cl: 'alignment', sc: 'alignment',
    // Extended (coronal + sagittal deformity, reference lines)
    cmc: 'extended', rvad: 'extended', ts: 'extended', avt: 'extended', po: 'extended',
    tpa: 'extended', spa: 'extended', ssa: 'extended', t1spi: 'extended', t9spi: 'extended',
    odha: 'extended', cbva: 'extended', csvl: 'extended', c7pl: 'extended', slope: 'extended',
    // Morphology
    vbm: 'morphology', stenosis: 'morphology', spondy: 'morphology',
    // Planning (osteotomy + instruments)
    'ost-pso': 'planning', 'ost-spo': 'planning', 'ost-resect': 'planning', 'ost-open': 'planning',
    itilt: 'planning', 'imp-screw': 'planning', 'imp-rod': 'planning', 'imp-cage': 'planning',
    'imp-plate': 'planning', screw: 'planning', rod: 'planning', cage: 'planning', plate: 'planning',
};

export const familyOf = (toolKey: string | null | undefined): ToolFamily =>
    (toolKey && FAMILY_OF[toolKey]) || 'generic';

export const toolColor = (toolKey: string | null | undefined): string => FAMILY_COLORS[familyOf(toolKey)];

/** Annotation metrics in screen pixels. */
export const STYLE = {
    line: 2,
    dashedLine: 1.5,
    dash: [6, 4] as const,
    arc: 1.5,
    pointRadius: 3.5,
    pointOutline: 1.25,
    fillAlpha: 0.12,
    font: 12,
    lineHeight: 16,
};

export function withAlpha(color: string, alpha: number): string {
    const hex = color.replace('#', '');
    if (hex.length !== 6) return color;
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ── Lines ────────────────────────────────────────────────────────────────

function applyStroke(ctx: CanvasRenderingContext2D, k: number, color: string, dashed: boolean) {
    ctx.strokeStyle = color;
    ctx.lineWidth = (dashed ? STYLE.dashedLine : STYLE.line) / k;
    ctx.setLineDash(dashed ? STYLE.dash.map((d) => d / k) : []);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}

export function strokeLine(ctx: CanvasRenderingContext2D, a: Point, b: Point, k: number, color: string, dashed = false) {
    ctx.save();
    applyStroke(ctx, k, color, dashed);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
}

export function strokePolyline(
    ctx: CanvasRenderingContext2D,
    pts: Point[],
    k: number,
    color: string,
    opts: { dashed?: boolean; closed?: boolean; fill?: boolean } = {},
) {
    if (pts.length < 2) return;
    ctx.save();
    applyStroke(ctx, k, color, !!opts.dashed);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (opts.closed) ctx.closePath();
    if (opts.fill) {
        ctx.fillStyle = withAlpha(color, STYLE.fillAlpha);
        ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
}

export function strokeCircle(ctx: CanvasRenderingContext2D, c: Point, r: number, k: number, color: string, dashed = false) {
    ctx.save();
    applyStroke(ctx, k, color, dashed);
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(r, 0), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

/** Angle arc, always drawn the short way round from `a0` to `a1`. */
export function drawArc(ctx: CanvasRenderingContext2D, center: Point, radius: number, a0: number, a1: number, k: number, color: string) {
    let diff = a1 - a0;
    while (diff <= -Math.PI) diff += 2 * Math.PI;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = STYLE.arc / k;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, a0, a0 + diff, diff < 0);
    ctx.stroke();
    ctx.restore();
}

// ── Points ───────────────────────────────────────────────────────────────

export function drawPoint(ctx: CanvasRenderingContext2D, p: Point, k: number, color: string, scale = 1) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, (STYLE.pointRadius * scale) / k, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = STYLE.pointOutline / k;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.stroke();
    ctx.restore();
}

export function drawPoints(ctx: CanvasRenderingContext2D, pts: Point[], k: number, color: string) {
    pts.forEach((p) => p && drawPoint(ctx, p, k, color));
}

/** Small letter next to a point (spondylolisthesis A–D, osteotomy A–F). */
export function drawPointTag(ctx: CanvasRenderingContext2D, text: string, p: Point, k: number) {
    ctx.save();
    ctx.font = `600 ${11 / k}px Inter, "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3 / k;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeText(text, p.x + 6 / k, p.y - 4 / k);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, p.x + 6 / k, p.y - 4 / k);
    ctx.restore();
}

// ── Labels ───────────────────────────────────────────────────────────────

/**
 * Label hit regions (world coords) recorded during the live canvas render, so
 * label dragging grabs exactly what is drawn. `anchor` is the `pos` that
 * reproduces the box (text left / vertical centre).
 */
export interface LabelRegion { x: number; y: number; w: number; h: number; anchor: Point }
const scenes = new Map<string, Map<string, LabelRegion[]>>();
let recording: Map<string, LabelRegion[]> | null = null;
let recordingId: string | null = null;
/** Start (scene key) or stop (null) recording label boxes for one canvas. */
export function setLabelRecording(scene: string | null) {
    if (scene) {
        recording = new Map();
        scenes.set(scene, recording);
    } else {
        recording = null;
    }
    recordingId = null;
}
export function beginAnnotation(id: string | null) {
    recordingId = recording ? id : null;
}
export function getLabelRegions(scene: string): ReadonlyMap<string, LabelRegion[]> {
    return scenes.get(scene) ?? new Map();
}

/**
 * Label deferral: while the scene clips lines/points to the image, labels are
 * queued and drawn afterwards without the clip, so they may sit outside the
 * image and always stay on top (UI6-03).
 */
let deferred: { text: string; pos: Point; k: number; color: string; id: string | null }[] | null = null;
export function beginLabelDeferral() { deferred = []; }
export function flushDeferredLabels(ctx: CanvasRenderingContext2D) {
    const queue = deferred ?? [];
    deferred = null;
    const prevId = recordingId;
    queue.forEach((l) => { recordingId = l.id; drawLabel(ctx, l.text, l.pos, l.k, l.color); });
    recordingId = prevId;
}

/**
 * Uniform measurement label: dark rounded box, family-colour accent bar,
 * white text. `pos` = left edge of the text, vertical centre of the box.
 * Lines equal to '---' draw a separator.
 */
export function drawLabel(ctx: CanvasRenderingContext2D, text: string, pos: Point, k: number, color: string) {
    if (deferred) { deferred.push({ text, pos: { ...pos }, k, color, id: recordingId }); return; }
    const lines = String(text ?? '').split('\n');
    ctx.save();
    ctx.setLineDash([]);
    ctx.font = `600 ${STYLE.font / k}px Inter, "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const padX = 8 / k, padY = 5 / k, bar = 3 / k, lineH = STYLE.lineHeight / k;
    let maxW = 0;
    lines.forEach((l) => { if (l !== '---') maxW = Math.max(maxW, ctx.measureText(l).width); });
    const w = maxW + padX * 2 + bar;
    const h = lines.length * lineH + padY * 2;

    const x = pos.x - padX - bar;
    const y = pos.y - h / 2;

    if (recording && recordingId) {
        const list = recording.get(recordingId) ?? [];
        list.push({ x, y, w, h, anchor: { x: x + padX + bar, y: y + h / 2 } });
        recording.set(recordingId, list);
    }

    ctx.fillStyle = 'rgba(10, 12, 16, 0.88)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 4 / k);
    else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.lineWidth = 1 / k;
    ctx.strokeStyle = withAlpha(color, 0.35);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(x, y + 3 / k, bar, h - 6 / k);

    const tx = x + bar + padX;
    lines.forEach((l, i) => {
        const ly = y + padY + lineH * (i + 0.5);
        if (l === '---') {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.beginPath();
            ctx.moveTo(tx, ly);
            ctx.lineTo(tx + maxW, ly);
            ctx.stroke();
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.fillText(l, tx, ly);
        }
    });
    ctx.restore();
}
