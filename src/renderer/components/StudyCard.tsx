import { useMemo, useState } from "react";
import { Image as ImageIcon, ExternalLink, MoreVertical, Pencil, Share2, Check, Trash2, Eye, Users, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ReportsListDialog } from "@/features/patients/ReportsListDialog";
import { useAppStore, getStudyDisplayName, STUDY_STATUSES, type Study, type StudyStatus } from "@/lib/store/index";
import { cn } from "@/lib/utils";
import { imageScans, studyThumbnail } from "@/lib/studies";
import { api } from "@/lib/api";

/**
 * One study card, used by the Patients page timeline and the Home page's
 * Recent Studies so both always look and behave the same (UI9-01).
 */
function statusBadgeClass(status?: string | null) {
    switch (status) {
        case 'Completed':   return 'text-emerald-400 bg-emerald-400/10';
        case 'In Progress': return 'text-[#FF453A] bg-[#FF453A]/10';
        default:            return 'text-[var(--text-2)] bg-[var(--surface-3)]';
    }
}

function statusDotClass(status?: string | null) {
    switch (status) {
        case 'Completed':   return 'bg-emerald-400';
        case 'In Progress': return 'bg-[#FF453A]';
        default:            return 'bg-[#9CA3AF]';
    }
}

export function StudyCard({
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
    const [confirmRemove, setConfirmRemove] = useState(false);
    // owner: everything · edit (shared): rename/status · view: look only (UI12-10)
    const access = study.access ?? 'owner';
    const isOwner = access === 'owner';
    const canWrite = access !== 'view';
    const removeShared = async () => {
        const st = useAppStore.getState();
        await api.removeSharedStudy(study.id, st.token);
        if (st.activePatientId === patientId) st.resetWorkspace();
        await st.refreshPatients();
    };
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
    // Studies have three states now; old 'Archived' studies read as Completed (UI9-04).
    const status: StudyStatus = study.status === 'Archived' ? 'Completed' : ((study.status as StudyStatus) || 'Draft');
    // CT/MR: the saved 3D screenshot (UI11-02)
    const thumb = studyThumbnail(study);
    const imageCount = imageScans(study).length;
    const scanLabel = imageCount
        ? `${imageCount} image${imageCount === 1 ? '' : 's'}`
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
                        className={cn('mt-0.5 block max-w-full truncate text-left text-xs text-[var(--text-2)]', canWrite && 'hover:underline decoration-dotted underline-offset-4')}
                        title={canWrite ? 'Click to name this study' : undefined}
                        disabled={!canWrite}
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
                    {!isOwner && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]"
                            title={study.via === 'team' ? 'Team member\'s study — view only' : `Shared by ${study.ownerName ?? 'another user'}`}>
                            {access === 'view' ? <Eye className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                            {study.ownerName ?? 'Shared'} · {access === 'view' ? 'View only' : 'Can edit'}
                        </span>
                    )}
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
                <ReportsListDialog studyId={study.id} patientId={patientId} />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" title="More" className="h-8 w-8 text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    {/* Don't refocus the trigger on close: it blurred (and saved) the rename field (UI11-17) */}
                    <DropdownMenuContent align="end" className="w-48" onCloseAutoFocus={(e) => e.preventDefault()}>
                        {canWrite && (
                            <DropdownMenuItem onClick={() => { setNameDraft(customName); setRenaming(true); }}>
                                <Pencil className="mr-2 h-3.5 w-3.5 text-[var(--text-3)]" /> Rename
                            </DropdownMenuItem>
                        )}
                        {isOwner && (
                            <DropdownMenuItem onClick={() => generateShareLink({ patientId, studyId: study.id })}>
                                <Share2 className="mr-2 h-3.5 w-3.5 text-[var(--text-3)]" /> Share
                            </DropdownMenuItem>
                        )}
                        {canWrite && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">Status</DropdownMenuLabel>
                                {STUDY_STATUSES.map(st => (
                                    <DropdownMenuItem key={st} onClick={() => setStatus(st)}>
                                        <span className={cn('mr-2.5 h-2 w-2 rounded-full', statusDotClass(st))} />
                                        <span className="flex-1">{st}</span>
                                        {status === st && <Check className="h-3.5 w-3.5 text-[var(--accent)]" />}
                                    </DropdownMenuItem>
                                ))}
                            </>
                        )}
                        {isOwner ? (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="text-[var(--val-bad)] focus:text-[var(--val-bad)]">
                                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete study
                                </DropdownMenuItem>
                            </>
                        ) : study.via === 'share' ? (
                            <>
                                {canWrite && <DropdownMenuSeparator />}
                                <DropdownMenuItem onClick={() => setConfirmRemove(true)}>
                                    <LogOut className="mr-2 h-3.5 w-3.5 text-[var(--text-3)]" /> Remove from my list
                                </DropdownMenuItem>
                            </>
                        ) : (
                            <DropdownMenuLabel className="px-2.5 py-1.5 text-[11px] font-normal text-[var(--text-3)]">Team member's study — view only</DropdownMenuLabel>
                        )}
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
            <ConfirmDialog
                open={confirmRemove}
                onOpenChange={setConfirmRemove}
                title="Remove from your list?"
                description={`"${title}" disappears from your Shared studies. ${study.ownerName ?? 'The owner'}'s study is not changed — they can share it again.`}
                confirmLabel="Remove"
                onConfirm={removeShared}
            />
        </div>
    );
}
