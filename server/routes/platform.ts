import { Router, type Request, type Response, type NextFunction } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { forgetUser, isPlatformAdmin, platformAdminEmails } from '../access';
import * as activity from '../activity';
import * as auditLogger from '../services/auditLogger';
import { sendEmail } from '../services/email';
import { MESSAGE_COLUMNS, type SupportMessage, appUrl } from './support';

/**
 * Platform owner's live monitor (DEPLOY-06, MON-01). PLATFORM_ADMIN_EMAILS
 * (comma separated) lists who may open it. Shows every user's activity: tools,
 * uploaded images, sessions, plans, comparisons, reports — updated live over
 * Server-Sent Events (GET /stream). Opening a user's studies is view-only
 * (access.ts) and each opened user profile is written to the audit log.
 */
export const platformRouter = Router();
export { isPlatformAdmin };

platformRouter.use((req: Request, res: Response, next: NextFunction) => {
    if (!isPlatformAdmin(req.user?.email)) { res.status(403).json({ error: 'Platform admins only' }); return; }
    next();
});

const rows = async <T,>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
const upload = (file: string | null | undefined) => (file ? `/uploads/${String(file).split(/[\\/]/).pop()}` : null);
const isPicture = (file: string | null | undefined) => !!file && /\.(png|jpe?g|webp|bmp|gif)$/i.test(file);
const imageRef = (ref: string | null | undefined) => {
    if (!ref || /^(blob|data):/i.test(ref)) return null;
    const m = ref.match(/\/uploads\/([^/?#]+)$/);
    return m ? `/uploads/${m[1]}` : ref.startsWith('http') ? ref : null;
};
const json = (s: string | null | undefined) => { try { return JSON.parse(s || 'null'); } catch { return null; } };
const pgArray = (xs: string[]) => `{${xs.map((x) => `"${x.replace(/["\\]/g, '')}"`).join(',')}}`;

/** Platform admins' user ids as a Postgres array literal: excluded everywhere (MON-04). */
async function adminIds(): Promise<string> {
    const emails = platformAdminEmails();
    if (!emails.length) return '{}';
    const r = await rows<{ id: string }>(sql`select id from users where lower(email) = any (${pgArray(emails)}::text[])`);
    return pgArray(r.map((x) => x.id));
}

// ── Overview ────────────────────────────────────────────────────────────────
platformRouter.get('/stats', async (_req, res) => {
    try {
        const adm = await adminIds();
        // Everything below leaves out the platform admins' own accounts and work (MON-04).
        const [totals] = await rows<Record<string, number>>(sql`
            with st as (select * from studies where owner_user_id is null or not (owner_user_id = any (${adm}::text[]))),
                 ctx as (select distinct c.id, c.tool_state from contexts c join context_studies cs on cs.context_id = c.id join st on st.id = cs.study_id)
            select
              (select count(*) from users where not (id = any (${adm}::text[])))::int              as users,
              (select count(*) from users where is_active = false)::int                           as blocked,
              (select count(*) from users where created_at > now() - interval '7 days' and not (id = any (${adm}::text[])))::int as "newUsers7d",
              (select count(distinct user_id) from (
                  select user_id from audit_log where action = 'LOGIN_SUCCESS' and created_at > now() - interval '7 days'
                  union all select user_id from usage_events where created_at > now() - interval '7 days') x
                where not (user_id = any (${adm}::text[])))::int                                  as "activeUsers7d",
              (select count(distinct user_id) from usage_events where created_at > date_trunc('day', now()))::int as "activeToday",
              (select count(*) from orgs)::int                                                     as orgs,
              (select count(*) from patients where id not like 'quick-%' and (owner_user_id is null or not (owner_user_id = any (${adm}::text[]))))::int as patients,
              (select count(*) from st)::int                                                       as studies,
              (select count(*) from scans sc join st on st.id = sc.study_id where sc.type is distinct from 'Thumbnail' and sc.file_path ~* '[.](png|jpe?g|webp|bmp|tiff?)$')::int as images,
              (select count(*) from st where upper(modality) in ('CT','MRI','MR'))::int           as series,
              (select count(*) from ctx)::int                                                      as sessions,
              (select count(*) from measurements m join ctx on ctx.id = m.context_id)::int         as measurements,
              (select coalesce(sum(jsonb_array_length(case when jsonb_typeof(tool_state::jsonb->'plans') = 'array' then tool_state::jsonb->'plans' else '[]'::jsonb end)), 0) from ctx)::int as plans,
              (select count(*) from ctx where coalesce(tool_state::jsonb->'comparisonB'->>'image', '') <> '')::int as comparisons,
              (select count(*) from reports r join st on st.id = r.study_id)::int                  as reports,
              (select count(*) from study_shares where shared_by is null or not (shared_by = any (${adm}::text[])))::int as shares,
              (select count(*) from usage_events where created_at > date_trunc('day', now()))::int as "eventsToday"`);

        const users = await rows(sql`
            select u.id, u.email, u.full_name as "fullName", u.designation, u.country, u.avatar_url as "avatarUrl",
                   u.created_at as "signedUp", u.is_email_verified as "verified", u.is_active as "active",
                   (select string_agg(o.name, ', ') from organization_memberships m join orgs o on o.id = m.org_id
                     where m.user_id = u.id and m.status = 'active') as orgs,
                   (select max(created_at) from audit_log a where a.user_id = u.id and a.action = 'LOGIN_SUCCESS') as "lastLogin",
                   (select count(*) from audit_log a where a.user_id = u.id and a.action = 'LOGIN_SUCCESS')::int as logins,
                   (select count(*) from patients p where p.owner_user_id = u.id and p.id not like 'quick-%')::int as patients,
                   (select count(*) from studies s where s.owner_user_id = u.id)::int as studies,
                   (select count(*) from studies s where s.owner_user_id = u.id and upper(s.modality) in ('CT','MRI','MR'))::int as "studies3d",
                   (select count(*) from scans sc join studies s on s.id = sc.study_id where s.owner_user_id = u.id and sc.type is distinct from 'Thumbnail' and sc.file_path ~* '[.](png|jpe?g|webp|bmp|tiff?)$')::int as images,
                   (select count(distinct cs.context_id) from context_studies cs join studies s on s.id = cs.study_id where s.owner_user_id = u.id)::int as sessions,
                   (select count(*) from measurements me join context_studies cs on cs.context_id = me.context_id join studies s on s.id = cs.study_id where s.owner_user_id = u.id)::int as measurements,
                   (select count(*) from usage_events e where e.user_id = u.id and e.kind = 'plan.save')::int as plans,
                   (select count(*) from usage_events e where e.user_id = u.id and e.kind = 'compare.image')::int as comparisons,
                   (select count(*) from reports r join studies s on s.id = r.study_id where s.owner_user_id = u.id)::int as reports,
                   (select count(*) from study_shares sh where sh.shared_by = u.id)::int as "sharedOut",
                   greatest(
                     (select max(created_at) from usage_events e where e.user_id = u.id),
                     (select max(created_at) from audit_log a where a.user_id = u.id)) as "lastActive"
              from users u where not (u.id = any (${adm}::text[]))
             order by "lastActive" desc nulls last, u.created_at desc`);

        const tools = await rows(sql`
            select m.tool_key as tool, count(*)::int as n, count(distinct s.owner_user_id)::int as users
              from measurements m
              join context_studies cs on cs.context_id = m.context_id
              join studies s on s.id = cs.study_id
             where s.owner_user_id is null or not (s.owner_user_id = any (${adm}::text[]))
             group by 1 order by 2 desc limit 40`);
        const picked = await rows(sql`
            select detail->>'tool' as tool, count(*)::int as n, count(distinct user_id)::int as users
              from usage_events where kind = 'tool.select' and created_at > now() - interval '30 days' and detail->>'tool' is not null
             group by 1 order by 2 desc limit 40`);
        const implants = await rows(sql`
            select coalesce(detail->>'type', 'implant') as type, coalesce(detail->>'mode', '2d') as mode, count(*)::int as n
              from usage_events where kind = 'implant.add' group by 1, 2 order by 3 desc`);
        const daily = await rows(sql`
            with days as (select generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') as d)
            select to_char(d, 'YYYY-MM-DD') as day,
                   (select count(*) from users where date_trunc('day', created_at) = d and not (id = any (${adm}::text[])))::int as signups,
                   (select count(distinct user_id) from usage_events where date_trunc('day', created_at) = d)::int as active,
                   (select count(*) from usage_events where date_trunc('day', created_at) = d)::int as events
              from days order by d`);
        const kinds = await rows(sql`select kind, count(*)::int as n from usage_events group by 1 order by 2 desc`);

        res.json({ totals, users, tools, picked, implants, daily, kinds, online: activity.onlineNow() });
    } catch (e) {
        console.error('[platform/stats]', e);
        res.status(500).json({ error: 'Failed to load stats' });
    }
});

// ── Activity feed (usage events + sign-ins), newest first ────────────────────
// ?before=<iso> pages back · ?userId= one user · ?kinds=a,b (prefix match: 'auth.' = all sign-in events)
platformRouter.get('/feed', async (req, res) => {
    const before = typeof req.query.before === 'string' && !isNaN(Date.parse(req.query.before)) ? req.query.before : null;
    const userId = typeof req.query.userId === 'string' && req.query.userId ? req.query.userId : null;
    const kinds = typeof req.query.kinds === 'string' && req.query.kinds ? req.query.kinds.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 20) : null;
    const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 100));
    const kindPatterns = kinds ? `{${kinds.map((k) => `"${k.replace(/["\\%_]/g, '')}%"`).join(',')}}` : null;
    try {
        const adm = await adminIds();
        const items = await rows(sql`
            select f.*, coalesce(u.full_name, u.email) as who, p.name as "patientName", s.name as "studyName", s.modality
              from (
                select 'e' || e.id as id, e.created_at as at, e.kind, e.user_id as "userId", e.patient_id as "patientId",
                       e.study_id as "studyId", e.context_id as "contextId", e.detail
                  from usage_events e
                 where (${userId}::text is null or e.user_id = ${userId})
                   and (${before}::timestamptz is null or e.created_at < ${before}::timestamptz)
                union all
                select 'a' || a.id, a.created_at, 'auth.' || a.action, a.user_id, null, null, null, a.metadata
                  from audit_log a
                 where (${userId}::text is null or a.user_id = ${userId})
                   and (${before}::timestamptz is null or a.created_at < ${before}::timestamptz)
              ) f
              left join users u on u.id = f."userId"
              left join patients p on p.id = f."patientId"
              left join studies s on s.id = f."studyId"
             where (${kindPatterns}::text[] is null or f.kind like any (${kindPatterns}::text[]))
               and (f."userId" is null or not (f."userId" = any (${adm}::text[])))
             order by f.at desc limit ${limit}`);
        res.json(items);
    } catch (e) {
        console.error('[platform/feed]', e);
        res.status(500).json({ error: 'Failed to load activity' });
    }
});

// ── One user: profile, studies with images/sessions/plans/comparisons/reports ─
platformRouter.get('/users/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        const [user] = await rows<Record<string, unknown>>(sql`
            select u.id, u.email, u.full_name as "fullName", u.designation, u.country, u.avatar_url as "avatarUrl",
                   u.created_at as "signedUp", u.is_email_verified as verified, u.is_active as active,
                   (select string_agg(o.name, ', ') from organization_memberships m join orgs o on o.id = m.org_id
                     where m.user_id = u.id and m.status = 'active') as orgs,
                   (select count(*) from audit_log a where a.user_id = u.id and a.action = 'LOGIN_SUCCESS')::int as logins,
                   (select max(created_at) from audit_log a where a.user_id = u.id and a.action = 'LOGIN_SUCCESS') as "lastLogin"
              from users u where u.id = ${userId}`);
        if (!user) { res.status(404).json({ error: 'User not found' }); return; }

        const studies = await rows<any>(sql`
            select s.id, s.name, s.modality, s.status, s.source, s.acquisition_date as "acquisitionDate",
                   s.patient_id as "patientId", p.name as "patientName", o.name as "orgName"
              from studies s join patients p on p.id = s.patient_id left join orgs o on o.id = s.organization_id
             where s.owner_user_id = ${userId}
             order by s.acquisition_date desc nulls last, s.id desc`);
        const ids = studies.map((s) => s.id as string);
        const idList = `{${ids.map((i) => `"${i.replace(/"/g, '')}"`).join(',')}}`;

        const scans = ids.length ? await rows<any>(sql`
            select id, study_id as "studyId", file_path as "filePath", type, date from scans
             where study_id = any (${idList}::text[]) order by date nulls last, id`) : [];
        const sessions = ids.length ? await rows<any>(sql`
            select c.id, c.name, c.mode, c.last_modified as "lastModified", c.current_image as "currentImage", c.tool_state as "toolState",
                   array_agg(distinct cs.study_id) as "studyIds"
              from contexts c join context_studies cs on cs.context_id = c.id
             where cs.study_id = any (${idList}::text[])
             group by c.id order by c.last_modified desc nulls last`) : [];
        const ctxIds = `{${sessions.map((c) => `"${String(c.id).replace(/"/g, '')}"`).join(',')}}`;
        const measurements = sessions.length ? await rows<any>(sql`
            select context_id as "contextId", tool_key as tool, result, timestamp from measurements
             where context_id = any (${ctxIds}::text[]) order by timestamp`) : [];
        const implants = sessions.length ? await rows<any>(sql`
            select context_id as "contextId", type, count(*)::int as n from implants
             where context_id = any (${ctxIds}::text[]) group by 1, 2`) : [];
        const reports = ids.length ? await rows<any>(sql`
            select id, study_id as "studyId", title, version, file_path as "filePath", created_at as "createdAt" from reports
             where study_id = any (${idList}::text[]) order by created_at desc`) : [];
        const shares = await rows(sql`
            select sh.permission, sh.created_at as "at", s.name as "studyName", s.modality,
                   coalesce(a.full_name, a.email) as "fromName", coalesce(b.full_name, b.email) as "toName",
                   case when sh.shared_by = ${userId} then 'out' else 'in' end as direction
              from study_shares sh join studies s on s.id = sh.study_id
              left join users a on a.id = sh.shared_by left join users b on b.id = sh.shared_with
             where sh.shared_by = ${userId} or sh.shared_with = ${userId}
             order by sh.created_at desc`);
        const tools = sessions.length ? await rows(sql`
            select tool_key as tool, count(*)::int as n from measurements
             where context_id = any (${ctxIds}::text[]) group by 1 order by 2 desc`) : [];

        const out = studies.map((s) => ({
            ...s,
            images: scans.filter((sc) => sc.studyId === s.id && sc.type !== 'Thumbnail').map((sc) => ({
                id: sc.id, url: upload(sc.filePath), type: sc.type, date: sc.date, picture: isPicture(sc.filePath),
            })),
            thumbnail: upload(scans.find((sc) => sc.studyId === s.id && sc.type === 'Thumbnail')?.filePath),
            sessions: sessions.filter((c) => (c.studyIds as string[]).includes(s.id)).map((c) => {
                const ts = json(c.toolState) ?? {};
                const plans = Array.isArray(ts.plans) ? ts.plans : [];
                return {
                    id: c.id, name: c.name, mode: c.mode, lastModified: c.lastModified,
                    image: imageRef(c.currentImage),
                    calibrated: !!ts.calibration?.calibrationApplied,
                    measurements: measurements.filter((m) => m.contextId === c.id).map((m) => ({ tool: m.tool, result: json(m.result) })),
                    implants: implants.filter((i) => i.contextId === c.id).map((i) => ({ type: i.type, n: i.n })),
                    implants3d: Array.isArray(ts.threeDImplants) ? ts.threeDImplants.length : 0,
                    plans: plans.map((p: any) => ({
                        name: p.name, savedAt: p.savedAt, measurements: p.measurements?.length ?? 0, implants: p.implants?.length ?? 0,
                        osteotomies: (p.measurements ?? []).filter((m: any) => String(m?.toolKey ?? '').startsWith('ost-')).map((m: any) => m.toolKey),
                    })),
                    comparison: ts.comparisonB?.image ? {
                        image: imageRef(ts.comparisonB.image), label: ts.comparisonB.source?.label ?? 'Imported file',
                        measurements: Array.isArray(ts.comparisonB.measurements) ? ts.comparisonB.measurements.length : 0,
                    } : null,
                };
            }),
            reports: reports.filter((r) => r.studyId === s.id).map((r) => ({ ...r, url: upload(r.filePath) })),
        }));

        await auditLogger.log('PLATFORM_VIEW_USER', 'user', userId, null, req.user!.id, null);
        res.json({ user: { ...user, isPlatformAdmin: isPlatformAdmin(user.email as string) }, studies: out, shares, tools, online: activity.onlineNow().find((o) => o.userId === userId) ?? null });
    } catch (e) {
        console.error('[platform/user]', e);
        res.status(500).json({ error: 'Failed to load user' });
    }
});

// ── Block / unblock an account (MON-05) ─────────────────────────────────────
// A blocked user can't sign in, every API call with their old token gets 401
// (authenticate checks is_active), and /uploads + live share refuse them too.
// Their data is kept; unblocking restores everything.
platformRouter.post('/users/:id/block', async (req, res) => {
    const userId = req.params.id;
    const blocked = req.body?.blocked !== false;
    try {
        const [u] = await rows<{ id: string; email: string }>(sql`select id, email from users where id = ${userId}`);
        if (!u) { res.status(404).json({ error: 'User not found' }); return; }
        if (u.id === req.user!.id || isPlatformAdmin(u.email)) { res.status(400).json({ error: 'Platform admins cannot be blocked here' }); return; }
        await db.execute(sql`update users set is_active = ${!blocked}, updated_at = now() where id = ${userId}`);
        forgetUser(userId);
        if (blocked) activity.dropPresence(userId);
        await auditLogger.log(blocked ? 'PLATFORM_BLOCK_USER' : 'PLATFORM_UNBLOCK_USER', 'user', userId, { email: u.email }, req.user!.id, null);
        res.json({ ok: true, active: !blocked });
    } catch (e) {
        console.error('[platform/block]', e);
        res.status(500).json({ error: 'Failed to update the account' });
    }
});

// ── Help & feedback conversations (HELP-01) ────────────────────────────────
platformRouter.get('/support', async (_req, res) => {
    try {
        const list = await rows(sql`
            select m.user_id as "userId", coalesce(u.full_name, u.email) as who, u.email, u.is_active as active,
                   count(*)::int as messages,
                   count(*) filter (where not m.from_admin and m.read_at is null)::int as unread,
                   max(m.created_at) as "lastAt",
                   (array_agg(m.body order by m.created_at desc))[1] as "lastBody",
                   (array_agg(m.from_admin order by m.created_at desc))[1] as "lastFromAdmin",
                   (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (
                       select kind, count(*)::int as n from support_messages x
                        where x.user_id = m.user_id and not x.from_admin and kind is not null group by kind) k) as kinds
              from support_messages m
              join users u on u.id = m.user_id
             group by m.user_id, u.full_name, u.email, u.is_active
             order by max(m.created_at) desc`);
        const [t] = await rows<Record<string, number>>(sql`
            select count(*) filter (where not from_admin and read_at is null)::int as unread,
                   count(*) filter (where not from_admin)::int as received,
                   count(*) filter (where not from_admin and kind = 'stuck')::int as stuck,
                   count(*) filter (where not from_admin and kind = 'bug')::int as bug,
                   count(*) filter (where not from_admin and kind = 'like')::int as "like",
                   count(*) filter (where not from_admin and kind = 'dislike')::int as dislike,
                   count(*) filter (where not from_admin and kind = 'idea')::int as idea,
                   count(*) filter (where not from_admin and kind = 'question')::int as question
              from support_messages`);
        res.json({ conversations: list, totals: t });
    } catch (e) {
        console.error('[platform/support]', e);
        res.status(500).json({ error: 'Failed to load feedback' });
    }
});

platformRouter.get('/support/unread', async (_req, res) => {
    try {
        const [r] = await rows<{ n: number }>(sql`select count(*)::int as n from support_messages where not from_admin and read_at is null`);
        res.json({ unread: r?.n ?? 0 });
    } catch {
        res.json({ unread: 0 });
    }
});

platformRouter.get('/support/:userId', async (req, res) => {
    try {
        const messages = await rows<SupportMessage>(sql`select ${MESSAGE_COLUMNS} from support_messages where user_id = ${req.params.userId} order by created_at`);
        await db.execute(sql`update support_messages set read_at = now() where user_id = ${req.params.userId} and not from_admin and read_at is null`);
        res.json(messages);
    } catch (e) {
        console.error('[platform/support/thread]', e);
        res.status(500).json({ error: 'Failed to load the conversation' });
    }
});

platformRouter.post('/support/:userId', async (req, res) => {
    const body = String(req.body?.body ?? '').trim().slice(0, 4000);
    if (!body) { res.status(400).json({ error: 'Write a reply first' }); return; }
    try {
        const [u] = await rows<{ id: string; email: string; fullName: string | null }>(sql`select id, email, full_name as "fullName" from users where id = ${req.params.userId}`);
        if (!u) { res.status(404).json({ error: 'User not found' }); return; }
        const [msg] = await rows<SupportMessage>(sql`
            insert into support_messages (user_id, from_admin, author_id, body)
            values (${u.id}, true, ${req.user!.id}, ${body}) returning ${MESSAGE_COLUMNS}`);
        res.json(msg);
        activity.pushSupport({ ...msg, who: 'SpineSurge team' });
        // The user may not be online: tell them by email too
        const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
        const link = `${appUrl(req)}/#/dashboard?help=1`;
        await sendEmail({
            to: u.email,
            subject: 'The SpineSurge team replied to your message',
            text: `Hi ${u.fullName || ''},\n\nThe SpineSurge team replied:\n\n${body}\n\nOpen SpineSurge and click the ? (Help) button to continue the conversation: ${link}`,
            html: `<div style="font-family:system-ui,sans-serif;max-width:560px">
                <p>Hi ${esc(u.fullName || '')},</p><p>The SpineSurge team replied:</p>
                <p style="white-space:pre-wrap;background:#f4f4f5;border-radius:8px;padding:12px">${esc(body)}</p>
                <p><a href="${link}">Open SpineSurge</a> and click the <b>?</b> (Help) button to continue the conversation.</p>
            </div>`,
        });
    } catch (e) {
        console.error('[platform/support/reply]', e);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to send the reply' });
    }
});

// ── Uploaded images, newest first (all users) ───────────────────────────────
platformRouter.get('/uploads', async (_req, res) => {
    try {
        const adm = await adminIds();
        // One row per study: X-ray pictures individually, a CT/MR series as one tile
        const items = await rows<any>(sql`
            select sc.id, sc.file_path as "filePath", sc.type, sc.date, sc.study_id as "studyId",
                   s.name as "studyName", s.modality, s.patient_id as "patientId", p.name as "patientName",
                   s.owner_user_id as "userId", coalesce(u.full_name, u.email) as who,
                   (select count(*) from scans x where x.study_id = sc.study_id and x.type is distinct from 'Thumbnail')::int as files,
                   (select min(created_at) from usage_events e where e.study_id = sc.study_id and e.kind in ('image.upload', 'series.upload')) as "uploadedAt"
              from scans sc join studies s on s.id = sc.study_id join patients p on p.id = s.patient_id
              left join users u on u.id = s.owner_user_id
             where (sc.type = 'Thumbnail' or (sc.type is distinct from 'Thumbnail' and sc.file_path ~* '[.](png|jpe?g|webp|bmp)$'))
               and (s.owner_user_id is null or not (s.owner_user_id = any (${adm}::text[])))
             order by "uploadedAt" desc nulls last, sc.id desc limit 200`);
        res.json(items.map((i) => ({ ...i, url: upload(i.filePath), filePath: undefined })));
    } catch (e) {
        console.error('[platform/uploads]', e);
        res.status(500).json({ error: 'Failed to load uploads' });
    }
});

// ── Exported reports (all users) ────────────────────────────────────────────
platformRouter.get('/reports', async (_req, res) => {
    try {
        const adm = await adminIds();
        const items = await rows<any>(sql`
            select r.id, r.title, r.version, r.created_at as "createdAt", r.file_path as "filePath", r.study_id as "studyId",
                   s.name as "studyName", s.modality, p.id as "patientId", p.name as "patientName",
                   s.owner_user_id as "userId", coalesce(u.full_name, u.email) as who
              from reports r join visits v on v.id = r.visit_id join patients p on p.id = v.patient_id
              left join studies s on s.id = r.study_id left join users u on u.id = coalesce(s.owner_user_id, p.owner_user_id)
             where u.id is null or not (u.id = any (${adm}::text[]))
             order by r.created_at desc nulls last limit 200`);
        res.json(items.map((i) => ({ ...i, url: upload(i.filePath), filePath: undefined })));
    } catch (e) {
        console.error('[platform/reports]', e);
        res.status(500).json({ error: 'Failed to load reports' });
    }
});

// ── Live stream (Server-Sent Events over an authenticated fetch) ────────────
platformRouter.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // proxies must not buffer the stream
    });
    const send = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    send('presence', { online: activity.onlineNow() });
    const off = activity.subscribe((m) => (m.type === 'event' ? send('event', m.event)
        : m.type === 'support' ? send('support', m.message) : send('presence', { online: m.online })));
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000); // keeps hosting proxies from closing it
    req.on('close', () => { clearInterval(ping); off(); });
});
