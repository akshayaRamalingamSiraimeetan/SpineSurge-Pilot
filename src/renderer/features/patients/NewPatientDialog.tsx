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
import { Plus, Edit2 } from "lucide-react";
import { useAppStore, Patient } from "@/lib/store/index";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface NewPatientDialogProps {
    patient?: Patient;
}

type Sex = 'M' | 'F' | 'O';
const EMPTY = { name: '', id: '', age: '', gender: 'M' as Sex, dob: '', contact: '' };

/** Filled field without an outline (UI7-03); focus shows as a slightly stronger fill. */
const fieldCls = 'w-full h-9 rounded-lg bg-[var(--surface-2)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] border-0 outline-none focus:bg-[var(--surface-3)] transition-colors disabled:opacity-60';

const Field = ({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) => (
    <label className={cn('flex flex-col gap-1.5', className)}>
        <span className="text-xs font-medium text-[var(--text-2)]">{label}</span>
        {children}
    </label>
);

/** Patient record: name, ID, age, sex, date of birth, contact. */
export function NewPatientDialog({ patient }: NewPatientDialogProps) {
    const addPatient = useAppStore((s) => s.addPatient);
    const updatePatient = useAppStore((s) => s.updatePatient);
    const setActiveDialog = useAppStore((s) => s.setActiveDialog);
    const [open, setOpen] = useState(false);
    const [formData, setFormData] = useState(EMPTY);

    useEffect(() => {
        if (patient && open) {
            setFormData({
                name: patient.name || '',
                id: patient.id || '',
                age: patient.age ? String(patient.age) : '',
                gender: (patient.gender || 'M') as Sex,
                dob: patient.dob || '',
                contact: patient.contact || '',
            });
        }
    }, [patient, open]);

    // Age and DOB stay consistent: either one fills the other.
    const handleAgeChange = (age: string) => {
        const n = parseInt(age);
        setFormData((prev) => ({ ...prev, age, dob: Number.isFinite(n) ? `${new Date().getFullYear() - n}-01-01` : prev.dob }));
    };
    const handleDOBChange = (dob: string) => {
        const d = dob ? new Date(dob) : null;
        setFormData((prev) => ({ ...prev, dob, age: d && !isNaN(d.getTime()) ? String(new Date().getFullYear() - d.getFullYear()) : prev.age }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const common = {
            name: formData.name.trim(),
            age: parseInt(formData.age) || 0,
            gender: formData.gender,
            dob: formData.dob,
            contact: formData.contact.trim(),
        };

        if (patient) {
            await updatePatient({ ...patient, ...common });
        } else {
            const newPatient: Patient = {
                id: formData.id.trim() || `PAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                ...common,
                lastVisit: format(new Date(), 'MMM dd, yyyy'),
                visits: [],
                studies: [],
                sex: '',
            };
            // POST /api/patients is an upsert — never let a typed ID overwrite
            // an existing patient (BUGS WS-31).
            if (useAppStore.getState().patients.some(p => p.id === newPatient.id)) {
                alert(`A patient with ID "${newPatient.id}" already exists.`);
                return;
            }
            try {
                await addPatient(newPatient);
            } catch (err) {
                alert(`Could not save patient: ${err instanceof Error ? err.message : 'server error'}`);
                return;
            }
        }

        setOpen(false);
        setActiveDialog(null);
        if (!patient) setFormData(EMPTY);
    };

    return (
        <Dialog open={open} onOpenChange={(val) => { setOpen(val); setActiveDialog(val ? 'patient' : null); }}>
            <DialogTrigger asChild>
                {patient ? (
                    <Button variant="ghost" size="icon" title="Edit patient" className="h-8 w-8 text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors">
                        <Edit2 className="h-4 w-4" />
                    </Button>
                ) : (
                    <Button className="w-full h-9 gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft-2)] transition-colors">
                        <Plus className="h-4 w-4" /> New Patient
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>{patient ? 'Edit patient' : 'New patient'}</DialogTitle>
                    <DialogDescription>
                        {patient ? 'Update the details for this patient.' : 'Create the patient record. Studies are added from the patient page.'}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-4 py-2">
                        <Field label="Name" className="col-span-2">
                            <input className={fieldCls} value={formData.name} required autoFocus
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                        </Field>
                        <Field label="Patient ID">
                            <input className={fieldCls} value={formData.id} placeholder="Auto if empty" disabled={!!patient}
                                onChange={(e) => setFormData({ ...formData, id: e.target.value })} />
                        </Field>
                        <Field label="Contact">
                            <input className={fieldCls} value={formData.contact} placeholder="Phone / email"
                                onChange={(e) => setFormData({ ...formData, contact: e.target.value })} />
                        </Field>
                        <Field label="Age">
                            <input className={fieldCls} type="number" min={0} max={130} value={formData.age}
                                onChange={(e) => handleAgeChange(e.target.value)} />
                        </Field>
                        <Field label="Date of birth">
                            <input className={fieldCls} type="date" value={formData.dob}
                                onChange={(e) => handleDOBChange(e.target.value)} />
                        </Field>
                        <div className="col-span-2 flex flex-col gap-1.5">
                            <span className="text-xs font-medium text-[var(--text-2)]">Sex</span>
                            <div className="flex gap-1 p-1 rounded-lg bg-[var(--surface-2)]">
                                {([['M', 'Male'], ['F', 'Female'], ['O', 'Other']] as const).map(([v, label]) => (
                                    <button key={v} type="button" onClick={() => setFormData({ ...formData, gender: v })}
                                        className={cn('flex-1 h-7 rounded-md text-xs font-medium transition-colors',
                                            formData.gender === v ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-3)] hover:text-[var(--text-2)]')}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="mt-4 gap-2">
                        <Button type="button" variant="ghost" onClick={() => { setOpen(false); setActiveDialog(null); }}
                            className="text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]">
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-[var(--accent)] hover:opacity-90 text-white font-semibold rounded-lg">
                            {patient ? 'Save changes' : 'Create patient'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
