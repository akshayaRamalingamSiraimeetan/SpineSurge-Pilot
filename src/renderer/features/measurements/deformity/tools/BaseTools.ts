import { Point, getMidpoint, getDistance } from "@/lib/canvas/GeometryUtils";
import { drawArc, drawPoint, strokeCircle, strokeLine } from "@/lib/canvas/annotationStyle";

/** Short-way angle arc in the tool colour (kept for older call sites). */
export function drawAngleArc(ctx: CanvasRenderingContext2D, center: Point, radius: number, startAngle: number, endAngle: number, k: number, color: string) {
    drawArc(ctx, center, radius, startAngle, endAngle, k, color);
}

export function getHipAxisCenter(points: Point[]) {
    if (points.length < 4) return null;
    const fh1 = getMidpoint(points[0], points[1]);
    const fh2 = getMidpoint(points[2], points[3]);
    return getMidpoint(fh1, fh2);
}

/**
 * Femoral heads from diameter points [0,1] and [2,3]: circles, centres and the
 * dashed hip axis between them. Returns the centres that exist.
 */
export function drawFemoralHeads(ctx: CanvasRenderingContext2D, points: Point[], k: number, color: string) {
    const centers: Point[] = [];
    for (const i of [0, 2]) {
        if (points.length < i + 2) break;
        const c = getMidpoint(points[i], points[i + 1]);
        strokeCircle(ctx, c, getDistance(points[i], points[i + 1]) / 2, k, color);
        centers.push(c);
    }
    if (centers.length === 2) strokeLine(ctx, centers[0], centers[1], k, color, true);
    centers.forEach((c) => drawPoint(ctx, c, k, color, 0.8));
    return centers;
}
