import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useAppStore } from "@/lib/store/index";
import { isReadOnlyCase } from '@/lib/access';
import { CanvasManager, Point, Measurement } from "@/lib/canvas/CanvasManager";
import { measurementsDiffer, syncManagerMeasurements } from "@/lib/canvas/measurementSync";
import {
    isPointInPolygon,
    getDistance,
    getMidpoint,
    getHipAxisCenter,
    getPolygonArea,
    getPolygonPerimeter
} from "@/lib/canvas/GeometryUtils";
import { calculateCobbAngle } from "@/features/measurements/quick/CobbAngle";
import { calculateVBM, VBMMode } from "@/features/measurements/quick/VBM";
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
    AlertCircle, Ruler, X
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { EmptyImport } from "../import-export/EmptyImport";
import {
    drawWedgeOsteotomy,
    calculateOpenOsteotomyPrimitives,
    drawDeformedSuperiorSegment,
    drawResection
} from "@/features/measurements/planning/PlanningTools";
import {
    drawScrew,
    drawRod,
    drawCage,
    drawPlate,
    getImplantHandleSpecs,
    hitTestImplant,
} from "@/features/measurements/planning/ImplantRenderer";

import { renderScene } from "@/lib/canvas/renderScene";
import { useShallow } from "zustand/react/shallow";
import { drawLabel, drawPoint, getLabelRegions, STYLE, toolColor } from "@/lib/canvas/annotationStyle";
import { autoFillLandmarks, collectLandmarks, landmarkCount } from "@/features/measurements/landmarks";
import { computeMeasurementResult } from "@/features/measurements/results";
import { useSettings } from "@/lib/settings";
import { shortcutsBlocked } from "@/lib/keyboard";
import { imageScans } from "@/lib/studies";
import { useLocation } from "react-router-dom";
import { getSavedPlans, isPlanMeasurement } from "@/features/planning2d/plan";
import { WORKING_PLAN } from "@/lib/store/comparisonSlice";

/** Tools whose clicks snap onto existing measurement points (landmark reuse, UI5-08). */
const NO_SNAP_TOOLS = new Set(['crop', 'pencil', 'circle', 'ellipse', 'text', 'imp-screw', 'imp-cage', 'imp-plate', 'imp-rod', 'calibration']);
const SNAP_PX = 9;

interface ViewTransform {
    k: number;
    x: number;
    y: number;
}

interface CanvasWorkspaceProps {
    side?: 'left' | 'right';
}

/** First-run guide: calibrate before measuring. Disappears once calibrated. */
const CalibrationPrompt = ({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) => (
    <div
        className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-[380px] max-w-[calc(100%-32px)] rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl shadow-2xl p-4"
        onMouseDown={(e) => e.stopPropagation()}
    >
        <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl grid place-items-center bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                <Ruler className="h-4 w-4" />
            </div>
            <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text)]">Calibrate this image first</div>
                <p className="text-xs text-[var(--text-3)] mt-1 leading-relaxed">
                    Distances are only accurate in millimetres after calibration. Click the two ends of something with a known
                    length (calibration marker or ruler), then type its real length.
                </p>
                <div className="flex gap-2 mt-3">
                    <Button size="sm" className="h-8 text-xs" onClick={onStart}>Start calibration</Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs text-[var(--text-3)]" onClick={onSkip}>Skip for now</Button>
                </div>
            </div>
        </div>
    </div>
);

const CanvasWorkspace = ({ side }: CanvasWorkspaceProps) => {
    // Subscribe only to what the canvas uses — a whole-store subscription
    // re-rendered both canvases on every unrelated store change (UI5-04).
    const store = useAppStore(useShallow((s) => ({
        activeTool: s.activeTool, setActiveTool: s.setActiveTool,
        undoTrigger: s.undoTrigger, redoTrigger: s.redoTrigger,
        isComparisonMode: s.isComparisonMode, setActiveDialog: s.setActiveDialog,
        activeCanvasSide: s.activeCanvasSide, setActiveCanvasSide: s.setActiveCanvasSide,
        setComparisonMeasurements: s.setComparisonMeasurements, setComparisonImplants: s.setComparisonImplants,
        setMeasurements: s.setMeasurements, setImplants: s.setImplants,
        isWizardVisible: s.isWizardVisible, setWizardVisible: s.setWizardVisible, isWizardIconVisible: s.isWizardIconVisible,
        managers: s.managers, registerManager: s.registerManager,
        contexts: s.contexts, activeContextId: s.activeContextId, contextStates: s.contextStates,
        comparison: s.comparison, canvas: s.canvas, currentImage: s.currentImage,
        measurements: s.measurements, implants: s.implants, patients: s.patients,
        setCurrentImage: s.setCurrentImage, inspectionMode: s.inspectionMode, updateContextState: s.updateContextState,
    })));
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
        registerManager
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
        if (side === 'right') {
            return store.comparison[side].canvas;
        }
        return store.canvas;
    }, [isComparisonMode, side, store.comparison, store.canvas]);

    const currentImage = useMemo(() => {
        if (side === 'right') {
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
            const studyId = activeContext.studyIds[0];
            const study = patient?.studies?.find(s => s.id === studyId);
            const studyImage = study ? imageScans(study)[0]?.imageUrl : undefined;
            if (studyImage) return studyImage;
        }

        return null;
    }, [isComparisonMode, side, store.comparison, store.currentImage, activeContextState, activeContext, store.patients]);

    useEffect(() => {
        if (side !== 'right' && currentImage !== store.currentImage) {
            store.setCurrentImage(currentImage);
        }
    }, [currentImage, isComparisonMode, store.currentImage, store]);

    const storeMeasurements = useMemo(() => {
        if (side === 'right') {
            return store.comparison[side].measurements;
        }
        if (activeContextState) {
            return activeContextState.measurements;
        }
        return store.measurements;
    }, [isComparisonMode, side, store.comparison, store.measurements, activeContextState]);

    const storeImplants = useMemo(() => {
        if (side === 'right') {
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

        if (side === 'right') {
            setComparisonMeasurements('right', measurements);
            setComparisonImplants('right', implants);
        } else if (store.activeContextId) {
            // Include currentImage so the active scan URL is persisted alongside measurements
            // Saves are serialized + coalesced per context in the store.
            void store.updateContextState(store.activeContextId, {
                measurements,
                implants,
                ...(store.currentImage ? { currentImage: store.currentImage } : {}),
            });
        } else {
            storeSetMeasurements(measurements);
            storeSetImplants(implants);
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

    // Image A (left) IS the case; only Image B (right) is a separate pane.
    const paneSide: 'left' | 'right' = side === 'right' ? 'right' : 'left';
    const isInteractive = !isComparisonMode || activeCanvasSide === paneSide;
    // Compare (UI12-02): a pane showing a plan version is drawn in planning view
    // and is read-only — assessment works on "No plan" images only.
    const comparePlanId = isComparisonMode
        ? (side === 'right' ? (store.comparison.right.source?.planId ?? null) : (store.comparison.left.planId ?? null))
        : null;
    const comparePlan = useMemo(() => {
        if (!comparePlanId || side === 'right' || comparePlanId === WORKING_PLAN) return null;
        return getSavedPlans(activeContextState?.toolState).find((p) => p.id === comparePlanId) ?? null;
    }, [comparePlanId, side, activeContextState]);
    const paneLocked = !!comparePlanId && (side === 'right' || comparePlanId === WORKING_PLAN || !!comparePlan);
    // View-only case (shared view / org admin): pan & zoom only (UI12-10)
    const readOnlyCase = useAppStore((s) => isReadOnlyCase(s) || !!s.inspectionMode?.active);
    const canEdit = isInteractive && !paneLocked && !readOnlyCase;

    const handleCanvasClick = useCallback(() => {
        if (isComparisonMode) setActiveCanvasSide(paneSide);
    }, [isComparisonMode, paneSide, setActiveCanvasSide]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const managerRef = useRef<CanvasManager | null>(null);
    const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

    const [managerReady, setManagerReady] = useState(false);

    // Undo / redo — one path for Ctrl+Z / Ctrl+Y and the toolbar (UI6-01).
    // Measurements, implants and osteotomy cuts all live in the manager's
    // history, so a step restores all of them; the store follows.
    const lastUndoRef = useRef(undoTrigger);
    const lastRedoRef = useRef(redoTrigger);
    const historyStepRef = useRef<(dir: 'undo' | 'redo') => void>(() => {});
    historyStepRef.current = (dir) => {
        const mgr = managerRef.current;
        if (!mgr) return;
        const st = dir === 'undo' ? mgr.undo() : mgr.redo();
        if (!st) return;
        syncStoreWithCanvas(st.data.measurements, st.data.implants);
        setSelection(null);
        dirtyRef.current = true;
    };

    useEffect(() => {
        if (canEdit && managerReady && undoTrigger > lastUndoRef.current) historyStepRef.current('undo');
        lastUndoRef.current = undoTrigger;
    }, [undoTrigger, managerReady, canEdit]);

    useEffect(() => {
        if (canEdit && managerReady && redoTrigger > lastRedoRef.current) historyStepRef.current('redo');
        lastRedoRef.current = redoTrigger;
    }, [redoTrigger, managerReady, canEdit]);

    // View State
    const viewTransformRef = useRef<ViewTransform>({ k: 1, x: 0, y: 0 });
    /** Zoom value the view transform currently accounts for (see the zoom effect) */
    const zoomAppliedRef = useRef<number>(storeCanvas.zoom || 1);
    const [isPanning, setIsPanning] = useState(false);
    const lastPanPos = useRef<{ x: number, y: number } | null>(null);

    // Tool/Interaction State
    const [tempPoints, setTempPoints] = useState<Point[]>([]);
    const selection = useAppStore((s) => s.selection);
    const setSelection = useAppStore((s) => s.setSelection);
    // Render only when something changed (UI5-04); see the rAF loop below.
    const dirtyRef = useRef(true);
    const isDraggingRef = useRef(false);
    const dragMovedRef = useRef(false);
    /** Measurement points moved together with the grabbed one (shared landmark). */
    const linkedPointsRef = useRef<{ id: string; index: number }[]>([]);
    const labelGrabOffsetRef = useRef<Point>({ x: 0, y: 0 });
    const [reusedCount, setReusedCount] = useState(0);
    const sceneKey = side === 'right' ? 'right' : 'main';
    // Assessment shows the preop case; Planning shows the plan on the cut image (UI9-05).
    const location = useLocation();
    const canvasView: 'assessment' | 'planning' =
        location.pathname === '/workspace' && new URLSearchParams(location.search).get('tab') === 'planning' && side !== 'right'
            ? 'planning' : 'assessment';
    const sceneView: 'assessment' | 'planning' = paneLocked ? 'planning' : canvasView;
    /** Measurements that can be edited in this view (preop in Assessment, plan items in Planning). */
    const editableHere = (m: Measurement) => (canvasView === 'planning' ? isPlanMeasurement(m) : !isPlanMeasurement(m));
    const [isDragging, setIsDragging] = useState(false);
    const [cropRect, setCropRect] = useState<{ start: Point; current: Point } | null>(null);
    const [isCalibrationDialogOpen, setIsCalibrationDialogOpen] = useState(false);
    const [calibrationPoints, setCalibrationPoints] = useState<[Point, Point] | null>(null);
    const [calibrationMm, setCalibrationMm] = useState("");
    const isVBMDialogOpen = false; // VBM plane is picked in the sidebar

    // Calibration onboarding: shown until the image is calibrated or the user
    // skips it (remembered per study in toolState, per image when untitled).
    const [skippedImages, setSkippedImages] = useState<Set<string>>(new Set());
    const calibrationSkipped = !!activeContextState?.toolState?.calibrationSkipped
        || (!!currentImage && skippedImages.has(currentImage));
    const skipCalibration = () => {
        const st = useAppStore.getState();
        if (st.activeContextId) {
            const ctx = st.contextStates.find(c => c.contextId === st.activeContextId);
            void st.updateContextState(st.activeContextId, { toolState: { ...(ctx?.toolState ?? {}), calibrationSkipped: true } });
        }
        if (currentImage) setSkippedImages((prev) => new Set(prev).add(currentImage));
    };
    // VBM plane comes from the sidebar (no dialog) — item 3 of UI batch.
    const vbmMode = useAppStore(s => s.vbmMode) as VBMMode;
    const mouseWorldPosRef = useRef<Point>({ x: 0, y: 0 });
    const lastWorldPosRef = useRef<Point>({ x: 0, y: 0 });
    // UIV/LIV is picked inline in the sidebar under "Instr. Level".
    const isTiltDialogOpen = false;
    const tiltMode = useAppStore(s => s.tiltMode);
    const [isTextDialogOpen, setIsTextDialogOpen] = useState(false);
    const [textInput, setTextInput] = useState("");
    const [textToolPos, setTextToolPos] = useState<Point | null>(null);



    const getWorldPos = useCallback((mouseX: number, mouseY: number) => {
        if (!containerRef.current) return { x: 0, y: 0 };

        const { k, x, y } = viewTransformRef.current;
        // Live zoom from the store: wheel events can outrun re-renders (CV-25).
        const st = useAppStore.getState();
        const ek = k * (((side === 'right' ? st.comparison.right.canvas : st.canvas).zoom) || 1);
        const rad = (storeCanvas.rotation * Math.PI) / 180;

        const cx = containerRef.current.clientWidth / 2;
        const cy = containerRef.current.clientHeight / 2;

        // draw() applies: translate(c) · rotate · flip · translate(-c).
        // Inverse = un-rotate first, THEN un-flip (BUGS CV-04).
        const tx = mouseX - cx;
        const ty = mouseY - cy;
        const cos = Math.cos(-rad);
        const sin = Math.sin(-rad);
        let ux = tx * cos - ty * sin;
        const uy = tx * sin + ty * cos;
        if (storeCanvas.flipX) ux = -ux;
        const rx = ux + cx;
        const ry = uy + cy;

        // 3. Un-translate and Un-scale
        return {
            x: (rx - x) / ek,
            y: (ry - y) / ek
        };
    }, [side, storeCanvas.rotation, storeCanvas.flipX]);

    // Resize Handling
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry && canvasRef.current) {
                const { width, height } = entry.contentRect;
                const dpr = window.devicePixelRatio || 1;
                canvasRef.current.width = Math.round(width * dpr);
                canvasRef.current.height = Math.round(height * dpr);
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
        img.onload = () => { dirtyRef.current = true; };
        img.src = url;
        img.onerror = (e) => console.error(`[CanvasWorkspace] Image failed to load: ${url}`, e);
        imageCacheRef.current.set(url, img);
        return img;
    }, []);

    // View Sync: Handle deletions from external sources (like RightSidebar)
    useEffect(() => {
        if (managerRef.current && managerReady) {
            const currentManagerMeasurements = managerRef.current.current?.data.measurements || [];
            if (currentManagerMeasurements.length > storeMeasurements.length) {
                const storeIds = new Set(storeMeasurements.map(m => m.id));
                const toDelete = currentManagerMeasurements.find(m => !storeIds.has(m.id));
                if (toDelete) {
                    managerRef.current.applyOperation('DELETE_MEASUREMENT', { id: toDelete.id });
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
    }, [storeMeasurements, storeImplants, managerReady]);

    useEffect(() => {
        // A newer image (or unmount) supersedes this init (BUGS RPT-02).
        let cancelled = false;
        const init = async () => {
            if (currentImage) {
                const mgrKey = side === 'right' ? 'right' : 'main';
                let mgr = managers[mgrKey];

                // Only reuse a manager that this CanvasWorkspace instance already owns.
                // managerRef.current is null on every fresh mount (React ref is recreated),
                // so the guard cannot fire after navigation — fresh initialization always runs.
                // Within the same mount, managerRef.current === mgr, so intra-session reuse
                // still works (e.g., when measurements update without changing the image).
                if (mgr && (mgr as any)._baseImage === currentImage && managerRef.current === mgr) {
                        const managerMeasurements = mgr.current?.data.measurements || [];
                    // Hydrate canvas FROM store/context — never overwrite persisted data with stale manager state
                    if (measurementsDiffer(managerMeasurements, storeMeasurements)) {
                        syncManagerMeasurements(mgr, storeMeasurements);
                    }
                    setManagerReady(true);
                    return;
                }

                mgr = new CanvasManager();
                const initialState = await mgr.initialize(currentImage, storeMeasurements);
                if (cancelled) return;

                // Add initial implants to the first state if any exist in store
                if (storeImplants.length > 0) {
                    initialState.data.implants = storeImplants.map(i => ({ ...i }));
                }

                (mgr as any)._baseImage = currentImage;
                managerRef.current = mgr;
                registerManager(mgrKey, mgr);

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
        init().catch((e) => console.error('[CanvasWorkspace] init failed', e));
        return () => { cancelled = true; };
    }, [currentImage, side, registerManager]);

    // Re-hydrate canvas overlays when context measurements arrive after async load
    useEffect(() => {
        if (!managerRef.current || !managerReady || !currentImage) {
            return;
        }
        // Mid-drag the manager is ahead of the store (synced on mouseup).
        if (isDraggingRef.current) return;

        const managerMeasurements = managerRef.current.current?.data.measurements ?? [];
        if (measurementsDiffer(managerMeasurements, storeMeasurements)) {
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

        // Draw in CSS pixels on a devicePixelRatio-sized backing store (BUGS CV-21).
        const dpr = canvas.width / Math.max(1, containerRef.current.clientWidth);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.save();

        // VIEW INTEGRATION: Centers global rotation/flip around viewport center
        ctx.translate(cx, cy);
        ctx.rotate(rad);
        if (storeCanvas.flipX) ctx.scale(-1, 1);
        ctx.translate(-cx, -cy);

        // PAN & ZOOM
        ctx.translate(x, y);
        ctx.scale(ek, ek);

        // Image A showing a saved plan: preop + that plan, never the working plan's edits
        const sceneData = comparePlan
            ? { ...state.data, measurements: [...state.data.measurements.filter((m) => !isPlanMeasurement(m)), ...comparePlan.measurements], implants: comparePlan.implants }
            : state.data;
        renderScene(ctx, sceneData, {
            ek,
            getImage: getCachedImage,
            brightness: storeCanvas.brightness,
            contrast: storeCanvas.contrast,
            sharpness: storeCanvas.sharpness,
            displayRatio: storeCanvas.calibrationApplied ? storeCanvas.pixelToMm : null,
            calibrationEnabledAt: storeCanvas.calibrationEnabledAt,
            selectedImplantId: selection?.type === 'implant' || selection?.type === 'implant-point' ? selection.measurementId : null,
            labelScene: sceneKey,
            hideUnselected: true,
            view: sceneView,
        });

        const isAnyDialogOpen = isCalibrationDialogOpen || isVBMDialogOpen || isTiltDialogOpen || isTextDialogOpen;

        // LIVE PREVIEW — same colours / widths / points as finished measurements (UI5-07)
        if (tempPoints.length > 0 && !isAnyDialogOpen) {
            ctx.save();
            const color = toolColor(activeTool);
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = STYLE.line / ek;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            const wPos = mouseWorldPosRef.current;
            const pts = [...tempPoints, wPos];
            const dashed = (on: boolean) => ctx.setLineDash(on ? STYLE.dash.map((d) => d / ek) : []);

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
                drawWedgeOsteotomy(ctx, tempM, ek);
            } else if (activeTool === 'ost-resect' && pts.length === 4) {
                drawResection(ctx, tempM, ek);
            }

            // 2. Lines based on tool type
            ctx.beginPath();
            if (activeTool === 'vbm') {
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                if (pts.length === 4) ctx.closePath();
            } else if (['pelvis', 'pi_ll', 'tpa', 'spa', 't1spi', 't9spi', 'odha'].includes(activeTool || '')) {
                // Femoral heads (circles through the two diameter clicks)
                for (const i of [0, 2]) {
                    if (pts.length >= i + 2) {
                        const c = getMidpoint(pts[i], pts[i + 1]);
                        const r = getDistance(pts[i], pts[i + 1]) / 2;
                        ctx.moveTo(c.x + r, c.y); ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
                    }
                }
                const pairs = activeTool === 'pelvis' ? [4] : activeTool === 'pi_ll' ? [4, 6] : ['tpa', 'spa'].includes(activeTool || '') ? [5] : [];
                pairs.forEach((i) => {
                    if (pts.length >= i + 2) { ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); }
                });
                const single = ['tpa', 'spa', 't1spi', 't9spi', 'odha'].includes(activeTool || '') ? 4 : -1;
                if (single > 0 && pts.length > single) {
                    const hip = getHipAxisCenter(pts.slice(0, 4));
                    if (hip) { ctx.moveTo(hip.x, hip.y); ctx.lineTo(pts[single].x, pts[single].y); }
                }
            } else if (['cobb', 'cl', 'tk', 'll', 'sc', 'spondy', 'angle-4pt', 'ost-resect'].includes(activeTool || '')) {
                ctx.moveTo(pts[0].x, pts[0].y);
                ctx.lineTo(pts[1].x, pts[1].y);
                if (pts.length >= 4) { ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y); }
            } else if (['sva', 'line', 'calibration', 'stenosis', 'po', 'csvl', 'slope', 'cbva', 'itilt', 'angle-2pt', 'angle-3pt', 'polygon', 'ssa'].includes(activeTool || '')) {
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            } else if (['ts', 'avt'].includes(activeTool || '')) {
                if (pts.length >= 3) { ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y); }
                else if (pts.length === 2) { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); }
            } else if (activeTool === 'cmc') {
                for (let i = 0; i + 1 < pts.length; i += 2) { ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); }
            } else if (['imp-screw', 'imp-cage', 'imp-plate'].includes(activeTool || '')) {
                if (pts.length >= 2) {
                    const type = activeTool!.replace('imp-', '');
                    const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * (180 / Math.PI);
                    const length = getDistance(pts[0], pts[1]);
                    const pxPerMm = mmToPx();
                    if (type === 'screw') drawScrew(ctx, pts[0], angle, { length, diameter: 6.5 * pxPerMm }, ek, 'rgba(255, 255, 255, 0.5)');
                    if (type === 'cage') drawCage(ctx, pts[0], angle, { width: length, height: 10 * pxPerMm, wedgeAngle: 6 }, ek, 'rgba(255, 255, 255, 0.5)');
                    if (type === 'plate') drawPlate(ctx, pts[0], angle, { width: 16 * pxPerMm, height: length, holes: 4 }, ek, 'rgba(255, 255, 255, 0.5)');
                }
            } else if (activeTool === 'imp-rod') {
                drawRod(ctx, pts, ek, 5.5 * mmToPx(), 'rgba(255, 255, 255, 0.5)');
            } else if (activeTool === 'text') {
                ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(wPos.x, wPos.y);
            } else if (activeTool === 'pencil' && pts.length > 2) {
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length - 1; i++) ctx.lineTo(pts[i].x, pts[i].y);
            } else if (activeTool === 'circle' && tempPoints.length >= 2) {
                const c = getMidpoint(tempPoints[0], tempPoints[1]);
                const r = getDistance(tempPoints[0], tempPoints[1]) / 2;
                ctx.moveTo(c.x + r, c.y); ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
            } else if (activeTool === 'ellipse' && tempPoints.length >= 2) {
                const c = getMidpoint(tempPoints[0], tempPoints[1]);
                ctx.ellipse(c.x, c.y, Math.abs(tempPoints[0].x - tempPoints[1].x) / 2, Math.abs(tempPoints[0].y - tempPoints[1].y) / 2, 0, 0, Math.PI * 2);
            }
            ctx.stroke();

            // Dashed helpers: SVA plumb, CSVL offset for TS / AVT
            if (activeTool === 'sva' && pts.length >= 2) {
                dashed(true);
                ctx.beginPath(); ctx.moveTo(pts[1].x, pts[1].y - 200 / ek); ctx.lineTo(pts[1].x, pts[1].y + 60 / ek); ctx.stroke();
                dashed(false);
            } else if (['ts', 'avt'].includes(activeTool || '') && pts.length >= 3) {
                const mid = getMidpoint(pts[1], pts[2]);
                dashed(true);
                ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(mid.x, pts[0].y); ctx.stroke();
                dashed(false);
            }

            // 3. Points (cursor point is drawn smaller)
            if (!['pencil', 'circle', 'ellipse', 'imp-rod', 'imp-screw', 'imp-cage', 'imp-plate'].includes(activeTool || '')) {
                tempPoints.forEach((p) => drawPoint(ctx, p, ek, color));
                drawPoint(ctx, wPos, ek, color, 0.7);
            }

            // 4. Live angle while placing the second line of 4-point tools
            if (['cobb', 'angle-4pt', 'cl', 'tk', 'll', 'sc'].includes(activeTool || '') && pts.length === 4) {
                const preview = computeMeasurementResult(activeTool!, pts) ?? '';
                drawLabel(ctx, preview, { x: wPos.x + 14 / ek, y: wPos.y - 14 / ek }, ek, color);
            }
            ctx.restore();
        }

        // Snap ring: hovering an existing point while placing reuses it (UI5-08)
        if (activeTool && !NO_SNAP_TOOLS.has(activeTool) && !isAnyDialogOpen) {
            const snap = findSnapPoint(mouseWorldPosRef.current, ek);
            if (snap) {
                ctx.save();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5 / ek;
                ctx.beginPath();
                ctx.arc(snap.x, snap.y, 8 / ek, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
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

        ctx.restore(); // Final balance
    }, [storeCanvas, getCachedImage, activeTool, tempPoints, cropRect, isDragging, mouseWorldPosRef, selection, vbmMode, tiltMode, managerReady, isCalibrationDialogOpen, isVBMDialogOpen, isTiltDialogOpen, isTextDialogOpen, canvasView, sceneView, comparePlan]);

    useEffect(() => {
        let rafId: number;
        // Redraw only when the scene, view or canvas size changed, or something
        // flagged dirtyRef — idle frames cost nothing (UI5-04).
        let last = { state: null as unknown, k: NaN, x: NaN, y: NaN, w: -1, h: -1 };
        dirtyRef.current = true;
        // Schedule first, then draw: one exception must not kill the loop (RPT-15).
        const loop = () => {
            rafId = requestAnimationFrame(loop);
            const c = canvasRef.current;
            const state = managerRef.current?.current ?? null;
            const { k, x, y } = viewTransformRef.current;
            const w = c?.width ?? 0, h = c?.height ?? 0;
            if (!dirtyRef.current && state === last.state && k === last.k && x === last.x && y === last.y && w === last.w && h === last.h) return;
            last = { state, k, x, y, w, h };
            dirtyRef.current = false;
            try {
                draw();
            } catch (e) {
                console.error('[CanvasWorkspace] draw failed', e);
            }
        };
        loop();
        return () => cancelAnimationFrame(rafId);
    }, [draw]);

    useEffect(() => {
        const resize = () => {
            if (containerRef.current && canvasRef.current) {
                const dpr = window.devicePixelRatio || 1;
                canvasRef.current.width = Math.round(containerRef.current.clientWidth * dpr);
                canvasRef.current.height = Math.round(containerRef.current.clientHeight * dpr);
            }
        }
        window.addEventListener('resize', resize);
        resize();
        return () => window.removeEventListener('resize', resize);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!canEdit) return;
            // Never hijack typing, dialogs, or the Report tab (canvas hidden there)
            if (shortcutsBlocked(e)) return;

            const key = e.key.toLowerCase();
            const mod = e.ctrlKey || e.metaKey;
            const isUndoShortcut = mod && !e.shiftKey && key === 'z';
            const isRedoShortcut = mod && (key === 'y' || (e.shiftKey && key === 'z'));

            if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.type === 'implant' && managerRef.current) {
                e.preventDefault();
                const id = selection.measurementId;
                managerRef.current.applyOperation('DELETE_IMPLANT', { id }).then((st) => {
                    if (st) syncStoreWithCanvas(st.data.measurements, st.data.implants);
                });
                setSelection(null);
                return;
            }
            if (e.key === 'Escape') {
                // Cancel the in-progress tool / selection.
                setTempPoints([]);
                setCropRect(null);
                setActiveTool(null);
                setSelection(null);
                return;
            }
            if (e.key === 'Enter' && activeTool === 'polygon' && tempPoints.length >= 3) {
                // Close polygon on Enter
                if (managerRef.current) {
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
                // While placing, Ctrl+Z removes the last clicked point first.
                if (tempPoints.length > 0) setTempPoints(prev => prev.slice(0, -1));
                else historyStepRef.current('undo');
                return;
            }
            if (isRedoShortcut) {
                e.preventDefault();
                e.stopPropagation();
                historyStepRef.current('redo');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [tempPoints, setMeasurements, setActiveTool, canEdit, activeTool, selection, syncStoreWithCanvas, setSelection]);

    // New tool: start from the landmarks earlier measurements already placed
    // (UI5-08). If every landmark is known, the measurement is created at once.
    useEffect(() => {
        const mgr = managerRef.current;
        const total = landmarkCount(activeTool);
        if (!activeTool || !isInteractive || !mgr?.current || total === 0 || !useSettings.getState().reuseLandmarks) {
            setTempPoints([]);
            setReusedCount(0);
            return;
        }
        const existing = mgr.current.data.measurements;
        let filled = autoFillLandmarks(activeTool, [], collectLandmarks(existing));
        // Re-selecting a tool whose measurement already exists on exactly these
        // landmarks starts a fresh placement instead of creating a duplicate.
        const duplicate = filled.length === total && existing.some((m) =>
            m.toolKey === activeTool && m.points.length === total &&
            m.points.every((p, i) => Math.abs(p.x - filled[i].x) < 0.01 && Math.abs(p.y - filled[i].y) < 0.01));
        if (duplicate) filled = [];
        setReusedCount(filled.length);
        if (filled.length < total) {
            setTempPoints(filled);
            return;
        }
        setTempPoints([]);
        const toolKey = activeTool;
        void mgr.applyOperation('ADD_MEASUREMENT', {
            toolKey,
            points: filled,
            result: computeMeasurementResult(toolKey, filled) ?? '',
        }).then((s) => {
            syncStoreWithCanvas(s.data.measurements, s.data.implants);
            setActiveTool(null);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTool]);

    /** Begin a drag: one undo step for the whole drag (BUGS CV-07). */
    const startDrag = () => {
        managerRef.current?.beginHistoryTransaction('drag');
        isDraggingRef.current = true;
        dragMovedRef.current = false;
        setIsDragging(true);
    };

    /** Nearest existing measurement point within the snap radius (landmark reuse). */
    const findSnapPoint = (p: Point, ek: number): Point | null => {
        if (!useSettings.getState().snapToPoints) return null;
        const ms = managerRef.current?.current?.data.measurements ?? [];
        let best: Point | null = null;
        let bestD = SNAP_PX / ek;
        for (const m of ms) {
            if (m.measurement?.isCalibration || m.selected === false || !editableHere(m)) continue;
            for (const q of m.points) {
                const d = getDistance(p, q);
                if (d < bestD) { bestD = d; best = q; }
            }
        }
        return best ? { x: best.x, y: best.y } : null;
    };

    /** Points for the next click: the click itself plus any landmarks already known. */
    const nextTemp = (wp: Point): Point[] => useSettings.getState().reuseLandmarks
        ? autoFillLandmarks(activeTool, [...tempPoints, wp], collectLandmarks(managerRef.current?.current?.data.measurements ?? []))
        : [...tempPoints, wp];

    /** px per mm for new implants: calibration, else assume a ~300 mm field of view. */
    const mmToPx = () => {
        if (storeCanvas.calibrationApplied && storeCanvas.pixelToMm) return 1 / storeCanvas.pixelToMm;
        const w = managerRef.current?.current?.data.fragments[0]?.imageWidth ?? 1500;
        return w / 300;
    };

    /**
     * Mouse model (UI8-01): LEFT = every action (place, select, drag, edit);
     * RIGHT drag (or middle drag) = pan, always — even mid-placement;
     * wheel = zoom. A right CLICK (no movement) still finishes multi-point
     * tools (polygon, canal area, CMC, rod) — it is replayed from mouseup.
     */
    const panStartRef = useRef<{ x: number; y: number; button: number } | null>(null);

    const handleMouseDown = async (e: React.MouseEvent, opts?: { rightClick?: boolean }) => {
        handleCanvasClick();

        if (e.button === 1 || (e.button === 2 && !opts?.rightClick)) {
            e.preventDefault(); // no browser autoscroll / context menu
            panStartRef.current = { x: e.clientX, y: e.clientY, button: e.button };
            setIsPanning(true);
            lastPanPos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        if (!canEdit || isVBMDialogOpen || isTiltDialogOpen || isTextDialogOpen) return;
        // A replayed right-click only finishes multi-click tools — never selects or
        // starts a drag (its mouseup already happened → drag stuck to the cursor; UI11-28)
        if (opts?.rightClick && !['cmc', 'stenosis', 'polygon', 'imp-rod'].includes(activeTool || '')) return;

        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const rawPos = getWorldPos(e.clientX - rect.left, e.clientY - rect.top);
        lastWorldPosRef.current = rawPos;
        const { k } = viewTransformRef.current;
        const ek = k * (storeCanvas.zoom || 1);
        const currentState = managerRef.current?.current;
        // Placing a point on an existing one reuses it exactly (UI5-08).
        const worldPos = activeTool && !NO_SNAP_TOOLS.has(activeTool) ? (findSnapPoint(rawPos, ek) ?? rawPos) : rawPos;

        if (activeTool === 'crop') {
            if (e.button !== 0) return;
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
            if (newTemp.length === 2) {
                let result = '';
                if (activeTool === 'po') {
                    const data = calculatePO(newTemp);
                    result = data ? `PO: ${data.angle.toFixed(1)}°` : '';
                } else if (activeTool === 'slope') {
                    const data = calculateSlope(newTemp);
                    result = data ? `Slope: ${data.angle.toFixed(1)}°` : '';
                } else if (activeTool === 'itilt') {
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
            const newTemp = nextTemp(worldPos);
            const maxPts = activeTool === 'ost-open' ? 6 : activeTool === 'ost-resect' ? 4 : 3;
            if (newTemp.length < maxPts) {
                setTempPoints(newTemp);
                return;
            }
            // The cut is rendered from the measurement itself (lib/canvas/osteotomyPieces):
            // one measurement = one undo step, saved with the case (UI6-01 / UI6-04).
            const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', {
                toolKey: activeTool,
                points: newTemp,
                result: computeMeasurementResult(activeTool!, newTemp)
                    ?? (activeTool === 'ost-open' ? `Opening: ${Math.abs(calculateOpenOsteotomyPrimitives(newTemp).phi * 180 / Math.PI).toFixed(1)}°` : ''),
            });
            if (newState) setMeasurements(newState.data.measurements);
            setTempPoints([]);
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
            const newTemp = nextTemp(worldPos);
            if (newTemp.length === 4) {
                const result = computeMeasurementResult(activeTool, newTemp) ?? '';
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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
            const newTemp = nextTemp(worldPos);
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

                // Sizes in mm converted with the calibration (fallback ≈ 300 mm field of view).
                const pxPerMm = mmToPx();
                const properties: any = { length, diameter: 6.5 * pxPerMm };
                if (type === 'cage') { properties.width = length; properties.height = 10 * pxPerMm; properties.wedgeAngle = 6; }
                if (type === 'plate') { properties.width = 16 * pxPerMm; properties.height = length; properties.holes = 4; }

                const newState = await managerRef.current?.applyOperation('ADD_IMPLANT', {
                    type,
                    position: newTemp[0],
                    angle,
                    properties,
                    fragmentId
                });
                if (newState) {
                    syncStoreWithCanvas(newState.data.measurements, newState.data.implants);
                    // Select the new implant so it can be edited right away
                    const added = newState.data.implants[newState.data.implants.length - 1];
                    if (added) setSelection({ type: 'implant', measurementId: added.id });
                }
                setTempPoints([]);
                // One implant per tool use: further clicks edit, never add (UI5-03).
                setActiveTool(null);
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
                        properties: { points: tempPoints, diameter: 5.5 * mmToPx() }
                    });
                    if (newState) {
                        syncStoreWithCanvas(newState.data.measurements, newState.data.implants);
                        const added = newState.data.implants[newState.data.implants.length - 1];
                        if (added) setSelection({ type: 'implant', measurementId: added.id });
                    }
                    setTempPoints([]);
                    setActiveTool(null);
                }
                return;
            }
            if (e.button !== 0) return;
            setTempPoints([...tempPoints, worldPos]);
            return;
        }

        if (currentState) {
            // Implants belong to the plan: only editable in Planning
            const imps = canvasView === 'planning' ? currentState.data.implants : [];
            // 1. Handles of the selected implant win (so short screws' tips are grabbable)
            const selImp = selection && (selection.type === 'implant' || selection.type === 'implant-point')
                ? imps.find(i => i.id === selection.measurementId) : null;
            if (selImp) {
                const hs = getImplantHandleSpecs(selImp);
                for (let i = 0; i < hs.length; i++) {
                    if (getDistance(worldPos, hs[i].p) < 9 / ek) {
                        if (hs[i].kind === 'move') setSelection({ type: 'implant', measurementId: selImp.id });
                        else setSelection({ type: 'implant-point', measurementId: selImp.id, pointIndex: i });
                        startDrag();
                        return;
                    }
                }
            }
            // 2. Implant bodies, topmost first (exact silhouette hit test)
            for (let i = imps.length - 1; i >= 0; i--) {
                if (hitTestImplant(imps[i], worldPos, ek)) {
                    setSelection({ type: 'implant', measurementId: imps[i].id });
                    startDrag();
                    return;
                }
            }

            // Hidden measurements (eye off in the panel) can't be grabbed.
            const ms = currentState.data.measurements.filter((m) => !m.measurement?.isCalibration && m.selected !== false && editableHere(m));
            // 3. Measurement points (nearest wins). Points shared with other
            //    measurements (reused landmarks) move together.
            let hitM: Measurement | null = null;
            let hitI = -1;
            let hitD = 12 / ek;
            for (const m of ms) {
                for (let i = 0; i < m.points.length; i++) {
                    const d = getDistance(worldPos, m.points[i]);
                    if (d < hitD) { hitD = d; hitM = m; hitI = i; }
                }
            }
            if (hitM) {
                const m = hitM, i = hitI;
                const grabbed = m.points[i];
                linkedPointsRef.current = [];
                for (const other of ms) {
                    other.points.forEach((p, j) => {
                        if (Math.abs(p.x - grabbed.x) < 0.01 && Math.abs(p.y - grabbed.y) < 0.01) {
                            linkedPointsRef.current.push({ id: other.id, index: j });
                        }
                    });
                }
                setSelection({ type: 'point', measurementId: m.id, pointIndex: i });
                startDrag();
                return;
            }

            // 4. Curvature handles (CL / TK / LL / custom curve)
            for (const m of ms) {
                const hp = (m.measurement as any)?.handlePos;
                if (['cl', 'tk', 'll', 'sc'].includes(m.toolKey) && hp && getDistance(worldPos, hp) < 12 / ek) {
                    setSelection({ type: 'curvatureHandle', measurementId: m.id });
                    startDrag();
                    return;
                }
            }

            // 5. Labels — exact boxes recorded while drawing (topmost first)
            const regions = getLabelRegions(sceneKey);
            for (let mi = ms.length - 1; mi >= 0; mi--) {
                const r = regions.get(ms[mi].id)?.find((b) =>
                    worldPos.x >= b.x && worldPos.x <= b.x + b.w && worldPos.y >= b.y && worldPos.y <= b.y + b.h);
                if (r) {
                    labelGrabOffsetRef.current = { x: worldPos.x - r.anchor.x, y: worldPos.y - r.anchor.y };
                    setSelection({ type: 'label', measurementId: ms[mi].id });
                    startDrag();
                    return;
                }
            }
        }

        // Empty canvas: left click deselects (panning is the right button)
        if (!activeTool && selection) setSelection(null);
    };

    const handleMouseMove = useCallback(async (e: React.MouseEvent) => {
        if (!canEdit && !isPanning) return;

        if (isCalibrationDialogOpen || isVBMDialogOpen || isTiltDialogOpen || isTextDialogOpen) {
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
        // Previews, snap rings and drags follow the cursor.
        if (activeTool || isDragging) dirtyRef.current = true;

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

        // Drags edit the canvas manager only; the store (and the server save) is
        // updated once on mouseup (UI5-04).
        if (isDragging && selection && managerRef.current) {
            const mgr = managerRef.current;
            dragMovedRef.current = true;
            if (selection.type === 'implant') {
                await mgr.applyOperation('MOVE_IMPLANT', { id: selection.measurementId, deltaX: dwx, deltaY: dwy });
                return;
            }
            if (selection.type === 'implant-point') {
                const imp = mgr.current?.data.implants.find(i => i.id === selection.measurementId);
                const spec = imp ? getImplantHandleSpecs(imp)[selection.pointIndex ?? -1] : undefined;
                if (!imp || !spec) return;
                const pos = imp.position;
                // Distance across the implant axis (for diameter / height / lordosis).
                const rad = (imp.angle * Math.PI) / 180;
                const ux = Math.cos(rad), uy = Math.sin(rad);
                const across = pos ? -(worldPos.x - pos.x) * uy + (worldPos.y - pos.y) * ux : 0;
                const minSize = mmToPx(); // 1 mm
                let update: any = null;
                if (spec.kind === 'vertex' && imp.properties?.points) {
                    const pts = imp.properties.points.map((p: Point) => ({ ...p }));
                    pts[selection.pointIndex!] = worldPos;
                    update = { properties: { points: pts } };
                } else if (spec.kind === 'tip' && pos) {
                    update = {
                        angle: Math.atan2(worldPos.y - pos.y, worldPos.x - pos.x) * (180 / Math.PI),
                        // never shorter than the drawn silhouette (2 × diameter) — UI11-32
                        properties: { length: Math.max(getDistance(pos, worldPos), minSize * 5, 2 * (imp.properties?.diameter ?? 0)) },
                    };
                } else if (spec.kind === 'diameter') {
                    update = { properties: { diameter: Math.max(Math.abs(across) * 2, minSize) } };
                } else if (spec.kind === 'height' && pos) {
                    update = imp.type === 'plate'
                        ? { properties: { height: Math.max(getDistance(pos, worldPos) * 2, minSize * 5) } }
                        : { properties: { height: Math.max(Math.abs(across) * 2, minSize) } };
                } else if (spec.kind === 'width' && pos) {
                    update = {
                        angle: Math.atan2(worldPos.y - pos.y, worldPos.x - pos.x) * (180 / Math.PI),
                        properties: { width: Math.max(getDistance(pos, worldPos) * 2, minSize * 3) },
                    };
                } else if (spec.kind === 'lordosis') {
                    // Anterior height from the handle → wedge angle over the footprint.
                    const w = Math.max(imp.properties.width, 1);
                    const hAnt = Math.max(Math.abs(across) * 2, imp.properties.height);
                    const wedge = Math.atan((hAnt - imp.properties.height) / w) * (180 / Math.PI);
                    update = { properties: { wedgeAngle: Math.round(Math.min(30, Math.max(0, wedge))) } };
                }
                if (update) await mgr.applyOperation('UPDATE_IMPLANT', { id: imp.id, ...update });
                return;
            }

            const m = mgr.current?.data.measurements.find(m => m.id === selection.measurementId);
            if (!m) return;
            if (selection.type === 'point' && selection.pointIndex !== undefined) {
                const linked = linkedPointsRef.current.length
                    ? linkedPointsRef.current
                    : [{ id: m.id, index: selection.pointIndex }];
                const byId = new Map<string, number[]>();
                linked.forEach(({ id, index }) => byId.set(id, [...(byId.get(id) ?? []), index]));
                const updates: { id: string; points: Point[]; result?: any }[] = [];
                byId.forEach((indices, id) => {
                    const target = mgr.current?.data.measurements.find(x => x.id === id);
                    if (!target) return;
                    const pts = target.points.map((p) => ({ ...p }));
                    indices.forEach((ix) => { pts[ix] = { ...worldPos }; });
                    updates.push({ id, points: pts, result: computeMeasurementResult(target.toolKey, pts, target) ?? target.result });
                });
                await mgr.applyOperation('UPDATE_MEASUREMENTS', { updates });
            } else if (selection.type === 'label') {
                const off = labelGrabOffsetRef.current;
                await mgr.applyOperation('UPDATE_MEASUREMENT', { id: m.id, measurement: { labelPos: { x: worldPos.x - off.x, y: worldPos.y - off.y } } });
            } else if (selection.type === 'curvatureHandle' && m.points.length === 4) {
                const mid1 = getMidpoint(m.points[0], m.points[1]);
                const mid2 = getMidpoint(m.points[2], m.points[3]);
                const dist = getDistance(mid1, mid2) || 1;
                const chordMid = getMidpoint(mid1, mid2);
                // Offset of the mouse along the chord's perpendicular
                const offset = (worldPos.x - chordMid.x) * (-(mid2.y - mid1.y) / dist) + (worldPos.y - chordMid.y) * ((mid2.x - mid1.x) / dist);
                await mgr.applyOperation('UPDATE_MEASUREMENT', { id: m.id, measurement: { ...m.measurement, curveOffset: offset } });
            }
            return;
        }

        if (isPanning && lastPanPos.current) {
            const dx = e.clientX - lastPanPos.current.x;
            const dy = e.clientY - lastPanPos.current.y;
            viewTransformRef.current.x += dx;
            viewTransformRef.current.y += dy;
            lastPanPos.current = { x: e.clientX, y: e.clientY };
        }
    }, [canEdit, containerRef, managerRef, getWorldPos, activeTool, isDragging, cropRect, selection, setCropRect, setMeasurements, storeCanvas, tempPoints, mouseWorldPosRef, setIsPanning, lastPanPos, viewTransformRef, isCalibrationDialogOpen, isVBMDialogOpen, isTiltDialogOpen, isTextDialogOpen]);

    const handleMouseUp = async (e?: React.MouseEvent) => {
        // End of a right/middle press: a right press that barely moved is a click
        // (finishes polygon / canal area / CMC / rod); otherwise it was a pan.
        const pan = panStartRef.current;
        if (pan) {
            panStartRef.current = null;
            setIsPanning(false);
            lastPanPos.current = null;
            const moved = e ? Math.hypot(e.clientX - pan.x, e.clientY - pan.y) : Infinity;
            if (e && e.type === 'mouseup' && pan.button === 2 && moved < 5) void handleMouseDown(e, { rightClick: true });
            return;
        }
        if (!canEdit && !isPanning) return;
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
                    zoomAppliedRef.current = 1;
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
            // A click without dragging made a zero-size shape (and NaN perimeter) — UI11-30
            const ek = viewTransformRef.current.k * (storeCanvas.zoom || 1);
            if (getDistance(tempPoints[0], tempPoints[1]) >= 3 / ek) {
                const result = computeMeasurementResult(activeTool, tempPoints) ?? '';
                const newState = await managerRef.current?.applyOperation('ADD_MEASUREMENT', { toolKey: activeTool, points: tempPoints, result });
                if (newState) setMeasurements(newState.data.measurements);
            }
            setTempPoints([]);
            setIsDragging(false);
            return;
        }

        if (isDragging) {
            setIsDragging(false);
            isDraggingRef.current = false;
            linkedPointsRef.current = [];
            managerRef.current?.commitHistoryTransaction();
            // Persist the final geometry once per drag (UI5-04).
            const mgrData = managerRef.current?.current?.data;
            if (mgrData && dragMovedRef.current) syncStoreWithCanvas(mgrData.measurements, mgrData.implants);
            dragMovedRef.current = false;
            if (selection && (selection.type === 'implant' || selection.type === 'implant-point')) {
                setSelection({ type: 'implant', measurementId: selection.measurementId });
            } else {
                setSelection(null);
            }
        }
        setIsPanning(false);
        lastPanPos.current = null;
    };

    const handleWheel = useCallback((e: WheelEvent) => {
        if (!isInteractive) return;
        e.preventDefault();
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Touchpad (UI8-01): two-finger swipe pans, pinch (sent as ctrl+wheel) zooms.
        // A mouse wheel sends whole notches (deltaY ≈ ±100, no deltaX) and zooms.
        const isPinch = e.ctrlKey;
        // Mouse wheels send big vertical notches (≈100, ≈90.9 at 110% browser zoom);
        // integrality was unreliable at non-100% zoom (UI11-31).
        const looksLikeTouchpad = e.deltaMode === 0 && (e.deltaX !== 0 || Math.abs(e.deltaY) < 50);
        if (!isPinch && looksLikeTouchpad) {
            viewTransformRef.current.x -= e.deltaX;
            viewTransformRef.current.y -= e.deltaY;
            return;
        }

        // Zoom about the cursor: the point under the mouse stays fixed.
        const worldPosBefore = getWorldPos(mouseX, mouseY);

        // Read the live zoom (rapid wheel events would otherwise reuse a stale value — CV-25).
        const st = useAppStore.getState();
        const liveCanvas = side === 'right' ? st.comparison.right.canvas : st.canvas;
        const currentZoom = liveCanvas.zoom || 1;
        const factor = isPinch ? Math.exp(-e.deltaY * 0.01) : (e.deltaY < 0 ? 1.1 : 1 / 1.1);
        const newZoom = Math.max(0.1, Math.min(10, currentZoom * factor));

        zoomAppliedRef.current = newZoom; // the wheel anchors at the cursor itself
        useAppStore.getState().setZoom(newZoom);

        // After updating zoom, we need to adjust viewTransformRef.current.x/y
        // such that getWorldPos(mouseX, mouseY) still returns worldPosBefore.

        const { k } = viewTransformRef.current;
        const newEk = k * newZoom;
        const rad = (storeCanvas.rotation * Math.PI) / 180;
        const cx = containerRef.current.clientWidth / 2;
        const cy = containerRef.current.clientHeight / 2;

        // Un-rotate then un-flip (same inverse as getWorldPos — CV-04)
        const tx = mouseX - cx;
        const ty = mouseY - cy;
        const cos = Math.cos(-rad);
        const sin = Math.sin(-rad);
        let ux = tx * cos - ty * sin;
        const uy = tx * sin + ty * cos;
        if (storeCanvas.flipX) ux = -ux;
        const rx = ux + cx;
        const ry = uy + cy;

        // rx = worldPosBefore.x * newEk + newX => newX = rx - worldPosBefore.x * newEk
        viewTransformRef.current.x = rx - worldPosBefore.x * newEk;
        viewTransformRef.current.y = ry - worldPosBefore.y * newEk;
    }, [isInteractive, getWorldPos, side, storeCanvas.rotation, storeCanvas.flipX]);

    // Zoom changed elsewhere (toolbar slider, reset): keep the view CENTRE fixed,
    // not the image's top-left corner (UI11-38).
    useEffect(() => {
        const z = storeCanvas.zoom || 1;
        const prev = zoomAppliedRef.current;
        zoomAppliedRef.current = z;
        if (prev === z || !containerRef.current) return;
        const { k, x, y } = viewTransformRef.current;
        const cx = containerRef.current.clientWidth / 2, cy = containerRef.current.clientHeight / 2;
        const wx = (cx - x) / (k * prev), wy = (cy - y) / (k * prev);
        viewTransformRef.current = { k, x: cx - wx * k * z, y: cy - wy * k * z };
    }, [storeCanvas.zoom]);

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
        if (activeTool === 'll') {
            if (tempPoints.length === 0) return "[LL] L1 superior endplate (anterior)";
            if (tempPoints.length === 1) return "[LL] L1 superior endplate (posterior)";
            if (tempPoints.length === 2) return "[LL] S1 endplate (anterior)";
            if (tempPoints.length === 3) return "[LL] S1 endplate (posterior)";
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
            if (tempPoints.length === 0) return "3 pt angle: Click a point on the 1st arm";
            if (tempPoints.length === 1) return "3 pt angle: Click the vertex";
            if (tempPoints.length === 2) return "3 pt angle: Click a point on the 2nd arm";
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
            onContextMenu={(e) => e.preventDefault()}
            className={`w-full h-full bg-black relative overflow-hidden group transition-all duration-300 ${isComparisonMode && !isInteractive ? 'opacity-70 grayscale-[0.3]' : ''}`}        >


            {paneLocked && currentImage && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-[11px] text-white/85 pointer-events-none whitespace-nowrap">
                    Plan view · read-only — choose “No plan” to measure
                </div>
            )}
            {!currentImage && !isComparisonMode && (
                <div className="absolute inset-0 flex items-center justify-center z-20 bg-[var(--bg-2)]" onMouseDown={(e) => e.stopPropagation()}>
                    <EmptyImport
                        title="Import the study image"
                        hint="Choose an X-ray or a CT/MR series for this study."
                        autoOpen={new URLSearchParams(location.search).get('import') === '1'}
                    />
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
            />


            {side !== 'right' && !isComparisonMode && managerReady && currentImage && !storeCanvas.calibrationApplied && activeTool !== 'calibration' && !calibrationSkipped && (
                <CalibrationPrompt
                    onStart={() => setActiveTool('calibration')}
                    onSkip={skipCalibration}
                />
            )}

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
                                        {activeTool && reusedCount > 0 && tempPoints.length >= reusedCount && (
                                            <div className="text-[11px] mt-1" style={{ color: isDark ? '#9CA3AF' : '#64748B' }}>
                                                {reusedCount} landmark{reusedCount > 1 ? 's' : ''} reused from earlier measurements
                                            </div>
                                        )}

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
                if (!o) { setTempPoints([]); setCalibrationPoints(null); } // BUGS CV-18
            }}>
                <DialogContent className={cn(
                    "sm:max-w-md border",
                    isDark
                        ? ""
                        : ""
                )}>
                    <DialogHeader>
                        <DialogTitle className={cn("flex items-center gap-2", isDark ? "" : "")}>
                            <Ruler className="h-5 w-5 text-amber-500" />
                            System Calibration
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="mm" className={isDark ? 'text-[#9CA3AF]/80' : 'text-[var(--text-2)]'}>Known Length (mm)</Label>
                            <Input
                                id="mm"
                                type="number"
                                placeholder="Enter length in mm..."
                                value={calibrationMm}
                                onChange={(e) => setCalibrationMm(e.target.value)}
                                className={cn(isDark ? "!bg-[#0A0A0B] !border-[#242427] !text-[#F5F5F7]" : "!bg-[var(--surface)] !border-[var(--border)] !text-[var(--text)]")}
                                autoFocus
                            />
                        </div>
                        <p className={cn("text-[11px] p-2 rounded-lg italic", isDark ? "text-[#9CA3AF]/80 bg-[#0A0A0B]/60" : "text-[var(--text-2)] bg-[var(--surface-2)]")}>
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
                            className={isDark ? 'text-[#9CA3AF] hover:text-[#F5F5F7] hover:bg-[#1B1B1E]' : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'}
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
                                useAppStore.getState().setCalibration(ratio);

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

            <Dialog open={isTextDialogOpen} onOpenChange={(open) => {
                setIsTextDialogOpen(open);
                setActiveDialog(open ? 'text' : null);
            }}>
                <DialogContent className={cn(isDark ? "" : "")}>
                    <DialogHeader>
                        <DialogTitle className={isDark ? '' : ''}>Enter Text Label</DialogTitle>
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

