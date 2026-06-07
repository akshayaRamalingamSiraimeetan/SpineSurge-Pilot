/* Numeric calibration model (Step 7c refinement — MASTER §8.2).
 *
 * The old build stored each measurement only as a *formatted display string* (e.g. "123.4 px") and,
 * when calibration was toggled on, recovered the number with a regex on that string, multiplied by
 * the pixel→mm ratio, and re-formatted (old `canvasSlice.convertPxResultToMm`). That round-trip is
 * brittle (parsing depends on the exact label format) and lossy (the string had already been
 * `.toFixed(1)`-rounded, so calibration compounded the rounding error).
 *
 * This module replaces that with the canonical model: a measurement is a NUMBER + a DIMENSION,
 * measured in pixel space. Calibration is a pure numeric scaling; formatting happens only at render.
 * No display string is ever parsed back into a number.
 *
 * Scope: this is the store/presentation layer. The golden-locked calculators (CobbAngle, SVA, …)
 * are untouched — they remain the source of the raw numeric `value`. (VBM still returns a baked
 * string and is locked by its fixture; converting it to a Quantity is a future add-on, not this
 * refinement.)
 */

/** A measured magnitude in PIXEL space, tagged with how calibration should scale it. */
export interface Quantity {
  /** Raw magnitude in pixels (length/area) or degrees (angle). Never pre-formatted. */
  value: number;
  dimension: 'length' | 'area' | 'angle';
}

/** Pixel→millimetre scale. `null` means the image is uncalibrated (report in pixels). */
export interface Calibration {
  /** Millimetres per pixel. Must be > 0 when present. */
  pixelToMm: number | null;
}

export type DisplayUnit = 'px' | 'mm' | 'px²' | 'mm²' | '°';

export interface DisplayQuantity {
  value: number;
  unit: DisplayUnit;
}

const UNCALIBRATED: Calibration = { pixelToMm: null };

/**
 * Convert a pixel-space Quantity into the value+unit that should be displayed, applying calibration
 * numerically. Pure: no string parsing, no rounding — rounding is deferred to {@link formatQuantity}.
 *
 * - length: × ratio          (px  → mm)
 * - area:   × ratio²         (px² → mm²)   — area scales with the square of a linear ratio
 * - angle:  unchanged        (degrees are calibration-invariant)
 */
export function toDisplay(q: Quantity, calibration: Calibration = UNCALIBRATED): DisplayQuantity {
  const ratio = calibration.pixelToMm;
  const calibrated = ratio !== null && Number.isFinite(ratio) && ratio > 0;

  switch (q.dimension) {
    case 'angle':
      return { value: q.value, unit: '°' };
    case 'length':
      return calibrated ? { value: q.value * ratio, unit: 'mm' } : { value: q.value, unit: 'px' };
    case 'area':
      return calibrated
        ? { value: q.value * ratio * ratio, unit: 'mm²' }
        : { value: q.value, unit: 'px²' };
  }
}

/** Format a display quantity at render time. Rounding lives here, and ONLY here. */
export function formatQuantity(
  q: Quantity,
  calibration: Calibration = UNCALIBRATED,
  precision = 1,
): string {
  const d = toDisplay(q, calibration);
  return `${d.value.toFixed(precision)}${d.unit}`;
}
