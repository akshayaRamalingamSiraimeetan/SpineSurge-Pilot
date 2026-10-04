import { Search, Upload, Image as ImageIcon, ChevronRight, FolderOpen, ImagePlus, ClipboardList } from "lucide-react";
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
import { getStudyDisplayName, type Context, type ContextState, type Measurement, type Study } from "@/lib/store/types";
import type { Measurement as CMeasurement } from "@/lib/canvas/CanvasManager";
import { api } from "@/lib/api";
import { mapContexts } from "@/lib/store/patientSlice";
import { WORKING_PLAN } from "@/lib/store/comparisonSlice";
import { getSavedPlans, isPlanMeasurement } from "@/features/planning2d/plan";
import { isVolumeModality } from "@/features/dicom/dicomPersistence";
import { imageScans } from "@/lib/studies";

type PickerStep = "ROOT" | "PATIENTS" | "STUDIES" | "VERSIONS";

/** One choosable version of a scan: No plan (preop), a saved plan, or the working plan. */
interface VersionOption { planId: string | null; name: string; hint: string }

/** Identity of a compare selection — A and B may not be identical (UI12-02). */
const selectionKey = (studyId: string | null | undefined, image: string | null | undefined, planId: string | null | undefined) =>
    studyId && image ? `${studyId}|${image}|${planId ?? ""}` : null;

/** The session of this scan: the one showing that image, else the study's only/latest session. */
function sessionForScan(study: Study, imageUrl: string, contexts: Context[], states: ContextState[]): ContextState | null {
    const ofStudy = contexts.filter((c) => c.studyIds?.includes(study.id))
        .sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)));
    const exact = ofStudy.map((c) => states.find((cs) => cs.contextId === c.id)).find((cs) => cs?.currentImage === imageUrl);
    if (exact) return exact;
    if (imageScans(study).length > 1 || !ofStudy[0]) return null;
    return states.find((cs) => cs.contextId === ofStudy[0].id) ?? null;
}

function versionsOf(cs: ContextState | null): VersionOption[] {
    const out: VersionOption[] = [{ planId: null, name: "No plan", hint: "Preop image — assessment measurements" }];
    if (!cs) return out;
    getSavedPlans(cs.toolState).forEach((p) => out.push({ planId: p.id, name: p.name, hint: `Saved plan · ${new Date(p.savedAt).toLocaleDateString()}` }));
    const hasWorking = (cs.measurements ?? []).some((m) => isPlanMeasurement(m as unknown as CMeasurement)) || (cs.implants?.length ?? 0) > 0;
    if (hasWorking) out.push({ planId: WORKING_PLAN, name: "Current working plan", hint: "The plan as it is now in Planning (may be unsaved)" });
    return out;
}

/** Measurements/implants of a scan session for one version (deep copies — never the session's objects). */
function snapshotFor(cs: ContextState | null, planId: string | null) {
    if (!cs) return { measurements: [] as Measurement[], implants: [] as unknown[] };
    const all = (cs.measurements ?? []) as unknown as CMeasurement[];
    const preop = all.filter((m) => !isPlanMeasurement(m));
    let measurements: unknown[] = preop, implants: unknown[] = [];
    if (planId === WORKING_PLAN) { measurements = all; implants = cs.implants ?? []; }
    else if (planId) {
        const plan = getSavedPlans(cs.toolState).find((p) => p.id === planId);
        if (plan) { measurements = [...preop, ...plan.measurements]; implants = plan.implants; }
    }
    return JSON.parse(JSON.stringify({ measurements, implants })) as { measurements: Measurement[]; implants: unknown[] };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Image picker dialog — choose a study image + version (No plan / Plan …), or
   import a new image. Opened from the icon in each pane's corner.
───────────────────────────────────────────────────────────────────────────── */
const PickerDialog = ({ side, label, open, onOpenChange }: {
    side: "left" | "right"; label: string; open: boolean; onOpenChange: (o: boolean) => void;
}) => {
    const patients = useAppStore((s) => s.patients);

    const [step, setStep] = useState<PickerStep>("ROOT");
    const [query, setQuery] = useState("");
    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
    const [sessions, setSessions] = useState<{ contexts: Context[]; states: ContextState[] } | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [chosen, setChosen] = useState<{ study: Study; imageUrl: string; scanLabel: string } | null>(null);

    // The import wizard opens on top of this dialog; close once a NEW image arrives.
    const paneImage = useAppStore((s) => (side === "right" ? s.comparison.right.image : s.currentImage));
    const [imageAtOpen] = useState(paneImage);
    useEffect(() => { if (open && paneImage && paneImage !== imageAtOpen) onOpenChange(false); }, [open, paneImage, imageAtOpen, onOpenChange]);

    // The other pane's selection — the same image + version can't be shown twice.
    const otherKey = useAppStore((s) => {
        if (side === "right") {
            const ctx = s.contexts.find((c) => c.id === s.activeContextId);
            return selectionKey(ctx?.studyIds?.[0], s.currentImage, s.comparison.left.planId ?? null);
        }
        const src = s.comparison.right.source;
        return selectionKey(src?.studyId, s.comparison.right.image, src?.planId ?? null);
    });

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
            .filter((s) => !isVolumeModality(s.modality))
            .map((s) => ({ study: s, scans: imageScans(s).filter((sc) => !!sc.imageUrl) }))
            .filter((e) => e.scans.length > 0);
    }, [selectedPatient]);

    /** Sessions (and so the saved plans) of the chosen patient. */
    const choosePatient = async (patientId: string) => {
        setSelectedPatientId(patientId);
        setStep("STUDIES");
        setLoadError(null);
        const st = useAppStore.getState();
        if (st.activePatientId === patientId) {
            setSessions({ contexts: st.contexts, states: st.contextStates });
            return;
        }
        setSessions(null);
        try {
            const { contexts, contextStates } = mapContexts(await api.getContexts(patientId, st.token));
            setSessions({ contexts, states: contextStates });
        } catch {
            setLoadError("Couldn't load this patient's plans — only “No plan” is available.");
            setSessions({ contexts: [], states: [] });
        }
    };

    const session = chosen && sessions ? sessionForScan(chosen.study, chosen.imageUrl, sessions.contexts, sessions.states) : null;
    const versions = chosen ? versionsOf(session) : [];

    const pick = async (study: Study, imageUrl: string, version: VersionOption) => {
        onOpenChange(false);
        if (side === "right") {
            // A copy of that session's measurements for this version — the source plan is never touched
            const snap = snapshotFor(session, version.planId);
            useAppStore.getState().setComparisonB({
                image: imageUrl,
                ...snap,
                calibration: session?.toolState?.calibration,
                source: { patientId: study.patientId, studyId: study.id, contextId: session?.contextId ?? null, planId: version.planId, label: `${getStudyDisplayName(study)} · ${version.name}` },
            });
            return;
        }
        // Image A = the case: open the session of THIS image (each image has its own — CV-19, UI11-40)
        await useAppStore.getState().openStudy(study.patientId, study.id);
        const st = useAppStore.getState();
        const match = st.contextStates.find((cs) => cs.currentImage === imageUrl
            && st.contexts.some((c) => c.id === cs.contextId && c.studyIds?.includes(study.id)));
        if (match && match.contextId !== st.activeContextId) st.setActiveContextId(match.contextId);
        useAppStore.getState().setComparisonPlanA(version.planId);
    };

    const card = "w-full text-left rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)] group";
    const row = "w-full flex items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-[var(--surface-2)] text-[var(--text-2)] hover:text-[var(--text)] disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-transparent";
    const iconBox = "h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--surface-2)] text-[var(--accent)]";
    const back: Record<PickerStep, PickerStep> = { ROOT: "ROOT", PATIENTS: "ROOT", STUDIES: "PATIENTS", VERSIONS: "STUDIES" };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-[var(--border)]">
                    {step !== "ROOT" && (
                        <button
                            className="self-start text-xs font-semibold text-[var(--accent)] hover:opacity-80 mb-1"
                            onClick={() => setStep(back[step])}
                        >
                            ← Back
                        </button>
                    )}
                    <DialogTitle>
                        {step === "ROOT" && `Load ${label}`}
                        {step === "PATIENTS" && "Select patient"}
                        {step === "STUDIES" && (selectedPatient?.name || "Select study")}
                        {step === "VERSIONS" && "Choose version"}
                    </DialogTitle>
                    <DialogDescription>
                        {step === "ROOT" && (side === "left"
                            ? "Image A is the case image: a study image as No plan, or one of its plans."
                            : "Another study, a plan of any study, or a new image.")}
                        {step === "PATIENTS" && "Pick a patient to browse their studies."}
                        {step === "STUDIES" && `Pick a scan for ${label}.`}
                        {step === "VERSIONS" && `${chosen ? getStudyDisplayName(chosen.study) : ""} · ${chosen?.scanLabel ?? ""}. Plans are view-only here; assessment works on “No plan”.`}
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
                                            <div className="text-xs text-[var(--text-3)] mt-0.5">Study image as No plan, or one of its plans</div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-[var(--text-3)]" />
                                    </div>
                                </button>
                                <ImportDialog targetSide={side === "right" ? "right" : undefined}>
                                    <button className={card}>
                                        <div className="flex items-center gap-3">
                                            <div className={iconBox}><Upload className="h-4 w-4" /></div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm text-[var(--text)]">Import new image</div>
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
                                    const scanCount = (p.studies ?? []).reduce((acc, s) => acc + imageScans(s).length, 0);
                                    return (
                                        <button key={p.id} className={row} onClick={() => void choosePatient(p.id)}>
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
                                    <div className="text-center py-8 text-sm text-[var(--text-3)]">No X-ray scans available for this patient</div>
                                )}
                                {studiesWithScans.map(({ study, scans }) => (
                                    <div key={study.id}>
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-1 px-1 text-[var(--text-3)]">
                                            {getStudyDisplayName(study)} · {study.acquisitionDate}
                                        </div>
                                        {scans.map((sc) => (
                                            <button key={sc.id} className={row} disabled={!sessions}
                                                onClick={() => { setChosen({ study, imageUrl: sc.imageUrl, scanLabel: `${sc.type} · ${sc.date}` }); setStep("VERSIONS"); }}>
                                                <div className={iconBox}><ImageIcon className="h-4 w-4" /></div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-semibold text-sm truncate text-[var(--text)]">{sc.type} · {sc.date}</div>
                                                    <div className="text-[10px] font-mono truncate text-[var(--text-3)]">{sessions ? sc.id : "Loading plans…"}</div>
                                                </div>
                                                <ChevronRight className="h-4 w-4 opacity-50" />
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </>
                        )}

                        {step === "VERSIONS" && chosen && (
                            <>
                                {loadError && <div className="text-xs text-[var(--text-3)] px-1 pb-1">{loadError}</div>}
                                {versions.map((v) => {
                                    const taken = selectionKey(chosen.study.id, chosen.imageUrl, v.planId) === otherKey;
                                    return (
                                        <button key={v.planId ?? "none"} className={row} disabled={taken}
                                            onClick={() => void pick(chosen.study, chosen.imageUrl, v)}>
                                            <div className={iconBox}>{v.planId ? <ClipboardList className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}</div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm truncate text-[var(--text)]">{v.name}</div>
                                                <div className="text-xs truncate text-[var(--text-3)]">
                                                    {taken ? `Already shown as ${side === "left" ? "Image B" : "Image A"} — pick another version` : v.hint}
                                                </div>
                                            </div>
                                            {!taken && <ChevronRight className="h-4 w-4 opacity-50" />}
                                        </button>
                                    );
                                })}
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
    const sourceB            = useAppStore((s) => s.comparison.right.source ?? null);
    const planA              = useAppStore((s) => s.comparison.left.planId ?? null);
    const activeCtxState     = useAppStore((s) => s.contextStates.find((c) => c.contextId === s.activeContextId) ?? null);
    const activeStudyId      = useAppStore((s) => s.contexts.find((c) => c.id === s.activeContextId)?.studyIds?.[0] ?? null);
    const versionsA          = useMemo(() => versionsOf(activeCtxState), [activeCtxState]);
    // A saved plan that was deleted falls back to No plan
    const planAName          = versionsA.find((v) => v.planId === planA)?.name ?? "No plan";
    const keyB               = selectionKey(sourceB?.studyId, imageB, sourceB?.planId ?? null);
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
                {paneLabel("Image A", currentImage ? planAName : "case image")}
                {importButton("left", currentImage ? "Change Image A" : "Load the case image")}
                {currentImage && versionsA.length > 1 && (
                    // Quick version switch for the case image (UI12-02)
                    <select
                        value={planA ?? ""}
                        title="Version of Image A"
                        onChange={(e) => {
                            const v = e.target.value || null;
                            if (selectionKey(activeStudyId, currentImage, v) === keyB) {
                                alert("Image B already shows this version — choose another one.");
                                return;
                            }
                            useAppStore.getState().setComparisonPlanA(v);
                        }}
                        className="absolute top-2 right-12 z-20 h-8 rounded-lg bg-black/60 hover:bg-black/80 text-white/90 text-[11px] font-semibold px-2 backdrop-blur-sm border-0 outline-none cursor-pointer"
                    >
                        {versionsA.map((v) => (
                            <option key={v.planId ?? "none"} value={v.planId ?? ""} className="text-black">{v.name}</option>
                        ))}
                    </select>
                )}
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
                {paneLabel("Image B", imageB ? (sourceB?.label ?? "imported image") : "choose an image")}
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
