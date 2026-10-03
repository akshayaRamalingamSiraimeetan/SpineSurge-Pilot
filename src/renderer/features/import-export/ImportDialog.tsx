import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Users,
    ChevronLeft,
    Search as SearchIcon,
    Check,
    Plus,
    Upload,
    Image as ImageIcon,
    Calendar,
    ArrowRight,
    ChevronRight,
    CloudUpload,
    HelpCircle,
    FolderOpen,
    Layers,
} from "lucide-react"
import { useRef, useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { defaultStudyName } from "@/lib/store/types";
import { useAppStore, Patient, Visit } from "@/lib/store/index";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils"
import { persistSeriesInBackground } from "@/features/dicom/dicomPersistence";
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { format } from "date-fns"
import { ScrollArea } from "@/components/ui/scroll-area"

type ImportStep =
    | 'MODE'
    | 'NEW_PATIENT'
    | 'SEARCH_PATIENT'
    | 'VISIT_CHOICE'
    | 'NEW_VISIT'
    | 'SELECT_VISIT'
    | 'SELECT_VISIT'
    | 'SCAN_UPLOAD'
    | 'DICOM_FOLDER' // Added

interface ImportDialogProps {
    children: React.ReactNode;
    targetSide?: 'left' | 'right';
    resetOnOpen?: boolean;
    navigateOnImport?: boolean;
    /** Start the wizard for this patient (Patients page "Add New Study"). */
    presetPatientId?: string;
    /** Open immediately on mount (Add New Study → import, UI10-03). */
    autoOpen?: boolean;
}

export function ImportDialog({ children, targetSide, resetOnOpen, navigateOnImport, presetPatientId, autoOpen }: ImportDialogProps) {
    const navigate = useNavigate();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const [open, setOpen] = useState(!!autoOpen)
    const [step, setStep] = useState<ImportStep>('MODE')
    const [comingSoonTarget, setComingSoonTarget] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)

    // Store State
    const {
        patients,
        addPatient,
        addVisit,
        addStudy,
        addScan,
        isComparisonMode,
        activeCanvasSide,
        setComparisonImage,
        setActiveDialog,
        addContext,
        setActivePatient,
        updateContextState,
    } = useAppStore()

    // Selection State
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
    const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    // Form States
    const [patientData, setPatientData] = useState({ name: '', id: '', age: '', gender: 'M', dob: '' })
    const [visitData, setVisitData] = useState({ diagnosis: '', height: '', weight: '', consultant: 'Dr. Muthuraman (SRIHER)', comments: '' })
    const [scanData, setScanData] = useState({ type: 'Pre-op' as 'Pre-op' | 'Post-op', date: format(new Date(), 'yyyy-MM-dd') })
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [isNewPatient, setIsNewPatient] = useState(false)
    const [isNewVisit, setIsNewVisit] = useState(false)
    const [importing, setImporting] = useState(false)

    // Only an explicit Image B import goes to the comparison pane; everything
    // else is the case image (shared by Assessment, Planning and Compare A).
    const importSide = isComparisonMode && targetSide === 'right' ? 'right' : null;

    const goToWorkspace = () => {
        if (navigateOnImport) navigate('/workspace');
    };

    const filteredPatients = useMemo(() => {
        return patients.filter(p =>
            (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.id || '').toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [patients, searchQuery])

    // Handlers
    const resetWizard = () => {
        setIsNewPatient(false)
        setIsNewVisit(false)
        setStep('MODE')
        setSelectedPatient(null)
        setSelectedVisit(null)
        setSearchQuery('')
        setPatientData({ name: '', id: '', age: '', gender: 'M', dob: '' })
        setVisitData({ diagnosis: '', height: '', weight: '', consultant: 'Dr. Muthuraman (SRIHER)', comments: '' })
        setSelectedFile(null)
    }
    const handleClose = () => {
        setOpen(false)
        setActiveDialog(null)
        resetWizard()
    }

    const handleQuickUse = () => {
        fileInputRef.current?.click()
    }

    // Dashboard entry points start a fresh case — but only once the user has
    // actually picked something; cancelling must not wipe work (BUGS WS-11).
    const startFresh = () => {
        if (resetOnOpen) useAppStore.getState().resetWorkspace();
    };

    const handleQuickFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return;

        // Reset so picking the same file again still fires onChange.
        event.target.value = '';

        if (importSide === 'right') {
            // Image B: upload to the open study so it is saved with the case.
            const st = useAppStore.getState();
            const studyId = st.contexts.find(c => c.id === st.activeContextId)?.studyIds?.[0];
            if (st.activePatientId && studyId) {
                try {
                    const url = await addScan(st.activePatientId, studyId, {
                        id: `scan-${crypto.randomUUID()}`, type: 'Post-op', date: format(new Date(), 'yyyy-MM-dd'),
                    }, file);
                    setComparisonImage('right', url);
                } catch (err) {
                    alert(`Could not upload Image B: ${err instanceof Error ? err.message : 'server error'}`);
                    return;
                }
            } else {
                setComparisonImage('right', URL.createObjectURL(file));
            }
            handleClose();
            return;
        }

        startFresh();
        const { activePatientId, activeContextId, contexts } = useAppStore.getState();
        const activeCtx = contexts.find(c => c.id === activeContextId);
        const studyId = activeCtx?.studyIds?.[0];

        const ctxImage = useAppStore.getState().contextStates.find(c => c.contextId === activeContextId)?.currentImage;
        if (activePatientId && activeCtx && studyId && !ctxImage) {
            // Open study without an image yet: attach the image to it.
            try {
                const imageUrl = await addScan(activePatientId, studyId, {
                    id: `scan-${crypto.randomUUID()}`, type: 'Pre-op', date: format(new Date(), 'yyyy-MM-dd'),
                }, file);
                await updateContextState(activeCtx.id, { currentImage: imageUrl });
                useAppStore.getState().loadImage(imageUrl);
            } catch (err) {
                alert(`Could not save this image to the study: ${err instanceof Error ? err.message : 'server error'}. Please try again.`);
                return;
            }
        } else if (activePatientId && activeCtx && studyId) {
            // Inside a study that already has an image: the new image gets its
            // OWN session so measurements never move between images (CV-19).
            try {
                const imageUrl = await addScan(activePatientId, studyId, {
                    id: `scan-${crypto.randomUUID()}`,
                    type: 'Pre-op',
                    date: format(new Date(), 'yyyy-MM-dd'),
                }, file);
                useAppStore.getState().closeCase();
                const contextId = `ctx-${crypto.randomUUID()}`;
                await addContext({
                    id: contextId,
                    patientId: activePatientId,
                    visitId: activeCtx.visitId,
                    studyIds: [studyId],
                    mode: 'plan',
                    name: `${activeCtx.name || 'Session'} · ${file.name}`,
                    lastModified: new Date().toISOString(),
                });
                await updateContextState(contextId, { currentImage: imageUrl });
            } catch (err) {
                console.error("Quick Use upload failed:", err);
                alert(`Could not save this image to the study: ${err instanceof Error ? err.message : 'server error'}. Please try again.`);
                return;
            }
        } else {
            // Untitled session: show locally; uploaded once it becomes a study.
            useAppStore.getState().closeCase();
            useAppStore.getState().loadLocalImage(file);
        }

        handleClose();
        goToWorkspace();
    }

    const handleDicomFolderSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            const fileArray = Array.from(files).filter((f) => !f.name.startsWith('.'));
            const st = useAppStore.getState();
            const ctx = st.contexts.find((c) => c.id === st.activeContextId);
            const studyId = ctx?.studyIds?.[0];
            const ctxImage = st.contextStates.find((c) => c.contextId === st.activeContextId)?.currentImage;
            if (!resetOnOpen && st.activePatientId && ctx && studyId && !ctxImage) {
                // Open study without images (e.g. Add New Study): the series becomes
                // its scans — uploaded in the background, modality from the headers (UI10-08).
                st.loadDicomSeries(fileArray);
                persistSeriesInBackground(st.activePatientId, studyId, fileArray);
            } else {
                startFresh();
                // Otherwise a fresh untitled series; it is uploaded once saved as a study.
                st.closeCase();
                useAppStore.getState().loadDicomSeries(fileArray);
            }
            handleClose();
            goToWorkspace();
        }
    }

    const handleNativeFolderSelect = async () => {
        folderInputRef.current?.click();
    }

    // Wizard steps only collect data; nothing is written to the server or the
    // global store until "Import" succeeds (BUGS WS-12).
    const handleCreatePatient = () => {
        const newPatient: Patient = {
            id: patientData.id.trim() || `PAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            name: patientData.name,
            age: parseInt(patientData.age),
            gender: patientData.gender as 'M' | 'F' | 'O',
            dob: patientData.dob,
            lastVisit: format(new Date(), 'MMM dd, yyyy'),
            visits: [],
            studies: []
        }
        setSelectedPatient(newPatient)
        setIsNewPatient(true)
        setStep('NEW_VISIT')
    }

    const handleCreateVisit = () => {
        if (!selectedPatient) return
        const newVisit: Visit = {
            id: crypto.randomUUID(),
            visitNumber: `#${String((selectedPatient.visits || []).length + 1).padStart(4, '0')}`,
            date: format(new Date(), 'MMMM dd, yyyy'),
            time: format(new Date(), 'hh:mm a'),
            diagnosis: visitData.diagnosis || 'New Diagnosis',
            comments: visitData.comments,
            height: visitData.height ? `${visitData.height} cm` : '',
            weight: visitData.weight ? `${visitData.weight} kg` : '',
            consultants: visitData.consultant,
            scanCount: 0,
            scans: [],
            studies: []
        }
        setSelectedVisit(newVisit)
        setIsNewVisit(true)
        setStep('SCAN_UPLOAD')
    }

    const handleFinalImport = async () => {
        if (!selectedPatient || !selectedVisit || !selectedFile || importing) return
        setImporting(true)

        const studyId = `std-${crypto.randomUUID()}`;
        const scanId = `scan-${crypto.randomUUID()}`;
        const contextId = `ctx-${crypto.randomUUID()}`;

        try {
            if (isNewPatient) await addPatient(selectedPatient);
            if (isNewVisit) await addVisit(selectedPatient.id, selectedVisit);

            await addStudy({
                id: studyId,
                patientId: selectedPatient.id,
                visitId: selectedVisit.id,
                modality: 'X-Ray',
                source: 'Import',
                acquisitionDate: scanData.date,
                name: defaultStudyName(scanData.type, new Date(scanData.date)),
            });

            const imageUrl = await addScan(selectedPatient.id, studyId, {
                id: scanId,
                type: scanData.type,
                date: scanData.date
            }, selectedFile);

            if (isComparisonMode && importSide) {
                setComparisonImage(importSide, imageUrl);
            } else {
                // A new scan is a new case: drop whatever was on the canvas.
                startFresh();
                useAppStore.getState().closeCase();
                await addContext({
                    id: contextId,
                    patientId: selectedPatient.id,
                    visitId: selectedVisit.id,
                    studyIds: [studyId],
                    mode: 'plan',
                    name: `${selectedPatient.name} - ${format(new Date(), 'MMM dd, yyyy')}`,
                    lastModified: new Date().toISOString(),
                });
                await updateContextState(contextId, { currentImage: imageUrl });
                // Reload from server so patient, contexts and image are consistent.
                await setActivePatient(selectedPatient.id, contextId);
            }
        } catch (err) {
            alert(`Import failed: ${err instanceof Error ? err.message : 'server error'}. Please try again.`);
            return;
        } finally {
            setImporting(false)
        }

        handleClose();
        goToWorkspace();
    }

    return (
        <Dialog open={open} onOpenChange={(val) => {
            setOpen(val);
            setActiveDialog(val ? 'import' : null);
            if (!val) resetWizard();
            if (val && presetPatientId) {
                const p = useAppStore.getState().patients.find((x) => x.id === presetPatientId);
                if (p) { setSelectedPatient(p); setIsNewPatient(false); setStep('VISIT_CHOICE'); }
            }
        }}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className={cn(
                "sm:max-w-[500px] p-0 overflow-hidden border",
                isDark
                    ? ''
                    : ''
            )}>
                {/* Header Section */}
                <div className={cn(
                    "p-6 border-b",
                    isDark
                        ? 'border-[var(--border)] bg-[var(--bg)]'
                        : 'border-[var(--border)] bg-[var(--surface-2)]'
                )}>
                    <div className="flex items-center gap-2 mb-1">
                        {step !== 'MODE' && !(presetPatientId && step === 'VISIT_CHOICE') && (
                            <Button variant="ghost" size="icon" className={cn(
                                "h-6 w-6",
                                isDark
                                    ? 'text-[var(--text-2)] hover:text-[var(--text)]'
                                    : 'text-[var(--text-2)] hover:text-[var(--text)]'
                            )} onClick={() => {
                                if (step === 'NEW_PATIENT' || step === 'SEARCH_PATIENT') setStep('MODE')
                                else if (step === 'VISIT_CHOICE') setStep('SEARCH_PATIENT')
                                else if (step === 'NEW_VISIT' || step === 'SELECT_VISIT') setStep('VISIT_CHOICE')
                                else if (step === 'SCAN_UPLOAD') {
                                    if (selectedVisit?.scans?.length === 0) setStep('NEW_VISIT')
                                    else setStep('VISIT_CHOICE')
                                }
                            }}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <DialogTitle className={cn("text-xl font-bold", isDark ? '' : '')}>
                            {step === 'MODE' && "Create New Study"}
                            {step === 'NEW_PATIENT' && "New Patient Record"}
                            {step === 'SEARCH_PATIENT' && "Select Patient"}
                            {step === 'VISIT_CHOICE' && "Visit Information"}
                            {step === 'NEW_VISIT' && "Create Visit"}
                            {step === 'SELECT_VISIT' && "Select Existing Visit"}
                            {step === 'SCAN_UPLOAD' && "Upload & Categorize"}
                        </DialogTitle>
                    </div>
                    <DialogDescription className={isDark ? 'text-[var(--text-2)]/80' : ''}>
                        {step === 'MODE' && (isComparisonMode ? `Importing scan for View ${(importSide || 'left') === 'left' ? 'A' : 'B'}` : "Import images to create a new study and start planning.")}
                        {step === 'SEARCH_PATIENT' && "Find an existing patient record."}
                        {step === 'VISIT_CHOICE' && `Patient: ${selectedPatient?.name}`}
                        {step === 'SCAN_UPLOAD' && `Visit: ${selectedVisit?.visitNumber} - ${selectedVisit?.date}`}
                    </DialogDescription>
                </div>

                <div className="p-6">
                    {/* Step: MODE — redesigned import source picker */}
                    {step === 'MODE' && (
                        <div className="space-y-2">
                            {/* Hidden file inputs — existing logic unchanged */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*,.dcm,application/dicom"
                                onChange={handleQuickFileChange}
                            />
                            <input
                                type="file"
                                ref={folderInputRef}
                                className="hidden"
                                // @ts-ignore - webkitdirectory is non-standard but supported
                                webkitdirectory=""
                                directory=""
                                multiple
                                onChange={handleDicomFolderSelect}
                            />

                            {/* Section label */}
                            <p className={cn(
                                "text-xs font-bold uppercase tracking-widest pb-2",
                                isDark ? "text-[var(--text-2)]/50" : "text-[var(--text-3)]"
                            )}>
                                Choose Import Source
                            </p>

                            {/* 1. Local Files — rewired to existing Quick Use handler */}
                            <ImportSourceCard
                                icon={FolderOpen}
                                title="Local Files"
                                description="Import DICOM or image files from your computer."
                                tags={["DICOM", "jpg", "png", "tiff", "bmp", "+ more"]}
                                isDark={isDark}
                                onClick={handleQuickUse}
                            />

                            {/* 2. Local Folder — placeholder */}
                            <ImportSourceCard
                                icon={FolderOpen}
                                title="Local Folder"
                                description="Import all imaging files from a selected folder."
                                tags={["DICOM", "jpg", "png", "tiff", "bmp", "+ more"]}
                                isDark={isDark}
                                comingSoon
                                comingSoonLabel={comingSoonTarget === 'folder' ? 'Coming Soon' : undefined}
                                onClick={() => setComingSoonTarget(comingSoonTarget === 'folder' ? null : 'folder')}
                            />

                            {/* 3. PACS — placeholder */}
                            <ImportSourceCard
                                icon={CloudUpload}
                                title="PACS"
                                description="Query and retrieve studies from a PACS server."
                                tags={["DICOM", "All Modalities"]}
                                isDark={isDark}
                                comingSoon
                                comingSoonLabel={comingSoonTarget === 'pacs' ? 'Coming Soon' : undefined}
                                onClick={() => setComingSoonTarget(comingSoonTarget === 'pacs' ? null : 'pacs')}
                            />

                            {/* 4. DICOM — rewired to existing DICOM folder handler */}
                            <ImportSourceCard
                                icon={Layers}
                                title="DICOM"
                                description="Load a folder of DICOM files for MPR / 3D view."
                                tags={["DICOM", "Series", "MPR"]}
                                isDark={isDark}
                                onClick={handleNativeFolderSelect}
                            />

                            {/* Footer info + cancel */}
                            <div className={cn(
                                "flex items-center justify-between pt-4 mt-2 border-t",
                                isDark ? "border-[var(--border)]" : "border-[var(--border)]"
                            )}>
                                <div className="flex items-center gap-1.5">
                                    <HelpCircle className={cn("h-3.5 w-3.5 flex-shrink-0", isDark ? "text-[var(--text-2)]/40" : "text-[var(--text-3)]")} />
                                    <span className={cn("text-[11px]", isDark ? "text-[var(--text-2)]/50" : "text-[var(--text-2)]")}>
                                        Supported: DICOM, JPG, PNG, TIFF, BMP and more.
                                    </span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                        "text-xs rounded-xl h-8 px-4",
                                        isDark
                                            ? "border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                                            : "border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface)]"
                                    )}
                                    onClick={handleClose}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Step: NEW_PATIENT */}
                    {step === 'NEW_PATIENT' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <FormItem label="Full Name" placeholder="Dr. John Doe">
                                    <Input value={patientData.name} onChange={e => setPatientData({ ...patientData, name: e.target.value })} className={cn("h-10 rounded-xl font-bold", isDark ? "bg-[var(--bg)]/70 border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-2)] focus:ring-[#FF453A]/20 focus:border-[#FF453A]/50" : "bg-[var(--surface)] border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-3)] focus:ring-blue-400/20 focus:border-blue-400/50")} />
                                </FormItem>
                                <FormItem label="Patient ID (Optional)" placeholder="Auto-generated">
                                    <Input value={patientData.id} onChange={e => setPatientData({ ...patientData, id: e.target.value })} className={cn("h-10 rounded-xl font-bold", isDark ? "bg-[var(--bg)]/70 border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-2)] focus:ring-[#FF453A]/20 focus:border-[#FF453A]/50" : "bg-[var(--surface)] border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-3)] focus:ring-blue-400/20 focus:border-blue-400/50")} />
                                </FormItem>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <FormItem label="Age">
                                    <Input type="number" value={patientData.age} onChange={e => setPatientData({ ...patientData, age: e.target.value })} className={cn("h-10 rounded-xl font-bold", isDark ? "bg-[var(--bg)]/70 border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-2)] focus:ring-[#FF453A]/20 focus:border-[#FF453A]/50" : "bg-[var(--surface)] border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-3)] focus:ring-blue-400/20 focus:border-blue-400/50")} />
                                </FormItem>
                                <FormItem label="Sex">
                                    <select value={patientData.gender} onChange={e => setPatientData({ ...patientData, gender: e.target.value })} className={cn("w-full border rounded-xl h-10 px-3 text-sm outline-none font-bold", isDark ? "bg-[var(--bg)]/70 border-[var(--border)] text-[var(--text)] focus:ring-1 focus:ring-[#FF453A]/30" : "bg-[var(--surface)] border-[var(--border)] text-[var(--text)] focus:ring-1 focus:ring-blue-400/30")}>
                                        <option value="M">Male</option>
                                        <option value="F">Female</option>
                                        <option value="O">Other</option>
                                    </select>
                                </FormItem>
                                <FormItem label="DOB">
                                    <Input type="date" value={patientData.dob} onChange={e => setPatientData({ ...patientData, dob: e.target.value })} className={cn("h-10 rounded-xl font-bold", isDark ? "bg-[var(--bg)]/70 border-[var(--border)] text-[var(--text)] focus:ring-[#FF453A]/20 focus:border-[#FF453A]/50" : "bg-[var(--surface)] border-[var(--border)] text-[var(--text)] focus:ring-blue-400/20 focus:border-blue-400/50")} />
                                </FormItem>
                            </div>
                            <Button className="w-full bg-[#FF453A] hover:bg-[#e03d33] mt-4 h-11 text-white font-bold rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.08)]" onClick={handleCreatePatient} disabled={!patientData.name || !patientData.age}>
                                Next: Create Visit <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    )}

                    {/* Step: SEARCH_PATIENT */}
                    {step === 'SEARCH_PATIENT' && (
                        <div className="space-y-4">
                            <div className="relative">
                                <SearchIcon className={cn("absolute left-3 top-3 h-4 w-4", isDark ? "text-[var(--text-2)]/50" : "text-[var(--text-2)]/70")} />
                                <Input
                                    placeholder="Search by name or ID..."
                                    className={cn("pl-9", isDark ? "bg-[var(--bg)]/70 border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-2)] focus:border-[#FF453A]/50 focus:ring-[#FF453A]/20" : "bg-[var(--surface)] border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-3)] focus:border-blue-400/50 focus:ring-blue-400/20")}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <ScrollArea className={cn("h-[280px] rounded-xl border p-2", isDark ? "border-[var(--border)] bg-[var(--bg)]/40" : "border-[var(--border)] bg-[var(--surface)]")}>
                                {filteredPatients.length === 0 ? (
                                    <div className={cn("flex flex-col items-center justify-center h-full opacity-50", isDark ? "text-[var(--text-2)]/40" : "text-[var(--text-2)]")}>
                                        <Users className="h-8 w-8 mb-2" />
                                        <p className="text-xs">No patients found</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-1">
                                        {filteredPatients.map(p => (
                                            <button
                                                key={p.id}
                                                className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--surface-2)] hover:border-[var(--border-strong)] border border-transparent transition-all text-left"
                                                onClick={() => { setSelectedPatient(p); setIsNewPatient(false); setStep('VISIT_CHOICE'); }}
                                            >
                                                <div>
                                                    <div className="text-sm font-bold text-[var(--text)]">{p.name || 'Unknown Patient'}</div>
                                                    <div className="text-[10px] text-[var(--text-2)]/50 font-mono">{p.id || 'N/A'} • {p.age ?? '--'}y {p.gender || 'O'}</div>
                                                </div>
                                                <div className="text-[10px] text-[var(--text-2)]/50">Last: {p.lastVisit || 'N/A'}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>
                    )}

                    {/* Step: VISIT_CHOICE */}
                    {step === 'VISIT_CHOICE' && (
                        <div className="grid grid-cols-2 gap-4">
                            <ModeButton
                                icon={Plus}
                                title="New Visit"
                                desc="Start a fresh consultation."
                                isDark={isDark}
                                onClick={() => setStep('NEW_VISIT')}
                            />
                            <ModeButton
                                icon={Calendar}
                                title="Existing Visit"
                                desc="Attach scan to previous visit."
                                isDark={isDark}
                                onClick={() => setStep('SELECT_VISIT')}
                                disabled={(selectedPatient?.visits || []).length === 0}
                            />
                        </div>
                    )}

                    {/* Step: NEW_VISIT */}
                    {step === 'NEW_VISIT' && (
                        <div className="space-y-4">
                            <FormItem label="Initial Diagnosis">
                                <Input value={visitData.diagnosis} onChange={e => setVisitData({ ...visitData, diagnosis: e.target.value })} placeholder="e.g. Spondylolisthesis" className="bg-[var(--surface)]/70 border-[var(--border)] text-slate-100 placeholder:text-[var(--text-2)]/30 h-10 rounded-xl focus:border-[#FF453A]/50" />
                            </FormItem>
                            <div className="grid grid-cols-2 gap-4">
                                <FormItem label="Height (cm)">
                                    <Input type="number" value={visitData.height} onChange={e => setVisitData({ ...visitData, height: e.target.value })} className="bg-[var(--surface)]/70 border-[var(--border)] text-slate-100 h-10 rounded-xl focus:border-[#FF453A]/50" />
                                </FormItem>
                                <FormItem label="Weight (kg)">
                                    <Input type="number" value={visitData.weight} onChange={e => setVisitData({ ...visitData, weight: e.target.value })} className="bg-[var(--surface)]/70 border-[var(--border)] text-slate-100 h-10 rounded-xl focus:border-[#FF453A]/50" />
                                </FormItem>
                            </div>
                            <FormItem label="Clinical Notes">
                                <Textarea value={visitData.comments} onChange={e => setVisitData({ ...visitData, comments: e.target.value })} className="bg-[var(--surface)]/70 border-[var(--border)] text-slate-100 placeholder:text-[var(--text-2)]/30 min-h-[80px] rounded-xl resize-none focus:border-[#FF453A]/50" />
                            </FormItem>
                            <Button className="w-full bg-[#FF453A] hover:bg-[#e03d33] h-11 text-white font-bold rounded-xl shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.08)]" onClick={handleCreateVisit}>
                                Next: Upload Scans <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    )}

                    {/* Step: SELECT_VISIT */}
                    {step === 'SELECT_VISIT' && (
                        <ScrollArea className="h-[300px] border border-[var(--border)] rounded-xl p-2 bg-[var(--surface)]/70">
                            <div className="grid gap-2">
                                {(selectedPatient?.visits || []).map(v => (
                                    <button
                                        key={v.id}
                                        className="p-3 text-left border border-[var(--border)] rounded-xl hover:bg-[var(--surface-2)] hover:border-[var(--border-strong)] transition-all group"
                                        onClick={() => { setSelectedVisit(v); setIsNewVisit(false); setStep('SCAN_UPLOAD'); }}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-xs font-bold text-[#FF453A]">{v.visitNumber}</span>
                                            <span className="text-[10px] text-[var(--text-2)]/50 font-medium">{v.date}</span>
                                        </div>
                                        <div className="text-sm font-bold text-[var(--text)] truncate">{v.diagnosis}</div>
                                        <div className="text-[10px] text-[var(--text-2)]/40 mt-1 italic font-medium">{v.consultants}</div>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    )}

                    {/* Step: SCAN_UPLOAD */}
                    {step === 'SCAN_UPLOAD' && (
                        <div className="space-y-6">
                            <div className="flex gap-4 justify-center">
                                <Button
                                    variant={scanData.type === 'Pre-op' ? 'default' : 'outline'}
                                    className={cn("flex-1 rounded-xl font-bold h-10", scanData.type === 'Pre-op' ? 'bg-[#FF453A] text-white hover:bg-[#e03d33]' : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)]')}
                                    onClick={() => setScanData({ ...scanData, type: 'Pre-op' })}
                                >
                                    Pre-op
                                </Button>
                                <Button
                                    variant={scanData.type === 'Post-op' ? 'default' : 'outline'}
                                    className={cn("flex-1 rounded-xl font-bold h-10", scanData.type === 'Post-op' ? 'bg-[#FF453A] text-white hover:bg-[#e03d33]' : 'border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)]')}
                                    onClick={() => setScanData({ ...scanData, type: 'Post-op' })}
                                >
                                    Post-op
                                </Button>
                            </div>

                            <div
                                className="border-2 border-dashed border-[var(--border)] rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-[#FF453A]/50 hover:bg-[#FF453A]/5 transition-all text-[var(--text-2)]/50 group"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                                {selectedFile ? (
                                    <div className="flex flex-col items-center">
                                        <div className="bg-[rgba(255,69,58,0.12)] p-3 rounded-full mb-3">
                                            <ImageIcon className="h-8 w-8 text-[#FF453A]" />
                                        </div>
                                        <span className="text-sm font-bold text-[var(--text)]">{selectedFile.name}</span>
                                        <span className="text-xs font-medium text-[var(--text-2)]/50">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="h-10 w-10 mb-3 group-hover:scale-110 group-hover:text-[#FF453A] transition-all opacity-40" />
                                        <span className="text-sm font-medium text-[var(--text-2)]/60">Click to select Scan image</span>
                                        <span className="text-[10px] mt-1 text-[var(--text-2)]/30">DICOM, JPG, PNG supported</span>
                                    </>
                                )}
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right text-[var(--text-2)]/60 text-xs uppercase font-bold pr-2 border-r border-[var(--border)] h-full flex items-center justify-end">Scan Date</Label>
                                <Input type="date" value={scanData.date} onChange={e => setScanData({ ...scanData, date: e.target.value })} className="col-span-3 bg-[var(--surface)]/70 border-[var(--border)] text-slate-100 h-10 rounded-xl font-bold focus:border-[#FF453A]/50" />
                            </div>

                            <Button
                                className="w-full bg-[#FF453A] hover:bg-[#e03d33] h-12 shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.08)] font-bold text-white rounded-xl"
                                disabled={!selectedFile || importing}
                                onClick={handleFinalImport}
                            >
                                {importing ? "Importing…" : "Finalize & Import"} <Check className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

function ModeButton({ icon: Icon, title, desc, onClick, disabled = false, isDark = false }: any) {
    return (
        <Button
            variant="outline"
            className={cn(
                "h-auto py-4 px-5 justify-start gap-4 transition-all group rounded-2xl",
                isDark
                    ? "bg-[var(--bg)]/60 border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--border-strong)] text-[var(--text)]"
                    : "bg-[var(--surface-2)] border-[var(--border)] hover:bg-[var(--surface-3)] hover:border-[var(--border-strong)] text-[var(--text)]"
            )}
            onClick={onClick}
            disabled={disabled}
        >
            <div className={cn(
                "p-2.5 rounded-xl group-hover:bg-[#FF453A] transition-colors",
                isDark ? "bg-[rgba(255,69,58,0.12)]" : "bg-red-100"
            )}>
                <Icon className="h-5 w-5 text-[#FF453A] group-hover:text-white" />
            </div>
            <div className="text-left">
                <div className={cn(
                    "text-sm font-bold transition-colors",
                    isDark ? "text-[var(--text)] group-hover:text-[#FF453A]" : "text-[var(--text)] group-hover:text-[var(--text)]"
                )}>{title}</div>
                <div className={cn(
                    "text-[10px] font-medium",
                    isDark ? "text-[var(--text-2)]/50" : "text-[var(--text-2)]"
                )}>{desc}</div>
            </div>
        </Button>
    )
}

// ─── ImportSourceCard ─────────────────────────────────────────────────────────
// Used exclusively by the redesigned MODE step.
interface ImportSourceCardProps {
    icon: React.ElementType;
    title: string;
    description: string;
    tags: string[];
    onClick: () => void;
    disabled?: boolean;
    comingSoon?: boolean;
    comingSoonLabel?: string;
    isDark?: boolean;
}

function ImportSourceCard({
    icon: Icon,
    title,
    description,
    tags,
    onClick,
    disabled = false,
    comingSoon = false,
    comingSoonLabel,
    isDark = false,
}: ImportSourceCardProps) {
    const isDisabled = disabled;
    return (
        <button
            type="button"
            disabled={isDisabled}
            onClick={onClick}
            className={cn(
                "w-full text-left flex items-center gap-4 p-4 rounded-2xl border transition-all group relative",
                isDark
                    ? isDisabled
                        ? "bg-[var(--bg)]/30 border-[var(--border)] opacity-50 cursor-not-allowed"
                        : comingSoon
                            ? "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] cursor-pointer"
                            : "bg-[var(--surface)] border-[var(--border)] hover:border-[#FF453A]/40 hover:bg-[var(--surface-2)] cursor-pointer"
                    : isDisabled
                        ? "bg-[var(--surface-2)] border-[var(--border)] opacity-50 cursor-not-allowed"
                        : comingSoon
                            ? "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--border)] hover:bg-[var(--surface-2)] cursor-pointer shadow-sm"
                            : "bg-[var(--surface)] border-[var(--border)] hover:border-red-200 hover:bg-red-50/20 cursor-pointer shadow-sm"
            )}
        >
            {/* Icon block */}
            <div className={cn(
                "flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center transition-colors",
                isDark
                    ? comingSoon
                        ? "bg-[rgba(255,69,58,0.07)]"
                        : "bg-[rgba(255,69,58,0.12)] group-hover:bg-[rgba(255,69,58,0.18)]"
                    : comingSoon
                        ? "bg-red-50/60"
                        : "bg-red-50 group-hover:bg-red-100"
            )}>
                <Icon className={cn(
                    "h-6 w-6 transition-colors",
                    comingSoon
                        ? isDark ? "text-[#FF453A]/40" : "text-red-300"
                        : "text-[#FF453A]"
                )} />
            </div>

            {/* Text content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn(
                        "font-bold text-sm",
                        isDark
                            ? comingSoon ? "text-[var(--text)]/50" : "text-[var(--text)]"
                            : comingSoon ? "text-[var(--text-3)]" : "text-[var(--text)]"
                    )}>
                        {title}
                    </span>
                    {comingSoon && (
                        <span className={cn(
                            "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
                            isDark
                                ? "bg-[var(--surface-3)] text-[var(--text-2)]/60"
                                : "bg-[var(--surface)] text-[var(--text-3)]"
                        )}>
                            {comingSoonLabel ?? "Coming Soon"}
                        </span>
                    )}
                </div>
                <p className={cn(
                    "text-[11px] leading-relaxed mb-2",
                    isDark
                        ? comingSoon ? "text-[var(--text-2)]/30" : "text-[var(--text-2)]/60"
                        : comingSoon ? "text-[var(--text-3)]" : "text-[var(--text-2)]"
                )}>
                    {description}
                </p>
                <div className="flex flex-wrap gap-1">
                    {tags.map(tag => (
                        <span
                            key={tag}
                            className={cn(
                                "text-[10px] font-medium px-2 py-0.5 rounded-full",
                                isDark
                                    ? comingSoon
                                        ? "bg-[var(--surface-2)] text-[var(--text-2)]/30"
                                        : "bg-[rgba(255,69,58,0.12)] text-[#FF453A]/80"
                                    : comingSoon
                                        ? "bg-[var(--surface-2)] text-gray-300 border border-gray-100"
                                        : "bg-red-50 text-red-500 border border-red-100"
                            )}
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            </div>

            {/* Chevron */}
            <ChevronRight className={cn(
                "flex-shrink-0 h-4 w-4 transition-all",
                isDark
                    ? comingSoon
                        ? "text-[var(--text-2)]/20"
                        : "text-[var(--text-2)]/40 group-hover:text-[#FF453A] group-hover:translate-x-0.5"
                    : comingSoon
                        ? "text-gray-200"
                        : "text-gray-300 group-hover:text-[#FF453A] group-hover:translate-x-0.5"
            )} />
        </button>
    );
}

function FormItem({ label, children }: any) {
    return (
        <div className="space-y-1.5 flex-1">
            <Label className="text-[10px] font-bold text-[var(--text-2)] uppercase tracking-wider ml-1 dark:text-[var(--text-2)]/60">{label}</Label>
            {children}
        </div>
    )
}
