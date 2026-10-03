/**
 * Screenshots of the 3D planning viewer for the report (UI10-07): the 4-up
 * layout (axial · sagittal · coronal · 3D, with the implant overlays) and the
 * 3D view on its own. The mounted viewer registers how to capture itself.
 */
export interface ViewerCapture { fourUp: string; threeD: string | null; width: number; height: number }
type CaptureFn = () => Promise<ViewerCapture | null>;

let captureFn: CaptureFn | null = null;
export const registerViewerCapture = (fn: CaptureFn | null) => { captureFn = fn; };
export const captureViewer = () => (captureFn ? captureFn() : Promise.resolve(null));

const STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'opacity', 'font-size', 'font-family', 'font-weight'];

/** SVG overlay → image, with computed CSS inlined (classes don't survive serialisation). */
async function svgToImage(svg: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement | null> {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const src = svg.querySelectorAll('*');
    const dst = clone.querySelectorAll('*');
    src.forEach((el, i) => {
        const cs = getComputedStyle(el);
        STYLE_PROPS.forEach((p) => (dst[i] as SVGElement).style.setProperty(p, cs.getPropertyValue(p)));
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
    } catch {
        return null;
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Draw one viewer cell (canvas + overlay SVGs that are direct children) into ctx at (x, y, w, h). */
export async function drawCell(ctx: CanvasRenderingContext2D, cell: HTMLElement, x: number, y: number, w: number, h: number, label: string) {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
    const canvas = cell.querySelector('canvas');
    const cw = cell.clientWidth, ch = cell.clientHeight;
    if (canvas && canvas.width > 0 && cw > 0 && ch > 0) {
        const s = Math.min(w / cw, h / ch);
        const dw = cw * s, dh = ch * s, ox = x + (w - dw) / 2, oy = y + (h - dh) / 2;
        try { ctx.drawImage(canvas, ox, oy, dw, dh); } catch { /* tainted / lost context */ }
        for (const svg of Array.from(cell.children).filter((c): c is SVGSVGElement => c instanceof SVGSVGElement && !c.dataset.noCapture)) {
            const img = await svgToImage(svg, cw, ch);
            if (img) ctx.drawImage(img, ox, oy, dw, dh);
        }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `600 ${Math.round(h * 0.035) + 8}px sans-serif`;
    ctx.fillText(label.toUpperCase(), x + 10, y + Math.round(h * 0.035) + 16);
}
