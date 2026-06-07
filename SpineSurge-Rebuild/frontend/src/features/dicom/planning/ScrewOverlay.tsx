/* Per-viewport SVG overlay drawing screw trajectories projected into the viewport's canvas space.
 * Ported from the old ScrewOverlay2D: axial views show a ringed entry + direction tick; sagittal/
 * coronal show a full tulip-head + bullet-tip silhouette with a colored glow. The projection is
 * recomputed every animation frame so it tracks pan/zoom/scroll; the entry handle is draggable
 * (updates the screw's world anchor). Geometry comes from the parity-locked screwTrajectory(). */
import { useEffect, useRef, useState } from 'react';
import type { Types } from '@cornerstonejs/core';
import { usePlanningStore } from './planningStore';
import { screwTrajectory } from './screwTrajectory';

interface Projection {
  id: string;
  entry: { x: number; y: number };
  tip: { x: number; y: number };
  color: string;
  selected: boolean;
  diameter: number;
  length: number;
}

export type OverlayViewport = Types.IVolumeViewport & {
  worldToCanvas(p: Types.Point3): Types.Point2 | undefined;
  canvasToWorld(p: Types.Point2): Types.Point3 | undefined;
  element: HTMLElement;
};

export function ScrewOverlay({
  getViewport,
  isAxial,
}: {
  getViewport: () => OverlayViewport | undefined;
  isAxial: boolean;
}) {
  const [projections, setProjections] = useState<Projection[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const vp = getViewport();
      if (vp) {
        const { implants, selectedImplantId } = usePlanningStore.getState();
        const next: Projection[] = [];
        for (const screw of implants) {
          if (screw.type !== 'screw') continue;
          const { entry, tip } = screwTrajectory(screw);
          const ec = vp.worldToCanvas(entry as Types.Point3);
          const tc = vp.worldToCanvas(tip as Types.Point3);
          if (!ec || !tc) continue;
          next.push({
            id: screw.id,
            entry: { x: ec[0], y: ec[1] },
            tip: { x: tc[0], y: tc[1] },
            color: screw.properties.color,
            selected: screw.id === selectedImplantId,
            diameter: screw.properties.diameter,
            length: screw.properties.length,
          });
        }
        setProjections(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [getViewport]);

  if (projections.length === 0) return null;

  const startDrag = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const vp = getViewport();
    if (!vp) return;
    const rect = vp.element.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const world = vp.canvasToWorld([ev.clientX - rect.left, ev.clientY - rect.top]);
      if (world) usePlanningStore.getState().updateImplant(id, { position: [world[0], world[1], world[2]] });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <svg style={svgStyle}>
      {projections.map((p) => (isAxial ? <AxialScrew key={p.id} p={p} onGrab={startDrag(p.id)} /> : <ProfileScrew key={p.id} p={p} onGrab={startDrag(p.id)} />))}
    </svg>
  );
}

function AxialScrew({ p, onGrab }: { p: Projection; onGrab: (e: React.PointerEvent) => void }) {
  const w = p.selected ? 2 : 1;
  const dx = p.tip.x - p.entry.x;
  const dy = p.tip.y - p.entry.y;
  const a = Math.atan2(dy, dx);
  const ex = p.entry.x + Math.cos(a) * 15;
  const ey = p.entry.y + Math.sin(a) * 15;
  return (
    <g color={p.color}>
      <circle cx={p.entry.x} cy={p.entry.y} r={12} fill="transparent" style={grab} onPointerDown={onGrab} />
      <circle cx={p.entry.x} cy={p.entry.y} r={6} fill="none" stroke={p.color} strokeWidth={w * 1.5} />
      <circle cx={p.entry.x} cy={p.entry.y} r={3} fill={p.color} opacity={0.5} />
      <line x1={p.entry.x} y1={p.entry.y} x2={ex} y2={ey} stroke={p.color} strokeWidth={w} strokeDasharray="4 2" />
    </g>
  );
}

function ProfileScrew({ p, onGrab }: { p: Projection; onGrab: (e: React.PointerEvent) => void }) {
  const dx = p.tip.x - p.entry.x;
  const dy = p.tip.y - p.entry.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const ux = dx / len, uy = dy / len, px = -uy, py = ux;
  const pixPerMm = len / p.length;
  const r = (p.diameter / 2) * pixPerMm;
  const hr = r * 1.6;
  const hl = 6 * pixPerMm;

  const base = { x: p.entry.x, y: p.entry.y };
  const top = { x: p.entry.x + ux * hl, y: p.entry.y + uy * hl };
  const o1 = { x: base.x + px * hr, y: base.y + py * hr };
  const o2 = { x: base.x - px * hr, y: base.y - py * hr };
  const o3 = { x: top.x + px * hr, y: top.y + py * hr };
  const o4 = { x: top.x - px * hr, y: top.y - py * hr };
  const notchD = hl * 0.7, notchW = hr * 0.6;
  const nBase = { x: base.x + ux * (hl - notchD), y: base.y + uy * (hl - notchD) };
  const n1 = { x: o3.x - px * (hr - notchW), y: o3.y - py * (hr - notchW) };
  const n2 = { x: o4.x + px * (hr - notchW), y: o4.y + py * (hr - notchW) };
  const nb1 = { x: nBase.x + px * notchW, y: nBase.y + py * notchW };
  const nb2 = { x: nBase.x - px * notchW, y: nBase.y - py * notchW };

  const headPath = `M ${o1.x} ${o1.y} L ${o3.x} ${o3.y} L ${n1.x} ${n1.y} L ${nb1.x} ${nb1.y} Q ${nBase.x} ${nBase.y}, ${nb2.x} ${nb2.y} L ${n2.x} ${n2.y} L ${o4.x} ${o4.y} L ${o2.x} ${o2.y} Q ${base.x} ${base.y}, ${o1.x} ${o1.y} Z`;

  const neck = 1.5 * pixPerMm;
  const s1 = { x: p.entry.x + px * r + ux * (hl - neck), y: p.entry.y + py * r + uy * (hl - neck) };
  const s2 = { x: p.entry.x - px * r + ux * (hl - neck), y: p.entry.y - py * r + uy * (hl - neck) };
  const tipStart = len - r * 2.5;
  const s3 = { x: p.entry.x + px * r + ux * tipStart, y: p.entry.y + py * r + uy * tipStart };
  const s4 = { x: p.entry.x - px * r + ux * tipStart, y: p.entry.y - py * r + uy * tipStart };
  const bodyPath = `M ${s1.x} ${s1.y} L ${s3.x} ${s3.y} Q ${s3.x + ux * r} ${s3.y + uy * r}, ${p.tip.x} ${p.tip.y} Q ${s4.x + ux * r} ${s4.y + uy * r}, ${s4.x} ${s4.y} L ${s2.x} ${s2.y} Z`;

  const fid = `screw-glow-${p.id}`;
  return (
    <g>
      <defs>
        <filter id={fid} x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feFlood floodColor={p.color} floodOpacity="0.9" result="gc" />
          <feComposite in="gc" in2="blur" operator="in" result="soft" />
          <feMerge>
            <feMergeNode in="soft" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g opacity={p.selected ? 0.45 : 0.3}>
        <path d={headPath} fill={p.color} />
        <path d={bodyPath} fill={p.color} />
      </g>
      <g filter={`url(#${fid})`}>
        <path d={headPath} fill="none" stroke={p.color} strokeWidth={0.8} strokeLinejoin="round" />
        <path d={bodyPath} fill="none" stroke={p.color} strokeWidth={0.8} strokeDasharray={p.selected ? '' : '3 1'} strokeLinejoin="round" />
      </g>
      {p.selected && (
        <g opacity={0.6}>
          <path d={headPath} fill="none" stroke="#fff" strokeWidth={0.4} />
          <path d={bodyPath} fill="none" stroke="#fff" strokeWidth={0.4} />
        </g>
      )}
      <circle cx={p.entry.x} cy={p.entry.y} r={12} fill="transparent" style={grab} onPointerDown={onGrab} />
    </g>
  );
}

const svgStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 35,
};
const grab: React.CSSProperties = { pointerEvents: 'auto', cursor: 'move' };
