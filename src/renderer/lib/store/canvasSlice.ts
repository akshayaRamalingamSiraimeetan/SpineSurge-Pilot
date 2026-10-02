import { StateCreator } from 'zustand';
import { Measurement } from './types';
import type { AppState } from './index';
import { resolveActiveMeasurements, syncManagerMeasurements } from '@/lib/canvas/measurementSync';
import { defaultCanvas } from './caseState';
import { persistImageB } from './comparisonSlice';

export { syncManagerMeasurements } from '@/lib/canvas/measurementSync';

export interface InspectionMode {
    active:       boolean;
    ownerName:    string;        // display name of the member being inspected
    ownerUserId:  string;        // userId of the member
    orgId:        string;        // the org this inspection is for
    studyId:      string;        // the specific study being inspected
    patientId:    string;        // the synthetic patient id
    contextId:    string | null; // the synthetic context id if any
}

export interface CanvasSlice {
    currentImage: string | null;
    // File behind a local blob: currentImage that has no study to upload to
    // yet (untitled Quick Use). Uploaded when the session becomes a study.
    pendingImageFile: File | null;
    canvas: {
        zoom: number;
        rotation: number;
        brightness: number;
        contrast: number;
        sharpness: number;
        flipX: boolean;
        pan: { x: number; y: number };
        pixelToMm: number | null;
        calibrationApplied: boolean;
        calibrationEnabledAt: number | null;
    };
    activeTool: string | null;
    /** VBM plane, chosen inline under the tool: sagittal ('lateral') or coronal ('ap'). */
    vbmMode: 'lateral' | 'ap';
    setVbmMode: (mode: 'lateral' | 'ap') => void;
    /** Instr. Level tool: upper or lower instrumented vertebra. */
    tiltMode: 'UIV' | 'LIV';
    setTiltMode: (mode: 'UIV' | 'LIV') => void;
    selection: {
        type: 'point' | 'label' | 'curvatureHandle' | 'implant' | 'implant-point';
        measurementId: string;
        pointIndex?: number;
    } | null;
    measurements: Measurement[];
    implants: any[];
    undoTrigger: number;
    redoTrigger: number;
    isRightSidebarOpen: boolean;
    isLeftSidebarOpen: boolean;
    isToolbarDocked: boolean;
    isWizardVisible: boolean;
    isWizardIconVisible: boolean;
    activeDialog: string | null;
    managers: Record<string, any>;

    // ── Inspection mode (admin reads another user's study) ─────────────────
    inspectionMode: InspectionMode | null;
    setInspectionMode: (mode: InspectionMode | null) => void;

    loadImage: (imageUrl: string) => void;
    loadLocalImage: (file: File) => void;
    setCurrentImage: (imageUrl: string | null) => void;
    clearImage: () => void;
    setActiveTool: (toolId: string | null) => void;
    setSelection: (selection: { type: 'point' | 'label' | 'curvatureHandle' | 'implant' | 'implant-point'; measurementId: string; pointIndex?: number } | null) => void;
    setZoom: (zoom: number) => void;
    setRotation: (rotation: number) => void;
    setBrightness: (brightness: number) => void;
    setContrast: (contrast: number) => void;
    setSharpness: (sharpness: number) => void;
    toggleFlipX: () => void;
    setPan: (x: number, y: number) => void;
    resetCanvas: () => void;
    undo: () => void;
    redo: () => void;
    setMeasurements: (measurements: Measurement[]) => void;
    setImplants: (implants: any[]) => void;
    deleteMeasurement: (id: string) => void;
    deleteImplant: (id: string) => void;
    toggleMeasurementSelection: (id: string, selected: boolean) => void;
    toggleRightSidebar: (isOpen?: boolean) => void;
    toggleLeftSidebar: (isOpen?: boolean) => void;
    toggleToolbarDock: () => void;
    setToolbarDocked: (docked: boolean) => void;
    toggleWizard: () => void;
    setWizardVisible: (visible: boolean) => void;
    setWizardIconVisible: (visible: boolean) => void;
    toggleWizardIcon: () => void;
    setActiveDialog: (dialogId: string | null) => void;
    setCalibration: (pixelToMm: number | null) => void;
    setCalibrationApplied: (applied: boolean) => void;
    applyCalibrationToExistingMeasurements: () => void;
    convertLegacyPxMeasurementsToMm: () => number;
    registerManager: (side: string, manager: any) => void;
    getManager: (side: string) => any;
}

const convertPxResultToMm = (result: unknown, ratio: number): { result: unknown; changed: boolean } => {
    if (typeof result !== 'string') {
        return { result, changed: false };
    }

    let changed = false;

    // Convert area units first so the subsequent px conversion does not partially consume px² tokens.
    const withAreaConverted = result.replace(/(-?\d+(?:\.\d+)?)\s*px²/gi, (_, raw: string) => {
        const value = Number.parseFloat(raw);
        if (!Number.isFinite(value)) {
            return _;
        }
        changed = true;
        return `${(value * ratio * ratio).toFixed(1)} mm²`;
    });

    const withDistanceConverted = withAreaConverted.replace(/(-?\d+(?:\.\d+)?)\s*px\b/gi, (_, raw: string) => {
        const value = Number.parseFloat(raw);
        if (!Number.isFinite(value)) {
            return _;
        }
        changed = true;
        return `${(value * ratio).toFixed(1)} mm`;
    });

    return { result: withDistanceConverted, changed };
};

/** Store the active context's calibration in its toolState (BUGS WS-08). */
const persistCalibration = (get: () => AppState) => {
    const state = get();
    if (isPaneB(state)) { persistImageB(get); return; }
    if (!state.activeContextId) return;
    const ctx = state.contextStates.find(c => c.contextId === state.activeContextId);
    const { pixelToMm, calibrationApplied, calibrationEnabledAt } = state.canvas;
    state.updateContextState(state.activeContextId, {
        toolState: { ...(ctx?.toolState ?? {}), calibration: { pixelToMm, calibrationApplied, calibrationEnabledAt } },
    });
};

/** Compare's Image B pane is the only canvas with separate state; Image A is the case. */
const isPaneB = (s: { isComparisonMode: boolean; activeCanvasSide: 'left' | 'right' }) =>
    s.isComparisonMode && s.activeCanvasSide === 'right';

export const createCanvasSlice: StateCreator<AppState, [], [], CanvasSlice> = (set, get) => ({
    currentImage: null,
    pendingImageFile: null,
    canvas: {
        zoom: 1,
        rotation: 0,
        brightness: 100,
        contrast: 100,
        sharpness: 0,
        flipX: false,
        pan: { x: 0, y: 0 },
        pixelToMm: null,
        calibrationApplied: false,
        calibrationEnabledAt: null
    },
    activeTool: null,
    vbmMode: 'lateral',
    setVbmMode: (vbmMode) => set({ vbmMode }),
    tiltMode: 'UIV',
    setTiltMode: (tiltMode) => set({ tiltMode }),
    selection: null,
    measurements: [],
    implants: [],
    undoTrigger: 0,
    redoTrigger: 0,
    isRightSidebarOpen: true,
    isLeftSidebarOpen: true,
    isToolbarDocked: false,
    isWizardVisible: true,
    isWizardIconVisible: true,
    activeDialog: null,
    managers: {},
    inspectionMode: null,

    // A new image invalidates the previous image's view AND calibration.
    loadImage: (imageUrl: string) => set({
        currentImage: imageUrl,
        pendingImageFile: null,
        isDicomMode: false,
        dicomSeries: [],
        activeTool: null,
        selection: null,
        canvas: defaultCanvas(),
    }),
    loadLocalImage: (file: File) => {
        get().loadImage(URL.createObjectURL(file));
        set({ pendingImageFile: file });
    },
    setCurrentImage: (imageUrl: string | null) => set({ currentImage: imageUrl }),
    // Does NOT touch inspectionMode — callers that leave inspection call
    // setInspectionMode(null) explicitly (BUGS NAV-01).
    clearImage: () => set({ currentImage: null, pendingImageFile: null, isDicomMode: false, dicomSeries: [], activeTool: null, selection: null }),

    setActiveTool: (toolId) => set({ activeTool: toolId }),
    setSelection: (selection) => set({ selection }),
    setZoom: (zoom) => set((state) => {
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            return {
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], canvas: { ...state.comparison[side].canvas, zoom } }
                }
            };
        }
        return { canvas: { ...state.canvas, zoom } };
    }),
    setRotation: (rotation) => set((state) => {
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            return {
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], canvas: { ...state.comparison[side].canvas, rotation } }
                }
            };
        }
        return { canvas: { ...state.canvas, rotation } };
    }),
    setBrightness: (brightness) => set((state) => {
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            return {
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], canvas: { ...state.comparison[side].canvas, brightness } }
                }
            };
        }
        return { canvas: { ...state.canvas, brightness } };
    }),
    setContrast: (contrast) => set((state) => {
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            return {
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], canvas: { ...state.comparison[side].canvas, contrast } }
                }
            };
        }
        return { canvas: { ...state.canvas, contrast } };
    }),
    setSharpness: (sharpness) => set((state) => {
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            return {
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], canvas: { ...state.comparison[side].canvas, sharpness } }
                }
            };
        }
        return { canvas: { ...state.canvas, sharpness } };
    }),
    toggleFlipX: () => set((state) => {
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            return {
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], canvas: { ...state.comparison[side].canvas, flipX: !state.comparison[side].canvas.flipX } }
                }
            };
        }
        return { canvas: { ...state.canvas, flipX: !state.canvas.flipX } };
    }),
    setPan: (x, y) => set((state) => {
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            return {
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], canvas: { ...state.comparison[side].canvas, pan: { x, y } } }
                }
            };
        }
        return { canvas: { ...state.canvas, pan: { x, y } } };
    }),
    resetCanvas: () => set((state) => {
        const defaultCanvas = {
            zoom: 1,
            rotation: 0,
            brightness: 100,
            contrast: 100,
            sharpness: 0,
            flipX: false,
            pan: { x: 0, y: 0 },
            pixelToMm: isPaneB(state) ? state.comparison[state.activeCanvasSide].canvas.pixelToMm : state.canvas.pixelToMm,
            calibrationApplied: isPaneB(state) ? state.comparison[state.activeCanvasSide].canvas.calibrationApplied : state.canvas.calibrationApplied,
            calibrationEnabledAt: isPaneB(state) ? state.comparison[state.activeCanvasSide].canvas.calibrationEnabledAt : state.canvas.calibrationEnabledAt
        };
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            return {
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], canvas: defaultCanvas }
                }
            };
        }
        return { canvas: defaultCanvas };
    }),
    undo: () => set((state) => ({ undoTrigger: state.undoTrigger + 1 })),
    redo: () => set((state) => ({ redoTrigger: state.redoTrigger + 1 })),
    setMeasurements: (measurements) => set((state) => {
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            return {
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], measurements: measurements.map(m => m.selected === undefined ? { ...m, selected: true } : m) }
                }
            };
        }
        return {
            measurements: measurements.map(m => m.selected === undefined ? { ...m, selected: true } : m)
        };
    }),
    setImplants: (implants) => set((state) => {
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            return {
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], implants }
                }
            };
        }
        return { implants };
    }),
    deleteMeasurement: (id) => {
        const state = get();
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            const updated = state.comparison[side].measurements.filter(m => m.id !== id);
            syncManagerMeasurements(state.managers[side], updated);
            set({
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], measurements: updated },
                },
            });
            persistImageB(get); // Image B deletions are saved too
            return;
        }

        const updated = resolveActiveMeasurements(state).filter(m => m.id !== id);
        syncManagerMeasurements(state.managers.main, updated);

        if (state.activeContextId) {
            get().updateContextState(state.activeContextId, { measurements: updated });
        } else {
            set({ measurements: updated });
        }
    },
    deleteImplant: (id) => {
        const state = get();
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            void state.managers.right?.applyOperation?.('DELETE_IMPLANT', { id });
            set({
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], implants: state.comparison[side].implants.filter(i => i.id !== id) },
                },
            });
            persistImageB(get);
            return;
        }
        // Remove from the live manager AND the persisted context (BUGS CV-10).
        void state.managers.main?.applyOperation?.('DELETE_IMPLANT', { id });
        const ctx = state.contextStates.find(c => c.contextId === state.activeContextId);
        const updated = (ctx?.implants ?? state.implants).filter((i: any) => i.id !== id);
        if (state.activeContextId) {
            void get().updateContextState(state.activeContextId, { implants: updated });
        } else {
            set({ implants: updated });
        }
    },
    toggleMeasurementSelection: (id, selected) => {
        const state = get();
        const mapSelection = (measurements: Measurement[]) =>
            measurements.map(m => m.id === id ? { ...m, selected } : m);

        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            const updated = mapSelection(state.comparison[side].measurements);
            set({
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], measurements: updated },
                },
            });
            return;
        }

        const updated = mapSelection(resolveActiveMeasurements(state));

        if (state.activeContextId) {
            get().updateContextState(state.activeContextId, { measurements: updated });
        } else {
            set({ measurements: updated });
        }
    },
    toggleRightSidebar: (isOpen) => set((state) => ({
        isRightSidebarOpen: isOpen !== undefined ? isOpen : !state.isRightSidebarOpen
    })),
    toggleLeftSidebar: (isOpen) => set((state) => ({
        isLeftSidebarOpen: isOpen !== undefined ? isOpen : !state.isLeftSidebarOpen
    })),
    toggleToolbarDock: () => set((state) => ({
        isToolbarDocked: !state.isToolbarDocked
    })),
    setToolbarDocked: (docked: boolean) => set({ isToolbarDocked: docked }),
    toggleWizard: () => set((state) => ({ isWizardVisible: !state.isWizardVisible })),
    setWizardVisible: (visible) => set({ isWizardVisible: visible }),
    setWizardIconVisible: (visible: boolean) => set({ isWizardIconVisible: visible }),
    toggleWizardIcon: () => set((state) => ({ isWizardIconVisible: !state.isWizardIconVisible })),
    setActiveDialog: (dialogId) => set({ activeDialog: dialogId }),
    registerManager: (side, manager) => set((state) => ({
        managers: { ...state.managers, [side]: manager }
    })),
    getManager: (side) => {
        return undefined;
    },
    setInspectionMode: (mode) => set({ inspectionMode: mode }),
    setCalibration: (ratio) => { set((state) => {
        const side = isPaneB(state) ? state.activeCanvasSide : null;
        const calibrationEnabledAt = ratio ? Date.now() : null;

        const clearConvertedFlag = (measurements: Measurement[]) => measurements.map((m) => {
            if (!m?.measurement || !(m.measurement as any).calibrateAllConverted) {
                return m;
            }
            const nextMeasurement = { ...(m.measurement as any) };
            delete nextMeasurement.calibrateAllConverted;
            return { ...m, measurement: nextMeasurement };
        });

        if (isPaneB(state) && side) {
            const cleanedMeasurements = clearConvertedFlag(state.comparison[side].measurements);
            syncManagerMeasurements(state.managers[side], cleanedMeasurements);
            return {
                comparison: {
                    ...state.comparison,
                    [side]: {
                        ...state.comparison[side],
                        measurements: cleanedMeasurements,
                        canvas: {
                            ...state.comparison[side].canvas,
                            pixelToMm: ratio,
                            calibrationApplied: !!ratio,
                            calibrationEnabledAt,
                        },
                    }
                }
            };
        }

        const cleanedMeasurements = clearConvertedFlag(state.measurements);
        syncManagerMeasurements(state.managers.main, cleanedMeasurements);

        return {
            measurements: cleanedMeasurements,
            canvas: {
                ...state.canvas,
                pixelToMm: ratio,
                calibrationApplied: !!ratio,
                calibrationEnabledAt,
            },
        };
    }); persistCalibration(get); },
    setCalibrationApplied: (applied) => { set((state) => {
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            return {
                comparison: {
                    ...state.comparison,
                    [side]: {
                        ...state.comparison[side],
                        canvas: {
                            ...state.comparison[side].canvas,
                            calibrationApplied: applied,
                        },
                    },
                },
            };
        }

        return {
            canvas: {
                ...state.canvas,
                calibrationApplied: applied,
            },
        };
    }); persistCalibration(get); },
    applyCalibrationToExistingMeasurements: () => set((state) => {
        if (isPaneB(state)) {
            const side = state.activeCanvasSide;
            const converted = state.comparison[side].measurements.map((m) => ({
                ...m,
                measurement: {
                    ...m.measurement,
                    calibrateAllConverted: true,
                },
            }));

            syncManagerMeasurements(state.managers[side], converted);

            return {
                comparison: {
                    ...state.comparison,
                    [side]: {
                        ...state.comparison[side],
                        measurements: converted,
                    },
                },
            };
        }

        const converted = state.measurements.map((m) => ({
            ...m,
            measurement: {
                ...m.measurement,
                calibrateAllConverted: true,
            },
        }));

        syncManagerMeasurements(state.managers.main, converted);

        return {
            measurements: converted,
        };
    }),
    convertLegacyPxMeasurementsToMm: () => {
        const state = get();
        const ratio = isPaneB(state)
            ? state.comparison[state.activeCanvasSide].canvas.pixelToMm
            : state.canvas.pixelToMm;

        if (!ratio) {
            return 0;
        }

        let convertedCount = 0;

        set((innerState) => {
            if (isPaneB(innerState)) {
                const side = innerState.activeCanvasSide;
                const converted = innerState.comparison[side].measurements.map((m) => {
                    const convertedResult = convertPxResultToMm(m.result, ratio);
                    if (!convertedResult.changed) {
                        return m;
                    }
                    convertedCount += 1;
                    return {
                        ...m,
                        result: convertedResult.result,
                        measurement: {
                            ...m.measurement,
                            wasConvertedFromPx: true,
                        },
                    };
                });

                syncManagerMeasurements(innerState.managers[side], converted);

                return {
                    comparison: {
                        ...innerState.comparison,
                        [side]: {
                            ...innerState.comparison[side],
                            measurements: converted,
                        },
                    },
                };
            }

            const converted = innerState.measurements.map((m) => {
                const convertedResult = convertPxResultToMm(m.result, ratio);
                if (!convertedResult.changed) {
                    return m;
                }
                convertedCount += 1;
                return {
                    ...m,
                    result: convertedResult.result,
                    measurement: {
                        ...m.measurement,
                        wasConvertedFromPx: true,
                    },
                };
            });

            syncManagerMeasurements(innerState.managers.main, converted);

            return { measurements: converted };
        });

        return convertedCount;
    },
});
