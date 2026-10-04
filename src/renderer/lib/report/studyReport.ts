import { useAppStore, type AppState } from '@/lib/store';
import { api } from '@/lib/api';
import { mapContexts } from '@/lib/store/patientSlice';
import { caseStateFromContext } from '@/lib/store/caseState';
import { buildReportModel, reportHasContent } from './reportModel';
import { renderReportPDF } from '@/lib/pdf/generateReportPDF';
import { isVolumeModality } from '@/features/dicom/dicomPersistence';

/**
 * The current report of a study, built from its latest saved session without
 * loading it into the workspace (UI9-03). Returns null when the study has no
 * session or nothing to report yet.
 */
export async function buildStudyReportBlob(patientId: string, studyId: string): Promise<Blob | null> {
    const st = useAppStore.getState();
    const { contexts, contextStates } = mapContexts(await api.getContexts(patientId, st.token));
    const ctx = contexts
        .filter((c) => c.studyIds?.includes(studyId))
        .sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)))[0];
    const ctxState = ctx && contextStates.find((s) => s.contextId === ctx.id);
    if (!ctx || !ctxState) return null;

    // A detached copy of the store describing that case only.
    const base = { ...st, activePatientId: patientId, activeContextId: ctx.id, contexts, contextStates, managers: {} } as AppState;
    // CT/MR study: a 3D report (no 2D image decoding of DICOM files — UI11-04)
    const study = st.patients.find((p) => p.id === patientId)?.studies?.find((s) => s.id === studyId);
    const virtual = { ...base, ...caseStateFromContext(base, ctxState), isDicomMode: isVolumeModality(study?.modality) } as AppState;
    const model = await buildReportModel(virtual);
    if (!reportHasContent(model)) return null;
    return renderReportPDF(model).output('blob');
}
