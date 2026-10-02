import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { FileText, FileDown, Loader2, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store/index";

export function ReportsListDialog({ studyId }: { studyId: string }) {
    const [open, setOpen] = useState(false);
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedReportUrl, setSelectedReportUrl] = useState<string | null>(null);
    const token = useAppStore(s => s.token);

    useEffect(() => {
        if (!open) return;
        let ignore = false; // drop late responses after close/study change (RPT-19)
        setLoading(true);
        api.getStudyReports(studyId, token)
            .then((r) => { if (!ignore) setReports(r); })
            .catch(err => console.error(err))
            .finally(() => { if (!ignore) setLoading(false); });
        return () => { ignore = true; };
    }, [open, studyId, token]);

    return (
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" title="Reports — open or download" className="h-8 w-8 text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]" onPointerDown={(e) => e.stopPropagation()}>
                        <FileDown className="h-4 w-4" />
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader className="border-b border-border pb-4">
                        <DialogTitle className="text-xl font-bold">Clinical Reports</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        {loading ? (
                            <div className="flex justify-center py-10 text-muted-foreground opacity-40">
                                <Loader2 className="animate-spin h-8 w-8" />
                            </div>
                        ) : reports.length === 0 ? (
                            <div className="text-center py-10 text-muted-foreground italic font-medium opacity-60">
                                No reports generated for this study yet.
                            </div>
                        ) : (
                            reports.map((report) => (
                                <div key={report.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl border border-border hover:bg-secondary transition-colors group">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-foreground">
                                            {report.title || `Report v${report.version || 1}`}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground opacity-70 font-mono tracking-tight">{(report.createdAt ?? report.created_at) ? new Date(report.createdAt ?? report.created_at).toLocaleString() : ''} · v{report.version ?? 1}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-primary hover:bg-primary/10 rounded-lg" onClick={() => setSelectedReportUrl(report.url)}>
                                            <FileText className="h-4 w-4" />
                                        </Button>
                                        <a href={report.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg">
                                                <ExternalLink className="h-4 w-4" />
                                            </Button>
                                        </a>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Viewer Dialog - Sibling to avoid nesting issues */}
            {selectedReportUrl && (
                <Dialog open={!!selectedReportUrl} onOpenChange={(o) => !o && setSelectedReportUrl(null)}>
                    <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader className="px-5 py-3 bg-card border-b border-border flex flex-row items-center justify-between">
                            <DialogTitle className="text-sm font-bold">Report Viewer</DialogTitle>
                            <Button size="sm" variant="ghost" onClick={() => setSelectedReportUrl(null)} className="text-muted-foreground hover:text-foreground hover:bg-muted font-bold rounded-lg h-8">Close</Button>
                        </DialogHeader>
                        <div className="flex-1 bg-muted/40">
                            <iframe src={selectedReportUrl} className="w-full h-full border-none" title="Report Viewer" />
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}
