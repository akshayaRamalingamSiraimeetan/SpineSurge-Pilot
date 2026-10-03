import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import { cache, volumeLoader, type Types } from '@cornerstonejs/core';
import { segmentation, utilities as toolUtils, Enums as ToolEnums } from '@cornerstonejs/tools';

/**
 * 3D display of the CT volume. Never swaps the 3D volume (that wiped the
 * implant actors — BUGS 3D-03/3D-06); only the transfer functions, the
 * clipping planes and an MPR labelmap overlay change.
 */

const volumeActorOf = (vp: Types.IVolumeViewport) => vp.getActors()?.find((a: any) => a.actor?.isA?.('vtkVolume'))?.actor as any;

/** 'volume' = soft CT-bone rendering; 'bone' = opaque iso-surface-like bone at `threshold` HU. */
export function applyBoneDisplay(vp: Types.IVolumeViewport, mode: 'volume' | 'bone', threshold: number) {
    const actor = volumeActorOf(vp);
    if (!actor) return;
    const prop = actor.getProperty();

    const ctf = vtkColorTransferFunction.newInstance();
    const otf = vtkPiecewiseFunction.newInstance();
    if (mode === 'bone') {
        ctf.addRGBPoint(threshold, 0.89, 0.85, 0.76);
        ctf.addRGBPoint(threshold + 600, 0.97, 0.95, 0.9);
        ctf.addRGBPoint(3000, 1, 1, 1);
        otf.addPoint(-1024, 0);
        otf.addPoint(threshold - 1, 0);
        otf.addPoint(threshold, 1);
        otf.addPoint(3071, 1);
    } else {
        ctf.addRGBPoint(-1000, 0, 0, 0);
        ctf.addRGBPoint(threshold, 0.73, 0.6, 0.42);
        ctf.addRGBPoint(threshold + 400, 0.9, 0.82, 0.66);
        ctf.addRGBPoint(1900, 1, 0.98, 0.94);
        otf.addPoint(-1024, 0);
        otf.addPoint(threshold, 0);
        otf.addPoint(threshold + 120, 0.15);
        otf.addPoint(threshold + 450, 0.6);
        otf.addPoint(1900, 0.85);
        otf.addPoint(3071, 0.9);
    }
    prop.setRGBTransferFunction(0, ctf);
    prop.setScalarOpacity(0, otf);
    prop.setShade(true);
    prop.setAmbient(0.25);
    prop.setDiffuse(0.75);
    prop.setSpecular(mode === 'bone' ? 0.25 : 0.3);
    prop.setSpecularPower(20);
    prop.setInterpolationTypeToLinear();
    vp.render();
}

export interface RoiCrop { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

/** World bounds [xmin,xmax,ymin,ymax,zmin,zmax] of the 3D volume (null until it is set). */
export function volumeBounds(vp: Types.IVolumeViewport): number[] | null {
    const actor = volumeActorOf(vp);
    if (!actor) return null;
    const b = actor.getMapper()?.getInputData()?.getBounds?.() ?? actor.getBounds?.();
    return Array.isArray(b) && b.length === 6 && b.every(Number.isFinite) ? b : null;
}

/** Axis-aligned crop of the 3D volume via 6 clipping planes (normalised 0..1 bounds). */
export function applyCrop(vp: Types.IVolumeViewport, roi: RoiCrop | null) {
    const actor = volumeActorOf(vp);
    if (!actor) return;
    const mapper = actor.getMapper();
    mapper.removeAllClippingPlanes();
    if (roi) {
        const b = mapper.getInputData()?.getBounds?.() ?? actor.getBounds();
        const at = (lo: number, hi: number, t: number) => lo + (hi - lo) * t;
        const planes: [number[], number[]][] = [
            [[at(b[0], b[1], roi.x0), 0, 0], [1, 0, 0]],
            [[at(b[0], b[1], roi.x1), 0, 0], [-1, 0, 0]],
            [[0, at(b[2], b[3], roi.y0), 0], [0, 1, 0]],
            [[0, at(b[2], b[3], roi.y1), 0], [0, -1, 0]],
            [[0, 0, at(b[4], b[5], roi.z0)], [0, 0, 1]],
            [[0, 0, at(b[4], b[5], roi.z1)], [0, 0, -1]],
        ];
        for (const [origin, normal] of planes) {
            mapper.addClippingPlane(vtkPlane.newInstance({ origin: origin as any, normal: normal as any }));
        }
    }
    vp.render();
}

/**
 * Bone labelmap shown on the three MPR views. Built with Cornerstone v4's
 * derived-labelmap + thresholdVolumeByRange (the old code called the removed
 * ImageVolume.getScalarData, so the mask was never written — BUGS 3D-01).
 */
export class BoneSegmentation {
    readonly segmentationId: string;
    private segVolumeId: string;
    private created = false;

    constructor(private ctVolumeId: string, private mprViewportIds: string[]) {
        this.segmentationId = `bone-seg-${ctVolumeId}`;
        this.segVolumeId = `${this.segmentationId}-labelmap`;
    }

    private ensure() {
        if (this.created) return;
        volumeLoader.createAndCacheDerivedLabelmapVolume(this.ctVolumeId, { volumeId: this.segVolumeId });
        segmentation.addSegmentations([{
            segmentationId: this.segmentationId,
            representation: {
                type: ToolEnums.SegmentationRepresentations.Labelmap,
                data: { volumeId: this.segVolumeId },
            },
        }]);
        this.created = true;
    }

    /** Show the overlay with the given HU threshold (CT must be fully loaded). */
    show(threshold: number) {
        this.ensure();
        const ct = cache.getVolume(this.ctVolumeId);
        const seg = cache.getVolume(this.segVolumeId);
        if (!ct || !seg) return;
        const [dx, dy, dz] = seg.dimensions;
        toolUtils.segmentation.thresholdVolumeByRange(
            seg,
            [{ volume: ct, lower: threshold, upper: 3071 }],
            { overwrite: true, segmentationId: this.segmentationId, boundsIJK: [[0, dx - 1], [0, dy - 1], [0, dz - 1]], segmentIndex: 1 },
        );
        const map: Record<string, { segmentationId: string }[]> = {};
        for (const id of this.mprViewportIds) map[id] = [{ segmentationId: this.segmentationId }];
        try {
            segmentation.addLabelmapRepresentationToViewportMap(map);
        } catch { /* already added */ }
        segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(this.segmentationId);
    }

    hide() {
        if (!this.created) return;
        for (const id of this.mprViewportIds) {
            try { segmentation.removeLabelmapRepresentation(id, this.segmentationId); } catch { /* ignore */ }
        }
    }

    destroy() {
        this.hide();
        if (!this.created) return;
        try { segmentation.removeSegmentation(this.segmentationId); } catch { /* ignore */ }
        try { cache.removeVolumeLoadObject(this.segVolumeId); } catch { /* ignore */ }
        this.created = false;
    }
}
