/* Pure view-transform helpers for the osteotomy canvas (Step 7b interactive wiring).
 *
 * The CanvasManager engine works entirely in image/world pixels; the on-screen canvas is a
 * fit-to-container view of that space. These functions map between the two and are kept pure so the
 * coordinate math (the part that must stay correct as the canvas resizes) is unit-testable without a
 * DOM — the rendering itself is verified visually (LOGIC_PORT_PLAN §2). */
import type { Point } from '@/lib/canvas/GeometryUtils';

export interface ViewTransform {
  /** Uniform world→screen scale. */
  scale: number;
  /** Screen-space offset of world origin (centres the image in the viewport). */
  offsetX: number;
  offsetY: number;
}

/** Contain-fit an image of (imgW × imgH) into a (viewW × viewH) viewport, centred, with padding. */
export function computeFitTransform(
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number,
  padding = 0,
): ViewTransform {
  const usableW = Math.max(0, viewW - 2 * padding);
  const usableH = Math.max(0, viewH - 2 * padding);
  // Degenerate inputs collapse to an identity-ish transform rather than NaN/Infinity.
  const scale = imgW > 0 && imgH > 0 ? Math.min(usableW / imgW, usableH / imgH) || 1 : 1;
  return {
    scale,
    offsetX: (viewW - imgW * scale) / 2,
    offsetY: (viewH - imgH * scale) / 2,
  };
}

/** Screen (canvas-local px) → world (image px). */
export function screenToWorld(sx: number, sy: number, t: ViewTransform): Point {
  return { x: (sx - t.offsetX) / t.scale, y: (sy - t.offsetY) / t.scale };
}

/** World (image px) → screen (canvas-local px). */
export function worldToScreen(wx: number, wy: number, t: ViewTransform): Point {
  return { x: wx * t.scale + t.offsetX, y: wy * t.scale + t.offsetY };
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 40;

/** Scale about a screen anchor, keeping the image point under the anchor fixed (clamped to limits). */
export function zoomAbout(
  t: ViewTransform,
  factor: number,
  ax: number,
  ay: number,
  min = MIN_SCALE,
  max = MAX_SCALE,
): ViewTransform {
  const scale = Math.min(max, Math.max(min, t.scale * factor));
  const applied = scale / t.scale; // actual factor after clamping
  return {
    scale,
    offsetX: ax - (ax - t.offsetX) * applied,
    offsetY: ay - (ay - t.offsetY) * applied,
  };
}
