export interface ScrewMeasurement {
    diameter: number;
    lengths: number[];
}

export interface LevelDefaults {
    region: 'Cervical' | 'Upper Thoracic' | 'Lower Thoracic' | 'Lumbar' | 'Sacral';
    measurements: ScrewMeasurement[];
    color: string;
}

export const SPINAL_LEVELS = [
    'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7',
    'T1', 'T2', 'T3', 'T4', 'T5', 'T6',
    'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
    'L1', 'L2', 'L3', 'L4', 'L5', 'S1'
];

const CERVICAL_MEASUREMENTS: ScrewMeasurement[] = [
    { diameter: 3.0, lengths: [18, 20, 22] },
    { diameter: 3.5, lengths: [20, 22, 24, 26] },
    { diameter: 4.0, lengths: [22, 24, 26, 28] },
    { diameter: 4.5, lengths: [24, 26, 28, 30, 32, 34] },
];

const UPPER_THORACIC_MEASUREMENTS: ScrewMeasurement[] = [
    { diameter: 3.5, lengths: [25, 30] },
    { diameter: 4.0, lengths: [25, 30, 35] },
    { diameter: 4.5, lengths: [30, 35, 40] },
    { diameter: 5.0, lengths: [30, 35, 40] },
];

const LOWER_THORACIC_MEASUREMENTS: ScrewMeasurement[] = [
    { diameter: 4.5, lengths: [30, 35] },
    { diameter: 5.0, lengths: [35, 40] },
    { diameter: 5.5, lengths: [35, 40, 45] },
    { diameter: 6.0, lengths: [40, 45] },
    { diameter: 6.5, lengths: [40, 45] },
];

const LUMBAR_MEASUREMENTS: ScrewMeasurement[] = [
    { diameter: 5.0, lengths: [35, 40] },
    { diameter: 5.5, lengths: [40, 45] },
    { diameter: 6.0, lengths: [40, 45, 50] },
    { diameter: 6.5, lengths: [45, 50] },
    { diameter: 7.0, lengths: [45, 50, 55] },
    { diameter: 7.5, lengths: [45, 50, 55] },
    { diameter: 8.0, lengths: [45, 50, 55] },
    { diameter: 8.5, lengths: [50, 55] },
];

const SACRAL_MEASUREMENTS: ScrewMeasurement[] = [
    { diameter: 6.5, lengths: [35, 40] },
    { diameter: 7.0, lengths: [40, 45] },
    { diameter: 7.5, lengths: [40, 45, 50] },
    { diameter: 8.0, lengths: [45, 50] },
    { diameter: 8.5, lengths: [45, 50] },
    { diameter: 9.0, lengths: [45, 50] },
    { diameter: 9.5, lengths: [45, 50] },
];

export const LEVEL_DEFAULTS: Record<string, LevelDefaults> = {
    'C1': { region: 'Cervical', measurements: CERVICAL_MEASUREMENTS, color: '#a855f7' },
    'C2': { region: 'Cervical', measurements: CERVICAL_MEASUREMENTS, color: '#a855f7' },
    'C3': { region: 'Cervical', measurements: CERVICAL_MEASUREMENTS, color: '#a855f7' },
    'C4': { region: 'Cervical', measurements: CERVICAL_MEASUREMENTS, color: '#a855f7' },
    'C5': { region: 'Cervical', measurements: CERVICAL_MEASUREMENTS, color: '#a855f7' },
    'C6': { region: 'Cervical', measurements: CERVICAL_MEASUREMENTS, color: '#a855f7' },
    'C7': { region: 'Cervical', measurements: CERVICAL_MEASUREMENTS, color: '#a855f7' },

    'T1': { region: 'Upper Thoracic', measurements: UPPER_THORACIC_MEASUREMENTS, color: '#3b82f6' },
    'T2': { region: 'Upper Thoracic', measurements: UPPER_THORACIC_MEASUREMENTS, color: '#3b82f6' },
    'T3': { region: 'Upper Thoracic', measurements: UPPER_THORACIC_MEASUREMENTS, color: '#3b82f6' },
    'T4': { region: 'Upper Thoracic', measurements: UPPER_THORACIC_MEASUREMENTS, color: '#3b82f6' },
    'T5': { region: 'Upper Thoracic', measurements: UPPER_THORACIC_MEASUREMENTS, color: '#3b82f6' },
    'T6': { region: 'Upper Thoracic', measurements: UPPER_THORACIC_MEASUREMENTS, color: '#3b82f6' },

    'T7': { region: 'Lower Thoracic', measurements: LOWER_THORACIC_MEASUREMENTS, color: '#14b8a6' },
    'T8': { region: 'Lower Thoracic', measurements: LOWER_THORACIC_MEASUREMENTS, color: '#14b8a6' },
    'T9': { region: 'Lower Thoracic', measurements: LOWER_THORACIC_MEASUREMENTS, color: '#14b8a6' },
    'T10': { region: 'Lower Thoracic', measurements: LOWER_THORACIC_MEASUREMENTS, color: '#14b8a6' },
    'T11': { region: 'Lower Thoracic', measurements: LOWER_THORACIC_MEASUREMENTS, color: '#14b8a6' },
    'T12': { region: 'Lower Thoracic', measurements: LOWER_THORACIC_MEASUREMENTS, color: '#14b8a6' },

    'L1': { region: 'Lumbar', measurements: LUMBAR_MEASUREMENTS, color: '#f97316' },
    'L2': { region: 'Lumbar', measurements: LUMBAR_MEASUREMENTS, color: '#f97316' },
    'L3': { region: 'Lumbar', measurements: LUMBAR_MEASUREMENTS, color: '#f97316' },
    'L4': { region: 'Lumbar', measurements: LUMBAR_MEASUREMENTS, color: '#f97316' },
    'L5': { region: 'Lumbar', measurements: LUMBAR_MEASUREMENTS, color: '#f97316' },

    'S1': { region: 'Sacral', measurements: SACRAL_MEASUREMENTS, color: '#e11d48' },
};

export function getLevelDefaults(level: string): LevelDefaults {
    return LEVEL_DEFAULTS[level] || {
        region: 'Lumbar',
        measurements: LUMBAR_MEASUREMENTS,
        color: '#94a3b8'
    };
}
