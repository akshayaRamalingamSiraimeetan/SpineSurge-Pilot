import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
    GripVertical,
} from "lucide-react";
import { useAppStore } from "@/lib/store/index";
import { ScreenshotDialog } from "@/features/navigation/ScreenshotDialog";
import * as Popover from "@radix-ui/react-popover";
import { Slider } from "@/components/ui/slider";

/* ── Slider popover — opens to the left for the vertical layout ─── */
const ControlSlider = ({
    icon: Icon,
    label,
    value,
    min,
    max,
    step = 1,
    onChange,
    onReset,
}: {
    icon: any;
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (val: number) => void;
    onReset: () => void;
}) => {
    const handleScroll = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? step : -step;
        onChange(Math.min(max, Math.max(min, value + delta)));
    };

    const isModified = label !== "Zoom"
        ? value !== 100 && value !== 0
        : value !== 1;

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <div onDoubleClick={onReset} className="w-full">
                    <VToolbarBtn icon={Icon} label={label} active={isModified} />
                </div>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="z-[100] flex flex-col items-center gap-3 p-3 bg-card border border-border rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200"
                    side="left"
                    sideOffset={12}
                    onWheel={handleScroll}
                >
                    <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                        {label}
                    </div>
                    <div className="flex flex-col items-center h-36">
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
                        {value}{label === "Zoom" ? "x" : "%"}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
};

/* ── Vertical icon-button ──────────────────────────────────────── */
const VToolbarBtn = ({
    icon: Icon,
    label,
    action,
    active,
    title,
}: {
    icon: any;
    label: string;
    action?: string;
    active?: boolean;
    title?: string;
}) => (
    <Button
        variant="ghost"
        size="icon"
        data-toolbar-action={action}
        title={title ?? label}
        className={[
            "w-9 h-9 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all duration-150",
            active
                ? "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-soft-2,rgba(255,69,58,0.3))]"
                : "text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] border border-transparent",
        ].join(" ")}
    >
        <Icon className="h-4 w-4" />
        <span className="text-[7px] font-bold tracking-tight leading-none">
            {label.length > 7 ? label.slice(0, 6) + "…" : label}
        </span>
    </Button>
);

/* ── Thin divider ──────────────────────────────────────────────── */
const Divider = () => (
    <div className="h-px w-6 bg-[var(--border)] rounded-full mx-auto" />
);

/* ── Main component ────────────────────────────────────────────── */
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
        isRightSidebarOpen,
        rightSidebarWidth,
    } = store;

    const hasMainImage = !!store.currentImage;
    const hasLeftImage = !!comparison.left.image;
    const hasRightImage = !!comparison.right.image;
    const hasAnyCompareImage = hasLeftImage || hasRightImage;

    const effectiveCanvasSide = useMemo<"left" | "right">(() => {
        if (!isComparisonMode) return "left";
        if (activeCanvasSide === "left" && hasLeftImage) return "left";
        if (activeCanvasSide === "right" && hasRightImage) return "right";
        if (hasLeftImage) return "left";
        return "right";
    }, [isComparisonMode, activeCanvasSide, hasLeftImage, hasRightImage]);

    useEffect(() => {
        if (isComparisonMode && activeCanvasSide !== effectiveCanvasSide) {
            setActiveCanvasSide(effectiveCanvasSide);
        }
    }, [isComparisonMode, activeCanvasSide, effectiveCanvasSide, setActiveCanvasSide]);

    const canvas = useMemo(() => {
        if (isComparisonMode) return comparison[effectiveCanvasSide].canvas;
        return store.canvas;
    }, [isComparisonMode, effectiveCanvasSide, comparison, store.canvas]);

    const hasToolbarTargetImage = isComparisonMode ? hasAnyCompareImage : hasMainImage;

    const [isScreenshotOpen, setIsScreenshotOpen] = useState(false);
    const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

    /* ── Drag state ───────────────────────────────────────────── */
    const panelRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    // Compute the right offset so the toolbar sits just left of the right sidebar.
    // When the user hasn't dragged yet (top === null), we track sidebar changes live.
    const sidebarOffset = isRightSidebarOpen ? rightSidebarWidth + 8 : 8;

    // Default position: just left of right sidebar, vertically centered
    const [pos, setPos] = useState<{ right: number; top: number | null; bottom: number | null }>({
        right: sidebarOffset,
        top: null,
        bottom: null,
    });

    // When the sidebar opens/closes or is resized, nudge the default position
    // but only if the user hasn't manually dragged the toolbar (top === null).
    useEffect(() => {
        setPos((prev) => {
            if (prev.top !== null) return prev; // user has dragged — don't override
            return { ...prev, right: sidebarOffset };
        });
    }, [sidebarOffset]);

    // Convert right/top/bottom to absolute left/top for drag math
    const getAbsolutePos = useCallback(() => {
        if (!panelRef.current) return { x: 0, y: 0 };
        const rect = panelRef.current.getBoundingClientRect();
        return { x: rect.left, y: rect.top };
    }, []);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        // Only drag on the grip handle area (first child with data-grip)
        if (!(e.target as HTMLElement).closest("[data-grip]")) return;
        e.preventDefault();
        dragging.current = true;
        const abs = getAbsolutePos();
        dragOffset.current = { x: e.clientX - abs.x, y: e.clientY - abs.y };

        const onMove = (ev: MouseEvent) => {
            if (!dragging.current || !panelRef.current) return;
            const pw = window.innerWidth;
            const ph = window.innerHeight;
            const w = panelRef.current.offsetWidth;
            const h = panelRef.current.offsetHeight;
            const newLeft = Math.max(0, Math.min(pw - w, ev.clientX - dragOffset.current.x));
            const newTop = Math.max(0, Math.min(ph - h, ev.clientY - dragOffset.current.y));
            const newRight = pw - newLeft - w;
            setPos({ right: newRight, top: newTop, bottom: null });
        };

        const onUp = () => {
            dragging.current = false;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }, [getAbsolutePos]);

    if (!canvas || !hasToolbarTargetImage) return null;

    /* ── Handlers ─────────────────────────────────────────────── */
    const handleScreenshot = useCallback(() => {
        if (isComparisonMode) {
            const canvases = document.querySelectorAll("canvas");
            if (canvases.length >= 2) {
                const c1 = canvases[0];
                const c2 = canvases[1];
                const stitch = document.createElement("canvas");
                stitch.width = c1.width + c2.width;
                stitch.height = Math.max(c1.height, c2.height);
                const ctx = stitch.getContext("2d");
                if (ctx) {
                    ctx.drawImage(c1, 0, 0);
                    ctx.drawImage(c2, c1.width, 0);
                    try {
                        setScreenshotUrl(stitch.toDataURL("image/png"));
                        setIsScreenshotOpen(true);
                    } catch (err) {
                        console.error("Stitch capture failed:", err);
                    }
                }
            }
        } else {
            const canvasEl = document.querySelector("canvas");
            if (canvasEl) {
                try {
                    setScreenshotUrl(canvasEl.toDataURL("image/png"));
                    setIsScreenshotOpen(true);
                } catch (err) {
                    console.error("Capture failed:", err);
                }
            }
        }
    }, [isComparisonMode]);

    const toggleTool = useCallback(
        (toolId: string) => setActiveTool(activeTool === toolId ? null : toolId),
        [activeTool, setActiveTool],
    );

    const toolbarActions = useMemo<Record<string, () => void>>(
        () => ({
            rotateLeft: () => setRotation(canvas.rotation - 90),
            rotateRight: () => setRotation(canvas.rotation + 90),
            rotateFineUp: () => setRotation(canvas.rotation + 1),
            rotateFineDown: () => setRotation(canvas.rotation - 1),
            flip: () => toggleFlipX(),
            crop: () => toggleTool("crop"),
            reset: () => resetCanvas(),
            undo: () => undo(),
            redo: () => redo(),
            capture: () => handleScreenshot(),
        }),
        [
            canvas.rotation,
            setRotation,
            toggleFlipX,
            toggleTool,
            resetCanvas,
            undo,
            redo,
            handleScreenshot,
        ],
    );

    const handleClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            const target = (e.target as HTMLElement).closest<HTMLElement>("[data-toolbar-action]");
            if (!target) return;
            const action = target.dataset.toolbarAction;
            if (!action) return;
            const handler = toolbarActions[action];
            if (!handler) return;
            e.preventDefault();
            handler();
        },
        [toolbarActions],
    );

    /* ── Computed position styles ────────────────────────────── */
    const posStyle: React.CSSProperties = {
        position: "fixed",
        right: pos.right,
        ...(pos.top !== null ? { top: pos.top } : { top: "50%", transform: "translateY(-50%)" }),
        ...(pos.bottom !== null ? { bottom: pos.bottom } : {}),
        zIndex: 55,
    };

    const rotationDisplay = ((canvas.rotation % 360) + 360) % 360;

    return (
        <>
            <div
                ref={panelRef}
                style={posStyle}
                onMouseDown={onMouseDown}
                onClick={handleClick}
                className="flex flex-col items-center gap-1 p-1.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-xl shadow-2xl select-none pointer-events-auto"
            >
                {/* ── Grip handle ─────────────────────────────── */}
                <div
                    data-grip="true"
                    title="Drag to move"
                    className="w-full flex items-center justify-center py-0.5 cursor-grab active:cursor-grabbing text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
                >
                    <GripVertical className="h-3.5 w-3.5" />
                </div>

                <Divider />

                {/* ── Visual sliders ───────────────────────────── */}
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

                <Divider />

                {/* ── Zoom ─────────────────────────────────────── */}
                <ControlSlider
                    icon={ZoomIn} label="Zoom" value={canvas.zoom}
                    min={0.5} max={5} step={0.1} onChange={setZoom} onReset={() => setZoom(1)}
                />

                <Divider />

                {/* ── Rotation ─────────────────────────────────── */}
                <Button
                    variant="ghost" size="icon"
                    data-toolbar-action="rotateLeft"
                    title="Rotate −90°"
                    className="w-9 h-9 rounded-xl text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-all"
                >
                    <RotateCcw className="h-4 w-4" />
                </Button>

                {/* Fine rotation control */}
                <div className="flex flex-col items-center gap-0.5 w-9">
                    <Button
                        variant="ghost" size="icon"
                        data-toolbar-action="rotateFineUp"
                        className="w-9 h-5 rounded-t-lg text-[var(--text-3)] hover:bg-[var(--surface-3)] p-0 transition-all"
                    >
                        <ChevronUp className="h-3 w-3" />
                    </Button>
                    <div className="text-[9px] font-bold text-center text-[var(--accent)] leading-none py-0.5 w-full">
                        {rotationDisplay}°
                    </div>
                    <Button
                        variant="ghost" size="icon"
                        data-toolbar-action="rotateFineDown"
                        className="w-9 h-5 rounded-b-lg text-[var(--text-3)] hover:bg-[var(--surface-3)] p-0 transition-all"
                    >
                        <ChevronDown className="h-3 w-3" />
                    </Button>
                </div>

                <Button
                    variant="ghost" size="icon"
                    data-toolbar-action="rotateRight"
                    title="Rotate +90°"
                    className="w-9 h-9 rounded-xl text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] transition-all"
                >
                    <RotateCw className="h-4 w-4" />
                </Button>

                <Divider />

                {/* ── Flip ─────────────────────────────────────── */}
                <VToolbarBtn
                    icon={FlipHorizontal} label="Flip"
                    action="flip" active={canvas.flipX}
                />

                {/* ── Crop ─────────────────────────────────────── */}
                <VToolbarBtn
                    icon={Crop} label="Crop"
                    action="crop" active={activeTool === "crop"}
                />

                <Divider />

                {/* ── Reset / Undo / Redo ───────────────────────── */}
                <VToolbarBtn icon={RefreshCcw} label="Reset" action="reset" />
                <VToolbarBtn icon={Undo2} label="Undo" action="undo" />
                <VToolbarBtn icon={Redo2} label="Redo" action="redo" />

                <Divider />

                {/* ── Capture ──────────────────────────────────── */}
                <VToolbarBtn icon={Camera} label="Capture" action="capture" />
            </div>

            <ScreenshotDialog
                open={isScreenshotOpen}
                onOpenChange={setIsScreenshotOpen}
                screenshotUrl={screenshotUrl}
            />
        </>
    );
};

export default BottomToolbar;
