/**
 * Creates (or resets the password of) a ready-to-use login for local testing:
 * email already verified and profile completed, so it skips the OTP flow.
 *
 *   npm run db:seed-dev-user
 *
 * Credentials come from DEV_USER_EMAIL / DEV_USER_PASSWORD in .env.
 * Hosted demo: DEMO_USER_EMAIL / DEMO_USER_PASSWORD (+ DEMO_USER_NAME) are used
 * instead, and the script is allowed in production only with DEMO_MODE=true.
 */
import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema';

async function main() {
    if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true') {
        throw new Error('Refusing to seed a test login in production (set DEMO_MODE=true for a demo deployment)');
    }
    const email = (process.env.DEMO_USER_EMAIL || process.env.DEV_USER_EMAIL || '').trim().toLowerCase();
    const password = process.env.DEMO_USER_PASSWORD || process.env.DEV_USER_PASSWORD;
    const fullName = process.env.DEMO_USER_NAME || 'Dev Tester';
    if (!email || !password) {
        throw new Error('Set DEMO_USER_EMAIL/DEMO_USER_PASSWORD (or DEV_USER_*) in the environment');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

    if (existing) {
        await db.update(users)
            .set({ passwordHash, isActive: true, isEmailVerified: true, profileCompleted: true, updatedAt: new Date() })
            .where(eq(users.id, existing.id));
        console.log(`Reset password for ${email}`);
    } else {
        await db.insert(users).values({
            id: crypto.randomUUID(),
            email,
            passwordHash,
            fullName,
            role: 'surgeon',
            isEmailVerified: true,
            emailVerifiedAt: new Date(),
            profileCompleted: true,
            designation: 'Surgeon',
            country: 'India',
        });
        console.log(`Created ${email}`);
    }
    process.exit(0);
}

main().catch(err => {
    console.error('Seeding dev user failed:', err.message);
    process.exit(1);
});
