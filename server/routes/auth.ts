import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { orgs, users } from '../schema';
import { authenticate } from '../middleware/authenticate';
import * as auditLogger from '../services/auditLogger';

// Startup guard — fail fast if JWT_SECRET is missing
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

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

authRouter.post('/register', async (req, res) => {
  const { organizationName, fullName, email, password } = req.body ?? {};

  // Validate required fields
  const missing: string[] = [];
  if (!organizationName) missing.push('organizationName');
  if (!fullName) missing.push('fullName');
  if (!email) missing.push('email');
  if (!password) missing.push('password');
  if (missing.length > 0) {
    res.status(400).json({ error: 'Missing required fields', missing });
    return;
  }

  // Validate password length
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  try {
    const orgId = generateId('org');
    const userId = generateId('usr');
    const slug = generateSlug(organizationName);
    const passwordHash = await bcrypt.hash(password, 12);

    await db.transaction(async (tx) => {
      // Insert org
      await tx.insert(orgs).values({ id: orgId, name: organizationName, slug });

      // Insert user
      await tx.insert(users).values({
        id: userId,
        orgId,
        email,
        passwordHash,
        fullName,
        role: 'admin',
        isActive: true,
      });
    });

    // Audit writes happen after the transaction commits so FK constraints pass
    await auditLogger.log('ORG_CREATED', 'org', orgId, null, null, orgId);
    await auditLogger.log('USER_CREATED', 'user', userId, null, userId, orgId);

    const token = jwt.sign(
      { id: userId, orgId, email, role: 'admin' },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'] }
    );

    res.status(201).json({
      token,
      user: { id: userId, orgId, email, fullName, role: 'admin', isActive: true },
    });
  } catch (err: unknown) {
    // Duplicate email (unique constraint violation)
    const error = err as { code?: string; message?: string };
    if (error?.code === '23505' || error?.message?.includes('unique')) {
      res.status(409).json({ error: 'Email already registered' });
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

    await auditLogger.log('LOGIN_SUCCESS', 'user', user.id, null, user.id, user.orgId);

    const token = jwt.sign(
      { id: user.id, orgId: user.orgId, email: user.email, role: user.role },
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
