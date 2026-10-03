import { Point, getMidpoint } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawLabel, drawPoints, strokeLine, toolColor } from "@/lib/canvas/annotationStyle";

export function calculatePO(points: Point[]) {
    if (points.length < 2) return null;
    const [p1, p2] = points;
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return { angle };
}

export function drawPO(ctx: CanvasRenderingContext2D, m: Measurement, k: number) {
    if (m.points.length < 2) return;
    drawTiltLine(ctx, m, k, 'PO');
}

/** Two-point line with a dashed horizontal reference (PO, slope, instrumented tilt). */
export function drawTiltLine(ctx: CanvasRenderingContext2D, m: Measurement, k: number, prefix: string) {
    const [p1, p2] = m.points;
    const color = toolColor(m.toolKey);
    const left = p1.x < p2.x ? p1 : p2;
    const right = p1.x < p2.x ? p2 : p1;
    strokeLine(ctx, left, { x: right.x, y: left.y }, k, color, true);
    strokeLine(ctx, p1, p2, k, color);
    drawPoints(ctx, [p1, p2], k, color);

    const data = calculatePO(m.points);
    if (!data) return;
    const levelPrefix = m.measurement?.level ? `${m.measurement.level}\n---\n` : '';
    m.result = `${prefix}: ${data.angle.toFixed(1)}°`;
    drawLabel(ctx, levelPrefix + m.result, m.measurement?.labelPos || getMidpoint(p1, p2), k, color);
}

export function drawC7PL(ctx: CanvasRenderingContext2D, m: Measurement, k: number, bounds?: { minY: number, maxY: number }) {
    if (m.points.length < 1) return;
    const p1 = m.points[0];
    const color = toolColor(m.toolKey);
    strokeLine(ctx, { x: p1.x, y: bounds?.minY ?? p1.y - 2000 }, { x: p1.x, y: bounds?.maxY ?? p1.y + 2000 }, k, color);
    drawPoints(ctx, [p1], k, color);
    m.result = "C7PL is displayed";
    drawLabel(ctx, "C7PL", m.measurement?.labelPos || { x: p1.x + 20 / k, y: p1.y }, k, color);
}

export function drawCSVL(ctx: CanvasRenderingContext2D, m: Measurement, k: number, bounds?: { minY: number, maxY: number }) {
    if (m.points.length < 2) return;
    const [p1, p2] = m.points;
    const mid = getMidpoint(p1, p2);
    const color = toolColor(m.toolKey);
    strokeLine(ctx, { x: mid.x, y: bounds?.minY ?? mid.y - 2000 }, { x: mid.x, y: bounds?.maxY ?? mid.y + 2000 }, k, color, true);
    strokeLine(ctx, p1, p2, k, color);
    drawPoints(ctx, [p1, p2], k, color);
    m.result = "CSVL is displayed";
    drawLabel(ctx, "CSVL", m.measurement?.labelPos || { x: mid.x + 20 / k, y: mid.y }, k, color);
}

export function calculateTS(points: Point[], pixelToMm: number | null) {
    if (points.length < 3) return null;
    const c7 = points[0];
    const s1Mid = getMidpoint(points[1], points[2]);
    const dx = Math.abs(c7.x - s1Mid.x);

    let resultString = '';
    if (pixelToMm) {
        resultString = `TS: ${(dx * pixelToMm).toFixed(1)} mm`;
    } else {
        resultString = `TS: ${dx.toFixed(1)} px`;
    }
    return { dx, resultString };
}

export function drawTS(ctx: CanvasRenderingContext2D, m: Measurement, k: number, pixelToMm: number | null, bounds?: { minY: number, maxY: number }, labelTitle: string = 'TS') {
    const points = m.points;
    if (points.length < 3) return;
    const [c7, s1_1, s1_2] = points;
    const s1Mid = getMidpoint(s1_1, s1_2);
    const color = toolColor(m.toolKey);
    const minY = bounds?.minY ?? Math.min(c7.y, s1Mid.y) - 100 / k;
    const maxY = bounds?.maxY ?? Math.max(c7.y, s1Mid.y) + 100 / k;

    // CSVL (dashed), S1 endplate, and the horizontal offset from C7 / apex.
    strokeLine(ctx, { x: s1Mid.x, y: minY }, { x: s1Mid.x, y: maxY }, k, color, true);
    strokeLine(ctx, s1_1, s1_2, k, color);
    strokeLine(ctx, c7, { x: s1Mid.x, y: c7.y }, k, color);
    drawPoints(ctx, points, k, color);

    const data = calculateTS(points, pixelToMm);
    if (data) {
        m.result = labelTitle !== 'TS' ? data.resultString.replace('TS:', `${labelTitle}:`) : data.resultString;
        drawLabel(ctx, m.result, m.measurement?.labelPos || { x: (c7.x + s1Mid.x) / 2, y: c7.y - 15 / k }, k, color);
    }
}

export function calculateAVT(points: Point[], pixelToMm: number | null) {
    return calculateTS(points, pixelToMm);
}

export function drawAVT(ctx: CanvasRenderingContext2D, m: Measurement, k: number, pixelToMm: number | null, bounds?: { minY: number, maxY: number }) {
    drawTS(ctx, m, k, pixelToMm, bounds, 'AVT');
}
