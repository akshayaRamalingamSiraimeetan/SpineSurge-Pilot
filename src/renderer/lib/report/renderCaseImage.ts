import { CanvasManager, type CanvasData, type Measurement } from '@/lib/canvas/CanvasManager';
import { renderScene } from '@/lib/canvas/renderScene';

/**
 * Deterministic report image: the case's X-ray + its selected measurements +
 * implants, rendered OFFSCREEN at native resolution after every image has been
 * decoded. Independent of what (if anything) is mounted on screen, the window
 * size, zoom/pan or UI overlays (BUGS RPT-01, RPT-05, RPT-16).
 */
export interface CaseImageInput {
    image: string;
    measurements: Measurement[];
    implants: any[];
    canvas: {
        brightness: number; contrast: number; sharpness: number; flipX: boolean;
        pixelToMm: number | null; calibrationApplied: boolean; calibrationEnabledAt: number | null;
    };
    /** Live manager for this image (keeps osteotomy fragments); optional. */
    manager?: CanvasManager | null;
}

export interface RenderedImage {
    dataUrl: string;
    width: number;
    height: number;
}

const MAX_SIDE = 2000;
/** Treat the image as if viewed ~900px wide so strokes/labels stay legible. */
const VIRTUAL_VIEW_PX = 900;

const loadImage = async (src: string): Promise<HTMLImageElement> => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    try {
        await img.decode();
    } catch {
        throw new Error(`Report image could not be loaded: ${src.slice(0, 120)}`);
    }
    return img;
};

export const isReportMeasurement = (m: Measurement) =>
    m.selected !== false &&
    m.toolKey !== 'c7pl' &&
    m.toolKey !== 'csvl' &&
    !m.measurement?.isCalibration;

export async function renderCaseImage(input: CaseImageInput): Promise<RenderedImage> {
    let data: CanvasData;
    const mgr = input.manager as any;
    if (mgr?.current && mgr._baseImage === input.image) {
        data = mgr.current.data;
    } else {
        const fresh = new CanvasManager();
        const state = await fresh.initialize(input.image, input.measurements);
        state.data.implants = input.implants.map((i) => ({ ...i }));
        data = state.data;
    }

    // Decode every fragment image before drawing anything.
    const srcs = Array.from(new Set(data.fragments.map((f) => (typeof f.image === 'string' ? f.image : f.image.src))));
    const images = new Map<string, HTMLImageElement>();
    await Promise.all(srcs.map(async (s) => images.set(s, await loadImage(s))));

    const base = data.fragments[0];
    const W = base?.imageWidth || 800;
    const H = base?.imageHeight || 600;
    const s = Math.min(1, MAX_SIDE / Math.max(W, H));
    const out = document.createElement('canvas');
    out.width = Math.round(W * s);
    out.height = Math.round(H * s);
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, out.width, out.height);

    ctx.save();
    if (input.canvas.flipX) {
        ctx.translate(out.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.scale(s, s);

    const selectedIds = new Set(input.measurements.filter(isReportMeasurement).map((m) => m.id));
    renderScene(ctx, data, {
        ek: VIRTUAL_VIEW_PX / Math.max(W, H),
        getImage: (src) => (typeof src === 'string' ? images.get(src)! : src),
        brightness: input.canvas.brightness,
        contrast: input.canvas.contrast,
        sharpness: input.canvas.sharpness,
        displayRatio: input.canvas.calibrationApplied ? input.canvas.pixelToMm : null,
        calibrationEnabledAt: input.canvas.calibrationEnabledAt,
        measurementFilter: (m) => selectedIds.has(m.id),
    });
    ctx.restore();

    return { dataUrl: out.toDataURL('image/jpeg', 0.92), width: out.width, height: out.height };
}
