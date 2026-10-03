import { Point } from "./GeometryUtils";
import { drawLabel, FAMILY_COLORS } from "./annotationStyle";

/** Uniform measurement label (see annotationStyle.drawLabel). `color` = family accent. */
export function drawMeasurementLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    pos: Point,
    k: number,
    color: string = FAMILY_COLORS.generic
) {
    drawLabel(ctx, text, pos, k, color);
}
