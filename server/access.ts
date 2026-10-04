import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import * as schema from './schema';

/**
 * Who may do what (UI12-10):
 *   owner — created the study/patient: full control.
 *   edit  — the owner shared the study with edit rights: plan together.
 *   view  — shared view-only, OR an admin/creator of the study's organization
 *           looking at a member's study.
 * Everything else is invisible.
 */
export type Access = 'owner' | 'edit' | 'view';
const RANK: Record<Access, number> = { view: 1, edit: 2, owner: 3 };
export const best = (a: Access | null, b: Access | null): Access | null =>
    !a ? b : !b ? a : RANK[a] >= RANK[b] ? a : b;
export const canWrite = (a: Access | null) => a === 'owner' || a === 'edit';

/** Platform owner (PLATFORM_ADMIN_EMAILS, comma separated): the live monitor (/platform). */
export const isPlatformAdmin = (email?: string | null) =>
    !!email && (process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

/**
 * Platform admins may look at every study, view-only (MON-01: the pilot monitor
 * opens any user's images, plans and reports). Never write access.
 */
const adminCache = new Map<string, { yes: boolean; at: number }>();
export async function isPlatformAdminId(userId: string): Promise<boolean> {
    if (!process.env.PLATFORM_ADMIN_EMAILS) return false;
    const hit = adminCache.get(userId);
    if (hit && Date.now() - hit.at < 60_000) return hit.yes;
    const [u] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    const yes = isPlatformAdmin(u?.email);
    adminCache.set(userId, { yes, at: Date.now() });
    return yes;
}

/** Lower-cased PLATFORM_ADMIN_EMAILS — their own activity is never monitored (MON-04). */
export const platformAdminEmails = () =>
    (process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

/**
 * Is this account still allowed in? A platform admin can block a user (MON-05);
 * checked by /uploads and live-share sockets, which only verify the token.
 */
const activeCache = new Map<string, { yes: boolean; at: number }>();
export async function isActiveUser(userId: string): Promise<boolean> {
    const hit = activeCache.get(userId);
    if (hit && Date.now() - hit.at < 30_000) return hit.yes;
    const [u] = await db.select({ a: schema.users.isActive }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    const yes = !!u?.a;
    activeCache.set(userId, { yes, at: Date.now() });
    return yes;
}
export const forgetUser = (userId: string) => { activeCache.delete(userId); adminCache.delete(userId); };

type StudyRow = typeof schema.studies.$inferSelect;

/** Orgs where the user is an active admin or the creator. */
export async function adminOrgIds(userId: string): Promise<Set<string>> {
    const [memberships, created] = await Promise.all([
        db.select({ orgId: schema.organizationMemberships.orgId }).from(schema.organizationMemberships)
            .where(and(
                eq(schema.organizationMemberships.userId, userId),
                eq(schema.organizationMemberships.status, 'active'),
                eq(schema.organizationMemberships.role, 'admin'),
            )),
        db.select({ id: schema.orgs.id }).from(schema.orgs).where(eq(schema.orgs.createdBy, userId)),
    ]);
    return new Set([...memberships.map((m) => m.orgId), ...created.map((o) => o.id)]);
}

/** Access to each study, for one user. */
export async function studiesAccess(userId: string, studies: StudyRow[]): Promise<Map<string, Access>> {
    const out = new Map<string, Access>();
    if (!studies.length) return out;
    const ids = studies.map((s) => s.id);
    const patientIds = [...new Set(studies.map((s) => s.patientId))];
    const [shares, patients, adminOrgs, platform] = await Promise.all([
        db.select().from(schema.studyShares)
            .where(and(eq(schema.studyShares.sharedWith, userId), inArray(schema.studyShares.studyId, ids))),
        db.select({ id: schema.patients.id, owner: schema.patients.ownerUserId }).from(schema.patients)
            .where(inArray(schema.patients.id, patientIds)),
        adminOrgIds(userId),
        isPlatformAdminId(userId),
    ]);
    const patientOwner = new Map(patients.map((p) => [p.id, p.owner]));
    const shareOf = new Map(shares.map((s) => [s.studyId, s.permission === 'edit' ? 'edit' as const : 'view' as const]));
    for (const s of studies) {
        let a: Access | null = null;
        if (s.ownerUserId === userId) a = 'owner';
        // legacy study without an owner: it belongs to the patient's owner
        else if (!s.ownerUserId && patientOwner.get(s.patientId) === userId) a = 'owner';
        a = best(a, shareOf.get(s.id) ?? null);
        if (s.organizationId && adminOrgs.has(s.organizationId)) a = best(a, 'view');
        if (platform) a = best(a, 'view');
        if (a) out.set(s.id, a);
    }
    return out;
}

export async function studyAccess(userId: string, studyId: string): Promise<Access | null> {
    const [study] = await db.select().from(schema.studies).where(eq(schema.studies.id, studyId)).limit(1);
    if (!study) return null;
    return (await studiesAccess(userId, [study])).get(studyId) ?? null;
}

/** Patient-level access: owner of the patient, else the best access to any of its studies. */
export async function patientAccess(userId: string, patientId: string): Promise<Access | null> {
    const [patient] = await db.select().from(schema.patients).where(eq(schema.patients.id, patientId)).limit(1);
    if (!patient) return null;
    if (patient.ownerUserId === userId) return 'owner';
    const studies = await db.select().from(schema.studies).where(eq(schema.studies.patientId, patientId));
    let a: Access | null = null;
    for (const v of (await studiesAccess(userId, studies)).values()) a = best(a, v);
    if (!a && await isPlatformAdminId(userId)) a = 'view';
    return a;
}

/**
 * Access to a session: the best access to the studies it belongs to; a session
 * without studies belongs to the patient's owner.
 */
export async function contextsAccess(userId: string, contextIds: string[]): Promise<Map<string, Access>> {
    const out = new Map<string, Access>();
    if (!contextIds.length) return out;
    const [ctxs, links] = await Promise.all([
        db.select({ id: schema.contexts.id, patientId: schema.contexts.patientId }).from(schema.contexts)
            .where(inArray(schema.contexts.id, contextIds)),
        db.select().from(schema.contextStudies).where(inArray(schema.contextStudies.contextId, contextIds)),
    ]);
    const studyIds = [...new Set(links.map((l) => l.studyId))];
    const studies = studyIds.length ? await db.select().from(schema.studies).where(inArray(schema.studies.id, studyIds)) : [];
    const sAccess = await studiesAccess(userId, studies);
    const owners = new Map<string, string | null>();
    const platform = await isPlatformAdminId(userId);
    for (const c of ctxs) {
        const own = links.filter((l) => l.contextId === c.id);
        let a: Access | null = null;
        if (own.length) {
            for (const l of own) a = best(a, sAccess.get(l.studyId) ?? null);
        } else {
            if (!owners.has(c.patientId)) {
                const [p] = await db.select({ o: schema.patients.ownerUserId }).from(schema.patients).where(eq(schema.patients.id, c.patientId)).limit(1);
                owners.set(c.patientId, p?.o ?? null);
            }
            if (owners.get(c.patientId) === userId) a = 'owner';
            else if (platform) a = 'view';
        }
        if (a) out.set(c.id, a);
    }
    return out;
}

export async function contextAccess(userId: string, contextId: string): Promise<Access | null> {
    return (await contextsAccess(userId, [contextId])).get(contextId) ?? null;
}
