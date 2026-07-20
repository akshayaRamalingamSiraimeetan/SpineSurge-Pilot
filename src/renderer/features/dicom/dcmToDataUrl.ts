/**
 * dcmToDataUrl
 *
 * Renders a single DICOM file (.dcm) into a PNG data URL using only
 * dicom-parser and an offscreen canvas — no DICOM mode, no Cornerstone
 * viewer initialisation.
 *
 * The result can be passed directly to loadImage() / setComparisonImage()
 * so the file is treated exactly like a JPEG or PNG in the normal workspace.
 */
import dicomParser from 'dicom-parser';
import { getPixelValue, mapToGrayscale } from './DICOMParser';

export async function dcmFileToDataUrl(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);

    const dataSet = dicomParser.parseDicom(byteArray);

    const rows       = dataSet.uint16('x00280010') || 512;
    const columns    = dataSet.uint16('x00280011') || 512;
    const bitsAlloc  = dataSet.uint16('x00280100') || 16;
    const pixelRep   = dataSet.uint16('x00280103') || 0;
    const rescaleInt = dataSet.float('x00281052') ?? 0;
    const rescaleSlo = dataSet.float('x00281053') ?? 1;

    let wc = dataSet.float('x00281050');
    let ww = dataSet.float('x00281051');
    if (Array.isArray(wc)) wc = wc[0];
    if (Array.isArray(ww)) ww = ww[0];
    if (!wc || !ww) { wc = 400; ww = 2000; }

    const pixelDataElement = dataSet.elements.x7fe00010;
    if (!pixelDataElement) throw new Error('No pixel data found in DICOM file');

    let rawPixels: Int16Array | Uint16Array | Uint8Array;
    if (bitsAlloc === 16) {
        rawPixels = pixelRep === 1
            ? new Int16Array(arrayBuffer, pixelDataElement.dataOffset, rows * columns)
            : new Uint16Array(arrayBuffer, pixelDataElement.dataOffset, rows * columns);
    } else {
        rawPixels = new Uint8Array(arrayBuffer, pixelDataElement.dataOffset, rows * columns);
    }

    // Build a minimal slice descriptor so we can reuse the existing helpers.
    const sliceDescriptor = {
        windowCenter: wc,
        windowWidth:  ww,
        rescaleIntercept: rescaleInt,
        rescaleSlope:     rescaleSlo,
    };

    // Render to an offscreen canvas.
    const canvas  = document.createElement('canvas');
    canvas.width  = columns;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');

    const imageData = ctx.createImageData(columns, rows);
    const pixels    = imageData.data; // Uint8ClampedArray, RGBA

    for (let i = 0; i < rows * columns; i++) {
        const raw   = rawPixels[i] as number;
        const hu    = getPixelValue(raw, sliceDescriptor as any);
        const grey  = mapToGrayscale(hu, wc, ww);
        const base  = i * 4;
        pixels[base]     = grey; // R
        pixels[base + 1] = grey; // G
        pixels[base + 2] = grey; // B
        pixels[base + 3] = 255;  // A
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
}
