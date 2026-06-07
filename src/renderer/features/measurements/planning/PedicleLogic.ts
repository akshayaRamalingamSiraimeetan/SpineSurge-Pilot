import { cache } from '@cornerstonejs/core';
import { add, scale, sub, normalize, mag, Vec3 } from './SurgicalGeometry';

/**
 * Calculates the pedicle axis from landmarks.
 * In the Slicer module, this connects VAP to PIP.
 */
export function calculatePedicleAxis(vap: [number, number, number], pip: [number, number, number]): [number, number, number] {
    return normalize(sub(vap, pip));
}

/**
 * Probes the volume for bone density along a ray.
 * Simulates Helper.probeVolume from Slicer module.
 */
export function probeBoneBoundary(
    volumeId: string,
    origin: [number, number, number],
    direction: [number, number, number],
    threshold: number = 150
): [number, number, number] | null {
    const volume = cache.getVolume(volumeId) as any;
    if (!volume || !volume.getScalarData) return null;

    const scalarData = volume.getScalarData();
    const { dimensions, spacing, origin: volumeOrigin } = volume;

    // Convert world to IJK (simplified for LPS)
    const worldToIJK = (world: [number, number, number]): [number, number, number] => {
        const ijk = [0, 0, 0];
        for (let i = 0; i < 3; i++) {
            ijk[i] = Math.round((world[i] - volumeOrigin[i]) / spacing[i]);
        }
        return ijk as [number, number, number];
    };

    const getVal = (ijk: [number, number, number]) => {
        if (ijk[0] < 0 || ijk[0] >= dimensions[0] ||
            ijk[1] < 0 || ijk[1] >= dimensions[1] ||
            ijk[2] < 0 || ijk[2] >= dimensions[2]) return -1024;

        const index = ijk[2] * dimensions[0] * dimensions[1] + ijk[1] * dimensions[0] + ijk[0];
        return scalarData[index];
    };

    // Probe along ray from origin in direction
    // Search up to 100mm
    for (let distance = 0; distance < 100; distance += 1) {
        const point = add(origin, scale(direction, distance));
        const ijk = worldToIJK(point);
        if (getVal(ijk) > threshold) {
            return point;
        }
    }

    return null;
}

/**
 * Estimates screw dimensions based on pedicle anatomy.
 */
export function estimateScrewDimensions(
    volumeId: string,
    vap: [number, number, number],
    pip: [number, number, number]
): { diameter: number; length: number } {
    const axis = calculatePedicleAxis(vap, pip);
    const boneEntry = probeBoneBoundary(volumeId, pip, scale(axis, -1)); // Search backwards for cortical entry

    let length = 40; // Default
    if (boneEntry) {
        const distToVap = mag(sub(vap, boneEntry));
        // Round to nearest 5mm, similar to Slicer logic
        length = Math.max(30, Math.min(70, Math.round(distToVap / 5) * 5));
    }

    // Diameter estimation (simplified implementation of estimateDim)
    // In a real app, we'd probe multiple rays to find the narrowest part
    let diameter = 6.5;

    return { diameter, length };
}

/**
 * Calculates bone contact percentage for a screw.
 * Used for "Grade Screws" feature.
 */
export function calculateBoneContact(
    volumeId: string,
    position: [number, number, number],
    _direction: [number, number, number],
    _length: number,
    _diameter: number,
    threshold: number = 200
): number {
    const volume = cache.getVolume(volumeId) as any;
    if (!volume || !volume.getScalarData) return 0;

    const scalarData = volume.getScalarData();
    const { dimensions, spacing, origin: volumeOrigin } = volume;

    let hits = 0;
    const samples = 20;

    for (let i = 0; i < samples; i++) {
        const dist = (i / (samples - 1)) * _length;
        const point = add(position, scale(_direction, dist));

        // IJK conversion
        const ijk = [
            Math.round((point[0] - volumeOrigin[0]) / spacing[0]),
            Math.round((point[1] - volumeOrigin[1]) / spacing[1]),

            
            Math.round((point[2] - volumeOrigin[2]) / spacing[2])
        ];

        if (ijk[0] >= 0 && ijk[0] < dimensions[0] &&
            ijk[1] >= 0 && ijk[1] < dimensions[1] &&
            ijk[2] >= 0 && ijk[2] < dimensions[2]) {
            const index = ijk[2] * dimensions[0] * dimensions[1] + ijk[1] * dimensions[0] + ijk[0];
            if (scalarData[index] > threshold) hits++;
        }
    }

    return (hits / samples) * 100;
}

/**
 * Calculates the Center-to-Center (CD) distance between two screws.
 */
export function calculateScrewDistance(posA: Vec3, posB: Vec3): number {
    return mag(sub(posA, posB));
}

/**
 * Formats world coordinates (LPS) for display as "Coordinate Data" (CD).
 */
export function formatCoordinateData(pos: Vec3): string {
    return `[${pos[0].toFixed(1)}, ${pos[1].toFixed(1)}, ${pos[2].toFixed(1)}]`;
}
