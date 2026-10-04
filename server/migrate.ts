/**
 * Applies all SQL migrations in order and records them in `schema_migrations`.
 *
 *   npm run db:migrate
 *
 * Order: the Drizzle baseline files in server/drizzle/, then the numbered
 * hand-written files in server/migrations/.
 *
 * Databases created before this runner existed have no `schema_migrations`
 * table. For those, the non-idempotent baseline (0000) is recorded as applied
 * without running it; every later file is idempotent and is replayed.
 */
import 'dotenv/config';
import { pgSsl } from './config';
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

const SERVER_DIR = __dirname;

const BASELINE = '0000_mixed_moonstone.sql';

function listMigrations(): { name: string; file: string }[] {
    const drizzleDir = path.join(SERVER_DIR, 'drizzle');
    const migrationsDir = path.join(SERVER_DIR, 'migrations');
    const fromDir = (dir: string) =>
        fs.readdirSync(dir)
            .filter(f => /^\d+_.*\.sql$/.test(f))
            .sort()
            .map(f => ({ name: f, file: path.join(dir, f) }));
    return [...fromDir(drizzleDir), ...fromDir(migrationsDir)];
}

async function main() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is not set');
    }

    // Same TLS rule as the app (config.ts) — a TLS-only host used to fail here and block startup
    const client = new Client({ connectionString, ssl: pgSsl(connectionString) });
    await client.connect();

    try {
        const { rows: [{ exists: trackingExists }] } = await client.query(
            `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`
        );
        const { rows: [{ exists: legacyDb }] } = await client.query(
            `SELECT to_regclass('public.patients') IS NOT NULL AS exists`
        );

        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name       TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        if (!trackingExists && legacyDb) {
            console.log(`Existing database detected: recording ${BASELINE} as already applied.`);
            await client.query(
                `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`,
                [BASELINE]
            );
        }

        const { rows } = await client.query<{ name: string }>(`SELECT name FROM schema_migrations`);
        const applied = new Set(rows.map(r => r.name));

        let count = 0;
        for (const m of listMigrations()) {
            if (applied.has(m.name)) continue;
            console.log(`Applying ${m.name} ...`);
            const sql = fs.readFileSync(m.file, 'utf8').replace(/--> statement-breakpoint/g, '');
            // Files manage their own BEGIN/COMMIT; run each as one multi-statement query.
            await client.query(sql);
            await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [m.name]);
            count++;
        }

        console.log(count === 0 ? 'Database is up to date.' : `Applied ${count} migration(s).`);
    } finally {
        await client.end();
    }
}

main().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
