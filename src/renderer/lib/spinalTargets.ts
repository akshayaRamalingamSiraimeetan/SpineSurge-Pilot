/**
 * spinalTargets.ts
 *
 * Pure utility — no React dependencies.
 *
 * Encodes clinical target ranges from:
 *   Table 1 — Parameters WITHOUT Age Correction
 *   Table 2 — Parameters WITH Age Correction
 *
 * Color classification:
 *   'healthy'    → green  (#22c55e)
 *   'borderline' → yellow (#eab308)
 *   'abnormal'   → red    (#ef4444)
 *   'unknown'    → gray   (no value measured)
 */

export type AgeGroup = '<40' | '40-60' | '>60';
export type TargetStatus = 'healthy' | 'borderline' | 'abnormal' | 'unknown';

export interface TargetParam {
    toolKey: string;
    label: string;
    /** Human-readable healthy range, e.g. "PI ± 9°" or "20–45°" */
    healthyRange: string;
    borderlineRange?: string;
    abnormalRange?: string;
    unit: '°' | 'mm';
    note?: string;
    /** Numeric healthy min/max for programmatic use */
    healthyMin: number;
    healthyMax: number;
}

/** Derive age group from numeric age. */
export function getAgeGroup(age: number): AgeGroup {
    if (age < 40) return '<40';
    if (age <= 60) return '40-60';
    return '>60';
}

/**
 * Compute the full set of recommended target parameters for a given patient context.
 *
 * @param age          Patient age in years (0 if unknown)
 * @param piDeg        Pelvic Incidence in degrees (NaN if not measured)
 * @param isScoliosis  Whether coronal/scoliosis measurements are present
 */
export function computeTargets(
    age: number,
    piDeg: number,
    isScoliosis: boolean,
): TargetParam[] {
    const g = getAgeGroup(age);
    const hasPi = isFinite(piDeg) && !isNaN(piDeg);
    const params: TargetParam[] = [];

    // ── Lumbar Lordosis (LL) — age-corrected via PI ─────────────
    // Healthy: PI ± 9°   Borderline: PI ± (10–15°)   Abnormal: mismatch > 15° from PI
    if (hasPi) {
        params.push({
            toolKey: 'll',
            label: 'Lumbar Lordosis (LL)',
            healthyRange: `${(piDeg - 9).toFixed(0)}° – ${(piDeg + 9).toFixed(0)}°`,
            borderlineRange: `${(piDeg - 15).toFixed(0)}° – ${(piDeg + 15).toFixed(0)}°`,
            abnormalRange: `|LL − PI| > 15°`,
            unit: '°',
            note: `Best evaluated relative to PI (${piDeg.toFixed(0)}°)`,
            healthyMin: piDeg - 9,
            healthyMax: piDeg + 9,
        });
    } else {
        params.push({
            toolKey: 'll',
            label: 'Lumbar Lordosis (LL)',
            healthyRange: 'PI ± 9° (PI not measured)',
            unit: '°',
            note: 'Measure PI to compute LL target',
            healthyMin: NaN,
            healthyMax: NaN,
        });
    }

    // ── PI–LL Mismatch — no age correction ──────────────────────
    params.push({
        toolKey: 'pi_ll',
        label: 'PI–LL Mismatch',
        healthyRange: '−10° to +10°',
        borderlineRange: '−20° to −10°  or  +10° to +20°',
        abnormalRange: '< −20° or > +20°',
        unit: '°',
        note: 'Most important sagittal mismatch metric',
        healthyMin: -10,
        healthyMax: 10,
    });

    // ── SVA — age-corrected ──────────────────────────────────────
    const svaDef: Record<AgeGroup, { h: string; b: string; abn: string; min: number; max: number }> = {
        '<40':   { h: '0–30 mm',  b: '30–50 mm',  abn: '> 50 mm',  min: 0, max: 30 },
        '40-60': { h: '0–40 mm',  b: '40–60 mm',  abn: '> 60 mm',  min: 0, max: 40 },
        '>60':   { h: '0–50 mm',  b: '50–70 mm',  abn: '> 70 mm',  min: 0, max: 50 },
    };
    params.push({
        toolKey: 'sva',
        label: 'Sagittal Vertical Axis (SVA)',
        healthyRange: svaDef[g].h,
        borderlineRange: svaDef[g].b,
        abnormalRange: svaDef[g].abn,
        unit: 'mm',
        note: 'Gold standard sagittal balance',
        healthyMin: svaDef[g].min,
        healthyMax: svaDef[g].max,
    });

    // ── Pelvic Tilt (PT) — age-corrected ────────────────────────
    const ptDef: Record<AgeGroup, { h: string; b: string; abn: string; max: number }> = {
        '<40':   { h: '0–10°', b: '10–15°', abn: '> 15°', max: 10 },
        '40-60': { h: '0–12°', b: '12–18°', abn: '> 18°', max: 12 },
        '>60':   { h: '0–15°', b: '15–20°', abn: '> 20°', max: 15 },
    };
    params.push({
        toolKey: 'pt',
        label: 'Pelvic Tilt (PT)',
        healthyRange: ptDef[g].h,
        borderlineRange: ptDef[g].b,
        abnormalRange: ptDef[g].abn,
        unit: '°',
        note: 'Reflects pelvic retroversion and SVA',
        healthyMin: 0,
        healthyMax: ptDef[g].max,
    });

    // ── Thoracic Kyphosis (TK) — age-corrected ──────────────────
    const tkDef: Record<AgeGroup, { h: string; bLow: string; bHigh: string; abn: string; min: number; max: number }> = {
        '<40':   { h: '20–45°', bLow: '15–20°', bHigh: '45–55°', abn: '< 15° or > 55°', min: 20, max: 45 },
        '40-60': { h: '25–50°', bLow: '20–25°', bHigh: '50–60°', abn: '< 20° or > 60°', min: 25, max: 50 },
        '>60':   { h: '30–60°', bLow: '25–30°', bHigh: '60–70°', abn: '< 25° or > 70°', min: 30, max: 60 },
    };
    params.push({
        toolKey: 'tk',
        label: 'Thoracic Kyphosis (TK)',
        healthyRange: tkDef[g].h,
        borderlineRange: `Low: ${tkDef[g].bLow}  |  High: ${tkDef[g].bHigh}`,
        abnormalRange: tkDef[g].abn,
        unit: '°',
        note: 'Increases with age',
        healthyMin: tkDef[g].min,
        healthyMax: tkDef[g].max,
    });

    // ── Coronal Cobb Angle — scoliosis mode only, no age correction ─
    if (isScoliosis) {
        params.push({
            toolKey: 'cobb',
            label: 'Coronal Cobb Angle',
            healthyRange: '0–10°',
            borderlineRange: '10–20°',
            abnormalRange: '> 20° (> 40° = severe)',
            unit: '°',
            note: 'Curve type classification',
            healthyMin: 0,
            healthyMax: 10,
        });
    }

    return params;
}

/**
 * Classify a numeric measurement value for a given tool key.
 * Returns the status category.
 */
export function classifyValue(
    toolKey: string,
    value: number,
    age: number,
    piDeg: number,
): TargetStatus {
    if (!isFinite(value) || isNaN(value)) return 'unknown';
    const g = getAgeGroup(age);
    const hasPi = isFinite(piDeg) && !isNaN(piDeg);
    const abs = Math.abs(value);

    switch (toolKey) {
        case 'll': {
            if (!hasPi) return 'unknown';
            const mismatch = Math.abs(value - piDeg);
            if (mismatch <= 9)  return 'healthy';
            if (mismatch <= 15) return 'borderline';
            return 'abnormal';
        }
        case 'pi_ll': {
            if (abs <= 10) return 'healthy';
            if (abs <= 20) return 'borderline';
            return 'abnormal';
        }
        case 'sva': {
            const thresholds: Record<AgeGroup, [number, number]> = {
                '<40':   [30, 50],
                '40-60': [40, 60],
                '>60':   [50, 70],
            };
            const [hMax, bMax] = thresholds[g];
            if (value <= hMax) return 'healthy';
            if (value <= bMax) return 'borderline';
            return 'abnormal';
        }
        case 'pt': {
            const thresholds: Record<AgeGroup, [number, number]> = {
                '<40':   [10, 15],
                '40-60': [12, 18],
                '>60':   [15, 20],
            };
            const [hMax, bMax] = thresholds[g];
            if (abs <= hMax) return 'healthy';
            if (abs <= bMax) return 'borderline';
            return 'abnormal';
        }
        case 'tk': {
            const thresholds: Record<AgeGroup, [number, number, number, number]> = {
                '<40':   [20, 45, 15, 55],
                '40-60': [25, 50, 20, 60],
                '>60':   [30, 60, 25, 70],
            };
            const [hMin, hMax, abMin, abMax] = thresholds[g];
            if (value >= hMin && value <= hMax) return 'healthy';
            if (value >= abMin && value <= abMax) return 'borderline';
            return 'abnormal';
        }
        case 'cobb': {
            if (abs <= 10) return 'healthy';
            if (abs <= 20) return 'borderline';
            return 'abnormal';
        }
        default:
            return 'unknown';
    }
}

/** Extract the first numeric value from a measurement result string. */
export function extractNumericValue(result: string | number | null | undefined): number {
    if (typeof result === 'number') return result;
    if (!result) return NaN;
    const str = String(result).split('\n')[0];
    const match = str.match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : NaN;
}

/** Color constants for each status */
export const STATUS_COLORS: Record<TargetStatus, string> = {
    healthy:    '#22c55e',
    borderline: '#eab308',
    abnormal:   '#ef4444',
    unknown:    '#6b7280',
};

export const STATUS_LABELS: Record<TargetStatus, string> = {
    healthy:    'HEALTHY',
    borderline: 'BORDERLINE',
    abnormal:   'ABNORMAL',
    unknown:    'NOT MEASURED',
};
