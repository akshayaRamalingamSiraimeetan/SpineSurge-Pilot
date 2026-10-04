import { Point, type Implant } from "@/lib/canvas/CanvasManager";
import { drawLabel, FAMILY_COLORS } from "@/lib/canvas/annotationStyle";

/**
 * 2D implant rendering — clean white silhouettes (docs/2D_INSTRUMENTATION.md).
 *
 * Every implant is a Path2D built in LOCAL coordinates (x along the implant
 * axis, origin at the anchor) and drawn as: dark outline → white fill →
 * cyan outline when selected. The same path is used for hit-testing, so what
 * you see is exactly what you can grab (BUGS CV-13).
 *
 * Data model (unchanged, image-pixel units): { type, position, angle(deg),
 * properties } — screw: position = head, tip = position + length·(cos,sin);
 * cage: position = centre, width along the axis, height across; rod:
 * properties.points.
 */

const FILL = 'rgba(255, 255, 255, 0.95)';
/** Implant annotations (selection, handles, size labels) — planning family colour (UI5-07). */
export const IMPLANT_ANNOTATION = FAMILY_COLORS.planning;
const SELECTED = IMPLANT_ANNOTATION;
const PREVIEW_FILL = 'rgba(255, 255, 255, 0.45)';

// ── Geometry (local coordinates) ──────────────────────────────────────────

/** Pedicle screw: tulip head behind x=0, threaded shank to a rounded tip at x=L. */
export function screwPath(length: number, diameter: number): Path2D {
    const L = Math.max(length, diameter * 2);
    const r = diameter / 2;
    const core = r * 0.62;
    const pitch = Math.max(diameter * 0.45, 1);
    const tipStart = L - Math.min(L * 0.18, diameter * 1.6);
    const p = new Path2D();

    // Tulip head: U-shaped saddle (rod slot facing away from the shank)
    const headLen = diameter * 1.5;
    const headW = diameter * 0.85;
    const slot = diameter * 0.32;
    p.moveTo(0, -headW);
    p.lineTo(-headLen, -headW);
    p.lineTo(-headLen, -slot);
    p.lineTo(-headLen * 0.45, -slot);
    p.lineTo(-headLen * 0.45, slot);
    p.lineTo(-headLen, slot);
    p.lineTo(-headLen, headW);
    p.lineTo(0, headW);
    p.closePath();

    // Neck + threaded shank: sawtooth between outer radius and core radius.
    p.moveTo(0, -core);
    let x = diameter * 0.3;
    p.lineTo(x, -core);
    while (x + pitch < tipStart) {
        p.lineTo(x + pitch * 0.5, -r);
        p.lineTo(x + pitch, -core);
        x += pitch;
    }
    p.lineTo(tipStart, -core);
    // Rounded conical tip ending exactly at L
    p.quadraticCurveTo(L - r * 0.15, -core * 0.35, L, 0);
    p.quadraticCurveTo(L - r * 0.15, core * 0.35, tipStart, core);
    x = tipStart;
    while (x - pitch > diameter * 0.3) {
        p.lineTo(x - pitch * 0.5, r);
        p.lineTo(x - pitch, core);
        x -= pitch;
    }
    p.lineTo(diameter * 0.3, core);
    p.lineTo(0, core);
    p.closePath();
    return p;
}

/**
 * Interbody cage: lordotic trapezoid centred at the origin, x along the
 * footprint (posterior −w/2 → anterior +w/2), serrated top/bottom, graft window.
 */
export function cagePath(width: number, height: number, wedgeDeg = 0): Path2D {
    const w = Math.max(width, 4);
    const hPost = Math.max(height, 2);
    const hAnt = hPost + w * Math.tan((wedgeDeg * Math.PI) / 180);
    const x0 = -w / 2, x1 = w / 2;
    const yTop = (x: number) => -(hPost + ((x - x0) / w) * (hAnt - hPost)) / 2;
    const tooth = Math.min(hPost * 0.12, w * 0.04);
    const teeth = Math.max(4, Math.round(w / Math.max(tooth * 3, 1)));
    const p = new Path2D();

    p.moveTo(x0, yTop(x0));
    for (let i = 0; i < teeth; i++) {
        const a = x0 + (i / teeth) * w, m = x0 + ((i + 0.5) / teeth) * w;
        p.lineTo(a, yTop(a));
        p.lineTo(m, yTop(m) - tooth);
    }
    p.lineTo(x1, yTop(x1));
    p.lineTo(x1, -yTop(x1));
    for (let i = teeth; i > 0; i--) {
        const a = x0 + (i / teeth) * w, m = x0 + ((i - 0.5) / teeth) * w;
        p.lineTo(a, -yTop(a));
        p.lineTo(m, -yTop(m) + tooth);
    }
    p.lineTo(x0, -yTop(x0));
    p.closePath();

    // Graft window (cut out with even-odd fill)
    const ww = w * 0.5, wh = hPost * 0.45, rr = Math.min(ww, wh) * 0.3;
    p.roundRect(-ww / 2, -wh / 2, ww, wh, rr);
    return p;
}

/** Plate: rounded bar with screw holes along its length (x along height). */
export function platePath(length: number, width: number, holes = 4): Path2D {
    const p = new Path2D();
    p.roundRect(-length / 2, -width / 2, length, width, width / 2);
    const hr = width * 0.22;
    for (let i = 0; i < holes; i++) {
        const cx = -length / 2 + ((i + 0.5) / holes) * length;
        p.moveTo(cx + hr, 0);
        p.arc(cx, 0, hr, 0, Math.PI * 2);
    }
    return p;
}

/** Smooth rod through the control points (Catmull-Rom → Bézier), world coords. */
export function rodPath(points: Point[]): Path2D {
    const p = new Path2D();
    if (points.length === 0) return p;
    p.moveTo(points[0].x, points[0].y);
    if (points.length === 2) { p.lineTo(points[1].x, points[1].y); return p; }
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
        p.bezierCurveTo(
            p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
            p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
            p2.x, p2.y,
        );
    }
    return p;
}

// ── Drawing ───────────────────────────────────────────────────────────────

const isPreview = (color?: string) => !!color && color.startsWith('rgba') && !color.endsWith('1)');

function paint(ctx: CanvasRenderingContext2D, path: Path2D, k: number, preview: boolean, selected = false) {
    // Pure white silhouette (no dark outline); selection = cyan outline.
    ctx.lineJoin = 'round';
    ctx.fillStyle = preview ? PREVIEW_FILL : FILL;
    ctx.fill(path, 'evenodd');
    if (selected) {
        ctx.strokeStyle = SELECTED;
        ctx.lineWidth = 1.5 / k;
        ctx.stroke(path);
    }
}

export function drawScrew(
    ctx: CanvasRenderingContext2D,
    pos: Point,
    angleDeg: number,
    properties: { length: number; diameter: number },
    k: number,
    color?: string,
    selected = false,
) {
    if (!pos) return;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate((angleDeg * Math.PI) / 180);
    paint(ctx, screwPath(properties.length, properties.diameter || 6), k, isPreview(color), selected);
    ctx.restore();
}

export function drawCage(
    ctx: CanvasRenderingContext2D,
    pos: Point,
    angleDeg: number,
    properties: { width: number; height: number; wedgeAngle?: number },
    k: number,
    color?: string,
    selected = false,
) {
    if (!pos) return;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate((angleDeg * Math.PI) / 180);
    paint(ctx, cagePath(properties.width, properties.height, properties.wedgeAngle ?? 0), k, isPreview(color), selected);
    ctx.restore();
}

export function drawPlate(
    ctx: CanvasRenderingContext2D,
    pos: Point,
    angleDeg: number,
    properties: { width: number; height: number; holes?: number },
    k: number,
    color?: string,
    selected = false,
) {
    if (!pos) return;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    // Plate height runs along the axis perpendicular to the drawn angle (legacy semantics).
    ctx.rotate(((angleDeg + 90) * Math.PI) / 180);
    paint(ctx, platePath(properties.height, properties.width, properties.holes ?? 4), k, isPreview(color), selected);
    ctx.restore();
}

export function drawRod(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    k: number,
    diameter: number = 6,
    color?: string,
    selected = false,
) {
    if (!points || points.length < 2) return;
    const path = rodPath(points);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = isPreview(color) ? PREVIEW_FILL : FILL;
    ctx.lineWidth = diameter;
    ctx.stroke(path);
    if (selected) {
        ctx.strokeStyle = SELECTED;
        ctx.lineWidth = 1.5 / k;
        ctx.stroke(path);
    }
    ctx.restore();
}

// ── Hit testing ───────────────────────────────────────────────────────────

let hitCtx: CanvasRenderingContext2D | null = null;
const getHitCtx = () => (hitCtx ??= document.createElement('canvas').getContext('2d')!);

const toLocal = (pt: Point, pos: Point, angleDeg: number) => {
    const a = (-angleDeg * Math.PI) / 180;
    const dx = pt.x - pos.x, dy = pt.y - pos.y;
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
};


/** True when world point `pt` is on the implant's body (with a small screen tolerance). */
export function hitTestImplant(imp: any, pt: Point, k: number): boolean {
    const tol = 4 / k;
    const props = imp.properties ?? {};
    if (imp.type === 'rod') {
        // Test the drawn (smoothed) curve, not the straight chords (UI11-35)
        const pts: Point[] = props.points ?? [];
        if (pts.length < 2) return false;
        const hc = getHitCtx();
        hc.lineWidth = (props.diameter ?? 6) + 2 * tol;
        hc.lineCap = 'round';
        hc.lineJoin = 'round';
        return hc.isPointInStroke(rodPath(pts), pt.x, pt.y);
    }
    if (!imp.position) return false;
    const ctx = getHitCtx();
    ctx.lineWidth = tol * 2;
    if (imp.type === 'screw') {
        const l = toLocal(pt, imp.position, imp.angle);
        const path = screwPath(props.length, props.diameter || 6);
        return ctx.isPointInPath(path, l.x, l.y) || ctx.isPointInStroke(path, l.x, l.y);
    }
    if (imp.type === 'cage') {
        const l = toLocal(pt, imp.position, imp.angle);
        // window counts as part of the cage for grabbing
        return Math.abs(l.x) <= props.width / 2 + tol && Math.abs(l.y) <= (props.height + props.width * Math.tan(((props.wedgeAngle ?? 0) * Math.PI) / 180)) / 2 + tol;
    }
    if (imp.type === 'plate') {
        const l = toLocal(pt, imp.position, imp.angle + 90);
        return Math.abs(l.x) <= props.height / 2 + tol && Math.abs(l.y) <= props.width / 2 + tol;
    }
    return false;
}

// ── Handles ───────────────────────────────────────────────────────────────

export type HandleKind = 'move' | 'tip' | 'diameter' | 'height' | 'width' | 'lordosis' | 'vertex';

/**
 * Control points in world coordinates, with what each one edits (UI5-05):
 * screw  [head move, tip = length + angle, shank side = diameter];
 * cage   [centre move, top/bottom = height, front = length + angle,
 *         anterior-top corner = lordosis];
 * plate  [centre move, ends = length]; rod = its vertices.
 */
export function getImplantHandleSpecs(implant: Implant): { p: Point; kind: HandleKind }[] {
    const { position: pos, angle, properties } = implant;
    if (implant.type === 'rod') return (properties?.points || []).map((p: Point) => ({ p, kind: 'vertex' as const }));
    if (!pos || angle === undefined || !properties) return [];

    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const at = (along: number, across: number) => ({ x: pos.x + cos * along - sin * across, y: pos.y + sin * along + cos * across });

    if (implant.type === 'screw') {
        const L = properties.length, d = properties.diameter || 6;
        return [
            { p: pos, kind: 'move' },
            { p: at(L, 0), kind: 'tip' },
            { p: at(L * 0.5, -d / 2), kind: 'diameter' },
        ];
    }
    if (implant.type === 'cage') {
        const { width, height } = properties;
        const hAnt = height + width * Math.tan(((properties.wedgeAngle ?? 0) * Math.PI) / 180);
        return [
            { p: pos, kind: 'move' },
            { p: at(0, height / 2), kind: 'height' },
            { p: at(0, -height / 2), kind: 'height' },
            { p: at(width / 2, 0), kind: 'width' },
            { p: at(width / 2, -hAnt / 2), kind: 'lordosis' },
        ];
    }
    if (implant.type === 'plate') {
        const { height } = properties;
        return [
            { p: pos, kind: 'move' },
            { p: { x: pos.x - sin * (height / 2), y: pos.y + cos * (height / 2) }, kind: 'height' },
            { p: { x: pos.x + sin * (height / 2), y: pos.y - cos * (height / 2) }, kind: 'height' },
        ];
    }
    return [{ p: pos, kind: 'move' }];
}

/** Handle positions only (index order matches getImplantHandleSpecs). */
export function getImplantHandles(implant: Implant): Point[] {
    return getImplantHandleSpecs(implant).map((h) => h.p);
}

export function drawImplantHandles(ctx: CanvasRenderingContext2D, implant: Implant, k: number) {
    const specs = getImplantHandleSpecs(implant);
    if (specs.length === 0) return;
    ctx.save();
    ctx.lineWidth = 1.5 / k;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    specs.forEach(({ p, kind }) => {
        ctx.beginPath();
        if (kind === 'diameter' || kind === 'lordosis') {
            // Diamond = size handle across the implant
            const r = 5.5 / k;
            ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath();
            ctx.fillStyle = '#ffffff';
        } else {
            ctx.arc(p.x, p.y, (kind === 'move' ? 6 : 5) / k, 0, Math.PI * 2);
            ctx.fillStyle = kind === 'move' ? '#a16207' : IMPLANT_ANNOTATION;
        }
        ctx.fill();
        ctx.stroke();
    });
    ctx.restore();
}

/** Live size label next to the selected implant (mm when calibrated). */
export function drawImplantDimensions(ctx: CanvasRenderingContext2D, implant: Implant, k: number, mmPerPx: number | null) {
    const p = implant.properties ?? {};
    const f = (px: number) => (mmPerPx ? (px * mmPerPx).toFixed(1) : px.toFixed(0));
    const unit = mmPerPx ? 'mm' : 'px';
    const a = ((((implant.angle ?? 0) % 180) + 270) % 180) - 90; // −90…90 vs horizontal
    let text = '';
    let anchor: Point | null = null;
    if (implant.type === 'screw' && implant.position) {
        text = `${f(p.length)} × Ø${f(p.diameter || 6)} ${unit}
${Math.abs(a).toFixed(1)}°`;
        const rad = (implant.angle * Math.PI) / 180;
        anchor = { x: implant.position.x + Math.cos(rad) * p.length * 0.5 + 18 / k, y: implant.position.y + Math.sin(rad) * p.length * 0.5 + 18 / k };
    } else if (implant.type === 'cage' && implant.position) {
        text = `${f(p.width)} × ${f(p.height)} ${unit}
Lordosis ${(p.wedgeAngle ?? 0).toFixed(0)}°`;
        anchor = { x: implant.position.x + p.width / 2 + 20 / k, y: implant.position.y };
    } else if (implant.type === 'rod' && p.points?.length) {
        let len = 0;
        for (let i = 1; i < p.points.length; i++) len += Math.hypot(p.points[i].x - p.points[i - 1].x, p.points[i].y - p.points[i - 1].y);
        text = `Rod ${f(len)} ${unit} · Ø${f(p.diameter || 6)}`;
        const last = p.points[p.points.length - 1];
        anchor = { x: last.x + 16 / k, y: last.y };
    } else if (implant.type === 'plate' && implant.position) {
        text = `Plate ${f(p.height)} ${unit}`;
        anchor = { x: implant.position.x + 20 / k, y: implant.position.y };
    }
    if (text && anchor) drawLabel(ctx, text, anchor, k, IMPLANT_ANNOTATION);
}
