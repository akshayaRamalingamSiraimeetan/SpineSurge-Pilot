import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Small themed confirmation dialog (used for deletes / replacements). */
export function ConfirmDialog({
    open, onOpenChange, title, description, confirmLabel = 'Delete', destructive = true, onConfirm,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    title: string;
    description: string;
    confirmLabel?: string;
    destructive?: boolean;
    onConfirm: () => Promise<void> | void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <Dialog open={open} onOpenChange={(o) => { if (!busy) { setError(null); onOpenChange(o); } }}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                {error && <div className="text-xs text-[var(--val-bad)]">{error}</div>}
                <DialogFooter className="gap-2">
                    <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        variant={destructive ? 'destructive' : 'default'}
                        disabled={busy}
                        onClick={async () => {
                            setBusy(true); setError(null);
                            try { await onConfirm(); onOpenChange(false); }
                            catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); }
                            finally { setBusy(false); }
                        }}
                    >
                        {busy ? 'Working…' : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
