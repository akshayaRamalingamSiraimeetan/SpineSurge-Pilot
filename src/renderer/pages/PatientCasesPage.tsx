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
    Check,
    Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ImportDialog } from "@/features/import-export/ImportDialog";
import { format, parse } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useShallow } from "zustand/react/shallow";
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
        case 'Archived':    return 'text-[var(--text-3)] bg-[#6B7280]/10';
        default:            return 'text-[var(--text-2)] bg-[var(--surface-3)]';
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
    const updateStudy = useAppStore(s => s.updateStudy);
    const generateShareLink = useAppStore(s => s.generateShareLink);
    const deleteStudy = useAppStore(s => s.deleteStudy);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [renaming, setRenaming] = useState(false);
    // Card reads: patient name → "Study #N · <custom name>" · date (once) → modality / status / images.
    const patient = useAppStore(s => s.patients.find(p => p.id === patientId));
    const studyNumber = useMemo(() => {
        if (!patient) return 1;
        const all = [...patient.studies, ...patient.visits.flatMap(v => v.studies || [])];
        const unique = Array.from(new Map(all.map(x => [x.id, x])).values())
            .sort((a, b) => (Date.parse(a.acquisitionDate) || 0) - (Date.parse(b.acquisitionDate) || 0) || a.id.localeCompare(b.id));
        return Math.max(1, unique.findIndex(x => x.id === study.id) + 1);
    }, [patient, study.id]);
    // Auto-generated names ("Pre-op · 2 Oct 2026") repeat the date — only show names the user typed.
    const customName = study.name && !/ · \d{1,2} \w{3,} \d{4}$/.test(study.name) ? study.name.trim() : '';
    const dateLabel = (() => {
        const d = study.acquisitionDate ? new Date(study.acquisitionDate) : null;
        return d && !isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : (study.acquisitionDate || '');
    })();
    const title = customName || getStudyDisplayName(study);
    const [nameDraft, setNameDraft] = useState(customName);
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
        <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 hover:border-[var(--border-strong)] transition-colors" title={title}>
            <div className="h-14 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]">
                {thumb ? (
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--text-3)]">
                        <ImageIcon className="h-5 w-5" />
                    </div>
                )}
            </div>

            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--text)]">{patient?.name || 'Unnamed patient'}</div>
                {renaming ? (
                    <Input
                        value={nameDraft}
                        placeholder={`Study #${studyNumber} name`}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={saveName}
                        onKeyDown={(e) => e.key === 'Enter' && saveName()}
                        autoFocus
                        className="mt-1 h-7 bg-[var(--bg)] border-[var(--border)] text-xs text-[var(--text)]"
                    />
                ) : (
                    <button
                        className="mt-0.5 block max-w-full truncate text-left text-xs text-[var(--text-2)] hover:underline decoration-dotted underline-offset-4"
                        title="Click to name this study"
                        onClick={() => { setNameDraft(customName); setRenaming(true); }}
                    >
                        <span className="font-semibold text-[var(--text)]">Study #{studyNumber}</span>
                        {customName ? ` · ${customName}` : ''}
                        {dateLabel ? ` · ${dateLabel}` : ''}
                    </button>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[var(--surface-3)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-2)]">
                        {study.modality || 'Study'}
                    </span>
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold', statusBadgeClass(status))}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', statusDotClass(status))} />
                        {status}
                    </span>
                    <span className="text-[10px] text-[var(--text-3)]">{scanLabel}</span>
                </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    title="Open in workspace"
                    className="h-8 w-8 text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]"
                    onClick={() => onOpenWorkspace(study)}
                >
                    <ExternalLink className="h-4 w-4" />
                </Button>
                <ReportsListDialog studyId={study.id} />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" title="More" className="h-8 w-8 text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => { setNameDraft(getStudyDisplayName(study)); setRenaming(true); }}>
                            <Pencil className="mr-2 h-3.5 w-3.5 text-[var(--text-3)]" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => generateShareLink({ patientId })}>
                            <Share2 className="mr-2 h-3.5 w-3.5 text-[var(--text-3)]" /> Share
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">Status</DropdownMenuLabel>
                        {STUDY_STATUSES.map(st => (
                            <DropdownMenuItem key={st} onClick={() => setStatus(st)}>
                                <span className={cn('mr-2.5 h-2 w-2 rounded-full', statusDotClass(st))} />
                                <span className="flex-1">{st}</span>
                                {status === st && <Check className="h-3.5 w-3.5 text-[var(--accent)]" />}
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-[var(--val-bad)] focus:text-[var(--val-bad)]">
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete study
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title="Delete this study?"
                description={`"${title}" and its images, sessions and reports will be permanently deleted.`}
                onConfirm={() => deleteStudy(patientId, study.id)}
            />
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
        addContext,
        setActiveDialog,
        generateShareLink,
        addVisit,
        addStudy,
    } = useAppStore(useShallow(s => ({
        patients: s.patients,
        activePatientId: s.activePatientId,
        setActivePatient: s.setActivePatient,
        archivePatient: s.archivePatient,
        contexts: s.contexts,
        addContext: s.addContext,
        setActiveDialog: s.setActiveDialog,
        generateShareLink: s.generateShareLink,
        addVisit: s.addVisit,
        addStudy: s.addStudy,
    })));

    const [searchQuery, setSearchQuery] = useState('');
    // One create/open action at a time — prevents duplicate visits/studies/
    // contexts from double clicks (BUGS NAV-19).
    const [busy, setBusy] = useState(false);
    const runExclusive = async (fn: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
        } catch (e) {
            console.error(e);
            alert(`Something went wrong: ${e instanceof Error ? e.message : 'server error'}. Please try again.`);
        } finally {
            setBusy(false);
        }
    };
    const [showArchived, setShowArchived] = useState(false);
    const [patientToDelete, setPatientToDelete] = useState<{ id: string; name: string } | null>(null);
    const deletePatient = useAppStore(s => s.deletePatient);
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
        // Only when the patient changes — not on every patient-list refresh (NAV-25).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePatientId]);

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

    const handleAddStudy = () => runExclusive(async () => {
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
            const newVisitId = `visit-${crypto.randomUUID()}`;
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
        const studyId = `std-${crypto.randomUUID()}`;
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
        useAppStore.getState().closeCase();
        const newContext = {
            id: `ctx-${crypto.randomUUID()}`,
            patientId: activePatient.id,
            visitId: targetVisitId,
            studyIds: [studyId],
            mode: 'plan' as const,
            name: `New Study - ${format(new Date(), 'MMM dd')}`,
            lastModified: format(new Date(), 'yyyy-MM-dd HH:mm'),
        };
        await addContext(newContext);

        navigate('/workspace');
    });

    const handleArchiveToggle = async (patientId: string, currentArchived: boolean) => {
        if (confirm(`Are you sure you want to ${currentArchived ? 'restore' : 'archive'} this patient?`)) {
            await archivePatient(patientId, !currentArchived);
            if (!currentArchived && activePatientId === patientId) {
                useAppStore.getState().resetWorkspace();
            }
        }
    };

    const handleStudyClick = (study: Study) => {
        setSelectedStudyForAction(study);
        setStudyActionDialogOpen(true);
    };

    const handleContinueContext = (context: { id: string; patientId: string }) => runExclusive(async () => {
        // Tear down the Cornerstone runtime before opening a normal workspace.
        // This prevents stale RenderingEngine / ToolGroup / cache state from
        // the previous DICOM session from influencing CanvasWorkspace.
        if (useAppStore.getState().isDicomMode) {
            destroyCornerstone();
        }
        await setActivePatient(context.patientId, context.id);
        navigate('/workspace');
    });

    const handleStartNewFromStudy = (study: Study) => runExclusive(async () => {
        // Tear down the Cornerstone runtime before opening a normal workspace.
        if (useAppStore.getState().isDicomMode) {
            destroyCornerstone();
        }
        const newContext = {
            id: `ctx-${crypto.randomUUID()}`,
            patientId: study.patientId,
            visitId: study.visitId,
            studyIds: [study.id],
            mode: 'plan' as const,
            name: `${getStudyDisplayName(study)} - ${format(new Date(), 'MMM dd')}`,
            lastModified: format(new Date(), 'yyyy-MM-dd HH:mm'),
        };
        // Load the patient (clears any previous case) then create the session.
        await setActivePatient(study.patientId);
        await addContext(newContext);
        navigate('/workspace');
    });

    // Always show fresh data: studies/sessions saved in the workspace (or a
    // newly saved untitled study) appear as soon as this page opens.
    useEffect(() => {
        const st = useAppStore.getState();
        void st.refreshPatients().catch(() => {});
        if (st.activePatientId && !st.activeContextId) void st.setActivePatient(st.activePatientId);
    }, []);

    const selectPatient = async (patientId: string) => {
        await setActivePatient(patientId);
    };

    return (
        <div className="flex h-full min-h-0 overflow-hidden bg-[var(--bg)] text-[var(--text)]">
            {/* Left — Patient list */}
            <div className="flex w-[320px] min-h-0 flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
                <div className="flex-shrink-0 space-y-3 border-b border-[var(--border)] p-4">
                    <div>
                        <h1 className="text-lg font-semibold text-[var(--text)]">Patients</h1>
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-[var(--text-3)]">{processedPatients.length} {showArchived ? 'archived' : 'patients'}</p>
                            <button
                                onClick={() => setShowArchived(!showArchived)}
                                className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors',
                                    showArchived ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]' : 'border-[var(--border-2)] text-[var(--text-3)] hover:text-[var(--text-2)]')}
                            >
                                {showArchived ? 'Showing archived' : 'Archived'}
                            </button>
                        </div>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--text-3)]" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search patients..."
                            className="h-9 border-[var(--border)] bg-[var(--surface)] pl-9 text-sm text-[var(--text)] placeholder:text-[var(--text-3)]"
                        />
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
                                        : 'border-transparent hover:bg-[var(--surface)]',
                                    patient.isArchived && 'opacity-60',
                                )}
                            >
                                <Avatar className="h-10 w-10 border border-[var(--border)]">
                                    <AvatarFallback className={cn('text-xs font-bold', isActive ? 'bg-[#FF453A] text-white' : 'bg-[var(--surface-3)] text-[var(--text-2)]')}>
                                        {patientInitials(patient.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-semibold text-[var(--text)]">{patient.name}</div>
                                    <div className="truncate text-xs text-[var(--text-3)]">
                                        {patient.age ? `${patient.age}${patient.gender || ''}` : '—'}
                                        {mrn ? ` · MRN ${mrn}` : ''}
                                    </div>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-[var(--text-3)] hover:text-[var(--text)]">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
                                        <DropdownMenuItem onClick={() => generateShareLink({ patientId: patient.id })}>
                                            <Share2 className="mr-2 h-3.5 w-3.5 text-[var(--text-3)]" /> Share
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleArchiveToggle(patient.id, !!patient.isArchived)}>
                                            {patient.isArchived ? (
                                                <><ArchiveRestore className="mr-2 h-3.5 w-3.5 text-[var(--text-3)]" /> Restore</>
                                            ) : (
                                                <><Archive className="mr-2 h-3.5 w-3.5 text-[var(--text-3)]" /> Archive</>
                                            )}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => setPatientToDelete({ id: patient.id, name: patient.name })} className="text-[var(--val-bad)] focus:text-[var(--val-bad)]">
                                            <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete patient
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        );
                    })}
                </div>

                <div className="border-t border-[var(--border)] p-4">
                    <NewPatientDialog />
                </div>
            </div>

            {/* Right — Patient detail + timeline */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {activePatient ? (
                    <>
                        <div className="flex items-start justify-between border-b border-[var(--border)] px-8 py-6">
                            <div className="flex items-start gap-4">
                                <Avatar className="h-16 w-16 border-2 border-[var(--border)]">
                                    <AvatarFallback className="bg-[#FF453A]/15 text-lg font-bold text-[#FF453A]">
                                        {patientInitials(activePatient.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <h2 className="text-2xl font-semibold text-[var(--text)]">{activePatient.name}</h2>
                                    <p className="mt-1 text-sm text-[var(--text-2)]">
                                        {activePatient.age ? `${activePatient.age}${activePatient.gender || ''}` : '—'}
                                        {activePatient.contact ? ` · MRN ${activePatient.contact}` : activePatient.id ? ` · MRN ${activePatient.id}` : ''}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--text-3)]">
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
                                <NewPatientDialog patient={activePatient} />
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
                            <div className="relative ml-4 border-l-2 border-[#FF453A]/30 pl-8 pb-4">
                                {groupedTimeline.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)]/50 py-12 text-center text-sm text-[var(--text-3)]">
                                        No studies recorded. Add a new study to build the timeline.
                                    </div>
                                ) : (
                                    groupedTimeline.map((group) => {
                                        const expanded = expandedGroups.has(group.date);
                                        const studies = group.studies;
                                        const groupTitle = group.visits[0]?.diagnosis || group.visits[0]?.visitNumber || null;
                                        return (
                                            <div key={group.date} className="relative mb-6">
                                                <span className="absolute -left-[41px] top-1 h-3 w-3 rounded-full border-2 border-[#FF453A] bg-[var(--bg)]" />
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroup(group.date)}
                                                    className="mb-3 flex w-full items-center justify-between text-left"
                                                >
                                                    <div>
                                                        <div className="text-sm font-semibold text-[var(--text)]">
                                                            {group.date} {groupTitle ? `· ${groupTitle}` : ''}
                                                        </div>
                                                        <div className="text-xs font-medium text-[#FF453A]">
                                                            {studies.length} stud{studies.length === 1 ? 'y' : 'ies'}
                                                        </div>
                                                    </div>
                                                    {expanded ? (
                                                        <ChevronDown className="h-4 w-4 text-[var(--text-3)]" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4 text-[var(--text-3)]" />
                                                    )}
                                                </button>

                                                {expanded && (
                                                    <div className="space-y-3">
                                                        {studies.length === 0 ? (
                                                            <div className="rounded-xl border border-dashed border-[var(--border)] py-6 text-center text-xs text-[var(--text-3)]">
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
                                        <span className="absolute -left-[41px] top-4 h-3 w-3 rounded-full border-2 border-[var(--border)] bg-[var(--bg)]" />
                                        <div className="rounded-xl border border-dashed border-[#FF453A]/30 bg-[#FF453A]/5 p-4">
                                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                                <ImportDialog presetPatientId={activePatient.id} navigateOnImport>
                                                    <Button className="h-8 gap-2 border border-[#FF453A]/30 bg-[#FF453A]/10 text-xs font-semibold text-[#FF453A] hover:bg-[#FF453A]/20">
                                                        <Plus className="h-4 w-4" /> Add New Study
                                                    </Button>
                                                </ImportDialog>
                                            </div>
                                            <p className="text-xs text-[var(--text-3)]">
                                                Add new studies and imaging to this patient's timeline.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                    </>
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center text-[var(--text-3)]">
                        <User className="mb-3 h-12 w-12 opacity-30" />
                        <p className="text-sm">Select a patient to view their timeline</p>
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={!!patientToDelete}
                onOpenChange={(o) => { if (!o) setPatientToDelete(null); }}
                title="Delete this patient?"
                description={`${patientToDelete?.name || 'This patient'} and all their visits, studies, images, sessions and reports will be permanently deleted.`}
                confirmLabel="Delete patient"
                onConfirm={() => deletePatient(patientToDelete!.id)}
            />

            {/* Session manager — existing workspace entry flow */}
            <Dialog open={studyActionDialogOpen} onOpenChange={(o) => {
                setStudyActionDialogOpen(o);
                setActiveDialog(o ? 'study-manager' : null);
            }}>
                <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3">
                            <History className="h-5 w-5 text-[#FF453A]" />
                            Session Manager
                        </DialogTitle>
                        <DialogDescription className="">
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
                                        className="h-auto w-full justify-between border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-[var(--text)] hover:border-[#FF453A]/40"
                                        onClick={() => handleContinueContext(session)}
                                    >
                                        <div className="text-left">
                                            <div className="text-sm font-semibold">{session.name}</div>
                                            <div className="text-[10px] text-[var(--text-3)]">{session.lastModified}</div>
                                        </div>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                ))
                        ) : (
                            <div className="rounded-xl border border-dashed border-[var(--border)] py-6 text-center text-xs text-[var(--text-3)]">
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
