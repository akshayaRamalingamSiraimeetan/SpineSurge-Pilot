import { Point, getMidpoint } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawMeasurementLabel } from "@/lib/canvas/CanvasUtils";

export function calculatePO(points: Point[]) {
    if (points.length < 2) return null;
    const [p1, p2] = points;
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return { angle };
}

export function drawPO(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#10b981') {
    const points = m.points;
    if (points.length < 2) return;
    const [p1, p2] = points;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    const leftPoint = p1.x < p2.x ? p1 : p2;
    const rightPoint = p1.x < p2.x ? p2 : p1;

    ctx.setLineDash([5 / k, 5 / k]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.moveTo(leftPoint.x, leftPoint.y);
    ctx.lineTo(rightPoint.x, leftPoint.y);
    ctx.stroke();

    ctx.fillStyle = color;
    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2);
        ctx.fill();
    });

    const data = calculatePO(points);
    if (data) {
        m.result = `PO: ${data.angle.toFixed(1)}°`;
        const labelPos = m.measurement?.labelPos || getMidpoint(p1, p2);
        drawMeasurementLabel(ctx, m.result, labelPos, k, color);
    }
    ctx.restore();
}

export function drawC7PL(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#3b82f6', bounds?: { minY: number, maxY: number }) {
    const points = m.points;
    if (points.length < 1) return;
    const p1 = points[0];

    const minY = bounds?.minY ?? -10000;
    const maxY = bounds?.maxY ?? 10000;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;

    ctx.beginPath();
    ctx.moveTo(p1.x, minY);
    ctx.lineTo(p1.x, maxY);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 5 / k, 0, Math.PI * 2);
    ctx.fill();

    m.result = "C7PL is displayed";
    const labelPos = m.measurement?.labelPos || { x: p1.x + 20 / k, y: p1.y };
    drawMeasurementLabel(ctx, "C7PL", labelPos, k, color);
    ctx.restore();
}

export function drawCSVL(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#f59e0b', bounds?: { minY: number, maxY: number }) {
    const points = m.points;
    if (points.length < 2) return;
    const [p1, p2] = points;
    const mid = getMidpoint(p1, p2);

    const minY = bounds?.minY ?? -10000;
    const maxY = bounds?.maxY ?? 10000;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.setLineDash([5 / k, 5 / k]);
    ctx.lineWidth = 2 / k;

    ctx.beginPath();
    ctx.moveTo(mid.x, minY);
    ctx.lineTo(mid.x, maxY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.lineWidth = 1.5 / k;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    ctx.fillStyle = '#eab308';
    [p1, p2].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2);
        ctx.fill();
    });

    m.result = "CSVL is displayed";
    const labelPos = m.measurement?.labelPos || { x: mid.x + 20 / k, y: mid.y };
    drawMeasurementLabel(ctx, "CSVL", labelPos, k, color);
    ctx.restore();
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

export function drawTS(ctx: CanvasRenderingContext2D, m: Measurement, k: number, pixelToMm: number | null, color: string = '#ef4444', bounds?: { minY: number, maxY: number }, labelTitle: string = 'TS') {
    const points = m.points;
    if (points.length < 3) return;
    const [c7, s1_1, s1_2] = points;
    const s1Mid = getMidpoint(s1_1, s1_2);

    const minY = bounds?.minY ?? -10000;
    const maxY = bounds?.maxY ?? 10000;

    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.setLineDash([5 / k, 5 / k]);
    ctx.lineWidth = 1.5 / k;
    ctx.beginPath();
    ctx.moveTo(s1Mid.x, minY);
    ctx.lineTo(s1Mid.x, maxY);
    ctx.stroke();

    ctx.strokeStyle = '#3b82f6';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(c7.x, minY);
    ctx.lineTo(c7.x, maxY);
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    [s1_1, s1_2].forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
    });

    ctx.fillStyle = '#3b82f6';
    ctx.beginPath(); ctx.arc(c7.x, c7.y, 4 / k, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;
    ctx.beginPath();
    ctx.moveTo(c7.x, c7.y);
    ctx.lineTo(s1Mid.x, c7.y);
    ctx.stroke();

    const data = calculateTS(points, pixelToMm);
    if (data) {
        m.result = data.resultString;
        if (labelTitle !== 'TS') {
            m.result = m.result.replace('TS:', `${labelTitle}:`);
        }
        const labelPos = m.measurement?.labelPos || { x: (c7.x + s1Mid.x) / 2, y: c7.y - 15 / k };
        drawMeasurementLabel(ctx, m.result, labelPos, k, color);
    }
    ctx.restore();
}

export function calculateAVT(points: Point[], pixelToMm: number | null) {
    return calculateTS(points, pixelToMm);
}

export function drawAVT(ctx: CanvasRenderingContext2D, m: Measurement, k: number, pixelToMm: number | null, color: string = '#3b82f6', bounds?: { minY: number, maxY: number }) {
    drawTS(ctx, m, k, pixelToMm, color, bounds, 'AVT');
}
