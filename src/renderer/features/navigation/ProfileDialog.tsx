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

    const handleSave = () => {
        updateUser(localProfile);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn(
                "sm:max-w-[425px]",
                isDark ? "!bg-[#141416] !text-[#F5F5F7] !border-[#242427]" : "!bg-gray-100 !text-slate-900 !border-gray-300"
            )}>
                <DialogHeader>
                    <DialogTitle className={cn("text-2xl font-bold flex items-center gap-2", isDark ? "text-[#F5F5F7]" : "text-slate-900")}>
                        <User className="h-6 w-6 text-[#FF453A]" />
                        Edit Profile
                    </DialogTitle>
                    <DialogDescription className={isDark ? "text-[#9CA3AF]/80" : "text-slate-600"}>
                        Modify your professional profile details.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center py-6 gap-4">
                    <Avatar className="h-24 w-24 border-4 border-[#FF453A]/15 shadow-xl transition-all">
                        <AvatarFallback className="bg-[#FF453A] text-white text-3xl font-bold">{initial}</AvatarFallback>
                    </Avatar>
                    <div className="w-full space-y-2 px-4">
                        <div className="grid gap-1">
                            <Label className={cn("text-[10px] uppercase font-bold text-center", isDark ? "text-[#9CA3AF]/70" : "text-slate-500")}>Full Name</Label>
                            <Input
                                value={localProfile.name}
                                onChange={e => setLocalProfile({ ...localProfile, name: e.target.value })}
                                className={cn("text-center font-bold text-lg border-none h-8 font-inherit", isDark ? "!bg-transparent !text-[#F5F5F7] hover:!bg-[#0A0A0B] focus:!bg-[#0A0A0B]" : "!bg-transparent !text-slate-900 hover:!bg-gray-200 focus:!bg-gray-200")}
                            />
                        </div>
                        <Input
                            value={localProfile.title}
                            onChange={e => setLocalProfile({ ...localProfile, title: e.target.value })}
                            className={cn("text-center text-sm border-none h-7", isDark ? "!text-[#9CA3AF] !bg-transparent hover:!bg-[#0A0A0B] focus:!bg-[#0A0A0B]" : "!text-slate-600 !bg-transparent hover:!bg-gray-200 focus:!bg-gray-200")}
                        />
                    </div>
                </div>

                <div className="space-y-4 py-2">
                    <div className="grid gap-2">
                        <Label className={cn("text-xs font-bold uppercase tracking-wider ml-1", isDark ? "text-[#9CA3AF]/70" : "text-slate-500")}>Email Address</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <Input
                                value={localProfile.email}
                                onChange={e => setLocalProfile({ ...localProfile, email: e.target.value })}
                                className={cn("pl-9", isDark ? "!bg-[#0A0A0B] !border-[#242427] !text-[#F5F5F7]" : "!bg-white !border-gray-300 !text-slate-900")}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label className={cn("text-xs font-bold uppercase tracking-wider ml-1", isDark ? "text-[#9CA3AF]/70" : "text-slate-500")}>Specialty</Label>
                            <div className="relative">
                                <Shield className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <Input
                                    value={localProfile.specialty}
                                    onChange={e => setLocalProfile({ ...localProfile, specialty: e.target.value })}
                                    className={cn("pl-9", isDark ? "!bg-[#0A0A0B] !border-[#242427] !text-[#F5F5F7]" : "!bg-white !border-gray-300 !text-slate-900")}
                                />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <Label className={cn("text-xs font-bold uppercase tracking-wider ml-1", isDark ? "text-[#9CA3AF]/70" : "text-slate-500")}>Joined</Label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <Input
                                    type="date"
                                    value={localProfile.joined}
                                    onChange={e => setLocalProfile({ ...localProfile, joined: e.target.value })}
                                    className={cn("pl-9", isDark ? "!bg-[#0A0A0B] !border-[#242427] !text-[#F5F5F7]" : "!bg-white !border-gray-300 !text-slate-900")}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label className={cn("text-xs font-bold uppercase tracking-wider ml-1", isDark ? "text-[#9CA3AF]/70" : "text-slate-500")}>Subsection</Label>
                        <div className="relative">
                            <Layers className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="e.g. Lumbar, Cervical..."
                                value={localProfile.subsection}
                                onChange={e => setLocalProfile({ ...localProfile, subsection: e.target.value })}
                                className={cn("pl-9", isDark ? "!bg-[#0A0A0B] !border-[#242427] !text-[#F5F5F7]" : "!bg-white !border-gray-300 !text-slate-900")}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-6 gap-3">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className={isDark ? "text-[#9CA3AF] hover:text-[#F5F5F7] hover:bg-[#1B1B1E]" : "text-slate-700 hover:text-slate-900 hover:bg-gray-200"}>Cancel</Button>
                    <Button onClick={handleSave} className="bg-[#FF453A] hover:bg-[#e03d33] text-white gap-2 px-8 shadow-lg shadow-[rgba(0,0,0,0.2)]">
                        <Check className="h-4 w-4" />
                        Save Changes
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
