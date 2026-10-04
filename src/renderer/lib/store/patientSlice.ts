import { StateCreator } from 'zustand';
import { Patient, Study, Scan, Visit, Context, ContextState } from './types';
import { api } from '../api';
import type { AppState } from './index';
import { emptyCaseState, caseStateFromContext } from './caseState';
import { contextAccess } from '../access';
import { imageScans } from '../studies';

export interface PatientSlice {
    patients: Patient[];
    activePatientId: string | null;
    studies: Study[];
    contexts: Context[];
    contextStates: ContextState[];
    activeContextId: string | null;

    // Autosave state
    syncStatus: 'synced' | 'unsynced' | 'saving' | 'error';
    hasUnsyncedChanges: boolean;
    setSyncStatus: (status: 'synced' | 'unsynced' | 'saving' | 'error') => void;
    setHasUnsyncedChanges: (has: boolean) => void;

    initializeStore: () => Promise<void>;
    /** Re-fetch the patient list only. Never touches the open workspace. */
    refreshPatients: () => Promise<void>;
    /** Resolves 'loaded' only when this call's contexts were applied (UI11-07). */
    setActivePatient: (patientId: string, initialContextId?: string | null) => Promise<'loaded' | 'superseded' | 'failed'>;
    addPatient: (patient: Patient) => Promise<void>;
    updatePatient: (patient: Patient) => Promise<void>;
    archivePatient: (patientId: string, archived: boolean) => Promise<void>;
    /** Permanently delete a patient (and all visits, studies, images, sessions, reports). */
    deletePatient: (patientId: string) => Promise<void>;
    /** Permanently delete one study (its images, sessions and reports). */
    deleteStudy: (patientId: string, studyId: string) => Promise<void>;
    addVisit: (patientId: string, visit: Visit) => Promise<void>;
    updateVisit: (patientId: string, visitId: string, visit: Visit) => Promise<void>;
    deleteVisit: (patientId: string, visitId: string) => Promise<void>;
    reorderVisits: (patientId: string, visits: Visit[]) => Promise<void>;
    addStudy: (study: Omit<Study, 'scans'>) => Promise<void>;
    updateStudy: (patientId: string, studyId: string, updates: Partial<Pick<Study, 'name' | 'status' | 'modality' | 'source' | 'acquisitionDate' | 'visitId'>>) => Promise<void>;
    /** Uploads the file and resolves to the server image URL. */
    addScan: (patientId: string, studyId: string, scanMetadata: Omit<Scan, 'imageUrl'>, file: File) => Promise<string>;
    addContext: (context: Context) => Promise<void>;
    updateContextState: (contextId: string, updates: Partial<ContextState>) => Promise<boolean>;
    setActiveContextId: (contextId: string | null) => void;
    /** Open a study: latest existing session for it, or a new one. */
    openStudy: (patientId: string, studyId: string) => Promise<void>;
    /** Leave the workspace: unload the case but keep the selected patient. */
    closeCase: () => void;
    resetWorkspace: () => void;
}

// ── Request sequencing ──────────────────────────────────────────────────────
// Each async loader bumps its counter; a response is applied only if no newer
// request started meanwhile. Prevents patient A's data landing under B.
let patientLoadSeq = 0;
let patientListSeq = 0;

// ── Per-context save queue ──────────────────────────────────────────────────
// Saves for one context are serialized and coalesced (latest payload wins).
// Concurrent POST /api/contexts for the same id caused PK violations and
// out-of-order writes (docs/BUGS.md WS-02).
type SaveJob = { payload: any; token: string | null; waiters: ((ok: boolean) => void)[] };
const saveInFlight = new Map<string, Promise<void>>();
const savePending = new Map<string, SaveJob>();

function enqueueContextSave(contextId: string, payload: any, token: string | null): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const pending = savePending.get(contextId);
        if (pending) {
            pending.payload = payload;
            pending.token = token;
            pending.waiters.push(resolve);
        } else {
            savePending.set(contextId, { payload, token, waiters: [resolve] });
        }
        if (!saveInFlight.has(contextId)) drainSaves(contextId);
    });
}

function drainSaves(contextId: string) {
    const job = savePending.get(contextId);
    if (!job) { saveInFlight.delete(contextId); return; }
    savePending.delete(contextId);
    const run = api.saveContext(job.payload, job.token)
        .then(() => true)
        .catch((e) => { console.error(`[contextSave] FAILED contextId=${contextId}`, e); return false; })
        .then((ok) => {
            job.waiters.forEach((w) => w(ok));
            drainSaves(contextId);
        });
    saveInFlight.set(contextId, run);
}

export const mapContexts = (fetched: any[]) => {
    const contexts: Context[] = fetched.map((c: any) => ({
        id:           c.id,
        patientId:    c.patientId,
        visitId:      c.visitId,
        studyIds:     c.studyIds,
        mode:         c.mode,
        name:         c.name,
        lastModified: c.lastModified,
        ...(c.access ? { access: c.access } : {}),
    }));
    const contextStates: ContextState[] = fetched.map((c: any) => ({
        contextId:          c.id,
        measurements:       c.measurements       || [],
        implants:           c.implants           || [],
        threeDImplants:     c.threeDImplants     || c.toolState?.threeDImplants     || [],
        pedicleSimulations: c.pedicleSimulations || c.toolState?.pedicleSimulations || [],
        annotations:        c.annotations        || [],
        toolState:          c.toolState          || {},
        reportConfig:       c.toolState?.reportConfig,
        currentImage:       c.currentImage ?? undefined,
    }));
    return { contexts, contextStates };
};

export const createPatientSlice: StateCreator<AppState, [], [], PatientSlice> = (set, get) => ({
    patients: [],
    activePatientId: null,
    studies: [],
    contexts: [],
    contextStates: [],
    activeContextId: null,
    syncStatus: 'synced',
    hasUnsyncedChanges: false,

    setSyncStatus: (status) => set({ syncStatus: status }),
    setHasUnsyncedChanges: (has) => set({ hasUnsyncedChanges: has }),

    refreshPatients: async () => {
        const { token, activeWorkspace } = get();
        if (!token) return;
        const seq = ++patientListSeq;
        const patients = await api.getPatients(activeWorkspace, token);
        if (seq !== patientListSeq) return;
        // A platform admin inspecting a user's study (MON-01): keep that patient loaded
        const insp = get().inspectionMode;
        const kept = insp?.orgId === 'platform' ? get().patients.find((p) => p.id === insp.patientId) : undefined;
        set({ patients: kept && !patients.some((p) => p.id === kept.id) ? [...patients, kept] : patients });
    },

    /**
     * Loads the patient list for the active workspace. If the active patient
     * is still visible it is kept as-is (open workspace untouched); otherwise
     * the workspace is cleared.
     */
    initializeStore: async () => {
        const { token } = get();
        if (!token) return;
        set({ isAuthenticated: true });
        try {
            await get().refreshPatients();
            const { activePatientId, patients } = get();
            if (activePatientId && !patients.some(p => p.id === activePatientId)) {
                get().resetWorkspace();
            }
        } catch (e) {
            console.error('Initialization failed', e);
            set({ patients: [] });
        }
    },

    setActivePatient: async (id, initialContextId = null) => {
        if (!id) {
            console.warn('[setActivePatient] called with falsy id — skipping');
            return 'failed';
        }
        const seq = ++patientLoadSeq;
        const wasDicomMode = get().isDicomMode;

        // Clear EVERYTHING belonging to the previous case before loading.
        set({
            ...emptyCaseState(get()),
            activePatientId: id,
            activeContextId: null,
            contexts: [],
            contextStates: [],
            ...(wasDicomMode ? { managers: {} } : {}),
        });
        const token = get().token;

        try {
            if (!get().patients.find(p => p.id === id)) {
                await get().refreshPatients();
            }

            const fetched = await api.getContexts(id, token);
            if (seq !== patientLoadSeq) return 'superseded'; // a newer patient/context was requested

            const { contexts, contextStates } = mapContexts(fetched);
            const activeState = initialContextId
                ? contextStates.find((s) => s.contextId === initialContextId)
                : undefined;

            set({
                contexts,
                contextStates,
                ...(activeState
                    ? { activeContextId: initialContextId, ...caseStateFromContext(get(), activeState) }
                    : {}),
            });
            return 'loaded';
        } catch (e) {
            console.error('Failed to fetch contexts', e);
            return seq === patientLoadSeq ? 'failed' : 'superseded';
        }
    },

    addPatient: async (patient) => {
        const token = get().token;
        try {
            // Created in the active workspace; personal and org patients never mix (UI12-21)
            const ws = get().activeWorkspace;
            await api.savePatient({ ...patient, organizationId: ws.type === 'organization' ? ws.orgId : null } as Patient, token);
            set((state: AppState) => ({
                patients:        [patient, ...state.patients.filter(p => p.id !== patient.id)],
                activePatientId: patient.id,
            }));
        } catch (e) {
            console.error('Save patient failed', e);
            throw e;
        }
    },

    updatePatient: async (patient) => {
        const token = get().token;
        try {
            await api.savePatient(patient, token);
            set((state: AppState) => ({
                patients: state.patients.map(p => p.id === patient.id ? patient : p),
            }));
        } catch (e) {
            console.error('Update patient failed', e);
            throw e; // callers show the error (UI11-12)
        }
    },

    archivePatient: async (patientId, archived) => {
        const token = get().token;
        try {
            await api.archivePatient(patientId, archived, token);
            set((state: AppState) => ({
                patients: state.patients.map(p =>
                    p.id === patientId ? { ...p, isArchived: archived } : p
                ),
            }));
        } catch (e) {
            console.error('Archive patient failed', e);
            throw e;
        }
    },

    deletePatient: async (patientId) => {
        await api.deletePatient(patientId, get().token);
        if (get().activePatientId === patientId) get().resetWorkspace();
        set((state: AppState) => ({ patients: state.patients.filter((p) => p.id !== patientId) }));
    },

    deleteStudy: async (patientId, studyId) => {
        await api.deleteStudy(studyId, get().token);
        const st = get();
        const affected = st.contexts.filter((c) => c.studyIds?.includes(studyId)).map((c) => c.id);
        if (st.activeContextId && affected.includes(st.activeContextId)) st.closeCase();
        set((state: AppState) => ({
            contexts: state.contexts.filter((c) => !affected.includes(c.id)),
            contextStates: state.contextStates.filter((c) => !affected.includes(c.contextId)),
            patients: state.patients.map((p) => p.id !== patientId ? p : {
                ...p,
                studies: p.studies.filter((s) => s.id !== studyId),
                visits: p.visits.map((v) => ({ ...v, studies: (v.studies || []).filter((s) => s.id !== studyId) })),
            }),
        }));
    },

    addVisit: async (patientId, visit) => {
        const token = get().token;
        try {
            await api.saveVisit(patientId, visit, token);
            await get().refreshPatients();
        } catch (e) {
            console.error('Failed to add visit', e);
            throw e;
        }
    },

    updateVisit: async (patientId, visitId, visit) => {
        const token = get().token;
        try {
            await api.saveVisit(patientId, visit, token);
            set((state: AppState) => {
                const updatedPatients = state.patients.map((p: Patient) =>
                    p.id === patientId
                        ? { ...p, visits: p.visits.map((v: Visit) => v.id === visitId ? visit : v) }
                        : p
                );
                return { patients: updatedPatients };
            });
        } catch (e) {
            console.error('Failed to update visit', e);
            throw e;
        }
    },

    deleteVisit: async (patientId, visitId) => {
        const token = get().token;
        try {
            await api.deleteVisit(visitId, token);
            set((state: AppState) => ({
                patients: state.patients.map((p: Patient) =>
                    p.id === patientId
                        ? { ...p, visits: p.visits.filter((v: Visit) => v.id !== visitId) }
                        : p
                ),
            }));
        } catch (e) {
            console.error('Failed to delete visit', e);
            throw e;
        }
    },

    reorderVisits: async (patientId, visits) => {
        const token = get().token;
        const previous = get().patients.find((p) => p.id === patientId)?.visits;
        const renumbered = visits.map((v: Visit, index: number) => ({
            ...v,
            visitNumber: `#${String(visits.length - index).padStart(4, '0')}`,
        }));
        set((state: AppState) => ({
            patients: state.patients.map((p: Patient) =>
                p.id === patientId ? { ...p, visits: renumbered } : p
            ),
        }));
        try {
            await Promise.all(renumbered.map(v => api.saveVisit(patientId, v, token)));
        } catch (e) {
            console.error('Failed to reorder visits', e);
            // roll back the optimistic reorder
            if (previous) set((state: AppState) => ({ patients: state.patients.map((p: Patient) => p.id === patientId ? { ...p, visits: previous } : p) }));
            throw e;
        }
    },

    addStudy: async (study) => {
        const token     = get().token;
        const workspace = get().activeWorkspace;
        try {
            // Stamp organizationId from active workspace — immutable after creation
            const organizationId = workspace.type === 'organization' ? workspace.orgId : null;
            const studyWithOrg   = { ...study, organizationId, status: study.status ?? 'Draft' } as Study;
            await api.saveStudy(studyWithOrg, token);
            await get().refreshPatients();
        } catch (e) {
            console.error('Add study failed', e);
            throw e;
        }
    },

    updateStudy: async (patientId, studyId, updates) => {
        const token = get().token;
        const patient = get().patients.find((p: Patient) => p.id === patientId);
        if (!patient) return;

        const fromPatient = patient.studies.find((s: Study) => s.id === studyId);
        const fromVisit = patient.visits.flatMap(v => v.studies || []).find((s: Study) => s.id === studyId);
        const existing = fromPatient || fromVisit;
        if (!existing) return;

        const updated: Study = { ...existing, ...updates };
        try {
            await api.saveStudy(updated, token);
            set((state: AppState) => ({
                patients: state.patients.map((p: Patient) =>
                    p.id !== patientId
                        ? p
                        : {
                            ...p,
                            studies: p.studies.map((s: Study) => s.id === studyId ? updated : s),
                            visits: p.visits.map(v => ({
                                ...v,
                                studies: (v.studies || []).map((s: Study) => s.id === studyId ? updated : s),
                            })),
                        }
                ),
            }));
        } catch (e) {
            console.error('Update study failed', e);
            throw e;
        }
    },

    addScan: async (patientId, studyId, scanMetadata, file) => {
        const token = get().token;
        try {
            const { imageUrl } = await api.uploadScan(studyId, scanMetadata, file, token);
            const fullScan: Scan = { ...scanMetadata, imageUrl };
            set((state: AppState) => {
                const updatedPatients = state.patients.map((p: Patient) =>
                    p.id === patientId
                        ? {
                            ...p,
                            studies: p.studies.map((s: Study) =>
                                s.id === studyId
                                    ? { ...s, scans: [...(s.scans || []), fullScan] }
                                    : s
                            ),
                            visits: p.visits.map(v => ({
                                ...v,
                                studies: (v.studies || []).map(s =>
                                    s.id === studyId
                                        ? { ...s, scans: [...(s.scans || []), fullScan] }
                                        : s
                                ),
                            })),
                          }
                        : p
                );
                return { patients: updatedPatients };
            });
            return imageUrl;
        } catch (e) {
            console.error('Upload failed', e);
            throw e;
        }
    },

    addContext: async (context) => {
        const seqAtStart = patientLoadSeq;
        const token = get().token;
        const state = get();
        // Carry over the canvas only from an untitled session: no context is
        // active and the patient has none yet. setActivePatient clears the
        // canvas, so another patient's work can never be carried over here.
        const isFirstContextFromUntitled =
            !state.activeContextId &&
            state.contextStates.length === 0 &&
            (state.measurements.length > 0 ||
                (state.implants?.length ?? 0) > 0 ||
                !!state.currentImage ||
                // an untitled CT/MR series (+ its 3D plan) is work too (UI11-18)
                state.isDicomMode ||
                state.threeDImplants.length > 0 ||
                state.pedicleSimulations.length > 0);

        const measurements = isFirstContextFromUntitled ? state.measurements : [];
        const implants = isFirstContextFromUntitled ? (state.implants || []) : [];
        const threeDImplants = isFirstContextFromUntitled ? state.threeDImplants : [];
        const pedicleSimulations = isFirstContextFromUntitled ? state.pedicleSimulations : [];
        const currentImage = isFirstContextFromUntitled ? (state.currentImage ?? undefined) : undefined;

        // The untitled session's image only exists in this tab (blob: URL).
        // Now that it has a study, upload it and persist the server URL. The
        // live canvas keeps the blob so in-progress work isn't re-initialised;
        // the server ignores blob URLs on later saves and keeps this one.
        let persistedImage = currentImage;
        const studyId = context.studyIds?.[0];
        if (isFirstContextFromUntitled && state.pendingImageFile && currentImage?.startsWith('blob:') && studyId) {
            const today = new Date().toISOString().split('T')[0];
            persistedImage = await get().addScan(
                context.patientId,
                studyId,
                { id: `scan-${crypto.randomUUID()}`, type: 'Pre-op', date: today },
                state.pendingImageFile,
            );
            set({ pendingImageFile: null });
        }

        const payload = {
            ...context,
            state: {
                measurements,
                implants,
                annotations: [],
                toolState: { threeDImplants, pedicleSimulations },
                threeDImplants,
                pedicleSimulations,
                currentImage: persistedImage ?? null,
            },
        };

        try {
            await api.saveContext(payload, token);
            const newState: ContextState = {
                contextId:          context.id,
                measurements,
                implants,
                threeDImplants,
                pedicleSimulations,
                annotations:        [],
                toolState:          { threeDImplants, pedicleSimulations },
                reportConfig:       undefined,
                currentImage:       persistedImage,
            };
            // The user may have opened another patient during the upload/save (UI11-08)
            if (patientLoadSeq !== seqAtStart || get().activePatientId !== context.patientId) return;
            set((s: AppState) => ({
                contexts:        [...s.contexts.filter(c => c.id !== context.id), context],
                contextStates:   [...s.contextStates.filter(c => c.contextId !== context.id), newState],
                activeContextId: context.id,
                ...(isFirstContextFromUntitled
                    // keep the live canvas (blob image, tool state) untouched
                    ? { measurements, implants }
                    : caseStateFromContext(s, newState)),
            }));
        } catch (e) {
            console.error(`[addContext] FAILED id=${context.id}`, e);
            throw e;
        }
    },

    updateContextState: async (contextId: string, updates: Partial<ContextState>) => {
        const state = get();
        const context = state.contexts.find((c: Context) => c.id === contextId);
        if (!context) {
            console.warn(`[updateContextState] context ${contextId} not found — nothing saved`);
            return false;
        }

        const prev = state.contextStates.find((s) => s.contextId === contextId);
        const merged: ContextState = {
            contextId,
            measurements: [],
            implants: [],
            annotations: [],
            toolState: {},
            ...prev,
            ...updates,
        };
        const isActive = contextId === state.activeContextId;

        // Mirror into the live top-level fields for the active context.
        const mirror: Partial<AppState> = isActive ? {
            ...(updates.measurements !== undefined ? { measurements: merged.measurements } : {}),
            ...(updates.implants !== undefined ? { implants: merged.implants || [] } : {}),
            ...(updates.threeDImplants !== undefined ? { threeDImplants: merged.threeDImplants || [] } : {}),
            ...(updates.pedicleSimulations !== undefined ? { pedicleSimulations: merged.pedicleSimulations || [] } : {}),
            ...(updates.currentImage !== undefined && merged.currentImage ? { currentImage: merged.currentImage } : {}),
        } : {};

        // "Last edited" shown on the patients page / dashboard.
        const lastModified = new Date().toISOString();
        set({
            contextStates: prev
                ? state.contextStates.map((s) => s.contextId === contextId ? merged : s)
                : [...state.contextStates, merged],
            contexts: state.contexts.map((c) => c.id === contextId ? { ...c, lastModified } : c),
            ...mirror,
        });
        // View-only session: kept on screen, never sent (the server would refuse) — UI12-10
        if (contextAccess(get(), contextId) === 'view') return true;

        const currentImage = updates.currentImage
            ?? (isActive ? get().currentImage : null)
            ?? merged.currentImage
            ?? null;

        const payload = {
            ...context,
            lastModified,
            state: {
                measurements:       merged.measurements,
                annotations:        merged.annotations,
                toolState: {
                    ...merged.toolState,
                    ...(merged.reportConfig ? { reportConfig: merged.reportConfig } : {}),
                    // 3D plan is stored inside toolState so it persists even
                    // before the server has dedicated columns (BUGS SRV-15).
                    threeDImplants:     merged.threeDImplants     || [],
                    pedicleSimulations: merged.pedicleSimulations || [],
                },
                implants:           merged.implants           || [],
                threeDImplants:     merged.threeDImplants     || [],
                pedicleSimulations: merged.pedicleSimulations || [],
                currentImage,
            },
        };
        const ok = await enqueueContextSave(contextId, payload, get().token);
        // First real work on a Draft study → mark it In Progress so the patients
        // page / dashboard reflect it (UI batch item 14).
        if (ok && (merged.measurements.length > 0 || (merged.implants?.length ?? 0) > 0 || (merged.threeDImplants?.length ?? 0) > 0)) {
            const sid = context.studyIds?.[0];
            const patient = get().patients.find((p) => p.id === context.patientId);
            const study = patient?.studies.find((x) => x.id === sid) ?? patient?.visits.flatMap((v) => v.studies || []).find((x) => x.id === sid);
            if (study && (!study.status || study.status === 'Draft')) {
                void get().updateStudy(context.patientId, study.id, { status: 'In Progress' }).catch(() => {});
            }
        }
        return ok;
    },

    setActiveContextId: (contextId) => {
        if (!contextId) {
            set({ activeContextId: null });
            return;
        }
        const state = get();
        const ctxState = state.contextStates.find((s) => s.contextId === contextId);
        set({
            activeContextId: contextId,
            ...(ctxState ? caseStateFromContext(state, ctxState) : emptyCaseState(state)),
        });
    },

    openStudy: async (patientId, studyId) => {
        // Only create a session when we KNOW the study has none: a superseded or
        // failed load used to look like "no sessions" and made an empty one that
        // then became the latest (UI11-07).
        const status = await get().setActivePatient(patientId);
        if (status === 'superseded' || get().activePatientId !== patientId) return;
        if (status === 'failed') throw new Error("Could not load this patient's sessions. Please try again.");
        const existing = get().contexts
            .filter(c => c.studyIds?.includes(studyId))
            .sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)))[0];
        if (existing) {
            get().setActiveContextId(existing.id);
            return;
        }
        const patient = get().patients.find(p => p.id === patientId);
        const study = patient?.studies.find(s => s.id === studyId)
            ?? patient?.visits.flatMap(v => v.studies || []).find(s => s.id === studyId);
        if (study?.access === 'view') {
            // Not planned yet and we can only look: show the image, create nothing (UI12-10)
            const first = imageScans(study)[0]?.imageUrl;
            if (first) get().loadImage(first);
            return;
        }
        await get().addContext({
            id: `ctx-${crypto.randomUUID()}`,
            patientId,
            visitId: study?.visitId,
            studyIds: [studyId],
            mode: 'plan',
            name: study?.name || `${study?.modality ?? 'Study'} session`,
            lastModified: new Date().toISOString(),
        });
    },

    closeCase: () => set({
        ...emptyCaseState(get()),
        activeContextId: null,
        isComparisonMode: false,
        activeCanvasSide: 'left',
        managers: {},
    }),

    resetWorkspace: () => {
        patientLoadSeq++; // invalidate any in-flight patient load
        set({
            ...emptyCaseState(get()),
            activePatientId: null,
            activeContextId: null,
            contexts: [],
            contextStates: [],
            inspectionMode: null,
            isComparisonMode: false,
            activeCanvasSide: 'left',
            managers: {},
            syncStatus: 'synced',
            hasUnsyncedChanges: false,
        });
    },
});
