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
import { useState } from 'react';
import { Scale } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/lib/store/index';

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
        title: 'Osteotomies',
        tools: [
          { id: 'ost-pso',   abbr: 'PSO',    label: 'Pedicle Subtraction',  desc: 'Pedicle Subtraction Osteotomy' },
          { id: 'ost-spo',   abbr: 'SPO',    label: 'Smith-Petersen',       desc: 'Smith-Petersen Osteotomy' },
          { id: 'ost-open',  abbr: 'Open',   label: 'Opening Wedge',        desc: 'Opening Wedge Osteotomy' },
          { id: 'ost-resect',abbr: 'Resect', label: 'Resection',            desc: 'Bone resection planning' },
        ],
      },
      {
        title: 'Implants',
        tools: [
          { id: 'screw',     abbr: 'Screw',  label: 'Pedicle Screw',        desc: 'Place pedicle screw' },
          { id: 'rod',       abbr: 'Rod',    label: 'Spinal Rod',           desc: 'Place spinal rod' },
          { id: 'cage',      abbr: 'Cage',   label: 'Interbody Cage',       desc: 'Place interbody cage' },
          { id: 'plate',     abbr: 'Plate',  label: 'Spinal Plate',         desc: 'Place spinal plate' },
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
  const { activeTool, setActiveTool } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabKey>('alignment');
  const [plane, setPlane] = useState<Plane>('coronal');

  const tab = TABS.find((t) => t.key === activeTab)!;

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
          Measurement Tools
        </div>

        {/* A / D / P / M tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {TABS.map((t) => (
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

        {/* Coronal / Sagittal toggle */}
        {tab.planes && (
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

      {/* ── Scrollable tool list ──────────────────────────────── */}
      <ScrollArea style={{ flex: 1 }}>
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

          {/* Calibration button */}
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
        </div>

        {/* ── Reference Lines section ───────────────────────── */}
        {refLines.length > 0 && (
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

        {/* No ref lines for alignment/pathology/manual — show nothing */}
      </ScrollArea>
    </div>
  );
};

export default LeftSidebar;
