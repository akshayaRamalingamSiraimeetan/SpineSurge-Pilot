import { useEffect, useMemo, useState } from "react";
import { Copy, Check, Share2, X, UserPlus, Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useAppStore, getStudyDisplayName } from "@/lib/store/index";
import { api, type StudyShare } from "@/lib/api";
import { findStudy } from "@/lib/access";
import { cn } from "@/lib/utils";

type Permission = 'view' | 'edit';

const fieldCls = 'h-9 rounded-lg bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] border-0 outline-none focus:bg-[var(--surface-3)] transition-colors';

/** View / Edit toggle */
function PermissionToggle({ value, onChange, disabled }: { value: Permission; onChange: (p: Permission) => void; disabled?: boolean }) {
    return (
        <div className="flex gap-0.5 p-0.5 rounded-lg bg-[var(--surface-2)] flex-shrink-0">
            {(['view', 'edit'] as const).map((p) => (
                <button key={p} type="button" disabled={disabled} onClick={() => onChange(p)}
                    className={cn('flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50',
                        value === p ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]')}>
                    {p === 'view' ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                    {p === 'view' ? 'View' : 'Edit'}
                </button>
            ))}
        </div>
    );
}

/**
 * Share a study with people by their username (login email), view or edit
 * (UI12-10). They find it under "Shared with me" on their Patients page; with
 * edit rights both of you plan in the same session and changes sync live.
 */
export const ShareDialog = () => {
    const { shareDialogOpen, setShareDialogOpen, generatedLink, shareStudy, token } = useAppStore();
    const study = useAppStore((s) => findStudy(s, shareStudy?.patientId, shareStudy?.studyId));
    const patientName = useAppStore((s) => s.patients.find((p) => p.id === shareStudy?.patientId)?.name);
    const isOwner = (study?.access ?? 'owner') === 'owner';

    const [shares, setShares] = useState<StudyShare[]>([]);
    const [candidates, setCandidates] = useState<{ email: string; fullName: string | null }[]>([]);
    const [email, setEmail] = useState('');
    const [permission, setPermission] = useState<Permission>('view');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    const studyId = shareStudy?.studyId;
    useEffect(() => {
        if (!shareDialogOpen || !studyId || !isOwner) return;
        let alive = true;
        api.getStudyShares(studyId, token).then((r) => { if (alive) setShares(r); }).catch((e) => alive && setError(e.message));
        api.getShareCandidates(token).then((r) => { if (alive) setCandidates(r); }).catch(() => {});
        return () => { alive = false; };
    }, [shareDialogOpen, studyId, isOwner, token]);

    const suggestions = useMemo(() => {
        const q = email.trim().toLowerCase();
        const taken = new Set(shares.map((s) => s.email.toLowerCase()));
        return candidates
            .filter((c) => !taken.has(c.email.toLowerCase()))
            .filter((c) => !q || c.email.toLowerCase().includes(q) || (c.fullName ?? '').toLowerCase().includes(q))
            .slice(0, 5);
    }, [candidates, shares, email]);

    const close = (open: boolean) => {
        setShareDialogOpen(open);
        if (!open) { setEmail(''); setError(''); setShares([]); setPermission('view'); }
    };

    const run = async (fn: () => Promise<StudyShare[]>) => {
        setBusy(true);
        setError('');
        try {
            setShares(await fn());
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
            return false;
        } finally {
            setBusy(false);
        }
    };

    const add = async (who = email) => {
        if (!studyId || !who.trim()) return;
        if (await run(() => api.shareStudy(studyId, who.trim(), permission, token))) setEmail('');
    };

    const copyLink = () => {
        navigator.clipboard.writeText(generatedLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Dialog open={shareDialogOpen} onOpenChange={close}>
            <DialogContent className="sm:max-w-[480px] rounded-2xl">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent)] flex-shrink-0">
                            <Share2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="text-lg font-semibold">Share study</DialogTitle>
                            <DialogDescription className="truncate text-[var(--text-2)]">
                                {study ? `${patientName ?? 'Patient'} · ${getStudyDisplayName(study)}` : 'Open a study to share it.'}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {!study ? null : !isOwner ? (
                    <p className="text-sm text-[var(--text-2)] py-2">Only the owner of this study can share it.</p>
                ) : (
                    <div className="flex flex-col gap-4 pt-1">
                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-medium text-[var(--text-2)]">Add people by username (login email)</span>
                            <div className="flex gap-2">
                                <input className={cn(fieldCls, 'flex-1 min-w-0')} value={email} placeholder="name@hospital.com" disabled={busy}
                                    onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
                                <PermissionToggle value={permission} onChange={setPermission} disabled={busy} />
                                <Button onClick={() => add()} disabled={busy || !email.trim()} className="h-9 px-3 bg-[var(--accent)] hover:opacity-90 text-white">
                                    <UserPlus className="h-4 w-4" />
                                </Button>
                            </div>
                            {suggestions.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {suggestions.map((c) => (
                                        <button key={c.email} type="button" disabled={busy} onClick={() => add(c.email)}
                                            className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--text-2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                                            title={`Share with ${c.email} (${permission})`}>
                                            + {c.fullName || c.email}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {error && <span className="text-xs text-[var(--val-bad)]">{error}</span>}
                        </div>

                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-[var(--text-2)]">People with access</span>
                            {shares.length === 0 ? (
                                <p className="text-xs text-[var(--text-3)] py-2">Only you. Studies are private until you share them.</p>
                            ) : shares.map((sh) => (
                                <div key={sh.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-2)]">
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm text-[var(--text)]">{sh.fullName || sh.email}</div>
                                        {sh.fullName && <div className="truncate text-[11px] text-[var(--text-3)]">{sh.email}</div>}
                                    </div>
                                    <PermissionToggle value={sh.permission} disabled={busy}
                                        onChange={(p) => p !== sh.permission && run(() => api.shareStudy(studyId!, sh.email, p, token))} />
                                    <button type="button" title="Stop sharing" disabled={busy}
                                        onClick={() => run(() => api.unshareStudy(studyId!, sh.id, token))}
                                        className="h-7 w-7 flex items-center justify-center rounded-md text-[var(--text-3)] hover:text-[var(--val-bad)] hover:bg-[var(--surface-3)]">
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="rounded-xl bg-[var(--surface-2)] p-3 text-[11px] leading-relaxed text-[var(--text-2)]">
                            <b className="text-[var(--text)]">View</b> — they see the images, measurements and plan.{' '}
                            <b className="text-[var(--text)]">Edit</b> — they can plan too; you both work in the same session and changes sync live.
                            They can remove it from their list without affecting your study.
                        </div>

                        <button type="button" onClick={copyLink}
                            className="flex items-center justify-center gap-2 h-9 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition-colors">
                            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? 'Link copied' : 'Copy link (opens only for people with access)'}
                        </button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
