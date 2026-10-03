import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    ChevronDown,
    ChevronRight,
    Calendar,
    User,
    Search,
    Archive,
    ArchiveRestore,
    Plus,
    Share2,
    MoreVertical,
    Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { format, parse } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useShallow } from "zustand/react/shallow";
import { useAppStore, Study } from "@/lib/store/index";
import { useState, useMemo, useEffect } from "react";
import { NewPatientDialog } from "@/features/patients/NewPatientDialog";
import { StudyCard } from "@/components/StudyCard";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { destroyCornerstone } from "@/lib/cornerstone/initCornerstone";
import { isQuickAnalysisPatient } from "@/lib/studies";


function patientInitials(name?: string) {
    const safe = (name || 'Unknown').toString();
    return safe.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'UP';
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

const PatientCasesPage = () => {
    const navigate = useNavigate();
    const {
        patients,
        activePatientId,
        setActivePatient,
        archivePatient,
        addContext,
        generateShareLink,
        addVisit,
        addStudy,
    } = useAppStore(useShallow(s => ({
        patients: s.patients,
        activePatientId: s.activePatientId,
        setActivePatient: s.setActivePatient,
        archivePatient: s.archivePatient,
        addContext: s.addContext,
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

        // Straight into the workspace with the import dialog open, like Home (UI10-03)
        navigate('/workspace?import=1');
    });

    const handleArchiveToggle = async (patientId: string, currentArchived: boolean) => {
        if (confirm(`Are you sure you want to ${currentArchived ? 'restore' : 'archive'} this patient?`)) {
            await archivePatient(patientId, !currentArchived);
            if (!currentArchived && activePatientId === patientId) {
                useAppStore.getState().resetWorkspace();
            }
        }
    };

    // "Open in workspace" always continues the study's latest session; a new
    // study is made with "Add New Study" (UI9-02).
    const handleStudyClick = (study: Study) => runExclusive(async () => {
        if (useAppStore.getState().isDicomMode) destroyCornerstone();
        await useAppStore.getState().openStudy(study.patientId || activePatientId!, study.id);
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
                                                {/* Straight into the workspace with a new empty study; the image is imported there (UI7-02) */}
                                                <Button onClick={handleAddStudy} className="h-8 gap-2 border border-[#FF453A]/30 bg-[#FF453A]/10 text-xs font-semibold text-[#FF453A] hover:bg-[#FF453A]/20">
                                                    <Plus className="h-4 w-4" /> Add New Study
                                                </Button>
                                            </div>
                                            <p className="text-xs text-[var(--text-3)]">
                                                Opens a new study in the workspace — import the image there.
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

        </div>
    );
};

export default PatientCasesPage;
