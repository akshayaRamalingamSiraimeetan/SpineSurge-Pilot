import { Router } from 'express';
import { UPLOADS_DIR } from '../config';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { and, desc, eq, gt, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { users, emailVerificationOtps, otpAttemptLog } from '../schema';
import { authenticate } from '../middleware/authenticate';
import { onboardingVerify } from '../middleware/onboardingVerify';
import * as auditLogger from '../services/auditLogger';
import { generateOtp, hashOtp, verifyOtp } from '../services/otpService';

/** Emails are case-insensitive: stored lower-case, matched with lower() (BUGS SRV-16). */
const normEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : e);
const emailEq = (e: string) => sql`lower(${users.email}) = ${e}`;
import { codeEmail, emailEnabled, resetEmail, sendEmail } from '../services/email';
import { clearMediaCookie, refreshMediaCookie } from '../media';
import { persistUpload } from '../storage';
import { isPlatformAdmin } from './platform';

// Startup guard — fail fast if JWT_SECRET is missing or a placeholder (SRV-34)
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET.length < 32 || /your_jwt_secret/i.test(process.env.JWT_SECRET))) {
  throw new Error('JWT_SECRET must be a random string of at least 32 characters in production');
}

/** Hosted demo: skip email verification on sign-up. */
// DEMO_MODE skips the email code only while no real email provider is configured;
// with SMTP/Resend set up, every sign-up confirms its address (DEPLOY-04).
const DEMO_MODE = process.env.DEMO_MODE === 'true' && !emailEnabled;

// ── Avatar upload (multer) ────────────────────────────────────────────────────

// Same folder as the API (config.ts)
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('invalid_mime'));
    }
  },
});

export const authRouter = Router();

// ── Internal helpers ──────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base}-${Math.floor(Date.now() / 1000)}`;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── POST /auth/register ───────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

authRouter.post('/register', async (req, res) => {
  const { email: rawEmail, password, confirmPassword, terms_accepted } = req.body ?? {};
  const email = normEmail(rawEmail) as string;

  // Validate required fields
  const missing: string[] = [];
  if (!email) missing.push('email');
  if (!password) missing.push('password');
  if (!confirmPassword) missing.push('confirmPassword');
  if (terms_accepted === undefined || terms_accepted === null) missing.push('terms_accepted');
  if (missing.length > 0) {
    res.status(400).json({ error: 'Missing required fields', missing });
    return;
  }

  // Validate email format
  if (!EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'Invalid email address format' });
    return;
  }

  // Validate password length
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  // Validate passwords match
  if (password !== confirmPassword) {
    res.status(400).json({ error: 'Passwords do not match' });
    return;
  }

  // Validate terms accepted
  if (terms_accepted !== true) {
    res.status(400).json({ error: 'You must accept the terms to register' });
    return;
  }

  try {
    const userId = generateId('usr');
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert user — orgId is null until they create or join an org
    await db.insert(users).values({
      id: userId,
      orgId: null,
      email,
      passwordHash,
      role: 'viewer',
      isActive: true,
      // DEMO_MODE: testers can sign up without an email service (no OTP step).
      isEmailVerified: DEMO_MODE,
      profileCompleted: false,
    });

    if (DEMO_MODE) {
      await auditLogger.log('USER_REGISTERED', 'user', userId, { demo: true }, userId, null);
      res.status(201).json({ message: 'Account created. You can sign in now.', email, autoVerified: true });
      return;
    }

    // OTP generation and storage — done after user insert commits
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    await db.insert(emailVerificationOtps).values({
      userId,
      otpHash,
      expiresAt,
    });

    const sent = await sendEmail({ to: email, ...codeEmail(otp) });

    // Audit log — written after insert commits
    await auditLogger.log('USER_REGISTERED', 'user', userId, null, userId, null);

    res.status(201).json({
      message: sent
        ? 'Registration successful. Please check your email for a verification code.'
        : 'Account created, but the code email could not be sent. Use "Resend code" in a minute.',
      email,
      emailSent: sent,
    });
  } catch (err: unknown) {
    // Duplicate email (unique constraint violation)
    const error = err as { code?: string; message?: string };
    if (error?.code === '23505' || error?.message?.includes('unique')) {
      res.status(409).json({
        error: 'An account with this email may already exist. Please sign in or use a different address.',
      });
      return;
    }
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

authRouter.post('/login', async (req, res) => {
  const { email: rawEmail, password } = req.body ?? {};
  const email = normEmail(rawEmail) as string;

  if (!email || !password) {
    res.status(400).json({
      error: 'Missing required fields',
      missing: [...(!email ? ['email'] : []), ...(!password ? ['password'] : [])],
    });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(emailEq(email)).limit(1);

    if (!user) {
      await auditLogger.log('LOGIN_FAILED', 'user', null, { reason: 'user_not_found', email });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      await auditLogger.log('LOGIN_FAILED', 'user', user.id, { reason: 'wrong_password' }, user.id, user.orgId);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.isActive) {
      await auditLogger.log('LOGIN_FAILED', 'user', user.id, { reason: 'inactive' }, user.id, user.orgId);
      // the password was right: say why (blocked by the platform admin, MON-05)
      res.status(403).json({ error: 'This account has been blocked. Please contact the SpineSurge team.', code: 'ACCOUNT_BLOCKED' });
      return;
    }

    // Email verification gate (Requirement 6.1)
    if (!user.isEmailVerified) {
      await auditLogger.log('LOGIN_FAILED', 'user', user.id, { reason: 'email_not_verified' }, user.id, user.orgId ?? null);
      res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email before signing in.' });
      return;
    }

    await auditLogger.log('LOGIN_SUCCESS', 'user', user.id, null, user.id, user.orgId);

    const token = jwt.sign(
      { id: user.id, orgId: user.orgId, email: user.email, role: user.role, isEmailVerified: user.isEmailVerified, profileCompleted: user.profileCompleted },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'] }
    );
    refreshMediaCookie(req, res, token);

    res.status(200).json({
      token,
      user: {
        id: user.id,
        orgId: user.orgId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        profileCompleted: user.profileCompleted,
        avatarUrl: user.avatarUrl ?? null,
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────

authRouter.get('/me', authenticate, async (req, res) => {
  try {
    const [row] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    res.status(200).json({
      user: {
        ...req.user,
        avatarUrl:   row?.avatarUrl ?? null,
        designation: (row as any)?.designation ?? null,
        country:     (row as any)?.country ?? null,
        isPlatformAdmin: isPlatformAdmin(req.user!.email),
      },
      org: req.org,
    });
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────

authRouter.post('/logout', (_req, res) => {
  clearMediaCookie(res);
  res.status(200).json({ success: true });
});

// ── POST /auth/verify-email ───────────────────────────────────────────────────

authRouter.post('/verify-email', async (req, res) => {
  const { email: rawEmail, otp } = req.body ?? {};
  const email = normEmail(rawEmail) as string;
  if (!email || !otp) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    // 1. Find user
    const [user] = await db.select().from(users).where(emailEq(email)).limit(1);
    if (!user) {
      res.status(400).json({ code: 'INVALID_OTP', message: 'The verification code is incorrect.' });
      return;
    }

    // 2. Brute-force lockout. The attempt is recorded BEFORE counting so
    //    concurrent guesses all count against the limit (BUGS SRV-17).
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    const [attempt] = await db.insert(otpAttemptLog).values({ userId: user.id, succeeded: false }).returning({ id: otpAttemptLog.id });
    const recentFailures = await db.select()
      .from(otpAttemptLog)
      .where(and(
        eq(otpAttemptLog.userId, user.id),
        eq(otpAttemptLog.succeeded, false),
        gte(otpAttemptLog.attemptedAt, fifteenMinAgo),
      ));
    if (recentFailures.length > 5) {
      res.status(429).json({ code: 'OTP_LOCKED', message: 'Too many invalid verification attempts. Please try again later.' });
      return;
    }

    // 3. Find most recent non-used, non-expired OTP record
    const now = new Date();
    const [otpRecord] = await db.select()
      .from(emailVerificationOtps)
      .where(and(
        eq(emailVerificationOtps.userId, user.id),
        isNull(emailVerificationOtps.usedAt),
        gt(emailVerificationOtps.expiresAt, now),
      ))
      .orderBy(desc(emailVerificationOtps.createdAt))
      .limit(1);

    if (!otpRecord) {
      // Determine whether OTP was expired or already used
      const [anyRecord] = await db.select()
        .from(emailVerificationOtps)
        .where(eq(emailVerificationOtps.userId, user.id))
        .orderBy(desc(emailVerificationOtps.createdAt))
        .limit(1);

      if (anyRecord?.usedAt) {
        res.status(400).json({ code: 'OTP_ALREADY_USED', message: 'This verification code has already been used.' });
      } else {
        res.status(400).json({ code: 'EXPIRED_OTP', message: 'The verification code has expired. Please request a new one.' });
      }
      return;
    }

    // 4. Verify hash using timingSafeEqual
    const isValid = verifyOtp(otp, otpRecord.otpHash);
    if (!isValid) {
      res.status(400).json({ code: 'INVALID_OTP', message: 'The verification code is incorrect.' });
      return;
    }

    // 5. Atomically mark OTP as used and user as verified (SELECT FOR UPDATE via transaction)
    await db.transaction(async (tx) => {
      await tx.update(emailVerificationOtps)
        .set({ usedAt: now })
        .where(and(
          eq(emailVerificationOtps.id, otpRecord.id),
          isNull(emailVerificationOtps.usedAt),
        ));
      await tx.update(users)
        .set({ isEmailVerified: true, emailVerifiedAt: now })
        .where(eq(users.id, user.id));
    });

    // 6. Clear failed attempts for this user (including this one)
    void attempt;
    await db.delete(otpAttemptLog).where(eq(otpAttemptLog.userId, user.id));

    // 7. Issue JWT
    const token = jwt.sign(
      {
        id: user.id,
        orgId: user.orgId,
        email: user.email,
        role: user.role,
        isEmailVerified: true,
        profileCompleted: user.profileCompleted ?? false,
      },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'] }
    );

    res.status(200).json({
      message: 'Email verified successfully.',
      token,
      user: {
        id: user.id,
        email: user.email,
        is_email_verified: true,
        profile_completed: user.profileCompleted ?? false,
      },
    });
  } catch (err) {
    console.error('[auth/verify-email]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/resend-verification ────────────────────────────────────────────

authRouter.post('/resend-verification', async (req, res) => {
  const { email: rawEmail } = req.body ?? {};
  const email = normEmail(rawEmail) as string;
  const GENERIC_SUCCESS = { message: 'If an account exists for this email, a verification code has been sent.' };

  if (!email) {
    res.status(200).json(GENERIC_SUCCESS);
    return;
  }

  try {
    // Rate limit: count OTP records created for this email in last 60 min.
    // We can only track resend attempts via the user's OTP rows. If the email
    // belongs to no user there are zero records, so the rate limit cannot fire
    // for non-existent emails — this is acceptable per the data model.
    const [user] = await db.select().from(users).where(emailEq(email)).limit(1);

    if (user) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentOtps = await db
        .select()
        .from(emailVerificationOtps)
        .where(
          and(
            eq(emailVerificationOtps.userId, user.id),
            gte(emailVerificationOtps.createdAt, oneHourAgo),
          ),
        );

      if (recentOtps.length >= 3) {
        res.status(429).json({ code: 'RATE_LIMITED', message: 'Too many resend attempts. Please try again later.' });
        return;
      }

      // Invalidate all existing un-used OTP records for this user
      await db
        .update(emailVerificationOtps)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(emailVerificationOtps.userId, user.id),
            isNull(emailVerificationOtps.usedAt),
          ),
        );

      // Generate and persist a new OTP
      const otp = generateOtp();
      const otpHash = hashOtp(otp);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.insert(emailVerificationOtps).values({
        userId: user.id,
        otpHash,
        expiresAt,
      });

      // Dispatch verification email
      await sendEmail({ to: email, ...codeEmail(otp) });
    }

    res.status(200).json(GENERIC_SUCCESS);
  } catch (err) {
    console.error('[auth/resend-verification]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Forgot / reset password (AUTH-01) ────────────────────────────────────────
// 1. POST /auth/forgot-password {email} → a 6-digit code by email (10 min).
//    Always the same answer, so it never reveals whether an account exists.
// 2. POST /auth/reset-password {email, code, password, confirmPassword}
//    → new password; every older session is signed out (password_changed_at).

authRouter.post('/forgot-password', async (req, res) => {
  const email = normEmail(req.body?.email) as string;
  const GENERIC = { message: 'If an account exists for this email, we sent a 6-digit code to it.' };
  if (!email || !EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'Enter a valid email address' });
    return;
  }
  try {
    const [user] = await db.select().from(users).where(emailEq(email)).limit(1);
    if (user && user.isActive) {
      const recent = (await db.execute(sql`select count(*)::int as n from password_resets where user_id = ${user.id} and created_at > now() - interval '1 hour'`)).rows[0] as { n: number };
      if (recent.n >= 5) {
        res.status(429).json({ error: 'Too many reset requests. Please try again in an hour.' });
        return;
      }
      await db.execute(sql`update password_resets set used_at = now() where user_id = ${user.id} and used_at is null`);
      const code = generateOtp();
      await db.execute(sql`insert into password_resets (user_id, code_hash, expires_at) values (${user.id}, ${hashOtp(code)}, now() + interval '10 minutes')`);
      const sent = await sendEmail({ to: user.email, ...resetEmail(code) });
      if (!sent) console.error('[auth/forgot-password] email not sent to', user.email);
      await auditLogger.log('PASSWORD_RESET_REQUESTED', 'user', user.id, null, user.id, null);
    }
    res.json(GENERIC);
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/reset-password', async (req, res) => {
  const email = normEmail(req.body?.email) as string;
  const code = String(req.body?.code ?? '').trim();
  const { password, confirmPassword } = req.body ?? {};
  if (!email || !code || !password) { res.status(400).json({ error: 'Enter the code and a new password' }); return; }
  if (typeof password !== 'string' || password.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters' }); return; }
  if (password !== confirmPassword) { res.status(400).json({ error: 'Passwords do not match' }); return; }
  const BAD = { error: 'The code is incorrect or has expired. Request a new one.' };
  try {
    const [user] = await db.select().from(users).where(emailEq(email)).limit(1);
    if (!user || !user.isActive) { res.status(400).json(BAD); return; }

    // Same brute-force lockout as email verification (SRV-17)
    await db.insert(otpAttemptLog).values({ userId: user.id, succeeded: false });
    const failures = await db.select().from(otpAttemptLog).where(and(
      eq(otpAttemptLog.userId, user.id), eq(otpAttemptLog.succeeded, false),
      gte(otpAttemptLog.attemptedAt, new Date(Date.now() - 15 * 60 * 1000)),
    ));
    if (failures.length > 5) { res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes and try again.' }); return; }

    const [reset] = (await db.execute(sql`
        select id, code_hash from password_resets
         where user_id = ${user.id} and used_at is null and expires_at > now()
         order by created_at desc limit 1`)).rows as { id: string; code_hash: string }[];
    if (!reset || !verifyOtp(code, reset.code_hash)) { res.status(400).json(BAD); return; }

    const passwordHash = await bcrypt.hash(password, 12);
    await db.transaction(async (tx) => {
      await tx.execute(sql`update password_resets set used_at = now() where user_id = ${user.id} and used_at is null`);
      // The emailed code proves the address, so an unverified account is verified too
      await tx.execute(sql`update users set password_hash = ${passwordHash}, password_changed_at = now(), updated_at = now(),
                             is_email_verified = true, email_verified_at = coalesce(email_verified_at, now()) where id = ${user.id}`);
    });
    await db.delete(otpAttemptLog).where(eq(otpAttemptLog.userId, user.id));
    await auditLogger.log('PASSWORD_RESET', 'user', user.id, null, user.id, null);
    res.json({ message: 'Your password has been changed. Sign in with your new password.' });
  } catch (err) {
    console.error('[auth/reset-password]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /auth/profile ───────────────────────────────────────────────────────
// Edit name (and optionally designation/country) after onboarding (BUGS WS-22).
authRouter.patch('/profile', authenticate, async (req, res) => {
  const { full_name, designation, country } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (full_name !== undefined) {
    if (typeof full_name !== 'string' || !full_name.trim()) { res.status(400).json({ error: 'full_name must be a non-empty string' }); return; }
    updates.fullName = full_name.trim().slice(0, 200);
  }
  if (designation !== undefined) updates.designation = String(designation).slice(0, 100);
  if (country !== undefined) updates.country = String(country).slice(0, 100);
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: 'Nothing to update' }); return; }
  try {
    const [updated] = await db.update(users).set(updates as any).where(eq(users.id, req.user!.id)).returning();
    res.status(200).json({ user: { id: updated.id, email: updated.email, fullName: updated.fullName, avatarUrl: updated.avatarUrl ?? null } });
  } catch (err) {
    console.error('[auth/profile]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /auth/complete-profile ───────────────────────────────────────────────

const VALID_DESIGNATIONS = ['Surgeon', 'Resident', 'Fellow', 'Radiologist', 'Researcher', 'Other'] as const;

authRouter.post(
  '/complete-profile',
  authenticate,
  onboardingVerify({ requireProfile: false }),
  async (req, res) => {
    const { full_name, designation, country, avatar_url } = req.body ?? {};

    // Validate full_name
    if (!full_name || typeof full_name !== 'string' || full_name.trim() === '') {
      res.status(400).json({ error: 'full_name is required' });
      return;
    }

    // Validate designation
    if (!designation || !(VALID_DESIGNATIONS as readonly string[]).includes(designation)) {
      res.status(400).json({
        error: 'designation must be one of: Surgeon, Resident, Fellow, Radiologist, Researcher, Other',
      });
      return;
    }

    // Validate country
    if (!country || typeof country !== 'string' || country.trim() === '') {
      res.status(400).json({ error: 'country is required' });
      return;
    }

    try {
      const userId = req.user!.id;

      const updateValues: Record<string, unknown> = {
        fullName: full_name.trim(),
        designation,
        country: country.trim(),
        profileCompleted: true,
      };
      if (avatar_url) {
        updateValues.avatarUrl = avatar_url;
      }

      await db.update(users).set(updateValues).where(eq(users.id, userId));

      // Re-fetch updated user for response
      const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

      const token = jwt.sign(
        {
          id:               updated.id,
          orgId:            updated.orgId,
          email:            updated.email,
          role:             updated.role,
          isEmailVerified:  true,
          profileCompleted: true,
        },
        process.env.JWT_SECRET!,
        { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'] }
      );

      res.status(200).json({
        message: 'Profile completed.',
        token,
        user: {
          id:               updated.id,
          email:            updated.email,
          fullName:         updated.fullName,
          designation:      updated.designation,
          country:          updated.country,
          avatarUrl:        updated.avatarUrl,
          role:             updated.role,
          orgId:            updated.orgId,
          isEmailVerified:  updated.isEmailVerified,
          profileCompleted: updated.profileCompleted,
        },
      });
    } catch (err) {
      console.error('[auth/complete-profile]', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ── POST /auth/upload-avatar ──────────────────────────────────────────────────

authRouter.post(
  '/upload-avatar',
  authenticate,
  (req, res, next) => {
    avatarUpload.single('avatar')(req, res, (err) => {
      if (err) {
        // multer size limit error
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'File must be JPEG, PNG, or WebP and under 5 MB' });
          return;
        }
        // invalid MIME type error from fileFilter
        if (err instanceof Error && err.message === 'invalid_mime') {
          res.status(400).json({ error: 'File must be JPEG, PNG, or WebP and under 5 MB' });
          return;
        }
        return next(err);
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const filename = path.basename(req.file.path);
    try {
      await persistUpload(req.file.path); // → S3 bucket when configured (DEPLOY-07)
    } catch (e) {
      console.error('[avatar] store failed', e);
      res.status(502).json({ error: 'Could not store the picture' });
      return;
    }
    res.status(200).json({ url: `/uploads/${filename}` });
  }
);
