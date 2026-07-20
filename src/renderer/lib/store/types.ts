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

export type StudyStatus = 'Draft' | 'In Progress' | 'Completed' | 'Archived';

export const STUDY_STATUSES: StudyStatus[] = ['Draft', 'In Progress', 'Completed', 'Archived'];

export interface Study {
    id: string;
    patientId: string;
    visitId?: string;
    modality: string;
    source: string;
    acquisitionDate: string;
    name?: string | null;
    status?: StudyStatus | string | null;
    scans: Scan[];
    /** Workspace ownership: null = personal, set = org id */
    organizationId?: string | null;
}

export function getStudyDisplayName(study: Pick<Study, 'name' | 'modality'>): string {
    const trimmed = study.name?.trim();
    if (trimmed) return trimmed;
    const modality = study.modality?.trim();
    if (modality) return modality;
    return 'Untitled Study';
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

export interface ReportSectionConfig {
    id: string;
    type: 'patient_summary' | 'alignment_summary' | 'measurement_table' | 'compare_table' | 'surgical_plan' | 'osteotomies' | 'instrumentation' | 'images' | 'notes';
    enabled: boolean;
    order: number;
    title: string;
    description?: string;
    // Section specific settings
    includedCategories?: string[]; // e.g., 'Sagittal Alignment', 'Coronal Alignment'
    decimalPlaces?: number;
    units?: 'Mixed (° / mm)' | 'Degrees (°)' | 'Millimeters (mm)';
}

export interface ReportConfig {
    sections: ReportSectionConfig[];
    reportType?: 'single' | 'comparison';
    compareStudyId?: string; // which study to compare against
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
    reportConfig?: ReportConfig;
    /** Persisted comparison side state — kept with the context so Compare
     *  measurements survive leaving/re-entering Compare mode. */
    comparisonLeft?: { image: string | null; measurements: Measurement[]; implants: any[] };
    comparisonRight?: { image: string | null; measurements: Measurement[]; implants: any[] };
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
    id?: string;
    name: string;
    email: string;
    title: string;
    specialty: string;
    joined: string;
    subsection: string;
    isEmailVerified?: boolean;
    profileCompleted?: boolean;
    orgId?: string | null;
    designation?: string;
    country?: string;
    avatarUrl?: string;
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


