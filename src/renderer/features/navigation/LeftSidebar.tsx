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
import { Scale, Box, Layers, HelpCircle, ChevronLeft } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/lib/store/index';
import { Button } from '@/components/ui/button';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { GripVertical, Eye, EyeOff, LayoutTemplate } from 'lucide-react';
import { getDefaultReportConfig } from '../report/defaultConfig';
import { useTheme } from '@/components/theme-provider';
import {
  computeTargets,
  classifyValue,
  extractNumericValue,
  STATUS_COLORS,
  STATUS_LABELS,
  type TargetStatus,
} from '@/lib/spinalTargets';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

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
          { id: 'imp-screw', abbr: 'Screw',   label: 'Screw',     desc: 'Place pedicle screw' },
          { id: 'imp-rod',   abbr: 'Rod',     label: 'Rod',       desc: 'Place spinal rod' },
          { id: 'imp-cage',  abbr: 'Cage',    label: 'Cage',      desc: 'Place interbody cage' },
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

const SPINAL_LEVELS = [
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7',
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
  'L1', 'L2', 'L3', 'L4', 'L5',
  'S1', 'S2',
];

const ScrewIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="3" y1="13" x2="13" y2="3" />
    <line x1="10" y1="3" x2="13" y2="3" />
    <line x1="13" y1="6" x2="13" y2="3" />
  </svg>
);

const RodIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M3 8 C5 5, 11 11, 13 8" />
  </svg>
);

const CageIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="10" height="6" rx="1" />
    <line x1="6" y1="5" x2="6" y2="11" />
    <line x1="10" y1="5" x2="10" y2="11" />
  </svg>
);

const DicomLeftSidebar = () => {
  const {
    dicom3D,
    setDicom3DRenderMode,
    setDicom3DIsoThreshold,
    setDicom3DVolumeThreshold,
    setDicom3DMode,
    setScrewConfig,
  } = useAppStore();

  const isSegMode = dicom3D.renderMode === 'segmentation';
  const currentThreshold = isSegMode ? dicom3D.isoThreshold : dicom3D.volumeThreshold;

  const setThreshold = (v: number) => {
    if (isSegMode) setDicom3DIsoThreshold(v);
    else setDicom3DVolumeThreshold(v);
  };

  const toggleScrew = () =>
    setDicom3DMode(dicom3D.interactionMode === 'place_screw' ? 'view' : 'place_screw');

  const thresholdPct = ((currentThreshold + 1024) / (3071 + 1024)) * 100;

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
      }}
      className="p-4 space-y-6"
    >
      {/* ── Tools ─────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/25 mb-3">
          Tools
        </p>
        <div className="flex flex-col gap-2">
          {/* Volume Rendering */}
          <button
            onClick={() => setDicom3DRenderMode('volume')}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border',
              !isSegMode
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5 border-transparent',
            )}
          >
            <Box className="w-4 h-4 flex-shrink-0" />
            Volume Rendering
          </button>

          {/* Segmentation */}
          <button
            onClick={() => setDicom3DRenderMode('segmentation')}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border',
              isSegMode
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5 border-transparent',
            )}
          >
            <Layers className="w-4 h-4 flex-shrink-0" />
            Segmentation
          </button>
        </div>
      </div>

      {/* ── HU Threshold ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/25">
            HU Threshold
          </p>
          <HelpCircle className="w-3.5 h-3.5 text-white/20" />
        </div>

        <div className="flex justify-between text-[9px] font-mono text-white/30 mb-2">
          <span>-1024 HU</span>
          <span>3071 HU</span>
        </div>

        {/* Gradient histogram background */}
        <div
          className="h-14 rounded-lg mb-3 relative overflow-hidden border border-white/[0.06]"
          style={{
            background: `linear-gradient(to right,
              #000 0%, #111 10%, #1c1c1c 20%,
              #333 30%, #555 45%, #777 60%,
              #aaa 75%, #d8d8d8 90%, #fff 100%)`,
          }}
        >
          {/* Threshold marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.8)]"
            style={{ left: `${thresholdPct}%` }}
          />
          {/* Mask representing below-threshold region */}
          <div
            className="absolute top-0 left-0 bottom-0 bg-black/45"
            style={{ width: `${thresholdPct}%` }}
          />
        </div>

        <input
          id="dicom-sidebar-hu-threshold-slider"
          type="range"
          min={-1024}
          max={3071}
          step={10}
          value={currentThreshold}
          onChange={e => setThreshold(parseInt(e.target.value))}
          className="w-full h-1.5 rounded-full cursor-pointer"
          style={{ accentColor: 'hsl(var(--primary))' }}
        />

        <div className="flex justify-between items-center mt-2">
          <span className="text-[10px] text-white/30">
            {isSegMode ? 'Seg. Threshold' : 'Vis. Threshold'}
          </span>
          <span className="text-[10px] font-mono font-bold text-primary">
            {currentThreshold} HU
          </span>
        </div>
      </div>

      {/* ── Instrumentation ───────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/25 mb-3">
          Instrumentation
        </p>
        <div className="flex flex-col gap-2">
          {/* Screw */}
          <button
            id="dicom-sidebar-tool-screw"
            onClick={toggleScrew}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border text-left',
              dicom3D.interactionMode === 'place_screw'
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25'
                : 'text-white/50 hover:text-white/80 hover:bg-white/5 border-transparent',
            )}
          >
            <div className={cn(
              'w-2 h-2 rounded-full flex-shrink-0 transition-colors',
              dicom3D.interactionMode === 'place_screw' ? 'bg-cyan-400' : 'bg-cyan-400/40',
            )} />
            <ScrewIcon className="w-3.5 h-3.5 flex-shrink-0" />
            Screw
            {dicom3D.interactionMode === 'place_screw' && (
              <span className="ml-auto text-[9px] text-cyan-400/70 animate-pulse">Active</span>
            )}
          </button>

          {/* Rod */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-white/20 border border-transparent select-none cursor-not-allowed">
            <div className="w-2 h-2 rounded-full bg-emerald-400/30 flex-shrink-0" />
            <RodIcon className="w-3.5 h-3.5 flex-shrink-0" />
            Rod
            <span className="ml-auto text-[9px] text-white/15">Phase 2</span>
          </div>

          {/* Cage */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-white/15 border border-transparent select-none cursor-not-allowed">
            <div className="w-2 h-2 rounded-full bg-gray-400/15 flex-shrink-0" />
            <CageIcon className="w-3.5 h-3.5 flex-shrink-0" />
            Cage
            <span className="ml-auto text-[9px] text-white/15">N/A</span>
          </div>
        </div>
      </div>

      {/* ── Screw configuration form ──────────────────────────── */}
      {dicom3D.interactionMode === 'place_screw' && (
        <div className="p-3 bg-cyan-950/5 border border-cyan-500/10 rounded-xl space-y-3">
          <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-cyan-400/50">
            Screw Settings
          </p>

          <div>
            <label htmlFor="screw-level-sidebar" className="text-[9px] text-white/30 mb-1 block">
              Level
            </label>
            <select
              id="screw-level-sidebar"
              value={dicom3D.screwLevel}
              onChange={e => setScrewConfig({ screwLevel: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/70 focus:outline-none focus:border-cyan-500/50 appearance-none cursor-pointer"
            >
              {SPINAL_LEVELS.map(l => (
                <option key={l} value={l} className="bg-[#0f0f11]">{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[9px] text-white/30 mb-1 block">Side</label>
            <div className="flex gap-1.5">
              {(['L', 'R'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setScrewConfig({ screwSide: s })}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all border',
                    dicom3D.screwSide === s
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                      : 'text-white/30 border-white/10 hover:border-white/25 hover:text-white/50',
                  )}
                >
                  {s === 'L' ? 'Left' : 'Right'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="screw-diameter-sidebar" className="text-[9px] text-white/30 mb-1 block">
              Diameter (mm)
            </label>
            <input
              id="screw-diameter-sidebar"
              type="number"
              min={3.0}
              max={9.0}
              step={0.5}
              value={dicom3D.screwDiameter}
              onChange={e => setScrewConfig({ screwDiameter: parseFloat(e.target.value) })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/70 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div>
            <label htmlFor="screw-length-sidebar" className="text-[9px] text-white/30 mb-1 block">
              Length (mm)
            </label>
            <input
              id="screw-length-sidebar"
              type="number"
              min={10}
              max={80}
              step={5}
              value={dicom3D.screwLength}
              onChange={e => setScrewConfig({ screwLength: parseInt(e.target.value) })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/70 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Normal LeftSidebar Content ────────────────────────────────── */
const NormalLeftSidebarContent = () => {
  const { activeTool, setActiveTool, measurements, canvas, vbmMode, setVbmMode, patients, activePatientId } = useAppStore();
  const location = useLocation();
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isPlanningMode = queryParams.get('tab') === 'planning';

  const [activeTab, setActiveTab] = useState<TabKey>('alignment');
  const [plane, setPlane] = useState<Plane>('coronal');
  const [planningTab, setPlanningTab] = useState<PlanningTab>('target');
  // overrides keyed by toolKey (e.g. 'll', 'sva')
  const [targetOverrides, setTargetOverrides] = useState<Record<string, string>>({});

  const activePatient = useMemo(
    () => patients?.find((p: any) => p.id === activePatientId),
    [patients, activePatientId],
  );
  const patientAge = (activePatient?.age as number) ?? 0;

  // Extract PI from live measurements
  const piMeasurement = useMemo(
    () => measurements.find((m: any) => m.toolKey === 'pi'),
    [measurements],
  );
  const piDeg: number = useMemo(() => {
    if (!piMeasurement) return NaN;
    return extractNumericValue((piMeasurement as any).result);
  }, [piMeasurement]);

  // Detect scoliosis mode from presence of cobb/cmc measurements
  const isScoliosis = useMemo(
    () => measurements.some((m: any) => m.toolKey === 'cobb' || m.toolKey === 'cmc'),
    [measurements],
  );

  // Compute recommended targets
  const targetParams = useMemo(
    () => computeTargets(patientAge, piDeg, isScoliosis),
    [patientAge, piDeg, isScoliosis],
  );

  // Helper: get current measured value for a toolKey
  const getMeasuredValue = (toolKey: string): number => {
    const m = measurements.find((x: any) => x.toolKey === toolKey);
    if (!m) return NaN;
    // pi_ll may be a multi-line result — first numeric
    return extractNumericValue((m as any).result);
  };

  const [showCalibrationReminder, setShowCalibrationReminder] = useState(false);
  const [pendingTool, setPendingTool] = useState<string | null>(null);

  // Check calibration state
  const { activeCanvasSide, isComparisonMode, comparison } = useAppStore();
  const isCalibrated = isComparisonMode
    ? comparison[activeCanvasSide]?.canvas?.calibrationApplied
    : canvas?.calibrationApplied;

  const currentTabKey = isPlanningMode ? 'planning' : activeTab;
  const tab = TABS.find((t) => t.key === currentTabKey)!;

  const sections: SectionDef[] = tab.planes
    ? (plane === 'coronal' ? tab.coronal! : tab.sagittal!)
    : (tab.sections ?? []);

  const refLines: RefLineDef[] = tab.planes
    ? (plane === 'coronal' ? (tab.coronalRefLines ?? []) : (tab.sagittalRefLines ?? []))
    : (tab.refLines ?? []);

  const handleTool = (id: string) => {
    // Prompt if not calibrated and trying to select a measurement tool (anything except calibration or custom templates)
    if (id && id !== 'calibration' && !isCalibrated) {
      setPendingTool(id);
      setShowCalibrationReminder(true);
    } else {
      setActiveTool(activeTool === id ? null : id);
    }
  };

  return (
    <div
      style={{
        width: '100%',
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
              { key: 'target' as PlanningTab, num: 1, label: 'Alignment Goals' },
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

        {/* ── Alignment Goals panel (planning mode only) ───── */}
        {isPlanningMode && planningTab === 'target' && (
          <div style={{ padding: '10px 10px 14px' }}>

            {/* Context bar: age + PI */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 10,
              padding: '5px 10px',
              background: 'var(--surface-2)',
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                Alignment Goals
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600 }}>
                Age {patientAge > 0 ? patientAge : '?'}
              </span>
              {!isNaN(piDeg) && (
                <span style={{
                  fontSize: 10,
                  color: '#22c55e',
                  fontWeight: 700,
                  background: 'rgba(34,197,94,0.12)',
                  borderRadius: 4,
                  padding: '1px 5px',
                }}>
                  PI {piDeg.toFixed(0)}°
                </span>
              )}
            </div>

            {/* Table */}
            <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 2fr 1fr',
                background: 'var(--surface-3)',
                borderBottom: '1px solid var(--border)',
                padding: '5px 8px',
              }}>
                {['Parameter', 'Current', 'Target', '+/−'].map(col => (
                  <div key={col} style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                    {col}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {targetParams.map((param, rowIdx) => {
                const measured = getMeasuredValue(param.toolKey);
                // Target: override value (string) takes precedence, else the auto-populated healthyRange
                const override = targetOverrides[param.toolKey] ?? '';
                // Auto-populate target: use healthyMin if available, else the healthyRange string
                const autoTarget = isFinite(param.healthyMin) && isFinite(param.healthyMax)
                  ? `${param.healthyMin}–${param.healthyMax}${param.unit}`
                  : param.healthyRange;
                const displayTarget = override || autoTarget;

                // Correction: measured − midpoint of target range
                let correctionDisplay = '—';
                if (!isNaN(measured) && isFinite(param.healthyMin) && isFinite(param.healthyMax)) {
                  const targetMid = (param.healthyMin + param.healthyMax) / 2;
                  const corr = measured - targetMid;
                  correctionDisplay = (corr >= 0 ? '+' : '') + corr.toFixed(1) + param.unit;
                }

                const status = classifyValue(param.toolKey, measured, patientAge, piDeg);
                const statusColor = STATUS_COLORS[status];
                const measuredDisplay = isNaN(measured) ? '—' : `${measured.toFixed(1)}${param.unit}`;

                return (
                  <div
                    key={param.toolKey}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 2fr 1fr',
                      alignItems: 'center',
                      padding: '6px 8px',
                      background: rowIdx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                      borderBottom: '1px solid var(--border)',
                      gap: 4,
                    }}
                  >
                    {/* Parameter */}
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                      {param.label}
                    </div>

                    {/* Current */}
                    <div style={{ fontSize: 11, fontWeight: 700, color: isNaN(measured) ? 'var(--text-3)' : statusColor }}>
                      {measuredDisplay}
                    </div>

                    {/* Target — editable input pre-filled from recommendation */}
                    <div>
                      <input
                        type="text"
                        value={displayTarget}
                        onChange={(e) => setTargetOverrides(prev => ({ ...prev, [param.toolKey]: e.target.value }))}
                        onFocus={(e) => {
                          // On first focus, seed the input with the auto value if no override yet
                          if (!targetOverrides[param.toolKey]) {
                            setTargetOverrides(prev => ({ ...prev, [param.toolKey]: autoTarget }));
                          }
                          (e.target as HTMLInputElement).select();
                        }}
                        title="Auto-filled from age-adjusted recommendation. Click to override."
                        style={{
                          width: '100%',
                          background: override ? 'var(--accent-soft)' : 'transparent',
                          border: `1px solid ${override ? 'var(--accent)' : 'var(--border-2)'}`,
                          borderRadius: 5,
                          padding: '2px 5px',
                          fontSize: 10,
                          fontWeight: 700,
                          color: override ? 'var(--accent)' : '#22c55e',
                          outline: 'none',
                          boxSizing: 'border-box',
                          cursor: 'text',
                        }}
                      />
                      {override && (
                        <button
                          onClick={() => setTargetOverrides(prev => { const n = { ...prev }; delete n[param.toolKey]; return n; })}
                          title="Reset to recommendation"
                          style={{ fontSize: 9, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '1px 0 0', marginTop: 1 }}
                        >
                          ↺ reset
                        </button>
                      )}
                    </div>

                    {/* Correction */}
                    <div style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: correctionDisplay === '—' ? 'var(--text-3)' : correctionDisplay.startsWith('+') ? '#ef4444' : '#22c55e',
                    }}>
                      {correctionDisplay}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{
              display: 'flex',
              gap: 8,
              marginTop: 8,
              padding: '5px 8px',
              background: 'var(--surface-2)',
              borderRadius: 7,
              border: '1px solid var(--border)',
              flexWrap: 'wrap',
            }}>
              {(['healthy', 'borderline', 'abnormal'] as TargetStatus[]).map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLORS[s], flexShrink: 0 }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                    {STATUS_LABELS[s]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Simulation table (planning mode, simulation tab) ─ */}
        {isPlanningMode && planningTab === 'simulation' && (
          <div style={{ padding: '10px 10px 14px' }}>

            {/* Context bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 10,
              padding: '5px 10px',
              background: 'var(--surface-2)',
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                Simulation
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 9, color: 'var(--text-3)' }}>Plan vs Target</span>
            </div>

            {/* Table */}
            <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.8fr 0.9fr 1.6fr 0.9fr 1fr',
                background: 'var(--surface-3)',
                borderBottom: '1px solid var(--border)',
                padding: '5px 8px',
                gap: 4,
              }}>
                {['Parameter', 'Current', 'Target', '+/−', 'Plan'].map(col => (
                  <div key={col} style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                    {col}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {targetParams.map((param, rowIdx) => {
                const measured = getMeasuredValue(param.toolKey);
                const override = targetOverrides[param.toolKey] ?? '';
                const autoTarget = isFinite(param.healthyMin) && isFinite(param.healthyMax)
                  ? `${param.healthyMin}–${param.healthyMax}${param.unit}`
                  : param.healthyRange;
                const displayTarget = override || autoTarget;

                // Plan = current measured value (the surgeon's canvas reflects the plan)
                const planValue = measured;
                const planDisplay = isNaN(planValue) ? '—' : `${planValue.toFixed(1)}${param.unit}`;

                // Correction: plan − midpoint of target range
                let correctionDisplay = '—';
                if (!isNaN(planValue) && isFinite(param.healthyMin) && isFinite(param.healthyMax)) {
                  const targetMid = (param.healthyMin + param.healthyMax) / 2;
                  const corr = planValue - targetMid;
                  correctionDisplay = (corr >= 0 ? '+' : '') + corr.toFixed(1) + param.unit;
                }

                // Plan color: green = meets target, red = doesn't
                const planStatus = classifyValue(param.toolKey, planValue, patientAge, piDeg);
                const planColor = planStatus === 'healthy' ? '#22c55e'
                  : planStatus === 'borderline' ? '#eab308'
                  : planStatus === 'abnormal' ? '#ef4444'
                  : 'var(--text-3)';
                const planMeetsTarget = planStatus === 'healthy';

                const currentStatus = classifyValue(param.toolKey, measured, patientAge, piDeg);
                const currentColor = STATUS_COLORS[currentStatus];
                const measuredDisplay = isNaN(measured) ? '—' : `${measured.toFixed(1)}${param.unit}`;

                return (
                  <div
                    key={param.toolKey}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.8fr 0.9fr 1.6fr 0.9fr 1fr',
                      alignItems: 'center',
                      padding: '6px 8px',
                      background: rowIdx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                      borderBottom: '1px solid var(--border)',
                      gap: 4,
                    }}
                  >
                    {/* Parameter */}
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                      {param.label}
                    </div>

                    {/* Current */}
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: isNaN(measured) ? 'var(--text-3)' : currentColor }}>
                      {measuredDisplay}
                    </div>

                    {/* Target (read-only in simulation view) */}
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#22c55e' }}>
                      {displayTarget}
                    </div>

                    {/* Correction */}
                    <div style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: correctionDisplay === '—' ? 'var(--text-3)' : correctionDisplay.startsWith('+') ? '#ef4444' : '#22c55e',
                    }}>
                      {correctionDisplay}
                    </div>

                    {/* Plan — color-coded: green = meets target, red = doesn't */}
                    <div style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: isNaN(planValue) ? 'var(--text-3)' : planColor,
                      background: isNaN(planValue) ? 'transparent' : (planMeetsTarget ? 'rgba(34,197,94,0.12)' : planStatus === 'borderline' ? 'rgba(234,179,8,0.12)' : 'rgba(239,68,68,0.12)'),
                      borderRadius: 4,
                      padding: isNaN(planValue) ? '0' : '1px 4px',
                      display: 'inline-block',
                    }}>
                      {planDisplay}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{
              display: 'flex',
              gap: 8,
              marginTop: 8,
              padding: '5px 8px',
              background: 'var(--surface-2)',
              borderRadius: 7,
              border: '1px solid var(--border)',
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Meets target</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#eab308', flexShrink: 0 }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Borderline</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Off target</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Tool list (measurement mode, or any non-planning context) ─ */}
        {(!isPlanningMode) && (
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
                  <div key={tool.id}>
                    <ToolRow
                      tool={tool}
                      active={activeTool === tool.id}
                      onClick={() => handleTool(tool.id)}
                    />
                    {tool.id === 'vbm' && activeTool === 'vbm' && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 0,
                        border: '1px solid var(--border-2)',
                        borderRadius: 8,
                        overflow: 'hidden',
                        margin: '2px 4px 6px',
                      }}>
                        {(['lateral', 'ap'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setVbmMode(mode)}
                            style={{
                              padding: '7px 4px',
                              fontSize: 11.5,
                              fontWeight: 600,
                              color: vbmMode === mode ? 'var(--accent)' : 'var(--text-2)',
                              background: vbmMode === mode ? 'var(--accent-soft)' : 'var(--surface)',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'all .14s',
                            }}
                          >
                            {mode === 'lateral' ? 'Sagittal' : 'Coronal'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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


/* ── Report LeftSidebar ─────────────────────────────────────── */
const ReportLeftSidebar = () => {
  const { activeContextId, contextStates, updateContextState, isComparisonMode } = useAppStore();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  
  const activeState = contextStates.find((s) => s.contextId === activeContextId);
  const reportConfig = activeState?.reportConfig;

  if (!reportConfig) return null;

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || !activeContextId) return;

    const items = Array.from(reportConfig.sections);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const updatedItems = items.map((item, index) => ({
      ...item,
      order: index
    }));

    updateContextState(activeContextId, {
      reportConfig: {
        ...reportConfig,
        sections: updatedItems
      }
    });
  };

  const toggleSection = (sectionId: string) => {
    if (!activeContextId) return;
    const updatedSections = reportConfig.sections.map(s => 
      s.id === sectionId ? { ...s, enabled: !s.enabled } : s
    );
    updateContextState(activeContextId, {
      reportConfig: {
        ...reportConfig,
        sections: updatedSections
      }
    });
  };

  const sortedSections = [...reportConfig.sections].sort((a, b) => a.order - b.order);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--val-good) 0%, #10b981 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <LayoutTemplate size={18} />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-1)' }}>
            Report Sections
          </span>
        </div>
      </div>
      
      {isComparisonMode && (
        <div style={{ padding: '0 16px 16px' }}>
          <div className={cn(
              "flex flex-col gap-2 p-3 rounded-lg border",
              isDark ? "bg-[#141416]/80 border-white/10" : "bg-white/80 border-black/10"
          )}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)' }}>REPORT TYPE</span>
              <button
                  onClick={() => {
                      if (activeContextId) updateContextState(activeContextId, { reportConfig: { ...reportConfig, reportType: 'single' } as any });
                  }}
                  className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all text-left",
                      reportConfig?.reportType === 'single' 
                          ? "bg-[#FF453A] text-white shadow-sm" 
                          : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  )}
              >
                  Current Study Only
              </button>
              <button
                  onClick={() => {
                      if (activeContextId) updateContextState(activeContextId, { reportConfig: { ...reportConfig, reportType: 'comparison' } as any });
                  }}
                  className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-all text-left",
                      reportConfig?.reportType !== 'single' 
                          ? "bg-[#FF453A] text-white shadow-sm" 
                          : "text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  )}
              >
                  Comparison Report
              </button>
          </div>
        </div>
      )}

      <ScrollArea style={{ flex: 1 }}>
        <div style={{ padding: '0 16px 20px' }}>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="report-sections-sidebar">
              {(provided) => (
                <div 
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-2"
                >
                  {sortedSections.map((section, index) => (
                    <Draggable key={section.id} draggableId={section.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border transition-all",
                            snapshot.isDragging ? "shadow-lg bg-accent/50 border-blue-500 z-50" : "bg-card border-border",
                            !section.enabled && "opacity-50"
                          )}
                        >
                          <div 
                            {...provided.dragHandleProps}
                            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                          >
                            <GripVertical size={16} />
                          </div>
                          
                          <span className="flex-1 text-sm font-medium leading-none">
                            {section.title}
                          </span>
                          
                          <button 
                            onClick={() => toggleSection(section.id)}
                            className={cn(
                              "p-1.5 rounded-md transition-colors",
                              section.enabled ? "text-blue-500 hover:bg-blue-500/10" : "text-muted-foreground hover:bg-muted"
                            )}
                          >
                            {section.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </ScrollArea>

      {/* Calibration Reminder Dialog */}
      <Dialog open={showCalibrationReminder} onOpenChange={setShowCalibrationReminder}>
        <DialogContent className="sm:max-w-md border-[#242427] bg-[#141416] text-[#F5F5F7]">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-white">Calibration Required</DialogTitle>
            <DialogDescription className="text-[#9CA3AF] text-sm mt-2">
              This image has not been calibrated. Please calibrate the image before taking measurements.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowCalibrationReminder(false);
                setPendingTool(null);
              }}
              className="h-9 rounded-md border-[#242427] bg-transparent text-[#9CA3AF] text-sm hover:bg-[#242427] hover:text-[#F5F5F7]"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowCalibrationReminder(false);
                setActiveTool('calibration');
                setPendingTool(null);
              }}
              className="h-9 rounded-md bg-[#FF453A] text-white text-sm font-semibold hover:bg-[#e03d33]"
            >
              Calibrate Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ── Main LeftSidebar ────────────────────────────────────────── */
const LeftSidebar = () => {
  const { isDicomMode, isLeftSidebarOpen, toggleLeftSidebar } = useAppStore();
  const location = useLocation();
  const isReportTab = new URLSearchParams(location.search).get('tab') === 'report';

  // Hide entirely in DICOM mode — the 3D controls live in the right sidebar
  if (isDicomMode) return null;

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRight: isLeftSidebarOpen ? '1px solid var(--border)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        width: isLeftSidebarOpen ? '272px' : '0px',
        overflow: 'hidden',
        transition: 'width .3s',
        position: 'relative',
        height: '100%',
        flexShrink: 0,
      }}
    >
      {/* Reveal button when closed — rendered by DashboardSidebar when collapsible,
          so it moves with the hover nav panel and is never obscured by it. */}

      {isLeftSidebarOpen && (
        <>
          {/* Collapse button when open */}
          <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateX(50%) translateY(-50%)', zIndex: 61 }}>
            <Button
              variant="secondary"
              size="icon"
              style={{ width: 22, height: 40, borderRadius: '0 6px 6px 0', border: '1px solid var(--border)', borderLeft: 'none', background: 'var(--surface-2)' }}
              onClick={() => toggleLeftSidebar(false)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', width: '100%' }}>
            {isReportTab ? <ReportLeftSidebar /> : isDicomMode ? <DicomLeftSidebar /> : <NormalLeftSidebarContent />}
          </div>
        </>
      )}
    </div>
  );
};

export default LeftSidebar;
