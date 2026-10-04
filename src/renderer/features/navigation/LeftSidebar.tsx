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
import { Scale, Box, Layers, HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/lib/store/index';
import { useShallow } from 'zustand/react/shallow';
import { TargetsPanel } from '@/features/planning2d/TargetsPanel';
import { Button } from '@/components/ui/button';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { GripVertical, Eye, EyeOff, LayoutTemplate } from 'lucide-react';
import { useReportConfig } from '@/lib/report/useReportConfig';
import { isReadOnlyCase } from '@/lib/access';
import { useTheme } from '@/components/theme-provider';

/* ── Planning sub-tab ──────────────────────────────────────── */
type PlanningTab = 'target' | 'simulation';

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
          { id: 'itilt',     abbr: 'INSTR', label: 'Instr. Level', desc: 'Instrumented vertebra tilt (UIV / LIV)' },
        ],
      },
    ],
  },
];

/* ── Single tool row ─────────────────────────────────────────── */
/** VBM plane chosen inline under the tool (replaces the old dialog). */
function VbmPlanePicker({ onPick }: { onPick: () => void }) {
  const vbmMode = useAppStore(s => s.vbmMode);
  const setVbmMode = useAppStore(s => s.setVbmMode);
  return (
    <div style={{ display: 'flex', gap: 4, padding: '2px 12px 8px 60px' }}>
      {([['lateral', 'Sagittal'], ['ap', 'Coronal']] as const).map(([m, label]) => (
        <button
          key={m}
          onClick={() => { setVbmMode(m); onPick(); }}
          style={{
            flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
            border: '1px solid ' + (vbmMode === m ? 'var(--accent)' : 'var(--border-2)'),
            background: vbmMode === m ? 'var(--accent-soft)' : 'transparent',
            color: vbmMode === m ? 'var(--accent)' : 'var(--text-3)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** UIV / LIV chosen inline under "Instr. Level" (replaces the old dialog). */
function TiltLevelPicker({ onPick }: { onPick: () => void }) {
  const tiltMode = useAppStore(s => s.tiltMode);
  const setTiltMode = useAppStore(s => s.setTiltMode);
  return (
    <div style={{ display: 'flex', gap: 4, padding: '2px 12px 8px 60px' }}>
      {([['UIV', 'UIV (upper)'], ['LIV', 'LIV (lower)']] as const).map(([m, label]) => (
        <button
          key={m}
          onClick={() => { setTiltMode(m); onPick(); }}
          style={{
            flex: 1, padding: '4px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
            border: '1px solid ' + (tiltMode === m ? 'var(--accent)' : 'var(--border-2)'),
            background: tiltMode === m ? 'var(--accent-soft)' : 'transparent',
            color: tiltMode === m ? 'var(--accent)' : 'var(--text-3)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

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
    setDicomCroppingActive,
    updateRoiCrop,
  } = useAppStore(useShallow((s) => ({ dicom3D: s.dicom3D, setDicom3DRenderMode: s.setDicom3DRenderMode, setDicom3DIsoThreshold: s.setDicom3DIsoThreshold, setDicom3DVolumeThreshold: s.setDicom3DVolumeThreshold, setDicom3DMode: s.setDicom3DMode, setDicomCroppingActive: s.setDicomCroppingActive, updateRoiCrop: s.updateRoiCrop })));

  const isSegMode = dicom3D.renderMode === 'segmentation';
  const currentThreshold = isSegMode ? dicom3D.isoThreshold : dicom3D.volumeThreshold;

  const setThreshold = (v: number) => {
    if (isSegMode) setDicom3DIsoThreshold(v);
    else setDicom3DVolumeThreshold(v);
  };

  const toggleMode = (m: 'place_screw' | 'place_rod' | 'place_cage') =>
    setDicom3DMode(dicom3D.interactionMode === m ? 'view' : m);
  const toggleScrew = () => toggleMode('place_screw');

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
        <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-[var(--text-3)] mb-3">
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
                : 'text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] border-transparent',
            )}
          >
            <Box className="w-4 h-4 flex-shrink-0" />
            Volume (soft bone)
          </button>

          {/* Segmentation */}
          <button
            onClick={() => setDicom3DRenderMode('segmentation')}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border',
              isSegMode
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] border-transparent',
            )}
          >
            <Layers className="w-4 h-4 flex-shrink-0" />
            Bone segmentation
          </button>
        </div>
      </div>

      {/* ── HU Threshold ──────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-[var(--text-3)]">
            HU Threshold
          </p>
          <HelpCircle className="w-3.5 h-3.5 text-[var(--text-3)]" />
        </div>

        <div className="flex justify-between text-[9px] font-mono text-[var(--text-3)] mb-2">
          <span>-1024 HU</span>
          <span>3071 HU</span>
        </div>

        {/* Gradient histogram background */}
        <div
          className="h-14 rounded-lg mb-3 relative overflow-hidden border border-[var(--border)]"
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
          <span className="text-[10px] text-[var(--text-3)]">
            {isSegMode ? 'Seg. Threshold' : 'Vis. Threshold'}
          </span>
          <span className="text-[10px] font-mono font-bold text-primary">
            {currentThreshold} HU
          </span>
        </div>
      </div>

      {/* ── Instrumentation ───────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-[var(--text-3)] mb-3">
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
                ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/25'
                : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] border-transparent',
            )}
          >
            <div className={cn(
              'w-2 h-2 rounded-full flex-shrink-0 transition-colors',
              dicom3D.interactionMode === 'place_screw' ? 'bg-cyan-400' : 'bg-cyan-400/40',
            )} />
            <ScrewIcon className="w-3.5 h-3.5 flex-shrink-0" />
            Screw
            {dicom3D.interactionMode === 'place_screw' && (
              <span className="ml-auto text-[9px] text-cyan-600/80 dark:text-cyan-400/70 animate-pulse">Active</span>
            )}
          </button>

          {/* Rod */}
          <button
            onClick={() => toggleMode('place_rod')}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border text-left',
              dicom3D.interactionMode === 'place_rod'
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] border-transparent',
            )}
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400/60 flex-shrink-0" />
            <RodIcon className="w-3.5 h-3.5 flex-shrink-0" />
            Rod
            {dicom3D.interactionMode === 'place_rod' && (
              <span className="ml-auto text-[9px] text-emerald-700/80 dark:text-emerald-300/70 animate-pulse">Active</span>
            )}
          </button>

          {/* Cage */}
          <button
            onClick={() => toggleMode('place_cage')}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border text-left',
              dicom3D.interactionMode === 'place_cage'
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25'
                : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] border-transparent',
            )}
          >
            <div className="w-2 h-2 rounded-full bg-amber-400/60 flex-shrink-0" />
            <CageIcon className="w-3.5 h-3.5 flex-shrink-0" />
            Cage
            {dicom3D.interactionMode === 'place_cage' && (
              <span className="ml-auto text-[9px] text-amber-700/80 dark:text-amber-300/70 animate-pulse">Active</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Crop (3D) ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-[var(--text-3)]">Crop 3D</p>
          <button
            onClick={() => setDicomCroppingActive(!dicom3D.isCroppingActive)}
            className={cn('text-[10px] px-2 py-0.5 rounded border',
              dicom3D.isCroppingActive ? 'border-primary/40 text-primary bg-primary/10' : 'border-[var(--border)] text-[var(--text-3)]')}
          >
            {dicom3D.isCroppingActive ? 'On' : 'Off'}
          </button>
        </div>
        {dicom3D.isCroppingActive && (
          // The crop box is edited directly in the 3D view (UI10-05)
          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-3)]">
            <span>Drag the box faces in the 3D view.</span>
            <button onClick={() => updateRoiCrop({ x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 })}
              className="shrink-0 hover:text-[var(--text)]">Reset</button>
          </div>
        )}
      </div>

    </div>
  );
};

/* ── Normal LeftSidebar Content ────────────────────────────────── */
const NormalLeftSidebarContent = () => {
  const { activeTool, setActiveTool } = useAppStore(useShallow((s) => ({ activeTool: s.activeTool, setActiveTool: s.setActiveTool })));
  const activeContextId = useAppStore((s) => s.activeContextId);
  const location = useLocation();
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isPlanningMode = queryParams.get('tab') === 'planning';

  const [activeTab, setActiveTab] = useState<TabKey>('alignment');
  const [plane, setPlane] = useState<Plane>('coronal');
  const [planningTab, setPlanningTab] = useState<PlanningTab>('target');

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
              { key: 'target' as PlanningTab, num: 1, label: 'Targets' },
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

        {/* ── Targets (planning) — TK / LL / SVA only (UI9-05) ── */}
        {isPlanningMode && planningTab === 'target' && <TargetsPanel key={activeContextId ?? 'untitled'} />}

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
                  <div key={tool.id}>
                    <ToolRow
                      tool={tool}
                      active={activeTool === tool.id}
                      onClick={() => handleTool(tool.id)}
                    />
                    {tool.id === 'vbm' && <VbmPlanePicker onPick={() => { if (activeTool !== 'vbm') handleTool('vbm'); }} />}
                    {tool.id === 'itilt' && <TiltLevelPicker onPick={() => { if (activeTool !== 'itilt') handleTool('itilt'); }} />}
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
  const [reportConfig, saveConfig] = useReportConfig();

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = [...reportConfig.sections].sort((a, b) => a.order - b.order);
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    saveConfig({ ...reportConfig, sections: items.map((item, index) => ({ ...item, order: index })) });
  };

  const toggleSection = (sectionId: string) => {
    saveConfig({
      ...reportConfig,
      sections: reportConfig.sections.map(s => s.id === sectionId ? { ...s, enabled: !s.enabled } : s),
    });
  };

  const sortedSections = [...reportConfig.sections].sort((a, b) => a.order - b.order);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '20px 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--val-good) 0%, #10b981 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <LayoutTemplate size={18} />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-1)' }}>
            Report Contents
          </span>
        </div>
      </div>

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
                            // Borderless rows on the panel surface (UI9-07)
                            "flex items-center gap-3 p-3 rounded-lg transition-colors",
                            snapshot.isDragging ? "shadow-lg bg-[var(--surface-3)] z-50" : "bg-[var(--surface-2)] hover:bg-[var(--surface-3)]",
                            !section.enabled && "opacity-50"
                          )}
                        >
                          <div 
                            {...provided.dragHandleProps}
                            className="cursor-grab active:cursor-grabbing text-[var(--text-3)] hover:text-[var(--text)]"
                          >
                            <GripVertical size={16} />
                          </div>
                          
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium leading-tight text-[var(--text)]">{section.title}</span>
                            {section.description && <span className="block text-[10px] text-[var(--text-3)] mt-0.5 truncate">{section.description}</span>}
                          </span>
                          
                          <button 
                            onClick={() => toggleSection(section.id)}
                            className={cn(
                              "p-1.5 rounded-md transition-colors",
                              section.enabled ? "text-[var(--accent)] hover:bg-[var(--accent-soft)]" : "text-[var(--text-3)] hover:bg-[var(--surface-3)]"
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
    </div>
  );
};

/* ── View-only case: no tools (UI12-10) ──────────────────────── */
function ViewOnlyPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 h-full px-6 text-center">
      <div className="h-11 w-11 rounded-full flex items-center justify-center bg-[var(--surface-2)] text-[var(--text-2)]">
        <Eye className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold text-[var(--text)]">View only</div>
      <p className="text-xs leading-relaxed text-[var(--text-3)]">
        The measurements and the plan are shown as saved. Editing tools are available to the study's owner
        and to people it is shared with for editing.
      </p>
    </div>
  );
}

/* ── Main LeftSidebar ────────────────────────────────────────── */
const LeftSidebar = () => {
  const isDicomMode = useAppStore(s => s.isDicomMode);
  const isLeftSidebarOpen = useAppStore(s => s.isLeftSidebarOpen);
  const location = useLocation();
  const isReportTab = new URLSearchParams(location.search).get('tab') === 'report';
  const readOnly = useAppStore((s) => isReadOnlyCase(s) || !!s.inspectionMode?.active);

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRight: isLeftSidebarOpen ? '1px solid var(--border)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        // Report contents need more room for section titles + descriptions.
        width: isLeftSidebarOpen ? (isReportTab ? '340px' : '272px') : '0px',
        overflow: 'hidden',
        transition: 'width .3s',
        position: 'relative',
        height: '100%',
        flexShrink: 0,
      }}
    >
      {isLeftSidebarOpen && (
        <>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', width: '100%' }}>
            {isReportTab ? <ReportLeftSidebar /> : readOnly ? <ViewOnlyPanel /> : isDicomMode ? <DicomLeftSidebar /> : <NormalLeftSidebarContent />}
          </div>
        </>
      )}
    </div>
  );
};

export default LeftSidebar;
