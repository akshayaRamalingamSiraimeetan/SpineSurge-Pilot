/* Workspace persistence orchestration (Step 7d).
 *
 * Resolves the patient from the route `studyId`, hydrates the workspace store from the patient's
 * saved context once, and debounce-saves measurement changes back via upsert (carrying the context
 * id so it edits in place, never creating duplicates). If the backend is unreachable the queries are
 * simply disabled/errored and the workspace still works locally — persistence degrades gracefully. */
import { useEffect, useRef } from 'react';
import { useContexts, usePatient, useSaveContext, useStudy } from '@/lib/api/hooks';
import { useWorkspaceStore } from '@/lib/store/workspace';
import { fromApiState, toApiState } from './contextSerde';

const SAVE_DEBOUNCE_MS = 800;

export function useWorkspacePersistence(studyId: string | undefined) {
  const study = useStudy(studyId);
  const patientId = study.data?.patient_id;
  const patient = usePatient(patientId);
  const contexts = useContexts(patientId);

  const calibration = useWorkspaceStore((s) => s.calibration);
  const measurements = useWorkspaceStore((s) => s.measurements);
  const annotations = useWorkspaceStore((s) => s.annotations);
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);
  const imageSrc = useWorkspaceStore((s) => s.imageSrc);
  const setImage = useWorkspaceStore((s) => s.setImage);
  const { mutate: saveContext, isPending } = useSaveContext();

  const contextIdRef = useRef<string | undefined>(undefined);
  const hydratedRef = useRef(false);
  const imageHydratedRef = useRef(false);

  // The stored X-ray for this study (a presigned scan URL from the patient detail), if any.
  const scanUrl = patient.data?.studies
    ?.find((s) => s.id === studyId)
    ?.scans?.find((sc) => sc.url)?.url;

  // Load the persisted radiograph once when it arrives (don't clobber a locally-loaded image).
  useEffect(() => {
    if (imageHydratedRef.current || !scanUrl || imageSrc) return;
    imageHydratedRef.current = true;
    setImage(scanUrl);
  }, [scanUrl, imageSrc, setImage]);

  // Hydrate once, when the patient's contexts first arrive.
  useEffect(() => {
    if (!contexts.data || hydratedRef.current) return;
    const ctx = contexts.data[0];
    if (ctx) {
      contextIdRef.current = ctx.id;
      loadWorkspace(fromApiState(ctx.measurements, calibration));
    }
    hydratedRef.current = true;
    // calibration intentionally omitted: hydration runs once; live re-render under calibration is separate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contexts.data, loadWorkspace]);

  // Debounced upsert on measurement/annotation changes (after hydration). Never creates an empty context.
  useEffect(() => {
    if (!hydratedRef.current || !patientId) return;
    if (measurements.length === 0 && annotations.length === 0 && !contextIdRef.current) return;
    const t = setTimeout(() => {
      saveContext(
        {
          id: contextIdRef.current,
          patient_id: patientId,
          study_ids: studyId ? [studyId] : [],
          mode: 'plan',
          name: 'Assessment',
          state: { measurements: toApiState(measurements, annotations) },
        },
        { onSuccess: (res) => { contextIdRef.current = res.id; } },
      );
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [measurements, annotations, patientId, studyId, saveContext]);

  return { study, patient, saving: isPending };
}
