import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
    Sun,
    Contrast,
    Focus,
    ZoomIn,
    RotateCw,
    RotateCcw,
    FlipHorizontal,
    Crop,
    Undo2,
    Redo2,
    Camera,
    RefreshCcw,
    ChevronUp,
    ChevronDown,
    Anchor
} from "lucide-react";
import { useAppStore } from "@/lib/store/index";
import { ScreenshotDialog } from "@/features/navigation/ScreenshotDialog";
import * as Popover from "@radix-ui/react-popover";
import { Slider } from "@/components/ui/slider";

const ControlSlider = ({
    icon: Icon,
    label,
    value,
    min,
    max,
    step = 1,
    onChange,
    onReset
}: {
    icon: any,
    label: string,
    value: number,
    min: number,
    max: number,
    step?: number,
    onChange: (val: number) => void,
    onReset: () => void
}) => {
    const handleScroll = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? step : -step;
        const newVal = Math.min(max, Math.max(min, value + delta));
        onChange(newVal);
    };

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <div onDoubleClick={onReset}>
                    <ToolbarButton
                        icon={Icon}
                        label={label}
                        active={value !== (min + max) / 2 && label !== 'Zoom'}
                    // Zoom base is 1, others are 100 or 0
                    />
                </div>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="z-[100] flex flex-col items-center gap-3 p-3 bg-card border border-border rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200"
                    side="top"
                    sideOffset={15}
                    onWheel={handleScroll}
                >
                    <div className="flex flex-col items-center h-40">
                        <Slider
                            orientation="vertical"
                            min={min}
                            max={max}
                            step={step}
                            value={[value]}
                            onValueChange={(vals: number[]) => onChange(vals[0])}
                            className="h-full"
                        />
                    </div>
                    <div className="text-[10px] font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full border border-border">
                        {value}{label === 'Zoom' ? 'x' : '%'}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

const BottomToolbar = () => {
    const store = useAppStore();
    const {
        activeTool,
        setActiveTool,
        setBrightness,
        setContrast,
        setSharpness,
        setZoom,
        setRotation,
        toggleFlipX,
        resetCanvas,
        undo,
        redo,
        isComparisonMode,
        activeCanvasSide,
        setActiveCanvasSide,
        comparison,
        isToolbarDocked,
        toggleToolbarDock
    } = store;

    const hasMainImage = !!store.currentImage;
    const hasLeftImage = !!comparison.left.image;
    const hasRightImage = !!comparison.right.image;
    const hasAnyCompareImage = hasLeftImage || hasRightImage;

    const effectiveCanvasSide = useMemo<'left' | 'right'>(() => {
        if (!isComparisonMode) return 'left';
        if (activeCanvasSide === 'left' && hasLeftImage) return 'left';
        if (activeCanvasSide === 'right' && hasRightImage) return 'right';
        if (hasLeftImage) return 'left';
        return 'right';
    }, [isComparisonMode, activeCanvasSide, hasLeftImage, hasRightImage]);

    useEffect(() => {
        if (isComparisonMode && activeCanvasSide !== effectiveCanvasSide) {
            setActiveCanvasSide(effectiveCanvasSide);
        }
    }, [isComparisonMode, activeCanvasSide, effectiveCanvasSide, setActiveCanvasSide]);

    const canvas = useMemo(() => {
        if (isComparisonMode) {
            return comparison[effectiveCanvasSide].canvas;
        }
        return store.canvas;
    }, [isComparisonMode, effectiveCanvasSide, comparison, store.canvas]);

    const hasToolbarTargetImage = isComparisonMode ? hasAnyCompareImage : hasMainImage;

    const [isScreenshotOpen, setIsScreenshotOpen] = useState(false);
    const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

    if (!canvas || !hasToolbarTargetImage) return null;

    const handleScreenshot = useCallback(() => {
        if (isComparisonMode) {
            // Stitching Logic for Comparison Mode
            const canvases = document.querySelectorAll('canvas');
            if (canvases.length >= 2) {
                const c1 = canvases[0];
                const c2 = canvases[1];
                const width = c1.width + c2.width;
                const height = Math.max(c1.height, c2.height);

                const stitch = document.createElement('canvas');
                stitch.width = width;
                stitch.height = height;
                const ctx = stitch.getContext('2d');
                if (ctx) {
                    // Draw backgrounds if needed? No, just canvas content
                    // Note: This won't capture HTML overlays (wizards, text), only the WebGL/2D context content.
                    // For full UI capture without html2canvas, this is the best we can do.
                    ctx.drawImage(c1, 0, 0);
                    ctx.drawImage(c2, c1.width, 0);

                    try {
                        const url = stitch.toDataURL('image/png');
                        setScreenshotUrl(url);
                        setIsScreenshotOpen(true);
                    } catch (err) {
                        console.error("Stitch capture failed:", err);
                    }
                }
            }
        } else {
            const canvasElement = document.querySelector('canvas');
            if (canvasElement) {
                try {
                    const url = canvasElement.toDataURL('image/png');
                    setScreenshotUrl(url);
                    setIsScreenshotOpen(true);
                } catch (err) {
                    console.error("Capture failed:", err);
                }
            }
        }
    }, [isComparisonMode]);

    const toggleTool = useCallback((toolId: string) => {
        setActiveTool(activeTool === toolId ? null : toolId);
    }, [activeTool, setActiveTool]);

    const toolbarActions = useMemo<Record<string, () => void>>(() => ({
        brightness: () => setBrightness(Math.max(0, canvas.brightness - 10)),
        contrast: () => setContrast(Math.max(0, canvas.contrast - 10)),
        sharpness: () => setSharpness(Math.max(0, canvas.sharpness - 10)),
        zoom: () => setZoom(Math.max(0.1, canvas.zoom - 0.1)),
        rotateLeft: () => setRotation(canvas.rotation - 90),
        rotateRight: () => setRotation(canvas.rotation + 90),
        rotateFineUp: () => setRotation(canvas.rotation + 1),
        rotateFineDown: () => setRotation(canvas.rotation - 1),
        flip: () => toggleFlipX(),
        crop: () => toggleTool('crop'),
        reset: () => resetCanvas(),
        undo: () => undo(),
        redo: () => redo(),
        capture: () => handleScreenshot(),
        dockToggle: () => toggleToolbarDock()
    }), [
        canvas.brightness,
        canvas.contrast,
        canvas.sharpness,
        canvas.zoom,
        canvas.rotation,
        setBrightness,
        setContrast,
        setSharpness,
        setZoom,
        setRotation,
        toggleFlipX,
        toggleTool,
        resetCanvas,
        undo,
        redo,
        handleScreenshot,
        toggleToolbarDock
    ]);

    const handleToolbarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const target = (e.target as HTMLElement).closest<HTMLElement>('[data-toolbar-action]');
        if (!target) return;
        const action = target.dataset.toolbarAction;
        if (!action) return;
        const handler = toolbarActions[action];
        if (!handler) return;
        e.preventDefault();
        handler();
    }, [toolbarActions]);

    const containerClassName = isToolbarDocked
        ? "fixed top-8 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background/80 border border-border text-foreground rounded-xl shadow-2xl p-1.5 flex items-center gap-0.5 z-[55] backdrop-blur-xl pointer-events-auto transition-all duration-300"
        : `absolute bottom-6 left-1/2 -translate-x-1/2 bg-background/80 border border-border text-foreground rounded-xl shadow-2xl p-1.5 flex items-center gap-0.5 z-50 backdrop-blur-xl pointer-events-auto transition-all duration-300 ${isComparisonMode ? 'scale-90 bottom-2 opacity-90 hover:opacity-100 hover:scale-100' : ''}`;

    return (
        <>
            <div className={containerClassName} onClick={handleToolbarClick}>

                {/* Visual Adjustments */}
                <ControlSlider
                    icon={Sun} label="Brightness" value={canvas.brightness}
                    min={0} max={200} onChange={setBrightness} onReset={() => setBrightness(100)}
                />
                <ControlSlider
                    icon={Contrast} label="Contrast" value={canvas.contrast}
                    min={0} max={200} onChange={setContrast} onReset={() => setContrast(100)}
                />
                <ControlSlider
                    icon={Focus} label="Sharpness" value={canvas.sharpness}
                    min={0} max={100} onChange={setSharpness} onReset={() => setSharpness(0)}
                />

                <div className="w-px h-5 bg-border mx-0.5" />

                {/* Navigation & Transform */}
                <ControlSlider
                    icon={ZoomIn} label="Zoom" value={canvas.zoom}
                    min={0.5} max={5} step={0.1} onChange={setZoom} onReset={() => setZoom(1)}
                />

                <div className="flex items-center gap-1 px-1">
                    <Button variant="ghost" size="icon" data-toolbar-action="rotateLeft" className="h-8 w-8 hover:bg-muted text-muted-foreground hover:text-foreground transition-all rounded-lg" title="-90°">
                        <RotateCcw className="h-4 w-4" />
                    </Button>

                    <div className="flex flex-col gap-0.5 min-w-[40px]">
                        <Button variant="ghost" size="icon" data-toolbar-action="rotateFineUp" className="h-5 w-full hover:bg-muted text-muted-foreground p-0 rounded-t-lg transition-all">
                            <ChevronUp className="h-3 w-3" />
                        </Button>
                        <div className="text-[9px] font-bold text-center text-primary leading-none py-1">
                            {((canvas.rotation % 360) + 360) % 360}°
                        </div>
                        <Button variant="ghost" size="icon" data-toolbar-action="rotateFineDown" className="h-5 w-full hover:bg-muted text-muted-foreground p-0 rounded-b-lg transition-all">
                            <ChevronDown className="h-3 w-3" />
                        </Button>
                    </div>

                    <Button variant="ghost" size="icon" data-toolbar-action="rotateRight" className="h-8 w-8 hover:bg-muted text-muted-foreground hover:text-foreground transition-all rounded-lg" title="+90°">
                        <RotateCw className="h-4 w-4" />
                    </Button>
                </div>

                <ToolbarButton icon={FlipHorizontal} label="Flip" action="flip" active={canvas.flipX} />

                <div className="w-px h-5 bg-border mx-0.5" />

                <ToolbarButton
                    icon={Crop}
                    label="Crop"
                    action="crop"
                    active={activeTool === 'crop'}
                />
                <ToolbarButton icon={RefreshCcw} label="Reset All" action="reset" />

                <div className="w-px h-5 bg-border mx-0.5" />

                <ToolbarButton icon={Undo2} label="Undo" action="undo" />
                <ToolbarButton icon={Redo2} label="Redo" action="redo" />
                <ToolbarButton icon={Camera} label="Capture" action="capture" />

                <div className="w-px h-5 bg-border mx-0.5" />

                <ToolbarButton
                    icon={Anchor}
                    label={isToolbarDocked ? "Undock" : "Dock"}
                    action="dockToggle"
                    active={isToolbarDocked}
                />
            </div>

            <ScreenshotDialog
                open={isScreenshotOpen}
                onOpenChange={setIsScreenshotOpen}
                screenshotUrl={screenshotUrl}
            />
        </>
    );
};

const ToolbarButton = ({ icon: Icon, label, action, active }: { icon: any, label: string, action?: string, active?: boolean }) => (
    <Button
        variant="ghost"
        size="sm"
        data-toolbar-action={action}
        className={`flex flex-col h-auto py-1 px-1.5 gap-0.5 hover:bg-muted text-muted-foreground hover:text-foreground group transition-all duration-300 rounded-lg ${active ? 'bg-primary/20 text-primary border border-primary/30' : 'border border-transparent'}`}
    >
        <Icon className={`h-3.5 w-3.5 ${active ? 'scale-110' : 'group-hover:scale-110 transition-transform'}`} />
        <span className="text-[8px] font-bold tracking-tight">{label}</span>
    </Button>
);

export default BottomToolbar;
