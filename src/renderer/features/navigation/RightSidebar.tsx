import { useState, useMemo, useRef, useEffect } from "react";
import { useAppStore } from "@/lib/store/index";
import {
    ChevronDown,
    ChevronRight,
    ChevronLeft,
    FileText,
    Activity,
    Target,
    Settings2,
    Ruler,
    Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { MODULE_TOOL_MAPPING } from "./toolConstants";
import { ReportDialog } from "./ReportDialog";
import { VBM_FULL_FORMS } from "../measurements/quick/VBM";
import { calculateOpenOsteotomyPrimitives, calculateResectionPrimitives } from "@/features/measurements/planning/PlanningTools";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

const NORMAL_RANGES: Record<string, string> = {
    'pi': '(40° - 65°)',
    'pt': '(10° - 25°)',
    'ss': '(30° - 50°)',
    'sva': '(< 50mm)',
    'pi_ll': '(< 10°)',
    'cobb': '(0° - 10°)',
    'angle-4pt': '(0° - 10°)',
    'angle-2pt': '',
    'angle-3pt': '',
    'cl': '(35° - 45°)',
    'tk': '(20° - 40°)',
    'll': '(40° - 60°)',
    'pelvis': '',
    'point': 'Coord'
};

const TOOL_DISPLAY_NAMES: Record<string, string> = {
    'cobb': 'Cobb',
    'angle-4pt': '4 pt angle',
    'angle-2pt': '2 pt angle',
    'angle-3pt': '3 pt angle',
    'sva': 'SVA',
    'vbm': 'Vertebral Body Metrics',
    'pi_ll': 'PI-LL Mismatch',
    'pi': 'Pelvic Incidence (PI)',
    'pt': 'Pelvic Tilt (PT)',
    'ss': 'Sacral Slope (SS)',
    'combined': 'Combined Params',
    'cl': 'Cervical Lordosis (CL)',
    'tk': 'Thoracic Kyphosis (TK)',
    'll': 'Lumbar Lordosis (LL)',
    'sc': 'Custom Curve',
    'point': 'Point Marker',
    'stenosis': 'Stenosis',
    'spondy': 'Spondylolisthesis',
    'line': 'Distance Line',
    'pelvis': 'Pelvic Parameters',
    'cm': 'Center of Mass',
    'csvl': 'CSVL',
    'c7pl': 'C7 Plumbline',
    'ts': 'Trunk Shift',
    'avt': 'Apical Vert. Trans.',
    'rvad': 'RVAD',
    'po': 'Pelvic Obliquity',
    'itilt': 'Instrumented Tilt',
    'tpa': 'TPA',
    'spa': 'SPA',
    'ssa': 'SSA',
    't1spi': 'T1SPI',
    't9spi': 'T9SPI',
    'odha': 'ODHA',
    'cbva': 'CBVA',
    'slope': 'Slope',
    'cmc': 'Cobb Multi-Curve',
    'pencil': 'Pencil Trace',
    'text': 'Label',
    'circle': 'Circle',
    'ellipse': 'Ellipse',
    'polygon': 'Polygon',
    'ost-pso': 'Pedicle Subtraction Osteotomy (PSO)',
    'ost-spo': 'Smith-Petersen Osteotomy (SPO)',
    'ost-resect': 'Resection Plan',
    'ost-open': 'Opening Wedge',
    'screw': 'Pedicle Screw',
    'rod': 'Spinal Rod',
    'cage': 'Interbody Cage',
    'plate': 'Spinal Plate'
};

const formatResultWithCalibration = (result: unknown, pixelToMm: number | null, shouldConvert: boolean): string | null => {
    if (typeof result !== 'string') {
        return null;
    }

    if (!pixelToMm || !shouldConvert) {
        return result;
    }

    // Convert area units first so px tokens inside px² are not consumed by the linear conversion.
    const withAreaConverted = result.replace(/(-?\d+(?:\.\d+)?)\s*px²/gi, (_, raw: string) => {
        const value = Number.parseFloat(raw);
        if (!Number.isFinite(value)) {
            return _;
        }
        return `${(value * pixelToMm * pixelToMm).toFixed(1)} mm²`;
    });

    return withAreaConverted.replace(/(-?\d+(?:\.\d+)?)\s*px\b/gi, (_, raw: string) => {
        const value = Number.parseFloat(raw);
        if (!Number.isFinite(value)) {
            return _;
        }
        return `${(value * pixelToMm).toFixed(1)} mm`;
    });
};

const getResultUnit = (text: string | null): string => {
    if (!text) return '';
    if (text.includes('°')) return '°';
    if (text.includes('mm²')) return 'mm²';
    if (text.includes('mm')) return 'mm';
    if (text.includes('px²')) return 'px²';
    if (text.includes('px')) return 'px';
    if (text.includes('%')) return '%';
    return '';
};

const ComparisonTable = ({
    leftMeasurements,
    rightMeasurements,
    category,
    leftPixelToMm,
    rightPixelToMm,
    leftCalibrationApplied,
    rightCalibrationApplied,
    leftCalibrationEnabledAt,
    rightCalibrationEnabledAt,
}: {
    leftMeasurements: any[];
    rightMeasurements: any[];
    category: string;
    leftPixelToMm: number | null;
    rightPixelToMm: number | null;
    leftCalibrationApplied: boolean;
    rightCalibrationApplied: boolean;
    leftCalibrationEnabledAt: number | null;
    rightCalibrationEnabledAt: number | null;
}) => {
    const shouldConvertMeasurement = (m: any, calibrationApplied: boolean, calibrationEnabledAt: number | null) => {
        if (!calibrationApplied || !m) return false;
        if (m?.measurement?.calibrateAllConverted) return true;
        if (typeof calibrationEnabledAt === 'number' && typeof m?.timestamp === 'number') {
            return m.timestamp >= calibrationEnabledAt;
        }
        return false;
    };

    const extractValues = (m: any, pixelToMm: number | null, calibrationApplied: boolean, calibrationEnabledAt: number | null) => {
        const formattedResult = formatResultWithCalibration(
            m?.result,
            pixelToMm,
            shouldConvertMeasurement(m, calibrationApplied, calibrationEnabledAt),
        );
        if (!m || !formattedResult) return null;

        // Multi-line results (like PI, PT, SS)
        const lines = formattedResult.split('\n');
        if (lines.length > 1) {
            const results: Record<string, number> = {};
            lines.forEach((line: string) => {
                const parts = line.split(': ');
                if (parts.length === 2) {
                    const val = parseFloat(parts[1].replace(/[^\d.-]/g, ''));
                    if (!isNaN(val)) results[parts[0].trim()] = val;
                }
            });
            return results;
        }

        // Single value
        const match = formattedResult.match(/(-?\d+(\.\d+)?)/);
        return match ? parseFloat(match[0]) : null;
    };

    // Unified list of keys + levels
    const tableData = useMemo(() => {
        const data: Array<{ key: string, level: string, left: any, right: any }> = [];
        const processed = new Set<string>();

        const allItems = [...leftMeasurements, ...rightMeasurements];

        // Group by toolKey and Level
        allItems.forEach(item => {
            if (item.toolKey === 'point') return;
            if (category !== 'All' && !MODULE_TOOL_MAPPING[category as keyof typeof MODULE_TOOL_MAPPING]?.includes(item.toolKey)) return;

            const level = item.measurement?.level || "";
            const groupKey = `${item.toolKey}-${level}`;

            if (processed.has(groupKey)) return;
            processed.add(groupKey);

            const left = leftMeasurements.find(m => m.toolKey === item.toolKey && (m.measurement?.level || "") === level);
            const right = rightMeasurements.find(m => m.toolKey === item.toolKey && (m.measurement?.level || "") === level);

            data.push({ key: item.toolKey, level, left, right });
        });

        return data.sort((a, b) => a.key.localeCompare(b.key));
    }, [leftMeasurements, rightMeasurements, category]);

    return (
        <div className="space-y-4 p-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xl ring-1 ring-border/5">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-muted/50 border-b border-border">
                            <th className="p-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Metric</th>
                            <th className="p-3 text-[10px] font-bold text-primary uppercase tracking-widest text-right">Pre-Op</th>
                            <th className="p-3 text-[10px] font-bold text-emerald-500 uppercase tracking-widest text-right">Post-Op</th>
                            <th className="p-3 text-[10px] font-bold text-amber-500 uppercase tracking-widest text-right">Delta</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {tableData.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="p-10 text-center">
                                    <div className="flex flex-col items-center gap-3 opacity-40">
                                        <Activity className="h-10 w-10 text-muted-foreground" />
                                        <p className="text-[11px] text-muted-foreground font-medium italic">
                                            No comparable measurements found.<br />Ensure levels match for auto-pairing.
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : tableData.map(({ key, level, left, right }) => {
                            const leftResult = formatResultWithCalibration(
                                left?.result,
                                leftPixelToMm,
                                shouldConvertMeasurement(left, leftCalibrationApplied, leftCalibrationEnabledAt),
                            );
                            const rightResult = formatResultWithCalibration(
                                right?.result,
                                rightPixelToMm,
                                shouldConvertMeasurement(right, rightCalibrationApplied, rightCalibrationEnabledAt),
                            );
                            const lv = extractValues(left, leftPixelToMm, leftCalibrationApplied, leftCalibrationEnabledAt);
                            const rv = extractValues(right, rightPixelToMm, rightCalibrationApplied, rightCalibrationEnabledAt);
                            const leftUnit = getResultUnit(leftResult);
                            const rightUnit = getResultUnit(rightResult);
                            const comparableUnit = leftUnit && leftUnit === rightUnit ? leftUnit : '';

                            // Handle complex multi-value (PI, PT, SS)
                            if (typeof lv === 'object' && lv !== null && typeof rv === 'object' && rv !== null) {
                                return Object.keys(lv).map(subKey => {
                                    const lVal = lv[subKey];
                                    const rVal = rv?.[subKey]; // Use optional chaining to be safe
                                    const delta = (lVal !== undefined && rVal !== undefined) ? rVal - lVal : null;
                                    const deltaDisplay = comparableUnit
                                        ? `${delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}${comparableUnit}` : '—'}`
                                        : '—';

                                    return (
                                        <tr key={`${key}-${level}-${subKey}`} className="hover:bg-muted/30 transition-colors border-l-2 border-transparent hover:border-primary/50">
                                            <td className="p-3">
                                                <div className="text-[11px] font-bold text-foreground flex items-center gap-2">
                                                    {subKey}
                                                    {level && <span className="text-[9px] bg-primary/10 text-primary px-1.5 rounded-md font-bold">{level}</span>}
                                                </div>
                                            </td>
                                            <td className="p-3 text-right text-[11px] text-muted-foreground tabular-nums font-medium">
                                                {lVal !== undefined ? `${lVal.toFixed(1)}${leftUnit}` : '—'}
                                            </td>
                                            <td className="p-3 text-right text-[11px] text-muted-foreground tabular-nums font-medium">
                                                {rVal !== undefined ? `${rVal.toFixed(1)}${rightUnit}` : '—'}
                                            </td>
                                            <td className={`p-3 text-right text-[11px] font-bold tabular-nums ${delta !== null && delta !== 0 ? (delta > 0 ? 'text-primary' : 'text-emerald-500') : 'text-muted-foreground/30'}`}>
                                                {deltaDisplay}
                                            </td>
                                        </tr>
                                    );
                                });
                            }

                            // Handle normal numeric value
                            const lNum = typeof lv === 'number' ? lv : null;
                            const rNum = typeof rv === 'number' ? rv : null;
                            const delta = (lNum !== null && rNum !== null) ? rNum - lNum : null;
                            const deltaDisplay = comparableUnit
                                ? `${delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}${comparableUnit}` : '—'}`
                                : '—';

                            return (
                                <tr key={`${key}-${level}`} className="hover:bg-muted/50 transition-colors border-l-2 border-transparent">
                                    <td className="p-3">
                                        <div className="text-[11px] font-bold text-foreground flex items-center gap-2">
                                            {TOOL_DISPLAY_NAMES[key] || key}
                                            {level && <span className="text-[9px] bg-primary/10 text-primary px-1.5 rounded-md font-bold">{level}</span>}
                                        </div>
                                    </td>
                                    <td className="p-3 text-right text-[11px] text-muted-foreground tabular-nums font-medium">
                                        {lNum !== null ? `${lNum.toFixed(1)}${leftUnit}` : '—'}
                                    </td>
                                    <td className="p-3 text-right text-[11px] text-muted-foreground tabular-nums font-medium">
                                        {rNum !== null ? `${rNum.toFixed(1)}${rightUnit}` : '—'}
                                    </td>
                                    <td className={`p-3 text-right text-[11px] font-bold tabular-nums ${delta !== null ? (delta !== 0 ? (delta > 0 ? 'text-primary' : 'text-emerald-500') : 'text-muted-foreground/30') : 'text-muted-foreground/30'}`}>
                                        {deltaDisplay}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="px-1 pt-2">
                <p className="text-[10px] text-muted-foreground font-medium italic leading-relaxed opacity-60">
                    * Delta is calculated as (Post-Op - Pre-Op). Positive values indicate an increase in magnitude.
                </p>
            </div>
        </div>
    );
};

const formatValue = (m: any, pixelToMm: number | null, shouldConvert: boolean) => {
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
            if (data) {
                return `Resection: ${Math.abs(data.rotationAngleRad * 180 / Math.PI).toFixed(1)}°`;
            }
        }

        if ((m.toolKey === 'ost-pso' || m.toolKey === 'ost-spo') && Array.isArray(m.points) && m.points.length >= 3) {
            const p = m.points[0];
            const h = m.points[1];
            const a = m.points[2];
            const moving = Math.atan2(p.y - h.y, p.x - h.x);
            const fixed = Math.atan2(a.y - h.y, a.x - h.x);
            const normalized = ((fixed - moving + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
            return `Correction: ${Math.abs(normalized * 180 / Math.PI).toFixed(1)}°`;
        }

        if (m.toolKey === 'ost-open') return 'Opening: Pending';
        if (m.toolKey === 'ost-resect') return 'Resection: Pending';
        return 'Correction: Pending';
    }

    if (m.toolKey === 'point' && m.points[0]) {
        return `${Math.round(m.points[0].x)}, ${Math.round(m.points[0].y)}`;
    }
    if (['vbm', 'spondy', 'pelvis', 'pi_ll', 'cmc', 'rvad', 'circle', 'ellipse', 'polygon'].includes(m.toolKey)) {
        return "Metrics";
    }
    // Handle implants
    if (['screw', 'rod', 'cage', 'plate'].includes(m.toolKey)) {
        return "Properties";
    }
    const formattedResult = formatResultWithCalibration(m.result, pixelToMm, shouldConvert);
    return formattedResult ? formattedResult.replace(/\n/g, ' | ') : 'Pending';
};

const MeasurementCard = ({ label, value, range, toolKey, checked, onCheckedChange, onDelete, setMeasurements, m, pixelToMm, shouldConvert }: {
    label: string,
    value: string,
    range: string,
    toolKey: string,
    checked: boolean,
    onCheckedChange: (checked: boolean) => void,
    onDelete: () => void,
    setMeasurements: (measurements: any[]) => void,
    m: any,
    pixelToMm: number | null,
    shouldConvert: boolean
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [level, setLevel] = useState(m.measurement?.level || "");

    const updateLevel = async () => {
        const manager = (window as any).canvasManager;
        if (manager) {
            const newState = await manager.applyOperation('UPDATE_MEASUREMENT', {
                id: m.id,
                measurement: { ...m.measurement, level }
            });
            if (newState) {
                setMeasurements(newState.data.measurements);
            }
        }
    };

    const renderDetails = () => {
        if (['ost-pso', 'ost-spo', 'ost-open', 'ost-resect'].includes(toolKey)) {
            const angleRad = m?.measurement?.rotationAngleRad;
            const angleText = typeof angleRad === 'number' && Number.isFinite(angleRad)
                ? `${Math.abs(angleRad * 180 / Math.PI).toFixed(1)}°`
                : (typeof m?.result === 'string' ? m.result : 'Pending');
            const hingePoint = m?.measurement?.hingePoint;
            const cutRayCount = Array.isArray(m?.measurement?.cutRays) ? m.measurement.cutRays.length : 0;

            return (
                <div className="mt-3 space-y-1.5 p-3 bg-muted/40 rounded-xl border border-border shadow-inner">
                    <div className="flex justify-between items-center leading-tight">
                        <span className="text-[10px] text-muted-foreground font-bold truncate mr-2">Angle:</span>
                        <span className="text-[10px] font-bold text-foreground tabular-nums whitespace-nowrap">
                            {angleText}
                        </span>
                    </div>
                    {hingePoint && (
                        <div className="flex justify-between items-center leading-tight">
                            <span className="text-[10px] text-muted-foreground font-bold truncate mr-2">Hinge:</span>
                            <span className="text-[10px] font-bold text-foreground tabular-nums whitespace-nowrap">
                                {Math.round(hingePoint.x)}, {Math.round(hingePoint.y)}
                            </span>
                        </div>
                    )}
                    {cutRayCount > 0 && (
                        <div className="flex justify-between items-center leading-tight">
                            <span className="text-[10px] text-muted-foreground font-bold truncate mr-2">Cut Rays:</span>
                            <span className="text-[10px] font-bold text-foreground tabular-nums whitespace-nowrap">
                                {cutRayCount}
                            </span>
                        </div>
                    )}
                </div>
            );
        }

        if (['vbm', 'spondy', 'pelvis', 'pi_ll', 'cmc', 'rvad', 'circle', 'ellipse', 'polygon'].includes(toolKey) && m.result) {
            const detailResult = formatResultWithCalibration(m.result, pixelToMm, shouldConvert);
            const lines = (detailResult || m.result).split('\n');
            const FORMAT_MAP: Record<string, string> = {
                'PI': 'Pelvic Incidence',
                'PT': 'Pelvic Tilt',
                'SS': 'Sacral Slope',
                'LL': 'Lumbar Lordosis',
                'PI-LL': 'PI-LL Mismatch',
                'SD': 'Slip Distance',
                'SP': 'Slip Percentage',
                'SA': 'Slip Angle',
                'Rib Angle R': 'Rib Angle (Right)',
                'Rib Angle L': 'Rib Angle (Left)',
                'RVAD': 'Rib Vert. Angle Diff.'
            };

            return (
                <div className="mt-3 space-y-1.5 p-3 bg-muted/40 rounded-xl border border-border shadow-inner">
                    {lines.map((line: string, i: number) => {
                        const parts = line.split(': ');
                        if (parts.length < 2) return null;
                        let [key, val] = parts;

                        // Map keys to full forms if available
                        const displayKey = (toolKey === 'vbm' ? VBM_FULL_FORMS[key] : FORMAT_MAP[key]) || key;

                        return (
                            <div key={i} className="flex justify-between items-center leading-tight">
                                <span className="text-[10px] text-muted-foreground font-bold truncate mr-2">{displayKey}:</span>
                                <span className="text-[10px] font-bold text-foreground tabular-nums whitespace-nowrap">{val}</span>
                            </div>
                        );
                    })}
                </div>
            );
        }

        // Handle implant properties
        if (['screw', 'rod', 'cage', 'plate'].includes(toolKey) && m.properties) {
            const props = m.properties;
            const implantDetails: Array<{ key: string; value: string }> = [];

            if (toolKey === 'screw') {
                if (props.length) implantDetails.push({ key: 'Length', value: `${Math.round(props.length)} mm` });
                if (props.diameter) implantDetails.push({ key: 'Diameter', value: `${props.diameter} mm` });
            } else if (toolKey === 'rod') {
                if (props.diameter) implantDetails.push({ key: 'Diameter', value: `${props.diameter} mm` });
                // Calculate rod length if points are available
                if (props.points && props.points.length >= 2) {
                    const p1 = props.points[0];
                    const p2 = props.points[props.points.length - 1];
                    const length = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
                    implantDetails.push({ key: 'Rod Length', value: `${Math.round(length)} px` });
                }
            } else if (toolKey === 'cage') {
                if (props.height) implantDetails.push({ key: 'Height', value: `${props.height} mm` });
                if (props.width) implantDetails.push({ key: 'Width', value: `${props.width || 12} mm` });
                if (props.wedgeAngle !== undefined) implantDetails.push({ key: 'Lordosis Angle', value: `${props.wedgeAngle}°` });
            } else if (toolKey === 'plate') {
                if (props.length) implantDetails.push({ key: 'Length', value: `${Math.round(props.length)} mm` });
                if (props.diameter) implantDetails.push({ key: 'Thickness', value: `${props.diameter} mm` });
            }

            if (implantDetails.length > 0) {
                return (
                    <div className="mt-3 space-y-1.5 p-3 bg-muted/40 rounded-xl border border-border shadow-inner">
                        {implantDetails.map((detail, i) => (
                            <div key={i} className="flex justify-between items-center leading-tight">
                                <span className="text-[10px] text-muted-foreground font-bold truncate mr-2">{detail.key}:</span>
                                <span className="text-[10px] font-bold text-foreground tabular-nums whitespace-nowrap">{detail.value}</span>
                            </div>
                        ))}
                    </div>
                );
            }
        }

        return null;
    };

    const hasDetails = ['vbm', 'spondy', 'pelvis', 'pi_ll', 'cmc', 'rvad', 'circle', 'ellipse', 'polygon', 'screw', 'rod', 'cage', 'plate', 'ost-pso', 'ost-spo', 'ost-open', 'ost-resect'].includes(toolKey);

    return (
        <div className={cn(
            "bg-secondary/40 border-transparent rounded-xl p-3 hover:bg-secondary/60 transition-all duration-300 group shadow-sm",
            isExpanded && "bg-card border border-primary/20 shadow-md ring-1 ring-primary/5"
        )}>
            <div className="flex items-start justify-between mb-1">
                <div className="flex flex-col">
                    <div className="text-[11px] font-bold text-foreground uppercase tracking-tight group-hover:text-primary transition-colors flex items-center gap-1.5">
                        {label}
                        {toolKey === 'vbm' && m.measurement?.vbmMode && (
                            <span className="text-[8px] opacity-60 font-mono">({m.measurement.vbmMode.toUpperCase()})</span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {!m.isImplant && (
                        <Checkbox
                            checked={checked}
                            onCheckedChange={(val) => onCheckedChange(!!val)}
                            className="h-3 w-3 rounded-sm border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500"
                        onClick={onDelete}
                    >
                        <Trash2 className="h-2.5 w-2.5" />
                    </Button>
                </div>
            </div>

            {/* Level Input - Only for appropriate tools */}
            {['vbm', 'cobb', 'cl', 'tk', 'll', 'sc', 'slope'].includes(toolKey) && (
                <div className="mb-2">
                    <input
                        type="text"
                        placeholder="Level (e.g. L4)..."
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                        onBlur={updateLevel}
                        onKeyDown={(e) => e.key === 'Enter' && updateLevel()}
                        className="w-full bg-background border border-border rounded-lg px-2 py-1 text-[10px] text-foreground font-bold placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
                    />
                </div>
            )}

            <div className={`flex items-center justify-between ${hasDetails ? 'cursor-pointer' : ''}`} onClick={() => hasDetails && setIsExpanded(!isExpanded)}>
                <div className="flex items-baseline gap-1">
                    <span className={cn(
                        "text-sm text-foreground/90 tabular-nums",
                        (value === 'Metrics' || value.includes('displayed')) ? "font-normal opacity-70" : "font-medium"
                    )}>
                        {value}
                    </span>
                    {range && range !== 'Coord' && (
                        <span className="text-[8px] text-muted-foreground font-medium opacity-50">
                            {range}
                        </span>
                    )}
                </div>
                <div className="flex items-center">
                    {toolKey === 'point' && <Target className="h-2 w-2 text-muted-foreground opacity-30" />}
                    {hasDetails && (
                        <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                            <ChevronDown className="h-3.5 w-3.5 text-primary" />
                        </div>
                    )}
                </div>
            </div>

            {isExpanded && renderDetails()}
        </div>
    );
};

const RightSidebar = () => {
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
        isDicomMode
    } = useAppStore();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    const isRightSidebarOpen = storeIsRightSidebarOpen && (!isDicomMode || dicom3D.activeView === 'all') && !activeDialog;

    const measurements = useMemo(() => {
        if (isComparisonMode && activeCanvasSide) {
            return comparison[activeCanvasSide].measurements;
        }
        return storeMeasurements;
    }, [isComparisonMode, activeCanvasSide, comparison, storeMeasurements]);

    const implants = useMemo(() => {
        if (isComparisonMode && activeCanvasSide) {
            return comparison[activeCanvasSide].implants || [];
        }
        return storeImplants || [];
    }, [isComparisonMode, activeCanvasSide, comparison, storeImplants]);

    const activeCanvas = useMemo(() => {
        if (isComparisonMode && activeCanvasSide) {
            return comparison[activeCanvasSide].canvas;
        }
        return canvas;
    }, [isComparisonMode, activeCanvasSide, comparison, canvas]);

    const activePixelToMm = activeCanvas?.pixelToMm ?? null;
    const activeCalibrationApplied = !!activeCanvas?.calibrationApplied && !!activePixelToMm;
    const activeCalibrationEnabledAt = activeCanvas?.calibrationEnabledAt ?? null;

    const shouldConvertMeasurement = (m: any) => {
        if (!activeCalibrationApplied) return false;
        if (m?.measurement?.calibrateAllConverted) return true;
        if (typeof activeCalibrationEnabledAt === 'number' && typeof m?.timestamp === 'number') {
            return m.timestamp >= activeCalibrationEnabledAt;
        }
        return false;
    };

    // Combine measurements and implants for unified display
    const combinedItems = useMemo(() => {
        const implantItems = implants.map((implant: any) => ({
            id: implant.id,
            toolKey: implant.type,
            points: implant.position ? [implant.position] : [],
            properties: implant.properties,
            timestamp: implant.timestamp,
            selected: true, // Implants are always selected for now
            isImplant: true
        }));
        const visibleMeasurements = measurements.filter((m: any) => !m?.measurement?.isCalibration);
        return [...visibleMeasurements, ...implantItems].sort((a, b) => b.timestamp - a.timestamp);
    }, [measurements, implants]);

    // Auto-Open Logic (only opens, never auto-closes)
    const prevCountRef = useRef(combinedItems.length);
    useEffect(() => {
        const currentCount = combinedItems.length;
        const prevCount = prevCountRef.current;

        // Only auto-open when first measurement is added
        if (prevCount === 0 && currentCount > 0) {
            toggleRightSidebar(true);
        }

        prevCountRef.current = currentCount;
    }, [combinedItems.length, toggleRightSidebar]);

    const setMeasurements = (m: any[]) => {
        storeSetMeasurements(m);
    };
    const [category, setCategory] = useState("All");
    const [isReportOpen, setIsReportOpen] = useState(false);

    // Resize functionality
    const [panelWidth, setPanelWidth] = useState(320); // Default width in pixels
    const isResizing = useRef(false);
    const resizeStartX = useRef(0);
    const resizeStartWidth = useRef(0);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const delta = resizeStartX.current - e.clientX;
            const newWidth = Math.max(280, Math.min(600, resizeStartWidth.current + delta));
            setPanelWidth(newWidth);
        };

        const handleMouseUp = () => {
            isResizing.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const handleResizeStart = (e: React.MouseEvent) => {
        isResizing.current = true;
        resizeStartX.current = e.clientX;
        resizeStartWidth.current = panelWidth;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    };

    const filteredMeasurements = useMemo(() => {
        if (category === "All") return combinedItems;
        const validTools = MODULE_TOOL_MAPPING[category] || [];
        return combinedItems.filter(m => validTools.includes(m.toolKey));
    }, [combinedItems, category]);

    const handleToggleCheck = (id: string, checked: boolean) => {
        toggleMeasurementSelection(id, checked);
    };

    const handleCalibrateAll = () => {
        if (!activePixelToMm) {
            return;
        }
        applyCalibrationToExistingMeasurements();
    };

    const handleUndoCalibration = () => {
        setCalibration(null);
    };

    const handleGenerateReport = () => setIsReportOpen(true);

    const selectedCount = combinedItems.filter(m => m.selected && !(m as any).isImplant).length;

    return (
        <div
            className={cn(
                "bg-background border-l border-border flex flex-col shadow-2xl z-[60] transition-all duration-300 relative h-full",
                !isRightSidebarOpen && "w-0 border-none"
            )}
            style={{ width: isRightSidebarOpen ? `${panelWidth}px` : '0px' }}
        >
            {/* Reveal Button (only when closed) */}
            {!isRightSidebarOpen && (
                <div className="fixed right-0 top-1/2 -translate-y-1/2 z-[61]">
                    <Button
                        variant="secondary"
                        size="icon"
                        className="h-10 w-6 rounded-l-md border border-border bg-background hover:bg-muted"
                        onClick={() => {
                            setActiveDialog(null);
                            toggleRightSidebar(true);
                        }}
                    >
                        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </Button>
                </div>
            )}

            {/* Content Wrapper for Animation */}
            <div className={cn(
                "flex flex-col h-full w-full overflow-hidden transition-opacity duration-300",
                !isRightSidebarOpen ? "opacity-0 pointer-events-none invisible" : "opacity-100"
            )} style={{ width: isRightSidebarOpen ? `${panelWidth}px` : '0px' }}>

                {/* Resize Handle */}
                <div
                    className="absolute -left-1 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/20 transition-colors z-50 group"
                    onMouseDown={handleResizeStart}
                >
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary/0 group-hover:bg-primary/50 transition-colors" />
                </div>

                {/* Toggle Handle inside the visible sidebar */}


                <div className="flex flex-col h-full">
                    <div className="p-3.5 border-b border-border bg-card sticky top-0 z-10 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <Activity className="h-4 w-4 text-primary" />
                            </div>
                            <h2 className="text-[11px] font-bold text-foreground tracking-wide uppercase">
                                {isComparisonMode ? `Measurement Panel - View ${activeCanvasSide === 'left' ? 'A' : 'B'}` : "Measurement Panel"}
                            </h2>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => toggleRightSidebar()} className="h-7 w-7 rounded-sm hover:bg-muted">
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    </div>

                    {/* Compact Controls */}
                    <div className="px-3 py-2 bg-muted flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="flex-1 justify-between bg-background border-border text-foreground hover:bg-muted h-8 px-2">
                                        <div className="flex items-center gap-1.5 overflow-hidden">
                                            <Settings2 className="h-3 w-3 opacity-50 shrink-0" />
                                            <span className="text-[10px] font-bold uppercase tracking-tight truncate">{category}</span>
                                        </div>
                                        <ChevronDown className="h-3 w-3 opacity-30 shrink-0" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    style={{ width: `${panelWidth - 24}px` }}
                                    className={cn(
                                        "shadow-[0_1px_2px_rgba(0,0,0,.04),0_8px_24px_rgba(0,0,0,.08)] z-[100] rounded-xl overflow-hidden !opacity-100",
                                        isDark ? "!bg-[#141416] !text-[#F5F5F7] border border-[#242427]" : "!bg-white !text-slate-900"
                                    )}
                                >
                                    {["All", "Quick Measure", "Deformity", "Pathology", "Planning Suite", "Utilities"].map((cat) => (
                                        <DropdownMenuItem
                                            key={cat}
                                            onClick={() => setCategory(cat)}
                                            className="text-xs hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground cursor-pointer py-2 px-3 font-semibold transition-colors"
                                        >
                                            {cat}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <div className={`flex items-center gap-1.5 px-2 h-8 rounded-md border text-[9px] font-bold uppercase tracking-tight shrink-0
                        ${activeCalibrationApplied
                                    ? 'bg-blue-600/10 border-blue-500/20 text-blue-500'
                                    : 'bg-amber-600/10 border-amber-500/20 text-amber-600'}`}>
                                <Ruler className="h-3 w-3" />
                                <span>{activeCalibrationApplied ? 'Calibrated' : 'Uncalibrated'}</span>
                            </div>
                        </div>

                        {activePixelToMm && (
                            <div className="text-[9px] text-muted-foreground/60 font-medium px-1 flex justify-between items-center bg-muted/30 rounded py-0.5">
                                <span className="uppercase tracking-widest opacity-50">Scale Matrix</span>
                                <span className="tabular-nums font-bold">1px ≈ {activePixelToMm.toFixed(3)}mm</span>
                            </div>
                        )}
                    </div>

                    <Separator className="bg-slate-200 dark:bg-slate-800" />

                    {/* List */}
                    <ScrollArea className="flex-1">
                        {isComparisonMode ? (
                            <div className="pb-24">
                                {comparison && comparison.left && comparison.right && (
                                    <ComparisonTable
                                        leftMeasurements={comparison.left.measurements || []}
                                        rightMeasurements={comparison.right.measurements || []}
                                        category={category}
                                        leftPixelToMm={comparison.left.canvas.pixelToMm}
                                        rightPixelToMm={comparison.right.canvas.pixelToMm}
                                        leftCalibrationApplied={!!comparison.left.canvas.calibrationApplied}
                                        rightCalibrationApplied={!!comparison.right.canvas.calibrationApplied}
                                        leftCalibrationEnabledAt={comparison.left.canvas.calibrationEnabledAt}
                                        rightCalibrationEnabledAt={comparison.right.canvas.calibrationEnabledAt}
                                    />
                                )}

                                <Separator className="bg-border/50 my-2" />

                                <div className="px-4 py-3 bg-muted/40 flex items-center gap-2">
                                    <Activity className="h-3 w-3 text-primary" />
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active View Detail</span>
                                </div>

                                <div className="space-y-3 p-4">
                                    {filteredMeasurements.length === 0 ? (
                                        <div className="text-center py-10 px-4 bg-muted rounded-2xl border border-dashed border-border/50">
                                            <p className="text-sm text-muted-foreground italic">No measurements in current focus.</p>
                                        </div>
                                    ) : (
                                        filteredMeasurements.map((m: any) => (
                                            <MeasurementCard
                                                key={m.id}
                                                label={TOOL_DISPLAY_NAMES[m.toolKey] || m.toolKey}
                                                value={formatValue(m, activePixelToMm, shouldConvertMeasurement(m))}
                                                range={NORMAL_RANGES[m.toolKey] || ''}
                                                toolKey={m.toolKey}
                                                checked={m.selected}
                                                onCheckedChange={(checked) => handleToggleCheck(m.id, checked)}
                                                onDelete={() => m.isImplant ? deleteImplant(m.id) : deleteMeasurement(m.id)}
                                                setMeasurements={setMeasurements}
                                                m={m}
                                                pixelToMm={activePixelToMm}
                                                shouldConvert={shouldConvertMeasurement(m)}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 p-4 pb-24">
                                {filteredMeasurements.length === 0 ? (
                                    <div className="text-center py-20 bg-muted rounded-2xl border border-dashed border-border/50">
                                        <Target className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                                    </div>
                                ) : (
                                    filteredMeasurements.map((m: any) => (
                                        <MeasurementCard
                                            key={m.id}
                                            label={TOOL_DISPLAY_NAMES[m.toolKey] || m.toolKey}
                                            value={formatValue(m, activePixelToMm, shouldConvertMeasurement(m))}
                                            range={NORMAL_RANGES[m.toolKey] || ''}
                                            toolKey={m.toolKey}
                                            checked={m.selected}
                                            onCheckedChange={(checked) => handleToggleCheck(m.id, checked)}
                                            onDelete={() => m.isImplant ? deleteImplant(m.id) : deleteMeasurement(m.id)}
                                            setMeasurements={setMeasurements}
                                            m={m}
                                            pixelToMm={activePixelToMm}
                                            shouldConvert={shouldConvertMeasurement(m)}
                                        />
                                    ))
                                )}
                            </div>
                        )}
                    </ScrollArea>

                    {/* Footer Summary */}
                    <div className="p-4 border-t border-border bg-card flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                variant="outline"
                                className="w-full font-bold gap-2 rounded-xl transition-all active:scale-95"
                                onClick={handleCalibrateAll}
                                disabled={!activeCalibrationApplied}
                            >
                                <Ruler className="h-4 w-4" />
                                Calibrate All
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full font-bold gap-2 rounded-xl transition-all active:scale-95"
                                onClick={handleUndoCalibration}
                                disabled={!activeCalibrationApplied}
                            >
                                Undo Calibration
                            </Button>
                        </div>
                        <Button
                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 font-bold gap-2 rounded-xl transition-all active:scale-95"
                            onClick={handleGenerateReport}
                            disabled={selectedCount === 0}
                        >
                            <FileText className="h-4 w-4" />
                            Generate Report ({selectedCount})
                        </Button>
                    </div>

                    <ReportDialog
                        open={isReportOpen}
                        onOpenChange={setIsReportOpen}
                        checkedCount={selectedCount}
                    />
                </div>
            </div>
        </div>
    );
};

export default RightSidebar;

