import { Point, getPolygonCenter } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawMeasurementLabel, drawPoint } from "@/lib/canvas/CanvasUtils";

export function calculateStenosisArea(points: Point[], pixelToMm: number | null) {
    if (points.length < 3) return null;

    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    area = Math.abs(area) / 2;

    let resultString = '';
    if (pixelToMm) {
        const areaMm2 = area * pixelToMm * pixelToMm;
        // If area is large, maybe cm2? 100mm2 = 1cm2
        if (areaMm2 > 100) {
            resultString = `${(areaMm2 / 100).toFixed(2)} cm²`;
        } else {
            resultString = `${areaMm2.toFixed(1)} mm²`;
        }
    } else {
        resultString = `${area.toFixed(0)} px²`;
    }

    return { area, resultString };
}

export function drawStenosis(ctx: CanvasRenderingContext2D, m: Measurement, k: number, pixelToMm: number | null, color: string = '#ef4444') {
    const points = m.points;
    if (points.length < 3) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;
    ctx.fillStyle = color + '33'; // 20% opacity (hex 33)

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fill();

    // Draw area value at center or centroid
    const centroid = getPolygonCenter(points);

    // Calculate if not already
    const calc = calculateStenosisArea(points, pixelToMm);
    if (calc) {
        m.result = `Area: ${calc.resultString}`;
    }

    const labelPos = m.measurement?.labelPos || centroid;

    // Special Stenosis Styling? Maybe Red background?
    // Using standard label for consistency
    drawMeasurementLabel(ctx, m.result || "Stenosis", labelPos, k, color);

    // Draw vertices
    ctx.fillStyle = '#fff';
    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 / k, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.restore();
}
