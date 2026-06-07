/* Workspace reference data — ported from the Claude Design build (frontend/SS/app/data.js).
   The measurement hierarchy (tool catalog per A/D/P/M tab) is real and drives the tool panels.
   The example measurement *values* are placeholder/demo until the Step 7 parity-locked engine
   computes them; the UI renders them from the workspace store, never inventing them in the view. */

export type Tone = 'angle' | 'good' | 'pelvic' | 'bad' | 'purple' | 'plain';

export interface ToolDef {
  label: string;
  abbr: string;
  desc: string;
}

export interface MeasurementItem {
  label: string;
  value?: string;
  tone?: Tone;
  dot?: 'red' | 'green' | 'blue' | 'amber' | 'violet';
  chevron?: boolean;
  sub?: { label: string; value: string; tone?: Tone }[];
}

export interface MeasurementGroup {
  name: string;
  items: MeasurementItem[];
}

export interface RefLine {
  abbr: string;
  name: string;
  value: string;
}

interface PlaneData {
  tools: ToolDef[];
  groups: MeasurementGroup[];
  refLines: RefLine[];
}

export interface AssessmentTab {
  key: 'alignment' | 'extended' | 'morphology' | 'generic';
  short: string;
  label: string;
  planes: boolean;
  tools?: ToolDef[];
  groups?: MeasurementGroup[];
  refLines?: RefLine[];
  coronal?: PlaneData;
  sagittal?: PlaneData;
}

const T = (label: string, abbr: string, desc: string): ToolDef => ({ label, abbr, desc });

export const assessmentTabs: AssessmentTab[] = [
  {
    key: 'alignment',
    short: 'A',
    label: 'Alignment',
    planes: false,
    tools: [
      T('Cobb', 'Cobb', 'Coronal/sagittal Cobb angle'),
      T('SVA', 'SVA', 'Sagittal Vertical Axis'),
      T('PI-LL', 'PI-LL', 'Pelvic incidence – lordosis'),
      T('Pelvis', 'Pelvis', 'PI / PT / SS'),
      T('TK', 'TK', 'Thoracic Kyphosis'),
      T('LL', 'LL', 'Lumbar Lordosis'),
      T('CL', 'CL', 'Cervical Lordosis'),
    ],
    groups: [
      {
        name: 'Spinal Alignment',
        items: [
          { label: 'Cobb Angle (T4–T12)', value: '44°', tone: 'angle' },
          { label: 'Lordosis (L1–S1)', value: '−56°', tone: 'angle' },
          { label: 'Kyphosis (T4–T12)', value: '44°', tone: 'angle' },
          { label: 'SVA', value: '32 mm', tone: 'good' },
        ],
      },
      {
        name: 'Pelvic Parameters',
        items: [
          { label: 'Pelvic Incidence (PI)', value: '56°', tone: 'pelvic' },
          { label: 'Pelvic Tilt (PT)', value: '18°', tone: 'pelvic' },
          { label: 'Sacral Slope (SS)', value: '38°', tone: 'pelvic' },
        ],
      },
      {
        name: 'Spinopelvic Relationships',
        items: [
          { label: 'PI – LL Mismatch', value: '12°', tone: 'bad' },
          { label: 'PI – PT Mismatch', value: '38°', tone: 'bad' },
          { label: 'T1 Pelvic Angle (TPA)', value: '24°', tone: 'pelvic' },
        ],
      },
      {
        name: 'Other Measurements',
        items: [
          { label: 'Vertebral Rotation (Max)', value: '8°', tone: 'angle' },
          { label: 'Rib Hump (Right)', value: '12 mm', tone: 'angle' },
          { label: 'Intervertebral Angle (L4–L5)', value: '6°', tone: 'pelvic' },
        ],
      },
    ],
    refLines: [],
  },
  {
    key: 'extended',
    short: 'E',
    label: 'Extended',
    planes: true,
    coronal: {
      tools: [
        T('CMC', 'CMC', 'Cobb Multi-Curve'),
        T('TS', 'TS', 'Trunk Shift'),
        T('AVT', 'AVT', 'Apical Vertebral Tilt'),
        T('RVAD', 'RVAD', 'Rib Vertebral Angle Difference'),
        T('PO', 'PO', 'Pelvic Obliquity'),
      ],
      groups: [
        {
          name: 'Coronal Extended',
          items: [
            { label: 'Cobb Multi-Curve (CMC)', value: '48°', tone: 'bad' },
            { label: 'Trunk Shift (TS)', value: '25 mm', tone: 'bad' },
            { label: 'Apical Vertebral Tilt (AVT)', value: '12 mm', tone: 'bad' },
            { label: 'Rib Vertebral Angle Difference (RVAD)', value: '16°', tone: 'bad' },
            { label: 'Pelvic Obliquity (PO)', value: '7°', tone: 'bad' },
          ],
        },
      ],
      refLines: [
        { abbr: 'CSVL', name: 'Coronal Sacral Vertical Line', value: '8 mm' },
        { abbr: 'C7PL', name: 'C7 Plumb Line', value: '4 mm' },
      ],
    },
    sagittal: {
      tools: [
        T('TPA', 'TPA', 'T1 Pelvic Angle'),
        T('SSA', 'SSA', 'Spinosacral Angle'),
        T('SPA', 'SPA', 'Spinopelvic Angle'),
        T('T1SPi', 'T1SPi', 'T1 Spinopelvic Inclination'),
        T('T9SPi', 'T9SPi', 'T9 Spinopelvic Inclination'),
        T('ODHA', 'ODHA', 'Odontoid Hip Angle'),
        T('CBVA', 'CBVA', 'Chin Brow Vertical Angle'),
      ],
      groups: [
        {
          name: 'Sagittal Extended',
          items: [
            { label: 'T1 Pelvic Angle (TPA)', value: '24°', tone: 'bad' },
            { label: 'Spinosacral Angle (SSA)', value: '42°', tone: 'bad' },
            { label: 'Spinopelvic Angle (SPA)', value: '18°', tone: 'bad' },
            { label: 'T1 Spinopelvic Inclination (T1SPi)', value: '14°', tone: 'bad' },
            { label: 'T9 Spinopelvic Inclination (T9SPi)', value: '10°', tone: 'bad' },
            { label: 'Odontoid Hip Angle (ODHA)', value: '122°', tone: 'bad' },
            { label: 'Chin Brow Vertical Angle (CBVA)', value: '12°', tone: 'bad' },
          ],
        },
      ],
      refLines: [
        { abbr: 'SVL', name: 'Sagittal Vertical Line', value: '32 mm' },
        { abbr: 'C7PL', name: 'C7 Plumb Line', value: '4 mm' },
        { abbr: 'GL', name: 'Gravity Line', value: '6 mm' },
      ],
    },
  },
  {
    key: 'morphology',
    short: 'M',
    label: 'Morphology',
    planes: false,
    tools: [
      T('Canal Area', 'Canal Area', 'Measure spinal canal area'),
      T('Spondylolisthesis', 'Spondylolisthesis', 'Measure vertebral slip'),
      T('VBM', 'VBM', 'Vertebral body height / wedge metrics'),
    ],
    groups: [
      {
        name: 'Morphology',
        items: [
          {
            label: 'Canal Area',
            value: '128 mm²',
            tone: 'purple',
            dot: 'violet',
            sub: [
              { label: 'Level', value: 'L3–L4' },
              { label: 'Status', value: 'Severe Stenosis' },
            ],
          },
          {
            label: 'Spondylolisthesis',
            value: '',
            dot: 'red',
            sub: [
              { label: 'Level', value: 'L4 on L5' },
              { label: 'Slip Distance', value: '7.2 mm', tone: 'bad' },
              { label: 'Slip Percentage', value: '18%', tone: 'bad' },
              { label: 'Meyerding Grade', value: 'Grade I' },
            ],
          },
          {
            label: 'Vertebral Body Metrics (VBM)',
            value: '',
            tone: 'plain' as Tone,
          },
        ],
      },
    ],
    refLines: [],
  },
  {
    key: 'generic',
    short: 'G',
    label: 'Generic',
    planes: false,
    tools: [
      T('Line', 'Line', 'Straight line'),
      T('Pen', 'Pen', 'Freehand pen'),
      T('Annotation', 'Annotation', 'Text annotation'),
      T('2 Point Angle', '2 Point Angle', 'Two-point angle'),
      T('3 Point Angle', '3 Point Angle', 'Three-point angle'),
      T('Circle', 'Circle', 'Circle'),
      T('Ellipse', 'Ellipse', 'Ellipse'),
      T('Polygon', 'Polygon', 'Polygon'),
    ],
    groups: [],
    refLines: [],
  },
];

/* ---------- Planning ---------- */
export interface PlanTarget {
  label: string;
  current: string;
  target: string;
  opts: string[];
}
export interface PlanProcedure {
  abbr: string;
  name: string;
}

export const planning = {
  targets: [
    { label: 'PI-LL Mismatch', current: '22°', target: '10°', opts: ['5°', '10°', '15°', '20°'] },
    { label: 'SVA', current: '82 mm', target: '20 mm', opts: ['10 mm', '20 mm', '30 mm', '40 mm'] },
    { label: 'Thoracic Kyphosis (TK)', current: '48°', target: '40°', opts: ['30°', '35°', '40°', '45°'] },
    { label: 'Lumbar Lordosis (LL)', current: '56°', target: '50°', opts: ['45°', '50°', '55°', '60°'] },
    { label: 'Pelvic Tilt (PT)', current: '18°', target: '15°', opts: ['10°', '15°', '20°'] },
  ] as PlanTarget[],
  osteotomies: [
    { abbr: 'PSO', name: 'Pedicle Subtraction Osteotomy' },
    { abbr: 'SPO', name: 'Smith-Petersen Osteotomy' },
    { abbr: 'VCR', name: 'Vertebral Column Resection' },
    { abbr: 'Open', name: 'Opening Wedge Osteotomy' },
  ] as PlanProcedure[],
  instrumentation: [
    { abbr: 'Screw', name: 'Pedicle Screw' },
    { abbr: 'LIV/UIV', name: 'Set Levels' },
    { abbr: 'Rod', name: 'Rod Contour' },
    { abbr: 'Cage', name: 'Interbody Cage' },
  ] as PlanProcedure[],
  currentPlan: {
    correction: [
      { label: 'PI-LL Mismatch', from: '22°', to: '10°' },
      { label: 'SVA', from: '82 mm', to: '20 mm' },
      { label: 'Thoracic Kyphosis (TK)', from: '48°', to: '40°' },
      { label: 'Lumbar Lordosis (LL)', from: '56°', to: '50°' },
      { label: 'Pelvic Tilt (PT)', from: '18°', to: '15°' },
    ],
    simOsteotomy: { name: 'PSO at L3', correction: '30°', status: 'Applied' },
    simInstr: [
      { dot: 'blue', label: 'Screw', value: 'T10 – S1' },
      { dot: 'violet', label: 'LIV', value: 'S1' },
      { dot: 'violet', label: 'UIV', value: 'T10' },
      { dot: 'teal', label: 'Rod', value: 'Left: 5.5 mm Ti / Right: 5.5 mm Ti' },
      { dot: 'amber', label: 'Cage', value: 'L3-L4' },
    ],
  },
};

/* ---------- Compare ---------- */
export interface CompareRow {
  label: string;
  a: string;
  b: string;
  d: string;
  tone: 'good' | 'bad' | 'flat';
}
export const compare = {
  left: { label: 'Current Study', date: 'May 10, 2024' },
  right: { label: 'Selected Study', date: 'Feb 15, 2024' },
  groups: [
    {
      name: 'Sagittal Alignment',
      rows: [
        { label: 'PI-LL Mismatch', a: '10°', b: '30°', d: '−20°', tone: 'good' },
        { label: 'SVA', a: '20 mm', b: '82 mm', d: '−62 mm', tone: 'good' },
        { label: 'Thoracic Kyphosis (TK)', a: '40°', b: '18°', d: '+22°', tone: 'bad' },
        { label: 'Lumbar Lordosis (LL)', a: '50°', b: '28°', d: '+22°', tone: 'bad' },
        { label: 'Pelvic Tilt (PT)', a: '15°', b: '22°', d: '−7°', tone: 'good' },
      ] as CompareRow[],
    },
    {
      name: 'Coronal Alignment',
      rows: [
        { label: 'Cobb (T1–T12)', a: '22°', b: '38°', d: '−16°', tone: 'good' },
        { label: 'Cobb (T12–L5)', a: '18°', b: '31°', d: '−13°', tone: 'good' },
        { label: 'Coronal Balance (CSVL)', a: '8 mm', b: '24 mm', d: '−16 mm', tone: 'good' },
        { label: 'Trunk Shift', a: '6 mm', b: '18 mm', d: '−12 mm', tone: 'good' },
      ] as CompareRow[],
    },
    {
      name: 'Pelvic Parameters',
      rows: [
        { label: 'Pelvic Incidence (PI)', a: '56°', b: '56°', d: '0°', tone: 'flat' },
        { label: 'Sacral Slope (SS)', a: '41°', b: '34°', d: '+7°', tone: 'bad' },
        { label: 'Pelvic Tilt (PT)', a: '15°', b: '22°', d: '−7°', tone: 'good' },
      ] as CompareRow[],
    },
    {
      name: 'Global',
      rows: [{ label: 'C7 Plumb Line (C7PL)', a: '4 mm', b: '18 mm', d: '−14 mm', tone: 'good' }] as CompareRow[],
    },
  ],
};

/* ---------- Report ---------- */
export interface ReportSection {
  id: string;
  label: string;
  on: boolean;
}
export const reportSections: ReportSection[] = [
  { id: 'cover', label: 'Cover', on: true },
  { id: 'patient', label: 'Patient Summary', on: true },
  { id: 'alignment', label: 'Alignment Summary', on: true },
  { id: 'measurement', label: 'Measurement Table', on: true },
  { id: 'comparison', label: 'Current vs Simulation Comparison', on: true },
  { id: 'plan', label: 'Surgical Plan Summary', on: true },
  { id: 'osteotomies', label: 'Osteotomies', on: true },
  { id: 'instrumentation', label: 'Instrumentation Plan', on: true },
  { id: 'images', label: 'Images', on: true },
  { id: 'notes', label: 'Notes', on: true },
];
export const alignmentSummary = [
  { label: 'PI-LL Mismatch', value: '10°' },
  { label: 'SVA', value: '20 mm' },
  { label: 'Thoracic Kyphosis (TK)', value: '40°' },
  { label: 'Lumbar Lordosis (LL)', value: '50°' },
  { label: 'Pelvic Tilt (PT)', value: '15°' },
];

/* Active case header (placeholder until wired to the real study/patient in the route). */
export const activeCase = {
  name: 'John Anderson',
  age: 58,
  sex: 'M',
  mrn: '1002456',
  dx: 'Adult Scoliosis',
  imported: 'May 12, 2024 · 09:42 AM',
  height: 178,
  weight: 82,
};
