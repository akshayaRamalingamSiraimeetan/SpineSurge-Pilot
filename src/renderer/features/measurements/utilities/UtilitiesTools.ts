import { Measurement } from "@/lib/canvas/CanvasManager";
import { getDistance, getMidpoint, getPolylineLength, getPolygonArea, getPolygonPerimeter } from "@/lib/canvas/GeometryUtils";
import { drawMeasurementLabel } from "@/lib/canvas/CanvasUtils";

export const drawPencil = (
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number,
    ratio: number | null
) => {
    if (m.points.length < 2) return;

    ctx.save();
    ctx.strokeStyle = '#facc15'; // Yellowish for pencil
    ctx.lineWidth = 2 / k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(m.points[0].x, m.points[0].y);
    for (let i = 1; i < m.points.length; i++) {
        ctx.lineTo(m.points[i].x, m.points[i].y);
    }
    ctx.stroke();

    // Calculate length
    let length = getPolylineLength(m.points);
    let label = `${length.toFixed(1)} px`;

    if (ratio) {
        label = `${(length * ratio).toFixed(1)} mm`; // or cm depending on ratio
    }

    // Only update result if it changed significantly relative to precision, but here we just render
    // Ideally, result should be updated in logic, but if we do it only on render, it won't persist well in list.
    // NOTE: CanvasManager update logic usually handles "result" update. 
    // Here we assume "result" is passed in correct or we calculate generic one for display. 
    // If m.result is not set, we can display calculated one.

    // Draw label at end
    const lastPoint = m.points[m.points.length - 1];
    drawMeasurementLabel(ctx, label, { x: lastPoint.x + 10 / k, y: lastPoint.y }, k);

    ctx.restore();
};

export const drawText = (
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number
) => {
    if (!m.points.length) return;
    const anchor = m.points[0];
    const labelPos = (m.measurement as any)?.labelPos || { x: anchor.x + 40 / k, y: anchor.y - 40 / k };
    const text = m.result || "Text";

    ctx.save();

    // 1. Draw Anchor Circle
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1 / k;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 4 / k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 2. Draw Dotted Leader Line
    ctx.setLineDash([5 / k, 5 / k]);
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(labelPos.x, labelPos.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Draw Text Box
    ctx.font = `bold ${14 / k}px Inter, sans-serif`;
    const padding = 6 / k;
    const width = ctx.measureText(text).width;
    const height = 18 / k;

    // Draw background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; // Dark slate background
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5 / k;

    // Draw box centered or at position? Let's use labelPos as top-left or center.
    // Usually easier if labelPos is the center of the text box for dragging.
    const bx = labelPos.x - (width / 2 + padding);
    const by = labelPos.y - (height / 2 + padding);

    ctx.beginPath();
    if ((ctx as any).roundRect) {
        (ctx as any).roundRect(bx, by, width + padding * 2, height + padding * 2, 4 / k);
    } else {
        ctx.rect(bx, by, width + padding * 2, height + padding * 2);
    }
    ctx.fill();
    ctx.stroke();

    // Draw text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, labelPos.x, labelPos.y);

    ctx.restore();
};

export const drawCircle = (
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number,
    ratio: number | null
) => {
    if (m.points.length < 2) return;
    const p1 = m.points[0];
    const p2 = m.points[1];

    const center = getMidpoint(p1, p2);
    const radius = getDistance(p1, p2) / 2;

    ctx.save();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2 / k;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Stats
    const diameterPx = radius * 2;
    const areaPx = Math.PI * radius * radius;
    const perimeterPx = 2 * Math.PI * radius;

    let dLabel = `${diameterPx.toFixed(1)} px`;
    let aLabel = `${areaPx.toFixed(0)} px²`;
    let pLabel = `${perimeterPx.toFixed(1)} px`;

    if (ratio) {
        dLabel = `${(diameterPx * ratio).toFixed(1)} mm`;
        aLabel = `${(areaPx * ratio * ratio).toFixed(1)} mm²`;
        pLabel = `${(perimeterPx * ratio).toFixed(1)} mm`;
    }

    // Display
    drawMeasurementLabel(ctx, `D: ${dLabel}`, { x: center.x, y: center.y - 20 / k }, k);
    drawMeasurementLabel(ctx, `A: ${aLabel}`, { x: center.x, y: center.y }, k);
    drawMeasurementLabel(ctx, `P: ${pLabel}`, { x: center.x, y: center.y + 20 / k }, k);

    ctx.restore();
};

export const drawEllipse = (
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number,
    ratio: number | null
) => {
    if (m.points.length < 2) return;
    // Assuming 2 points define bounding box diagonal
    const p1 = m.points[0];
    const p2 = m.points[1];

    const center = getMidpoint(p1, p2);
    const rx = Math.abs(p1.x - p2.x) / 2;
    const ry = Math.abs(p1.y - p2.y) / 2;

    ctx.save();
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 2 / k;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Approx Area/Perimeter
    const areaPx = Math.PI * rx * ry;
    // Ramanujan approximation for perimeter
    const h = Math.pow(rx - ry, 2) / Math.pow(rx + ry, 2);
    const perimeterPx = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));

    let aLabel = `${areaPx.toFixed(0)} px²`;
    let pLabel = `${perimeterPx.toFixed(1)} px`;

    if (ratio) {
        aLabel = `${(areaPx * ratio * ratio).toFixed(1)} mm²`;
        pLabel = `${(perimeterPx * ratio).toFixed(1)} mm`;
    }

    drawMeasurementLabel(ctx, `Area: ${aLabel}`, { x: center.x, y: center.y - 10 / k }, k);
    drawMeasurementLabel(ctx, `Perim: ${pLabel}`, { x: center.x, y: center.y + 10 / k }, k);

    ctx.restore();
};

export const drawPolygon = (
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number,
    ratio: number | null
) => {
    if (m.points.length < 3) {
        // Just draw lines if not enough points
        if (m.points.length > 0) {
            ctx.save();
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2 / k;
            ctx.beginPath();
            ctx.moveTo(m.points[0].x, m.points[0].y);
            m.points.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.stroke();
            ctx.restore();
        }
        return;
    }

    ctx.save();
    ctx.strokeStyle = '#10b981';
    ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
    ctx.lineWidth = 2 / k;

    ctx.beginPath();
    ctx.moveTo(m.points[0].x, m.points[0].y);
    for (let i = 1; i < m.points.length; i++) {
        ctx.lineTo(m.points[i].x, m.points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const areaPx = getPolygonArea(m.points);
    const perimeterPx = getPolygonPerimeter(m.points);
    const center = {
        x: m.points.reduce((sum, p) => sum + p.x, 0) / m.points.length,
        y: m.points.reduce((sum, p) => sum + p.y, 0) / m.points.length
    };

    let aLabel = `${areaPx.toFixed(0)} px²`;
    let pLabel = `${perimeterPx.toFixed(1)} px`;

    if (ratio) {
        aLabel = `${(areaPx * ratio * ratio).toFixed(1)} mm²`;
        pLabel = `${(perimeterPx * ratio).toFixed(1)} mm`;
    }

    drawMeasurementLabel(ctx, `A: ${aLabel}`, { x: center.x, y: center.y - 10 / k }, k);
    drawMeasurementLabel(ctx, `P: ${pLabel}`, { x: center.x, y: center.y + 10 / k }, k);

    ctx.restore();
};
