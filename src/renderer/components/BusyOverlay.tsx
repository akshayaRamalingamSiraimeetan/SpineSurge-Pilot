import { Loader2 } from "lucide-react";
import { useBusy } from "@/lib/busy";

/** Shown at once while a study opens/creates (LAG-01); also blocks double clicks. */
export const BusyOverlay = () => {
    const label = useBusy((s) => s.label);
    if (!label) return null;
    return (
        <div className="fixed inset-0 z-[300] cursor-progress" aria-live="polite" aria-busy="true">
            <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden bg-[var(--accent)]/20">
                <div className="h-full w-1/3 bg-[var(--accent)] animate-[busybar_1.1s_ease-in-out_infinite]" />
            </div>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[13px] font-medium text-[var(--text)] shadow-[var(--shadow-lg)]">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                {label}
            </div>
            <style>{`@keyframes busybar { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }`}</style>
        </div>
    );
};
