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
    addScan: (patientId: string, studyId: string, scanMetadata: Omit<Scan, 'imageUrl'>, file: File) => Promise<void>;
    addContext: (context: Context) => Promise<void>;
    updateContextState: (contextId: string, updates: Partial<ContextState>) => Promise<void>;
    setActiveContextId: (contextId: string | null) => void;
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
            const patients = await api.getPatients();
            set({ patients, isAuthenticated: true });

            const currentActiveId = get().activePatientId;
            if (patients.length > 0) {
                const idToActivate = currentActiveId && patients.find(p => p.id === currentActiveId)
                    ? currentActiveId
                    : patients[0].id;
                await get().setActivePatient(idToActivate);
            }
        } catch (e) {
            console.error("Initialization failed", e);
        }
    },

    setActivePatient: async (id, initialContextId = null) => {
        set({ activePatientId: id, activeContextId: initialContextId });
        if (id) {
            try {
                // If patient is not in the list, try to fetch it specifically or refresh the list
                const currentPatients = get().patients;
                if (!currentPatients.find(p => p.id === id)) {
                    const allPatients = await api.getPatients();
                    set({ patients: allPatients });
                }

                const fetchedContexts = await api.getContexts(id);
                const contexts: Context[] = fetchedContexts.map((c: any) => ({
                    id: c.id,
                    patientId: c.patientId,
                    visitId: c.visitId,
                    studyIds: c.studyIds,
                    mode: c.mode,
                    name: c.name,
                    lastModified: c.lastModified
                }));

                const contextStates: ContextState[] = fetchedContexts.map((c: any) => ({
                    contextId: c.id,
                    measurements: c.measurements || [],
                    implants: c.implants || [],
                    threeDImplants: c.threeDImplants || [],
                    pedicleSimulations: c.pedicleSimulations || [],
                    annotations: c.annotations || [],
                    toolState: c.toolState || {},
                    currentImage: c.currentImage
                }));

                set({ contexts, contextStates });
            } catch (e) {
                console.error("Failed to fetch contexts", e);
            }
        }
    },

    addPatient: async (patient) => {
        try {
            await api.savePatient(patient);
            set((state: AppState) => ({
                patients: [patient, ...state.patients],
                activePatientId: patient.id
            }));
        } catch (e) {
            console.error("Save patient failed", e);
        }
    },

    updatePatient: async (patient) => {
        try {
            await api.savePatient(patient);
            set((state: AppState) => ({
                patients: state.patients.map(p => p.id === patient.id ? patient : p)
            }));
        } catch (e) {
            console.error("Update patient failed", e);
        }
    },

    archivePatient: async (patientId, archived) => {
        try {
            await api.archivePatient(patientId, archived);
            set((state: AppState) => ({
                patients: state.patients.map(p =>
                    p.id === patientId ? { ...p, isArchived: archived } : p
                )
            }));
        } catch (e) {
            console.error("Archive patient failed", e);
        }
    },

    addVisit: async (patientId, visit) => {
        try {
            await api.saveVisit(patientId, visit);
            await get().initializeStore(); // Refresh to get linked studies from backend
        } catch (e) {
            console.error("Failed to add visit", e);
        }
    },

    updateVisit: async (patientId, visitId, visit) => {
        try {
            await api.saveVisit(patientId, visit);
            set((state: AppState) => {
                const updatedPatients = state.patients.map((p: Patient) =>
                    p.id === patientId
                        ? { ...p, visits: p.visits.map((v: Visit) => v.id === visitId ? visit : v) }
                        : p
                );
                return { patients: updatedPatients };
            });
        } catch (e) {
            console.error("Failed to update visit", e);
        }
    },

    deleteVisit: (patientId, visitId) => {
        set((state: AppState) => {
            const updatedPatients = state.patients.map((p: Patient) =>
                p.id === patientId
                    ? { ...p, visits: p.visits.filter((v: Visit) => v.id !== visitId) }
                    : p
            );
            api.deleteVisit(visitId);
            return { patients: updatedPatients };
        });
    },

    reorderVisits: async (patientId, visits) => {
        try {
            set((state: AppState) => {
                const updatedPatients = state.patients.map((p: Patient) =>
                    p.id === patientId
                        ? {
                            ...p,
                            visits: visits.map((v: Visit, index: number) => ({
                                ...v,
                                visitNumber: `#${String(visits.length - index).padStart(4, '0')}`
                            }))
                        }
                        : p
                );
                return { patients: updatedPatients };
            });
            await Promise.all(visits.map(v => api.saveVisit(patientId, v)));
        } catch (e) {
            console.error("Failed to reorder visits", e);
        }
    },

    addStudy: async (study) => {
        try {
            await api.saveStudy(study as Study);
            await get().initializeStore(); // Refresh to get proper linking
        } catch (e) {
            console.error("Add study failed", e);
            throw e;
        }
    },

    addScan: async (patientId, studyId, scanMetadata, file) => {
        try {
            const { imageUrl } = await api.uploadScan(studyId, scanMetadata, file);
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
                                )
                            }))
                        }
                        : p
                );
                return { patients: updatedPatients };
            });
        } catch (e) {
            console.error("Upload failed", e);
            throw e;
        }
    },

    addContext: async (context) => {
        try {
            await api.saveContext(context);
            set((state: AppState) => ({
                contexts: [...state.contexts, context],
                activeContextId: context.id,
                contextStates: [...state.contextStates, {
                    contextId: context.id,
                    measurements: [],
                    implants: [],
                    annotations: [],
                    toolState: {}
                }]
            }));
        } catch (e) {
            console.error("Add context failed", e);
            throw e;
        }
    },

    updateContextState: async (contextId: string, updates: Partial<ContextState>) => {
        set((state: AppState) => {
            const context = state.contexts.find((c: Context) => c.id === contextId);
            if (!context) return state;

            const updatedStates = state.contextStates.map((s: ContextState) =>
                s.contextId === contextId ? { ...s, ...updates } : s
            );

            const stateForServer = updatedStates.find((s: ContextState) => s.contextId === contextId);
            if (stateForServer) {
                api.saveContext({
                    ...context,
                    state: {
                        measurements: stateForServer.measurements,
                        annotations: stateForServer.annotations,
                        toolState: stateForServer.toolState,
                        implants: stateForServer.implants || [],
                        threeDImplants: stateForServer.threeDImplants || [],
                        pedicleSimulations: stateForServer.pedicleSimulations || [],
                        currentImage: stateForServer.currentImage
                    }
                }).catch(e => console.error("Context sync failed", e));
            }
            return { contextStates: updatedStates };
        });
    },

    setActiveContextId: (contextId) => set({ activeContextId: contextId }),
});
