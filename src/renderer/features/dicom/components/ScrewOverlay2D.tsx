import React, { useState, useEffect, useCallback } from 'react';
import { Types } from '@cornerstonejs/core';
import { useAppStore } from '@/lib/store/index';
import { getTransformedScrewTrajectory } from '@/features/measurements/planning/SurgicalGeometry';

interface ScrewOverlay2DProps {
    viewportId: string;
    engineRef: React.MutableRefObject<any>;
}

export const ScrewOverlay2D = ({ viewportId, engineRef }: ScrewOverlay2DProps) => {
    const { threeDImplants, dicom3D } = useAppStore();
    const [projections, setProjections] = useState<any[]>([]);

    const viewType = viewportId.split('-')[0]; // 'AXIAL', 'CORONAL', 'SAGITTAL'

    const updateProjections = useCallback(() => {
        if (!engineRef.current) return;

        const engine = engineRef.current;
        const viewport = engine.getViewport(viewportId) as Types.IVolumeViewport;
        if (!viewport) return;

        const newProjections = threeDImplants
            .filter(imp => imp.type === 'screw')
            .map(screw => {
                const { entry, tip } = getTransformedScrewTrajectory(
                    screw.position as [number, number, number],
                    screw.direction as [number, number, number],
                    {
                        length: screw.properties.length,
                        caudalAngle: screw.properties.caudalAngle,
                        medialAngle: screw.properties.medialAngle,
                        depth: screw.properties.depth
                    }
                );

                const entryCanvas = viewport.worldToCanvas(entry as Types.Point3);
                const tipCanvas = viewport.worldToCanvas(tip as Types.Point3);

                if (!entryCanvas || !tipCanvas) return null;

                return {
                    id: screw.id,
                    entry: { x: entryCanvas[0], y: entryCanvas[1] },
                    tip: { x: tipCanvas[0], y: tipCanvas[1] },
                    color: screw.properties.color,
                    isSelected: screw.id === dicom3D.selectedImplantId,
                    diameter: screw.properties.diameter,
                    length: screw.properties.length
                };
            })
            .filter(Boolean);

        setProjections(newProjections);
    }, [threeDImplants, dicom3D.selectedImplantId, viewportId, engineRef]);

    useEffect(() => {
        const interval = setInterval(updateProjections, 1000 / 30);
        return () => clearInterval(interval);
    }, [updateProjections]);

    if (projections.length === 0) return null;

    return (
        <svg
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 35
            }}
        >
            <defs>
                <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                >
                    <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
                </marker>
            </defs>
            {projections.map(p => {
                const isAxial = viewType === 'AXIAL';
                const color = p.color || '#4fc3f7'; // Use implant color or default
                const strokeWidth = p.isSelected ? 2.0 : 1.0;

                const handleDragStart = (e: React.PointerEvent) => {
                    e.stopPropagation();
                    e.preventDefault();

                    if (!engineRef.current) return;
                    const engine = engineRef.current;
                    const viewport = engine.getViewport(viewportId) as Types.IVolumeViewport;
                    if (!viewport) return;

                    const { updateThreeDImplant, threeDImplants } = useAppStore.getState();
                    const screw = threeDImplants.find(imp => imp.id === p.id);
                    if (!screw) return;

                    const element = viewport.element;
                    const rect = element.getBoundingClientRect();

                    const onPointerMove = (moveEvent: PointerEvent) => {
                        const canvasPos: Types.Point2 = [
                            moveEvent.clientX - rect.left,
                            moveEvent.clientY - rect.top
                        ];
                        const worldPos = viewport.canvasToWorld(canvasPos);
                        if (!worldPos) return;

                        // When dragging the entry point, we update its world position.
                        // However, we want to maintain the screw's direction? 
                        // FEATURE 04 says "Drag to Fine-Tune Screw Position... entry point moves, the trajectory line follows".
                        // This usually means the entry point (position) changes, but the direction (vector) remains the same.

                        updateThreeDImplant(p.id, {
                            position: [worldPos[0], worldPos[1], worldPos[2]]
                        });
                    };

                    const onPointerUp = () => {
                        window.removeEventListener('pointermove', onPointerMove);
                        window.removeEventListener('pointerup', onPointerUp);
                    };

                    window.addEventListener('pointermove', onPointerMove);
                    window.addEventListener('pointerup', onPointerUp);
                };

                if (isAxial) {
                    // Axial: Circle at entry + direction line
                    const dx = p.tip.x - p.entry.x;
                    const dy = p.tip.y - p.entry.y;
                    const angle = Math.atan2(dy, dx);
                    const lineLen = 15;
                    const lineEndX = p.entry.x + Math.cos(angle) * lineLen;
                    const lineEndY = p.entry.y + Math.sin(angle) * lineLen;

                    return (
                        <g key={p.id} color={color}>
                            <circle
                                cx={p.entry.x}
                                cy={p.entry.y}
                                r={12}
                                fill="transparent"
                                style={{ pointerEvents: 'auto', cursor: 'move' }}
                                onPointerDown={handleDragStart}
                            />
                            {/* Axial silhouette: outer ring for tulip head, inner for shaft */}
                            <circle
                                cx={p.entry.x}
                                cy={p.entry.y}
                                r={6}
                                fill="none"
                                stroke={color}
                                strokeWidth={strokeWidth * 1.5}
                                style={{ pointerEvents: 'none' }}
                            />
                            <circle
                                cx={p.entry.x}
                                cy={p.entry.y}
                                r={3}
                                fill={color}
                                opacity={0.5}
                                style={{ pointerEvents: 'none' }}
                            />
                            <line
                                x1={p.entry.x}
                                y1={p.entry.y}
                                x2={lineEndX}
                                y2={lineEndY}
                                stroke={color}
                                strokeWidth={strokeWidth}
                                strokeDasharray="4 2"
                            />
                        </g>
                    );
                } else {
                    // Sagittal/Coronal: Full realistic silhouette profile
                    const dx = p.tip.x - p.entry.x;
                    const dy = p.tip.y - p.entry.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len < 1) return null;

                    const ux = dx / len;
                    const uy = dy / len;
                    const px = -uy;
                    const py = ux;

                    // Estimate scale (pixels per mm) based on diameter
                    const pixPerMm = len / p.length;
                    const r = (p.diameter / 2) * pixPerMm;
                    const hr = r * 1.6; // head radius
                    const hl = 6 * pixPerMm; // head length (tulip height)

                    // 1. U-Shaped Tulip Head
                    // Points for the "arms" of the U
                    const headBase = { x: p.entry.x, y: p.entry.y };
                    const headTopCenter = { x: p.entry.x + ux * hl, y: p.entry.y + uy * hl };

                    // Outer points
                    const o1 = { x: headBase.x + px * hr, y: headBase.y + py * hr };
                    const o2 = { x: headBase.x - px * hr, y: headBase.y - py * hr };
                    const o3 = { x: headTopCenter.x + px * hr, y: headTopCenter.y + py * hr };
                    const o4 = { x: headTopCenter.x - px * hr, y: headTopCenter.y - py * hr };

                    // Inner points (the "U" notch)
                    const notchDepth = hl * 0.7; // How deep the U goes
                    const notchWidth = hr * 0.6; // How wide the gap is
                    const nBase = { x: headBase.x + ux * (hl - notchDepth), y: headBase.y + uy * (hl - notchDepth) };
                    const n1 = { x: o3.x - px * (hr - notchWidth), y: o3.y - py * (hr - notchWidth) };
                    const n2 = { x: o4.x + px * (hr - notchWidth), y: o4.y + py * (hr - notchWidth) };
                    const nBottom1 = { x: nBase.x + px * notchWidth, y: nBase.y + py * notchWidth };
                    const nBottom2 = { x: nBase.x - px * notchWidth, y: nBase.y - py * notchWidth };

                    // Tulip Path: Outer boundary -> Notch -> Clear
                    const headPath = `
                        M ${o1.x} ${o1.y} 
                        L ${o3.x} ${o3.y} 
                        L ${n1.x} ${n1.y} 
                        L ${nBottom1.x} ${nBottom1.y} 
                        Q ${nBase.x} ${nBase.y}, ${nBottom2.x} ${nBottom2.y}
                        L ${n2.x} ${n2.y}
                        L ${o4.x} ${o4.y}
                        L ${o2.x} ${o2.y}
                        Q ${headBase.x} ${headBase.y}, ${o1.x} ${o1.y} Z
                    `;

                    // 2. Shaft (Main Body)
                    // Add a small "neck" transition
                    const neckLen = 1.5 * pixPerMm;
                    const s1 = { x: p.entry.x + px * r + ux * (hl - neckLen), y: p.entry.y + py * r + uy * (hl - neckLen) };
                    const s2 = { x: p.entry.x - px * r + ux * (hl - neckLen), y: p.entry.y - py * r + uy * (hl - neckLen) };

                    // 3. Bullet Tip (Rounded)
                    // We'll approximate the bullet tip with a curve
                    const tipStartLen = len - (r * 2.5); // Start rounding earlier
                    const s3 = { x: p.entry.x + px * r + ux * tipStartLen, y: p.entry.y + py * r + uy * tipStartLen };
                    const s4 = { x: p.entry.x - px * r + ux * tipStartLen, y: p.entry.y - py * r + uy * tipStartLen };

                    const tipPoint = { x: p.tip.x, y: p.tip.y };

                    // Shaft + Bullet Tip Path: using a Bézier curve for the bullet tip
                    const bodyPath = `
                        M ${s1.x} ${s1.y} 
                        L ${s3.x} ${s3.y} 
                        Q ${s3.x + ux * r} ${s3.y + uy * r}, ${tipPoint.x} ${tipPoint.y}
                        Q ${s4.x + ux * r} ${s4.y + uy * r}, ${s4.x} ${s4.y}
                        L ${s2.x} ${s2.y} Z
                    `;

                    const filterId = `vibrant-glow-${p.id}`;
                    // The border should always be the 3D screw color
                    const outlineColor = color;

                    return (
                        <g key={p.id}>
                            <defs>
                                <filter id={filterId} x="-100%" y="-100%" width="300%" height="300%">
                                    {/* Primary Glow in Screw Color */}
                                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                                    <feFlood floodColor={color} floodOpacity="0.9" result="glowColor" />
                                    <feComposite in="glowColor" in2="blur" operator="in" result="softGlow" />

                                    {/* Additional Glow intensity */}
                                    <feGaussianBlur in="softGlow" stdDeviation="1.0" result="innerBlur" />

                                    <feMerge>
                                        <feMergeNode in="softGlow" />
                                        <feMergeNode in="innerBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>

                            {/* Main Silhouette fill */}
                            <g opacity={p.isSelected ? 0.45 : 0.3}>
                                <path d={headPath} fill={color} />
                                <path d={bodyPath} fill={color} />
                            </g>

                            {/* Border Glow Layer */}
                            <g filter={`url(#${filterId})`}>
                                <path
                                    d={headPath}
                                    fill="none"
                                    stroke={outlineColor}
                                    strokeWidth={0.8}
                                    strokeLinejoin="round"
                                />
                                <path
                                    d={bodyPath}
                                    fill="none"
                                    stroke={outlineColor}
                                    strokeWidth={0.8}
                                    strokeDasharray={p.isSelected ? "" : "3 1"}
                                    strokeLinejoin="round"
                                />
                            </g>

                            {/* Subtle Selection Highlight (Inner border) */}
                            {p.isSelected && (
                                <g opacity={0.6}>
                                    <path d={headPath} fill="none" stroke="white" strokeWidth={0.4} />
                                    <path d={bodyPath} fill="none" stroke="white" strokeWidth={0.4} />
                                </g>
                            )}

                            {/* Interaction Handle */}
                            <circle
                                cx={p.entry.x}
                                cy={p.entry.y}
                                r={12}
                                fill="transparent"
                                style={{ pointerEvents: 'auto', cursor: 'move' }}
                                onPointerDown={handleDragStart}
                            />
                        </g>
                    );
                }
            })}
        </svg>
    );
};
