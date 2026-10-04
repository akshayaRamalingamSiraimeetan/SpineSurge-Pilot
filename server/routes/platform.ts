import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';

/**
 * Platform owner's usage dashboard (DEPLOY-06). PLATFORM_ADMIN_EMAILS (comma
 * separated) lists who may open it. Shows who signed up and how they use the
 * app — counts and activity only, never patient names or images (those stay
 * private to their owners unless shared).
 */
export const platformRouter = Router();

export const isPlatformAdmin = (email?: string | null) =>
    !!email && (process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

const rows = async <T,>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];

platformRouter.get('/stats', async (req, res) => {
    if (!isPlatformAdmin(req.user?.email)) { res.status(403).json({ error: 'Platform admins only' }); return; }
    try {
        const [totals] = await rows<Record<string, number>>(sql`
            select
              (select count(*) from users)::int                                                    as users,
              (select count(*) from users where created_at > now() - interval '7 days')::int        as "newUsers7d",
              (select count(distinct user_id) from audit_log where action = 'LOGIN_SUCCESS' and created_at > now() - interval '7 days')::int as "activeUsers7d",
              (select count(*) from orgs)::int                                                     as orgs,
              (select count(*) from patients where id not like 'quick-%')::int                     as patients,
              (select count(*) from studies)::int                                                  as studies,
              (select count(*) from contexts)::int                                                 as sessions,
              (select count(*) from measurements)::int                                             as measurements,
              (select count(*) from reports)::int                                                  as reports,
              (select count(*) from study_shares)::int                                             as shares`);

        const users = await rows(sql`
            select u.id, u.email, u.full_name as "fullName", u.designation, u.country,
                   u.created_at as "signedUp", u.is_email_verified as "verified",
                   (select string_agg(o.name, ', ') from organization_memberships m join orgs o on o.id = m.org_id
                     where m.user_id = u.id and m.status = 'active') as orgs,
                   (select max(created_at) from audit_log a where a.user_id = u.id and a.action = 'LOGIN_SUCCESS') as "lastLogin",
                   (select count(*) from audit_log a where a.user_id = u.id and a.action = 'LOGIN_SUCCESS')::int as logins,
                   (select count(*) from patients p where p.owner_user_id = u.id and p.id not like 'quick-%')::int as patients,
                   (select count(*) from studies s where s.owner_user_id = u.id)::int as studies,
                   (select count(*) from studies s where s.owner_user_id = u.id and s.modality in ('CT','MRI','MR'))::int as "studies3d",
                   (select count(distinct cs.context_id) from context_studies cs join studies s on s.id = cs.study_id where s.owner_user_id = u.id)::int as sessions,
                   (select count(*) from measurements me join context_studies cs on cs.context_id = me.context_id join studies s on s.id = cs.study_id where s.owner_user_id = u.id)::int as measurements,
                   (select count(*) from reports r join studies s on s.id = r.study_id where s.owner_user_id = u.id)::int as reports,
                   (select count(*) from study_shares sh where sh.shared_by = u.id)::int as "sharedOut",
                   (select max(c.last_modified) from contexts c join context_studies cs on cs.context_id = c.id join studies s on s.id = cs.study_id where s.owner_user_id = u.id) as "lastWork"
              from users u order by u.created_at desc`);

        const tools = await rows(sql`select tool_key as "tool", count(*)::int as n from measurements group by 1 order by 2 desc limit 25`);

        const activity = await rows(sql`
            select a.created_at as "at", a.action, coalesce(u.full_name, u.email) as "who"
              from audit_log a left join users u on u.id = a.user_id
             order by a.created_at desc limit 60`);

        const signups = await rows(sql`
            select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as n
              from users where created_at > now() - interval '30 days' group by 1 order by 1`);

        res.json({ totals, users, tools, activity, signups });
    } catch (e) {
        console.error('[platform/stats]', e);
        res.status(500).json({ error: 'Failed to load stats' });
    }
});
