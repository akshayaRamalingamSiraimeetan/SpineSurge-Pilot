/* 2D viewer viewport — zoom / pan + native-pixel coordinate mapping (Step 7d).
 *
 * Previously the radiograph used CSS object-fit and the overlays captured display-pixel coordinates,
 * which only works without zoom/pan. This context introduces a single image→screen transform shared by
 * the radiograph surface and every overlay. Measurement/annotation points are now stored in NATIVE
 * image pixels (stable across viewport size, zoom, and pan); the overlays map screen↔image through
 * this transform, and calibration is therefore expressed in native pixels too. The transform is the
 * fit-to-container baseline composed with the user's zoom (about the cursor) and pan. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { computeFitTransform, screenToWorld, worldToScreen, zoomAbout, type ViewTransform } from '@/features/canvas/fitTransform';
import type { Point } from '@/lib/canvas/GeometryUtils';
import { useWorkspaceStore } from '@/lib/store/workspace';

interface ViewportApi {
  transform: ViewTransform;
  /** True once an image's natural size is known (so overlays know the mapping is meaningful). */
  ready: boolean;
  /** Hand/pan tool active — overlays should not capture while panning. */
  panActive: boolean;
  setPanActive: (v: boolean) => void;
  toImage: (screen: Point) => Point;
  toScreen: (image: Point) => Point;
  zoomBy: (factor: number) => void;
  reset: () => void;
}

const ViewportContext = createContext<ViewportApi | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export function useViewport(): ViewportApi {
  const ctx = useContext(ViewportContext);
  if (!ctx) throw new Error('useViewport must be used within a ViewportProvider');
  return ctx;
}

export function ViewportProvider({ containerRef, children }: { containerRef: React.RefObject<HTMLDivElement | null>; children: ReactNode }) {
  const imageSrc = useWorkspaceStore((s) => s.imageSrc);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [panActive, setPanActive] = useState(false);
  const panRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  /** Recompute the fit-to-container baseline (called from async/observer callbacks, never a sync effect). */
  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el || !natural) return;
    setTransform(computeFitTransform(natural.w, natural.h, el.clientWidth, el.clientHeight, 16));
  }, [containerRef, natural]);

  // Load the image's natural size (async — setState here is not a synchronous effect update).
  useEffect(() => {
    if (!imageSrc) {
      // defer so the reset is not a synchronous setState inside the effect body
      const id = requestAnimationFrame(() => setNatural(null));
      return () => cancelAnimationFrame(id);
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setNatural({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    };
    img.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  // Fit whenever the image size becomes known (next frame — keeps setState out of the effect body)
  // and on container resize (observer callback). Both are async, so neither is a synchronous update.
  useEffect(() => {
    const raf = requestAnimationFrame(() => fit());
    const el = containerRef.current;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => fit()) : null;
    if (el && ro) ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [fit, containerRef]);

  const toImage = useCallback((s: Point) => screenToWorld(s.x, s.y, transform), [transform]);
  const toScreen = useCallback((p: Point) => worldToScreen(p.x, p.y, transform), [transform]);

  /** Zoom about the container centre by a factor. */
  const zoomBy = useCallback(
    (factor: number) => {
      const el = containerRef.current;
      const cx = el ? el.clientWidth / 2 : 0;
      const cy = el ? el.clientHeight / 2 : 0;
      setTransform((t) => zoomAbout(t, factor, cx, cy));
    },
    [containerRef],
  );

  const reset = useCallback(() => fit(), [fit]);

  // Wheel zoom about the cursor (native listener so we can preventDefault the page scroll).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * 0.0015); // smooth, direction-correct
      setTransform((t) => zoomAbout(t, factor, e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [containerRef]);

  // Pan via drag while the hand tool is active.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !panActive) return;
    const down = (e: MouseEvent) => {
      panRef.current = { sx: e.clientX, sy: e.clientY, ox: 0, oy: 0 };
    };
    const move = (e: MouseEvent) => {
      const p = panRef.current;
      if (!p) return;
      const dx = e.clientX - p.sx;
      const dy = e.clientY - p.sy;
      p.sx = e.clientX;
      p.sy = e.clientY;
      setTransform((t) => ({ ...t, offsetX: t.offsetX + dx, offsetY: t.offsetY + dy }));
    };
    const up = () => {
      panRef.current = null;
    };
    el.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      el.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [containerRef, panActive]);

  const api = useMemo<ViewportApi>(
    () => ({ transform, ready: !!natural, panActive, setPanActive, toImage, toScreen, zoomBy, reset }),
    [transform, natural, panActive, toImage, toScreen, zoomBy, reset],
  );

  return <ViewportContext.Provider value={api}>{children}</ViewportContext.Provider>;
}
