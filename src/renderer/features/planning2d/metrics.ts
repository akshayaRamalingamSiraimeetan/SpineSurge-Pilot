import type { Measurement } from '@/lib/canvas/CanvasManager';

/**
 * Named clinical measurements, independent of the tool that produced them
 * (UI10-01). Pelvic Parameters and PI-LL both yield PI; LL comes from the LL
 * tool or the PI-LL tool — a metric lists every (tool, result line) source and
 * takes the most recent one, so tables never repeat the same measurement.
 *
 * Only measurements that are unique per patient are metrics. Tools that can be
 * placed several times at different levels (Cobb, CMC, VBM, …) are listed per
 * instance instead (Cobb is a metric only for choosing it as a target).
 */
export interface Metric {
    key: string;
    label: string;
    unit: '°' | 'mm';
    tab: 'alignment' | 'extended';
    sources: { tool: string; line: string }[];
    /** Magnitude only (SVA, trunk shift, AVT) */
    absolute?: boolean;
    /** Can exist several times (per level) — not de-duplicated in tables */
    multi?: boolean;
}

export const METRICS: Metric[] = [
    // Alignment
    { key: 'cobb', label: 'Cobb Angle', unit: '°', tab: 'alignment', sources: [{ tool: 'cobb', line: '' }], multi: true },
    { key: 'pi', label: 'Pelvic Incidence (PI)', unit: '°', tab: 'alignment', sources: [{ tool: 'pelvis', line: 'PI' }, { tool: 'pi_ll', line: 'PI' }] },
    { key: 'pt', label: 'Pelvic Tilt (PT)', unit: '°', tab: 'alignment', sources: [{ tool: 'pelvis', line: 'PT' }] },
    { key: 'ss', label: 'Sacral Slope (SS)', unit: '°', tab: 'alignment', sources: [{ tool: 'pelvis', line: 'SS' }] },
    { key: 'pi_ll', label: 'PI-LL Mismatch', unit: '°', tab: 'alignment', sources: [{ tool: 'pi_ll', line: 'PI-LL' }] },
    { key: 'sva', label: 'Sagittal Vertical Axis (SVA)', unit: 'mm', tab: 'alignment', sources: [{ tool: 'sva', line: '' }], absolute: true },
    { key: 'tk', label: 'Thoracic Kyphosis (TK)', unit: '°', tab: 'alignment', sources: [{ tool: 'tk', line: '' }] },
    { key: 'll', label: 'Lumbar Lordosis (LL)', unit: '°', tab: 'alignment', sources: [{ tool: 'll', line: '' }, { tool: 'pi_ll', line: 'LL' }] },
    { key: 'cl', label: 'Cervical Lordosis (CL)', unit: '°', tab: 'alignment', sources: [{ tool: 'cl', line: '' }] },
    // Extended
    { key: 'ts', label: 'Trunk Shift', unit: 'mm', tab: 'extended', sources: [{ tool: 'ts', line: '' }], absolute: true },
    { key: 'avt', label: 'Apical Vertebral Translation', unit: 'mm', tab: 'extended', sources: [{ tool: 'avt', line: '' }], absolute: true },
    { key: 'po', label: 'Pelvic Obliquity', unit: '°', tab: 'extended', sources: [{ tool: 'po', line: '' }] },
    { key: 'rvad', label: 'RVAD', unit: '°', tab: 'extended', sources: [{ tool: 'rvad', line: 'RVAD' }] },
    { key: 'tpa', label: 'T1 Pelvic Angle (TPA)', unit: '°', tab: 'extended', sources: [{ tool: 'tpa', line: '' }] },
    { key: 'spa', label: 'Spinopelvic Angle (SPA)', unit: '°', tab: 'extended', sources: [{ tool: 'spa', line: '' }] },
    { key: 'ssa', label: 'Spinosacral Angle (SSA)', unit: '°', tab: 'extended', sources: [{ tool: 'ssa', line: '' }] },
    { key: 't1spi', label: 'T1 Spinopelvic Inclination', unit: '°', tab: 'extended', sources: [{ tool: 't1spi', line: '' }] },
    { key: 't9spi', label: 'T9 Spinopelvic Inclination', unit: '°', tab: 'extended', sources: [{ tool: 't9spi', line: '' }] },
    { key: 'odha', label: 'Odontoid Hip Axis Angle', unit: '°', tab: 'extended', sources: [{ tool: 'odha', line: '' }] },
    { key: 'cbva', label: 'Chin Brow Vertical Angle', unit: '°', tab: 'extended', sources: [{ tool: 'cbva', line: '' }] },
];
export const DEFAULT_TARGET_KEYS = ['tk', 'll', 'sva'];
export const metricByKey = (key: string) => METRICS.find((m) => m.key === key);

const norm = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/** Result lines of a measurement as { key, value, unit } (px → mm when calibrated). */
export function resultLines(m: Measurement, mmPerPx: number | null): { key: string; value: number; unit: string }[] {
    return String(m.result ?? '').split('\n').map((line) => {
        const idx = line.indexOf(':');
        const key = idx >= 0 ? line.slice(0, idx).trim() : '';
        const rest = idx >= 0 ? line.slice(idx + 1) : line;
        const mt = rest.match(/(-?\d+(?:\.\d+)?)\s*(°|mm²|mm|px²|px|%)?/);
        if (!mt) return null;
        let value = parseFloat(mt[1]);
        let unit = mt[2] ?? '';
        if (mmPerPx && unit === 'px') { value *= mmPerPx; unit = 'mm'; }
        if (mmPerPx && unit === 'px²') { value *= mmPerPx * mmPerPx; unit = 'mm²'; }
        return { key, value, unit };
    }).filter((x): x is { key: string; value: number; unit: string } => !!x);
}

/** Does (tool, line index/key) feed a metric? Returns that metric. */
export function metricForLine(toolKey: string, lineKey: string, lineIndex: number): Metric | undefined {
    return METRICS.find((mt) => mt.sources.some((s) => s.tool === toolKey && (s.line === '' ? lineIndex === 0 : norm(s.line) === norm(lineKey))));
}

/** Latest value of a metric across all its source tools. */
export function metricValue(measurements: Measurement[], key: string, mmPerPx: number | null): { value: number; unit: string } | null {
    const metric = metricByKey(key);
    if (!metric) return null;
    const candidates = measurements
        .filter((m) => m.selected !== false && metric.sources.some((s) => s.tool === m.toolKey))
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    for (const m of candidates) {
        const lines = resultLines(m, mmPerPx);
        const src = metric.sources.find((s) => s.tool === m.toolKey)!;
        const line = src.line === '' ? lines[0] : lines.find((l) => norm(l.key) === norm(src.line));
        if (line) return { value: metric.absolute ? Math.abs(line.value) : line.value, unit: line.unit };
    }
    return null;
}
