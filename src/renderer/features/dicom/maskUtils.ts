/**
 * Utility functions for processing 3D segmentation masks (Labelmaps)
 */

export interface IslandFilterOptions {
    keepSingleLargest?: boolean;
    minPixelCount?: number;
}

/**
 * Filter out small connected components (islands) from a 3D binary volume.
 * Uses a simple 3D flood-fill / grass-fire algorithm.
 */
export function filterIslands(
    data: Uint8Array | Int16Array | Uint16Array | Float32Array,
    dims: [number, number, number],
    options: IslandFilterOptions = { keepSingleLargest: true }
) {
    const [nx, ny, nz] = dims;
    const size = nx * ny * nz;
    const visited = new Uint8Array(size);
    const components: number[][] = [];

    for (let i = 0; i < size; i++) {
        if (data[i] === 0 || visited[i]) continue;

        // New component found
        const stack: number[] = [i];
        const currentComponent: number[] = [];
        visited[i] = 1;

        while (stack.length > 0) {
            const idx = stack.pop()!;
            currentComponent.push(idx);

            const z = Math.floor(idx / (nx * ny));
            const y = Math.floor((idx % (nx * ny)) / nx);
            const x = idx % nx;

            // Check 6-neighbors
            const neighbors = [
                x > 0 ? idx - 1 : -1,
                x < nx - 1 ? idx + 1 : -1,
                y > 0 ? idx - nx : -1,
                y < ny - 1 ? idx + nx : -1,
                z > 0 ? idx - nx * ny : -1,
                z < nz - 1 ? idx + nx * ny : -1
            ];

            for (const n of neighbors) {
                if (n !== -1 && data[n] !== 0 && !visited[n]) {
                    visited[n] = 1;
                    stack.push(n);
                }
            }
        }
        components.push(currentComponent);
    }

    if (components.length === 0) return;

    // Filter logic - Keep largest + anything bigger than 1% of largest
    let toKeep: number[][] = [];
    if (options.keepSingleLargest) {
        let maxIdx = 0;
        let maxSize = 0;
        for (let i = 0; i < components.length; i++) {
            if (components[i].length > maxSize) {
                maxSize = components[i].length;
                maxIdx = i;
            }
        }

        // Keep largest component
        toKeep.push(components[maxIdx]);

        // Also keep any component that's at least 1% the size of the largest
        // This removes tiny floating particles while keeping significant structures
        const minSize = Math.max(1000, maxSize * 0.01); // At least 1000 voxels or 1% of largest
        for (let i = 0; i < components.length; i++) {
            if (i !== maxIdx && components[i].length >= minSize) {
                toKeep.push(components[i]);
            }
        }

        console.log(`[Island Filter] Kept ${toKeep.length} components (largest: ${maxSize} voxels, threshold: ${minSize} voxels)`);
    } else if (options.minPixelCount) {
        toKeep = components.filter(c => c.length >= (options.minPixelCount || 0));
    }

    // Zero out everything not in toKeep
    const keepSet = new Set<number>();
    for (const c of toKeep) {
        for (const idx of c) keepSet.add(idx);
    }

    for (let i = 0; i < size; i++) {
        if (!keepSet.has(i)) {
            data[i] = 0;
        }
    }
}

/**
 * Apply multi-pass 3D Gaussian blur for ultra-smooth results.
 * Uses weighted averaging for professional-quality smoothing.
 */
export function smoothMask(
    data: Uint8Array | Int16Array | Uint16Array,
    dims: [number, number, number],
    passes: number = 3
): Float32Array {
    const [nx, ny, nz] = dims;
    const size = nx * ny * nz;

    // Convert to float for processing
    let current = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        current[i] = data[i] > 0 ? 1 : 0;
    }

    // Apply multiple smoothing passes
    for (let pass = 0; pass < passes; pass++) {
        const output = new Float32Array(size);

        for (let z = 0; z < nz; z++) {
            for (let y = 0; y < ny; y++) {
                for (let x = 0; x < nx; x++) {
                    const idx = z * nx * ny + y * nx + x;

                    // Weighted 3x3x3 kernel
                    let weightedSum = 0;
                    let totalWeight = 0;

                    for (let dz = -1; dz <= 1; dz++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const sz = z + dz;
                                const sy = y + dy;
                                const sx = x + dx;

                                if (sz >= 0 && sz < nz && sy >= 0 && sy < ny && sx >= 0 && sx < nx) {
                                    const sidx = sz * nx * ny + sy * nx + sx;

                                    // Gaussian-like weights (center has more weight)
                                    const dist = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
                                    const weight = dist === 0 ? 8 : (dist === 1 ? 4 : (dist === 2 ? 2 : 1));

                                    weightedSum += current[sidx] * weight;
                                    totalWeight += weight;
                                }
                            }
                        }
                    }
                    output[idx] = weightedSum / totalWeight;
                }
            }
        }
        current = output;
    }

    return current;
}
