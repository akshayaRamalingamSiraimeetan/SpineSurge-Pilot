import type { Config } from 'drizzle-kit';

export default {
    schema: './schema.ts',
    out: './drizzle',
    dialect: 'sqlite',
    dbCredentials: {
        url: './data/spinesurge.db',
    },
} satisfies Config;
