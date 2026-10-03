import { Point, getDistance } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawLabel, drawPoint, drawPoints, drawPointTag, strokeLine, toolColor } from "@/lib/canvas/annotationStyle";

export interface SpondylolisthesisResult {
    slipDistance: number;
    slipAngle: number;
    slipPercentage: number;
    grade: string;
    pointP: Point; // Perpendicular intersection point
    AB_length: number;
}

export function formatSpondylolisthesisResult(result: SpondylolisthesisResult, pixelToMm: number | null): string {
    if (pixelToMm) {
        const sdMm = result.slipDistance * pixelToMm;
        return `SD: ${sdMm.toFixed(1)}mm\nSP: ${result.slipPercentage.toFixed(1)}%\nSA: ${result.slipAngle.toFixed(1)}°\nGrade: ${result.grade}`;
    } else {
        return `SD: ${result.slipDistance.toFixed(1)}px\nSP: ${result.slipPercentage.toFixed(1)}%\nSA: ${result.slipAngle.toFixed(1)}°\nGrade: ${result.grade}`;
    }
}

export function calculateSpondylolisthesis(points: Point[], pixelToMm: number | null): SpondylolisthesisResult | null {
    if (points.length < 4) return null;

    const [A, B, C, D] = points;

    // Calculate AB length (superior vertebra posterior line)
    const AB_length = getDistance(A, B);

    // Calculate line CD (inferior vertebra posterior line)
    // Direction vector of CD
    const CD_dx = D.x - C.x;
    const CD_dy = D.y - C.y;
    const CD_length = Math.sqrt(CD_dx * CD_dx + CD_dy * CD_dy);

    // Normalized direction of CD
    const CD_nx = CD_dx / CD_length;
    const CD_ny = CD_dy / CD_length;

    // Vector from C to B
    const CB_x = B.x - C.x;
    const CB_y = B.y - C.y;

    // Project CB onto CD to find point P (perpendicular foot)
    const projection = CB_x * CD_nx + CB_y * CD_ny;
    const P: Point = {
        x: C.x + projection * CD_nx,
        y: C.y + projection * CD_ny
    };

    // Slip Distance = distance from P to D
    const slipDistance = getDistance(P, D);

    // Slip Percentage = (SD / AB) × 100
    const slipPercentage = (slipDistance / AB_length) * 100;

    // Slip Angle = angle between AB and CD
    const AB_dx = B.x - A.x;
    const AB_dy = B.y - A.y;
    const dotProduct = AB_dx * CD_dx + AB_dy * CD_dy;
    const AB_len = Math.sqrt(AB_dx * AB_dx + AB_dy * AB_dy);
    const cosAngle = dotProduct / (AB_len * CD_length);
    const slipAngle = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

    // Determine grade
    let grade = "";
    if (slipPercentage < 25) grade = "Grade I";
    else if (slipPercentage < 50) grade = "Grade II";
    else if (slipPercentage < 75) grade = "Grade III";
    else if (slipPercentage < 100) grade = "Grade IV";
    else grade = "Grade V (Spondyloptosis)";

    return {
        slipDistance,
        slipAngle,
        slipPercentage,
        grade,
        pointP: P,
        AB_length
    };
}

export function drawSpondylolisthesis(ctx: CanvasRenderingContext2D, m: Measurement, k: number, pixelToMm: number | null) {
    const points = m.points;
    if (points.length < 4) return;
    const [A, B, C, D] = points;
    const result = calculateSpondylolisthesis(points, pixelToMm);
    if (!result) return;
    const color = toolColor(m.toolKey);

    strokeLine(ctx, A, B, k, color);
    strokeLine(ctx, C, D, k, color);
    strokeLine(ctx, B, result.pointP, k, color, true);   // perpendicular foot
    strokeLine(ctx, result.pointP, D, k, color);         // slip distance
    drawPoints(ctx, [A, B, C, D], k, color);
    drawPoint(ctx, result.pointP, k, color, 0.8);
    ['A', 'B', 'C', 'D'].forEach((t, i) => drawPointTag(ctx, t, points[i], k));
    drawPointTag(ctx, 'P', result.pointP, k);

    m.result = formatSpondylolisthesisResult(result, pixelToMm);
    const labelPos = m.measurement?.labelPos || {
        x: (A.x + B.x + C.x + D.x) / 4 + 40 / k,
        y: (A.y + B.y + C.y + D.y) / 4
    };
    drawLabel(ctx, m.result, labelPos, k, color);
}
