import { Point, getDistance, endplateAngleDeg } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawLabel, drawPoints, strokePolyline, toolColor } from "@/lib/canvas/annotationStyle";

export type VBMMode = 'ap' | 'lateral';

export const VBM_FULL_FORMS: Record<string, string> = {
    'ANT': 'Anterior Height',
    'POST': 'Posterior Height',
    'WEDGE': 'Wedge Angle',
    'SUP': 'Superior Endplate',
    'INF': 'Inferior Endplate',
    'DEPTH': 'Body Depth',
    'LEFT': 'Left Height',
    'RIGHT': 'Right Height',
    'WIDTH': 'Body Width'
};

export function calculateVBM(points: Point[], mode: VBMMode, ratio: number | null) {
    if (points.length < 4) return null;

    const p0 = points[0]; // Sup-Post (Lat) or Sup-Left (AP)
    const p1 = points[1]; // Sup-Ant (Lat) or Sup-Right (AP)
    const p2 = points[2]; // Inf-Ant (Lat) or Inf-Right (AP)
    const p3 = points[3]; // Inf-Post (Lat) or Inf-Left (AP)

    const unit = ratio ? 'mm' : 'px';
    const k = ratio || 1;

    const results: string[] = [];

    // Superior Endplate Length/Width
    const supLen = getDistance(p0, p1);
    // Inferior Endplate Length/Width
    const infLen = getDistance(p2, p3);

    if (mode === 'lateral') {
        const postH = getDistance(p0, p3);
        const antH = getDistance(p1, p2);

        // Wedge Angle: angle between p0-p1 and p3-p2
        const wedgeAngle = endplateAngleDeg(p0, p1, p3, p2);

        results.push(`ANT: ${(antH * k).toFixed(1)}${unit}`);
        results.push(`POST: ${(postH * k).toFixed(1)}${unit}`);
        results.push(`WEDGE: ${wedgeAngle.toFixed(1)}°`);
        results.push(`SUP: ${(supLen * k).toFixed(1)}${unit}`);
        results.push(`INF: ${(infLen * k).toFixed(1)}${unit}`);
        results.push(`DEPTH: ${((supLen + infLen) / 2 * k).toFixed(1)}${unit}`);
    } else {
        const leftH = getDistance(p0, p3);
        const rightH = getDistance(p1, p2);

        results.push(`LEFT: ${(leftH * k).toFixed(1)}${unit}`);
        results.push(`RIGHT: ${(rightH * k).toFixed(1)}${unit}`);
        results.push(`SUP: ${(supLen * k).toFixed(1)}${unit}`);
        results.push(`INF: ${(infLen * k).toFixed(1)}${unit}`);
        results.push(`WIDTH: ${((supLen + infLen) / 2 * k).toFixed(1)}${unit}`);
    }

    return results.join('\n');
}

export function drawVBM(ctx: CanvasRenderingContext2D, m: Measurement, k: number, _ratio: number | null) {
    const points = m.points;
    if (points.length < 1) return;
    const color = toolColor(m.toolKey);

    strokePolyline(ctx, points, k, color, { closed: points.length === 4, fill: points.length === 4 });

    if (points.length === 4 && m.result) {
        const levelHeader = m.measurement?.level ? `${m.measurement.level.toUpperCase()}
---
` : "";
        const centerY = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;
        const labelPos = m.measurement?.labelPos || {
            x: Math.max(points[0].x, points[1].x, points[2].x, points[3].x) + 45 / k,
            y: centerY
        };
        drawLabel(ctx, levelHeader + m.result, labelPos, k, color);
    }
    drawPoints(ctx, points, k, color);
}
