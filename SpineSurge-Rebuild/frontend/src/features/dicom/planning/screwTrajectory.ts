/* Pure helpers that turn planning intent into screw geometry, built on the parity-locked
 * SurgicalGeometry/ScrewDefaults math. Kept free of React and Cornerstone so it is fully unit-tested
 * without a live volume. */
import { getLevelDefaults } from '@/features/measurements/planning/ScrewDefaults';
import { getTransformedScrewTrajectory, type Vec3 } from '@/features/measurements/planning/SurgicalGeometry';
import type { ScrewProperties, ThreeDImplant } from './types';

/** Default insertion direction: anterior, into the bone (matches the old viewer's baseline). */
export const DEFAULT_SCREW_DIRECTION: Vec3 = [0, -1, 0];

/** Build the default screw properties for a level from the parity-locked size catalog. */
export function defaultScrewProperties(level: string): ScrewProperties {
  const defaults = getLevelDefaults(level);
  const first = defaults.measurements[0];
  return {
    diameter: first.diameter,
    length: first.lengths[0],
    color: defaults.color,
    headDiameter: first.diameter * 2,
    caudalAngle: 0,
    medialAngle: 0,
    depth: first.lengths[0],
  };
}

/** Create a screw implant anchored at a world point for a given level/side. */
export function makeScrew(
  id: string,
  position: Vec3,
  level: string,
  side: 'L' | 'R',
  simulationId?: string,
): ThreeDImplant {
  return {
    id,
    type: 'screw',
    position,
    direction: DEFAULT_SCREW_DIRECTION,
    properties: defaultScrewProperties(level),
    level,
    side,
    simulationId,
  };
}

/** World-space entry (head) and tip of a screw after applying its angle/depth properties. */
export function screwTrajectory(screw: ThreeDImplant): { entry: Vec3; tip: Vec3 } {
  return getTransformedScrewTrajectory(screw.position, screw.direction, {
    length: screw.properties.length,
    caudalAngle: screw.properties.caudalAngle,
    medialAngle: screw.properties.medialAngle,
    depth: screw.properties.depth,
  });
}

/** Clamp a chosen diameter to the level catalog and snap its length to the nearest offered value. */
export function reconcileScrewSize(
  level: string,
  diameter: number,
  length: number,
): { diameter: number; length: number } {
  const defaults = getLevelDefaults(level);
  const meas =
    defaults.measurements.find((m) => m.diameter === diameter) ?? defaults.measurements[0];
  const lengths = meas.lengths;
  const snapped = lengths.includes(length)
    ? length
    : lengths.reduce((best, l) => (Math.abs(l - length) < Math.abs(best - length) ? l : best), lengths[0]);
  return { diameter: meas.diameter, length: snapped };
}
