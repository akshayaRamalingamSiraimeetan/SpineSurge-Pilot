import { StateCreator } from 'zustand';
import { ThreeDImplant, PedicleSimulation, PedicleLandmark } from './types';
import { type AppState } from './index';

export interface DicomSlice {
    threeDImplants: ThreeDImplant[];
    dicomSeries: (File | string)[];
    isDicomMode: boolean;
    dicom3D: {
        interactionMode: 'view' | 'place_screw' | 'place_rod' | 'place_cage' | 'place_vap' | 'place_pip_l' | 'place_pip_r' | 'place_fiducial';
        activeLandmarkLevel: string | null;
        renderMode: 'volume' | 'segmentation';
        isoThreshold: number;
        volumeThreshold: number;
        segmentationColor: { r: number; g: number; b: number };
        segmentationSmoothing: boolean;
        noiseReduction: boolean;
        activeSegmentationTool: 'threshold' | 'scissors';
        activeView: 'all' | 'axial' | 'sagittal' | 'coronal' | '3d';
        layoutMode: 'grid' | 'focus-3d' | 'axial-sagittal';
        showMetadataOverlay: boolean;
        metadata: {
            patientName?: string;
            patientID?: string;
            patientBirthDate?: string;
            patientSex?: string;
            studyDate?: string;
            studyDescription?: string;
            seriesDescription?: string;
            modality?: string;
            seriesNumber?: string;
            contentDate?: string;
            contentTime?: string;
            institutionName?: string;
        } | null;
        selectedImplantId: string | null;
        isSimulationActive: boolean;
        workflowStep: number;
        currentVolumeId: string | null;
        isCroppingActive: boolean;
        showClipBox3D: boolean;
        roiCrop: {
            x0: number; x1: number;
            y0: number; y1: number;
            z0: number; z1: number;
        };
        focusCropTrigger: number;
        // Screw Configuration
        screwLevel: string;
        screwSide: 'L' | 'R';
        screwDiameter: number;
        screwLength: number;
        screwColor: string;
        selectedLandmarkId: string | null;
    };
    pedicleSimulations: PedicleSimulation[];
    // ... rest
    setDicom3DShowClipBox: (show: boolean) => void;
    addPedicleLandmark: (landmark: PedicleLandmark) => void;
    removePedicleLandmark: (id: string, simulationId: string) => void;
    updatePedicleSimulation: (id: string, updates: Partial<PedicleSimulation>) => void;
    setDicomSimulationActive: (active: boolean) => void;
    setSelectedDicomImplant: (id: string | null) => void;
    setDicom3DMode: (mode: 'view' | 'place_screw' | 'place_rod' | 'place_cage' | 'place_vap' | 'place_pip_l' | 'place_pip_r' | 'place_fiducial') => void;
    setDicomLandmarkLevel: (level: string | null) => void;
    setSelectedLandmarkId: (id: string | null) => void;
    setDicom3DRenderMode: (mode: 'volume' | 'segmentation') => void;
    setDicom3DIsoThreshold: (val: number) => void;
    setDicom3DVolumeThreshold: (val: number) => void;
    setDicom3DSegmentationColor: (color: { r: number; g: number; b: number }) => void;
    setDicom3DSegmentationSmoothing: (enabled: boolean) => void;
    setDicom3DNoiseReduction: (enabled: boolean) => void;
    setDicomActiveSegmentationTool: (tool: 'threshold' | 'scissors') => void;
    setDicomActiveView: (view: 'all' | 'axial' | 'sagittal' | 'coronal' | '3d') => void;
    setDicomLayoutMode: (mode: 'grid' | 'focus-3d' | 'axial-sagittal') => void;
    setDicomShowMetadataOverlay: (show: boolean) => void;
    setDicomMetadata: (metadata: any) => void;
    setPedicleWorkflowStep: (step: number) => void;
    updateRoiCrop: (updates: Partial<{ x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }>) => void;
    setCurrentVolumeId: (volumeId: string | null) => void;
    setDicomCroppingActive: (active: boolean) => void;
    loadDicomSeries: (files: File[]) => void;
    loadDicomURLs: (urls: string[]) => void;
    exitDicomMode: () => void;
    addThreeDImplant: (implant: ThreeDImplant) => void;
    updateThreeDImplant: (id: string, updates: Partial<ThreeDImplant>) => void;
    removeThreeDImplant: (id: string) => void;
    setSidebarActiveModule: (module: string) => void;
    triggerFocusCrop: () => void;
    setScrewConfig: (updates: Partial<{ screwLevel: string; screwSide: 'L' | 'R'; screwDiameter: number; screwLength: number; screwColor: string }>) => void;
    sidebarActiveModule: string;
}

export const createDicomSlice: StateCreator<AppState, [], [], DicomSlice> = (set) => ({
    threeDImplants: [],
    dicomSeries: [],
    isDicomMode: false,
    dicom3D: {
        interactionMode: 'view',
        renderMode: 'volume',
        isoThreshold: 300,
        volumeThreshold: 300,
        segmentationColor: { r: 1, g: 1, b: 0 },
        segmentationSmoothing: false,
        noiseReduction: false,
        activeSegmentationTool: 'threshold',
        activeView: 'all',
        layoutMode: 'grid',
        showMetadataOverlay: false,
        metadata: null,
        selectedImplantId: null,
        isSimulationActive: false,
        activeLandmarkLevel: null,
        workflowStep: 1,
        currentVolumeId: null,
        isCroppingActive: false,
        showClipBox3D: false,
        roiCrop: { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 },
        focusCropTrigger: 0,
        screwLevel: 'C3',
        screwSide: 'L',
        screwDiameter: 3.0,
        screwLength: 18,
        screwColor: '#a855f7',
        selectedLandmarkId: null,
    },
    pedicleSimulations: [],
    addPedicleLandmark: (landmark) => set((state) => {
        let sims = [...state.pedicleSimulations];
        let sim = sims.find(s => s.label === landmark.label);

        if (!sim) {
            sim = {
                id: crypto.randomUUID(),
                label: landmark.label,
                landmarks: {}
            };
            sims.push(sim);
        }

        let existingLandmark: PedicleLandmark | undefined;
        let finalWorldPos = [...landmark.worldPos] as [number, number, number];

        if (landmark.type === 'FIDUCIAL') {
            // Priority: use selectedLandmarkId if it's a fiducial
            if (state.dicom3D.selectedLandmarkId) {
                existingLandmark = sim.landmarks.fiducials?.find(f => f.id === state.dicom3D.selectedLandmarkId);
            }
        } else {
            existingLandmark = (sim.landmarks as any)[landmark.type];
        }

        // --- Bi-Planar Refinement Logic ---
        if (existingLandmark && landmark.viewOrientation && existingLandmark.viewOrientation !== landmark.viewOrientation) {
            const oldPos = existingLandmark.worldPos;
            const newPos = landmark.worldPos;

            if (landmark.viewOrientation === 'AXIAL') {
                // Keep old Z (depth in axial), update X and Y
                finalWorldPos = [newPos[0], newPos[1], oldPos[2]];
            } else if (landmark.viewOrientation === 'SAGITTAL') {
                // Keep old X (depth in sagittal), update Y and Z
                finalWorldPos = [oldPos[0], newPos[1], newPos[2]];
            } else if (landmark.viewOrientation === 'CORONAL') {
                // Keep old Y (depth in coronal), update X and Z
                finalWorldPos = [newPos[0], oldPos[1], newPos[2]];
            }
        } else {
            // New selection, 3D pick, or SAME view: Update all coordinates
            finalWorldPos = [...landmark.worldPos] as [number, number, number];
        }

        if (landmark.type === 'FIDUCIAL') {
            if (!sim.landmarks.fiducials) sim.landmarks.fiducials = [];

            if (existingLandmark) {
                // Update existing
                const idx = sim.landmarks.fiducials.findIndex(f => f.id === existingLandmark?.id);
                if (idx !== -1) {
                    sim.landmarks.fiducials[idx] = {
                        ...existingLandmark,
                        worldPos: finalWorldPos,
                        viewOrientation: landmark.viewOrientation || existingLandmark.viewOrientation
                    };
                }
            } else {
                // Auto-label F, F_1, F_2 for NEW fiducials
                const count = sim.landmarks.fiducials.length;
                const suffix = count === 0 ? '' : `_${count}`;
                const newLabel = `F${suffix}`;

                sim.landmarks.fiducials.push({
                    ...landmark,
                    label: newLabel,
                    worldPos: finalWorldPos
                });
            }
        } else {
            (sim.landmarks as any)[landmark.type] = {
                ...landmark,
                worldPos: finalWorldPos
            };
        }

        if (state.activeContextId) {
            state.updateContextState(state.activeContextId, {
                pedicleSimulations: sims
            });
        }

        const newId = existingLandmark?.id || landmark.id;

        return {
            pedicleSimulations: sims,
            dicom3D: {
                ...state.dicom3D,
                selectedLandmarkId: landmark.type === 'FIDUCIAL' ? newId : state.dicom3D.selectedLandmarkId
            }
        };
    }),
    removePedicleLandmark: (id, simulationId) => set((state) => {
        const nextSims = state.pedicleSimulations.map(sim => {
            if (sim.id !== simulationId) return sim;
            const newLandmarks = { ...sim.landmarks };
            if (newLandmarks.VAP?.id === id) delete newLandmarks.VAP;
            if (newLandmarks.PIP_L?.id === id) delete newLandmarks.PIP_L;
            if (newLandmarks.PIP_R?.id === id) delete newLandmarks.PIP_R;
            return { ...sim, landmarks: newLandmarks };
        });
        if (state.activeContextId) {
            state.updateContextState(state.activeContextId, { pedicleSimulations: nextSims });
        }
        return { pedicleSimulations: nextSims };
    }),
    updatePedicleSimulation: (id: string, updates: Partial<PedicleSimulation>) => set((state) => {
        const nextSims = state.pedicleSimulations.map(sim =>
            sim.id === id ? { ...sim, ...updates } : sim
        );
        if (state.activeContextId) {
            state.updateContextState(state.activeContextId, { pedicleSimulations: nextSims });
        }
        return { pedicleSimulations: nextSims };
    }),
    setDicomSimulationActive: (active) => set(state => ({
        dicom3D: { ...state.dicom3D, isSimulationActive: active }
    })),
    setSelectedDicomImplant: (id) => set(state => ({ dicom3D: { ...state.dicom3D, selectedImplantId: id } })),
    setDicom3DMode: (mode) => set(state => ({ dicom3D: { ...state.dicom3D, interactionMode: mode } })),
    setDicomLandmarkLevel: (level) => set(state => ({ dicom3D: { ...state.dicom3D, activeLandmarkLevel: level } })),
    setDicom3DRenderMode: (mode) => set(state => ({ dicom3D: { ...state.dicom3D, renderMode: mode } })),
    setDicom3DIsoThreshold: (val) => set(state => ({ dicom3D: { ...state.dicom3D, isoThreshold: val } })),
    setDicom3DVolumeThreshold: (val) => set(state => ({ dicom3D: { ...state.dicom3D, volumeThreshold: val } })),
    setDicom3DSegmentationColor: (color) => set(state => ({ dicom3D: { ...state.dicom3D, segmentationColor: color } })),
    setDicom3DSegmentationSmoothing: (enabled) => set(state => ({ dicom3D: { ...state.dicom3D, segmentationSmoothing: enabled } })),
    setDicom3DNoiseReduction: (enabled) => set(state => ({ dicom3D: { ...state.dicom3D, noiseReduction: enabled } })),
    setDicomActiveSegmentationTool: (tool) => set(state => ({ dicom3D: { ...state.dicom3D, activeSegmentationTool: tool } })),
    setDicomActiveView: (view) => set(state => ({ dicom3D: { ...state.dicom3D, activeView: view } })),
    setDicomLayoutMode: (mode) => set(state => ({ dicom3D: { ...state.dicom3D, layoutMode: mode } })),
    setDicomShowMetadataOverlay: (show: boolean) =>
        set((state) => ({ dicom3D: { ...state.dicom3D, showMetadataOverlay: show } })),
    setDicomMetadata: (metadata: any) =>
        set((state) => ({ dicom3D: { ...state.dicom3D, metadata } })),
    setPedicleWorkflowStep: (step: number) => set((state) => ({
        dicom3D: { ...state.dicom3D, workflowStep: step }
    })),
    setDicom3DShowClipBox: (show) => set((state) => ({
        dicom3D: { ...state.dicom3D, showClipBox3D: show }
    })),
    updateRoiCrop: (updates) => set((state) => ({
        dicom3D: { ...state.dicom3D, roiCrop: { ...state.dicom3D.roiCrop, ...updates } }
    })),
    setCurrentVolumeId: (currentVolumeId) => set((state) => ({
        dicom3D: { ...state.dicom3D, currentVolumeId }
    })),
    setDicomCroppingActive: (active: boolean) => set((state) => ({
        dicom3D: { ...state.dicom3D, isCroppingActive: active }
    })),
    loadDicomSeries: (files: File[]) => set(() => ({
        dicomSeries: files,
        isDicomMode: true,
        currentImage: null,
    })),
    loadDicomURLs: (urls: string[]) => set(() => ({
        dicomSeries: urls,
        isDicomMode: true,
        currentImage: null,
    })),
    exitDicomMode: () => set({ isDicomMode: false, dicomSeries: [] }),
    addThreeDImplant: (implant: ThreeDImplant) => set((state) => {
        const nextImplants = [...state.threeDImplants, implant];
        if (state.activeContextId) {
            state.updateContextState(state.activeContextId, { threeDImplants: nextImplants });
        }
        return { threeDImplants: nextImplants };
    }),
    updateThreeDImplant: (id: string, updates: Partial<ThreeDImplant>) => set((state) => {
        const nextImplants = state.threeDImplants.map((imp) => imp.id === id ? { ...imp, ...updates } : imp);
        if (state.activeContextId) {
            state.updateContextState(state.activeContextId, { threeDImplants: nextImplants });
        }
        return { threeDImplants: nextImplants };
    }),
    removeThreeDImplant: (id: string) => set((state) => {
        const nextImplants = state.threeDImplants.filter((imp) => imp.id !== id);
        if (state.activeContextId) {
            state.updateContextState(state.activeContextId, { threeDImplants: nextImplants });
        }
        return { threeDImplants: nextImplants };
    }),
    sidebarActiveModule: 'generic',
    setSidebarActiveModule: (module: string) => set({ sidebarActiveModule: module }),
    triggerFocusCrop: () => set((state) => ({
        dicom3D: { ...state.dicom3D, focusCropTrigger: Date.now() }
    })),
    setScrewConfig: (updates) => set((state) => ({
        dicom3D: { ...state.dicom3D, ...updates as any }
    })),
    setSelectedLandmarkId: (id) => set((state) => ({
        dicom3D: { ...state.dicom3D, selectedLandmarkId: id }
    })),
});
