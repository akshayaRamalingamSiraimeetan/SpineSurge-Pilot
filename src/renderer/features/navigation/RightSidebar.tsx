/**
 * RightSidebar — Measurement results panel.
 *
 * Design system: SpineSurge-Rebuild
 *   - .collapse / .collapse-head / .collapse-body
 *   - .mgroup / .mgroup-name / .mrow / .mv
 *   - .cs-row / .csl / .csv
 *   - .empty-state
 *   - .cmp-table-head / .cmp-row / .cval
 *
 * Per screenshots: Three sections visible —
 *   1. Case Summary (collapsible)
 *   2. Current Measurements (collapsible, shows angle values in red)
 *   3. Reference Lines (collapsible, shows SVL/C7PL/GL with green mm values)
 *
 * Reference lines (c7pl, csvl) are shown SEPARATELY under "Reference Lines",
 * NOT mixed into the Current Measurements list.
 */
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/lib/store/index";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    FileText,
    Ruler,
    Trash2,
    Activity,
    Target,
    Pencil,
    ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { MODULE_TOOL_MAPPING } from "./toolConstants";
import { ReportDialog } from "./ReportDialog";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { VBM_FULL_FORMS } from "../measurements/quick/VBM";
import {
    calculateOpenOsteotomyPrimitives,
    calculateResectionPrimitives,
} from "@/features/measurements/planning/PlanningTools";

/* ── Constants ────────────────────────────────────────────────── */
/**
 * Reference-line tool keys: displayed separately under "Reference Lines" section.
 * NOT mixed into Current Measurements.
 */
const REF_LINE_KEYS = new Set(['c7pl', 'csvl']);

const REF_LINE_DISPLAY: Record<string, string> = {
    'c7pl': 'C7PL',
    'csvl': 'CSVL / SVL',
};

const NORMAL_RANGES: Record<string, string> = {
    'pi': '(40°–65°)',
    'pt': '(10°–25°)',
    'ss': '(30°–50°)',
    'sva': '(< 50 mm)',
    'pi_ll': '(< 10°)',
    'cobb': '(0°–10°)',
    'cl': '(35°–45°)',
    'tk': '(20°–40°)',
    'll': '(40°–60°)',
};

const TOOL_DISPLAY_NAMES: Record<string, string> = {
    'cobb':     'Cobb Angle',
    'angle-4pt':'4 pt Angle',
    'angle-2pt':'2 pt Angle',
    'angle-3pt':'3 pt Angle',
    'sva':      'SVA',
    'vbm':      'Vertebral Body Metrics',
    'pi_ll':    'PI-LL Mismatch',
    'cl':       'Cervical Lordosis (CL)',
    'tk':       'Thoracic Kyphosis (TK)',
    'll':       'Lumbar Lordosis (LL)',
    'sc':       'Custom Curve',
    'stenosis': 'Canal Area',
    'spondy':   'Spondylolisthesis',
    'line':     'Distance Line',
    'pelvis':   'Pelvic Parameters',
    'ts':       'Trunk Shift',
    'avt':      'Apical Vert. Translation',
    'rvad':     'RVAD',
    'po':       'Pelvic Obliquity',
    'itilt':    'Instrumented Tilt',
    'tpa':      'TPA',
    'spa':      'SPA',
    'ssa':      'SSA',
    't1spi':    'T1SPi',
    't9spi':    'T9SPi',
    'odha':     'ODHA',
    'cbva':     'CBVA',
    'cmc':      'Cobb Multi-Curve',
    'pencil':   'Pencil Trace',
    'text':     'Label',
    'circle':   'Circle',
    'ellipse':  'Ellipse',
    'polygon':  'Polygon',
    'ost-pso':  'PSO',
    'ost-spo':  'SPO',
    'ost-resect':'Resection Plan',
    'ost-open': 'Opening Wedge',
    'screw':    'Pedicle Screw',
    'rod':      'Spinal Rod',
    'cage':     'Interbody Cage',
    'plate':    'Spinal Plate',
};

/* ── Calibration-aware formatters (unchanged from original) ──── */
const formatResultWithCalibration = (
    result: unknown,
    pixelToMm: number | null,
    shouldConvert: boolean,
): string | null => {
    if (typeof result !== 'string') return null;
    if (!pixelToMm || !shouldConvert) return result;
    const withArea = result.replace(/(-?\d+(?:\.\d+)?)\s*px²/gi, (_, raw) => {
        const v = Number.parseFloat(raw);
        return Number.isFinite(v) ? `${(v * pixelToMm * pixelToMm).toFixed(1)} mm²` : _;
    });
    return withArea.replace(/(-?\d+(?:\.\d+)?)\s*px\b/gi, (_, raw) => {
        const v = Number.parseFloat(raw);
        return Number.isFinite(v) ? `${(v * pixelToMm).toFixed(1)} mm` : _;
    });
};

const formatValue = (m: any, pixelToMm: number | null, shouldConvert: boolean): string => {
    if (['ost-pso', 'ost-spo', 'ost-open', 'ost-resect'].includes(m.toolKey)) {
        const existing = typeof m.result === 'string' ? m.result : '';
        if (existing && existing !== 'Planning...') return existing.replace(/\n/g, ' | ');
        const theta = m?.measurement?.rotationAngleRad;
        if (typeof theta === 'number' && Number.isFinite(theta)) {
            const deg = Math.abs(theta * 180 / Math.PI).toFixed(1);
            if (m.toolKey === 'ost-open') return `Opening: ${deg}°`;
            if (m.toolKey === 'ost-resect') return `Resection: ${deg}°`;
            return `Correction: ${deg}°`;
        }
        if (m.toolKey === 'ost-open' && Array.isArray(m.points) && m.points.length >= 6) {
            const data = calculateOpenOsteotomyPrimitives(m.points);
            return `Opening: ${Math.abs(data.phi * 180 / Math.PI).toFixed(1)}°`;
        }
        if (m.toolKey === 'ost-resect' && Array.isArray(m.points) && m.points.length >= 4) {
            const data = calculateResectionPrimitives(m.points);
            if (data) return `Resection: ${Math.abs(data.rotationAngleRad * 180 / Math.PI).toFixed(1)}°`;
        }
        if ((m.toolKey === 'ost-pso' || m.toolKey === 'ost-spo') && Array.isArray(m.points) && m.points.length >= 3) {
            const p = m.points[0], h = m.points[1], a = m.points[2];
            const mov = Math.atan2(p.y - h.y, p.x - h.x);
            const fix = Math.atan2(a.y - h.y, a.x - h.x);
            const norm = ((fix - mov + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
            return `Correction: ${Math.abs(norm * 180 / Math.PI).toFixed(1)}°`;
        }
        return 'Correction: Pending';
    }
    if (m.toolKey === 'point' && m.points[0]) {
        return `${Math.round(m.points[0].x)}, ${Math.round(m.points[0].y)}`;
    }
    if (['vbm', 'spondy', 'pelvis', 'pi_ll', 'cmc', 'rvad', 'circle', 'ellipse', 'polygon'].includes(m.toolKey)) {
        return 'Metrics';
    }
    if (['screw', 'rod', 'cage', 'plate'].includes(m.toolKey)) return 'Properties';
    const formatted = formatResultWithCalibration(m.result, pixelToMm, shouldConvert);
    return formatted ? formatted.replace(/\n/g, ' | ') : '-';
};

/* ── MeasurementCard — screenshot-style row (label left, value right) ──────── */
const MeasurementCard = ({
    label, value, range, toolKey, checked, onCheckedChange, onDelete,
    setMeasurements, m, pixelToMm, shouldConvert,
}: {
    label: string; value: string; range: string; toolKey: string;
    checked: boolean; onCheckedChange: (v: boolean) => void; onDelete: () => void;
    setMeasurements: (m: any[]) => void; m: any;
    pixelToMm: number | null; shouldConvert: boolean;
}) => {
    const [expanded, setExpanded] = useState(false);
    const [level, setLevel] = useState(m.measurement?.level || '');

    console.log("Rendering MeasurementCard", {
        toolKey: m.toolKey,
        result: m.result
    });

    const updateLevel = async () => {
        const manager = (window as any).canvasManager;
        if (!manager) return;
        const newState = await manager.applyOperation('UPDATE_MEASUREMENT', {
            id: m.id,
            measurement: { ...m.measurement, level },
        });
        if (newState) setMeasurements(newState.data.measurements);
    };

    const hasDetails = ['vbm','spondy','pelvis','pi_ll','cmc','rvad','circle','ellipse','polygon',
        'screw','rod','cage','plate','ost-pso','ost-spo','ost-open','ost-resect'].includes(toolKey);

    // Determine value color — angle = orange-red, mm = green, mismatch = red
    const getValueColor = () => {
        if (value.includes('°')) return 'var(--val-bad)';
        if (value.includes('mm')) return 'var(--val-good)';
        return 'var(--text-2)';
    };

    const renderDetails = () => {
        if (['ost-pso','ost-spo','ost-open','ost-resect'].includes(toolKey)) {
            const angleRad = m?.measurement?.rotationAngleRad;
            const angleText = typeof angleRad === 'number' && Number.isFinite(angleRad)
                ? `${Math.abs(angleRad * 180 / Math.PI).toFixed(1)}°`
                : (typeof m?.result === 'string' ? m.result : 'Pending');
            return (
                <div style={{ padding: '4px 0 4px 8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, color: 'var(--text-2)' }}>
                        <span>Angle</span>
                        <span style={{ fontWeight: 700, color: 'var(--val-angle)' }}>{angleText}</span>
                    </div>
                </div>
            );
        }

        if (['vbm','spondy','pelvis','pi_ll','cmc','rvad','circle','ellipse','polygon'].includes(toolKey) && m.result) {
            const detailResult = formatResultWithCalibration(m.result, pixelToMm, shouldConvert);
            const lines = (detailResult || m.result).split('\n');
            const FORMAT_MAP: Record<string, string> = {
                'PI': 'Pelvic Incidence', 'PT': 'Pelvic Tilt', 'SS': 'Sacral Slope',
                'LL': 'Lumbar Lordosis', 'PI - LL': 'PI-LL Mismatch',
                'SD': 'Slip Distance', 'SP': 'Slip %', 'SA': 'Slip Angle',
                'Rib Angle R': 'Rib Angle (R)', 'Rib Angle L': 'Rib Angle (L)', 'RVAD': 'RVAD',
            };
            return (
                <div style={{ padding: '4px 0 4px 8px' }}>
                    {lines.map((line: string, i: number) => {
                        const parts = line.split(': ');
                        if (parts.length < 2) return null;
                        const [key, val] = parts;
                        const displayKey = (toolKey === 'vbm' ? VBM_FULL_FORMS[key] : FORMAT_MAP[key]) || key;
                        return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                                <span style={{ color: 'var(--text-2)' }}>{displayKey}</span>
                                <span style={{ fontWeight: 700, color: val.includes('°') ? 'var(--val-bad)' : val.includes('mm') ? 'var(--val-good)' : 'var(--text)' }}>{val}</span>
                            </div>
                        );
                    })}
                </div>
            );
        }

        if (['screw','rod','cage','plate'].includes(toolKey) && m.properties) {
            const { properties: props } = m;
            const rows: [string, string][] = [];
            if (toolKey === 'screw') {
                if (props.length) rows.push(['Length', `${Math.round(props.length)} mm`]);
                if (props.diameter) rows.push(['Diameter', `${props.diameter} mm`]);
            } else if (toolKey === 'rod') {
                if (props.diameter) rows.push(['Diameter', `${props.diameter} mm`]);
            } else if (toolKey === 'cage') {
                if (props.height) rows.push(['Height', `${props.height} mm`]);
                if (props.width) rows.push(['Width', `${props.width || 12} mm`]);
            } else if (toolKey === 'plate') {
                if (props.length) rows.push(['Length', `${Math.round(props.length)} mm`]);
            }
            return rows.length ? (
                <div style={{ padding: '4px 0 4px 8px' }}>
                    {rows.map(([k, v], i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                            <span style={{ color: 'var(--text-2)' }}>{k}</span>
                            <span style={{ fontWeight: 700, color: 'var(--text)' }}>{v}</span>
                        </div>
                    ))}
                </div>
            ) : null;
        }
        return null;
    };

    return (
        <div style={{ marginBottom: 2 }}>
            {/* Level input for applicable tools */}
            {['vbm','cobb','cl','tk','ll','sc'].includes(toolKey) && (
                <input
                    type="text"
                    placeholder="Level (e.g. L4)…"
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    onBlur={updateLevel}
                    onKeyDown={(e) => e.key === 'Enter' && updateLevel()}
                    style={{
                        width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
                        borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--text)',
                        marginBottom: 2, outline: 'none', display: 'block',
                    }}
                />
            )}

            {/* Main row */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    cursor: hasDetails ? 'pointer' : 'default',
                    gap: 8,
                }}
                onClick={() => hasDetails && setExpanded((o) => !o)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    {!m.isImplant && (
                        <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => { onCheckedChange(!!v); }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: 13, height: 13, flexShrink: 0 }}
                        />
                    )}
                    <span style={{
                        fontSize: 13,
                        color: 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                    }}>
                        {label}
                        {level && <span style={{ fontSize: 9, background: 'var(--accent-soft)', color: 'var(--accent)', padding: '1px 4px', borderRadius: 3, marginLeft: 5, fontWeight: 700 }}>{level}</span>}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {hasDetails ? (
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {value !== 'Metrics' && value !== 'Properties' ? value : null}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                                style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .14s', color: 'var(--text-3)' }}>
                                <path d="M6 9l6 6 6-6" />
                            </svg>
                        </span>
                    ) : (
                        <span style={{ fontSize: 13, fontWeight: 700, color: getValueColor(), whiteSpace: 'nowrap' }}>
                            {value}
                        </span>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', opacity: 0.5, flexShrink: 0 }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--val-bad)'; (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.opacity = '0.5'; }}
                    >
                        <Trash2 size={11} />
                    </button>
                </div>
            </div>

            {/* Expanded details */}
            {expanded && hasDetails && renderDetails()}
        </div>
    );
};

/* ── ComparisonTable ──────────────────────────────────────────── */
const COMPARISON_GROUPS: Record<string, string> = {
    'pi_ll': 'Sagittal Alignment',
    'sva': 'Sagittal Alignment',
    'tk': 'Sagittal Alignment',
    'll': 'Sagittal Alignment',
    'pt': 'Sagittal Alignment',
    'cobb': 'Coronal Alignment',
    'csvl': 'Coronal Alignment',
    'ts': 'Coronal Alignment',
    'avt': 'Coronal Alignment',
    'rvad': 'Coronal Alignment',
    'pi': 'Pelvic Parameters',
    'ss': 'Pelvic Parameters',
    'c7pl': 'Global',
    'tpa': 'Global',
    'spa': 'Global',
    'ssa': 'Global',
    't1spi': 'Global',
    't9spi': 'Global',
    'odha': 'Global',
    'cbva': 'Global',
};

const ComparisonTable = ({
    leftMeasurements, rightMeasurements, category,
    leftPixelToMm, rightPixelToMm,
    leftCalibrationApplied, rightCalibrationApplied,
    leftCalibrationEnabledAt, rightCalibrationEnabledAt,
}: {
    leftMeasurements: any[]; rightMeasurements: any[]; category: string;
    leftPixelToMm: number | null; rightPixelToMm: number | null;
    leftCalibrationApplied: boolean; rightCalibrationApplied: boolean;
    leftCalibrationEnabledAt: number | null; rightCalibrationEnabledAt: number | null;
}) => {
    const shouldConvert = (m: any, applied: boolean, enabledAt: number | null) => {
        if (!applied || !m) return false;
        if (m?.measurement?.calibrateAllConverted) return true;
        if (typeof enabledAt === 'number' && typeof m?.timestamp === 'number') return m.timestamp >= enabledAt;
        return false;
    };

    const extractNum = (m: any, ratio: number | null, applied: boolean, enabledAt: number | null) => {
        const r = formatResultWithCalibration(m?.result, ratio, shouldConvert(m, applied, enabledAt));
        if (!m || !r) return null;
        const lines = r.split('\n');
        if (lines.length > 1) {
            const obj: Record<string, number> = {};
            lines.forEach((line: string) => {
                const parts = line.split(': ');
                if (parts.length === 2) {
                    const v = parseFloat(parts[1].replace(/[^\d.-]/g, ''));
                    if (!isNaN(v)) obj[parts[0].trim()] = v;
                }
            });
            return obj;
        }
        const match = r.match(/(-?\d+(\.\d+)?)/);
        return match ? parseFloat(match[0]) : null;
    };

    const getUnit = (text: string | null) => {
        if (!text) return '';
        if (text.includes('°')) return '°';
        if (text.includes('mm²')) return 'mm²';
        if (text.includes('mm')) return 'mm';
        if (text.includes('%')) return '%';
        return '';
    };

    const tableData = useMemo(() => {
        const data: Array<{ key: string; level: string; left: any; right: any }> = [];
        const seen = new Set<string>();
        [...leftMeasurements, ...rightMeasurements].forEach((item) => {
            if (item.toolKey === 'point') return;
            if (REF_LINE_KEYS.has(item.toolKey)) return;
            const level = item.measurement?.level || '';
            const groupKey = `${item.toolKey}-${level}`;
            if (seen.has(groupKey)) return;
            seen.add(groupKey);
            data.push({
                key: item.toolKey, level,
                left: leftMeasurements.find((m) => m.toolKey === item.toolKey && (m.measurement?.level || '') === level),
                right: rightMeasurements.find((m) => m.toolKey === item.toolKey && (m.measurement?.level || '') === level),
            });
        });
        return data.sort((a, b) => a.key.localeCompare(b.key));
    }, [leftMeasurements, rightMeasurements]);

    const groupedData = useMemo(() => {
        const groups = new Map<string, typeof tableData>();
        const ORDER = ['Sagittal Alignment', 'Coronal Alignment', 'Pelvic Parameters', 'Global', 'Other'];
        tableData.forEach((item) => {
            const groupName = COMPARISON_GROUPS[item.key] || 'Other';
            if (!groups.has(groupName)) groups.set(groupName, []);
            groups.get(groupName)!.push(item);
        });
        return ORDER.filter((g) => groups.has(g)).map((g) => ({
            label: g,
            items: groups.get(g)!,
        }));
    }, [tableData]);

    if (!tableData.length) {
        return (
            <div style={{ textAlign: 'center', padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 24, opacity: 0.5 }}>✏️</div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>No measurements yet.</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Place measurements on either study to begin comparison.</div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, paddingBottom: 6, borderBottom: '1px solid var(--border-2)' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>Parameter</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textAlign: 'right' }}>Current Study</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textAlign: 'right' }}>Selected Study</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textAlign: 'right' }}>Change</span>
            </div>
            {groupedData.map((group) => (
                <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        {group.label}
                    </div>
                    {group.items.map(({ key, level, left, right }) => {
                        const lr = formatResultWithCalibration(left?.result, leftPixelToMm, shouldConvert(left, leftCalibrationApplied, leftCalibrationEnabledAt));
                        const rr = formatResultWithCalibration(right?.result, rightPixelToMm, shouldConvert(right, rightCalibrationApplied, rightCalibrationEnabledAt));
                        const lv = extractNum(left, leftPixelToMm, leftCalibrationApplied, leftCalibrationEnabledAt);
                        const rv = extractNum(right, rightPixelToMm, rightCalibrationApplied, rightCalibrationEnabledAt);
                        const lu = getUnit(lr);
                        const ru = getUnit(rr);
                        const cmpUnit = lu && lu === ru ? lu : '';

                        if (typeof lv === 'object' && lv !== null) {
                            const rvObj = typeof rv === 'object' ? rv : {};
                            return Object.keys(lv).map((subKey) => {
                                const la = lv[subKey];
                                const ra = rvObj?.[subKey];
                                const delta = la !== undefined && ra !== undefined ? ra - la : null;
                                return (
                                    <div key={`${key}-${level}-${subKey}`} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}>
                                        <span style={{ color: 'var(--text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                            {subKey}
                                            {level && <span style={{ fontSize: 9, background: 'var(--accent-soft)', color: 'var(--accent)', padding: '1px 4px', borderRadius: 3, marginLeft: 5, fontWeight: 700 }}>{level}</span>}
                                        </span>
                                        <span style={{ textAlign: 'right', fontWeight: 500, color: 'var(--text-2)' }}>{la !== undefined ? `${la.toFixed(1)}${lu}` : '—'}</span>
                                        <span style={{ textAlign: 'right', fontWeight: 500, color: 'var(--text-2)' }}>{ra !== undefined ? `${ra.toFixed(1)}${ru}` : '—'}</span>
                                        <span style={{ textAlign: 'right', fontWeight: 600, color: delta !== null ? (delta > 0 ? 'var(--val-bad)' : 'var(--val-good)') : 'var(--text-3)' }}>
                                            {delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}${cmpUnit}` : '—'}
                                        </span>
                                    </div>
                                );
                            });
                        }

                        const lNum = typeof lv === 'number' ? lv : null;
                        const rNum = typeof rv === 'number' ? rv : null;
                        const delta = lNum !== null && rNum !== null ? rNum - lNum : null;
                        return (
                            <div key={`${key}-${level}`} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, fontSize: 13, padding: '4px 0' }}>
                                <span style={{ color: 'var(--text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                    {TOOL_DISPLAY_NAMES[key] || key}
                                    {level && <span style={{ fontSize: 9, background: 'var(--accent-soft)', color: 'var(--accent)', padding: '1px 4px', borderRadius: 3, marginLeft: 5, fontWeight: 700 }}>{level}</span>}
                                </span>
                                <span style={{ textAlign: 'right', fontWeight: 500, color: 'var(--text-2)' }}>{lNum !== null ? `${lNum.toFixed(1)}${lu}` : '—'}</span>
                                <span style={{ textAlign: 'right', fontWeight: 500, color: 'var(--text-2)' }}>{rNum !== null ? `${rNum.toFixed(1)}${ru}` : '—'}</span>
                                <span style={{ textAlign: 'right', fontWeight: 600, color: delta !== null ? (delta !== 0 ? (delta > 0 ? 'var(--val-bad)' : 'var(--val-good)') : 'var(--text-2)') : 'var(--text-3)' }}>
                                    {delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}${cmpUnit}` : '—'}
                                </span>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

/* ── Tool-to-category group labels (matches screenshot section headers) ────── */
const TOOL_GROUP_LABELS: Record<string, string> = {
    // Sagittal deformity
    'tpa': 'Sagittal Deformity',
    'ssa': 'Sagittal Deformity',
    'spa': 'Sagittal Deformity',
    't1spi': 'Sagittal Deformity',
    't9spi': 'Sagittal Deformity',
    'odha': 'Sagittal Deformity',
    'cbva': 'Sagittal Deformity',
    // Coronal deformity
    'cmc': 'Coronal Deformity',
    'ts': 'Coronal Deformity',
    'avt': 'Coronal Deformity',
    'rvad': 'Coronal Deformity',
    'po': 'Coronal Deformity',
    // Alignment
    'cobb': 'Alignment',
    'pelvis': 'Pelvic Parameters',
    'pi_ll': 'Alignment',
    'sva': 'Alignment',
    'tk': 'Alignment',
    'll': 'Alignment',
    'cl': 'Alignment',
    // Morphology
    'vbm': 'Morphology',
    'stenosis': 'Pathology',
    'spondy': 'Pathology',
    // Planning
    'ost-pso': 'Planning',
    'ost-spo': 'Planning',
    'ost-resect': 'Planning',
    'ost-open': 'Planning',
    'screw': 'Implants',
    'rod': 'Implants',
    'cage': 'Implants',
    'plate': 'Implants',
};

/** Group a flat list by category label, returning ordered sections */
function groupMeasurementsByCategory(items: any[]): { label: string; items: any[] }[] {
    const groups = new Map<string, any[]>();
    const ORDER = ['Alignment', 'Pelvic Parameters', 'Sagittal Deformity', 'Coronal Deformity', 'Morphology', 'Pathology', 'Planning', 'Implants', 'Other'];
    for (const m of items) {
        const label = TOOL_GROUP_LABELS[m.toolKey] ?? 'Other';
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label)!.push(m);
    }
    return ORDER.filter((l) => groups.has(l)).map((l) => ({ label: l, items: groups.get(l)! }));
}
function CollapseSection({ title, badge, defaultOpen = true, open: controlledOpen, onOpenChange, children }: {
    title: React.ReactNode; badge?: React.ReactNode; defaultOpen?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode;
}) {
    const [localOpen, setLocalOpen] = useState(defaultOpen);
    const isOpen = controlledOpen !== undefined ? controlledOpen : localOpen;
    const toggle = () => {
        if (onOpenChange) onOpenChange(!isOpen);
        else setLocalOpen(!isOpen);
    };
    return (
        <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            <button
                onClick={toggle}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    outline: 'none',
                }}
            >
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {badge != null && <span className="collapse-badge">{badge}</span>}
                    <ChevronDown
                        size={15}
                        style={{ color: 'var(--text-3)', transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .14s' }}
                    />
                </span>
            </button>
            {isOpen && <div style={{ padding: '0 16px 16px 16px' }}>{children}</div>}
        </div>
    );
}

/* ── Case summary (data from store only, no hardcoded values) ─── */
function CaseSummary({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
    const {
        activePatientId,
        patients,
        activeContextId,
        contexts,
        updatePatient,
        updateVisit,
        addPatient,
        addVisit,
        addStudy,
        addContext,
        setActivePatient
    } = useAppStore();

    const patient = useMemo(() => {
        if (!activePatientId) return null;
        return patients.find((p) => p.id === activePatientId) ?? null;
    }, [activePatientId, patients]);

    const context = useMemo(() => {
        if (!activeContextId) return null;
        return contexts.find((c) => c.id === activeContextId) ?? null;
    }, [activeContextId, contexts]);

    const visit = useMemo(() => {
        if (!patient || !context?.visitId) return null;
        return patient.visits.find((v) => v.id === context.visitId) ?? null;
    }, [patient, context]);

    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<string>('');
    const [notes, setNotes] = useState(visit?.comments || '');

    useEffect(() => {
        setNotes(visit?.comments || '');
    }, [visit?.comments]);

    const startEdit = (field: string, val: string) => {
        setEditingField(field);
        setEditValue(val);
    };

    const ensurePatientAndStartEdit = async (field?: string, val?: string) => {
        let currentPatientId = activePatientId;
        let currentContextId = activeContextId;
        
        if (!currentPatientId) {
            const patientId = `PAT-${Date.now().toString().slice(-6)}`;
            const visitId = Date.now().toString();
            const studyId = `std-${Date.now()}`;
            const contextId = `ctx-${Date.now()}`;

            const newPatient: any = {
                id: patientId,
                name: '',
                age: 0,
                gender: 'M',
                dob: `${new Date().getFullYear()}-01-01`,
                lastVisit: format(new Date(), 'MMM dd, yyyy'),
                visits: [],
                studies: [],
                sex: '',
                contact: ''
            };

            const newVisit: any = {
                id: visitId,
                visitNumber: '#0001',
                date: format(new Date(), 'MMMM dd, yyyy'),
                time: format(new Date(), 'hh:mm a'),
                diagnosis: 'New Diagnosis',
                comments: '',
                height: '',
                weight: '',
                consultants: 'Dr. Muthuraman (SRIHER)',
                scanCount: 0,
                scans: [],
                studies: []
            };

            const newStudy = {
                id: studyId,
                patientId: patientId,
                visitId: visitId,
                modality: 'X-Ray',
                source: 'Import',
                acquisitionDate: format(new Date(), 'yyyy-MM-dd')
            };

            const newContext = {
                id: contextId,
                patientId: patientId,
                visitId: visitId,
                studyIds: [studyId],
                mode: 'view' as const,
                name: `Study - ${format(new Date(), 'MMM dd, yyyy')}`,
                lastModified: new Date().toISOString()
            };

            await addPatient(newPatient);
            await addVisit(patientId, newVisit);
            await addStudy(newStudy);
            await addContext(newContext);
            await setActivePatient(patientId, contextId);
            
            currentPatientId = patientId;
            currentContextId = contextId;
        }

        if (field !== undefined) {
            let initialVal = val;
            if (!activePatientId) {
                if (field === 'name') initialVal = '';
                else if (field === 'age') initialVal = '';
                else if (field === 'sex') initialVal = 'M';
                else initialVal = '';
            }
            startEdit(field, initialVal || '');
        }
    };

    const handleSave = async (field: string) => {
        if (!patient) return;
        try {
            if (field === 'name') {
                await updatePatient({ ...patient, name: editValue });
            } else if (field === 'mrn') {
                await updatePatient({ ...patient, contact: editValue });
            } else if (field === 'age') {
                const ageNum = parseInt(editValue) || 0;
                const currentYear = new Date().getFullYear();
                const dob = `${currentYear - ageNum}-01-01`;
                await updatePatient({ ...patient, age: ageNum, dob });
            } else if (field === 'sex') {
                await updatePatient({ ...patient, gender: editValue as 'M' | 'F' | 'O' });
            } else if (field === 'height') {
                if (visit) {
                    await updateVisit(patient.id, visit.id, { ...visit, height: editValue });
                } else if (patient) {
                    const newVisit = { id: Date.now().toString(), visitNumber: '#0001', date: format(new Date(), 'MMMM dd, yyyy'), time: format(new Date(), 'hh:mm a'), diagnosis: 'New Diagnosis', comments: '', height: editValue, weight: '', consultants: '', scanCount: 0, scans: [], studies: [] };
                    await updateVisit(patient.id, newVisit.id, newVisit);
                }
            } else if (field === 'weight') {
                if (visit) {
                    await updateVisit(patient.id, visit.id, { ...visit, weight: editValue });
                } else if (patient) {
                    const newVisit = { id: Date.now().toString(), visitNumber: '#0001', date: format(new Date(), 'MMMM dd, yyyy'), time: format(new Date(), 'hh:mm a'), diagnosis: 'New Diagnosis', comments: '', height: '', weight: editValue, consultants: '', scanCount: 0, scans: [], studies: [] };
                    await updateVisit(patient.id, newVisit.id, newVisit);
                }
            }
        } catch (err) {
            console.error('Failed to save field', field, err);
        }
        setEditingField(null);
    };

    const handleNotesBlur = async () => {
        if (patient && visit && notes !== visit.comments) {
            try {
                await updateVisit(patient.id, visit.id, { ...visit, comments: notes });
            } catch (err) {
                console.error('Failed to save notes', err);
            }
        }
    };

    const rows = [
        { key: 'name', label: 'Patient Name', value: patient?.name || '', displayVal: activePatientId ? (patient?.name || '—') : '' },
        { key: 'mrn', label: 'MRN', value: patient?.contact || '', displayVal: activePatientId ? (patient?.contact || '—') : '' },
        { key: 'age', label: 'Age', value: patient?.age ? String(patient.age) : '', displayVal: activePatientId ? (patient?.age ? `${patient.age} yrs` : '—') : '' },
        { key: 'sex', label: 'Sex', value: patient?.gender || 'M', displayVal: activePatientId ? (patient?.gender === 'M' ? 'Male' : patient?.gender === 'F' ? 'Female' : patient?.gender || '—') : '' },
        { key: 'height', label: 'Height', value: visit?.height || '', displayVal: activePatientId ? (visit?.height ? `${visit.height} cm` : '—') : '' },
        { key: 'weight', label: 'Weight', value: visit?.weight || '', displayVal: activePatientId ? (visit?.weight ? `${visit.weight} kg` : '—') : '' },
    ];

    return (
        <CollapseSection title="Case Summary" open={isOpen} onOpenChange={onOpenChange}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-3)', paddingBottom: 4, borderBottom: '1px solid var(--border-2)' }}>
                    <span>Study Imported</span>
                    <span style={{ fontWeight: 600 }}>{activePatientId ? (patient?.lastVisit || '—') : ''}</span>
                </div>
                {rows.map((row) => (
                    <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, minHeight: 28 }}>
                        <span style={{ color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            {row.label}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {editingField === row.key ? (
                                row.key === 'sex' ? (
                                    <select
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={() => handleSave('sex')}
                                        autoFocus
                                        style={{
                                            background: 'var(--surface-2)',
                                            border: '1px solid var(--accent)',
                                            borderRadius: '4px',
                                            padding: '2px 4px',
                                            fontSize: '13px',
                                            color: 'var(--text)',
                                            outline: 'none',
                                        }}
                                    >
                                        <option value="M">Male</option>
                                        <option value="F">Female</option>
                                        <option value="O">Other</option>
                                    </select>
                                ) : (
                                    <input
                                        type={row.key === 'age' ? 'number' : 'text'}
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={() => handleSave(row.key)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSave(row.key)}
                                        autoFocus
                                        style={{
                                            background: 'var(--surface-2)',
                                            border: '1px solid var(--accent)',
                                            borderRadius: '4px',
                                            padding: '2px 6px',
                                            fontSize: '13px',
                                            color: 'var(--text)',
                                            outline: 'none',
                                            width: '120px',
                                            textAlign: 'right',
                                        }}
                                    />
                                )
                            ) : (
                                <div
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                                    onClick={() => ensurePatientAndStartEdit(row.key, row.value)}
                                >
                                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                                        {row.displayVal || (activePatientId ? '—' : '')}
                                    </span>
                                    <span style={{ color: 'var(--text-3)', fontSize: 12 }} title="Edit">
                                        ✎
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Study Notes ⓘ</span>
                    </div>
                    <textarea
                        value={activePatientId ? notes : ''}
                        onChange={(e) => setNotes(e.target.value)}
                        onBlur={handleNotesBlur}
                        placeholder={activePatientId ? (visit ? "Add notes..." : "No active visit to add notes") : ""}
                        disabled={!activePatientId || !visit}
                        style={{
                            width: '100%',
                            minHeight: 60,
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border-2)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: 12,
                            color: 'var(--text)',
                            resize: 'vertical',
                            outline: 'none',
                            opacity: (activePatientId && visit) ? 1 : 0.6,
                        }}
                    />
                </div>
            </div>
        </CollapseSection>
    );
}

const PropRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{label}</span>
        <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{value}</span>
    </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
        {children}
    </div>
);

function DicomCurrentPlan() {
    const {
        threeDImplants,
        dicom3D,
        setSelectedDicomImplant,
        removeThreeDImplant,
        setDicom3DMode,
    } = useAppStore();

    const selectedScrew = threeDImplants.find(
        i => i.id === dicom3D.selectedImplantId && i.type === 'screw'
    );
    const screwImplants = threeDImplants.filter(i => i.type === 'screw');

    const clearPlan = () => {
        const ids = useAppStore.getState().threeDImplants.map(i => i.id);
        ids.forEach(id => removeThreeDImplant(id));
        setSelectedDicomImplant(null);
        setDicom3DMode('view');
    };

    const sortedLevels = useMemo(() => {
        if (screwImplants.length === 0) return '—';
        const levels = Array.from(new Set(screwImplants.map(i => i.level)));
        if (levels.length === 1) return levels[0];
        return `${levels[0]} – ${levels[levels.length - 1]}`;
    }, [screwImplants]);

    return (
        <CollapseSection title="Current Plan" defaultOpen>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* ── Instrumentation summary ────────────────────────── */}
                <div style={{ borderBottom: '1px solid var(--border-2)', paddingBottom: 10 }}>
                    <SectionLabel>Instrumentation</SectionLabel>

                    {screwImplants.length === 0 ? (
                        <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-3)', padding: '4px 0' }}>
                            No implants placed.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
                            {screwImplants.map(imp => (
                                <div
                                    key={imp.id}
                                    onClick={() => setSelectedDicomImplant(
                                        dicom3D.selectedImplantId === imp.id ? null : imp.id
                                    )}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '4px 6px',
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        background: dicom3D.selectedImplantId === imp.id ? 'var(--surface-3)' : 'transparent',
                                        transition: 'background .15s',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (dicom3D.selectedImplantId !== imp.id) {
                                            e.currentTarget.style.background = 'var(--surface-2)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (dicom3D.selectedImplantId !== imp.id) {
                                            e.currentTarget.style.background = 'transparent';
                                        }
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 7,
                                            height: 7,
                                            borderRadius: '50%',
                                            backgroundColor: imp.properties.color ?? '#22d3ee',
                                            marginRight: 8,
                                            flexShrink: 0,
                                        }}
                                    />
                                    <span style={{ color: 'var(--text)' }}>Screw</span>
                                    <span style={{ marginLeft: 'auto', fontFamily: 'monospace', color: 'var(--text-3)', fontSize: 11 }}>
                                        {imp.level} {imp.side}
                                    </span>
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            removeThreeDImplant(imp.id);
                                            if (dicom3D.selectedImplantId === imp.id) setSelectedDicomImplant(null);
                                        }}
                                        style={{
                                            marginLeft: 8,
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: 'var(--text-3)',
                                            fontSize: 14,
                                            lineHeight: 1,
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--val-bad)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#22d3ee', marginRight: 8 }} />
                            <span style={{ color: 'var(--text-2)' }}>Screw</span>
                            <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 11 }}>{sortedLevels}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'rgba(52, 211, 153, 0.3)', marginRight: 8 }} />
                            <span style={{ color: 'var(--text-3)' }}>Rod</span>
                            <span style={{ marginLeft: 'auto', color: 'var(--text-3)', opacity: 0.5, fontSize: 11 }}>Not planned</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: 12 }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'rgba(156, 163, 175, 0.15)', marginRight: 8 }} />
                            <span style={{ color: 'var(--text-3)', opacity: 0.6 }}>Cage</span>
                            <span style={{ marginLeft: 'auto', color: 'var(--text-3)', opacity: 0.4, fontSize: 11 }}>N/A for 3D CT</span>
                        </div>
                    </div>
                </div>

                {/* ── Screw properties card ──────────────────────────── */}
                <div style={{ borderBottom: '1px solid var(--border-2)', paddingBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <SectionLabel>Screw Properties</SectionLabel>
                        <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--text-3)', opacity: 0.6 }} />
                    </div>

                    {selectedScrew ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            <PropRow label="Screw Type" value="Pedicle Screw" />
                            <PropRow label="Diameter" value={`${selectedScrew.properties.diameter} mm`} />
                            <PropRow label="Length" value={`${selectedScrew.properties.length} mm`} />
                            <PropRow label="Material" value="Titanium" />
                            <PropRow label="Levels" value={selectedScrew.level} />
                            <PropRow label="Side" value={selectedScrew.side === 'L' ? 'Left' : 'Right'} />
                            <PropRow label="Trajectory" value="Standard" />
                        </div>
                    ) : (
                        <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-3)', textAlign: 'center', padding: '8px 0' }}>
                            {screwImplants.length > 0 ? 'Select a screw to view properties' : 'No screws placed yet'}
                        </div>
                    )}
                </div>

                {/* ── Rod properties card (disabled) ───────────────────── */}
                <div style={{ borderBottom: '1px solid var(--border-2)', paddingBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <SectionLabel>Rod Properties</SectionLabel>
                        <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--text-3)', opacity: 0.2 }} />
                    </div>
                    <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--text-3)', opacity: 0.5, textAlign: 'center', padding: '2px 0' }}>
                        Rod planning — Phase 2
                    </div>
                </div>

                {/* ── Clear Plan button ──────────────────────────────── */}
                <div style={{ paddingTop: 4 }}>
                    <Button
                        variant="outline"
                        onClick={clearPlan}
                        disabled={threeDImplants.length === 0}
                        style={{
                            width: '100%',
                            borderColor: threeDImplants.length > 0 ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-2)',
                            color: threeDImplants.length > 0 ? '#f87171' : 'var(--text-3)',
                            background: 'transparent',
                            height: 36,
                            borderRadius: 8,
                            fontSize: 12.5,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                        }}
                    >
                        <Trash2 className="h-4 w-4" />
                        Clear Plan
                    </Button>
                </div>
            </div>
        </CollapseSection>
    );
}

/* ── Main RightSidebar component ────────────────────────────── */
const RightSidebar = () => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const {
        isRightSidebarOpen: storeIsRightSidebarOpen,
        toggleRightSidebar,
        setActiveDialog,
        deleteMeasurement,
        deleteImplant,
        toggleMeasurementSelection,
        setMeasurements: storeSetMeasurements,
        setCalibration,
        applyCalibrationToExistingMeasurements,
        canvas,
        isComparisonMode,
        activeCanvasSide,
        comparison,
        measurements: storeMeasurements,
        implants: storeImplants,
        activeDialog,
        dicom3D,
        isDicomMode,
        activePatientId,
        activeContextId,
        contextStates,
        patients,
        addPatient,
        addVisit,
        addStudy,
        addContext,
        setActivePatient,
        updateContextState,
        threeDImplants,
        removeThreeDImplant,
        setSelectedDicomImplant,
        setDicom3DMode,
    } = useAppStore();

    const isRightSidebarOpen = storeIsRightSidebarOpen;

    const activeContextState = useMemo(
        () =>
            contextStates.find(
                (s) => s.contextId === activeContextId
            ),
        [contextStates, activeContextId]
    );

    const measurements = useMemo(() => {
        if (isComparisonMode && activeCanvasSide) {
            return comparison[activeCanvasSide].measurements;
        }

        if (activeContextState) {
            return activeContextState.measurements ?? [];
        }

        return storeMeasurements;
    }, [
        isComparisonMode,
        activeCanvasSide,
        comparison,
        storeMeasurements,
        activeContextState,
    ]);

    const implants = useMemo(() => {
        if (isComparisonMode && activeCanvasSide) return comparison[activeCanvasSide].implants || [];
        return storeImplants || [];
    }, [isComparisonMode, activeCanvasSide, comparison, storeImplants]);

    const activeCanvas = useMemo(() => {
        if (isComparisonMode && activeCanvasSide) return comparison[activeCanvasSide].canvas;
        return canvas;
    }, [isComparisonMode, activeCanvasSide, comparison, canvas]);

    const activePixelToMm = activeCanvas?.pixelToMm ?? null;
    const activeCalibrationApplied = !!activeCanvas?.calibrationApplied && !!activePixelToMm;
    const activeCalibrationEnabledAt = activeCanvas?.calibrationEnabledAt ?? null;

    const shouldConvert = (m: any) => {
        if (!activeCalibrationApplied) return false;
        if (m?.measurement?.calibrateAllConverted) return true;
        if (typeof activeCalibrationEnabledAt === 'number' && typeof m?.timestamp === 'number')
            return m.timestamp >= activeCalibrationEnabledAt;
        return false;
    };

    // Combine measurements + implants; exclude ONLY calibration markers
    // Reference lines go into a SEPARATE section, not filtered out entirely
    const combinedItems = useMemo(() => {
        const implantItems = implants.map((imp: any) => ({
            id: imp.id, toolKey: imp.type,
            points: imp.position ? [imp.position] : [],
            properties: imp.properties, timestamp: imp.timestamp,
            selected: true, isImplant: true,
        }));
        const visibleMeasurements = measurements.filter((m: any) =>
            !m?.measurement?.isCalibration && !REF_LINE_KEYS.has(m.toolKey)
        );
        return [...visibleMeasurements, ...implantItems].sort((a: any, b: any) => b.timestamp - a.timestamp);
    }, [measurements, implants]);

    // Reference lines as a separate collection
    const refLineMeasurements = useMemo(() => {
        return measurements.filter((m: any) =>
            !m?.measurement?.isCalibration && REF_LINE_KEYS.has(m.toolKey)
        );
    }, [measurements]);



    const setMeasurements = useCallback((nextMeasurements: any[]) => {
        if (activeContextId) {
            updateContextState(activeContextId, { measurements: nextMeasurements });
        } else {
            storeSetMeasurements(nextMeasurements);
        }
    }, [activeContextId, updateContextState, storeSetMeasurements]);

    const [isReportOpen, setIsReportOpen] = useState(false);


    // Resizable panel
    const [panelWidth, setPanelWidth] = useState(320);
    const isResizing = useRef(false);
    const resizeStartX = useRef(0);
    const resizeStartWidth = useRef(0);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const delta = resizeStartX.current - e.clientX;
            setPanelWidth(Math.max(280, Math.min(520, resizeStartWidth.current + delta)));
        };
        const onUp = () => {
            isResizing.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => { document.removeEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); };
    }, []);

    console.log("LOG 3 (Left Comparison measurements):", comparison?.left?.measurements);
    console.log("LOG 4 (Right Comparison measurements):", comparison?.right?.measurements);
    console.log("LOG 5 (Selected measurements stream):", measurements);

    const filteredMeasurements = combinedItems;
    console.log("LOG 6 (filteredMeasurements in RightSidebar):", filteredMeasurements);

    const selectedCount = combinedItems.filter((m: any) => m.selected && !m.isImplant).length;

    // Check for missing patient details to show banner
    const patient = useMemo(() => {
        if (!activePatientId) return null;
        return patients.find((p) => p.id === activePatientId) ?? null;
    }, [activePatientId, patients]);

    const hasMissingPatientInfo = useMemo(() => {
        if (!patient) return true;
        return !patient.name || !patient.id || !patient.age || !patient.gender;
    }, [patient]);

    const [bannerDismissed, setBannerDismissed] = useState(false);
    const [caseSummaryOpen, setCaseSummaryOpen] = useState(false);

    useEffect(() => {
        if (!activePatientId) {
            setBannerDismissed(false);
        }
    }, [activePatientId]);

    return (
        <div
            style={{
                background: 'var(--surface)',
                borderLeft: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                width: isRightSidebarOpen ? `${panelWidth}px` : '0px',
                overflow: 'hidden',
                transition: 'width .3s',
                position: 'relative',
                height: '100%',
            }}
        >
            {/* Reveal button when closed */}
            {!isRightSidebarOpen && (
                <div style={{ position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 61 }}>
                    <Button
                        variant="secondary"
                        size="icon"
                        style={{ width: 22, height: 40, borderRadius: '6px 0 0 6px', border: '1px solid var(--border)' }}
                        onClick={() => { setActiveDialog(null); toggleRightSidebar(true); }}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {isRightSidebarOpen && (
                <>
                    {/* Collapse button when open */}
                    <div style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateX(-50%) translateY(-50%)', zIndex: 61 }}>
                        <Button
                            variant="secondary"
                            size="icon"
                            style={{ width: 22, height: 40, borderRadius: '6px 0 0 6px', border: '1px solid var(--border)', borderRight: 'none', background: 'var(--surface-2)' }}
                            onClick={() => toggleRightSidebar(false)}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Resize handle */}
                    <div
                        style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, cursor: 'ew-resize', zIndex: 50 }}
                        onMouseDown={(e) => {
                            isResizing.current = true;
                            resizeStartX.current = e.clientX;
                            resizeStartWidth.current = panelWidth;
                            document.body.style.cursor = 'ew-resize';
                            document.body.style.userSelect = 'none';
                            e.preventDefault();
                        }}
                    />

                    {/* Content area */}
                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <ScrollArea style={{ flex: 1 }}>
                            {/* Patient info missing warning banner */}
                            {hasMissingPatientInfo && !bannerDismissed && (
                                <div style={{
                                    margin: '12px 16px 0 16px',
                                    padding: '12px',
                                    border: '1px solid var(--val-bad)',
                                    background: 'rgba(239, 68, 68, 0.05)',
                                    borderRadius: 8,
                                    position: 'relative',
                                }}>
                                    <button
                                        onClick={() => setBannerDismissed(true)}
                                        style={{
                                            position: 'absolute',
                                            right: 8,
                                            top: 8,
                                            background: 'transparent',
                                            border: 'none',
                                            color: 'var(--text-3)',
                                            cursor: 'pointer',
                                            fontSize: 12,
                                        }}
                                    >
                                        ✕
                                    </button>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>
                                                Patient information missing
                                            </div>
                                            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>
                                                Complete case information before saving.
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    setCaseSummaryOpen(true);
                                                }}
                                                style={{
                                                    fontSize: 11,
                                                    height: 24,
                                                    padding: '0 8px',
                                                    borderColor: 'var(--val-bad)',
                                                    color: 'var(--val-bad)',
                                                    background: 'transparent',
                                                }}
                                            >
                                                Complete Now
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Case Summary */}
                            <CaseSummary isOpen={caseSummaryOpen} onOpenChange={setCaseSummaryOpen} />

                            {/* Measurement Comparison (only visible in compare mode) */}
                            {isComparisonMode && comparison?.left && comparison?.right && (
                                <CollapseSection title="Measurement Comparison" defaultOpen>
                                    <ComparisonTable
                                        leftMeasurements={comparison.left.measurements || []}
                                        rightMeasurements={comparison.right.measurements || []}
                                        category="All"
                                        leftPixelToMm={comparison.left.canvas.pixelToMm}
                                        rightPixelToMm={comparison.right.canvas.pixelToMm}
                                        leftCalibrationApplied={!!comparison.left.canvas.calibrationApplied}
                                        rightCalibrationApplied={!!comparison.right.canvas.calibrationApplied}
                                        leftCalibrationEnabledAt={comparison.left.canvas.calibrationEnabledAt}
                                        rightCalibrationEnabledAt={comparison.right.canvas.calibrationEnabledAt}
                                    />
                                </CollapseSection>
                            )}

                            {isDicomMode ? (
                                <DicomCurrentPlan />
                            ) : (
                                <>
                                    {/* Current measurements (hidden in Compare Mode) */}
                                    {!isComparisonMode && (
                                        <CollapseSection title="Current Measurements" badge={filteredMeasurements.length || undefined} defaultOpen>
                                            {filteredMeasurements.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ fontSize: 24, opacity: 0.5 }}>✏️</div>
                                                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>No measurements yet</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Add measurements to see results here.</div>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                                    {groupMeasurementsByCategory(filteredMeasurements).map((group) => (
                                                        <div key={group.label} className="mgroup" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            <div className="mgroup-name" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                                                                {group.label}
                                                            </div>
                                                            {group.items.map((m: any) => {
                                                                const displayName = TOOL_DISPLAY_NAMES[m.toolKey] || m.toolKey.toUpperCase();
                                                                const displayValue = formatValue(m, activePixelToMm, shouldConvert(m));
                                                                return (
                                                                    <MeasurementCard
                                                                        key={m.id}
                                                                        label={displayName}
                                                                        value={displayValue}
                                                                        range={NORMAL_RANGES[m.toolKey] || ''}
                                                                        toolKey={m.toolKey}
                                                                        checked={m.selected || false}
                                                                        onCheckedChange={() => toggleMeasurementSelection(m.id)}
                                                                        onDelete={() => m.isImplant ? deleteImplant(m.id) : deleteMeasurement(m.id)}
                                                                        setMeasurements={setMeasurements}
                                                                        m={m}
                                                                        pixelToMm={activePixelToMm}
                                                                        shouldConvert={shouldConvert(m)}
                                                                    />
                                                                );
                                                            })}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </CollapseSection>
                                    )}

                                    {/* Reference Lines section */}
                                    <CollapseSection title="Reference Lines" defaultOpen>
                                        {refLineMeasurements.length === 0 ? (
                                            <div style={{ padding: '8px 0', color: 'var(--text-3)', fontSize: 12, fontStyle: 'italic' }}>
                                                No reference lines placed yet.
                                            </div>
                                        ) : (
                                            refLineMeasurements.map((m: any) => {
                                                const formatted = formatResultWithCalibration(m.result, activePixelToMm, shouldConvert(m));
                                                const displayName = m.toolKey === 'c7pl' ? 'C7PL' : m.toolKey === 'csvl' ? 'CSVL' : (TOOL_DISPLAY_NAMES[m.toolKey] || m.toolKey.toUpperCase());
                                                const displayValue = formatted
                                                    ? formatted.replace(/\n/g, ' | ')
                                                    : (m.result ?? 'Active');
                                                return (
                                                    <div key={m.id} className="mrow" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                                                        <span className="ml" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                                                            <span style={{ fontSize: 13, color: 'var(--text)' }}>{displayName}</span>
                                                        </span>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span className="mv good" style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>{displayValue}</span>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-5 w-5"
                                                                onClick={() => deleteMeasurement(m.id)}
                                                                style={{ color: 'var(--text-3)', opacity: 0.6 }}
                                                                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--val-bad)')}
                                                                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </Button>
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </CollapseSection>
                                </>
                            )}

                    {/* Spacer for fixed footer */}
                    <div style={{ height: 40 }} />
                        </ScrollArea>
                    </div>
                </>
            )}

            <ReportDialog
                open={isReportOpen}
                onOpenChange={setIsReportOpen}
                checkedCount={selectedCount}
            />


        </div>
    );
};

export default RightSidebar;
