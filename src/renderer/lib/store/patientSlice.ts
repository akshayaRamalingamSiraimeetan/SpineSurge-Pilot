import { StateCreator } from 'zustand';
import { Patient, Study, Scan, Visit, Context, ContextState } from './types';
import { api } from '../api';
import type { AppState } from './index';

export interface PatientSlice {
    patients: Patient[];
    activePatientId: string | null;
    studies: Study[];
    contexts: Context[];
    contextStates: ContextState[];
    activeContextId: string | null;

    initializeStore: () => Promise<void>;
    setActivePatient: (patientId: string, initialContextId?: string | null) => Promise<void>;
    addPatient: (patient: Patient) => Promise<void>;
    updatePatient: (patient: Patient) => Promise<void>;
    archivePatient: (patientId: string, archived: boolean) => Promise<void>;
    addVisit: (patientId: string, visit: Visit) => Promise<void>;
    updateVisit: (patientId: string, visitId: string, visit: Visit) => Promise<void>;
    deleteVisit: (patientId: string, visitId: string) => void;
    reorderVisits: (patientId: string, visits: Visit[]) => Promise<void>;
    addStudy: (study: Omit<Study, 'scans'>) => Promise<void>;
    updateStudy: (patientId: string, studyId: string, updates: Partial<Pick<Study, 'name' | 'status' | 'modality' | 'source' | 'acquisitionDate' | 'visitId'>>) => Promise<void>;
    addScan: (patientId: string, studyId: string, scanMetadata: Omit<Scan, 'imageUrl'>, file: File) => Promise<void>;
    addContext: (context: Context) => Promise<void>;
    updateContextState: (contextId: string, updates: Partial<ContextState>) => Promise<void>;
    setActiveContextId: (contextId: string | null) => void;
    resetWorkspace: () => void;
}

export const createPatientSlice: StateCreator<AppState, [], [], PatientSlice> = (set, get) => ({
    patients: [],
    activePatientId: null,
    studies: [],
    contexts: [],
    contextStates: [],
    activeContextId: null,

    initializeStore: async () => {
        try {
            const workspace = get().activeWorkspace;
            const token     = get().token;
            const patients  = await api.getPatients(workspace, token);
            set({ patients, isAuthenticated: true });

            const currentActiveId = get().activePatientId;
            if (currentActiveId && patients.length > 0) {
                const idToActivate = patients.find(p => p.id === currentActiveId) ? currentActiveId : null;
                if (idToActivate) {
                    await get().setActivePatient(idToActivate);
                } else {
                    set({ activePatientId: null, contexts: [], contextStates: [] });
                }
            } else {
                set({ activePatientId: null, contexts: [], contextStates: [] });
            }
        } catch (e) {
            console.error('Initialization failed', e);
        }
    },

    setActivePatient: async (id, initialContextId = null) => {
        if (!id) {
            console.warn('[setActivePatient] called with falsy id — skipping');
            return;
        }

        set({ activePatientId: id, activeContextId: initialContextId });
        const token = get().token;

        try {
            // Re-use already-loaded patients from store; only fall back to fresh fetch if missing
            const currentPatients = get().patients;
            if (!currentPatients.find(p => p.id === id)) {
                const workspace  = get().activeWorkspace;
                const allPatients = await api.getPatients(workspace, token);
                set({ patients: allPatients });
            }

            const fetchedContexts = await api.getContexts(id, token);
            const contexts: Context[] = fetchedContexts.map((c: any) => ({
                id:           c.id,
                patientId:    c.patientId,
                visitId:      c.visitId,
                studyIds:     c.studyIds,
                mode:         c.mode,
                name:         c.name,
                lastModified: c.lastModified,
            }));

            const contextStates: ContextState[] = fetchedContexts.map((c: any) => ({
                contextId:          c.id,
                measurements:       c.measurements       || [],
                implants:           c.implants           || [],
                threeDImplants:     c.threeDImplants     || [],
                pedicleSimulations: c.pedicleSimulations || [],
                annotations:        c.annotations        || [],
                toolState:          c.toolState          || {},
                currentImage:       c.currentImage,
            }));

            const activeState = initialContextId
                ? contextStates.find((s) => s.contextId === initialContextId)
                : null;

            set({
                contexts,
                contextStates,
                ...(activeState ? {
                    measurements: activeState.measurements ?? [],
                    implants: activeState.implants ?? [],
                    ...(activeState.currentImage ? { currentImage: activeState.currentImage } : {}),
                } : {}),
            });
        } catch (e) {
            console.error('Failed to fetch contexts', e);
        }
    },

    addPatient: async (patient) => {
        const token = get().token;
        try {
            await api.savePatient(patient, token);
            set((state: AppState) => ({
                patients:        [patient, ...state.patients],
                activePatientId: patient.id,
            }));
        } catch (e) {
            console.error('Save patient failed', e);
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
        }
    },

    addVisit: async (patientId, visit) => {
        const token = get().token;
        try {
            await api.saveVisit(patientId, visit, token);
            await get().initializeStore();
        } catch (e) {
            console.error('Failed to add visit', e);
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
        }
    },

    deleteVisit: (patientId, visitId) => {
        const token = get().token;
        set((state: AppState) => {
            const updatedPatients = state.patients.map((p: Patient) =>
                p.id === patientId
                    ? { ...p, visits: p.visits.filter((v: Visit) => v.id !== visitId) }
                    : p
            );
            api.deleteVisit(visitId, token);
            return { patients: updatedPatients };
        });
    },

    reorderVisits: async (patientId, visits) => {
        const token = get().token;
        try {
            set((state: AppState) => {
                const updatedPatients = state.patients.map((p: Patient) =>
                    p.id === patientId
                        ? {
                            ...p,
                            visits: visits.map((v: Visit, index: number) => ({
                                ...v,
                                visitNumber: `#${String(visits.length - index).padStart(4, '0')}`,
                            })),
                          }
                        : p
                );
                return { patients: updatedPatients };
            });
            await Promise.all(visits.map(v => api.saveVisit(patientId, v, token)));
        } catch (e) {
            console.error('Failed to reorder visits', e);
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
            await get().initializeStore();
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
        } catch (e) {
            console.error('Upload failed', e);
            throw e;
        }
    },

    addContext: async (context) => {
        const token = get().token;
        const state = get();
        const isFirstContextFromUntitled =
            state.contextStates.length === 0 &&
            (state.measurements.length > 0 ||
                (state.implants?.length ?? 0) > 0 ||
                !!state.currentImage);

        const measurements = isFirstContextFromUntitled ? state.measurements : [];
        const implants = isFirstContextFromUntitled ? (state.implants || []) : [];
        const currentImage = isFirstContextFromUntitled ? (state.currentImage ?? undefined) : undefined;

        const payload = isFirstContextFromUntitled
            ? {
                ...context,
                state: {
                    measurements,
                    implants,
                    annotations: [],
                    toolState: {},
                    currentImage: currentImage ?? null,
                },
            }
            : context;

        try {
            console.log(`[addContext] Saving new context id=${context.id} patient=${context.patientId} studyIds=${JSON.stringify(context.studyIds)} measurements=${measurements.length}`);
            await api.saveContext(payload, token);
            console.log(`[addContext] Save OK id=${context.id}`);
            set((state: AppState) => ({
                contexts:      [...state.contexts, context],
                activeContextId: context.id,
                contextStates: [
                    ...state.contextStates,
                    {
                        contextId:    context.id,
                        measurements,
                        implants,
                        annotations:  [],
                        toolState:    {},
                        ...(currentImage ? { currentImage } : {}),
                    },
                ],
                measurements,
                implants,
                ...(currentImage ? { currentImage } : {}),
            }));
        } catch (e) {
            console.error(`[addContext] FAILED id=${context.id}`, e);
            throw e;
        }
    },

    updateContextState: async (contextId: string, updates: Partial<ContextState>) => {
        const token = get().token;
        set((state: AppState) => {
            const context = state.contexts.find((c: Context) => c.id === contextId);
            if (!context) {
                console.warn(`[updateContextState] EARLY RETURN — context ${contextId} not found in state.contexts (count=${state.contexts.length})`);
                return state;
            }

            const updatedStates = state.contextStates.map((s: ContextState) =>
                s.contextId === contextId ? { ...s, ...updates } : s
            );

            const stateForServer = updatedStates.find((s: ContextState) => s.contextId === contextId);
            const mirrorActiveContext = contextId === state.activeContextId && stateForServer;
            const storeMirror: Partial<AppState> = mirrorActiveContext ? {
                ...(updates.measurements !== undefined ? { measurements: stateForServer!.measurements } : {}),
                ...(updates.implants !== undefined ? { implants: stateForServer!.implants || [] } : {}),
                ...(updates.currentImage !== undefined && stateForServer!.currentImage
                    ? { currentImage: stateForServer!.currentImage }
                    : {}),
            } : {};

            if (stateForServer) {
                // Always include the current canvas image so it survives page reload
                const currentImage = updates.currentImage ?? state.currentImage ?? stateForServer.currentImage ?? null;

                const payload = {
                    ...context,
                    state: {
                        measurements:       stateForServer.measurements,
                        annotations:        stateForServer.annotations,
                        toolState:          stateForServer.toolState,
                        implants:           stateForServer.implants           || [],
                        threeDImplants:     stateForServer.threeDImplants     || [],
                        pedicleSimulations: stateForServer.pedicleSimulations || [],
                        currentImage,
                    },
                };
                console.log(`[updateContextState] SAVING contextId=${contextId} measurements=${stateForServer.measurements.length} annotations=${Array.isArray(stateForServer.annotations) ? stateForServer.annotations.length : 0} currentImage=${currentImage}`);

                api.saveContext(payload, token)
                    .then(() => console.log(`[updateContextState] SAVE OK contextId=${contextId}`))
                    .catch(e => console.error(`[updateContextState] SAVE FAILED contextId=${contextId}`, e));
            }
            return { contextStates: updatedStates, ...storeMirror };
        });
    },

    setActiveContextId: (contextId) => set((state) => {
        if (!contextId) {
            return { activeContextId: null };
        }

        const ctxState = state.contextStates.find((s) => s.contextId === contextId);
        return {
            activeContextId: contextId,
            ...(ctxState ? {
                measurements: ctxState.measurements ?? [],
                implants: ctxState.implants ?? [],
                ...(ctxState.currentImage ? { currentImage: ctxState.currentImage } : {}),
            } : {}),
        };
    }),
    resetWorkspace: () => set({
        activePatientId: null,
        activeContextId: null,
        contexts: [],
        contextStates: [],
        currentImage: null,
        measurements: [],
        implants: [],
        isDicomMode: false,
        dicomSeries: [],
        inspectionMode: null,
        isComparisonMode: false,
        activeCanvasSide: 'left',
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
        comparison: {
            left: {
                image: null,
                measurements: [],
                implants: [],
                canvas: { zoom: 1, rotation: 0, brightness: 100, contrast: 100, sharpness: 0, flipX: false, pan: { x: 0, y: 0 }, pixelToMm: null, calibrationApplied: false, calibrationEnabledAt: null }
            },
            right: {
                image: null,
                measurements: [],
                implants: [],
                canvas: { zoom: 1, rotation: 0, brightness: 100, contrast: 100, sharpness: 0, flipX: false, pan: { x: 0, y: 0 }, pixelToMm: null, calibrationApplied: false, calibrationEnabledAt: null }
            }
        }
    }),
});
