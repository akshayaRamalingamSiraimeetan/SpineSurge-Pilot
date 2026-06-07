import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs-extra';

const dbPath = path.resolve(__dirname, 'data', 'spinesurge.db');

// Ensure the data directory exists
fs.ensureDirSync(path.dirname(dbPath));

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export default db;

// Export the underlying sqlite instance for manual operations if needed
export { sqlite };

// Auto-migrate: create tables if they don't exist
try {
    const migrationsFolder = path.resolve(__dirname, 'drizzle');
    migrate(db, { migrationsFolder });
    console.log('[DB] Migrations applied successfully.');
} catch (e) {
    console.warn('[DB] Migration warning (may be already applied):', e);
}
