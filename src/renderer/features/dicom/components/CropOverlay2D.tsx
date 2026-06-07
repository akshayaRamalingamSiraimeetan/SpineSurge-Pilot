import React, { useState, useEffect, useCallback } from 'react';
import { Types } from '@cornerstonejs/core';
import { useAppStore } from '@/lib/store/index';

interface CropOverlay2DProps {
    viewportId: string;
    engineRef: React.MutableRefObject<any>;
}

export const CropOverlay2D = ({ viewportId, engineRef }: CropOverlay2DProps) => {
    const { dicom3D, updateRoiCrop } = useAppStore();
    const [bounds, setBounds] = useState({ x: 0, y: 0, w: 0, h: 0 });
    const [isVisible, setIsVisible] = useState(false);

    // We need to know which physical axes map to the X and Y of this specific 2D viewport
    // AXIAL: X = L-R (x), Y = P-A (y)
    // CORONAL: X = L-R (x), Y = I-S (z)
    // SAGITTAL: X = P-A (y), Y = I-S (z)
    const viewType = viewportId.split('-')[0]; // 'AXIAL', 'CORONAL', 'SAGITTAL'

    const updateBoundsFrom3D = useCallback(() => {
        if (!engineRef.current || !dicom3D.isCroppingActive) {
            setIsVisible(false);
            return;
        }

        const engine = engineRef.current;
        const viewport = engine.getViewport(viewportId) as Types.IVolumeViewport;
        if (!viewport) return;

        // Try to get volume bounds
        // Try to get volume bounds
        // For simplicity, we can get bounds from the camera or image data if volumeId isn't directly exposed
        // Actually, we are mapping 0..1 to the canvas. 
        // We know the relative crop boundaries (0 to 1). We need to project the 8 corners of the 3D ROI box to the 2D canvas,
        // and draw the bounding box of those projected points.

        // Wait, a better approach for orthographic views:
        // The image being displayed has physical physical dimensions. 
        // But the easiest way is to use the Volume's physical bounds, get the 8 corners of the cropped region, convert worldToCanvas.

        // Let's implement a simplified robust approach assuming the orthographic views are axis-aligned.
        // We need the world bounds of the entire volume.

        const actors = viewport.getActors();
        if (!actors || actors.length === 0) {
            setIsVisible(false);
            return;
        }

        const volumeActor = actors[0].actor as any;
        const mapper = volumeActor?.getMapper();
        if (!mapper) return;

        const b = mapper.getBounds(); // [xMin, xMax, yMin, yMax, zMin, zMax]
        if (!b) return;

        const { x0, x1, y0, y1, z0, z1 } = dicom3D.roiCrop;
        const cropX0 = b[0] + (b[1] - b[0]) * x0;
        const cropX1 = b[0] + (b[1] - b[0]) * x1;
        const cropY0 = b[2] + (b[3] - b[2]) * y0;
        const cropY1 = b[2] + (b[3] - b[2]) * y1;
        const cropZ0 = b[4] + (b[5] - b[4]) * z0;
        const cropZ1 = b[4] + (b[5] - b[4]) * z1;

        // Depending on the view, we project 2 points (top-left and bottom-right of the projected rectangle)
        // Note: DICOM space often has specific orientations. 
        // Axial: looks down Z. X is physical X, Y is physical Y.
        // Coronal: looks down Y. X is physical X, Y is physical Z.
        // Sagittal: looks down X. X is physical Y, Y is physical Z.

        let p1World, p2World;

        if (viewType === 'AXIAL') {
            // Z is constant (just pick a point, won't affect orthographic projection)
            p1World = [cropX0, cropY0, b[4]];
            p2World = [cropX1, cropY1, b[4]];
        } else if (viewType === 'CORONAL') {
            p1World = [cropX0, b[2], cropZ0];
            p2World = [cropX1, b[2], cropZ1];
        } else if (viewType === 'SAGITTAL') {
            p1World = [b[0], cropY0, cropZ0];
            p2World = [b[0], cropY1, cropZ1];
        } else {
            setIsVisible(false);
            return;
        }

        const p1Canvas = viewport.worldToCanvas(p1World as Types.Point3);
        const p2Canvas = viewport.worldToCanvas(p2World as Types.Point3);

        if (!p1Canvas || !p2Canvas) {
            setIsVisible(false);
            return;
        }

        const minX = Math.min(p1Canvas[0], p2Canvas[0]);
        const maxX = Math.max(p1Canvas[0], p2Canvas[0]);
        const minY = Math.min(p1Canvas[1], p2Canvas[1]);
        const maxY = Math.max(p1Canvas[1], p2Canvas[1]);

        setBounds({
            x: minX,
            y: minY,
            w: Math.max(0, maxX - minX),
            h: Math.max(0, maxY - minY)
        });
        setIsVisible(true);

    }, [dicom3D.roiCrop, dicom3D.isCroppingActive, engineRef, viewportId, viewType, dicom3D.currentVolumeId]);

    // Force update periodically to catch camera movements (pan/zoom)
    // A better way is listening to CAMERA_MODIFIED event on the element, but polling is a safe fallback
    useEffect(() => {
        if (!dicom3D.isCroppingActive) return;

        const interval = setInterval(updateBoundsFrom3D, 1000 / 30); // 30fps sync
        return () => clearInterval(interval);
    }, [updateBoundsFrom3D, dicom3D.isCroppingActive]);

    const handlePointerDown = (handlePosition: string) => (e: React.PointerEvent) => {
        if (!engineRef.current) return;
        e.stopPropagation();
        e.preventDefault();

        const viewport = engineRef.current.getViewport(viewportId) as Types.IVolumeViewport;
        if (!viewport) return;

        const element = viewport.element;
        const rect = element.getBoundingClientRect();

        const startX = e.clientX;
        const startY = e.clientY;
        const startCrop = { ...dicom3D.roiCrop };

        const onPointerMove = (moveEvent: PointerEvent) => {
            // Calculate delta in canvas pixels
            const dxCanvas = moveEvent.clientX - startX;
            const dyCanvas = moveEvent.clientY - startY;

            // We need to convert canvas delta to physical relative delta (0 to 1)
            // We can do this by converting two points to world space
            const p0Canvas: Types.Point2 = [rect.width / 2, rect.height / 2];
            const p1Canvas: Types.Point2 = [rect.width / 2 + dxCanvas, rect.height / 2 + dyCanvas];

            const p0World = viewport.canvasToWorld(p0Canvas);
            const p1World = viewport.canvasToWorld(p1Canvas);

            if (!p0World || !p1World) return;

            const dxWorld = p1World[0] - p0World[0];
            const dyWorld = p1World[1] - p0World[1];
            const dzWorld = p1World[2] - p0World[2];

            // Get total volume bounds to calculate relative diff
            const actors = viewport.getActors();
            const volumeActor = actors?.[0]?.actor as any;
            const mapper = volumeActor?.getMapper();
            if (!mapper) return;

            const b = mapper.getBounds(); // [xMin, xMax, yMin, yMax, zMin, zMax]
            if (!b) return;

            const wWorld = b[1] - b[0];
            const hWorld = b[3] - b[2];
            const dWorld = b[5] - b[4];

            // Relative deltas
            const dr_x = wWorld !== 0 ? dxWorld / wWorld : 0;
            const dr_y = hWorld !== 0 ? dyWorld / hWorld : 0;
            const dr_z = dWorld !== 0 ? dzWorld / dWorld : 0;

            let newCrop = { ...startCrop };

            const clamp = (val: number) => Math.max(0, Math.min(1, val));

            // Apply depending on view and handle
            if (viewType === 'AXIAL') {
                // X controls L-R (x0/x1), Y controls P-A (y0/y1)
                if (handlePosition.includes('left')) newCrop.x0 = clamp(startCrop.x0 + dr_x);
                if (handlePosition.includes('right')) newCrop.x1 = clamp(startCrop.x1 + dr_x);
                if (handlePosition.includes('top')) newCrop.y0 = clamp(startCrop.y0 + dr_y);
                if (handlePosition.includes('bottom')) newCrop.y1 = clamp(startCrop.y1 + dr_y);

                // Drag whole box
                if (handlePosition === 'center') {
                    const cx = clamp(startCrop.x0 + dr_x);
                    const w = startCrop.x1 - startCrop.x0;
                    if (cx + w <= 1) { newCrop.x0 = cx; newCrop.x1 = cx + w; }

                    const cy = clamp(startCrop.y0 + dr_y);
                    const h = startCrop.y1 - startCrop.y0;
                    if (cy + h <= 1) { newCrop.y0 = cy; newCrop.y1 = cy + h; }
                }

            } else if (viewType === 'CORONAL') {
                // X controls L-R (x0/x1), Y controls I-S (z0/z1)
                // Note: screen Y mapping to physical Z might be inverted depending on camera up vector.
                // We will use the calculated dr_z directly.
                if (handlePosition.includes('left')) newCrop.x0 = clamp(startCrop.x0 + dr_x);
                if (handlePosition.includes('right')) newCrop.x1 = clamp(startCrop.x1 + dr_x);
                // Usually in Coronal, screen Y dragging down means physical Z decreases, but let's trust world diff
                if (handlePosition.includes('top')) newCrop.z0 = clamp(startCrop.z0 + dr_z);
                if (handlePosition.includes('bottom')) newCrop.z1 = clamp(startCrop.z1 + dr_z);

                if (handlePosition === 'center') {
                    const cx = clamp(startCrop.x0 + dr_x);
                    const w = startCrop.x1 - startCrop.x0;
                    if (cx + w <= 1) { newCrop.x0 = cx; newCrop.x1 = cx + w; }

                    const cz = clamp(startCrop.z0 + dr_z);
                    const d = startCrop.z1 - startCrop.z0;
                    if (cz + d <= 1) { newCrop.z0 = cz; newCrop.z1 = cz + d; }
                }

            } else if (viewType === 'SAGITTAL') {
                // X controls P-A (y0/y1), Y controls I-S (z0/z1)
                if (handlePosition.includes('left')) newCrop.y0 = clamp(startCrop.y0 + dr_y);
                if (handlePosition.includes('right')) newCrop.y1 = clamp(startCrop.y1 + dr_y);
                if (handlePosition.includes('top')) newCrop.z0 = clamp(startCrop.z0 + dr_z);
                if (handlePosition.includes('bottom')) newCrop.z1 = clamp(startCrop.z1 + dr_z);

                if (handlePosition === 'center') {
                    const cy = clamp(startCrop.y0 + dr_y);
                    const h = startCrop.y1 - startCrop.y0;
                    if (cy + h <= 1) { newCrop.y0 = cy; newCrop.y1 = cy + h; }

                    const cz = clamp(startCrop.z0 + dr_z);
                    const d = startCrop.z1 - startCrop.z0;
                    if (cz + d <= 1) { newCrop.z0 = cz; newCrop.z1 = cz + d; }
                }
            }

            // Enforce min/max logic (min cannot cross max)
            if (newCrop.x0 > newCrop.x1) newCrop.x0 = newCrop.x1 - 0.01;
            if (newCrop.y0 > newCrop.y1) newCrop.y0 = newCrop.y1 - 0.01;
            if (newCrop.z0 > newCrop.z1) newCrop.z0 = newCrop.z1 - 0.01;

            updateRoiCrop(newCrop);
        };

        const onPointerUp = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    };

    if (!isVisible) return null;

    return (
        <div style={{
            position: 'absolute',
            left: bounds.x,
            top: bounds.y,
            width: bounds.w,
            height: bounds.h,
            pointerEvents: 'none', // Box itself doesn't catch events, handles do
            zIndex: 40
        }}>
            {/* Box outline */}
            <div style={{
                position: 'absolute',
                inset: 0,
                border: '2px dashed #f472b6', // pink-400
                background: 'rgba(244, 114, 182, 0.05)'
            }} />

            {/* Invisible drag area for translation */}
            <div
                style={{ position: 'absolute', inset: 8, pointerEvents: 'auto', cursor: 'move' }}
                onPointerDown={handlePointerDown('center')}
            />

            {/* 8 Handles */}
            {[
                { id: 'top-left', top: -4, left: -4, cursor: 'nwse-resize' },
                { id: 'top-center', top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' },
                { id: 'top-right', top: -4, right: -4, cursor: 'nesw-resize' },
                { id: 'middle-right', top: '50%', right: -4, transform: 'translateY(-50%)', cursor: 'ew-resize' },
                { id: 'bottom-right', bottom: -4, right: -4, cursor: 'nwse-resize' },
                { id: 'bottom-center', bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' },
                { id: 'bottom-left', bottom: -4, left: -4, cursor: 'nesw-resize' },
                { id: 'middle-left', top: '50%', left: -4, transform: 'translateY(-50%)', cursor: 'ew-resize' },
            ].map((handle) => {
                const { id, cursor, ...positionStyles } = handle;
                return (
                    <div
                        key={id}
                        style={{
                            position: 'absolute',
                            width: 8,
                            height: 8,
                            backgroundColor: '#f472b6', // pink-400
                            borderRadius: '50%',
                            pointerEvents: 'auto',
                            cursor: cursor as any,
                            ...(positionStyles as any)
                        }}
                        onPointerDown={handlePointerDown(id)}
                    />
                );
            })}
        </div>
    );
};
