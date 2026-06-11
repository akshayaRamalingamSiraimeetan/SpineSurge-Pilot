# SpineSurge Pro — Backend & Database Reference

## Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | v24 |
| Language | TypeScript | ~5.9 |
| Execution | tsx | ^4.21 |
| HTTP Framework | Express | ^5.2 |
| WebSocket | ws + y-websocket | ^8.21 / ^3.0 |
| File Uploads | Multer | ^2.1 |
| ORM | Drizzle ORM | ^0.45 |
| ORM CLI | Drizzle Kit | ^0.31 |
| Database Driver | pg (node-postgres) | ^8.21 |
| Database | PostgreSQL | 16 (Docker) |
| Environment | dotenv | ^17 |
| HTTP Client | axios | ^1.13 |

The server is started from the project root with:

```
npm run start:server   →   tsx server/index.ts
```

---

## Connection

```
DATABASE_URL=postgresql://postgres:nyx@localhost:5432/spinesurge
```

Configured via `.env` at the project root. `dotenv/config` is imported as the first line of `server/db.ts` and `server/drizzle.config.ts`, ensuring the variable is loaded before any pool is created.

```typescript
// server/db.ts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:nyx@localhost:5432/spinesurge',
});

export const db = drizzle(pool, { schema });
export default db;
```

---

## Schema Overview

All tables live in the `public` schema of the `spinesurge` database. IDs are plain `TEXT` columns — the application generates them as prefixed timestamps (e.g. `std-1781159126436`, `scan-1781159126437`) or human-readable strings. No UUID or serial sequences are used.

| Table | Purpose |
|---|---|
| `patients` | Core patient demographic record |
| `visits` | Clinical encounter per patient |
| `studies` | Imaging study (modality grouping) per patient/visit |
| `scans` | Individual image file belonging to a study |
| `contexts` | Planning/viewing workspace per patient |
| `context_studies` | Many-to-many join: contexts ↔ studies |
| `measurements` | Tool measurements recorded inside a context |
| `implants` | 2-D implant placements inside a context |
| `reports` | PDF reports attached to a visit |

---

## Table Definitions

### `patients`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `name` | TEXT | NOT NULL |
| `age` | INTEGER | nullable |
| `gender` | TEXT | nullable (`M` \| `F` \| `O`) |
| `dob` | TEXT | nullable |
| `contact` | TEXT | nullable |
| `last_visit` | TEXT | nullable |
| `has_alert` | BOOLEAN | DEFAULT false |
| `is_archived` | BOOLEAN | DEFAULT false |

---

### `visits`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `patient_id` | TEXT | NOT NULL, FK → `patients.id` CASCADE DELETE |
| `visit_number` | TEXT | nullable |
| `date` | TEXT | nullable |
| `time` | TEXT | nullable |
| `diagnosis` | TEXT | nullable |
| `comments` | TEXT | nullable |
| `height` | TEXT | nullable |
| `weight` | TEXT | nullable |
| `consultants` | TEXT | nullable |
| `surgery_date` | TEXT | nullable |

---

### `studies`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `patient_id` | TEXT | NOT NULL, FK → `patients.id` CASCADE DELETE |
| `visit_id` | TEXT | nullable, FK → `visits.id` CASCADE DELETE |
| `modality` | TEXT | DEFAULT `'X-Ray'` |
| `source` | TEXT | DEFAULT `'Import'` |
| `acquisition_date` | TEXT | nullable |

A study can exist without a visit (orphaned study). When a patient is deleted, all their studies cascade-delete. When a visit is deleted, its studies cascade-delete.

---

### `scans`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `study_id` | TEXT | NOT NULL, FK → `studies.id` CASCADE DELETE |
| `file_path` | TEXT | NOT NULL — relative filename inside `server/uploads/` |
| `type` | TEXT | DEFAULT `'Imported'` (`Pre-op` \| `Post-op` \| `Imported`) |
| `date` | TEXT | nullable |

Physical files are stored under `server/uploads/`. `file_path` stores only the filename (no directory prefix). The backend serves them via:

```
GET /uploads/:filename   →   Express static middleware
GET /api/local-file?path=...   →   Secured proxy (uploads-dir only)
```

---

### `contexts`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `patient_id` | TEXT | NOT NULL, FK → `patients.id` CASCADE DELETE |
| `visit_id` | TEXT | nullable, FK → `visits.id` SET NULL on delete |
| `mode` | TEXT | NOT NULL (`view` \| `plan` \| `compare`) |
| `name` | TEXT | nullable |
| `last_modified` | TEXT | nullable (ISO datetime string) |
| `annotations` | TEXT | JSON array stored as text, DEFAULT `'[]'` |
| `tool_state` | TEXT | JSON object stored as text, DEFAULT `'{}'` |

A context is a named workspace for viewing or surgical planning. It references one patient, optionally one visit, and any number of studies via `context_studies`.

---

### `context_studies`

| Column | Type | Constraints |
|---|---|---|
| `context_id` | TEXT | NOT NULL, FK → `contexts.id` CASCADE DELETE |
| `study_id` | TEXT | NOT NULL, FK → `studies.id` CASCADE DELETE |

Composite PRIMARY KEY on `(context_id, study_id)`. This is the join table that allows a single context to display scans from multiple studies simultaneously (e.g. pre-op + post-op comparison).

---

### `measurements`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `context_id` | TEXT | NOT NULL, FK → `contexts.id` CASCADE DELETE |
| `tool_key` | TEXT | NOT NULL — identifies the measurement tool (e.g. `cobb-angle`) |
| `fragment_id` | TEXT | nullable — sub-region identifier |
| `points` | TEXT | JSON array of `{x, y}` points |
| `result` | TEXT | JSON — computed numeric result |
| `metadata` | TEXT | JSON — display metadata (label, unit, etc.) |
| `timestamp` | INTEGER | Unix ms timestamp |

---

### `implants`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `context_id` | TEXT | NOT NULL, FK → `contexts.id` CASCADE DELETE |
| `type` | TEXT | NOT NULL (`screw` \| `rod` \| `cage` \| `plate` \| `spacer`) |
| `fragment_id` | TEXT | nullable |
| `position` | TEXT | JSON `{x, y}` point |
| `angle` | REAL | rotation in degrees |
| `properties` | TEXT | JSON — dimensions, size, model metadata |
| `timestamp` | INTEGER | Unix ms timestamp |

---

### `reports`

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `visit_id` | TEXT | NOT NULL, FK → `visits.id` CASCADE DELETE |
| `file_path` | TEXT | NOT NULL — relative filename inside `server/uploads/` |
| `title` | TEXT | nullable |
| `created_at` | TEXT | nullable (ISO date string `YYYY-MM-DD`) |

---

## Entity Relationship Diagram

```
patients
  │
  ├─── visits (patient_id → patients.id)
  │       │
  │       ├─── studies (visit_id → visits.id)   ← optional link
  │       │       │
  │       │       └─── scans (study_id → studies.id)
  │       │
  │       └─── reports (visit_id → visits.id)
  │
  ├─── studies (patient_id → patients.id)        ← required link
  │
  └─── contexts (patient_id → patients.id)
           │
           ├─── context_studies (context_id ↔ study_id)   ← M:N join
           │
           ├─── measurements (context_id → contexts.id)
           │
           └─── implants (context_id → contexts.id)
```

**Notes on the dual study relationship:**
- Every study has a mandatory `patient_id` FK.
- `visit_id` on studies is optional — a study can be "orphaned" (not linked to any visit). The frontend assigns orphaned studies to the most recent visit when rendering.
- A context does not own studies directly; it links to them through `context_studies`, allowing one workspace to hold pre-op and post-op scans simultaneously.

---

## Drizzle ORM Relations

Defined in `server/schema.ts` using Drizzle's `relations()` API. These are used by `db.query.*` (Drizzle's relational query API) for type-safe eager loading.

| Relation | Type | Fields |
|---|---|---|
| `patients → visits` | one-to-many | `visits.patient_id` |
| `patients → studies` | one-to-many | `studies.patient_id` |
| `patients → contexts` | one-to-many | `contexts.patient_id` |
| `visits → patient` | many-to-one | `visits.patient_id` |
| `visits → studies` | one-to-many | `studies.visit_id` |
| `visits → reports` | one-to-many | `reports.visit_id` |
| `studies → patient` | many-to-one | `studies.patient_id` |
| `studies → visit` | many-to-one | `studies.visit_id` |
| `studies → scans` | one-to-many | `scans.study_id` |
| `scans → study` | many-to-one | `scans.study_id` |
| `contexts → patient` | many-to-one | `contexts.patient_id` |
| `contexts → visit` | many-to-one | `contexts.visit_id` |
| `contexts → studies` | one-to-many (via join) | `context_studies.context_id` |
| `contexts → measurements` | one-to-many | `measurements.context_id` |
| `contexts → implants` | one-to-many | `implants.context_id` |
| `context_studies → context` | many-to-one | `context_studies.context_id` |
| `context_studies → study` | many-to-one | `context_studies.study_id` |
| `measurements → context` | many-to-one | `measurements.context_id` |
| `implants → context` | many-to-one | `implants.context_id` |
| `reports → visit` | many-to-one | `reports.visit_id` |

---

## Cascade Delete Behaviour

| Parent deleted | Child tables affected | Behaviour |
|---|---|---|
| `patients` | `visits`, `studies`, `contexts` | CASCADE DELETE |
| `visits` | `studies`, `reports` | CASCADE DELETE |
| `visits` (from `contexts`) | `contexts.visit_id` | SET NULL |
| `studies` | `scans`, `context_studies` | CASCADE DELETE |
| `contexts` | `context_studies`, `measurements`, `implants` | CASCADE DELETE |

---

## Migrations

Migration SQL is generated by Drizzle Kit and stored in `server/drizzle/`.

```bash
# Generate a new migration from schema changes
npx drizzle-kit generate

# Push schema directly to the database (dev — no migration file)
npx drizzle-kit push

# Apply migrations
npx drizzle-kit migrate
```

Configuration (`server/drizzle.config.ts`):

```typescript
{
    schema: './server/schema.ts',
    out:    './server/drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL
    }
}
```

Current baseline migration: `server/drizzle/0000_mixed_moonstone.sql`

---

## File Storage

Uploaded scan images and PDF reports are stored on disk, not in the database.

| Path | Contents |
|---|---|
| `server/uploads/` | All uploaded scan images and report PDFs |

The `file_path` column in both `scans` and `reports` stores only the **filename** (e.g. `1781159126436-937261234.jpg`), never an absolute path. The full URL is reconstructed at query time:

```
http://localhost:3001/uploads/<filename>
```

The uploads directory is served as static files by Express and is also accessible through the `/api/local-file` proxy endpoint which enforces a directory boundary check.

---

## API Endpoints (Database-touching)

| Method | Route | Table(s) |
|---|---|---|
| GET | `/api/patients` | patients, visits, studies, scans |
| POST | `/api/patients` | patients |
| POST | `/api/patients/:id/archive` | patients |
| POST | `/api/visits` | visits |
| DELETE | `/api/visits/:id` | visits |
| POST | `/api/studies` | studies |
| POST | `/api/scans` | scans |
| GET | `/api/contexts/:patientId` | contexts, context_studies, measurements, implants |
| POST | `/api/contexts` | contexts, context_studies, measurements, implants |
| POST | `/api/reports` | reports |
| GET | `/api/reports/:visitId` | reports |
| POST | `/api/import` | patients, studies, scans |
| POST | `/api/pacs/import` | studies, scans |
