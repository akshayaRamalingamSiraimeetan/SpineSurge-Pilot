/**
 * Creates (or resets the password of) a ready-to-use login for local testing:
 * email already verified and profile completed, so it skips the OTP flow.
 *
 *   npm run db:seed-dev-user
 *
 * Credentials come from DEV_USER_EMAIL / DEV_USER_PASSWORD in .env.
 */
import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users } from './schema';

async function main() {
    const email = process.env.DEV_USER_EMAIL;
    const password = process.env.DEV_USER_PASSWORD;
    if (!email || !password) {
        throw new Error('Set DEV_USER_EMAIL and DEV_USER_PASSWORD in .env');
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
            fullName: 'Dev Tester',
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
