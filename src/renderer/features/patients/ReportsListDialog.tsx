import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { FileText, Loader2, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";

export function ReportsListDialog({ visitId }: { visitId: string }) {
    const [open, setOpen] = useState(false);
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedReportUrl, setSelectedReportUrl] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setLoading(true);
            api.getReports(visitId)
                .then(setReports)
                .catch(err => console.error(err))
                .finally(() => setLoading(false));
        }
    }, [open, visitId]);

    return (
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 border-border text-muted-foreground hover:bg-muted select-none font-bold rounded-lg transition-all" onPointerDown={(e) => e.stopPropagation()}>
                        <FileText className="h-3.5 w-3.5 mr-2 text-primary" /> View Reports
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
                                No reports generated for this visit.
                            </div>
                        ) : (
                            reports.map((report) => (
                                <div key={report.id} className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl border border-border hover:bg-secondary transition-colors group">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-foreground">{report.title || "Report"}</span>
                                        <span className="text-[10px] text-muted-foreground opacity-70 font-mono tracking-tight">{report.created_at}</span>
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
                            <DialogTitle className="text-sm font-bold text-foreground">Report Viewer</DialogTitle>
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
