import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    RenderingEngine,
    Enums,
    cache,
    metaData,
    setVolumesForViewports,
    volumeLoader,
    type Types,
} from '@cornerstonejs/core';
import {
    Enums as ToolsEnums,
    ToolGroupManager,
    WindowLevelTool,
    PanTool,
    ZoomTool,
    StackScrollTool,
    TrackballRotateTool,
} from '@cornerstonejs/tools';
import { useShallow } from 'zustand/react/shallow';
import { Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { initCornerstone, releaseSeriesMemory } from '@/lib/cornerstone/initCornerstone';
import { useAppStore } from '@/lib/store';
import type { PlanImplant } from '@/lib/store/types';
import { cn } from '@/lib/utils';
import { loadSeriesImageIds } from './loadSeries';
import { ImplantActorSync } from './actors3D';
import { Overlay2D, type PlaceMode } from './Overlay2D';
import { attach3DInteraction } from './interaction3D';
import { applyBoneDisplay, applyCrop, BoneSegmentation } from './volumeDisplay';
import { makeCage, makeRod, makeScrew, PA_DIRECTION } from './implantModel';
import { add, dot, len, norm, scale, sub, type Vec3 } from './vec3';

/**
 * 3D surgical planning viewer: axial / sagittal / coronal MPR + 3D volume.
 * One store (threeDImplants) drives every view. Implants are edited by
 * dragging in any MPR (in-plane) or in 3D (screen-parallel); saved on release.
 *
 * Lifecycle is owned by ONE effect with a cancel flag; each mount uses unique
 * engine/volume/tool-group ids and destroys them on unmount (BUGS 3D-09/3D-21).
 */

type ViewKey = 'axial' | 'sagittal' | 'coronal' | 'threeD';

interface Session {
    engine: RenderingEngine;
    volumeId: string;
    ids: Record<ViewKey, string>;
}

const VIEW_LABEL: Record<ViewKey, string> = { axial: 'Axial', sagittal: 'Sagittal', coronal: 'Coronal', threeD: '3D' };
const MPR: Exclude<ViewKey, 'threeD'>[] = ['axial', 'sagittal', 'coronal'];

export function PlanningViewer({ fileList }: { fileList: (File | string)[] }) {
    const cellRefs = useRef<Record<ViewKey, HTMLDivElement | null>>({ axial: null, sagittal: null, coronal: null, threeD: null });
    const gridRef = useRef<HTMLDivElement>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [status, setStatus] = useState<{ phase: 'loading' | 'ready' | 'error'; message?: string }>({ phase: 'loading', message: 'Preparing viewer…' });
    const [volumeLoaded, setVolumeLoaded] = useState(false);
    const [maximized, setMaximized] = useState<ViewKey | null>(null);

    const { implants, dicom3D } = useAppStore(useShallow((s) => ({ implants: s.threeDImplants, dicom3D: s.dicom3D })));
    const mode = dicom3D.interactionMode as PlaceMode;
    const selectedId = dicom3D.selectedImplantId;

    // ── Load + build viewports (single owner, cancellable) ──────────────────
    useEffect(() => {
        if (fileList.length === 0) return;
        let cancelled = false;
        const sid = crypto.randomUUID().slice(0, 8);
        const ids: Record<ViewKey, string> = { axial: `ax-${sid}`, sagittal: `sag-${sid}`, coronal: `cor-${sid}`, threeD: `3d-${sid}` };
        const engineId = `ss-engine-${sid}`;
        const volumeId = `cornerstoneStreamingImageVolume:ss-vol-${sid}`;
        const tg2d = `ss-tg2d-${sid}`, tg3d = `ss-tg3d-${sid}`;
        let engine: RenderingEngine | null = null;
        setVolumeLoaded(false);

        (async () => {
            try {
                setStatus({ phase: 'loading', message: 'Initialising…' });
                await initCornerstone();
                if (cancelled) return;

                const series = await loadSeriesImageIds(fileList, (d, t) => {
                    if (!cancelled && (d === t || d % 10 === 0)) setStatus({ phase: 'loading', message: `Reading images ${d}/${t}` });
                });
                if (cancelled) return;
                if (series.imageIds.length < 2) throw new Error('No usable CT/MR series was found in the selection.');

                const study = metaData.get('studyModule', series.imageIds[0]) ?? {};
                const gs = metaData.get('generalSeriesModule', series.imageIds[0]) ?? {};
                useAppStore.getState().setDicomMetadata({
                    patientName: study.patientName, patientID: study.patientId, studyDate: study.studyDate,
                    modality: gs.modality, seriesNumber: gs.seriesNumber,
                });

                setStatus({ phase: 'loading', message: `Building volume (${series.imageIds.length} slices)…` });
                const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds: series.imageIds });
                if (cancelled) return;

                const el = cellRefs.current;
                if (!el.axial || !el.sagittal || !el.coronal || !el.threeD) throw new Error('Viewer container missing');
                engine = new RenderingEngine(engineId);
                engine.setViewports([
                    { viewportId: ids.axial, type: Enums.ViewportType.ORTHOGRAPHIC, element: el.axial, defaultOptions: { orientation: Enums.OrientationAxis.AXIAL, background: [0, 0, 0] } },
                    { viewportId: ids.sagittal, type: Enums.ViewportType.ORTHOGRAPHIC, element: el.sagittal, defaultOptions: { orientation: Enums.OrientationAxis.SAGITTAL, background: [0, 0, 0] } },
                    { viewportId: ids.coronal, type: Enums.ViewportType.ORTHOGRAPHIC, element: el.coronal, defaultOptions: { orientation: Enums.OrientationAxis.CORONAL, background: [0, 0, 0] } },
                    { viewportId: ids.threeD, type: Enums.ViewportType.VOLUME_3D, element: el.threeD, defaultOptions: { orientation: Enums.OrientationAxis.CORONAL, background: [0.04, 0.04, 0.05] } },
                ]);

                const g2 = ToolGroupManager.createToolGroup(tg2d)!;
                [WindowLevelTool, PanTool, ZoomTool, StackScrollTool].forEach((T) => g2.addTool(T.toolName));
                g2.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
                g2.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }] });
                g2.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }] });
                g2.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }] });
                MPR.forEach((k) => g2.addViewport(ids[k], engineId));

                const g3 = ToolGroupManager.createToolGroup(tg3d)!;
                [TrackballRotateTool, PanTool, ZoomTool].forEach((T) => g3.addTool(T.toolName));
                g3.setToolActive(TrackballRotateTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }] });
                g3.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }] });
                g3.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }] });
                g3.addViewport(ids.threeD, engineId);

                // Volume is set ONCE for all viewports — never again (BUGS 3D-06).
                await setVolumesForViewports(engine, [{ volumeId }], Object.values(ids));
                if (cancelled) return;
                const vp3 = engine.getViewport(ids.threeD) as Types.IVolumeViewport;
                vp3.setProperties({ preset: 'CT-Bone' });

                volume.load(() => { if (!cancelled) setVolumeLoaded(true); });
                engine.render();
                setSession({ engine, volumeId, ids });
                setStatus({ phase: 'ready' });
            } catch (e) {
                console.error('[PlanningViewer] load failed', e);
                if (!cancelled) setStatus({ phase: 'error', message: e instanceof Error ? e.message : 'Could not load the series' });
            }
        })();

        return () => {
            cancelled = true;
            setSession(null);
            for (const id of [tg2d, tg3d]) { try { ToolGroupManager.destroyToolGroup(id); } catch { /* ignore */ } }
            try { engine?.destroy(); } catch { /* ignore */ }
            try { cache.removeVolumeLoadObject(volumeId); } catch { /* ignore */ }
            releaseSeriesMemory();
        };
    }, [fileList]);

    const getVp = useCallback((k: ViewKey) => session ? (session.engine.getViewport(session.ids[k]) as Types.IVolumeViewport) : null, [session]);

    // ── Resize (attached once the engine exists — BUGS 3D-11) ───────────────
    useEffect(() => {
        if (!session || !gridRef.current) return;
        let raf = 0;
        const ro = new ResizeObserver(() => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => { try { session.engine.resize(true, true); } catch { /* destroyed */ } });
        });
        ro.observe(gridRef.current);
        return () => { ro.disconnect(); cancelAnimationFrame(raf); };
    }, [session]);
    useEffect(() => { if (session) requestAnimationFrame(() => { try { session.engine.resize(true, true); } catch { /* */ } }); }, [maximized, dicom3D.layoutMode, session]);

    // ── 3D implant actors follow the store (including after (re)load — 3D-12)
    const actorSync = useMemo(() => {
        const vp = getVp('threeD');
        return vp ? new ImplantActorSync(vp as any) : null;
    }, [getVp]);
    useEffect(() => { actorSync?.sync(implants, selectedId); }, [actorSync, implants, selectedId]);
    useEffect(() => () => actorSync?.clear(), [actorSync]);

    // ── 3D appearance: volume vs bone surface, threshold, crop ──────────────
    const boneMode = dicom3D.renderMode === 'segmentation';
    const threshold = boneMode ? dicom3D.isoThreshold : dicom3D.volumeThreshold;
    useEffect(() => {
        const vp = getVp('threeD');
        if (vp) applyBoneDisplay(vp, boneMode ? 'bone' : 'volume', threshold);
    }, [getVp, boneMode, threshold]);
    useEffect(() => {
        const vp = getVp('threeD');
        if (vp) applyCrop(vp, dicom3D.isCroppingActive ? dicom3D.roiCrop : null);
    }, [getVp, dicom3D.isCroppingActive, dicom3D.roiCrop]);
    useEffect(() => {
        if (!dicom3D.focusCropTrigger) return;
        const vp = getVp('threeD');
        vp?.resetCamera();
        vp?.render();
    }, [getVp, dicom3D.focusCropTrigger]);

    // Bone labelmap on the MPRs in "segmentation" mode (debounced, after load).
    const segRef = useRef<BoneSegmentation | null>(null);
    useEffect(() => {
        if (!session) return;
        segRef.current = new BoneSegmentation(session.volumeId, MPR.map((k) => session.ids[k]));
        return () => { segRef.current?.destroy(); segRef.current = null; };
    }, [session]);
    useEffect(() => {
        const seg = segRef.current;
        if (!seg) return;
        if (!boneMode || !volumeLoaded) { seg.hide(); return; }
        const t = setTimeout(() => {
            try { seg.show(dicom3D.isoThreshold); } catch (e) { console.error('[PlanningViewer] segmentation failed', e); }
        }, 400);
        return () => clearTimeout(t);
    }, [boneMode, volumeLoaded, dicom3D.isoThreshold, session]);

    // ── Implant editing ─────────────────────────────────────────────────────
    const store = useAppStore.getState;
    const select = useCallback((id: string | null) => store().setSelectedDicomImplant(id), [store]);
    const change = useCallback((imp: PlanImplant, final: boolean) => {
        store().updateThreeDImplant(imp.id, imp, { persist: false });
        if (final) store().commitThreeDImplants();
    }, [store]);
    const finishPlacement = useCallback((imp: PlanImplant) => {
        store().addThreeDImplant(imp);
        store().setSelectedDicomImplant(imp.id);
        store().setDicom3DMode('view');
    }, [store]);

    const placePoint = useCallback((world: Vec3, camera: Types.ICamera) => {
        const d = store().dicom3D;
        const n = norm(camera.viewPlaneNormal as Vec3);
        if (d.interactionMode === 'place_screw') {
            // Default trajectory posterior→anterior, kept in the clicked plane.
            const inPlane = sub(PA_DIRECTION, scale(n, dot(PA_DIRECTION, n)));
            const dir = len(inPlane) > 0.3 ? norm(inPlane) : PA_DIRECTION;
            finishPlacement(makeScrew(world, dir, { length: d.screwLength, diameter: d.screwDiameter, level: d.screwLevel, side: d.screwSide }));
        } else if (d.interactionMode === 'place_cage') {
            finishPlacement(makeCage(world, n, camera.viewUp as Vec3));
        }
    }, [store, finishPlacement]);

    // 3D view picking / dragging / place-on-bone.
    useEffect(() => {
        const vpEl = cellRefs.current.threeD;
        if (!session || !vpEl) return;
        return attach3DInteraction(vpEl, {
            getViewport: () => getVp('threeD'),
            getVolume: () => (cache.getVolume(session.volumeId) as Types.IImageVolume) ?? null,
            getImplants: () => useAppStore.getState().threeDImplants,
            getMode: () => useAppStore.getState().dicom3D.interactionMode,
            getThreshold: () => {
                const d = useAppStore.getState().dicom3D;
                return Math.max(150, d.renderMode === 'segmentation' ? d.isoThreshold : d.volumeThreshold);
            },
            onSelect: select,
            onChange: change,
            onPlaceOnBone: (entry, dir) => {
                const d = useAppStore.getState().dicom3D;
                finishPlacement(makeScrew(entry, dir, { length: d.screwLength, diameter: d.screwDiameter, level: d.screwLevel, side: d.screwSide }));
            },
        });
    }, [session, getVp, select, change, finishPlacement]);

    // Selecting an implant brings every MPR slice to it (navigation-style).
    useEffect(() => {
        if (!session || !selectedId) return;
        const imp = useAppStore.getState().threeDImplants.find((i) => i.id === selectedId);
        if (!imp) return;
        const target: Vec3 = imp.type === 'screw' ? scale(add(imp.entry, imp.tip), 0.5)
            : imp.type === 'rod' ? imp.points[Math.floor(imp.points.length / 2)] : imp.center;
        for (const k of MPR) {
            const vp = getVp(k);
            if (!vp) continue;
            const cam = vp.getCamera();
            const n = norm(cam.viewPlaneNormal as Vec3);
            const shift = scale(n, dot(sub(target, cam.focalPoint as Vec3), n));
            vp.setCamera({ focalPoint: add(cam.focalPoint as Vec3, shift) as Types.Point3, position: add(cam.position as Vec3, shift) as Types.Point3 });
            vp.render();
        }
        // only when the selection changes, not on every drag update
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, session]);

    // Delete key removes the selected implant.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
            const sel = useAppStore.getState().dicom3D.selectedImplantId;
            if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
                useAppStore.getState().removeThreeDImplant(sel);
                useAppStore.getState().setSelectedDicomImplant(null);
            }
            if (e.key === 'Escape') useAppStore.getState().setSelectedDicomImplant(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ── Layout ──────────────────────────────────────────────────────────────
    const layout = dicom3D.layoutMode;
    const area = (k: ViewKey): React.CSSProperties => {
        if (maximized) return k === maximized ? { gridArea: '1 / 1 / 4 / 3' } : { display: 'none' };
        if (layout === 'focus-3d') return k === 'threeD' ? { gridArea: '1 / 1 / 4 / 2' } : { gridArea: `${MPR.indexOf(k as any) + 1} / 2 / ${MPR.indexOf(k as any) + 2} / 3` };
        if (layout === 'axial-sagittal') {
            const order: ViewKey[] = ['sagittal', 'axial', 'coronal', 'threeD'];
            const i = order.indexOf(k);
            return i === 0 ? { gridArea: '1 / 1 / 4 / 2' } : { gridArea: `${i} / 2 / ${i + 1} / 3` };
        }
        const pos: Record<ViewKey, string> = { axial: '1 / 1 / 2 / 2', sagittal: '1 / 2 / 2 / 3', coronal: '2 / 1 / 3 / 2', threeD: '2 / 2 / 3 / 3' };
        return { gridArea: pos[k] };
    };
    const gridTemplate = maximized ? { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr 1fr' }
        : layout === 'grid' ? { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }
        : { gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr 1fr' };

    const placeHint = mode === 'place_screw' ? 'Click the entry point (MPR) or click bone in 3D'
        : mode === 'place_rod' ? 'Click rod points · double-click / Enter / right-click to finish'
        : mode === 'place_cage' ? 'Click the disc space centre' : null;

    return (
        <div className="relative w-full h-full bg-black">
            <div ref={gridRef} className="grid w-full h-full gap-px bg-white/10" style={gridTemplate}>
                {(['axial', 'sagittal', 'coronal', 'threeD'] as ViewKey[]).map((k) => {
                    const vp = k === 'threeD' ? null : getVp(k);
                    return (
                        <div key={k} className="relative bg-black overflow-hidden min-h-0 min-w-0" style={area(k)}>
                            <div ref={(el) => { cellRefs.current[k] = el; }} className="absolute inset-0" onContextMenu={(e) => e.preventDefault()} />
                            {vp && (
                                <Overlay2D
                                    viewport={vp}
                                    implants={implants}
                                    selectedId={selectedId}
                                    mode={mode}
                                    onSelect={select}
                                    onChange={change}
                                    onPlacePoint={placePoint}
                                    onPlaceRod={(pts) => finishPlacement(makeRod(pts))}
                                    onCancelPlacement={() => store().setDicom3DMode('view')}
                                />
                            )}
                            <div className="absolute top-2 left-2 z-10 text-[10px] font-bold uppercase tracking-widest text-white/60 pointer-events-none">
                                {VIEW_LABEL[k]}
                            </div>
                            <button
                                className="absolute top-1.5 right-1.5 z-10 p-1 rounded text-white/50 hover:text-white hover:bg-white/10"
                                title={maximized === k ? 'Restore' : 'Maximise'}
                                onClick={() => setMaximized((m) => (m === k ? null : k))}
                            >
                                {maximized === k ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                    );
                })}
            </div>

            {placeHint && status.phase === 'ready' && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 text-xs pointer-events-none">
                    {placeHint} · Esc to cancel
                </div>
            )}
            {status.phase === 'ready' && !volumeLoaded && (
                <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 text-[11px] text-white/60 pointer-events-none">
                    <Loader2 className="w-3 h-3 animate-spin" /> Streaming slices…
                </div>
            )}
            {status.phase !== 'ready' && (
                <div className={cn('absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 text-sm',
                    status.phase === 'error' ? 'text-red-300' : 'text-white/70')}>
                    {status.phase === 'loading' && <Loader2 className="w-6 h-6 animate-spin" />}
                    <span>{status.message}</span>
                </div>
            )}
        </div>
    );
}
