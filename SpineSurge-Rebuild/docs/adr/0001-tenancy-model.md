# ADR 0001 — Tenancy model

- **Status:** Accepted (Step 0)
- **Date:** 2026-06-01

## Context
The rebuild is a multi-tenant SaaS handling PHI. We must isolate each organization's data with
strong guarantees while keeping operations simple.

## Decision
**Shared database, shared schema, `org_id` on every tenant-scoped row, enforced by Postgres
Row-Level Security (RLS).**

- Each request resolves `org_id` from the JWT and runs `SET app.current_org = :org_id` on its DB
  session (via the `get_org_db` FastAPI dependency).
- Every scoped table has an RLS policy:
  `USING (org_id = current_setting('app.current_org')::uuid)`.
- DICOM is isolated in Orthanc via tenant labels (see ADR 0003); object storage uses per-org key
  prefixes (`org/{org_id}/...`).

## Consequences
- **Pro:** isolation enforced at the DB even if app code has a bug; one DB to operate/migrate;
  cheapest to run early.
- **Con:** a noisy tenant can affect shared resources; very large tenants may later need
  schema-per-tenant or DB-per-tenant. Revisit if/when a single tenant's data or load dominates.
- All queries MUST go through the org-scoped session; raw/admin connections bypass RLS and are
  restricted to migrations and break-glass ops.

## Alternatives considered
- **Schema-per-tenant:** stronger isolation, heavier migrations and connection management.
- **DB-per-tenant:** strongest isolation, highest ops cost; reserved for enterprise tenants later.
