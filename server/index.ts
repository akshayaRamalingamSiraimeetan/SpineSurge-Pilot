import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { db } from './db';
import * as schema from './schema';
import { eq, and } from 'drizzle-orm';
import * as pacsService from './pacsService';
import http from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from './y-websocket';
import { authRouter } from './routes/auth';
import { orgsRouter } from './routes/orgs';



const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
    setupWSConnection(ws, req);
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;

app.use(cors());
app.use(express.json());

// Log middleware & Security Headers
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');

    next();
});

// Setup uploads directory
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
fs.ensureDirSync(UPLOADS_DIR);
app.use('/uploads', express.static(UPLOADS_DIR));

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${uniqueSuffix}${ext}`);
    }
});
const upload = multer({ storage });

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

// --- API Routes ---

// Get all patients
app.get('/api/patients', async (req, res) => {
    try {
        console.log("Fetching all patients (optimized)...");
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        const patientsData = await db.query.patients.findMany({
            with: {
                visits: {
                    orderBy: (v, { desc }) => [desc(v.date)],
                    with: {
                        studies: {
                            with: {
                                scans: true
                            }
                        },
                        reports: true
                    }
                },
                studies: {
                    with: {
                        scans: true
                    }
                }
            }
        });

        const formattedPatients = patientsData.map(p => {
            const studies = p.studies.map(s => ({
                ...s,
                patientId: s.patientId,
                visitId: s.visitId,
                modality: s.modality || 'X-Ray',
                source: s.source || 'Import',
                acquisitionDate: s.acquisitionDate || '',
                scans: s.scans.map(sc => ({
                    id: sc.id,
                    studyId: sc.studyId,
                    imageUrl: toAbsoluteUrl(sc.filePath, baseUrl),
                    type: sc.type || 'Imported',
                    date: sc.date || ''
                }))
            }));

            const visits = p.visits.map((v, idx) => {
                const isLatestVisit = idx === 0;
                const visitStudies = studies.filter(s => s.visitId === v.id || (isLatestVisit && !s.visitId));

                return {
                    ...v,
                    visitNumber: v.visitNumber || '0000',
                    date: v.date || '',
                    time: v.time || '',
                    diagnosis: v.diagnosis || '',
                    comments: v.comments || '',
                    height: v.height || '',
                    weight: v.weight || '',
                    consultants: v.consultants || '',
                    surgeryDate: v.surgeryDate || '',
                    studies: visitStudies,
                    scans: visitStudies.flatMap(s => s.scans || [])
                };
            });

            if (p.studies?.[0]?.scans?.[0]) {
                const testScan = p.studies[0].scans[0];
                console.log(`[DEBUG] Patient: ${p.name}, Study: ${p.studies[0].id}, Scan: ${testScan.id}, File: ${testScan.filePath}, URL: ${toAbsoluteUrl(testScan.filePath, baseUrl)}`);
            }

            return {
                ...p,
                gender: normalizeGender(p.gender),
                lastVisit: p.lastVisit || '',
                hasAlert: !!p.hasAlert,
                isArchived: !!p.isArchived,
                visits,
                studies
            };
        });

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
        await db.insert(schema.patients).values({
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

// Add Study
app.post('/api/studies', async (req, res) => {
    const { id, patientId, visitId, modality, source, acquisitionDate } = req.body;
    try {
        console.log(`Saving study: ${id} for patient: ${patientId}, visit: ${visitId}`);
        await db.insert(schema.studies).values({
            id,
            patientId,
            visitId: visitId || null,
            modality: modality || 'X-Ray',
            source: source || 'Import',
            acquisitionDate: acquisitionDate || ''
        }).onConflictDoUpdate({
            target: schema.studies.id,
            set: {
                visitId: visitId || null,
                modality: modality || 'X-Ray',
                source: source || 'Import',
                acquisitionDate: acquisitionDate || ''
            }
        });
        res.json({ success: true });
    } catch (e: any) {
        console.error("Save study error:", e);
        res.status(500).json({ error: e.message });
    }
});

// Add Scan (to Study)
app.post('/api/scans', upload.single('file'), async (req, res) => {
    const { id, studyId, type, date } = req.body;
    const file = req.file;

    if (!file) {
        console.error("Upload scan failed: No file provided");
        return res.status(400).json({ error: 'No file uploaded' });
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
        res.status(500).json({ error: err.message });
    }
});

// --- Contexts ---
app.get('/api/contexts/:patientId', async (req, res) => {
    try {
        const dbContexts = await db.query.contexts.findMany({
            where: eq(schema.contexts.patientId, req.params.patientId),
            with: {
                studies: true,
                measurements: true,
                implants: true
            }
        });

        const hydrated = dbContexts.map(c => ({
            id: c.id,
            patientId: c.patientId,
            visitId: c.visitId,
            studyIds: c.studies.map(s => s.studyId),
            mode: c.mode,
            name: c.name,
            lastModified: c.lastModified,
            measurements: c.measurements.map(m => ({
                ...m,
                points: JSON.parse(m.points || '[]'),
                result: JSON.parse(m.result || 'null'),
                measurement: JSON.parse(m.metadata || '{}')
            })),
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
        console.log(`[POST /api/contexts] Saving context: ${id}, patient: ${patientId}, studies: ${studyIds?.length || 0}`);

        await db.transaction(async (tx) => {
            const vId = visitId === "" ? null : visitId;
            const validStudyIds = (studyIds || []).filter((sid: string) => sid && sid !== "");

            // 1. Upsert Context
            console.log("  Step 1: Upserting context...");
            await tx.insert(schema.contexts).values({
                id,
                patientId,
                visitId: vId,
                mode,
                name: name || '',
                lastModified: lastModified || new Date().toISOString(),
                annotations: JSON.stringify(state?.annotations || []),
                toolState: JSON.stringify(state?.toolState || {})
            }).onConflictDoUpdate({
                target: schema.contexts.id,
                set: {
                    visitId: vId,
                    mode,
                    name: name || '',
                    lastModified: lastModified || new Date().toISOString(),
                    annotations: JSON.stringify(state?.annotations || []),
                    toolState: JSON.stringify(state?.toolState || {})
                }
            });

            // 2. Sync Study Links
            console.log("  Step 2: Syncing study links...");
            await tx.delete(schema.contextStudies).where(eq(schema.contextStudies.contextId, id));
            if (validStudyIds.length > 0) {
                await tx.insert(schema.contextStudies).values(
                    validStudyIds.map((sid: string) => ({ contextId: id, studyId: sid }))
                );
            }
            console.log("  Step 2: Study links sync complete.");

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
                            metadata: JSON.stringify(m.measurement || {}),
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
        res.status(500).json({
            error: err.message,
            stack: err.stack,
            detail: err.toString()
        });
    }
});

// --- Reports ---

app.post('/api/reports', upload.single('file'), async (req, res) => {
    const { id, visitId, title } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    try {
        const relativePath = path.basename(file.path);
        await db.insert(schema.reports).values({
            id, visitId, filePath: relativePath, title, createdAt: new Date().toISOString().split('T')[0]
        });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/reports/:visitId', async (req, res) => {
    try {
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
app.post('/api/import', async (req, res) => {
    const { folderPath, patientId: targetPatientId, visitId } = req.body;
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
                                acquisitionDate: visitDate
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
        const result = await pacsService.importPACSStudy(config, studyInstanceUID, patientId, visitId);
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.use('/auth', authRouter);
app.use('/orgs', orgsRouter);

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`WebSocket server ready at ws://localhost:${port}`);
});
