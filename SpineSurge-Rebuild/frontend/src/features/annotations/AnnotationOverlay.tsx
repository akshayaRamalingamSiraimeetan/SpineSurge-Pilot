/* Manual annotation overlay (Step 7c).
 *
 * One SVG layer over the radiograph that (1) always renders the saved annotations from the workspace
 * store and (2) when a Manual-tab tool is armed, captures input and commits a new annotation. Capture
 * style depends on the tool: discrete clicks (line/angle/circle/ellipse/polygon), freehand drag (pen),
 * or a click-then-text prompt (annotation). Display-pixel coords, matching the measurement overlay —
 * calibration absorbs the display scale and the points persist verbatim. */
import { useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { Icon } from '@/components/Icon';
import { useWorkspaceStore } from '@/lib/store/workspace';
import type { Annotation } from '@/lib/store/workspace';
import type { Point } from '@/lib/canvas/GeometryUtils';
import { useViewport } from '@/features/workspace/viewport';
import {
  ANNOTATION_TOOLS,
  isAnnotationTool,
  angleFromHorizontal,
  angleAtVertex,
} from './annotationTools';

const COLOR = '#22d3ee';

export function AnnotationOverlay() {
  const activeTool = useWorkspaceStore((s) => s.activeTool);
  const annotations = useWorkspaceStore((s) => s.annotations);
  const addAnnotation = useWorkspaceStore((s) => s.addAnnotation);
  const setActiveTool = useWorkspaceStore((s) => s.setActiveTool);
  const ref = useRef<SVGSVGElement>(null);
  const { toImage, toScreen, panActive } = useViewport();

  // Drafts/strokes are kept in native image coords (like committed annotations); mapped to screen at render.
  const [draft, setDraft] = useState<Point[]>([]);
  const [penPts, setPenPts] = useState<Point[] | null>(null); // non-null while dragging the pen
  const [textAt, setTextAt] = useState<Point | null>(null); // image coords
  const [textValue, setTextValue] = useState('');

  const spec = isAnnotationTool(activeTool) ? ANNOTATION_TOOLS[activeTool] : null;
  const armed = !!spec && !panActive;

  const at = (e: ReactMouseEvent<SVGSVGElement>): Point => {
    const r = ref.current!.getBoundingClientRect();
    return toImage({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const commit = (a: Omit<Annotation, 'id' | 'timestamp'>) => addAnnotation(a);

  const onClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!spec || spec.freehand) return;
    const p = at(e);
    if (spec.text) {
      setTextAt(p);
      setTextValue('');
      return;
    }
    const next = [...draft, p];
    if (!spec.variable && next.length >= spec.pointsNeeded) {
      commit({ kind: spec.kind, points: next, color: COLOR });
      setDraft([]);
      return;
    }
    setDraft(next);
  };

  const finishPolygon = () => {
    if (spec?.variable && draft.length >= spec.pointsNeeded) {
      commit({ kind: spec.kind, points: draft, color: COLOR });
      setDraft([]);
    }
  };

  // pen freehand drag
  const onDown = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!spec?.freehand) return;
    setPenPts([at(e)]);
  };
  const onMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!spec?.freehand || !penPts) return;
    setPenPts([...penPts, at(e)]);
  };
  const onUp = () => {
    if (!spec?.freehand || !penPts) return;
    if (penPts.length >= 2) commit({ kind: 'pen', points: penPts, color: COLOR });
    setPenPts(null);
  };

  const submitText = () => {
    if (textAt && textValue.trim()) commit({ kind: 'text', points: [textAt], text: textValue.trim(), color: COLOR });
    setTextAt(null);
    setTextValue('');
  };

  return (
    <>
      <svg
        ref={ref}
        onClick={armed ? onClick : undefined}
        onDoubleClick={spec?.variable ? finishPolygon : undefined}
        onMouseDown={spec?.freehand ? onDown : undefined}
        onMouseMove={spec?.freehand ? onMove : undefined}
        onMouseUp={spec?.freehand ? onUp : undefined}
        onMouseLeave={spec?.freehand ? onUp : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 4,
          pointerEvents: armed ? 'auto' : 'none',
          cursor: armed ? 'crosshair' : 'default',
        }}
      >
        {annotations.map((a) => (
          <AnnotationShape key={a.id} a={a} pts={a.points.map(toScreen)} />
        ))}
        {penPts && penPts.length > 1 && (
          <polyline points={penPts.map(toScreen).map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={COLOR} strokeWidth={2} />
        )}
        {draft.length > 0 && <DraftPreview pts={draft.map(toScreen)} />}
      </svg>

      {/* text entry prompt (positioned at the screen projection of the placed image point) */}
      {textAt && (
        <div className="pop" style={textPrompt(toScreen(textAt))}>
          <input
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitText();
              if (e.key === 'Escape') {
                setTextAt(null);
                setTextValue('');
              }
            }}
            placeholder="Note…"
            style={{ width: 160, padding: '5px 8px', borderRadius: 6, border: 'none', color: '#111' }}
          />
          <button className="btn btn-primary" style={{ height: 30 }} onClick={submitText}>
            Add
          </button>
        </div>
      )}

      {/* status pill while a manual tool is armed */}
      {spec && (
        <div style={pill}>
          <strong>{spec.abbr}</strong>
          <span style={{ opacity: 0.85 }}>
            {spec.variable ? `${draft.length} vertices · ${spec.hint}` : spec.hint}
          </span>
          {spec.variable && (
            <button className="btn btn-primary" style={{ height: 28 }} disabled={draft.length < spec.pointsNeeded} onClick={finishPolygon}>
              Finish
            </button>
          )}
          <button onClick={() => { setActiveTool(null); setDraft([]); }} style={{ color: '#fff', display: 'grid', placeItems: 'center', opacity: 0.85 }} title="Cancel">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </>
  );
}

/* ---- rendering of a committed annotation (points already mapped to screen space) ---- */
function AnnotationShape({ a, pts }: { a: Annotation; pts: Point[] }) {
  const c = a.color;
  const p = pts;
  switch (a.kind) {
    case 'line':
      return p.length >= 2 ? <line x1={p[0].x} y1={p[0].y} x2={p[1].x} y2={p[1].y} stroke={c} strokeWidth={2} /> : null;
    case 'pen':
      return <polyline points={p.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={c} strokeWidth={2} />;
    case 'polygon':
      return <polygon points={p.map((q) => `${q.x},${q.y}`).join(' ')} fill={`${c}22`} stroke={c} strokeWidth={2} />;
    case 'circle': {
      if (p.length < 2) return null;
      const r = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      return <circle cx={p[0].x} cy={p[0].y} r={r} fill="none" stroke={c} strokeWidth={2} />;
    }
    case 'ellipse': {
      if (p.length < 2) return null;
      return (
        <ellipse
          cx={(p[0].x + p[1].x) / 2}
          cy={(p[0].y + p[1].y) / 2}
          rx={Math.abs(p[1].x - p[0].x) / 2}
          ry={Math.abs(p[1].y - p[0].y) / 2}
          fill="none"
          stroke={c}
          strokeWidth={2}
        />
      );
    }
    case 'angle2': {
      if (p.length < 2) return null;
      return (
        <g>
          <line x1={p[0].x} y1={p[0].y} x2={p[1].x} y2={p[1].y} stroke={c} strokeWidth={2} />
          <AngleLabel at={p[1]} text={`${angleFromHorizontal(p[0], p[1]).toFixed(1)}°`} color={c} />
        </g>
      );
    }
    case 'angle3': {
      if (p.length < 3) return null;
      return (
        <g>
          <polyline points={`${p[0].x},${p[0].y} ${p[1].x},${p[1].y} ${p[2].x},${p[2].y}`} fill="none" stroke={c} strokeWidth={2} />
          <AngleLabel at={p[1]} text={`${angleAtVertex(p[0], p[1], p[2]).toFixed(1)}°`} color={c} />
        </g>
      );
    }
    case 'text':
      return p.length ? (
        <g>
          <circle cx={p[0].x} cy={p[0].y} r={3} fill={c} />
          <text x={p[0].x + 8} y={p[0].y - 6} fontSize={13} fill={c} style={{ fontWeight: 600 }}>
            {a.text}
          </text>
        </g>
      ) : null;
    default:
      return null;
  }
}

function AngleLabel({ at, text, color }: { at: Point; text: string; color: string }) {
  return (
    <text x={at.x + 8} y={at.y - 8} fontSize={12} fill={color} style={{ fontWeight: 600 }}>
      {text}
    </text>
  );
}

/* ---- in-progress preview (points + connecting guide) ---- */
function DraftPreview({ pts }: { pts: Point[] }) {
  return (
    <g>
      {pts.length > 1 && (
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={COLOR} strokeWidth={1.5} strokeDasharray="4 3" />
      )}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={5} fill={COLOR} stroke="#fff" strokeWidth={1.5} />
      ))}
    </g>
  );
}

const pill: CSSProperties = {
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

const textPrompt = (p: Point): CSSProperties => ({
  position: 'absolute',
  left: Math.max(8, p.x),
  top: Math.max(8, p.y),
  zIndex: 7,
  display: 'flex',
  gap: 6,
  padding: 6,
  borderRadius: 8,
  background: 'rgba(17,24,39,0.92)',
  boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
});
