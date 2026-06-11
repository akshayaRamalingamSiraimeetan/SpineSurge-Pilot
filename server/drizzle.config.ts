import 'dotenv/config';
import type { Config } from 'drizzle-kit';

export default {
    schema: './server/schema.ts',
    out: './server/drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL || 'postgresql://postgres:nyx@localhost:5432/spinesurge',
    },
} satisfies Config;
