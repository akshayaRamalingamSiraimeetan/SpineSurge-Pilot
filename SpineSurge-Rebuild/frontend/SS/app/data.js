/* ============================================================
   SpineSurge Pro — mock data + measurement hierarchy
   Everything renders dynamically from these structures.
   ============================================================ */
(function () {
  const SS = {};

  SS.user = { name: 'Dr. Daniel Smith', org: 'Spine Center', credential: 'MD, MS (Ortho)', initials: 'DS' };

  /* ---------- active patient / case ---------- */
  SS.activeCase = {
    name: 'John Anderson', age: 58, sex: 'M', mrn: '1002456',
    dx: 'Adult Scoliosis', imported: 'May 12, 2024 · 09:42 AM',
    height: 178, weight: 82, planType: 'Deformity Correction', caseId: 'CASE-2024-0515-01',
  };

  /* ---------- dashboard ---------- */
  SS.continueWorking = {
    name: 'John Anderson', stage: 'Pre-op Assessment', date: 'Jan 12, 2024',
    tag: 'Adult Scoliosis', lastOpened: '2 hours ago', studies: 12, status: 'In Progress', modality: 'EOS AP',
  };
  SS.recentStudies = [
    { name: 'Maria Garcia',   dx: 'Lumbar Degeneration',     date: 'Jan 10, 2024', studies: 2, modality: 'X-RAY' },
    { name: 'Robert Taylor',  dx: 'Degenerative Scoliosis',  date: 'Jan 8, 2024',  studies: 3, modality: 'MRI' },
    { name: 'Michael Brown',  dx: 'PJK',                     date: 'Jan 5, 2024',  studies: 4, modality: 'CT' },
    { name: 'Sarah Johnson',  dx: 'Post-op Follow Up',       date: 'Dec 28, 2023', studies: 2, modality: 'X-RAY' },
  ];
  SS.unfinished = [
    { name: 'Olivia Martinez', modality: 'MRI Lumbar', date: 'Jan 9, 2024', dx: 'Lumbar Stenosis',          edited: '1 hour ago' },
    { name: 'William Davis',   modality: 'CT Lumbar',  date: 'Jan 7, 2024', dx: 'Degenerative Disc Disease', edited: '3 hours ago' },
    { name: 'Sophia Wilson',   modality: 'EOS AP/Lat', date: 'Jan 5, 2024', dx: 'Idiopathic Scoliosis',      edited: '1 day ago' },
  ];
  SS.tasks = [
    { group: 'Pending Review',     icon: 'clipboard', title: '2 Report(s) Pending Review', sub: 'Adult Scoliosis, Lumbar Degeneration', meta: 'Review and finalize reports', tone: 'accent' },
    { group: 'Missing Information', icon: 'user',     title: '1 Study Missing Information', sub: 'Olivia Martinez · MRI Lumbar', meta: 'Missing: Patient DOB', tone: 'danger' },
    { group: 'Unsaved Workspaces', icon: 'folder',    title: '1 Unsaved Workspace', sub: 'Post-op Follow Up – Sarah Johnson', meta: 'Last saved 15 min ago', tone: 'accent' },
    { group: 'Failed Processing',  icon: 'warning',   title: '2 Processing Issue(s)', sub: '3D Reconstruction Failed, Import Incomplete', meta: 'Action required', tone: 'danger' },
    { group: 'Session Recovery',   icon: 'clock',     title: '1 Recoverable Session', sub: 'Adult Scoliosis – John Anderson', meta: 'Recovered 45 min ago', tone: 'accent' },
  ];
  SS.importSources = [
    { icon: 'folder',  title: 'Local Files',  desc: 'Import DICOM or image files from your computer.', tags: ['DICOM','jpg','png','tiff','bmp','+ more'] },
    { icon: 'folder',  title: 'Local Folder', desc: 'Import all imaging files from a selected folder.', tags: ['DICOM','jpg','png','tiff','bmp','+ more'] },
    { icon: 'cloud',   title: 'PACS',         desc: 'Query and retrieve studies from a PACS server.', tags: ['DICOM','All Modalities'] },
  ];

  /* ============================================================
     MEASUREMENT HIERARCHY  (Assessment)
     tone keys map to --val-* colors. Empty groups never render.
     ============================================================ */
  const T = (label, abbr, desc, icon) => ({ label, abbr, desc, icon });

  SS.assessment = {
    tabs: [
      {
        key: 'alignment', short: 'A', label: 'Alignment', planes: false,
        tools: [
          T('Cobb','Cobb','Coronal/sagittal Cobb angle','cobb'),
          T('SVA','SVA','Sagittal Vertical Axis','sva'),
          T('PI-LL','PI-LL','Pelvic incidence – lordosis','pill'),
          T('Pelvis','Pelvis','PI / PT / SS','pelvis'),
          T('TK','TK','Thoracic Kyphosis','tk'),
          T('LL','LL','Lumbar Lordosis','ll'),
          T('CL','CL','Cervical Lordosis','cl'),
        ],
        groups: [
          { name: 'Spinal Alignment', items: [
            { label: 'Cobb Angle (T4–T12)', value: '44°', tone: 'angle' },
            { label: 'Lordosis (L1–S1)', value: '−56°', tone: 'angle' },
            { label: 'Kyphosis (T4–T12)', value: '44°', tone: 'angle' },
            { label: 'SVA', value: '32 mm', tone: 'good' },
          ]},
          { name: 'Pelvic Parameters', items: [
            { label: 'Pelvic Incidence (PI)', value: '56°', tone: 'pelvic' },
            { label: 'Pelvic Tilt (PT)', value: '18°', tone: 'pelvic' },
            { label: 'Sacral Slope (SS)', value: '38°', tone: 'pelvic' },
          ]},
          { name: 'Spinopelvic Relationships', items: [
            { label: 'PI – LL Mismatch', value: '12°', tone: 'bad' },
            { label: 'PI – PT Mismatch', value: '38°', tone: 'bad' },
            { label: 'T1 Pelvic Angle (TPA)', value: '24°', tone: 'pelvic' },
          ]},
          { name: 'Other Measurements', items: [
            { label: 'Vertebral Rotation (Max)', value: '8°', tone: 'angle' },
            { label: 'Rib Hump (Right)', value: '12 mm', tone: 'angle' },
            { label: 'Intervertebral Angle (L4–L5)', value: '6°', tone: 'pelvic' },
          ]},
        ],
        refLines: [],
      },
      {
        key: 'deformity', short: 'D', label: 'Deformity', planes: true,
        coronal: {
          tools: [
            T('CMC','CMC','Cobb Multi-Curve','cmc'),
            T('TS','TS','Trunk Shift','ts'),
            T('AVT','AVT','Apical Vertebral Tilt','avt'),
            T('RVAD','RVAD','Rib Vertebral Angle Difference','rvad'),
            T('PO','PO','Pelvic Obliquity','po'),
            T('VBM','VBM','Vertebral Body Metrics','vbm'),
          ],
          groups: [
            { name: 'Coronal Deformity', items: [
              { label: 'Cobb Multi-Curve (CMC)', value: '48°', tone: 'bad' },
              { label: 'Trunk Shift (TS)', value: '25 mm', tone: 'bad' },
              { label: 'Apical Vertebral Tilt (AVT)', value: '12 mm', tone: 'bad' },
              { label: 'Rib Vertebral Angle Difference (RVAD)', value: '16°', tone: 'bad' },
              { label: 'Pelvic Obliquity (PO)', value: '7°', tone: 'bad' },
              { label: 'Vertebral Body Metrics (VBM)', value: '', tone: 'plain', chevron: true },
            ]},
          ],
          refLines: [ { abbr:'CSVL', name:'Coronal Sacral Vertical Line', value:'8 mm' }, { abbr:'C7PL', name:'C7 Plumb Line', value:'4 mm' } ],
        },
        sagittal: {
          tools: [
            T('TPA','TPA','T1 Pelvic Angle','tpa'),
            T('SSA','SSA','Spinosacral Angle','ssa'),
            T('SPA','SPA','Spinopelvic Angle','spa'),
            T('T1SPi','T1SPi','T1 Spinopelvic Inclination','t1'),
            T('T9SPi','T9SPi','T9 Spinopelvic Inclination','t9'),
            T('ODHA','ODHA','Odontoid Hip Angle','odha'),
            T('CBVA','CBVA','Chin Brow Vertical Angle','cbva'),
          ],
          groups: [
            { name: 'Sagittal Deformity', items: [
              { label: 'T1 Pelvic Angle (TPA)', value: '24°', tone: 'bad' },
              { label: 'Spinosacral Angle (SSA)', value: '42°', tone: 'bad' },
              { label: 'Spinopelvic Angle (SPA)', value: '18°', tone: 'bad' },
              { label: 'T1 Spinopelvic Inclination (T1SPi)', value: '14°', tone: 'bad' },
              { label: 'T9 Spinopelvic Inclination (T9SPi)', value: '10°', tone: 'bad' },
              { label: 'Odontoid Hip Angle (ODHA)', value: '122°', tone: 'bad' },
              { label: 'Chin Brow Vertical Angle (CBVA)', value: '12°', tone: 'bad' },
            ]},
          ],
          refLines: [ { abbr:'SVL', name:'Sagittal Vertical Line', value:'32 mm' }, { abbr:'C7PL', name:'C7 Plumb Line', value:'4 mm' }, { abbr:'GL', name:'Gravity Line', value:'6 mm' } ],
        },
      },
      {
        key: 'pathology', short: 'P', label: 'Pathology', planes: false,
        tools: [
          T('Canal Area','Canal Area','Measure spinal canal area','canal'),
          T('Spondylolisthesis','Spondylolisthesis','Measure vertebral slip','spondy'),
        ],
        groups: [
          { name: 'Pathology', items: [
            { label: 'Canal Area', value: '128 mm²', tone: 'purple', dot: 'violet', sub: [
              { label: 'Level', value: 'L3–L4' }, { label: 'Status', value: 'Severe Stenosis' },
            ]},
            { label: 'Spondylolisthesis', value: '', dot: 'red', sub: [
              { label: 'Level', value: 'L4 on L5' },
              { label: 'Slip Distance', value: '7.2 mm', tone: 'bad' },
              { label: 'Slip Percentage', value: '18%', tone: 'bad' },
              { label: 'Meyerding Grade', value: 'Grade I' },
            ]},
          ]},
        ],
        refLines: [],
      },
      {
        key: 'manual', short: 'M', label: 'Manual', planes: false,
        tools: [
          T('Line','Line','Straight line','line'),
          T('Pen','Pen','Freehand pen','pen'),
          T('Annotation','Annotation','Text annotation','text'),
          T('2 Point Angle','2 Point Angle','Two-point angle','angle2'),
          T('3 Point Angle','3 Point Angle','Three-point angle','angle3'),
          T('Circle','Circle','Circle','circle'),
          T('Ellipse','Ellipse','Ellipse','ellipse'),
          T('Polygon','Polygon','Polygon','polygon'),
        ],
        groups: [],
        refLines: [],
      },
    ],
  };

  /* ---------- Planning ---------- */
  SS.planning = {
    targets: [
      { label: 'PI-LL Mismatch', current: '22°', target: '10°', opts: ['5°','10°','15°','20°'] },
      { label: 'SVA', current: '82 mm', target: '20 mm', opts: ['10 mm','20 mm','30 mm','40 mm'] },
      { label: 'Thoracic Kyphosis (TK)', current: '48°', target: '40°', opts: ['30°','35°','40°','45°'] },
      { label: 'Lumbar Lordosis (LL)', current: '56°', target: '50°', opts: ['45°','50°','55°','60°'] },
      { label: 'Pelvic Tilt (PT)', current: '18°', target: '15°', opts: ['10°','15°','20°'] },
    ],
    osteotomies: [
      { abbr:'PSO',  name:'Pedicle Subtraction Osteotomy', icon:'pso' },
      { abbr:'SPO',  name:'Smith-Petersen Osteotomy', icon:'spo' },
      { abbr:'VCR',  name:'Vertebral Column Resection', icon:'vcr' },
      { abbr:'Open', name:'Opening Wedge Osteotomy', icon:'open' },
    ],
    instrumentation: [
      { abbr:'Screw',   name:'Pedicle Screw', icon:'screw' },
      { abbr:'LIV/UIV', name:'Set Levels', icon:'levels' },
      { abbr:'Rod',     name:'Rod Contour', icon:'rod' },
      { abbr:'Cage',    name:'Interbody Cage', icon:'cage' },
    ],
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
        { dot:'blue',   label:'Screw', value:'T10 – S1' },
        { dot:'violet', label:'LIV',   value:'S1' },
        { dot:'violet', label:'UIV',   value:'T10' },
        { dot:'teal',   label:'Rod',   value:'Left: 5.5 mm Ti / Right: 5.5 mm Ti' },
        { dot:'amber',  label:'Cage',  value:'L3-L4' },
      ],
    },
  };

  /* ---------- Compare ---------- */
  SS.compare = {
    left:  { label: 'Current Study', date: 'May 10, 2024' },
    right: { label: 'Selected Study', date: 'Feb 15, 2024' },
    groups: [
      { name: 'Sagittal Alignment', rows: [
        { label:'PI-LL Mismatch', a:'10°', b:'30°', d:'−20°', tone:'good' },
        { label:'SVA', a:'20 mm', b:'82 mm', d:'−62 mm', tone:'good' },
        { label:'Thoracic Kyphosis (TK)', a:'40°', b:'18°', d:'+22°', tone:'bad' },
        { label:'Lumbar Lordosis (LL)', a:'50°', b:'28°', d:'+22°', tone:'bad' },
        { label:'Pelvic Tilt (PT)', a:'15°', b:'22°', d:'−7°', tone:'good' },
      ]},
      { name: 'Coronal Alignment', rows: [
        { label:'Cobb (T1–T12)', a:'22°', b:'38°', d:'−16°', tone:'good' },
        { label:'Cobb (T12–L5)', a:'18°', b:'31°', d:'−13°', tone:'good' },
        { label:'Coronal Balance (CSVL)', a:'8 mm', b:'24 mm', d:'−16 mm', tone:'good' },
        { label:'Trunk Shift', a:'6 mm', b:'18 mm', d:'−12 mm', tone:'good' },
      ]},
      { name: 'Pelvic Parameters', rows: [
        { label:'Pelvic Incidence (PI)', a:'56°', b:'56°', d:'0°', tone:'flat' },
        { label:'Sacral Slope (SS)', a:'41°', b:'34°', d:'+7°', tone:'bad' },
        { label:'Pelvic Tilt (PT)', a:'15°', b:'22°', d:'−7°', tone:'good' },
      ]},
      { name: 'Global', rows: [
        { label:'C7 Plumb Line (C7PL)', a:'4 mm', b:'18 mm', d:'−14 mm', tone:'good' },
      ]},
    ],
  };

  /* ---------- Report ---------- */
  SS.report = {
    sections: [
      { id:'cover', label:'Cover', on:true },
      { id:'patient', label:'Patient Summary', on:true },
      { id:'alignment', label:'Alignment Summary', on:true },
      { id:'measurement', label:'Measurement Table', on:true },
      { id:'comparison', label:'Current vs Simulation Comparison', on:true },
      { id:'plan', label:'Surgical Plan Summary', on:true },
      { id:'osteotomies', label:'Osteotomies', on:true },
      { id:'instrumentation', label:'Instrumentation Plan', on:true },
      { id:'images', label:'Images', on:true },
      { id:'notes', label:'Notes', on:true },
    ],
    alignmentSummary: [
      { label:'PI-LL Mismatch', value:'10°' }, { label:'SVA', value:'20 mm' },
      { label:'Thoracic Kyphosis (TK)', value:'40°' }, { label:'Lumbar Lordosis (LL)', value:'50°' },
      { label:'Pelvic Tilt (PT)', value:'15°' },
    ],
  };

  /* ---------- 3D CT planning ---------- */
  SS.ct = {
    screwProps: [
      ['Screw Type','Pedicle Screw'], ['Diameter','6.5 mm'], ['Length','40 mm – 50 mm'],
      ['Material','Titanium'], ['Levels','T10 – S1'], ['Trajectory','Standard'],
    ],
    rodProps: [
      ['Diameter','5.5 mm'], ['Material','Titanium'], ['Rod Type','Pre-bent'],
      ['Levels','T10 – S1'], ['Left Length','235 mm'], ['Right Length','235 mm'],
    ],
  };

  /* ---------- Patients ---------- */
  SS.patients = [
    { name:'John Anderson', age:58, sex:'M', mrn:'1002456', active:true },
    { name:'Sarah Johnson', age:63, sex:'F', mrn:'1003471' },
    { name:'Robert Taylor', age:47, sex:'M', mrn:'1001122' },
    { name:'Maria Garcia', age:45, sex:'F', mrn:'1003491' },
    { name:'Michael Brown', age:61, sex:'M', mrn:'1007781' },
    { name:'Olivia Martinez', age:29, sex:'F', mrn:'1005567' },
    { name:'William Davis', age:62, sex:'M', mrn:'1002459' },
    { name:'Sophia Wilson', age:51, sex:'F', mrn:'1001099' },
  ];
  SS.timeline = [
    { date:'Jan 12, 2024', title:'Pre-op Assessment', count:'4 studies', open:true, studies: [
      { name:'EOS AP', region:'Full Spine', size:'2.1 GB', modality:'EOS', status:'Completed' },
      { name:'EOS Lateral', region:'Full Spine', size:'1.8 GB', modality:'EOS', status:'Completed' },
      { name:'CT Lumbar', region:'L1–S1', size:'3.4 GB', modality:'CT', status:'Completed' },
      { name:'MRI Lumbar', region:'T12–S1', size:'2.7 GB', modality:'MRI', status:'In Progress' },
    ]},
    { date:'Feb 3, 2024', title:'Surgical Planning' },
    { date:'Mar 28, 2024', title:'Post-op' },
    { date:'Sep 14, 2024', title:'6 Month Follow-up' },
    { date:'Jan 9, 2025', title:'Revision Planning' },
  ];

  /* ---------- Library ---------- */
  SS.library = {
    collections: [
      { name:'PSO Cases', count:12, active:true },
      { name:'List Thesis Cases', count:18 },
      { name:'2026 COST-Conference', count:24 },
      { name:'Teaching Material', count:36 },
      { name:'Revision Cases', count:22 },
      { name:'Adolescent Scoliosis', count:15 },
      { name:'Implant Library', count:31 },
      { name:'Complex Deformities', count:17 },
    ],
    active: {
      name:'PSO Cases', private:true, count:12, owner:'Dr. Daniel Smith', created:'Jan 8, 2024',
      desc:'A curated collection of Pedicle Subtraction Osteotomy cases including pre-op planning and post-op outcomes.',
    },
    studies: [
      { name:'PSO Case – 012', patient:'John Anderson', sex:'58M', date:'Jan 12, 2024', modality:'X-RAY' },
      { name:'PSO Case – 011', patient:'Maria Garcia', sex:'45F', date:'Jan 10, 2024', modality:'MRI' },
      { name:'PSO Case – 010', patient:'Robert Taylor', sex:'47M', date:'Jan 8, 2024', modality:'CT' },
      { name:'PSO Case – 009', patient:'Michael Brown', sex:'61M', date:'Jan 5, 2024', modality:'X-RAY' },
      { name:'PSO Case – 008', patient:'Sarah Johnson', sex:'52F', date:'Jan 3, 2024', modality:'MRI' },
      { name:'PSO Case – 007', patient:'Olivia Martinez', sex:'29F', date:'Dec 30, 2023', modality:'CT' },
      { name:'PSO Case – 006', patient:'William Davis', sex:'62M', date:'Dec 28, 2023', modality:'MRI' },
      { name:'PSO Case – 005', patient:'Sophia Wilson', sex:'51F', date:'Dec 25, 2023', modality:'X-RAY' },
    ],
  };

  /* ---------- Settings ---------- */
  SS.settings = {
    nav: [
      { key:'general', label:'General', icon:'user' },
      { key:'dicom', label:'DICOM & PACS', icon:'database' },
      { key:'workspace', label:'Workspace', icon:'monitor' },
      { key:'library', label:'Library & Reports', icon:'file' },
      { key:'instr', label:'Instrumentation Library', icon:'implant', locked:true },
      { key:'admin', label:'Administration', icon:'shield' },
    ],
    pacs: [
      { server:'Orthanc Server', ae:'ORTHANC', host:'192.168.1.10', port:'4242', status:'Connected' },
      { server:'Hospital PACS', ae:'HOSP_PACS', host:'192.168.1.20', port:'104', status:'Connected' },
      { server:'Backup PACS', ae:'BACKUP_PACS', host:'192.168.1.30', port:'104', status:'Disconnected' },
    ],
    users: [
      { name:'Dr. Alex Thompson', email:'alex.thompson@spinecenter.com', role:'Surgeon', status:'Active' },
      { name:'Dr. Priya Patel', email:'priya.patel@spinecenter.com', role:'Resident', status:'Active' },
      { name:'Michael Chen', email:'michael.chen@spinecenter.com', role:'Researcher', status:'Active' },
      { name:'Emma Davis', email:'emma.davis@spinecenter.com', role:'Admin', status:'Active' },
    ],
    storage: [ ['Total Storage Used','128.4 GB','of 500 GB'], ['Studies','1,245','Total'], ['Reports','832','Total'], ['Collections','156','Total'] ],
  };

  window.SS = SS;
})();
