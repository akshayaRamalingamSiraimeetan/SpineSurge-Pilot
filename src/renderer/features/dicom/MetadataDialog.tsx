import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppStore } from "@/lib/store/index";
import { ScrollArea } from "@/components/ui/scroll-area";

export const MetadataDialog = ({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) => {
    const { dicom3D, setDicomShowMetadataOverlay } = useAppStore();
    const { metadata, showMetadataOverlay } = dicom3D;

    const metadataItems = [
        { label: "Patient Name", value: metadata?.patientName },
        { label: "Patient ID", value: metadata?.patientID },
        { label: "Birth Date", value: metadata?.patientBirthDate },
        { label: "Patient Sex", value: metadata?.patientSex },
        { label: "Study Date", value: metadata?.studyDate },
        { label: "Modality", value: (metadata as any)?.modality },
        { label: "Manufacturer", value: (metadata as any)?.manufacturer },
        { label: "Institution", value: metadata?.institutionName },
        { label: "Description", value: metadata?.studyDescription },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader className="border-b border-border pb-4 mb-4">
                    <DialogTitle className="text-xl font-bold uppercase tracking-tight text-primary">DICOM Dataset Metadata</DialogTitle>
                </DialogHeader>

                <ScrollArea className="max-h-[50vh] pr-4">
                    {!metadata ? (
                        <div className="py-10 text-center">
                            <p className="text-muted-foreground text-sm font-bold opacity-40">No active DICOM study loaded.</p>
                        </div>
                    ) : (
                        <div className="space-y-4 py-2">
                            {metadataItems.map((item, idx) => (
                                <div key={idx} className="flex flex-col gap-1 border-b border-slate-800/50 pb-3 transition-colors hover:border-slate-700">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{item.label}</span>
                                    <span className="text-sm font-semibold text-slate-200">{item.value || "--"}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                <div className="mt-6 flex items-center justify-between p-5 rounded-2xl bg-primary/5 border border-primary/20 shadow-inner">
                    <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-foreground">Viewport Overlay</span>
                        <span className="text-[10px] text-muted-foreground font-bold tracking-tight opacity-70">Display key patient info in workspace</span>
                    </div>
                    <Checkbox
                        id="show-metadata-overlay"
                        checked={showMetadataOverlay}
                        onCheckedChange={(checked) => setDicomShowMetadataOverlay(!!checked)}
                        className="h-5 w-5 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-all rounded-md"
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
};
