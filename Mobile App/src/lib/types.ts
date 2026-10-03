/** Point in IMAGE pixel coordinates (independent of zoom/pan). */
export interface Pt { x: number; y: number }

export type ToolId = 'calibrate' | 'distance' | 'angle' | 'cobb';

export interface Measurement {
  id: string;
  type: Exclude<ToolId, 'calibrate'>;
  points: Pt[];
  /** Optional free-text level / note, e.g. "L1–L5". */
  label?: string;
  createdAt: number;
}

export interface Patient {
  name: string;
  patientId?: string;
  age?: string;
  sex?: 'M' | 'F' | 'O';
  notes?: string;
}

export interface Calibration {
  points: [Pt, Pt];
  mm: number;
}

/** One saved assessment: a patient, one image and its measurements. */
export interface Case {
  id: string;
  createdAt: number;
  updatedAt: number;
  patient: Patient;
  image: { uri: string; width: number; height: number };
  calibration: Calibration | null;
  measurements: Measurement[];
}

/** Points needed to finish each tool. */
export const TOOL_POINTS: Record<ToolId, number> = { calibrate: 2, distance: 2, angle: 3, cobb: 4 };

export const TOOL_LABEL: Record<ToolId, string> = {
  calibrate: 'Calibrate',
  distance: 'Distance',
  angle: 'Angle',
  cobb: 'Cobb',
};

/** Step hints shown while placing points. */
export const TOOL_HINTS: Record<ToolId, string[]> = {
  calibrate: ['Tap one end of a known length', 'Tap the other end'],
  distance: ['Tap the first point', 'Tap the second point'],
  angle: ['Tap a point on the first arm', 'Tap the vertex', 'Tap a point on the second arm'],
  cobb: ['Upper endplate: first point', 'Upper endplate: second point', 'Lower endplate: first point', 'Lower endplate: second point'],
};
