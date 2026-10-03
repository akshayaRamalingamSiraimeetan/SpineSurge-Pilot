import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FileDown, Loader2, ExternalLink, Download } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store/index";
import { buildStudyReportBlob } from "@/lib/report/studyReport";

/**
 * Clinical reports of a study: the CURRENT report (built live from the latest
 * session — whether or not it was ever exported) plus the copies saved to the
 * record (UI9-03).
 */
export function ReportsListDialog({ studyId, patientId }: { studyId: string; patientId: string }) {
    const [open, setOpen] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [building, setBuilding] = useState(false);
    const [buildError, setBuildError] = useState<string | null>(null);
    const [saved, setSaved] = useState<any[]>([]);
    const token = useAppStore(s => s.token);

    useEffect(() => {
        if (!open) return;
        let ignore = false; // drop late results after close/study change (RPT-19)
        let url: string | null = null;
        setBuilding(true);
        setBuildError(null);
        buildStudyReportBlob(patientId, studyId)
            .then((blob) => {
                if (ignore) return;
                if (!blob) { setBuildError('Nothing to report yet — add an image or measurements to this study.'); return; }
                url = URL.createObjectURL(blob);
                setPreviewUrl(url);
            })
            .catch((e) => { if (!ignore) setBuildError(e instanceof Error ? e.message : 'Could not build the report'); })
            .finally(() => { if (!ignore) setBuilding(false); });
        api.getStudyReports(studyId, token)
            .then((r) => { if (!ignore) setSaved(r); })
            .catch(() => { /* saved copies are optional */ });
        return () => {
            ignore = true;
            if (url) URL.revokeObjectURL(url);
            setPreviewUrl(null);
        };
    }, [open, studyId, patientId, token]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" title="Clinical report" className="h-8 w-8 text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]" onPointerDown={(e) => e.stopPropagation()}>
                    <FileDown className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl w-[92vw] h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
                <DialogHeader className="px-5 py-3 border-b border-[var(--border)] flex-row items-center justify-between space-y-0 gap-4">
                    <div>
                        <DialogTitle>Clinical report</DialogTitle>
                        <DialogDescription>Latest version of this study's report.</DialogDescription>
                    </div>
                    {previewUrl && (
                        <a href={previewUrl} download="report.pdf" className="mr-8 flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:opacity-80">
                            <Download className="h-3.5 w-3.5" /> Download
                        </a>
                    )}
                </DialogHeader>

                <div className="flex-1 min-h-0 bg-[var(--bg)]">
                    {building ? (
                        <div className="h-full grid place-items-center text-[var(--text-3)]"><Loader2 className="animate-spin h-7 w-7" /></div>
                    ) : buildError ? (
                        <div className="h-full grid place-items-center text-sm text-[var(--text-3)] px-6 text-center">{buildError}</div>
                    ) : previewUrl ? (
                        <iframe src={previewUrl} className="w-full h-full border-none" title="Report preview" />
                    ) : null}
                </div>

                {saved.length > 0 && (
                    <div className="px-5 py-2.5 border-t border-[var(--border)] flex items-center gap-2 overflow-x-auto">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)] shrink-0">Saved copies</span>
                        {saved.map((r) => (
                            <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer"
                                className="shrink-0 flex items-center gap-1 rounded-md bg-[var(--surface-2)] px-2 py-1 text-[11px] text-[var(--text-2)] hover:text-[var(--text)]">
                                {(r.createdAt ?? r.created_at) ? new Date(r.createdAt ?? r.created_at).toLocaleDateString() : `v${r.version ?? 1}`}
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
