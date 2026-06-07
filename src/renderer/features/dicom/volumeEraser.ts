import { Enums as ToolsEnums } from '@cornerstonejs/tools';
import { cache } from '@cornerstonejs/core';

/**
 * Custom 3D Volumetric Eraser
 * Erases all voxels within a 2D region through the entire volume depth
 */
export function erase3DRegion(
    segmentationId: string,
    viewportId: string,
    bounds: { x: number; y: number; width: number; height: number },
    orientation: 'axial' | 'sagittal' | 'coronal'
) {
    const segVolume = cache.getVolume(segmentationId) as any;
    if (!segVolume || !segVolume.scalarData) return;

    const dimensions = segVolume.dimensions as [number, number, number];
    const [nx, ny, nz] = dimensions;
    const data = segVolume.scalarData as Uint8Array;

    // Convert screen bounds to volume coordinates
    const { x, y, width, height } = bounds;
    const x1 = Math.floor(x);
    const y1 = Math.floor(y);
    const x2 = Math.floor(x + width);
    const y2 = Math.floor(y + height);

    console.log('[3D Eraser] Erasing region:', { x1, y1, x2, y2, orientation });

    // Erase through entire depth based on orientation
    if (orientation === 'axial') {
        // XY plane, erase through all Z
        for (let z = 0; z < nz; z++) {
            for (let y = Math.max(0, y1); y < Math.min(ny, y2); y++) {
                for (let x = Math.max(0, x1); x < Math.min(nx, x2); x++) {
                    const idx = z * nx * ny + y * nx + x;
                    data[idx] = 0;
                }
            }
        }
    } else if (orientation === 'sagittal') {
        // YZ plane, erase through all X
        for (let x = 0; x < nx; x++) {
            for (let z = Math.max(0, y1); z < Math.min(nz, y2); z++) {
                for (let y = Math.max(0, x1); y < Math.min(ny, x2); y++) {
                    const idx = z * nx * ny + y * nx + x;
                    data[idx] = 0;
                }
            }
        }
    } else if (orientation === 'coronal') {
        // XZ plane, erase through all Y
        for (let y = 0; y < ny; y++) {
            for (let z = Math.max(0, y1); z < Math.min(nz, y2); z++) {
                for (let x = Math.max(0, x1); x < Math.min(nx, x2); x++) {
                    const idx = z * nx * ny + y * nx + x;
                    data[idx] = 0;
                }
            }
        }
    }

    segVolume.modified();
    console.log('[3D Eraser] ✓ Erased through entire volume depth');
}

/**
 * Helper to get viewport orientation
 */
export function getViewportOrientation(viewportId: string): 'axial' | 'sagittal' | 'coronal' {
    if (viewportId.includes('AXIAL')) return 'axial';
    if (viewportId.includes('SAGITTAL')) return 'sagittal';
    if (viewportId.includes('CORONAL')) return 'coronal';
    return 'axial';
}
