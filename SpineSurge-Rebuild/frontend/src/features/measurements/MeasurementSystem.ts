import type { Measurement } from '@/lib/canvas/CanvasManager';
import type { Point } from '@/lib/canvas/GeometryUtils';
import { drawMeasurementLabel } from '@/lib/canvas/CanvasUtils';
import { drawCobbAngle } from './quick/CobbAngle';
import { drawSVA } from './quick/SVA';
import { drawVBM } from './quick/VBM';
import { drawSpinalCurvature } from './quick/SpinalCurvatures';
import { drawPelvicParameters } from './quick/PelvicParams';
import { drawPILL } from './quick/PI_LL';
import { drawStenosis } from './pathology/Stenosis';
import { drawSpondylolisthesis } from './pathology/Spondylolisthesis';
import {
  drawPO, drawC7PL, drawCSVL, drawTS, drawAVT, drawSlope, drawCMC,
  drawTPA, drawSPA, drawSSA, drawSPi, drawCBVA, drawRVAD, drawITilt,
} from './deformity/DeformityTools';
import { drawWedgeOsteotomy, drawResection } from './planning/PlanningTools';

const shouldConvert = (m: Measurement, ratio: number | null, enabledAt: number | null): boolean => {
  if (!ratio) return false;
  if ((m.measurement as any)?.calibrateAllConverted) return true;
  if (typeof enabledAt === 'number' && typeof m.timestamp === 'number') return m.timestamp >= enabledAt;
  return false;
};

const applyCalibration = (result: unknown, ratio: number | null, convert: boolean): unknown => {
  if (typeof result !== 'string' || !ratio || !convert) return result;
  return result
    .replace(/(-?\d+(?:\.\d+)?)\s*px²/gi, (_, v) => `${(parseFloat(v) * ratio * ratio).toFixed(1)} mm²`)
    .replace(/(-?\d+(?:\.\d+)?)\s*px\b/gi, (_, v) => `${(parseFloat(v) * ratio).toFixed(1)} mm`);
};

export const MeasurementSystem = {
  draw(
    ctx: CanvasRenderingContext2D,
    m: Measurement,
    k: number,
    ratio: number | null,
    bounds?: { minY: number; maxY: number },
    calibrationEnabledAt: number | null = null,
  ) {
    const convert = shouldConvert(m, ratio, calibrationEnabledAt);
    const dm: Measurement = { ...m, result: applyCalibration(m.result, ratio, convert) as any };

    switch (dm.toolKey) {
      case 'cobb':
      case 'angle-4pt':
        drawCobbAngle(ctx, dm, k); break;
      case 'sva':
        drawSVA(ctx, dm, k, ratio); break;
      case 'vbm':
        drawVBM(ctx, dm, k, ratio); break;
      case 'cl': drawSpinalCurvature(ctx, dm, k, 'CL'); break;
      case 'tk': drawSpinalCurvature(ctx, dm, k, 'TK'); break;
      case 'll': drawSpinalCurvature(ctx, dm, k, 'LL'); break;
      case 'sc': drawSpinalCurvature(ctx, dm, k, 'Angle'); break;
      case 'cmc': drawCMC(ctx, dm, k); break;
      case 'pelvis': drawPelvicParameters(ctx, dm, k); break;
      case 'pi_ll': drawPILL(ctx, dm, k); break;
      case 'stenosis': drawStenosis(ctx, dm, k, ratio); break;
      case 'spondy': drawSpondylolisthesis(ctx, dm, k, ratio); break;
      case 'po': drawPO(ctx, dm, k); break;
      case 'c7pl': drawC7PL(ctx, dm, k, '#3b82f6', bounds); break;
      case 'csvl': drawCSVL(ctx, dm, k, '#f59e0b', bounds); break;
      case 'ts': drawTS(ctx, dm, k, ratio, '#ef4444', bounds); break;
      case 'avt': drawAVT(ctx, dm, k, ratio, '#a855f7', bounds); break;
      case 'slope': drawSlope(ctx, dm, k); break;
      case 'tpa': drawTPA(ctx, dm, k); break;
      case 'spa': drawSPA(ctx, dm, k); break;
      case 'ssa': drawSSA(ctx, dm, k); break;
      case 't1spi':
      case 't9spi':
      case 'odha': drawSPi(ctx, dm, k, '#0ea5e9', bounds); break;
      case 'cbva': drawCBVA(ctx, dm, k, '#f97316', bounds); break;
      case 'rvad': drawRVAD(ctx, dm, k); break;
      case 'itilt': drawITilt(ctx, dm, k); break;
      case 'ost-pso':
      case 'ost-spo':
      case 'ost-open': drawWedgeOsteotomy(ctx, dm, k); break;
      case 'ost-resect': drawResection(ctx, dm, k); break;
      case 'line': {
        if (dm.points.length < 2) break;
        const [p1, p2] = dm.points;
        ctx.save();
        ctx.strokeStyle = '#3b82f6'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 2 / k;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        [p1, p2].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill(); });
        const lineDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const lineLabel = (ratio && convert) ? `${(lineDist * ratio).toFixed(1)} mm` : `${lineDist.toFixed(1)} px`;
        const lineLp = dm.measurement?.labelPos || { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        drawMeasurementLabel(ctx, lineLabel, lineLp, k);
        ctx.restore(); break;
      }
      case 'circle': {
        if (dm.points.length < 2) break;
        const [c1, c2] = dm.points;
        const cx = (c1.x + c2.x) / 2, cy = (c1.y + c2.y) / 2;
        const cr = Math.hypot(c2.x - c1.x, c2.y - c1.y) / 2;
        ctx.save();
        ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2 / k;
        ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#a78bfa';
        [c1, c2].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill(); });
        const circLabel = (ratio && convert) ? `r: ${(cr * ratio).toFixed(1)} mm` : `r: ${cr.toFixed(1)} px`;
        drawMeasurementLabel(ctx, circLabel, { x: cx + cr + 8 / k, y: cy }, k);
        ctx.restore(); break;
      }
      case 'ellipse': {
        if (dm.points.length < 2) break;
        const [e1, e2] = dm.points;
        const ex = (e1.x + e2.x) / 2, ey = (e1.y + e2.y) / 2;
        const erx = Math.abs(e2.x - e1.x) / 2, ery = Math.abs(e2.y - e1.y) / 2;
        ctx.save();
        ctx.strokeStyle = '#34d399'; ctx.lineWidth = 2 / k;
        ctx.beginPath(); ctx.ellipse(ex, ey, Math.max(erx, 1), Math.max(ery, 1), 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#34d399';
        [e1, e2].forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill(); });
        ctx.restore(); break;
      }
      case 'polygon': {
        if (dm.points.length < 3) break;
        ctx.save();
        ctx.strokeStyle = '#fb923c'; ctx.fillStyle = 'rgba(251,146,60,0.12)'; ctx.lineWidth = 2 / k;
        ctx.beginPath();
        ctx.moveTo(dm.points[0].x, dm.points[0].y);
        dm.points.slice(1).forEach((p: Point) => ctx.lineTo(p.x, p.y));
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fb923c';
        dm.points.forEach((p: Point) => { ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill(); });
        if (dm.result) {
          const cx2 = dm.points.reduce((s: number, p: Point) => s + p.x, 0) / dm.points.length;
          const cy2 = dm.points.reduce((s: number, p: Point) => s + p.y, 0) / dm.points.length;
          drawMeasurementLabel(ctx, dm.result as string, { x: cx2, y: cy2 }, k);
        }
        ctx.restore(); break;
      }
      case 'pencil': {
        if (dm.points.length < 2) break;
        ctx.save();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2 / k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(dm.points[0].x, dm.points[0].y);
        dm.points.slice(1).forEach((p: Point) => ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.restore(); break;
      }
      case 'text': {
        if (!dm.points.length) break;
        const tp = dm.points[0];
        const txt = dm.measurement?.text || dm.result || '';
        ctx.save();
        ctx.font = `bold ${14 / k}px Inter, sans-serif`;
        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 4 / k;
        ctx.fillText(txt as string, tp.x, tp.y);
        ctx.restore(); break;
      }
      case 'angle-2pt': {
        if (dm.points.length < 2) break;
        ctx.save();
        ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2 / k;
        const [a1, a2] = dm.points;
        ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
        const ang2 = Math.atan2(a2.y - a1.y, a2.x - a1.x) * 180 / Math.PI;
        drawMeasurementLabel(ctx, `${Math.abs(ang2).toFixed(1)}°`, { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 - 10 / k }, k);
        ctx.restore(); break;
      }
      case 'angle-3pt': {
        if (dm.points.length < 3) break;
        ctx.save();
        ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2 / k;
        const [b1, b2, b3] = dm.points;
        ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(b3.x, b3.y); ctx.stroke();
        const va = { x: b1.x - b2.x, y: b1.y - b2.y };
        const vb = { x: b3.x - b2.x, y: b3.y - b2.y };
        const dot3 = va.x * vb.x + va.y * vb.y;
        const ang3 = Math.acos(dot3 / (Math.hypot(va.x, va.y) * Math.hypot(vb.x, vb.y))) * 180 / Math.PI;
        drawMeasurementLabel(ctx, `${ang3.toFixed(1)}°`, { x: b2.x + 10 / k, y: b2.y - 10 / k }, k);
        ctx.restore(); break;
      }
      default: {
        ctx.save();
        ctx.strokeStyle = '#00e5ff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 2 / k;
        if (dm.points.length > 1) {
          ctx.beginPath(); ctx.moveTo(dm.points[0].x, dm.points[0].y);
          dm.points.slice(1).forEach((p: Point) => ctx.lineTo(p.x, p.y));
          ctx.stroke();
        }
        dm.points.forEach((p: Point) => { ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill(); });
        if (dm.result && dm.points.length >= 1) {
          const lp = dm.measurement?.labelPos || (dm.points.length >= 2
            ? { x: (dm.points[0].x + dm.points[1].x) / 2, y: (dm.points[0].y + dm.points[1].y) / 2 }
            : { x: dm.points[0].x + 20 / k, y: dm.points[0].y - 20 / k });
          drawMeasurementLabel(ctx, dm.result as string, lp, k);
        }
        ctx.restore(); break;
      }
    }
  },
};
