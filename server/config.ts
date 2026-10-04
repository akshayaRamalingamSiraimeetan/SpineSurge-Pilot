import path from 'path';

/**
 * Shared server settings (UI11-14): every module uses the same uploads folder
 * and the same Postgres TLS rule — the app, the migrator and the scripts used
 * to disagree, which broke hosted deploys.
 */

/** UPLOADS_DIR env = persistent disk mount in hosting (e.g. /data/uploads). */
export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, 'uploads'));

/**
 * Hosted Postgres (Neon, Render, Railway, Supabase) requires TLS; local doesn't.
 * DATABASE_SSL=true forces it, =false disables it; default: on unless localhost.
 */
export function pgSsl(connectionString: string | undefined) {
    const flag = process.env.DATABASE_SSL;
    const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString ?? '');
    const useSsl = flag ? flag === 'true' : !isLocal;
    return useSsl ? { rejectUnauthorized: false } : undefined;
}
