import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useAppStore } from "@/lib/store/index";
import { CanvasManager, Point, Measurement } from "@/lib/canvas/CanvasManager";
import { measurementsDiffer, syncManagerMeasurements } from "@/lib/canvas/measurementSync";
import {
    getPolygonCenter,
    isPointInPolygon,
    getDistance,
    getMidpoint,
    getHipAxisCenter,
    getPolygonArea,
    getPolygonPerimeter
} from "@/lib/canvas/GeometryUtils";
import { MeasurementSystem } from "@/features/measurements/MeasurementSystem";
import { calculateCobbAngle } from "@/features/measurements/quick/CobbAngle";
import { calculateVBM } from "@/features/measurements/quick/VBM";
import { calculateSpinalCurvature } from "@/features/measurements/quick/SpinalCurvatures";
import { calculatePelvicParameters } from "@/features/measurements/quick/PelvicParams";
import { calculatePILL } from "@/features/measurements/quick/PI_LL";
import { calculateSpondylolisthesis, formatSpondylolisthesisResult } from "@/features/measurements/pathology/Spondylolisthesis";
import { calculateStenosisArea } from "@/features/measurements/pathology/Stenosis";
import {
    calculatePO, calculateTS, calculateAVT, calculateSlope, calculateCMC,
    calculateTPA, calculateSPA, calculateSSA, calculateSPi, calculateCBVA, calculateRVAD, calculateITilt
} from "@/features/measurements/deformity/DeformityTools";
import {
    MousePointer2, AlertCircle, Ruler, Plus, X
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { ImportDialog } from "../import-export/ImportDialog";
import {
    drawWedgeOsteotomy,
    calculateOpenOsteotomyPrimitives,
    calculateResectionPrimitives,
    drawDeformedSuperiorSegment,
    drawResection
} from "@/features/measurements/planning/PlanningTools";
import {
    drawScrew,
    drawRod,
    drawCage,
    drawPlate,
    drawImplantHandles,
    getImplantHandles
} from "@/features/measurements/planning/ImplantRenderer";

import { performResectionOnFragment, performOpenOsteotomyOnFragment } from "@/lib/canvas/SurgicalOperations";

interface ViewTransform {
    k: number;
    x: number;
    y: number;
}

interface CanvasWorkspaceProps {
    side?: 'left' | 'right';
}

const CanvasWorkspace = ({ side }: CanvasWorkspaceProps) => {
    const store = useAppStore();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const {
        activeTool,
        setActiveTool,
        undoTrigger,
        redoTrigger,
        isComparisonMode,
        setActiveDialog,
        activeCanvasSide,
        setActiveCanvasSide,
        setComparisonMeasurements,
        setComparisonImplants,
        setMeasurements: storeSetMeasurements,
        setImplants: storeSetImplants,
        isWizardVisible,
        setWizardVisible,
        isWizardIconVisible,
        managers,
        registerManager,
        vbmMode,
        setVbmMode,
    } = store;

    const activeContext = useMemo(() =>
        store.contexts.find(c => c.id === store.activeContextId),
        [store.contexts, store.activeContextId]
    );

    const activeContextState = useMemo(() =>
        store.contextStates.find(s => s.contextId === store.activeContextId),
        [store.contextStates, store.activeContextId]
    );

    const storeCanvas = useMemo(() => {
        if (isComparisonMode && side && store.comparison && store.comparison[side]) {
            return store.comparison[side].canvas;
        }
        return store.canvas;
    }, [isComparisonMode, side, store.comparison, store.canvas]);

    const currentImage = useMemo(() => {
        if (isComparisonMode && side && store.comparison && store.comparison[side]) {
            return store.comparison[side].image;
        }

        // Priority 1: Comparison Mode (Calculated above)

        // Priority 2: Explicitly set currentImage (from URL, LiveShare, or Selection)
        if (store.currentImage) return store.currentImage;

        // Priority 3: Active Context State (Saved state)
        if (activeContextState && activeContextState.currentImage) {
            return activeContextState.currentImage;
        }

        // Priority 4: Default to first scan of active context's study
        if (activeContext) {
            const patient = store.patients.find(p => p.id === activeContext.patientId);
            const studyId = side === 'right' ? activeContext.studyIds[1] : activeContext.studyIds[0];
            const study = patient?.studies?.find(s => s.id === studyId);
            const studyImage = study?.scans[0]?.imageUrl;
            if (studyImage) return studyImage;
        }

        return null;
    }, [isComparisonMode, side, store.comparison, store.currentImage, activeContextState, activeContext, store.patients]);

    useEffect(() => {
        if (!isComparisonMode && currentImage !== store.currentImage) {
            store.setCurrentImage(currentImage);
        }
    }, [currentImage, isComparisonMode, store.currentImage, store]);

    const storeMeasurements = useMemo(() => {
        if (isComparisonMode && side && store.comparison && store.comparison[side]) {
            return store.comparison[side].measurements;
        }
        if (activeContextState) {
            return activeContextState.measurements;
        }
        return store.measurements;
    }, [isComparisonMode, side, store.comparison, store.measurements, activeContextState]);

    const storeImplants = useMemo(() => {
        if (isComparisonMode && side && store.comparison && store.comparison[side]) {
            return store.comparison[side].implants || [];
        }
        if (activeContextState) {
            return activeContextState.implants || [];
        }
        return store.implants || [];
    }, [isComparisonMode, side, store.comparison, store.implants, activeContextState]);

    const syncStoreWithCanvas = useCallback((measurements: Measurement[], implants: any[]) => {
        // In inspection mode, the admin is viewing a member's study — never write back
        if (store.inspectionMode?.active) return;

        console.log("LOG 1: CanvasManager measurements passed to syncStoreWithCanvas:", JSON.stringify(measurements, null, 2));

        if (isComparisonMode && side) {
            setComparisonMeasurements(side, measurements);
            setComparisonImplants(side, implants);
        } else if (store.activeContextId) {
            // Include currentImage so the active scan URL is persisted alongside measurements
            store.updateContextState(store.activeContextId, {
                measurements,
                implants,
                currentImage: store.currentImage ?? undefined,
            }).then(() => {
                const latestContextState = store.contextStates.find(s => s.contextId === store.activeContextId);
                console.log("LOG 2 (Context Active): Store measurements immediately after insertion:", {
                    activeContextId: store.activeContextId,
                    contextStateMeasurements: latestContextState?.measurements,
                    storeMeasurementsFallback: store.measurements
                });
            });
        } else {
            storeSetMeasurements(measurements);
            storeSetImplants(implants);
            setTimeout(() => {
                console.log("LOG 2 (No Context): Store measurements immediately after insertion:", {
                    storeMeasurements: store.measurements
                });
            }, 0);
        }
    }, [isComparisonMode, side, storeSetMeasurements, storeSetImplants, store.activeContextId, store.updateContextState, setComparisonMeasurements, setComparisonImplants, store.inspectionMode, store.currentImage, store.contextStates, store.measurements]);

    const setMeasurements = (measurements: Measurement[]) => {
        const currentImplants = managerRef.current?.current?.data.implants || storeImplants;
        const previousCount = storeMeasurements.length;
        syncStoreWithCanvas(measurements, currentImplants);
        if (activeTool && measurements.length > previousCount) {
            setActiveTool(null);
        }
    };

    const isInteractive = !isComparisonMode || (activeCanvasSide === side);

    const handleCanvasClick = useCallback(() => {
        if (isComparisonMode && side) {
            setActiveCanvasSide(side);
        }
    }, [isComparisonMode, side, setActiveCanvasSide]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const managerRef = useRef<CanvasManager | null>(null);
    const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
    // Cache for sharpened offscreen canvases: key = `${url}__${sharpness}`
    const sharpnessCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

    const [managerReady, setManagerReady] = useState(false);

    // Undo/Redo Response from Store
    const lastUndoRef = useRef(undoTrigger);
    const lastRedoRef = useRef(redoTrigger);

    useEffect(() => {
        if (!isInteractive) {
            lastUndoRef.current = undoTrigger;
            return;
        }
        if (managerRef.current && managerReady && undoTrigger > lastUndoRef.current) {
            const newState = managerRef.current.undo();
            if (newState) syncStoreWithCanvas(newState.data.measurements, newState.data.implants);
        }
        lastUndoRef.current = undoTrigger;
    }, [undoTrigger, syncStoreWithCanvas, managerReady, isInteractive]);

    useEffect(() => {
        if (!isInteractive) {
            lastRedoRef.current = redoTrigger;
            return;
        }
        if (managerRef.current && managerReady && redoTrigger > lastRedoRef.current) {
            const newState = managerRef.current.redo();
            if (newState) syncStoreWithCanvas(newState.data.measurements, newState.data.implants);
        }
        lastRedoRef.current = redoTrigger;
    }, [redoTrigger, syncStoreWithCanvas, managerReady, isInteractive]);

    // View State
    const viewTransformRef = useRef<ViewTransform>({ k: 1, x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const lastPanPos = useRef<{ x: number, y: number } | null>(null);

    // Tool/Interaction State
    const [tempPoints, setTempPoints] = useState<Point[]>([]);
    const { selection, setSelection } = useAppStore();
    const [isDragging, setIsDragging] = useState(false);
    const [cropRect, setCropRect] = useState<{ start: Point; current: Point } | null>(null);
    const [isCalibrationDialogOpen, setIsCalibrationDialogOpen] = useState(false);
    const [calibrationPoints, setCalibrationPoints] = useState<[Point, Point] | null>(null);
    const [calibrationMm, setCalibrationMm] = useState("");
    const mouseWorldPosRef = useRef<Point>({ x: 0, y: 0 });
    const lastWorldPosRef = useRef<Point>({ x: 0, y: 0 });
    const [isTiltDialogOpen, setIsTiltDialogOpen] = useState(false);
    const [tiltMode, setTiltMode] = useState<'UIV' | 'LIV' | null>(null);
    const [isTextDialogOpen, setIsTextDialogOpen] = useState(false);
    const [textInput, setTextInput] = useState("");
    const [textToolPos, setTextToolPos] = useState<Point | null>(null);
    const [pendingTiltMode, setPendingTiltMode] = useState<'UIV' | 'LIV' | null>(null);

    // Prompt for Tilt Mode immediately upon selection
    useEffect(() => {
        if (activeTool === 'itilt' && !tiltMode && !isTiltDialogOpen) {
            setActiveDialog('tilt');
            setIsTiltDialogOpen(true);
        } else if (activeTool !== 'itilt' && (tiltMode || isTiltDialogOpen)) {
            setTiltMode(null);
            setIsTiltDialogOpen(false);
        }
    }, [activeTool, tiltMode, isTiltDialogOpen]);

    // Discard uncompleted calibration attempts if leaving calibration mode
    useEffect(() => {
        if (activeTool !== 'calibration') {
            setTempPoints([]);
            setCalibrationPoints(null);
            setIsCalibrationDialogOpen(false);
        }
    }, [activeTool]);

    const getWorldPos = useCallback((mouseX: number, mouseY: number) => {
        if (!containerRef.current) return { x: 0, y: 0 };

        const { k, x, y } = viewTransformRef.current;
        const ek = k * (storeCanvas.zoom || 1);
        const rad = (storeCanvas.rotation * Math.PI) / 180;

        const cx = containerRef.current.clientWidth / 2;
        const cy = containerRef.current.clientHeight / 2;

        // 1. Relativize to View Center & Un-flip if needed
        let tx = mouseX - cx;
        let ty = mouseY - cy;
        if (storeCanvas.flipX) tx = -tx;

        // 2. Un-rotate around center
        const cos = Math.cos(-rad);
        const sin = Math.sin(-rad);
        const rx = tx * cos - ty * sin + cx;
        const ry = tx * sin + ty * cos + cy;

        // 3. Un-translate and Un-scale
        return {
            x: (rx - x) / ek,
            y: (ry - y) / ek
        };
    }, [storeCanvas.zoom, storeCanvas.rotation, storeCanvas.flipX]);

    // Resize Handling
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry && canvasRef.current) {
                const { width, height } = entry.contentRect;
                canvasRef.current.width = width;
                canvasRef.current.height = height;
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const getCachedImage = useCallback((url: string | HTMLImageElement) => {
        if (typeof url !== 'string') return url;
        if (imageCacheRef.current.has(url)) return imageCacheRef.current.get(url)!;
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Added for CORS support
        img.src = url;
        img.onerror = (e) => console.error(`[CanvasWorkspace] Image failed to load: ${url}`, e);
        img.onload = () => console.log(`[CanvasWorkspace] Image loaded successfully: ${url}`);
        imageCacheRef.current.set(url, img);
        return img;
    }, []);

    // Invalidate sharpness cache whenever the sharpness value changes
    useEffect(() => {
        sharpnessCacheRef.current.clear();
    }, [storeCanvas.sharpness]);

    /**
     * Returns a sharpened HTMLCanvasElement using unsharp mask, or the original image
     * if sharpness === 0. Results are cached per (url, sharpness) for performance.
     *
     * Unsharp mask: output = clamp(original + amount × (original − blur(original)))
     * - Gaussian blur radius scales with sharpness for natural progression
     * - Negative sharpness softens the image (just the blur, no subtraction)
     */
    const getSharpImage = useCallback((
        img: HTMLImageElement,
        sharpness: number
    ): HTMLImageElement | HTMLCanvasElement => {
        if (sharpness === 0 || !img.complete || img.naturalWidth === 0) return img;

        const url = img.src;
        const cacheKey = `${url}__${sharpness}`;
        if (sharpnessCacheRef.current.has(cacheKey)) {
            return sharpnessCacheRef.current.get(cacheKey)!;
        }

        const w = img.naturalWidth;
        const h = img.naturalHeight;

        // Source canvas — draw original image
        const src = document.createElement('canvas');
        src.width = w;
        src.height = h;
        const srcCtx = src.getContext('2d', { willReadFrequently: true })!;
        srcCtx.drawImage(img, 0, 0);
        const srcData = srcCtx.getImageData(0, 0, w, h);
        const orig = srcData.data; // Uint8ClampedArray

        // Blurred canvas using CSS filter (fast native Gaussian blur)
        const blurCanvas = document.createElement('canvas');
        blurCanvas.width = w;
        blurCanvas.height = h;
        const blurCtx = blurCanvas.getContext('2d', { willReadFrequently: true })!;
        // Blur radius: for sharpening (positive), 1–2px is enough; negative uses a softer radius
        const absS = Math.abs(sharpness);
        const blurRadius = sharpness > 0
            ? 0.5 + (absS / 100) * 1.5   // 0.5–2px for sharpen
            : 0.5 + (absS / 100) * 3.0;  // 0.5–3.5px for soften
        blurCtx.filter = `blur(${blurRadius.toFixed(2)}px)`;
        blurCtx.drawImage(img, 0, 0);
        blurCtx.filter = 'none';
        const blurData = blurCtx.getImageData(0, 0, w, h);
        const blurred = blurData.data;

        // Output canvas
        const out = document.createElement('canvas');
        out.width = w;
        out.height = h;
        const outCtx = out.getContext('2d')!;
        const outData = outCtx.createImageData(w, h);
        const result = outData.data;

        // Unsharp mask amount: positive = sharpen, negative = soften (just blend with blur)
        // amount range: 0.0 → 0 (at s=0, unused) up to ~1.5 (at s=100)
        const amount = sharpness > 0
            ? (absS / 100) * 1.5
            : -(absS / 100) * 1.0; // negative blends toward blur

        for (let i = 0; i < orig.length; i += 4) {
            // Apply to R, G, B channels only (preserve alpha)
            for (let c = 0; c < 3; c++) {
                const o = orig[i + c];
                const b = blurred[i + c];
                // Unsharp mask: o + amount × (o − b)
                // For negative amount this adds (o − b) negatively → pulls toward blur
                result[i + c] = Math.min(255, Math.max(0, o + amount * (o - b)));
            }
            result[i + 3] = orig[i + 3]; // Alpha unchanged
        }

        outCtx.putImageData(outData, 0, 0);
        sharpnessCacheRef.current.set(cacheKey, out);
        return out;
    }, []);

    // View Sync: Handle deletions from external sources (like RightSidebar)
    useEffect(() => {
        if (managerRef.current && managerReady) {
            const currentManagerMeasurements = managerRef.current.current?.data.measurements || [];
            if (currentManagerMeasurements.length > storeMeasurements.length) {
                const storeIds = new Set(storeMeasurements.map(m => m.id));
                const toDelete = currentManagerMeasurements.find(m => !storeIds.has(m.id));
                if (toDelete) {
                    const PLANNING_TOOLS = ['ost-resect', 'ost-open'];
                    if (PLANNING_TOOLS.includes(toDelete.toolKey)) {
                        // Surgical operations split/move fragments in addition to adding a
                        // measurement. Reverting fully undoes those fragment changes.
                        const prior = managerRef.current.revertToStateBeforeMeasurement(toDelete.id);
                        if (prior) {
                            syncStoreWithCanvas(prior.data.measurements, prior.data.implants);
                        } else {
                            // Fallback: just remove the annotation
                            managerRef.current.applyOperation('DELETE_MEASUREMENT', { id: toDelete.id });
                        }
                    } else {
                        managerRef.current.applyOperation('DELETE_MEASUREMENT', { id: toDelete.id });
                    }
                }
            }

            const currentManagerImplants = managerRef.current.current?.data.implants || [];
            if (currentManagerImplants.length > storeImplants.length) {
                const storeImplantIds = new Set(storeImplants.map(i => i.id));
                const toDelete = currentManagerImplants.find(i => !storeImplantIds.has(i.id));
                if (toDelete) {
                    managerRef.current.applyOperation('DELETE_IMPLANT', { id: toDelete.id });
                }
            }
        }
    }, [storeMeasurements, storeImplants, managerReady, syncStoreWithCanvas]);

    useEffect(() => {
        const init = async () => {
            if (currentImage) {
                const mgrKey = side || 'main';
                let mgr = managers[mgrKey];

                // Only reuse a manager that this CanvasWorkspace instance already owns.
                // managerRef.current is null on every fresh mount (React ref is recreated),
                // so the guard cannot fire after navigation — fresh initialization always runs.
                // Within the same mount, managerRef.current === mgr, so intra-session reuse
                // still works (e.g., when measurements update without changing the image).
                if (mgr && (mgr as any)._baseImage === currentImage && managerRef.current === mgr) {
                    console.log('[CanvasWorkspace] Reusing existing manager for image', currentImage);
                    const managerMeasurements = mgr.current?.data.measurements || [];
                    // Hydrate canvas FROM store/context — never overwrite persisted data with stale manager state
                    if (measurementsDiffer(managerMeasurements, storeMeasurements)) {
                        console.log('[CanvasWorkspace] Syncing manager from store/context measurements:', storeMeasurements.length);
                        syncManagerMeasurements(mgr, storeMeasurements);
                    }
                    setManagerReady(true);
                    return;
                }

                console.log('[CanvasWorkspace] Creating new CanvasManager for image', currentImage);
                console.log('[CanvasWorkspace] Initial measurements passed to init:', storeMeasurements.length);
                mgr = new CanvasManager();
                const initialState = await mgr.initialize(currentImage, storeMeasurements);

                // Add initial implants to the first state if any exist in store
                if (storeImplants.length > 0) {
                    initialState.data.implants = storeImplants.map(i => ({ ...i }));
                }

                console.log('[CanvasWorkspace] initialized state measurements count:', initialState.data.measurements.length);
                (mgr as any)._baseImage = currentImage;
                managerRef.current = mgr;
                registerManager(mgrKey, mgr);
                (window as any).canvasManager = mgr;

                if (containerRef.current) {
                    const { clientWidth, clientHeight } = containerRef.current;
                    const frag0 = initialState.data.fragments[0];
                    if (frag0) {
                        const scale = Math.min(clientWidth / frag0.imageWidth, clientHeight / frag0.imageHeight) * 0.9;
                        const x = (clientWidth - frag0.imageWidth * scale) / 2;
                        const y = (clientHeight - frag0.imageHeight * scale) / 2;
                        viewTransformRef.current = { k: scale, x, y };
                    }
                }
                setManagerReady(true);
            } else {
                setManagerReady(false);
            }
        };
        init();
    }, [currentImage, side, registerManager]);

    // Re-hydrate canvas overlays when context measurements arrive after async load
    useEffect(() => {
        if (!managerRef.current || !managerReady || !currentImage) {
            return;
        }

        const managerMeasurements = managerRef.current.current?.data.measurements ?? [];
        if (measurementsDiffer(managerMeasurements, storeMeasurements)) {
            console.log('[CanvasWorkspace] Hydrating manager after context/store update:', storeMeasurements.length);
            syncManagerMeasurements(managerRef.current, storeMeasurements);
        }
    }, [storeMeasurements, managerReady, currentImage]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const state = managerRef.current?.current;
        if (!canvas || !state || !containerRef.current) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { k, x, y } = viewTransformRef.current;
        const ek = k * (storeCanvas.zoom || 1);
        const rad = (storeCanvas.rotation * Math.PI) / 180;
        const cx = containerRef.current.clientWidth / 2;
        const cy = containerRef.current.clientHeight / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();

        // VIEW INTEGRATION: Centers global rotation/flip around viewport center
        ctx.translate(cx, cy);
        ctx.rotate(rad);
        if (storeCanvas.flipX) ctx.scale(-1, 1);
        ctx.translate(-cx, -cy);

        // PAN & ZOOM
        ctx.translate(x, y);
        ctx.scale(ek, ek);

        // High Quality Rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Apply Global Filters (brightness + contrast only — sharpness is handled via pixel-level unsharp mask)
        const b = storeCanvas.brightness;
        const c = storeCanvas.contrast;
        const s = storeCanvas.sharpness;
        ctx.filter = `brightness(${b}%) contrast(${c}%)`;

        // PRE-PASS: Populate osteotomy calculation data (rays, angles, translation) before fragment clipping/rendering
        const dummyCtx = document.createElement('canvas').getContext('2d')!;
        state.data.measurements.forEach((m: Measurement) => {
            if (['ost-pso', 'ost-spo', 'ost-resect', 'ost-open'].includes(m.toolKey)) {
                if (m.toolKey === 'ost-resect') {
                    drawResection(dummyCtx, m, ek); // Calculates rays & transform
                } else {
                    drawWedgeOsteotomy(dummyCtx, m, ek);
                }
            }
        });


        state.data.fragments.forEach((frag: any) => {
            if (frag.isSourceOf) return; // Hidden source kept for updates
            const img = getCachedImage(frag.image);

            // 1. Check for active planning/resection lines affecting this fragment
            const activePlanning = state.data.measurements.find((m: Measurement) =>
                m.fragmentId === frag.id && ['ost-pso', 'ost-spo', 'ost-resect', 'ost-open'].includes(m.toolKey)
            );

            // 2. CLIP PASS: Clip to the fragment's current world-space polygon.
            // The polygon vertices already encode the final world position after all
            // CUT / ROTATE / MOVE operations — no additional transform is needed here.
            ctx.save();
            ctx.beginPath();
            frag.polygon.forEach((p: Point, i: number) => {
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.closePath();
            ctx.clip();

            if (img.complete) {
                const drawSrc = getSharpImage(img, s);

                // 3. IMAGE CONTENT PASS
                // For fragments that have been rotated via CanvasManager (imageOriginX/Y
                // tracks where the image centre ends up in world space after each ROTATE),
                // we must rotate the image content around that world-space pivot so that
                // the drawn pixels align with the clipped polygon.
                //
                // For the initial / non-rotated fragment (rotation === 0) or for PSO/SPO
                // which use a different deformation path, a plain drawImage is sufficient.
                const totalRotationRad = (frag.rotation || 0) * (Math.PI / 180);

                // Use the tracked image origin as pivot (falls back to image centre for
                // legacy fragments that predate the imageOriginX/Y fields).
                const pivotX = frag.imageOriginX ?? (frag.imageX + frag.imageWidth / 2);
                const pivotY = frag.imageOriginY ?? (frag.imageY + frag.imageHeight / 2);

                if (totalRotationRad !== 0) {
                    ctx.translate(pivotX, pivotY);
                    ctx.rotate(totalRotationRad);
                    ctx.translate(-pivotX, -pivotY);
                }

                ctx.drawImage(drawSrc, frag.imageX, frag.imageY, frag.imageWidth, frag.imageHeight);
            }
            ctx.restore();

            // Suppress any residual rotation-based deformation for planning tools
            // (the geometry is baked into polygon + imageOriginX/Y above).
            void activePlanning; // acknowledged, no further action needed

            return; // Done with this fragment
        });

        ctx.filter = 'none';

        // MEASUREMENTS: Stay pinned precisely to the pixels
        const bounds = state.data.fragments.reduce((acc, frag) => {
            const fMinY = Math.min(...frag.polygon.map(p => p.y));
            const fMaxY = Math.max(...frag.polygon.map(p => p.y));
            return {
                minY: Math.min(acc.minY, fMinY),
                maxY: Math.max(acc.maxY, fMaxY)
            };
        }, { minY: Infinity, maxY: -Infinity });

        state.data.measurements.forEach((m: Measurement) => {
            if (m.measurement?.isCalibration) {
                return;
            }

            // SPECIAL: Osteotomy/Resection Deformation Rendering
            if (['ost-pso', 'ost-spo', 'ost-resect', 'ost-open'].includes(m.toolKey)) {
                console.log('[CanvasWorkspace RENDER] Found measurement:', m.toolKey, 'fragmentId:', m.fragmentId, 'points:', m.points.length);

                const targetFrag = state.data.fragments.find(f => f.id === m.fragmentId) || state.data.fragments[0];
                if (targetFrag) {
                    const img = getCachedImage(targetFrag.image);
                    if (img.complete) {
                        if (m.toolKey === 'ost-resect') {
                            drawResection(ctx, m, ek); // Draw annotation (lines/shading)
                        } else if (m.toolKey === 'ost-open') {
                            // OPEN OSTEOTOMY: Skip deformed segment rendering
                            // The new implementation handles fragment transformations directly
                            // through CanvasManager operations (CUT, ROTATE, MOVE)
                            // No additional rendering needed here
                            console.log('[CanvasWorkspace RENDER] Skipping deformed segment rendering for ost-open');
                        } else {
                            // PSO/SPO: Rays already populated in pre-pass
                            console.log('[CanvasWorkspace RENDER] Drawing deformed segment for:', m.toolKey);
                            drawDeformedSuperiorSegment(ctx, img, m, targetFrag);
                        }
                    }
                }
            }

            const displayRatio = storeCanvas.calibrationApplied ? storeCanvas.pixelToMm : null;
            MeasurementSystem.draw(
                ctx,
                m,
                ek,
                displayRatio,
                bounds.minY === Infinity ? undefined : bounds,
                storeCanvas.calibrationEnabledAt,
            );
        });

        // IMPLANTS Rendering
        if (state.data.implants) {
            state.data.implants.forEach((i: any) => {
                if (i.type === 'screw') {
                    drawScrew(ctx, i.position, i.angle, i.properties, ek, i.properties.color || '#94a3b8');
                } else if (i.type === 'cage') {
                    drawCage(ctx, i.position, i.angle, i.properties, ek, i.properties.color || '#10b981');
                } else if (i.type === 'rod') {
                    drawRod(ctx, i.properties.points, ek, i.properties.diameter || 6, i.properties.color || '#94a3b8');
                } else if (i.type === 'plate') {
                    drawPlate(ctx, i.position, i.angle, i.properties, ek, i.properties.color || '#64748b');
                }

                // Selected implant handles
                if (selection?.type === 'implant' && i.id === selection.measurementId) {
                    drawImplantHandles(ctx, i, ek);
                }
            });
        }


        const isAnyDialogOpen = isCalibrationDialogOpen || isTiltDialogOpen || isTextDialogOpen;

        // UNIFIED PREVIEW DRAWING
        if (tempPoints.length > 0 && !isAnyDialogOpen) {
            ctx.save();
            if (activeTool === 'cobb') ctx.strokeStyle = '#3b82f6';
            else if (activeTool === 'cmc') ctx.strokeStyle = '#dc2626';
            else if (activeTool === 'csvl') ctx.strokeStyle = '#eab308';
            else if (['pelvis', 'pi_ll', 'po'].includes(activeTool || '')) ctx.strokeStyle = '#10b981';
            else if (activeTool === 'itilt') ctx.strokeStyle = '#8b5cf6';
            else if (activeTool === 'cbva') ctx.strokeStyle = '#f97316';
            else if (activeTool === 'slope') ctx.strokeStyle = '#ec4899';
            else ctx.strokeStyle = '#3b82f6';

            ctx.lineWidth = 2.5 / ek;
            ctx.fillStyle = ctx.strokeStyle;
            const wPos = mouseWorldPosRef.current;
            const pts = [...tempPoints, wPos];

            // 1. Osteotomy/Resection Previews
            const tempM: Measurement = {
                id: 'temp-m', toolKey: activeTool!, points: pts, result: 'Preview', measurement: {},
                timestamp: Date.now(), fragmentId: null
            };

            if (['ost-pso', 'ost-spo'].includes(activeTool || '') && tempPoints.length >= 2) {
                (tempM.measurement as any).type = activeTool === 'ost-spo' ? 'SPO' : 'PSO';
                drawWedgeOsteotomy(ctx, tempM, ek);
                const targetFrag = state.data.fragments.find(f => isPointInPolygon(tempPoints[1], f.polygon)) || state.data.fragments[0];
                if (targetFrag) {
                    const img = getCachedImage(targetFrag.image);
                    drawDeformedSuperiorSegment(ctx, img, tempM, targetFrag, 0.5);
                }
            } else if (activeTool === 'ost-open' && tempPoints.length >= 2) {
                // OPEN OSTEOTOMY: Only draw the line visualization, no deformed segment preview
                // The new implementation will handle the actual cutting and transformation
                // when all 6 points are placed
                drawWedgeOsteotomy(ctx, tempM, ek);
            } else if (activeTool === 'ost-resect' && pts.length === 4) {
                drawResection(ctx, tempM, ek);
            }

            // 2. Draw Points
            pts.forEach(p => {
                if (activeTool === 'pencil') return;

                ctx.beginPath();
                ctx.arc(p.x, p.y, 4 / ek, 0, Math.PI * 2);
                ctx.fill();

                // Exclude angle tools and other complex tools from white border during placement
                if (!['cobb', 'angle-4pt', 'angle-2pt', 'angle-3pt', 'circle', 'ellipse', 'polygon', 'sva', 'vbm', 'pelvis', 'pi_ll', 'cmc', 'csvl', 'ts', 'avt', 'rvad', 'po', 'itilt', 'cbva', 'slope', 'tpa', 'spa', 'ssa', 't1spi', 't9spi', 'odha', 'stenosis', 'spondy', 'pencil', 'text'].includes(activeTool || '')) {
                    ctx.lineWidth = 1.2 / ek;
                    ctx.strokeStyle = '#fff';
                    ctx.stroke();
                }

                // Reset stroke for lines
                if (activeTool === 'cmc') {
                    ctx.strokeStyle = '#dc2626';
                } else if (activeTool === 'csvl') {
                    ctx.strokeStyle = '#eab308';
                } else if (activeTool === 'po') {
                    ctx.strokeStyle = '#10b981';
                } else if (activeTool === 'itilt') {
                    ctx.strokeStyle = '#8b5cf6';
                } else if (activeTool === 'rvad') {
                    ctx.strokeStyle = '#3b82f6';
                } else if (activeTool === 'cbva') {
                    ctx.strokeStyle = '#f97316';
                } else if (activeTool === 'slope') {
                    ctx.strokeStyle = '#ec4899';
                } else if (['pelvis', 'pi_ll'].includes(activeTool || '')) {
                    ctx.strokeStyle = '#10b981';
                } else {
                    ctx.strokeStyle = (['cobb', 'angle-4pt'].includes(activeTool || '') ? '#3b82f6' : '#3b82f6');
                }
                ctx.lineWidth = 2.5 / ek;
            });

            // 3. Draw Lines based on Tool Type
            ctx.beginPath();
            if (activeTool === 'vbm') {
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                if (pts.length === 4) ctx.closePath();
            } else if (activeTool === 'pelvis' || activeTool === 'pi_ll') {
                if (pts.length >= 2) {
                    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
                    const rad = Math.sqrt(Math.pow(pts[0].x - pts[1].x, 2) + Math.pow(pts[0].y - pts[1].y, 2)) / 2;
                    ctx.moveTo(mid.x + rad, mid.y); ctx.arc(mid.x, mid.y, rad, 0, Math.PI * 2);
                } else if (pts.length === 1) {
                    ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(wPos.x, wPos.y);
                }
                if (pts.length >= 4) {
                    const mid = { x: (pts[2].x + pts[3].x) / 2, y: (pts[2].y + pts[3].y) / 2 };
                    const rad = Math.sqrt(Math.pow(pts[2].x - pts[3].x, 2) + Math.pow(pts[2].y - pts[3].y, 2)) / 2;
                    ctx.moveTo(mid.x + rad, mid.y); ctx.arc(mid.x, mid.y, rad, 0, Math.PI * 2);
                } else if (pts.length === 3) {
                    ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(wPos.x, wPos.y);
                }
                if (pts.length >= 6) {
                    ctx.moveTo(pts[4].x, pts[4].y); ctx.lineTo(pts[5].x, pts[5].y);
                } else if (pts.length === 5) {
                    ctx.moveTo(pts[4].x, pts[4].y); ctx.lineTo(wPos.x, wPos.y);
                }
                if (activeTool === 'pi_ll') {
                    if (pts.length >= 8) {
                        ctx.moveTo(pts[6].x, pts[6].y); ctx.lineTo(pts[7].x, pts[7].y);
                    } else if (pts.length === 7) {
                        ctx.moveTo(pts[6].x, pts[6].y); ctx.lineTo(wPos.x, wPos.y);
                    }
                }
            } else if (['cobb', 'cl', 'tk', 'll', 'sc', 'spondy', 'angle-4pt', 'ost-resect'].includes(activeTool || '')) {
                if (pts.length >= 1) {
                    ctx.moveTo(pts[0].x, pts[0].y);
                    ctx.lineTo(pts.length > 1 ? pts[1].x : wPos.x, pts.length > 1 ? pts[1].y : wPos.y);
                }
                if (pts.length >= 3) {
                    ctx.moveTo(pts[2].x, pts[2].y);
                    ctx.lineTo(pts.length > 3 ? pts[3].x : wPos.x, pts.length > 3 ? pts[3].y : wPos.y);

                    if (['cobb', 'cl', 'tk', 'll', 'sc'].includes(activeTool || '')) {
                        const previewPts = [...pts.slice(0, pts.length === 3 ? 3 : 4)];
                        if (previewPts.length === 3) previewPts.push(wPos);

                        let angle = 0;
                        let prefix = '';
                        if (activeTool === 'cobb' || activeTool === 'angle-4pt') {
                            angle = calculateCobbAngle(previewPts).angle;
                            prefix = activeTool === 'cobb' ? 'Cobb' : '4 pt angle';
                        } else {
                            angle = calculateSpinalCurvature(previewPts).angle;
                            prefix = activeTool!.toUpperCase() === 'SC' ? 'Angle' : activeTool!.toUpperCase();
                        }

                        if (angle > 0) {
                            ctx.save();
                            ctx.fillStyle = ctx.strokeStyle;
                            ctx.font = `bold ${14 / ek}px Inter, sans-serif`;
                            ctx.shadowColor = "rgba(0,0,0,0.5)";
                            ctx.shadowBlur = 4 / ek;
                            ctx.fillText(`${prefix}: ${angle.toFixed(1)}°`, wPos.x + 10 / ek, wPos.y - 10 / ek);
                            ctx.restore();
                        }
                    }
                }
            } else if (['tpa', 'spa', 't1spi', 't9spi', 'odha'].includes(activeTool || '')) {
                const count = pts.length;
                if (count >= 2) {
                    const mid = getMidpoint(pts[0], pts[1]);
                    const rad = getDistance(pts[0], pts[1]) / 2;
                    ctx.moveTo(mid.x + rad, mid.y); ctx.arc(mid.x, mid.y, rad, 0, Math.PI * 2);
                } else if (count === 1) { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(wPos.x, wPos.y); }

                if (count >= 4) {
                    const mid = getMidpoint(pts[2], pts[3]);
                    const rad = getDistance(pts[2], pts[3]) / 2;
                    ctx.moveTo(mid.x + rad, mid.y); ctx.arc(mid.x, mid.y, rad, 0, Math.PI * 2);
                } else if (count === 3) { ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(wPos.x, wPos.y); }

                if (count >= 5) {
                    const hip = getHipAxisCenter(pts.slice(0, 4));
                    if (hip) { ctx.moveTo(hip.x, hip.y); ctx.lineTo(pts[4].x, pts[4].y); }
                }

                if (['tpa', 'spa'].includes(activeTool || '')) {
                    if (count >= 7) { ctx.moveTo(pts[5].x, pts[5].y); ctx.lineTo(pts[6].x, pts[6].y); }
                    else if (count === 6) { ctx.moveTo(pts[5].x, pts[5].y); ctx.lineTo(wPos.x, wPos.y); }
                }
            } else if (['sva', 'line', 'calibration', 'stenosis', 'po', 'csvl', 'slope', 'cbva', 'itilt', 'angle-2pt', 'angle-3pt'].includes(activeTool || '')) {
                if (pts.length > 0) {
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                }
                if (activeTool === 'sva' && pts.length >= 1) {
                    ctx.setLineDash([5 / ek, 5 / ek]);
                    ctx.moveTo(pts[0].x, pts[0].y - 200 / ek);
                    ctx.lineTo(pts[0].x, pts[0].y + 200 / ek);
                    ctx.setLineDash([]);
                }
            } else if (['ts', 'avt', 'ssa'].includes(activeTool || '')) {
                if (pts.length >= 1) {
                    ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 4 / ek, 0, Math.PI * 2); ctx.fill();
                    if (pts.length === 1) { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(wPos.x, wPos.y); }
                }
                if (pts.length >= 3) {
                    ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y);
                    const mid = getMidpoint(pts[1], pts[2]);
                    ctx.setLineDash([5 / ek, 5 / ek]);
                    ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(mid.x, mid.y);
                    ctx.setLineDash([]);
                } else if (pts.length === 2) {
                    ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(wPos.x, wPos.y);
                }
            } else if (activeTool === 'cmc') {
                for (let i = 0; i < Math.floor(pts.length / 2); i++) {
                    ctx.moveTo(pts[i * 2].x, pts[i * 2].y); ctx.lineTo(pts[i * 2 + 1].x, pts[i * 2 + 1].y);
                }
                if (pts.length % 2 === 1) { ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y); ctx.lineTo(wPos.x, wPos.y); }
            } else if (['imp-screw', 'imp-cage', 'imp-plate'].includes(activeTool || '')) {
                if (pts.length >= 2) {
                    const type = activeTool!.replace('imp-', '');
                    const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * (180 / Math.PI);
                    const length = getDistance(pts[0], pts[1]);
                    if (type === 'screw') drawScrew(ctx, pts[0], angle, { length, diameter: 6 }, ek, 'rgba(148, 163, 184, 0.5)');
                    if (type === 'cage') drawCage(ctx, pts[0], angle, { width: length, height: 10, wedgeAngle: 5 }, ek, 'rgba(16, 185, 129, 0.5)');
                    if (type === 'plate') drawPlate(ctx, pts[0], angle, { width: 15, height: length, holes: 4 }, ek, 'rgba(100, 116, 139, 0.5)');
                }
            } else if (activeTool === 'imp-rod') {
                drawRod(ctx, pts, ek, 6, 'rgba(148, 163, 184, 0.5)');
            } else if (activeTool === 'text') {
                const anchor = pts[0];
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(anchor.x, anchor.y, 4 / ek, 0, Math.PI * 2); ctx.fill();
                ctx.setLineDash([5 / ek, 5 / ek]);
                ctx.strokeStyle = '#fff';
                ctx.beginPath(); ctx.moveTo(anchor.x, anchor.y); ctx.lineTo(wPos.x, wPos.y); ctx.stroke();
                ctx.setLineDash([]);
            } else if (activeTool === 'pencil') {
                if (pts.length > 1) {
                    ctx.strokeStyle = '#facc15';
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                    ctx.stroke();
                }
            } else if (activeTool === 'circle' && pts.length >= 2) {
                const center = getMidpoint(pts[0], pts[1]);
                const radius = getDistance(pts[0], pts[1]) / 2;
                ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2); ctx.stroke();
            } else if (activeTool === 'ellipse' && pts.length >= 2) {
                const center = getMidpoint(pts[0], pts[1]);
                const rx = Math.abs(pts[0].x - pts[1].x) / 2;
                const ry = Math.abs(pts[0].y - pts[1].y) / 2;
                ctx.beginPath(); ctx.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
            } else if (activeTool === 'polygon' && pts.length > 0) {
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.stroke();
            }

            ctx.stroke();
            ctx.restore();
        }

        // 4. Overlays & HUD (outside the main tempPoints block if necessary, or inside)
        if (activeTool === 'crop' && cropRect) {
            ctx.save();
            ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2 / ek; ctx.setLineDash([5 / ek, 5 / ek]);
            const x1 = Math.min(cropRect.start.x, cropRect.current.x);
            const y1 = Math.min(cropRect.start.y, cropRect.current.y);
            const w = Math.abs(cropRect.current.x - cropRect.start.x);
            const h = Math.abs(cropRect.current.y - cropRect.start.y);
            ctx.strokeRect(x1, y1, w, h);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'; ctx.fillRect(x1, y1, w, h);
            ctx.restore();
        }

        if (isDragging && selection?.type === 'implant-point') {
            const imp = state.data.implants.find((i: any) => i.id === selection.measurementId);
            if (imp) {
                ctx.save();
                ctx.fillStyle = "#fff"; ctx.font = `bold ${14 / ek}px Inter, sans-serif`; ctx.textAlign = "center";
                ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 4 / ek;
                const displayRatio = storeCanvas.calibrationApplied ? storeCanvas.pixelToMm : null;
                const ratio = displayRatio || 1;
                const unit = displayRatio ? 'mm' : 'px';
                let label = "";
                if (imp.type === 'screw') label = `${(imp.properties.length * ratio).toFixed(1)} ${unit}`;
                else if (imp.type === 'cage') label = `H: ${(imp.properties.height * ratio).toFixed(1)} ${unit}, W: ${(imp.properties.width * ratio).toFixed(1)} ${unit}`;
                if (label) ctx.fillText(label, mouseWorldPosRef.current.x, mouseWorldPosRef.current.y - 20 / ek);
                ctx.restore();
            }
        }

        ctx.restore(); // Final balance
    }, [storeCanvas, getCachedImage, getSharpImage, activeTool, tempPoints, cropRect, isDragging, mouseWorldPosRef, selection, vbmMode, tiltMode, managerReady, isCalibrationDialogOpen, isTiltDialogOpen, isTextDialogOpen]);

    useEffect(() => {
        let rafId: number;
        const loop = () => {
            draw();
            rafId = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(rafId);
    }, [draw]);

    useEffect(() => {
        const resize = () => {
            if (containerRef.current && canvasRef.current) {
                canvasRef.current.width = containerRef.current.clientWidth;
                canvasRef.current.height = containerRef.current.clientHeight;
            }
        }
        window.addEventListener('resize', resize);
        resize();
        return () => window.removeEventListener('resize', resize);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isInteractive) return;
            const key = e.key.toLowerCase();
            const isUndoShortcut = e.ctrlKey && !e.shiftKey && key === 'z';
            const isRedoShortcut = e.ctrlKey && key === 'y';

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();

                return;

                setTempPoints([]);
                setActiveTool(null);
            }
            if (e.key === 'Enter' && activeTool === 'polygon' && tempPoints.length >= 3) {
                // Close polygon on Enter
                if (managerRef.current) {
                    const ratio = storeCanvas.pixelToMm;
                    const area = getPolygonArea(tempPoints);
                    const perim = getPolygonPerimeter(tempPoints);
                    let result = '';

                    result = `A: ${area.toFixed(0)}px² | P: ${perim.toFixed(1)}px`;

                    managerRef.current.applyOperation('ADD_MEASUREMENT', { toolKey: 'polygon', points: tempPoints, result })
                        .then(s => setMeasurements(s.data.measurements));
                }
                setTempPoints([]);
            }
            if (isUndoShortcut) {
                e.preventDefault();
                e.stopPropagation();

                if (tempPoints.length > 0) {
                    setTempPoints(prev => prev.slice(0, -1));
                } else if (managerRef.current) {
                    const newState = managerRef.current.undo();
                    if (newState) setMeasurements(newState.data.measurements);
                }
            }

            if (isRedoShortcut && managerRef.current) {
                e.preventDefault();
                e.stopPropagation();

                const newState = managerRef.current.redo();
                if (newState) setMeasurements(newState.data.measurements);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [tempPoints, setMeasurements, setActiveTool, isInteractive, activeTool]);

    // Ensure tempPoints is cleared when tool changes or is deactivated
    useEffect(() => {
        setTempPoints([]);
    }, [activeTool]);

    const handleMouseDown = async (e: React.MouseEvent) => {
        handleCanvasClick();

        // Always allow middle-click panning regardless of interaction focus
        if (e.button === 1) {
            setIsPanning(true);
            lastPanPos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        if (!isInteractive || isTiltDialogOpen || isTextDialogOpen) return;

        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const worldPos = getWorldPos(e.clientX - rect.left, e.clientY - rect.top);
        const { k } = viewTransformRef.current;
        const ek = k * (storeCanvas.zoom || 1);
        const currentState = managerRef.current?.current;



        if (activeTool === 'crop') {
            setCropRect({ start: worldPos, current: worldPos });
            setIsDragging(true);
            return;
        }

        if (activeTool === 'cmc' && e.button === 2) {
            if (tempPoints.length >= 4) {
                const angles = calculateCMC(tempPoints);
                const result = angles ? angles.map((a: number, i: number) => `Cobb ${i + 1}: ${a.toFixed(1)}°`).join('\n') : '';
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'cmc', points: tempPoints, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
                setActiveTool(null);
            }
            return;
        }

        // TOOL HANDLERS - Place points BEFORE checking for selection if a tool is active
        if (activeTool === 'cobb' || activeTool === 'cl' || activeTool === 'tk' || activeTool === 'll' || activeTool === 'sc') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 4) {
                let result = '';
                if (activeTool === 'cobb') {
                    const { angle } = calculateCobbAngle(newTemp);
                    result = `COBB: ${angle.toFixed(1)}°`;
                } else {
                    const { angle } = calculateSpinalCurvature(newTemp);
                    const prefix = activeTool.toUpperCase();
                    result = `${prefix === 'SC' ? 'Angle' : prefix}: ${angle.toFixed(1)}°`;
                }
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: activeTool, points: newTemp, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'sva') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 2) {
                const distancePx = Math.abs(newTemp[0].x - newTemp[1].x);
                const result = `SVA: ${distancePx.toFixed(1)} px`;
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'sva', points: newTemp, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'calibration') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 2) {
                setCalibrationPoints(newTemp as [Point, Point]);
                setTempPoints(newTemp); // Keep visible on canvas while dialog is open
                setActiveDialog('calibration');
                setIsCalibrationDialogOpen(true);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'vbm') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 4) {
                const result = calculateVBM(newTemp, vbmMode, null);
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', {
                    toolKey: 'vbm',
                    points: newTemp,
                    result,
                    measurement: { vbmMode }
                });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'pelvis') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 6) {
                const params = calculatePelvicParameters(newTemp);
                let result = '';
                if (params) {
                    result = `PI: ${params.pi.toFixed(1)}°\nPT: ${params.pt.toFixed(1)}°\nSS: ${params.ss.toFixed(1)}°`;
                }
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'pelvis', points: newTemp, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'pi_ll') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 8) {
                const params = calculatePILL(newTemp);
                let result = '';
                if (params) {
                    result = `PI: ${params.pi.toFixed(1)}°\nLL: ${params.ll.toFixed(1)}°\nPI - LL: ${params.mismatch.toFixed(1)}°`;
                }
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'pi_ll', points: newTemp, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'tpa' || activeTool === 'spa') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 7) {
                let result = '';
                if (activeTool === 'tpa') {
                    const data = calculateTPA(newTemp);
                    result = data ? `TPA: ${data.angle.toFixed(1)}°` : '';
                } else { // spa
                    const data = calculateSPA(newTemp);
                    result = data ? `SPA: ${data.angle.toFixed(1)}°` : '';
                }
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: activeTool, points: newTemp, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (['t1spi', 't9spi', 'odha'].includes(activeTool || '')) {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 5) {
                const data = calculateSPi(newTemp);
                let result = '';
                if (data) {
                    const prefix = activeTool === 't1spi' ? 'T1SPi' : activeTool === 't9spi' ? 'T9SPi' : 'ODHA';
                    result = `${prefix}: ${Math.abs(data.angle).toFixed(1)}°`;
                }
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: activeTool, points: newTemp, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'ssa') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 3) {
                const data = calculateSSA(newTemp);
                const result = data ? `SSA: ${data.angle.toFixed(1)}°` : '';
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: activeTool, points: newTemp, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'cbva' || activeTool === 'rvad') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            const maxPts = activeTool === 'cbva' ? 2 : 6;

            if (newTemp.length === maxPts) {
                let result = '';
                if (activeTool === 'cbva') {
                    const data = calculateCBVA(newTemp);
                    result = data ? `CBVA: ${data.angle.toFixed(1)}°` : '';
                } else {
                    const data = calculateRVAD(newTemp);
                    result = data ? `Rib Angle R: ${data.rvaR.toFixed(1)}°\nRib Angle L: ${data.rvaL.toFixed(1)}°\nRVAD: ${data.rvad.toFixed(1)}°` : '';
                }
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: activeTool, points: newTemp, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'stenosis') {
            // Right Click to Close
            if (e.button === 2) {
                if (tempPoints.length >= 3) {
                    const calc = calculateStenosisArea(tempPoints, null);
                    const result = calc ? `Area: ${calc.resultString} ` : 'Area: ...';
                    const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'stenosis', points: tempPoints, result });
                    if (newState) setMeasurements(newState.data.measurements);
                    setTempPoints([]);
                }
                return;
            }

            if (e.button !== 0) return;

            // Check for closing by clicking near start
            if (tempPoints.length >= 3 && getDistance(worldPos, tempPoints[0]) < 20 / ek) {
                const calc = calculateStenosisArea(tempPoints, null);
                const result = calc ? `Area: ${calc.resultString} ` : 'Area: ...';
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'stenosis', points: tempPoints, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
                return;
            }
            setTempPoints([...tempPoints, worldPos]);
            return;
        }

        if (activeTool === 'spondy') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 4) {
                const resultObj = calculateSpondylolisthesis(newTemp, null);
                const result = resultObj ? formatSpondylolisthesisResult(resultObj, null) : 'Calculating...';
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'spondy', points: newTemp, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (['po', 'csvl', 'slope', 'itilt'].includes(activeTool || '')) {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 2) {
                let result = '';
                if (activeTool === 'po') {
                    const data = calculatePO(newTemp);
                    result = data ? `PO: ${data.angle.toFixed(1)}°` : '';
                } else if (activeTool === 'slope') {
                    const data = calculateSlope(newTemp);
                    result = data ? `Slope: ${data.angle.toFixed(1)}°` : '';
                } else if (activeTool === 'itilt') {
                    if (!tiltMode) {
                        setTiltMode('UIV'); // Default to UIV if somehow null
                        setActiveDialog('tilt');
                        setIsTiltDialogOpen(true);
                        return;
                    }
                    const data = calculateITilt(newTemp);
                    const prefix = tiltMode === 'UIV' ? 'UIV Tilt' : 'LIV Tilt';
                    result = data ? `${prefix}: ${data.angle.toFixed(1)}°` : '';
                } else {
                    result = "CSVL is displayed";
                }
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', {
                    toolKey: activeTool,
                    points: newTemp,
                    result,
                    measurement: activeTool === 'itilt' ? { tiltMode } : {}
                });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'cmc') {
            if (e.button !== 0) return;
            setTempPoints([...tempPoints, worldPos]);
            return;
        }

        if (['ost-pso', 'ost-spo', 'ost-resect', 'ost-open'].includes(activeTool || '')) {
            if (e.button !== 0) return;

            const newTemp = [...tempPoints, worldPos];
            const maxPts = (activeTool === 'ost-open') ? 6 : ((activeTool === 'ost-resect') ? 4 : (['ost-pso', 'ost-spo'].includes(activeTool || '') ? 3 : 2));

            if (newTemp.length === maxPts) {
                // Find fragment under first click
                let finalFragId = null;
                if (currentState?.data.fragments) {
                    for (let i = currentState.data.fragments.length - 1; i >= 0; i--) {
                        if (isPointInPolygon(newTemp[0], currentState.data.fragments[i].polygon)) {
                            finalFragId = currentState.data.fragments[i].id;
                            break;
                        }
                    }
                }

                if (activeTool === 'ost-resect' || activeTool === 'ost-open') {
                    // DESTRUCTIVE OPERATION: Performs the actual split and move
                    if (managerRef.current) {
                        if (activeTool === 'ost-open') {
                            const { phi, hinge, normal } = calculateOpenOsteotomyPrimitives(newTemp);
                            console.log(`[CanvasWorkspace] Triggering Open Osteotomy. Phi: ${phi.toFixed(3)}, H: (${hinge.x.toFixed(1)}, ${hinge.y.toFixed(1)})`);
                            try {
                                const result = await performOpenOsteotomyOnFragment(
                                    managerRef.current,
                                    phi,
                                    hinge,
                                    normal,
                                    newTemp
                                );
                                console.log('[CanvasWorkspace] Osteotomy result:', result);

                                // Check history immediately after operation
                                if (managerRef.current) {
                                    const history = managerRef.current.getHistory();
                                    console.log('[CanvasWorkspace] POST-OPERATION HISTORY CHECK:');
                                    console.log('[CanvasWorkspace] Total operations:', history.length);
                                    history.slice(-10).forEach((h, i) => {
                                        console.log(`[CanvasWorkspace]   ${i}: ${h.description} (${h.isCurrent ? 'CURRENT' : ''})`);
                                    });
                                }
                            } catch (err) {
                                console.error('Osteotomy failed:', err);
                            }

                            const result = `Opening: ${Math.abs(phi * 180 / Math.PI).toFixed(1)}°`;
                            const measurementState = await managerRef.current.applyOperation('ADD_MEASUREMENT', {
                                toolKey: activeTool,
                                points: newTemp,
                                result,
                                fragmentId: finalFragId,
                                skipHistory: true,
                                measurement: {
                                    type: 'OPEN',
                                    hingePoint: hinge,
                                    rotationAngleRad: phi,
                                    normal,
                                    cutRays: [{ origin: hinge, angle: Math.atan2(newTemp[3].y - newTemp[2].y, newTemp[3].x - newTemp[2].x) }]
                                }
                            });
                            if (measurementState) setMeasurements(measurementState.data.measurements);
                        } else if (activeTool === 'ost-resect') {
                            await performResectionOnFragment(managerRef.current, finalFragId, newTemp);

                            const primitives = calculateResectionPrimitives(newTemp);
                            if (primitives) {
                                const result = `Resection: ${Math.abs(primitives.rotationAngleRad * 180 / Math.PI).toFixed(1)}°`;
                                const measurementState = await managerRef.current.applyOperation('ADD_MEASUREMENT', {
                                    toolKey: activeTool,
                                    points: newTemp,
                                    result,
                                    fragmentId: finalFragId,
                                    skipHistory: true,
                                    measurement: {
                                        type: 'RESECT',
                                        hingePoint: primitives.hingePoint,
                                        rotationAngleRad: primitives.rotationAngleRad,
                                        translation: primitives.translation,
                                        cutRays: primitives.cutRays
                                    }
                                });
                                if (measurementState) setMeasurements(measurementState.data.measurements);
                            }
                        }
                        const newest = managerRef.current.current;
                        if (newest) {
                            console.log('[CanvasWorkspace] About to call setMeasurements');
                            console.log('[CanvasWorkspace] Measurements count:', newest.data.measurements.length);
                            setMeasurements(newest.data.measurements);
                            console.log('[CanvasWorkspace] setMeasurements called');

                            // Final history check after setMeasurements
                            const finalHistory = managerRef.current.getHistory();
                            console.log('[CanvasWorkspace] FINAL HISTORY AFTER setMeasurements:');
                            console.log('[CanvasWorkspace] Total operations:', finalHistory.length);
                            finalHistory.slice(-10).forEach((h, i) => {
                                console.log(`[CanvasWorkspace]   ${i}: ${h.description} (${h.isCurrent ? 'CURRENT' : ''})`);
                            });
                        }
                    }
                } else {
                    let planningResult = 'Planning...';
                    if ((activeTool === 'ost-pso' || activeTool === 'ost-spo') && newTemp.length >= 3) {
                        const p = newTemp[0];
                        const h = newTemp[1];
                        const a = newTemp[2];
                        const moving = Math.atan2(p.y - h.y, p.x - h.x);
                        const fixed = Math.atan2(a.y - h.y, a.x - h.x);
                        const theta = ((fixed - moving + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
                        planningResult = `Correction: ${Math.abs(theta * 180 / Math.PI).toFixed(1)}°`;
                    }

                    const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', {
                        toolKey: activeTool,
                        points: newTemp,
                        result: planningResult,
                        fragmentId: finalFragId
                    });
                    if (newState) setMeasurements(newState.data.measurements);
                }
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'c7pl') {
            if (e.button !== 0) return;
            const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'c7pl', points: [worldPos], result: "C7PL is displayed" });
            if (newState) setMeasurements(newState.data.measurements);
            return;
        }

        if (activeTool === 'text') {
            if (e.button !== 0) return;
            setTempPoints([worldPos]);
            setTextToolPos(worldPos);
            setActiveDialog('text');
            setIsTextDialogOpen(true);
            return;
        }

        if (activeTool === 'pencil') {
            if (e.button !== 0) return;
            setTempPoints([worldPos]);
            setIsDragging(true); // Reuse isDragging for drawing state
            return;
        }

        if (activeTool === 'circle' || activeTool === 'ellipse') {
            if (e.button !== 0) return;
            setTempPoints([worldPos, worldPos]);
            setIsDragging(true);
            return;
        }

        if (activeTool === 'polygon') {
            if (e.button === 2) { // Right click to finish
                if (tempPoints.length >= 3) {
                    const area = getPolygonArea(tempPoints);
                    const perim = getPolygonPerimeter(tempPoints);
                    let result = '';

                    result = `A: ${area.toFixed(0)}px² | P: ${perim.toFixed(1)}px`;

                    const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'polygon', points: tempPoints, result });
                    if (newState) setMeasurements(newState.data.measurements);
                    setTempPoints([]);
                }
                return;
            }
            if (e.button !== 0) return;
            // Close if near start
            if (tempPoints.length >= 3 && getDistance(worldPos, tempPoints[0]) < 20 / ek) {
                const area = getPolygonArea(tempPoints);
                const perim = getPolygonPerimeter(tempPoints);
                let result = '';

                result = `Area: ${area.toFixed(0)} px²\nPerimeter: ${perim.toFixed(1)} px`;

                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'polygon', points: tempPoints, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
                return;
            }
            setTempPoints([...tempPoints, worldPos]);
            return;
        }

        if (activeTool === 'cobb' || activeTool === 'angle-4pt') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 4) {
                const { angle } = calculateCobbAngle(newTemp);
                const prefix = activeTool === 'cobb' ? 'Cobb' : '4 pt angle';
                const result = `${prefix}: ${angle.toFixed(1)}°`;
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: activeTool, points: newTemp, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (['ts', 'avt'].includes(activeTool || '')) {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 3) {
                let result = '';
                if (activeTool === 'ts') {
                    const data = calculateTS(newTemp, null);
                    result = data?.resultString || '';
                } else {
                    const data = calculateAVT(newTemp, null);
                    result = data?.resultString || '';
                }
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: activeTool, points: newTemp, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'line' || activeTool === 'angle-2pt') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 2) {
                let result = '';
                if (activeTool === 'line') {
                    const distPx = getDistance(newTemp[0], newTemp[1]);
                    result = `distance: ${distPx.toFixed(1)}px`;
                } else {
                    const dx = Math.abs(newTemp[1].x - newTemp[0].x);
                    const dy = Math.abs(newTemp[1].y - newTemp[0].y);
                    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                    result = `2 pt angle: ${angle.toFixed(1)}°`;
                }
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: activeTool, points: newTemp, result });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'angle-3pt') {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 3) {
                const a1 = Math.atan2(newTemp[0].y - newTemp[1].y, newTemp[0].x - newTemp[1].x);
                const a2 = Math.atan2(newTemp[2].y - newTemp[1].y, newTemp[2].x - newTemp[1].x);
                let diff = Math.abs(a1 - a2) * (180 / Math.PI);
                if (diff > 180) diff = 360 - diff;
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'angle-3pt', points: newTemp, result: `3 pt angle: ${diff.toFixed(1)}°` });
                if (newState) setMeasurements(newState.data.measurements);
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'point') {
            if (e.button !== 0) return;
            let targetFragmentId = null;
            if (currentState?.data.fragments) {
                for (let i = currentState.data.fragments.length - 1; i >= 0; i--) {
                    if (isPointInPolygon(worldPos, currentState.data.fragments[i].polygon)) {
                        targetFragmentId = currentState.data.fragments[i].id;
                        break;
                    }
                }
            }
            const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'point', fragmentId: targetFragmentId, points: [worldPos] });
            if (newState) setMeasurements(newState.data.measurements);
            return;
        }

        if (['imp-screw', 'imp-cage', 'imp-plate'].includes(activeTool || '')) {
            if (e.button !== 0) return;
            const newTemp = [...tempPoints, worldPos];
            if (newTemp.length === 2) {
                const type = activeTool!.replace('imp-', '');
                const angle = Math.atan2(newTemp[1].y - newTemp[0].y, newTemp[1].x - newTemp[0].x) * (180 / Math.PI);
                const length = getDistance(newTemp[0], newTemp[1]);

                let fragmentId = null;
                if (currentState?.data.fragments) {
                    for (let i = currentState.data.fragments.length - 1; i >= 0; i--) {
                        if (isPointInPolygon(newTemp[0], currentState.data.fragments[i].polygon)) {
                            fragmentId = currentState.data.fragments[i].id;
                            break;
                        }
                    }
                }

                const properties: any = { length, diameter: 6 };
                if (type === 'cage') { properties.width = length; properties.height = 10; properties.wedgeAngle = 5; properties.color = '#10b981'; }
                if (type === 'plate') { properties.width = 15; properties.height = length; properties.holes = 4; properties.color = '#64748b'; }
                if (type === 'screw') { properties.color = '#94a3b8'; }

                const newState = await managerRef.current?.applyOperation('ADD_IMPLANT', {
                    type,
                    position: newTemp[0],
                    angle,
                    properties,
                    fragmentId
                });
                if (newState) {
                    syncStoreWithCanvas(newState.data.measurements, newState.data.implants);
                    // Persistent selection: Select the newly added implant
                    const added = newState.data.implants[newState.data.implants.length - 1];
                    if (added) setSelection({ type: 'implant', measurementId: added.id });
                }
                setTempPoints([]);
            } else {
                setTempPoints(newTemp);
            }
            return;
        }

        if (activeTool === 'imp-rod') {
            if (e.button === 2) { // Right click to finish
                if (tempPoints.length >= 2) {
                    const newState = await managerRef.current?.applyOperation('ADD_IMPLANT', {
                        type: 'rod',
                        properties: { points: tempPoints, diameter: 6, color: '#94a3b8' }
                    });
                    if (newState) {
                        syncStoreWithCanvas(newState.data.measurements, newState.data.implants);
                        const added = newState.data.implants[newState.data.implants.length - 1];
                        if (added) setSelection({ type: 'implant', measurementId: added.id });
                    }
                    setTempPoints([]);
                }
                return;
            }
            if (e.button !== 0) return;
            setTempPoints([...tempPoints, worldPos]);
            return;
        }

        if (currentState) {
            // Check Implants first
            for (const imp of currentState.data.implants) {
                if (imp.position && getDistance(worldPos, imp.position) < 30 / ek) {
                    setSelection({ type: 'implant', measurementId: imp.id });
                    setIsDragging(true);
                    return;
                }
                if (imp.properties?.points) {
                    for (let i = 0; i < imp.properties.points.length; i++) {
                        if (getDistance(worldPos, imp.properties.points[i]) < 20 / ek) {
                            setSelection({ type: 'implant-point', measurementId: imp.id, pointIndex: i });
                            setIsDragging(true);
                            return;
                        }
                    }
                }
            }

            for (const m of currentState.data.measurements) {
                for (let i = 0; i < m.points.length; i++) {
                    if (getDistance(worldPos, m.points[i]) < 20 / ek) {
                        setSelection({ type: 'point', measurementId: m.id, pointIndex: i });
                        setIsDragging(true);
                        return;
                    }
                }
                let lp = m.measurement?.labelPos;
                if (!lp) {
                    if (m.toolKey === 'cobb' && m.points.length === 4) {
                        const { intersection } = calculateCobbAngle(m.points);
                        if (intersection) lp = intersection;
                    } else if (m.toolKey === 'vbm' && m.points.length === 4) {
                        const center = {
                            x: (m.points[0].x + m.points[1].x + m.points[2].x + m.points[3].x) / 4,
                            y: (m.points[0].y + m.points[1].y + m.points[2].y + m.points[3].y) / 4
                        };
                        lp = {
                            x: Math.max(m.points[0].x, m.points[1].x, m.points[2].x, m.points[3].x) + 45 / ek,
                            y: center.y
                        };
                    } else if (['cl', 'tk', 'll', 'sc'].includes(m.toolKey) && m.points.length === 4) {
                        // Use the curve handle position or midpoint chord as fallback
                        const mid1 = { x: (m.points[0].x + m.points[1].x) / 2, y: (m.points[0].y + m.points[1].y) / 2 };
                        const mid2 = { x: (m.points[2].x + m.points[3].x) / 2, y: (m.points[2].y + m.points[3].y) / 2 };
                        lp = { x: (mid1.x + mid2.x) / 2 + 30 / ek, y: (mid1.y + mid2.y) / 2 };
                    } else if (m.toolKey === 'sva' && m.points.length === 2) {
                        lp = { x: (m.points[0].x + m.points[1].x) / 2, y: m.points[0].y - 20 / ek };
                    } else if (m.toolKey === 'pelvis' && m.points.length === 6) {
                        const s1_center = { x: (m.points[4].x + m.points[5].x) / 2, y: (m.points[4].y + m.points[5].y) / 2 };
                        lp = { x: s1_center.x + 50 / ek, y: s1_center.y };
                    } else if (m.toolKey === 'pi_ll' && m.points.length === 8) {
                        const s1_center = { x: (m.points[4].x + m.points[5].x) / 2, y: (m.points[4].y + m.points[5].y) / 2 };
                        lp = { x: s1_center.x + 80 / ek, y: s1_center.y - 50 / ek };
                    } else if (m.toolKey === 'spondy' && m.points.length === 4) {
                        lp = {
                            x: (m.points[0].x + m.points[1].x + m.points[2].x + m.points[3].x) / 4 + 40 / ek,
                            y: (m.points[0].y + m.points[1].y + m.points[2].y + m.points[3].y) / 4
                        };
                    } else if (m.toolKey === 'po' && m.points.length === 2) {
                        lp = getMidpoint(m.points[0], m.points[1]);
                    } else if (['ts', 'avt'].includes(m.toolKey) && m.points.length === 3) {
                        const mid = getMidpoint(m.points[1], m.points[2]);
                        lp = { x: (m.points[0].x + mid.x) / 2, y: m.points[0].y - 15 / ek };
                    } else if (m.toolKey === 'csvl' && m.points.length === 2) {
                        const mid = getMidpoint(m.points[0], m.points[1]);
                        lp = { x: mid.x + 20 / ek, y: mid.y };
                    } else if (m.toolKey === 'c7pl' && m.points.length === 1) {
                        lp = { x: m.points[0].x + 20 / ek, y: m.points[0].y };
                    } else if (m.toolKey === 'slope' && m.points.length === 2) {
                        lp = getMidpoint(m.points[0], m.points[1]);
                    } else if (m.toolKey === 'itilt') {
                        // For iTilt, label defaults to midpoint
                        lp = getMidpoint(m.points[0], m.points[1]);
                    } else if (m.toolKey === 'cmc' && m.points.length >= 4) {
                        lp = { x: (m.points[1].x + m.points[2].x) / 2 + 20 / ek, y: (m.points[1].y + m.points[2].y) / 2 };
                    } else if (['tpa', 'spa'].includes(m.toolKey) && m.points.length === 7) {
                        const hip = getHipAxisCenter(m.points);
                        lp = hip ? { x: hip.x + 30 / ek, y: hip.y - 30 / ek } : { x: m.points[4].x + 50 / ek, y: m.points[4].y };
                    } else if (['t1spi', 't9spi', 'odha'].includes(m.toolKey) && m.points.length === 5) {
                        const hip = getHipAxisCenter(m.points);
                        lp = hip ? { x: hip.x + 20 / ek, y: (hip.y + m.points[4].y) / 2 } : { x: m.points[4].x + 50 / ek, y: m.points[4].y };
                    } else if (m.toolKey === 'ssa' && m.points.length === 3) {
                        const s1Mid = getMidpoint(m.points[1], m.points[2]);
                        lp = { x: s1Mid.x + 40 / ek, y: s1Mid.y };
                    } else if (m.toolKey === 'cbva' && m.points.length === 2) {
                        lp = { x: m.points[0].x + 30 / ek, y: m.points[0].y - 30 / ek };
                    } else if (m.toolKey === 'rvad' && m.points.length === 6) {
                        const mid = getMidpoint(m.points[4], m.points[5]);
                        lp = { x: mid.x + 50 / ek, y: mid.y + 50 / ek };
                    } else if ((m.toolKey === 'text' || m.toolKey === 'pencil') && m.points.length > 0) {
                        // Default text/pencil label is at the first point if not moved
                        lp = m.points[0];
                    } else if (m.toolKey === 'circle' && m.points.length === 2) {
                        lp = getMidpoint(m.points[0], m.points[1]);
                    } else if (m.toolKey === 'ellipse' && m.points.length === 2) {
                        lp = getMidpoint(m.points[0], m.points[1]);
                    } else if (m.toolKey === 'polygon' && m.points.length > 0) {
                        // Centroidish
                        let sx = 0, sy = 0;
                        m.points.forEach(p => { sx += p.x; sy += p.y; });
                        lp = { x: sx / m.points.length, y: sy / m.points.length };
                    } else if (m.toolKey === 'line' && m.points.length === 2) {
                        lp = getMidpoint(m.points[0], m.points[1]);
                    } else if (['angle-2pt', 'angle-3pt', 'angle-4pt'].includes(m.toolKey)) {
                        if (m.points.length > 0) lp = m.points[Math.floor(m.points.length / 2)];
                    }
                }

                if (lp && getDistance(worldPos, lp) < 60 / ek) {
                    setSelection({ type: 'label', measurementId: m.id });
                    setIsDragging(true);
                    return;
                }

                // Curve handle for curvature tools
                if (['cl', 'tk', 'll', 'sc'].includes(m.toolKey)) {
                    const handlePos = (m.measurement as any)?.handlePos;
                    if (handlePos && getDistance(worldPos, handlePos) < 20 / ek) {
                        setSelection({ type: 'curvatureHandle', measurementId: m.id });
                        setIsDragging(true);
                        return;
                    }
                }
            }
        }

        // Check implant handles
        const implants = useAppStore.getState().implants;
        for (const imp of implants) {
            const handles = getImplantHandles(imp);
            for (let i = 0; i < handles.length; i++) {
                if (getDistance(worldPos, handles[i]) < 10 / ek) {
                    setSelection({
                        type: 'implant-point',
                        measurementId: imp.id,
                        pointIndex: i
                    });
                    setIsDragging(true);
                    return;
                }
            }
        }

        if (!activeTool && !selection) {
            setIsPanning(true);
            lastPanPos.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseMove = useCallback(async (e: React.MouseEvent) => {
        if (!isInteractive && !isPanning) return;

        if (isCalibrationDialogOpen || isTiltDialogOpen || isTextDialogOpen) {
            return;
        }

        if (isPanning && lastPanPos.current) {
            const dx = e.clientX - lastPanPos.current.x;
            const dy = e.clientY - lastPanPos.current.y;
            viewTransformRef.current.x += dx;
            viewTransformRef.current.y += dy;
            lastPanPos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        if (!containerRef.current || !managerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const worldPos = getWorldPos(e.clientX - rect.left, e.clientY - rect.top);
        const lastWorldPos = lastWorldPosRef.current;
        const dwx = worldPos.x - lastWorldPos.x;
        const dwy = worldPos.y - lastWorldPos.y;

        mouseWorldPosRef.current = worldPos;
        lastWorldPosRef.current = worldPos;

        if (activeTool === 'crop' && isDragging && cropRect) {
            setCropRect(prev => prev ? { ...prev, current: worldPos } : null);
            return;
        }

        if (activeTool === 'pencil' && isDragging) {
            setTempPoints(prev => [...prev, worldPos]);
            return;
        }

        if ((activeTool === 'circle' || activeTool === 'ellipse') && isDragging && tempPoints.length > 0) {
            setTempPoints([tempPoints[0], worldPos]);
            return;
        }

        if (isDragging && selection && managerRef.current) {
            if (selection.type === 'implant') {
                const newStatePromise = managerRef.current.applyOperation('MOVE_IMPLANT', { id: selection.measurementId, deltaX: dwx, deltaY: dwy });
                newStatePromise.then(newState => {
                    if (newState) useAppStore.getState().setImplants(newState.data.implants);
                });
                return;
            }
            if (selection.type === 'implant-point') {
                const imp = managerRef.current.current?.data.implants.find(i => i.id === selection.measurementId);
                if (imp) {
                    if (imp.type === 'rod' && imp.properties?.points) {
                        const newPts = [...imp.properties.points];
                        newPts[selection.pointIndex!] = worldPos;
                        const newStatePromise = managerRef.current.applyOperation('UPDATE_IMPLANT', { id: imp.id, properties: { points: newPts } });
                        newStatePromise.then(newState => {
                            if (newState) useAppStore.getState().setImplants(newState.data.implants);
                        });
                    } else if (imp.type === 'screw') {
                        if (selection.pointIndex === 0) {
                            // Move entire screw
                            const newStatePromise = managerRef.current.applyOperation('MOVE_IMPLANT', { id: imp.id, deltaX: dwx, deltaY: dwy });
                            newStatePromise.then(newState => {
                                if (newState) useAppStore.getState().setImplants(newState.data.implants);
                            });
                        } else if (imp.position) {
                            // Adjust length and angle from head (pos) and tip (dragging handle 1)
                            const dist = getDistance(imp.position, worldPos);
                            const angle = Math.atan2(worldPos.y - imp.position.y, worldPos.x - imp.position.x) * (180 / Math.PI);
                            const newStatePromise = managerRef.current.applyOperation('UPDATE_IMPLANT', {
                                id: imp.id,
                                angle,
                                properties: { length: dist }
                            });
                            newStatePromise.then(newState => {
                                if (newState) useAppStore.getState().setImplants(newState.data.implants);
                            });
                        }
                    } else if (imp.type === 'cage') {
                        if (selection.pointIndex === 0) {
                            const newStatePromise = managerRef.current.applyOperation('MOVE_IMPLANT', { id: imp.id, deltaX: dwx, deltaY: dwy });
                            newStatePromise.then(newState => {
                                if (newState) useAppStore.getState().setImplants(newState.data.implants);
                            });
                        } else if ((selection.pointIndex === 1 || selection.pointIndex === 2) && imp.position) {
                            // Adjust height
                            const dist = getDistance(imp.position, worldPos) * 2;
                            const newStatePromise = managerRef.current.applyOperation('UPDATE_IMPLANT', {
                                id: imp.id,
                                properties: { height: dist }
                            });
                            newStatePromise.then(newState => {
                                if (newState) useAppStore.getState().setImplants(newState.data.implants);
                            });
                        } else if (selection.pointIndex === 3 && imp.position) {
                            // Adjust width/angle
                            const dist = getDistance(imp.position, worldPos) * 2;
                            const angle = Math.atan2(worldPos.y - imp.position.y, worldPos.x - imp.position.x) * (180 / Math.PI);
                            const newStatePromise = managerRef.current.applyOperation('UPDATE_IMPLANT', {
                                id: imp.id,
                                angle,
                                properties: { width: dist }
                            });
                            newStatePromise.then(newState => {
                                if (newState) useAppStore.getState().setImplants(newState.data.implants);
                            });
                        }
                    } else if (imp.type === 'plate') {
                        if (selection.pointIndex === 0) {
                            const newStatePromise = managerRef.current.applyOperation('MOVE_IMPLANT', { id: imp.id, deltaX: dwx, deltaY: dwy });
                            newStatePromise.then(newState => {
                                if (newState) useAppStore.getState().setImplants(newState.data.implants);
                            });
                        } else if (imp.position) {
                            const dist = getDistance(imp.position, worldPos) * 2;
                            const newStatePromise = managerRef.current.applyOperation('UPDATE_IMPLANT', {
                                id: imp.id,
                                properties: { height: dist }
                            });
                            newStatePromise.then(newState => {
                                if (newState) useAppStore.getState().setImplants(newState.data.implants);
                            });
                        }
                    }
                }
                return;
            }

            const m = managerRef.current.current?.data.measurements.find(m => m.id === selection.measurementId);
            if (m) {
                if (selection.type === 'point' && selection.pointIndex !== undefined) {
                    const newPoints = [...m.points];
                    newPoints[selection.pointIndex] = worldPos;
                    let result = m.result;
                    if ((m.toolKey === 'cobb' || m.toolKey === 'angle-4pt') && newPoints.length === 4) {
                        const { angle } = calculateCobbAngle(newPoints);
                        result = `${m.toolKey === 'cobb' ? 'Cobb' : '4 pt angle'}: ${angle.toFixed(1)}°`;
                    } else if (m.toolKey === 'angle-2pt' && newPoints.length === 2) {
                        const dx = Math.abs(newPoints[1].x - newPoints[0].x);
                        const dy = Math.abs(newPoints[1].y - newPoints[0].y);
                        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                        result = `2 pt angle: ${angle.toFixed(1)}°`;
                    } else if (m.toolKey === 'angle-3pt' && newPoints.length === 3) {
                        const a1 = Math.atan2(newPoints[0].y - newPoints[1].y, newPoints[0].x - newPoints[1].x);
                        const a2 = Math.atan2(newPoints[2].y - newPoints[1].y, newPoints[2].x - newPoints[1].x);
                        let diff = Math.abs(a1 - a2) * (180 / Math.PI);
                        if (diff > 180) diff = 360 - diff;
                        result = `3 pt angle: ${diff.toFixed(1)}°`;
                    } else if (m.toolKey === 'sva' && newPoints.length === 2) {
                        const distancePx = Math.abs(newPoints[0].x - newPoints[1].x);
                        result = `SVA: ${distancePx.toFixed(1)} px`;
                    } else if (m.toolKey === 'line' && newPoints.length === 2) {
                        const distPx = getDistance(newPoints[0], newPoints[1]);
                        result = `DIST: ${distPx.toFixed(1)} px`;
                    } else if (m.toolKey === 'vbm' && newPoints.length === 4) {
                        const mode = (m.measurement as any)?.vbmMode || 'lateral';
                        result = calculateVBM(newPoints, mode, null) || '';
                    } else if (['cl', 'tk', 'll', 'sc'].includes(m.toolKey) && newPoints.length === 4) {
                        const { angle } = calculateSpinalCurvature(newPoints);
                        const prefix = m.toolKey.toUpperCase();
                        result = `${prefix === 'SC' ? 'Angle' : prefix}: ${angle.toFixed(1)}°`;
                    } else if (m.toolKey === 'pelvis' && newPoints.length === 6) {
                        const params = calculatePelvicParameters(newPoints);
                        if (params) {
                            result = `PI: ${params.pi.toFixed(1)}°\nPT: ${params.pt.toFixed(1)}°\nSS: ${params.ss.toFixed(1)}°`;
                        }
                    } else if (m.toolKey === 'pi_ll' && newPoints.length === 8) {
                        const params = calculatePILL(newPoints);
                        if (params) {
                            result = `PI: ${params.pi.toFixed(1)}°\nLL: ${params.ll.toFixed(1)}°\nPI - LL: ${params.mismatch.toFixed(1)}°`;
                        }
                    } else if (m.toolKey === 'spondy' && newPoints.length === 4) {
                        const resultObj = calculateSpondylolisthesis(newPoints, null);
                        if (resultObj) {
                            result = formatSpondylolisthesisResult(resultObj, null);
                        }
                    } else if (m.toolKey === 'stenosis' && newPoints.length >= 3) {
                        const calc = calculateStenosisArea(newPoints, null);
                        if (calc) result = `Area: ${calc.resultString} `;
                    } else if (m.toolKey === 'po' && newPoints.length === 2) {
                        const data = calculatePO(newPoints);
                        if (data) result = `PO: ${data.angle.toFixed(1)}°`;
                    } else if (m.toolKey === 'ts' && newPoints.length === 3) {
                        const data = calculateTS(newPoints, null);
                        if (data) result = data.resultString;
                    } else if (m.toolKey === 'avt' && newPoints.length === 3) {
                        const data = calculateAVT(newPoints, null);
                        if (data) result = data.resultString;
                    } else if (m.toolKey === 'slope' && newPoints.length === 2) {
                        const data = calculateSlope(newPoints);
                        if (data) result = `Slope: ${data.angle.toFixed(1)}°`;
                    } else if (m.toolKey === 'itilt' && newPoints.length === 2) {
                        const data = calculateITilt(newPoints);
                        if (data) {
                            const prefix = m.result.includes('UIV') ? 'UIV Tilt' : (m.result.includes('LIV') ? 'LIV Tilt' : 'Tilt');
                            result = `${prefix}: ${data.angle.toFixed(1)}°`;
                        }
                    } else if (m.toolKey === 'cmc' && newPoints.length >= 4) {
                        const angles = calculateCMC(newPoints);
                        if (angles) result = angles.map((a: number, i: number) => `Cobb ${i + 1}: ${a.toFixed(1)}°`).join('\n');
                    } else if (m.toolKey === 'tpa' && newPoints.length === 7) {
                        const data = calculateTPA(newPoints);
                        if (data) result = `TPA: ${data.angle.toFixed(1)}°`;
                    } else if (m.toolKey === 'spa' && newPoints.length === 7) {
                        const data = calculateSPA(newPoints);
                        if (data) result = `SPA: ${data.angle.toFixed(1)}°`;
                    } else if (['t1spi', 't9spi', 'odha'].includes(m.toolKey) && newPoints.length === 5) {
                        const data = calculateSPi(newPoints);
                        if (data) {
                            const prefix = m.toolKey === 't1spi' ? 'T1SPi' : m.toolKey === 't9spi' ? 'T9SPi' : 'ODHA';
                            result = `${prefix}: ${Math.abs(data.angle).toFixed(1)}°`;
                        }
                    } else if (m.toolKey === 'ssa' && newPoints.length === 3) {
                        const data = calculateSSA(newPoints);
                        if (data) result = `SSA: ${data.angle.toFixed(1)}°`;
                    } else if (m.toolKey === 'cbva' && newPoints.length === 2) {
                        const data = calculateCBVA(newPoints);
                        if (data) result = `CBVA: ${data.angle.toFixed(1)}°`;
                    } else if (m.toolKey === 'rvad' && newPoints.length === 6) {
                        const data = calculateRVAD(newPoints);
                        if (data) result = `Rib Angle R: ${data.rvaR.toFixed(1)}°\nRib Angle L: ${data.rvaL.toFixed(1)}°\nRVAD: ${data.rvad.toFixed(1)}°`;
                    } else if (m.toolKey === 'pencil' && newPoints.length >= 2) {
                        let len = 0;
                        for (let i = 0; i < newPoints.length - 1; i++) len += getDistance(newPoints[i], newPoints[i + 1]);
                        result = `Length: ${len.toFixed(1)} px`;
                    } else if (m.toolKey === 'circle' && newPoints.length === 2) {
                        const r = getDistance(newPoints[0], newPoints[1]) / 2;
                        const d = r * 2;
                        const area = Math.PI * r * r;
                        const perimeter = 2 * Math.PI * r;
                        result = `Area: ${area.toFixed(1)} px²\nPerimeter: ${perimeter.toFixed(1)} px\nDiameter: ${d.toFixed(1)} px`;
                    } else if (m.toolKey === 'ellipse' && newPoints.length === 2) {
                        const p1 = newPoints[0];
                        const p2 = newPoints[1];
                        const rx = Math.abs(p1.x - p2.x) / 2;
                        const ry = Math.abs(p1.y - p2.y) / 2;
                        const area = Math.PI * rx * ry;
                        // Ramanujan approx
                        const h = Math.pow((rx - ry), 2) / Math.pow((rx + ry), 2);
                        const perimeter = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));

                        result = `Area: ${area.toFixed(1)} px²\nPerimeter: ${perimeter.toFixed(1)} px`;
                    } else if (m.toolKey === 'polygon' && newPoints.length >= 3) {
                        const area = getPolygonArea(newPoints);
                        const perim = getPolygonPerimeter(newPoints);
                        result = `Area: ${area.toFixed(1)} px²\nPerimeter: ${perim.toFixed(1)} px`;
                    } else if (['ost-pso', 'ost-spo', 'ost-open', 'ost-resect'].includes(m.toolKey)) {
                        if (m.toolKey === 'ost-resect' && newPoints.length >= 4) {
                            const primitives = calculateResectionPrimitives(newPoints);
                            if (primitives) {
                                result = `Resection: ${Math.abs(primitives.rotationAngleRad * 180 / Math.PI).toFixed(1)}°`;
                            }
                        }
                        const hinge = m.toolKey === 'ost-pso' ? (newPoints[1] || newPoints[0]) : { x: newPoints[0].x + 200, y: newPoints[0].y };
                        const angMoving = Math.atan2(newPoints[0].y - hinge.y, newPoints[0].x - hinge.x);
                        const A = m.toolKey === 'ost-pso' ? newPoints[2] : newPoints[1];
                        if (A && m.toolKey !== 'ost-resect') {
                            const angFixed = Math.atan2(A.y - hinge.y, A.x - hinge.x);
                            let theta = ((angFixed - angMoving + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
                            result = `${m.toolKey === 'ost-open' ? 'Opening' : 'Correction'}: ${Math.abs(theta * 180 / Math.PI).toFixed(1)}°`;
                        }
                    }

                    const newState = await managerRef.current.applyOperation('UPDATE_MEASUREMENT', { id: m.id, points: newPoints, result });
                    if (newState) setMeasurements(newState.data.measurements);
                } else if (selection.type === 'label') {
                    const newState = await managerRef.current.applyOperation('UPDATE_MEASUREMENT', { id: m.id, measurement: { labelPos: worldPos } });
                    if (newState) setMeasurements(newState.data.measurements);
                } else if (selection.type === 'curvatureHandle') {
                    // Calculate new curve offset
                    const m = managerRef.current.current?.data.measurements.find(m => m.id === selection.measurementId);
                    if (m && m.points.length === 4) {
                        const mid1 = getMidpoint(m.points[0], m.points[1]);
                        const mid2 = getMidpoint(m.points[2], m.points[3]);

                        // Vector for chord
                        const chordDx = mid2.x - mid1.x;
                        const chordDy = mid2.y - mid1.y;
                        const dist = Math.sqrt(chordDx * chordDx + chordDy * chordDy);

                        // Midpoint of chord
                        const chordMid = { x: (mid1.x + mid2.x) / 2, y: (mid1.y + mid2.y) / 2 };

                        // Vector from chord mid to mouse
                        const mouseDx = worldPos.x - chordMid.x;
                        const mouseDy = worldPos.y - chordMid.y;

                        // Project mouse vector onto perpendicular of chord
                        const perpX = -chordDy / dist;
                        const perpY = chordDx / dist;

                        // Dot product to get offset
                        const offset = mouseDx * perpX + mouseDy * perpY;

                        const newState = await managerRef.current.applyOperation('UPDATE_MEASUREMENT', {
                            id: m.id,
                            measurement: { ...m.measurement, curveOffset: offset }
                        });
                        if (newState) setMeasurements(newState.data.measurements);
                    }
                }
            }
        }

        if (isPanning && lastPanPos.current) {
            const dx = e.clientX - lastPanPos.current.x;
            const dy = e.clientY - lastPanPos.current.y;
            viewTransformRef.current.x += dx;
            viewTransformRef.current.y += dy;
            lastPanPos.current = { x: e.clientX, y: e.clientY };
        }
    }, [isInteractive, containerRef, managerRef, getWorldPos, activeTool, isDragging, cropRect, selection, setCropRect, setMeasurements, storeCanvas, tempPoints, mouseWorldPosRef, setIsPanning, lastPanPos, viewTransformRef, isCalibrationDialogOpen, isTiltDialogOpen, isTextDialogOpen]);

    const handleMouseUp = async () => {
        if (!isInteractive && !isPanning) return;
        if (activeTool === 'crop' && cropRect && isDragging) {
            const x1 = Math.min(cropRect.start.x, cropRect.current.x);
            const y1 = Math.min(cropRect.start.y, cropRect.current.y);
            const x2 = Math.max(cropRect.start.x, cropRect.current.x);
            const y2 = Math.max(cropRect.start.y, cropRect.current.y);
            const w = x2 - x1;
            const h = y2 - y1;

            if (w > 10 && h > 10) {
                const newPolygon = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
                const frag = managerRef.current?.current?.data.fragments[0];
                if (frag && managerRef.current) {
                    await managerRef.current.applyOperation('UPDATE_FRAGMENT', { id: frag.id, polygon: newPolygon });

                    // Zoom to crop
                    const { clientWidth, clientHeight } = containerRef.current!;
                    const scale = Math.min(clientWidth / w, clientHeight / h) * 0.95;
                    viewTransformRef.current = { k: scale, x: (clientWidth - (x1 + x2) * scale) / 2, y: (clientHeight - (y1 + y2) * scale) / 2 };
                    useAppStore.getState().setZoom(1); // Reset store zoom relative to new k
                }
            }
            setCropRect(null);
            setIsDragging(false);
            setActiveTool(null);
            return;
        }

        if (activeTool === 'pencil' && isDragging && tempPoints.length > 1) {
            let len = 0;
            for (let i = 0; i < tempPoints.length - 1; i++) len += getDistance(tempPoints[i], tempPoints[i + 1]);
            const result = `Length: ${len.toFixed(1)} px`;

            const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: 'pencil', points: tempPoints, result });
            if (newState) setMeasurements(newState.data.measurements);
            setTempPoints([]);
            setIsDragging(false);
            return;
        }

        if ((activeTool === 'circle' || activeTool === 'ellipse') && isDragging && tempPoints.length === 2) {
            const p1 = tempPoints[0];
            const p2 = tempPoints[1];
            let result = '';

            if (activeTool === 'circle') {
                const r = getDistance(p1, p2) / 2;
                const d = r * 2;
                const area = Math.PI * r * r;
                const perimeter = 2 * Math.PI * r;
                result = `Area: ${area.toFixed(1)} px²\nPerimeter: ${perimeter.toFixed(1)} px\nDiameter: ${d.toFixed(1)} px`;
            } else {
                const rx = Math.abs(p1.x - p2.x) / 2;
                const ry = Math.abs(p1.y - p2.y) / 2;
                const area = Math.PI * rx * ry;
                // Ramanujan approx for perimeter
                const h = Math.pow((rx - ry), 2) / Math.pow((rx + ry), 2);
                const perimeter = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));

                result = `Area: ${area.toFixed(1)} px²\nPerimeter: ${perimeter.toFixed(1)} px`;
            }

            const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: activeTool, points: tempPoints, result });
            if (newState) setMeasurements(newState.data.measurements);
            setTempPoints([]);
            setIsDragging(false);
            return;
        }

        if (isDragging) {
            setIsDragging(false);
            setSelection(null);
        }
        setIsPanning(false);
        lastPanPos.current = null;
    };

    useEffect(() => {
        if (activeTool === 'vbm') {
            setTempPoints([]);
        }
    }, [activeTool]);

    const handleWheel = useCallback((e: WheelEvent) => {
        if (!isInteractive) return;
        e.preventDefault();
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Correct zoom-to-mouse:
        // We want the point under the mouse to remain fixed in viewport space.
        const worldPosBefore = getWorldPos(mouseX, mouseY);

        const delta = e.deltaY < 0 ? 1.1 : 0.9;
        const currentZoom = storeCanvas.zoom || 1;
        const newZoom = Math.max(0.1, Math.min(10, currentZoom * delta));

        useAppStore.getState().setZoom(newZoom);

        // After updating zoom, we need to adjust viewTransformRef.current.x/y
        // such that getWorldPos(mouseX, mouseY) still returns worldPosBefore.

        const { k } = viewTransformRef.current;
        const newEk = k * newZoom;
        const rad = (storeCanvas.rotation * Math.PI) / 180;
        const cx = containerRef.current.clientWidth / 2;
        const cy = containerRef.current.clientHeight / 2;

        // Rotate/Flip mouse back
        let tx = mouseX - cx;
        let ty = mouseY - cy;
        if (storeCanvas.flipX) tx = -tx;

        const cos = Math.cos(-rad);
        const sin = Math.sin(-rad);
        const rx = tx * cos - ty * sin + cx;
        const ry = tx * sin + ty * cos + cy;

        // rx = worldPosBefore.x * newEk + newX => newX = rx - worldPosBefore.x * newEk
        viewTransformRef.current.x = rx - worldPosBefore.x * newEk;
        viewTransformRef.current.y = ry - worldPosBefore.y * newEk;
    }, [isInteractive, getWorldPos, storeCanvas.zoom, storeCanvas.rotation, storeCanvas.flipX]);

    // Attach wheel listener with passive: false to allow preventDefault
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const wheelHandler = (e: WheelEvent) => {
            handleWheel(e);
        };

        container.addEventListener('wheel', wheelHandler, { passive: false });
        return () => container.removeEventListener('wheel', wheelHandler);
    }, [handleWheel]);

    const wizardContent = useMemo(() => {
        if (activeTool === 'cobb') {
            if (tempPoints.length === 0) return "Select 1st point of Line 1";
            if (tempPoints.length === 1) return "Select 2nd point of Line 1";
            if (tempPoints.length === 2) return "Select 1st point of Line 2";
            if (tempPoints.length === 3) return "Select 2nd point of Line 2";
        }
        if (['cl', 'tk', 'll', 'sc'].includes(activeTool || '')) {
            const toolName = activeTool?.toUpperCase();
            if (tempPoints.length === 0) return `[${toolName}] Select Superior Endplate(Start)`;
            if (tempPoints.length === 1) return `[${toolName}] Select Superior Endplate(End)`;
            if (tempPoints.length === 2) return `[${toolName}] Select Inferior Endplate(Start)`;
            if (tempPoints.length === 3) return `[${toolName}] Select Inferior Endplate(End)`;
        }
        if (activeTool === 'pelvis') {
            if (tempPoints.length === 0) return "Select Femoral Head 1 (Start of Diameter)";
            if (tempPoints.length === 1) return "Select Femoral Head 1 (End of Diameter)";
            if (tempPoints.length === 2) return "Select Femoral Head 2 (Start of Diameter)";
            if (tempPoints.length === 3) return "Select Femoral Head 2 (End of Diameter)";
            if (tempPoints.length === 4) return "Select S1 Endplate (Anterior)";
            if (tempPoints.length === 5) return "Select S1 Endplate (Posterior)";
        }
        if (activeTool === 'pi_ll') {
            if (tempPoints.length === 0) return "Select Femoral Head 1 (Start of Diameter)";
            if (tempPoints.length === 1) return "Select Femoral Head 1 (End of Diameter)";
            if (tempPoints.length === 2) return "Select Femoral Head 2 (Start of Diameter)";
            if (tempPoints.length === 3) return "Select Femoral Head 2 (End of Diameter)";
            if (tempPoints.length === 4) return "Select S1 Endplate (Anterior)";
            if (tempPoints.length === 5) return "Select S1 Endplate (Posterior)";
            if (tempPoints.length === 6) return "Select L1 Superior Endplate (Anterior)";
            if (tempPoints.length === 7) return "Select L1 Superior Endplate (Posterior)";
        }
        if (['tpa', 'spa'].includes(activeTool || '')) {
            const toolName = activeTool?.toUpperCase();
            if (tempPoints.length === 0) return `[${toolName}] Select Femoral Head 1(Start)`;
            if (tempPoints.length === 1) return `[${toolName}] Select Femoral Head 1(End)`;
            if (tempPoints.length === 2) return `[${toolName}] Select Femoral Head 2(Start)`;
            if (tempPoints.length === 3) return `[${toolName}] Select Femoral Head 2(End)`;
            if (tempPoints.length === 4) return `[${toolName}] Select ${activeTool === 'tpa' ? 'T1' : 'C7'} Centroid`;
            if (tempPoints.length === 5) return `[${toolName}] Select S1 Endplate(Anterior)`;
            if (tempPoints.length === 6) return `[${toolName}] Select S1 Endplate(Posterior)`;
        }
        if (['t1spi', 't9spi', 'odha'].includes(activeTool || '')) {
            const toolName = activeTool?.toUpperCase();
            if (tempPoints.length === 0) return `[${toolName}] Select Femoral Head 1(Start)`;
            if (tempPoints.length === 1) return `[${toolName}] Select Femoral Head 1(End)`;
            if (tempPoints.length === 2) return `[${toolName}] Select Femoral Head 2(Start)`;
            if (tempPoints.length === 3) return `[${toolName}] Select Femoral Head 2(End)`;
            if (tempPoints.length === 4) return `[${toolName}] Select Centroid / Tip`;
        }
        if (activeTool === 'ssa') {
            if (tempPoints.length === 0) return "[SSA] Select C7 Centroid";
            if (tempPoints.length === 1) return "[SSA] Select S1 Endplate (Posterior)";
            if (tempPoints.length === 2) return "[SSA] Select S1 Endplate (Anterior)";
        }
        if (activeTool === 'cbva') {
            if (tempPoints.length === 0) return "[CBVA] Select Chin point";
            if (tempPoints.length === 1) return "[CBVA] Select Brow point";
        }
        if (activeTool === 'sva') {
            if (tempPoints.length === 0) return "Select C7 Vertebral Center";
            if (tempPoints.length === 1) return "Select S1 Posterior Superior Corner";
        }
        if (activeTool === 'vbm') {
            const isLat = vbmMode === 'lateral';
            if (tempPoints.length === 0) return isLat ? "[Lateral] Select Superior-Posterior (Top-Back)" : "[AP] Select Superior-Left (Top-Left)";
            if (tempPoints.length === 1) return isLat ? "[Lateral] Select Superior-Anterior (Top-Front)" : "[AP] Select Superior-Right (Top-Right)";
            if (tempPoints.length === 2) return isLat ? "[Lateral] Select Inferior-Anterior (Bottom-Front)" : "[AP] Select Inferior-Right (Bottom-Right)";
            if (tempPoints.length === 3) return isLat ? "[Lateral] Select Inferior-Posterior (Bottom-Back)" : "[AP] Select Inferior-Left (Bottom-Left)";
        }
        if (activeTool === 'stenosis') {
            if (tempPoints.length === 0) return "Click to start drawing stenosis area";
            if (tempPoints.length < 3) return `Point ${tempPoints.length + 1} - Click to continue`;
            return "Click near start point to close, or continue adding points";
        }
        if (activeTool === 'spondy') {
            if (tempPoints.length === 0) return "Point A - Superior vertebra anterior corner";
            if (tempPoints.length === 1) return "Point B - Superior vertebra posterior corner";
            if (tempPoints.length === 2) return "Point C - Inferior vertebra anterior corner";
            if (tempPoints.length === 3) return "Point D - Inferior vertebra posterior corner";
        }
        if (activeTool === 'calibration') {
            if (tempPoints.length === 0) return "Draw a line of known length (Point 1)";
            if (tempPoints.length === 1) return "Complete the line (Point 2)";
        }
        if (activeTool === 'crop') return "Drag a rectangle to crop";
        if (activeTool === 'point') return "Click anywhere to place a marker";
        if (activeTool === 'po') {
            if (tempPoints.length === 0) return "Select Left Iliac Crest point";
            if (tempPoints.length === 1) return "Select Right Iliac Crest point";
        }
        if (activeTool === 'c7pl') return "Click on the C7 vertebral centroid";
        if (activeTool === 'csvl') {
            if (tempPoints.length === 0) return "Select S1 Endplate (Anterior point)";
            if (tempPoints.length === 1) return "Select S1 Endplate (Posterior point)";
        }
        if (activeTool === 'ts') {
            if (tempPoints.length === 0) return "Select C7 Vertebral Centroid";
            if (tempPoints.length === 1) return "Select S1 Endplate (Left)";
            if (tempPoints.length === 2) return "Select S1 Endplate (Right)";
        }
        if (activeTool === 'avt') {
            if (tempPoints.length === 0) return "Select Apical Vertebra (AV) Centroid";
            if (tempPoints.length === 1) return "Select S1 Endplate (Left)";
            if (tempPoints.length === 2) return "Select S1 Endplate (Right)";
        }
        if (activeTool === 'slope' || activeTool === 'itilt') {
            if (tempPoints.length === 0) return "Select Endplate (Point 1)";
            if (tempPoints.length === 1) return "Select Endplate (Point 2)";
        }
        if (activeTool === 'ost-pso' || activeTool === 'ost-spo') {
            const type = activeTool === 'ost-pso' ? 'PSO' : 'SPO';
            if (tempPoints.length === 0) return `Select ${type} Point A(Posterior)`;
            if (tempPoints.length === 1) return `Select ${type} Point B(Hinge / Anterior)`;
            if (tempPoints.length === 2) return `Select ${type} Point C(Posterior)`;
        }
        if (activeTool === 'ost-open') {
            if (tempPoints.length === 0) return "Select Point A (Upper Ref - Start)";
            if (tempPoints.length === 1) return "Select Point B (Upper Ref - End)";
            if (tempPoints.length === 2) return "Select Point C (Cut Line - Start)";
            if (tempPoints.length === 3) return "Select Point D (Cut Line - End)";
            if (tempPoints.length === 4) return "Select Point E (Lower Ref - Start)";
            if (tempPoints.length === 5) return "Select Point F (Lower Ref - End)";
        }
        if (activeTool === 'cmc') {
            if (tempPoints.length === 0) return "Select Start of Line 1";
            if (tempPoints.length === 1) return "Select End of Line 1";
            const lineNum = Math.floor(tempPoints.length / 2) + 1;
            const isStart = tempPoints.length % 2 === 0;
            return `[CMC] Select ${isStart ? 'Start' : 'End'} of Line ${lineNum} (Right - click to finish)`;
        }
        if (activeTool === 'rvad') {
            if (tempPoints.length === 0) return "Right Rib - Medial Point";
            if (tempPoints.length === 1) return "Right Rib - Lateral Point";
            if (tempPoints.length === 2) return "Left Rib - Medial Point";
            if (tempPoints.length === 3) return "Left Rib - Lateral Point";
            if (tempPoints.length === 4) return "AV Endplate - Right Point";
            if (tempPoints.length === 5) return "AV Endplate - Left Point";
        }
        if (activeTool === 'pencil') return "Draw freehand on the canvas";
        if (activeTool === 'text') return "Click to place text label";
        if (activeTool === 'polygon') return "Click to add points, right click or click start to close";
        if (activeTool === 'circle') return "Drag to draw circle";
        if (activeTool === 'ellipse') return "Drag to draw ellipse";
        if (activeTool === 'angle-2pt') {
            if (tempPoints.length === 0) return "2 pt angle: Select 1st point of the angle";
            if (tempPoints.length === 1) return "2 pt angle: Select 2nd point to complete";
        }
        if (activeTool === 'angle-3pt') {
            if (tempPoints.length === 0) return "3 pt angle: Select Vertex (1st point)";
            if (tempPoints.length === 1) return "3 pt angle: Select 2nd point (Line 1)";
            if (tempPoints.length === 2) return "3 pt angle: Select 3rd point (Line 2)";
        }
        if (activeTool === 'angle-4pt' || activeTool === 'cobb') {
            const prefix = activeTool === 'cobb' ? '4 pt angle' : '4 pt angle';
            if (tempPoints.length === 0) return `${prefix}: Select 1st point of Line 1`;
            if (tempPoints.length === 1) return `${prefix}: Select 2nd point of Line 1`;
            if (tempPoints.length === 2) return `${prefix}: Select 1st point of Line 2`;
            if (tempPoints.length === 3) return `${prefix}: Select 2nd point of Line 2`;
        }

        if (activeTool === 'imp-rod') {
            return tempPoints.length === 0
                ? "Click to place first point for Rod"
                : "Right click to confirm the measurements";
        }

        if (isDragging) return "Adjusting position...";
        return "Select a tool from the sidebar to measure";
    }, [activeTool, tempPoints, isDragging]);

    const expectedPoints = useMemo(() => {
        if (['cobb', 'cl', 'tk', 'll', 'sc', 'spondy', 'angle-4pt'].includes(activeTool || '')) return 4;
        if (activeTool === 'vbm') return 4;
        if (activeTool === 'pelvis' || activeTool === 'rvad') return 6;
        if (activeTool === 'pi_ll') return 8;
        if (activeTool === 'tpa' || activeTool === 'spa') return 7;
        if (['t1spi', 't9spi', 'odha'].includes(activeTool || '')) return 5;
        if (['ost-pso', 'ost-spo'].includes(activeTool || '')) return 3;
        if (activeTool === 'ost-open') return 6;
        if (activeTool === 'ssa') return 3;
        if (activeTool === 'cbva') return 2;
        if (['sva', 'calibration', 'line', 'angle-2pt', 'po', 'csvl', 'slope', 'itilt'].includes(activeTool || '')) return 2;
        if (['angle-3pt', 'ts', 'avt'].includes(activeTool || '')) return 3;
        if (['point', 'c7pl'].includes(activeTool || '')) return 1;
        if (activeTool === 'cmc') return 0; // Dynamic
        return 0;
    }, [activeTool]);



    // Draw crop rect in separate step
    useEffect(() => {
        if (activeTool === 'crop' && cropRect && isDragging) {
            draw(); // force draw to show rect
        }
    }, [cropRect]);

    return (
        <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`w-full h-full bg-black relative overflow-hidden group border-2 transition-all duration-300 ${isComparisonMode ? (isInteractive ? 'border-[#FF453A] shadow-[inset_0_0_40px_rgba(255,69,58,0.08)]' : 'border-border opacity-70 grayscale-[0.3]') : 'border-transparent'}`}        >


            {!currentImage && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                    {/* In comparison mode, left side is auto-populated from the workspace.
                        Show a passive message instead of the import dialog. */}
                    {isComparisonMode && side === 'left' ? (
                        <div className="flex flex-col items-center gap-2 opacity-40">
                            <div className="h-10 w-10 rounded-full bg-[#242427] flex items-center justify-center">
                                <Plus className="h-5 w-5" />
                            </div>
                            <span className="text-xs font-bold uppercase tracking-wider">
                                Loading workspace image…
                            </span>
                        </div>
                    ) : (
                        <ImportDialog targetSide={side}>
                            <Button
                                variant="outline"
                                className={cn(
                                    "group gap-2 py-8 px-8 rounded-2xl flex-col transition-all",
                                    isDark
                                        ? "bg-[#141416] border-[#242427] hover:bg-[#1B1B1E] hover:border-[#3a3a3d] text-[#9CA3AF]"
                                        : "bg-gray-100 border-gray-300 hover:bg-white hover:border-gray-400 text-slate-900"
                                )}
                                onClick={(e) => { e.stopPropagation(); handleCanvasClick(); }}
                            >
                                <div className={cn(
                                    "h-10 w-10 rounded-full flex items-center justify-center transition-all",
                                    isDark
                                        ? "bg-[#242427] group-hover:scale-110 group-hover:bg-[rgba(255,69,58,0.12)]"
                                        : "bg-gray-200 text-slate-600 group-hover:scale-110 group-hover:bg-gray-300"
                                )}>
                                    <Plus className="h-6 w-6" />
                                </div>
                                <span className="text-xs font-bold uppercase tracking-wider">Load Scan {side === 'left' ? 'A' : 'B'}</span>
                            </Button>
                        </ImportDialog>
                    )}
                </div>
            )}


            <div className="absolute inset-0 pointer-events-none opacity-[0.05]"
                style={{
                    backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
                    backgroundSize: '40px 40px'
                }}>
            </div>

            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full block"
                data-side={side}
            />


            {isInteractive && !isComparisonMode && (
                <>
                    {isWizardVisible ? (
                        <div
                            className={cn(
                                "absolute z-20 max-w-md pointer-events-auto select-none",
                                isComparisonMode
                                    ? "bottom-32 left-1/2 -translate-x-1/2"
                                    : "bottom-32 left-6"
                            )}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const elem = e.currentTarget as HTMLElement;
                                const parent = elem.offsetParent as HTMLElement || elem.parentElement as HTMLElement;
                                const parentRect = parent.getBoundingClientRect();
                                const elemRect = elem.getBoundingClientRect();

                                // Calculate where the mouse clicked relative to the element's top-left
                                const mouseOffsetX = e.clientX - elemRect.left;
                                const mouseOffsetY = e.clientY - elemRect.top;

                                const handleMove = (moveEvent: MouseEvent) => {
                                    moveEvent.preventDefault();
                                    // Calculate new position relative to the parent container
                                    let newLeft = moveEvent.clientX - parentRect.left - mouseOffsetX;
                                    let newTop = moveEvent.clientY - parentRect.top - mouseOffsetY;

                                    // Clamp within parent bounds
                                    newLeft = Math.max(0, Math.min(parentRect.width - elemRect.width, newLeft));
                                    newTop = Math.max(0, Math.min(parentRect.height - elemRect.height, newTop));

                                    elem.style.left = `${newLeft}px`;
                                    elem.style.top = `${newTop}px`;
                                    elem.style.transform = 'none';
                                    elem.style.bottom = 'auto';
                                    elem.style.right = 'auto';
                                    elem.style.cursor = 'grabbing';
                                };

                                const handleUp = () => {
                                    elem.style.cursor = 'grab';
                                    document.removeEventListener('mousemove', handleMove);
                                    document.removeEventListener('mouseup', handleUp);
                                };

                                document.addEventListener('mousemove', handleMove);
                                document.addEventListener('mouseup', handleUp);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'grab' }}
                        >
                            <div
                                className="relative rounded-xl overflow-hidden"
                                style={{
                                    backgroundColor: isDark ? '#141416' : '#F9FAFB',
                                    border: isDark ? '1px solid #242427' : '1px solid #E5E7EB',
                                    boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.08)',
                                }}
                            >
                                {/* Close Button */}
                                <button
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setWizardVisible(false);
                                    }}
                                    className="absolute top-2.5 right-3 z-10 w-5 h-5 flex items-center justify-center rounded transition-all duration-150 pointer-events-auto"
                                    style={{ color: isDark ? '#6B7280' : '#64748B' }}
                                    onMouseEnter={(e) => { (e.target as HTMLElement).style.color = isDark ? '#F5F5F7' : '#0F172A'; }}
                                    onMouseLeave={(e) => { (e.target as HTMLElement).style.color = isDark ? '#6B7280' : '#64748B'; }}
                                    title="Close"
                                >
                                    <X className="h-3.5 w-3.5 pointer-events-none" />
                                </button>

                                {/* Content */}
                                <div className="flex items-center gap-3 px-4 py-3 pr-10 pointer-events-auto">

                                    {/* Text */}
                                    <div className="flex-1 min-w-0">
                                        <div
                                            className="text-[10px] font-bold uppercase tracking-[0.08em] mb-0.5"
                                            style={{ color: activeTool ? '#FF453A' : isDark ? '#9CA3AF' : '#2563EB' }}
                                        >
                                            {activeTool ? 'STEP-BY-STEP GUIDE' : 'READY'}
                                        </div>
                                        <div
                                            className="text-[13px] font-semibold leading-snug"
                                            style={{ color: isDark ? '#F5F5F7' : '#0F172A' }}
                                        >
                                            {wizardContent}
                                        </div>

                                        {/* Progress dots */}
                                        {activeTool && expectedPoints > 0 && (
                                            <div className="mt-2.5 flex gap-1.5">
                                                {Array.from({ length: expectedPoints }).map((_, i) => (
                                                    <div
                                                        key={i}
                                                        className="h-1.5 rounded-full transition-all duration-300"
                                                        style={{
                                                            width: tempPoints.length > i ? '28px' : '8px',
                                                            backgroundColor: tempPoints.length > i ? '#FF453A' : isDark ? '#242427' : '#CBD5E1',
                                                            boxShadow: 'none',
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : isWizardIconVisible && (
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                setWizardVisible(true);
                            }}
                            className={cn(
                                "absolute z-20 px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-200 hover:scale-105 pointer-events-auto",
                                isComparisonMode
                                    ? "bottom-32 left-1/2 -translate-x-1/2"
                                    : "bottom-32 left-6"
                            )}
                            style={{
                                backgroundColor: isDark ? '#141416' : '#F9FAFB',
                                border: isDark ? '1px solid #242427' : '1px solid #E5E7EB',
                                color: isDark ? '#F5F5F7' : '#0F172A',
                                boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.08)',
                            }}
                            title="Show Guide"
                        >
                            <AlertCircle className="h-4 w-4 pointer-events-none" style={{ color: '#FF453A' }} />
                            <span className="text-xs font-bold pointer-events-none">Show Guide</span>
                        </button>
                    )}
                </>
            )}

            {/* Removed Loading Spinner for cleaner comparison */}

            <Dialog open={isCalibrationDialogOpen} onOpenChange={(o) => {
                setIsCalibrationDialogOpen(o);
                setActiveDialog(o ? 'calibration' : null);
            }}>
                <DialogContent className={cn(
                    "sm:max-w-md border shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.12)]",
                    isDark
                        ? "!bg-[#141416] !text-[#F5F5F7] !border-[#242427]"
                        : "!bg-[#FFFFFF] !text-slate-900 !border-slate-300"
                )}>
                    <DialogHeader>
                        <DialogTitle className={cn("flex items-center gap-2", isDark ? "text-[#F5F5F7]" : "text-slate-900")}>
                            <Ruler className="h-5 w-5 text-amber-500" />
                            System Calibration
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="mm" className={isDark ? 'text-[#9CA3AF]/80' : 'text-slate-700'}>Known Length (mm)</Label>
                            <Input
                                id="mm"
                                type="number"
                                placeholder="Enter length in mm..."
                                value={calibrationMm}
                                onChange={(e) => setCalibrationMm(e.target.value)}
                                className={cn(isDark ? "!bg-[#0A0A0B] !border-[#242427] !text-[#F5F5F7]" : "!bg-white !border-gray-300 !text-slate-900")}
                                autoFocus
                            />
                        </div>
                        <p className={cn("text-[11px] p-2 rounded-lg italic", isDark ? "text-[#9CA3AF]/80 bg-[#0A0A0B]/60" : "text-slate-600 bg-gray-200")}>
                            This will calibrate all future measurements. The line you just drew will be used as the reference segment.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setIsCalibrationDialogOpen(false);
                                setActiveDialog(null);
                                setCalibrationPoints(null);
                                setCalibrationMm("");
                                setTempPoints([]);
                            }}
                            className={isDark ? 'text-[#9CA3AF] hover:text-[#F5F5F7] hover:bg-[#1B1B1E]' : 'text-slate-700 hover:text-slate-900 hover:bg-gray-200'}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={async () => {
                                if (!calibrationPoints || !calibrationMm) return;

                                const distPx = getDistance(calibrationPoints[0], calibrationPoints[1]);
                                const mmValue = parseFloat(calibrationMm);

                                if (isNaN(mmValue) || mmValue <= 0 || distPx <= 0) return;

                                const ratio = mmValue / distPx;
                                const store = useAppStore.getState();
                                store.setCalibration(ratio);
                                store.convertLegacyPxMeasurementsToMm();
                                store.applyCalibrationToExistingMeasurements();

                                setIsCalibrationDialogOpen(false);
                                setActiveDialog(null);
                                setCalibrationMm("");
                                setCalibrationPoints(null);
                                setActiveTool(null);
                                setTempPoints([]);
                            }}
                            className="bg-[#FF453A] hover:bg-[#e03d33] text-white"
                        >
                            Set Calibration
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isTiltDialogOpen} onOpenChange={(open) => {
                if (!open && !tiltMode) setActiveTool(null);
                setIsTiltDialogOpen(open);
                setActiveDialog(open ? 'tilt' : null);
            }}>
                <DialogContent className={cn("sm:max-w-md", isDark ? "!bg-[#141416] !text-[#F5F5F7] !border-[#242427]" : "!bg-gray-100 !text-slate-900 !border-gray-300")} onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        // Confirm selection
                        setTiltMode(pendingTiltMode || 'UIV');
                        setIsTiltDialogOpen(false);
                    }
                }}>
                    <DialogHeader>
                        <DialogTitle className={cn("flex items-center gap-2", isDark ? 'text-[#F5F5F7]' : 'text-slate-900')}>
                            Instrumented Tilt Classification
                        </DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <p className={cn("text-sm text-center", isDark ? 'text-[#A4A4AC]' : 'text-slate-700')}>Select the type for Instrumented Tilt measurement:</p>
                        <div className="flex gap-4 justify-center">
                            <Button
                                className={cn("w-32 font-bold transition-all", pendingTiltMode === 'UIV' ? 'bg-[#FF453A] hover:bg-[#e03d33] ring-2 ring-[#FF453A]/40 text-white' : isDark ? 'bg-[#1A1A1D] hover:bg-[#242427] text-[#F5F5F7] border border-[#242427]' : 'bg-gray-200 hover:bg-gray-300 text-slate-900 border border-gray-300')}
                                onClick={() => setPendingTiltMode('UIV')}
                            >
                                UIV (Upper)
                            </Button>
                            <Button
                                className={cn("w-32 font-bold transition-all", pendingTiltMode === 'LIV' ? 'bg-[#FF453A] hover:bg-[#e03d33] ring-2 ring-[#FF453A]/40 text-white' : isDark ? 'bg-[#1A1A1D] hover:bg-[#242427] text-[#F5F5F7] border border-[#242427]' : 'bg-gray-200 hover:bg-gray-300 text-slate-900 border border-gray-300')}
                                onClick={() => setPendingTiltMode('LIV')}
                            >
                                LIV (Lower)
                            </Button>
                        </div>
                        <p className={cn("text-[10px] text-center", isDark ? 'text-[#6C6C74]' : 'text-slate-600')}>
                            UIV: Upper Instrumented Vertebra | LIV: Lower Instrumented Vertebra
                        </p>
                    </div>
                    <DialogFooter>
                        <Button
                            className="w-full bg-[#FF453A] hover:bg-[#e03d33] text-white font-semibold"
                            onClick={() => {
                                setTiltMode(pendingTiltMode || 'UIV');
                                setIsTiltDialogOpen(false);
                            }}
                        >
                            Start Placement
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isTextDialogOpen} onOpenChange={(open) => {
                setIsTextDialogOpen(open);
                setActiveDialog(open ? 'text' : null);
            }}>
                <DialogContent className={cn(isDark ? "!bg-[#141416] !text-[#F5F5F7] !border-[#242427]" : "!bg-gray-100 !text-slate-900 !border-gray-300")}>
                    <DialogHeader>
                        <DialogTitle className={isDark ? 'text-[#F5F5F7]' : 'text-slate-900'}>Enter Text Label</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="Enter label text..."
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            onKeyDown={async (e) => {
                                if (e.key === 'Enter') {
                                    if (textInput && textToolPos) {
                                        const { k } = viewTransformRef.current;
                                        const ek = k * (storeCanvas.zoom || 1);
                                        const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', {
                                            toolKey: 'text',
                                            points: [textToolPos],
                                            result: textInput,
                                            measurement: { labelPos: { x: textToolPos.x + 40 / ek, y: textToolPos.y - 40 / ek } }
                                        });
                                        if (newState) setMeasurements(newState.data.measurements);
                                    }
                                    setTempPoints([]);
                                    setTextInput('');
                                    setTextToolPos(null);
                                    setIsTextDialogOpen(false);
                                    setActiveTool(null);
                                }
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTextDialogOpen(false)}>Cancel</Button>
                        <Button onClick={async () => {
                            if (textInput && textToolPos) {
                                const { k } = viewTransformRef.current;
                                const ek = k * (storeCanvas.zoom || 1);
                                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', {
                                    toolKey: 'text',
                                    points: [textToolPos],
                                    result: textInput,
                                    measurement: { labelPos: { x: textToolPos.x + 40 / ek, y: textToolPos.y - 40 / ek } }
                                });
                                if (newState) setMeasurements(newState.data.measurements);
                            }
                            setTempPoints([]);
                            setTextInput('');
                            setTextToolPos(null);
                            setIsTextDialogOpen(false);
                            setActiveTool(null);
                        }}>Add Label</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Implant Properties Panel Removed - Moved to Sidebar */}
        </div>
    );
};

export default CanvasWorkspace;

