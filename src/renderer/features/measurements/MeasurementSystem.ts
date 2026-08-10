import { Measurement } from "@/lib/canvas/CanvasManager";
import { Point } from "@/lib/canvas/GeometryUtils";
import { drawMeasurementLabel } from "@/lib/canvas/CanvasUtils";
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

import { drawPencil, drawText, drawCircle, drawEllipse, drawPolygon } from "./utilities/UtilitiesTools";

const shouldConvertMeasurement = (m: Measurement, ratio: number | null, calibrationEnabledAt: number | null): boolean => {
    return !!ratio;
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
                drawC7PL(ctx, displayMeasurement, k, '#3b82f6', bounds);
                break;
            case 'csvl':
                drawCSVL(ctx, displayMeasurement, k, '#f59e0b', bounds);
                break;
            case 'ts':
                drawTS(ctx, displayMeasurement, k, ratio, '#ef4444', bounds);
                break;
            case 'avt':
                drawAVT(ctx, displayMeasurement, k, ratio, '#a855f7', bounds);
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
                drawSPi(ctx, displayMeasurement, k, '#0ea5e9', bounds);
                break;
            case 'cbva':
                drawCBVA(ctx, displayMeasurement, k, '#f97316', bounds);
                break;
            case 'rvad':
                drawRVAD(ctx, displayMeasurement, k);
                break;
            case 'itilt':
                drawITilt(ctx, displayMeasurement, k);
                break;
            case 'line':
                ctx.save();
                ctx.strokeStyle = '#3b82f6';
                ctx.fillStyle = '#ffffff';
                ctx.lineWidth = 2 / k;

                if (displayMeasurement.points.length >= 2) {
                    const p1 = displayMeasurement.points[0];
                    const p2 = displayMeasurement.points[1];

                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();

                    [p1, p2].forEach((p) => {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2);
                        ctx.fill();
                    });

                    const distancePx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                    const labelText = (ratio && shouldConvert)
                        ? `distance: ${(distancePx * ratio).toFixed(1)} mm`
                        : `distance: ${distancePx.toFixed(1)} px`;
                    const labelPos = displayMeasurement.measurement?.labelPos || { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                    drawMeasurementLabel(ctx, labelText, labelPos, k);
                }

                ctx.restore();
                break;
            case 'ost-pso':
            case 'ost-spo':
            case 'ost-open':
                drawWedgeOsteotomy(ctx, displayMeasurement, k);
                break;
            case 'ost-resect':
                drawResection(ctx, displayMeasurement, k);
                break;
            default:
                // Fallback for simple point/line
                ctx.save();
                const color = displayMeasurement.toolKey === 'line' ? '#3b82f6' : '#00e5ff';
                ctx.strokeStyle = color;
                ctx.fillStyle = '#ffffff';
                ctx.lineWidth = 2 / k;

                if (displayMeasurement.points.length > 1) {
                    ctx.beginPath();
                    ctx.moveTo(displayMeasurement.points[0].x, displayMeasurement.points[0].y);
                    for (let i = 1; i < displayMeasurement.points.length; i++) {
                        ctx.lineTo(displayMeasurement.points[i].x, displayMeasurement.points[i].y);
                    }
                    ctx.stroke();
                }

                displayMeasurement.points.forEach((p: Point) => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2);
                    ctx.fill();
                });

                if (displayMeasurement.result && displayMeasurement.points.length >= 1) {
                    const labelPos = displayMeasurement.measurement?.labelPos || (displayMeasurement.points.length >= 2
                        ? { x: (displayMeasurement.points[0].x + displayMeasurement.points[1].x) / 2, y: (displayMeasurement.points[0].y + displayMeasurement.points[1].y) / 2 }
                        : { x: displayMeasurement.points[0].x + 20 / k, y: displayMeasurement.points[0].y - 20 / k });

                    drawMeasurementLabel(ctx, displayMeasurement.result as string, labelPos, k);
                }
                ctx.restore();
                break;
        }
    }
};
