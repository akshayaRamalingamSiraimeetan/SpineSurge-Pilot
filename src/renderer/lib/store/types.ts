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
    type: 'Pre-op' | 'Post-op' | 'Imported' | 'Thumbnail';
    date: string;
}

export type StudyStatus = 'Draft' | 'In Progress' | 'Completed' | 'Archived';

/** Selectable study states ('Archived' kept in the type only for old records — UI9-04). */
export const STUDY_STATUSES: StudyStatus[] = ['Draft', 'In Progress', 'Completed'];

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
    ownerUserId?: string | null;
    /** What the signed-in user may do (server-computed, UI12-10) */
    access?: Access;
    /** own = their study · share = shared with them · team = org admin view of a member's study */
    via?: 'own' | 'share' | 'team';
    /** Owner's name when it isn't the signed-in user */
    ownerName?: string | null;
}

/** owner = full control · edit = shared with edit rights · view = read-only */
export type Access = 'owner' | 'edit' | 'view';

/**
 * Human name for a study: its own name, else "Study · <date>". Modality is
 * shown separately as a badge — it is not a name (all X-rays were "X-Ray").
 */
export function getStudyDisplayName(study: Pick<Study, 'name' | 'modality'> & { acquisitionDate?: string }): string {
    const trimmed = study.name?.trim();
    if (trimmed) return trimmed;
    const d = study.acquisitionDate ? new Date(study.acquisitionDate) : null;
    if (d && !isNaN(d.getTime())) {
        return `Study · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return 'Untitled study';
}

/** Default name for a new study, e.g. "Pre-op" (the date is shown separately). */
export function defaultStudyName(kind: string, _date = new Date()): string {
    void _date;
    return kind;
}

export interface Context {
    id: string;
    patientId: string;
    visitId?: string; // Nullable for Quick Use
    studyIds: string[];
    mode: 'view' | 'plan' | 'compare';
    name: string;
    lastModified: string;
    /** Server-computed access to this session (UI12-10); absent = local/untitled = owner */
    access?: Access;
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

/** Document-level formatting (Report tab, right panel). */
export interface ReportDocumentSettings {
    title: string;
    institution: string;
    department: string;
    pageSize: 'a4' | 'letter';
    orientation: 'portrait' | 'landscape';
    accentColor: string;
    fontScale: number;
    showPageNumbers: boolean;
    footerText: string;
    /** Hospital logo at the left of the report header; undefined = the default from Settings. */
    logo?: { dataUrl: string; width: number; height: number } | null;
}

export interface ReportConfig {
    sections: ReportSectionConfig[];
    document?: ReportDocumentSettings;
    /** @deprecated the report now always covers Assessment + Planning + Compare */
    reportType?: 'single' | 'comparison';
    compareStudyId?: string;
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
    /** owner = theirs · shared = only studies shared with them · team = admin view of a member (UI12-10) */
    access?: 'owner' | 'shared' | 'team';
    ownerUserId?: string | null;
    ownerName?: string | null;
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

/** LPS world coordinates in millimetres. */
export type Vec3 = [number, number, number];

/** Pedicle screw: head at `entry`, point at `tip`. length = |tip − entry|. */
export interface PlanScrew {
    id: string;
    type: 'screw';
    entry: Vec3;
    tip: Vec3;
    diameter: number;
    level?: string;        // Vertebra label e.g. 'L3'
    side?: 'L' | 'R';
    color?: string;
}

/** Rod through control points. */
export interface PlanRod {
    id: string;
    type: 'rod';
    points: Vec3[];
    diameter: number;
    color?: string;
}

/** Interbody cage: centre + orthonormal axes (X = width, Y = height), size [w, d, h] mm. */
export interface PlanCage {
    id: string;
    type: 'cage';
    center: Vec3;
    axisX: Vec3;
    axisY: Vec3;
    size: [number, number, number];
    level?: string;
    color?: string;
}

export type PlanImplant = PlanScrew | PlanRod | PlanCage;
/** @deprecated name kept for existing imports — same as PlanImplant. */
export type ThreeDImplant = PlanImplant;

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


