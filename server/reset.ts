import { db } from './db';
import * as schema from './schema';
import fs from 'fs-extra';
import path from 'path';
import { sql } from 'drizzle-orm';
import { UPLOADS_DIR } from './config';

const reset = async () => {
    // Wipes every patient, study and upload — never by accident in production (UI11-14)
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_RESET !== 'yes') {
        console.error('Refusing to reset a production database. Set ALLOW_RESET=yes to override.');
        process.exit(1);
    }
    console.log('Starting full data reset...');

    // 1. Clear Uploads
    const uploadsDir = UPLOADS_DIR;
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
