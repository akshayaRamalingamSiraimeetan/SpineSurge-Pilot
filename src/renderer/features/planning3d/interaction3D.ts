import { utilities as csUtils, type Types } from '@cornerstonejs/core';
import type { PlanImplant } from '@/lib/store/types';
import { cageCorners, translateImplant } from './implantModel';
import { add, dist, norm, raySegmentDistance, rayPlane, scale, sub, type Vec3 } from './vec3';

/**
 * Pointer interaction in the 3D viewport, without vtkCellPicker (which can't
 * read Cornerstone v4 volumes — BUGS 3D-05):
 *  - click an implant → select it; drag → move it parallel to the screen
 *  - in place mode, click → ray-march the CT until HU ≥ threshold → place
 * Everything else falls through to Cornerstone (rotate / pan / zoom).
 */
export interface Interaction3DOptions {
    getViewport: () => Types.IVolumeViewport | null;
    getVolume: () => Types.IImageVolume | null;
    getImplants: () => PlanImplant[];
    getMode: () => string;
    getThreshold: () => number;
    onSelect: (id: string | null) => void;
    onChange: (implant: PlanImplant, final: boolean) => void;
    /** Bone surface hit along the view ray (entry) + ray direction. */
    onPlaceOnBone: (entry: Vec3, dir: Vec3) => void;
    /** Active crop box in world mm [xmin,xmax,ymin,ymax,zmin,zmax]; cropped-away bone is not "hit". */
    getClipBox?: () => number[] | null;
}

function ray(vp: Types.IVolumeViewport, el: HTMLElement, e: MouseEvent): { origin: Vec3; dir: Vec3 } {
    const r = el.getBoundingClientRect();
    const onPlane = vp.canvasToWorld([e.clientX - r.left, e.clientY - r.top]) as Vec3;
    const cam = vp.getCamera();
    if (cam.parallelProjection !== false) {
        // viewPlaneNormal points toward the camera; the view ray goes the other way.
        const dir = scale(norm(cam.viewPlaneNormal as Vec3), -1);
        return { origin: sub(onPlane, scale(dir, 2000)), dir };
    }
    const pos = cam.position as Vec3;
    return { origin: pos, dir: norm(sub(onPlane, pos)) };
}

/** Distance from the ray to an implant (mm) and the hit point. */
function hitImplant(origin: Vec3, dir: Vec3, imp: PlanImplant): { d: number; t: number } {
    const segs: [Vec3, Vec3, number][] = [];
    if (imp.type === 'screw') segs.push([imp.entry, imp.tip, imp.diameter / 2]);
    if (imp.type === 'rod') imp.points.slice(1).forEach((pt, i) => segs.push([imp.points[i], pt, imp.diameter / 2]));
    if (imp.type === 'cage') {
        const r = Math.max(...imp.size) / 2;
        segs.push([imp.center, imp.center, r]);
        void cageCorners; // corners available for finer tests if needed
    }
    let best = { d: Infinity, t: Infinity };
    for (const [a, b, radius] of segs) {
        const h = raySegmentDistance(origin, dir, a, b);
        const d = Math.max(0, h.distance - radius);
        if (d < best.d || (d === best.d && h.t < best.t)) best = { d, t: h.t };
    }
    return best;
}

export function marchToBone(volume: Types.IImageVolume, origin: Vec3, dir: Vec3, threshold: number, clip?: number[] | null): Vec3 | null {
    const vm: any = volume.voxelManager;
    const imageData: any = volume.imageData;
    if (!vm || !imageData) return null;
    const [nx, ny, nz] = volume.dimensions;
    const step = Math.max(0.4, Math.min(...volume.spacing) * 0.75);
    for (let t = 0; t < 4000; t += step) {
        const p = add(origin, scale(dir, t));
        // Skip bone that the crop box hides (UI11-20)
        if (clip && (p[0] < clip[0] || p[0] > clip[1] || p[1] < clip[2] || p[1] > clip[3] || p[2] < clip[4] || p[2] > clip[5])) continue;
        const ijk = csUtils.transformWorldToIndex(imageData, p as Types.Point3);
        const [i, j, k] = ijk;
        if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
        const v = vm.getAtIJK(i, j, k);
        if (typeof v === 'number' && v >= threshold) return p;
    }
    return null;
}

export function attach3DInteraction(element: HTMLElement, o: Interaction3DOptions): () => void {
    let drag: { imp: PlanImplant; last: PlanImplant; plane: { p: Vec3; n: Vec3 }; start: Vec3 } | null = null;
    let swallowMouse = false;

    const onDown = (e: PointerEvent) => {
        swallowMouse = false;
        if (e.button !== 0) return;
        // Only clicks on the viewport itself — not the cell's buttons or crop handles (UI11-21)
        if (!element.contains(e.target as Node)) return;
        const vp = o.getViewport();
        if (!vp) return;
        const { origin, dir } = ray(vp, element, e);
        const mode = o.getMode();

        if (mode === 'place_screw') {
            const vol = o.getVolume();
            const hit = vol ? marchToBone(vol, origin, dir, o.getThreshold(), o.getClipBox?.()) : null;
            if (hit) o.onPlaceOnBone(hit, dir);
            swallowMouse = true;
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        if (mode !== 'view') return;

        let best: { imp: PlanImplant; d: number; t: number } | null = null;
        for (const imp of o.getImplants()) {
            const h = hitImplant(origin, dir, imp);
            if (h.d <= 1.5 && (!best || h.t < best.t)) best = { imp, ...h };
        }
        if (!best) return; // let Cornerstone rotate/pan/zoom

        swallowMouse = true;
        e.stopPropagation();
        e.preventDefault();
        o.onSelect(best.imp.id);
        const hitPoint = add(origin, scale(dir, best.t));
        drag = { imp: best.imp, last: best.imp, plane: { p: hitPoint, n: scale(dir, -1) }, start: hitPoint };
        element.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
        if (!drag) return;
        const vp = o.getViewport();
        if (!vp) return;
        const { origin, dir } = ray(vp, element, e);
        const p = rayPlane(origin, dir, drag.plane.p, drag.plane.n);
        if (!p || dist(p, drag.start) > 1000) return;
        drag.last = translateImplant(drag.imp, sub(p, drag.start));
        o.onChange(drag.last, false);
        e.stopPropagation();
    };

    const onUp = (e: PointerEvent) => {
        // preventDefault on pointerdown suppresses the compatibility mouseup that
        // used to reset this — leaving the next rotate/pan swallowed (UI11-21)
        swallowMouse = false;
        if (!drag) return;
        element.releasePointerCapture?.(e.pointerId);
        o.onChange(drag.last, true);
        drag = null;
        e.stopPropagation();
    };

    // Cornerstone tools listen to mouse events; block the mousedown that
    // follows a pointerdown we handled so the trackball doesn't also rotate.
    const blockMouse = (e: MouseEvent) => {
        if (swallowMouse || drag) {
            e.stopPropagation();
            e.preventDefault();
            if (e.type === 'mouseup') swallowMouse = false;
        }
    };

    // Listen on the PARENT in the capture phase so we run before Cornerstone's
    // own listeners on the viewport element and can stop them.
    const host = element.parentElement ?? element;
    host.addEventListener('pointerdown', onDown, true);
    host.addEventListener('pointermove', onMove, true);
    host.addEventListener('pointerup', onUp, true);
    host.addEventListener('pointercancel', onUp, true);
    for (const t of ['mousedown', 'mousemove', 'mouseup'] as const) host.addEventListener(t, blockMouse, true);
    return () => {
        host.removeEventListener('pointerdown', onDown, true);
        host.removeEventListener('pointermove', onMove, true);
        host.removeEventListener('pointerup', onUp, true);
        host.removeEventListener('pointercancel', onUp, true);
        for (const t of ['mousedown', 'mousemove', 'mouseup'] as const) host.removeEventListener(t, blockMouse, true);
    };
}
