import path from 'path';
import fs from 'fs-extra';
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { UPLOADS_DIR } from './config';

/**
 * Where uploaded files live (DEPLOY-07).
 *   disk — UPLOADS_DIR (local / a persistent volume)
 *   s3   — any S3-compatible bucket, e.g. Supabase Storage (free 1 GB):
 *          S3_ENDPOINT=https://<project>.supabase.co/storage/v1/s3  S3_REGION=<project region>
 *          S3_BUCKET=uploads  S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY (Storage → S3 access keys)
 * Free hosts wipe their disk on every restart, so they must use s3.
 * Multer still writes to UPLOADS_DIR first; persistUpload() then moves the file.
 * URLs stay /uploads/<name> either way (the guard in media.ts runs first).
 */
const bucket = process.env.S3_BUCKET;
export const useS3 = !!(bucket && process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);

const s3 = useS3 ? new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! },
}) : null;
console.log(useS3 ? `[storage] uploads → S3 bucket "${bucket}"` : `[storage] uploads → disk ${UPLOADS_DIR}`);

const TYPES: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.gif': 'image/gif', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.pdf': 'application/pdf', '.dcm': 'application/dicom',
};
// Only inert media types are ever shown inline; anything else downloads (BUGS SRV-07).
const INLINE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.pdf']);
const safeHeaders = (res: Response, name: string) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (!INLINE_EXTS.has(path.extname(name).toLowerCase())) res.setHeader('Content-Disposition', 'attachment');
};

/** After multer (or any writer) put a file in UPLOADS_DIR: move it to the bucket when S3 is used. */
export async function persistUpload(localPath: string): Promise<void> {
    if (!s3) return;
    const name = path.basename(localPath);
    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: name,
        Body: await fs.readFile(localPath),
        ContentType: TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream',
    }));
    await fs.remove(localPath).catch(() => {});
}

/** Write a buffer as an upload (PACS import etc.). */
export async function storeBuffer(name: string, data: Buffer): Promise<void> {
    const local = path.join(UPLOADS_DIR, name);
    await fs.writeFile(local, data);
    await persistUpload(local);
}

export async function removeStored(name: string): Promise<void> {
    const base = path.basename(name);
    if (s3) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: base })).catch(() => {});
        return;
    }
    const abs = path.resolve(UPLOADS_DIR, base);
    if (abs.startsWith(UPLOADS_DIR + path.sep)) await fs.remove(abs).catch(() => {});
}

const staticDisk = express.static(UPLOADS_DIR, { setHeaders: (res, filePath) => safeHeaders(res as Response, filePath) });

/** GET /uploads/<name> (after the access guard). */
export async function serveStored(req: Request, res: Response, next: NextFunction) {
    if (!s3) return staticDisk(req, res, next);
    const name = decodeURIComponent(req.path.replace(/^\//, ''));
    if (!name || name.includes('/')) { res.status(404).end(); return; }
    try {
        const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: name }));
        safeHeaders(res, name);
        res.setHeader('Content-Type', obj.ContentType ?? TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream');
        if (obj.ContentLength != null) res.setHeader('Content-Length', String(obj.ContentLength));
        const body = obj.Body as NodeJS.ReadableStream | undefined;
        if (!body) { res.status(404).end(); return; }
        body.on('error', () => res.destroy());
        body.pipe(res);
    } catch (e) {
        const code = (e as { name?: string; $metadata?: { httpStatusCode?: number } });
        if (code.name === 'NoSuchKey' || code.$metadata?.httpStatusCode === 404) { res.status(404).send('Not found'); return; }
        console.error('[storage] read failed', name, e);
        res.status(502).send('Storage error');
    }
}
