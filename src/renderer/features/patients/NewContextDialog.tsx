import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Plus, Check, Image as ImageIcon } from "lucide-react";
import { useAppStore, Context } from "@/lib/store/index";
import { format } from "date-fns";

interface NewContextDialogProps {
    patientId: string;
    visitId: string;
}

export function NewContextDialog({ patientId, visitId }: NewContextDialogProps) {
    const { addContext, patients } = useAppStore();
    const patient = patients.find(p => p.id === patientId);
    // Use all patient studies for planning sessions to allow cross-visit planning
    const studies = patient?.studies || [];

    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [selectedStudyIds, setSelectedStudyIds] = useState<string[]>([]);

    const toggleStudySelection = (id: string) => {
        setSelectedStudyIds(prev =>
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    };


    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleCreate = async () => {
        if (selectedStudyIds.length === 0) return;
        setIsSubmitting(true);

        try {
            const newContext: Context = {
                id: `ctx-${Date.now()}`,
                patientId,
                visitId,
                studyIds: selectedStudyIds,
                mode: 'plan',
                name: name || `Study Session - ${format(new Date(), 'MMM dd')}`,
                lastModified: format(new Date(), 'yyyy-MM-dd HH:mm')
            };

            await addContext(newContext);
            setOpen(false);
            setName("");
            setSelectedStudyIds([]);
        } catch (error) {
            console.error("Creation failed", error);
            alert("Failed to create study session. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !isSubmitting && setOpen(v)}>
            <DialogTrigger asChild>
                <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-600/20"
                >
                    <Plus className="h-3 w-3 mr-1" /> Create Study
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                <DialogHeader className="border-b border-border pb-4">
                    <DialogTitle className="text-xl font-bold">Create Study Session</DialogTitle>
                    <DialogDescription className="text-muted-foreground font-medium">
                        Combine imaging studies into a new planning session for {patient?.name}.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Session Name */}
                    <div className="space-y-2">
                        <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest pl-1">Session Name</Label>
                        <Input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Pre-op Planning L4-L5"
                            className="bg-background border-border text-foreground focus:ring-primary/20 transition-all h-10 font-bold"
                        />
                    </div>

                    {/* Study Selection */}
                    <div className="space-y-3">
                        <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest pl-1">Included Imaging</Label>
                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {studies.length > 0 ? (
                                studies.map(study => (
                                    <div
                                        key={study.id}
                                        onClick={() => toggleStudySelection(study.id)}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${selectedStudyIds.includes(study.id) ? 'bg-primary/10 border-primary shadow-sm' : 'bg-background border-border hover:bg-muted'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`h-12 w-12 rounded-lg overflow-hidden flex items-center justify-center transition-colors ${selectedStudyIds.includes(study.id) ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                                {study.scans && study.scans.length > 0 ? (
                                                    <img
                                                        src={study.scans[0].imageUrl}
                                                        alt="Study thumbnail"
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <ImageIcon className="h-5 w-5" />
                                                )}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-foreground">{study.modality} session</div>
                                                <div className="text-[10px] text-muted-foreground font-bold italic">{study.acquisitionDate} • {(study.scans || []).length} images</div>
                                            </div>
                                        </div>
                                        {selectedStudyIds.includes(study.id) && (
                                            <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                                                <Check className="h-4 w-4 text-primary-foreground" />
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-10 bg-muted/30 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center">
                                    <div className="text-muted-foreground text-sm font-bold mb-1">No imaging available</div>
                                    <div className="text-[10px] text-muted-foreground font-medium opacity-60 uppercase tracking-tight">Import scans before creating a study session.</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-3 pt-4 border-t border-border">
                    <Button
                        variant="ghost"
                        onClick={() => setOpen(false)}
                        disabled={isSubmitting}
                        className="flex-1 font-bold text-muted-foreground hover:text-foreground"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={selectedStudyIds.length === 0 || isSubmitting}
                        className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-black shadow-lg shadow-primary/20 rounded-xl"
                    >
                        {isSubmitting ? "Creating..." : "Done"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
