/* Segmentation labelmap setup + HU iso-threshold masking for the 3D workspace.
 *
 * Ported from the old CornerstoneViewer's segmentation effects. Creates a derived labelmap volume,
 * binds it to every viewport, then fills it by thresholding the reference volume (voxels ≥ isoHU → 1).
 * Activating the scissors tool lets the surgeon carve the mask.
 *
 * The Cornerstone tools segmentation API is reached through a narrow structural interface (`SegModule`)
 * rather than the upstream types, so this stays type-safe across loader versions without `any`. The
 * voxel-level behavior is verified against a live volume via `/dicom-verify`, not in unit tests. */
import { cache } from '@cornerstonejs/core';

export const SEGMENTATION_ID = 'spine-segmentation';

/** Flip to true to trace the threshold write path in the console (filter for "[seg]"). */
const SEG_DEBUG = true;

/** A streaming volume in CS v4 has no single scalar array — its voxels live in per-slice images. */
interface ScalarVolume {
  modified?: () => void;
  imageIds?: string[];
}
interface CornerstoneImage {
  getPixelData?: () => { length: number; [i: number]: number };
  /** Modality-LUT rescale: HU = stored * slope + intercept. */
  slope?: number;
  intercept?: number;
}

interface SegModule {
  segmentation: {
    state: {
      getSegmentations(): Array<{ segmentationId: string }>;
      getSegmentationRepresentations(viewportId: string): Array<{ segmentationId: string }> | undefined;
    };
    addSegmentations(input: unknown[]): Promise<void>;
    addSegmentationRepresentations(viewportId: string, input: unknown[]): Promise<void>;
    segmentIndex: { setActiveSegmentIndex(segmentationId: string, index: number): void };
    config: {
      visibility: { setSegmentationRepresentationVisibility(viewportId: string, specifier: unknown, visible: boolean): void };
      style: { setStyle(specifier: unknown, style: unknown): void };
    };
    triggerSegmentationEvents?: { triggerSegmentationDataModified?: (segmentationId: string) => void };
  };
  Enums: { SegmentationRepresentations: { Labelmap: unknown } };
}

interface VolumeLoaderLike {
  createAndCacheDerivedVolume(refId: string, opts: { volumeId: string }): unknown;
}

/** Ensure the labelmap volume exists, is bound to every viewport, and is styled. Idempotent. */
export async function ensureSegmentation(
  toolsModule: unknown,
  volumeLoader: VolumeLoaderLike,
  refVolumeId: string,
  viewportIds: string[],
  render: () => void,
): Promise<void> {
  const { segmentation, Enums } = toolsModule as SegModule;
  const labelmap = Enums.SegmentationRepresentations.Labelmap;

  if (!segmentation.state.getSegmentations().some((s) => s.segmentationId === SEGMENTATION_ID)) {
    await volumeLoader.createAndCacheDerivedVolume(refVolumeId, { volumeId: SEGMENTATION_ID });
    await segmentation.addSegmentations([
      { segmentationId: SEGMENTATION_ID, representation: { type: labelmap, data: { volumeId: SEGMENTATION_ID } } },
    ]);
    if (SEG_DEBUG) console.info('[seg] created labelmap volume + segmentation');
  }

  for (const vpId of viewportIds) {
    const reps = segmentation.state.getSegmentationRepresentations(vpId);
    if (!reps?.some((r) => r.segmentationId === SEGMENTATION_ID)) {
      await segmentation.addSegmentationRepresentations(vpId, [{ segmentationId: SEGMENTATION_ID, type: labelmap }]);
      segmentation.config.visibility.setSegmentationRepresentationVisibility(
        vpId,
        { segmentationId: SEGMENTATION_ID, type: labelmap },
        true,
      );
      if (SEG_DEBUG) console.info(`[seg] bound representation to ${vpId}`);
    }
  }

  segmentation.segmentIndex.setActiveSegmentIndex(SEGMENTATION_ID, 1);
  segmentation.config.style.setStyle({ type: labelmap }, { fillAlpha: 0.7, outlineWidth: 2 });
  render();
}

/**
 * Threshold the reference volume into the labelmap (HU ≥ isoHU → segment 1), written per-slice via
 * each image's pixel data — the robust path for CS v4 streaming volumes (a volume-level scalar array
 * doesn't exist and `getScalarData()` throws). Stored values are rescaled to HU per the modality LUT
 * so the threshold is in true Hounsfield units. Returns the voxel count written (0 if not ready).
 * Fire `notifySegmentationModified` afterward so the labelmap texture re-uploads.
 */
export function applyIsoThreshold(refVolumeId: string, isoHU: number): number {
  const ref = cache.getVolume(refVolumeId) as unknown as ScalarVolume | undefined;
  const seg = cache.getVolume(SEGMENTATION_ID) as unknown as ScalarVolume | undefined;
  const refIds = ref?.imageIds;
  const segIds = seg?.imageIds;
  if (!ref || !seg || !refIds || !segIds || refIds.length !== segIds.length) {
    if (SEG_DEBUG) console.warn('[seg] threshold skipped', { ref: !!ref, seg: !!seg, refIds: refIds?.length, segIds: segIds?.length });
    return 0;
  }

  let written = 0;
  for (let s = 0; s < refIds.length; s++) {
    const refImg = cache.getImage(refIds[s]) as unknown as CornerstoneImage | undefined;
    const segImg = cache.getImage(segIds[s]) as unknown as CornerstoneImage | undefined;
    const refData = refImg?.getPixelData?.();
    const segData = segImg?.getPixelData?.();
    if (!refData || !segData) continue;
    const slope = refImg?.slope ?? 1;
    const intercept = refImg?.intercept ?? 0;
    const m = Math.min(refData.length, segData.length);
    for (let j = 0; j < m; j++) segData[j] = (refData[j] * slope + intercept) >= isoHU ? 1 : 0;
    written += m;
  }
  seg.modified?.();
  if (SEG_DEBUG) console.info('[seg] thresholded per-image', { slices: refIds.length, voxels: written, isoHU });
  return written;
}

/** Tell Cornerstone the labelmap data changed so every bound viewport repaints it. */
export function notifySegmentationModified(toolsModule: unknown): void {
  const { segmentation } = toolsModule as SegModule;
  segmentation.triggerSegmentationEvents?.triggerSegmentationDataModified?.(SEGMENTATION_ID);
}
