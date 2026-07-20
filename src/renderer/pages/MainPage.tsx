import { Button } from "@/components/ui/button";
import { Context, Patient } from "@/lib/store/types";
import { Upload } from "lucide-react";
import { ImportDialog } from "@/features/import-export/ImportDialog";
import { useAppStore } from "@/lib/store/index";
import CanvasWorkspace from "@/features/canvas/CanvasWorkspace";
import { DICOMViewer } from "@/features/dicom/DICOMViewer";
import ReportBuilderWorkspace from "@/features/report/ReportBuilderWorkspace";
import { cn } from "@/lib/utils";

import { useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "@/lib/api";
import { useAutosave } from "@/hooks/useAutosave";

const MainPage = () => {
    useAutosave();
    const navigate = useNavigate();
    const location = useLocation();
    const {
        currentImage,
        activeContextId,
        activePatientId,
        isDicomMode,
        isComparisonMode,
        dicomSeries,
        contexts,
        patients,
        contextStates,
        loadDicomURLs,
        exitDicomMode,
        setActivePatient,
        setActiveContextId,
        initializeLiveRoom,
        disconnectLiveRoom
    } = useAppStore();

    // ── Resolve the current study for logging & DICOM detection ─────────────
    const currentStudy = useMemo(() => {
        if (!activeContextId) return null;
        const context = contexts.find((c: Context) => c.id === activeContextId);
        if (!context) return null;
        const patient = patients.find((p: Patient) => p.id === context.patientId);
        return patient?.studies.find((s: any) => s.id === context.studyIds[0]) ?? null;
    }, [activeContextId, contexts, patients]);

    // Initialize Live Room when context OR patient is active
    useEffect(() => {
        if (activeContextId) {
            initializeLiveRoom(activeContextId);
        } else if (activePatientId && activePatientId.startsWith('quick-')) {
            initializeLiveRoom(activePatientId);
        } else {
            disconnectLiveRoom();
        }
        return () => disconnectLiveRoom();
    }, [activeContextId, activePatientId, initializeLiveRoom, disconnectLiveRoom]);

    // Deep Linking Support
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const pId = queryParams.get('patientId');
        const cId = queryParams.get('contextId');
        const img = queryParams.get('currentImage');

        if (pId) {
            setActivePatient(pId, cId || undefined);
        } else if (cId) {
            setActiveContextId(cId);
        }

        if (img) {
            const decodedImg = decodeURIComponent(img);
            if (decodedImg !== useAppStore.getState().currentImage) {
                const finalUrl = (decodedImg.startsWith('http') || decodedImg.startsWith('blob:'))
                    ? decodedImg
                    : `${API_BASE}/uploads/${decodedImg.split('/').pop()}`;
                useAppStore.setState({ currentImage: finalUrl });
            }
        }
    }, [location.search, setActivePatient, setActiveContextId]);

    // Persist currentImage to context state whenever it changes while a context is active
    useEffect(() => {
        if (activeContextId && currentImage) {
            const state = useAppStore.getState();
            const existingState = state.contextStates.find(s => s.contextId === activeContextId);
            if (existingState?.currentImage !== currentImage) {
                state.updateContextState(activeContextId, { currentImage });
            }
        }
    }, [currentImage, activeContextId]);

    // Populate workspace state from active context (measurements, 3D state, image)
    useEffect(() => {
        if (activeContextId) {
            const contextState = useAppStore.getState().contextStates.find(s => s.contextId === activeContextId);
            if (contextState) {
                const patch: Record<string, unknown> = {};
                if (contextState.measurements) patch.measurements = contextState.measurements;
                if (contextState.implants) patch.implants = contextState.implants;
                if (contextState.threeDImplants) patch.threeDImplants = contextState.threeDImplants;
                if (contextState.pedicleSimulations) patch.pedicleSimulations = contextState.pedicleSimulations;
                // Always restore the context's image when switching contexts — do not
                // guard on !currentImage because a stale image from a previous context
                // should be replaced by the correct one for the newly active context.
                if (contextState.currentImage) {
                    patch.currentImage = contextState.currentImage;
                }
                if (Object.keys(patch).length > 0) {
                    useAppStore.setState(patch);
                }
            }
        }
    }, [activeContextId, contextStates]);

    // DICOM auto-detection: fires when activeContextId changes
    useEffect(() => {
        if (activeContextId) {
            const context = contexts.find((c: Context) => c.id === activeContextId);
            if (context) {
                const patient = patients.find((p: Patient) => p.id === context.patientId);
                const study = patient?.studies.find((s: any) => s.id === context.studyIds[0]);
                if (study && study.scans.length > 0) {
                    const firstScan = study.scans[0];
                    const isDICOM = study.modality === 'CT' || study.modality === 'MRI' || firstScan.imageUrl.toLowerCase().endsWith('.dcm');

                    if (isDICOM) {
                        if (!isDicomMode) {
                            const urls = study.scans.map((s: any) => {
                                const url = s.imageUrl;
                                if (url.startsWith('http') || url.startsWith('blob:')) return url;
                                return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
                            });
                            loadDicomURLs(urls);
                        }
                    } else {
                        if (isDicomMode) {
                            exitDicomMode();
                        }
                    }
                } else {
                    if (isDicomMode) {
                        exitDicomMode();
                    }
                }
            }
        }
    }, [activeContextId, contexts, patients, isDicomMode, loadDicomURLs, exitDicomMode]);

    // ESC Key Navigation Handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                return;

                if (useAppStore.getState().isDicomMode) {
                    useAppStore.getState().clearImage();
                    return;
                }

                const state = useAppStore.getState();
                if (state.currentImage || state.activeContextId) {
                    state.clearImage();
                    state.setActiveContextId(null);
                    return;
                }

                if (location.pathname !== '/workspace' && location.pathname !== '/') {
                    navigate('/dashboard');
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [location.pathname, navigate]);

    // ── Render Decision ──────────────────────────────────────────────────────
    const hasActiveContent = !!currentImage || !!activeContextId || isDicomMode || isComparisonMode;
    const isReportTab = new URLSearchParams(location.search).get('tab') === 'report';
    const renderBranch = isDicomMode ? 'DICOMViewer' : hasActiveContent ? 'CanvasWorkspace' : 'EmptyState';

    // ── [TRACE] Single targeted log — the ONLY place that decides viewer ─────
    console.log(
        `%c[WORKSPACE RENDER] branch=${renderBranch}`,
        `color:${renderBranch === 'DICOMViewer' ? 'red' : renderBranch === 'CanvasWorkspace' ? 'lime' : 'gray'};font-weight:bold`,
        {
            isDicomMode,
            currentImage: currentImage ? currentImage.slice(0, 80) : null,
            dicomSeriesLength: dicomSeries.length,
            activePatientId,
            activeContextId,
            studyId:       currentStudy?.id       ?? null,
            studyModality: currentStudy?.modality  ?? null,
            firstScanUrl:  currentStudy?.scans?.[0]?.imageUrl?.slice(0, 80) ?? null,
        }
    );

    return (
        <div className="h-full w-full flex items-center justify-center relative bg-background overflow-hidden">
            {isDicomMode ? (
                <DICOMViewer fileList={dicomSeries} />
            ) : hasActiveContent ? (
                <>
                    <div className={cn("w-full h-full transition-opacity", isReportTab ? "opacity-0 absolute inset-0 pointer-events-none z-[-1]" : "")}>
                        {isComparisonMode ? (
                            <div className="flex w-full h-full">
                                <CanvasWorkspace side="left" />
                                <CanvasWorkspace side="right" />
                            </div>
                        ) : (
                            <CanvasWorkspace />
                        )}
                    </div>
                    {isReportTab && (
                        <div className="w-full h-full">
                            <ReportBuilderWorkspace />
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center space-y-4 bg-background/5 p-10 rounded-xl border border-white/10 backdrop-blur-sm">
                    <div className="h-24 w-24 bg-muted/20 rounded-full flex items-center justify-center mx-auto ring-4 ring-muted/10">
                        <Upload className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-semibold mb-2 text-foreground">No Image Loaded</h2>
                        <p className="text-muted-foreground max-w-sm mx-auto">
                            Import a scan to begin analysis, or select a patient from the cases menu.
                        </p>
                    </div>
                    <ImportDialog>
                        <Button size="lg" className="gap-2 shadow-lg hover:shadow-xl transition-all">
                            <Upload className="h-4 w-4" />
                            Import Scan
                        </Button>
                    </ImportDialog>
                </div>
            )}
        </div>
    );
};

export default MainPage;
