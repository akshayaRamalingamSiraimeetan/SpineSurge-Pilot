import { useState, useMemo, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, User, Shield, Calendar, Layers, Check } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

import { useAppStore } from "@/lib/store/index";
import { API_BASE } from "@/lib/api";

export function ProfileDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const user = useAppStore(state => state.user);
    const updateUser = useAppStore(state => state.updateUser);

    const [localProfile, setLocalProfile] = useState({
        name: user?.name || (user as any)?.fullName || "",
        title: user?.title || "",
        email: user?.email || "",
        specialty: user?.specialty || "",
        joined: user?.joined || "",
        subsection: user?.subsection || ""
    });

    useEffect(() => {
        if (user) {
            setLocalProfile({
                name: user.name || (user as any).fullName || "",
                title: user.title || "",
                email: user.email || "",
                specialty: user.specialty || "",
                joined: user.joined || "",
                subsection: user.subsection || ""
            });
        }
    }, [user, open]);

    const initial = useMemo(() => {
        const nameVal = localProfile.name || "";
        const parts = nameVal.replace(/^(Dr\.|Mr\.|Ms\.)\s+/i, '').split(' ');
        return parts[0] ? parts[0][0].toUpperCase() : 'U';
    }, [localProfile.name]);

    const [saving, setSaving] = useState(false);
    // Name is saved to the server; the other fields are display preferences
    // kept in this session only (the server has no columns for them).
    const handleSave = async () => {
        setSaving(true);
        try {
            const token = useAppStore.getState().token;
            const res = await fetch(`${API_BASE}/auth/profile`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
                body: JSON.stringify({ full_name: localProfile.name }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                alert(d.error ?? 'Could not save your profile.');
                return;
            }
            updateUser(localProfile);
            onOpenChange(false);
        } catch {
            alert('Network error — please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn(
                "sm:max-w-[425px]",
                isDark ? "" : ""
            )}>
                <DialogHeader>
                    <DialogTitle className={cn("text-2xl font-bold flex items-center gap-2", isDark ? "" : "")}>
                        <User className="h-6 w-6 text-[#FF453A]" />
                        Edit Profile
                    </DialogTitle>
                    <DialogDescription className={isDark ? "text-[var(--text-2)]/80" : ""}>
                        Modify your professional profile details.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center py-6 gap-4">
                    <Avatar className="h-24 w-24 border-4 border-[#FF453A]/15 shadow-xl transition-all">
                        <AvatarFallback className="bg-[#FF453A] text-white text-3xl font-bold">{initial}</AvatarFallback>
                    </Avatar>
                    <div className="w-full space-y-2 px-4">
                        <div className="grid gap-1">
                            <Label className={cn("text-[10px] uppercase font-bold text-center", isDark ? "text-[var(--text-2)]/70" : "text-[var(--text-2)]")}>Full Name</Label>
                            <Input
                                value={localProfile.name}
                                onChange={e => setLocalProfile({ ...localProfile, name: e.target.value })}
                                className={cn("text-center font-bold text-lg border-none h-8 font-inherit", isDark ? "!bg-transparent !text-[var(--text)] hover:!bg-[var(--bg)] focus:!bg-[var(--bg)]" : "!bg-transparent !text-[var(--text)] hover:!bg-[var(--surface-2)] focus:!bg-[var(--surface-2)]")}
                            />
                        </div>
                        <Input
                            value={localProfile.title}
                            onChange={e => setLocalProfile({ ...localProfile, title: e.target.value })}
                            className={cn("text-center text-sm border-none h-7", isDark ? "!text-[var(--text-2)] !bg-transparent hover:!bg-[var(--bg)] focus:!bg-[var(--bg)]" : "!text-[var(--text-2)] !bg-transparent hover:!bg-[var(--surface-2)] focus:!bg-[var(--surface-2)]")}
                        />
                    </div>
                </div>

                <div className="space-y-4 py-2">
                    <div className="grid gap-2">
                        <Label className={cn("text-xs font-bold uppercase tracking-wider ml-1", isDark ? "text-[var(--text-2)]/70" : "text-[var(--text-2)]")}>Email Address</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-[var(--text-3)]" />
                            <Input
                                value={localProfile.email}
                                onChange={e => setLocalProfile({ ...localProfile, email: e.target.value })}
                                className={cn("pl-9", isDark ? "!bg-[var(--bg)] !border-[var(--border)] !text-[var(--text)]" : "!bg-[var(--surface)] !border-[var(--border)] !text-[var(--text)]")}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label className={cn("text-xs font-bold uppercase tracking-wider ml-1", isDark ? "text-[var(--text-2)]/70" : "text-[var(--text-2)]")}>Specialty</Label>
                            <div className="relative">
                                <Shield className="absolute left-3 top-3 h-4 w-4 text-[var(--text-3)]" />
                                <Input
                                    value={localProfile.specialty}
                                    onChange={e => setLocalProfile({ ...localProfile, specialty: e.target.value })}
                                    className={cn("pl-9", isDark ? "!bg-[var(--bg)] !border-[var(--border)] !text-[var(--text)]" : "!bg-[var(--surface)] !border-[var(--border)] !text-[var(--text)]")}
                                />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label className={cn("text-xs font-bold uppercase tracking-wider ml-1", isDark ? "text-[var(--text-2)]/70" : "text-[var(--text-2)]")}>Joined</Label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-3 h-4 w-4 text-[var(--text-3)]" />
                                <Input
                                    type="date"
                                    value={localProfile.joined}
                                    onChange={e => setLocalProfile({ ...localProfile, joined: e.target.value })}
                                    className={cn("pl-9", isDark ? "!bg-[var(--bg)] !border-[var(--border)] !text-[var(--text)]" : "!bg-[var(--surface)] !border-[var(--border)] !text-[var(--text)]")}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label className={cn("text-xs font-bold uppercase tracking-wider ml-1", isDark ? "text-[var(--text-2)]/70" : "text-[var(--text-2)]")}>Subsection</Label>
                        <div className="relative">
                            <Layers className="absolute left-3 top-3 h-4 w-4 text-[var(--text-3)]" />
                            <Input
                                placeholder="e.g. Lumbar, Cervical..."
                                value={localProfile.subsection}
                                onChange={e => setLocalProfile({ ...localProfile, subsection: e.target.value })}
                                className={cn("pl-9", isDark ? "!bg-[var(--bg)] !border-[var(--border)] !text-[var(--text)]" : "!bg-[var(--surface)] !border-[var(--border)] !text-[var(--text)]")}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-6 gap-3">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className={isDark ? "text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]" : "text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-[#FF453A] hover:bg-[#e03d33] text-white gap-2 px-8 shadow-lg shadow-[rgba(0,0,0,0.2)]">
                        <Check className="h-4 w-4" />
                        Save Changes
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
