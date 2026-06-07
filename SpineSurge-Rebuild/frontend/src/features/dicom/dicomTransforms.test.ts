/* Step 8b behavior lock for the pure DICOM transforms.
 *
 * `getPixelValue` (HU rescale) and `mapToGrayscale` (window/level) live in DICOMParser, whose old host
 * module imports `@/lib/store/types` (not ported wholesale), so they can't be run through the golden
 * oracle. They were copied verbatim, so these hand-verifiable values pin the ported behavior.
 * `getViewportOrientation` (pure string logic from volumeEraser) is locked the same way.
 */
import { describe, expect, it } from 'vitest';
import { getPixelValue, mapToGrayscale, type DicomSlice } from './DICOMParser';
import { getViewportOrientation } from './volumeEraser';

const slice = (rescaleSlope: number, rescaleIntercept: number) =>
  ({ rescaleSlope, rescaleIntercept } as unknown as DicomSlice);

describe('getPixelValue — HU rescale (pixel·slope + intercept)', () => {
  it('identity', () => expect(getPixelValue(100, slice(1, 0))).toBe(100));
  it('CT intercept -1024', () => expect(getPixelValue(1200, slice(1, -1024))).toBe(176));
  it('slope 2', () => expect(getPixelValue(500, slice(2, -1000))).toBe(0));
});

describe('mapToGrayscale — window/level → 0..255', () => {
  it('inside the window', () => expect(mapToGrayscale(-200, 400, 2000)).toBe(51));
  it('clamps below the window', () => expect(mapToGrayscale(-700, 400, 2000)).toBe(0));
  it('clamps above the window', () => expect(mapToGrayscale(1500, 400, 2000)).toBe(255));
  it('at window center', () => expect(mapToGrayscale(400, 400, 2000)).toBe(128));
});

describe('getViewportOrientation — id → plane', () => {
  it('axial', () => expect(getViewportOrientation('CT_AXIAL')).toBe('axial'));
  it('sagittal', () => expect(getViewportOrientation('MPR_SAGITTAL_1')).toBe('sagittal'));
  it('coronal', () => expect(getViewportOrientation('CORONAL_VP')).toBe('coronal'));
  it('defaults to axial', () => expect(getViewportOrientation('VOLUME_3D')).toBe('axial'));
});
