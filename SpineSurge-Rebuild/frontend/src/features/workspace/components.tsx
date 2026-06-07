/* Workspace shared pieces — viewer stage (floating view selector + tool dock + coachmark) and the
   right-panel measurement renderers. Ported from shell.jsx / workspace.jsx. Panels render purely
   from the data passed in (the "tools output measurements → state → panels render" principle); the
   real Cornerstone/VTK viewer + computed values arrive in Steps 7–8. */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { Collapse } from '@/components/primitives';
import { activeCase } from './data';
import type { MeasurementGroup, RefLine } from './data';
import { useWorkspaceStore } from '@/lib/store/workspace';
import { useStudy, useUploadScan } from '@/lib/api/hooks';
import { TOOL_SPECS, isWiredTool } from '@/features/measurements/toolRegistry';
import { AnnotationOverlay } from '@/features/annotations/AnnotationOverlay';
import { ANNOTATION_TOOLS } from '@/features/annotations/annotationTools';
import { ViewportProvider, useViewport } from './viewport';

/* ---------- floating view selector ---------- */
export function ViewSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const tag = value === 'Lateral' ? 'L' : value === 'AP' ? 'AP' : value === '3D' ? '3D' : 'OB';
  return (
    <div className="view-select" ref={ref}>
      <button className="view-select-btn" onClick={() => setOpen((o) => !o)}>
        <span className="vs-tag">{tag}</span>
        {value}
        <Icon name="chevDown" size={15} />
      </button>
      {open && (
        <div className="view-select-menu pop">
          {options.map((o) => (
            <button key={o} className={o === value ? 'on' : ''} onClick={() => { onChange(o); setOpen(false); }}>
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- floating tool dock ---------- */
const DOCK_TOOLS = ['cursor', 'pencil', 'ruler', 'textT', 'eraser', 'sep', 'fullscreen', 'undo', 'redo', 'camera'];
const SELECTABLE = ['cursor', 'pencil', 'ruler', 'textT', 'eraser'];
export function ViewerDock() {
  const [active, setActive] = useState('cursor');
  const triggerCanvasUndo = useWorkspaceStore((s) => (s as any).triggerCanvasUndo);
  const triggerCanvasRedo = useWorkspaceStore((s) => (s as any).triggerCanvasRedo);

  function handle(t: string) {
    if (t === 'undo') return triggerCanvasUndo?.();
    if (t === 'redo') return triggerCanvasRedo?.();
    if (SELECTABLE.includes(t)) setActive(t);
  }
  const disabled = (_t: string) => false;

  return (
    <div className="viewer-dock">
      {DOCK_TOOLS.map((t, i) =>
        t === 'sep' ? (
          <div key={i} className="dock-sep" />
        ) : (
          <button
            key={t}
            className={'dock-btn' + (active === t ? ' on' : '')}
            onClick={() => handle(t)}
            disabled={disabled(t)}
            style={disabled(t) ? { opacity: 0.4, cursor: 'default' } : undefined}
            title={t}
          >
            <Icon name={t} size={18} />
          </button>
        ),
      )}
    </div>
  );
}

/* ---------- coachmark ---------- */
export function GuideCard({ label, text, step = 1, total = 4 }: { label?: string; text: string; step?: number; total?: number }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return (
    <div className="guide-card">
      <div className="guide-eyebrow">
        Step-by-step guide
        <button onClick={() => setClosed(true)} style={{ color: '#fff', display: 'grid' }}>
          <Icon name="close" size={15} />
        </button>
      </div>
      <div className="guide-text">
        {label && <span style={{ opacity: 0.9 }}>[{label}] </span>}
        {text}
      </div>
      <div className="guide-dots">
        {Array.from({ length: total }).map((_, i) => (
          <i key={i} className={i === step - 1 ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}

/* ---------- radiograph surface ----------
   Renders the loaded radiograph (or the empty placeholder) and lets the user load a local image via
   drop or file pick. The real Cornerstone/VTK DICOM viewer replaces this in Step 8; until then a 2D
   image is enough to place measurements against. The image is drawn at its native size under the
   shared viewport transform (translate + scale), so zoom/pan stay consistent with the overlays, which
   map clicks to native image pixels. */
function RadiographSurface({ tag }: { tag?: string | null }) {
  const imageSrc = useWorkspaceStore((s) => s.imageSrc);
  const setImage = useWorkspaceStore((s) => s.setImage);
  const inputRef = useRef<HTMLInputElement>(null);
  const { transform: t } = useViewport();

  // When opened on a real study, persist the dropped X-ray to S3 (so it survives reload + is shared);
  // without a study (e.g. bare /workspace) fall back to a local object URL.
  const { studyId } = useParams();
  const study = useStudy(studyId);
  const patientId = study.data?.patient_id;
  const uploadScan = useUploadScan();

  function load(file: File | undefined | null) {
    if (!file || !file.type.startsWith('image/')) return;
    if (imageSrc && imageSrc.startsWith('blob:')) URL.revokeObjectURL(imageSrc);
    if (studyId && patientId) {
      // Optimistic local preview, then swap to the durable presigned URL on success.
      const localUrl = URL.createObjectURL(file);
      setImage(localUrl);
      uploadScan.mutate(
        { studyId, file, patientId },
        {
          onSuccess: (scan) => {
            if (scan.url) setImage(scan.url);
            URL.revokeObjectURL(localUrl);
          },
        },
      );
    } else {
      setImage(URL.createObjectURL(file));
    }
  }

  return (
    <div
      className="dicom-wrap"
      style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--viewer-bg)' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        load(e.dataTransfer.files?.[0]);
      }}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt="Radiograph"
          draggable={false}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transformOrigin: '0 0',
            transform: `translate(${t.offsetX}px, ${t.offsetY}px) scale(${t.scale})`,
            display: 'block',
            // width/height left intrinsic (native px); the transform maps native→screen.
          }}
        />
      ) : (
        <div
          style={{ width: '100%', height: '100%', background: 'var(--viewer-bg)', display: 'grid', placeItems: 'center', borderRadius: 'inherit', gap: 12 }}
        >
          <button className="btn btn-ghost" style={{ color: '#cfcfd6' }} onClick={() => inputRef.current?.click()}>
            <Icon name="folder" size={16} /> Load X-ray image
          </button>
          <span className="mono" style={{ fontSize: 10, letterSpacing: '.04em', textTransform: 'uppercase', color: '#7a7a82' }}>
            or drop an image here
          </span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => load(e.target.files?.[0])}
      />
      {tag && <span className="modality-tag">{tag}</span>}
      {imageSrc && (
        <button
          className="btn btn-ghost"
          onClick={() => inputRef.current?.click()}
          style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 4, background: 'rgba(17,24,39,0.7)', color: '#fff' }}
        >
          <Icon name="refresh" size={14} /> Change image
        </button>
      )}
    </div>
  );
}

/* ---------- measurement + calibration overlay ----------
   One SVG layer over the stage. In measurement mode (a wired tool armed) it captures the tool's
   points and the store auto-computes via the parity-locked calculator. In calibration mode it
   captures two points of a known real-world distance and asks for the millimetres to derive
   `pixelToMm`. */
function MeasureOverlay() {
  const activeTool = useWorkspaceStore((s) => s.activeTool);
  const draft = useWorkspaceStore((s) => s.draft);
  const addPoint = useWorkspaceStore((s) => s.addPoint);
  const finishMeasurement = useWorkspaceStore((s) => s.finishMeasurement);
  const setActiveTool = useWorkspaceStore((s) => s.setActiveTool);
  const calibrating = useWorkspaceStore((s) => s.calibrating);
  const calibrationPoints = useWorkspaceStore((s) => s.calibrationPoints);
  const pendingPx = useWorkspaceStore((s) => s.pendingCalibrationPx);
  const confirmCalibration = useWorkspaceStore((s) => s.confirmCalibration);
  const cancelCalibration = useWorkspaceStore((s) => s.cancelCalibration);
  const ref = useRef<SVGSVGElement>(null);
  const [mm, setMm] = useState('');
  const { toImage, toScreen, panActive } = useViewport();

  const wired = isWiredTool(activeTool);
  const spec = wired ? TOOL_SPECS[activeTool] : null;
  const interactive = calibrating || wired;
  if (!interactive) return null;

  // Stored points are native image pixels; map to screen for drawing.
  const points = (calibrating ? calibrationPoints : draft).map(toScreen);
  const color = calibrating ? '#f59e0b' : '#3b82f6';

  function place(e: ReactMouseEvent<SVGSVGElement>) {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    addPoint(toImage({ x: e.clientX - r.left, y: e.clientY - r.top }));
  }

  const captureClicks = !panActive && (calibrating ? pendingPx === null : wired);

  return (
    <>
      <svg
        ref={ref}
        onClick={captureClicks ? place : undefined}
        onDoubleClick={spec?.variable ? () => finishMeasurement() : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 5,
          pointerEvents: captureClicks ? 'auto' : 'none',
          cursor: captureClicks ? 'crosshair' : 'default',
        }}
      >
        {points.length > 1 && (
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={1.25}
            strokeDasharray="4 3"
          />
        )}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={5} fill={color} stroke="#fff" strokeWidth={1.5} />
            <text x={p.x + 8} y={p.y - 8} fontSize={11} fill={color} style={{ fontWeight: 600 }}>
              {i + 1}
            </text>
          </g>
        ))}
      </svg>

      {/* calibration mm prompt */}
      {calibrating && pendingPx !== null && (
        <div style={pillStyle} className="pop">
          <span style={{ opacity: 0.85 }}>Known distance:</span>
          <input
            autoFocus
            value={mm}
            onChange={(e) => setMm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                confirmCalibration(Number.parseFloat(mm));
                setMm('');
              }
            }}
            placeholder="mm"
            inputMode="decimal"
            style={{ width: 70, padding: '4px 8px', borderRadius: 6, border: 'none', color: '#111' }}
          />
          <button
            className="btn btn-primary"
            style={{ height: 30 }}
            onClick={() => {
              confirmCalibration(Number.parseFloat(mm));
              setMm('');
            }}
          >
            Set
          </button>
          <button onClick={cancelCalibration} style={{ color: '#fff', display: 'grid', placeItems: 'center', opacity: 0.85 }} title="Cancel calibration">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* status pill */}
      {!(calibrating && pendingPx !== null) && (
        <div style={pillStyle}>
          {calibrating ? (
            <>
              <strong>Calibrate</strong>
              <span style={{ opacity: 0.85 }}>{calibrationPoints.length}/2 points · click a known distance</span>
              <button onClick={cancelCalibration} style={{ color: '#fff', display: 'grid', placeItems: 'center', opacity: 0.85 }} title="Cancel calibration">
                <Icon name="close" size={14} />
              </button>
            </>
          ) : spec ? (
            <>
              <strong>{spec.abbr}</strong>
              <span style={{ opacity: 0.85 }}>
                {spec.variable
                  ? `${draft.length} vertices · ${spec.hint}`
                  : `${draft.length}/${spec.pointsNeeded} points · ${spec.hint}`}
              </span>
              {spec.variable && (
                <button
                  className="btn btn-primary"
                  style={{ height: 28 }}
                  disabled={draft.length < spec.pointsNeeded}
                  onClick={() => finishMeasurement()}
                >
                  Finish
                </button>
              )}
              <button onClick={() => setActiveTool(null)} style={{ color: '#fff', display: 'grid', placeItems: 'center', opacity: 0.85 }} title="Cancel measurement">
                <Icon name="close" size={14} />
              </button>
            </>
          ) : null}
        </div>
      )}
    </>
  );
}

const pillStyle: CSSProperties = {
  position: 'absolute',
  top: 14,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 6,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '7px 12px',
  borderRadius: 999,
  background: 'rgba(17,24,39,0.92)',
  color: '#fff',
  fontSize: 12.5,
  boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
};

/* ---------- viewer stage ---------- */
export function ViewerStage({
  view,
  setView,
  viewOptions,
  tag,
  guide,
}: {
  view?: string;
  setView?: (v: string) => void;
  viewOptions?: string[];
  tag?: string;
  guide?: { label?: string; text: string; step?: number };
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div className="viewer-stage" ref={stageRef} style={{ position: 'relative' }}>
      <ViewportProvider containerRef={stageRef}>
        <RadiographSurface tag={tag} />
        <AnnotationOverlay />
        <MeasureOverlay />
        {setView && view && viewOptions && <ViewSelect value={view} onChange={setView} options={viewOptions} />}
        <ViewerDock />
        <ZoomControls />
        {guide && <GuideCard {...guide} />}
      </ViewportProvider>
    </div>
  );
}

/* ---------- zoom / pan controls (bottom-right of the stage) ---------- */
function ZoomControls() {
  const { transform, ready, panActive, setPanActive, zoomBy, reset } = useViewport();
  if (!ready) return null;
  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: 4,
        borderRadius: 10,
        background: 'rgba(17,24,39,0.82)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      }}
    >
      <button className="dock-btn" title="Zoom out" onClick={() => zoomBy(1 / 1.2)} style={{ color: '#fff' }}>
        <Icon name="minus" size={16} />
      </button>
      <span className="mono" style={{ minWidth: 44, textAlign: 'center', color: '#fff', fontSize: 12 }}>
        {Math.round(transform.scale * 100)}%
      </span>
      <button className="dock-btn" title="Zoom in" onClick={() => zoomBy(1.2)} style={{ color: '#fff' }}>
        <Icon name="plus" size={16} />
      </button>
      <button
        className={'dock-btn' + (panActive ? ' on' : '')}
        title={panActive ? 'Pan: on (drag to move)' : 'Pan'}
        onClick={() => setPanActive(!panActive)}
        style={{ color: '#fff' }}
      >
        <Icon name="hand" size={16} />
      </button>
      <button className="dock-btn" title="Fit to view" onClick={reset} style={{ color: '#fff' }}>
        <Icon name="fullscreen" size={16} />
      </button>
    </div>
  );
}

/* ---------- right panel: live computed measurements (from the workspace store) ---------- */
export function ComputedMeasurements() {
  const measurements = useWorkspaceStore((s) => s.measurements);
  const remove = useWorkspaceStore((s) => s.removeMeasurement);
  if (!measurements.length) return null;
  return (
    <div className="mgroup">
      <div className="mgroup-name">Computed</div>
      {measurements.map((m) =>
        m.rows.map((row, ri) => (
          <div className="mrow" key={m.id + ':' + ri}>
            <span className="ml">{row.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mv angle">{row.display}</span>
              {ri === 0 && (
                <button
                  onClick={() => remove(m.id)}
                  title={`Remove ${m.name}`}
                  style={{ display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </span>
          </div>
        )),
      )}
    </div>
  );
}

/* ---------- right panel: manual annotations (from the workspace store) ---------- */
export function AnnotationList() {
  const annotations = useWorkspaceStore((s) => s.annotations);
  const remove = useWorkspaceStore((s) => s.removeAnnotation);
  if (!annotations.length) return null;
  const label = (kind: string): string =>
    Object.values(ANNOTATION_TOOLS).find((t) => t.kind === kind)?.abbr ?? kind;
  return (
    <div className="mgroup">
      <div className="mgroup-name">Annotations</div>
      {annotations.map((a, i) => (
        <div className="mrow" key={a.id}>
          <span className="ml">
            {label(a.kind)} {a.kind === 'text' && a.text ? `· “${a.text}”` : `#${i + 1}`}
          </span>
          <button
            onClick={() => remove(a.id)}
            title="Remove annotation"
            style={{ display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------- right panel: measurement groups ---------- */
export function MeasurementGroups({ groups }: { groups: MeasurementGroup[] }) {
  const visible = groups.filter((g) => g.items && g.items.length);
  if (!visible.length) {
    return (
      <div className="empty-state">
        <span className="es-ico">
          <Icon name="ruler" size={22} />
        </span>
        <span className="es-t">No measurements yet</span>
        <span className="es-s">Select a measurement tool and start analyzing the image.</span>
      </div>
    );
  }
  return (
    <>
      {visible.map((g, gi) => (
        <div className="mgroup" key={gi}>
          <div className="mgroup-name">{g.name}</div>
          {g.items.map((it, i) => (
            <div key={i}>
              <div className="mrow">
                <span className="ml">
                  {it.dot && <span className={'dot dot-' + it.dot} />}
                  {it.label}
                </span>
                {it.chevron ? (
                  <Icon name="chevRight" size={16} style={{ color: 'var(--text-3)' }} />
                ) : it.value ? (
                  <span className={'mv ' + (it.tone || 'plain')}>{it.value}</span>
                ) : null}
              </div>
              {it.sub && (
                <div className="msub">
                  {it.sub.map((s, si) => (
                    <div className="mrow" key={si}>
                      <span className="ml">{s.label}</span>
                      <span className={'mv ' + (s.tone || 'plain')} style={!s.tone ? { color: 'var(--text-2)' } : undefined}>
                        {s.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export function RefLinesPanel({ lines }: { lines: RefLine[] }) {
  if (!lines || !lines.length) return null;
  return (
    <div className="mgroup">
      <div className="mgroup-name">Reference Lines</div>
      {lines.map((l, i) => (
        <div className="mrow" key={i}>
          <span className="ml">{l.abbr}</span>
          <span className="mv good">{l.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- right panel: case summary ---------- */
export function CaseSummary({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const c = activeCase;
  const rows: [string, string, string][] = [
    ['user', 'Patient Name', c.name],
    ['file', 'MRN', c.mrn],
    ['clock', 'Age', c.age + ' yrs'],
    ['user', 'Sex', c.sex === 'M' ? 'Male' : 'Female'],
    ['sliders', 'Height', c.height + ' cm'],
    ['sliders', 'Weight', c.weight + ' kg'],
  ];
  return (
    <Collapse title="Case Summary" defaultOpen={defaultOpen}>
      <div className="cs-row" style={{ paddingTop: 0 }}>
        <span className="csl">Study Imported</span>
        <span className="csv" style={{ color: 'var(--text-2)' }}>
          <Icon name="calendar" size={15} /> {c.imported}
        </span>
      </div>
      {rows.map((r, i) => (
        <div className="cs-row" key={i} style={{ borderTop: '1px solid var(--border)' }}>
          <span className="csl">
            <Icon name={r[0]} size={16} /> {r[1]}
          </span>
          <span className="csv">
            {r[2]}{' '}
            <button className="cs-edit">
              <Icon name="edit" size={15} />
            </button>
          </span>
        </div>
      ))}
    </Collapse>
  );
}

/* ---------- generic right-panel wrapper used by Planning ---------- */
export function PanelScroll({ children }: { children: ReactNode }) {
  return <div className="ws-panel-scroll">{children}</div>;
}
