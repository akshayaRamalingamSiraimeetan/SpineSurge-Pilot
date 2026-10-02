import { Button } from "@/components/ui/button";
import { Context, Patient } from "@/lib/store/types";
import { Upload } from "lucide-react";
import { ImportDialog } from "@/features/import-export/ImportDialog";
import { useAppStore } from "@/lib/store/index";
import CanvasWorkspace from "@/features/canvas/CanvasWorkspace";
import { DICOMViewer } from "@/features/dicom/DICOMViewer";
import ReportBuilderWorkspace from "@/features/report/ReportBuilderWorkspace";
import { cn } from "@/lib/utils";

import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API_BASE } from "@/lib/api";
import { useAutosave } from "@/hooks/useAutosave";

const MainPage = () => {
    useAutosave();
    const navigate = useNavigate();
    const location = useLocation();
    const currentImage      = useAppStore(s => s.currentImage);
    const activeContextId   = useAppStore(s => s.activeContextId);
    const activePatientId   = useAppStore(s => s.activePatientId);
    const isDicomMode       = useAppStore(s => s.isDicomMode);
    const dicomSeries       = useAppStore(s => s.dicomSeries);
    const contexts          = useAppStore(s => s.contexts);
    const patients          = useAppStore(s => s.patients);
    const loadDicomURLs     = useAppStore(s => s.loadDicomURLs);
    const exitDicomMode     = useAppStore(s => s.exitDicomMode);
    const setActivePatient  = useAppStore(s => s.setActivePatient);
    const initializeLiveRoom = useAppStore(s => s.initializeLiveRoom);
    const disconnectLiveRoom = useAppStore(s => s.disconnectLiveRoom);

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

    // Deep link (?patientId=&contextId=&currentImage=): apply ONCE, then strip
    // those params so tab switches / back-forward don't reload the case
    // (BUGS NAV-05). Other params (tab) are kept.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const pId = params.get('patientId');
        const cId = params.get('contextId');
        const img = params.get('currentImage');
        if (!pId && !cId && !img) return;

        const state = useAppStore.getState();
        if (pId && (pId !== state.activePatientId || (cId && cId !== state.activeContextId))) {
            void setActivePatient(pId, cId || undefined);
        } else if (!pId && cId && cId !== state.activeContextId) {
            state.setActiveContextId(cId);
        }

        if (img) {
            const decodedImg = decodeURIComponent(img);
            const finalUrl = (decodedImg.startsWith('http') || decodedImg.startsWith('blob:'))
                ? decodedImg
                : `${API_BASE}/uploads/${decodedImg.split('/').pop()}`;
            if (finalUrl !== useAppStore.getState().currentImage) {
                useAppStore.setState({ currentImage: finalUrl });
            }
        }

        params.delete('patientId');
        params.delete('contextId');
        params.delete('currentImage');
        const rest = params.toString();
        navigate({ pathname: location.pathname, search: rest ? `?${rest}` : '' }, { replace: true });
    }, [location.search, location.pathname, navigate, setActivePatient]);

    // Persist a newly loaded image into the active context (once per change).
    useEffect(() => {
        if (activeContextId && currentImage) {
            const state = useAppStore.getState();
            const existingState = state.contextStates.find(s => s.contextId === activeContextId);
            if (existingState && existingState.currentImage !== currentImage && !currentImage.startsWith('blob:')) {
                void state.updateContextState(activeContextId, { currentImage });
            }
        }
    }, [currentImage, activeContextId]);

    // DICOM auto-detection: decide ONCE per activated context whether it is a
    // CT/MR series. Not re-run on isDicomMode changes, so the user can exit the
    // viewer and import a local series without being bounced (BUGS NAV-06, WS-13).
    const detectedForCtxRef = useRef<string | null>(null);
    useEffect(() => {
        if (!activeContextId) { detectedForCtxRef.current = null; return; }
        if (detectedForCtxRef.current === activeContextId) return;
        const context = contexts.find((c: Context) => c.id === activeContextId);
        if (!context) return; // contexts still loading — retry when they arrive
        const patient = patients.find((p: Patient) => p.id === context.patientId);
        const study = patient?.studies.find((s: any) => s.id === context.studyIds[0]);
        if (!study) return;
        detectedForCtxRef.current = activeContextId;

        const firstScan = study.scans[0];
        const isDICOM = !!firstScan && (study.modality === 'CT' || study.modality === 'MRI' || firstScan.imageUrl.toLowerCase().endsWith('.dcm'));
        const dicomActive = useAppStore.getState().isDicomMode;
        if (isDICOM) {
            if (!dicomActive) {
                loadDicomURLs(study.scans.map((s: any) => {
                    const url = s.imageUrl;
                    if (url.startsWith('http') || url.startsWith('blob:')) return url;
                    return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
                }));
            }
        } else if (dicomActive) {
            exitDicomMode();
        }
    }, [activeContextId, contexts, patients, loadDicomURLs, exitDicomMode]);

    const hasCase = !!currentImage || !!activeContextId;
    const isReportTab = new URLSearchParams(location.search).get('tab') === 'report';
    // Kept mounted (hidden) under the report so returning is instant — the CT
    // series in particular is expensive to reload.
    const hidden = "absolute inset-0 opacity-0 pointer-events-none z-[-1]";

    return (
        <div className="h-full w-full flex items-center justify-center relative bg-background overflow-hidden">
            {isDicomMode ? (
                <div className={cn("w-full h-full", isReportTab && hidden)}>
                    <DICOMViewer fileList={dicomSeries} />
                </div>
            ) : hasCase ? (
                <div className={cn("w-full h-full", isReportTab && hidden)}>
                    <CanvasWorkspace />
                </div>
            ) : !isReportTab && (
                <EmptyImport />
            )}
            {isReportTab && (
                <div className="absolute inset-0">
                    <ReportBuilderWorkspace />
                </div>
            )}
        </div>
    );
};

/** No image yet: the same import entry point on Assessment and Planning. */
export const EmptyImport = ({ title = "No image loaded", hint = "Import an X-ray or a CT/MR series to start. It is shared by Assessment, Planning and Compare (Image A)." }: { title?: string; hint?: string }) => (
    <div className="text-center space-y-4 p-10 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        <div className="h-20 w-20 bg-muted/20 rounded-full flex items-center justify-center mx-auto">
            <Upload className="h-9 w-9 text-muted-foreground" />
        </div>
        <div>
            <h2 className="text-xl font-semibold mb-2 text-foreground">{title}</h2>
            <p className="text-muted-foreground max-w-sm mx-auto text-sm">{hint}</p>
        </div>
        <ImportDialog>
            <Button size="lg" className="gap-2">
                <Upload className="h-4 w-4" />
                Import scan
            </Button>
        </ImportDialog>
    </div>
);

export default MainPage;
