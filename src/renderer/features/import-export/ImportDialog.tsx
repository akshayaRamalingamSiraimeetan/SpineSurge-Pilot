import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    FilePlus,
    Users,
    UserPlus,
    ChevronLeft,
    Search as SearchIcon,
    Check,
    Plus,
    Upload,
    Image as ImageIcon,
    Calendar,
    ArrowRight,
    FolderInput // Added
} from "lucide-react"
import { useRef, useState, useMemo } from "react"
import { useAppStore, Patient, Visit } from "@/lib/store/index";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { format } from "date-fns"
import { ScrollArea } from "@/components/ui/scroll-area"
import { API_BASE } from "@/lib/api"

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
}

export function ImportDialog({ children, targetSide }: ImportDialogProps) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const [open, setOpen] = useState(false)
    const [step, setStep] = useState<ImportStep>('MODE')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null) // Added

    // Store State
    const {
        patients,
        addPatient,
        addVisit,
        addScan,
        loadImage,
        isComparisonMode,
        activeCanvasSide,
        setComparisonImage,
        setActiveDialog
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

    const importSide = isComparisonMode ? (targetSide || activeCanvasSide) : null;

    const filteredPatients = useMemo(() => {
        return patients.filter(p =>
            (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.id || '').toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [patients, searchQuery])

    // Handlers
    const resetWizard = () => {
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

    const handleQuickFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return;

        const loadQuickImage = (imageUrl: string) => {
            if (isComparisonMode && importSide) {
                setComparisonImage(importSide, imageUrl);
            } else {
                loadImage(imageUrl);
            }
        };

        try {
            // Quick Use = "Analyze immediately without saving"
            // We upload the file to the server to get a stable URL, but skip
            // creating a patient/study record to avoid FK constraint errors.
            const formData = new FormData();
            const scanId = `quick-scan-${Date.now()}`;
            const studyId = `quick-study-${Date.now()}`;

            // Step 1: Create a minimal quick-patient and quick-study on the server
            // so the scans FK constraint is satisfied.
            const patientId = `quick-${Date.now()}`;
            const patientRes = await fetch(`${API_BASE}/api/patients`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: patientId,
                    name: 'Quick Analysis',
                    age: 0,
                    gender: 'O',
                    dob: '',
                    lastVisit: new Date().toISOString()
                })
            });
            if (!patientRes.ok) throw new Error('Failed to create quick patient');

            const studyRes = await fetch(`${API_BASE}/api/studies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: studyId,
                    patientId,
                    modality: 'Import',
                    source: 'Quick Use',
                    acquisitionDate: new Date().toISOString()
                })
            });
            if (!studyRes.ok) throw new Error('Failed to create quick study');

            // Step 2: Upload the scan file directly
            formData.append('file', file);
            formData.append('id', scanId);
            formData.append('studyId', studyId);
            formData.append('type', 'Pre-op');
            formData.append('date', new Date().toISOString().split('T')[0]);

            const scanRes = await fetch(`${API_BASE}/api/scans`, {
                method: 'POST',
                body: formData
            });

            if (!scanRes.ok) throw new Error('Failed to upload scan file');

            const { imageUrl } = await scanRes.json();

            if (!imageUrl) throw new Error('Server did not return an image URL');

            // Step 3: Load the image into the viewer
            loadQuickImage(imageUrl);
        } catch (err) {
            console.warn("Quick Use upload failed, falling back to local file:", err);

            try {
                const localUrl = URL.createObjectURL(file);
                loadQuickImage(localUrl);
            } catch (fallbackErr) {
                console.error("Quick Use fallback failed:", fallbackErr);
                alert("Failed to open this file in Quick Use. Please start the server or try another image.");
            }
        }

        handleClose();
    }

    const handleDicomFolderSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            // Convert to Array
            const fileArray = Array.from(files);

            // Switch to DICOM Mode
            useAppStore.getState().loadDicomSeries(fileArray);

            handleClose()
        }
    }

    const handleNativeFolderSelect = async () => {
        // Trigger the hidden folder input
        folderInputRef.current?.click();
    }

    const handleCreatePatient = () => {
        const newPatient: Patient = {
            id: patientData.id || `#${Math.floor(Math.random() * 1000000000)}`,
            name: patientData.name,
            age: parseInt(patientData.age),
            gender: patientData.gender as 'M' | 'F' | 'O',
            dob: patientData.dob,
            lastVisit: format(new Date(), 'MMM dd, yyyy'),
            visits: [],
            studies: []
        }
        addPatient(newPatient)
        setSelectedPatient(newPatient)
        setStep('NEW_VISIT')
    }

    const handleCreateVisit = () => {
        if (!selectedPatient) return
        const newVisit: Visit = {
            id: Date.now().toString(),
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
        addVisit(selectedPatient.id, newVisit)
        setSelectedVisit(newVisit)
        setStep('SCAN_UPLOAD')
    }

    const handleFinalImport = async () => {
        if (!selectedPatient || !selectedVisit || !selectedFile) return

        const scanId = Date.now().toString()
        await addScan(selectedPatient.id, selectedVisit.id, {
            id: scanId,
            type: scanData.type,
            date: scanData.date
        }, selectedFile)

        // 4. Get the URL from the patient record (it's now a server URL)
        const state = useAppStore.getState();
        // Scan was added to a study? addScan implementation finds the study.
        // We know patientId and studyId? Wait, addScan takes studyId.
        // In handleFinalImport, we are adding to a VISIT, not explicitly a STUDY?
        // Let's check api.addScan args in ImportDialog: addScan(patientId, visitId, ...) 
        // Wait, PatientSlice.addScan signature is: addScan(patientId, studyId, ...)
        // BUT in ImportDialog handleFinalImport line 216: addScan(selectedPatient.id, selectedVisit.id, ...)
        // pass visitId as studyId? That seems implied if Visit has studies?
        // Let's look at addScan in PatientSlice again.

        // Actually, looking at ImportDialog:
        // await addScan(selectedPatient.id, selectedVisit.id, ...)
        // It passes visitId as second arg.

        // Let's trust that addScan updates the store. We can try to find the scan by ID or just use the return if we refactor addScan to return it?
        // PatientSlice addScan doesn't return the URL. ActivePatient updates though.

        // Alternative: Just fetch the patient again or find the scan in the updated store.
        // We know the scan ID is `scanId`.

        const updatedPatient = state.patients.find(p => p.id === selectedPatient.id);
        let serverUrl: string | undefined;

        // Search in all studies of the patient/visit
        updatedPatient?.studies.forEach(s => {
            const found = s.scans.find(scan => scan.id === scanId);
            if (found) serverUrl = found.imageUrl;
        });

        // If not found in studies (maybe linked via visit?), check visit specific logic if needed?
        // Usually scans are effectively in studies.

        // Fallback or verify.
        if (serverUrl) {
            console.log('[ImportDialog] handleFinalImport: Using Server URL', serverUrl);
            if (isComparisonMode && importSide) {
                setComparisonImage(importSide, serverUrl)
            } else {
                loadImage(serverUrl)
            }
        } else {
            // Fallback to Blob if server sync hasn't propagated or wait?
            // It's async await addScan, so store should be updated.
            const url = URL.createObjectURL(selectedFile);
            console.warn('[ImportDialog] Server URL not found, using Blob', url);
            if (isComparisonMode && importSide) {
                setComparisonImage(importSide, url)
            } else {
                loadImage(url)
            }
        }

        handleClose()
    }

    return (
        <Dialog open={open} onOpenChange={(val) => {
            setOpen(val);
            setActiveDialog(val ? 'import' : null);
            if (!val) resetWizard();
        }}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className={cn(
                "sm:max-w-[500px] p-0 overflow-hidden border shadow-[0_0_30px_rgba(41,182,246,0.15),0_25px_50px_-12px_rgba(0,0,0,0.5)]",
                isDark
                    ? '!bg-[#0F2A44] !text-[#E3F2FD] !border-[#1E3A5F]'
                    : '!bg-gray-100 !text-slate-900 !border-gray-300'
            )}>
                {/* Header Section */}
                <div className={cn(
                    "p-6 border-b",
                    isDark
                        ? 'border-[#1E3A5F] bg-[#0A1929]'
                        : 'border-gray-300 bg-gray-200'
                )}>
                    <div className="flex items-center gap-2 mb-1">
                        {step !== 'MODE' && (
                            <Button variant="ghost" size="icon" className={cn(
                                "h-6 w-6",
                                isDark
                                    ? 'text-[#90CAF9] hover:text-[#E3F2FD]'
                                    : 'text-slate-600 hover:text-slate-900'
                            )} onClick={() => {
                                if (step === 'NEW_PATIENT' || step === 'SEARCH_PATIENT') setStep('MODE')
                                else if (step === 'VISIT_CHOICE') setStep('SEARCH_PATIENT')
                                else if (step === 'NEW_VISIT' || step === 'SELECT_VISIT') setStep('VISIT_CHOICE')
                                else if (step === 'SCAN_UPLOAD') {
                                    if (selectedVisit?.scans?.length === 0) setStep('NEW_VISIT') // Simplification
                                    else setStep('VISIT_CHOICE')
                                }
                            }}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <DialogTitle className={cn("text-xl font-bold", isDark ? 'text-[#E3F2FD]' : 'text-slate-900')}>
                            {step === 'MODE' && "Import Scan"}
                            {step === 'NEW_PATIENT' && "New Patient Record"}
                            {step === 'SEARCH_PATIENT' && "Select Patient"}
                            {step === 'VISIT_CHOICE' && "Visit Information"}
                            {step === 'NEW_VISIT' && "Create Visit"}
                            {step === 'SELECT_VISIT' && "Select Existing Visit"}
                            {step === 'SCAN_UPLOAD' && "Upload & Categorize"}
                        </DialogTitle>
                    </div>
                    <DialogDescription className={isDark ? 'text-[#90CAF9]/80' : 'text-slate-600'}>
                        {step === 'MODE' && (isComparisonMode ? `Importing scan for View ${(importSide || 'left') === 'left' ? 'A' : 'B'}` : "Select how you'd like to process this scan.")}
                        {step === 'SEARCH_PATIENT' && "Find an existing patient record."}
                        {step === 'VISIT_CHOICE' && `Patient: ${selectedPatient?.name}`}
                        {step === 'SCAN_UPLOAD' && `Visit: ${selectedVisit?.visitNumber} - ${selectedVisit?.date}`}
                    </DialogDescription>
                </div>

                <div className="p-6">
                    {/* Step: MODE */}
                    {step === 'MODE' && (
                        <div className="grid gap-3">
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleQuickFileChange} />

                            <ModeButton
                                icon={FilePlus}
                                title="Quick Use"
                                desc="Analyze immediately without saving."
                                isDark={isDark}
                                onClick={handleQuickUse}
                            />
                            <ModeButton
                                icon={UserPlus}
                                title="Add New Patient"
                                desc="Register a new patient and start analysis."
                                isDark={isDark}
                                onClick={() => setStep('NEW_PATIENT')}
                            />
                            <ModeButton
                                icon={Users}
                                title="Use Existing Patient"
                                desc="Link scan to an existing patient record."
                                isDark={isDark}
                                onClick={() => setStep('SEARCH_PATIENT')}
                            />
                            <ModeButton
                                icon={FolderInput}
                                title="Import DICOM Folder"
                                desc="Load a folder of DICOM files for MPR view."
                                isDark={isDark}
                                onClick={handleNativeFolderSelect}
                            />
                            {/* Hidden directory input */}
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
                        </div>
                    )}

                    {/* Step: NEW_PATIENT */}
                    {step === 'NEW_PATIENT' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <FormItem label="Full Name" placeholder="Dr. John Doe">
                                    <Input value={patientData.name} onChange={e => setPatientData({ ...patientData, name: e.target.value })} className={cn("h-10 rounded-xl font-bold", isDark ? "bg-[#0A1929]/70 border-[#1E3A5F] text-[#E3F2FD] placeholder:text-[#607D8B] focus:ring-[#29B6F6]/20 focus:border-[#29B6F6]/50" : "bg-gray-100 border-gray-300 text-slate-900 placeholder:text-slate-400 focus:ring-blue-400/20 focus:border-blue-400/50")} />
                                </FormItem>
                                <FormItem label="Patient ID (Optional)" placeholder="Auto-generated">
                                    <Input value={patientData.id} onChange={e => setPatientData({ ...patientData, id: e.target.value })} className={cn("h-10 rounded-xl font-bold", isDark ? "bg-[#0A1929]/70 border-[#1E3A5F] text-[#E3F2FD] placeholder:text-[#607D8B] focus:ring-[#29B6F6]/20 focus:border-[#29B6F6]/50" : "bg-gray-100 border-gray-300 text-slate-900 placeholder:text-slate-400 focus:ring-blue-400/20 focus:border-blue-400/50")} />
                                </FormItem>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <FormItem label="Age">
                                    <Input type="number" value={patientData.age} onChange={e => setPatientData({ ...patientData, age: e.target.value })} className={cn("h-10 rounded-xl font-bold", isDark ? "bg-[#0A1929]/70 border-[#1E3A5F] text-[#E3F2FD] placeholder:text-[#607D8B] focus:ring-[#29B6F6]/20 focus:border-[#29B6F6]/50" : "bg-gray-100 border-gray-300 text-slate-900 placeholder:text-slate-400 focus:ring-blue-400/20 focus:border-blue-400/50")} />
                                </FormItem>
                                <FormItem label="Sex">
                                    <select value={patientData.gender} onChange={e => setPatientData({ ...patientData, gender: e.target.value })} className={cn("w-full border rounded-xl h-10 px-3 text-sm outline-none font-bold", isDark ? "bg-[#0A1929]/70 border-[#1E3A5F] text-[#E3F2FD] focus:ring-1 focus:ring-[#29B6F6]/30" : "bg-gray-100 border-gray-300 text-slate-900 focus:ring-1 focus:ring-blue-400/30")}>
                                        <option value="M">Male</option>
                                        <option value="F">Female</option>
                                        <option value="O">Other</option>
                                    </select>
                                </FormItem>
                                <FormItem label="DOB">
                                    <Input type="date" value={patientData.dob} onChange={e => setPatientData({ ...patientData, dob: e.target.value })} className={cn("h-10 rounded-xl font-bold", isDark ? "bg-[#0A1929]/70 border-[#1E3A5F] text-[#E3F2FD] focus:ring-[#29B6F6]/20 focus:border-[#29B6F6]/50" : "bg-gray-100 border-gray-300 text-slate-900 focus:ring-blue-400/20 focus:border-blue-400/50")} />
                                </FormItem>
                            </div>
                            <Button className="w-full bg-gradient-to-r from-[#29B6F6] to-[#4FC3F7] hover:from-[#4FC3F7] hover:to-[#81D4FA] mt-4 h-11 text-[#0A1929] font-bold rounded-xl shadow-[0_0_15px_rgba(41,182,246,0.3)]" onClick={handleCreatePatient} disabled={!patientData.name || !patientData.age}>
                                Next: Create Visit <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    )}

                    {/* Step: SEARCH_PATIENT */}
                    {step === 'SEARCH_PATIENT' && (
                        <div className="space-y-4">
                            <div className="relative">
                                <SearchIcon className={cn("absolute left-3 top-3 h-4 w-4", isDark ? "text-[#90CAF9]/50" : "text-slate-500/70")} />
                                <Input
                                    placeholder="Search by name or ID..."
                                    className={cn("pl-9", isDark ? "bg-[#0A1929]/70 border-[#1E3A5F] text-[#E3F2FD] placeholder:text-[#607D8B] focus:border-[#29B6F6]/50 focus:ring-[#29B6F6]/20" : "bg-gray-100 border-gray-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-400/50 focus:ring-blue-400/20")}
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <ScrollArea className={cn("h-[280px] rounded-xl border p-2", isDark ? "border-[#1E3A5F] bg-[#0A1929]/40" : "border-gray-300 bg-gray-100")}>
                                {filteredPatients.length === 0 ? (
                                    <div className={cn("flex flex-col items-center justify-center h-full opacity-50", isDark ? "text-[#90CAF9]/40" : "text-slate-500")}>
                                        <Users className="h-8 w-8 mb-2" />
                                        <p className="text-xs">No patients found</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-1">
                                        {filteredPatients.map(p => (
                                            <button
                                                key={p.id}
                                                className="flex items-center justify-between p-3 rounded-lg hover:bg-blue-600/15 hover:border-blue-400/40 border border-transparent transition-all text-left"
                                                onClick={() => { setSelectedPatient(p); setStep('VISIT_CHOICE'); }}
                                            >
                                                <div>
                                                    <div className="text-sm font-bold text-slate-100">{p.name || 'Unknown Patient'}</div>
                                                    <div className="text-[10px] text-blue-200/50 font-mono">{p.id || 'N/A'} • {p.age ?? '--'}y {p.gender || 'O'}</div>
                                                </div>
                                                <div className="text-[10px] text-blue-200/50">Last: {p.lastVisit || 'N/A'}</div>
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
                                <Input value={visitData.diagnosis} onChange={e => setVisitData({ ...visitData, diagnosis: e.target.value })} placeholder="e.g. Spondylolisthesis" className="bg-blue-950/50 border-blue-500/20 text-slate-100 placeholder:text-blue-300/30 h-10 rounded-xl focus:border-blue-400/50" />
                            </FormItem>
                            <div className="grid grid-cols-2 gap-4">
                                <FormItem label="Height (cm)">
                                    <Input type="number" value={visitData.height} onChange={e => setVisitData({ ...visitData, height: e.target.value })} className="bg-blue-950/50 border-blue-500/20 text-slate-100 h-10 rounded-xl focus:border-blue-400/50" />
                                </FormItem>
                                <FormItem label="Weight (kg)">
                                    <Input type="number" value={visitData.weight} onChange={e => setVisitData({ ...visitData, weight: e.target.value })} className="bg-blue-950/50 border-blue-500/20 text-slate-100 h-10 rounded-xl focus:border-blue-400/50" />
                                </FormItem>
                            </div>
                            <FormItem label="Clinical Notes">
                                <Textarea value={visitData.comments} onChange={e => setVisitData({ ...visitData, comments: e.target.value })} className="bg-blue-950/50 border-blue-500/20 text-slate-100 placeholder:text-blue-300/30 min-h-[80px] rounded-xl resize-none focus:border-blue-400/50" />
                            </FormItem>
                            <Button className="w-full bg-gradient-to-r from-[#29B6F6] to-[#4FC3F7] hover:from-[#4FC3F7] hover:to-[#81D4FA] h-11 text-[#0A1929] font-bold rounded-xl shadow-[0_0_15px_rgba(41,182,246,0.3)]" onClick={handleCreateVisit}>
                                Next: Upload Scans <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    )}

                    {/* Step: SELECT_VISIT */}
                    {step === 'SELECT_VISIT' && (
                        <ScrollArea className="h-[300px] border border-blue-500/20 rounded-xl p-2 bg-blue-950/30">
                            <div className="grid gap-2">
                                {(selectedPatient?.visits || []).map(v => (
                                    <button
                                        key={v.id}
                                        className="p-3 text-left border border-blue-500/20 rounded-xl hover:bg-blue-600/15 hover:border-blue-400/40 transition-all group"
                                        onClick={() => { setSelectedVisit(v); setStep('SCAN_UPLOAD'); }}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-xs font-bold text-blue-400">{v.visitNumber}</span>
                                            <span className="text-[10px] text-blue-200/50 font-medium">{v.date}</span>
                                        </div>
                                        <div className="text-sm font-bold text-slate-100 truncate">{v.diagnosis}</div>
                                        <div className="text-[10px] text-blue-200/40 mt-1 italic font-medium">{v.consultants}</div>
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
                                    className={cn("flex-1 rounded-xl font-bold h-10", scanData.type === 'Pre-op' ? 'bg-[#29B6F6] text-[#0A1929]' : 'border-[#1E3A5F] text-[#90CAF9] hover:bg-[#29B6F6]/15')}
                                    onClick={() => setScanData({ ...scanData, type: 'Pre-op' })}
                                >
                                    Pre-op
                                </Button>
                                <Button
                                    variant={scanData.type === 'Post-op' ? 'default' : 'outline'}
                                    className={cn("flex-1 rounded-xl font-bold h-10", scanData.type === 'Post-op' ? 'bg-[#4FC3F7] text-[#0A1929]' : 'border-[#1E3A5F] text-[#90CAF9] hover:bg-[#29B6F6]/15')}
                                    onClick={() => setScanData({ ...scanData, type: 'Post-op' })}
                                >
                                    Post-op
                                </Button>
                            </div>

                            <div
                                className="border-2 border-dashed border-[#1E3A5F] rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-[#29B6F6]/50 hover:bg-[#29B6F6]/5 transition-all text-[#90CAF9]/50 group"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                                {selectedFile ? (
                                    <div className="flex flex-col items-center">
                                        <div className="bg-[#29B6F6]/15 p-3 rounded-full mb-3">
                                            <ImageIcon className="h-8 w-8 text-[#29B6F6]" />
                                        </div>
                                        <span className="text-sm font-bold text-[#E3F2FD]">{selectedFile.name}</span>
                                        <span className="text-xs font-medium text-[#90CAF9]/50">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="h-10 w-10 mb-3 group-hover:scale-110 group-hover:text-[#29B6F6] transition-all opacity-40" />
                                        <span className="text-sm font-medium text-blue-200/60">Click to select Scan image</span>
                                        <span className="text-[10px] mt-1 text-blue-200/30">DICOM, JPG, PNG supported</span>
                                    </>
                                )}
                            </div>

                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right text-blue-300/60 text-xs uppercase font-bold pr-2 border-r border-blue-500/20 h-full flex items-center justify-end">Scan Date</Label>
                                <Input type="date" value={scanData.date} onChange={e => setScanData({ ...scanData, date: e.target.value })} className="col-span-3 bg-blue-950/50 border-blue-500/20 text-slate-100 h-10 rounded-xl font-bold focus:border-blue-400/50" />
                            </div>

                            <Button
                                className="w-full bg-gradient-to-r from-[#29B6F6] to-[#4FC3F7] hover:from-[#4FC3F7] hover:to-[#81D4FA] h-12 shadow-[0_0_15px_rgba(41,182,246,0.3)] font-bold text-[#0A1929] rounded-xl"
                                disabled={!selectedFile}
                                onClick={handleFinalImport}
                            >
                                Finalize & Import <Check className="ml-2 h-4 w-4" />
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
                    ? "bg-[#0A1929]/60 border-[#1E3A5F] hover:bg-[#29B6F6]/10 hover:border-[#29B6F6]/50 text-[#E3F2FD]"
                    : "bg-gray-200 border-gray-300 hover:bg-gray-300 hover:border-gray-400 text-slate-900"
            )}
            onClick={onClick}
            disabled={disabled}
        >
            <div className={cn(
                "p-2.5 rounded-xl group-hover:bg-[#29B6F6] transition-colors",
                isDark ? "bg-[#29B6F6]/15" : "bg-blue-100"
            )}>
                <Icon className="h-5 w-5 text-[#29B6F6] group-hover:text-[#0A1929]" />
            </div>
            <div className="text-left">
                <div className={cn(
                    "text-sm font-bold transition-colors",
                    isDark ? "text-[#E3F2FD] group-hover:text-[#4FC3F7]" : "text-slate-900 group-hover:text-slate-900"
                )}>{title}</div>
                <div className={cn(
                    "text-[10px] font-medium",
                    isDark ? "text-[#90CAF9]/50" : "text-slate-600"
                )}>{desc}</div>
            </div>
        </Button>
    )
}

function FormItem({ label, children }: any) {
    return (
        <div className="space-y-1.5 flex-1">
            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 dark:text-[#90CAF9]/60">{label}</Label>
            {children}
        </div>
    )
}
