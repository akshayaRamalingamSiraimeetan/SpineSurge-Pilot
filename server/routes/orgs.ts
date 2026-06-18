import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { orgs, users, organizationMemberships, studies, scans } from '../schema';
import { authenticate } from '../middleware/authenticate';
import { onboardingVerify } from '../middleware/onboardingVerify';
import * as auditLogger from '../services/auditLogger';

export const orgsRouter = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── GET /orgs/joined ──────────────────────────────────────────────────────────
// Returns all organizations the authenticated user is an ACTIVE member of.
// Only status='active' memberships are returned — removed/blacklisted are excluded.

orgsRouter.get('/joined', authenticate, async (req, res) => {
  try {
    const memberships = await db
      .select({
        orgId:    organizationMemberships.orgId,
        role:     organizationMemberships.role,
        status:   organizationMemberships.status,
        joinedAt: organizationMemberships.joinedAt,
        name:     orgs.name,
        slug:     orgs.slug,
        email:    orgs.organizationEmail,
        createdBy: orgs.createdBy,
      })
      .from(organizationMemberships)
      .innerJoin(orgs, eq(organizationMemberships.orgId, orgs.id))
      .where(
        and(
          eq(organizationMemberships.userId, req.user!.id),
          eq(organizationMemberships.status, 'active'),
        )
      );

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

orgsRouter.post(
  '/',
  authenticate,
  onboardingVerify({ requireProfile: true }),
  async (req, res) => {
    const { name, organizationEmail } = req.body ?? {};

    console.log('[orgs/create] Route hit — payload:', { name, organizationEmail });

    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'Organization name is required' });
      return;
    }

    if (!organizationEmail || typeof organizationEmail !== 'string' || organizationEmail.trim() === '') {
      res.status(400).json({ error: 'Organization email is required' });
      return;
    }

    if (!EMAIL_REGEX.test(organizationEmail.trim())) {
      res.status(400).json({ error: 'Organization email must be a valid email address' });
      return;
    }

    try {
      const orgId  = `org-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const slug   = `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Math.floor(Date.now() / 1000)}`;
      const userId = req.user!.id;
      const emailNormalized = organizationEmail.trim().toLowerCase();

      await db.transaction(async (tx) => {
        await tx.insert(orgs).values({
          id:                orgId,
          name:              name.trim(),
          slug,
          organizationEmail: emailNormalized,
          createdBy:         userId,
        });

        await tx.insert(organizationMemberships).values({
          userId,
          orgId,
          role:   'admin',
          status: 'active',
        });

        await tx
          .update(users)
          .set({
            orgId:     orgId,
            role:      'admin',
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      });

      const [updatedUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const [createdOrg]  = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);

      await auditLogger.log(
        'ORG_CREATED',
        'org',
        orgId,
        { name: name.trim(), slug, organizationEmail: emailNormalized },
        userId,
        orgId,
      );

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

orgsRouter.get('/:id', authenticate, async (req, res) => {
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

    // Verify caller is an active member of this org (or its creator)
    const [membership] = await db
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, req.user!.id),
          eq(organizationMemberships.orgId, req.params.id),
          eq(organizationMemberships.status, 'active'),
        )
      )
      .limit(1);

    if (!membership && org.createdBy !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.status(200).json(org);
  } catch (err) {
    console.error('[orgs/get]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /orgs/:id/members ─────────────────────────────────────────────────────
// Returns all members of the organization.
// ALL active members may view the member list.
// Only admins see all statuses; members see only active members.

orgsRouter.get('/:id/members', authenticate, async (req, res) => {
  const orgId = req.params.id;

  try {
    const [org] = await db
      .select()
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1);

    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    // Verify caller is an active member or the creator
    const [callerMembership] = await db
      .select({ role: organizationMemberships.role })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, req.user!.id),
          eq(organizationMemberships.orgId, orgId),
          eq(organizationMemberships.status, 'active'),
        )
      )
      .limit(1);

    const isAdmin = callerMembership?.role === 'admin' || org.createdBy === req.user!.id;

    if (!callerMembership && !isAdmin) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Admins see all membership statuses; regular members see only active members
    let memberQuery = db
      .select({
        id:        organizationMemberships.id,
        userId:    organizationMemberships.userId,
        role:      organizationMemberships.role,
        status:    organizationMemberships.status,
        joinedAt:  organizationMemberships.joinedAt,
        email:     users.email,
        fullName:  users.fullName,
        avatarUrl: users.avatarUrl,
      })
      .from(organizationMemberships)
      .innerJoin(users, eq(organizationMemberships.userId, users.id));

    const members = await (isAdmin
      ? memberQuery.where(eq(organizationMemberships.orgId, orgId))
      : memberQuery.where(
          and(
            eq(organizationMemberships.orgId, orgId),
            eq(organizationMemberships.status, 'active'),
          )
        ));

    // Return isAdmin flag so frontend can gate admin-only UI
    res.status(200).json({ members, isAdmin });
  } catch (err) {
    console.error('[orgs/members]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /orgs/:id/members/:userId/patients ────────────────────────────────────
// Admin-only: fetch a specific member's patients+studies within this org.
// Regular members receive 403.

orgsRouter.get('/:id/members/:userId/patients', authenticate, async (req, res) => {
  const orgId        = req.params.id;
  const targetUserId = req.params.userId;

  try {
    const [org] = await db
      .select()
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1);

    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    // Enforce: caller must be active admin or org creator
    const [callerMembership] = await db
      .select({ role: organizationMemberships.role })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, req.user!.id),
          eq(organizationMemberships.orgId, orgId),
          eq(organizationMemberships.status, 'active'),
        )
      )
      .limit(1);

    const isAdmin = callerMembership?.role === 'admin' || org.createdBy === req.user!.id;
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin access required to inspect member data' });
      return;
    }

    // Verify target user is (or was) a member of this org
    const [targetMembership] = await db
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, targetUserId),
          eq(organizationMemberships.orgId, orgId),
        )
      )
      .limit(1);

    if (!targetMembership) {
      res.status(404).json({ error: 'Member not found in this organization' });
      return;
    }

    // Fetch all studies owned by this member in this org
    const memberStudies = await db.query.studies.findMany({
      where: and(
        eq(studies.organizationId, orgId),
        eq(studies.ownerUserId, targetUserId),
      ),
      with: { scans: true },
    });

    res.status(200).json({
      userId:  targetUserId,
      orgId,
      studies: memberStudies,
    });
  } catch (err) {
    console.error('[orgs/members/patients]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /orgs/:id/members/:userId/review-copy ───────────────────────────────
// Admin-only: create a review copy of a member's study.
// Creates a new study with parent_study_id = originalStudyId, owned by the admin.
// Copies the context (measurements/implants) as the starting state.

orgsRouter.post('/:id/members/:userId/review-copy', authenticate, async (req, res) => {
  const orgId        = req.params.id;
  const targetUserId = req.params.userId;
  const { studyId }  = req.body ?? {};

  if (!studyId) {
    res.status(400).json({ error: 'studyId is required' });
    return;
  }

  try {
    const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
    if (!org) { res.status(404).json({ error: 'Organization not found' }); return; }

    // Enforce admin
    const [callerMembership] = await db
      .select({ role: organizationMemberships.role })
      .from(organizationMemberships)
      .where(and(
        eq(organizationMemberships.userId, req.user!.id),
        eq(organizationMemberships.orgId, orgId),
        eq(organizationMemberships.status, 'active'),
      ))
      .limit(1);

    const isAdmin = callerMembership?.role === 'admin' || org.createdBy === req.user!.id;
    if (!isAdmin) { res.status(403).json({ error: 'Admin access required' }); return; }

    // Fetch the original study
    const [original] = await db
      .select()
      .from(studies)
      .where(and(eq(studies.id, studyId), eq(studies.organizationId, orgId), eq(studies.ownerUserId, targetUserId)))
      .limit(1);

    if (!original) { res.status(404).json({ error: 'Study not found' }); return; }

    // Create the review copy
    const reviewId = `study-review-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const [reviewStudy] = await db
      .insert(studies)
      .values({
        id:              reviewId,
        patientId:       original.patientId,
        visitId:         original.visitId,
        modality:        original.modality,
        source:          'AdminReview',
        acquisitionDate: original.acquisitionDate,
        organizationId:  orgId,
        ownerUserId:     req.user!.id,
        parentStudyId:   original.id,
      })
      .returning();

    res.status(201).json({ reviewStudy });
  } catch (err) {
    console.error('[orgs/members/review-copy]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Update a member's status (remove or blacklist).
// Only org admins or the org creator can perform this action.
// Rows are NEVER deleted — status is updated for audit trail.

orgsRouter.patch('/:id/members/:membershipId', authenticate, async (req, res) => {
  const orgId        = req.params.id;
  const membershipId = req.params.membershipId;
  const { status }   = req.body ?? {};

  if (!['removed', 'blacklisted', 'active'].includes(status)) {
    res.status(400).json({
      error: 'status must be one of: active, removed, blacklisted',
    });
    return;
  }

  try {
    // Verify org exists
    const [org] = await db
      .select()
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1);

    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    // Verify caller is an active admin or creator
    const [callerMembership] = await db
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.userId, req.user!.id),
          eq(organizationMemberships.orgId, orgId),
          eq(organizationMemberships.status, 'active'),
          eq(organizationMemberships.role, 'admin'),
        )
      )
      .limit(1);

    if (!callerMembership && org.createdBy !== req.user!.id) {
      res.status(403).json({ error: 'Only admins can manage membership status' });
      return;
    }

    // Fetch the target membership
    const [target] = await db
      .select()
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.id, membershipId as unknown as string),
          eq(organizationMemberships.orgId, orgId),
        )
      )
      .limit(1);

    if (!target) {
      res.status(404).json({ error: 'Membership not found' });
      return;
    }

    // Prevent removing the last admin / org creator
    if (target.userId === org.createdBy && status !== 'active') {
      res.status(400).json({ error: 'Cannot remove or blacklist the organization creator' });
      return;
    }

    // Prevent self-demotion via this endpoint
    if (target.userId === req.user!.id && status !== 'active') {
      res.status(400).json({ error: 'You cannot remove yourself from the organization' });
      return;
    }

    const [updated] = await db
      .update(organizationMemberships)
      .set({ status })
      .where(eq(organizationMemberships.id, membershipId as unknown as string))
      .returning();

    await auditLogger.log(
      `MEMBER_${status.toUpperCase()}` as any,
      'organization_membership',
      membershipId,
      { orgId, targetUserId: target.userId, newStatus: status },
      req.user!.id,
      orgId,
    );

    res.status(200).json({ message: `Membership updated to '${status}'.`, membership: updated });
  } catch (err) {
    console.error('[orgs/members/patch]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
