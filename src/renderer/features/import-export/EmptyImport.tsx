import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportDialog } from "./ImportDialog";

/**
 * No image yet: the one import entry point for Assessment, Planning and a new
 * empty study (UI10-03). `autoOpen` opens the import dialog straight away —
 * used by "Add New Study" so it behaves like the Home page's import.
 */
export const EmptyImport = ({
    title = "No image loaded",
    hint = "Import an X-ray or a CT/MR series to start. It is shared by Assessment, Planning and Compare (Image A).",
    autoOpen = false,
}: { title?: string; hint?: string; autoOpen?: boolean }) => (
    <div className="text-center space-y-4 p-10 rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
        <div className="h-20 w-20 bg-[var(--surface-2)] rounded-full flex items-center justify-center mx-auto">
            <Upload className="h-9 w-9 text-[var(--text-3)]" />
        </div>
        <div>
            <h2 className="text-xl font-semibold mb-2 text-[var(--text)]">{title}</h2>
            <p className="text-[var(--text-3)] max-w-sm mx-auto text-sm">{hint}</p>
        </div>
        <ImportDialog autoOpen={autoOpen}>
            <Button size="lg" className="gap-2 bg-[var(--accent)] text-white hover:opacity-90">
                <Upload className="h-4 w-4" />
                Import scan
            </Button>
        </ImportDialog>
    </div>
);
