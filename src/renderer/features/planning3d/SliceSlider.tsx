import { useEffect, useState } from 'react';
import { Enums, utilities, type Types } from '@cornerstonejs/core';

/**
 * Slice slider along the top of an MPR view (UI10-06): drag to jump through
 * the stack instead of scrolling slice by slice. Follows wheel scrolling too.
 */
export function SliceSlider({ viewport }: { viewport: Types.IVolumeViewport }) {
    const read = () => {
        try {
            const d = utilities.getImageSliceDataForVolumeViewport(viewport);
            return d ? { index: d.imageIndex, count: d.numberOfSlices } : null;
        } catch {
            return null; // volume not ready yet
        }
    };
    const [slice, setSlice] = useState(read);

    useEffect(() => {
        const el = viewport.element;
        const update = () => setSlice(read());
        el.addEventListener(Enums.Events.CAMERA_MODIFIED, update);
        el.addEventListener(Enums.Events.VOLUME_NEW_IMAGE, update);
        update();
        return () => {
            el.removeEventListener(Enums.Events.CAMERA_MODIFIED, update);
            el.removeEventListener(Enums.Events.VOLUME_NEW_IMAGE, update);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewport]);

    if (!slice || slice.count < 2) return null;
    return (
        <div className="absolute top-1.5 left-20 right-10 z-10 flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
            <input
                type="range"
                min={0}
                max={slice.count - 1}
                value={slice.index}
                onChange={(e) => {
                    const imageIndex = parseInt(e.target.value);
                    setSlice({ ...slice, index: imageIndex });
                    void utilities.jumpToSlice(viewport.element, { imageIndex });
                }}
                className="ss-slice-slider flex-1 h-1 cursor-pointer accent-[var(--accent)]"
                title="Drag to move through the slices"
            />
            <span className="text-[10px] font-mono text-white/60 tabular-nums w-14 text-right">{slice.index + 1}/{slice.count}</span>
        </div>
    );
}
