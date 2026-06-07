import dicomParser from 'dicom-parser';
import { DICOMResource } from '@/lib/store/types';

export interface DicomSlice {
    instanceNumber: number;
    sliceLocation: number;
    imagePosition: [number, number, number];
    rows: number;
    columns: number;
    pixelData: Int16Array | Uint16Array | Uint8Array;
    windowCenter: number;
    windowWidth: number;
    rescaleIntercept: number;
    rescaleSlope: number;
    pixelSpacing: [number, number]; // [row, col]
    sliceThickness: number;
}

export async function parseDicomFiles(fileList: DICOMResource[], onProgress?: (percent: number) => void): Promise<DicomSlice[]> {
    const slices: DicomSlice[] = [];
    let processed = 0;

    for (const file of fileList) {
        const arrayBuffer = await file.arrayBuffer();
        const byteArray = new Uint8Array(arrayBuffer);

        try {
            const dataSet = dicomParser.parseDicom(byteArray);

            const rows = dataSet.uint16('x00280010') || 512;
            const columns = dataSet.uint16('x00280011') || 512;
            const bitsAllocated = dataSet.uint16('x00280100') || 16;
            const pixelRepresentation = dataSet.uint16('x00280103') || 0;
            const instanceNumber = dataSet.int32('x00200013') || 0;
            const sliceLocation = dataSet.float('x00201041') || instanceNumber;
            const rescaleIntercept = dataSet.float('x00281052') || 0;
            const rescaleSlope = dataSet.float('x00281053') || 1;
            let windowCenter = dataSet.float('x00281050');
            let windowWidth = dataSet.float('x00281051');

            if (Array.isArray(windowCenter)) windowCenter = windowCenter[0];
            if (Array.isArray(windowWidth)) windowWidth = windowWidth[0];

            if (!windowCenter) windowCenter = 400;
            if (!windowWidth) windowWidth = 2000;

            const ippTag = dataSet.string('x00200032');
            const imagePosition: [number, number, number] = ippTag
                ? ippTag.split('\\').map(parseFloat) as [number, number, number]
                : [0, 0, instanceNumber];

            const psTag = dataSet.string('x00280030');
            const pixelSpacing: [number, number] = psTag
                ? psTag.split('\\').map(parseFloat) as [number, number]
                : [1.0, 1.0];

            const sliceThickness = dataSet.float('x00180050') || 1.0;

            const pixelDataElement = dataSet.elements.x7fe00010;
            if (!pixelDataElement) throw new Error("No pixel data found");

            let pixelBuffer: Int16Array | Uint16Array | Uint8Array;
            if (bitsAllocated === 16) {
                if (pixelRepresentation === 1) {
                    pixelBuffer = new Int16Array(arrayBuffer, pixelDataElement.dataOffset, rows * columns);
                } else {
                    pixelBuffer = new Uint16Array(arrayBuffer, pixelDataElement.dataOffset, rows * columns);
                }
            } else {
                pixelBuffer = new Uint8Array(arrayBuffer, pixelDataElement.dataOffset, rows * columns);
            }

            slices.push({
                instanceNumber,
                sliceLocation,
                imagePosition,
                rows,
                columns,
                pixelData: pixelBuffer,
                windowCenter,
                windowWidth,
                rescaleIntercept,
                rescaleSlope,
                pixelSpacing,
                sliceThickness
            });

        } catch (e) {
            console.warn(`Failed to parse file ${file.name} `, e);
        }

        processed++;
        if (onProgress) onProgress(Math.round((processed / fileList.length) * 100));
    }

    slices.sort((a, b) => a.imagePosition[2] - b.imagePosition[2]);
    return slices;
}

export function getPixelValue(pixel: number, slice: DicomSlice) {
    return (pixel * slice.rescaleSlope) + slice.rescaleIntercept;
}

export function mapToGrayscale(value: number, wc: number, ww: number) {
    const low = wc - (ww / 2);
    const high = wc + (ww / 2);
    if (value <= low) return 0;
    if (value >= high) return 255;
    return Math.round(((value - low) / ww) * 255);
}
