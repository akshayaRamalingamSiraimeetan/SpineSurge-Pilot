import { Point, getMidpoint, getDistance } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawMeasurementLabel } from "@/lib/canvas/CanvasUtils";
import { calculatePelvicParameters } from "./PelvicParams";
import { calculateCobbAngle } from "./CobbAngle";

export function calculatePILL(points: Point[]) {
    // We need 8 points:
    // 0-1: FH1
    // 2-3: FH2
    // 4-5: S1
    // 6-7: L1
    if (points.length < 8) return null;

    // 1. Calculate PI
    // We pass the first 6 points to pelvic calcs
    const pelvicPoints = points.slice(0, 6);
    const pelvicData = calculatePelvicParameters(pelvicPoints);
    if (!pelvicData) return null;

    const { pi } = pelvicData;

    // 2. Calculate LL (Cobb Angle between L1 and S1)
    // L1 is points 6-7. S1 is points 4-5.
    // Cobb calculator expects [p1, p2, p3, p4] for two lines.
    const cobbPoints = [points[6], points[7], points[4], points[5]];
    const cobbData = calculateCobbAngle(cobbPoints);

    const ll = cobbData.angle;
    const mismatch = pi - ll;

    return {
        pi,
        ll,
        mismatch,
        pelvicData,
        cobbData
    };
}

export function drawPILL(ctx: CanvasRenderingContext2D, m: Measurement, k: number, color: string = '#10b981') {
    const points = m.points;
    if (points.length < 2) return;

    // --- Draw Pelvic Parts (Simplified) ---
    // Reuse the general style but custom drawing to hide PT/SS

    const circleColor = '#06b6d4';
    const drawCircle = (p1: Point, p2: Point) => {
        const center = getMidpoint(p1, p2);
        const radius = getDistance(p1, p2) / 2;
        ctx.save();
        ctx.strokeStyle = circleColor;
        ctx.lineWidth = 1.5 / k;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = circleColor;
        ctx.beginPath();
        ctx.arc(center.x, center.y, 3 / k, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return { center };
    };

    // Helper for acute arc
    const drawAcuteArc = (center: Point, radius: number, angleStart: number, angleEnd: number, color: string) => {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 / k;
        let diff = angleEnd - angleStart;
        while (diff <= -Math.PI) diff += 2 * Math.PI;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        const counterClockwise = diff < 0;
        ctx.arc(center.x, center.y, radius, angleStart, angleEnd, counterClockwise);
        ctx.stroke();
        ctx.restore();
    };

    // Draw FH1
    const c1 = drawCircle(points[0], points[1]);

    if (points.length < 4) return;
    // Draw FH2
    const c2 = drawCircle(points[2], points[3]);

    // Connect Centers (Hip Axis)
    ctx.save();
    ctx.strokeStyle = circleColor;
    ctx.setLineDash([4 / k, 4 / k]);
    ctx.lineWidth = 1.5 / k;
    ctx.beginPath();
    ctx.moveTo(c1.center.x, c1.center.y);
    ctx.lineTo(c2.center.x, c2.center.y);
    ctx.stroke();
    ctx.restore();

    if (points.length < 6) return;
    // Draw S1
    // The point order inside calculatePelvicParameters handles the facing logic (Anterior/Posterior).
    // But we just draw lines here.
    const s1_p1 = points[4];
    const s1_p2 = points[5];

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5 / k;
    ctx.beginPath();
    ctx.moveTo(s1_p1.x, s1_p1.y);
    ctx.lineTo(s1_p2.x, s1_p2.y);
    ctx.stroke();
    [s1_p1, s1_p2].forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
    });

    if (points.length < 8) return;
    // Draw L1
    const l1_p1 = points[6];
    const l1_p2 = points[7];
    ctx.beginPath();
    ctx.moveTo(l1_p1.x, l1_p1.y);
    ctx.lineTo(l1_p2.x, l1_p2.y);
    ctx.stroke();
    [l1_p1, l1_p2].forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
    });


    // --- Calculations & Visuals ---
    const data = calculatePILL(points);
    if (!data) return;

    const { pi, ll, mismatch, pelvicData, cobbData } = data;
    const { s1_center, hipAxisCenter, angle_plate } = pelvicData;

    // 1. Draw PI Visuals (Red Arc)
    // Re-use logic from PelvicParams relative to auto-facing
    // We need the Perpendicular Vector used there.
    // The calculatePelvicParameters returns 'angle_plate'.
    // We can reconstruct the perpendicular.

    // Perpendicular Logic from PelvicParams:
    // Check dot product against S->H vector.
    const vSH = { x: hipAxisCenter.x - s1_center.x, y: hipAxisCenter.y - s1_center.y };
    // Plate normal candidates
    const dx = Math.cos(angle_plate);
    const dy = Math.sin(angle_plate);
    let p1x = -dy, p1y = dx;
    // Check dot
    if (p1x * vSH.x + p1y * vSH.y < 0) {
        p1x = -p1x; p1y = -p1y;
    }

    // Draw Perp Line (faint)
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.setLineDash([4 / k, 4 / k]);
    ctx.lineWidth = 1 / k;
    const perpLen = 80 / k;
    ctx.beginPath();
    ctx.moveTo(s1_center.x, s1_center.y);
    ctx.lineTo(s1_center.x + p1x * perpLen, s1_center.y + p1y * perpLen);
    ctx.stroke();
    ctx.restore();

    // Draw HS Line (Hip -> S1)
    ctx.save();
    ctx.strokeStyle = '#f59e0b'; // Amber for Hip Axis
    ctx.lineWidth = 2 / k;
    ctx.beginPath();
    ctx.moveTo(hipAxisCenter.x, hipAxisCenter.y);
    ctx.lineTo(s1_center.x, s1_center.y);
    ctx.stroke();
    ctx.restore();

    // Draw PI Arc (Red) at S1
    const anglePerp = Math.atan2(p1y, p1x);
    const angleSH = Math.atan2(vSH.y, vSH.x);
    drawAcuteArc(s1_center, 45 / k, anglePerp, angleSH, '#ef4444');


    // 2. Draw LL Visuals (Cobb Style)
    if (cobbData.intersection) {
        const intersection = cobbData.intersection;
        // Midpoints of S1 and L1 lines
        const midS1 = getMidpoint(points[4], points[5]);
        const midL1 = getMidpoint(points[6], points[7]);

        ctx.save();
        ctx.strokeStyle = '#ef4444'; // Red for Cobb lines usually, or Green? User said "neat combination".
        // Let's use faint red dash.
        ctx.setLineDash([5 / k, 5 / k]);
        ctx.lineWidth = 1 / k;
        ctx.beginPath();
        ctx.moveTo(midS1.x, midS1.y);
        ctx.lineTo(intersection.x, intersection.y);
        ctx.moveTo(midL1.x, midL1.y);
        ctx.lineTo(intersection.x, intersection.y);
        ctx.stroke();
        ctx.restore();
    }


    // --- Label ---
    const levelPrefix = m.measurement?.level ? `${m.measurement.level}\n---\n` : '';
    m.result = `PI: ${pi.toFixed(1)}°\nLL: ${ll.toFixed(1)}°\nPI-LL: ${mismatch.toFixed(1)}°`;

    const labelPos = m.measurement?.labelPos || {
        x: s1_center.x + 80 / k,
        y: s1_center.y - 50 / k
    };

    drawMeasurementLabel(ctx, levelPrefix + m.result, labelPos, k, color);
}
