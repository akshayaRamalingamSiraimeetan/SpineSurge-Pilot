import { metaData } from '@cornerstonejs/core';
import { addFileToLoader, addURLToLoader } from '@/lib/cornerstone/initCornerstone';
import { API_BASE } from '@/lib/api';

/**
 * Turn the selected files / stored URLs into the image ids of ONE series.
 * A folder often contains a scout/localiser or several series; mixing them
 * produces a broken volume, so images are grouped by SeriesInstanceUID and
 * the largest series wins (BUGS 3D-19).
 */
export interface SeriesSelection {
    imageIds: string[];
    seriesUID: string | null;
    skipped: number;
}

const absolute = (url: string) =>
    url.startsWith('http') || url.startsWith('blob:') ? url : `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;

export async function loadSeriesImageIds(
    items: (File | string)[],
    onProgress?: (done: number, total: number) => void,
): Promise<SeriesSelection> {
    let done = 0;
    const ids = await Promise.all(items.map(async (item) => {
        const id = typeof item === 'string' ? await addURLToLoader(absolute(item)) : await addFileToLoader(item);
        onProgress?.(++done, items.length);
        return id;
    }));
    const valid = ids.filter((x): x is string => !!x);

    const groups = new Map<string, string[]>();
    for (const id of valid) {
        const series = metaData.get('generalSeriesModule', id)?.seriesInstanceUID ?? 'unknown';
        const plane = metaData.get('imagePlaneModule', id);
        // Skip images without geometry (secondary captures, reports).
        if (!plane?.imagePositionPatient) continue;
        const list = groups.get(series) ?? [];
        list.push(id);
        groups.set(series, list);
    }
    let best: [string, string[]] | null = null;
    for (const entry of groups) if (!best || entry[1].length > best[1].length) best = entry;
    if (!best) return { imageIds: [], seriesUID: null, skipped: valid.length };

    // Order along the slice normal (createAndCacheVolume also sorts, but a
    // deterministic order here keeps progressive loading top-to-bottom).
    const first = metaData.get('imagePlaneModule', best[1][0]);
    const r = first.rowCosines, c = first.columnCosines;
    const n = [r[1] * c[2] - r[2] * c[1], r[2] * c[0] - r[0] * c[2], r[0] * c[1] - r[1] * c[0]];
    const pos = (id: string) => {
        const p = metaData.get('imagePlaneModule', id).imagePositionPatient;
        return p[0] * n[0] + p[1] * n[1] + p[2] * n[2];
    };
    const imageIds = [...best[1]].sort((a, b) => pos(a) - pos(b));
    return { imageIds, seriesUID: best[0], skipped: valid.length - imageIds.length };
}
