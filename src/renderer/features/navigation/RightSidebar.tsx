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
import { TOOL_DISPLAY_NAMES } from '@/features/measurements/toolNames';
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { PlanPanel } from "@/features/planning3d/PlanPanel";
import { defaultStudyName } from "@/lib/store/types";
import { useAppStore } from "@/lib/store/index";
import { useShallow } from "zustand/react/shallow";
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
    Eye,
    EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MODULE_TOOL_MAPPING } from "./toolConstants";
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
import { assessMeasurement, inferAnterior, latestPI, STATUS_COLOR, type AssessContext, type RangeStatus } from "@/features/measurements/clinicalRanges";
import {
    calculateOpenOsteotomyPrimitives,
    calculateResectionPrimitives,
} from "@/features/measurements/planning/PlanningTools";
import { useLocation } from 'react-router-dom';
import { PlanSummary } from "@/features/planning2d/PlanSummary";
import { dobForAge } from "@/lib/studies";
import { modalityLabel, persistSeriesInBackground, readDicomInfo, type DicomInfo } from "@/features/dicom/dicomPersistence";
import { compareVersionMeasurements, imageBoxOf, isPlanMeasurement } from "@/features/planning2d/plan";
import type { Measurement } from "@/lib/canvas/CanvasManager";

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
    if (['screw', 'rod', 'cage', 'plate'].includes(m.toolKey)) return implantSummary(m, shouldConvert ? pixelToMm : null);
    const formatted = formatResultWithCalibration(m.result, pixelToMm, shouldConvert);
    return formatted ? formatted.replace(/\n/g, ' | ') : '-';
};

/* ── MeasurementCard — screenshot-style row (label left, value right) ──────── */
/** One-line implant size for the card (mm when calibrated). Editing happens on the image (UI5-05). */
const implantSummary = (m: any, pixelToMm: number | null): string => {
    const p = m.properties ?? {};
    const f = (px: number) => (pixelToMm ? (px * pixelToMm).toFixed(1) : px.toFixed(0));
    const u = pixelToMm ? 'mm' : 'px';
    if (m.toolKey === 'screw') return `${f(p.length ?? 0)} × Ø${f(p.diameter ?? 0)} ${u}`;
    if (m.toolKey === 'cage') return `${f(p.width ?? 0)} × ${f(p.height ?? 0)} ${u} · ${(p.wedgeAngle ?? 0).toFixed(0)}°`;
    if (m.toolKey === 'rod') return `Ø${f(p.diameter ?? 0)} ${u}`;
    if (m.toolKey === 'plate') return `${f(p.height ?? 0)} ${u}`;
    return '';
};

const MeasurementCard = ({
    label, value, range, toolKey, checked, onCheckedChange, onDelete,
    setMeasurements, m, pixelToMm, shouldConvert, ctx,
}: {
    label: string; value: string; range: string; toolKey: string;
    checked: boolean; onCheckedChange: (v: boolean) => void; onDelete: () => void;
    setMeasurements: (m: any[]) => void; m: any;
    pixelToMm: number | null; shouldConvert: boolean;
    ctx: AssessContext;
}) => {
    const [expanded, setExpanded] = useState(false);
    const [level, setLevel] = useState(m.measurement?.level || '');

    const updateLevel = async () => {
        const st = useAppStore.getState();
        const manager = st.managers[st.isComparisonMode && st.activeCanvasSide === 'right' ? 'right' : 'main'];
        if (!manager) return;
        const newState = await manager.applyOperation('UPDATE_MEASUREMENT', {
            id: m.id,
            measurement: { ...m.measurement, level },
        });
        if (newState) setMeasurements(newState.data.measurements);
    };

    const hasDetails = ['vbm','spondy','pelvis','pi_ll','cmc','rvad','circle','ellipse','polygon',
        'ost-pso','ost-spo','ost-open','ost-resect'].includes(toolKey);

    // Clinical colour: green healthy / yellow borderline / red abnormal;
    // normal text when the app doesn't judge this value (UI8-05).
    const colorOf = (st: RangeStatus) => (st ? STATUS_COLOR[st] : 'var(--text)');
    const main = m.isImplant ? { status: null, range: '' } : assessMeasurement(m, '', ctx);
    const rangeText = main.range || range;
    // Multi-value tools: worst status of their judged lines, shown as a dot when collapsed
    const lineKeys = toolKey === 'pelvis' ? ['PI'] : toolKey === 'pi_ll' ? ['PI', 'LL', 'PI - LL'] : [];
    const lineStatuses = lineKeys.map((k) => assessMeasurement(m, k, ctx).status);
    const worst: RangeStatus = lineStatuses.includes('bad') ? 'bad' : lineStatuses.includes('borderline') ? 'borderline' : lineStatuses.includes('good') ? 'good' : null;

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
                                <span style={{ fontWeight: 700, color: colorOf(assessMeasurement(m, key, ctx).status) }}>{val}</span>
                            </div>
                        );
                    })}
                </div>
            );
        }

        return null;
    };

    const hasLevel = ['vbm','cobb','cl','tk','ll','sc'].includes(toolKey);
    const [editingLevel, setEditingLevel] = useState(false);

    return (
        <div className="ss-mcard">
            <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: hasDetails ? 'pointer' : 'default' }}
                onClick={() => hasDetails && setExpanded((o) => !o)}
            >
                {!m.isImplant ? (
                    // Eye: shown on the image AND included in the report; off hides both (UI8-02)
                    <button
                        className="ss-mcard-eye"
                        onClick={(e) => { e.stopPropagation(); onCheckedChange(!checked); }}
                        title={checked ? 'Shown on image and in report — click to hide' : 'Hidden from image and report — click to show'}
                        aria-pressed={checked}
                        style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6, flexShrink: 0, color: checked ? 'var(--text-2)' : 'var(--text-3)', opacity: checked ? 1 : 0.6 }}
                    >
                        {checked ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                ) : (
                    <span className="ss-mcard-chip">{toolKey.slice(0, 1).toUpperCase()}</span>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {label}
                        </span>
                        {hasLevel && !editingLevel && (
                            <button
                                className="ss-mcard-level"
                                onClick={(e) => { e.stopPropagation(); setEditingLevel(true); }}
                                title="Set vertebral level"
                            >
                                {level || '+ level'}
                            </button>
                        )}
                    </div>
                    {hasLevel && editingLevel ? (
                        <input
                            autoFocus
                            type="text"
                            placeholder="e.g. L4"
                            value={level}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setLevel(e.target.value)}
                            onBlur={() => { setEditingLevel(false); void updateLevel(); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            className="ss-mcard-input"
                        />
                    ) : rangeText ? (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Normal {rangeText}</div>
                    ) : null}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {value && value !== 'Metrics' && value !== 'Properties' && (
                        <span style={{ fontSize: 15, fontWeight: 700, color: colorOf(main.status), fontVariantNumeric: 'tabular-nums', textAlign: 'right', maxWidth: 140, overflowWrap: 'anywhere', lineHeight: 1.2 }}>
                            {value}
                        </span>
                    )}
                    {worst && !expanded && (
                        <span title="Worst value in this measurement" style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_COLOR[worst], flexShrink: 0 }} />
                    )}
                    {hasDetails && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .14s', color: 'var(--text-3)' }}>
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    )}
                    <button
                        className="ss-mcard-delete"
                        title="Delete"
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    >
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>

            {expanded && hasDetails && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-2)' }}>{renderDetails()}</div>
            )}
        </div>
    );
};

/* ── ComparisonTable ──────────────────────────────────────────── */
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
        tableData.forEach((item) => {
            const groupName = TOOL_GROUP_LABELS[item.key] || 'Others';
            if (!groups.has(groupName)) groups.set(groupName, []);
            groups.get(groupName)!.push(item);
        });
        return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({
            label: g,
            items: groups.get(g)!,
        }));
    }, [tableData]);

    if (!tableData.length) {
        return (
            <div style={{ textAlign: 'center', padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
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

/* ── Categories mirror the left-sidebar tabs (UI5-10) ────────── */
const TOOL_GROUP_LABELS: Record<string, string> = {
    // Alignment (pelvic parameters included)
    cobb: 'Alignment', pelvis: 'Alignment', pi_ll: 'Alignment', sva: 'Alignment',
    tk: 'Alignment', ll: 'Alignment', cl: 'Alignment', sc: 'Alignment',
    // Extended → coronal deformity
    cmc: 'Coronal Deformity', rvad: 'Coronal Deformity', ts: 'Coronal Deformity',
    avt: 'Coronal Deformity', po: 'Coronal Deformity', slope: 'Coronal Deformity',
    // Extended → sagittal deformity
    tpa: 'Sagittal Deformity', spa: 'Sagittal Deformity', ssa: 'Sagittal Deformity',
    t1spi: 'Sagittal Deformity', t9spi: 'Sagittal Deformity', odha: 'Sagittal Deformity', cbva: 'Sagittal Deformity',
    // Morphology
    vbm: 'Morphology', stenosis: 'Morphology', spondy: 'Morphology',
    // Planning
    'ost-pso': 'Planning', 'ost-spo': 'Planning', 'ost-resect': 'Planning', 'ost-open': 'Planning', itilt: 'Planning',
    // Instruments
    screw: 'Instruments', rod: 'Instruments', cage: 'Instruments', plate: 'Instruments',
};
const GROUP_ORDER = ['Alignment', 'Coronal Deformity', 'Sagittal Deformity', 'Morphology', 'Planning', 'Instruments', 'Others'];

/** Group a flat list by category label, returning ordered sections */
function groupMeasurementsByCategory(items: any[]): { label: string; items: any[] }[] {
    const groups = new Map<string, any[]>();
    for (const m of items) {
        const label = TOOL_GROUP_LABELS[m.toolKey] ?? 'Others';
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label)!.push(m);
    }
    return GROUP_ORDER.filter((l) => groups.has(l)).map((l) => ({ label: l, items: groups.get(l)! }));
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
    } = useAppStore(useShallow((s) => ({ activePatientId: s.activePatientId, patients: s.patients, activeContextId: s.activeContextId, contexts: s.contexts, updatePatient: s.updatePatient, updateVisit: s.updateVisit, addPatient: s.addPatient, addVisit: s.addVisit, addStudy: s.addStudy, addContext: s.addContext, setActivePatient: s.setActivePatient })));

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
    const shownDiagnosis = (d?: string) => (d && d !== 'New Diagnosis' ? d : '');
    const [diagnosis, setDiagnosis] = useState(shownDiagnosis(visit?.diagnosis));

    useEffect(() => {
        setNotes(visit?.comments || '');
    }, [visit?.comments]);
    useEffect(() => {
        setDiagnosis(shownDiagnosis(visit?.diagnosis));
    }, [visit?.diagnosis]);

    // Diagnosis lives on the visit, so the header, dashboard and report pick it up (UI6-08).
    const saveDiagnosis = async () => {
        const next = diagnosis.trim();
        if (!patient || !visit || next === shownDiagnosis(visit.diagnosis)) return;
        try {
            await updateVisit(patient.id, visit.id, { ...visit, diagnosis: next });
        } catch (err) {
            console.error('Failed to save diagnosis', err);
        }
    };

    const startEdit = (field: string, val: string) => {
        setEditingField(field);
        setEditValue(val);
    };

    const creatingCaseRef = useRef(false);
    const dicomInfoRef = useRef<DicomInfo | null>(null);
    const ensurePatientAndStartEdit = async (field?: string, val?: string) => {
        let currentPatientId = activePatientId;
        let currentContextId = activeContextId;
        
        if (!currentPatientId) {
            // Promote the untitled session to a real study exactly once.
            if (creatingCaseRef.current) return;
            creatingCaseRef.current = true;
            const patientId = `PAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
            const visitId = crypto.randomUUID();
            const studyId = `std-${crypto.randomUUID()}`;
            const contextId = `ctx-${crypto.randomUUID()}`;

            // An untitled DICOM series: take modality / patient details from its headers (UI10-08)
            const st0 = useAppStore.getState();
            const seriesFiles = st0.isDicomMode ? (st0.dicomSeries as unknown[]).filter((f): f is File => f instanceof File) : [];
            dicomInfoRef.current = seriesFiles.length ? await readDicomInfo(seriesFiles[0]) : null;
            const dx = dicomInfoRef.current;

            const newPatient: any = {
                id: patientId,
                name: dx?.patientName ?? '',
                age: dx?.age ?? 0,
                gender: dx?.sex ?? 'M',
                dob: dx?.birthDate ?? `${new Date().getFullYear()}-01-01`,
                lastVisit: format(new Date(), 'MMM dd, yyyy'),
                visits: [],
                studies: [],
                sex: '',
                contact: dx?.patientId ?? ''
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
                modality: seriesFiles.length ? modalityLabel(dx?.modality) : 'X-Ray',
                source: 'Import',
                acquisitionDate: dx?.studyDate ?? format(new Date(), 'yyyy-MM-dd'),
                name: defaultStudyName('Study'),
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

            try {
                await addPatient(newPatient);
                await addVisit(patientId, newVisit);
                await addStudy(newStudy);
                // addContext carries the untitled canvas (image + measurements)
                // into the new study and makes it active — no reload needed,
                // so the live canvas is kept as-is.
                await addContext(newContext);
                // The series itself is uploaded as the study's scans (UI10-08)
                if (seriesFiles.length) persistSeriesInBackground(patientId, studyId, seriesFiles);
            } catch (e) {
                console.error('Could not create study for untitled session', e);
                alert('Could not save this session as a study. Please check your connection and try again.');
                return;
            } finally {
                creatingCaseRef.current = false;
            }

            currentPatientId = patientId;
            currentContextId = contextId;
        }

        if (field !== undefined) {
            let initialVal = val;
            if (!activePatientId) {
                const dx = dicomInfoRef.current;
                if (field === 'name') initialVal = dx?.patientName ?? '';
                else if (field === 'age') initialVal = dx?.age ? String(dx.age) : '';
                else if (field === 'sex') initialVal = dx?.sex ?? 'M';
                else if (field === 'mrn') initialVal = dx?.patientId ?? '';
                else initialVal = '';
            }
            startEdit(field, initialVal || '');
        }
    };

    const handleSave = async (field: string) => {
        if (!patient) return;
        // Close the editor at once: the store shows the new value before the server answers (LAG-01)
        setEditingField(null);
        try {
            if (field === 'name') {
                await updatePatient({ ...patient, name: editValue });
            } else if (field === 'mrn') {
                await updatePatient({ ...patient, contact: editValue });
            } else if (field === 'age') {
                const ageNum = parseInt(editValue) || 0;
                await updatePatient({ ...patient, age: ageNum, dob: dobForAge(ageNum, patient.dob) });
            } else if (field === 'sex') {
                await updatePatient({ ...patient, gender: editValue as 'M' | 'F' | 'O' });
            } else if (field === 'height') {
                if (visit) {
                    await updateVisit(patient.id, visit.id, { ...visit, height: editValue });
                } else if (patient) {
                    const newVisit = { id: crypto.randomUUID(), visitNumber: '#0001', date: format(new Date(), 'MMMM dd, yyyy'), time: format(new Date(), 'hh:mm a'), diagnosis: 'New Diagnosis', comments: '', height: editValue, weight: '', consultants: '', scanCount: 0, scans: [], studies: [] };
                    // No visit yet: create one (updateVisit only edits existing ones — BUGS WS-18)
                    await addVisit(patient.id, newVisit);
                }
            } else if (field === 'weight') {
                if (visit) {
                    await updateVisit(patient.id, visit.id, { ...visit, weight: editValue });
                } else if (patient) {
                    const newVisit = { id: crypto.randomUUID(), visitNumber: '#0001', date: format(new Date(), 'MMMM dd, yyyy'), time: format(new Date(), 'hh:mm a'), diagnosis: 'New Diagnosis', comments: '', height: '', weight: editValue, consultants: '', scanCount: 0, scans: [], studies: [] };
                    // No visit yet: create one (updateVisit only edits existing ones — BUGS WS-18)
                    await addVisit(patient.id, newVisit);
                }
            }
        } catch (err) {
            console.error('Failed to save field', field, err);
            alert(`Couldn't save the change: ${err instanceof Error ? err.message : 'server error'}. Please try again.`);
        }
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
                    <div
                        key={row.key}
                        className={editingField === row.key ? '' : 'ss-editable-row'}
                        onClick={() => { if (editingField !== row.key) ensurePatientAndStartEdit(row.key, row.value); }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, minHeight: 30, padding: '0 6px', margin: '0 -6px', borderRadius: 6, cursor: editingField === row.key ? 'default' : 'text' }}
                    >
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
                                <span style={{ color: row.displayVal && row.displayVal !== '—' ? 'var(--text)' : 'var(--text-3)', fontWeight: 500 }}>
                                    {row.displayVal && row.displayVal !== '—' ? row.displayVal : `Add ${row.label.toLowerCase()}`}
                                </span>
                            )}
                        </div>
                    </div>
                ))}

                <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Study Notes ⓘ</span>
                    </div>
                    <div style={{
                        border: '1px solid var(--border-2)', borderRadius: 6, background: 'var(--surface-2)',
                        opacity: (activePatientId && visit) ? 1 : 0.6,
                    }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border-2)' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', flexShrink: 0 }}>Diagnosis</span>
                            <input
                                value={activePatientId ? diagnosis : ''}
                                onChange={(e) => setDiagnosis(e.target.value)}
                                onBlur={saveDiagnosis}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                disabled={!activePatientId || !visit}
                                placeholder="e.g. Adolescent idiopathic scoliosis"
                                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}
                            />
                        </label>
                    <textarea
                        value={activePatientId ? notes : ''}
                        onChange={(e) => setNotes(e.target.value)}
                        onBlur={handleNotesBlur}
                        placeholder={activePatientId ? (visit ? "Add notes..." : "No active visit to add notes") : ""}
                        disabled={!activePatientId || !visit}
                        style={{
                            display: 'block',
                            width: '100%',
                            minHeight: 60,
                            background: 'transparent',
                            border: 'none',
                            padding: '6px 10px',
                            fontSize: 12,
                            color: 'var(--text)',
                            resize: 'vertical',
                            outline: 'none',
                        }}
                    />
                    </div>
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
    return (
        <CollapseSection title="Current Plan" defaultOpen>
            <PlanPanel />
        </CollapseSection>
    );
}

/* ── ReportRightSidebar Component ───────────────────────────── */
const ReportRightSidebar = () => {
    return (
        <div style={{ padding: '16px 0', color: 'var(--text-2)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginBottom: 12 }}>Section Properties</h3>
            <p style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.8 }}>
                Select a section from the Left Sidebar to configure its properties here.
            </p>
            <div style={{ marginTop: 24, padding: 16, background: 'var(--surface-2)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                <p style={{ fontSize: 12, textAlign: 'center', opacity: 0.6 }}>No section selected</p>
            </div>
        </div>
    );
};

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
    } = useAppStore(useShallow((s) => ({ isRightSidebarOpen: s.isRightSidebarOpen, toggleRightSidebar: s.toggleRightSidebar, setActiveDialog: s.setActiveDialog, deleteMeasurement: s.deleteMeasurement, deleteImplant: s.deleteImplant, toggleMeasurementSelection: s.toggleMeasurementSelection, setMeasurements: s.setMeasurements, setCalibration: s.setCalibration, applyCalibrationToExistingMeasurements: s.applyCalibrationToExistingMeasurements, canvas: s.canvas, isComparisonMode: s.isComparisonMode, activeCanvasSide: s.activeCanvasSide, comparison: s.comparison, measurements: s.measurements, implants: s.implants, activeDialog: s.activeDialog, dicom3D: s.dicom3D, isDicomMode: s.isDicomMode, activePatientId: s.activePatientId, activeContextId: s.activeContextId, contextStates: s.contextStates, patients: s.patients, addPatient: s.addPatient, addVisit: s.addVisit, addStudy: s.addStudy, addContext: s.addContext, setActivePatient: s.setActivePatient, updateContextState: s.updateContextState, threeDImplants: s.threeDImplants, removeThreeDImplant: s.removeThreeDImplant, setSelectedDicomImplant: s.setSelectedDicomImplant, setDicom3DMode: s.setDicom3DMode })));

    const location = useLocation();
    const isReportTab = new URLSearchParams(location.search).get('tab') === 'report';
    const isPlanningTab = location.pathname === '/workspace' && new URLSearchParams(location.search).get('tab') === 'planning';

    const isRightSidebarOpen = storeIsRightSidebarOpen;

    const activeContextState = useMemo(
        () =>
            contextStates.find(
                (s) => s.contextId === activeContextId
            ),
        [contextStates, activeContextId]
    );

    const imageAMeasurements = (all: Measurement[]) => {
        const fragments = (useAppStore.getState().managers.main?.current?.data.fragments ?? []) as { polygon: { x: number; y: number }[] }[];
        return compareVersionMeasurements(all, comparison.left.planId ?? null, activeContextState?.toolState, imageBoxOf(fragments));
    };

    const measurements = useMemo(() => {
        if (isComparisonMode && activeCanvasSide === 'right') {
            return comparison.right.measurements;
        }

        const all = activeContextState ? (activeContextState.measurements ?? []) : storeMeasurements;
        // Compare Image A shows the chosen version: No plan / Plan N / working plan (UI12-20)
        if (isComparisonMode) return imageAMeasurements(all);
        return all;
    }, [
        isComparisonMode,
        activeCanvasSide,
        comparison,
        storeMeasurements,
        activeContextState,
    ]);

    const implants = useMemo(() => {
        if (isComparisonMode && activeCanvasSide === 'right') return comparison.right.implants || [];
        return activeContextState?.implants ?? storeImplants ?? [];
    }, [isComparisonMode, activeCanvasSide, comparison, storeImplants, activeContextState]);

    const activeCanvas = useMemo(() => {
        if (isComparisonMode && activeCanvasSide === 'right') return comparison.right.canvas;
        return canvas;
    }, [isComparisonMode, activeCanvasSide, comparison, canvas]);

    const activePixelToMm = activeCanvas?.pixelToMm ?? null;
    const activeCalibrationApplied = !!activeCanvas?.calibrationApplied && !!activePixelToMm;
    const activeCalibrationEnabledAt = activeCanvas?.calibrationEnabledAt ?? null;

    // Context for clinical colour coding: age, PI, facing direction (UI8-05)
    const rangeCtx = useMemo(() => {
        const patientAge = patients.find((p) => p.id === activePatientId)?.age;
        return {
            age: patientAge && patientAge > 0 ? patientAge : null,
            pi: latestPI(measurements),
            anterior: inferAnterior(measurements),
        };
    }, [patients, activePatientId, measurements]);

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
        // Assessment / Compare list the preop measurements; Planning lists the plan items (UI9-05).
        const visibleMeasurements = measurements.filter((m: any) =>
            !m?.measurement?.isCalibration && !REF_LINE_KEYS.has(m.toolKey)
            && (isPlanningTab ? isPlanMeasurement(m) : !isPlanMeasurement(m))
        );
        return [...visibleMeasurements, ...(isPlanningTab ? implantItems : [])].sort((a: any, b: any) => b.timestamp - a.timestamp);
    }, [measurements, implants, isPlanningTab]);

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
        return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    }, []);

    const filteredMeasurements = combinedItems;
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
    const [caseSummaryOpen, setCaseSummaryOpen] = useState(true);
    // Each time a case is opened: collapsed when its details are complete,
    // open when something is missing. Never auto-closes while editing.
    const summaryDecidedFor = useRef<string | null>(null);
    useEffect(() => {
        const key = activePatientId ?? '__untitled__';
        if (summaryDecidedFor.current === key) return;
        if (activePatientId && !patient) return; // wait for the patient record
        summaryDecidedFor.current = key;
        setCaseSummaryOpen(hasMissingPatientInfo);
    }, [activePatientId, patient, hasMissingPatientInfo]);

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
                flexShrink: 0,
                overflow: 'hidden',
                transition: 'width .3s',
                position: 'relative',
                height: '100%',
            }}
        >
            {isRightSidebarOpen && (
                <>
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

                            {isReportTab ? (
                                <ReportRightSidebar />
                            ) : (
                                <>
                                    {/* Case Summary */}
                                    <CaseSummary isOpen={caseSummaryOpen} onOpenChange={setCaseSummaryOpen} />

                            {/* Measurement Comparison (only visible in compare mode) */}
                            {isComparisonMode && comparison?.left && comparison?.right && (
                                <CollapseSection title="Measurement Comparison" defaultOpen>
                                    <ComparisonTable
                                        leftMeasurements={imageAMeasurements(activeContextState?.measurements ?? storeMeasurements ?? [])}
                                        rightMeasurements={comparison.right.measurements || []}
                                        category="All"
                                        leftPixelToMm={canvas.pixelToMm}
                                        rightPixelToMm={comparison.right.canvas.pixelToMm}
                                        leftCalibrationApplied={!!canvas.calibrationApplied}
                                        rightCalibrationApplied={!!comparison.right.canvas.calibrationApplied}
                                        leftCalibrationEnabledAt={canvas.calibrationEnabledAt}
                                        rightCalibrationEnabledAt={comparison.right.canvas.calibrationEnabledAt}
                                    />
                                </CollapseSection>
                            )}

                            {/* Planning: plans, targets and preop-vs-plan tables (UI9-05) */}
                            {isPlanningTab && !isDicomMode && (
                                <CollapseSection title="Plan" defaultOpen>
                                    <PlanSummary names={TOOL_DISPLAY_NAMES} />
                                </CollapseSection>
                            )}

                            {isDicomMode ? (
                                <DicomCurrentPlan />
                            ) : (
                                <>
                                    {/* Measurements of the active image (Image A or B in Compare) */}
                                    {(
                                        <CollapseSection
                                            title={isComparisonMode ? (activeCanvasSide === 'right' ? 'Image B Measurements' : 'Image A Measurements') : isPlanningTab ? 'Plan Items' : 'Current Measurements'}
                                            badge={filteredMeasurements.length || undefined}
                                            defaultOpen>
                                            {filteredMeasurements.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
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
                                                                        onCheckedChange={() => toggleMeasurementSelection(m.id, !m.selected)}
                                                                        onDelete={() => m.isImplant ? deleteImplant(m.id) : deleteMeasurement(m.id)}
                                                                        setMeasurements={setMeasurements}
                                                                        m={m}
                                                                        pixelToMm={activePixelToMm}
                                                                        shouldConvert={shouldConvert(m)}
                                                                        ctx={{ ...rangeCtx, mmPerPx: shouldConvert(m) ? activePixelToMm : null }}
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
                        </>
                    )}

                    {/* Spacer for fixed footer */}
                    <div style={{ height: 40 }} />
                        </ScrollArea>
                    </div>
                </>
            )}



        </div>
    );
};

export default RightSidebar;
