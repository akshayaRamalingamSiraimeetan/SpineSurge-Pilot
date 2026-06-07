# ADR 0002 — Authentication & authorization

- **Status:** Accepted, with one open sub-decision (provider)
- **Date:** 2026-06-01

## Context
The old app had mock auth and no server-side enforcement. For a HIPAA SaaS we need real identity,
org/tenant awareness, RBAC, session management, and audit — none of which we should hand-roll.

## Decision
- **Use an OIDC provider.** JWT access tokens carry `sub` (user), `org_id` (active tenant), and
  `role`. FastAPI verifies the token signature (JWKS) on every request.
- **Authorization** is enforced server-side by dependencies: `get_current_user`, `require_role(...)`,
  and `get_org_db` (sets RLS). The UI reflects roles but never enforces them.
- **Roles:** `owner | admin | surgeon | viewer`.
- **Audit:** every PHI access/mutation writes an `audit_log` row (no PHI in the log body).
- **Org switching:** a user with multiple memberships obtains a token scoped to the chosen `org_id`.

## Open sub-decision (provider)
- **Keycloak (self-hosted):** no per-seat cost, BAA-friendly self-hosting, full control; more ops.
- **Clerk (managed):** fastest to integrate, great org/tenant primitives; verify BAA/HIPAA terms.
- **Lean:** Keycloak for production HIPAA posture; Clerk acceptable for early speed. Pick before Step 3.

## Consequences
- No credentials or password logic live in our codebase.
- WebSocket (collaboration) upgrades reuse the same JWT verification before joining a room.
- CORS is locked to known origins (no `*`).
