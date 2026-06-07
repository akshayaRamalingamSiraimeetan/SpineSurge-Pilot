
import { db, sqlite } from './db';
import * as schema from './schema';
import fs from 'fs-extra';
import path from 'path';

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

    // 2. Truncate Tables (Order matters for foreign keys if checks are on, but we can disable or just delete all)
    // Drizzle/SQLite doesn't support TRUNCATE, so using DELETE
    console.log('Clearing database tables...');

    // Disable FK checks temporarily to easier delete
    sqlite.pragma('foreign_keys = OFF');

    db.delete(schema.scans).run();
    db.delete(schema.measurements).run();
    db.delete(schema.implants).run();
    db.delete(schema.contextStudies).run();
    db.delete(schema.contexts).run();
    db.delete(schema.reports).run();
    db.delete(schema.studies).run();
    db.delete(schema.visits).run();
    db.delete(schema.patients).run();

    sqlite.pragma('foreign_keys = ON');

    console.log('Database cleared.');
    console.log('Vacuuming database...');
    sqlite.pragma('vacuum');

    console.log('Reset complete!');
};

reset().catch(console.error);
