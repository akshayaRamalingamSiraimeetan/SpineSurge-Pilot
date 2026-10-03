import { Measurement } from "@/lib/canvas/CanvasManager";
import { drawLabel, drawPoints, strokeLine, strokePolyline, toolColor } from "@/lib/canvas/annotationStyle";
import { drawCobbAngle } from "./quick/CobbAngle";
import { drawSVA } from "./quick/SVA";
import { drawVBM } from "./quick/VBM";
import { drawSpinalCurvature } from "./quick/SpinalCurvatures";
import { drawPelvicParameters } from "./quick/PelvicParams";
import { drawPILL } from "./quick/PI_LL";
import { drawStenosis } from "./pathology/Stenosis";
import { drawSpondylolisthesis } from "./pathology/Spondylolisthesis";
import { drawPO, drawC7PL, drawCSVL, drawTS, drawAVT, drawSlope, drawCMC, drawTPA, drawSPA, drawSSA, drawSPi, drawCBVA, drawRVAD, drawITilt } from "./deformity/DeformityTools";
import { drawWedgeOsteotomy, drawResection } from "./planning/PlanningTools";

import { drawPencil, drawText, drawCircle, drawEllipse, drawPolygon, drawGenericAngle } from "./utilities/UtilitiesTools";

const shouldConvertMeasurement = (m: Measurement, ratio: number | null, calibrationEnabledAt: number | null): boolean => {
    if (!ratio) return false;
    if ((m.measurement as any)?.calibrateAllConverted) return true;
    if (typeof calibrationEnabledAt === 'number' && typeof m.timestamp === 'number') {
        return m.timestamp >= calibrationEnabledAt;
    }
    return false;
};

const formatResultWithCalibration = (result: unknown, ratio: number | null, shouldConvert: boolean): unknown => {
    if (typeof result !== 'string' || !ratio || !shouldConvert) {
        return result;
    }

    const withAreaConverted = result.replace(/(-?\d+(?:\.\d+)?)\s*px²/gi, (_, raw: string) => {
        const value = Number.parseFloat(raw);
        if (!Number.isFinite(value)) {
            return _;
        }
        return `${(value * ratio * ratio).toFixed(1)} mm²`;
    });

    return withAreaConverted.replace(/(-?\d+(?:\.\d+)?)\s*px\b/gi, (_, raw: string) => {
        const value = Number.parseFloat(raw);
        if (!Number.isFinite(value)) {
            return _;
        }
        return `${(value * ratio).toFixed(1)} mm`;
    });
};

export const MeasurementSystem = {
    draw: (
        ctx: CanvasRenderingContext2D,
        m: Measurement,
        k: number,
        ratio: number | null,
        bounds?: { minY: number, maxY: number },
        calibrationEnabledAt: number | null = null,
    ) => {
        const shouldConvert = shouldConvertMeasurement(m, ratio, calibrationEnabledAt);
        const displayMeasurement: Measurement = {
            ...m,
            result: formatResultWithCalibration(m.result, ratio, shouldConvert) as any,
        };

        switch (displayMeasurement.toolKey) {
            case 'cobb':
            case 'angle-4pt': // Added mapping
                drawCobbAngle(ctx, displayMeasurement, k);
                break;
            case 'pencil':
                drawPencil(ctx, displayMeasurement, k, ratio);
                break;
            case 'text':
                drawText(ctx, displayMeasurement, k);
                break;
            case 'circle':
                drawCircle(ctx, displayMeasurement, k, ratio);
                break;
            case 'ellipse':
                drawEllipse(ctx, displayMeasurement, k, ratio);
                break;
            case 'polygon':
                drawPolygon(ctx, displayMeasurement, k, ratio);
                break;
            case 'sva':
                drawSVA(ctx, displayMeasurement, k, ratio);
                break;
            case 'vbm':
                drawVBM(ctx, displayMeasurement, k, ratio);
                break;
            case 'cl':
                drawSpinalCurvature(ctx, displayMeasurement, k, 'CL');
                break;
            case 'tk':
                drawSpinalCurvature(ctx, displayMeasurement, k, 'TK');
                break;
            case 'll':
                drawSpinalCurvature(ctx, displayMeasurement, k, 'LL');
                break;
            case 'sc':
                drawSpinalCurvature(ctx, displayMeasurement, k, 'Angle');
                break;
            case 'pelvis':
                drawPelvicParameters(ctx, displayMeasurement, k);
                break;
            case 'pi_ll':
                drawPILL(ctx, displayMeasurement, k);
                break;
            case 'stenosis':
                drawStenosis(ctx, displayMeasurement, k, ratio);
                break;
            case 'spondy':
                drawSpondylolisthesis(ctx, displayMeasurement, k, ratio);
                break;
            case 'po':
                drawPO(ctx, displayMeasurement, k);
                break;
            case 'c7pl':
                drawC7PL(ctx, displayMeasurement, k, bounds);
                break;
            case 'csvl':
                drawCSVL(ctx, displayMeasurement, k, bounds);
                break;
            case 'ts':
                drawTS(ctx, displayMeasurement, k, ratio, bounds);
                break;
            case 'avt':
                drawAVT(ctx, displayMeasurement, k, ratio, bounds);
                break;
            case 'slope':
                drawSlope(ctx, displayMeasurement, k);
                break;
            case 'cmc':
                drawCMC(ctx, displayMeasurement, k);
                break;
            case 'tpa':
                drawTPA(ctx, displayMeasurement, k);
                break;
            case 'spa':
                drawSPA(ctx, displayMeasurement, k);
                break;
            case 'ssa':
                drawSSA(ctx, displayMeasurement, k);
                break;
            case 't1spi':
            case 't9spi':
            case 'odha':
                drawSPi(ctx, displayMeasurement, k, bounds);
                break;
            case 'cbva':
                drawCBVA(ctx, displayMeasurement, k, bounds);
                break;
            case 'rvad':
                drawRVAD(ctx, displayMeasurement, k);
                break;
            case 'itilt':
                drawITilt(ctx, displayMeasurement, k);
                break;
            case 'line': {
                if (displayMeasurement.points.length < 2) break;
                const [p1, p2] = displayMeasurement.points;
                const color = toolColor('line');
                strokeLine(ctx, p1, p2, k, color);
                drawPoints(ctx, [p1, p2], k, color);
                const distancePx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                const labelText = (ratio && shouldConvert)
                    ? `${(distancePx * ratio).toFixed(1)} mm`
                    : `${distancePx.toFixed(1)} px`;
                const labelPos = displayMeasurement.measurement?.labelPos || { x: (p1.x + p2.x) / 2 + 12 / k, y: (p1.y + p2.y) / 2 };
                drawLabel(ctx, labelText, labelPos, k, color);
                break;
            }
            case 'angle-2pt':
            case 'angle-3pt':
                drawGenericAngle(ctx, displayMeasurement, k);
                break;
            case 'ost-pso':
            case 'ost-spo':
            case 'ost-open':
                drawWedgeOsteotomy(ctx, displayMeasurement, k);
                break;
            case 'ost-resect':
                drawResection(ctx, displayMeasurement, k);
                break;
            default: {
                // Simple point / polyline (e.g. 'point' markers)
                const pts = displayMeasurement.points;
                const color = toolColor(displayMeasurement.toolKey);
                strokePolyline(ctx, pts, k, color);
                drawPoints(ctx, pts, k, color);
                if (displayMeasurement.result && pts.length >= 1) {
                    const labelPos = displayMeasurement.measurement?.labelPos || (pts.length >= 2
                        ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
                        : { x: pts[0].x + 20 / k, y: pts[0].y - 20 / k });
                    drawLabel(ctx, displayMeasurement.result as string, labelPos, k, color);
                }
                break;
            }
        }
        // Curvature tools compute their drag handle while drawing; keep it on the
        // real measurement so it can be grabbed (BUGS CV-14).
        const hp = (displayMeasurement.measurement as any)?.handlePos;
        if (hp) {
            if (!m.measurement) m.measurement = {};
            (m.measurement as any).handlePos = hp;
        }
    }
};
