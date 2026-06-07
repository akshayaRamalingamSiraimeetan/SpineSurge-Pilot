/* TanStack Query hooks over the typed client. Server state lives here, not in Zustand. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import { fetchWadoStudy } from './dicomWeb';
import type {
  Collection,
  CollectionCreate,
  CollectionDetail,
  ContextSaveBody,
  ContextSaveResponse,
  DashboardFeed,
  DicomIngestResult,
  HydratedContext,
  OrgMember,
  OrgStats,
  PacsConnection,
  Patient,
  PatientCreate,
  PatientDetail,
  PatientPage,
  PatientsQuery,
  QidoQuery,
  QidoStudy,
  Scan,
  Study,
  StudyCreate,
  Visit,
  VisitUpsert,
} from './types';

export const queryKeys = {
  patients: (q: PatientsQuery) => ['patients', q] as const,
  patient: (id: string) => ['patient', id] as const,
  study: (id: string) => ['study', id] as const,
  contexts: (patientId: string) => ['contexts', patientId] as const,
  wado: (studyUID: string) => ['wado', studyUID] as const,
  qido: (q: QidoQuery) => ['qido', q] as const,
  dashboard: () => ['dashboard'] as const,
  collections: () => ['collections'] as const,
  collection: (id: string) => ['collection', id] as const,
};

/** Patch type for PATCH /patients/{id} (all fields optional). */
export type PatientUpdate = Partial<PatientCreate>;

/** The home dashboard's aggregate feed (recent studies, continue-working, unfinished, tasks). */
export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard(),
    queryFn: () => apiFetch<DashboardFeed>('/dashboard'),
    staleTime: 30_000,
  });
}

/* ──────────────────────────── library collections ──────────────────────────── */
export function useCollections() {
  return useQuery({
    queryKey: queryKeys.collections(),
    queryFn: () => apiFetch<Collection[]>('/collections'),
  });
}

export function useCollection(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.collection(id ?? ''),
    queryFn: () => apiFetch<CollectionDetail>(`/collections/${id}`),
    enabled: !!id,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CollectionCreate) =>
      apiFetch<Collection>('/collections', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.collections() }),
  });
}

export function useAddStudyToCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, studyId }: { collectionId: string; studyId: string }) =>
      apiFetch<{ success: boolean }>(`/collections/${collectionId}/studies`, {
        method: 'POST',
        body: { study_id: studyId },
      }),
    onSuccess: (_r, { collectionId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.collection(collectionId) });
      qc.invalidateQueries({ queryKey: queryKeys.collections() });
    },
  });
}

export function useRemoveStudyFromCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ collectionId, studyId }: { collectionId: string; studyId: string }) =>
      apiFetch<void>(`/collections/${collectionId}/studies/${studyId}`, { method: 'DELETE' }),
    onSuccess: (_r, { collectionId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.collection(collectionId) });
      qc.invalidateQueries({ queryKey: queryKeys.collections() });
    },
  });
}

/* ──────────────────────────── org / admin settings ──────────────────────────── */
/** Org members (admin-gated). Returns 403 for non-admins — callers should handle the error state. */
export function useOrgMembers(enabled = true) {
  return useQuery({
    queryKey: ['org', 'members'],
    queryFn: () => apiFetch<OrgMember[]>('/org/members'),
    enabled,
    retry: false, // a 403 for non-admins shouldn't be retried
  });
}

export function useOrgStats() {
  return useQuery({
    queryKey: ['org', 'stats'],
    queryFn: () => apiFetch<OrgStats>('/org/stats'),
  });
}

export function usePacsConnections() {
  return useQuery({
    queryKey: ['org', 'pacs'],
    queryFn: () => apiFetch<PacsConnection[]>('/org/pacs'),
  });
}

/* ──────────────────────────── reports (PDF generation) ──────────────────────────── */
interface ReportOut {
  id: string;
  patient_id: string | null;
  visit_id: string | null;
  title: string | null;
  storage_key: string | null;
  url: string | null;
}

/** Generate a PDF report from a patient's latest saved workspace context; returns a presigned url. */
export function useGenerateReport() {
  return useMutation({
    mutationFn: (body: { patient_id: string; context_id?: string; title?: string }) =>
      apiFetch<ReportOut>('/reports/generate', { method: 'POST', body }),
  });
}

export function usePatients(query: PatientsQuery = {}) {
  return useQuery({
    queryKey: queryKeys.patients(query),
    queryFn: () =>
      apiFetch<PatientPage>('/patients', {
        query: {
          page: query.page ?? 1,
          page_size: query.page_size ?? 25,
          q: query.q || undefined,
          archived: query.archived ?? false,
        },
      }),
    placeholderData: keepPreviousData,
  });
}

export function usePatient(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.patient(id ?? ''),
    queryFn: () => apiFetch<PatientDetail>(`/patients/${id}`),
    enabled: !!id,
  });
}

export function useStudy(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.study(id ?? ''),
    queryFn: () => apiFetch<Study>(`/studies/${id}`),
    enabled: !!id,
  });
}

export function useContexts(patientId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.contexts(patientId ?? ''),
    queryFn: () => apiFetch<HydratedContext[]>('/contexts', { query: { patientId } }),
    enabled: !!patientId,
  });
}

export function useSaveContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ContextSaveBody) =>
      apiFetch<ContextSaveResponse>('/contexts', { method: 'POST', body }),
    onSuccess: (_res, body) => {
      qc.invalidateQueries({ queryKey: queryKeys.contexts(body.patient_id) });
    },
  });
}

/** Search the org's PACS studies via the QIDO proxy (results are pre-filtered to the tenant). */
export function useQidoStudies(query: QidoQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.qido(query),
    queryFn: () =>
      apiFetch<QidoStudy[]>('/dicom/qido/studies', {
        query: query as Record<string, string | undefined>,
      }),
    enabled,
  });
}

/** Retrieve a study's DICOM instances via the WADO proxy as Cornerstone-loadable resources.
    DICOM bytes are immutable, so the result never goes stale within a session. */
export function useWadoStudy(studyUID: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.wado(studyUID ?? ''),
    queryFn: () => fetchWadoStudy(studyUID!),
    enabled: !!studyUID,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });
}

/* ──────────────────────────── mutations (write/ingest) ────────────────────────────
   Each invalidates exactly the server state it changes: the patients list (prefix ['patients'])
   and/or the affected patient detail (queryKeys.patient). The backend enforces RBAC + RLS; these
   hooks are pure transport over the typed client. */

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatientCreate) =>
      apiFetch<Patient>('/patients', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }),
  });
}

export function useUpdatePatient(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatientUpdate) =>
      apiFetch<Patient>(`/patients/${patientId}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patients'] });
      qc.invalidateQueries({ queryKey: queryKeys.patient(patientId) });
    },
  });
}

export function useUpsertVisit(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VisitUpsert) =>
      apiFetch<Visit>(`/patients/${patientId}/visits`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.patient(patientId) }),
  });
}

export function useCreateStudy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StudyCreate) => apiFetch<Study>('/studies', { method: 'POST', body }),
    onSuccess: (study) => qc.invalidateQueries({ queryKey: queryKeys.patient(study.patient_id) }),
  });
}

/** Upload a non-DICOM image (X-ray) to a study → stored in S3, returns the scan with a presigned url. */
export function useUploadScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studyId, file, type, date, patientId: _patientId }: {
      studyId: string;
      file: File;
      type?: string;
      date?: string;
      /** Carried only so onSuccess can invalidate the right patient detail. */
      patientId?: string;
    }) => {
      const form = new FormData();
      form.append('file', file);
      if (type) form.append('type', type);
      if (date) form.append('date', date);
      return apiFetch<Scan>(`/studies/${studyId}/scans`, { method: 'POST', body: form });
    },
    onSuccess: (_scan, vars) => {
      if (vars.patientId) qc.invalidateQueries({ queryKey: queryKeys.patient(vars.patientId) });
      qc.invalidateQueries({ queryKey: queryKeys.study(vars.studyId) });
    },
  });
}

/** STOW-upload DICOM instances to Orthanc, creating/linking a study (modality CT). */
export function useUploadDicom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ patientId, visitId, files }: {
      patientId: string;
      visitId?: string;
      files: File[];
    }) => {
      const form = new FormData();
      form.append('patient_id', patientId);
      if (visitId) form.append('visit_id', visitId);
      for (const f of files) form.append('files', f);
      return apiFetch<DicomIngestResult>('/dicom/studies', { method: 'POST', body: form });
    },
    onSuccess: (_res, vars) => qc.invalidateQueries({ queryKey: queryKeys.patient(vars.patientId) }),
  });
}
