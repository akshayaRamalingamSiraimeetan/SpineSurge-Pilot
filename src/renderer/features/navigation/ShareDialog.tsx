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
                "sm:max-w-[425px] rounded-3xl",
                isDark
                    ? ""
                    : ""
            )}>
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center", isDark ? "bg-primary/10 text-primary" : "bg-[var(--accent-soft)] text-[var(--accent)]")}>
                            <Share2 className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle className={cn("text-xl font-bold tracking-tight", isDark ? "" : "")}>
                                Share Workspace
                            </DialogTitle>
                            <DialogDescription className={cn("font-medium", isDark ? "text-[var(--text-2)]/80" : "")}>
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
                                    ? "!bg-[var(--bg)] !border-[var(--border)] !text-[var(--text)] focus-visible:!border-[#FF453A]/50"
                                    : "!bg-[var(--surface)] !border-[var(--border)] !text-[var(--text)] focus-visible:!border-[var(--border-strong)]"
                            )}
                        />
                        <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                                "absolute right-1 top-1 h-10 w-10 transition-all rounded-xl",
                                isDark ? "hover:bg-[rgba(255,69,58,0.10)] hover:text-[#FF453A]" : "hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                            )}
                            onClick={handleCopy}
                        >
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>
                    <div className={cn(
                        "p-4 rounded-2xl border text-[11px] leading-relaxed",
                        isDark ? "bg-[var(--bg)] border-[var(--border)] text-[var(--text-2)]/80" : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-2)]"
                    )}>
                        <span className={cn("font-bold mr-1", isDark ? "text-[#FF453A]" : "text-[var(--accent)]")}>Note:</span>
                        This link provides direct access to the current patient and planning session. It's intended for secure clinical collaboration.
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        className={cn(
                            "w-full font-bold h-12 rounded-2xl shadow-xl transition-all active:scale-95",
                            isDark
                                ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/20"
                                : "bg-[var(--accent)] hover:brightness-110 text-white"
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
