import { useEffect, useRef, useState, useCallback } from 'react';
import {
    RenderingEngine,
    Enums,
    type Types,
    volumeLoader,
    setVolumesForViewports,
    metaData,
    cache,
} from '@cornerstonejs/core';
import {
    Enums as ToolsEnums,
    segmentation,
    ToolGroupManager,
    WindowLevelTool,
    TrackballRotateTool,
} from '@cornerstonejs/tools';
import vtkCylinderSource from '@kitware/vtk.js/Filters/Sources/CylinderSource';
import vtkConeSource from '@kitware/vtk.js/Filters/Sources/ConeSource';
// import vtkCubeSource from '@kitware/vtk.js/Filters/Sources/CubeSource';
import {
    addFileToLoader,
    addURLToLoader,
    initCornerstone,
    destroyCornerstone,
    TOOL_GROUP_2D_ID,
    TOOL_GROUP_3D_ID,
} from '@/lib/cornerstone/initCornerstone';
import { useAppStore } from "@/lib/store/index";
import { cn } from "@/lib/utils";
import { filterIslands, smoothMask } from './maskUtils';
import { erase3DRegion, getViewportOrientation } from './volumeEraser';
// import vtkPolyDataReader from '@kitware/vtk.js/IO/Legacy/PolyDataReader';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
// import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
// import { CropOverlay2D } from './components/CropOverlay2D';
import { ScrewOverlay2D } from './components/ScrewOverlay2D';
import vtkMatrixBuilder from '@kitware/vtk.js/Common/Core/MatrixBuilder';
import { getTransformedScrewTrajectory } from '@/features/measurements/planning/SurgicalGeometry';
import { createHighFidelityScrewActor } from '../measurements/planning/VtkHighFidelityScrew';
import { formatCoordinateData } from '../measurements/planning/PedicleLogic';

const { ViewportType, OrientationAxis } = Enums;

interface CornerstoneViewerProps {
    fileList: (File | string)[];
}

export const CornerstoneViewer = ({ fileList }: CornerstoneViewerProps) => {
    const {
        dicom3D,
        threeDImplants,
        pedicleSimulations,
        activeTool,
    } = useAppStore();

    const elementRef = useRef<HTMLDivElement>(null);
    const runningRef = useRef(false);
    const renderingEngineCallbackRef = useRef<RenderingEngine | null>(null);
    const cornerstoneToolsRef = useRef<any>(null);

    // Config IDs
    const [renderingEngineId] = useState(() => `engine-${Date.now()}`);
    const [volumeName] = useState(() => `vol-${Date.now()}`);
    const volumeId = `cornerstoneStreamingImageVolume:${volumeName}`;

    // Viewport IDs
    const viewportIds = {
        AXIAL: `AXIAL-${volumeName}`,
        SAGITTAL: `SAGITTAL-${volumeName}`,
        CORONAL: `CORONAL-${volumeName}`,
        THREED: `THREED-${volumeName}`,
    };

    const [isLoading, setIsLoading] = useState(false);
    const [maximizedViewportId, setMaximizedViewportId] = useState<string | null>(null);
    const [sliceData, setSliceData] = useState<Record<string, { index: number; count: number }>>({});

    // Add visual feedback class
    const isPlacementMode = dicom3D.interactionMode.startsWith('place_');

    // --- Cleanup Helper ---
    const destroyEngine = useCallback(() => {
        if (renderingEngineCallbackRef.current) {
            renderingEngineCallbackRef.current.destroy();
            renderingEngineCallbackRef.current = null;
        }
        destroyCornerstone();
    }, []);

    // --- Initialization & Loading ---
    useEffect(() => {
        let isMounted = true;
        let cleanupListeners = () => { };

        const startup = async () => {
            if (runningRef.current || fileList.length === 0 || !elementRef.current) return;
            runningRef.current = true;
            setIsLoading(true);

            // Automatically open 3D tool tab when a DICOM is uploaded
            useAppStore.getState().setSidebarActiveModule('threeD');

            try {
                // Ensure helper is initialized
                await initCornerstone();

                if (!isMounted) return;

                // 1. Image IDs (Parallelized)
                console.log(`[Cornerstone] Loading ${fileList.length} items...`);
                const imageIdPromises = fileList.map(async (item) => {
                    if (typeof item === 'string') {
                        let url = item;
                        if (!url.startsWith('http') && !url.startsWith('blob:')) {
                            url = `http://localhost:3001${url.startsWith('/') ? '' : '/'}${url}`;
                        }
                        return await addURLToLoader(url);
                    } else {
                        return await addFileToLoader(item);
                    }
                });

                const imageIds = (await Promise.all(imageIdPromises)).filter(Boolean) as string[];

                if (imageIds.length === 0) {
                    console.error('[Cornerstone] No valid image IDs found. Aborting startup.');
                    setIsLoading(false);
                    runningRef.current = false;
                    return;
                }

                console.log(`[Cornerstone] Loaded ${imageIds.length} valid DICOM files`);

                // CRITICAL: In production, metadata might not be immediately available
                // Wait for metadata to propagate before sorting (increased for production builds)
                console.log('[Cornerstone] Waiting for metadata to be available for sorting...');
                await new Promise(resolve => setTimeout(resolve, 1500));

                // SORT by Instance Number to ensure correct slice order
                console.log('[Cornerstone] Sorting image IDs by Instance Number...');
                const sortedImageIds = imageIds.sort((a, b) => {
                    // Get metadata for both images
                    const planeA = metaData.get('imagePlaneModule', a);
                    const planeB = metaData.get('imagePlaneModule', b);

                    // Debug: Log if metadata is missing (should not happen after wait)
                    if (!planeA || !planeB) {
                        console.warn(`[Cornerstone] Missing metadata during sort: ${a} (${!!planeA}), ${b} (${!!planeB})`);
                    }

                    // Use slice location for sorting (Z-axis position) fallback to position patient or index
                    const locA = (planeA?.sliceLocation !== undefined && !isNaN(planeA.sliceLocation))
                        ? planeA.sliceLocation
                        : (planeA?.imagePositionPatient?.[2] !== undefined && !isNaN(planeA.imagePositionPatient[2]))
                            ? planeA.imagePositionPatient[2]
                            : imageIds.indexOf(a);

                    const locB = (planeB?.sliceLocation !== undefined && !isNaN(planeB.sliceLocation))
                        ? planeB.sliceLocation
                        : (planeB?.imagePositionPatient?.[2] !== undefined && !isNaN(planeB.imagePositionPatient[2]))
                            ? planeB.imagePositionPatient[2]
                            : imageIds.indexOf(b);

                    return locA - locB;
                });

                console.log(`[Cornerstone] ✓ Sorted ${sortedImageIds.length} images by slice location`);
                console.log(`[Cornerstone] First ID: ${sortedImageIds[0]}, Last ID: ${sortedImageIds[sortedImageIds.length - 1]}`);

                // Use sortedImageIds for the rest of the initialization
                console.log(`[Cornerstone] Initializing with ${sortedImageIds.length} image IDs. First ID: ${sortedImageIds[0]}`);

                // 2. Pre-load the first image to ensure metadata AND pixel data are cached
                console.log('[Cornerstone] Pre-loading first image to cache metadata...');
                const { imageLoader } = await import('@cornerstonejs/core');

                // Try to load the first image, with retry logic
                let firstImageLoaded = false;
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        await imageLoader.loadAndCacheImage(sortedImageIds[0]);
                        console.log('[Cornerstone] First image loaded successfully');
                        firstImageLoaded = true;
                        break;
                    } catch (err) {
                        console.error(`[Cornerstone] Failed to pre-load first image (attempt ${attempt + 1}/3):`, err);
                        if (attempt < 2) {
                            console.log('[Cornerstone] Retrying after 500ms...');
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                }

                if (!firstImageLoaded) {
                    console.error('[Cornerstone] CRITICAL: Could not load first image after 3 attempts. Trying with second image...');
                    // Try the second image as fallback
                    try {
                        await imageLoader.loadAndCacheImage(sortedImageIds[1]);
                        console.log('[Cornerstone] Second image loaded successfully, using as reference');
                    } catch (err2) {
                        console.error('[Cornerstone] Failed to load second image too:', err2);
                    }
                }

                // 3. Determine Data Type from first image  
                let firstImageMetadata = metaData.get('imagePixelModule', sortedImageIds[0]);

                if (!firstImageMetadata) {
                    console.log('[Cornerstone] Waiting for metadata from remote source (retry 1)...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    firstImageMetadata = metaData.get('imagePixelModule', sortedImageIds[0]);
                }
                if (!firstImageMetadata) {
                    console.log('[Cornerstone] Waiting for metadata from remote source (retry 2)...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    firstImageMetadata = metaData.get('imagePixelModule', sortedImageIds[0]);
                }

                if (!firstImageMetadata) {
                    console.error('[Cornerstone] CRITICAL: No metadata found for first image after wait. Viewports might be black.');
                }

                let dataType = 'Uint16Array'; // default
                if (firstImageMetadata) {
                    const { pixelRepresentation, bitsAllocated } = firstImageMetadata;
                    const isSigned = pixelRepresentation === 1;

                    if (bitsAllocated === 8) {
                        dataType = isSigned ? 'Int8Array' : 'Uint8Array';
                    } else if (bitsAllocated === 16) {
                        dataType = isSigned ? 'Int16Array' : 'Uint16Array';
                    } else if (bitsAllocated === 32) {
                        dataType = isSigned ? 'Int32Array' : 'Uint32Array';
                    }
                }

                // Apply default windowing (VOI LUT) if missing
                let windowCenter = 400;
                let windowWidth = 1500;
                const voi = metaData.get('voiLutModule', sortedImageIds[0]);
                if (voi && voi.windowCenter && voi.windowCenter.length > 0) {
                    windowCenter = voi.windowCenter[0];
                    windowWidth = voi.windowWidth[0];
                }
                console.log(`[Cornerstone] Using Window Center: ${windowCenter}, Width: ${windowWidth}`);

                console.log(`[Cornerstone] Creating volume (${dataType}) for ${sortedImageIds.length} slices...`);

                // 4. Create Volume (Clear existing first if needed)
                if (cache.getVolume(volumeId)) {
                    cache.removeVolumeLoadObject(volumeId);
                }

                const volume = await volumeLoader.createAndCacheVolume(volumeId, {
                    imageIds: sortedImageIds,
                    dataType
                } as any);

                console.log(`[Cornerstone] Volume created: ${volumeId}. Loading slices...`);
                volume.load();

                // 5. Progress & Error Listeners
                const { eventTarget, Enums: CoreEnums } = await import('@cornerstonejs/core');

                const onImageLoadError = (evt: any) => {
                    console.error('[Cornerstone] IMAGE_LOAD_ERROR:', evt.detail);
                };
                const onImageLoaded = (evt: any) => {
                    // Only log occasionally to avoid flooding
                    if (Math.random() > 0.95) {
                        console.log(`[Cornerstone] Slice loaded: ${evt.detail.image.imageId}`);
                    }
                };
                const onVolumeLoaded = (evt: any) => {
                    console.log('[Cornerstone] VOLUME_LOADED:', evt.detail.volumeId);
                };

                eventTarget.addEventListener(CoreEnums.Events.IMAGE_LOAD_ERROR, onImageLoadError);
                eventTarget.addEventListener(CoreEnums.Events.IMAGE_LOADED, onImageLoaded);
                eventTarget.addEventListener(CoreEnums.Events.VOLUME_LOADED, onVolumeLoaded);

                cleanupListeners = () => {
                    eventTarget.removeEventListener(CoreEnums.Events.IMAGE_LOAD_ERROR, onImageLoadError);
                    eventTarget.removeEventListener(CoreEnums.Events.IMAGE_LOADED, onImageLoaded);
                    eventTarget.removeEventListener(CoreEnums.Events.VOLUME_LOADED, onVolumeLoaded);
                };

                // --- Existing rendering engine initialization ---
                const renderingEngine = new RenderingEngine(renderingEngineId);
                renderingEngineCallbackRef.current = renderingEngine;

                // 4. Viewports
                const viewportInput = [
                    {
                        viewportId: viewportIds.AXIAL,
                        type: ViewportType.ORTHOGRAPHIC,
                        element: elementRef.current.querySelector('#viewport-axial') as HTMLDivElement,
                        defaultOptions: { orientation: OrientationAxis.AXIAL },
                    },
                    {
                        viewportId: viewportIds.SAGITTAL,
                        type: ViewportType.ORTHOGRAPHIC,
                        element: elementRef.current.querySelector('#viewport-sagittal') as HTMLDivElement,
                        defaultOptions: { orientation: OrientationAxis.SAGITTAL },
                    },
                    {
                        viewportId: viewportIds.CORONAL,
                        type: ViewportType.ORTHOGRAPHIC,
                        element: elementRef.current.querySelector('#viewport-coronal') as HTMLDivElement,
                        defaultOptions: { orientation: OrientationAxis.CORONAL },
                    },
                    {
                        viewportId: viewportIds.THREED,
                        type: ViewportType.VOLUME_3D,
                        element: elementRef.current.querySelector('#viewport-threed') as HTMLDivElement,
                        defaultOptions: {
                            orientation: OrientationAxis.CORONAL,
                            background: [0, 0, 0] as Types.Point3
                        },
                    },
                ];

                renderingEngine.setViewports(viewportInput);

                // 5. Set Volume
                await setVolumesForViewports(
                    renderingEngine,
                    [{ volumeId }],
                    Object.values(viewportIds)
                );

                // 6. Tools Setup
                const tools = await import('@cornerstonejs/tools');
                const {
                    ToolGroupManager,
                    TrackballRotateTool,
                    WindowLevelTool,
                    PanTool,
                    ZoomTool,
                    StackScrollTool,
                    RectangleScissorsTool,
                    CircleScissorsTool
                } = tools;
                cornerstoneToolsRef.current = tools;

                // Assign viewports to correct tool groups
                const toolGroup2D = ToolGroupManager.getToolGroup(TOOL_GROUP_2D_ID);
                const toolGroup3D = ToolGroupManager.getToolGroup(TOOL_GROUP_3D_ID);

                if (toolGroup2D) {
                    [viewportIds.AXIAL, viewportIds.SAGITTAL, viewportIds.CORONAL].forEach(vpId => {
                        toolGroup2D.addViewport(vpId, renderingEngineId);
                    });

                    // Add Scissors Tools SAFELY
                    if (!toolGroup2D.getToolInstance(RectangleScissorsTool.toolName)) {
                        toolGroup2D.addTool(RectangleScissorsTool.toolName);
                    }
                    if (!toolGroup2D.getToolInstance(CircleScissorsTool.toolName)) {
                        toolGroup2D.addTool(CircleScissorsTool.toolName);
                    }

                    // Add 3D Eraser Event Listener
                    const element = elementRef.current;
                    if (element) {
                        element.addEventListener('cornerstonetoolsannotationcompleted', (evt: any) => {
                            const { detail } = evt;
                            if (!detail || !detail.annotation) return;

                            const annotation = detail.annotation;
                            const toolName = annotation.metadata?.toolName;

                            // Check if it's a scissors tool
                            if (toolName === RectangleScissorsTool.toolName || toolName === CircleScissorsTool.toolName) {
                                const viewportId = detail.viewportId;
                                const orientation = getViewportOrientation(viewportId);

                                // Get bounding box from annotation
                                const handles = annotation.data?.handles;
                                if (handles && handles.points) {
                                    const points = handles.points;
                                    const xs = points.map((p: number[]) => p[0]);
                                    const ys = points.map((p: number[]) => p[1]);

                                    const bounds = {
                                        x: Math.min(...xs),
                                        y: Math.min(...ys),
                                        width: Math.max(...xs) - Math.min(...xs),
                                        height: Math.max(...ys) - Math.min(...ys)
                                    };

                                    // Erase through entire 3D volume
                                    erase3DRegion('spine-segmentation', viewportId, bounds, orientation);

                                    // Refresh all viewports
                                    if (renderingEngineCallbackRef.current) {
                                        renderingEngineCallbackRef.current.render();
                                    }
                                }
                            }
                        });
                    }
                }

                if (toolGroup3D) {
                    toolGroup3D.addViewport(viewportIds.THREED, renderingEngineId);
                }

                // Activate initial tools
                if (toolGroup2D) {
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

                if (toolGroup3D) {
                    toolGroup3D.setToolActive(TrackballRotateTool.toolName, {
                        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
                    });
                    toolGroup3D.setToolActive(PanTool.toolName, {
                        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }],
                    });
                    toolGroup3D.setToolActive(ZoomTool.toolName, {
                        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }],
                    });
                }

                // 7. Initial Render & Sync Slice Info
                renderingEngine.render();

                setTimeout(() => {
                    if (!isMounted || !renderingEngineCallbackRef.current) return;
                    const engine = renderingEngineCallbackRef.current;
                    const newSliceData: Record<string, { index: number; count: number }> = {};

                    [viewportIds.AXIAL, viewportIds.SAGITTAL, viewportIds.CORONAL].forEach(id => {
                        const vp = engine.getViewport(id) as Types.IVolumeViewport;
                        if (vp) {
                            const count = vp.getNumberOfSlices();
                            const index = vp.getSliceIndex();
                            newSliceData[id] = { index, count };
                        }
                    });
                    setSliceData(newSliceData);
                    engine.render();
                }, 500);

                // 8. Apply Initial Preset for 3D — gold bone surface
                const viewport3D = renderingEngine.getViewport(viewportIds.THREED) as Types.IVolumeViewport;
                if (viewport3D) {
                    // Apply CT-Bone preset first
                    viewport3D.setProperties({ preset: 'CT-Bone' });

                    // Then override with gold color transfer function + sharp opacity curve
                    setTimeout(() => {
                        try {
                            const actors = viewport3D.getActors();
                            const volumeActor = actors?.[0]?.actor as any;
                            if (volumeActor) {
                                const property = volumeActor.getProperty();

                                // --- Gold Bone Color ---
                                const ctf = vtkColorTransferFunction.newInstance();
                                ctf.addRGBPoint(-1000, 0.0, 0.0, 0.0);  // Air — black
                                ctf.addRGBPoint(0, 0.30, 0.20, 0.10); // Soft tissue — dark brown
                                ctf.addRGBPoint(300, 0.75, 0.60, 0.30); // Trabecular bone — warm gold
                                ctf.addRGBPoint(700, 0.85, 0.72, 0.45); // Cortical bone — bright gold
                                ctf.addRGBPoint(1500, 0.92, 0.82, 0.60); // Dense/sclerotic — brighter
                                ctf.addRGBPoint(3000, 1.0, 1.0, 0.90); // Metal — near white
                                property.setRGBTransferFunction(0, ctf);

                                // --- Sharp opacity: transparent below 300 HU, solid bone above 400 ---
                                const pwf = vtkPiecewiseFunction.newInstance();
                                pwf.addPoint(-1000, 0.0);
                                pwf.addPoint(299, 0.0);  // Air & soft tissue: fully transparent
                                pwf.addPoint(300, 0.0);  // Sharp cut-off
                                pwf.addPoint(400, 0.15); // Trabecular bone just visible
                                pwf.addPoint(700, 0.55); // Cortical bone solid
                                pwf.addPoint(1900, 0.80); // Dense bone
                                pwf.addPoint(3000, 0.90); // Metal implants
                                property.setScalarOpacity(0, pwf);

                                // --- Shading for 3D depth ---
                                property.setShade(true);
                                property.setAmbient(0.25);
                                property.setDiffuse(0.75);
                                property.setSpecular(0.30);
                                property.setSpecularPower(20);
                                property.setInterpolationTypeToLinear();
                            }
                            viewport3D.render();
                        } catch (e) {
                            console.warn('[3D] Gold bone TF error:', e);
                        }
                    }, 800);

                    viewport3D.render();
                }

            } catch (err) {

                console.error("Cornerstone Boot Error:", err);
            } finally {
                setIsLoading(false);
            }
        };

        startup();

        return () => {
            isMounted = false;
            if (typeof cleanupListeners === 'function') cleanupListeners();
            runningRef.current = false;
            destroyEngine();
        };
    }, [fileList]);

    // Standard Click Listener Fallback
    // Standard Click Listener Fallback — always attach if element is ready
    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        console.log('[Cornerstone Viewport] Initializing click listener for placement tools');

        const handleStandardClick = (evt: MouseEvent) => {
            const { interactionMode, activeLandmarkLevel } = useAppStore.getState().dicom3D;

            // Log every click when in a placement mode
            if (interactionMode.startsWith('place_') || interactionMode === 'place_screw') {
                console.log(`[Viewport Click] Capture event. Mode: ${interactionMode}, Level: ${activeLandmarkLevel}`);
            }

            // Only intervene if we are in a placement mode
            if (interactionMode !== 'place_screw' && !interactionMode.startsWith('place_')) return;

            // Find which viewport was clicked
            const engine = renderingEngineCallbackRef.current;
            if (!engine) {
                console.warn('[Viewport Click] Click ignored: Rendering engine is starting or not available yet');
                return;
            }

            const target = evt.target as HTMLElement;
            const viewports = engine.getViewports();
            const viewport = viewports.find(vp => vp.element.contains(target)) as Types.IVolumeViewport;

            if (!viewport) {
                console.debug('[Viewport Click] Click outside viewports');
                return;
            }

            let worldPos: Types.Point3 | undefined;

            if (viewport.id === viewportIds.THREED) {
                // --- 3D Surface Picking ---
                const actors = viewport.getActors();
                const volumeActor = actors?.[0]?.actor as any;
                if (!volumeActor) return;

                const picker = vtkCellPicker.newInstance();
                picker.setTolerance(0.001);

                const rect = viewport.element.getBoundingClientRect();
                const x = evt.clientX - rect.left;
                const y = evt.clientY - rect.top;

                // VTK uses Y from bottom
                const pickerY = rect.height - y;

                const renderer = (viewport as any).getRenderer();
                if (renderer) {
                    // CRITICAL: Filter actors to ensure we only pick the volume, not UI/CropBox
                    const actors = viewport.getActors();
                    const volumeActor = actors.find(a => a.actor.getClassName() === 'vtkVolume')?.actor;

                    if (volumeActor) {
                        picker.setPickFromList(true);
                        picker.addPickList(volumeActor as any);
                        picker.pick([x, pickerY, 0], renderer);
                        const pos = picker.getPickPosition();
                        if (pos && (pos[0] !== 0 || pos[1] !== 0 || pos[2] !== 0)) {
                            worldPos = [pos[0], pos[1], pos[2]] as Types.Point3;
                            console.log(`[3D Click] Surface Point: [${worldPos[0].toFixed(1)}, ${worldPos[1].toFixed(1)}, ${worldPos[2].toFixed(1)}]`);
                        }
                    } else {
                        console.warn('[3D Click] No volume actor found for picking');
                    }
                }
            } else {
                // --- Standard 2D Canvas Picking ---
                const rect = viewport.element.getBoundingClientRect();
                const canvasPos = [evt.clientX - rect.left, evt.clientY - rect.top] as Types.Point2;
                worldPos = viewport.canvasToWorld(canvasPos);
            }

            if (!worldPos) {
                console.error('[Viewport Click] ✘ Coordinate error: point not found');
                return;
            }

            console.log(`[Viewport Click] ✓ Success. World Position: [${worldPos[0].toFixed(1)}, ${worldPos[1].toFixed(1)}, ${worldPos[2].toFixed(1)}]`);

            const { addThreeDImplant, setSelectedDicomImplant, setDicom3DMode } = useAppStore.getState();

            if (interactionMode === 'place_screw') {
                const { screwDiameter, screwLength, screwLevel, screwSide } = useAppStore.getState().dicom3D;
                const id = `screw-${Date.now()}`;
                const diameter = screwDiameter;
                const length = screwLength;
                const dKey = Math.round(diameter * 100).toString();
                const modelName = `scaled_${dKey}x${length}.vtk`;

                const newScrew = {
                    id,
                    type: 'screw' as const,
                    position: [worldPos[0], worldPos[1], worldPos[2]] as [number, number, number],
                    direction: [0, 0, 1] as [number, number, number],
                    level: screwLevel,
                    side: screwSide,
                    properties: {
                        diameter,
                        length,
                        color: '#22d3ee', // Cyan
                        modelPath: `/models/screws/${modelName}`,
                        medialAngle: screwSide === 'L' ? 10 : -10,
                        caudalAngle: -5
                    }
                };

                console.log(`[Viewport Click] Creating direct screw implant: ${id} at level ${screwLevel} ${screwSide}`);
                addThreeDImplant(newScrew);
                setSelectedDicomImplant(id);
                setDicom3DMode('view'); // Exit placement mode after one click
                return;
            }

            // Landmark placement — read activeLandmarkLevel from store (not stale closure)
            if (interactionMode.startsWith('place_') && activeLandmarkLevel) {
                let type: 'VAP' | 'PIP_L' | 'PIP_R' | 'FIDUCIAL' | null = null;
                if (interactionMode === 'place_vap') type = 'VAP';
                else if (interactionMode === 'place_pip_l') type = 'PIP_L';
                else if (interactionMode === 'place_pip_r') type = 'PIP_R';
                else if (interactionMode === 'place_fiducial') type = 'FIDUCIAL';

                if (type) {
                    const { addPedicleLandmark: apbl, dicom3D: currentDicom3D } = useAppStore.getState();

                    let viewOrientation: 'AXIAL' | 'SAGITTAL' | 'CORONAL' | undefined = undefined;
                    const vpId = viewport.id.toUpperCase();
                    if (vpId.includes('AXIAL')) viewOrientation = 'AXIAL';
                    else if (vpId.includes('SAGITTAL')) viewOrientation = 'SAGITTAL';
                    else if (vpId.includes('CORONAL')) viewOrientation = 'CORONAL';
                    else if (vpId.includes('THREED')) viewOrientation = undefined; // Force 3D mode update in store

                    console.log(`[Viewport Click] Placing/Refining landmark: ${type} for level: ${activeLandmarkLevel} (View: ${viewOrientation || '3D Reconstruction'})`);

                    // Use existing ID if we are refining a fiducial
                    const idToUse = (type === 'FIDUCIAL' && currentDicom3D.selectedLandmarkId)
                        ? currentDicom3D.selectedLandmarkId
                        : `landmark-${Date.now()}`;

                    apbl({
                        id: idToUse,
                        type,
                        worldPos: [worldPos[0], worldPos[1], worldPos[2]] as [number, number, number],
                        label: activeLandmarkLevel,
                        viewOrientation
                    });
                }
            }
        };

        element.addEventListener('click', handleStandardClick);
        return () => {
            element.removeEventListener('click', handleStandardClick);
        };
    }, []); // Always attach to element, engine is checked dynamically

    // --- Layout & Resize Management ---
    useEffect(() => {
        if (!elementRef.current || !renderingEngineCallbackRef.current) return;

        const engine = renderingEngineCallbackRef.current;

        // Multiple resize passes to handle CSS transitions, flex reflow, and hidden-to-visible transitions
        const doResize = () => {
            if (!engine) return;
            try {
                engine.resize(true);
                engine.getViewports().forEach(vp => {
                    try { vp.render(); } catch (_) { }
                });
            } catch (_) { }
        };

        const timer1 = setTimeout(doResize, 50);
        const timer2 = setTimeout(doResize, 200);
        const timer3 = setTimeout(doResize, 600);
        const timer4 = setTimeout(doResize, 1500); // Catch slow CSS transitions

        const resizeObserver = new ResizeObserver(doResize);
        resizeObserver.observe(elementRef.current);

        return () => {
            resizeObserver.disconnect();
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);
            clearTimeout(timer4);
        };
    }, [dicom3D.layoutMode]); // Re-run when layout mode changes


    // --- Slice Navigation Handler ---
    const updateSlice = (viewportId: string, index: number) => {
        if (!renderingEngineCallbackRef.current) return;
        const vp = renderingEngineCallbackRef.current.getViewport(viewportId) as Types.IVolumeViewport;
        if (vp) {
            const viewRef = vp.getViewReference();
            vp.setViewReference({
                ...viewRef,
                sliceIndex: index
            });
            vp.render();
            setSliceData(prev => ({
                ...prev,
                [viewportId]: { ...prev[viewportId], index }
            }));
        }
    };

    const toggleMaximize = (viewportId: string) => {
        setMaximizedViewportId(prev => (prev === viewportId ? null : viewportId));
        setTimeout(() => {
            const engine = renderingEngineCallbackRef.current;
            if (engine) {
                engine.resize(true);
                engine.getViewports().forEach(vp => {
                    vp.resetCamera();
                    vp.render();
                });
            }
        }, 100);
    };

    // --- Tool Management (Scissors vs View) ---
    useEffect(() => {
        const engine = renderingEngineCallbackRef.current;
        if (!engine) return;

        // Use TOOL_GROUP_2D_ID from init
        const toolGroup2D = ToolGroupManager.getToolGroup(TOOL_GROUP_2D_ID);
        const toolGroup3D = ToolGroupManager.getToolGroup(TOOL_GROUP_3D_ID);

        if (!toolGroup2D || !toolGroup3D) return;

        const isScissors = dicom3D.renderMode === 'segmentation' && dicom3D.activeSegmentationTool === 'scissors';
        const isPlacingLandmark = dicom3D.interactionMode.startsWith('place_');

        if (isScissors || isPlacingLandmark) {
            // CRITICAL: Disable WindowLevel when placing/editing
            toolGroup2D.setToolPassive(WindowLevelTool.toolName);

            if (isScissors) {
                const hasTool = !!(toolGroup2D as any)._toolInstances?.['RectangleScissors'];
                if (hasTool) {
                    toolGroup2D.setToolActive('RectangleScissors', {
                        bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
                    });
                }
            }
        } else {
            // Restore default interactive tools
            const hasTool = !!(toolGroup2D as any)._toolInstances?.['RectangleScissors'];
            if (hasTool) toolGroup2D.setToolPassive('RectangleScissors');

            toolGroup2D.setToolActive(WindowLevelTool.toolName, {
                bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
            });

            if (dicom3D.interactionMode === 'view') {
                toolGroup3D.setToolActive(TrackballRotateTool.toolName, {
                    bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
                });
            }
        }
    }, [dicom3D.renderMode, dicom3D.activeSegmentationTool, dicom3D.interactionMode]);

    // --- GENERIC TOOL MANAGEMENT (Sidebar Utilities) ---
    useEffect(() => {
        const engine = renderingEngineCallbackRef.current;
        if (!engine) return;

        const toolGroup2D = ToolGroupManager.getToolGroup(TOOL_GROUP_2D_ID);
        if (!toolGroup2D) return;

        // Reset all generic tools to passive first
        const genericTools = ['Length', 'Angle', 'Bidirectional', 'ArrowAnnotate', 'PlanarFreehandROI', 'CircleROI'];
        genericTools.forEach(t => toolGroup2D.setToolPassive(t));

        if (!activeTool) return;

        // Map sidebar ID to tool name
        const toolMap: Record<string, string> = {
            'line': 'Length',
            'pencil': 'PlanarFreehandROI',
            'text': 'ArrowAnnotate',
            'circle': 'CircleROI',
            'angle-2pt': 'Angle',
            'angle-3pt': 'Angle',
            'angle-4pt': 'Angle',
        };

        const toolName = toolMap[activeTool];
        if (toolName) {
            console.log(`[Cornerstone] Activating generic tool: ${toolName}`);
            toolGroup2D.setToolActive(toolName, {
                bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }],
            });
            // Disable window level while measuring
            toolGroup2D.setToolPassive(WindowLevelTool.toolName);
        }
    }, [activeTool]);

    // 3D Implant Actor Management — uses Cornerstone's own addActors() API
    useEffect(() => {
        const engine = renderingEngineCallbackRef.current;
        if (!engine) return;
        const viewport = engine.getViewport(viewportIds.THREED) as Types.IVolumeViewport;
        if (!viewport) return;

        // Actor cache: keyed by implant ID, stored on the viewport object to survive re-renders
        if (!(viewport as any)._screwActors) {
            (viewport as any)._screwActors = {} as Record<string, any>;
        }
        const cache = (viewport as any)._screwActors as Record<string, any>;

        const updateActors = async () => {
            const { threeDImplants, pedicleSimulations } = useAppStore.getState();

            // ── 1. Update/Add Screw Actors ───────────────────────────────
            // Collect all IDs that should exist
            const activeIds = new Set<string>();
            threeDImplants.forEach(imp => activeIds.add(imp.id));

            // Add Landmarks as spheres/shapes for feedback
            pedicleSimulations.forEach(sim => {
                Object.values(sim.landmarks).forEach((lm: any) => {
                    if (Array.isArray(lm)) {
                        lm.forEach(f => activeIds.add(f.id));
                    } else if (lm && lm.id) {
                        activeIds.add(lm.id);
                    }
                });
            });

            // Remove stale actors
            const cachedIds = Object.keys(cache);
            for (const id of cachedIds) {
                if (!activeIds.has(id)) {
                    try { viewport.removeActors([id]); } catch (_) {
                        try {
                            const rend = (viewport as any).getRenderer?.();
                            rend?.removeActor(cache[id]);
                        } catch (_) { }
                    }
                    delete cache[id];
                }
            }

            // --- A. Process Implants (Screws) ---
            for (const imp of threeDImplants) {
                let actor = cache[imp.id];
                if (!actor) {
                    try {
                        // Use the high-fidelity procedural screw generator
                        actor = createHighFidelityScrewActor({
                            diameter: imp.properties.diameter || 6.5,
                            length: imp.properties.length || 40,
                            color: imp.properties.color || '#22d3ee'
                        });

                        viewport.addActors([{ uid: imp.id, actor }]);
                        cache[imp.id] = actor;
                    } catch (e) {
                        console.error('[3D Screw] Generation Error:', e);
                        continue;
                    }
                }

                // ── Unified 2D/3D Trajectory Logic ──────────────────────────
                // Use the same math as 2D overlays to ensure perfect sync.
                const { entry: worldEntry, tip: worldTip } = getTransformedScrewTrajectory(
                    imp.position as [number, number, number],
                    imp.direction as [number, number, number],
                    imp.properties
                );

                const screwLen = imp.properties.length || 40;
                const screwDiam = imp.properties.diameter || 6.5;
                const tipModelOffset = screwLen / 2 + 1.5 * screwDiam;

                const axis = [
                    worldEntry[0] - worldTip[0],
                    worldEntry[1] - worldTip[1],
                    worldEntry[2] - worldTip[2]
                ];
                const axisLen = Math.hypot(axis[0], axis[1], axis[2]);
                const normAxis = [axis[0] / axisLen, axis[1] / axisLen, axis[2] / axisLen];

                const matrix = vtkMatrixBuilder.buildFromRadian()
                    .translate(worldTip[0], worldTip[1], worldTip[2])
                    .rotateFromDirections([0, 1, 0], normAxis)
                    .translate(0, tipModelOffset, 0)
                    .getMatrix();

                actor.setUserMatrix(matrix);
            }

            // --- B. Process Landmarks (3D Shapes) ---
            pedicleSimulations.forEach(sim => {
                const allLandmarks: any[] = [];
                Object.entries(sim.landmarks).forEach(([key, value]) => {
                    if (key === 'fiducials' && Array.isArray(value)) {
                        allLandmarks.push(...value);
                    } else if (value && !Array.isArray(value)) {
                        allLandmarks.push(value);
                    }
                });

                allLandmarks.forEach((lm: any) => {
                    let actor = cache[lm.id];
                    if (!actor) {
                        let source;
                        if (lm.type === 'PIP_L' || lm.type === 'PIP_R') {
                            // Screw Head (Cylinder)
                            source = vtkCylinderSource.newInstance();
                            source.setRadius(3.5);
                            source.setHeight(4);
                            source.setResolution(20);
                        } else if (lm.type === 'VAP') {
                            // Screw Tip (Cone)
                            source = vtkConeSource.newInstance();
                            source.setRadius(3);
                            source.setHeight(6);
                            source.setResolution(20);
                            source.setDirection(0, 0, 1); // Pointing forward along Z initially
                        } else {
                            // Fallback to Sphere
                            source = vtkSphereSource.newInstance();
                            source.setRadius(2);
                        }

                        const mapper = vtkMapper.newInstance();
                        mapper.setInputConnection(source.getOutputPort());
                        actor = vtkActor.newInstance();
                        actor.setMapper(mapper);

                        // Orange/Gold for Landmarks (as shown in images)
                        actor.getProperty().setColor(1.0, 0.52, 0.1);
                        actor.getProperty().setAmbient(0.3);
                        actor.getProperty().setDiffuse(0.7);
                        actor.getProperty().setSpecular(0.4);
                        actor.getProperty().setSpecularPower(20);
                        actor.setPickable(false); // Landmark shapes should not be pickable

                        viewport.addActors([{ uid: lm.id, actor }]);
                        cache[lm.id] = actor;
                    }

                    // --- Orientation logic for Cylinder/Cone ---
                    actor.setOrientation(0, 0, 0); // Reset

                    const vap = sim.landmarks.VAP;
                    const pip = sim.landmarks.PIP_L || sim.landmarks.PIP_R;

                    if (vap && pip) {
                        const dx = vap.worldPos[0] - pip.worldPos[0];
                        const dy = vap.worldPos[1] - pip.worldPos[1];
                        const dz = vap.worldPos[2] - pip.worldPos[2];
                        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

                        if (len > 0.001) {
                            const dir = [dx / len, dy / len, dz / len];
                            const modelAxis = [0, 0, 1];
                            const rAxis = [
                                modelAxis[1] * dir[2] - modelAxis[2] * dir[1],
                                modelAxis[2] * dir[0] - modelAxis[0] * dir[2],
                                modelAxis[0] * dir[1] - modelAxis[1] * dir[0],
                            ];
                            const axisLen = Math.hypot(rAxis[0], rAxis[1], rAxis[2]);
                            const dot = Math.min(1, Math.max(-1, modelAxis[0] * dir[0] + modelAxis[1] * dir[1] + modelAxis[2] * dir[2]));
                            const angleDeg = Math.acos(dot) * (180 / Math.PI);

                            if (axisLen > 0.001) {
                                actor.rotateWXYZ(angleDeg, rAxis[0] / axisLen, rAxis[1] / axisLen, rAxis[2] / axisLen);
                            }
                        }
                    }

                    actor.setPosition(lm.worldPos[0], lm.worldPos[1], lm.worldPos[2]);
                });
            });

            viewport.render();
        };

        updateActors();
    }, [threeDImplants, pedicleSimulations]);

    useEffect(() => {
        if (!renderingEngineCallbackRef.current || !volumeId || dicom3D.renderMode !== 'segmentation') return;

        const setupSegmentation = async () => {
            const segmentationId = 'spine-segmentation';
            const engine = renderingEngineCallbackRef.current;
            if (!engine) return;

            const segs = segmentation.state.getSegmentations();
            if (!segs.find(s => s.segmentationId === segmentationId)) {
                try {
                    await volumeLoader.createAndCacheDerivedVolume(volumeId, { volumeId: segmentationId });
                    await segmentation.addSegmentations([{
                        segmentationId,
                        representation: {
                            type: ToolsEnums.SegmentationRepresentations.Labelmap,
                            data: { volumeId: segmentationId },
                        },
                    }]);
                } catch (err) {
                    console.error('[Cornerstone] Global Setup Error:', err);
                    return;
                }
            }

            const vps = engine.getViewports();
            for (const vp of vps) {
                const vpId = vp.id;
                const reps = segmentation.state.getSegmentationRepresentations(vpId);
                if (!reps || !reps.find(r => r.segmentationId === segmentationId)) {
                    try {
                        await segmentation.addSegmentationRepresentations(vpId, [{
                            segmentationId,
                            type: ToolsEnums.SegmentationRepresentations.Labelmap,
                        }]);
                        const specifier = { segmentationId, type: ToolsEnums.SegmentationRepresentations.Labelmap };
                        segmentation.config.visibility.setSegmentationRepresentationVisibility(vpId, specifier, true);
                    } catch (err) {
                        console.warn(`[Cornerstone] Viewport Bind Warning (${vpId}):`, err);
                    }
                }
            }

            segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);
            segmentation.config.style.setStyle(
                { type: ToolsEnums.SegmentationRepresentations.Labelmap },
                { fillAlpha: 0.7, outlineWidth: 2 }
            );
            engine.render();
        };

        setupSegmentation();
    }, [dicom3D.renderMode, volumeId]);

    // Fast Thresholding & Dual Control Effect
    useEffect(() => {
        if (!volumeId) return;

        const updateThresholds = () => {
            const segmentationId = 'spine-segmentation';
            const segVolume = cache.getVolume(segmentationId) as any;
            const refVolume = cache.getVolume(volumeId) as any;

            if (!refVolume) return;

            try {
                // 1. Update Segmentation Mask if in Seg Mode
                // Ensure volume exists and has data access method
                if (dicom3D.renderMode === 'segmentation' && segVolume && typeof segVolume.getScalarData === 'function') {
                    const threshold = dicom3D.isoThreshold;
                    const imageIds = refVolume.imageIds;
                    const segImageIds = segVolume.imageIds;

                    if (imageIds && segImageIds) {
                        for (let i = 0; i < imageIds.length; i++) {
                            const refImage = cache.getImage(imageIds[i]);
                            const segImage = cache.getImage(segImageIds[i]);
                            if (!refImage || !segImage) continue;
                            const refData = refImage.getPixelData();
                            const segData = segImage.getPixelData();
                            for (let j = 0; j < refData.length; j++) {
                                segData[j] = refData[j] >= threshold ? 1 : 0;
                            }
                        }
                    } else if (typeof refVolume.getScalarData === 'function') {
                        const scalarData = refVolume.getScalarData();
                        const segData = segVolume.getScalarData();
                        if (scalarData && segData) {
                            for (let i = 0; i < scalarData.length; i++) {
                                segData[i] = scalarData[i] >= threshold ? 1 : 0;
                            }
                        }
                    }

                    // --- AUTOMATIC: Noise Reduction (Keep Largest Island) ---
                    if (dicom3D.noiseReduction) {
                        const dimensions = refVolume.dimensions as [number, number, number];
                        if (dimensions && segVolume.getScalarData()) {
                            // Note: filterIslands expects binary data and modifies in-place
                            const segData = segVolume.getScalarData() as Uint8Array;
                            filterIslands(segData, dimensions, { keepSingleLargest: true });
                        }
                    }

                    segVolume.modified();
                }

                // 2. Anatomical Volume Rerender (3D Viewport)
                const engine = renderingEngineCallbackRef.current;
                const vp3D = engine?.getViewport(viewportIds.THREED) as Types.IVolumeViewport;

                if (vp3D && dicom3D.renderMode === 'volume') {
                    // --- DYNAMIC TRANSFER FUNCTION FOR VOLUME MODE ---
                    // This enables "Spine Extraction" by hiding soft tissue
                    if (dicom3D.volumeThreshold !== undefined) {
                        try {
                            const actors = vp3D.getActors();
                            // Usually the first actor is the main volume
                            const volumeActor = actors[0]?.actor as any;
                            if (volumeActor) {
                                const property = volumeActor.getProperty();
                                const vtkUtils = (window as any).vtkUtils;

                                if (vtkUtils) {
                                    // Enhance the CT-Bone preset with dynamic thresholding
                                    const pwf = vtkUtils.PiecewiseFunction.newInstance();

                                    // Sharp cutoff at volumeThreshold
                                    const t = dicom3D.volumeThreshold;

                                    // Points: (intensity, opacity)
                                    pwf.addPoint(t - 1, 0);       // Fully transparent below threshold
                                    pwf.addPoint(t, 0);           // Start point
                                    pwf.addPoint(t + 50, 0.2);    // Rapid rise
                                    pwf.addPoint(t + 300, 0.6);   // Body of bone
                                    pwf.addPoint(3000, 0.9);      // Dense bone/metal

                                    property.setScalarOpacity(0, pwf);
                                    property.setInterpolationTypeToLinear();
                                }
                            }
                        } catch (e) {
                            console.warn('[Volume] TF Update Error:', e);
                        }
                    }
                    vp3D.render();
                } else if (engine) {
                    engine.render();
                }
            } catch (err) {
                console.error('[Cornerstone] Sync Error:', err);
            }
        };

        const timeout = setTimeout(updateThresholds, 10);
        return () => clearTimeout(timeout);
    }, [dicom3D.isoThreshold, dicom3D.volumeThreshold, dicom3D.renderMode, dicom3D.noiseReduction, volumeId]);

    // --- 3D Visualization Sync (Volume vs Segmentation Styling) ---
    useEffect(() => {
        const engine = renderingEngineCallbackRef.current;
        if (!engine || !volumeId) return;

        const vp3D = engine.getViewport(viewportIds.THREED) as Types.IVolumeViewport;
        if (!vp3D) return;

        const sync3DStyle = async () => {
            const segmentationId = 'spine-segmentation';
            try {
                if (dicom3D.renderMode === 'segmentation') {
                    const segVol = cache.getVolume(segmentationId) as any;
                    if (!segVol) return;

                    // --- Advanced Smoothing (Gaussian Blur) for 3D ONLY ---
                    if (dicom3D.segmentationSmoothing) {
                        const dimensions = segVol.dimensions as [number, number, number];
                        const segScalarData = segVol.getScalarData();
                        if (dimensions && segScalarData) {
                            const originalData = segScalarData as Uint8Array;
                            const smoothedData = smoothMask(originalData, dimensions); // Returns 0.0-1.0 floats

                            // Create a temporary smoothed volume ID
                            const smoothedVolId = `${segmentationId}-smoothed`;

                            // Check if smoothed volume already exists, if so remove it
                            if (cache.getVolume(smoothedVolId)) {
                                cache.removeVolumeLoadObject(smoothedVolId);
                            }

                            // Create new volume with smoothed data
                            const smoothedVol = await volumeLoader.createAndCacheDerivedVolume(
                                volumeId,
                                { volumeId: smoothedVolId }
                            );

                            // Copy smoothed data with SCALING
                            // derived volumes are often same type as source (e.g. Int16 or Uint8)
                            // We scale 0.0-1.0 to 0-255 to maintain precision in integer arrays
                            const smoothedScalarData = (smoothedVol as any).getScalarData();
                            if (smoothedScalarData) {
                                for (let i = 0; i < smoothedData.length; i++) {
                                    (smoothedScalarData as any)[i] = smoothedData[i] * 255;
                                }
                                smoothedVol.modified();
                            }

                            // Use smoothed volume for rendering
                            await vp3D.setVolumes([{
                                volumeId: smoothedVolId,
                                callback: ({ volumeActor }) => {
                                    const property = volumeActor.getProperty();
                                    const vtkUtils = (window as any).vtkUtils;
                                    if (vtkUtils) {
                                        const { r, g, b } = dicom3D.segmentationColor;
                                        const ctf = vtkUtils.ColorTransferFunction.newInstance();
                                        // Map 0-255 range
                                        ctf.addRGBPoint(0, 0, 0, 0);
                                        ctf.addRGBPoint(25, r * 0.3, g * 0.3, b * 0.3); // 0.1 * 255
                                        ctf.addRGBPoint(127, r * 0.7, g * 0.7, b * 0.7); // 0.5 * 255
                                        ctf.addRGBPoint(255, r, g, b); // 1.0 * 255
                                        property.setRGBTransferFunction(0, ctf);

                                        // Smooth opacity curve for gradual fade
                                        const pwf = vtkUtils.PiecewiseFunction.newInstance();
                                        pwf.addPoint(0, 0);
                                        pwf.addPoint(10, 0);      // cutoff low values
                                        pwf.addPoint(50, 0.3);
                                        pwf.addPoint(127, 0.8);
                                        pwf.addPoint(255, 1.0);
                                        property.setScalarOpacity(0, pwf);

                                        // Enhanced shading for smooth appearance
                                        property.setShade(true);
                                        property.setAmbient(0.4);
                                        property.setDiffuse(0.7);
                                        property.setSpecular(0.3);
                                        property.setSpecularPower(20);
                                        property.setInterpolationTypeToLinear();
                                    }
                                }
                            }]);
                        }
                    } else {
                        // Standard binary rendering without smoothing
                        await vp3D.setVolumes([{
                            volumeId: segmentationId,
                            callback: ({ volumeActor }) => {
                                const property = volumeActor.getProperty();
                                const vtkUtils = (window as any).vtkUtils;
                                if (vtkUtils) {
                                    const { r, g, b } = dicom3D.segmentationColor;
                                    const ctf = vtkUtils.ColorTransferFunction.newInstance();
                                    ctf.addRGBPoint(0, 0, 0, 0);
                                    ctf.addRGBPoint(1, r, g, b);
                                    property.setRGBTransferFunction(0, ctf);

                                    const pwf = vtkUtils.PiecewiseFunction.newInstance();
                                    pwf.addPoint(0, 0);
                                    pwf.addPoint(0.5, 0);
                                    pwf.addPoint(0.51, 1.0);
                                    pwf.addPoint(1, 1.0);
                                    property.setScalarOpacity(0, pwf);

                                    property.setShade(true);
                                    property.setAmbient(0.3);
                                    property.setDiffuse(0.8);
                                    property.setInterpolationTypeToNearest();
                                }
                            }
                        }]);
                    }
                } else {
                    // Only set volumes if not already correct to prevent flickering/interaction reset
                    const currentActors = vp3D.getActors();
                    const segmentationId = 'spine-segmentation';

                    // Identify which actors are the main volume/segmentation vs overlays
                    const hasMainVol = currentActors.some((a: any) =>
                        a.uid === volumeId ||
                        a.uid === segmentationId ||
                        a.uid === `${segmentationId}-smoothed`
                    );

                    // We only want to "reset" (setVolumes) if the core volume actor is missing
                    if (!hasMainVol) {
                        await vp3D.setVolumes([{ volumeId }]);
                        vp3D.setProperties({ preset: 'CT-Bone' });
                    }
                }

                const actor = vp3D.getActors()?.[0]?.actor as any;
                const mapper = actor?.getMapper();
                if (mapper && (mapper.setInteractiveSampleDistance || mapper.setSampleDistance)) {
                    // CRITICAL: Force interactive sample distance to be small. 
                    // Defaults are often 10x larger during rotation, causing thin models to vanish.
                    if (typeof mapper.setInteractiveSampleDistance === 'function') {
                        mapper.setInteractiveSampleDistance(1.0);
                    }
                    if (typeof mapper.setSampleDistance === 'function') {
                        mapper.setSampleDistance(1.0);
                    }
                }

                vp3D.render();

                // CRITICAL: Reset clipping range to avoid model "vanishing" on rotation
                const renderer = (vp3D as any).getRenderer();
                if (renderer) {
                    renderer.resetCameraClippingRange();
                }
            } catch (err) {
                console.warn('[Cornerstone] 3D Sync Error:', err);
            }
        };

        sync3DStyle();

        // Force re-render of 3D viewport on layout change
        if (engine) {
            const vp = engine.getViewport(viewportIds.THREED);
            if (vp) setTimeout(() => vp.render(), 800);
        }
    }, [dicom3D.renderMode, dicom3D.layoutMode, dicom3D.segmentationColor, dicom3D.segmentationSmoothing, dicom3D.noiseReduction, volumeId]);

    /* 
     // --- 3D Volume Cropping logic ---
     useEffect(() => {
         const engine = renderingEngineCallbackRef.current;
         if (!engine || !volumeId) return;
     
         const vp3D = engine.getViewport(viewportIds.THREED) as Types.IVolumeViewport;
         if (!vp3D) return;
     
         const actors = vp3D.getActors();
         if (!actors || actors.length === 0) return;
     
         try {
             // Robust Volumetric Clipping
             // Use vtkPlane clipping applied to all volume actors for sync and stability.
             const volumeMappers: any[] = [];
             vp3D.getActors().forEach(({ actor }) => {
                 const am = actor.getMapper() as any;
                 if (actor.getClassName() === 'vtkVolume') {
                     volumeMappers.push(am);
                 }
                 if (am && typeof am.removeAllClippingPlanes === 'function') {
                     am.removeAllClippingPlanes();
                 }
             });
     
             if (dicom3D.isCroppingActive && volumeMappers.length > 0) {
                 const b = volumeMappers[0].getBounds();
                 if (b) {
                     const { x0, x1, y0, y1, z0, z1 } = dicom3D.roiCrop;
                     const b_ = b;
                     const cropX0 = b_[0] + (b_[1] - b_[0]) * x0;
                     const cropX1 = b_[0] + (b_[1] - b_[0]) * x1;
                     const cropY0 = b_[2] + (b_[3] - b_[2]) * y0;
                     const cropY1 = b_[2] + (b_[3] - b_[2]) * y1;
                     const cropZ0 = b_[4] + (b_[5] - b_[4]) * z0;
                     const cropZ1 = b_[4] + (b_[5] - b_[4]) * z1;
     
                     const createPlane = (origin: any, normal: any) => {
                         const plane = vtkPlane.newInstance();
                         plane.setOrigin(origin);
                         plane.setNormal(normal);
                         return plane;
                     };
     
                     const planes = [
                         createPlane([cropX0, 0, 0], [1, 0, 0]),
                         createPlane([cropX1, 0, 0], [-1, 0, 0]),
                         createPlane([0, cropY0, 0], [0, 1, 0]),
                         createPlane([0, cropY1, 0], [0, -1, 0]),
                         createPlane([0, 0, cropZ0], [0, 0, 1]),
                         createPlane([0, 0, cropZ1], [0, 0, -1])
                     ];
     
                     volumeMappers.forEach(m => {
                         if (typeof m.addClippingPlane === 'function') {
                             planes.forEach(p => m.addClippingPlane(p));
                         }
                     });
                 }
             }
     
             // --- Visual 3D Crop Box (Wireframe) ---
             const boxId = '3d-crop-box';
             let boxActor = actors.find(a => a.uid === boxId)?.actor as any;
     
             if (!dicom3D.isCroppingActive || !dicom3D.showClipBox3D) {
                 if (boxActor) vp3D.removeActors([boxId]);
             } else if (volumeMappers.length > 0) {
                 const b = volumeMappers[0].getBounds();
                 if (b) {
                     const { x0, x1, y0, y1, z0, z1 } = dicom3D.roiCrop;
                     const cX = b[0] + (b[1] - b[0]) * (x0 + x1) / 2;
                     const cY = b[2] + (b[3] - b[2]) * (y0 + y1) / 2;
                     const cZ = b[4] + (b[5] - b[4]) * (z0 + z1) / 2;
                     const dX = (b[1] - b[0]) * (x1 - x0);
                     const dY = (b[3] - b[2]) * (y1 - y0);
                     const dZ = (b[5] - b[4]) * (z1 - z0);
     
                     if (!boxActor) {
                         const source = vtkCubeSource.newInstance();
                         const boxMapper = vtkMapper.newInstance();
                         boxMapper.setInputConnection(source.getOutputPort());
                         boxActor = vtkActor.newInstance();
                         boxActor.setMapper(boxMapper);
                         boxActor.getProperty().setRepresentationToWireframe();
                         boxActor.getProperty().setColor(1.0, 0.4, 0.7); // Pink/Magenta
                         boxActor.getProperty().setLineWidth(2);
                         boxActor.getProperty().setLighting(false);
                         boxActor.setPickable(false); // CRITICAL: Crop box must not interfere with picking
                         vp3D.addActors([{ uid: boxId, actor: boxActor }]);
                     }
     
                     boxActor.setPosition(cX, cY, cZ);
                     boxActor.setScale(dX, dY, dZ);
                 }
             }
     
             // CRITICAL: Reset camera and clipping range to avoid model vanishing
             const renderer = (vp3D as any).getRenderer();
             if (renderer) {
                 renderer.resetCameraClippingRange();
             }
             vp3D.resetCamera();
             vp3D.render();
         } catch (err) {
             console.warn('[Cornerstone] Crop Error:', err);
         }
     }, [dicom3D.roiCrop, dicom3D.isCroppingActive, dicom3D.showClipBox3D, volumeId, dicom3D.renderMode]);
     */

    // --- 3D Camera Focusing on Crop ---
    useEffect(() => {
        if (!dicom3D.focusCropTrigger || !renderingEngineCallbackRef.current) return;

        const engine = renderingEngineCallbackRef.current;
        const vp3D = engine.getViewport(viewportIds.THREED) as Types.IVolumeViewport;
        if (!vp3D) return;

        const actors = vp3D.getActors();
        const volumeActor = actors?.[0]?.actor as any;
        if (!volumeActor || !volumeActor.getMapper) return;

        const mapper = volumeActor.getMapper();
        const b = mapper.getBounds();
        if (!b) return;

        const { x0, x1, y0, y1, z0, z1 } = dicom3D.roiCrop;
        const cX = b[0] + (b[1] - b[0]) * (x0 + x1) / 2;
        const cY = b[2] + (b[3] - b[2]) * (y0 + y1) / 2;
        const cZ = b[4] + (b[5] - b[4]) * (z0 + z1) / 2;

        // Set focal point to center of crop
        vp3D.setCamera({
            focalPoint: [cX, cY, cZ],
        });

        // Reset camera clipping range and possibly center the view
        vp3D.resetCamera({ resetClippingRange: true });
        vp3D.render();

        console.log(`[3D Focus] Focused camera on Crop Center: [${cX.toFixed(1)}, ${cY.toFixed(1)}, ${cZ.toFixed(1)}]`);
    }, [dicom3D.focusCropTrigger]);

    // --- Viewport arrangement logic ---
    const getViewportClass = (label: string) => {
        if (maximizedViewportId) {
            return maximizedViewportId === viewportIds[label as keyof typeof viewportIds] ? 'col-span-full row-span-full' : 'hidden';
        }

        const mode = dicom3D.layoutMode;

        if (mode === 'focus-3d') {
            // 3rd Grid: 3 top views, 3D bottom full
            if (label === 'THREED') return 'col-start-1 row-start-2 col-span-3 row-span-1 min-h-[50vh]';
            if (label === 'AXIAL') return 'col-start-1 row-start-1 col-span-1 row-span-1';
            if (label === 'SAGITTAL') return 'col-start-2 row-start-1 col-span-1 row-span-1';
            if (label === 'CORONAL') return 'col-start-3 row-start-1 col-span-1 row-span-1';
            return 'col-span-1 row-span-1';
        }

        if (mode === 'axial-sagittal') {
            // 1st Grid: Axial/Coronal left, Sagittal full height
            if (label === 'THREED') return 'absolute opacity-0 pointer-events-none -z-50 w-[1px] h-[1px] overflow-hidden';
            if (label === 'AXIAL') return 'col-start-1 row-start-1 col-span-1 row-span-1';
            if (label === 'CORONAL') return 'col-start-1 row-start-2 col-span-1 row-span-1';
            if (label === 'SAGITTAL') return 'col-start-2 row-start-1 col-span-1 row-span-2';
            return 'col-span-1 row-span-1';
        }

        // 2nd Grid: Default 2x2
        if (label === 'AXIAL') return 'col-start-1 row-start-1 col-span-1 row-span-1';
        if (label === 'SAGITTAL') return 'col-start-2 row-start-1 col-span-1 row-span-1';
        if (label === 'CORONAL') return 'col-start-1 row-start-2 col-span-1 row-span-1';
        if (label === 'THREED') return 'col-start-2 row-start-2 col-span-1 row-span-1';

        return 'col-span-1 row-span-1';
    };

    const isViewportVisible = (id: string, _label: string) => {
        if (maximizedViewportId) return maximizedViewportId === id;

        if (dicom3D.layoutMode === 'axial-sagittal' && _label === 'THREED') return true;

        return true;
    };

    return (
        <div
            ref={elementRef}
            className={cn(
                "w-full h-full relative bg-[#09090b] grid gap-px",
                maximizedViewportId
                    ? "grid-cols-1 grid-rows-1"
                    : dicom3D.layoutMode === 'focus-3d'
                        ? "grid-cols-3 grid-rows-2"
                        : "grid-cols-2 grid-rows-2",
                isPlacementMode ? 'cursor-crosshair' : ''
            )}
        >
            {isLoading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300">
                    <div className="flex flex-col items-center gap-6 p-8 rounded-3xl bg-[#030303]/80 border border-white/10 shadow-2xl ring-1 ring-white/5">
                        <div className="relative h-16 w-16">
                            <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin" />
                            <div className="absolute inset-2 rounded-full border-r-2 border-primary/40 animate-spin-slow" />
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <span className="text-sm font-bold tracking-[0.2em] text-white uppercase animate-pulse">Initializing Viewer</span>
                            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest tabular-nums">
                                Processing DICOM Slices...
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {fileList.length === 0 && !isLoading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="text-center space-y-2 opacity-60">
                        <div className="text-sm font-bold tracking-widest text-white uppercase">No DICOM Data</div>
                        <p className="text-[10px] text-white/40 uppercase">Please import a DICOM folder to begin</p>
                    </div>
                </div>
            )}

            {Object.entries(viewportIds).map(([label, id]) => {
                const is3D = label === 'THREED';
                const isVisible = isViewportVisible(id, label);

                // --- 2D Landmark Overlay Logic ---
                const simulations = pedicleSimulations;
                const landmarksToRender: any[] = [];

                if (!is3D && isVisible) {
                    const engine = renderingEngineCallbackRef.current;
                    const viewport = engine?.getViewport(id) as Types.IVolumeViewport;
                    if (viewport) {
                        simulations.forEach(sim => {
                            const allLandmarks: any[] = [];
                            Object.entries(sim.landmarks).forEach(([key, value]) => {
                                if (key === 'fiducials' && Array.isArray(value)) {
                                    allLandmarks.push(...value);
                                } else if (value && !Array.isArray(value)) {
                                    allLandmarks.push(value);
                                }
                            });

                            allLandmarks.forEach((lm: any) => {
                                try {
                                    const canvasPos = viewport.worldToCanvas(lm.worldPos);
                                    if (canvasPos) {
                                        const { focalPoint, viewPlaneNormal } = viewport.getCamera();
                                        if (focalPoint && viewPlaneNormal) {
                                            const dist = (lm.worldPos[0] - focalPoint[0]) * viewPlaneNormal[0] +
                                                (lm.worldPos[1] - focalPoint[1]) * viewPlaneNormal[1] +
                                                (lm.worldPos[2] - focalPoint[2]) * viewPlaneNormal[2];

                                            if (Math.abs(dist) < 10.0) {
                                                landmarksToRender.push({
                                                    x: canvasPos[0],
                                                    y: canvasPos[1],
                                                    type: lm.type,
                                                    label: lm.label,
                                                    id: lm.id
                                                });
                                            }
                                        }
                                    }
                                } catch (_) { }
                            });
                        });
                    }
                }

                // --- 3D Coordinate Data (CD) Overlay ---
                const CDOverlay = () => {
                    const selectedScrew = threeDImplants.find(imp => imp.id === dicom3D.selectedImplantId && imp.type === 'screw');
                    if (!selectedScrew || !isVisible || !is3D) return null;

                    const engine = renderingEngineCallbackRef.current;
                    const viewport = engine?.getViewport(id) as Types.IVolumeViewport;
                    if (!viewport) return null;

                    const canvasPos = viewport.worldToCanvas(selectedScrew.position as Types.Point3);
                    if (!canvasPos) return null;

                    const coordStr = formatCoordinateData(selectedScrew.position as [number, number, number]);

                    return (
                        <div
                            style={{
                                position: 'absolute',
                                left: canvasPos[0] + 15,
                                top: canvasPos[1] - 45,
                                pointerEvents: 'none',
                                zIndex: 60,
                            }}
                            className="flex flex-col gap-1 p-2 rounded-lg bg-black/60 border border-white/20 backdrop-blur-md shadow-xl"
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                <span className="text-[10px] font-bold text-white/50 tracking-widest uppercase">CD</span>
                            </div>
                            <div className="text-[10px] font-mono text-primary font-bold">{coordStr}</div>
                            <div className="flex gap-2 mt-1 border-t border-white/10 pt-1">
                                <span className="text-[8px] text-white/40">L: {selectedScrew.properties.length}</span>
                                <span className="text-[8px] text-white/40">D: {selectedScrew.properties.diameter}</span>
                            </div>
                        </div>
                    );
                };

                return (
                    <div
                        key={id}
                        onDoubleClick={() => toggleMaximize(id)}
                        className={cn(
                            "relative w-full h-full bg-[#030303] flex flex-col overflow-hidden select-none transition-all duration-300",
                            getViewportClass(label),
                            !isVisible ? 'hidden' : ''
                        )}
                    >
                        {is3D && isVisible && <CDOverlay />}

                        {!is3D && (
                            <>
                                <div className="absolute top-0 left-0 right-0 z-10 px-3 py-1 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center gap-4 group">
                                    <span className="text-[10px] font-medium tracking-[0.2em] text-white/40 uppercase pointer-events-none">
                                        {label}
                                    </span>
                                    <div className="flex-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <input
                                            type="range"
                                            min="0"
                                            max={(sliceData[id]?.count || 1) - 1}
                                            value={sliceData[id]?.index || 0}
                                            onChange={(e) => updateSlice(id, parseInt(e.target.value))}
                                            className="w-full h-[6px] bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500/80 hover:bg-white/20 transition-all"
                                        />
                                    </div>
                                    <span className="text-[10px] font-mono text-white/30 tabular-nums">
                                        {(sliceData[id]?.index || 0) + 1} / {sliceData[id]?.count || 0}
                                    </span>
                                </div>

                                <svg className="absolute inset-0 z-20 pointer-events-none w-full h-full">
                                    {landmarksToRender.map(lm => (
                                        <g key={lm.id}>
                                            <circle
                                                cx={lm.x}
                                                cy={lm.y}
                                                r={lm.type === 'FIDUCIAL' ? 3 : 4}
                                                fill={lm.type === 'FIDUCIAL' ? '#fbbf24' : (lm.type === 'VAP' ? '#ef4444' : '#22c55e')}
                                                className={lm.type === 'FIDUCIAL' ? "" : "animate-pulse"}
                                            />
                                            <text
                                                x={lm.x + 8}
                                                y={lm.y + 12}
                                                className="text-[8px] font-mono font-bold fill-white/80 drop-shadow-md"
                                            >
                                                {lm.type}
                                            </text>
                                        </g>
                                    ))}
                                </svg>

                                {/* <CropOverlay2D viewportId={id} engineRef={renderingEngineCallbackRef} /> */}
                                <ScrewOverlay2D viewportId={id} engineRef={renderingEngineCallbackRef} />
                            </>
                        )}

                        {is3D && (
                            <div className="absolute top-2 left-3 z-10 pointer-events-none">
                                <span className="text-[10px] font-medium tracking-[0.2em] text-white/40 uppercase">
                                    3D RECONSTRUCTION
                                </span>
                            </div>
                        )}

                        <div id={`viewport-${label.toLowerCase()}`} className="flex-1 w-full h-full" />
                    </div>
                );
            })}
        </div >
    );
};
