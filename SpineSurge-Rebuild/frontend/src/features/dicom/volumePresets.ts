/* 3D volume-rendering transfer functions (ported from the old CornerstoneViewer).
 *
 * In Volume Rendering mode the HU-threshold slider drives a piecewise scalar-opacity curve over the
 * CT-Bone preset: everything below the threshold is transparent (soft tissue hidden), with a rapid
 * rise into solid bone above it — the "spine extraction" effect. Kept as a pure function so the
 * exact control points are value-pinned by a unit test without needing a live VTK volume. */

/** HU below this look like air/soft tissue; above ~1000 is dense cortical bone / metal. */
export const DEFAULT_HU_THRESHOLD = 300;
export const HU_THRESHOLD_MIN = -200;
export const HU_THRESHOLD_MAX = 1500;

/**
 * Piecewise (intensity → opacity) control points for the bone opacity curve at a given HU threshold.
 * Mirrors the old viewer verbatim: sharp cutoff at the threshold, rapid rise, solid through dense bone.
 */
export function boneOpacityPoints(threshold: number): Array<[number, number]> {
  return [
    [threshold - 1, 0], // fully transparent below threshold
    [threshold, 0], // cutoff start
    [threshold + 50, 0.2], // rapid rise
    [threshold + 300, 0.6], // body of bone
    [3000, 0.9], // dense bone / metal
  ];
}
