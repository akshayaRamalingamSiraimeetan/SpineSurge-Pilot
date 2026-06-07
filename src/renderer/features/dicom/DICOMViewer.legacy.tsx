import { useEffect, useRef, useState, useMemo } from "react";
import dicomParser from 'dicom-parser';

// VTK Imports
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkCylinderSource from '@kitware/vtk.js/Filters/Sources/CylinderSource';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkImageMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes';
import vtkAppendPolyData from '@kitware/vtk.js/Filters/General/AppendPolyData';
import vtkMatrixBuilder from '@kitware/vtk.js/Common/Core/MatrixBuilder';
import vtkCutter from '@kitware/vtk.js/Filters/Core/Cutter';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import { useAppStore } from "@/lib/store/index";
import {
    PedicleScrewParams,
    getScrewTip,
    mag,
    normalize,
    sub,
    Vec3
} from "@/features/measurements/planning/SurgicalGeometry";

import { v4 as uuidv4 } from 'uuid'; // Standardize uuid import if needed, assuming uuid is available or use custom gen
import { cn } from "@/lib/utils";
import {
    Maximize,
    Minimize,
    AlertTriangle,
    Cuboid
} from "lucide-react";

interface DICOMViewerProps {
    fileList: File[];
    onFilesSelected?: (files: File[]) => void; // Added for error recovery
}

interface DicomSlice {
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

const MetadataOverlay = ({ metadata, stats }: { metadata: any, stats: any }) => {
    if (!metadata) return null;
    return (
        <div className="absolute top-4 right-4 text-right z-40 pointer-events-none select-none drop-shadow-md">
            <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-black text-white uppercase tracking-tighter">
                    {metadata.patientName || "Anonymous Patient"}
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                    ID: {metadata.patientID || "N/A"}
                </span>
                <span className="text-[9px] font-bold text-slate-500">
                    {metadata.studyDate ? `${metadata.studyDate.slice(0, 4)}-${metadata.studyDate.slice(4, 6)}-${metadata.studyDate.slice(6, 8)}` : "N/A"} | {metadata.modality || "CT"}
                </span>
                {stats && (
                    <span className="text-[9px] font-bold text-blue-500/60 mt-1 uppercase tracking-widest tabular-nums">
                        W: {Math.round(stats.ww)} L: {Math.round(stats.wc)}
                    </span>
                )}
            </div>
        </div>
    );
};

// --- VTK Helpers for Real 2D Slicing ---
function getScrewWorldPolyData(p: PedicleScrewParams) {
    const shaftSource = vtkCylinderSource.newInstance({
        height: p.length,
        radius: p.coreDiameter / 2,
        resolution: 48
    });
    const shaftData = shaftSource.getOutputData();

    const headHeight = p.headDiameter ? p.headDiameter * 0.8 : p.coreDiameter * 1.6;
    const tulipSource = vtkCylinderSource.newInstance({
        height: headHeight,
        radius: p.headDiameter / 2,
        resolution: 48
    });
    const tulipData = tulipSource.getOutputData();

    // Local coordinates: cylinder centered at 0, Y-aligned.
    vtkMatrixBuilder.buildFromRadian()
        .translate(0, p.length / 2, 0)
        .apply(shaftData.getPoints().getData());

    // World transformation
    const ex = p.entry;
    const axis = p.axis;
    const worldMatrix = vtkMatrixBuilder.buildFromRadian()
        .translate(ex[0], ex[1], ex[2])
        .rotateFromDirections([0, 1, 0], axis);

    worldMatrix.apply(shaftData.getPoints().getData());
    worldMatrix.apply(tulipData.getPoints().getData());

    const append = vtkAppendPolyData.newInstance();
    append.addInputData(shaftData);
    append.addInputData(tulipData);
    return append.getOutputData();
}

function drawVTKSlicedScrew(
    ctx: CanvasRenderingContext2D,
    params: PedicleScrewParams,
    planeOrigin: [number, number, number],
    planeNormal: [number, number, number],
    viewType: 'axial' | 'sagittal' | 'coronal',
    spacing: [number, number],
    sliceThin: number,
    color: string,
    isSelected: boolean
) {
    const worldPolyData = getScrewWorldPolyData(params);
    const plane = vtkPlane.newInstance({
        origin: planeOrigin,
        normal: planeNormal
    });

    const cutter = vtkCutter.newInstance();
    cutter.setCutFunction(plane);
    cutter.setInputData(worldPolyData);
    cutter.update();

    const sliceData = cutter.getOutputData();
    const points = sliceData.getPoints().getData();
    const lines = sliceData.getLines().getData();

    if (!points || !lines || points.length === 0) return;

    ctx.save();
    ctx.strokeStyle = isSelected ? '#ffffff' : color;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = `${color}66`;

    let i = 0;
    while (i < lines.length) {
        const n = lines[i++];
        if (n < 2) {
            i += n;
            continue;
        }

        ctx.beginPath();
        for (let j = 0; j < n; j++) {
            const idx = lines[i++] * 3;
            const x = points[idx];
            const y = points[idx + 1];
            const z = points[idx + 2];

            let sx = 0, sy = 0;
            if (viewType === 'axial') {
                sx = x / spacing[1];
                sy = y / spacing[0];
            } else if (viewType === 'sagittal') {
                sx = y / spacing[0];
                sy = z / sliceThin;
            } else if (viewType === 'coronal') {
                sx = x / spacing[1];
                sy = z / sliceThin;
            }

            if (j === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        ctx.fill();
    }
    ctx.restore();
}

export const DICOMViewer = ({ fileList, onFilesSelected }: DICOMViewerProps) => {
    // Volume Data
    const [volume, setVolume] = useState<DicomSlice[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    // Current Slice Index for each view
    const [axialIndex, setAxialIndex] = useState(0);
    const [sagittalIndex, setSagittalIndex] = useState(0);
    const [coronalIndex, setCoronalIndex] = useState(0);

    // Stats for auto-windowing / 3D
    const [volumeStats, setVolumeStats] = useState<{ min: number, max: number, wc: number, ww: number } | null>(null);

    // Dimensions
    const dimensions = useMemo(() => {
        if (volume.length === 0) return { x: 0, y: 0, z: 0 };
        return {
            x: volume[0].columns,
            y: volume[0].rows,
            z: volume.length
        };
    }, [volume]);

    // Canvas Refs
    const axialCanvasRef = useRef<HTMLCanvasElement>(null);
    const sagittalCanvasRef = useRef<HTMLCanvasElement>(null);
    const coronalCanvasRef = useRef<HTMLCanvasElement>(null);
    const vtkContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null); // Main container ref
    const vtkContext = useRef<any>(null); // To store renderWindow, renderer, etc.

    // 3D Implant & Segmentation State
    const {
        threeDImplants,
        addThreeDImplant,
        updateThreeDImplant,
        dicom3D,
        setDicomActiveView,
        setDicomMetadata,
        setSelectedDicomImplant,
        setCalibration
    } = useAppStore();

    // Destructure for easier access
    const { interactionMode, renderMode, isoThreshold, activeView, layoutMode, metadata, showMetadataOverlay, selectedImplantId } = dicom3D;

    // Drag-to-place state
    const [placementStart, setPlacementStart] = useState<[number, number, number] | null>(null);
    const [placementCurrent, setPlacementCurrent] = useState<[number, number, number] | null>(null);
    const [isPlacing, setIsPlacing] = useState(false);
    const [dragTarget, setDragTarget] = useState<{ id: string, type: 'start' | 'end' } | null>(null);

    // Resizable Panel Logic
    const [leftPanelWidth, setLeftPanelWidth] = useState(66); // Percentage
    const isResizingRef = useRef(false);

    const startResizing = (e: React.MouseEvent) => {
        isResizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizingRef.current || !containerRef.current) return;
            const containerWidth = containerRef.current.clientWidth;
            const newWidth = (e.clientX / containerWidth) * 100;
            setLeftPanelWidth(Math.max(20, Math.min(80, newWidth)));
        };

        const handleMouseUp = () => {
            isResizingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // 3D Implant & Segmentation State
    // 3D Implant & Segmentation State
    // Simplified destructuring above

    const implantActors = useRef<Map<string, vtkActor>>(new Map());
    const volumeActor = useRef<vtkVolume | null>(null);
    const isoActor = useRef<vtkActor | null>(null);



    // --- DICOM Parsing Logic ---
    useEffect(() => {
        if (!fileList || fileList.length === 0) return;

        const parseFiles = async () => {
            setIsLoading(true);
            setLoadingProgress(0);
            setError(null);

            const slices: DicomSlice[] = [];
            let processed = 0;

            try {
                for (const file of fileList) {
                    const arrayBuffer = await file.arrayBuffer();
                    const byteArray = new Uint8Array(arrayBuffer);

                    try {
                        const dataSet = dicomParser.parseDicom(byteArray);

                        // Extract basic tags
                        const rows = dataSet.uint16('x00280010') || 512;
                        const columns = dataSet.uint16('x00280011') || 512;
                        const bitsAllocated = dataSet.uint16('x00280100') || 16;
                        const pixelRepresentation = dataSet.uint16('x00280103') || 0; // 0=unsigned, 1=signed
                        const instanceNumber = dataSet.int32('x00200013') || 0;
                        const sliceLocation = dataSet.float('x00201041') || instanceNumber;
                        const rescaleIntercept = dataSet.float('x00281052') || 0;
                        const rescaleSlope = dataSet.float('x00281053') || 1;
                        let windowCenter = dataSet.float('x00281050');
                        let windowWidth = dataSet.float('x00281051');

                        // Handle array values for window tags
                        if (Array.isArray(windowCenter)) windowCenter = windowCenter[0];
                        if (Array.isArray(windowWidth)) windowWidth = windowWidth[0];

                        // Default Window if missing (Bone/Soft Tissue approx)
                        if (!windowCenter) windowCenter = 400;
                        if (!windowWidth) windowWidth = 2000;

                        // Image Position (Patient)
                        const ippTag = dataSet.string('x00200032');
                        const imagePosition: [number, number, number] = ippTag
                            ? ippTag.split('\\').map(parseFloat) as [number, number, number]
                            : [0, 0, instanceNumber];

                        // Pixel Spacing (Reconstructed distance between pixels)
                        const psTag = dataSet.string('x00280030');
                        // Imager Pixel Spacing (Physical distance on detector - for radiographs)
                        const ipsTag = dataSet.string('x00181164');

                        const psInput = psTag || ipsTag;
                        const pixelSpacing: [number, number] = psInput
                            ? psInput.split('\\').map(parseFloat) as [number, number]
                            : [1.0, 1.0];

                        // Slice Thickness
                        const sliceThickness = dataSet.float('x00180050') || 1.0;

                        // Extract Pixel Data
                        const pixelDataElement = dataSet.elements.x7fe00010;
                        if (!pixelDataElement) throw new Error("No pixel data found");

                        let pixelBuffer: Int16Array | Uint16Array | Uint8Array;

                        // Assuming uncompressed for now (Transfer Syntax typically implicit/explicit Little Endian)
                        // If pixel data offset is known
                        if (bitsAllocated === 16) {
                            if (pixelRepresentation === 1) {
                                pixelBuffer = new Int16Array(arrayBuffer, pixelDataElement.dataOffset, rows * columns);
                            } else {
                                pixelBuffer = new Uint16Array(arrayBuffer, pixelDataElement.dataOffset, rows * columns);
                            }
                        } else {
                            pixelBuffer = new Uint8Array(arrayBuffer, pixelDataElement.dataOffset, rows * columns);
                        }

                        // Extract Metadata from first slice
                        if (slices.length === 0) {
                            const metadata = {
                                patientName: dataSet.string('x00100010'),
                                patientID: dataSet.string('x00100020'),
                                patientBirthDate: dataSet.string('x00100030'),
                                patientSex: dataSet.string('x00100040'),
                                studyDate: dataSet.string('x00080020'),
                                studyDescription: dataSet.string('x00081030'),
                                seriesDescription: dataSet.string('x0008103e'),
                                modality: dataSet.string('x00080060'),
                                manufacturer: dataSet.string('x00080070'),
                                institutionName: dataSet.string('x00080080'),
                            };
                            setDicomMetadata(metadata);

                            // Auto-calibrate based on Pixel Spacing (mm per pixel distance)
                            if (pixelSpacing && pixelSpacing[0] > 0) {
                                setCalibration(pixelSpacing[0]);
                                console.log(`Auto-calibrating DICOM: ${pixelSpacing[0]} mm/px`);
                            }
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
                    setLoadingProgress(Math.round((processed / fileList.length) * 100));
                }

                // Sort slices by Z position (Slice Location or Image Position Z)
                slices.sort((a, b) => a.imagePosition[2] - b.imagePosition[2]); // Ascending
                // Or descending depending on acquisition. Usually we want Head->Feet or similar.

                // Auto-calculate Window/Level if tags are missing or weird (e.g. extremely small)
                let calculatedWC = 400;
                let calculatedWW = 2000;

                // Simple Min/Max scan on the first slice to guess better defaults if needed
                if (slices.length > 0) {
                    const sample = slices[Math.floor(slices.length / 2)];
                    let min = Infinity;
                    let max = -Infinity;
                    // Sample center row
                    for (let i = 0; i < sample.pixelData.length; i += 10) {
                        const val = sample.pixelData[i];
                        if (val < min) min = val;
                        if (val > max) max = val;
                    }
                    // Apply rescale
                    min = min * sample.rescaleSlope + sample.rescaleIntercept;
                    max = max * sample.rescaleSlope + sample.rescaleIntercept;

                    calculatedWC = (max + min) / 2;
                    calculatedWW = max - min;

                    // Save stats for 3D
                    setVolumeStats({ min, max, wc: calculatedWC, ww: calculatedWW });
                }

                // Fix bad window values from tags
                const fixedSlices = slices.map(s => {
                    let wc = s.windowCenter;
                    let ww = s.windowWidth;

                    // If values are tiny (likely parsing error or normalized 0-1 range misinterpret), use calculated
                    if (Math.abs(ww) < 0.1 || Math.abs(wc) < 0.1) {
                        wc = calculatedWC;
                        ww = calculatedWW;
                    }

                    return { ...s, windowCenter: wc, windowWidth: ww };
                });

                setVolume(fixedSlices);
                // Set initial indices to middle
                setAxialIndex(Math.floor(fixedSlices.length / 2));
                setSagittalIndex(Math.floor(fixedSlices[0]?.columns / 2) || 0);
                setCoronalIndex(Math.floor(fixedSlices[0]?.rows / 2) || 0);

            } catch (err: any) {
                console.error("DICOM Load Error:", err);
                setError("Failed to load DICOM series. Ensure files are uncompressed.");
            } finally {
                setIsLoading(false);
            }
        };

        parseFiles();
    }, [fileList]);


    // --- Rendering Helpers ---

    // Convert Helper: Apply Window/Level and Rescale
    const getPixelValue = (pixel: number, slice: DicomSlice) => {
        const val = (pixel * slice.rescaleSlope) + slice.rescaleIntercept;
        return val;
    };

    const mapToGrayscale = (value: number, wc: number, ww: number) => {
        const low = wc - (ww / 2);
        const high = wc + (ww / 2);

        if (value <= low) return 0;
        if (value >= high) return 255;
        return Math.round(((value - low) / ww) * 255);
    };

    // --- Rendering Logic ---

    // Axial: Standard Render
    useEffect(() => {
        const canvas = axialCanvasRef.current;
        if (!canvas || volume.length === 0 || !volume[axialIndex]) return;

        const slice = volume[axialIndex];
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imgData = ctx.createImageData(slice.columns, slice.rows);
        const data = imgData.data;

        for (let i = 0; i < slice.pixelData.length; i++) {
            const val = getPixelValue(slice.pixelData[i], slice);
            const gray = mapToGrayscale(val, slice.windowCenter, slice.windowWidth);
            data[4 * i] = gray;
            data[4 * i + 1] = gray;
            data[4 * i + 2] = gray;
            data[4 * i + 3] = 255; // Alpha
        }

        // Clear and draw (scaling to fit usually required, but for MVP we draw native resolution)
        // ideally we scale canvas CSS to fit container, but internal resolution matches image
        canvas.width = slice.columns;
        canvas.height = slice.rows;
        ctx.putImageData(imgData, 0, 0);

        // Draw crosshairs
        ctx.strokeStyle = 'rgba(0, 150, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Coronal line (horizontal) -> corresponds to Coronal Index ("y")
        ctx.moveTo(0, coronalIndex);
        ctx.lineTo(slice.columns, coronalIndex);
        // Sagittal line (vertical) -> corresponds to Sagittal Index ("x")
        ctx.moveTo(sagittalIndex, 0);
        ctx.lineTo(sagittalIndex, slice.rows);
        ctx.stroke();

        // --- Render 3D Implants Projected on Axial ---
        threeDImplants.forEach(imp => {
            if (imp.type !== 'screw') return;

            const params: PedicleScrewParams = {
                id: imp.id,
                entry: imp.position,
                axis: imp.direction,
                length: imp.properties.length,
                coreDiameter: imp.properties.diameter,
                headDiameter: imp.properties.headDiameter || imp.properties.diameter * 2.5,
                color: imp.properties.color
            };

            const spacing = volume[0].pixelSpacing;
            const sliceThin = volume[0].sliceThickness;
            const planeZ = axialIndex * sliceThin;
            const isSelected = selectedImplantId === imp.id;

            // PART C — Real VTK Slicing (Step 3 & 4)
            drawVTKSlicedScrew(
                ctx,
                params,
                [0, 0, planeZ],
                [0, 0, 1],
                'axial',
                [spacing[0], spacing[1]],
                sliceThin,
                params.color,
                isSelected
            );

            // Trajectory Overlay
            if (isSelected) {
                const tipVal = getScrewTip(params);
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = params.color;
                ctx.setLineDash([2, 4]);
                ctx.moveTo(params.entry[0] / spacing[1], params.entry[1] / spacing[0]);
                ctx.lineTo(tipVal[0] / spacing[1], tipVal[1] / spacing[0]);
                ctx.stroke();

                // Labels (Diameter/Length)
                ctx.fillStyle = '#f97316';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.font = 'bold 12px Inter';
                const mx = (params.entry[0] + tipVal[0]) / 2 / spacing[1];
                const my = (params.entry[1] + tipVal[1]) / 2 / spacing[0];
                ctx.strokeText(`Ø ${params.coreDiameter}`, mx + 10, my - 5);
                ctx.fillText(`Ø ${params.coreDiameter}`, mx + 10, my - 5);
                ctx.strokeText(`↕ ${Math.round(params.length)}`, mx + 10, my + 10);
                ctx.fillText(`↕ ${Math.round(params.length)}`, mx + 10, my + 10);
                ctx.restore();
            }
        });

        // --- Render Ghost Screw (if placing) ---
        if (isPlacing && placementStart && placementCurrent && activeView === 'axial') {
            const spacing = volume[0].pixelSpacing;
            const px1 = placementStart[0];
            const py1 = placementStart[1];
            const px2 = placementCurrent[0];
            const py2 = placementCurrent[1];

            const dx = px2 - px1;
            const dy = py2 - py1;
            const dist = Math.sqrt(dx * dx + dy * dy);

            drawVTKSlicedScrew(
                ctx,
                {
                    id: 'ghost',
                    entry: placementStart,
                    axis: normalize([dx, dy, 0]),
                    length: dist,
                    coreDiameter: 6,
                    headDiameter: 15,
                    color: '#a855f7'
                },
                [0, 0, axialIndex * volume[0].sliceThickness],
                [0, 0, 1],
                'axial',
                [spacing[0], spacing[1]],
                volume[0].sliceThickness,
                '#a855f7',
                true
            );
        }

    }, [volume, axialIndex, coronalIndex, sagittalIndex, activeView, layoutMode, threeDImplants, isPlacing, placementStart, placementCurrent]);

    // Sagittal: MPR (YZ plane, sliced at X = sagittalIndex)
    useEffect(() => {
        const canvas = sagittalCanvasRef.current;
        if (!canvas || volume.length === 0) return;

        // Actually Sagittal is usually Y-Z. X is fixed.
        // Screen X = "y" (from original image), Screen Y = "z" (slice index)
        // Or Orientation dependent. Let's assume standard Axial stack.
        // Sagittal view usually shows Posterior-Anterior (columns/y) vs Head-Feet (slices/z)
        // Let's standard: X-axis on screen = Y-axis of volume (rows). Y-axis on screen = Z-axis of volume (slices).

        // Wait, Sagittal is side view.
        // X is depth (fixed). We see Y (rows) and Z (slices).
        // Let's fix X (sagittalIndex). Iterate Y (rows) and Z (slices).
        // Screen Wid = Rows. Screen Hgt = Slices.

        canvas.width = volume[0].rows;
        canvas.height = volume.length;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imgData = ctx.createImageData(volume[0].rows, volume.length); // width x height
        const data = imgData.data;

        // Ensure sagittalIndex is valid
        const x = Math.min(Math.max(0, sagittalIndex), volume[0].columns - 1);


        // We iterate over Z (screen Y) and Original Y (screen X)
        for (let z = 0; z < volume.length; z++) {
            // We need to invert Z if slices are bottom-up? Usually Head-Feet.
            // Screen Y=0 is top. Z=0 is usually first slice (could be top or bottom).
            // Let's assume monotonic.

            const slice = volume[z];
            // The pixel buffer is row-major: index = y * width + x
            // We want the column x for all rows.

            for (let y = 0; y < slice.rows; y++) {
                const pixelIndex = (y * slice.columns) + x;
                const val = getPixelValue(slice.pixelData[pixelIndex], slice);
                const gray = mapToGrayscale(val, slice.windowCenter, slice.windowWidth);

                // Screen pixel index
                // Screen Row = z. Screen Col = y.
                const screenIdx = (z * slice.rows + y) * 4;

                data[screenIdx] = gray;
                data[screenIdx + 1] = gray;
                data[screenIdx + 2] = gray;
                data[screenIdx + 3] = 255;
            }
        }

        ctx.putImageData(imgData, 0, 0);

        // Crosshairs
        ctx.strokeStyle = 'rgba(0, 150, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Top-Down line corresponding to Axial Z
        // Z is Screen Y.
        ctx.moveTo(0, axialIndex);
        ctx.lineTo(canvas.width, axialIndex);
        // Horizontal line corresponding to Coronal Y
        // Y is Screen X
        ctx.moveTo(coronalIndex, 0);
        ctx.lineTo(coronalIndex, canvas.height);
        ctx.stroke();

        // --- Render 3D Implants Projected on Sagittal ---
        threeDImplants.forEach(imp => {
            if (imp.type !== 'screw') return;

            const params: PedicleScrewParams = {
                id: imp.id,
                entry: imp.position,
                axis: imp.direction,
                length: imp.properties.length,
                coreDiameter: imp.properties.diameter,
                headDiameter: imp.properties.headDiameter || imp.properties.diameter * 2.5,
                color: imp.properties.color
            };

            const spacing = volume[0].pixelSpacing;
            const sliceThin = volume[0].sliceThickness;
            const planeX = sagittalIndex * spacing[1];
            const isSelected = selectedImplantId === imp.id;

            drawVTKSlicedScrew(
                ctx,
                params,
                [planeX, 0, 0],
                [1, 0, 0],
                'sagittal',
                [spacing[0], spacing[1]],
                sliceThin,
                params.color,
                isSelected
            );

            // Trajectory Overlay
            if (isSelected) {
                const tipVal = getScrewTip(params);
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = params.color;
                ctx.setLineDash([2, 4]);
                ctx.moveTo(params.entry[1] / spacing[0], params.entry[2] / sliceThin);
                ctx.lineTo(tipVal[1] / spacing[0], tipVal[2] / sliceThin);
                ctx.stroke();
                ctx.restore();
            }
        });

        // --- Render Ghost Screw (if placing) ---
        if (isPlacing && placementStart && placementCurrent && activeView === 'sagittal') {
            const spacing = volume[0].pixelSpacing;
            const dy = placementCurrent[1] - placementStart[1];
            const dz = placementCurrent[2] - placementStart[2];
            const dist = Math.sqrt(dy * dy + dz * dz);

            drawVTKSlicedScrew(
                ctx,
                {
                    id: 'ghost-sagittal',
                    entry: placementStart,
                    axis: normalize([0, dy, dz]),
                    length: dist,
                    coreDiameter: 6,
                    headDiameter: 15,
                    color: '#10b981'
                },
                [sagittalIndex * spacing[1], 0, 0],
                [1, 0, 0],
                'sagittal',
                [spacing[0], spacing[1]],
                volume[0].sliceThickness,
                '#10b981',
                true
            );
        }

    }, [volume, sagittalIndex, axialIndex, coronalIndex, activeView, layoutMode, threeDImplants, isPlacing, placementStart, placementCurrent]);


    // Coronal: MPR (XZ plane, sliced at Y = coronalIndex)
    useEffect(() => {
        const canvas = coronalCanvasRef.current;
        if (!canvas || volume.length === 0) return;

        // Coronal usually View from Front.
        // We see X (columns) and Z (slices). Y is fixed (coronalIndex).
        // Screen X = Original X (columns). Screen Y = Z (slices).

        canvas.width = volume[0].columns;
        canvas.height = volume.length;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imgData = ctx.createImageData(volume[0].columns, volume.length);
        const data = imgData.data;

        const y = Math.min(Math.max(0, coronalIndex), volume[0].rows - 1);

        for (let z = 0; z < volume.length; z++) {
            const slice = volume[z];

            // For a fixed row Y, we take the whole row (all X)
            const rowStart = y * slice.columns;

            // Optimization: we could slice summary if typed array... but calculate needed for pixel rescale
            for (let x = 0; x < slice.columns; x++) {

                const pixelIndex = rowStart + x;
                const val = getPixelValue(slice.pixelData[pixelIndex], slice);
                const gray = mapToGrayscale(val, slice.windowCenter, slice.windowWidth);

                // Screen: Row=z, Col=x
                const screenIdx = (z * slice.columns + x) * 4;
                data[screenIdx] = gray;
                data[screenIdx + 1] = gray;
                data[screenIdx + 2] = gray;
                data[screenIdx + 3] = 255;
            }
        }

        ctx.putImageData(imgData, 0, 0);

        // Crosshairs
        ctx.strokeStyle = 'rgba(0, 150, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Top-Down line corresponding to Axial Z (Screen Y)
        ctx.moveTo(0, axialIndex);
        ctx.lineTo(canvas.width, axialIndex);
        // Vertical line corresponding to Sagittal X (Screen X)
        ctx.moveTo(sagittalIndex, 0);
        ctx.lineTo(sagittalIndex, canvas.height);
        ctx.stroke();

        // --- Render 3D Implants Projected on Coronal ---
        threeDImplants.forEach(imp => {
            if (imp.type !== 'screw') return;

            const params: PedicleScrewParams = {
                id: imp.id,
                entry: imp.position,
                axis: imp.direction,
                length: imp.properties.length,
                coreDiameter: imp.properties.diameter,
                headDiameter: imp.properties.headDiameter || imp.properties.diameter * 2.5,
                color: imp.properties.color
            };

            const spacing = volume[0].pixelSpacing;
            const sliceThin = volume[0].sliceThickness;
            const planeY = coronalIndex * spacing[0];
            const isSelected = selectedImplantId === imp.id;

            drawVTKSlicedScrew(
                ctx,
                params,
                [0, planeY, 0],
                [0, 1, 0],
                'coronal',
                [spacing[0], spacing[1]],
                sliceThin,
                params.color,
                isSelected
            );

            // Trajectory Overlay
            if (isSelected) {
                const tipVal = getScrewTip(params);
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = params.color;
                ctx.setLineDash([2, 4]);
                ctx.moveTo(params.entry[0] / spacing[1], params.entry[2] / sliceThin);
                ctx.lineTo(tipVal[0] / spacing[1], tipVal[2] / sliceThin);
                ctx.stroke();
                ctx.restore();
            }
        });

        // --- Render Ghost Screw (if placing) ---
        if (isPlacing && placementStart && placementCurrent && activeView === 'coronal') {
            const spacing = volume[0].pixelSpacing;
            const dx = placementCurrent[0] - placementStart[0];
            const dz = placementCurrent[2] - placementStart[2];
            const dist = Math.sqrt(dx * dx + dz * dz);

            drawVTKSlicedScrew(
                ctx,
                {
                    id: 'ghost-coronal',
                    entry: placementStart,
                    axis: normalize([dx, 0, dz]),
                    length: dist,
                    coreDiameter: 6,
                    headDiameter: 15,
                    color: '#f59e0b'
                },
                [0, coronalIndex * spacing[0], 0],
                [0, 1, 0],
                'coronal',
                [spacing[0], spacing[1]],
                volume[0].sliceThickness,
                '#f59e0b',
                true
            );
        }

    }, [volume, coronalIndex, axialIndex, sagittalIndex, activeView, layoutMode, threeDImplants, isPlacing, placementStart, placementCurrent]);


    // 3D Volume Rendering (VTK)
    useEffect(() => {
        const container = vtkContainerRef.current;
        if (!container || volume.length === 0) return;

        // Cleanup previous context if exists
        if (vtkContext.current) {
            const { genericRenderWindow } = vtkContext.current;
            genericRenderWindow.setContainer(null);
            genericRenderWindow.delete();
            vtkContext.current = null;
        }

        const genericRenderWindow = vtkGenericRenderWindow.newInstance({
            background: [0, 0, 0],
        });
        genericRenderWindow.setContainer(container);
        genericRenderWindow.resize();

        const renderer = genericRenderWindow.getRenderer();
        const renderWindow = genericRenderWindow.getRenderWindow();

        // Create ImageData
        const imageData = vtkImageData.newInstance();
        const firstSlice = volume[0];
        const numSlices = volume.length;
        const width = firstSlice.columns;
        const height = firstSlice.rows;
        const spacingX = firstSlice.pixelSpacing[1]; // Col spacing
        const spacingY = firstSlice.pixelSpacing[0]; // Row spacing
        const spacingZ = firstSlice.sliceThickness;

        // Flatten data and find range
        const totalSize = width * height * numSlices;
        const scalarData = new Float32Array(totalSize);

        let offset = 0;
        let minVal = Infinity;
        let maxVal = -Infinity;

        for (let i = 0; i < numSlices; i++) {
            const slice = volume[i];
            for (let j = 0; j < slice.pixelData.length; j++) {
                const val = (slice.pixelData[j] * slice.rescaleSlope) + slice.rescaleIntercept;
                scalarData[offset + j] = val;
                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
            }
            offset += slice.pixelData.length;
        }

        // Normalize Data for better VTK rendering compatibility
        // Map minVal...maxVal (HU Range) to 0...1000 (Normalized Range)
        const dataRange = maxVal - minVal;
        const normalizedData = new Float32Array(totalSize);

        if (dataRange > 0) {
            for (let i = 0; i < totalSize; i++) {
                normalizedData[i] = ((scalarData[i] - minVal) / dataRange) * 1000;
            }
        }

        const dataArray = vtkDataArray.newInstance({
            name: 'Scalars',
            values: normalizedData
        });
        imageData.getPointData().setScalars(dataArray);

        // Sanitize Spacing (if tiny, force to 1.0)
        const safeSpacingX = spacingX < 0.01 ? 1.0 : spacingX;
        const safeSpacingY = spacingY < 0.01 ? 1.0 : spacingY;
        const safeSpacingZ = spacingZ < 0.01 ? 1.0 : spacingZ;

        imageData.setDimensions(width, height, numSlices);
        imageData.setSpacing([safeSpacingX, safeSpacingY, safeSpacingZ]);
        imageData.setOrigin([0, 0, 0]);

        // Mapper
        const mapper = vtkVolumeMapper.newInstance();
        mapper.setInputData(imageData);

        // Fixed Preset for Normalized Data (0-1000)
        // 0 = Background/Air (Mapped from minHU)
        // 1000 = Dense Bone (Mapped from maxHU)

        const ctf = vtkColorTransferFunction.newInstance();
        const pf = vtkPiecewiseFunction.newInstance();

        pf.addPoint(0, 0.0);
        pf.addPoint(50, 0.0); // Clear background
        pf.addPoint(150, 0.1);
        pf.addPoint(300, 0.3);
        pf.addPoint(600, 0.8);
        pf.addPoint(1000, 0.9);

        ctf.addRGBPoint(0, 0.0, 0.0, 0.0);
        ctf.addRGBPoint(200, 0.6, 0.4, 0.3); // Tissue color
        ctf.addRGBPoint(600, 0.9, 0.9, 0.8); // Bone color
        ctf.addRGBPoint(1000, 1.0, 1.0, 1.0);

        // Create Volume Actor (Standard)
        const volActor = vtkVolume.newInstance();
        volActor.setMapper(mapper);
        volActor.getProperty().setRGBTransferFunction(0, ctf);
        volActor.getProperty().setScalarOpacity(0, pf);
        volActor.getProperty().setInterpolationTypeToLinear(); // Use standard linear
        // volActor.getProperty().setShade(true); // Shade sometimes causes issues if normals aren't computed, but usually fine.

        volumeActor.current = volActor;
        renderer.addVolume(volActor);

        // Create Segmentation Actor (Isosurface)
        const marchingCubes = vtkImageMarchingCubes.newInstance({
            contourValue: isoThreshold,
            computeNormals: false, // Huge performance impact, disable for real-time
            mergePoints: false      // Disable to improve speed
        });
        marchingCubes.setInputData(imageData);

        const isoMapper = vtkMapper.newInstance();
        isoMapper.setInputConnection(marchingCubes.getOutputPort());
        isoMapper.setScalarVisibility(false); // Use Actor Color, ignore scalars

        const iActor = vtkActor.newInstance();
        iActor.setMapper(isoMapper);
        iActor.getProperty().setColor(0.9, 0.8, 0.7); // Bone color
        iActor.getProperty().setAmbient(0.3);
        iActor.getProperty().setDiffuse(0.7);
        iActor.getProperty().setSpecular(0.1);

        isoActor.current = iActor;

        // Don't add isoActor yet, or manage visibility in effect
        renderer.addActor(iActor);
        iActor.setVisibility(false);

        // Initial Camera Setup
        renderer.resetCamera();
        renderer.getActiveCamera().azimuth(30);
        renderer.getActiveCamera().elevation(20);

        renderWindow.render();

        // Store context with references to updatable objects
        vtkContext.current = {
            genericRenderWindow,
            renderer,
            actor: volActor,
            mapper,
            marchingCubes,
            isoActor: iActor,
            volumeActor: volActor,
            volumeRange: { min: minVal, max: maxVal },
            ctf, // Exposed
            pf   // Exposed
        };

        // Standard VTK Picker for 3D -> 2D connection
        const picker = vtkCellPicker.newInstance();
        picker.setPickFromList(true);

        const on3DClick = (callData: any) => {
            if (interactionMode !== 'view') return;
            const pos = callData.position;
            picker.pick([pos.x, pos.y, 0], renderer);
            const pickedActors = picker.getActors();
            if (pickedActors.length > 0) {
                const pickedActor = pickedActors[0];
                // Find associated implant ID
                for (const [id, actor] of implantActors.current.entries()) {
                    if (actor === pickedActor) {
                        setSelectedDicomImplant(id);
                        break;
                    }
                }
            } else {
                setSelectedDicomImplant(null);
            }
        };

        const interactor = genericRenderWindow.getInteractor();
        interactor.onRightButtonPress(on3DClick);
        interactor.onLeftButtonPress((callData) => {
            if (interactionMode === 'view') on3DClick(callData);
        });

        return () => {
            if (vtkContext.current) {
                const render = vtkContext.current.renderer;
                implantActors.current.forEach(actor => render.removeActor(actor));
                implantActors.current.clear();
                vtkContext.current.genericRenderWindow.setContainer(null);
                vtkContext.current.genericRenderWindow.delete();
                vtkContext.current = null;
            }
        };

    }, [volume, layoutMode]); // Re-init if volume changes or view changes (resizing)

    // --- Update Visibility & Thresholds ---
    useEffect(() => {
        if (!vtkContext.current) return;
        const {
            volumeActor: vActor,
            isoActor: iActor,
            volumeRange,
            pf,
            runRender = () => vtkContext.current?.genericRenderWindow.getRenderWindow().render()
        } = vtkContext.current;

        if (vActor) {
            // Pivot: Always show Volume Actor for performance/visibility
            vActor.setVisibility(true);

            // Disable Marching Cubes Actor (User reported lag/invisibility)
            if (iActor) iActor.setVisibility(false);

            if (renderMode === 'volume') {
                // Restore Standard Preset
                pf.removeAllPoints();
                pf.addPoint(0, 0.0);
                pf.addPoint(50, 0.0);
                pf.addPoint(150, 0.1);
                pf.addPoint(300, 0.3);
                pf.addPoint(600, 0.8);
                pf.addPoint(1000, 0.9);
            } else {
                // Segmentation Mode -> Bone View (Thresholded Volume)
                // We manipulate the Opacity Function (pf) to hide everything below threshold

                if (volumeRange) {
                    const range = volumeRange.max - volumeRange.min;
                    if (range > 0) {
                        let normalizedThreshold = 0;

                        // Adaptive Mapping (Same logic as before)
                        if (range < 100) {
                            const STANDARD_MIN = -1000;
                            const STANDARD_RANGE = 4000;
                            const factor = (isoThreshold - STANDARD_MIN) / STANDARD_RANGE;
                            const clampedFactor = Math.max(0, Math.min(1, factor));
                            normalizedThreshold = clampedFactor * 1000;
                        } else {
                            const safeThreshold = Math.max(volumeRange.min, Math.min(volumeRange.max, isoThreshold));
                            normalizedThreshold = ((safeThreshold - volumeRange.min) / range) * 1000;
                        }

                        // Apply Hard/Soft Threshold to Opacity
                        pf.removeAllPoints();
                        pf.addPoint(0, 0.0);
                        // Everything below threshold is transparent
                        pf.addPoint(normalizedThreshold - 1, 0.0);
                        // Start ramping up opacity immediately after threshold
                        pf.addPoint(normalizedThreshold, 0.1);
                        pf.addPoint(1000, 1.0); // Linearly increase to full opacity at max

                        console.log("[Volume Threshold] Updated Opacity", { isoThreshold, normalizedThreshold });
                    }
                }
            }
        }

        runRender();
    }, [renderMode, isoThreshold, volumeStats, layoutMode]);


    // --- 3D Implants Rendering & Interaction ---
    useEffect(() => {
        if (!vtkContext.current || !vtkContext.current.renderer) return;
        const { renderer, runRender = () => vtkContext.current?.genericRenderWindow.getRenderWindow().render() } = vtkContext.current;

        // Sync Actors with Store
        // 1. Remove actors for deleted implants
        for (const [id, actor] of implantActors.current.entries()) {
            if (!threeDImplants.find(i => i.id === id)) {
                renderer.removeActor(actor);
                implantActors.current.delete(id);
            }
        }

        // PART B — 3D: REAL screw mesh
        const createScrewPolyData = (p: PedicleScrewParams) => {
            const append = vtkAppendPolyData.newInstance();

            // Shaft (Finite right circular cylinder)
            // CylinderGeometry is Y-aligned by default in VTK
            const shaftSource = vtkCylinderSource.newInstance({
                height: p.length,
                radius: p.coreDiameter / 2,
                resolution: 48 // PART B Requirement
            });
            const shaftData = shaftSource.getOutputData();

            // Tulip (Optional head cylinder)
            const tulipSource = vtkCylinderSource.newInstance({
                height: p.headDiameter * 0.8,
                radius: p.headDiameter / 2,
                resolution: 48
            });
            const tulipData = tulipSource.getOutputData();

            // PART B Orientation Rule: local origin must be at entry.
            // Cylinder is centered at 0. Bottom is at -L/2.
            // Move shaft so bottom is at 0: translate by +L/2 in Y.
            const shaftMatrix = vtkMatrixBuilder.buildFromRadian().translate(0, p.length / 2, 0);
            shaftMatrix.apply(shaftData.getPoints().getData());

            // Move tulip so it's centered around the entry point (0 in local space)
            // or slightly offset. Usually tulip is at the entry.
            const tulipMatrix = vtkMatrixBuilder.buildFromRadian().translate(0, 0, 0);
            tulipMatrix.apply(tulipData.getPoints().getData());

            append.addInputData(shaftData);
            append.addInputData(tulipData);
            return append.getOutputData();
        };

        // 2. Add/Update actors
        threeDImplants.forEach(implant => {
            let actor = implantActors.current.get(implant.id);
            if (!actor) {
                actor = vtkActor.newInstance();
                const mapper = vtkMapper.newInstance();
                actor.setMapper(mapper);
                renderer.addActor(actor);
                implantActors.current.set(implant.id, actor);
            }

            // Parametric source of truth
            const params: PedicleScrewParams = {
                id: implant.id,
                entry: implant.position,
                axis: implant.direction,
                length: implant.properties.length,
                coreDiameter: implant.properties.diameter,
                headDiameter: implant.properties.headDiameter || implant.properties.diameter * 2.5,
                color: implant.properties.color
            };

            // Update Geometry if changed (simplified - re-recreate for now)
            const mapper = actor.getMapper() as any;
            if (implant.type === 'screw') {
                const polyData = createScrewPolyData(params);
                mapper.setInputData(polyData);
            } else {
                const source = vtkCylinderSource.newInstance({
                    height: implant.properties.length,
                    radius: implant.properties.diameter / 2,
                    resolution: 20
                });
                mapper.setInputConnection(source.getOutputPort());
            }

            // Appearance
            const isSelected = selectedImplantId === implant.id;
            const rgb = hexToRgb(implant.properties.color);
            actor.getProperty().setColor(rgb.r, rgb.g, rgb.b);
            actor.getProperty().setOpacity(1.0);
            actor.getProperty().setEdgeVisibility(isSelected);
            actor.getProperty().setEdgeColor(1, 1, 1);
            actor.getProperty().setLineWidth(2);

            // PART B Orientation rule: position = entry, rotation = quat([0,1,0] -> axis)
            const [ex, ey, ez] = params.entry;
            const [dx, dy, dz] = params.axis;

            actor.setPosition(ex, ey, ez);

            // Orient Y axis [0,1,0] to [dx, dy, dz]
            const pitch = Math.acos(dy) * (180 / Math.PI);
            const yaw = Math.atan2(dx, dz) * (180 / Math.PI);
            actor.setOrientation(pitch, yaw, 0);
        });

        runRender();
    }, [threeDImplants, selectedImplantId, layoutMode]);

    // Click Handler for Placement
    useEffect(() => {
        const container = vtkContainerRef.current;
        if (!container || !vtkContext.current) return;

        const handleMouseDown = (event: MouseEvent) => {
            if (interactionMode === 'view') return;
            // Only handle left clicks for placement
            if (event.button !== 0) return;

            const { renderer } = vtkContext.current!;
            const picker = vtkCellPicker.newInstance();
            picker.setPickFromList(true);
            picker.setTolerance(0);

            // We only want to pick the Volume, not other implants?
            // Actually usually we want to pick bone.
            picker.initializePickList();
            picker.addPickList(vtkContext.current.actor); // Add the volume actor

            // Get screen coordinates
            const rect = container.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = rect.bottom - event.clientY; // VTK Y is inverted relative to web

            picker.pick([x, y, 0], renderer);
            const pickedPosition = picker.getPickPosition();

            if (picker.getActors().length > 0) {
                // Place implant
                const id = uuidv4();
                addThreeDImplant({
                    id,
                    type: interactionMode === 'place_screw' ? 'screw' : 'rod',
                    position: pickedPosition as [number, number, number],
                    direction: [0, 0, 1], // Default pointing towards viewer / deep
                    properties: {
                        diameter: interactionMode === 'place_screw' ? 6 : 5,
                        length: 40,
                        color: '#3b82f6'
                    }
                });
                // Switch back to view or keep placing? Keep placing for now.
            }
        };

        if (interactionMode !== 'view') {
            container.addEventListener('mousedown', handleMouseDown);
        }

        return () => {
            container.removeEventListener('mousedown', handleMouseDown);
        };
    }, [interactionMode, layoutMode, addThreeDImplant]);

    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : { r: 1, g: 1, b: 1 };
    }


    // --- Interaction Handlers ---
    // Scroll handlers
    const handleAxialScroll = (e: React.WheelEvent) => {
        setAxialIndex(prev => Math.min(Math.max(0, prev + (e.deltaY > 0 ? 1 : -1)), dimensions.z - 1));
    };
    const handleSagittalScroll = (e: React.WheelEvent) => {
        setSagittalIndex(prev => Math.min(Math.max(0, prev + (e.deltaY > 0 ? 1 : -1)), dimensions.x - 1));
    };
    const handleCoronalScroll = (e: React.WheelEvent) => {
        setCoronalIndex(prev => Math.min(Math.max(0, prev + (e.deltaY > 0 ? 1 : -1)), dimensions.y - 1));
    };

    // --- 2D Placement Logic (Refined Drag-to-Place) ---
    const getAxialWorldPos = (e: React.MouseEvent<HTMLCanvasElement>): [number, number, number] | null => {
        if (!volume[0]) return null;
        const rect = axialCanvasRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const scaleX = volume[0].columns / rect.width;
        const scaleY = volume[0].rows / rect.height;
        const spacing = volume[0].pixelSpacing;
        const sliceThin = volume[0].sliceThickness;
        return [x * scaleX * spacing[1], y * scaleY * spacing[0], axialIndex * sliceThin];
    };

    const handleAxialMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = getAxialWorldPos(e);
        if (!pos) return;

        if (interactionMode === 'view') {
            // Check for handle hit
            let hit = false;
            threeDImplants.forEach(imp => {
                if (imp.type !== 'screw') return;

                const params: PedicleScrewParams = {
                    id: imp.id,
                    entry: imp.position,
                    axis: imp.direction,
                    length: imp.properties.length,
                    coreDiameter: imp.properties.diameter,
                    headDiameter: imp.properties.headDiameter || imp.properties.diameter * 1.8,
                    color: imp.properties.color
                };

                const tip = getScrewTip(params);

                const dStart = Math.sqrt(Math.pow(pos[0] - params.entry[0], 2) + Math.pow(pos[1] - params.entry[1], 2));
                const dEnd = Math.sqrt(Math.pow(pos[0] - tip[0], 2) + Math.pow(pos[1] - tip[1], 2));

                const hitTolerance = 8;
                if (dStart < hitTolerance) {
                    setDragTarget({ id: imp.id, type: 'start' });
                    setSelectedDicomImplant(imp.id);
                    hit = true;
                } else if (dEnd < hitTolerance) {
                    setDragTarget({ id: imp.id, type: 'end' });
                    setSelectedDicomImplant(imp.id);
                    hit = true;
                }
            });
            if (hit) return;
            setSelectedDicomImplant(null);
            return;
        }

        setPlacementStart(pos);
        setPlacementCurrent(pos);
        setIsPlacing(true);
    };

    const handleAxialMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = getAxialWorldPos(e);
        if (!pos) return;

        if (dragTarget) {
            const imp = threeDImplants.find(i => i.id === dragTarget.id);
            if (!imp) return;

            const tipPos = getScrewTip({
                id: imp.id,
                entry: imp.position,
                axis: imp.direction,
                length: imp.properties.length,
                coreDiameter: imp.properties.diameter,
                headDiameter: imp.properties.headDiameter || imp.properties.diameter * 1.8,
                color: imp.properties.color
            });

            if (dragTarget.type === 'start') {
                const newPos: Vec3 = [pos[0], pos[1], pos[2]];
                const delta = sub(tipPos, newPos);
                const len = mag(delta);
                if (len < 1) return;
                updateThreeDImplant(imp.id, {
                    position: newPos,
                    direction: normalize(delta),
                    properties: { ...imp.properties, length: len }
                });
            } else {
                const newTip: Vec3 = [pos[0], pos[1], pos[2]];
                const delta = sub(newTip, imp.position);
                const len = mag(delta);
                if (len < 1) return;
                updateThreeDImplant(imp.id, {
                    direction: normalize(delta),
                    properties: { ...imp.properties, length: len }
                });
            }
            return;
        }

        if (isPlacing) {
            setPlacementCurrent(pos);
        }
    };

    const handleAxialMouseUp = () => {
        if (dragTarget) {
            setDragTarget(null);
            return;
        }

        // Calculate 3D Vector
        const dx = placementCurrent[0] - placementStart[0];
        const dy = placementCurrent[1] - placementStart[1];
        const dz = placementCurrent[2] - placementStart[2];
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (length < 2) {
            setIsPlacing(false);
            setPlacementStart(null);
            return;
        }

        const direction: [number, number, number] = [dx / length, dy / length, dz / length];

        addThreeDImplant({
            id: uuidv4(),
            type: interactionMode === 'place_screw' ? 'screw' : 'rod',
            position: placementStart, // Entry Point
            direction: direction,    // Axis
            properties: {
                diameter: interactionMode === 'place_screw' ? 6 : 5,
                length: length,
                color: interactionMode === 'place_screw' ? '#a855f7' : '#3b82f6'
            }
        });

        setIsPlacing(false);
        setPlacementStart(null);
        setPlacementCurrent(null);
    };


    const getCoronalWorldPos = (e: React.MouseEvent<HTMLCanvasElement>): [number, number, number] | null => {
        if (!volume[0]) return null;
        const rect = coronalCanvasRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const scaleX = volume[0].columns / rect.width;
        const scaleY = volume.length / rect.height;
        const spacing = volume[0].pixelSpacing;
        const sliceThin = volume[0].sliceThickness;
        return [x * scaleX * spacing[1], coronalIndex * spacing[0], y * scaleY * sliceThin];
    };

    const handleCoronalMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = getCoronalWorldPos(e);
        if (!pos) return;

        if (interactionMode === 'view') {
            let hit = false;
            threeDImplants.forEach(imp => {
                if (imp.type !== 'screw') return;

                const params: PedicleScrewParams = {
                    id: imp.id,
                    entry: imp.position,
                    axis: imp.direction,
                    length: imp.properties.length,
                    coreDiameter: imp.properties.diameter,
                    headDiameter: imp.properties.headDiameter || imp.properties.diameter * 1.8,
                    color: imp.properties.color
                };

                const tip = getScrewTip(params);

                const dStart = Math.sqrt(Math.pow(pos[0] - params.entry[0], 2) + Math.pow(pos[2] - params.entry[2], 2));
                const dEnd = Math.sqrt(Math.pow(pos[0] - tip[0], 2) + Math.pow(pos[2] - tip[2], 2));

                const hitTolerance = 8;
                if (dStart < hitTolerance) {
                    setDragTarget({ id: imp.id, type: 'start' });
                    setSelectedDicomImplant(imp.id);
                    hit = true;
                } else if (dEnd < hitTolerance) {
                    setDragTarget({ id: imp.id, type: 'end' });
                    setSelectedDicomImplant(imp.id);
                    hit = true;
                }
            });
            if (hit) return;
            setSelectedDicomImplant(null);
            return;
        }

        setPlacementStart(pos);
        setPlacementCurrent(pos);
        setIsPlacing(true);
    };

    const handleCoronalMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = getCoronalWorldPos(e);
        if (!pos) return;

        if (dragTarget) {
            const imp = threeDImplants.find(i => i.id === dragTarget.id);
            if (!imp) return;

            const tipPos = getScrewTip({
                id: imp.id,
                entry: imp.position,
                axis: imp.direction,
                length: imp.properties.length,
                coreDiameter: imp.properties.diameter,
                headDiameter: imp.properties.headDiameter || imp.properties.diameter * 1.8,
                color: imp.properties.color
            });

            if (dragTarget.type === 'start') {
                const newPos: Vec3 = [pos[0], pos[1], pos[2]];
                const delta = sub(tipPos, newPos);
                const len = mag(delta);
                if (len < 1) return;
                updateThreeDImplant(imp.id, {
                    position: newPos,
                    direction: normalize(delta),
                    properties: { ...imp.properties, length: len }
                });
            } else {
                const newTip: Vec3 = [pos[0], pos[1], pos[2]];
                const delta = sub(newTip, imp.position);
                const len = mag(delta);
                if (len < 1) return;
                updateThreeDImplant(imp.id, {
                    direction: normalize(delta),
                    properties: { ...imp.properties, length: len }
                });
            }
            return;
        }

        if (isPlacing) setPlacementCurrent(pos);
    };

    const handleCoronalMouseUp = () => {
        if (dragTarget) { setDragTarget(null); return; }
        if (!isPlacing || !placementStart || !placementCurrent) {
            setIsPlacing(false);
            setPlacementStart(null);
            setPlacementCurrent(null);
            return;
        }

        const delta = sub(placementCurrent, placementStart);
        const length = mag(delta);

        if (length < 2) {
            setIsPlacing(false);
            setPlacementStart(null);
            return;
        }

        const direction = normalize(delta);
        addThreeDImplant({
            id: uuidv4(),
            type: interactionMode === 'place_screw' ? 'screw' : 'rod',
            position: placementStart,
            direction: direction,
            properties: {
                diameter: interactionMode === 'place_screw' ? 6.5 : 5.5,
                length: length,
                color: interactionMode === 'place_screw' ? '#f59e0b' : '#3b82f6',
                headDiameter: 12
            }
        });
        setIsPlacing(false);
        setPlacementStart(null);
        setPlacementCurrent(null);
    };

    const getSagittalWorldPos = (e: React.MouseEvent<HTMLCanvasElement>): [number, number, number] | null => {
        if (!volume[0]) return null;
        const rect = sagittalCanvasRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const scaleX = volume[0].rows / rect.width;
        const scaleY = volume.length / rect.height;
        const spacing = volume[0].pixelSpacing;
        const sliceThin = volume[0].sliceThickness;
        return [sagittalIndex * spacing[1], x * scaleX * spacing[0], y * scaleY * sliceThin];
    };

    const handleSagittalMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = getSagittalWorldPos(e);
        if (!pos) return;

        if (interactionMode === 'view') {
            let hit = false;
            threeDImplants.forEach(imp => {
                if (imp.type !== 'screw') return;

                const params: PedicleScrewParams = {
                    id: imp.id,
                    entry: imp.position,
                    axis: imp.direction,
                    length: imp.properties.length,
                    coreDiameter: imp.properties.diameter,
                    headDiameter: imp.properties.headDiameter || imp.properties.diameter * 1.8,
                    color: imp.properties.color
                };

                const tip = getScrewTip(params);

                const dStart = Math.sqrt(Math.pow(pos[1] - params.entry[1], 2) + Math.pow(pos[2] - params.entry[2], 2));
                const dEnd = Math.sqrt(Math.pow(pos[1] - tip[1], 2) + Math.pow(pos[2] - tip[2], 2));

                const hitTolerance = 8;
                if (dStart < hitTolerance) {
                    setDragTarget({ id: imp.id, type: 'start' });
                    setSelectedDicomImplant(imp.id);
                    hit = true;
                } else if (dEnd < hitTolerance) {
                    setDragTarget({ id: imp.id, type: 'end' });
                    setSelectedDicomImplant(imp.id);
                    hit = true;
                }
            });
            if (hit) return;
            setSelectedDicomImplant(null);
            return;
        }

        setPlacementStart(pos);
        setPlacementCurrent(pos);
        setIsPlacing(true);
    };

    const handleSagittalMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const pos = getSagittalWorldPos(e);
        if (!pos) return;

        if (dragTarget) {
            const imp = threeDImplants.find(i => i.id === dragTarget.id);
            if (!imp) return;

            const tipPos = getScrewTip({
                id: imp.id,
                entry: imp.position,
                axis: imp.direction,
                length: imp.properties.length,
                coreDiameter: imp.properties.diameter,
                headDiameter: imp.properties.headDiameter || imp.properties.diameter * 1.8,
                color: imp.properties.color
            });

            if (dragTarget.type === 'start') {
                const newPos: Vec3 = [pos[0], pos[1], pos[2]];
                const delta = sub(tipPos, newPos);
                const len = mag(delta);
                if (len < 1) return;
                updateThreeDImplant(imp.id, {
                    position: newPos,
                    direction: normalize(delta),
                    properties: { ...imp.properties, length: len }
                });
            } else {
                const newTip: Vec3 = [pos[0], pos[1], pos[2]];
                const delta = sub(newTip, imp.position);
                const len = mag(delta);
                if (len < 1) return;
                updateThreeDImplant(imp.id, {
                    direction: normalize(delta),
                    properties: { ...imp.properties, length: len }
                });
            }
            return;
        }

        if (isPlacing) setPlacementCurrent(pos);
    };

    const handleSagittalMouseUp = () => {
        if (dragTarget) { setDragTarget(null); return; }
        if (!isPlacing || !placementStart || !placementCurrent) {
            setIsPlacing(false);
            setPlacementStart(null);
            setPlacementCurrent(null);
            return;
        }

        const delta = sub(placementCurrent, placementStart);
        const length = mag(delta);

        if (length < 2) {
            setIsPlacing(false);
            setPlacementStart(null);
            return;
        }

        const direction = normalize(delta);
        addThreeDImplant({
            id: uuidv4(),
            type: interactionMode === 'place_screw' ? 'screw' : 'rod',
            position: placementStart,
            direction: direction,
            properties: {
                diameter: interactionMode === 'place_screw' ? 6.5 : 5.5,
                length: length,
                color: interactionMode === 'place_screw' ? '#10b981' : '#3b82f6',
                headDiameter: 12
            }
        });
        setIsPlacing(false);
        setPlacementStart(null);
        setPlacementCurrent(null);
    };
    return (
        <div ref={containerRef} className="h-[calc(100vh-theme(spacing.12))] w-full bg-black overflow-hidden relative flex flex-col selection:bg-blue-500/30">

            {/* ERROR / LOADING OVERLAYS */}
            {isLoading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-blue-400 font-medium animate-pulse">Loading DICOM Series... {loadingProgress}%</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90">
                    <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-xl max-w-md text-center">
                        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-red-400 mb-2">Error Loading DICOM</h3>
                        <p className="text-slate-300 mb-6">{error}</p>
                        <label className="cursor-pointer bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                            Try Another Folder
                            <input
                                type="file"
                                {...{ webkitdirectory: "", directory: "" }}
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                        if (onFilesSelected) onFilesSelected(Array.from(e.target.files));
                                    }
                                }}
                            />
                        </label>
                    </div>
                </div>
            )}

            {/* Content Area */}
            {volume.length === 0 && !isLoading && !error && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-4">
                        <div className="w-20 h-20 bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto ring-1 ring-white/10">
                            <Cuboid className="w-10 h-10 text-slate-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-medium text-slate-300">No DICOM Loaded</h3>
                            <p className="text-slate-500 text-sm mt-1">Select a patient folder to begin 3D visualization</p>
                        </div>
                    </div>
                </div>
            )}

            {volume.length > 0 && (
                <div className={cn(
                    "flex-1 w-full h-full",
                    layoutMode === 'grid' ? "grid grid-cols-2 grid-rows-2 gap-1 bg-black p-1" :
                        layoutMode === 'axial-sagittal' ? "grid grid-cols-2 gap-1 bg-black p-1" :
                            "flex gap-1 bg-black p-1"
                )}>
                    {/* Metadata Overlay Conditional */}
                    {showMetadataOverlay && <MetadataOverlay metadata={metadata} stats={volumeStats} />}

                    {/* --- GRID MODE or AXIAL-SAGITTAL --- */}
                    {(layoutMode === 'grid' || layoutMode === 'axial-sagittal') && (
                        <>
                            {/* Axial View */}
                            {(activeView === 'all' || activeView === 'axial') && (
                                <div className={cn("relative bg-black group overflow-hidden border border-slate-900/50", activeView === 'axial' ? "col-span-2 row-span-2 fixed inset-0 z-40" : "")}
                                    onWheel={handleAxialScroll}
                                    onDoubleClick={() => {
                                        if (layoutMode !== 'axial-sagittal') {
                                            setDicomActiveView(activeView === 'axial' ? 'all' : 'axial');
                                        }
                                    }}>
                                    {/* Styled View Bar */}
                                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[90%] z-40 opacity-0 group-hover:opacity-100 transition-all duration-300 scale-95 group-hover:scale-100 hidden sm:block">
                                        <div className="bg-black/90 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 flex items-center gap-4 shadow-2xl">
                                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-tighter shrink-0">Axial</span>
                                            <input
                                                type="range"
                                                min={0}
                                                max={dimensions.z - 1}
                                                value={axialIndex}
                                                onChange={(e) => setAxialIndex(parseInt(e.target.value))}
                                                className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
                                            />
                                            <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">{axialIndex + 1}/{dimensions.z}</span>
                                        </div>
                                    </div>

                                    {/* View Content */}
                                    <canvas
                                        ref={axialCanvasRef}
                                        onMouseDown={handleAxialMouseDown}
                                        onMouseMove={handleAxialMouseMove}
                                        onMouseUp={handleAxialMouseUp}
                                        onMouseLeave={() => setIsPlacing(false)}
                                        className={cn("w-full h-full object-contain", interactionMode !== 'view' && "cursor-crosshair")}
                                    />
                                    <div className="absolute top-2 right-2 flex gap-1">
                                        {activeView === 'all' && layoutMode !== 'axial-sagittal' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('axial'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"><Maximize className="w-3 h-3" /></button>}
                                        {activeView === 'axial' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('all'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded"><Minimize className="w-3 h-3" /></button>}
                                    </div>
                                </div>
                            )}

                            {/* Sagittal View */}
                            {(activeView === 'all' || activeView === 'sagittal') && (
                                <div className={cn("relative bg-black group overflow-hidden border border-slate-900/50", activeView === 'sagittal' ? "col-span-2 row-span-2 fixed inset-0 z-40" : "")}
                                    onWheel={handleSagittalScroll}
                                    onDoubleClick={() => {
                                        if (layoutMode !== 'axial-sagittal') {
                                            setDicomActiveView(activeView === 'sagittal' ? 'all' : 'sagittal');
                                        }
                                    }}>
                                    {/* Styled View Bar */}
                                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[90%] z-40 opacity-0 group-hover:opacity-100 transition-all duration-300 scale-95 group-hover:scale-100 hidden sm:block">
                                        <div className="bg-slate-950/60 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 flex items-center gap-4 shadow-2xl">
                                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-tighter shrink-0">Sagittal</span>
                                            <input
                                                type="range"
                                                min={0}
                                                max={dimensions.x - 1}
                                                value={sagittalIndex}
                                                onChange={(e) => setSagittalIndex(parseInt(e.target.value))}
                                                className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
                                            />
                                            <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">{sagittalIndex + 1}/{dimensions.x}</span>
                                        </div>
                                    </div>
                                    <canvas
                                        ref={sagittalCanvasRef}
                                        onMouseDown={handleSagittalMouseDown}
                                        onMouseMove={handleSagittalMouseMove}
                                        onMouseUp={handleSagittalMouseUp}
                                        onMouseLeave={() => setIsPlacing(false)}
                                        className={cn("w-full h-full object-contain", interactionMode !== 'view' && "cursor-crosshair")}
                                    />
                                    <div className="absolute top-2 right-2 flex gap-1">
                                        {activeView === 'all' && layoutMode !== 'axial-sagittal' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('sagittal'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"><Maximize className="w-3 h-3" /></button>}
                                        {activeView === 'sagittal' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('all'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded"><Minimize className="w-3 h-3" /></button>}
                                    </div>
                                </div>
                            )}

                            {/* Coronal View - Only in Grid layout */}
                            {layoutMode === 'grid' && (activeView === 'all' || activeView === 'coronal') && (
                                <div className={cn("relative bg-black group overflow-hidden border border-slate-900/50", activeView === 'coronal' ? "col-span-2 row-span-2 fixed inset-0 z-40" : "")}
                                    onWheel={handleCoronalScroll} onDoubleClick={() => { setDicomActiveView(activeView === 'coronal' ? 'all' : 'coronal'); }}>
                                    {/* Styled View Bar */}
                                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[90%] z-40 opacity-0 group-hover:opacity-100 transition-all duration-300 scale-95 group-hover:scale-100 hidden sm:block">
                                        <div className="bg-slate-950/60 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 flex items-center gap-4 shadow-2xl">
                                            <span className="text-[10px] font-black text-purple-500 uppercase tracking-tighter shrink-0">Coronal</span>
                                            <input
                                                type="range"
                                                min={0}
                                                max={dimensions.y - 1}
                                                value={coronalIndex}
                                                onChange={(e) => setCoronalIndex(parseInt(e.target.value))}
                                                className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400"
                                            />
                                            <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">{coronalIndex + 1}/{dimensions.y}</span>
                                        </div>
                                    </div>
                                    <canvas
                                        ref={coronalCanvasRef}
                                        onMouseDown={handleCoronalMouseDown}
                                        onMouseMove={handleCoronalMouseMove}
                                        onMouseUp={handleCoronalMouseUp}
                                        onMouseLeave={() => setIsPlacing(false)}
                                        className={cn("w-full h-full object-contain", interactionMode !== 'view' && "cursor-crosshair")}
                                    />
                                    <div className="absolute top-2 right-2 flex gap-1">
                                        {activeView === 'all' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('coronal'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"><Maximize className="w-3 h-3" /></button>}
                                        {activeView === 'coronal' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('all'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded"><Minimize className="w-3 h-3" /></button>}
                                    </div>
                                </div>
                            )}

                            {/* 3D View - Only in Grid layout */}
                            {layoutMode === 'grid' && (activeView === 'all' || activeView === '3d') && (
                                <div className={cn("relative bg-black group overflow-hidden border border-slate-900/50", activeView === '3d' ? "col-span-2 row-span-2 fixed inset-0 z-50" : "")}
                                    onDoubleClick={() => setDicomActiveView(activeView === '3d' ? 'all' : '3d')}>
                                    <div className="absolute top-2 left-2 flex items-center gap-2 z-10">
                                        <div className="text-amber-500 font-bold text-xs uppercase drop-shadow-md">3D Volume</div>
                                    </div>
                                    <div ref={vtkContainerRef} className="w-full h-full" />
                                    <div className="absolute top-2 right-2 flex gap-1 z-20">
                                        {activeView === 'all' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('3d'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"><Maximize className="w-3 h-3" /></button>}
                                        {activeView === '3d' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('all'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded"><Minimize className="w-3 h-3" /></button>}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* --- FOCUS 3D MODE --- */}
                    {layoutMode === 'focus-3d' && (
                        <>
                            {/* Left: Large 3D View (Resizable) */}
                            {(activeView === 'all' || activeView === '3d') && (
                                <div className={cn("relative bg-black border border-slate-900/50 overflow-hidden", activeView === '3d' ? "fixed inset-0 z-50 w-full" : "")}
                                    style={activeView === '3d' ? {} : { width: `${leftPanelWidth}%` }}
                                    onDoubleClick={() => setDicomActiveView(activeView === '3d' ? 'all' : '3d')}>
                                    <div className="absolute top-2 left-2 flex items-center gap-2 z-10 pointer-events-none">
                                        <div className="text-amber-500 font-bold text-xs uppercase drop-shadow-md bg-black/50 px-1 rounded">3D Volume</div>
                                    </div>
                                    <div ref={vtkContainerRef} className="w-full h-full block" />
                                    {activeView === '3d' && (
                                        <div className="absolute top-2 right-2 flex gap-1 z-20">
                                            <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('all'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded"><Minimize className="w-3 h-3" /></button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* DRAG HANDLE */}
                            {activeView === 'all' && (
                                <div
                                    className="w-1 bg-slate-800 hover:bg-blue-500 cursor-col-resize transition-colors z-50 flex items-center justify-center group"
                                    onMouseDown={startResizing}
                                >
                                    <div className="h-8 w-0.5 bg-slate-600 group-hover:bg-white rounded-full" />
                                </div>
                            )}

                            {/* Right: Stacked 2D Views (Remaining Width) */}
                            <div className={cn("flex flex-col gap-1 h-full min-w-0", activeView === 'all' ? "flex-1" : "w-0 overflow-hidden")}>
                                {/* Axial */}
                                {(activeView === 'all' || activeView === 'axial') && (
                                    <div className={cn("relative bg-black border border-slate-900/50 overflow-hidden group", activeView === 'axial' ? "fixed inset-0 z-50" : "flex-1")}
                                        onWheel={handleAxialScroll}
                                        onDoubleClick={() => setDicomActiveView(activeView === 'axial' ? 'all' : 'axial')}>
                                        {/* Styled View Bar */}
                                        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[90%] z-40 opacity-0 group-hover:opacity-100 transition-all duration-300 scale-95 group-hover:scale-100 hidden sm:block">
                                            <div className="bg-black/90 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 flex items-center gap-4 shadow-2xl">
                                                <span className="text-[10px] font-black text-blue-500 uppercase tracking-tighter shrink-0">Axial</span>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={dimensions.z - 1}
                                                    value={axialIndex}
                                                    onChange={(e) => setAxialIndex(parseInt(e.target.value))}
                                                    className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
                                                />
                                                <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">{axialIndex + 1}/{dimensions.z}</span>
                                            </div>
                                        </div>
                                        <canvas
                                            ref={axialCanvasRef}
                                            onMouseDown={handleAxialMouseDown}
                                            onMouseMove={handleAxialMouseMove}
                                            onMouseUp={handleAxialMouseUp}
                                            onMouseLeave={() => setIsPlacing(false)}
                                            className={cn("w-full h-full object-contain block", interactionMode !== 'view' && "cursor-crosshair")}
                                        />
                                        <div className="absolute top-2 right-2 flex gap-1 z-20">
                                            {activeView === 'all' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('axial'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"><Maximize className="w-3 h-3" /></button>}
                                            {activeView === 'axial' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('all'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded"><Minimize className="w-3 h-3" /></button>}
                                        </div>
                                    </div>
                                )}
                                {/* Sagittal */}
                                {(activeView === 'all' || activeView === 'sagittal') && (
                                    <div className={cn("relative bg-black border border-slate-900/50 overflow-hidden group", activeView === 'sagittal' ? "fixed inset-0 z-50" : "flex-1")}
                                        onWheel={handleSagittalScroll}
                                        onDoubleClick={() => setDicomActiveView(activeView === 'sagittal' ? 'all' : 'sagittal')}>
                                        {/* Styled View Bar */}
                                        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[90%] z-40 opacity-0 group-hover:opacity-100 transition-all duration-300 scale-95 group-hover:scale-100 hidden sm:block">
                                            <div className="bg-slate-950/60 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 flex items-center gap-4 shadow-2xl">
                                                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-tighter shrink-0">Sagittal</span>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={dimensions.x - 1}
                                                    value={sagittalIndex}
                                                    onChange={(e) => setSagittalIndex(parseInt(e.target.value))}
                                                    className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400"
                                                />
                                                <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">{sagittalIndex + 1}/{dimensions.x}</span>
                                            </div>
                                        </div>
                                        <canvas
                                            ref={sagittalCanvasRef}
                                            onMouseDown={handleSagittalMouseDown}
                                            onMouseMove={handleSagittalMouseMove}
                                            onMouseUp={handleSagittalMouseUp}
                                            onMouseLeave={() => setIsPlacing(false)}
                                            className={cn("w-full h-full object-contain block", interactionMode !== 'view' && "cursor-crosshair")}
                                        />
                                        <div className="absolute top-2 right-2 flex gap-1 z-20">
                                            {activeView === 'all' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('sagittal'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"><Maximize className="w-3 h-3" /></button>}
                                            {activeView === 'sagittal' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('all'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded"><Minimize className="w-3 h-3" /></button>}
                                        </div>
                                    </div>
                                )}
                                {/* Coronal */}
                                {(activeView === 'all' || activeView === 'coronal') && (
                                    <div className={cn("relative bg-black border border-slate-900/50 overflow-hidden group", activeView === 'coronal' ? "fixed inset-0 z-50" : "flex-1")}
                                        onWheel={handleCoronalScroll}
                                        onDoubleClick={() => setDicomActiveView(activeView === 'coronal' ? 'all' : 'coronal')}>
                                        {/* Styled View Bar */}
                                        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[90%] z-40 opacity-0 group-hover:opacity-100 transition-all duration-300 scale-95 group-hover:scale-100 hidden sm:block">
                                            <div className="bg-slate-950/60 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 flex items-center gap-4 shadow-2xl">
                                                <span className="text-[10px] font-black text-purple-500 uppercase tracking-tighter shrink-0">Coronal</span>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={dimensions.y - 1}
                                                    value={coronalIndex}
                                                    onChange={(e) => setCoronalIndex(parseInt(e.target.value))}
                                                    className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400"
                                                />
                                                <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">{coronalIndex + 1}/{dimensions.y}</span>
                                            </div>
                                        </div>
                                        <canvas
                                            ref={coronalCanvasRef}
                                            onMouseDown={handleCoronalMouseDown}
                                            onMouseMove={handleCoronalMouseMove}
                                            onMouseUp={handleCoronalMouseUp}
                                            onMouseLeave={() => setIsPlacing(false)}
                                            className={cn("w-full h-full object-contain block", interactionMode !== 'view' && "cursor-crosshair")}
                                        />
                                        <div className="absolute top-2 right-2 flex gap-1 z-20">
                                            {activeView === 'all' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('coronal'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"><Maximize className="w-3 h-3" /></button>}
                                            {activeView === 'coronal' && <button onClick={(e) => { e.stopPropagation(); setDicomActiveView('all'); }} className="p-1 px-2 text-[10px] bg-slate-800/80 hover:bg-slate-700 text-white rounded"><Minimize className="w-3 h-3" /></button>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
