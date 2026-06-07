/* Step 8b — DICOM/3D volume viewer (core pipeline + planning layer).
 *
 * Drives the ported `initCornerstone` pipeline: load DICOM files → build a streaming image volume →
 * render a 4-quadrant Axial / Sagittal / Coronal MPR + a bone-preset VOLUME_3D viewport. With
 * `planning` on it also hosts the surgical-planning layer: HU-driven volume rendering, a segmentation
 * labelmap (threshold + scissors), per-MPR screw-trajectory overlays, and click-to-drop point
 * placement — all driven by the shared planningStore.
 *
 * Layout follows DESIGN §4.3 (4-quadrant CT workspace). Files may be browser File objects or any
 * { name, arrayBuffer() } resource (the loader normalizes both). */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as cs from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  initCornerstone,
  addFileToLoader,
  TOOL_GROUP_2D_ID,
  TOOL_GROUP_3D_ID,
} from '@/lib/cornerstone/initCornerstone';
import { boneOpacityPoints, HU_THRESHOLD_MAX, HU_THRESHOLD_MIN } from './volumePresets';
import { usePlanningStore } from './planning/planningStore';
import { makeScrew } from './planning/screwTrajectory';
import { ScrewOverlay, type OverlayViewport } from './planning/ScrewOverlay';
import { applyIsoThreshold, ensureSegmentation, notifySegmentationModified } from './planning/segmentation';
import type { Vec3 } from '@/features/measurements/planning/SurgicalGeometry';

/** Minimal structural types over the VTK actor property + piecewise function (avoids `any`). */
interface VtkPiecewise {
  addPoint(x: number, y: number): void;
}
interface VtkVolumeProperty {
  setScalarOpacity(componentIndex: number, fn: VtkPiecewise): void;
  setInterpolationTypeToLinear(): void;
}

const { RenderingEngine, Enums, volumeLoader, setVolumesForViewports, metaData, cache } = cs;
const { ViewportType, OrientationAxis } = Enums;

export interface DicomResourceLike {
  name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

const ENGINE_ID = 'spinesurge-3d-engine';
const VP = { AXIAL: 'CT_AXIAL', SAGITTAL: 'CT_SAGITTAL', CORONAL: 'CT_CORONAL', THREED: 'CT_3D' };
const MPR = [VP.AXIAL, VP.SAGITTAL, VP.CORONAL];

let pointSeq = 0;

export interface VolumeInfo {
  volumeId: string;
  sliceCount: number;
}

export function DicomVolumeViewer({
  files,
  controls = false,
  planning = false,
  onReady,
}: {
  files: Array<File | DicomResourceLike>;
  /** Show the DESIGN §4.3 chrome (Volume/Segmentation toggle + HU-threshold slider). */
  controls?: boolean;
  /** Enable the surgical-planning layer (screw overlays, point placement, segmentation). */
  planning?: boolean;
  onReady?: (info: VolumeInfo) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<InstanceType<typeof RenderingEngine> | null>(null);
  const volumeIdRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const [status, setStatus] = useState('Initializing…');
  const [rendered, setRendered] = useState(false);

  // 3D controls live in the planning store so the wizard, control bar, and viewer stay in sync.
  const mode = usePlanningStore((s) => s.renderMode);
  const hu = usePlanningStore((s) => s.volumeThreshold);
  const isoThreshold = usePlanningStore((s) => s.isoThreshold);
  const segTool = usePlanningStore((s) => s.segTool);
  const workflowStep = usePlanningStore((s) => s.workflowStep);

  const getVp = useCallback(
    (id: string) => engineRef.current?.getViewport(id) as unknown as OverlayViewport | undefined,
    [],
  );

  useEffect(() => {
    if (files.length === 0 || startedRef.current) return;
    startedRef.current = true;
    let disposed = false;

    const run = async () => {
      try {
        await initCornerstone();
        if (disposed || !rootRef.current) return;
        setStatus(`Loading ${files.length} slices…`);

        const ids = (await Promise.all(files.map((f) => addFileToLoader(f)))).filter(Boolean) as string[];
        if (ids.length === 0) {
          setStatus('No valid DICOM files.');
          return;
        }

        // Let the local metadata provider settle, then sort by slice location.
        await new Promise((r) => setTimeout(r, 400));
        const sorted = [...ids].sort((a, b) => {
          const pa = metaData.get('imagePlaneModule', a);
          const pb = metaData.get('imagePlaneModule', b);
          const la = pa?.sliceLocation ?? pa?.imagePositionPatient?.[2] ?? ids.indexOf(a);
          const lb = pb?.sliceLocation ?? pb?.imagePositionPatient?.[2] ?? ids.indexOf(b);
          return la - lb;
        });

        const { imageLoader } = cs;
        try {
          await imageLoader.loadAndCacheImage(sorted[0]);
        } catch {
          /* metadata may still arrive via the volume load */
        }

        const px = metaData.get('imagePixelModule', sorted[0]);
        const isSigned = px?.pixelRepresentation === 1;
        const bits = px?.bitsAllocated ?? 16;
        const dataType =
          bits === 8 ? (isSigned ? 'Int8Array' : 'Uint8Array')
          : bits === 32 ? (isSigned ? 'Int32Array' : 'Uint32Array')
          : isSigned ? 'Int16Array' : 'Uint16Array';

        const volumeId = `cornerstoneStreamingImageVolume:ct-${Date.now()}`;
        volumeIdRef.current = volumeId;
        if (cache.getVolume(volumeId)) cache.removeVolumeLoadObject(volumeId);
        const volume = await volumeLoader.createAndCacheVolume(volumeId, {
          imageIds: sorted,
          dataType,
        } as Parameters<typeof volumeLoader.createAndCacheVolume>[1]);
        volume.load();
        setStatus(`Rendering ${sorted.length} slices…`);

        const engine = new RenderingEngine(ENGINE_ID);
        engineRef.current = engine;
        const q = (sel: string) => rootRef.current!.querySelector(sel) as HTMLDivElement;
        engine.setViewports([
          { viewportId: VP.AXIAL, type: ViewportType.ORTHOGRAPHIC, element: q('#vp-axial'), defaultOptions: { orientation: OrientationAxis.AXIAL } },
          { viewportId: VP.SAGITTAL, type: ViewportType.ORTHOGRAPHIC, element: q('#vp-sagittal'), defaultOptions: { orientation: OrientationAxis.SAGITTAL } },
          { viewportId: VP.CORONAL, type: ViewportType.ORTHOGRAPHIC, element: q('#vp-coronal'), defaultOptions: { orientation: OrientationAxis.CORONAL } },
          { viewportId: VP.THREED, type: ViewportType.VOLUME_3D, element: q('#vp-threed'), defaultOptions: { orientation: OrientationAxis.CORONAL, background: [0, 0, 0] as Types.Point3 } },
        ]);

        await setVolumesForViewports(engine, [{ volumeId }], Object.values(VP));

        // Bone preset for the 3D viewport (matches the old viewer).
        const vp3d = engine.getViewport(VP.THREED) as Types.IVolumeViewport;
        try {
          (vp3d as unknown as { setProperties: (p: { preset: string }) => void }).setProperties({ preset: 'CT-Bone' });
        } catch {
          /* preset optional */
        }

        // Wire tool groups (created in initCornerstone) to the viewports.
        const tools = await import('@cornerstonejs/tools');
        const tg2d = tools.ToolGroupManager.getToolGroup(TOOL_GROUP_2D_ID);
        const tg3d = tools.ToolGroupManager.getToolGroup(TOOL_GROUP_3D_ID);
        MPR.forEach((id) => tg2d?.addViewport(id, ENGINE_ID));
        tg3d?.addViewport(VP.THREED, ENGINE_ID);

        engine.render();
        setStatus('');
        if (!disposed) {
          setRendered(true);
          onReady?.({ volumeId, sliceCount: sorted.length });
        }
      } catch (err) {
        console.error('[DicomVolumeViewer] startup failed', err);
        setStatus(`Error: ${(err as Error).message}`);
      }
    };
    run();

    return () => {
      disposed = true;
      try {
        engineRef.current?.destroy();
      } catch {
        /* already torn down */
      }
      engineRef.current = null;
      volumeIdRef.current = null;
      startedRef.current = false;
      setRendered(false);
    };
  }, [files, onReady]);

  // Volume Rendering: drive the bone opacity curve from the HU threshold (the "spine extraction"
  // effect). Re-applies whenever the threshold changes or the volume finishes rendering.
  useEffect(() => {
    if (!rendered || mode !== 'volume') return;
    const vp3d = engineRef.current?.getViewport(VP.THREED) as Types.IVolumeViewport | undefined;
    const actor = vp3d?.getActors()[0]?.actor as unknown as { getProperty(): VtkVolumeProperty } | undefined;
    const vtkUtils = (window as unknown as {
      vtkUtils?: { PiecewiseFunction: { newInstance(): VtkPiecewise } };
    }).vtkUtils;
    if (!vp3d || !actor || !vtkUtils) return;
    try {
      const property = actor.getProperty();
      const pwf = vtkUtils.PiecewiseFunction.newInstance();
      for (const [x, y] of boneOpacityPoints(hu)) pwf.addPoint(x, y);
      property.setScalarOpacity(0, pwf);
      property.setInterpolationTypeToLinear();
      vp3d.render();
    } catch (err) {
      console.warn('[DicomVolumeViewer] HU threshold apply failed', err);
    }
  }, [rendered, mode, hu]);

  // Segmentation: build/bind the labelmap when entering segmentation mode (defensive — failure never
  // breaks the verified volume render).
  useEffect(() => {
    if (!planning || !rendered || mode !== 'segmentation') return;
    const volumeId = volumeIdRef.current;
    const engine = engineRef.current;
    if (!volumeId || !engine) return;
    let cancelled = false;
    (async () => {
      try {
        const tools = await import('@cornerstonejs/tools');
        await ensureSegmentation(tools, volumeLoader, volumeId, MPR, () => engine.render());
        if (!cancelled) {
          applyIsoThreshold(volumeId, isoThreshold);
          notifySegmentationModified(tools); // fire the segmentation-changed event so viewports repaint
          engine.render();
        }
      } catch (err) {
        console.warn('[DicomVolumeViewer] segmentation setup failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planning, rendered, mode, isoThreshold]);

  // Scissors vs threshold: bind the scissor tool to the primary mouse in segmentation+scissors mode,
  // otherwise restore window/level. Defensive around tool-group availability.
  useEffect(() => {
    if (!planning || !rendered) return;
    let cancelled = false;
    (async () => {
      try {
        const tools = await import('@cornerstonejs/tools');
        const tg = tools.ToolGroupManager.getToolGroup(TOOL_GROUP_2D_ID);
        if (!tg || cancelled) return;
        const primary = { mouseButton: tools.Enums.MouseBindings.Primary };
        const scissors = mode === 'segmentation' && segTool === 'scissors';
        tg.setToolActive(
          scissors ? tools.RectangleScissorsTool.toolName : tools.WindowLevelTool.toolName,
          { bindings: [primary] },
        );
        tg.setToolPassive(scissors ? tools.WindowLevelTool.toolName : tools.RectangleScissorsTool.toolName);
      } catch (err) {
        console.warn('[DicomVolumeViewer] tool binding failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planning, rendered, mode, segTool]);

  const dropPoint = useCallback((world: Vec3) => {
    const { screwLevel, addSimulation, addImplant } = usePlanningStore.getState();
    const simId = `sim-${++pointSeq}`;
    addSimulation({
      id: simId,
      label: screwLevel,
      landmarks: { VAP: { id: `lm-${pointSeq}`, type: 'VAP', worldPos: world, label: screwLevel } },
    });
    addImplant(makeScrew(`screw-${pointSeq}`, world, screwLevel, 'L', simId));
  }, []);

  const placing = planning && workflowStep === 3;

  return (
    <div style={{ width: '100%', height: '100%', background: '#000', display: 'flex', flexDirection: 'column' }}>
      {controls && <ControlBar />}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={rootRef} style={gridStyle}>
          {MPR.map((id) => (
            <Quad key={id} id={`vp-${id.split('_')[1].toLowerCase()}`} label={cap(id)}>
              {planning && rendered && (
                <ScrewOverlay getViewport={() => getVp(id)} isAxial={id === VP.AXIAL} />
              )}
              {placing && (
                <PlacementCatcher viewportId={id} getVp={getVp} onDrop={dropPoint} />
              )}
            </Quad>
          ))}
          <Quad id="vp-threed" label="3D" />
        </div>
        {status && <div style={overlayStyle}>{status}</div>}
      </div>
    </div>
  );
}

const cap = (id: string) => {
  const v = id.split('_')[1].toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
};

/** Transparent capture layer active during point placement; turns a click into a world-space drop. */
function PlacementCatcher({
  viewportId,
  getVp,
  onDrop,
}: {
  viewportId: string;
  getVp: (id: string) => OverlayViewport | undefined;
  onDrop: (world: Vec3) => void;
}) {
  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 40, cursor: 'crosshair' }}
      title="Click to drop a pedicle point"
      onClick={(e) => {
        const vp = getVp(viewportId);
        if (!vp) return;
        const rect = vp.element.getBoundingClientRect();
        const world = vp.canvasToWorld([e.clientX - rect.left, e.clientY - rect.top]);
        if (world) onDrop([world[0], world[1], world[2]]);
      }}
    />
  );
}

/* DESIGN §4.3 chrome: Volume Rendering vs Segmentation toggle + HU-threshold histogram slider, plus
   the segmentation sub-tools (threshold vs scissors). All state lives in the planning store. */
function ControlBar() {
  const mode = usePlanningStore((s) => s.renderMode);
  const setMode = usePlanningStore((s) => s.setRenderMode);
  const hu = usePlanningStore((s) => s.volumeThreshold);
  const setHu = usePlanningStore((s) => s.setVolumeThreshold);
  const iso = usePlanningStore((s) => s.isoThreshold);
  const setIso = usePlanningStore((s) => s.setIsoThreshold);
  const segTool = usePlanningStore((s) => s.segTool);
  const setSegTool = usePlanningStore((s) => s.setSegTool);

  const seg = mode === 'segmentation';
  return (
    <div style={barStyle}>
      <div style={segStyle}>
        <button style={segBtn(!seg)} onClick={() => setMode('volume')}>Volume Rendering</button>
        <button style={segBtn(seg)} onClick={() => setMode('segmentation')}>Segmentation</button>
      </div>

      {seg && (
        <div style={segStyle}>
          <button style={segBtn(segTool === 'threshold')} onClick={() => setSegTool('threshold')}>Threshold</button>
          <button style={segBtn(segTool === 'scissors')} onClick={() => setSegTool('scissors')}>Scissors</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, maxWidth: 380 }}>
        <span style={huLabelStyle}>{seg ? 'Mask Threshold' : 'HU Threshold'}</span>
        <input
          type="range"
          min={HU_THRESHOLD_MIN}
          max={HU_THRESHOLD_MAX}
          step={10}
          value={seg ? iso : hu}
          onChange={(e) => (seg ? setIso(Number(e.target.value)) : setHu(Number(e.target.value)))}
          style={{ flex: 1, accentColor: '#E8362D' }}
        />
        <span style={huValueStyle}>{seg ? iso : hu} HU</span>
      </div>
    </div>
  );
}

function Quad({ id, label, children }: { id: string; label: string; children?: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', background: '#000', border: '1px solid #1b1b1e' }}>
      <div id={id} style={{ width: '100%', height: '100%' }} onContextMenu={(e) => e.preventDefault()} />
      <span style={quadLabelStyle}>{label}</span>
      {children}
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gridTemplateRows: '1fr 1fr',
  gap: 2,
  width: '100%',
  height: '100%',
};
const quadLabelStyle: React.CSSProperties = {
  position: 'absolute', top: 8, left: 10, color: '#9CA3AF', fontSize: 12,
  letterSpacing: '0.06em', textTransform: 'uppercase', pointerEvents: 'none',
};
const overlayStyle: React.CSSProperties = {
  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
  color: '#F5F5F7', background: 'rgba(17,24,39,0.85)', padding: '10px 16px',
  borderRadius: 10, fontSize: 13,
};
const barStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
  padding: '8px 14px', background: '#0d0d10', borderBottom: '1px solid #1b1b1e', flex: '0 0 auto',
};
const segStyle: React.CSSProperties = {
  display: 'flex', background: '#17171b', borderRadius: 8, padding: 2, flex: '0 0 auto',
};
const segBtn = (on: boolean): React.CSSProperties => ({
  border: 'none', background: on ? '#E8362D' : 'transparent', color: on ? '#fff' : '#9CA3AF',
  padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  transition: 'background 140ms ease, color 140ms ease',
});
const huLabelStyle: React.CSSProperties = {
  color: '#9CA3AF', fontSize: 12, letterSpacing: '0.04em', whiteSpace: 'nowrap',
};
const huValueStyle: React.CSSProperties = {
  color: '#F5F5F7', fontSize: 12, fontVariantNumeric: 'tabular-nums', minWidth: 58, textAlign: 'right',
};
