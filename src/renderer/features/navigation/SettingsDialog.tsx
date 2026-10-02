import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings, Bell, Monitor, Lock, Languages } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function SettingsDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn(
                "sm:max-w-[425px]",
                isDark ? "" : ""
            )}>
                <DialogHeader>
                    <DialogTitle className={cn("text-2xl font-bold flex items-center gap-2", isDark ? "" : "")}>
                        <Settings className="h-6 w-6 text-[#FF453A]" />
                        Application Settings
                    </DialogTitle>
                    <DialogDescription className={isDark ? "text-[var(--text-2)]/80" : ""}>
                        Configure your workspace preferences and notifications.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#FF453A]">Workspace</h4>

                        <div className={cn("flex items-center justify-between p-3 rounded-lg border", isDark ? "border-[var(--border)] bg-[var(--bg)]/60" : "border-[var(--border)] bg-[var(--surface-2)]")}>
                            <div className="flex items-center gap-3">
                                <Monitor className="h-4 w-4 text-[var(--text-3)]" />
                                <div className="space-y-0.5">
                                    <div className="text-sm font-medium">Measurement Auto-save</div>
                                    <div className={cn("text-[10px]", isDark ? "text-[var(--text-2)]/70" : "text-[var(--text-2)]")}>Automatically save changes to the cloud</div>
                                </div>
                            </div>
                            <div className="w-8 h-4 bg-[#FF453A] rounded-full cursor-pointer relative"><div className="absolute right-1 top-1 w-2 h-2 bg-[var(--surface)] rounded-full"></div></div>
                        </div>

                        <div className={cn("flex items-center justify-between p-3 rounded-lg border", isDark ? "border-[var(--border)] bg-[var(--bg)]/60" : "border-[var(--border)] bg-[var(--surface-2)]")}>
                            <div className="flex items-center gap-3">
                                <Bell className="h-4 w-4 text-[var(--text-3)]" />
                                <div className="space-y-0.5">
                                    <div className="text-sm font-medium">Analysis Notifications</div>
                                    <div className={cn("text-[10px]", isDark ? "text-[var(--text-2)]/70" : "text-[var(--text-2)]")}>Alert when AI analysis is complete</div>
                                </div>
                            </div>
                            <div className={cn("w-8 h-4 rounded-full cursor-pointer relative", isDark ? "bg-slate-700" : "bg-slate-300")}><div className="absolute left-1 top-1 w-2 h-2 bg-[var(--surface)] rounded-full"></div></div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#FF453A]">Security & Language</h4>

                        <div className="grid grid-cols-2 gap-3">
                            <Button variant="outline" className={cn("justify-start gap-2 h-10", isDark ? "border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--surface-2)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]")}>
                                <Languages className="h-4 w-4 text-[var(--text-3)]" />
                                <span className="text-xs">English (US)</span>
                            </Button>
                            <Button variant="outline" className={cn("justify-start gap-2 h-10", isDark ? "border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--surface-2)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]")}>
                                <Lock className="h-4 w-4 text-[var(--text-3)]" />
                                <span className="text-xs">Change PIN</span>
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-2 gap-3">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className={cn("text-xs", isDark ? "text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]" : "text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]")}>Reset to Defaults</Button>
                    <Button onClick={() => onOpenChange(false)} className="bg-[#FF453A] hover:bg-[#e03d33] text-white px-8">Save Changes</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
