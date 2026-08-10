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
    
    // Autosave state
    syncStatus: 'synced' | 'unsynced' | 'saving' | 'error';
    hasUnsyncedChanges: boolean;
    setSyncStatus: (status: 'synced' | 'unsynced' | 'saving' | 'error') => void;
    setHasUnsyncedChanges: (has: boolean) => void;

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
    updateContextState: (contextId: string, updates: Partial<ContextState>) => Promise<boolean>;
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
    syncStatus: 'synced',
    hasUnsyncedChanges: false,
    
    setSyncStatus: (status) => set({ syncStatus: status }),
    setHasUnsyncedChanges: (has) => set({ hasUnsyncedChanges: has }),

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

        // Reset DICOM state immediately when switching to any patient/study.
        // Only clear currentImage when actually switching to a *different* patient —
        // reloading the same patient (e.g. after addVisit/addStudy) must not erase
        // the workspace image or measurements.
        const wasDicomMode = get().isDicomMode;
        const previousPatientId = get().activePatientId;
        const isSwitchingPatient = previousPatientId !== id;

        set({
            activePatientId: id,
            activeContextId: initialContextId,
            isDicomMode: false,
            dicomSeries: [],
            // Clear currentImage immediately (synchronously) whenever we're opening a
            // specific context. This prevents a stale in-memory blob URL from a previous
            // session rendering in CanvasWorkspace before the async context fetch
            // completes and sets the correct restored value.
            // If no initialContextId is given (generic patient switch), only clear when
            // actually switching to a different patient to preserve same-patient reloads.
            ...(initialContextId || isSwitchingPatient ? { currentImage: null } : {}),
            ...(wasDicomMode ? { managers: {} } : {}),
        });
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
                reportConfig:       c.toolState?.reportConfig,
                currentImage:       c.currentImage,
                comparisonLeft:     c.comparisonLeft,
                comparisonRight:    c.comparisonRight,
                viewportState:      c.viewportState ?? null,
            }));

            const activeState = initialContextId
                ? contextStates.find((s) => s.contextId === initialContextId)
                : null;

            // On same-patient reloads (initialContextId is null but we already have an
            // active context), restore the saved image from the matching contextState so
            // addVisit / addStudy refreshes don't lose the workspace image.
            const fallbackContextId = !initialContextId ? get().activeContextId : null;
            const fallbackState = fallbackContextId
                ? contextStates.find((s) => s.contextId === fallbackContextId)
                : null;

        set({
            contexts,
            contextStates,
            ...(activeState ? {
                measurements: activeState.measurements ?? [],
                implants: activeState.implants ?? [],
                // Always set currentImage from the server response, even if null.
                // This prevents a stale blob: URL from a previous session surviving
                // into the restored workspace. If the server has no image, null is
                // the correct value — CanvasWorkspace falls back to Priority 4 (scan record).
                currentImage: activeState.currentImage ?? null,
                ...(activeState.viewportState ? { canvas: { ...get().canvas, ...activeState.viewportState } } : {}),
            } : fallbackState ? {
                measurements: fallbackState.measurements ?? [],
                implants: fallbackState.implants ?? [],
                currentImage: fallbackState.currentImage ?? null,
                ...(fallbackState.viewportState ? { canvas: { ...get().canvas, ...fallbackState.viewportState } } : {}),
            } : {
                // No context state found — clear any stale currentImage so the
                // workspace doesn't render a broken blob from a previous session.
                currentImage: null,
            }),
        });

        // ── DIAGNOSTIC: print the restored ID chain so we can verify ──
        // Context → Study → Scan → imageUrl at the moment of restoration
        const patientsNow      = get().patients;
        const contextsNow      = get().contexts;
        const contextStatesNow = get().contextStates;
        contextStatesNow.forEach(cs => {
            const ctx     = contextsNow.find(c => c.id === cs.contextId);
            if (!ctx) return;
            const patient = patientsNow.find(p => p.id === ctx.patientId);
            ctx.studyIds.forEach(sid => {
                const study = patient?.studies?.find(s => s.id === sid);
                console.log(
                    `[DIAG setActivePatient] context=${ctx.id} patientId=${ctx.patientId}` +
                    ` studyId=${sid} studyFound=${!!study}` +
                    ` scanCount=${study?.scans?.length ?? 'N/A'}` +
                    ` scans=${JSON.stringify(study?.scans?.map(sc => sc.imageUrl) ?? [])}` +
                    ` ctxCurrentImage=${cs.currentImage ?? 'null'}`
                );
            });
            if (ctx.studyIds.length === 0) {
                console.log(`[DIAG setActivePatient] context=${ctx.id} patientId=${ctx.patientId} studyIds=[] — NO STUDY LINKED`);
            }
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
            // Update patients list in-place instead of calling initializeStore(),
            // which would invoke setActivePatient and clear the workspace image.
            set((state: AppState) => ({
                patients: state.patients.map((p: Patient) =>
                    p.id === patientId
                        ? { ...p, visits: [...(p.visits || []), visit] }
                        : p
                ),
            }));
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
        console.log(`[TRACE] addStudy ENTER studyId=${study.id} patientId=${study.patientId} modality=${study.modality}`);
        const token     = get().token;
        const workspace = get().activeWorkspace;
        try {
            // Stamp organizationId from active workspace — immutable after creation
            const organizationId = workspace.type === 'organization' ? workspace.orgId : null;
            const studyWithOrg   = { ...study, organizationId, status: study.status ?? 'Draft' } as Study;
            await api.saveStudy(studyWithOrg, token);
            // Update patients list in-place instead of calling initializeStore(),
            // which would invoke setActivePatient and clear the workspace image.
            // Always include scans:[] so study.scans is never undefined in consumers.
            const studyWithScans: Study = { scans: [], ...studyWithOrg };
            set((state: AppState) => ({
                patients: state.patients.map((p: Patient) =>
                    p.id === study.patientId
                        ? { ...p, studies: [...(p.studies || []), studyWithScans] }
                        : p
                ),
            }));
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
        console.log(`[TRACE] addScan ENTER patientId=${patientId} studyId=${studyId} scanId=${scanMetadata.id} fileName=${file.name}`);
        const token = get().token;
        try {
            const { imageUrl } = await api.uploadScan(studyId, scanMetadata, file, token);
            console.log(`[TRACE] addScan uploadScan OK scanId=${scanMetadata.id} studyId=${studyId} imageUrl=${imageUrl}`);
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
        // Only capture the image URL if it is a real server URL — never capture a
        // session-only blob: reference which would become broken on next load.
        const rawContextImage = isFirstContextFromUntitled ? (state.currentImage ?? undefined) : undefined;
        const currentImage = rawContextImage?.startsWith('blob:') ? undefined : rawContextImage;

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
                        reportConfig: undefined,
                        ...(currentImage ? { currentImage } : {}),
                    },
                ],
                // Only overwrite root measurements/implants/image when we actually
                // captured them from the untitled workspace. If isFirstContextFromUntitled
                // is false the store already has the correct live values — don't touch them.
                ...(isFirstContextFromUntitled ? {
                    measurements,
                    implants,
                    ...(currentImage ? { currentImage } : {}),
                } : {}),
            }));
        } catch (e) {
            console.error(`[addContext] FAILED id=${context.id}`, e);
            throw e;
        }
    },

    updateContextState: async (contextId: string, updates: Partial<ContextState>) => {
        const token = get().token;
        let payloadToSave: any = null;

        set((state: AppState) => {
            const context = state.contexts.find((c: Context) => c.id === contextId);
            if (!context) {
                console.warn(`[updateContextState] EARLY RETURN — context ${contextId} not found`);
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
                // Build the image URL to persist. Priority:
                // 1. Explicitly passed updates.currentImage (if not a blob)
                // 2. Already-saved stateForServer.currentImage (the last good server URL)
                // 3. state.currentImage from the store — but ONLY if it's a real server URL,
                //    not a session-only blob: reference
                // 4. null
                const explicitImage  = updates.currentImage;
                const savedImage     = stateForServer.currentImage;
                const storeImage     = state.currentImage;

                const isUsable = (url: string | null | undefined): url is string =>
                    !!url && !url.startsWith('blob:');

                const currentImage = isUsable(explicitImage)
                    ? explicitImage
                    : isUsable(savedImage)
                        ? savedImage
                        : isUsable(storeImage)
                            ? storeImage
                            : null;
                payloadToSave = {
                    ...context,
                    state: {
                        measurements:       stateForServer.measurements,
                        annotations:        stateForServer.annotations,
                        toolState:          {
                            ...stateForServer.toolState,
                            ...(stateForServer.reportConfig ? { reportConfig: stateForServer.reportConfig } : {})
                        },
                        implants:           stateForServer.implants           || [],
                        threeDImplants:     stateForServer.threeDImplants     || [],
                        pedicleSimulations: stateForServer.pedicleSimulations || [],
                        currentImage,
                        // Persist comparison side state alongside the main context
                        ...(stateForServer.comparisonLeft  ? { comparisonLeft:  stateForServer.comparisonLeft  } : {}),
                        ...(stateForServer.comparisonRight ? { comparisonRight: stateForServer.comparisonRight } : {}),
                        // Persist canvas viewport so zoom/pan/rotation/windowing survive reload
                        ...(stateForServer.viewportState   ? { viewportState:   stateForServer.viewportState   } : {}),
                    },
                };
            }
            return { contextStates: updatedStates, ...storeMirror };
        });

        if (payloadToSave) {
            try {
                await api.saveContext(payloadToSave, token);
                return true;
            } catch (e) {
                console.error(`[updateContextState] SAVE FAILED contextId=${contextId}`, e);
                return false;
            }
        }
        return true;
    },

    setActiveContextId: (contextId) => set((state) => {
        if (!contextId) {
            return { activeContextId: null };
        }

        const ctxState = state.contextStates.find((s) => s.contextId === contextId);
        return {
            activeContextId: contextId,
            ...(ctxState ? {
                measurements:       ctxState.measurements      ?? [],
                implants:           ctxState.implants          ?? [],
                threeDImplants:     ctxState.threeDImplants    ?? [],
                pedicleSimulations: ctxState.pedicleSimulations ?? [],
                ...(ctxState.currentImage   ? { currentImage: ctxState.currentImage } : {}),
                ...(ctxState.viewportState  ? { canvas: { ...state.canvas, ...ctxState.viewportState } } : {}),
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
