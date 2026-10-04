import { Router, type Request } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { isPlatformAdmin, platformAdminEmails } from '../access';
import { sendEmail } from '../services/email';
import * as activity from '../activity';

/**
 * Help & feedback chat (HELP-01). Each user has one conversation with the
 * SpineSurge team. Users write from the "?" panel; every message is emailed to
 * PLATFORM_ADMIN_EMAILS and pushed live to the Monitor (Feedback tab), where
 * the team replies. Replies are emailed to the user and shown in their panel.
 *   GET  /api/support          the caller's conversation (marks team replies read)
 *   GET  /api/support/unread   number of unread team replies
 *   POST /api/support          { body, kind?, page?, context? }
 * Admin side: routes/platform.ts (/support…).
 */
export const supportRouter = Router();

export const KINDS = new Set(['question', 'stuck', 'bug', 'like', 'dislike', 'idea']);
export const KIND_LABEL: Record<string, string> = {
    question: 'Question', stuck: "I'm stuck", bug: 'Something is broken', like: 'I like this', dislike: "I don't like this", idea: 'Idea',
};

const rows = async <T,>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
export const appUrl = (req: Request) => (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export interface SupportMessage {
    id: string; userId: string; fromAdmin: boolean; kind: string | null; body: string;
    page: string | null; context: Record<string, unknown> | null; readAt: string | null; createdAt: string;
}
export const MESSAGE_COLUMNS = sql`id::text as id, user_id as "userId", from_admin as "fromAdmin", kind, body, page, context,
    read_at as "readAt", created_at as "createdAt"`;

supportRouter.get('/', async (req, res) => {
    try {
        const userId = req.user!.id;
        const messages = await rows<SupportMessage>(sql`select ${MESSAGE_COLUMNS} from support_messages where user_id = ${userId} order by created_at`);
        await db.execute(sql`update support_messages set read_at = now() where user_id = ${userId} and from_admin and read_at is null`);
        res.json(messages);
    } catch (e) {
        console.error('[support/list]', e);
        res.status(500).json({ error: 'Could not load messages' });
    }
});

supportRouter.get('/unread', async (req, res) => {
    try {
        const [r] = await rows<{ n: number }>(sql`select count(*)::int as n from support_messages where user_id = ${req.user!.id} and from_admin and read_at is null`);
        res.json({ unread: r?.n ?? 0 });
    } catch {
        res.json({ unread: 0 });
    }
});

supportRouter.post('/', async (req, res) => {
    const user = req.user!;
    const body = String(req.body?.body ?? '').trim().slice(0, 4000);
    const kind = KINDS.has(req.body?.kind) ? String(req.body.kind) : 'question';
    const page = typeof req.body?.page === 'string' ? req.body.page.slice(0, 200) : null;
    const ctx = req.body?.context && typeof req.body.context === 'object' && JSON.stringify(req.body.context).length < 2000 ? req.body.context : null;
    if (!body) { res.status(400).json({ error: 'Write a message first' }); return; }
    if (isPlatformAdmin(user.email)) { res.status(400).json({ error: 'Reply to users from Monitor → Feedback' }); return; }
    try {
        const [recent] = await rows<{ n: number }>(sql`select count(*)::int as n from support_messages where user_id = ${user.id} and not from_admin and created_at > now() - interval '1 hour'`);
        if ((recent?.n ?? 0) >= 30) { res.status(429).json({ error: 'You have sent a lot of messages — please wait a little.' }); return; }
        const [msg] = await rows<SupportMessage>(sql`
            insert into support_messages (user_id, from_admin, author_id, kind, body, page, context)
            values (${user.id}, false, ${user.id}, ${kind}, ${body}, ${page}, ${ctx ? JSON.stringify(ctx) : null}::jsonb)
            returning ${MESSAGE_COLUMNS}`);
        res.json(msg);

        // Live in the Monitor + an email to the team (after answering the user)
        const who = user.fullName || user.email;
        activity.pushSupport({ ...msg, who, email: user.email });
        const admins = platformAdminEmails();
        if (admins.length) {
            const link = `${appUrl(req)}/#/platform?view=feedback&user=${encodeURIComponent(user.id)}`;
            const where = page ? `\nPage: ${page}` : '';
            for (const to of admins) await sendEmail({
                to,
                subject: `[SpineSurge feedback] ${KIND_LABEL[kind]} — ${who}`,
                text: `${who} (${user.email}) wrote:\n\n${body}\n\nType: ${KIND_LABEL[kind]}${where}\n\nReply in the Monitor: ${link}`,
                html: `<div style="font-family:system-ui,sans-serif;max-width:560px">
                    <p style="margin:0 0 4px;color:#666;font-size:13px">${esc(KIND_LABEL[kind])}${page ? ` · ${esc(page)}` : ''}</p>
                    <h3 style="margin:0 0 12px">${esc(who)} <span style="font-weight:400;color:#666">(${esc(user.email)})</span></h3>
                    <p style="white-space:pre-wrap;background:#f4f4f5;border-radius:8px;padding:12px">${esc(body)}</p>
                    <p><a href="${link}">Reply in the SpineSurge Monitor →</a></p>
                </div>`,
            });
        }
    } catch (e) {
        console.error('[support/send]', e);
        if (!res.headersSent) res.status(500).json({ error: 'Could not send your message' });
    }
});
