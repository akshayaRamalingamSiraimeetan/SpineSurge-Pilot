/* Domain types derived from docs/openapi.yaml + backend schemas/auth.py.
   These mirror the fixed contract the frontend builds against. */

export type Role = 'owner' | 'admin' | 'surgeon' | 'viewer';
export type Gender = 'M' | 'F' | 'O';

/** Response of GET /auth/me (backend app/schemas/auth.py:Me). */
export interface Me {
  user_id: string;
  org_id: string;
  role: Role;
  email: string | null;
}

/** Request body for POST /auth/dev-token (local dev only). */
export interface DevTokenRequest {
  subject?: string;
  org_id?: string;
  role?: Role;
  email?: string | null;
  org_name?: string | null;
}

/** Response of POST /auth/dev-token. */
export interface DevTokenResponse {
  access_token: string;
  token_type: string;
}

export interface Patient {
  id: string;
  name: string;
  age: number | null;
  gender: Gender;
  dob: string | null;
  contact: string | null;
  last_visit: string | null;
  has_alert: boolean;
  is_archived: boolean;
}

export interface PatientCreate {
  name: string;
  age?: number;
  gender?: Gender;
  dob?: string;
  contact?: string;
}

export interface PatientPage {
  items: Patient[];
  page: number;
  page_size: number;
  total: number;
}

export interface Visit {
  id: string;
  // All optional on the backend (VisitOut fields default to None) — keep the FE contract honest.
  visit_number: string | null;
  date: string | null;
  time: string | null;
  diagnosis: string | null;
  comments: string | null;
  height: string | null;
  weight: string | null;
  consultants: string | null;
  surgery_date: string | null;
}

export interface Study {
  id: string;
  patient_id: string;
  visit_id: string | null;
  modality: string;
  source: 'import' | 'pacs' | 'upload';
  acquisition_date: string | null;  // StudyOut.acquisition_date is Optional on the backend
  orthanc_study_uid: string | null;
  scans?: Scan[];
}

/** A non-DICOM image (e.g. JPEG/PNG X-ray) stored in S3, returned with a short-lived `url`. */
export interface Scan {
  id: string;
  study_id: string;
  type: string;
  date: string | null;
  storage_key: string | null;
  orthanc_series_uid: string | null;
  url: string | null;
}

/** Request body for POST /studies (backend schemas/clinical.py:StudyCreate). */
export interface StudyCreate {
  patient_id: string;
  visit_id?: string | null;
  modality?: string;
  source?: 'import' | 'pacs' | 'upload';
  acquisition_date?: string;
}

/** Request body for POST /patients/{id}/visits (upsert; backend VisitCreate). */
export interface VisitUpsert {
  id?: string;
  visit_number?: string;
  date?: string;
  time?: string;
  diagnosis?: string;
  comments?: string;
  height?: string;
  weight?: string;
  consultants?: string;
  surgery_date?: string;
}

/** Response of POST /dicom/studies (STOW ingest; backend DicomIngestResult). */
export interface DicomIngestResult {
  study_id: string;
  orthanc_study_uid: string;
  series_count: number;
  instance_count: number;
}

/** One study row from GET /dicom/qido/studies — raw DICOM JSON (tag → { vr, Value }). */
export type QidoStudy = Record<string, { vr: string; Value?: unknown[] }>;

/** Query params for GET /dicom/qido/studies (DICOM keyword attributes). */
export interface QidoQuery {
  PatientName?: string;
  PatientID?: string;
  StudyDate?: string;
}

export interface PatientDetail extends Patient {
  visits: Visit[];
  studies: Study[];
}

export interface PatientsQuery {
  page?: number;
  page_size?: number;
  q?: string;
  archived?: boolean;
}

/* ---- Contexts (planning sessions) ----
   Shapes mirror the backend: ContextSave (snake_case envelope) on POST /contexts, and the
   hydrated camelCase context on GET /contexts?patientId. The `state.measurements` items are
   camelCase blobs mapped by app/services/contexts._to_measurement. */
export interface ContextMeasurementItem {
  id?: string;
  toolKey: string;
  fragmentId?: string | null;
  points: { x: number; y: number }[];
  result?: Record<string, unknown> | null;
  measurement?: Record<string, unknown> | null;
  timestamp?: number | null;
}

export interface HydratedContext {
  id: string;
  patientId: string;
  visitId: string | null;
  studyIds: string[];
  mode: 'view' | 'plan' | 'compare';
  name: string | null;
  lastModified: string;
  measurements: ContextMeasurementItem[];
  implants: unknown[];
  threeDImplants: unknown[];
  pedicleSimulations: unknown[];
  annotations: unknown[];
  toolState: Record<string, unknown>;
}

export interface ContextSaveBody {
  id?: string;
  patient_id: string;
  visit_id?: string | null;
  study_ids?: string[];
  mode?: 'view' | 'plan' | 'compare';
  name?: string | null;
  state: { measurements: ContextMeasurementItem[] };
}

export interface ContextSaveResponse {
  success: boolean;
  id: string;
}

/* ---- Dashboard feed (GET /dashboard; backend schemas/dashboard.py) ----
   A read-only aggregate over real tenant data. Timestamps are ISO-8601 strings the FE formats. */
export interface DashboardContinueWorking {
  patient_id: string;
  context_id: string | null;
  study_id: string | null;
  name: string;
  stage: string;
  date: string | null;
  tag: string | null;
  last_opened: string | null;
  studies: number;
  status: string;
  modality: string | null;
}

export interface DashboardRecentStudy {
  patient_id: string;
  study_id: string;
  name: string;
  dx: string | null;
  date: string | null;
  studies: number;
  modality: string | null;
}

export interface DashboardUnfinished {
  patient_id: string;
  context_id: string;
  study_id: string | null;
  name: string;
  modality: string | null;
  date: string | null;
  dx: string | null;
  edited: string | null;
}

export interface DashboardTask {
  group: string;
  icon: string;
  title: string;
  sub: string;
  meta: string;
  tone: 'accent' | 'danger';
}

export interface DashboardFeed {
  continue_working: DashboardContinueWorking | null;
  recent_studies: DashboardRecentStudy[];
  unfinished: DashboardUnfinished[];
  tasks: DashboardTask[];
}

/* ---- Library collections (backend schemas/library.py) ---- */
export interface Collection {
  id: string;
  name: string;
  description: string | null;
  is_private: boolean;
  owner_user_id: string | null;
  owner_name: string | null;
  count: number;
  created_at: string | null;
}

export interface CollectionStudyItem {
  study_id: string;
  patient_id: string;
  name: string;
  patient: string;
  sex: string;
  date: string | null;
  modality: string;
}

export interface CollectionDetail extends Collection {
  studies: CollectionStudyItem[];
}

export interface CollectionCreate {
  name: string;
  description?: string | null;
  is_private?: boolean;
}

/* ---- Org / admin settings (backend schemas/org.py) ---- */
export interface OrgMember {
  user_id: string;
  name: string;
  email: string | null;
  role: string;
  status: string;
}

export interface OrgStats {
  patients: number;
  studies: number;
  reports: number;
  collections: number;
}

export interface PacsConnection {
  server: string;
  ae: string;
  host: string;
  port: string;
  status: string;
}
