import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit2 } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useAppStore, Patient } from "@/lib/store/index";
import { format } from "date-fns";

interface NewPatientDialogProps {
    patient?: Patient;
}

export function NewPatientDialog({ patient }: NewPatientDialogProps) {
    const { addPatient, updatePatient, setActiveDialog } = useAppStore();
    const [open, setOpen] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        id: '',
        age: '',
        gender: 'M',
        dob: '',
        sex: '',
        contact: ''
    });

    useEffect(() => {
        if (patient) {
            setFormData({
                name: patient.name || '',
                id: patient.id || '',
                age: patient.age == null ? '' : String(patient.age),
                gender: (patient.gender || 'M') as 'M' | 'F' | 'O',
                dob: patient.dob || '',
                sex: patient.sex || '',
                contact: patient.contact || ''
            });
        }
    }, [patient, open]);

    const handleAgeChange = (age: string) => {
        setFormData(prev => {
            const updates: any = { ...prev, age };
            if (age && !isNaN(parseInt(age))) {
                const birthYear = new Date().getFullYear() - parseInt(age);
                updates.dob = `${birthYear}-01-01`; // Approximation
            }
            return updates;
        });
    };

    const handleDOBChange = (dob: string) => {
        setFormData(prev => {
            const updates: any = { ...prev, dob };
            if (dob) {
                const birthDate = new Date(dob);
                const age = new Date().getFullYear() - birthDate.getFullYear();
                updates.age = age.toString();
            }
            return updates;
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (patient) {
            const updatedPatient: Patient = {
                ...patient,
                name: formData.name,
                age: parseInt(formData.age) || 0,
                gender: formData.gender as 'M' | 'F' | 'O',
                dob: formData.dob,
                sex: formData.sex,
                contact: formData.contact
            };
            updatePatient(updatedPatient);
        } else {
            const newPatient: Patient = {
                id: formData.id || `PAT-${Date.now().toString().slice(-6)}`,
                name: formData.name,
                age: parseInt(formData.age) || 0,
                gender: formData.gender as 'M' | 'F' | 'O',
                dob: formData.dob,
                lastVisit: format(new Date(), 'MMM dd, yyyy'),
                visits: [],
                studies: [],
                sex: formData.sex,
                contact: formData.contact
            };
            addPatient(newPatient);
        }

        setOpen(false);
        if (!patient) {
            setFormData({ name: '', id: '', age: '', gender: 'M', dob: '', sex: '', contact: '' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={(val) => { setOpen(val); setActiveDialog(val ? 'patient' : null); }}>
            <DialogTrigger asChild>
                {patient ? (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                        <Edit2 className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button className="w-full bg-secondary hover:bg-muted text-foreground border border-border font-bold rounded-xl transition-all active:scale-95">
                        <Plus className="mr-2 h-4 w-4 text-primary" /> New Patient
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{patient ? 'Edit Patient Details' : 'Add New Patient'}</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                        {patient ? 'Update the details for this patient record.' : 'Enter patient details to create a new record and start a visit.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="name" className="text-right text-muted-foreground">Name</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="col-span-3 bg-background border-border text-foreground focus:ring-primary/20"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="id" className="text-right text-muted-foreground">ID</Label>
                            <Input
                                id="id"
                                value={formData.id}
                                onChange={e => setFormData({ ...formData, id: e.target.value })}
                                placeholder="Auto-generated if empty"
                                className="col-span-3 bg-background border-border text-foreground focus:ring-primary/20"
                                disabled={!!patient}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="age" className="text-right text-muted-foreground">Age</Label>
                            <Input
                                id="age"
                                type="number"
                                value={formData.age}
                                onChange={e => handleAgeChange(e.target.value)}
                                className="col-span-3 bg-background border-border text-foreground focus:ring-primary/20"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="gender" className="text-right text-muted-foreground">Sex</Label>
                            <Select
                                value={formData.gender}
                                onValueChange={(val) => setFormData({ ...formData, gender: val as any })}
                            >
                                <SelectTrigger id="gender" className="col-span-3 bg-background border-border text-foreground transition-all">
                                    <SelectValue placeholder="Select sex" />
                                </SelectTrigger>
                                <SelectContent className="z-[150] rounded-xl font-['Outfit'] shadow-2xl">
                                    <SelectItem value="M" className="font-bold cursor-pointer">Male</SelectItem>
                                    <SelectItem value="F" className="font-bold cursor-pointer">Female</SelectItem>
                                    <SelectItem value="O" className="font-bold cursor-pointer">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="dob" className="text-right text-muted-foreground">DOB</Label>
                            <Input
                                id="dob"
                                type="date"
                                value={formData.dob}
                                onChange={e => handleDOBChange(e.target.value)}
                                className="col-span-3 bg-background border-border text-foreground focus:ring-primary/20"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="sex_detail" className="text-right text-muted-foreground">Sex (Other)</Label>
                            <Input
                                id="sex_detail"
                                value={formData.sex}
                                onChange={e => setFormData({ ...formData, sex: e.target.value })}
                                placeholder="Optional"
                                className="col-span-3 bg-background border-border text-foreground focus:ring-primary/20"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="contact" className="text-right text-muted-foreground">Contact</Label>
                            <Input
                                id="contact"
                                value={formData.contact}
                                onChange={e => setFormData({ ...formData, contact: e.target.value })}
                                placeholder="Phone / Email"
                                className="col-span-3 bg-background border-border text-foreground focus:ring-primary/20"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95">
                            {patient ? 'Save Changes' : 'Create Patient'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
