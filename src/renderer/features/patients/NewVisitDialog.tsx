import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { useAppStore, Visit } from "@/lib/store/index";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";

export function NewVisitDialog({ patientId }: { patientId: string }) {
    const addVisit = useAppStore(state => state.addVisit);
    const setActiveDialog = useAppStore(state => state.setActiveDialog);
    const getPatient = useAppStore(state => state.patients.find(p => p.id === patientId));
    const [open, setOpen] = useState(false);

    const [formData, setFormData] = useState({
        diagnosis: '',
        height: '',
        weight: '',
        consultant: 'Dr. Muthuraman (SRIHER)',
        comments: ''
    });

    const handleSubmit = () => {
        const patient = getPatient;
        if (!patient) return;

        const newVisit: Visit = {
            id: Date.now().toString(),
            visitNumber: `#${String(patient.visits.length + 1).padStart(4, '0')}`,
            date: format(new Date(), 'MMMM dd, yyyy'),
            time: format(new Date(), 'hh:mm a'),
            diagnosis: formData.diagnosis || 'New Diagnosis',
            comments: formData.comments,
            height: formData.height ? `${formData.height} cm` : '',
            weight: formData.weight ? `${formData.weight} kg` : '',
            consultants: formData.consultant,
            scanCount: 0,
            scans: [],
            studies: []
        };

        addVisit(patientId, newVisit);
        setOpen(false);
        setFormData({ diagnosis: '', height: '', weight: '', consultant: 'Dr. Muthuraman (SRIHER)', comments: '' });
    };

    return (
        <Dialog open={open} onOpenChange={(val) => { setOpen(val); setActiveDialog(val ? 'visit' : null); }}>
            <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95">
                    <Plus className="mr-2 h-4 w-4" /> Create Visit
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden">
                <div className="p-8">
                    <DialogHeader className="pb-4 border-b border-border">
                        <DialogTitle className="text-xl font-bold tracking-tight">Create New Visit</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-6">
                        {/* Diagnosis Row */}
                        <div className="grid grid-cols-1 gap-2">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest pl-1">Primary Diagnosis</Label>
                            <Input
                                value={formData.diagnosis}
                                onChange={e => setFormData({ ...formData, diagnosis: e.target.value })}
                                placeholder="e.g. Degenerative Spondylolisthesis"
                                className="bg-background border-border text-foreground focus:ring-primary/20 transition-all h-10 font-bold"
                            />
                        </div>

                        {/* Vitals Grid */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest pl-1">Height</Label>
                                <div className="relative">
                                    <Input
                                        value={formData.height}
                                        onChange={e => setFormData({ ...formData, height: e.target.value })}
                                        className="bg-background border-border text-foreground h-10 pr-9 focus:ring-primary/20"
                                        type="number"
                                    />
                                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-bold">cm</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest pl-1">Weight</Label>
                                <div className="relative">
                                    <Input
                                        value={formData.weight}
                                        onChange={e => setFormData({ ...formData, weight: e.target.value })}
                                        className="bg-background border-border text-foreground h-10 pr-9 focus:ring-primary/20"
                                        type="number"
                                    />
                                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-bold">kg</span>
                                </div>
                            </div>
                        </div>

                        {/* Consultant - Matching user image style */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center">
                                <Label className="w-24 text-[10px] uppercase font-bold text-muted-foreground tracking-widest pl-1">Consultant</Label>
                                <select
                                    value={formData.consultant}
                                    onChange={e => setFormData({ ...formData, consultant: e.target.value })}
                                    className="flex-1 bg-background border border-border text-foreground h-10 rounded-xl px-3 text-sm focus:ring-1 focus:ring-primary/20 outline-none transition-all cursor-pointer font-bold"
                                >
                                    <option>Dr. Muthuraman (SRIHER)</option>
                                    <option>Dr. Vignesh (Apollo)</option>
                                    <option>Dr. Satya (Global)</option>
                                    <option>Dr. External</option>
                                </select>
                            </div>
                        </div>

                        {/* Notes - Matching user image style */}
                        <div className="flex flex-col gap-2 pt-2">
                            <div className="flex items-start">
                                <Label className="w-24 mt-2 text-[10px] uppercase font-bold text-muted-foreground tracking-widest pl-1">Notes</Label>
                                <Textarea
                                    value={formData.comments}
                                    onChange={e => setFormData({ ...formData, comments: e.target.value })}
                                    placeholder="Enter clinical observations..."
                                    className="flex-1 bg-background border border-border text-foreground min-h-[120px] focus:ring-primary/20 transition-all resize-none p-3 rounded-lg"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="pt-4 border-t border-border">
                        <Button
                            variant="ghost"
                            onClick={() => setOpen(false)}
                            className="text-muted-foreground hover:text-foreground hover:bg-muted font-bold"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-8 shadow-lg shadow-primary/20 rounded-xl transition-all active:scale-95"
                        >
                            Save Visit
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
