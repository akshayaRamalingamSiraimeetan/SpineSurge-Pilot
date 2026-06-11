import { db } from './db';
import * as schema from './schema';
import fs from 'fs-extra';
import path from 'path';
import { sql } from 'drizzle-orm';

const reset = async () => {
    console.log('Starting full data reset...');

    // 1. Clear Uploads
    const uploadsDir = path.resolve(__dirname, 'uploads');
    if (fs.existsSync(uploadsDir)) {
        console.log(`Clearing uploads directory: ${uploadsDir}`);
        const files = fs.readdirSync(uploadsDir);
        for (const file of files) {
            if (file !== '.gitkeep') {
                fs.removeSync(path.join(uploadsDir, file));
            }
        }
    } else {
        fs.ensureDirSync(uploadsDir);
    }

    // 2. Truncate tables in dependency order with CASCADE
    console.log('Clearing database tables...');

    await db.execute(sql`TRUNCATE TABLE
        scans,
        measurements,
        implants,
        context_studies,
        contexts,
        reports,
        studies,
        visits,
        patients
    RESTART IDENTITY CASCADE`);

    console.log('Reset complete!');
};

reset().catch(console.error);
