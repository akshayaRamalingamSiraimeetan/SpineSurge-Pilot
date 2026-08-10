import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Download, Copy, Share2 } from "lucide-react";

export function ScreenshotDialog({ open, onOpenChange, screenshotUrl }: { open: boolean, onOpenChange: (open: boolean) => void, screenshotUrl: string | null }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-[500px] !bg-card !text-card-foreground border-border !opacity-100"
                style={{ backgroundColor: "hsl(var(--card))", opacity: 1 }}
            >
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <Camera className="h-5 w-5 text-[var(--accent)]" />
                        Capture Stored
                    </DialogTitle>
                    <DialogDescription>
                        Canvas screenshot captured with all active measurements.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                    {screenshotUrl ? (
                        <div
                            className="rounded-lg border-2 border-border overflow-hidden bg-popover aspect-video flex items-center justify-center"
                            style={{ backgroundColor: "hsl(var(--popover))", opacity: 1 }}
                        >
                            <img src={screenshotUrl} alt="Canvas Screenshot" className="max-w-full max-h-full object-contain" />
                        </div>
                    ) : (
                        <div className="h-40 bg-muted flex items-center justify-center rounded-lg border border-dashed border-border">
                            Capturing...
                        </div>
                    )}
                </div>

                <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
                    <Button variant="outline" className="flex-1 gap-2 font-bold" onClick={async () => {
                        if (!screenshotUrl) return;
                        try {
                            const response = await fetch(screenshotUrl);
                            const blob = await response.blob();
                            await navigator.clipboard.write([
                                new ClipboardItem({ [blob.type]: blob })
                            ]);
                            alert("Copied directly to clipboard! You can now paste it in any document.");
                        } catch (err) {
                            console.error(err);
                            alert("Copy failed. Try saving the image instead.");
                        }
                    }}>
                        <Copy className="h-4 w-4" />
                        Copy
                    </Button>
                    <Button variant="outline" className="flex-1 gap-2 font-bold" onClick={() => {
                        alert("Sharing options coming soon...");
                    }}>
                        <Share2 className="h-4 w-4" />
                        Share
                    </Button>
                    <Button className="flex-1 gap-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold" onClick={() => {
                        // Download logic
                        const link = document.createElement('a');
                        link.href = screenshotUrl || '';
                        link.download = `SpineSurge_Capture_${new Date().getTime()}.png`;
                        link.click();
                        onOpenChange(false);
                    }}>
                        <Download className="h-4 w-4" />
                        Save Image
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
