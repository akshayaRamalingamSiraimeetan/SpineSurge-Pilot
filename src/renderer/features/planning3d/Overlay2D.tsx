import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Enums, type Types } from '@cornerstonejs/core';
import type { PlanCage, PlanImplant, PlanRod, PlanScrew } from '@/lib/store/types';
import { add, clipSegmentToSlab, cross, dot, lerp, norm, scale, sub, type Vec3 } from './vec3';
import { screwLength, translateImplant } from './implantModel';

/**
 * SVG overlay for one MPR viewport. Implants are projected into the current
 * slice: the part inside the slab is drawn as a solid white silhouette, the
 * rest as a faint outline (BUGS 3D-16). Handles drag IN-PLANE using
 * viewport.canvasToWorld, so axial drags change medial angle, sagittal drags
 * change caudal angle, etc. Redraws on camera events — no polling (3D-13).
 */

export type PlaceMode = 'view' | 'place_screw' | 'place_rod' | 'place_cage';

interface Props {
    viewport: Types.IVolumeViewport;
    implants: PlanImplant[];
    selectedId: string | null;
    mode: PlaceMode;
    onSelect: (id: string | null) => void;
    /** final=false while dragging (no save), true on release. */
    onChange: (implant: PlanImplant, final: boolean) => void;
    onPlacePoint: (world: Vec3, camera: Types.ICamera) => void;
    onPlaceRod: (points: Vec3[]) => void;
    onCancelPlacement: () => void;
}

type Drag = {
    id: string;
    handle: 'body' | 'head' | 'tip' | 'rotate' | number;
    startWorld: Vec3;
    start: PlanImplant;
    last: PlanImplant;
};

const SLAB_MM = 1.5;

const rotateAbout = (v: Vec3, axis: Vec3, angle: number): Vec3 => {
    const k = norm(axis);
    const c = Math.cos(angle), s = Math.sin(angle);
    return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
};

export function Overlay2D(p: Props) {
    const { viewport } = p;
    const svgRef = useRef<SVGSVGElement>(null);
    const [, redraw] = useReducer((x: number) => x + 1, 0);
    const [drag, setDrag] = useState<Drag | null>(null);
    const [rodDraft, setRodDraft] = useState<Vec3[]>([]);
    const [hover, setHover] = useState<Vec3 | null>(null);

    // Redraw on camera / slice / resize changes.
    useEffect(() => {
        const el = viewport.element;
        const onCam = () => redraw();
        el.addEventListener(Enums.Events.CAMERA_MODIFIED, onCam);
        el.addEventListener(Enums.Events.VOLUME_NEW_IMAGE, onCam);
        const ro = new ResizeObserver(onCam);
        ro.observe(el);
        return () => {
            el.removeEventListener(Enums.Events.CAMERA_MODIFIED, onCam);
            el.removeEventListener(Enums.Events.VOLUME_NEW_IMAGE, onCam);
            ro.disconnect();
        };
    }, [viewport]);

    useEffect(() => { if (p.mode !== 'place_rod') setRodDraft([]); }, [p.mode]);

    const cam = viewport.getCamera();
    const n = norm(cam.viewPlaneNormal as Vec3);
    const f = cam.focalPoint as Vec3;
    const P = (w: Vec3) => viewport.worldToCanvas(w as Types.Point3) as [number, number];
    const pxPerMm = useMemo(() => {
        const a = P(f), b = P(add(f, scale(norm(cam.viewUp as Vec3), 10)));
        return Math.hypot(b[0] - a[0], b[1] - a[1]) / 10 || 1;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cam.parallelScale, cam.focalPoint?.[0], cam.focalPoint?.[1], cam.focalPoint?.[2], viewport.element.clientWidth, viewport.element.clientHeight]);

    const localPoint = (e: React.PointerEvent | PointerEvent): [number, number] => {
        const r = viewport.element.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    };
    const toWorld = (e: React.PointerEvent | PointerEvent) => viewport.canvasToWorld(localPoint(e) as Types.Point2) as Vec3;

    // ── Drag handling ─────────────────────────────────────────────────────
    const beginDrag = (e: React.PointerEvent, imp: PlanImplant, handle: Drag['handle']) => {
        if (p.mode !== 'view' || e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();
        svgRef.current?.setPointerCapture(e.pointerId);
        p.onSelect(imp.id);
        setDrag({ id: imp.id, handle, startWorld: toWorld(e), start: imp, last: imp });
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (p.mode === 'place_rod') setHover(toWorld(e));
        if (!drag) return;
        const w = toWorld(e);
        const delta = sub(w, drag.startWorld);
        const s = drag.start;
        let next: PlanImplant = s;
        if (drag.handle === 'body') next = translateImplant(s, delta);
        else if (s.type === 'screw' && drag.handle === 'head') next = { ...s, entry: add(s.entry, delta) };
        else if (s.type === 'screw' && drag.handle === 'tip') next = { ...s, tip: add(s.tip, delta) };
        else if (s.type === 'rod' && typeof drag.handle === 'number') {
            const i = drag.handle;
            next = { ...s, points: s.points.map((pt, k) => (k === i ? add(pt, delta) : pt)) };
        } else if (s.type === 'cage' && drag.handle === 'rotate') {
            const a = sub(drag.startWorld, s.center), b = sub(w, s.center);
            const angle = Math.atan2(dot(cross(a, b), n), dot(a, b));
            next = { ...s, axisX: rotateAbout(s.axisX, n, angle), axisY: rotateAbout(s.axisY, n, angle) };
        }
        setDrag({ ...drag, last: next });
        p.onChange(next, false);
    };

    const endDrag = (e: React.PointerEvent) => {
        if (!drag) return;
        svgRef.current?.releasePointerCapture(e.pointerId);
        p.onChange(drag.last, true);
        setDrag(null);
    };

    // ── Placement ──────────────────────────────────────────────────────────
    const onBackgroundDown = (e: React.PointerEvent) => {
        if (p.mode === 'view') return;
        e.stopPropagation();
        e.preventDefault();
        if (e.button === 2) {
            if (p.mode === 'place_rod' && rodDraft.length >= 2) p.onPlaceRod(rodDraft);
            else p.onCancelPlacement();
            setRodDraft([]);
            return;
        }
        if (e.button !== 0) return;
        const w = toWorld(e);
        if (p.mode === 'place_rod') {
            setRodDraft((d) => [...d, w]);
        } else {
            p.onPlacePoint(w, viewport.getCamera());
        }
    };

    useEffect(() => {
        if (p.mode === 'view') return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { setRodDraft([]); p.onCancelPlacement(); }
            if (e.key === 'Enter' && p.mode === 'place_rod' && rodDraft.length >= 2) { p.onPlaceRod(rodDraft); setRodDraft([]); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [p, rodDraft]);

    // ── Rendering ─────────────────────────────────────────────────────────
    const shown = drag ? p.implants.map((i) => (i.id === drag.id ? drag.last : i)) : p.implants;

    const renderScrew = (s: PlanScrew) => {
        const sel = s.id === p.selectedId;
        const r = s.diameter / 2;
        const E = P(s.entry), T = P(s.tip);
        const L = screwLength(s);
        const ux = T[0] - E[0], uy = T[1] - E[1];
        const l2 = Math.hypot(ux, uy);
        const inSlab = clipSegmentToSlab(s.entry, s.tip, f, n, r + SLAB_MM);
        const solid = !!inSlab;
        const w = r * pxPerMm;

        // Screw almost perpendicular to this view → show its cross-section.
        if (l2 < Math.max(3, w * 0.6)) {
            const c = inSlab ? P(lerp(s.entry, s.tip, (inSlab[0] + inSlab[1]) / 2)) : E;
            return (
                <g key={s.id}>
                    <circle cx={c[0]} cy={c[1]} r={w} className={solid ? 'ss-impl-solid' : 'ss-impl-ghost'}
                        style={{ pointerEvents: 'all', cursor: 'move' }} onPointerDown={(e) => beginDrag(e, s, 'body')} />
                    {sel && <circle cx={c[0]} cy={c[1]} r={w + 4} className="ss-impl-sel" />}
                </g>
            );
        }

        const dx = ux / l2, dy = uy / l2, nx = -dy, ny = dx;
        const tipLen = Math.min(l2 * 0.25, w * 2.4);
        const shaftEnd = [T[0] - dx * tipLen, T[1] - dy * tipLen];
        const headLen = Math.min(l2 * 0.35, (1.4 * s.diameter) * pxPerMm * (l2 / (L * pxPerMm || 1)));
        const H0 = [E[0] - dx * Math.max(headLen, 4), E[1] - dy * Math.max(headLen, 4)];
        const hw = w * 1.6;
        const shaft = [
            [E[0] + nx * w, E[1] + ny * w], [shaftEnd[0] + nx * w, shaftEnd[1] + ny * w],
            [T[0], T[1]],
            [shaftEnd[0] - nx * w, shaftEnd[1] - ny * w], [E[0] - nx * w, E[1] - ny * w],
        ];
        const head = [
            [E[0] + nx * hw, E[1] + ny * hw], [H0[0] + nx * hw, H0[1] + ny * hw],
            [H0[0] - nx * hw, H0[1] - ny * hw], [E[0] - nx * hw, E[1] - ny * hw],
        ];
        // Thread marks every ~2.75 mm along the shaft.
        const pitch = 2.75 * pxPerMm * (l2 / (L * pxPerMm || 1));
        const threads: string[] = [];
        if (pitch > 3) {
            for (let t = pitch; t < l2 - tipLen; t += pitch) {
                const cx = E[0] + dx * t, cy = E[1] + dy * t;
                threads.push(`M${cx + nx * w - dx * pitch * 0.35},${cy + ny * w - dy * pitch * 0.35} L${cx - nx * w},${cy - ny * w}`);
            }
        }
        const pts = (a: number[][]) => a.map((q) => q.join(',')).join(' ');
        const cls = solid ? 'ss-impl-solid' : 'ss-impl-ghost';
        return (
            <g key={s.id}>
                <polygon points={pts(head)} className={cls} style={{ pointerEvents: 'all', cursor: 'move' }}
                    onPointerDown={(e) => beginDrag(e, s, 'body')} />
                <polygon points={pts(shaft)} className={cls} style={{ pointerEvents: 'all', cursor: 'move' }}
                    onPointerDown={(e) => beginDrag(e, s, 'body')} />
                {solid && threads.length > 0 && <path d={threads.join(' ')} className="ss-impl-thread" />}
                {sel && (
                    <>
                        <polygon points={pts(shaft)} className="ss-impl-sel" />
                        <Handle at={E} title="Entry point — drag to change trajectory" onDown={(e) => beginDrag(e, s, 'head')} />
                        <Handle at={T} title="Tip — drag to change trajectory/length" onDown={(e) => beginDrag(e, s, 'tip')} />
                        <text x={T[0] + 10} y={T[1] - 10} className="ss-impl-label">{`${L.toFixed(1)} × ${s.diameter} mm${s.level ? ` · ${s.level}${s.side ?? ''}` : ''}`}</text>
                    </>
                )}
            </g>
        );
    };

    const renderRod = (rod: PlanRod) => {
        const sel = rod.id === p.selectedId;
        const pts2 = rod.points.map(P);
        const d = pts2.map((q, i) => `${i ? 'L' : 'M'}${q[0]},${q[1]}`).join(' ');
        const w = Math.max(2, rod.diameter * pxPerMm);
        const near = rod.points.some((pt, i) => i > 0 && clipSegmentToSlab(rod.points[i - 1], pt, f, n, rod.diameter / 2 + SLAB_MM));
        return (
            <g key={rod.id}>
                <path d={d} className="ss-rod-outline" style={{ strokeWidth: w + 2 }} />
                <path d={d} className={near ? 'ss-rod' : 'ss-rod ss-rod-ghost'} style={{ strokeWidth: w, pointerEvents: 'stroke', cursor: 'move' }}
                    onPointerDown={(e) => beginDrag(e, rod, 'body')} />
                {sel && pts2.map((q, i) => (
                    <Handle key={i} at={q} title="Rod point — drag to bend" onDown={(e) => beginDrag(e, rod, i)} />
                ))}
            </g>
        );
    };

    const renderCage = (c: PlanCage) => {
        const sel = c.id === p.selectedId;
        const [w, , h] = c.size;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
            P(add(c.center, add(scale(c.axisX, (sx * w) / 2), scale(c.axisY, (sy * h) / 2)))));
        const C = P(c.center);
        const knobWorld = add(c.center, scale(c.axisY, h / 2 + 5));
        const K = P(knobWorld);
        const solid = Math.abs(dot(sub(c.center, f), n)) <= c.size[1] / 2 + SLAB_MM;
        return (
            <g key={c.id}>
                <polygon points={corners.map((q) => q.join(',')).join(' ')} className={solid ? 'ss-impl-solid' : 'ss-impl-ghost'}
                    style={{ pointerEvents: 'all', cursor: 'move' }} onPointerDown={(e) => beginDrag(e, c, 'body')} />
                {sel && (
                    <>
                        <polygon points={corners.map((q) => q.join(',')).join(' ')} className="ss-impl-sel" />
                        <line x1={C[0]} y1={C[1]} x2={K[0]} y2={K[1]} className="ss-impl-sel" />
                        <Handle at={K} title="Rotate cage" onDown={(e) => beginDrag(e, c, 'rotate')} />
                    </>
                )}
            </g>
        );
    };

    const draftPts = [...rodDraft, ...(hover && rodDraft.length ? [hover] : [])].map(P);

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full"
            style={{ pointerEvents: p.mode === 'view' && !drag ? 'none' : 'all', cursor: p.mode !== 'view' ? 'crosshair' : undefined, zIndex: 5 }}
            onPointerDown={onBackgroundDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onContextMenu={(e) => e.preventDefault()}
            onDoubleClick={() => {
                // dblclick also added a point on each click → drop the duplicate
                if (p.mode === 'place_rod' && rodDraft.length >= 3) { p.onPlaceRod(rodDraft.slice(0, -1)); setRodDraft([]); }
            }}
        >
            {shown.map((imp) => imp.type === 'screw' ? renderScrew(imp) : imp.type === 'rod' ? renderRod(imp) : renderCage(imp))}
            {draftPts.length > 1 && (
                <path d={draftPts.map((q, i) => `${i ? 'L' : 'M'}${q[0]},${q[1]}`).join(' ')} className="ss-rod ss-rod-ghost" style={{ strokeWidth: 3 }} />
            )}
            {draftPts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r={3} fill="#22d3ee" />)}
        </svg>
    );
}

function Handle({ at, title, onDown }: { at: [number, number] | number[]; title: string; onDown: (e: React.PointerEvent) => void }) {
    return (
        <circle cx={at[0]} cy={at[1]} r={6} className="ss-handle" style={{ pointerEvents: 'all', cursor: 'grab' }} onPointerDown={onDown}>
            <title>{title}</title>
        </circle>
    );
}

