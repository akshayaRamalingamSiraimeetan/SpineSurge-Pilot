import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq, like } from 'drizzle-orm';
import { db } from './db';
import * as schema from './schema';
import { contextsAccess, patientAccess, studyAccess } from './access';

/**
 * Private uploads (DEPLOY-05). Images, DICOM files and report PDFs are served
 * only to a signed-in user who may see the study they belong to. Browsers
 * can't put a Bearer header on <img>/viewer requests, so authenticated API
 * calls also set an HttpOnly cookie that /uploads checks. Enforced when the app
 * is served from this server (SERVE_CLIENT=true, same origin) or MEDIA_AUTH=true.
 */
export const MEDIA_AUTH = process.env.SERVE_CLIENT === 'true' || process.env.MEDIA_AUTH === 'true';
const COOKIE = 'ss_media';

const readCookie = (req: Request) =>
    (req.headers.cookie ?? '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);

/** Called after a request was authenticated with a Bearer token. */
export function refreshMediaCookie(req: Request, res: Response, token: string) {
    if (!MEDIA_AUTH || readCookie(req) === token) return;
    const exp = (jwt.decode(token) as { exp?: number } | null)?.exp;
    res.cookie(COOKIE, token, {
        httpOnly: true,
        secure: req.secure,
        sameSite: 'lax',
        path: '/uploads',
        ...(exp ? { expires: new Date(exp * 1000) } : {}),
    });
}

export const clearMediaCookie = (res: Response) => res.clearCookie(COOKIE, { path: '/uploads' });

/** May this user open this uploaded file? */
async function canOpen(userId: string, file: string): Promise<boolean> {
    if (file.startsWith('avatar-')) return true; // profile pictures: any signed-in user
    const [scan] = await db.select({ studyId: schema.scans.studyId }).from(schema.scans).where(eq(schema.scans.filePath, file)).limit(1);
    if (scan) return !!(await studyAccess(userId, scan.studyId));
    const [report] = await db.select().from(schema.reports).where(eq(schema.reports.filePath, file)).limit(1);
    if (report) {
        if (report.studyId) return !!(await studyAccess(userId, report.studyId));
        const [visit] = await db.select().from(schema.visits).where(eq(schema.visits.id, report.visitId)).limit(1);
        return !!visit && !!(await patientAccess(userId, visit.patientId));
    }
    // An image referenced only by a session (e.g. an edited copy)
    const ctxs = await db.select({ id: schema.contexts.id }).from(schema.contexts).where(like(schema.contexts.currentImage, `%/uploads/${file}`));
    if (ctxs.length) return (await contextsAccess(userId, ctxs.map((c) => c.id))).size > 0;
    return false;
}

export async function guardUploads(req: Request, res: Response, next: NextFunction) {
    if (!MEDIA_AUTH) return next();
    const token = readCookie(req);
    let userId: string | null = null;
    try {
        userId = token ? (jwt.verify(token, process.env.JWT_SECRET!) as { id: string }).id : null;
    } catch { /* expired / invalid */ }
    if (!userId) { res.status(401).send('Sign in to view this file'); return; }
    const file = decodeURIComponent(req.path.replace(/^\//, ''));
    try {
        if (!file || file.includes('/') || !(await canOpen(userId, file))) { res.status(404).send('Not found'); return; }
    } catch (e) {
        console.error('[uploads guard]', e);
        res.status(500).send('Error');
        return;
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    next();
}
