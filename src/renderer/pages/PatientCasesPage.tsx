import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    ChevronDown,
    ChevronRight,
    Calendar,
    User,
    Search,
    Filter,
    ImageIcon,
    Archive,
    ArchiveRestore,
    Plus,
    Share2,
    ExternalLink,
    FileText,
    MoreVertical,
    Pencil,
    Bell,
} from "lucide-react";
import { format, parse } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAppStore, Study, getStudyDisplayName, STUDY_STATUSES, StudyStatus } from "@/lib/store/index";
import { useState, useMemo, useEffect } from "react";
import { NewPatientDialog } from "@/features/patients/NewPatientDialog";
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
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { History } from "lucide-react";
import { destroyCornerstone } from "@/lib/cornerstone/initCornerstone";

const isQuickAnalysisPatient = (id?: string) => (id || '').startsWith('quick-');

function patientInitials(name?: string) {
    const safe = (name || 'Unknown').toString();
    return safe.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'UP';
}

function statusBadgeClass(status?: string | null) {
    switch (status) {
        case 'Completed':   return 'text-emerald-400 bg-emerald-400/10';
        case 'In Progress': return 'text-[#FF453A] bg-[#FF453A]/10';
        case 'Archived':    return 'text-[#6B7280] bg-[#6B7280]/10';
        default:            return 'text-[#9CA3AF] bg-[#242427]';
    }
}

function statusDotClass(status?: string | null) {
    switch (status) {
        case 'Completed':   return 'bg-emerald-400';
        case 'In Progress': return 'bg-[#FF453A]';
        case 'Archived':    return 'bg-[#6B7280]';
        default:            return 'bg-[#9CA3AF]';
    }
}

function parseVisitDate(dateStr?: string): Date | null {
    if (!dateStr) return null;
    const formats = ['MMMM dd, yyyy', 'MMM dd, yyyy', 'yyyy-MM-dd'];
    for (const f of formats) {
        const d = parse(dateStr, f, new Date());
        if (!isNaN(d.getTime())) return d;
    }
    const fallback = new Date(dateStr);
    return isNaN(fallback.getTime()) ? null : fallback;
}

function StudyCard({
    study,
    patientId,
    onOpenWorkspace,
}: {
    study: Study;
    patientId: string;
    onOpenWorkspace: (study: Study) => void;
}) {
    const { updateStudy, generateShareLink } = useAppStore();
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState(getStudyDisplayName(study));
    const title = getStudyDisplayName(study);
    const status = (study.status as StudyStatus) || 'Draft';
    const thumb = study.scans?.[0]?.imageUrl;
    const scanLabel = study.scans?.length
        ? `${study.scans.length} image${study.scans.length === 1 ? '' : 's'}`
        : study.source || '—';

    const saveName = async () => {
        const trimmed = nameDraft.trim();
        await updateStudy(patientId, study.id, { name: trimmed || null });
        setRenaming(false);
    };

    const setStatus = async (next: StudyStatus) => {
        await updateStudy(patientId, study.id, { status: next });
    };

    return (
        <div className="flex items-center gap-4 rounded-xl border border-[#242427] bg-[#141416] p-3 hover:border-[#3A3A3E] transition-colors">
            <div className="h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-[#242427] bg-[#0A0A0B]">
                {thumb ? (
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-[#6B7280]">
                        <ImageIcon className="h-5 w-5" />
                    </div>
                )}
            </div>

            <div className="min-w-0 flex-1">
                {renaming ? (
                    <Input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={saveName}
                        onKeyDown={(e) => e.key === 'Enter' && saveName()}
                        autoFocus
                        className="h-8 bg-[#0A0A0B] border-[#242427] text-sm font-semibold text-[#F5F5F7]"
                    />
                ) : (
                    <div className="truncate text-sm font-semibold text-[#F5F5F7]">{title}</div>
                )}
                <div className="mt-0.5 truncate text-xs text-[#6B7280]">
                    {scanLabel}
                    {study.acquisitionDate ? ` · ${study.acquisitionDate}` : ''}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[#242427] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9CA3AF]">
                        {study.modality || 'Study'}
                    </span>
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold', statusBadgeClass(status))}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', statusDotClass(status))} />
                        {status}
                    </span>
                </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-[#242427] bg-transparent text-xs text-[#F5F5F7] hover:bg-[#242427]"
                    onClick={() => onOpenWorkspace(study)}
                >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Open Workspace
                </Button>
                <ReportsListDialog studyId={study.id} />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#9CA3AF] hover:text-[#F5F5F7]">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 border-[#242427] bg-[#141416] text-[#F5F5F7]">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-[#6B7280]">Study</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => { setNameDraft(getStudyDisplayName(study)); setRenaming(true); }}>
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="border-[#242427] bg-[#141416]">
                                {STUDY_STATUSES.map(s => (
                                    <DropdownMenuItem key={s} onClick={() => setStatus(s)}>
                                        {s}{status === s ? ' ✓' : ''}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuSeparator className="bg-[#242427]" />
                        <DropdownMenuItem onClick={() => generateShareLink({ patientId })}>
                            <Share2 className="mr-2 h-3.5 w-3.5" /> Share patient
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}

const PatientCasesPage = () => {
    const navigate = useNavigate();
    const {
        patients,
        activePatientId,
        setActivePatient,
        archivePatient,
        contexts,
        setActiveContextId,
        addContext,
        setActiveDialog,
        generateShareLink,
        addVisit,
        addStudy,
    } = useAppStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [studyActionDialogOpen, setStudyActionDialogOpen] = useState(false);
    const [selectedStudyForAction, setSelectedStudyForAction] = useState<Study | null>(null);
    const [timelineVisitId, setTimelineVisitId] = useState<string | undefined>(undefined);

    const activePatient = useMemo(
        () => patients.find(p => p.id === activePatientId),
        [patients, activePatientId],
    );

    const processedPatients = useMemo(() => {
        return [...patients]
            .filter(p => !isQuickAnalysisPatient(p.id))
            .filter(p => (p.studies && p.studies.length > 0) || p.id === activePatientId)
            .filter(p => (showArchived ? p.isArchived : !p.isArchived))
            .filter(p =>
                (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.contact || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.id || '').toLowerCase().includes(searchQuery.toLowerCase()),
            )
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [patients, showArchived, searchQuery]);

    const groupedTimeline = useMemo(() => {
        if (!activePatient) return [];
        
        const groups: Record<string, { date: string, visits: any[], studies: Study[] }> = {};
        
        // 1. Group visits
        if (activePatient.visits) {
            activePatient.visits.forEach(v => {
                const parsed = parseVisitDate(v.date);
                const groupKey = parsed ? format(parsed, 'MMM d, yyyy') : (v.date || 'Unknown Date');
                
                if (!groups[groupKey]) groups[groupKey] = { date: groupKey, visits: [], studies: [] };
                groups[groupKey].visits.push(v);
                if (v.studies) {
                    v.studies.forEach(s => {
                        if (!groups[groupKey].studies.find(ext => ext.id === s.id)) {
                            groups[groupKey].studies.push(s);
                        }
                    });
                }
            });
        }
        
        // 2. Group top-level studies
        if (activePatient.studies) {
            activePatient.studies.forEach(study => {
                let dateStr = study.acquisitionDate;
                if (!dateStr && study.visitId) {
                    const v = activePatient.visits?.find(v => v.id === study.visitId);
                    if (v) dateStr = v.date;
                }
                if (!dateStr) dateStr = 'Unknown Date';
                
                const parsed = parseVisitDate(dateStr);
                const groupKey = parsed ? format(parsed, 'MMM d, yyyy') : dateStr;
                
                if (!groups[groupKey]) groups[groupKey] = { date: groupKey, visits: [], studies: [] };
                if (!groups[groupKey].studies.find(ext => ext.id === study.id)) {
                    groups[groupKey].studies.push(study);
                }
            });
        }
        
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === 'Unknown Date') return 1;
            if (b === 'Unknown Date') return -1;
            const da = parseVisitDate(a)?.getTime() ?? 0;
            const db = parseVisitDate(b)?.getTime() ?? 0;
            return db - da;
        });
        
        return sortedKeys.map(date => groups[date]);
    }, [activePatient]);

    useEffect(() => {
        if (groupedTimeline.length > 0) {
            setExpandedGroups(new Set([groupedTimeline[0].date]));
        } else {
            setExpandedGroups(new Set());
        }
    }, [activePatientId, groupedTimeline]);

    const firstSeenDate = useMemo(() => {
        if (!activePatient?.visits?.length) return activePatient?.lastVisit || null;
        const dates = activePatient.visits
            .map(v => parseVisitDate(v.date))
            .filter(Boolean) as Date[];
        if (!dates.length) return activePatient.lastVisit || null;
        return format(new Date(Math.min(...dates.map(d => d.getTime()))), 'MMM d, yyyy');
    }, [activePatient]);

    const primaryDiagnosis = useMemo(() => {
        if (!activePatient?.visits?.length) return null;
        return activePatient.visits[0]?.diagnosis || null;
    }, [activePatient]);

    const toggleGroup = (date: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(date)) next.delete(date);
            else next.add(date);
            return next;
        });
    };

    const handleAddStudy = async () => {
        if (!activePatient) return;
        
        const todayStr = format(new Date(), 'MMM dd, yyyy');
        
        // Find existing visit for today
        let targetVisit = activePatient.visits?.find(v => {
            const parsed = parseVisitDate(v.date);
            return parsed && format(parsed, 'MMM dd, yyyy') === todayStr;
        });

        let targetVisitId = targetVisit?.id;

        if (!targetVisitId) {
            // Create a new visit automatically if none exists for today
            const newVisitId = `visit-${Date.now()}`;
            const newVisit = {
                id: newVisitId,
                visitNumber: `#${String((activePatient.visits?.length || 0) + 1).padStart(4, '0')}`,
                date: todayStr,
                time: format(new Date(), 'HH:mm'),
                diagnosis: '',
                comments: '',
                height: '',
                weight: '',
                consultants: '',
                scanCount: 0,
                scans: [],
                studies: [],
            };
            await addVisit(activePatient.id, newVisit);
            targetVisitId = newVisitId;
        }
        
        // Create an empty study
        const studyId = `std-${Date.now()}`;
        const newStudy: Omit<Study, 'scans'> = {
            id: studyId,
            patientId: activePatient.id,
            visitId: targetVisitId,
            modality: 'X-Ray',
            source: 'Upload',
            acquisitionDate: todayStr
        };
        await addStudy(newStudy);

        // Create context for this new study
        if (useAppStore.getState().isDicomMode) {
            destroyCornerstone();
        }
        const newContext = {
            id: `ctx-${Date.now()}`,
            patientId: activePatient.id,
            visitId: targetVisitId,
            studyIds: [studyId],
            mode: 'plan' as const,
            name: `New Study - ${format(new Date(), 'MMM dd')}`,
            lastModified: format(new Date(), 'yyyy-MM-dd HH:mm'),
        };
        await addContext(newContext);
        
        // Navigate to workspace
        navigate('/workspace');
    };

    const handleArchiveToggle = async (patientId: string, currentArchived: boolean) => {
        if (confirm(`Are you sure you want to ${currentArchived ? 'restore' : 'archive'} this patient?`)) {
            await archivePatient(patientId, !currentArchived);
            if (!currentArchived && activePatientId === patientId) {
                setActivePatient('');
            }
        }
    };

    const handleStudyClick = (study: Study) => {
        setSelectedStudyForAction(study);
        setStudyActionDialogOpen(true);
    };

    const handleContinueContext = async (context: { id: string; patientId: string }) => {
        // Tear down the Cornerstone runtime before opening a normal workspace.
        // This prevents stale RenderingEngine / ToolGroup / cache state from
        // the previous DICOM session from influencing CanvasWorkspace.
        if (useAppStore.getState().isDicomMode) {
            destroyCornerstone();
        }
        await setActivePatient(context.patientId, context.id);
        setActiveContextId(context.id);
        navigate('/workspace');
    };

    const handleStartNewFromStudy = async (study: Study) => {
        // Tear down the Cornerstone runtime before opening a normal workspace.
        if (useAppStore.getState().isDicomMode) {
            destroyCornerstone();
        }
        const newContext = {
            id: `ctx-${Date.now()}`,
            patientId: study.patientId,
            visitId: study.visitId,
            studyIds: [study.id],
            mode: 'plan' as const,
            name: `${getStudyDisplayName(study)} - ${format(new Date(), 'MMM dd')}`,
            lastModified: format(new Date(), 'yyyy-MM-dd HH:mm'),
        };
        await setActivePatient(study.patientId);
        await addContext(newContext);
        navigate('/workspace');
    };

    const selectPatient = async (patientId: string) => {
        await setActivePatient(patientId);
    };

    return (
        <div className="-mx-8 -my-6 flex h-[calc(100vh-4rem)] overflow-hidden bg-[#0A0A0B] text-[#F5F5F7]">
            {/* Left — Patient list */}
            <div className="flex w-[320px] flex-shrink-0 flex-col border-r border-[#242427] bg-[#0F0F11]">
                <div className="space-y-3 border-b border-[#242427] p-4">
                    <div>
                        <h1 className="text-lg font-semibold text-[#F5F5F7]">Patients</h1>
                        <p className="text-xs text-[#6B7280]">{processedPatients.length} patients</p>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[#6B7280]" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search patients..."
                            className="h-9 border-[#242427] bg-[#141416] pl-9 text-sm text-[#F5F5F7] placeholder:text-[#6B7280]"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {processedPatients.map(patient => {
                        const isActive = patient.id === activePatientId;
                        const mrn = patient.contact || patient.id;
                        return (
                            <div
                                key={patient.id}
                                onClick={() => selectPatient(patient.id)}
                                className={cn(
                                    'mb-1 flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors',
                                    isActive
                                        ? 'border-[#FF453A]/40 bg-[#FF453A]/10'
                                        : 'border-transparent hover:bg-[#141416]',
                                    patient.isArchived && 'opacity-60',
                                )}
                            >
                                <Avatar className="h-10 w-10 border border-[#242427]">
                                    <AvatarFallback className={cn('text-xs font-bold', isActive ? 'bg-[#FF453A] text-white' : 'bg-[#242427] text-[#9CA3AF]')}>
                                        {patientInitials(patient.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-semibold text-[#F5F5F7]">{patient.name}</div>
                                    <div className="truncate text-xs text-[#6B7280]">
                                        {patient.age ? `${patient.age}${patient.gender || ''}` : '—'}
                                        {mrn ? ` · MRN ${mrn}` : ''}
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-[#6B7280] hover:text-[#F5F5F7]">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="border-[#242427] bg-[#141416] text-[#F5F5F7]">
                                        <DropdownMenuItem onClick={() => generateShareLink({ patientId: patient.id })}>
                                            <Share2 className="mr-2 h-3.5 w-3.5" /> Share
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleArchiveToggle(patient.id, !!patient.isArchived)}>
                                            {patient.isArchived ? (
                                                <><ArchiveRestore className="mr-2 h-3.5 w-3.5" /> Restore</>
                                            ) : (
                                                <><Archive className="mr-2 h-3.5 w-3.5" /> Archive</>
                                            )}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        );
                    })}
                </div>

                <div className="border-t border-[#242427] p-4">
                    <NewPatientDialog />
                </div>
            </div>

            {/* Right — Patient detail + timeline */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {activePatient ? (
                    <>
                        <div className="flex items-start justify-between border-b border-[#242427] px-8 py-6">
                            <div className="flex items-start gap-4">
                                <Avatar className="h-16 w-16 border-2 border-[#242427]">
                                    <AvatarFallback className="bg-[#FF453A]/15 text-lg font-bold text-[#FF453A]">
                                        {patientInitials(activePatient.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <h2 className="text-2xl font-semibold text-[#F5F5F7]">{activePatient.name}</h2>
                                    <p className="mt-1 text-sm text-[#9CA3AF]">
                                        {activePatient.age ? `${activePatient.age}${activePatient.gender || ''}` : '—'}
                                        {activePatient.contact ? ` · MRN ${activePatient.contact}` : activePatient.id ? ` · MRN ${activePatient.id}` : ''}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[#6B7280]">
                                        {primaryDiagnosis && (
                                            <span className="inline-flex items-center gap-1.5">
                                                <User className="h-3.5 w-3.5" />
                                                {primaryDiagnosis}
                                            </span>
                                        )}
                                        {firstSeenDate && (
                                            <span className="inline-flex items-center gap-1.5">
                                                <Calendar className="h-3.5 w-3.5" />
                                                First seen {firstSeenDate}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" className="relative h-9 w-9 text-[#9CA3AF]">
                                    <Bell className="h-4 w-4" />
                                </Button>
                                <NewPatientDialog patient={activePatient} />
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-9 w-9 text-[#9CA3AF]">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="border-[#242427] bg-[#141416]">
                                        <DropdownMenuCheckboxItem checked={showArchived} onCheckedChange={setShowArchived}>
                                            Show archived patients
                                        </DropdownMenuCheckboxItem>
                                        <DropdownMenuSeparator className="bg-[#242427]" />
                                        <DropdownMenuItem onClick={() => handleArchiveToggle(activePatient.id, !!activePatient.isArchived)}>
                                            {activePatient.isArchived ? 'Restore patient' : 'Archive patient'}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-8 py-6">
                            <div className="relative ml-4 border-l-2 border-[#FF453A]/30 pl-8 pb-4">
                                {groupedTimeline.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-[#242427] bg-[#141416]/50 py-12 text-center text-sm text-[#6B7280]">
                                        No studies recorded. Add a new study to build the timeline.
                                    </div>
                                ) : (
                                    groupedTimeline.map((group) => {
                                        const expanded = expandedGroups.has(group.date);
                                        const studies = group.studies;
                                        const groupTitle = group.visits[0]?.diagnosis || group.visits[0]?.visitNumber || null;
                                        return (
                                            <div key={group.date} className="relative mb-6">
                                                <span className="absolute -left-[41px] top-1 h-3 w-3 rounded-full border-2 border-[#FF453A] bg-[#0A0A0B]" />
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroup(group.date)}
                                                    className="mb-3 flex w-full items-center justify-between text-left"
                                                >
                                                    <div>
                                                        <div className="text-sm font-semibold text-[#F5F5F7]">
                                                            {group.date} {groupTitle ? `· ${groupTitle}` : ''}
                                                        </div>
                                                        <div className="text-xs font-medium text-[#FF453A]">
                                                            {studies.length} stud{studies.length === 1 ? 'y' : 'ies'}
                                                        </div>
                                                    </div>
                                                    {expanded ? (
                                                        <ChevronDown className="h-4 w-4 text-[#6B7280]" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4 text-[#6B7280]" />
                                                    )}
                                                </button>

                                                {expanded && (
                                                    <div className="space-y-3">
                                                        {studies.length === 0 ? (
                                                            <div className="rounded-xl border border-dashed border-[#242427] py-6 text-center text-xs text-[#6B7280]">
                                                                No studies in this group.
                                                            </div>
                                                        ) : (
                                                            studies.map(study => (
                                                                <StudyCard
                                                                    key={study.id}
                                                                    study={study}
                                                                    patientId={activePatient.id}
                                                                    onOpenWorkspace={handleStudyClick}
                                                                />
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}

                                {activePatient && (
                                    <div className="relative mt-6">
                                        <span className="absolute -left-[41px] top-4 h-3 w-3 rounded-full border-2 border-[#242427] bg-[#0A0A0B]" />
                                        <div className="rounded-xl border border-dashed border-[#FF453A]/30 bg-[#FF453A]/5 p-4">
                                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                                <Button
                                                    onClick={handleAddStudy}
                                                    className="h-8 gap-2 border border-[#FF453A]/30 bg-[#FF453A]/10 text-xs font-semibold text-[#FF453A] hover:bg-[#FF453A]/20"
                                                >
                                                    <Plus className="h-4 w-4" /> Add New Study
                                                </Button>
                                            </div>
                                            <p className="text-xs text-[#6B7280]">
                                                Add new studies and imaging to this patient's timeline.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                    </>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center text-[#6B7280]">
                        <User className="mb-3 h-12 w-12 opacity-30" />
                        <p className="text-sm">Select a patient to view their timeline</p>
                    </div>
                )}
            </div>

            {/* Session manager — existing workspace entry flow */}
            <Dialog open={studyActionDialogOpen} onOpenChange={(o) => {
                setStudyActionDialogOpen(o);
                setActiveDialog(o ? 'study-manager' : null);
            }}>
                <DialogContent className="border-[#242427] bg-[#141416] sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-[#F5F5F7]">
                            <History className="h-5 w-5 text-[#FF453A]" />
                            Session Manager
                        </DialogTitle>
                        <DialogDescription className="text-[#9CA3AF]">
                            Continue an existing session or start a new planning session for{' '}
                            {selectedStudyForAction ? getStudyDisplayName(selectedStudyForAction) : 'this study'}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        {selectedStudyForAction && contexts.filter(c => c.studyIds.includes(selectedStudyForAction.id)).length > 0 ? (
                            contexts
                                .filter(c => c.studyIds.includes(selectedStudyForAction.id))
                                .map(session => (
                                    <Button
                                        key={session.id}
                                        variant="outline"
                                        className="h-auto w-full justify-between border-[#242427] bg-[#0A0A0B] px-4 py-3 text-[#F5F5F7] hover:border-[#FF453A]/40"
                                        onClick={() => handleContinueContext(session)}
                                    >
                                        <div className="text-left">
                                            <div className="text-sm font-semibold">{session.name}</div>
                                            <div className="text-[10px] text-[#6B7280]">{session.lastModified}</div>
                                        </div>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                ))
                        ) : (
                            <div className="rounded-xl border border-dashed border-[#242427] py-6 text-center text-xs text-[#6B7280]">
                                No existing sessions found.
                            </div>
                        )}
                        {selectedStudyForAction && (
                            <Button
                                className="w-full bg-[#FF453A] hover:bg-[#FF453A]/90 text-white"
                                onClick={() => handleStartNewFromStudy(selectedStudyForAction)}
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                Start New Planning Session
                            </Button>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setStudyActionDialogOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default PatientCasesPage;
