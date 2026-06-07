import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Copy, Check, Share2 } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "@/lib/store/index";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export const ShareDialog = () => {
    const { shareDialogOpen, setShareDialogOpen, generatedLink } = useAppStore();
    const [copied, setCopied] = useState(false);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
            <DialogContent className={cn(
                "sm:max-w-[425px] rounded-3xl shadow-2xl font-['Outfit']",
                isDark
                    ? "!border-[#1E3A5F] !bg-[#0F2A44] !text-[#E3F2FD]"
                    : "!border-gray-300 !bg-gray-100 !text-slate-900"
            )}>
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center", isDark ? "bg-primary/10 text-primary" : "bg-blue-100 text-blue-600")}>
                            <Share2 className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle className={cn("text-xl font-bold tracking-tight", isDark ? "text-[#E3F2FD]" : "text-slate-900")}>
                                Share Workspace
                            </DialogTitle>
                            <DialogDescription className={cn("font-medium", isDark ? "text-[#90CAF9]/80" : "text-slate-600")}>
                                Anyone with this link can view this clinical case.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                    <div className="relative group">
                        <Input
                            readOnly
                            value={generatedLink}
                            className={cn(
                                "pr-12 h-12 rounded-2xl font-medium transition-all text-sm",
                                isDark
                                    ? "!bg-[#0A1929] !border-[#1E3A5F] !text-[#E3F2FD] focus-visible:!border-[#29B6F6]/70"
                                    : "!bg-white !border-gray-300 !text-slate-900 focus-visible:!border-[#29B6F6]/70"
                            )}
                        />
                        <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                                "absolute right-1 top-1 h-10 w-10 transition-all rounded-xl",
                                isDark ? "hover:bg-primary/10 hover:text-primary" : "hover:bg-gray-200 hover:text-slate-900"
                            )}
                            onClick={handleCopy}
                        >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>
                    <div className={cn(
                        "p-4 rounded-2xl border text-[11px] leading-relaxed",
                        isDark ? "bg-[#0A1929] border-[#1E3A5F] text-[#90CAF9]/80" : "bg-gray-200 border-gray-300 text-slate-600"
                    )}>
                        <span className={cn("font-bold mr-1", isDark ? "text-primary" : "text-blue-600")}>Note:</span>
                        This link provides direct access to the current patient and planning session. It's intended for secure clinical collaboration.
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        className={cn(
                            "w-full font-bold h-12 rounded-2xl shadow-xl transition-all active:scale-95",
                            isDark
                                ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20"
                                : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20"
                        )}
                        onClick={handleCopy}
                    >
                        {copied ? "Copied to Clipboard!" : "Copy Share Link"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
