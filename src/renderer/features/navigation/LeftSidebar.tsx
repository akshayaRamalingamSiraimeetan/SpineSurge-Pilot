/**
 * LeftSidebar — Measurement Tools panel.
 *
 * Layout per screenshots:
 *   - "Measurement Tools" header
 *   - A / D / P / M tile switcher (Alignment, Deformity, Pathology, Manual/Generic)
 *   - Coronal / Sagittal toggle (Deformity tab only)
 *   - Tool list with icon glyphs + name + description
 *   - Calibration button
 *   - Reference Lines section with green dot indicators
 *
 * Tab mapping per screenshots:
 *   A = Alignment   → Cobb · Pelvis · PI-LL · SVA · TK · LL · CL
 *   D = Deformity   → Coronal: CMC · TS · AVT · RVAD · PO · VBM
 *                  → Sagittal: TPA · SSA · SPA · T1SPi · T9SPi · ODHA · CBVA
 *   P = Pathology   → Canal Area (stenosis) · Spondylolisthesis
 *   M = Manual      → Line · Pen · Text · 2Pt · 3Pt · 4Pt · Circle · Ellipse · Polygon
 *
 * Planning tools are in a separate Planning tab (P in A/D/P/M is Pathology).
 * The app nav rail is rendered separately in MainLayout (DashboardSidebar / TopMenuBar).
 */
import { useState, useMemo } from 'react';
import { Scale } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/lib/store/index';
import { useLocation } from 'react-router-dom';

/* ── Planning sub-tab ──────────────────────────────────────── */
type PlanningTab = 'target' | 'simulation';

/** Minimal display-name map reused from RightSidebar constants. */
const TC_DISPLAY_NAMES: Record<string, string> = {
  'cobb':     'Cobb Angle',
  'sva':      'SVA',
  'pi_ll':    'PI-LL Mismatch',
  'cl':       'Cervical Lordosis (CL)',
  'tk':       'Thoracic Kyphosis (TK)',
  'll':       'Lumbar Lordosis (LL)',
  'pelvis':   'Pelvic Parameters',
  'stenosis': 'Canal Area',
  'spondy':   'Spondylolisthesis',
  'line':     'Distance Line',
  'ts':       'Trunk Shift',
  'avt':      'Apical Vert. Translation',
  'rvad':     'RVAD',
  'po':       'Pelvic Obliquity',
  'tpa':      'TPA',
  'spa':      'SPA',
  'ssa':      'SSA',
  't1spi':    'T1SPi',
  't9spi':    'T9SPi',
  'odha':     'ODHA',
  'cbva':     'CBVA',
  'cmc':      'Cobb Multi-Curve',
  'pi':       'Pelvic Incidence (PI)',
  'pt':       'Pelvic Tilt (PT)',
  'ss':       'Sacral Slope (SS)',
  'sc':       'Custom Curve',
  'vbm':      'Vertebral Body Metrics',
  'ost-pso':  'PSO',
  'ost-spo':  'SPO',
  'ost-resect':'Resection Plan',
  'ost-open': 'Opening Wedge',
};

/**
 * Derive a concise, human-readable current-value string for a measurement.
 * Mirrors the core logic of `formatValue` in RightSidebar without calibration
 * (calibration is a display concern the user sees in Current Measurements).
 */
function tcFormatValue(m: any): string {
  if (['ost-pso','ost-spo','ost-open','ost-resect'].includes(m.toolKey)) {
    const existing = typeof m.result === 'string' ? m.result : '';
    if (existing && existing !== 'Planning...') return existing.split('\n')[0];
    if (Array.isArray(m.points) && m.points.length >= 3) {
      const p = m.points[0], h = m.points[1], a = m.points[2];
      const mov = Math.atan2(p.y - h.y, p.x - h.x);
      const fix = Math.atan2(a.y - h.y, a.x - h.x);
      const norm = ((fix - mov + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      return `${Math.abs(norm * 180 / Math.PI).toFixed(1)}°`;
    }
    return '—';
  }
  if (['vbm','spondy','pelvis','pi_ll','cmc','rvad'].includes(m.toolKey)) {
    if (typeof m.result === 'string' && m.result) {
      // Return just the first line as a compact summary
      return m.result.split('\n')[0] || 'Metrics';
    }
    return 'Metrics';
  }
  if (typeof m.result === 'string' && m.result && m.result !== 'Planning...') {
    return m.result.split('\n')[0];
  }
  return '—';
}

/** Determine the accent colour for a value string (mirrors MeasurementCard). */
function tcValueColor(val: string): string {
  if (val.includes('°')) return 'var(--val-bad)';
  if (val.includes('mm')) return 'var(--val-good)';
  return 'var(--text-2)';
}

/* ── Types ─────────────────────────────────────────────────── */
type TabKey = 'alignment' | 'extended' | 'morphology' | 'generic' | 'planning';
type Plane = 'coronal' | 'sagittal';

interface ToolDef {
  id: string;
  abbr: string;
  label: string;
  desc: string;
}

interface RefLineDef {
  id: string;
  abbr: string;
  label: string;
}

interface SectionDef {
  title?: string;
  tools: ToolDef[];
}

interface TabDef {
  key: TabKey;
  short: string;
  label: string;
  planes?: boolean;
  sections?: SectionDef[];
  coronal?: SectionDef[];
  sagittal?: SectionDef[];
  refLines?: RefLineDef[];
  coronalRefLines?: RefLineDef[];
  sagittalRefLines?: RefLineDef[];
}

/* ── Tool catalog ─────────────────────────────────────────── */
const TABS: TabDef[] = [
  {
    key: 'alignment',
    short: 'A',
    label: 'Alignment',
    sections: [
      {
        tools: [
          { id: 'cobb',   abbr: 'Cobb',   label: 'Cobb Angle',             desc: 'Coronal/sagittal Cobb angle' },
          { id: 'pelvis', abbr: 'Pelvis', label: 'Pelvic Parameters',      desc: 'PI / PT / SS' },
          { id: 'pi_ll',  abbr: 'PI-LL',  label: 'PI-LL Mismatch',         desc: 'Pelvic incidence minus lumbar lordosis' },
          { id: 'sva',    abbr: 'SVA',    label: 'Sagittal Vertical Axis', desc: 'C7 plumb line horizontal offset' },
          { id: 'tk',     abbr: 'TK',     label: 'Thoracic Kyphosis',      desc: 'Sagittal curvature T4–T12' },
          { id: 'll',     abbr: 'LL',     label: 'Lumbar Lordosis',        desc: 'Sagittal curvature L1–S1' },
          { id: 'cl',     abbr: 'CL',     label: 'Cervical Lordosis',      desc: 'Sagittal curvature C2–C7' },
        ],
      },
    ],
  },
  {
    key: 'extended',
    short: 'E',
    label: 'Extended',
    planes: true,
    coronal: [
      {
        title: 'Curvature',
        tools: [
          { id: 'cobb',  abbr: 'Cobb', label: 'Cobb Angle',              desc: 'Coronal Cobb angle' },
          { id: 'cmc',   abbr: 'CMC',  label: 'Cobb Multi-Curve',        desc: 'Multiple coronal Cobb angles' },
          { id: 'rvad',  abbr: 'RVAD', label: 'Rib Vertebral Angle Diff',desc: 'Rib-vertebra angle asymmetry' },
        ],
      },
      {
        title: 'Balance',
        tools: [
          { id: 'ts',    abbr: 'TS',   label: 'Trunk Shift',             desc: 'Lateral trunk displacement' },
          { id: 'avt',   abbr: 'AVT',  label: 'Apical Vertebral Tilt',   desc: 'Apical vertebra shift from CSVL' },
          { id: 'po',    abbr: 'PO',   label: 'Pelvic Obliquity',        desc: 'Pelvic tilt in coronal plane' },
        ],
      },
    ],
    sagittal: [
      {
        title: 'Global',
        tools: [
          { id: 'tpa',   abbr: 'TPA',   label: 'T1 Pelvic Angle',            desc: 'Global sagittal alignment' },
          { id: 'spa',   abbr: 'SPA',   label: 'Spinopelvic Angle',          desc: 'Angular relationship spine to pelvis' },
          { id: 'ssa',   abbr: 'SSA',   label: 'Spinosacral Angle',          desc: 'Sacrum to C7 sagittal axis' },
          { id: 't1spi', abbr: 'T1SPi', label: 'T1 Spinopelvic Inclination', desc: 'T1 inclination relative to pelvis' },
          { id: 't9spi', abbr: 'T9SPi', label: 'T9 Spinopelvic Inclination', desc: 'T9 mid-thoracic balance' },
          { id: 'odha',  abbr: 'ODHA',  label: 'Odontoid Hip Axis Angle',    desc: 'Head-to-pelvis alignment' },
        ],
      },
      {
        title: 'Regional',
        tools: [
          { id: 'cbva',  abbr: 'CBVA',  label: 'Chin Brow Vertical Angle',   desc: 'Horizontal gaze measurement' },
        ],
      },
    ],
    coronalRefLines: [
      { id: 'csvl', abbr: 'CSVL', label: 'Coronal Sacral Vertical Line' },
      { id: 'c7pl', abbr: 'C7PL', label: 'C7 Plumb Line' },
    ],
    sagittalRefLines: [
      { id: 'c7pl', abbr: 'C7PL', label: 'C7 Plumb Line' },
      { id: 'csvl', abbr: 'SVL',  label: 'Sagittal Vertical Line' },
    ],
  },
  {
    key: 'morphology',
    short: 'M',
    label: 'Morphology',
    sections: [
      {
        tools: [
          { id: 'vbm',      abbr: 'VBM',   label: 'Vertebral Body Metrics',desc: 'Height, wedge angle, endplate lengths' },
          { id: 'stenosis', abbr: 'Canal', label: 'Canal Area',            desc: 'Spinal canal stenosis measurement' },
          { id: 'spondy',   abbr: 'Spondy',label: 'Spondylolisthesis',     desc: 'Vertebral slip % and grade' },
        ],
      },
    ],
  },
  {
    key: 'generic',
    short: 'G',
    label: 'Generic',
    sections: [
      {
        tools: [
          { id: 'line',      abbr: 'Line', label: 'Line',           desc: 'Straight distance measurement' },
          { id: 'pencil',    abbr: 'Pen',  label: 'Pen',            desc: 'Freehand drawing' },
          { id: 'text',      abbr: 'Text', label: 'Text',           desc: 'Text annotation' },
          { id: 'angle-2pt', abbr: '2Pt',  label: '2 Point Angle',  desc: 'Angle from two points' },
          { id: 'angle-3pt', abbr: '3Pt',  label: '3 Point Angle',  desc: 'Angle at vertex' },
          { id: 'angle-4pt', abbr: '4Pt',  label: '4 Point Angle',  desc: 'Cobb-style 4-point angle' },
          { id: 'circle',    abbr: 'Circ', label: 'Circle',         desc: 'Circle with area/diameter' },
          { id: 'ellipse',   abbr: 'Ell',  label: 'Ellipse',        desc: 'Ellipse measurement' },
          { id: 'polygon',   abbr: 'Poly', label: 'Polygon',        desc: 'Polygon area/perimeter' },
        ],
      },
    ],
  },
  {
    key: 'planning',
    short: 'P',
    label: 'Planning',
    sections: [
      {
        title: 'Osteotomy',
        tools: [
          { id: 'ost-pso',    abbr: 'PSO',    label: 'PSO',       desc: 'Pedicle Subtraction Osteotomy' },
          { id: 'ost-spo',    abbr: 'SPO',    label: 'SPO',       desc: 'Smith-Petersen Osteotomy' },
          { id: 'ost-resect', abbr: 'Resect', label: 'Resect',    desc: 'Bone resection planning' },
          { id: 'ost-open',   abbr: 'Open',   label: 'Open',      desc: 'Opening Wedge Osteotomy' },
        ],
      },
      {
        title: 'Instruments',
        tools: [
          { id: 'screw',     abbr: 'Screw',   label: 'Screw',     desc: 'Place pedicle screw' },
          { id: 'rod',       abbr: 'Rod',     label: 'Rod',       desc: 'Place spinal rod' },
          { id: 'cage',      abbr: 'Cage',    label: 'Cage',      desc: 'Place interbody cage' },
          { id: 'itilt',     abbr: 'UIV/LIV', label: 'UIV/LIV',   desc: 'Instrumented Tilt (UIV/LIV)' },
        ],
      },
    ],
  },
];

/* ── Single tool row ─────────────────────────────────────────── */
function ToolRow({ tool, active, onClick }: { tool: ToolDef; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '10px 12px',
        borderRadius: 10,
        border: active ? '1px solid var(--accent-soft-2, #371A16)' : '1px solid transparent',
        background: active ? 'var(--accent-soft)' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background .12s, border-color .12s',
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 36,
          height: 36,
          borderRadius: 8,
          background: active ? 'var(--accent)' : 'var(--surface-3)',
          color: active ? '#fff' : 'var(--text-2)',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: tool.abbr.length > 4 ? 8 : tool.abbr.length > 3 ? 9 : tool.abbr.length > 2 ? 10 : 11,
          fontWeight: 700,
          flexShrink: 0,
          lineHeight: 1,
          transition: 'background .12s, color .12s',
        }}
      >
        {tool.abbr.length > 5 ? tool.abbr.slice(0, 4) : tool.abbr}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 600,
          color: active ? 'var(--accent)' : 'var(--text)',
          lineHeight: 1.3,
        }}>
          {tool.abbr !== tool.label ? tool.abbr : tool.label}
        </span>
        <span style={{
          display: 'block',
          fontSize: 11,
          color: 'var(--text-3)',
          marginTop: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {tool.label}
        </span>
      </span>
    </button>
  );
}

/* ── Reference line row (green dot) ─────────────────────────── */
function RefLineRow({ refLine, active, onClick }: { refLine: RefLineDef; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 12px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        borderRadius: 8,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: active ? 'var(--success)' : 'var(--border-strong)',
        flexShrink: 0,
        transition: 'background .12s',
      }} />
      {/* Small spine-like icon area */}
      <span style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: 'var(--surface-3)',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        color: 'var(--text-3)',
        fontSize: 8,
        fontWeight: 700,
        fontFamily: 'var(--font-mono, monospace)',
      }}>
        {refLine.abbr.slice(0, 4)}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
          {refLine.abbr}
        </span>
        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {refLine.label}
        </span>
      </span>
    </button>
  );
}

/* ── Main LeftSidebar ────────────────────────────────────────── */
const LeftSidebar = () => {
  const { activeTool, setActiveTool, measurements, canvas } = useAppStore();
  const location = useLocation();
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isPlanningMode = queryParams.get('tab') === 'planning';

  const [activeTab, setActiveTab] = useState<TabKey>('alignment');
  const [plane, setPlane] = useState<Plane>('coronal');

  /* ── Planning sub-tabs ──────────────────────────────────── */
  const [planningTab, setPlanningTab] = useState<PlanningTab>('target');

  /** Target values keyed by measurement id — purely local, session-lived. */
  const [targetValues, setTargetValues] = useState<Record<string, string>>({});
  const setTarget = (id: string, val: string) =>
    setTargetValues((prev) => ({ ...prev, [id]: val }));

  /**
   * Measurements that are checked (selected) in Current Measurements panel
   * and are not calibration markers or reference lines.
   */
  const REF_LINE_KEYS = new Set(['c7pl', 'csvl']);
  const checkedMeasurements = useMemo(() =>
    measurements.filter(
      (m: any) =>
        m.selected &&
        !m?.measurement?.isCalibration &&
        !REF_LINE_KEYS.has(m.toolKey),
    ),
    [measurements],
  );

  const pixelToMm = canvas?.pixelToMm ?? null;
  void pixelToMm; // reserved for future calibration-aware display

  const currentTabKey = isPlanningMode ? 'planning' : activeTab;
  const tab = TABS.find((t) => t.key === currentTabKey)!;

  const sections: SectionDef[] = tab.planes
    ? (plane === 'coronal' ? tab.coronal! : tab.sagittal!)
    : (tab.sections ?? []);

  const refLines: RefLineDef[] = tab.planes
    ? (plane === 'coronal' ? (tab.coronalRefLines ?? []) : (tab.sagittalRefLines ?? []))
    : (tab.refLines ?? []);

  const handleTool = (id: string) => setActiveTool(activeTool === id ? null : id);

  return (
    <div
      style={{
        width: 272,
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* ── Panel header ─────────────────────────────────────── */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          {isPlanningMode ? 'Planning Tools' : 'Measurement Tools'}
        </div>

        {/* ── Planning sub-tab switcher ─────────────────────── */}
        {isPlanningMode && (
          <div style={{
            display: 'flex',
            gap: 4,
            background: 'var(--surface-3)',
            padding: 3,
            borderRadius: 10,
            marginBottom: 4,
          }}>
            {([
              { key: 'target' as PlanningTab, num: 1, label: 'Target Correction' },
              { key: 'simulation' as PlanningTab, num: 2, label: 'Simulation' },
            ] as const).map((t) => {
              const active = planningTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setPlanningTab(t.key)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    padding: '7px 6px',
                    borderRadius: 7,
                    border: 'none',
                    cursor: 'pointer',
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--text-2)',
                    fontSize: 11.5,
                    fontWeight: 700,
                    transition: 'all .14s',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.2,
                  }}
                >
                  <span style={{
                    display: 'inline-grid',
                    placeItems: 'center',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: active ? 'rgba(255,255,255,0.25)' : 'var(--surface)',
                    color: active ? '#fff' : 'var(--accent)',
                    fontSize: 9,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}>
                    {t.num}
                  </span>
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {/* A / E / M / G tiles */}
        {!isPlanningMode && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {TABS.slice(0, 4).map((t) => (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setActiveTool(null); }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  padding: '8px 4px 6px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  background: activeTab === t.key ? 'var(--accent-soft)' : 'transparent',
                  boxShadow: activeTab === t.key ? 'inset 0 -2px 0 var(--accent)' : 'none',
                  transition: 'all .14s',
                }}
                onMouseEnter={(e) => { if (activeTab !== t.key) (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
                onMouseLeave={(e) => { if (activeTab !== t.key) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: activeTab === t.key ? 'var(--accent)' : 'var(--text-2)',
                  lineHeight: 1,
                }}>
                  {t.short}
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: activeTab === t.key ? 'var(--accent)' : 'var(--text-3)',
                  lineHeight: 1.2,
                }}>
                  {t.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Coronal / Sagittal toggle */}
        {!isPlanningMode && tab.planes && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
            border: '1px solid var(--border-2)',
            borderRadius: 8,
            overflow: 'hidden',
            marginTop: 10,
          }}>
            {(['coronal', 'sagittal'] as Plane[]).map((p) => (
              <button
                key={p}
                onClick={() => setPlane(p)}
                style={{
                  padding: '8px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: plane === p ? 'var(--accent)' : 'var(--text-2)',
                  background: plane === p ? 'var(--accent-soft)' : 'var(--surface)',
                  border: 'none',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all .14s',
                }}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Scrollable content ────────────────────────────────── */}
      <ScrollArea style={{ flex: 1 }}>

        {/* ── Target Correction panel (planning mode only) ───── */}
        {isPlanningMode && planningTab === 'target' && (
          <div style={{ padding: '12px 12px 16px' }}>

            {/* Hint */}
            <div style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: 'var(--text-3)',
              marginBottom: 10,
            }}>
              Alignment Goals
            </div>

            {checkedMeasurements.length === 0 ? (
              /* Empty state */
              <div style={{
                textAlign: 'center',
                padding: '32px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}>
                <div style={{ fontSize: 26, opacity: 0.4 }}>🎯</div>
                <div style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text)' }}>
                  No measurements selected
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>
                  Check measurements in the{' '}
                  <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>Current Measurements</span>
                  {' '}panel on the right to set targets here.
                </div>
              </div>
            ) : (
              /* Rows — one per checked measurement */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {checkedMeasurements.map((m: any) => {
                  const name = TC_DISPLAY_NAMES[m.toolKey] ?? m.toolKey.toUpperCase();
                  const currentVal = tcFormatValue(m);
                  const currentColor = tcValueColor(currentVal);
                  const targetVal = targetValues[m.id] ?? '';

                  return (
                    <div
                      key={m.id}
                      style={{
                        background: 'var(--surface-2)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        marginBottom: 6,
                      }}
                    >
                      {/* Measurement name */}
                      <div style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--text)',
                        marginBottom: 8,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {name}
                      </div>

                      {/* Current / Target row */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        {/* Current */}
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: 9,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '.06em',
                            color: 'var(--text-3)',
                            marginBottom: 3,
                          }}>
                            Current
                          </div>
                          <div style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: currentColor,
                            lineHeight: 1.2,
                          }}>
                            {currentVal}
                          </div>
                        </div>

                        {/* Arrow */}
                        <div style={{
                          color: 'var(--text-3)',
                          fontSize: 16,
                          paddingBottom: 2,
                          flexShrink: 0,
                        }}>→</div>

                        {/* Target */}
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: 9,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '.06em',
                            color: 'var(--text-3)',
                            marginBottom: 3,
                          }}>
                            Target
                          </div>
                          <input
                            type="text"
                            value={targetVal}
                            onChange={(e) => setTarget(m.id, e.target.value)}
                            placeholder="e.g. 10°"
                            style={{
                              width: '100%',
                              background: 'var(--surface)',
                              border: '1px solid var(--border-2)',
                              borderRadius: 6,
                              padding: '4px 7px',
                              fontSize: 13,
                              fontWeight: 700,
                              color: 'var(--accent)',
                              outline: 'none',
                              boxSizing: 'border-box',
                            }}
                            onFocus={(e) => {
                              (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent)';
                            }}
                            onBlur={(e) => {
                              (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border-2)';
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Simulation tool list (unchanged) ─────────────── */}
        {(!isPlanningMode || planningTab === 'simulation') && (
          <div style={{ padding: '8px 8px' }}>
            {sections.map((section, idx) => (
              <div key={idx}>
                {section.title && (
                  <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    color: 'var(--text-3)',
                    padding: '8px 12px 4px',
                  }}>
                    {section.title}
                  </div>
                )}
                {section.tools.map((tool) => (
                  <ToolRow
                    key={tool.id}
                    tool={tool}
                    active={activeTool === tool.id}
                    onClick={() => handleTool(tool.id)}
                  />
                ))}
              </div>
            ))}

            {/* Calibration button (measurement mode only) */}
            {!isPlanningMode && (
              <div style={{ padding: '10px 4px 4px' }}>
                <button
                  onClick={() => handleTool('calibration')}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    height: 40,
                    borderRadius: 8,
                    border: `1px solid ${activeTool === 'calibration' ? 'var(--accent)' : 'var(--accent-soft-2, #371A16)'}`,
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all .14s',
                  }}
                >
                  <Scale size={15} />
                  {activeTool === 'calibration' ? 'Click two points…' : 'Calibration'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Reference Lines section ───────────────────────── */}
        {!isPlanningMode && refLines.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px 8px',
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
                Reference Lines
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'var(--success-soft, #112A1D)',
                color: 'var(--success)',
                border: '1px solid var(--success)',
              }}>
                Active
              </span>
            </div>
            <div style={{ padding: '0 4px 12px' }}>
              {refLines.map((rl) => (
                <RefLineRow
                  key={rl.id}
                  refLine={rl}
                  active={activeTool === rl.id}
                  onClick={() => handleTool(rl.id)}
                />
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default LeftSidebar;
