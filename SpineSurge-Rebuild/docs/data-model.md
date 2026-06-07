# Data Model (locked contract — Step 0)

> Authoritative relational model for the rebuild. Postgres 16. Every PHI-bearing table carries
> `org_id` and is protected by Row-Level Security (RLS). Shared TS domain types mirror these tables
> and are derived from the old project's `lib/store/types.ts` (see §6 of `../MASTER.md`).

## Conventions
- **PK:** `id uuid default gen_random_uuid()` (server-generated; no client `Date.now()+random`).
- **Timestamps:** `created_at timestamptz default now()`, `updated_at timestamptz`.
- **Tenancy:** `org_id uuid not null references orgs(id)` on every tenant-scoped table.
- **RLS:** policy `USING (org_id = current_setting('app.current_org')::uuid)` on every scoped table.
- **JSON:** geometric/clinical blobs stored as `jsonb` (indexable, queryable).
- **Soft delete:** `is_archived boolean default false` where the old model had it.

---

## Tenancy & identity

### orgs (tenant)
| col | type | notes |
|---|---|---|
| id | uuid PK | tenant id |
| name | text not null | |
| slug | text unique | URL/identifier |
| created_at | timestamptz | |

### users
| col | type | notes |
|---|---|---|
| id | uuid PK | maps to OIDC `sub` |
| email | text unique not null | |
| display_name | text | |
| title | text | e.g. "Chief Surgical Consultant" |
| created_at | timestamptz | |

### memberships
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid FK→orgs | |
| user_id | uuid FK→users | |
| role | enum `owner\|admin\|surgeon\|viewer` | RBAC |
| unique(org_id, user_id) | | one role per user per org |

### audit_log (append-only)
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid | |
| user_id | uuid | actor |
| action | text | e.g. `patient.read`, `context.update` |
| entity_type | text | |
| entity_id | uuid | |
| ip | inet | |
| metadata | jsonb | redacted; **no PHI** |
| created_at | timestamptz | |

---

## Clinical domain

### patients
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid FK→orgs | RLS |
| name | text not null | PHI |
| age | int | |
| gender | enum `M\|F\|O` | normalized (old had gender+sex) |
| dob | date | |
| contact | text | |
| last_visit | date | |
| has_alert | bool default false | |
| is_archived | bool default false | |

### visits
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid | RLS |
| patient_id | uuid FK→patients ON DELETE CASCADE | |
| visit_number | text | |
| date / time | date / time | |
| diagnosis, comments | text | |
| height, weight | text | |
| consultants | text | |
| surgery_date | date | |

### studies
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid | RLS |
| patient_id | uuid FK→patients | |
| visit_id | uuid FK→visits nullable | explicit linkage (no "orphan→latest" heuristic) |
| modality | text default 'X-Ray' | |
| source | enum `import\|pacs\|upload` | |
| acquisition_date | date | |
| orthanc_study_uid | text | **DICOMweb StudyInstanceUID** (replaces local paths) |

### scans
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid | RLS |
| study_id | uuid FK→studies | |
| type | enum `Pre-op\|Post-op\|Imported` | |
| date | date | |
| storage_key | text | S3/MinIO key for non-DICOM images |
| orthanc_series_uid | text | for DICOM |

### reports
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid | RLS |
| visit_id | uuid FK→visits | |
| title | text | |
| storage_key | text | S3/MinIO (PDF) |
| created_at | timestamptz | |

---

## Planning / workspace state

### contexts
A saved planning session (`view | plan | compare`).
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid | RLS |
| patient_id | uuid FK→patients | |
| visit_id | uuid FK→visits nullable | |
| mode | enum `view\|plan\|compare` | |
| name | text | |
| annotations | jsonb default '[]' | |
| tool_state | jsonb default '{}' | |
| last_modified | timestamptz | |

### context_studies (M:N)
| col | type | notes |
|---|---|---|
| context_id | uuid FK→contexts | |
| study_id | uuid FK→studies | |
| PK(context_id, study_id) | | |

### measurements
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid | RLS |
| context_id | uuid FK→contexts | |
| tool_key | text not null | e.g. `cobb`, `pi-ll`, `ost-pso` |
| fragment_id | text nullable | canvas fragment association |
| points | jsonb | array of {x,y} |
| result | jsonb | **numeric value + unit** (not display string) |
| metadata | jsonb | the UI `measurement` blob |
| timestamp | bigint | |

### implants (2D)
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid | RLS |
| context_id | uuid FK→contexts | |
| type | enum `screw\|rod\|cage\|plate\|spacer` | |
| fragment_id | text nullable | |
| position | jsonb | {x,y} or null |
| angle | real | |
| properties | jsonb | |
| timestamp | bigint | |

### three_d_implants
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid | RLS |
| context_id | uuid FK→contexts | |
| type | enum `screw\|rod` | |
| position | jsonb | [x,y,z] |
| direction | jsonb | [x,y,z] |
| properties | jsonb | diameter/length/color/angles/depth |
| level | text | e.g. 'L3' |
| side | enum `L\|R` | |
| simulation_id | uuid FK→pedicle_simulations nullable | |

### pedicle_simulations
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid | RLS |
| context_id | uuid FK→contexts | |
| label | text | e.g. 'L4' |
| landmarks | jsonb | {VAP, PIP_L, PIP_R, fiducials[]} |
| suggested_screw_l / _r | jsonb | {diameter, length} |
| grading | jsonb | {left%, right%} bone contact |

---

## Relationships (summary)

```
orgs 1─┬─* memberships *─1 users
       ├─* patients 1─┬─* visits 1─* reports
       │              └─* studies *─1 visits (nullable)
       │                   └─* scans
       └─* contexts ─*─* studies (context_studies)
              ├─* measurements
              ├─* implants
              ├─* three_d_implants
              └─* pedicle_simulations
```

## Save semantics (fixes old write-amplification)
- Context save is **upsert + diff**, never delete-all-reinsert.
- Client **debounces** edits and uses optimistic TanStack mutations.
- List endpoints are **paginated**; mutations never trigger a full-graph reload.
