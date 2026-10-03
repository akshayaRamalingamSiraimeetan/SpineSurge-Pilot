import { Measurement } from "@/lib/canvas/CanvasManager";
import { getDistance, getMidpoint, getPolylineLength, getPolygonArea, getPolygonPerimeter } from "@/lib/canvas/GeometryUtils";
import { drawLabel, drawPoint, drawPoints, strokeCircle, strokeLine, strokePolyline, toolColor, STYLE, withAlpha } from "@/lib/canvas/annotationStyle";

export const drawPencil = (
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number,
    ratio: number | null
) => {
    if (m.points.length < 2) return;
    const color = toolColor(m.toolKey);
    strokePolyline(ctx, m.points, k, color);
    const length = getPolylineLength(m.points);
    const label = ratio ? `${(length * ratio).toFixed(1)} mm` : `${length.toFixed(1)} px`;
    const last = m.points[m.points.length - 1];
    drawLabel(ctx, label, m.measurement?.labelPos || { x: last.x + 10 / k, y: last.y }, k, color);
};

export const drawText = (
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number
) => {
    if (!m.points.length) return;
    const color = toolColor(m.toolKey);
    const anchor = m.points[0];
    const labelPos = (m.measurement as any)?.labelPos || { x: anchor.x + 40 / k, y: anchor.y - 40 / k };
    strokeLine(ctx, anchor, labelPos, k, color, true);
    drawPoint(ctx, anchor, k, color);
    drawLabel(ctx, m.result || "Text", labelPos, k, color);
};

export const drawCircle = (
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number,
    ratio: number | null
) => {
    if (m.points.length < 2) return;
    const color = toolColor(m.toolKey);
    const center = getMidpoint(m.points[0], m.points[1]);
    const radius = getDistance(m.points[0], m.points[1]) / 2;
    strokeCircle(ctx, center, radius, k, color);
    drawPoints(ctx, m.points.slice(0, 2), k, color);

    const d = radius * 2, a = Math.PI * radius * radius, per = 2 * Math.PI * radius;
    const text = ratio
        ? `D: ${(d * ratio).toFixed(1)} mm\nA: ${(a * ratio * ratio).toFixed(1)} mm²\nP: ${(per * ratio).toFixed(1)} mm`
        : `D: ${d.toFixed(1)} px\nA: ${a.toFixed(0)} px²\nP: ${per.toFixed(1)} px`;
    drawLabel(ctx, text, m.measurement?.labelPos || { x: center.x + radius + 12 / k, y: center.y }, k, color);
};

export const drawEllipse = (
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number,
    ratio: number | null
) => {
    if (m.points.length < 2) return;
    const color = toolColor(m.toolKey);
    const [p1, p2] = m.points;
    const center = getMidpoint(p1, p2);
    const rx = Math.abs(p1.x - p2.x) / 2;
    const ry = Math.abs(p1.y - p2.y) / 2;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = STYLE.line / k;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawPoints(ctx, [p1, p2], k, color);

    const areaPx = Math.PI * rx * ry;
    const h = Math.pow(rx - ry, 2) / Math.pow(rx + ry || 1, 2);
    const perimeterPx = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    const text = ratio
        ? `Area: ${(areaPx * ratio * ratio).toFixed(1)} mm²\nPerim: ${(perimeterPx * ratio).toFixed(1)} mm`
        : `Area: ${areaPx.toFixed(0)} px²\nPerim: ${perimeterPx.toFixed(1)} px`;
    drawLabel(ctx, text, m.measurement?.labelPos || { x: center.x + rx + 12 / k, y: center.y }, k, color);
};

export const drawPolygon = (
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number,
    ratio: number | null
) => {
    if (m.points.length < 2) return;
    const color = toolColor(m.toolKey);
    const closed = m.points.length >= 3;
    strokePolyline(ctx, m.points, k, color, { closed, fill: closed });
    drawPoints(ctx, m.points, k, color);
    if (!closed) return;

    const areaPx = getPolygonArea(m.points);
    const perimeterPx = getPolygonPerimeter(m.points);
    const center = {
        x: m.points.reduce((sum, p) => sum + p.x, 0) / m.points.length,
        y: m.points.reduce((sum, p) => sum + p.y, 0) / m.points.length
    };
    const text = ratio
        ? `A: ${(areaPx * ratio * ratio).toFixed(1)} mm²\nP: ${(perimeterPx * ratio).toFixed(1)} mm`
        : `A: ${areaPx.toFixed(0)} px²\nP: ${perimeterPx.toFixed(1)} px`;
    drawLabel(ctx, text, m.measurement?.labelPos || center, k, color);
};

/** 2-point angle (vs horizontal) and 3-point angle (vertex = 2nd point). */
export const drawGenericAngle = (
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number
) => {
    const pts = m.points;
    if (pts.length < 2) return;
    const color = toolColor(m.toolKey);
    if (m.toolKey === 'angle-3pt' && pts.length >= 3) {
        const [a, v, b] = pts;
        strokeLine(ctx, v, a, k, color);
        strokeLine(ctx, v, b, k, color);
        const r = Math.min(getDistance(v, a), getDistance(v, b), 60 / k) * 0.6;
        drawArcBetween(ctx, v, r, Math.atan2(a.y - v.y, a.x - v.x), Math.atan2(b.y - v.y, b.x - v.x), k, color);
    } else {
        const [a, b] = pts;
        const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a;
        strokeLine(ctx, left, { x: right.x, y: left.y }, k, color, true);
        strokeLine(ctx, a, b, k, color);
    }
    drawPoints(ctx, pts, k, color);
    if (m.result) {
        const anchor = pts[Math.floor(pts.length / 2)];
        drawLabel(ctx, String(m.result), m.measurement?.labelPos || { x: anchor.x + 16 / k, y: anchor.y - 16 / k }, k, color);
    }
};

const drawArcBetween = (ctx: CanvasRenderingContext2D, c: { x: number; y: number }, r: number, a0: number, a1: number, k: number, color: string) => {
    let diff = a1 - a0;
    while (diff <= -Math.PI) diff += 2 * Math.PI;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = STYLE.arc / k;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, a0, a0 + diff, diff < 0);
    ctx.stroke();
    ctx.fillStyle = withAlpha(color, STYLE.fillAlpha);
    ctx.lineTo(c.x, c.y);
    ctx.fill();
    ctx.restore();
};
