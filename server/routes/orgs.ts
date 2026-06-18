import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { orgs, users, organizationMemberships } from '../schema';
import { authenticate } from '../middleware/authenticate';
import { onboardingVerify } from '../middleware/onboardingVerify';
import * as auditLogger from '../services/auditLogger';

export const orgsRouter = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── GET /orgs/joined ──────────────────────────────────────────────────────────
// Returns all organizations the authenticated user is a member of.
// This covers both created orgs and joined-via-invitation orgs.

orgsRouter.get('/joined', authenticate, async (req, res) => {
  try {
    const memberships = await db
      .select({
        orgId:    organizationMemberships.orgId,
        role:     organizationMemberships.role,
        joinedAt: organizationMemberships.joinedAt,
        name:     orgs.name,
        slug:     orgs.slug,
        email:    orgs.organizationEmail,
        createdBy: orgs.createdBy,
      })
      .from(organizationMemberships)
      .innerJoin(orgs, eq(organizationMemberships.orgId, orgs.id))
      .where(eq(organizationMemberships.userId, req.user!.id));

    res.status(200).json(memberships);
  } catch (err) {
    console.error('[orgs/joined]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /orgs/created ─────────────────────────────────────────────────────────
// Returns organizations created by the authenticated user.

orgsRouter.get('/created', authenticate, async (req, res) => {
  try {
    const created = await db
      .select({
        id:        orgs.id,
        name:      orgs.name,
        slug:      orgs.slug,
        email:     orgs.organizationEmail,
        createdAt: orgs.createdAt,
      })
      .from(orgs)
      .where(eq(orgs.createdBy, req.user!.id));

    res.status(200).json(created);
  } catch (err) {
    console.error('[orgs/created]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /orgs ────────────────────────────────────────────────────────────────
// Creates a new organization and assigns the authenticated user as admin.
// Request body: { name: string, organizationEmail: string }
// Middleware:   authenticate → onboardingVerify (email verified + profile done)

orgsRouter.post(
  '/',
  authenticate,
  onboardingVerify({ requireProfile: true }),
  async (req, res) => {
    const { name, organizationEmail } = req.body ?? {};

    console.log('[orgs/create] Route hit — payload:', { name, organizationEmail });
    console.log('[orgs/create] Authenticated user:', {
      id:               req.user?.id,
      email:            req.user?.email,
      orgId:            req.user?.orgId,
      role:             req.user?.role,
      isEmailVerified:  req.user?.isEmailVerified,
      profileCompleted: req.user?.profileCompleted,
    });

    // ── Validate name ──────────────────────────────────────────────────────
    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'Organization name is required' });
      return;
    }

    // ── Validate organizationEmail ─────────────────────────────────────────
    if (!organizationEmail || typeof organizationEmail !== 'string' || organizationEmail.trim() === '') {
      res.status(400).json({ error: 'Organization email is required' });
      return;
    }

    if (!EMAIL_REGEX.test(organizationEmail.trim())) {
      res.status(400).json({ error: 'Organization email must be a valid email address' });
      return;
    }

    try {
      // Generate IDs + slug
      const orgId  = `org-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const slug   = `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Math.floor(Date.now() / 1000)}`;
      const userId = req.user!.id;
      const emailNormalized = organizationEmail.trim().toLowerCase();

      console.log('[orgs/create] Creating org:', { orgId, slug, organizationEmail: emailNormalized });

      // ── Transaction: insert org + membership + update user's orgId + role ──
      await db.transaction(async (tx) => {
        // Insert org with creator reference
        await tx.insert(orgs).values({
          id:                orgId,
          name:              name.trim(),
          slug,
          organizationEmail: emailNormalized,
          createdBy:         userId,
        });

        // Insert membership row (creator is admin)
        await tx.insert(organizationMemberships).values({
          userId,
          orgId,
          role: 'admin',
        });

        // Update user: set orgId if not already set (backward compat), set role to admin
        await tx
          .update(users)
          .set({
            orgId:     orgId,  // backward compat: tracks first org
            role:      'admin',
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      });

      console.log('[orgs/create] Org created; membership and user update complete:', { userId, orgId });

      // Re-fetch updated user + org for response
      const [updatedUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const [createdOrg]  = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);

      // Audit log
      await auditLogger.log(
        'ORG_CREATED',
        'org',
        orgId,
        { name: name.trim(), slug, organizationEmail: emailNormalized },
        userId,
        orgId,
      );

      // Issue a fresh JWT with updated orgId + role
      const token = jwt.sign(
        {
          id:               updatedUser.id,
          orgId:            updatedUser.orgId,
          email:            updatedUser.email,
          role:             updatedUser.role,
          isEmailVerified:  updatedUser.isEmailVerified,
          profileCompleted: updatedUser.profileCompleted,
        },
        process.env.JWT_SECRET!,
        { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as jwt.SignOptions['expiresIn'] },
      );

      console.log('[orgs/create] JWT refreshed — orgId:', updatedUser.orgId, 'role:', updatedUser.role);
      console.log('[orgs/create] Success — org:', createdOrg.id, createdOrg.name);

      res.status(201).json({
        message: 'Organization created.',
        token,
        org: createdOrg,
        user: {
          id:               updatedUser.id,
          orgId:            updatedUser.orgId,
          email:            updatedUser.email,
          fullName:         updatedUser.fullName,
          role:             updatedUser.role,
          isEmailVerified:  updatedUser.isEmailVerified,
          profileCompleted: updatedUser.profileCompleted,
        },
      });
    } catch (err: unknown) {
      // Unique constraint violation on organization_email
      const error = err as { code?: string; message?: string };
      if (error?.code === '23505' && error?.message?.includes('organization_email')) {
        res.status(409).json({
          code: 'DUPLICATE_ORGANIZATION_EMAIL',
          error: 'An organization with this email already exists.',
        });
        return;
      }
      console.error('[orgs/create] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ── GET /orgs/:id ─────────────────────────────────────────────────────────────

orgsRouter.get('/:id', async (req, res) => {
  try {
    const [org] = await db
      .select()
      .from(orgs)
      .where(eq(orgs.id, req.params.id))
      .limit(1);

    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    res.status(200).json(org);
  } catch (err) {
    console.error('[orgs/get]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
