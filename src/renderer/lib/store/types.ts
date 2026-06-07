import { Measurement } from '@/lib/canvas/CanvasManager';
export type { Measurement };

export interface DICOMResource {
    name: string;
    path?: string;
    arrayBuffer(): Promise<ArrayBuffer>;
}


export interface Scan {
    id: string;
    imageUrl: string;
    type: 'Pre-op' | 'Post-op' | 'Imported';
    date: string;
}

export interface Study {
    id: string;
    patientId: string;
    visitId?: string;
    modality: string;
    source: string;
    acquisitionDate: string;
    scans: Scan[];
}

export interface Context {
    id: string;
    patientId: string;
    visitId?: string; // Nullable for Quick Use
    studyIds: string[];
    mode: 'view' | 'plan' | 'compare';
    name: string;
    lastModified: string;
}

export interface ContextState {
    contextId: string;
    measurements: Measurement[];
    implants: any[];
    threeDImplants?: ThreeDImplant[];
    pedicleSimulations?: PedicleSimulation[];
    annotations: any[];
    toolState: any;
    currentImage?: string;
}

export interface Visit {
    id: string;
    visitNumber: string;
    date: string;
    time: string;
    diagnosis: string;
    comments: string;
    height: string;
    weight: string;
    consultants: string;
    scanCount: number;
    scans: Scan[];
    studies: Study[];
    surgeryDate?: string;
}

export interface Patient {
    id: string;
    name: string;
    age: number;
    gender: 'M' | 'F' | 'O';
    dob: string;
    lastVisit: string;
    hasAlert?: boolean;
    isArchived?: boolean;
    sex?: string;
    contact?: string;
    visits: Visit[];
    studies: Study[];
}

export interface UserProfile {
    name: string;
    email: string;
    title: string;
    specialty: string;
    joined: string;
    subsection: string;
}

export interface ThreeDImplant {
    id: string;
    type: 'screw' | 'rod';
    position: [number, number, number];
    direction: [number, number, number];
    properties: {
        diameter: number;
        length: number;
        color: string;
        headDiameter?: number;
        modelPath?: string;
        medialAngle?: number;  // degrees — inward tilt
        caudalAngle?: number;  // degrees — caudal tilt
        depth?: number;        // mm — insertion depth
    };
    level?: string;        // Vertebra label e.g. 'L3', 'T10'
    side?: 'L' | 'R';     // Left or Right pedicle
    simulationId?: string; // Links to a specific PedicleSimulation
}

export interface PedicleLandmark {
    id: string;
    type: 'VAP' | 'PIP_L' | 'PIP_R' | 'FIDUCIAL';
    worldPos: [number, number, number];
    label: string; // e.g. "L4"
    viewOrientation?: 'AXIAL' | 'SAGITTAL' | 'CORONAL';
}

export interface PedicleSimulation {
    id: string;
    label: string; // e.g. "L4"
    landmarks: {
        VAP?: PedicleLandmark;
        PIP_L?: PedicleLandmark;
        PIP_R?: PedicleLandmark;
        fiducials?: PedicleLandmark[];
    };
    suggestedScrew_L?: { diameter: number; length: number };
    suggestedScrew_R?: { diameter: number; length: number };
    grading?: {
        left?: number; // bone contact %
        right?: number;
    };
}


