I have read every file in the codebase. Here is the complete architectural audit.

---

# SPINESURGE ARCHITECTURAL AUDIT

---

## SECTION 1 — DATABASE INVENTORY

**Stack:** PostgreSQL 16, Drizzle ORM 0.45, schema in `server/schema.ts`, migration in `server/drizzle/0000_mixed_moonstone.sql`

---

```
Table: patients
Purpose: Core patient demographic record
Primary Key: id (TEXT, application-generated, e.g. "PAT-123456" or "john-doe")
Columns:
  id           TEXT        PK, NOT NULL
  name         TEXT        NOT NULL
  age          INTEGER     nullable
  gender       TEXT        nullable ('M' | 'F' | 'O')
  dob          TEXT        nullable (ISO date string)
  contact      TEXT        nullable
  last_visit   TEXT        nullable (date string)
  has_alert    BOOLEAN     DEFAULT false
  is_archived  BOOLEAN     DEFAULT false
Relationships:
  patients → visits       (one-to-many, visits.patient_id)
  patients → studies      (one-to-many, studies.patient_id)
  patients → contexts     (one-to-many, contexts.patient_id)
Referenced By:
  visits.patient_id
  studies.patient_id
  contexts.patient_id
Files Using It:
  server/schema.ts          (table definition + patientsRelations)
  server/index.ts           (GET /api/patients, POST /api/patients, POST /api/patients/:id/archive, POST /api/import)
  server/reset.ts           (TRUNCATE)
  server/migrate-sqlite-to-postgres.ts (migration target)
  src/renderer/lib/api.ts   (getPatients, savePatient, archivePatient)
  src/renderer/lib/store/patientSlice.ts (addPatient, updatePatient, archivePatient)
```

---

```
Table: visits
Purpose: Clinical encounter linked to a patient
Primary Key: id (TEXT, application-generated, e.g. Date.now().toString())
Columns:
  id            TEXT    PK, NOT NULL
  patient_id    TEXT    NOT NULL, FK → patients.id CASCADE DELETE
  visit_number  TEXT    nullable (e.g. "#0001")
  date          TEXT    nullable
  time          TEXT    nullable
  diagnosis     TEXT    nullable
  comments      TEXT    nullable
  height        TEXT    nullable
  weight        TEXT    nullable
  consultants   TEXT    nullable
  surgery_date  TEXT    nullable
Relationships:
  visits → patients  (many-to-one)
  visits → studies   (one-to-many, studies.visit_id — optional)
  visits → reports   (one-to-many, reports.visit_id)
  visits → contexts  (one-to-many via contexts.visit_id — SET NULL on delete)
Referenced By:
  studies.visit_id
  reports.visit_id
  contexts.visit_id
Files Using It:
  server/schema.ts          (table definition + visitsRelations)
  server/index.ts           (POST /api/visits, DELETE /api/visits/:id, GET /api/patients eager-loads visits)
  server/reset.ts           (TRUNCATE)
  server/migrate-sqlite-to-postgres.ts
  src/renderer/lib/api.ts   (saveVisit, deleteVisit)
  src/renderer/lib/store/patientSlice.ts (addVisit, updateVisit, deleteVisit, reorderVisits)
  src/renderer/features/patients/NewVisitDialog.tsx
  src/renderer/features/patients/ReportsListDialog.tsx (visitId passed to getReports)
  src/renderer/pages/PatientCasesPage.tsx (VisitCard, delete, edit)
```

---

```
Table: studies
Purpose: Imaging study grouping (modality-level), belongs to a patient and optionally a visit
Primary Key: id (TEXT, e.g. "std-1781159126436", "pacs-XXXXX-timestamp")
Columns:
  id               TEXT    PK, NOT NULL
  patient_id       TEXT    NOT NULL, FK → patients.id CASCADE DELETE
  visit_id         TEXT    nullable, FK → visits.id CASCADE DELETE
  modality         TEXT    DEFAULT 'X-Ray'
  source           TEXT    DEFAULT 'Import' ('Import' | 'Upload' | 'PACS')
  acquisition_date TEXT    nullable
Relationships:
  studies → patients     (many-to-one)
  studies → visits       (many-to-one, nullable)
  studies → scans        (one-to-many)
  studies ↔ contexts     (many-to-many via context_studies)
Referenced By:
  scans.study_id
  context_studies.study_id
Files Using It:
  server/schema.ts          (table definition + studiesRelations)
  server/index.ts           (POST /api/studies, GET /api/patients eager-loads studies, POST /api/import, POST /api/pacs/import indirectly)
  server/pacsService.ts     (db.insert studies in importPACSStudy)
  server/reset.ts           (TRUNCATE)
  server/migrate-sqlite-to-postgres.ts
  src/renderer/lib/api.ts   (saveStudy)
  src/renderer/lib/store/patientSlice.ts (addStudy)
  src/renderer/features/patients/ImagingImportDialog.tsx
  src/renderer/features/patients/ScanUploadDialog.tsx
  src/renderer/features/patients/NewContextDialog.tsx (renders study list)
  src/renderer/pages/PatientCasesPage.tsx (renders studies per visit)
```

---

```
Table: scans
Purpose: Individual image file belonging to a study
Primary Key: id (TEXT, e.g. "scan-1781159126437", "scan-pacs-XXXXX-timestamp")
Columns:
  id         TEXT    PK, NOT NULL
  study_id   TEXT    NOT NULL, FK → studies.id CASCADE DELETE
  file_path  TEXT    NOT NULL (filename only, e.g. "1781159131917-82195257.jpg")
  type       TEXT    DEFAULT 'Imported' ('Pre-op' | 'Post-op' | 'Imported')
  date       TEXT    nullable
Relationships:
  scans → studies  (many-to-one)
Referenced By:
  (no table references scans directly; accessed via study eager-loading)
Files Using It:
  server/schema.ts          (table definition + scansRelations)
  server/index.ts           (POST /api/scans with multer upload, GET /api/patients eager-loads scans)
  server/pacsService.ts     (db.insert scans in importPACSStudy)
  server/reset.ts           (TRUNCATE)
  server/migrate-sqlite-to-postgres.ts
  src/renderer/lib/api.ts   (uploadScan)
  src/renderer/lib/store/patientSlice.ts (addScan)
  src/renderer/features/patients/ImagingImportDialog.tsx
  src/renderer/features/patients/ScanUploadDialog.tsx
```

---

```
Table: contexts
Purpose: Named planning/viewing workspace for a patient, linked to a visit (optional) and studies (via join table)
Primary Key: id (TEXT, e.g. "ctx-1781159126436")
Columns:
  id             TEXT    PK, NOT NULL
  patient_id     TEXT    NOT NULL, FK → patients.id CASCADE DELETE
  visit_id       TEXT    nullable, FK → visits.id SET NULL on delete
  mode           TEXT    NOT NULL ('view' | 'plan' | 'compare')
  name           TEXT    nullable
  last_modified  TEXT    nullable (ISO datetime string)
  annotations    TEXT    JSON array stored as TEXT, DEFAULT '[]'
  tool_state     TEXT    JSON object stored as TEXT, DEFAULT '{}'
Relationships:
  contexts → patients         (many-to-one)
  contexts → visits           (many-to-one, nullable)
  contexts ↔ studies          (many-to-many via context_studies)
  contexts → measurements     (one-to-many)
  contexts → implants         (one-to-many)
Referenced By:
  context_studies.context_id
  measurements.context_id
  implants.context_id
Files Using It:
  server/schema.ts          (table definition + contextsRelations)
  server/index.ts           (GET /api/contexts/:patientId, POST /api/contexts with full transaction)
  server/reset.ts           (TRUNCATE)
  server/migrate-sqlite-to-postgres.ts
  src/renderer/lib/api.ts   (getContexts, saveContext)
  src/renderer/lib/store/patientSlice.ts (addContext, updateContextState, setActivePatient fetches contexts)
  src/renderer/features/patients/NewContextDialog.tsx
  src/renderer/pages/PatientCasesPage.tsx (handleContinueContext, handleStartNewFromStudy)
```

---

```
Table: context_studies
Purpose: Many-to-many join table linking contexts to studies
Primary Key: COMPOSITE (context_id, study_id)
Columns:
  context_id  TEXT    NOT NULL, FK → contexts.id CASCADE DELETE
  study_id    TEXT    NOT NULL, FK → studies.id CASCADE DELETE
Relationships:
  context_studies → contexts  (many-to-one)
  context_studies → studies   (many-to-one)
Files Using It:
  server/schema.ts          (table definition + contextStudiesRelations)
  server/index.ts           (DELETE + INSERT in POST /api/contexts transaction — sync study links)
  server/reset.ts           (TRUNCATE)
  server/migrate-sqlite-to-postgres.ts
  src/renderer/lib/store/patientSlice.ts (indirectly — studyIds sent in saveContext body)
```

---

```
Table: measurements
Purpose: Recorded tool measurements inside a context (Cobb angle, SVA, etc.)
Primary Key: id (TEXT, generated as "${contextId}-m-${Date.now()}-${Math.random()}")
Columns:
  id           TEXT       PK, NOT NULL
  context_id   TEXT       NOT NULL, FK → contexts.id CASCADE DELETE
  tool_key     TEXT       NOT NULL (e.g. 'cobb-angle', 'SVA')
  fragment_id  TEXT       nullable (sub-region identifier)
  points       TEXT       JSON array of {x,y} points
  result       TEXT       JSON computed result
  metadata     TEXT       JSON display metadata
  timestamp    INTEGER    Unix ms timestamp
Relationships:
  measurements → contexts  (many-to-one)
Files Using It:
  server/schema.ts          (table definition + measurementsRelations)
  server/index.ts           (DELETE + INSERT in POST /api/contexts transaction)
  server/reset.ts           (TRUNCATE)
  server/migrate-sqlite-to-postgres.ts
  src/renderer/lib/store/patientSlice.ts (updateContextState sends measurements array)
  src/renderer/lib/store/canvasSlice.ts  (setMeasurements, deleteMeasurement, toggleMeasurementSelection)
  src/renderer/lib/store/dicomSlice.ts   (pedicleSimulations synced to contextState which includes measurements)
```

---

```
Table: implants
Purpose: 2D implant placements (screws, rods, cages) inside a context
Primary Key: id (TEXT, generated as "${contextId}-i-${Date.now()}-${Math.random()}")
Columns:
  id           TEXT     PK, NOT NULL
  context_id   TEXT     NOT NULL, FK → contexts.id CASCADE DELETE
  type         TEXT     NOT NULL ('screw' | 'rod' | 'cage' | 'plate' | 'spacer')
  fragment_id  TEXT     nullable
  position     TEXT     JSON {x, y}
  angle        REAL     rotation in degrees
  properties   TEXT     JSON (dimensions, model info)
  timestamp    INTEGER  Unix ms timestamp
Relationships:
  implants → contexts  (many-to-one)
Files Using It:
  server/schema.ts          (table definition + implantsRelations)
  server/index.ts           (DELETE + INSERT in POST /api/contexts transaction)
  server/reset.ts           (TRUNCATE)
  server/migrate-sqlite-to-postgres.ts
  src/renderer/lib/store/patientSlice.ts (updateContextState sends implants array)
  src/renderer/lib/store/canvasSlice.ts  (setImplants, deleteImplant)
  src/renderer/lib/store/dicomSlice.ts   (addThreeDImplant, updateThreeDImplant, removeThreeDImplant — synced to contextState)
```

---

```
Table: reports
Purpose: PDF reports attached to a visit
Primary Key: id (TEXT, e.g. "rep-1781159126436")
Columns:
  id          TEXT    PK, NOT NULL
  visit_id    TEXT    NOT NULL, FK → visits.id CASCADE DELETE
  file_path   TEXT    NOT NULL (filename only)
  title       TEXT    nullable
  created_at  TEXT    nullable (YYYY-MM-DD)
Relationships:
  reports → visits  (many-to-one)
Files Using It:
  server/schema.ts          (table definition + reportsRelations)
  server/index.ts           (POST /api/reports, GET /api/reports/:visitId)
  server/reset.ts           (TRUNCATE)
  server/migrate-sqlite-to-postgres.ts
  src/renderer/lib/api.ts   (uploadReport, getReports)
  src/renderer/features/patients/ReportsListDialog.tsx
  src/renderer/features/navigation/ReportDialog.tsx  (referenced by name — uploads report via API)
```

---

## SECTION 2 — COMPLETE ENTITY RELATIONSHIP MAP

```
patients (id: TEXT PK)
│
├── [1:N] visits (patient_id → patients.id) CASCADE DELETE
│     │
│     ├── [1:N] studies (visit_id → visits.id) CASCADE DELETE   ← OPTIONAL link
│     │           │
│     │           └── [1:N] scans (study_id → studies.id) CASCADE DELETE
│     │
│     ├── [1:N] reports (visit_id → visits.id) CASCADE DELETE
│     │
│     └── [1:N via SET NULL] contexts.visit_id
│
├── [1:N] studies (patient_id → patients.id) CASCADE DELETE    ← REQUIRED link
│     │  (same studies rows — dual-FK design: patient_id required, visit_id optional)
│     │
│     └── [M:N via context_studies] contexts
│
└── [1:N] contexts (patient_id → patients.id) CASCADE DELETE
      │
      ├── [M:N] context_studies (context_id, study_id) COMPOSITE PK
      │           ├── → contexts.id CASCADE DELETE
      │           └── → studies.id  CASCADE DELETE
      │
      ├── [1:N] measurements (context_id → contexts.id) CASCADE DELETE
      │
      └── [1:N] implants (context_id → contexts.id) CASCADE DELETE


Cardinality Summary:
  patients  →  visits         1 : N
  patients  →  studies        1 : N
  patients  →  contexts       1 : N
  visits    →  studies        1 : N (optional — study can have null visit_id)
  visits    →  reports        1 : N
  visits    →  contexts       1 : N (nullable, SET NULL on delete)
  studies   →  scans          1 : N
  contexts  ↔  studies        M : N (via context_studies)
  contexts  →  measurements   1 : N
  contexts  →  implants       1 : N
```

**Hidden relationship found in code:**
- `server/index.ts` `GET /api/patients` assigns orphaned studies (those with `null visitId`) to the most recent visit on the frontend side: `const visitStudies = studies.filter(s => s.visitId === v.id || (isLatestVisit && !s.visitId))`. This is a **runtime inference**, not a database constraint. Evidence: `server/index.ts` lines within the `formattedPatients` map.

---

## SECTION 3 — API INVENTORY

All routes are in a **single file**: `server/index.ts`. There is no router abstraction — Express is used flat.

---

```
Method: GET
Path: /api/patients
Purpose: Fetch all patients with nested visits, studies, scans
Database Tables Used: patients, visits, studies, scans
Service Layer: db.query.patients.findMany (Drizzle relational query, eager-loads 4 levels deep)

Method: POST
Path: /api/patients
Purpose: Create or upsert a patient record
Database Tables Used: patients
Service Layer: db.insert(schema.patients).onConflictDoUpdate

Method: POST
Path: /api/patients/:id/archive
Purpose: Toggle isArchived flag on a patient
Database Tables Used: patients
Service Layer: db.update(schema.patients).where(eq(...))

Method: POST
Path: /api/visits
Purpose: Create or upsert a visit for a patient
Database Tables Used: visits
Service Layer: db.insert(schema.visits).onConflictDoUpdate

Method: DELETE
Path: /api/visits/:id
Purpose: Delete a visit (cascades to studies, reports; sets null on contexts.visit_id)
Database Tables Used: visits
Service Layer: db.delete(schema.visits).where(eq(...))

Method: POST
Path: /api/studies
Purpose: Create or upsert an imaging study
Database Tables Used: studies
Service Layer: db.insert(schema.studies).onConflictDoUpdate

Method: POST
Path: /api/scans
Purpose: Upload an image file and create a scan record
Database Tables Used: scans
Service Layer: multer disk storage + db.insert(schema.scans).onConflictDoUpdate

Method: GET
Path: /api/contexts/:patientId
Purpose: Fetch all contexts for a patient with nested studies, measurements, implants
Database Tables Used: contexts, context_studies, measurements, implants
Service Layer: db.query.contexts.findMany with eager-loading

Method: POST
Path: /api/contexts
Purpose: Create or upsert a context + sync study links + sync measurements + sync implants (full transaction)
Database Tables Used: contexts, context_studies, measurements, implants
Service Layer: db.transaction → upsert context, delete+insert context_studies, delete+insert measurements, delete+insert implants

Method: POST
Path: /api/reports
Purpose: Upload a PDF report for a visit
Database Tables Used: reports
Service Layer: multer disk storage + db.insert(schema.reports)

Method: GET
Path: /api/reports/:visitId
Purpose: Fetch all reports for a visit
Database Tables Used: reports
Service Layer: db.query.reports.findMany where visitId matches

Method: GET
Path: /api/local-file
Purpose: Proxy to serve a local file from the uploads directory (security-bounded)
Database Tables Used: none
Service Layer: fs.existsSync + res.sendFile

Method: POST
Path: /api/import
Purpose: Recursively scan a server-side folder, detect DICOM/images, insert patients/studies/scans
Database Tables Used: patients, studies, scans
Service Layer: db.transaction with recursive filesystem walk + DICOM magic-byte detection

Method: POST
Path: /api/pacs/search
Purpose: Search a WADO/DICOMweb PACS server for studies
Database Tables Used: none (external HTTP call)
Service Layer: pacsService.searchPACS

Method: POST
Path: /api/pacs/import
Purpose: Import a study from PACS — download images, insert study+scans
Database Tables Used: studies, scans
Service Layer: pacsService.importPACSStudy → db.insert studies + scans

WebSocket: ws://localhost:3001
Path: /spinesurge-pro-{roomId}
Purpose: Real-time collaborative Yjs document sync (measurements, implants, canvas state)
Database Tables Used: none (in-memory Yjs docs, not persisted to DB)
Service Layer: y-websocket.ts (WSSharedDoc, in-memory Map of docs)
```

---

## SECTION 4 — FRONTEND DEPENDENCY CONTRACTS

```
Endpoint: GET /api/patients
Returned Schema:
  Patient[] where each Patient contains:
    id, name, age, gender, dob, lastVisit, hasAlert, isArchived, contact
    visits: Visit[] (with studies[], scans[], surgeryDate)
    studies: Study[] (with scans[])
Expected Inputs: none
Likely Frontend Usage:
  - Called on app init (initializeStore in patientSlice.ts)
  - Called after every mutating operation (addVisit, addStudy trigger initializeStore)
  - Drives entire PatientCasesPage left sidebar and visit card rendering
⚠️  CRITICAL FRONTEND DEPENDENCY
  Removing or restructuring the nested visits[].studies[].scans[] shape
  will break PatientCasesPage.tsx, patientSlice.ts, CanvasWorkspace, and
  the study action dialog. Every page that renders patient data depends on
  this single endpoint's response shape.

Endpoint: POST /api/patients
Expected Inputs: { id, name, age, gender, dob, sex, contact, lastVisit, hasAlert, isArchived }
Returned Schema: { success: true }
Likely Frontend Usage: NewPatientDialog.tsx handleSubmit → addPatient/updatePatient

Endpoint: POST /api/patients/:id/archive
Expected Inputs: { archived: boolean }
Returned Schema: { success: true }
Likely Frontend Usage: PatientCasesPage.tsx handleArchiveToggle → archivePatient

Endpoint: POST /api/visits
Expected Inputs: { id, patientId, visitNumber, date, time, diagnosis, comments, height, weight, consultants, surgeryDate }
Returned Schema: { success: true }
Likely Frontend Usage: NewVisitDialog.tsx, reorderVisits in patientSlice.ts
⚠️  CRITICAL FRONTEND DEPENDENCY — visit deletion triggers cascade on studies and reports

Endpoint: DELETE /api/visits/:id
Expected Inputs: URL param :id
Returned Schema: { success: true }
Likely Frontend Usage: VisitCard delete button in PatientCasesPage.tsx

Endpoint: POST /api/studies
Expected Inputs: { id, patientId, visitId?, modality, source, acquisitionDate }
Returned Schema: { success: true }
Likely Frontend Usage: ImagingImportDialog.tsx, ScanUploadDialog.tsx, PACSSearch.tsx

Endpoint: POST /api/scans
Expected Inputs: FormData { file, id, studyId, type, date }
Returned Schema: { success: true, imageUrl: string }
Likely Frontend Usage: ImagingImportDialog.tsx, ScanUploadDialog.tsx
⚠️  CRITICAL FRONTEND DEPENDENCY — imageUrl returned here is immediately stored in local state and shown to user

Endpoint: GET /api/contexts/:patientId
Returned Schema:
  Context[] where each item contains:
    id, patientId, visitId, studyIds[], mode, name, lastModified
    measurements: Measurement[] (points, result, metadata parsed from JSON)
    implants: Implant[] (position, properties parsed from JSON)
    annotations: any[]
    toolState: any
Expected Inputs: URL param :patientId
Likely Frontend Usage:
  - Called in setActivePatient (patientSlice.ts) every time active patient changes
  - Result drives contextStates in store → canvas measurements, implants, DICOM state
⚠️  CRITICAL FRONTEND DEPENDENCY

Endpoint: POST /api/contexts
Expected Inputs: { id, patientId, visitId, studyIds[], mode, name, lastModified, state: { measurements[], implants[], threeDImplants[], pedicleSimulations[], annotations[], toolState, currentImage } }
Returned Schema: { success: true }
Likely Frontend Usage:
  - addContext in patientSlice.ts
  - updateContextState fires this on every canvas change (autosave pattern)
⚠️  CRITICAL FRONTEND DEPENDENCY — this is the primary autosave mechanism

Endpoint: GET /api/reports/:visitId
Returned Schema: Report[] with url field added (absolute URL)
Expected Inputs: URL param :visitId
Likely Frontend Usage: ReportsListDialog.tsx

Endpoint: POST /api/reports
Expected Inputs: FormData { file, visitId, title, id }
Returned Schema: { success: true }
Likely Frontend Usage: ReportDialog.tsx (navigation feature)

Endpoint: POST /api/pacs/search
Expected Inputs: { config: PACSServerConfig, query: { patientName?, patientID?, studyDate? } }
Returned Schema: PACSStudy[]
Likely Frontend Usage: PACSSearch.tsx in ImagingImportDialog

Endpoint: POST /api/pacs/import
Expected Inputs: { config, studyInstanceUID, patientId, visitId? }
Returned Schema: { success: true, count: number, studyId: string }
Likely Frontend Usage: PACSSearch.tsx handleImport → calls initializeStore after success

Endpoint: POST /api/import
Expected Inputs: { folderPath, patientId?, visitId? }
Returned Schema: { success: true, count: number }
Likely Frontend Usage: ImagingImportDialog.tsx and ScanUploadDialog.tsx folder tab

WebSocket: ws://localhost:3001
Usage: LiveShareSlice.ts — Yjs real-time sync of measurements, implants, threeDImplants, pedicleSimulations, canvas state, currentImage
⚠️  CRITICAL FRONTEND DEPENDENCY — port 3001 is hardcoded in pacsStore.ts and liveShareSlice.ts
```

---

## SECTION 5 — LEGACY DEPENDENCY ANALYSIS

The codebase does **NOT** use the classic "FastAPI + Python" backend described in the task prompt. This is a **Node.js/TypeScript Express** backend. Accordingly:

### visits

```
Status: ACTIVE
Files Using It:
  server/schema.ts — table definition
  server/index.ts  — POST /api/visits, DELETE /api/visits/:id, eager-loaded in GET /api/patients
  src/renderer/lib/api.ts — saveVisit, deleteVisit
  src/renderer/lib/store/patientSlice.ts — addVisit, updateVisit, deleteVisit, reorderVisits
  src/renderer/features/patients/NewVisitDialog.tsx
  src/renderer/pages/PatientCasesPage.tsx — VisitCard component renders visits as primary UI unit
  src/renderer/features/patients/ReportsListDialog.tsx — visitId prop
APIs Using It:
  POST /api/visits
  DELETE /api/visits/:id
  GET /api/patients (nested)
  POST /api/reports (foreign key to visits)
  GET /api/reports/:visitId
Evidence: Visits are fully rendered in the PatientCasesPage. The entire visit CRUD flow is live.
```

### contexts

```
Status: ACTIVE
Files Using It:
  server/schema.ts — table definition
  server/index.ts  — GET /api/contexts/:patientId, POST /api/contexts (full transaction)
  src/renderer/lib/api.ts — getContexts, saveContext
  src/renderer/lib/store/patientSlice.ts — addContext, updateContextState, setActivePatient
  src/renderer/features/patients/NewContextDialog.tsx
  src/renderer/pages/PatientCasesPage.tsx — handleContinueContext, handleStartNewFromStudy
APIs Using It:
  GET /api/contexts/:patientId
  POST /api/contexts
Evidence: Contexts are the primary workspace entity. updateContextState is called on every canvas change as autosave.
```

### context_studies

```
Status: ACTIVE
Files Using It:
  server/schema.ts — table definition
  server/index.ts  — DELETE + INSERT inside POST /api/contexts transaction
  server/reset.ts  — TRUNCATE
  server/migrate-sqlite-to-postgres.ts
Evidence: The POST /api/contexts handler explicitly deletes all rows for a contextId then re-inserts from studyIds[]. This runs on every context save.
```

### measurements

```
Status: ACTIVE
Files Using It:
  server/schema.ts — table definition
  server/index.ts  — DELETE + INSERT in POST /api/contexts transaction
  src/renderer/lib/store/patientSlice.ts — updateContextState sends measurements[]
  src/renderer/lib/store/canvasSlice.ts  — setMeasurements, deleteMeasurement
Evidence: Every canvas interaction that modifies a measurement calls updateContextState → saveContext → persists to measurements table.
```

### implants

```
Status: ACTIVE
Files Using It:
  server/schema.ts — table definition
  server/index.ts  — DELETE + INSERT in POST /api/contexts transaction
  src/renderer/lib/store/patientSlice.ts — updateContextState sends implants[]
  src/renderer/lib/store/canvasSlice.ts  — setImplants, deleteImplant
  src/renderer/lib/store/dicomSlice.ts   — addThreeDImplant, updateThreeDImplant, removeThreeDImplant (3D implants synced through contextState)
Evidence: Same autosave pattern as measurements.
```

---

## SECTION 6 — DATABASE ACCESS ANALYSIS

```
Classification: ORM — Drizzle Relational Query API
File: server/index.ts
Function: GET /api/patients handler
Tables: patients, visits, studies, scans
Operation: db.query.patients.findMany with nested { with: { visits: { with: { studies: { with: { scans } } }, reports }, studies: { with: { scans } } } }

Classification: ORM — Drizzle insert/upsert
File: server/index.ts
Function: POST /api/patients handler
Tables: patients
Operation: db.insert(schema.patients).onConflictDoUpdate

Classification: ORM — Drizzle update + where
File: server/index.ts
Function: POST /api/patients/:id/archive handler
Tables: patients
Operation: db.update(schema.patients).set().where(eq(...)).returning()

Classification: ORM — Drizzle insert/upsert
File: server/index.ts
Function: POST /api/visits handler
Tables: visits
Operation: db.insert(schema.visits).onConflictDoUpdate

Classification: ORM — Drizzle delete + where
File: server/index.ts
Function: DELETE /api/visits/:id handler
Tables: visits
Operation: db.delete(schema.visits).where(eq(...)).returning()

Classification: ORM — Drizzle insert/upsert
File: server/index.ts
Function: POST /api/studies handler
Tables: studies
Operation: db.insert(schema.studies).onConflictDoUpdate

Classification: ORM — Drizzle insert/upsert
File: server/index.ts
Function: POST /api/scans handler
Tables: scans
Operation: db.insert(schema.scans).onConflictDoUpdate

Classification: ORM — Drizzle Relational Query API
File: server/index.ts
Function: GET /api/contexts/:patientId handler
Tables: contexts, context_studies, measurements, implants
Operation: db.query.contexts.findMany with { with: { studies, measurements, implants } }

Classification: ORM — Transaction (delete + insert pattern)
File: server/index.ts
Function: POST /api/contexts handler
Tables: contexts, context_studies, measurements, implants
Operation: db.transaction → upsert context, delete+insert context_studies, delete+insert measurements, delete+insert implants

Classification: ORM — Drizzle insert
File: server/index.ts
Function: POST /api/reports handler
Tables: reports
Operation: db.insert(schema.reports)

Classification: ORM — Drizzle Relational Query API
File: server/index.ts
Function: GET /api/reports/:visitId handler
Tables: reports
Operation: db.query.reports.findMany where visitId

Classification: ORM — Transaction (insert with onConflictDoNothing)
File: server/index.ts
Function: POST /api/import handler
Tables: patients, studies, scans
Operation: db.transaction with walk() recursion → insert patients, studies, scans

Classification: ORM — Drizzle insert
File: server/pacsService.ts
Function: importPACSStudy
Tables: studies, scans
Operation: db.insert(schema.studies), db.insert(schema.scans)

Classification: Raw SQL
File: server/reset.ts
Tables: scans, measurements, implants, context_studies, contexts, reports, studies, visits, patients
Operation: db.execute(sql`TRUNCATE TABLE ... RESTART IDENTITY CASCADE`)

Classification: Raw SQL (via node-postgres pool.query)
File: server/migrate-sqlite-to-postgres.ts
Tables: all 9 tables
Operation: pool.query(`INSERT INTO ${table} ... ON CONFLICT DO NOTHING`)
```

---

## SECTION 7 — STUDY DEPENDENCY ANALYSIS

**Short answer: Studies are already partially central, but not yet the primary entity. Visits are still the primary UI concept.**

```
All APIs touching studies:
  POST /api/studies         — create/upsert a study directly
  GET  /api/patients        — eager-loads studies under both patient AND visit
  POST /api/import          — creates studies during folder import
  POST /api/pacs/import     — creates studies during PACS import
  POST /api/contexts        — links studies via context_studies
  GET  /api/contexts/:id    — returns studyIds[] per context
  DELETE /api/visits/:id    — cascade-deletes studies where visit_id matches

All services touching studies:
  server/index.ts       — all CRUD on studies table
  server/pacsService.ts — creates studies as part of PACS import flow

All relationships involving studies:
  studies.patient_id → patients.id   (REQUIRED — every study must have a patient)
  studies.visit_id   → visits.id     (OPTIONAL — study can exist without a visit)
  studies ↔ contexts via context_studies (M:N join)
  studies → scans (one-to-many)
```

**Are studies already central?**
- **Partially.** Studies have a direct `patient_id` FK, so they can exist without any visit. The `POST /api/patients` eager-load returns `patient.studies[]` as a top-level array alongside `patient.visits[]`.
- **However**, the primary UI unit in `PatientCasesPage.tsx` is the **VisitCard**. Studies are rendered *inside* visits. Orphaned studies (null `visit_id`) are assigned to the latest visit at runtime in `server/index.ts` (`isLatestVisit && !s.visitId`).

**What still depends on visits:**
- `reports` — hard-coded `NOT NULL` FK to `visits.id`. Reports cannot exist without a visit.
- `contexts.visit_id` — optional but currently always set when creating a context from a visit's study.
- The entire PatientCasesPage UI — the page is structured as `patient → visits → studies`.
- `reorderVisits`, `deleteVisit`, `addVisit` in `patientSlice.ts`.

**What still depends on contexts:**
- Every measurement and implant in the system. There is no way to persist a measurement or implant without a context. Contexts are the persistence boundary for all clinical work.

---

## SECTION 8 — ORTHANC / PACS INTEGRATION ANALYSIS

The system does **not** use Orthanc directly (no Orthanc REST API calls to `/studies`, `/patients`, etc.). It uses a **DICOMweb (QIDO-RS + WADO)** integration that is compatible with Orthanc's DICOMweb plugin.

```
Endpoints:
  POST /api/pacs/search  → pacsService.searchPACS
  POST /api/pacs/import  → pacsService.importPACSStudy

Services:
  server/pacsService.ts — entire PACS integration

Utility Functions:
  searchPACS(config, query)
  importPACSStudy(config, studyInstanceUID, patientId, visitId)

Database Tables Touched:
  studies  (INSERT on import)
  scans    (INSERT on import, one per downloaded slice)

Storage Touched:
  server/uploads/   (PNG files downloaded from WADO endpoint)
```

**Study creation flow (PACS import):**
```
1. Frontend PACSSearch.tsx calls POST /api/pacs/import with { config, studyInstanceUID, patientId, visitId? }
2. pacsService.importPACSStudy():
   a. If MOCK mode: insert 1 study + 1 scan with hardcoded mock file
   b. If real DICOMweb:
      i.  GET {url}/studies/{studyInstanceUID}/instances  → get instance list
      ii. Build studyId = "pacs-{last8ofUID}-{timestamp}"
      iii. db.insert(schema.studies) with patientId, visitId, modality, source='PACS', acquisitionDate
      iv. Loop instances (max 15, sampled):
          - Build WADO URL: {url}/wado?requestType=WADO&studyUID=...&seriesUID=...&objectUID=...&contentType=image/png
          - axios.get → download PNG
          - fs.writeFile to server/uploads/{uuid}.png
          - db.insert(schema.scans) with studyId, filePath=filename, type='Imported'
3. Returns { success, count, studyId }
4. Frontend calls initializeStore() to refresh patient data
```

**Sequence diagram:**
```
Frontend                    Backend (index.ts)          pacsService.ts          DICOMweb Server
   │                               │                          │                        │
   │  POST /api/pacs/search        │                          │                        │
   │──────────────────────────────►│                          │                        │
   │                               │  searchPACS(config,q)    │                        │
   │                               │─────────────────────────►│                        │
   │                               │                          │  GET /studies?params   │
   │                               │                          │───────────────────────►│
   │                               │                          │◄───────────────────────│
   │◄──────────────────────────────│◄─────────────────────────│                        │
   │  PACSStudy[]                  │                          │                        │
   │                               │                          │                        │
   │  POST /api/pacs/import        │                          │                        │
   │──────────────────────────────►│                          │                        │
   │                               │  importPACSStudy(...)    │                        │
   │                               │─────────────────────────►│                        │
   │                               │                          │  GET /studies/{uid}/instances
   │                               │                          │───────────────────────►│
   │                               │                          │◄───────────────────────│
   │                               │                          │  INSERT studies row    │
   │                               │                          │──► DB                  │
   │                               │                          │  Loop: GET /wado?...   │
   │                               │                          │───────────────────────►│
   │                               │                          │◄─ PNG bytes ───────────│
   │                               │                          │  fs.writeFile(uuid.png)│
   │                               │                          │  INSERT scans row      │
   │                               │                          │──► DB                  │
   │◄──────────────────────────────│◄─────────────────────────│                        │
   │  { success, count, studyId }  │                          │                        │
   │                               │                          │                        │
   │  initializeStore()            │                          │                        │
   │  GET /api/patients ──────────►│                          │                        │
```

---

## SECTION 9 — STORAGE ANALYSIS

```
Storage Type: Local Filesystem
Files Using It:
  server/index.ts      — multer diskStorage writes to server/uploads/
  server/index.ts      — POST /api/import copies DICOM/image files to server/uploads/
  server/pacsService.ts — fs.writeFile PNG files to server/uploads/
  server/reset.ts      — fs.removeSync clears server/uploads/ on reset
Path Structure:
  server/uploads/{timestamp}-{random}.{ext}    for manual uploads (multer naming)
  server/uploads/{uuid}.png                     for PACS imports (randomUUID)
  server/uploads/{timestamp}-{random}.{ext}     for folder imports (same multer pattern)

Static serving:
  app.use('/uploads', express.static(UPLOADS_DIR))
  GET /api/local-file?path=...   (security proxy, directory-bounded)

Database columns storing paths:
  scans.file_path    — filename only, no directory
  reports.file_path  — filename only, no directory

Full URL reconstruction:
  toAbsoluteUrl(relativePath, baseUrl) in server/index.ts:
    → "{req.protocol}://{req.get('host')}/uploads/{filename}"

No MinIO. No S3. No cloud storage of any kind.
All files are local disk, co-located with the Node.js process.
```

---

## SECTION 10 — MIGRATION RISK REPORT

The core risk is: **all IDs are TEXT columns, application-generated, with no UUIDs and no numeric sequences.** Adding `uuid` and `org_id` columns touches every table.

```
Table: patients
Risk Level: HIGH
Reason:
  - id is TEXT PK, generated by the frontend as "PAT-{timestamp}" or slugified patient name (e.g. "john-doe").
    Evidence: server/index.ts POST /api/import: patientId = patientName.replace(/\s+/g, '-').toLowerCase()
    Evidence: NewPatientDialog.tsx: id = formData.id || `PAT-${Date.now().toString().slice(-6)}`
  - This id is sent from the frontend in the request body — the server does not generate it.
  - Adding uuid: existing rows have no uuid, any NOT NULL constraint would fail until backfilled.
  - Adding org_id: no org concept exists anywhere in the codebase. All APIs are org-unaware.
  - The id is also used as a directory path component during folder import:
    patientId = patientName.replace(/\s+/g, '-').toLowerCase() and studyId = `${patientId}-study-...`
    This creates chained ID dependencies.
  - GET /api/patients returns patient.id to the frontend which stores it in Zustand and uses it for
    all subsequent API calls (saveVisit, saveStudy, getContexts, etc.)

Table: visits
Risk Level: HIGH
Reason:
  - id is TEXT PK, generated by frontend as Date.now().toString()
    Evidence: NewVisitDialog.tsx: id: Date.now().toString()
  - visit_id is a FK in: studies, reports, contexts
  - Changing visit id format or adding uuid breaks the FK chain.
  - reports.visit_id is NOT NULL — reports cannot be reassigned without a visit.
  - The GET /api/patients response includes visit.id which is used by ReportsListDialog (getReports(visit.id))
    and the context creation flow.

Table: studies
Risk Level: HIGH
Reason:
  - id is TEXT PK with multiple generation patterns:
    a. Frontend upload: "std-{Date.now()}"  (ImagingImportDialog, ScanUploadDialog)
    b. Folder import: "{patientId}-study-{visitDate}" — string derived from patient id and date
    c. PACS import: "pacs-{last8ofUID}-{timestamp}"  (pacsService.ts)
  - study_id is FK in: scans, context_studies
  - context_studies is a M:N join — both FKs must be valid simultaneously
  - The studyId pattern (b) uses the patient's text id as a prefix — chained ID dependency.

Table: scans
Risk Level: MEDIUM
Reason:
  - id is TEXT PK, generated as "scan-{Date.now()}-{random}" or "scan-pacs-{sopUID}-{timestamp}"
  - No other table references scans.id as an FK
  - Adding uuid/org_id is lower risk than patients/visits/studies
  - The imageUrl returned by POST /api/scans is constructed from file_path, not the scan id.
    Changing scan id would not break image display.

Table: contexts
Risk Level: HIGH
Reason:
  - id is TEXT PK, generated as "ctx-{Date.now()}" (NewContextDialog, PatientCasesPage)
  - context_id is FK in: context_studies, measurements, implants
  - The POST /api/contexts transaction does: DELETE WHERE context_id = id, then re-inserts.
    Any change to id format would orphan existing context_studies/measurements/implants.
  - GET /api/contexts/:patientId returns context.id which is stored as activeContextId in Zustand.
    The autosave mechanism (updateContextState) uses activeContextId to call saveContext —
    if the id format changes mid-session, the save will fail or create duplicate rows.
  - WebSocket room name includes contextId indirectly via patientId (liveShareSlice.ts uses
    activeContextId to sync pedicleSimulations).

Table: context_studies
Risk Level: MEDIUM
Reason:
  - Composite PK on (context_id, study_id) — no standalone id column to add uuid to
  - Adding org_id is the only applicable migration here
  - Both FK columns must remain compatible with contexts and studies ids

Table: measurements
Risk Level: MEDIUM
Reason:
  - id is TEXT PK, generated as "{contextId}-m-{Date.now()}-{Math.random()}"
  - The id embeds the contextId as a prefix — if contextId changes format, this would be inconsistent
    (not a hard dependency, just a naming convention)
  - No other table references measurements.id
  - POST /api/contexts always DELETES all measurements for a context then re-inserts —
    existing measurement ids are ephemeral per save cycle

Table: implants
Risk Level: MEDIUM
Reason:
  - id is TEXT PK, generated as "{contextId}-i-{Date.now()}-{Math.random()}"
  - Same analysis as measurements — same delete+reinsert pattern
  - No other table references implants.id

Table: reports
Risk Level: HIGH
Reason:
  - id is TEXT PK, generated as "rep-{Date.now()}" by frontend
  - visit_id is NOT NULL FK → visits.id — this is the hardest FK constraint in the system
  - Reports cannot be migrated to a study-centric architecture without either:
    a. Making visit_id nullable, OR
    b. Adding a study_id FK alongside visit_id
  - GET /api/reports/:visitId is called directly with a visit id — changing this contract
    breaks ReportsListDialog.tsx
```

---

## SECTION 11 — LEGACY COMPATIBILITY TABLES

```
Legacy Compatibility Tables (must remain structurally intact):
  - patients
  - visits
  - studies
  - scans
  - contexts
  - context_studies
  - measurements
  - implants
  - reports
```

All 9 tables are currently active and in production use. None can be dropped or structurally broken.

```
patients — Why it cannot be changed:
  The entire application bootstraps from GET /api/patients. Every other entity hangs off patient.id.
  The frontend generates patient IDs and sends them to the server. Changing the id type or adding
  NOT NULL columns without defaults will break all existing insert paths.

visits — Why it cannot be changed:
  The PatientCasesPage is visit-centric. VisitCard is the primary UI component. Visit deletion
  is fully wired in the UI. reports.visit_id is NOT NULL — reports are permanently bound to visits.
  Renaming or restructuring visits would break the entire patient cases view.

studies — Why it cannot be changed:
  Studies are linked by 3 different ID generation patterns (frontend, folder import, PACS).
  context_studies depends on studies.id. Changing studies would cascade into context_studies
  and break the context→study linking transaction.

scans — Why it cannot be changed:
  scans.file_path stores the only reference to physical image files. imageUrl served to the
  frontend is derived from this column. Breaking scans breaks image display everywhere.

contexts — Why it cannot be changed:
  Contexts are the autosave target. updateContextState fires on every canvas interaction.
  The delete+reinsert pattern for measurements and implants relies on context.id stability
  within a session. Any change to the context id or its FK targets during an active session
  would silently lose clinical data.

context_studies — Why it cannot be changed:
  The composite PK and both FKs are the mechanism by which a planning workspace references
  its imaging. The POST /api/contexts handler deletes and re-creates these rows on every save.

measurements — Why it cannot be changed:
  Measurements hold all clinical quantitative data (Cobb angles, SVA, pelvic params, etc.).
  They are delete+reinserted on every context save — the schema must remain stable for this
  pattern to work without data loss.

implants — Why it cannot be changed:
  Implants hold surgical planning data (screw positions, angles, properties). Same
  delete+reinsert pattern as measurements. 3D implants (ThreeDImplant) are also serialized
  into contextState and saved through this table indirectly via the properties JSON blob.

reports — Why it cannot be changed:
  visit_id is NOT NULL. ReportsListDialog fetches by visitId. The file_path stores the only
  disk reference to PDF reports. Breaking reports means users cannot access their clinical
  PDF outputs.
```

---

## SECTION 12 — MIGRATION BOUNDARY DOCUMENT

### SAFE TO ADD
New tables that can be created immediately without touching anything existing:

```
- organizations          (new) — org_id, name, slug, created_at
- users                  (new) — id, org_id, email, role, created_at
- study_assets           (new) — id, study_id, asset_type, file_path, created_at
- study_annotations      (new) — id, study_id (not context_id), annotation data
- study_calibrations     (new) — id, study_id, pixels_per_mm, created_at
- study_notes            (new) — id, study_id, body, author, created_at
- plans                  (new) — id, study_id, name, status, created_at
- simulations            (new) — id, plan_id, vertebra_label, landmarks JSON, created_at
- collections            (new) — id, org_id, name, description, created_at
```

None of these exist. None break the existing schema.

### SAFE TO MODIFY
Tables that can safely receive new nullable columns:

```
patients:
  - ADD COLUMN uuid UUID DEFAULT gen_random_uuid()   ← nullable or with default, safe
  - ADD COLUMN org_id TEXT                           ← nullable, safe to add
  Risk: LOW — adding nullable columns with defaults does not break existing inserts or reads.

studies:
  - ADD COLUMN uuid UUID DEFAULT gen_random_uuid()
  - ADD COLUMN org_id TEXT
  Risk: LOW — same reasoning. No existing query selects by uuid.

scans:
  - ADD COLUMN uuid UUID DEFAULT gen_random_uuid()
  - ADD COLUMN org_id TEXT
  Risk: LOW — no FKs point at scans from other tables.

measurements:
  - ADD COLUMN org_id TEXT
  Risk: LOW — ephemeral delete+reinsert pattern; new nullable column survives the cycle.

implants:
  - ADD COLUMN org_id TEXT
  Risk: LOW — same as measurements.
```

### DO NOT TOUCH YET

```
visits:
  Reason: visit_id is NOT NULL FK in reports. Removing or renaming visit_id breaks
  reports entirely. The PatientCasesPage UI is built around visits.
  Safe pre-condition before touching: migrate reports to also accept study_id.

reports:
  Reason: visit_id NOT NULL with no alternative FK. Cannot move reports to
  study-centric until visit_id is made nullable and study_id FK is added.

contexts:
  Reason: The autosave mechanism (updateContextState → saveContext) fires continuously.
  Any schema change to contexts during Task 2 risks corrupting live sessions.
  The delete+reinsert transaction for context_studies, measurements, implants all
  depend on contexts.id being stable and unchanged.

context_studies:
  Reason: Composite PK cannot receive a uuid column directly. Adding org_id is safe
  but the table's purpose will change in the new architecture. Touch only after
  contexts are migrated.
```

### REQUIRES ADDITIONAL INVESTIGATION

```
1. UNCERTAIN — 3D implant persistence:
   ThreeDImplant objects (from dicomSlice.ts) are passed in contextState.threeDImplants[]
   to POST /api/contexts. The server receives them in the `state` body. However, the
   server's insert code only handles state.measurements and state.implants explicitly.
   threeDImplants and pedicleSimulations are NOT explicitly persisted to any column or table.
   They may be lost silently or stored in the tool_state JSON blob.
   Evidence: server/index.ts POST /api/contexts handler — no explicit handling of
   state.threeDImplants or state.pedicleSimulations beyond what goes into measurements/implants.
   This needs verification before migration.

2. UNCERTAIN — contexts.tool_state JSON blob contents:
   The tool_state column is a TEXT JSON blob. It is saved as-is from the frontend.
   The schema does not define what lives inside it. It may contain additional clinical data
   (calibration settings, active tool state, etc.) that is not in any typed column.
   Any migration that replaces contexts must preserve this blob.

3. UNCERTAIN — WebSocket room persistence:
   y-websocket.ts stores in-memory WSSharedDoc objects. These are NOT persisted to the database.
   If the server restarts, collaborative session state is lost. This is a risk for any
   migration that requires a server restart.

4. UNCERTAIN — report generation pathway:
   src/renderer/features/navigation/ReportDialog.tsx references the POST /api/reports endpoint
   but was not fully read in the audit. The exact inputs and file generation logic are unverified.
   The report PDF itself may be generated client-side (jsPDF is in package.json) and then
   uploaded. This needs confirmation before adding study_id to reports.
```

---

## SECTION 13 — TASK 2 READINESS CHECK

```
Ready For Task 2: YES — with conditions
```

**Conditions before proceeding:**
1. Resolve the UNCERTAIN item about `threeDImplants` persistence — confirm whether they go to `tool_state` or are silently dropped. This affects whether the implants table needs a new column or a parallel table.
2. The migration must use `ADD COLUMN ... DEFAULT ...` with nullable columns only. No `NOT NULL` without a default on any existing table.

**Exact list of tables that should receive `uuid` + `org_id` in Task 2:**

```
Priority 1 — Safe, no downstream risk:
  patients     → ADD COLUMN uuid UUID DEFAULT gen_random_uuid(), ADD COLUMN org_id TEXT
  studies      → ADD COLUMN uuid UUID DEFAULT gen_random_uuid(), ADD COLUMN org_id TEXT
  scans        → ADD COLUMN uuid UUID DEFAULT gen_random_uuid(), ADD COLUMN org_id TEXT

Priority 2 — Safe, but monitor the delete+reinsert autosave cycle:
  measurements → ADD COLUMN org_id TEXT
  implants     → ADD COLUMN org_id TEXT

Do NOT add uuid/org_id yet:
  visits          — blocked by reports.visit_id NOT NULL dependency
  reports         — blocked by visit_id NOT NULL, needs study_id added first
  contexts        — blocked by live autosave pattern risk
  context_studies — composite PK, no standalone id to add uuid to; add org_id only after contexts
```

**SQL for Task 2 (safe additions):**
```sql
ALTER TABLE patients     ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE patients     ADD COLUMN IF NOT EXISTS org_id TEXT;

ALTER TABLE studies      ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE studies      ADD COLUMN IF NOT EXISTS org_id TEXT;

ALTER TABLE scans        ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid();
ALTER TABLE scans        ADD COLUMN IF NOT EXISTS org_id TEXT;

ALTER TABLE measurements ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE implants     ADD COLUMN IF NOT EXISTS org_id TEXT;
```

All five statements are purely additive, nullable, and non-breaking. No existing query will fail. No existing insert will fail. No existing FK will be violated.