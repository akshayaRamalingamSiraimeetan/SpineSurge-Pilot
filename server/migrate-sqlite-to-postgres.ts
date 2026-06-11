/**
 * One-time migration script: SQLite → PostgreSQL
 *
 * Reads all data from ./data/spinesurge.db and inserts it into the
 * PostgreSQL database configured via DATABASE_URL.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register server/migrate-sqlite-to-postgres.ts
 */

import 'dotenv/config';
import BetterSqlite3 from 'better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import path from 'path';

const SQLITE_PATH = path.resolve(__dirname, 'data', 'spinesurge.db');
const PG_URL = process.env.DATABASE_URL || 'postgresql://postgres:nyx@localhost:5432/spinesurge';

// Migration order respects foreign key dependencies
const TABLE_ORDER = [
    'patients',
    'visits',
    'studies',
    'scans',
    'contexts',
    'context_studies',
    'measurements',
    'implants',
    'reports',
] as const;

async function main() {
    console.log(`[migrate] Opening SQLite: ${SQLITE_PATH}`);
    const sqlite = new BetterSqlite3(SQLITE_PATH, { readonly: true });

    console.log(`[migrate] Connecting to PostgreSQL: ${PG_URL}`);
    const pool = new Pool({ connectionString: PG_URL });
    const pg = drizzlePg(pool, { schema });

    for (const table of TABLE_ORDER) {
        const rows = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, any>[];
        if (rows.length === 0) {
            console.log(`[migrate] ${table}: 0 rows — skipping`);
            continue;
        }

        console.log(`[migrate] ${table}: ${rows.length} rows`);

        // Map SQLite integer booleans to JS booleans for patients table
        const mapped = rows.map(row => {
            const out: Record<string, any> = { ...row };
            if (table === 'patients') {
                out.has_alert = !!row.has_alert;
                out.is_archived = !!row.is_archived;
            }
            return out;
        });

        // Insert in batches of 500 to avoid hitting parameter limits
        const BATCH = 500;
        for (let i = 0; i < mapped.length; i += BATCH) {
            const batch = mapped.slice(i, i + BATCH);
            const pgTable = (schema as any)[snakeToCamel(table)];

            if (!pgTable) {
                console.warn(`[migrate] No Drizzle table found for "${table}" — skipping`);
                continue;
            }

            // Build raw SQL for upsert to avoid column mapping issues between
            // Drizzle camelCase and SQLite snake_case column names.
            const columns = Object.keys(batch[0]);
            const colList = columns.map(c => `"${c}"`).join(', ');
            const conflictCol = table === 'context_studies' ? 'context_id, study_id' : 'id';

            const placeholders = batch.map((_, rowIdx) =>
                `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(', ')})`
            ).join(', ');

            const values = batch.flatMap(row => columns.map(c => row[c] ?? null));

            const queryText = `
                INSERT INTO ${table} (${colList})
                VALUES ${placeholders}
                ON CONFLICT (${conflictCol}) DO NOTHING
            `;

            await pool.query(queryText, values);
            console.log(`[migrate]   inserted batch ${i / BATCH + 1} (${batch.length} rows)`);
        }
    }

    sqlite.close();
    await pool.end();
    console.log('[migrate] Done.');
}

/** Converts snake_case table name to camelCase schema export name */
function snakeToCamel(s: string): string {
    return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

main().catch(err => {
    console.error('[migrate] Fatal error:', err);
    process.exit(1);
});
