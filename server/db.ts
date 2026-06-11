import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:nyx@localhost:5432/spinesurge',
});

export const db = drizzle(pool, { schema });
export default db;
