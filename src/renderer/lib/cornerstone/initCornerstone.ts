import dicomParser from 'dicom-parser';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import * as cornerstoneCore from '@cornerstonejs/core';
const {
    init: coreInit,
    volumeLoader,
    metaData,
    cornerstoneStreamingImageVolumeLoader,
    cache,
    ProgressiveRetrieveImages,
    getWebWorkerManager
} = cornerstoneCore;
import {
    init as toolsInit,
    addTool,
    ToolGroupManager,
    Enums as ToolsEnums,
    WindowLevelTool,
    PanTool,
    ZoomTool,
    StackScrollTool,
    MIPJumpToClickTool,
    ProbeTool,
    TrackballRotateTool,
    CrosshairsTool,
    VolumeRotateTool,
    RectangleScissorsTool,
    CircleScissorsTool,
    LengthTool,
    AngleTool,
    BidirectionalTool,
    ArrowAnnotateTool,
    PlanarFreehandROITool,
    CircleROITool,
    destroy as toolsDestroy,
} from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';


// --- Initialization & Metadata Cache ---
let initPromise: Promise<void> | null = null;
const localMetaDataMap = new Map<string, any>();

// Custom provider to ensure metadata is available for volumes from local files
function localMetaDataProvider(type: string, imageId: string) {
    if (type === 'imageRetrieveConfiguration') {
        return {
            create: ProgressiveRetrieveImages.createProgressive
        };
    }


    // Normalize imageId for matching (strip known prefixes and query params)
    const normalize = (id: string) => {
        let n = id.replace(/^(wadouri:|dicomfile:)/, '');
        // Remove trailing query params or hashes
        n = n.split('?')[0].split('#')[0];
        // Ensure forward slashes for matching
        n = n.replace(/\\/g, '/');
        // If it's a URL, just take the pathname or filename
        try {
            if (n.startsWith('http')) {
                const url = new URL(n);
                return url.pathname;
            }
        } catch (e) {
            // not a valid URL, continue
        }
        return n;
    };
    const normImageId = normalize(imageId);

    let dataset = localMetaDataMap.get(imageId);

    // Fuzzy matching for various URI formats
    if (!dataset) {
        for (const [key, value] of localMetaDataMap.entries()) {
            const normKey = normalize(key);
            if (normImageId === normKey || normImageId.endsWith(normKey) || normKey.endsWith(normImageId)) {
                dataset = value;
                break;
            }
        }
    }

    if (!dataset) {
        // Only log if it's a DICOM image ID (to avoid noise from other providers)
        if (imageId.includes('wadouri') || imageId.includes('dicomfile') || imageId.includes('.dcm')) {
            console.log(`[Cornerstone] Metadata requested for ${type} on ${imageId} (Norm: ${normImageId}). Cache keys:`, Array.from(localMetaDataMap.keys()).length);
        }
        return;
    }

    try {
        const { dataSet } = dataset;

        // Fallback implementation for mandatory volume modules
        if (type === 'imagePixelModule') {
            const pixelRepresentation = dataSet.uint16('x00280103');
            const bitsAllocated = dataSet.uint16('x00280100') || 16;
            const isSigned = pixelRepresentation === 1;

            // Determine the TypedArray type string for Cornerstone
            let dataTypeString = 'Uint16Array';
            if (bitsAllocated === 8) {
                dataTypeString = isSigned ? 'Int8Array' : 'Uint8Array';
            } else if (bitsAllocated === 16) {
                dataTypeString = isSigned ? 'Int16Array' : 'Uint16Array';
            } else if (bitsAllocated === 32) {
                dataTypeString = isSigned ? 'Int32Array' : 'Uint32Array';
            }

            const rescaleIntercept = dataSet.string('x00281052') ? parseFloat(dataSet.string('x00281052')!) : 0;
            const rescaleSlope = dataSet.string('x00281053') ? parseFloat(dataSet.string('x00281053')!) : 1;

            const result = {
                pixelRepresentation: pixelRepresentation === undefined ? 0 : pixelRepresentation,
                dataType: dataTypeString,
                bitsAllocated,
                bitsStored: dataSet.uint16('x00280101') || 16,
                highBit: dataSet.uint16('x00280102') || 15,
                samplesPerPixel: dataSet.uint16('x00280002') || 1,
                photometricInterpretation: dataSet.string('x00280004') || 'MONOCHROME2',
                rows: dataSet.uint16('x00280010') || 512,
                columns: dataSet.uint16('x00280011') || 512,
                windowWidth: dataSet.string('x00281051') ? [parseFloat(dataSet.string('x00281051')!)] : [1500],
                windowCenter: dataSet.string('x00281050') ? [parseFloat(dataSet.string('x00281050')!)] : [400],
                rescaleIntercept,
                rescaleSlope,
            };
            console.log(`[Cornerstone] Returning imagePixelModule for ${imageId}:`, result);
            return result;
        }

        if (type === 'modalityLutModule') {
            return {
                rescaleIntercept: dataSet.floatString('x00281052') ? parseFloat(dataSet.floatString('x00281052')!) : 0,
                rescaleSlope: dataSet.floatString('x00281053') ? parseFloat(dataSet.floatString('x00281053')!) : 1,
                modality: dataSet.string('x00080060') || 'CT',
            };
        }

        if (type === 'sopCommonModule') {
            return {
                sopClassUID: dataSet.string('x00080016'),
                sopInstanceUID: dataSet.string('x00080018'),
            };
        }

        if (type === 'generalSeriesModule') {
            return {
                modality: dataSet.string('x00080060') || 'CT',
                seriesInstanceUID: dataSet.string('x0020000e'),
                seriesNumber: dataSet.intString('x00200011'),
            };
        }

        if (type === 'imagePlaneModule') {
            const iopStr = dataSet.string('x00200037');
            let iop = iopStr ? iopStr.split('\\').map(parseFloat) : [1, 0, 0, 0, 1, 0];
            if (iop.some(isNaN) || iop.length < 6) iop = [1, 0, 0, 0, 1, 0];

            const ippStr = dataSet.string('x00200032');
            let ipp = ippStr ? ippStr.split('\\').map(parseFloat) : [0, 0, 0];
            if (ipp.some(isNaN) || ipp.length < 3) ipp = [0, 0, 0];

            const spacingStr = dataSet.string('x00280030');
            let spacing = spacingStr ? spacingStr.split('\\').map(parseFloat) : [1, 1];
            if (spacing.some(isNaN) || spacing.length < 2) spacing = [1, 1];

            const st = dataSet.string('x00180050');
            const sl = dataSet.string('x00201041');

            return {
                frameOfReferenceUID: dataSet.string('x00200052') || 'FOR_UID',
                rows: dataSet.uint16('x00280010') || 512,
                columns: dataSet.uint16('x00280011') || 512,
                imageOrientationPatient: iop,
                rowCosines: [iop[0], iop[1], iop[2]],
                columnCosines: [iop[3], iop[4], iop[5]],
                imagePositionPatient: ipp,
                pixelSpacing: spacing,
                rowPixelSpacing: spacing[0],
                columnPixelSpacing: spacing[1],
                sliceThickness: st ? parseFloat(st) : 1,
                sliceLocation: sl ? parseFloat(sl) : 0,
            };
        }

        if (type === 'studyModule') {
            return {
                studyInstanceUID: dataSet.string('x0020000d'),
                studyDate: dataSet.string('x00080020'),
                studyTime: dataSet.string('x00080030'),
                patientName: dataSet.string('x00100010'),
                patientId: dataSet.string('x00100020'),
            };
        }

        if (type === 'voiLutModule') {
            const windowCenter = dataSet.string('x00281050') ? [parseFloat(dataSet.string('x00281050')!)] : [400];
            const windowWidth = dataSet.string('x00281051') ? [parseFloat(dataSet.string('x00281051')!)] : [1500];
            return {
                windowCenter,
                windowWidth,
            };
        }

        if (type === 'seriesModule') {
            return {
                seriesInstanceUID: dataSet.string('x0020000e'),
                seriesNumber: dataSet.intString('x00200011'),
                modality: dataSet.string('x00080060'),
            };
        }

        // Try the library's helper for other modules
        const wadouri = cornerstoneDICOMImageLoader.wadouri as any;
        if (wadouri?.metaData?.metadataForDataset) {
            return wadouri.metaData.metadataForDataset(type, imageId, dataSet);
        }
    } catch (err) {
        console.error(`[Cornerstone] Error extracting ${type} for ${imageId}`, err);
    }
}

export const TOOL_GROUP_2D_ID = 'spinesurge-tool-group-2d';
export const TOOL_GROUP_3D_ID = 'spinesurge-tool-group-3d';

export function initCornerstone() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        console.log('[Cornerstone] Starting initialization...');

        // 0. Expose Libraries
        const actualParser = (dicomParser as any).default || dicomParser;
        console.log('[Cornerstone] dicomParser type:', typeof actualParser, {
            hasParseDicom: !!(actualParser && actualParser.parseDicom),
            allKeys: Object.keys(actualParser || {})
        });

        (window as any).vtkUtils = {
            ColorTransferFunction: vtkColorTransferFunction,
            PiecewiseFunction: vtkPiecewiseFunction
        };
        // CRITICAL for Production: Expose to window so all bundled chunks can find them
        // Also expose as 'dicom-parser' for modules that might look for that specific name
        (window as any).dicomParser = actualParser;
        (window as any)['dicom-parser'] = actualParser;
        (window as any).cornerstone = cornerstoneCore;
        (window as any).cornerstoneDICOMImageLoader = cornerstoneDICOMImageLoader;

        // Backup: explicitly set on globalThis too
        (globalThis as any).dicomParser = actualParser;

        // 1. Initialize Core
        await coreInit();

        // 2. Initialize Tools Support
        await toolsInit();

        // 3. Register Loaders
        volumeLoader.registerUnknownVolumeLoader(
            cornerstoneStreamingImageVolumeLoader as any
        );
        volumeLoader.registerVolumeLoader(
            'cornerstoneStreamingImageVolume',
            cornerstoneStreamingImageVolumeLoader as any
        );

        // 4. Configure DICOM Image Loader
        try {
            const loader = (cornerstoneDICOMImageLoader as any).default || cornerstoneDICOMImageLoader;
            console.log('[Cornerstone] Configuring image loader...', {
                isType: typeof loader,
                hasExternal: !!(loader && loader.external),
                hasWadouri: !!(loader && loader.wadouri)
            });

            if (loader) {
                const actualParser = (dicomParser as any).default || dicomParser;
                // Check if already initialized to avoid "Worker type already registered" warning
                if (loader.initialized) {
                    console.log('[Cornerstone] DICOM Image Loader already initialized');
                } else {
                    if (loader.external) {
                        loader.external.cornerstone = cornerstoneCore;
                        loader.external.dicomParser = actualParser;
                    } else {
                        // Direct assignment for older versions or different bundling
                        loader.cornerstone = cornerstoneCore;
                        loader.dicomParser = actualParser;
                    }

                    if (loader.wadouri && loader.wadouri.external) {
                        loader.wadouri.external.cornerstone = cornerstoneCore;
                        loader.wadouri.external.dicomParser = actualParser;
                    }
                    if (loader.wadors && loader.wadors.external) {
                        loader.wadors.external.cornerstone = cornerstoneCore;
                        loader.wadors.external.dicomParser = actualParser;
                    }

                    (loader as any).dicomParser = actualParser;
                    (loader as any).cornerstone = cornerstoneCore;
                    if (loader.external) {
                        loader.external.dicomParser = actualParser;
                        loader.external.cornerstone = cornerstoneCore;
                    }

                    // Register schemes EXPLICITLY with core imageLoader
                    if (loader.wadouri) {
                        const { imageLoader } = cornerstoneCore;
                        imageLoader.registerImageLoader('wadouri', loader.wadouri.loadImage);
                        imageLoader.registerImageLoader('dicomfile', loader.wadouri.loadImage);
                    }

                    // Call init on the resolved loader
                    const config = {
                        maxWebWorkers: navigator.hardwareConcurrency || 1,
                        startImmediately: true,
                        decodeConfig: {
                            initializeCodecsOnWorker: true,
                            useWebWorkers: true,
                        },
                    };

                    if (typeof loader.init === 'function') {
                        loader.init(config);
                    } else if (typeof (cornerstoneDICOMImageLoader as any).init === 'function') {
                        (cornerstoneDICOMImageLoader as any).init(config);
                    }
                    // We set this AFTER worker registration below
                }
            }
        } catch (e) {
            console.error('[Cornerstone] Failed to configure DICOM Image Loader:', e);
        }

        // 5. Configure worker paths
        // Register the worker using Cornerstone Core's manager
        const workerFn = () => {
            // Reverting to string to fix build crash. 
            // The file is in public/ and will be copied to the output root.
            return new Worker('./decodeImageFrameWorker.js', {
                type: 'module'
            });
        };

        const loaderInstance = getLoader();
        const workerManager = getWebWorkerManager();

        // Final linkage to this specific instance
        if (loaderInstance) {
            (loaderInstance as any).dicomParser = actualParser;
            (loaderInstance as any).cornerstone = cornerstoneCore;
        }

        if (workerManager && !loaderInstance.initialized) {
            // Check if we are in production and use specialized worker config if needed
            const isProd = (window as any).process?.env?.NODE_ENV === 'production' || !window.location.hostname.includes('localhost');

            console.log('[Cornerstone] Registering web worker (isProd:', isProd, ')');

            workerManager.registerWorker('dicomImageLoader', workerFn, {
                maxWorkerInstances: navigator.hardwareConcurrency || 1,
            });
            loaderInstance.initialized = true;
        }

        // Configure decode task separately via config
        if (loaderInstance && (loaderInstance as any).configure) {
            (loaderInstance as any).configure({
                decodeConfig: {
                    initializeCodecsOnStartup: false,
                    usePDFJS: false,
                    strict: false,
                }
            });
        }


        // 5. Add Tools
        addTool(WindowLevelTool);
        addTool(PanTool);
        addTool(ZoomTool);
        addTool(StackScrollTool);
        addTool(MIPJumpToClickTool);
        addTool(ProbeTool);
        addTool(TrackballRotateTool);
        addTool(CrosshairsTool);
        addTool(VolumeRotateTool);
        addTool(RectangleScissorsTool);
        addTool(CircleScissorsTool);
        addTool(LengthTool);
        addTool(AngleTool);
        addTool(BidirectionalTool);
        addTool(ArrowAnnotateTool);
        addTool(PlanarFreehandROITool);
        addTool(CircleROITool);

        // 6. Register Metadata Provider with extremely high priority
        metaData.addProvider(localMetaDataProvider, 100000);

        // 7. Define Tool Groups
        // 2D Tool Group
        let toolGroup2D = ToolGroupManager.getToolGroup(TOOL_GROUP_2D_ID);
        if (!toolGroup2D) {
            toolGroup2D = ToolGroupManager.createToolGroup(TOOL_GROUP_2D_ID)!;
        }

        if (toolGroup2D) {
            toolGroup2D.addTool(WindowLevelTool.toolName);
            toolGroup2D.addTool(PanTool.toolName);
            toolGroup2D.addTool(ZoomTool.toolName);
            toolGroup2D.addTool(StackScrollTool.toolName);
            toolGroup2D.addTool(MIPJumpToClickTool.toolName);
            toolGroup2D.addTool(CrosshairsTool.toolName);
            toolGroup2D.addTool(RectangleScissorsTool.toolName);
            toolGroup2D.addTool(CircleScissorsTool.toolName);
            toolGroup2D.addTool(LengthTool.toolName);
            toolGroup2D.addTool(AngleTool.toolName);
            toolGroup2D.addTool(BidirectionalTool.toolName);
            toolGroup2D.addTool(ArrowAnnotateTool.toolName);
            toolGroup2D.addTool(PlanarFreehandROITool.toolName);
            toolGroup2D.addTool(CircleROITool.toolName);

            toolGroup2D.setToolActive(WindowLevelTool.toolName, {
                bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
            });

            toolGroup2D.setToolActive(PanTool.toolName, {
                bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
            });

            toolGroup2D.setToolActive(ZoomTool.toolName, {
                bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }],
            });

            toolGroup2D.setToolActive(StackScrollTool.toolName, {
                bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }],
            });
        }

        // 3D Tool Group
        let toolGroup3D = ToolGroupManager.getToolGroup(TOOL_GROUP_3D_ID);
        if (!toolGroup3D) {
            toolGroup3D = ToolGroupManager.createToolGroup(TOOL_GROUP_3D_ID)!;
        }

        if (toolGroup3D) {
            toolGroup3D.addTool(TrackballRotateTool.toolName);
            toolGroup3D.addTool(PanTool.toolName);
            toolGroup3D.addTool(ZoomTool.toolName);
            toolGroup3D.addTool(VolumeRotateTool.toolName);

            // Left Click = Rotate
            toolGroup3D.setToolActive(TrackballRotateTool.toolName, {
                bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
            });

            // Middle Click (Scroll Button) = Pan
            toolGroup3D.setToolActive(PanTool.toolName, {
                bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
            });

            // Wheel = Zoom
            toolGroup3D.setToolActive(ZoomTool.toolName, {
                bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }],
            });

            // Explicitly disable Right Click if it was inherited
            toolGroup3D.setToolDisabled(WindowLevelTool.toolName);
        }

        console.log('[Cornerstone] Initialization complete');
    })();

    return initPromise;
}

export function destroyCornerstone() {
    console.log('[Cornerstone] Cleaning up...');

    // 1. Destroy Tool Groups
    [TOOL_GROUP_2D_ID, TOOL_GROUP_3D_ID].forEach(id => {
        const toolGroup = ToolGroupManager.getToolGroup(id);
        if (toolGroup) {
            ToolGroupManager.destroyToolGroup(id);
        }
    });

    // 2. Clear Caches
    cache.purgeCache();
    localMetaDataMap.clear();

    // 3. Reset state
    initPromise = null;

    // 4. Tools and Core cleanup
    toolsDestroy();
}

export async function isCornerstoneInitialized() {
    if (initPromise) {
        await initPromise;
        return true;
    }
    return false;
}

// Helper to get the resolved loader (handles ESM/CJS interop)
function getLoader() {
    return (cornerstoneDICOMImageLoader as any).default || cornerstoneDICOMImageLoader;
}

// Helper to add files to the loader and pre-populate metadata
export async function addFileToLoader(file: File | any) {
    let fileObj = file;

    // Convert DICOMResource (Electron) to File (Web Compatibility)
    if (!(file instanceof File) && typeof file.arrayBuffer === 'function') {
        try {
            const buffer = await file.arrayBuffer();
            fileObj = new File([buffer], file.name || 'dicom.dcm');
        } catch (e) {
            console.error('Failed to convert resource to File:', e);
            return null; // Fail gracefully
        }
    }

    const loader = getLoader();
    if (!loader || !loader.wadouri) {
        console.error('[Cornerstone] DICOM Image Loader not properly initialized');
        return null;
    }

    try {
        // VALIDATION: Read full file and verify it's valid DICOM BEFORE adding to file manager
        const fullBuffer = await fileObj.arrayBuffer();

        // Check minimum file size
        if (fullBuffer.byteLength < 132) {
            console.warn(`[Cornerstone] File too small to be DICOM: ${fileObj.name} (${fullBuffer.byteLength} bytes) - SKIPPING`);
            return null;
        }

        const uint8Array = new Uint8Array(fullBuffer);

        // Check for DICM magic bytes at offset 128
        const dicmMagic = String.fromCharCode(uint8Array[128], uint8Array[129], uint8Array[130], uint8Array[131]);
        if (dicmMagic !== 'DICM') {
            console.warn(`[Cornerstone] Not a valid DICOM file (missing DICM magic): ${fileObj.name} - SKIPPING`);
            return null;
        }

        // Parse DICOM to validate structure
        const dataSet = dicomParser.parseDicom(uint8Array);

        // Verify essential tags exist
        const sopInstanceUID = dataSet.string('x00080018');
        if (!sopInstanceUID) {
            console.warn(`[Cornerstone] DICOM file missing SOP Instance UID: ${fileObj.name} - SKIPPING`);
            return null;
        }

        // Get Instance Number for logging
        const instanceNumber = dataSet.intString('x00200013') || 'N/A';
        const sliceLocation = dataSet.floatString('x00201041') || 'N/A';

        // Add the original file object to the file manager
        const imageId = loader.wadouri.fileManager.add(fileObj);

        console.log(`[Cornerstone] ✓ Added VALID DICOM: ${fileObj.name} -> ${imageId} (Instance: ${instanceNumber}, Location: ${sliceLocation})`);

        // Store metadata locally
        localMetaDataMap.set(imageId, { dataSet });
        const parsed = loader.wadouri.parseImageId(imageId);
        if (parsed.url) localMetaDataMap.set(parsed.url, { dataSet });

        console.log(`[Cornerstone] Successfully parsed and cached metadata locally for ${imageId}`);

        // Restore dataset cache injection for full files to avoid re-parsing in production
        // This is necessary because the loader's own fetch in bundled environments 
        // sometimes fails to correctly parse the pixel data tag.
        const internalCache = (loader.wadouri.dataSetCacheManager as any).loadedDataSets;
        if (internalCache && parsed.url) {
            // Verify pixel data element exists (x7fe00010, x7fe00008, x7fe00009)
            const hasPixelData = !!(dataSet.elements.x7fe00010 || dataSet.elements.x7fe00008 || dataSet.elements.x7fe00009);

            if (!hasPixelData) {
                console.warn(`[Cornerstone] No pixel data found in ${fileObj.name}. Injected anyway for metadata.`);
            }

            internalCache[parsed.url] = {
                dataSet: dataSet,
                cacheCount: 1
            };
            console.log(`[Cornerstone] ✓ Injected ${imageId} into loader cache. Has Pixel Data? ${hasPixelData}`);
        }

        return imageId;
    } catch (e) {
        console.error(`[Cornerstone] Error validating/parsing DICOM file ${fileObj.name}:`, e);
        return null;
    }
}

export async function addURLToLoader(url: string) {
    const imageId = url.startsWith('wadouri:') ? url : `wadouri:${url}`;

    // Normalize for matching
    const normalize = (id: string) => {
        let n = id.replace(/^(wadouri:|dicomfile:)/, '');
        n = n.split('?')[0].split('#')[0];
        n = n.replace(/\\/g, '/');
        return n;
    };
    const normImageId = normalize(imageId);

    if (localMetaDataMap.has(imageId) || localMetaDataMap.has(normImageId)) {
        return imageId;
    }

    console.log(`[Cornerstone] Pre-parsing metadata for URL: ${url}`);

    try {
        // Fetch only the first 2MB to get the DICOM header
        // CAUTION: Add a timestamp to avoid browser cache poisoning between metadata fetch and full image fetch
        const cacheBuster = `cb=${Date.now()}`;
        const fetchUrl = url.includes('?') ? `${url}&${cacheBuster}` : `${url}?${cacheBuster}`;

        let response = await fetch(fetchUrl, {
            headers: {
                'Range': 'bytes=0-2097151'
            },
            cache: 'no-store' // CRITICAL: Do not cache partial response in browser
        });

        if (!response.ok && response.status !== 206) {
            console.log(`[Cornerstone] Range fetch failed (${response.status}), falling back to full fetch for metadata...`);
            response = await fetch(url, { cache: 'no-store' });
        }

        const buffer = await response.arrayBuffer();
        console.log(`[Cornerstone] URL ${url} fetched: ${buffer.byteLength} bytes`);

        if (buffer.byteLength < 132) {
            throw new Error(`Buffer too small (${buffer.byteLength} bytes)`);
        }

        const dataSet = dicomParser.parseDicom(new Uint8Array(buffer));
        console.log(`[Cornerstone] DICOM parsed for ${url}. Slices spacing hinted? ${dataSet.string('x00280030')}`);

        // Store in our local map for metadata providers
        localMetaDataMap.set(imageId, { dataSet });
        localMetaDataMap.set(normImageId, { dataSet });

        const parts = url.split('/');
        const filename = parts[parts.length - 1];
        if (filename) {
            localMetaDataMap.set(filename, { dataSet });
        }

        // IMPORTANT: DO NOT manually inject into the loader's internal dataset cache.
        // Doing so can cause "pixel data is missing" errors in bundled production environments
        // if the dataset object structure doesn't perfectly match what the loader expects.
    } catch (e) {
        console.warn(`[Cornerstone] Failed to pre-parse metadata for URL: ${url}. Falling back to full load.`, e);
        // Fallback: load full image once to populate metadata
        try {
            const { imageLoader } = await import('@cornerstonejs/core');
            await imageLoader.loadAndCacheImage(imageId);
        } catch (loadErr) {
            console.error(`[Cornerstone] Ultimate failure loading image ${imageId}:`, loadErr);
        }
    }

    return imageId;
}
