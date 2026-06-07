import TopMenuBar from "@/features/navigation/TopMenuBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    ChevronDown,
    ChevronRight,
    Edit2,
    Save,
    Trash2,
    GripVertical,
    Calendar,
    User,
    ChevronLeft,
    Search,
    Filter,
    ImageIcon,
    Archive,
    History,
    ArchiveRestore,
    Plus,
    Share2,
    FolderOpen
} from "lucide-react";
import { format } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAppStore, Visit } from "@/lib/store/index";
import { useState, useMemo } from "react";
import { NewPatientDialog } from "@/features/patients/NewPatientDialog";
import { NewVisitDialog } from "@/features/patients/NewVisitDialog";
import { NewContextDialog } from "@/features/patients/NewContextDialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ReportsListDialog } from "@/features/patients/ReportsListDialog";
import { ImagingImportDialog } from "@/features/patients/ImagingImportDialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const PatientListItem = ({ name, id, lastVisit, isActive, hasAlert, isArchived, onClick, onShare }: any) => {
    const safeName = (name || 'Unknown Patient').toString();
    const initials = safeName.split(' ').map((n: string) => n[0]).join('').substring(0, 2) || 'UP';
    const safeId = (id || 'N/A').toString();
    const safeLastVisit = (lastVisit || 'N/A').toString();

    return (
        <div
            onClick={onClick}
            className={`p-3 rounded-lg cursor-pointer transition-all ${isActive ? 'bg-primary/10 border border-primary/20 shadow-sm' : 'hover:bg-muted border border-transparent'} ${isArchived ? 'opacity-60 bg-muted/50' : ''}`}
        >
            <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 border border-border">
                    <AvatarFallback className={`text-xs font-bold ${isActive ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                        {initials}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${isActive ? 'text-primary' : 'text-foreground'} ${isArchived ? 'text-muted-foreground' : ''}`}>{safeName}</div>
                    <div className="flex justify-between items-center mt-0.5">
                        <span className="text-[10px] text-muted-foreground font-mono italic">{isArchived ? '[Archived]' : safeId}</span>
                    </div>
                </div>
            </div>
            <div className="mt-2 flex justify-between items-center text-[10px] text-muted-foreground pl-12">
                <span>Last: {safeLastVisit}</span>
                <div className="flex items-center gap-2">
                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 hover:text-primary transition-colors"
                        onClick={(e) => {
                            e.stopPropagation();
                            onShare();
                        }}
                        title="Share Patient"
                    >
                        <Share2 className="h-3 w-3" />
                    </Button>
                    {hasAlert && <div className="h-2 w-2 rounded-full bg-destructive shadow-destructive/50 shadow-md" />}
                </div>
            </div>
        </div>
    );
};

const VisitCard = ({ visit, patientId, dragHandleProps, onStudyClick }: { visit: Visit, patientId: string, dragHandleProps?: any, onStudyClick: (study: any) => void }) => {
    const { updateVisit, deleteVisit } = useAppStore();
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({ ...visit });
    const [notesExpanded, setNotesExpanded] = useState(false);

    const handleSave = () => {
        updateVisit(patientId, visit.id, formData);
        setIsEditing(false);
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this visit?")) {
            deleteVisit(patientId, visit.id);
        }
    };

    return (
        <div className="bg-card/40 backdrop-blur-sm rounded-2xl border border-border p-0 overflow-hidden shadow-lg group/visit hover:bg-card hover:shadow-xl transition-all">
            <div className="p-4">
                <div className="flex gap-4">
                    {/* Drag Handle */}
                    <div {...dragHandleProps} className="mt-2 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted h-fit transition-colors">
                        <GripVertical className="h-5 w-5" />
                    </div>

                    <div className="flex-1 space-y-3">
                        {/* Header Line */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{visit.visitNumber}</span>
                                <span className="text-xs text-slate-600">•</span>
                                <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                                    <Calendar className="h-3 w-3 text-blue-400" />
                                    {visit.date}
                                </span>
                                <span className="text-xs text-muted-foreground">{visit.time}</span>
                            </div>
                            <div className="flex gap-2">
                                {isEditing ? (
                                    <Button size="sm" onClick={handleSave} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-lg shadow-emerald-900/20">
                                        <Save className="h-3 w-3 mr-1" /> Save
                                    </Button>
                                ) : (
                                    <>
                                        <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)} className="h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted">
                                            <Edit2 className="h-3 w-3 mr-1" /> Edit
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={handleDelete} className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Main Content Area */}
                        {isEditing ? (
                            <div className="space-y-3 bg-muted/30 p-4 rounded-2xl border border-border/50">
                                <Input
                                    value={formData.diagnosis}
                                    onChange={e => setFormData({ ...formData, diagnosis: e.target.value })}
                                    placeholder="Diagnosis"
                                    className="bg-background border-border font-bold h-10 rounded-xl"
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="relative">
                                        <Input
                                            value={formData.height}
                                            onChange={e => setFormData({ ...formData, height: e.target.value })}
                                            className="bg-background border-border pr-8 h-10 rounded-xl"
                                            placeholder="Height"
                                        />
                                        <span className="absolute right-3 top-2.5 text-[10px] text-muted-foreground font-bold uppercase">cm</span>
                                    </div>
                                    <div className="relative">
                                        <Input
                                            value={formData.weight}
                                            onChange={e => setFormData({ ...formData, weight: e.target.value })}
                                            className="bg-background border-border pr-8 h-10 rounded-xl"
                                            placeholder="Weight"
                                        />
                                        <span className="absolute right-3 top-2.5 text-[10px] text-muted-foreground font-bold uppercase">kg</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Surgical Planning</h4>
                                    <Input
                                        type="date"
                                        value={formData.surgeryDate || ''}
                                        onChange={e => setFormData({ ...formData, surgeryDate: e.target.value })}
                                        className="bg-background border-border h-9 text-foreground focus:ring-primary/20"
                                    />
                                </div>
                                <select
                                    value={formData.consultants}
                                    onChange={e => setFormData({ ...formData, consultants: e.target.value })}
                                    className="w-full bg-background border-border text-foreground h-9 px-3 rounded-md text-sm cursor-pointer mt-1 font-bold focus:ring-1 focus:ring-primary/20"
                                >
                                    <option>Dr. Muthuraman (SRIHER)</option>
                                    <option>Dr. Vignesh (Apollo)</option>
                                    <option>Dr. Satya (Global)</option>
                                    <option>Dr. External</option>
                                </select>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <h3 className="text-lg font-bold text-foreground tracking-tight">{visit.diagnosis || "No Diagnosis"}</h3>
                                <div className="flex justify-between items-end">
                                    <div className="flex-1">
                                        <div className="grid grid-cols-1 gap-2 bg-muted/20 p-4 rounded-2xl border border-border/50">
                                            <div className="flex items-center justify-between text-sm">
                                                <div className="flex gap-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Height</span>
                                                        <span className="text-foreground font-bold">{visit.height || "--"}</span>
                                                    </div>
                                                    <div className="w-px h-8 bg-border/50" />
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Weight</span>
                                                        <span className="text-foreground font-bold">{visit.weight || "--"}</span>
                                                    </div>
                                                    {visit.surgeryDate && (
                                                        <>
                                                            <div className="w-px h-8 bg-border" />
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] uppercase font-bold text-blue-500 tracking-wider">Surgery</span>
                                                                <span className="text-blue-400 font-medium">{visit.surgeryDate}</span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                <ReportsListDialog visitId={visit.id} />
                                            </div>
                                            <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
                                                <span className="text-[10px] uppercase font-bold text-muted-foreground">Consultant:</span>
                                                <span className="text-sm text-foreground font-semibold">{visit.consultants}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Collapsible Notes */}
                        <div className="pt-1">
                            <div
                                className="flex items-center gap-2 text-xs font-semibold text-blue-400 cursor-pointer select-none hover:text-blue-300 transition-colors"
                                onClick={() => setNotesExpanded(!notesExpanded)}
                            >
                                {notesExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                Clinical Notes
                            </div>
                            {notesExpanded && (
                                <div className="mt-2 animate-in slide-in-from-top-2 duration-200">
                                    {isEditing ? (
                                        <Textarea
                                            value={formData.comments}
                                            onChange={e => setFormData({ ...formData, comments: e.target.value })}
                                            className="bg-background border-border min-h-[120px] text-foreground focus:ring-1 focus:ring-primary/20 rounded-xl resize-none p-3"
                                            placeholder="Enter clinical notes..."
                                        />
                                    ) : (
                                        <div className="text-sm text-foreground bg-secondary/30 p-3 rounded border border-border min-h-[60px] whitespace-pre-wrap">
                                            {visit.comments || <span className="text-muted-foreground italic opacity-60">No notes recorded.</span>}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Nested Imaging Studies Section */}
                <div className="pt-4 mt-4 border-t border-border/50 ml-12">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <ImageIcon className="h-3 w-3" /> Imaging Studies
                        </h4>
                        <div className="flex gap-2">
                            <NewContextDialog patientId={patientId} visitId={visit.id} />
                        </div>
                    </div>

                    <div className="flex overflow-x-auto gap-3 pb-2 custom-scrollbar">
                        {(visit.studies || []).length > 0 ? (
                            (visit.studies).map(study => (
                                <div
                                    key={study.id}
                                    onClick={() => onStudyClick(study)}
                                    className="flex-none w-52 bg-muted/40 border border-border/50 rounded-2xl p-4 hover:border-primary/50 hover:bg-muted/60 transition-all group/study cursor-pointer relative shadow-sm"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover/study:bg-primary group-hover/study:text-primary-foreground transition-all duration-300">
                                                <ImageIcon className="h-3.5 w-3.5" />
                                            </div>
                                            <span className="text-xs font-bold text-foreground">{study.modality}</span>
                                        </div>
                                        <span className="text-[9px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{study.id.slice(-4)}</span>
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mb-2">
                                        Acquired: <span className="text-foreground">{study.acquisitionDate}</span>
                                    </div>
                                    <div className="flex flex-nowrap gap-1 overflow-hidden h-10">
                                        {study.scans.slice(0, 3).map((scan: any) => (
                                            <div
                                                key={scan.id}
                                                className="h-10 w-10 flex-none rounded overflow-hidden border border-slate-800 relative group/scan shadow-sm"
                                            >
                                                <img src={scan.imageUrl} className="h-full w-full object-cover opacity-60 group-hover/scan:opacity-100 transition-opacity" alt="Scan" />
                                            </div>
                                        ))}
                                        {study.scans.length > 3 && (
                                            <div className="h-10 w-10 flex-none rounded bg-slate-800 flex items-center justify-center border border-slate-700 shadow-sm">
                                                <span className="text-[10px] font-bold text-muted-foreground">+{study.scans.length - 3}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="absolute right-2 bottom-2 opacity-0 group-hover/study:opacity-100 transition-opacity">
                                        <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center">
                                            <ChevronRight className="h-3 w-3 text-white" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="w-full text-[11px] text-muted-foreground italic py-4 px-1 opacity-50 font-medium">No studies linked to this visit.</div>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
};

const SortableVisitCard = (props: { visit: Visit, patientId: string, onStudyClick: (study: any) => void }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: props.visit.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 'auto',
        opacity: isDragging ? 0.5 : 1
    };

    return (
        <div ref={setNodeRef} style={style} className="relative">
            <VisitCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
        </div>
    );
};

const PatientCasesPage = () => {
    const navigate = useNavigate();
    const { patients, activePatientId, setActivePatient, reorderVisits, archivePatient, contexts, setActiveContextId, addContext, setActiveDialog, generateShareLink } = useAppStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'name' | 'date'>('name');
    const [showArchived, setShowArchived] = useState(false);
    const [quickAnalysisOpen, toggleQuickAnalysisOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'visits' | 'imaging'>('visits');

    const [studyActionDialogOpen, setStudyActionDialogOpen] = useState(false);
    const [selectedStudyForAction, setSelectedStudyForAction] = useState<any>(null);
    const isQuickAnalysisPatient = (id?: string) => (id || '').startsWith('quick-');

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const activePatient = useMemo(() => patients.find(p => p.id === activePatientId), [patients, activePatientId]);
    const activePatientVisits = activePatient?.visits || [];
    const activePatientStudies = activePatient?.studies || [];

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (activePatient && over && active.id !== over.id) {
            const oldIndex = activePatientVisits.findIndex(v => v.id === active.id);
            const newIndex = activePatientVisits.findIndex(v => v.id === over.id);
            const newVisits = arrayMove(activePatientVisits, oldIndex, newIndex);
            reorderVisits(activePatient.id, newVisits);
        }
    };

    const processedPatients = useMemo(() => {
        return [...patients]
            .filter(p => (showArchived ? p.isArchived : !p.isArchived))
            .filter(p =>
                (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.id || '').toLowerCase().includes(searchQuery.toLowerCase())
            )
            .sort((a, b) => {
                if (filterType === 'date') {
                    return new Date(b.lastVisit || 0).getTime() - new Date(a.lastVisit || 0).getTime();
                }
                return (a.name || '').localeCompare(b.name || '');
            });
    }, [patients, showArchived, searchQuery, filterType]);

    const handleArchiveToggle = async (patientId: string, currentArchived: boolean) => {
        if (confirm(`Are you sure you want to ${currentArchived ? 'restore' : 'archive'} this patient?`)) {
            await archivePatient(patientId, !currentArchived);
            if (!currentArchived && activePatientId === patientId) {
                setActivePatient('');
            }
        }
    };

    const handleStudyClick = (study: any) => {
        setSelectedStudyForAction(study);
        setStudyActionDialogOpen(true);
    };

    const handleContinueContext = (context: any) => {
        setActiveContextId(context.id);
        navigate('/dashboard');
    };

    const handleStartNewFromStudy = async (study: any) => {
        const newContext = {
            id: `ctx-${Date.now()}`,
            patientId: study.patientId,
            visitId: study.visitId,
            studyIds: [study.id],
            mode: 'plan' as const,
            name: `New Session - ${format(new Date(), 'MMM dd')}`,
            lastModified: format(new Date(), 'yyyy-MM-dd HH:mm')
        };
        await addContext(newContext);
        navigate('/dashboard');
    };

    return (
        <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden font-sans font-['Outfit']">
            <TopMenuBar />
            <div className="flex flex-1 pt-14 h-screen overflow-hidden bg-background">
                {/* Left Sidebar: Patient List */}
                <div className="w-80 border-r border-border bg-card/30 flex flex-col z-20 backdrop-blur-xl">
                    <div className="p-4 border-b border-border space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                    onClick={() => navigate('/dashboard')}
                                    title="Back to Workspace"
                                >
                                    <ChevronLeft className="h-5 w-5" />
                                </Button>
                                <h1 className="font-bold text-xl text-foreground font-['Outfit'] tracking-tight">Patients</h1>
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                        <Filter className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="z-[100] rounded-xl overflow-hidden font-['Outfit'] shadow-2xl">
                                    <DropdownMenuLabel className="font-bold uppercase text-[10px] tracking-widest text-muted-foreground">Filter By</DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-border/70" />
                                    <DropdownMenuCheckboxItem
                                        checked={filterType === 'name'}
                                        onCheckedChange={() => setFilterType('name')}
                                        className="cursor-pointer font-bold"
                                    >
                                        <User className="mr-2 h-4 w-4" /> Name (A-Z)
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem
                                        checked={filterType === 'date'}
                                        onCheckedChange={() => setFilterType('date')}
                                        className="cursor-pointer font-bold"
                                    >
                                        <Calendar className="mr-2 h-4 w-4" /> Recent Date
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuSeparator className="bg-border/70" />
                                    <DropdownMenuCheckboxItem
                                        checked={showArchived}
                                        onCheckedChange={setShowArchived}
                                        className="cursor-pointer font-bold"
                                    >
                                        <Archive className="mr-2 h-4 w-4" /> Show Archived
                                    </DropdownMenuCheckboxItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                className="bg-background border-border pl-9 h-9 text-foreground focus:ring-primary/20 transition-all font-['Outfit']"
                                placeholder={filterType === 'name' ? "Search Name or ID..." : "Search..."}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-20">
                        {/* Quick Analysis Folder */}
                        {patients.some(p => isQuickAnalysisPatient(p.id)) && (
                            <div className="mb-2">
                                <button
                                    onClick={() => toggleQuickAnalysisOpen(!quickAnalysisOpen)}
                                    className={cn(
                                        "w-full flex items-center justify-between p-3 rounded-lg transition-all border border-transparent hover:bg-muted text-left group",
                                        quickAnalysisOpen ? "bg-muted/50" : ""
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500 border border-orange-500/20 group-hover:bg-orange-500/20 transition-colors">
                                            <FolderOpen className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-foreground">Quick Analysis</div>
                                            <div className="text-[10px] text-muted-foreground font-medium">
                                                {patients.filter(p => isQuickAnalysisPatient(p.id)).length} items
                                            </div>
                                        </div>
                                    </div>
                                    {quickAnalysisOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                </button>

                                {quickAnalysisOpen && (
                                    <div className="mt-1 pl-4 space-y-1 border-l-2 border-border/50 ml-4 animate-in slide-in-from-top-2 duration-200">
                                        {patients
                                            .filter(p => isQuickAnalysisPatient(p.id))
                                            .sort((a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime())
                                            .map(patient => (
                                                <PatientListItem
                                                    key={patient.id}
                                                    name={patient.name} // Usually "Quick Analysis"
                                                    id={patient.id}
                                                    lastVisit={patient.lastVisit}
                                                    isActive={patient.id === activePatientId}
                                                    hasAlert={patient.hasAlert}
                                                    isArchived={patient.isArchived}
                                                    onClick={() => setActivePatient(patient.id)}
                                                    onShare={() => generateShareLink({ patientId: patient.id })}
                                                />
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Regular Patients */}
                        {processedPatients
                            .filter(p => !isQuickAnalysisPatient(p.id))
                            .map(patient => (
                                <PatientListItem
                                    key={patient.id}
                                    name={patient.name}
                                    id={patient.id}
                                    lastVisit={patient.lastVisit}
                                    isActive={patient.id === activePatientId}
                                    hasAlert={patient.hasAlert}
                                    isArchived={patient.isArchived}
                                    onClick={() => setActivePatient(patient.id)}
                                    onShare={() => generateShareLink({ patientId: patient.id })}
                                />
                            ))}
                    </div>
                    <div className="p-4 border-t border-border">
                        <NewPatientDialog />
                    </div>
                </div>

                {/* Main Content: Visit History */}
                <div className="flex-1 overflow-y-auto p-6 bg-secondary/20">
                    {activePatient ? (
                        <>
                            <div className="flex items-center justify-between mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-3xl font-bold text-foreground font-['Outfit'] tracking-tight">
                                            {activePatient.name}
                                            <span className="text-xl font-medium text-muted-foreground ml-3 opacity-60">
                                                {activePatient.age} {activePatient.gender}
                                            </span>
                                        </h1>
                                        <NewPatientDialog patient={activePatient} />
                                    </div>
                                    <div className="text-sm text-muted-foreground flex items-center gap-3">
                                        <span className="font-mono bg-muted px-2 py-0.5 rounded text-primary text-[11px] font-bold">ID: {activePatient.id}</span>
                                        <span className="text-border">•</span>
                                        <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 opacity-50" /> {activePatient.dob}</span>
                                        {activePatient.contact && (
                                            <>
                                                <span className="text-border">•</span>
                                                <span className="flex items-center gap-1.5">
                                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest opacity-60">Contact:</span>
                                                    <span className="text-foreground font-medium">{activePatient.contact}</span>
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => generateShareLink({ patientId: activePatient.id })}
                                        className="bg-card border-border text-muted-foreground hover:text-foreground shadow-sm rounded-xl font-bold h-10 px-4"
                                        title="Share Patient"
                                    >
                                        <Share2 className="h-4 w-4 mr-2 text-primary" />
                                        Share
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleArchiveToggle(activePatient.id, activePatient.isArchived || false)}
                                        className="bg-card border-border text-muted-foreground hover:text-foreground shadow-sm rounded-xl font-bold h-10 px-4"
                                    >
                                        {activePatient.isArchived ? <ArchiveRestore className="h-4 w-4 mr-2 text-primary" /> : <Archive className="h-4 w-4 mr-2 text-primary" />}
                                        {activePatient.isArchived ? 'Restore' : 'Archive'}
                                    </Button>
                                    <ImagingImportDialog patientId={activePatient.id} />
                                    <NewVisitDialog patientId={activePatient.id} />
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex gap-8 border-b border-border/50 mb-8">
                                <button
                                    onClick={() => setActiveTab('visits')}
                                    className={cn(
                                        "pb-4 text-sm font-bold transition-all relative font-['Outfit'] tracking-wide",
                                        activeTab === 'visits' ? "text-primary" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    VISIT HISTORY
                                    {activeTab === 'visits' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_-2px_8px_rgba(var(--primary),0.4)]" />}
                                </button>
                                <button
                                    onClick={() => setActiveTab('imaging')}
                                    className={cn(
                                        "pb-4 text-sm font-bold transition-all relative font-['Outfit'] tracking-wide",
                                        activeTab === 'imaging' ? "text-primary" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    IMAGING & FILES
                                    {activeTab === 'imaging' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_-2px_8px_rgba(var(--primary),0.4)]" />}
                                </button>
                            </div>

                            {activeTab === 'visits' ? (
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEnd}
                                >
                                    <SortableContext
                                        items={activePatientVisits.map(v => v.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <div className="space-y-4 pb-20">
                                            {activePatientVisits.length === 0 && (
                                                <div className="text-muted-foreground text-center py-12 bg-muted/20 rounded-2xl border border-dashed border-border italic font-medium opacity-60">
                                                    No visits recorded. Create a visit to start.
                                                </div>
                                            )}
                                            {activePatientVisits.map(visit => (
                                                <SortableVisitCard
                                                    key={visit.id}
                                                    visit={visit}
                                                    patientId={activePatient.id}
                                                    onStudyClick={handleStudyClick}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            ) : (
                                <div className="pb-20">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {activePatientStudies.map(study => (
                                            <div key={study.id} className="bg-card border border-border rounded-2xl p-5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/5 cursor-pointer transition-all duration-300 group/studycard flex flex-col" onClick={() => handleStudyClick(study)}>
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover/studycard:bg-primary group-hover/studycard:text-primary-foreground transition-all duration-300">
                                                            <ImageIcon className="h-5 w-5" />
                                                        </div>
                                                        <span className="font-bold text-foreground text-sm uppercase tracking-tight">{study.modality}</span>
                                                    </div>
                                                    <span className="text-[10px] text-muted-foreground font-mono opacity-50 font-bold bg-muted px-2 py-0.5 rounded">{study.id.slice(-8)}</span>
                                                </div>
                                                <div className="text-[11px] text-muted-foreground mb-4 flex items-center gap-2 font-medium">
                                                    <Calendar className="h-3.5 w-3.5 opacity-40" />
                                                    Date: <span className="text-foreground font-bold">{study.acquisitionDate}</span>
                                                </div>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {study.scans.slice(0, 4).map((scan: any) => (
                                                        <div
                                                            key={scan.id}
                                                            className="aspect-square rounded-lg overflow-hidden border border-border/50 relative group/scan shadow-sm"
                                                        >
                                                            <img src={scan.imageUrl} className="w-full h-full object-cover opacity-70 group-hover/scan:opacity-100 transition-opacity" alt="Scan" />
                                                        </div>
                                                    ))}
                                                    {study.scans.length > 4 && (
                                                        <div className="aspect-square rounded-lg bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground border border-border">
                                                            +{study.scans.length - 4}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {activePatientStudies.length === 0 && (
                                            <div className="col-span-full text-center py-12 text-muted-foreground italic font-medium opacity-60 bg-muted/20 rounded-2xl border border-dashed border-border">
                                                No imaging studies imported yet.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-40">
                            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                                <User className="h-10 w-10 opacity-20" />
                            </div>
                            <p className="text-sm font-bold uppercase tracking-widest">Select a patient to view details</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Study Action Dialog (Version Control) */}
            <Dialog open={studyActionDialogOpen} onOpenChange={(o) => {
                setStudyActionDialogOpen(o);
                setActiveDialog(o ? 'study-manager' : null);
            }}>
                <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-2">
                        <DialogTitle className="text-xl font-bold flex items-center gap-3">
                            <History className="h-5 w-5 text-primary" />
                            Session Manager
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground font-medium pt-1">
                            Select an existing session to continue or start a fresh planning session for this study.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="px-6 py-4 space-y-4">
                        <div className="flex flex-col gap-3">
                            {contexts.filter(c => c.studyIds.includes(selectedStudyForAction?.id)).length > 0 ? (
                                <>
                                    <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest pl-1">Saved Planning Sessions</Label>
                                    <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
                                        {contexts.filter(c => c.studyIds.includes(selectedStudyForAction?.id)).map(session => (
                                            <Button
                                                key={session.id}
                                                variant="outline"
                                                className="w-full bg-background border-border hover:bg-muted hover:border-primary/50 text-foreground flex justify-between items-center h-20 px-5 transition-all group/sess rounded-xl shadow-sm"
                                                onClick={() => handleContinueContext(session)}
                                            >
                                                <div className="flex items-center gap-5 text-left">
                                                    <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center text-muted-foreground group-hover/sess:bg-primary/10 group-hover/sess:text-primary transition-all duration-300">
                                                        <Plus className="h-6 w-6" />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-sm text-foreground tracking-tight">{session.name}</div>
                                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-1 font-bold">
                                                            <Calendar className="h-3 w-3 opacity-40" />
                                                            {session.lastModified}
                                                        </div>
                                                    </div>
                                                </div>
                                                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover/sess:text-primary group-hover/sess:translate-x-1 transition-all" />
                                            </Button>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-8 bg-muted/40 rounded-2xl border border-dashed border-border mb-2">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground opacity-60">No existing sessions found.</span>
                                </div>
                            )}

                            <div className="pt-2">
                                <Button
                                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground flex justify-between items-center h-14 px-8 font-bold shadow-xl shadow-primary/20 rounded-xl transition-all active:scale-[0.98]"
                                    onClick={() => handleStartNewFromStudy(selectedStudyForAction!)}
                                >
                                    <div className="flex items-center gap-4">
                                        <Plus className="h-5 w-5" />
                                        <span className="tracking-tight">Start New Planning Session</span>
                                    </div>
                                    <ChevronRight className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="bg-muted/30 p-4 px-6 border-t border-border">
                        <Button variant="ghost" className="text-muted-foreground hover:text-foreground font-bold" onClick={() => setStudyActionDialogOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default PatientCasesPage;
