/* Interactive osteotomy / fragment canvas (Step 7 — "osteotomy interactive canvas").
 *
 * Wires the parity-locked CanvasManager engine (lib/canvas, ported + unit-tested in 7b) to a real
 * Canvas2D surface so a surgeon can cut, move, rotate, and wedge-osteotomize the radiograph. The
 * engine owns all geometry in image/world pixels; this component only renders that state and turns
 * pointer input into engine operations. Per MASTER §8.6 the manager is a non-serializable ref, never
 * the Zustand store. Rendering is verified visually (/verify); the engine math has its own golden +
 * unit tests and the coordinate mapping is unit-tested in fitTransform.test.ts. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { Icon } from '@/components/Icon';
import { CanvasManager, type Fragment } from '@/lib/canvas/CanvasManager';
import { getPolygonCenter, isPointInPolygon, type Point } from '@/lib/canvas/GeometryUtils';
import { computeFitTransform, screenToWorld, type ViewTransform } from './fitTransform';

type Tool = 'select' | 'cut' | 'wedge';

/** A wedge procedure label → the engine's WEDGE_OSTEOTOMY `type` field (drives the result message). */
export interface WedgeKind {
  abbr: string;
  type: string;
}

/** In-progress click points tagged with the tool that owns them, so switching tools (or reloading
 *  the image) discards a half-placed draft without needing a reset effect. */
interface Draft {
  owner: string;
  pts: Point[];
}

const ACCENT = '#3b82f6';
const WEDGE_COLOR = '#f59e0b';
const isHidden = (f: Fragment): boolean => !!(f as Fragment & { isSourceOf?: string }).isSourceOf;

export function OsteotomyCanvas({
  imageSrc,
  tool,
  wedge,
  onStatus,
}: {
  imageSrc: string | null;
  tool: Tool;
  /** When the active tool is `wedge`, which procedure (PSO/SPO/…) is being placed. */
  wedge: WedgeKind;
  /** Reports point-placement progress / fragment count to the host panel. */
  onStatus?: (s: { fragments: number; canUndo: boolean; canRedo: boolean; hint: string }) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const managerRef = useRef<CanvasManager | null>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const transformRef = useRef<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  // Live drag preview — render-time only; committed as one MOVE on mouse-up (single undo step).
  const dragRef = useRef<{ id: string; startWorld: Point; dx: number; dy: number } | null>(null);

  const [version, setVersion] = useState(0); // redraw trigger (engine lives in a ref, not state)
  const [dragTick, setDragTick] = useState(0);
  const [fragmentCount, setFragmentCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ owner: '', pts: [] });

  const owner = `${tool}|${wedge.abbr}`;
  const draftPts = useMemo(() => (draft.owner === owner ? draft.pts : []), [draft, owner]);

  const fragmentsOf = (mgr: CanvasManager | null): Fragment[] =>
    (mgr?.current?.data.fragments ?? []).filter((f) => !isHidden(f));

  /** Bump the redraw counter and recompute the fragment tally (reads the ref — only in callbacks). */
  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    setFragmentCount(fragmentsOf(managerRef.current).length);
  }, []);

  /* ---- (re)initialize the engine whenever the image changes ---- */
  useEffect(() => {
    if (!imageSrc) {
      // Tear down without setState; the redraw effect (keyed on imageSrc) clears the canvas.
      managerRef.current = null;
      imgElRef.current = null;
      return;
    }
    let cancelled = false;
    const mgr = new CanvasManager();
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imgElRef.current = img;
      // async (post-load) — setState here is not a synchronous effect update.
      void mgr.initialize(imageSrc).then(() => {
        if (cancelled) return;
        managerRef.current = mgr;
        setSelectedId(null);
        setDraft({ owner: '', pts: [] });
        refresh();
      });
    };
    img.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [imageSrc, refresh]);

  /* ---- draw ---- */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const vw = wrap.clientWidth;
    const vh = wrap.clientHeight;
    canvas.width = vw * dpr;
    canvas.height = vh * dpr;
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${vh}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    const img = imgElRef.current;
    const mgr = managerRef.current;
    if (!img || !mgr) return;

    const t = computeFitTransform(img.naturalWidth, img.naturalHeight, vw, vh, 16);
    transformRef.current = t;

    const drag = dragRef.current;
    const off = (f: Fragment): Point => (drag && drag.id === f.id ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 });
    const frags = fragmentsOf(mgr);

    ctx.save();
    ctx.translate(t.offsetX, t.offsetY);
    ctx.scale(t.scale, t.scale);

    // Image content, clipped to each fragment polygon (mirrors the validated old renderer).
    for (const frag of frags) {
      const d = off(frag);
      const poly = frag.polygon.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));
      ctx.save();
      ctx.beginPath();
      poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.clip();
      const pivot = getPolygonCenter(poly);
      ctx.translate(pivot.x, pivot.y);
      ctx.rotate((frag.rotation * Math.PI) / 180);
      ctx.translate(-pivot.x, -pivot.y);
      ctx.drawImage(img, frag.imageX + d.x, frag.imageY + d.y, frag.imageWidth, frag.imageHeight);
      ctx.restore();
    }

    // Fragment outlines + selection highlight.
    const lw = 1.5 / t.scale;
    for (const frag of frags) {
      const d = off(frag);
      const poly = frag.polygon.map((p) => ({ x: p.x + d.x, y: p.y + d.y }));
      ctx.beginPath();
      poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.lineWidth = lw;
      ctx.strokeStyle = frag.id === selectedId ? ACCENT : 'rgba(255,255,255,0.35)';
      ctx.stroke();
    }

    // Draft points/line for the cut/wedge tools.
    if (draftPts.length) {
      const color = tool === 'wedge' ? WEDGE_COLOR : ACCENT;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      draftPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      for (const p of draftPts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 / t.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }, [selectedId, draftPts, tool]);

  // Redraw on engine mutation, drag preview, image swap/teardown, and container resize.
  useEffect(() => {
    draw();
  }, [draw, version, dragTick, imageSrc]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  /* ---- status reporting (effects may read refs) ---- */
  useEffect(() => {
    const mgr = managerRef.current;
    const hint =
      tool === 'cut'
        ? `Cut · ${draftPts.length}/2 points · click two points to split a fragment`
        : tool === 'wedge'
          ? `${wedge.abbr} wedge · ${draftPts.length}/3 points (apex on the 2nd click)`
          : selectedId
            ? 'Drag to move · use the rotate / delete controls below'
            : 'Click a fragment to select, then drag to move';
    onStatus?.({
      fragments: fragmentsOf(mgr).length,
      canUndo: !!mgr && mgr.getHistory().length > 1,
      canRedo: redoAvailable(mgr),
      hint,
    });
  }, [version, draftPts, tool, wedge.abbr, selectedId, onStatus]);

  /* ---- pointer handling ---- */
  const toWorld = (e: ReactMouseEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return screenToWorld(e.clientX - r.left, e.clientY - r.top, transformRef.current);
  };

  const hitFragment = (w: Point): Fragment | null => {
    const frags = fragmentsOf(managerRef.current);
    for (let i = frags.length - 1; i >= 0; i--) if (isPointInPolygon(w, frags[i].polygon)) return frags[i];
    return null;
  };

  const onMouseDown = (e: ReactMouseEvent) => {
    if (!managerRef.current || tool !== 'select') return;
    const w = toWorld(e);
    const frag = hitFragment(w);
    setSelectedId(frag?.id ?? null);
    if (frag) dragRef.current = { id: frag.id, startWorld: w, dx: 0, dy: 0 };
  };

  const onMouseMove = (e: ReactMouseEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const w = toWorld(e);
    drag.dx = w.x - drag.startWorld.x;
    drag.dy = w.y - drag.startWorld.y;
    setDragTick((n) => n + 1);
  };

  const endDrag = () => {
    const drag = dragRef.current;
    const mgr = managerRef.current;
    dragRef.current = null;
    if (!drag || !mgr) return setDragTick((n) => n + 1);
    if (Math.abs(drag.dx) > 0.01 || Math.abs(drag.dy) > 0.01) {
      void mgr.applyOperation('MOVE', { fragmentId: drag.id, deltaX: drag.dx, deltaY: drag.dy }).then(refresh);
    } else {
      refresh();
    }
  };

  const onClick = (e: ReactMouseEvent) => {
    const mgr = managerRef.current;
    if (!mgr || tool === 'select') return;
    const w = toWorld(e);
    const pts = draft.owner === owner ? [...draft.pts, w] : [w];

    if (tool === 'cut' && pts.length === 2) {
      void mgr
        .applyOperation('CUT', { startPoint: pts[0], endPoint: pts[1], fragmentId: selectedId ?? undefined })
        .then(() => {
          setDraft({ owner, pts: [] });
          refresh();
        });
      return;
    }
    if (tool === 'wedge' && pts.length === 3) {
      void mgr.applyOperation('WEDGE_OSTEOTOMY', { points: pts, type: wedge.type }).then(() => {
        setDraft({ owner, pts: [] });
        refresh();
      });
      return;
    }
    setDraft({ owner, pts });
  };

  /* ---- engine controls ---- */
  const rotateSelected = (deg: number) => {
    if (!managerRef.current || !selectedId) return;
    void managerRef.current.applyOperation('ROTATE', { fragmentId: selectedId, angleDelta: deg }).then(refresh);
  };
  const deleteSelected = () => {
    if (!managerRef.current || !selectedId) return;
    void managerRef.current.applyOperation('DELETE_FRAGMENT', { fragmentId: selectedId }).then(() => {
      setSelectedId(null);
      refresh();
    });
  };
  const undo = () => {
    managerRef.current?.undo();
    setSelectedId(null);
    refresh();
  };
  const redo = () => {
    managerRef.current?.redo();
    refresh();
  };

  const cursor = tool === 'select' ? 'default' : 'crosshair';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div ref={wrapRef} style={{ position: 'relative', flex: 1, minHeight: 0, background: 'var(--viewer-bg)', borderRadius: 'inherit' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onClick={onClick}
          style={{ display: 'block', cursor, touchAction: 'none' }}
        />
        {!imageSrc && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#9aa0aa', fontSize: 13 }}>
            Load an X-ray in the Assessment tab to plan osteotomies.
          </div>
        )}
      </div>

      <div style={controlBar}>
        <button className="dock-btn" onClick={undo} title="Undo" style={ctrlBtn}>
          <Icon name="undo" size={16} />
        </button>
        <button className="dock-btn" onClick={redo} title="Redo" style={ctrlBtn}>
          <Icon name="redo" size={16} />
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <button className="dock-btn" onClick={() => rotateSelected(-5)} disabled={!selectedId} title="Rotate −5°" style={ctrlBtn}>
          ⟲ 5°
        </button>
        <button className="dock-btn" onClick={() => rotateSelected(5)} disabled={!selectedId} title="Rotate +5°" style={ctrlBtn}>
          ⟳ 5°
        </button>
        <button className="dock-btn" onClick={deleteSelected} disabled={!selectedId} title="Delete fragment" style={ctrlBtn}>
          <Icon name="trash" size={16} />
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
          {imageSrc ? fragmentCount : 0} fragment{(imageSrc ? fragmentCount : 0) === 1 ? '' : 's'}
          {selectedId ? ' · 1 selected' : ''}
        </span>
      </div>
    </div>
  );
}

const controlBar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 10px',
  borderTop: '1px solid var(--border)',
};
const ctrlBtn: CSSProperties = { minWidth: 34, height: 30, fontSize: 12 };

/** CanvasManager keeps its redo stack private; infer availability without reaching into internals. */
function redoAvailable(mgr: CanvasManager | null): boolean {
  if (!mgr) return false;
  const m = mgr as unknown as { future?: unknown[] };
  return Array.isArray(m.future) && m.future.length > 0;
}
