import express from 'express';
import { UPLOADS_DIR } from './config';
import 'dotenv/config';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { db } from './db';
import * as schema from './schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import * as pacsService from './pacsService';
import http from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from './y-websocket';
import { authRouter } from './routes/auth';
import { orgsRouter } from './routes/orgs';
import { invitationsRouter } from './routes/invitations';
import { authenticate } from './middleware/authenticate';
import { type Access, adminOrgIds, canWrite, contextAccess, contextsAccess, patientAccess, studyAccess } from './access';
import jwt from 'jsonwebtoken';



const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });

wss.on('connection', (ws, req) => {
    setupWSConnection(ws, req);
});

// Live-share rooms require a valid session token (?token=…) — BUGS SRV-09.
// A room is one session (spinesurge-pro-<contextId>): only users with access to
// it may join, and view-only users receive but can't send edits (UI12-10).
server.on('upgrade', async (request, socket, head) => {
    const reject = (code: string) => { socket.write(`HTTP/1.1 ${code}\r\n\r\n`); socket.destroy(); };
    let userId: string;
    try {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const token = url.searchParams.get('token');
        if (!token) throw new Error('missing token');
        userId = (jwt.verify(token, process.env.JWT_SECRET!) as { id: string }).id;
    } catch {
        reject('401 Unauthorized');
        return;
    }
    try {
        const room = decodeURIComponent((request.url ?? '/').slice(1).split('?')[0]).replace(/^spinesurge-pro-/, '');
        // quick-analysis rooms aren't saved sessions; everything else must be accessible
        const access = room.startsWith('quick-') ? 'owner' : await contextAccess(userId, room);
        if (!access) { reject('403 Forbidden'); return; }
        (request as http.IncomingMessage & { ssReadOnly?: boolean }).ssReadOnly = !canWrite(access);
    } catch {
        reject('500 Internal Server Error');
        return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Behind a reverse proxy (any hosted deploy), use X-Forwarded-* so image URLs
// built from req.protocol/host come out as the public https URL.
app.set('trust proxy', true);

// CORS: allow-list via CORS_ORIGINS (comma separated); default = any origin
// (dev). Auth is a bearer token, not a cookie, so no credentials needed.
const corsOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : undefined));
// Context saves carry all measurements/annotations — 100kb default was too
// small and silently failed big saves (BUGS SRV-13).
app.use(express.json({ limit: '10mb' }));
// Express 5 leaves req.body undefined when no parser matched (BUGS SRV-20).
app.use((req, _res, next) => { if (req.body === undefined) req.body = {}; next(); });

app.use((req, res, next) => {
    if (process.env.LOG_REQUESTS === 'true') console.log(`${req.method} ${req.url}`);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    next();
});

// Setup uploads directory
// UPLOADS_DIR env = persistent disk mount in hosting (e.g. /data/uploads).
// (shared with routes / PACS / scripts — config.ts)
fs.ensureDirSync(UPLOADS_DIR);
// Only inert media types are ever served inline; anything else downloads.
// nosniff stops the browser treating an upload as HTML/JS (BUGS SRV-07).
const INLINE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.pdf']);
app.use('/uploads', express.static(UPLOADS_DIR, {
    setHeaders: (res, filePath) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        if (!INLINE_EXTS.has(path.extname(filePath).toLowerCase())) {
            res.setHeader('Content-Disposition', 'attachment');
        }
    },
}));

// File upload configuration — allow-listed extensions only (DICOM files
// frequently have no extension, which is allowed).
const UPLOAD_EXTS = new Set(['', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.dcm', '.dicom', '.pdf']);
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${uniqueSuffix}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 512 * 1024 * 1024, files: 1 }, // BUGS SRV-12
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (UPLOAD_EXTS.has(ext)) cb(null, true);
        else cb(new Error(`File type not allowed: ${ext}`));
    },
});

// Every /api route requires a valid session (BUGS SRV-01). authenticate is
// idempotent, so routes that also list it explicitly are fine.
app.use('/api', authenticate);

// Helper to normalize gender
const normalizeGender = (g: string | null): 'M' | 'F' | 'O' => {
    if (!g) return 'O';
    const val = g.trim().toUpperCase();
    if (val.startsWith('M')) return 'M';
    if (val.startsWith('F')) return 'F';
    return 'O';
};

// Helper to sanitize paths
const toRelativePath = (absolutePath: string) => {
    if (!absolutePath) return '';
    if (absolutePath.startsWith(UPLOADS_DIR)) {
        return path.relative(UPLOADS_DIR, absolutePath);
    }
    return path.basename(absolutePath);
};

const toAbsoluteUrl = (relativePath: string, baseUrl: string) => {
    if (!relativePath) return '';
    if (relativePath.startsWith('http')) return relativePath;
    const filename = relativePath.split(/[\\/]/).pop() || '';
    return `${baseUrl}/uploads/${filename}`;
};

// A context's current image is stored host-independently: files we serve are
// kept as "/uploads/<file>" and expanded to an absolute URL on read, so saved
// studies keep working when the server's host or port changes.
const UPLOADS_URL_RE = /^(?:https?:\/\/[^/]+)?\/uploads\/([^/?#]+)$/;

// blob:/data: URLs only exist inside one browser tab; persisting them leaves
// the study with an image that can never be loaded again.
const isEphemeralUrl = (url: unknown) => typeof url === 'string' && /^(blob|data):/i.test(url);

const toStoredImageRef = (url: string | null | undefined) => {
    if (!url) return null;
    const match = url.match(UPLOADS_URL_RE);
    return match ? `/uploads/${match[1]}` : url;
};

const toClientImageUrl = (ref: string | null, baseUrl: string) =>
    ref && UPLOADS_URL_RE.test(ref) ? toAbsoluteUrl(ref, baseUrl) : ref;

// --- API Routes ---

// Get all patients the caller may see (UI12-10):
//   own    — patients they created / studies they own; studies filtered by the
//            active workspace (personal: no org; organization: that org)
//   share  — studies another user shared with them (any workspace) → "Shared studies"
//   team   — org admin/creator in that org's workspace: every member's studies in
//            the org, view-only → reached through Members → View workspace
// Each study carries { access: owner|edit|view, via: own|share|team, ownerName }.
app.get('/api/patients', authenticate, async (req, res) => {
    try {
        const baseUrl      = `${req.protocol}://${req.get('host')}`;
        const callerId     = req.user!.id;
        const workspaceParam = req.query.workspace as string | undefined;
        const orgIdParam     = req.query.orgId     as string | undefined;

        // Verify active membership when accessing an org workspace.
        // Removed/blacklisted members cannot access org data.
        if (workspaceParam === 'organization' && orgIdParam) {
            const [membership] = await db
                .select({ role: schema.organizationMemberships.role })
                .from(schema.organizationMemberships)
                .where(
                    and(
                        eq(schema.organizationMemberships.userId, callerId),
                        eq(schema.organizationMemberships.orgId, orgIdParam),
                        eq(schema.organizationMemberships.status, 'active'),
                    )
                )
                .limit(1);

            // Also allow the org creator (may not have a membership row in edge cases)
            if (!membership) {
                const [orgRow] = await db
                    .select({ createdBy: schema.orgs.createdBy })
                    .from(schema.orgs)
                    .where(eq(schema.orgs.id, orgIdParam))
                    .limit(1);
                if (!orgRow || orgRow.createdBy !== callerId) {
                    res.status(403).json({ error: 'Access denied to this organization workspace' });
                    return;
                }
            }
        }

        const patientsData = await db.query.patients.findMany({
            with: {
                visits: {
                    orderBy: (v, { desc }) => [desc(v.date)],
                    with: {
                        studies: {
                            with: { scans: true }
                        },
                        reports: true
                    }
                },
                studies: {
                    with: { scans: true }
                }
            }
        });

        const [shares, adminOrgs, userRows] = await Promise.all([
            db.select().from(schema.studyShares).where(eq(schema.studyShares.sharedWith, callerId)),
            adminOrgIds(callerId),
            db.select({ id: schema.users.id, fullName: schema.users.fullName, email: schema.users.email }).from(schema.users),
        ]);
        const shareOf = new Map(shares.map((sh) => [sh.studyId, sh.permission === 'edit' ? 'edit' as const : 'view' as const]));
        const nameOf = new Map(userRows.map((u) => [u.id, u.fullName || u.email]));
        const teamOrg = workspaceParam === 'organization' && orgIdParam && adminOrgs.has(orgIdParam) ? orgIdParam : null;

        const formattedPatients = patientsData.map(p => {
            const ownsPatient = p.ownerUserId === callerId;
            let studies = p.studies.map(s => ({
                ...s,
                patientId:       s.patientId,
                visitId:         s.visitId,
                modality:        s.modality        || 'X-Ray',
                source:          s.source          || 'Import',
                acquisitionDate: s.acquisitionDate || '',
                name:            s.name            || null,
                status:          s.status          || 'Draft',
                organizationId:  s.organizationId  ?? null,
                ownerUserId:     s.ownerUserId      ?? null,
                access:          'owner' as Access,
                via:             'own' as 'own' | 'share' | 'team',
                ownerName:       null as string | null,
                scans: s.scans.map(sc => ({
                    id:       sc.id,
                    studyId:  sc.studyId,
                    imageUrl: toAbsoluteUrl(sc.filePath, baseUrl),
                    type:     sc.type || 'Imported',
                    date:     sc.date || ''
                }))
            }));

            // ── Who sees which study (UI12-10) ─────────────────────────────
            const inWorkspace = (orgId: string | null) =>
                workspaceParam === 'organization' ? orgId === orgIdParam : orgId === null;
            studies = studies.flatMap((s): typeof studies => {
                const isOwner = s.ownerUserId === callerId || (s.ownerUserId === null && ownsPatient);
                if (isOwner) return inWorkspace(s.organizationId) ? [{ ...s, access: 'owner' as const, via: 'own' as const, ownerName: null }] : [];
                const shared = shareOf.get(s.id);
                const ownerName = s.ownerUserId ? nameOf.get(s.ownerUserId) ?? null : null;
                if (shared) return [{ ...s, access: shared, via: 'share' as const, ownerName }];
                if (teamOrg && s.organizationId === teamOrg) return [{ ...s, access: 'view' as const, via: 'team' as const, ownerName }];
                return [];
            });
            // Own patients live in one workspace — personal and organization never mix (UI12-21).
            // (A legacy patient with own studies in this workspace still shows.)
            const ownHere = ownsPatient && (inWorkspace(p.organizationId ?? null) || studies.some((s) => s.via === 'own'));
            if (!ownHere && studies.length === 0) return null;
            const access = ownHere || studies.some((s) => s.via === 'own') ? 'owner'
                : studies.some((s) => s.via === 'share') ? 'shared' : 'team';

            const visits = p.visits.map((v, idx) => {
                const isLatestVisit = idx === 0;
                const visitStudies  = studies.filter(s =>
                    s.visitId === v.id || (isLatestVisit && !s.visitId)
                );
                return {
                    ...v,
                    visitNumber:  v.visitNumber  || '0000',
                    date:         v.date         || '',
                    time:         v.time         || '',
                    diagnosis:    v.diagnosis    || '',
                    comments:     v.comments     || '',
                    height:       v.height       || '',
                    weight:       v.weight       || '',
                    consultants:  v.consultants  || '',
                    surgeryDate:  v.surgeryDate  || '',
                    studies:      visitStudies,
                    scans:        visitStudies.flatMap(s => s.scans || [])
                };
            });

            return {
                ...p,
                gender:    normalizeGender(p.gender),
                lastVisit: p.lastVisit || '',
                hasAlert:  !!p.hasAlert,
                isArchived: !!p.isArchived,
                ownerUserId: p.ownerUserId ?? null,
                ownerName:   p.ownerUserId ? nameOf.get(p.ownerUserId) ?? null : null,
                access,
                // someone else's patient: only the visits holding studies they can see
                visits: ownHere ? visits : visits.filter((v) => v.studies.length > 0),
                studies
            };
        }).filter(Boolean);

        res.json(formattedPatients);
    } catch (err: any) {
        console.error("Critical error in getPatients:", err);
        res.status(500).json({ error: err.message });
    }
});

// Create/Update Patient
app.post('/api/patients', async (req, res) => {
    const { id, name, age, gender, dob, sex, contact, lastVisit, hasAlert, isArchived } = req.body;
    try {
        if (!id) return res.status(400).json({ error: 'Missing patient id' });
        // POST is an upsert: never let it overwrite someone else's patient (UI12-10).
        const [existing] = await db.select().from(schema.patients).where(eq(schema.patients.id, id)).limit(1);
        if (existing && existing.ownerUserId !== req.user!.id) {
            const a = await patientAccess(req.user!.id, id);
            if (!canWrite(a)) return res.status(existing.ownerUserId ? 409 : 403).json({ error: 'A patient with this ID already exists' });
        }
        // Workspace is fixed at creation; only an org the caller actively belongs to (UI12-21)
        let organizationId: string | null = null;
        if (!existing && req.body.organizationId) {
            const [m] = await db.select().from(schema.organizationMemberships).where(and(
                eq(schema.organizationMemberships.userId, req.user!.id),
                eq(schema.organizationMemberships.orgId, String(req.body.organizationId)),
                eq(schema.organizationMemberships.status, 'active'),
            )).limit(1);
            if (m) organizationId = m.orgId;
        }
        await db.insert(schema.patients).values({
            ownerUserId: req.user!.id,
            organizationId,
            id,
            name,
            age: age ? parseInt(age) : null,
            gender: gender || sex,
            dob,
            contact,
            lastVisit,
            hasAlert: !!hasAlert,
            isArchived: !!isArchived
        }).onConflictDoUpdate({
            target: schema.patients.id,
            set: {
                ownerUserId: sql`coalesce(${schema.patients.ownerUserId}, ${req.user!.id})`,
                name,
                age: age ? parseInt(age) : null,
                gender: gender || sex,
                dob,
                contact,
                lastVisit,
                hasAlert: !!hasAlert,
                isArchived: !!isArchived
            }
        });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Archive Patient
app.post('/api/patients/:id/archive', async (req, res) => {
    const { archived } = req.body;
    const patientId = req.params.id;
    try {
        if (await patientAccess(req.user!.id, patientId) !== 'owner') return res.status(403).json({ error: 'Only the owner can archive this patient' });
        const result = await db.update(schema.patients)
            .set({ isArchived: !!archived })
            .where(eq(schema.patients.id, patientId))
            .returning({ id: schema.patients.id });

        if (result.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Create/Update Visit
app.post('/api/visits', async (req, res) => {
    const { id, patientId, visitNumber, date, time, diagnosis, comments, height, weight, consultants, surgeryDate } = req.body;
    try {
        if (!canWrite(await patientAccess(req.user!.id, patientId))) return res.status(403).json({ error: 'You can only view this patient' });
        await db.insert(schema.visits).values({
            id, patientId, visitNumber, date, time, diagnosis, comments, height, weight, consultants, surgeryDate
        }).onConflictDoUpdate({
            target: schema.visits.id,
            set: {
                patientId, visitNumber, date, time, diagnosis, comments, height, weight, consultants, surgeryDate
            }
        });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Visit
app.delete('/api/visits/:id', async (req, res) => {
    try {
        const [visit] = await db.select().from(schema.visits).where(eq(schema.visits.id, req.params.id)).limit(1);
        if (visit && await patientAccess(req.user!.id, visit.patientId) !== 'owner') return res.status(403).json({ error: 'Only the owner can delete a visit' });
        const result = await db.delete(schema.visits)
            .where(eq(schema.visits.id, req.params.id))
            .returning({ id: schema.visits.id });

        if (result.length > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Visit not found' });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Add Study (authenticated — stamps owner_user_id on creation)
app.post('/api/studies', authenticate, async (req, res) => {
    const { id, patientId, visitId, modality, source, acquisitionDate, organizationId, name, status } = req.body;
    const ownerUserId = req.user!.id;
    try {
        // Existing study: owner or edit share only, and its workspace/owner never change.
        // New study: only on a patient the caller owns (UI12-10).
        const [existing] = id ? await db.select().from(schema.studies).where(eq(schema.studies.id, id)).limit(1) : [];
        if (existing) {
            if (!canWrite(await studyAccess(ownerUserId, id))) return res.status(403).json({ error: 'You can only view this study' });
            await db.update(schema.studies).set({
                visitId: visitId || null, modality: modality || 'X-Ray', source: source || existing.source,
                acquisitionDate: acquisitionDate || '', name: name ?? null, status: status || 'Draft',
            }).where(eq(schema.studies.id, id));
            return res.json({ success: true });
        }
        if (await patientAccess(ownerUserId, patientId) !== 'owner') return res.status(403).json({ error: 'Studies can only be added to your own patients' });
        console.log(`Saving study: ${id} for patient: ${patientId}, owner: ${ownerUserId}, org: ${organizationId ?? 'personal'}`);
        await db.insert(schema.studies).values({
            id,
            patientId,
            visitId:        visitId        || null,
            modality:       modality       || 'X-Ray',
            source:         source         || 'Import',
            acquisitionDate: acquisitionDate || '',
            name:           name           || null,
            status:         status         || 'Draft',
            organizationId: organizationId || null,
            ownerUserId,
        }).onConflictDoUpdate({
            target: schema.studies.id,
            set: {
                // Never update ownerUserId on conflict — ownership is immutable
                visitId:         visitId        || null,
                modality:        modality       || 'X-Ray',
                source:          source         || 'Import',
                acquisitionDate: acquisitionDate || '',
                name:            name           ?? null,
                status:          status         || 'Draft',
                organizationId:  organizationId || null,
            }
        });
        res.json({ success: true });
    } catch (e: any) {
        console.error("Save study error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ── Deleting studies / patients ─────────────────────────────────────────────
// Only the owner may delete (legacy studies without an owner are deletable by
// any signed-in user of this server). Uploaded files are removed as well.
const removeUploads = async (names: (string | null | undefined)[]) => {
    for (const n of names) {
        if (!n) continue;
        const abs = path.resolve(UPLOADS_DIR, path.basename(n));
        if (abs.startsWith(UPLOADS_DIR + path.sep)) await fs.remove(abs).catch(() => {});
    }
};

app.delete('/api/studies/:id', async (req, res) => {
    const studyId = req.params.id;
    try {
        const [study] = await db.select().from(schema.studies).where(eq(schema.studies.id, studyId)).limit(1);
        if (!study) return res.status(404).json({ error: 'Study not found' });
        if (await studyAccess(req.user!.id, studyId) !== 'owner') {
            return res.status(403).json({ error: 'Only the owner of this study can delete it' });
        }
        const files: string[] = [];
        await db.transaction(async (tx) => {
            const scans = await tx.select().from(schema.scans).where(eq(schema.scans.studyId, studyId));
            const reports = await tx.select().from(schema.reports).where(eq(schema.reports.studyId, studyId));
            files.push(...scans.map((s) => s.filePath), ...reports.map((r) => r.filePath));
            // Sessions that only belong to this study go with it.
            const links = await tx.select().from(schema.contextStudies).where(eq(schema.contextStudies.studyId, studyId));
            for (const l of links) {
                const all = await tx.select().from(schema.contextStudies).where(eq(schema.contextStudies.contextId, l.contextId));
                if (all.every((x) => x.studyId === studyId)) {
                    await tx.delete(schema.contexts).where(eq(schema.contexts.id, l.contextId));
                }
            }
            await tx.delete(schema.studies).where(eq(schema.studies.id, studyId)); // cascades scans, links, reports
        });
        await removeUploads(files);
        res.json({ success: true });
    } catch (e: any) {
        console.error('Delete study error:', e);
        res.status(500).json({ error: 'Failed to delete study' });
    }
});

app.delete('/api/patients/:id', async (req, res) => {
    const patientId = req.params.id;
    try {
        const studies = await db.select().from(schema.studies).where(eq(schema.studies.patientId, patientId));
        const [pRow] = await db.select().from(schema.patients).where(eq(schema.patients.id, patientId)).limit(1);
        if (pRow && pRow.ownerUserId !== req.user!.id) return res.status(403).json({ error: 'Only the owner can delete this patient' });
        if (studies.some((s) => s.ownerUserId && s.ownerUserId !== req.user!.id)) {
            return res.status(403).json({ error: 'This patient has studies owned by other users and cannot be deleted' });
        }
        const files: string[] = [];
        await db.transaction(async (tx) => {
            for (const st of studies) {
                const scans = await tx.select().from(schema.scans).where(eq(schema.scans.studyId, st.id));
                files.push(...scans.map((s) => s.filePath));
            }
            const visits = await tx.select().from(schema.visits).where(eq(schema.visits.patientId, patientId));
            for (const v of visits) {
                const reports = await tx.select().from(schema.reports).where(eq(schema.reports.visitId, v.id));
                files.push(...reports.map((r) => r.filePath));
            }
            await tx.delete(schema.patients).where(eq(schema.patients.id, patientId)); // cascades everything
        });
        await removeUploads(files);
        res.json({ success: true });
    } catch (e: any) {
        console.error('Delete patient error:', e);
        res.status(500).json({ error: 'Failed to delete patient' });
    }
});

// Add Scan (to Study)
app.post('/api/scans', authenticate, upload.single('file'), async (req, res) => {
    const { id, studyId, type, date } = req.body;
    const file = req.file;

    if (!file) {
        console.error("Upload scan failed: No file provided");
        return res.status(400).json({ error: 'No file uploaded' });
    }
    if (!canWrite(await studyAccess(req.user!.id, studyId))) {
        await fs.remove(file.path).catch(() => {});
        return res.status(403).json({ error: 'You can only view this study' });
    }

    try {
        const relativePath = path.basename(file.path);
        console.log(`Saving scan: ${id} for study: ${studyId}, file: ${relativePath}`);

        const baseUrl = `${req.protocol}://${req.get('host')}`;

        await db.insert(schema.scans).values({
            id,
            studyId,
            filePath: relativePath,
            type: type || 'Imported',
            date: date || ''
        }).onConflictDoUpdate({
            target: schema.scans.id,
            set: {
                studyId,
                filePath: relativePath,
                type: type || 'Imported',
                date: date || ''
            }
        });
        res.json({
            success: true,
            imageUrl: toAbsoluteUrl(relativePath, baseUrl)
        });
    } catch (err: any) {
        console.error("Save scan error:", err);
        await fs.remove(file.path).catch(() => {});
        res.status(500).json({ error: err.message });
    }
});

// --- Contexts ---
app.get('/api/contexts/:patientId', async (req, res) => {
    try {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const dbContexts = await db.query.contexts.findMany({
            where: eq(schema.contexts.patientId, req.params.patientId),
            with: {
                studies: true,
                measurements: true,
                implants: true
            }
        });

        // Only sessions of studies the caller can see; each says how (UI12-10)
        const access = await contextsAccess(req.user!.id, dbContexts.map((c) => c.id));
        const hydrated = dbContexts.filter((c) => access.has(c.id)).map(c => ({
            id: c.id,
            access: access.get(c.id),
            patientId: c.patientId,
            visitId: c.visitId,
            studyIds: c.studies.map(s => s.studyId),
            mode: c.mode,
            name: c.name,
            lastModified: c.lastModified,
            currentImage: toClientImageUrl(c.currentImage ?? null, baseUrl),
            measurements: c.measurements.map(m => {
                const { __selected, ...meta } = JSON.parse(m.metadata || '{}');
                return {
                    ...m,
                    points: JSON.parse(m.points || '[]'),
                    result: JSON.parse(m.result || 'null'),
                    measurement: meta,
                    selected: __selected !== false,
                };
            }),
            implants: c.implants.map(i => ({
                ...i,
                position: JSON.parse(i.position || 'null'),
                properties: JSON.parse(i.properties || '{}')
            })),
            annotations: JSON.parse(c.annotations || '[]'),
            toolState: JSON.parse(c.toolState || '{}')
        }));
        res.json(hydrated);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/contexts', async (req, res) => {
    const { id, patientId, visitId, studyIds, mode, name, lastModified, state } = req.body;
    try {
        if (!id || !patientId) {
            console.error('[POST /api/contexts] Missing id or patientId — rejecting');
            res.status(400).json({ error: 'Missing id or patientId' });
            return;
        }

        // Writes: owner or edit share, on the existing session AND every study it links to (UI12-10)
        const callerId = req.user!.id;
        const [existingCtx] = await db.select({ id: schema.contexts.id, patientId: schema.contexts.patientId }).from(schema.contexts).where(eq(schema.contexts.id, id)).limit(1);
        if (existingCtx && (existingCtx.patientId !== patientId || !canWrite(await contextAccess(callerId, id)))) {
            res.status(403).json({ error: 'You can only view this session' });
            return;
        }
        const linkIds: string[] = (studyIds || []).filter((sid: string) => sid);
        for (const sid of linkIds) {
            if (!canWrite(await studyAccess(callerId, sid))) { res.status(403).json({ error: 'You can only view this study' }); return; }
        }
        if (!existingCtx && linkIds.length === 0 && await patientAccess(callerId, patientId) !== 'owner') {
            res.status(403).json({ error: 'You can only view this patient' });
            return;
        }

        await db.transaction(async (tx) => {
            // Serialize concurrent saves of the same context (BUGS SRV-14).
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${String(id)}))`);
            const vId = visitId === "" ? null : visitId;
            const validStudyIds = (studyIds || []).filter((sid: string) => sid && sid !== "");

            // An ephemeral (blob:) image is never written; on update the
            // previously stored image is kept instead.
            const ephemeralImage = isEphemeralUrl(state?.currentImage);
            if (ephemeralImage) {
                console.warn(`[POST /api/contexts] id=${id} ignoring non-persistent currentImage`);
            }
            const currentImage = ephemeralImage ? null : toStoredImageRef(state?.currentImage);

            // 1. Upsert Context
            await tx.insert(schema.contexts).values({
                id,
                patientId,
                visitId: vId,
                mode,
                name: name || '',
                lastModified: lastModified || new Date().toISOString(),
                annotations: JSON.stringify(state?.annotations || []),
                toolState: JSON.stringify(state?.toolState || {}),
                currentImage,
            }).onConflictDoUpdate({
                target: schema.contexts.id,
                set: {
                    visitId: vId,
                    mode,
                    name: name || '',
                    lastModified: lastModified || new Date().toISOString(),
                    annotations: JSON.stringify(state?.annotations || []),
                    toolState: JSON.stringify(state?.toolState || {}),
                    ...(ephemeralImage ? {} : { currentImage }),
                }
            });

            // 2. Sync Study Links
            await tx.delete(schema.contextStudies).where(eq(schema.contextStudies.contextId, id));
            if (validStudyIds.length > 0) {
                await tx.insert(schema.contextStudies).values(
                    validStudyIds.map((sid: string) => ({ contextId: id, studyId: sid }))
                );
            }

            // 3. Sync Normalized State (Measurements & Implants)
            if (state) {
                await tx.delete(schema.measurements).where(eq(schema.measurements.contextId, id));
                if (state.measurements && state.measurements.length > 0) {
                    await tx.insert(schema.measurements).values(
                        state.measurements.map((m: any) => ({
                            id: m.id || `${id}-m-${Date.now()}-${Math.random()}`,
                            contextId: id,
                            toolKey: m.toolKey,
                            fragmentId: m.fragmentId,
                            points: JSON.stringify(m.points || []),
                            result: JSON.stringify(m.result || null),
                            // `selected` (report inclusion) lives in metadata (BUGS WS-25)
                            metadata: JSON.stringify({ ...(m.measurement || {}), __selected: m.selected !== false }),
                            timestamp: m.timestamp || Date.now()
                        }))
                    );
                }

                await tx.delete(schema.implants).where(eq(schema.implants.contextId, id));
                if (state.implants && state.implants.length > 0) {
                    await tx.insert(schema.implants).values(
                        state.implants.map((i: any) => ({
                            id: i.id || `${id}-i-${Date.now()}-${Math.random()}`,
                            contextId: id,
                            type: i.type,
                            fragmentId: i.fragmentId,
                            position: JSON.stringify(i.position || null),
                            angle: i.angle || 0,
                            properties: JSON.stringify(i.properties || {}),
                            timestamp: i.timestamp || Date.now()
                        }))
                    );
                }
            }
        });

        res.json({ success: true });
    } catch (err: any) {
        console.error("Critical error in saveContext:", err);
        res.status(500).json({ error: 'Failed to save context' });
    }
});

// --- Reports ---

app.post('/api/reports', upload.single('file'), async (req, res) => {
    const { id, visitId, studyId, title } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!visitId) {
        await fs.remove(file.path).catch(() => {});
        return res.status(400).json({ error: 'visitId is required' });
    }
    {
        const [visit] = await db.select().from(schema.visits).where(eq(schema.visits.id, visitId)).limit(1);
        const allowed = studyId ? canWrite(await studyAccess(req.user!.id, studyId))
            : !!visit && canWrite(await patientAccess(req.user!.id, visit.patientId));
        if (!allowed) {
            await fs.remove(file.path).catch(() => {});
            return res.status(403).json({ error: 'You can only view this study' });
        }
    }

    try {
        // Version = max+1 computed under a per-study lock so concurrent exports
        // can't produce duplicate versions (BUGS RPT-09 / SRV-21).
        const version = await db.transaction(async (tx) => {
            const lockKey = String(studyId || visitId);
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
            let next = 1;
            if (studyId) {
                const [row] = await tx.select({ v: sql<number>`coalesce(max(${schema.reports.version}), 0)` })
                    .from(schema.reports)
                    .where(eq(schema.reports.studyId, studyId));
                next = Number(row?.v ?? 0) + 1;
            }
            await tx.insert(schema.reports).values({
                id: id || `rep-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
                visitId,
                studyId: studyId || null,
                version: next,
                filePath: path.basename(file.path),
                title,
                createdAt: new Date().toISOString(),
            });
            return next;
        });
        res.json({ success: true, version });
    } catch (e: any) {
        console.error("Save report error:", e);
        await fs.remove(file.path).catch(() => {});
        res.status(500).json({ error: 'Failed to save report' });
    }
});

app.get('/api/reports/:visitId', async (req, res) => {
    try {
        const [visit] = await db.select().from(schema.visits).where(eq(schema.visits.id, req.params.visitId)).limit(1);
        if (!visit || !(await patientAccess(req.user!.id, visit.patientId))) return res.json([]);
        const reports = await db.query.reports.findMany({
            where: eq(schema.reports.visitId, req.params.visitId)
        });
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const mapped = reports.map(r => ({
            ...r,
            url: toAbsoluteUrl(r.filePath, baseUrl)
        }));
        res.json(mapped);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/reports/study/:studyId', async (req, res) => {
    try {
        if (!(await studyAccess(req.user!.id, req.params.studyId))) return res.json([]);
        const reports = await db.query.reports.findMany({
            where: eq(schema.reports.studyId, req.params.studyId),
            orderBy: (reports, { desc }) => [desc(reports.version)]
        });
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const mapped = reports.map(r => ({
            ...r,
            url: toAbsoluteUrl(r.filePath, baseUrl)
        }));
        res.json(mapped);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Local File Proxy
app.get('/api/local-file', (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).send('No path provided');

    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(UPLOADS_DIR, filePath);

    if (!resolvedPath.startsWith(UPLOADS_DIR)) {
        console.warn(`Blocked access to potentially unsafe path: ${resolvedPath}`);
        return res.status(403).send('Access denied');
    }

    if (!fs.existsSync(resolvedPath)) {
        return res.status(404).send('File not found');
    }
    res.sendFile(resolvedPath);
});

// Import Folder
// Reads a folder ON THE SERVER — only for single-machine/desktop installs.
// Disabled unless ALLOW_SERVER_FOLDER_IMPORT=true, and confined to
// IMPORT_ROOT when set (BUGS SRV-05).
app.post('/api/import', async (req, res) => {
    const { folderPath, patientId: targetPatientId, visitId } = req.body;
    if (process.env.ALLOW_SERVER_FOLDER_IMPORT !== 'true') {
        return res.status(403).json({ error: 'Server folder import is disabled on this server' });
    }
    const importRoot = process.env.IMPORT_ROOT ? path.resolve(process.env.IMPORT_ROOT) : null;
    if (importRoot && folderPath) {
        const rel = path.relative(importRoot, path.resolve(folderPath));
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
            return res.status(403).json({ error: 'Folder is outside the allowed import root' });
        }
    }
    if (!folderPath || !fs.existsSync(folderPath)) {
        return res.status(400).json({ error: 'Invalid folder path' });
    }

    try {
        let importedCount = 0;

        await db.transaction(async (tx) => {
            const walk = async (dir: string) => {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const fullPath = path.join(dir, file);
                    const stat = fs.statSync(fullPath);

                    if (stat.isDirectory()) {
                        await walk(fullPath);
                    } else {
                        const buffer = Buffer.alloc(1024);
                        const fd = fs.openSync(fullPath, 'r');
                        fs.readSync(fd, buffer, 0, 1024, 0);
                        fs.closeSync(fd);

                        const isDicom = buffer.length >= 132 && buffer.toString('utf8', 128, 132) === 'DICM';
                        const isImage = /\.(jpg|jpeg|png|webp|bmp)$/i.test(file);

                        if (isDicom || isImage) {
                            const relPath = path.relative(folderPath, fullPath);
                            const parts = relPath.split(path.sep);

                            let patientId = targetPatientId;
                            let patientName = '';
                            let visitDate = parts.length > 2 ? parts[1] : 'Initial Import';

                            if (!patientId && parts.length >= 2) {
                                patientName = parts[0];
                                patientId = patientName.replace(/\s+/g, '-').toLowerCase();
                                await tx.insert(schema.patients).values({
                                    id: patientId,
                                    name: patientName,
                                    lastVisit: new Date().toISOString().split('T')[0]
                                }).onConflictDoNothing();
                            }

                            if (!patientId) continue;

                            // Detect Modality if DICOM
                            let modality = isDicom ? 'CT' : 'X-Ray';
                            if (isDicom) {
                                const modalityIndex = buffer.indexOf(Buffer.from([0x08, 0x00, 0x60, 0x00]));
                                if (modalityIndex !== -1 && modalityIndex + 10 < buffer.length) {
                                    const valueLength = buffer.readUInt16LE(modalityIndex + 6);
                                    if (valueLength > 0 && valueLength < 16) {
                                        const mod = buffer.toString('utf8', modalityIndex + 8, modalityIndex + 8 + valueLength).trim();
                                        if (mod) modality = mod;
                                    }
                                }
                            }

                            const studyId = `${patientId}-study-${visitDate.replace(/[^a-zA-Z0-9]/g, '-')}`;
                            await tx.insert(schema.studies).values({
                                id: studyId,
                                patientId,
                                visitId: visitId || null,
                                modality,
                                source: 'Import',
                                acquisitionDate: visitDate,
                                ownerUserId: req.user!.id, // never "visible to all" (SRV-03)
                            }).onConflictDoNothing();

                            let ext = path.extname(file);
                            if (isDicom && !ext) ext = '.dcm';
                            const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
                            const destPath = path.join(UPLOADS_DIR, uniqueName);
                            fs.copySync(fullPath, destPath);

                            const scanId = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
                            await tx.insert(schema.scans).values({
                                id: scanId,
                                studyId,
                                filePath: uniqueName,
                                type: 'Imported',
                                date: new Date().toISOString().split('T')[0]
                            });

                            importedCount++;
                        }
                    }
                }
            };
            await walk(folderPath);
        });

        res.json({ success: true, count: importedCount });
    } catch (err: any) {
        console.error("Import error:", err);
        res.status(500).json({ error: err.message });
    }
});

// --- PACS Integration ---

app.post('/api/pacs/search', async (req, res) => {
    const { config, query } = req.body;
    try {
        const results = await pacsService.searchPACS(config, query);
        res.json(results);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/pacs/import', async (req, res) => {
    const { config, studyInstanceUID, patientId, visitId } = req.body;
    try {
        const result = await pacsService.importPACSStudy(config, studyInstanceUID, patientId, visitId, req.user!.id);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// --- Study sharing (UI12-10) ---
// The owner shares a study with another user by their login email, with view
// or edit rights. The recipient sees it under "Shared studies"; removing it
// there only deletes the share — the owner's study is untouched.

const shareView = async (studyId: string) => {
    const rows = await db.select({
        id: schema.studyShares.id, permission: schema.studyShares.permission, createdAt: schema.studyShares.createdAt,
        userId: schema.users.id, email: schema.users.email, fullName: schema.users.fullName,
    }).from(schema.studyShares)
        .innerJoin(schema.users, eq(schema.studyShares.sharedWith, schema.users.id))
        .where(eq(schema.studyShares.studyId, studyId));
    return rows;
};

app.get('/api/studies/:id/shares', async (req, res) => {
    try {
        if (await studyAccess(req.user!.id, req.params.id) !== 'owner') return res.status(403).json({ error: 'Only the owner can see who a study is shared with' });
        res.json(await shareView(req.params.id));
    } catch (e) {
        console.error('[shares/list]', e);
        res.status(500).json({ error: 'Failed to load shares' });
    }
});

app.post('/api/studies/:id/shares', async (req, res) => {
    const studyId = req.params.id;
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const permission = req.body?.permission === 'edit' ? 'edit' : 'view';
    try {
        if (await studyAccess(req.user!.id, studyId) !== 'owner') return res.status(403).json({ error: 'Only the owner can share this study' });
        if (!email) return res.status(400).json({ error: 'Enter the username (login email) of the person' });
        const [target] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
        if (!target || !target.isActive) return res.status(404).json({ error: `No SpineSurge user "${email}"` });
        if (target.id === req.user!.id) return res.status(400).json({ error: 'This is your own study' });
        await db.insert(schema.studyShares).values({ studyId, sharedBy: req.user!.id, sharedWith: target.id, permission })
            .onConflictDoUpdate({ target: [schema.studyShares.studyId, schema.studyShares.sharedWith], set: { permission } });
        res.json(await shareView(studyId));
    } catch (e) {
        console.error('[shares/add]', e);
        res.status(500).json({ error: 'Failed to share study' });
    }
});

app.delete('/api/studies/:id/shares/:shareId', async (req, res) => {
    try {
        if (await studyAccess(req.user!.id, req.params.id) !== 'owner') return res.status(403).json({ error: 'Only the owner can stop sharing' });
        await db.delete(schema.studyShares).where(and(eq(schema.studyShares.id, req.params.shareId), eq(schema.studyShares.studyId, req.params.id)));
        res.json(await shareView(req.params.id));
    } catch (e) {
        console.error('[shares/remove]', e);
        res.status(500).json({ error: 'Failed to stop sharing' });
    }
});

// Recipient removes a shared study from their own list
app.delete('/api/shared/:studyId', async (req, res) => {
    try {
        await db.delete(schema.studyShares).where(and(eq(schema.studyShares.studyId, req.params.studyId), eq(schema.studyShares.sharedWith, req.user!.id)));
        res.json({ success: true });
    } catch (e) {
        console.error('[shared/remove]', e);
        res.status(500).json({ error: 'Failed to remove' });
    }
});

// People to suggest in the share dialog: members of the caller's organizations
app.get('/api/share-candidates', async (req, res) => {
    try {
        const myOrgs = await db.select({ orgId: schema.organizationMemberships.orgId }).from(schema.organizationMemberships)
            .where(and(eq(schema.organizationMemberships.userId, req.user!.id), eq(schema.organizationMemberships.status, 'active')));
        const orgIds = myOrgs.map((o) => o.orgId);
        if (!orgIds.length) return res.json([]);
        const rows = await db.selectDistinct({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName })
            .from(schema.organizationMemberships)
            .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
            .where(and(inArray(schema.organizationMemberships.orgId, orgIds), eq(schema.organizationMemberships.status, 'active')));
        res.json(rows.filter((u) => u.id !== req.user!.id));
    } catch (e) {
        console.error('[share-candidates]', e);
        res.status(500).json({ error: 'Failed to load members' });
    }
});

app.use('/auth', authRouter);
app.use('/orgs', orgsRouter);
app.use('/invitations', invitationsRouter);

// Final error handler: generic message to the client, details in the log
// (BUGS SRV-19). Multer limit/filter errors become 400s.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof multer.MulterError || /File type not allowed/.test(err?.message ?? '')) {
        res.status(400).json({ error: err.message });
        return;
    }
    if (err?.type === 'entity.too.large') {
        res.status(413).json({ error: 'Request too large' });
        return;
    }
    console.error('[unhandled]', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Health check for the hosting platform
app.get('/healthz', (_req, res) => { res.json({ ok: true }); });

// ── Hosted demo / production: serve the built web app from this server ─────
// SERVE_CLIENT=true (set in Dockerfile) → same-origin app + API, no CORS setup.
if (process.env.SERVE_CLIENT === 'true') {
    const CLIENT_DIR = path.resolve(process.env.CLIENT_DIR || path.join(__dirname, '..', 'dist'));
    app.use(express.static(CLIENT_DIR, {
        index: false,
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
        },
    }));
    // HashRouter: every non-API path returns the app shell.
    app.get(/^(?!\/(api|auth|orgs|invitations|uploads|healthz)\b).*/, (_req, res) => {
        // Same isolation headers as the Vite dev server (cornerstone workers).
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.sendFile(path.join(CLIENT_DIR, 'index.html'));
    });
}

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`WebSocket server ready at ws://localhost:${port}`);
});
