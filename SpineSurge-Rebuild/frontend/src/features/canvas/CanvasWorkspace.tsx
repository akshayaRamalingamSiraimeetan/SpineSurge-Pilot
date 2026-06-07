/* CanvasWorkspace — single-canvas measurement + planning workspace.
 *
 * Architecture: one <canvas> draws the radiograph, committed measurements (via MeasurementSystem),
 * and the live in-progress preview. CanvasManager owns fragment state and undo history. The Zustand
 * workspace store owns tool selection; committed measurements are synced back to it for the right
 * panel. This mirrors the old desktop app's CanvasWorkspace pattern, adapted to the rebuild's stack. */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent } from 'react';
import { CanvasManager } from '@/lib/canvas/CanvasManager';
import type { Measurement } from '@/lib/canvas/CanvasManager';
import type { Point } from '@/lib/canvas/GeometryUtils';
import {
  getDistance, getMidpoint, getPolygonArea, getPolygonPerimeter,
  getHipAxisCenter,
} from '@/lib/canvas/GeometryUtils';
import { MeasurementSystem } from '@/features/measurements/MeasurementSystem';
import { TOOL_SPECS } from '@/features/measurements/toolRegistry';
import { calculateCobbAngle } from '@/features/measurements/quick/CobbAngle';
import { calculateSVA } from '@/features/measurements/quick/SVA';
import { calculatePILL } from '@/features/measurements/quick/PI_LL';
import { calculatePelvicParameters } from '@/features/measurements/quick/PelvicParams';
import { calculateVBM } from '@/features/measurements/quick/VBM';
import { calculateStenosisArea } from '@/features/measurements/pathology/Stenosis';
import {
  calculateSpondylolisthesis, formatSpondylolisthesisResult,
} from '@/features/measurements/pathology/Spondylolisthesis';
import {
  calculatePO, calculateTS, calculateAVT, calculateCMC,
  calculateTPA, calculateSPA, calculateSSA, calculateSPi, calculateCBVA, calculateRVAD,
} from '@/features/measurements/deformity/DeformityTools';
import { useWorkspaceStore } from '@/lib/store/workspace';
import type { Measurement as StoreMeasurement } from '@/lib/store/workspace';

// ── Tool mapping: store abbr → canvas toolKey used by MeasurementSystem ──────
const TO_CANVAS_KEY: Record<string, string> = {
  'Cobb': 'cobb', 'SVA': 'sva', 'PI-LL': 'pi_ll', 'Pelvis': 'pelvis',
  'TK': 'tk', 'LL': 'll', 'CL': 'cl', 'CMC': 'cmc', 'VBM': 'vbm',
  'Canal Area': 'stenosis', 'Spondylolisthesis': 'spondy',
  'TS': 'ts', 'AVT': 'avt', 'PO': 'po', 'RVAD': 'rvad',
  'TPA': 'tpa', 'SSA': 'ssa', 'SPA': 'spa',
  'T1SPi': 't1spi', 'T9SPi': 't9spi', 'ODHA': 'odha', 'CBVA': 'cbva',
  'Line': 'line', 'Pen': 'pencil', 'Annotation': 'text',
  'Circle': 'circle', 'Ellipse': 'ellipse', 'Polygon': 'polygon',
  '2 Point Angle': 'angle-2pt', '3 Point Angle': 'angle-3pt',
};

// Points required per tool (matches toolRegistry). Polygon / CMC are open-ended.
const POINTS_NEEDED: Record<string, number> = {
  cobb: 4, sva: 2, pi_ll: 8, pelvis: 6, tk: 4, ll: 4, cl: 4, cmc: 4, vbm: 4,
  stenosis: 3, spondy: 4, ts: 3, avt: 3, po: 2, rvad: 6,
  tpa: 7, ssa: 3, spa: 7, t1spi: 5, t9spi: 5, odha: 5, cbva: 2,
  line: 2, circle: 2, ellipse: 2, 'angle-2pt': 2, 'angle-3pt': 3,
};

// Stroke colours per tool group
const TOOL_COLOR: Record<string, string> = {
  cobb: '#3b82f6', tk: '#3b82f6', ll: '#3b82f6', cl: '#3b82f6',
  sva: '#3b82f6', line: '#3b82f6',
  pi_ll: '#10b981', pelvis: '#10b981', po: '#10b981',
  tpa: '#10b981', spa: '#10b981', ssa: '#10b981', t1spi: '#0ea5e9', t9spi: '#0ea5e9', odha: '#0ea5e9',
  ts: '#ef4444', avt: '#a855f7', cbva: '#f97316', rvad: '#3b82f6',
  cmc: '#dc2626', stenosis: '#8b5cf6', spondy: '#f59e0b',
};
const toolColor = (tk: string) => TOOL_COLOR[tk] ?? '#3b82f6';

interface ViewTransform { k: number; x: number; y: number }

interface Props {
  /** Show calibration tool controls inline (Assessment passes true). */
  showCalibration?: boolean;
}

export function CanvasWorkspace(_props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<CanvasManager | null>(null);
  const vt = useRef<ViewTransform>({ k: 1, x: 0, y: 0 });
  const mousePos = useRef<Point>({ x: 0, y: 0 });
  const panStart = useRef<{ x: number; y: number } | null>(null);
  const imgCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const [ready, setReady] = useState(false);
  const [tempPoints, setTempPoints] = useState<Point[]>([]);
  const [isPanning, setIsPanning] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibPoints, setCalibPoints] = useState<Point[]>([]);
  const [calibMmInput, setCalibMmInput] = useState('');
  const [pendingCalibPx, setPendingCalibPx] = useState<number | null>(null);

  // ── Zustand store reads ────────────────────────────────────────────────────
  const activeTool = useWorkspaceStore(s => s.activeTool);
  const setActiveTool = useWorkspaceStore(s => s.setActiveTool);
  const imageSrc = useWorkspaceStore(s => s.imageSrc);
  const setImageInStore = useWorkspaceStore(s => s.setImage);
  const calibration = useWorkspaceStore(s => s.calibration);
  const setCalibration = useWorkspaceStore(s => s.setCalibration);
  const loadMeasurements = useWorkspaceStore(s => s.loadMeasurements);
  const storeMeasurements = useWorkspaceStore(s => s.measurements);
  const undoCanvasTrigger = useWorkspaceStore(s => (s as any).undoCanvasTrigger ?? 0);
  const redoCanvasTrigger = useWorkspaceStore(s => (s as any).redoCanvasTrigger ?? 0);
  const lastUndoRef = useRef(undoCanvasTrigger);
  const lastRedoRef = useRef(redoCanvasTrigger);

  // Active canvas tool key (old format) derived from store abbreviation
  const canvasToolKey = activeTool ? (TO_CANVAS_KEY[activeTool] ?? null) : null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getImage = useCallback((url: string) => {
    if (imgCache.current.has(url)) return imgCache.current.get(url)!;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    imgCache.current.set(url, img);
    return img;
  }, []);

  const worldPos = useCallback((clientX: number, clientY: number): Point => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const { k, x, y } = vt.current;
    return { x: (clientX - r.left - x) / k, y: (clientY - r.top - y) / k };
  }, []);

  // ── Sync canvas measurements → Zustand store (right panel) ───────────────
  const syncToStore = useCallback((measurements: Measurement[]) => {
    const mapped: StoreMeasurement[] = measurements
      .filter(m => !m.measurement?.isCalibration)
      .map(m => ({
        id: m.id,
        tool: m.toolKey,
        name: m.measurement?.name ?? m.toolKey,
        points: m.points,
        rows: [{ label: m.measurement?.name ?? m.toolKey, display: typeof m.result === 'string' ? m.result : '' }],
        timestamp: m.timestamp ?? Date.now(),
      }));
    loadMeasurements(mapped);
  }, [loadMeasurements]);

  // ── CanvasManager init ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!imageSrc) { setReady(false); return; }
    let cancelled = false;
    const mgr = new CanvasManager();
    mgr.initialize(imageSrc, []).then(state => {
      if (cancelled) return;
      managerRef.current = mgr;
      const el = containerRef.current;
      if (el && state.data.fragments[0]) {
        const f = state.data.fragments[0];
        const scale = Math.min(el.clientWidth / f.imageWidth, el.clientHeight / f.imageHeight) * 0.9;
        vt.current = {
          k: scale,
          x: (el.clientWidth - f.imageWidth * scale) / 2,
          y: (el.clientHeight - f.imageHeight * scale) / 2,
        };
      }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [imageSrc]);

  // ── Undo / Redo triggered from store (ViewerDock buttons) ─────────────────
  useEffect(() => {
    if (undoCanvasTrigger > lastUndoRef.current && managerRef.current && ready) {
      const s = managerRef.current.undo();
      if (s) syncToStore(s.data.measurements);
    }
    lastUndoRef.current = undoCanvasTrigger;
  }, [undoCanvasTrigger, ready, syncToStore]);

  useEffect(() => {
    if (redoCanvasTrigger > lastRedoRef.current && managerRef.current && ready) {
      const s = managerRef.current.redo();
      if (s) syncToStore(s.data.measurements);
    }
    lastRedoRef.current = redoCanvasTrigger;
  }, [redoCanvasTrigger, ready, syncToStore]);

  // Sync deletions from store (right panel × button) back to canvas
  useEffect(() => {
    if (!managerRef.current || !ready) return;
    const canvasMeasurements = managerRef.current.current?.data.measurements ?? [];
    if (canvasMeasurements.length <= storeMeasurements.length) return;
    const storeIds = new Set(storeMeasurements.map(m => m.id));
    const toDelete = canvasMeasurements.find(m => !m.measurement?.isCalibration && !storeIds.has(m.id));
    if (toDelete) managerRef.current.applyOperation('DELETE_MEASUREMENT', { id: toDelete.id });
  }, [storeMeasurements, ready]);

  // Reset temp points when tool changes
  useEffect(() => { setTempPoints([]); }, [activeTool]);

  // ── Draw loop (RAF) ────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const state = managerRef.current?.current;
    if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { k, x, y } = vt.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw fragments (radiograph)
    if (state) {
      state.data.fragments.forEach(frag => {
        if ((frag as any).isSourceOf) return;
        const img = getImage(frag.image as string);
        ctx.save();
        ctx.beginPath();
        frag.polygon.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.clip();
        const pivot = (frag as any).pivot ?? { x: frag.imageX + frag.imageWidth / 2, y: frag.imageY + frag.imageHeight / 2 };
        ctx.translate(pivot.x, pivot.y);
        ctx.rotate((frag.rotation * Math.PI) / 180);
        ctx.translate(-pivot.x, -pivot.y);
        if (img.complete) ctx.drawImage(img, frag.imageX, frag.imageY, frag.imageWidth, frag.imageHeight);
        ctx.restore();
      });

      // Compute bounds for reference-line tools (C7PL, CSVL, SPi, etc.)
      const bounds = state.data.fragments.reduce(
        (acc, frag) => ({
          minY: Math.min(acc.minY, ...frag.polygon.map(p => p.y)),
          maxY: Math.max(acc.maxY, ...frag.polygon.map(p => p.y)),
        }),
        { minY: Infinity, maxY: -Infinity },
      );

      const ratio = calibration.pixelToMm;
      state.data.measurements.forEach(m => {
        if (m.measurement?.isCalibration) return;
        MeasurementSystem.draw(
          ctx, m, k, ratio,
          bounds.minY === Infinity ? undefined : bounds,
          null,
        );
      });
    }

    // Live calibration preview
    if (isCalibrating && calibPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2 / k; ctx.setLineDash([5 / k, 5 / k]);
      ctx.fillStyle = '#f59e0b';
      const pts = pendingCalibPx !== null ? calibPoints : [...calibPoints, mousePos.current];
      pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5 / k, 0, Math.PI * 2); ctx.fill(); });
      if (pts.length >= 2) {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Live tool preview (in-progress measurement)
    if (tempPoints.length > 0 && canvasToolKey && !isCalibrating) {
      ctx.save();
      const color = toolColor(canvasToolKey);
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5 / k;
      const wPos = mousePos.current;
      const pts = [...tempPoints, wPos];

      // Draw points
      pts.forEach(p => {
        if (canvasToolKey === 'pencil') return;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 / k, 0, Math.PI * 2); ctx.fill();
      });

      // Draw lines per tool geometry
      ctx.beginPath();
      if (['cobb', 'tk', 'll', 'cl', 'spondy', 'angle-4pt'].includes(canvasToolKey)) {
        if (pts.length >= 1) { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts.length > 1 ? pts[1].x : wPos.x, pts.length > 1 ? pts[1].y : wPos.y); }
        if (pts.length >= 3) { ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(pts.length > 3 ? pts[3].x : wPos.x, pts.length > 3 ? pts[3].y : wPos.y); }
        // Live Cobb angle preview
        if (['cobb', 'tk', 'll', 'cl'].includes(canvasToolKey) && pts.length >= 3) {
          const previewPts = pts.slice(0, pts.length === 3 ? 3 : 4);
          if (previewPts.length === 3) previewPts.push(wPos);
          const { angle } = calculateCobbAngle(previewPts);
          if (angle > 0) {
            ctx.save();
            ctx.font = `bold ${14 / k}px Inter, sans-serif`;
            ctx.fillStyle = color;
            ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4 / k;
            ctx.fillText(`${angle.toFixed(1)}°`, wPos.x + 10 / k, wPos.y - 10 / k);
            ctx.restore();
          }
        }
      } else if (['pi_ll', 'pelvis'].includes(canvasToolKey)) {
        // Draw femoral head circles
        for (let pair = 0; pair < 2; pair++) {
          const i = pair * 2;
          if (pts.length > i + 1) {
            const mid = getMidpoint(pts[i], pts[i + 1]);
            const rad = getDistance(pts[i], pts[i + 1]) / 2;
            ctx.moveTo(mid.x + rad, mid.y); ctx.arc(mid.x, mid.y, rad, 0, Math.PI * 2);
          } else if (pts.length === i + 1) { ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(wPos.x, wPos.y); }
        }
        if (pts.length >= 5) { ctx.moveTo(pts[4].x, pts[4].y); ctx.lineTo(pts.length > 5 ? pts[5].x : wPos.x, pts.length > 5 ? pts[5].y : wPos.y); }
        if (canvasToolKey === 'pi_ll') {
          if (pts.length >= 7) { ctx.moveTo(pts[6].x, pts[6].y); ctx.lineTo(pts.length > 7 ? pts[7].x : wPos.x, pts.length > 7 ? pts[7].y : wPos.y); }
        }
      } else if (['tpa', 'spa', 't1spi', 't9spi', 'odha'].includes(canvasToolKey)) {
        if (pts.length >= 2) { const mid = getMidpoint(pts[0], pts[1]); const rad = getDistance(pts[0], pts[1]) / 2; ctx.moveTo(mid.x + rad, mid.y); ctx.arc(mid.x, mid.y, rad, 0, Math.PI * 2); }
        else if (pts.length === 1) { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(wPos.x, wPos.y); }
        if (pts.length >= 4) { const mid = getMidpoint(pts[2], pts[3]); const rad = getDistance(pts[2], pts[3]) / 2; ctx.moveTo(mid.x + rad, mid.y); ctx.arc(mid.x, mid.y, rad, 0, Math.PI * 2); }
        else if (pts.length === 3) { ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(wPos.x, wPos.y); }
        if (pts.length >= 5) { const hip = getHipAxisCenter(pts.slice(0, 4)); if (hip) { ctx.moveTo(hip.x, hip.y); ctx.lineTo(pts[4].x, pts[4].y); } }
        if (['tpa', 'spa'].includes(canvasToolKey)) {
          if (pts.length >= 7) { ctx.moveTo(pts[5].x, pts[5].y); ctx.lineTo(pts[6].x, pts[6].y); }
          else if (pts.length === 6) { ctx.moveTo(pts[5].x, pts[5].y); ctx.lineTo(wPos.x, wPos.y); }
        }
      } else if (['ts', 'avt', 'ssa'].includes(canvasToolKey)) {
        if (pts.length >= 1) { ctx.moveTo(pts[0].x, pts[0].y); if (pts.length === 1) ctx.lineTo(wPos.x, wPos.y); }
        if (pts.length >= 3) {
          ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y);
          const mid = getMidpoint(pts[1], pts[2]);
          ctx.setLineDash([5 / k, 5 / k]); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(mid.x, mid.y); ctx.setLineDash([]);
        } else if (pts.length === 2) { ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(wPos.x, wPos.y); }
      } else if (canvasToolKey === 'cmc') {
        for (let i = 0; i < Math.floor(pts.length / 2); i++) { ctx.moveTo(pts[i * 2].x, pts[i * 2].y); ctx.lineTo(pts[i * 2 + 1].x, pts[i * 2 + 1].y); }
        if (pts.length % 2 === 1) { ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.lineTo(wPos.x, wPos.y); }
      } else if (canvasToolKey === 'vbm') {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (pts.length === 4) ctx.closePath();
      } else if (canvasToolKey === 'circle' && pts.length >= 2) {
        const center = getMidpoint(pts[0], pts[1]); const radius = getDistance(pts[0], pts[1]) / 2;
        ctx.moveTo(center.x + radius, center.y);
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      } else if (canvasToolKey === 'ellipse' && pts.length >= 2) {
        const center = getMidpoint(pts[0], pts[1]);
        const rx = Math.max(Math.abs(pts[0].x - pts[1].x) / 2, 1);
        const ry = Math.max(Math.abs(pts[0].y - pts[1].y) / 2, 1);
        ctx.moveTo(center.x + rx, center.y);
        ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
      } else if (canvasToolKey === 'polygon' && pts.length > 0) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      } else if (['sva', 'line', 'po', 'cbva', 'angle-2pt', 'angle-3pt'].includes(canvasToolKey)) {
        if (pts.length > 0) { ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); }
        if (canvasToolKey === 'sva' && pts.length >= 1) {
          ctx.setLineDash([5 / k, 5 / k]);
          ctx.moveTo(pts[0].x, pts[0].y - 200 / k); ctx.lineTo(pts[0].x, pts[0].y + 200 / k);
          ctx.setLineDash([]);
        }
      } else if (canvasToolKey === 'rvad') {
        if (pts.length >= 2) { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); }
        if (pts.length >= 4) { ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y); }
        if (pts.length >= 6) { ctx.moveTo(pts[4].x, pts[4].y); ctx.lineTo(pts[5].x, pts[5].y); }
      } else {
        // Generic: connect all points
        if (pts.length > 0) { ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); }
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }, [canvasToolKey, tempPoints, isCalibrating, calibPoints, pendingCalibPx, calibration.pixelToMm, getImage]);

  // RAF loop
  useEffect(() => {
    let rafId: number;
    const loop = () => { draw(); rafId = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(rafId);
  }, [draw]);

  // Canvas size sync
  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      canvas.width = e.contentRect.width;
      canvas.height = e.contentRect.height;
    });
    ro.observe(el);
    canvas.width = el.clientWidth;
    canvas.height = el.clientHeight;
    return () => ro.disconnect();
  }, []);

  // ── Commit helper ─────────────────────────────────────────────────────────
  const commit = useCallback(async (toolKey: string, points: Point[], result: string, meta?: any) => {
    if (!managerRef.current) return;
    const s = await managerRef.current.applyOperation('ADD_MEASUREMENT', {
      toolKey, points, result,
      measurement: { name: activeTool ?? toolKey, ...meta },
    });
    if (s) syncToStore(s.data.measurements);
    setTempPoints([]);
  }, [activeTool, syncToStore]);

  // ── Mouse down — main tool handler ────────────────────────────────────────
  const handleMouseDown = useCallback(async (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1) { setIsPanning(true); panStart.current = { x: e.clientX, y: e.clientY }; return; }
    if (e.button !== 0) return;
    if (!ready) return;

    const wp = worldPos(e.clientX, e.clientY);

    // Calibration mode
    if (isCalibrating) {
      const pts = [...calibPoints, wp];
      if (pts.length === 2) {
        setPendingCalibPx(getDistance(pts[0], pts[1]));
        setCalibPoints(pts);
        setCalibMmInput('');
      } else {
        setCalibPoints(pts);
      }
      return;
    }

    if (!canvasToolKey) return;

    const newTemp = [...tempPoints, wp];
    const needed = POINTS_NEEDED[canvasToolKey];

    // ── Open-ended tools (polygon, cmc, stenosis) ─────────────────────────
    if (canvasToolKey === 'polygon') {
      if (newTemp.length >= 3 && getDistance(wp, newTemp[0]) < 20 / vt.current.k) {
        const area = getPolygonArea(newTemp.slice(0, -1));
        const perim = getPolygonPerimeter(newTemp.slice(0, -1));
        await commit('polygon', newTemp.slice(0, -1), `A: ${area.toFixed(0)}px² | P: ${perim.toFixed(1)}px`);
      } else { setTempPoints(newTemp); }
      return;
    }

    if (canvasToolKey === 'stenosis') {
      if (newTemp.length >= 3 && getDistance(wp, newTemp[0]) < 20 / vt.current.k) {
        const calc = calculateStenosisArea(newTemp.slice(0, -1), calibration.pixelToMm);
        await commit('stenosis', newTemp.slice(0, -1), calc ? `Area: ${calc.resultString}` : 'Area: ...');
      } else { setTempPoints(newTemp); }
      return;
    }

    if (canvasToolKey === 'cmc') {
      setTempPoints(newTemp); // committed on right-click
      return;
    }

    if (canvasToolKey === 'pencil') {
      setTempPoints([wp]);
      return;
    }

    if (canvasToolKey === 'text') {
      // Simple text annotation — place a label at clicked point
      const label = window.prompt('Enter annotation text:');
      if (label) await commit('text', [wp], label, { text: label });
      return;
    }

    // ── Fixed-point tools ─────────────────────────────────────────────────
    if (!needed || newTemp.length < needed) {
      setTempPoints(newTemp);
      return;
    }

    // Enough points — compute result and commit
    const pts = newTemp;
    let result = '';

    switch (canvasToolKey) {
      case 'cobb': case 'tk': case 'll': case 'cl': {
        const { angle } = calculateCobbAngle(pts);
        const prefix = canvasToolKey === 'cobb' ? 'Cobb' : canvasToolKey.toUpperCase();
        result = `${prefix}: ${angle.toFixed(1)}°`;
        break;
      }
      case 'sva': {
        const { distance } = calculateSVA(pts);
        result = calibration.pixelToMm
          ? `SVA: ${(Math.abs(distance) * calibration.pixelToMm).toFixed(1)} mm`
          : `SVA: ${Math.abs(distance).toFixed(1)} px`;
        break;
      }
      case 'pi_ll': {
        const r = calculatePILL(pts);
        result = r ? `PI: ${r.pi.toFixed(1)}°\nLL: ${r.ll.toFixed(1)}°\nPI - LL: ${r.mismatch.toFixed(1)}°` : '';
        break;
      }
      case 'pelvis': {
        const r = calculatePelvicParameters(pts);
        result = r ? `PI: ${r.pi.toFixed(1)}°\nPT: ${r.pt.toFixed(1)}°\nSS: ${r.ss.toFixed(1)}°` : '';
        break;
      }
      case 'vbm': {
        result = calculateVBM(pts, 'lateral', calibration.pixelToMm) ?? '';
        break;
      }
      case 'ts': {
        const r = calculateTS(pts, calibration.pixelToMm);
        result = r ? (calibration.pixelToMm ? `TS: ${(r.dx * calibration.pixelToMm).toFixed(1)} mm` : `TS: ${r.dx.toFixed(1)} px`) : '';
        break;
      }
      case 'avt': {
        const r = calculateAVT(pts, calibration.pixelToMm);
        result = r ? (calibration.pixelToMm ? `AVT: ${(r.dx * calibration.pixelToMm).toFixed(1)} mm` : `AVT: ${r.dx.toFixed(1)} px`) : '';
        break;
      }
      case 'po': {
        const r = calculatePO(pts);
        result = r ? `PO: ${r.angle.toFixed(1)}°` : '';
        break;
      }
      case 'rvad': {
        const r = calculateRVAD(pts);
        result = r ? `Rib R: ${r.rvaR.toFixed(1)}°\nRib L: ${r.rvaL.toFixed(1)}°\nRVAD: ${r.rvad.toFixed(1)}°` : '';
        break;
      }
      case 'tpa': {
        const r = calculateTPA(pts);
        result = r ? `TPA: ${r.angle.toFixed(1)}°` : '';
        break;
      }
      case 'spa': {
        const r = calculateSPA(pts);
        result = r ? `SPA: ${r.angle.toFixed(1)}°` : '';
        break;
      }
      case 'ssa': {
        const r = calculateSSA(pts);
        result = r ? `SSA: ${r.angle.toFixed(1)}°` : '';
        break;
      }
      case 't1spi': case 't9spi': case 'odha': {
        const r = calculateSPi(pts);
        const label = canvasToolKey === 't1spi' ? 'T1SPi' : canvasToolKey === 't9spi' ? 'T9SPi' : 'ODHA';
        result = r ? `${label}: ${Math.abs(r.angle).toFixed(1)}°` : '';
        break;
      }
      case 'cbva': {
        const r = calculateCBVA(pts);
        result = r ? `CBVA: ${r.angle.toFixed(1)}°` : '';
        break;
      }
      case 'spondy': {
        const r = calculateSpondylolisthesis(pts, calibration.pixelToMm);
        result = r ? formatSpondylolisthesisResult(r, calibration.pixelToMm) : '';
        break;
      }
      case 'line': {
        const dist = getDistance(pts[0], pts[1]);
        result = calibration.pixelToMm ? `${(dist * calibration.pixelToMm).toFixed(1)} mm` : `${dist.toFixed(1)} px`;
        break;
      }
      case 'angle-2pt': case 'angle-3pt': {
        result = 'Angle';
        break;
      }
      case 'circle': {
        const r = getDistance(pts[0], pts[1]) / 2;
        result = calibration.pixelToMm ? `r: ${(r * calibration.pixelToMm).toFixed(1)} mm` : `r: ${r.toFixed(1)} px`;
        break;
      }
      case 'ellipse': {
        const erx = Math.abs(pts[0].x - pts[1].x) / 2, ery = Math.abs(pts[0].y - pts[1].y) / 2;
        result = calibration.pixelToMm
          ? `${(erx * calibration.pixelToMm).toFixed(1)} × ${(ery * calibration.pixelToMm).toFixed(1)} mm`
          : `${erx.toFixed(1)} × ${ery.toFixed(1)} px`;
        break;
      }
      default:
        result = canvasToolKey.toUpperCase();
    }

    await commit(canvasToolKey, pts, result);
  }, [ready, isCalibrating, calibPoints, canvasToolKey, tempPoints, calibration, worldPos, commit]);

  // Right-click: finish open-ended tools
  const handleContextMenu = useCallback(async (e: ReactMouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasToolKey) return;
    if (canvasToolKey === 'cmc' && tempPoints.length >= 4) {
      const angles = calculateCMC(tempPoints);
      const result = angles ? angles.map((a: number, i: number) => `Cobb ${i + 1}: ${a.toFixed(1)}°`).join('\n') : '';
      await commit('cmc', tempPoints, result);
      return;
    }
    if (canvasToolKey === 'stenosis' && tempPoints.length >= 3) {
      const calc = calculateStenosisArea(tempPoints, calibration.pixelToMm);
      await commit('stenosis', tempPoints, calc ? `Area: ${calc.resultString}` : 'Area: ...');
      return;
    }
    if (canvasToolKey === 'polygon' && tempPoints.length >= 3) {
      const area = getPolygonArea(tempPoints);
      const perim = getPolygonPerimeter(tempPoints);
      await commit('polygon', tempPoints, `A: ${area.toFixed(0)}px² | P: ${perim.toFixed(1)}px`);
      return;
    }
    if (canvasToolKey === 'pencil' && tempPoints.length >= 2) {
      await commit('pencil', tempPoints, 'Annotation');
      return;
    }
    setTempPoints([]);
  }, [canvasToolKey, tempPoints, calibration.pixelToMm, commit]);

  const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLCanvasElement>) => {
    const wp = worldPos(e.clientX, e.clientY);
    mousePos.current = wp;

    // Pencil: accumulate points while dragging
    if (canvasToolKey === 'pencil' && e.buttons === 1 && tempPoints.length > 0) {
      setTempPoints(prev => [...prev, wp]);
      return;
    }

    // Pan
    if (isPanning && panStart.current) {
      vt.current = {
        ...vt.current,
        x: vt.current.x + (e.clientX - panStart.current.x),
        y: vt.current.y + (e.clientY - panStart.current.y),
      };
      panStart.current = { x: e.clientX, y: e.clientY };
    }
  }, [worldPos, canvasToolKey, tempPoints.length, isPanning]);

  const handleMouseUp = useCallback(async (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1) { setIsPanning(false); panStart.current = null; return; }
    // Commit pencil on mouse up
    if (canvasToolKey === 'pencil' && tempPoints.length >= 2) {
      await commit('pencil', tempPoints, 'Pen');
    }
  }, [canvasToolKey, tempPoints, commit]);

  const handleWheel = useCallback((e: ReactWheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const factor = Math.exp(-e.deltaY * 0.001);
    const { k, x, y } = vt.current;
    const newK = Math.max(0.05, Math.min(20, k * factor));
    vt.current = { k: newK, x: cx - (cx - x) * (newK / k), y: cy - (cy - y) * (newK / k) };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setTempPoints([]); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        if (tempPoints.length > 0) { setTempPoints(p => p.slice(0, -1)); return; }
        const s = managerRef.current?.undo();
        if (s) syncToStore(s.data.measurements);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        const s = managerRef.current?.redo();
        if (s) syncToStore(s.data.measurements);
        return;
      }
      if (e.key === 'Enter' && canvasToolKey === 'polygon' && tempPoints.length >= 3) {
        const area = getPolygonArea(tempPoints);
        const perim = getPolygonPerimeter(tempPoints);
        await commit('polygon', tempPoints, `A: ${area.toFixed(0)}px² | P: ${perim.toFixed(1)}px`);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tempPoints, canvasToolKey, syncToStore, commit]);

  // Calibration confirm
  const confirmCalibration = () => {
    const mm = parseFloat(calibMmInput);
    if (pendingCalibPx && pendingCalibPx > 0 && mm > 0) {
      setCalibration({ pixelToMm: mm / pendingCalibPx });
    }
    setIsCalibrating(false);
    setCalibPoints([]);
    setPendingCalibPx(null);
    setCalibMmInput('');
    setActiveTool(null);
  };

  // Image load via file drop or button (when no imageSrc)
  const fileRef = useRef<HTMLInputElement>(null);
  const loadFile = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setImageInStore(url);
  };

  // Expose calibration start for Assessment panel
  useEffect(() => {
    if (activeTool === 'calibration' || activeTool === 'Calibration') {
      setIsCalibrating(true);
      setCalibPoints([]);
      setPendingCalibPx(null);
    } else if (isCalibrating && activeTool !== 'calibration' && activeTool !== 'Calibration') {
      setIsCalibrating(false);
      setCalibPoints([]);
      setPendingCalibPx(null);
    }
  }, [activeTool, isCalibrating]);

  const cursor = isPanning ? 'grabbing' : isCalibrating ? 'crosshair' : canvasToolKey ? 'crosshair' : 'default';

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#111' }}>
      {!imageSrc ? (
        <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', gap: 12 }}>
          <button
            onClick={() => fileRef.current?.click()}
            style={{ color: '#cfcfd6', background: 'transparent', border: '1px solid #333', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 14 }}
          >
            Load X-ray image
          </button>
          <span style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            or drop an image here
          </span>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => loadFile(e.target.files?.[0])} />
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', height: '100%', cursor }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
            onWheel={handleWheel}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); loadFile(e.dataTransfer.files?.[0]); }}
          />
          {/* Calibration pill */}
          {isCalibrating && (
            <div style={pillStyle}>
              {pendingCalibPx !== null ? (
                <>
                  <span style={{ opacity: 0.85 }}>Known distance (mm):</span>
                  <input
                    autoFocus value={calibMmInput} onChange={e => setCalibMmInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirmCalibration()}
                    placeholder="mm" style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: 'none', color: '#111' }}
                  />
                  <button onClick={confirmCalibration} style={pillBtn}>Set</button>
                  <button onClick={() => { setIsCalibrating(false); setCalibPoints([]); setPendingCalibPx(null); setActiveTool(null); }} style={pillClose}>×</button>
                </>
              ) : (
                <>
                  <strong>Calibrate</strong>
                  <span style={{ opacity: 0.85 }}>{calibPoints.length}/2 points · click a known distance</span>
                  <button onClick={() => { setIsCalibrating(false); setCalibPoints([]); setActiveTool(null); }} style={pillClose}>×</button>
                </>
              )}
            </div>
          )}
          {/* Active tool pill */}
          {canvasToolKey && !isCalibrating && (
            <div style={pillStyle}>
              <strong>{activeTool}</strong>
              <span style={{ opacity: 0.85 }}>
                {POINTS_NEEDED[canvasToolKey]
                  ? `${tempPoints.length}/${POINTS_NEEDED[canvasToolKey]} points`
                  : `${tempPoints.length} points · right-click to finish`}
                {activeTool && TOOL_SPECS[activeTool]?.hint
                  ? ` · ${TOOL_SPECS[activeTool].hint}`
                  : ''}
              </span>
              <button onClick={() => { setTempPoints([]); setActiveTool(null); }} style={pillClose}>×</button>
            </div>
          )}
          {/* Change image button */}
          <button
            onClick={() => fileRef.current?.click()}
            style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 4, background: 'rgba(17,24,39,0.7)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}
          >
            Change image
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => loadFile(e.target.files?.[0])} />
        </>
      )}
    </div>
  );
}

const pillStyle: React.CSSProperties = {
  position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 6,
  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderRadius: 999,
  background: 'rgba(17,24,39,0.92)', color: '#fff', fontSize: 12.5, boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
  whiteSpace: 'nowrap',
};
const pillBtn: React.CSSProperties = { background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' };
const pillClose: React.CSSProperties = { background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.8, padding: '0 4px' };
