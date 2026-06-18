import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { and, desc, eq, gt, gte, isNull } from 'drizzle-orm';
import { db } from '../db';
import { users, emailVerificationOtps, otpAttemptLog } from '../schema';
import { authenticate } from '../middleware/authenticate';
import { onboardingVerify } from '../middleware/onboardingVerify';
import * as auditLogger from '../services/auditLogger';
import { generateOtp, hashOtp, verifyOtp } from '../services/otpService';
import { sendEmail } from '../services/email';

// Startup guard — fail fast if JWT_SECRET is missing
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// ── Avatar upload (multer) ────────────────────────────────────────────────────

const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
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
  const { email, password, confirmPassword, terms_accepted } = req.body ?? {};

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
      isEmailVerified: false,
      profileCompleted: false,
    });

    // OTP generation and storage — done after user insert commits
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    await db.insert(emailVerificationOtps).values({
      userId,
      otpHash,
      expiresAt,
    });

    // Send verification email — failures are swallowed inside sendEmail
    await sendEmail({
      to: email,
      subject: 'Verify your SpineSurge account',
      text: `Your verification code is: ${otp}. It expires in 10 minutes.`,
    });

    // Audit log — written after insert commits
    await auditLogger.log('USER_REGISTERED', 'user', userId, null, userId, null);

    res.status(201).json({
      message: 'Registration successful. Please check your email for a verification code.',
      email,
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
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({
      error: 'Missing required fields',
      missing: [...(!email ? ['email'] : []), ...(!password ? ['password'] : [])],
    });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

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
      res.status(401).json({ error: 'Invalid credentials' });
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
      },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────

authRouter.get('/me', authenticate, (req, res) => {
  res.status(200).json({ user: req.user, org: req.org });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────

authRouter.post('/logout', (_req, res) => {
  res.status(200).json({ success: true });
});

// ── POST /auth/verify-email ───────────────────────────────────────────────────

authRouter.post('/verify-email', async (req, res) => {
  const { email, otp } = req.body ?? {};
  if (!email || !otp) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    // 1. Find user
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      res.status(400).json({ code: 'INVALID_OTP', message: 'The verification code is incorrect.' });
      return;
    }

    // 2. Check brute-force lockout: ≥5 failed attempts in last 15 min
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentFailures = await db.select()
      .from(otpAttemptLog)
      .where(and(
        eq(otpAttemptLog.userId, user.id),
        eq(otpAttemptLog.succeeded, false),
        gte(otpAttemptLog.attemptedAt, fifteenMinAgo),
      ));
    if (recentFailures.length >= 5) {
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

      await db.insert(otpAttemptLog).values({ userId: user.id, succeeded: false });

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
      await db.insert(otpAttemptLog).values({ userId: user.id, succeeded: false });
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

    // 6. Clear failed attempts for this user
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
  const { email } = req.body ?? {};
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
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

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
      await sendEmail({
        to: email,
        subject: 'Your new SpineSurge verification code',
        text: `Your new verification code is: ${otp}. It expires in 10 minutes.`,
      });
    }

    res.status(200).json(GENERIC_SUCCESS);
  } catch (err) {
    console.error('[auth/resend-verification]', err);
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
  (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const filename = path.basename(req.file.path);
    res.status(200).json({ url: `/uploads/${filename}` });
  }
);
