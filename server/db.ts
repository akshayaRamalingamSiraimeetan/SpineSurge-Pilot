import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set (see .env.example)');
}

// Hosted Postgres (Neon, Render, Railway, Supabase) requires TLS; local doesn't.
// DATABASE_SSL=true forces it, =false disables it; default: on unless localhost.
const sslFlag = process.env.DATABASE_SSL;
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL);
const useSsl = sslFlag ? sslFlag === 'true' : !isLocalDb;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
});

export const db = drizzle(pool, { schema });
export default db;
