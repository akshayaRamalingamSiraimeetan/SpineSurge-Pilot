import { Point, getPolygonCenter } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawLabel, drawPoints, strokePolyline, toolColor } from "@/lib/canvas/annotationStyle";

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

export function drawStenosis(ctx: CanvasRenderingContext2D, m: Measurement, k: number, pixelToMm: number | null) {
    const points = m.points;
    if (points.length < 3) return;
    const color = toolColor(m.toolKey);
    strokePolyline(ctx, points, k, color, { closed: true, fill: true });
    drawPoints(ctx, points, k, color);

    const calc = calculateStenosisArea(points, pixelToMm);
    if (calc) m.result = `Area: ${calc.resultString}`;
    drawLabel(ctx, m.result || "Stenosis", m.measurement?.labelPos || getPolygonCenter(points), k, color);
}
