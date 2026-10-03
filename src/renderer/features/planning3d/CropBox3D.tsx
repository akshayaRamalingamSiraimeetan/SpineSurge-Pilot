import { useEffect, useReducer, useRef } from 'react';
import { Enums, type Types } from '@cornerstonejs/core';
import { volumeBounds, type RoiCrop } from './volumeDisplay';

/**
 * Slicer-style ROI box in the 3D view (UI10-05): the crop region is drawn as a
 * wireframe box with a handle on each face. Dragging a face moves that side of
 * the crop along its axis, so the anatomy can be opened up from any side.
 * Only the handles take pointer events — rotating/zooming the 3D view works
 * everywhere else.
 */
type Face = 'x0' | 'x1' | 'y0' | 'y1' | 'z0' | 'z1';
const AXIS: Record<Face, 0 | 1 | 2> = { x0: 0, x1: 0, y0: 1, y1: 1, z0: 2, z1: 2 };
const MIN_GAP = 0.02;

export function CropBox3D({ viewport, roi, onChange }: {
    viewport: Types.IVolumeViewport;
    roi: RoiCrop;
    onChange: (patch: Partial<RoiCrop>) => void;
}) {
    const [, redraw] = useReducer((x: number) => x + 1, 0);
    // Latest roi/onChange for the window listeners of an ongoing drag
    const live = useRef({ roi, onChange });
    useEffect(() => { live.current = { roi, onChange }; }, [roi, onChange]);

    useEffect(() => {
        const el = viewport.element;
        el.addEventListener(Enums.Events.CAMERA_MODIFIED, redraw);
        const ro = new ResizeObserver(redraw);
        ro.observe(el);
        return () => { el.removeEventListener(Enums.Events.CAMERA_MODIFIED, redraw); ro.disconnect(); };
    }, [viewport]);

    const b = volumeBounds(viewport);
    if (!b) return null;
    const lo = [b[0], b[2], b[4]], hi = [b[1], b[3], b[5]];
    const at = (axis: 0 | 1 | 2, t: number) => lo[axis] + (hi[axis] - lo[axis]) * t;
    const r = [[roi.x0, roi.x1], [roi.y0, roi.y1], [roi.z0, roi.z1]];
    const world = (i: number, j: number, k: number): Types.Point3 => [at(0, r[0][i]), at(1, r[1][j]), at(2, r[2][k])];
    const P = (w: Types.Point3) => viewport.worldToCanvas(w) as [number, number];

    // 8 corners, 12 edges
    const corners: [number, number][][][] = [0, 1].map((i) => [0, 1].map((j) => [0, 1].map((k) => P(world(i, j, k)))));
    const edges: [[number, number], [number, number]][] = [];
    for (const j of [0, 1]) for (const k of [0, 1]) edges.push([corners[0][j][k], corners[1][j][k]]);
    for (const i of [0, 1]) for (const k of [0, 1]) edges.push([corners[i][0][k], corners[i][1][k]]);
    for (const i of [0, 1]) for (const j of [0, 1]) edges.push([corners[i][j][0], corners[i][j][1]]);

    // Face centres
    const mid = [(r[0][0] + r[0][1]) / 2, (r[1][0] + r[1][1]) / 2, (r[2][0] + r[2][1]) / 2];
    const faceCenter = (f: Face): Types.Point3 => {
        const a = AXIS[f];
        const t = [...mid];
        t[a] = roi[f];
        return [at(0, t[0]), at(1, t[1]), at(2, t[2])];
    };

    const onDown = (f: Face) => (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const a = AXIS[f];
        const c = faceCenter(f);
        const c2 = [...c] as Types.Point3;
        c2[a] += hi[a] - lo[a]; // the full axis range on screen
        const p1 = P(c), p2 = P(c2);
        const ax = p2[0] - p1[0], ay = p2[1] - p1[1];
        const len2 = ax * ax + ay * ay;
        if (len2 < 1) return; // axis points at the camera — rotate the view to drag this face
        const startX = e.clientX, startY = e.clientY, start = roi[f];
        const isLow = f.endsWith('0');
        const otherKey = (f[0] + (isLow ? '1' : '0')) as Face;
        const move = (ev: PointerEvent) => {
            const t = start + ((ev.clientX - startX) * ax + (ev.clientY - startY) * ay) / len2;
            const other = live.current.roi[otherKey];
            const v = isLow ? Math.max(0, Math.min(other - MIN_GAP, t)) : Math.min(1, Math.max(other + MIN_GAP, t));
            live.current.onChange({ [f]: v });
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };

    return (
        <svg data-no-capture="1" className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none', zIndex: 6 }}>
            {edges.map(([p, q], i) => (
                <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#facc15" strokeOpacity={0.75} strokeWidth={1.25} strokeDasharray="5 4" />
            ))}
            {(Object.keys(AXIS) as Face[]).map((f) => {
                const c = P(faceCenter(f));
                return (
                    <circle key={f} cx={c[0]} cy={c[1]} r={7} fill="#facc15" stroke="rgba(0,0,0,0.7)" strokeWidth={1.5}
                        style={{ pointerEvents: 'all', cursor: 'grab' }} onPointerDown={onDown(f)}>
                        <title>Drag to crop this side</title>
                    </circle>
                );
            })}
        </svg>
    );
}
