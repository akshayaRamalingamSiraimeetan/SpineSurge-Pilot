import { StateCreator } from 'zustand';
import { Measurement } from './types';
import type { AppState } from './index';
import { resolveActiveMeasurements, syncManagerMeasurements } from '@/lib/canvas/measurementSync';

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
    rightSidebarWidth: number;
    isLeftSidebarOpen: boolean;
    isToolbarDocked: boolean;
    isWizardVisible: boolean;
    isWizardIconVisible: boolean;
    activeDialog: string | null;
    vbmMode: 'lateral' | 'ap';
    managers: Record<string, any>;

    // ── Inspection mode (admin reads another user's study) ─────────────────
    inspectionMode: InspectionMode | null;
    setInspectionMode: (mode: InspectionMode | null) => void;

    loadImage: (imageUrl: string) => void;
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
    setRightSidebarWidth: (width: number) => void;
    toggleLeftSidebar: (isOpen?: boolean) => void;
    toggleToolbarDock: () => void;
    setToolbarDocked: (docked: boolean) => void;
    toggleWizard: () => void;
    setWizardVisible: (visible: boolean) => void;
    setWizardIconVisible: (visible: boolean) => void;
    toggleWizardIcon: () => void;
    setActiveDialog: (dialogId: string | null) => void;
    setVbmMode: (mode: 'lateral' | 'ap') => void;
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

export const createCanvasSlice: StateCreator<AppState, [], [], CanvasSlice> = (set, get) => ({
    currentImage: null,
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
    selection: null,
    measurements: [],
    implants: [],
    undoTrigger: 0,
    redoTrigger: 0,
    isRightSidebarOpen: true,
    rightSidebarWidth: 320,
    isLeftSidebarOpen: true,
    isToolbarDocked: false,
    isWizardVisible: true,
    isWizardIconVisible: true,
    activeDialog: null,
    vbmMode: 'lateral',
    managers: {},
    inspectionMode: null,

    loadImage: (imageUrl: string) => set((state) => {
        console.log('[CanvasSlice] loadImage called', imageUrl);
        console.log('[CanvasSlice] Current measurements count:', state.measurements.length);
        console.log('[CanvasSlice] Resetting canvas state...');
        return {
            currentImage: imageUrl,
            isDicomMode: false,
            dicomSeries: [],
            canvas: { ...state.canvas, zoom: 1, pan: { x: 0, y: 0 }, rotation: 0, brightness: 100, contrast: 100, sharpness: 0, flipX: false }
        };
    }),
    setCurrentImage: (imageUrl: string | null) => set({ currentImage: imageUrl }),
    clearImage: () => set({ currentImage: null, isDicomMode: false, dicomSeries: [], inspectionMode: null }),

    setActiveTool: (toolId) => set({ activeTool: toolId }),
    setSelection: (selection) => set({ selection }),
    setZoom: (zoom) => set((state) => {
        if (state.isComparisonMode) {
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
        if (state.isComparisonMode) {
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
        if (state.isComparisonMode) {
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
        if (state.isComparisonMode) {
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
        if (state.isComparisonMode) {
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
        if (state.isComparisonMode) {
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
        if (state.isComparisonMode) {
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
            pixelToMm: state.isComparisonMode ? state.comparison[state.activeCanvasSide].canvas.pixelToMm : state.canvas.pixelToMm,
            calibrationApplied: state.isComparisonMode ? state.comparison[state.activeCanvasSide].canvas.calibrationApplied : state.canvas.calibrationApplied,
            calibrationEnabledAt: state.isComparisonMode ? state.comparison[state.activeCanvasSide].canvas.calibrationEnabledAt : state.canvas.calibrationEnabledAt
        };
        if (state.isComparisonMode) {
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
        if (state.isComparisonMode) {
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
        if (state.isComparisonMode) {
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
        if (state.isComparisonMode) {
            const side = state.activeCanvasSide;
            const updated = state.comparison[side].measurements.filter(m => m.id !== id);
            syncManagerMeasurements(state.managers[side], updated);
            set({
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], measurements: updated },
                },
            });
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
    deleteImplant: (id) => set((state) => {
        if (state.isComparisonMode) {
            const side = state.activeCanvasSide;
            return {
                comparison: {
                    ...state.comparison,
                    [side]: { ...state.comparison[side], implants: state.comparison[side].implants.filter(i => i.id !== id) }
                }
            };
        }
        return { implants: state.implants.filter(i => i.id !== id) };
    }),
    toggleMeasurementSelection: (id, selected) => {
        const state = get();
        const mapSelection = (measurements: Measurement[]) =>
            measurements.map(m => m.id === id ? { ...m, selected } : m);

        if (state.isComparisonMode) {
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
    setRightSidebarWidth: (width) => set({ rightSidebarWidth: width }),
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
    setVbmMode: (mode) => set({ vbmMode: mode }),
    registerManager: (side, manager) => set((state) => ({
        managers: { ...state.managers, [side]: manager }
    })),
    getManager: (side) => {
        return undefined;
    },
    setInspectionMode: (mode) => set({ inspectionMode: mode }),
    setCalibration: (ratio) => set((state) => {
        const side = state.isComparisonMode ? state.activeCanvasSide : null;
        const calibrationEnabledAt = ratio ? Date.now() : null;

        const clearConvertedFlag = (measurements: Measurement[]) => measurements.map((m) => {
            if (!m?.measurement || !(m.measurement as any).calibrateAllConverted) {
                return m;
            }
            const nextMeasurement = { ...(m.measurement as any) };
            delete nextMeasurement.calibrateAllConverted;
            return { ...m, measurement: nextMeasurement };
        });

        if (state.isComparisonMode && side) {
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
    }),
    setCalibrationApplied: (applied) => set((state) => {
        if (state.isComparisonMode) {
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
    }),
    applyCalibrationToExistingMeasurements: () => set((state) => {
        if (state.isComparisonMode) {
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
        const ratio = state.isComparisonMode
            ? state.comparison[state.activeCanvasSide].canvas.pixelToMm
            : state.canvas.pixelToMm;

        if (!ratio) {
            return 0;
        }

        let convertedCount = 0;

        set((innerState) => {
            if (innerState.isComparisonMode) {
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
