import { Point, getDistance } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawMeasurementLabel, drawPoint } from "@/lib/canvas/CanvasUtils";

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

export function drawSpondylolisthesis(ctx: CanvasRenderingContext2D, m: Measurement, k: number, pixelToMm: number | null, color: string = '#f59e0b') {
    const points = m.points;
    if (points.length < 4) return;

    const [A, B, C, D] = points;
    const result = calculateSpondylolisthesis(points, pixelToMm);
    if (!result) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / k;
    ctx.fillStyle = color;

    // Draw AB line (superior vertebra)
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();

    // Draw CD line (inferior vertebra)
    ctx.beginPath();
    ctx.moveTo(C.x, C.y);
    ctx.lineTo(D.x, D.y);
    ctx.stroke();

    // Draw perpendicular from B to P
    ctx.strokeStyle = '#ef4444'; // Red for slip distance
    ctx.setLineDash([5 / k, 5 / k]);
    ctx.beginPath();
    ctx.moveTo(B.x, B.y);
    ctx.lineTo(result.pointP.x, result.pointP.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw PD (the actual slip distance measurement)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3 / k;
    ctx.beginPath();
    ctx.moveTo(result.pointP.x, result.pointP.y);
    ctx.lineTo(D.x, D.y);
    ctx.stroke();

    // Draw points
    ctx.fillStyle = color;
    [A, B, C, D].forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2);
        ctx.fill();

        // Label points
        ctx.fillStyle = '#fff';
        ctx.font = `${12 / k}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(['A', 'B', 'C', 'D'][i], p.x, p.y - 8 / k);
        ctx.fillStyle = color;
    });

    // Draw point P
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(result.pointP.x, result.pointP.y, 4 / k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `${12 / k}px Arial`;
    ctx.fillText('P', result.pointP.x, result.pointP.y - 8 / k);

    // Format result string
    const resultString = formatSpondylolisthesisResult(result, pixelToMm);

    // Update measurement result
    m.result = resultString;

    // Draw label
    const labelPos = m.measurement?.labelPos || {
        x: (A.x + B.x + C.x + D.x) / 4 + 40 / k,
        y: (A.y + B.y + C.y + D.y) / 4
    };

    drawMeasurementLabel(ctx, resultString, labelPos, k, color);

    ctx.restore();
}
