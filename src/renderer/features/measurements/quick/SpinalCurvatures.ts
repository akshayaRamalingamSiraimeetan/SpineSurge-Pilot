import { Point, getMidpoint, getLineLinesIntersection, getDistance } from "@/lib/canvas/GeometryUtils";
import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawMeasurementLabel } from "@/lib/canvas/CanvasUtils";

export function calculateSpinalCurvature(points: Point[]) {
    if (points.length < 4) return { angle: 0, intersection: null };

    const p1 = points[0];
    const p2 = points[1];
    const p3 = points[2];
    const p4 = points[3];

    const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const angle2 = Math.atan2(p4.y - p3.y, p4.x - p3.x);

    let diff = Math.abs(angle1 - angle2) * (180 / Math.PI);
    if (diff > 90) diff = 180 - diff;

    // To find the intersection of the endplate lines (not their perpendiculars)
    const intersection = getLineLinesIntersection(p1, p2, p3, p4);

    return {
        angle: diff,
        intersection
    };
}

export function drawSpinalCurvature(ctx: CanvasRenderingContext2D, m: Measurement, k: number, labelPrefix: string, color: string = '#60a5fa') {
    const points = m.points;
    if (points.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 / k;
    ctx.fillStyle = color;

    // Line 1 (Superior Endplate)
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();

    points.slice(0, 2).forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 / k;
        ctx.stroke();
    });

    if (points.length < 4) return;

    // Line 2 (Inferior Endplate)
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 / k;
    ctx.beginPath();
    ctx.moveTo(points[2].x, points[2].y);
    ctx.lineTo(points[3].x, points[3].y);
    ctx.stroke();

    points.slice(2, 4).forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 / k;
        ctx.stroke();
    });

    const { angle, intersection } = calculateSpinalCurvature(points);
    m.result = `${labelPrefix}: ${angle.toFixed(1)}°`;

    const mid1 = getMidpoint(points[0], points[1]);
    const mid2 = getMidpoint(points[2], points[3]);

    // Draw Curvature Arc
    // We want an arc that represents the spinal curvature between the two midpoints.
    // If we have an intersection, we can use it to draw an indicative arc.
    // But since the lines are endplates, the intersection might be far away.
    // Let's draw a nice Bezier curve between the midpoints.

    ctx.save();
    ctx.setLineDash([4 / k, 4 / k]);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(mid1.x, mid1.y);

    // Calculate a control point for the curve
    // We can use the intersection or a midpoint-based offset
    let cp = { x: (mid1.x + mid2.x) / 2, y: (mid1.y + mid2.y) / 2 };

    if (intersection) {
        // Use a point between the midpoints and the intersection to "bend" the curve
        // This gives a visual representation of lordosis/kyphosis
        // We'll use a draggable offset eventually, but for now let's calculate one.
        const midPoint = { x: (mid1.x + mid2.x) / 2, y: (mid1.y + mid2.y) / 2 };
        const dx = mid2.x - mid1.x;
        const dy = mid2.y - mid1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Offset direction should be perpendicular to the chord
        // For spine, usually offsets towards the convexity
        const curveOffset = (m.measurement as any)?.curveOffset || 20 / k;

        // Direction perpendicular to mid1-mid2
        const perpX = -dy / dist;
        const perpY = dx / dist;

        cp = {
            x: midPoint.x + perpX * curveOffset,
            y: midPoint.y + perpY * curveOffset
        };
    }

    ctx.quadraticCurveTo(cp.x, cp.y, mid2.x, mid2.y);
    ctx.stroke();

    // Draw the "Curvature Handle" - if this tool is CL/TK/LL, maybe allow dragging this?
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cp.x, cp.y, 5 / k, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();

    // Label
    const labelPos = m.measurement?.labelPos || {
        x: cp.x + 30 / k,
        y: cp.y
    };

    const levelText = m.measurement?.level ? `\n${m.measurement.level}` : '';
    const finalText = m.result + levelText;

    drawMeasurementLabel(ctx, finalText, labelPos, k, '#ffffff');

    // Store handle position for interaction detection
    if (!m.measurement) m.measurement = {};
    (m.measurement as any).handlePos = cp;
}
