import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { pgSsl } from './config';

if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set (see .env.example)');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: pgSsl(process.env.DATABASE_URL),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
});

export const db = drizzle(pool, { schema });
export default db;
