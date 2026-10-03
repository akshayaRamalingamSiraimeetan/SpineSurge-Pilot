import { Search, Upload, Image as ImageIcon, ChevronRight, FolderOpen, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store/index";
import { useNavigate, useLocation } from "react-router-dom";
import CanvasWorkspace from "@/features/canvas/CanvasWorkspace";
import BottomToolbar from "@/features/canvas/BottomToolbar";
import { useEffect, useMemo, useState } from "react";
import { ImportDialog } from "@/features/import-export/ImportDialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getStudyDisplayName, type Study } from "@/lib/store/types";

type PickerStep = "ROOT" | "PATIENTS" | "STUDIES";

/* ─────────────────────────────────────────────────────────────────────────────
   Image picker dialog — choose an existing study or import a local image.
   Opened from the small import icon in the top-right corner of each pane.
───────────────────────────────────────────────────────────────────────────── */
const PickerDialog = ({ side, label, open, onOpenChange }: {
    side: "left" | "right"; label: string; open: boolean; onOpenChange: (o: boolean) => void;
}) => {
    const patients = useAppStore((s) => s.patients);
    const setComparisonImage = useAppStore((s) => s.setComparisonImage);

    const [step, setStep] = useState<PickerStep>("ROOT");
    const [query, setQuery] = useState("");
    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

    // The import wizard opens on top of this dialog; close once the image arrives.
    const paneImage = useAppStore((s) => (side === "right" ? s.comparison.right.image : s.currentImage));
    useEffect(() => { if (open && paneImage) onOpenChange(false); }, [open, paneImage, onOpenChange]);

    const selectedPatient = useMemo(
        () => patients.find((p) => p.id === selectedPatientId) ?? null,
        [patients, selectedPatientId],
    );
    const filteredPatients = useMemo(() => {
        const q = query.toLowerCase();
        return patients.filter((p) => (p.name || "").toLowerCase().includes(q) || (p.id || "").toLowerCase().includes(q));
    }, [patients, query]);
    const studiesWithScans = useMemo(() => {
        if (!selectedPatient) return [];
        return (selectedPatient.studies ?? [])
            .map((s) => ({ study: s, scans: (s.scans ?? []).filter((sc) => !!sc.imageUrl) }))
            .filter((e) => e.scans.length > 0);
    }, [selectedPatient]);

    const pick = async (study: Study, imageUrl: string) => {
        onOpenChange(false);
        if (side === "right") setComparisonImage("right", imageUrl);
        else await useAppStore.getState().openStudy(study.patientId, study.id); // Image A = the case
    };

    const card = "w-full text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)] group";
    const row = "w-full flex items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)]";
    const iconBox = "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--surface-2)] text-[var(--accent)]";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-[var(--border)]">
                    {step !== "ROOT" && (
                        <button
                            className="self-start text-xs font-semibold text-[var(--accent)] hover:opacity-80 mb-1"
                            onClick={() => setStep(step === "STUDIES" ? "PATIENTS" : "ROOT")}
                        >
                            ← Back
                        </button>
                    )}
                    <DialogTitle>
                        {step === "ROOT" && `Load ${label}`}
                        {step === "PATIENTS" && "Select patient"}
                        {step === "STUDIES" && (selectedPatient?.name || "Select study")}
                    </DialogTitle>
                    <DialogDescription>
                        {step === "ROOT" && (side === "left"
                            ? "Image A is the case image shared with Assessment and Planning."
                            : "Choose an image to compare with the case.")}
                        {step === "PATIENTS" && "Pick a patient to browse their studies."}
                        {step === "STUDIES" && `Pick a scan for ${label}.`}
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[420px]">
                    <div className="p-4 flex flex-col gap-2">
                        {step === "ROOT" && (
                            <>
                                <button className={card} onClick={() => setStep("PATIENTS")}>
                                    <div className="flex items-center gap-3">
                                        <div className={iconBox}><FolderOpen className="h-4 w-4" /></div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-sm text-[var(--text)]">Choose existing study</div>
                                            <div className="text-xs text-[var(--text-3)] mt-0.5">Browse patients already in the system</div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-[var(--text-3)]" />
                                    </div>
                                </button>
                                <ImportDialog targetSide={side === "right" ? "right" : undefined}>
                                    <button className={card}>
                                        <div className="flex items-center gap-3">
                                            <div className={iconBox}><Upload className="h-4 w-4" /></div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm text-[var(--text)]">Import local image</div>
                                                <div className="text-xs text-[var(--text-3)] mt-0.5">DICOM · JPG · PNG · TIFF from your computer</div>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-[var(--text-3)]" />
                                        </div>
                                    </button>
                                </ImportDialog>
                            </>
                        )}

                        {step === "PATIENTS" && (
                            <>
                                <div className="relative mb-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-3)]" />
                                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patients…" className="pl-9 h-8 text-sm" autoFocus />
                                </div>
                                {filteredPatients.length === 0 && (
                                    <div className="text-center py-8 text-sm text-[var(--text-3)]">No patients found</div>
                                )}
                                {filteredPatients.map((p) => {
                                    const scanCount = (p.studies ?? []).reduce((acc, s) => acc + (s.scans?.length ?? 0), 0);
                                    return (
                                        <button key={p.id} className={row} onClick={() => { setSelectedPatientId(p.id); setStep("STUDIES"); }}>
                                            <div className="h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 bg-[var(--surface-2)] text-[var(--accent)]">
                                                {(p.name || "?")[0].toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm truncate text-[var(--text)]">{p.name || "Unnamed patient"}</div>
                                                <div className="text-xs text-[var(--text-3)]">{p.id} · {scanCount} scan{scanCount !== 1 ? "s" : ""}</div>
                                            </div>
                                            <ChevronRight className="h-4 w-4 opacity-50" />
                                        </button>
                                    );
                                })}
                            </>
                        )}

                        {step === "STUDIES" && (
                            <>
                                {studiesWithScans.length === 0 && (
                                    <div className="text-center py-8 text-sm text-[var(--text-3)]">No scans available for this patient</div>
                                )}
                                {studiesWithScans.map(({ study, scans }) => (
                                    <div key={study.id}>
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-1 px-1 text-[var(--text-3)]">
                                            {getStudyDisplayName(study)} · {study.acquisitionDate}
                                        </div>
                                        {scans.map((sc) => (
                                            <button key={sc.id} className={row} onClick={() => void pick(study, sc.imageUrl)}>
                                                <div className={iconBox}><ImageIcon className="h-4 w-4" /></div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-sm truncate text-[var(--text)]">{sc.type} · {sc.date}</div>
                                                    <div className="text-[10px] font-mono truncate text-[var(--text-3)]">{sc.id}</div>
                                                </div>
                                                <ChevronRight className="h-4 w-4 opacity-50" />
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};

/* ─────────────────────────────────────────────────────────────────────────────
   ComparePage — Image A is the case (same image + measurements as Assessment
   and Planning); Image B is the only separate pane and is saved with the case.
   The image toolbar sits in a fixed gutter between the panes (UI5-02).
───────────────────────────────────────────────────────────────────────────── */
const ComparePage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const setComparisonMode  = useAppStore((s) => s.setComparisonMode);
    const setActivePatient   = useAppStore((s) => s.setActivePatient);
    const setActiveContextId = useAppStore((s) => s.setActiveContextId);
    const currentImage       = useAppStore((s) => s.currentImage);
    const isDicomMode        = useAppStore((s) => s.isDicomMode);
    const imageB             = useAppStore((s) => s.comparison.right.image);
    const [confirmReplace, setConfirmReplace] = useState(false);
    const [pickerSide, setPickerSide] = useState<"left" | "right" | null>(null);

    // Deep link (?patientId=&contextId=): load the case, then strip the params.
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const pId = params.get("patientId");
        const cId = params.get("contextId");
        if (!pId && !cId) return;
        params.delete("patientId");
        params.delete("contextId");
        const rest = params.toString();
        navigate({ pathname: location.pathname, search: rest ? `?${rest}` : "" }, { replace: true });
        if (pId) void setActivePatient(pId, cId || undefined);
        else if (cId) setActiveContextId(cId);
    }, [location.search, location.pathname, navigate, setActivePatient, setActiveContextId]);

    // Comparison mode lives only on this page.
    useEffect(() => {
        setComparisonMode(true);
        return () => setComparisonMode(false);
    }, [setComparisonMode]);

    if (isDicomMode) {
        return (
            <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
                Compare works with X-ray images. This case is a CT/MR series — use Planning for 3D work.
            </div>
        );
    }

    const paneLabel = (text: string, hint: string) => (
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm pointer-events-none">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">{text}</span>
            <span className="text-[9px] text-white/50">· {hint}</span>
        </div>
    );

    const importButton = (side: "left" | "right", title: string) => (
        <button
            title={title}
            onClick={(e) => {
                e.stopPropagation();
                if (side === "right" && imageB) setConfirmReplace(true);
                else setPickerSide(side);
            }}
            className="absolute top-2 right-2 z-20 h-8 w-8 grid place-items-center rounded-lg bg-black/60 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-sm transition-colors"
        >
            <ImagePlus className="h-4 w-4" />
        </button>
    );

    const emptyHint = (text: string) => (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <p className="text-xs text-[var(--text-3)] text-center max-w-[240px]">{text}</p>
        </div>
    );

    return (
        <div className="flex h-full bg-background relative p-2">
            <div className="flex-1 min-w-0 flex flex-col relative rounded-xl overflow-hidden border border-[var(--border)]">
                {paneLabel("Image A", "case image")}
                {!currentImage && importButton("left", "Load the case image")}
                {currentImage ? (
                    <CanvasWorkspace side="left" />
                ) : (
                    emptyHint("No case image yet — use the import button in the top-right corner.")
                )}
            </div>

            {/* Fixed toolbar gutter: never moves when the panes change (UI5-02) */}
            <div className="w-[60px] flex-shrink-0 flex items-center justify-center overflow-y-auto py-2">
                <BottomToolbar variant="embedded" />
            </div>

            <div className="flex-1 min-w-0 flex flex-col relative rounded-xl overflow-hidden border border-[var(--border)]">
                {paneLabel("Image B", imageB ? "comparison" : "choose an image")}
                {importButton("right", imageB ? "Replace Image B" : "Load Image B")}
                <CanvasWorkspace side="right" />
                {!imageB && emptyHint("Load an image to compare — use the import button in the top-right corner.")}
            </div>

            {/* Keyed by open state: every opening starts at the first step */}
            <PickerDialog key={`a-${pickerSide === "left"}`} side="left" label="Image A" open={pickerSide === "left"} onOpenChange={(o) => setPickerSide(o ? "left" : null)} />
            <PickerDialog key={`b-${pickerSide === "right"}`} side="right" label="Image B" open={pickerSide === "right"} onOpenChange={(o) => setPickerSide(o ? "right" : null)} />

            <Dialog open={confirmReplace} onOpenChange={setConfirmReplace}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Replace Image B?</DialogTitle>
                        <DialogDescription>Image B and its measurements will be removed so you can choose another image.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setConfirmReplace(false)}>Cancel</Button>
                        <Button onClick={() => {
                            const st = useAppStore.getState();
                            st.setComparisonMeasurements('right', []);
                            st.setComparisonImplants('right', []);
                            st.setComparisonImage('right', null);
                            setConfirmReplace(false);
                            setPickerSide("right");
                        }}>Replace</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ComparePage;
