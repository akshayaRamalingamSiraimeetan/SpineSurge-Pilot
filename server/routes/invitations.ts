import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { orgInvitations, users, orgs, organizationMemberships } from '../schema';
import { authenticate } from '../middleware/authenticate';
import { onboardingVerify } from '../middleware/onboardingVerify';

export const invitationsRouter = Router();

// ── GET /invitations/pending ──────────────────────────────────────────────────
// Returns all pending invitations for the authenticated user's email address.

invitationsRouter.get('/pending', authenticate, async (req, res) => {
  try {
    const results = await db
      .select({
        id:           orgInvitations.id,
        orgId:        orgInvitations.orgId,
        invitedEmail: orgInvitations.invitedEmail,
        role:         orgInvitations.role,
        status:       orgInvitations.status,
        createdAt:    orgInvitations.createdAt,
        acceptedAt:   orgInvitations.acceptedAt,
        orgName:      orgs.name,
      })
      .from(orgInvitations)
      .innerJoin(orgs, eq(orgInvitations.orgId, orgs.id))
      .where(
        and(
          eq(orgInvitations.invitedEmail, req.user!.email),
          eq(orgInvitations.status, 'pending')
        )
      );

    res.status(200).json(results);
  } catch (err) {
    console.error('GET /invitations/pending error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /invitations/:id/accept ──────────────────────────────────────────────
// Accepts a pending invitation, adding the user to the org via membership table.
// Supports multi-org: a user can accept multiple invitations.

invitationsRouter.post(
  '/:id/accept',
  authenticate,
  onboardingVerify({ requireProfile: false }),
  async (req, res) => {
    const id = req.params.id as string;

    try {
      // Fetch invitation by id
      const [invitation] = await db
        .select()
        .from(orgInvitations)
        .where(eq(orgInvitations.id, id))
        .limit(1);

      // 404 if not found or email doesn't match
      if (!invitation || invitation.invitedEmail !== req.user!.email) {
        res.status(404).json({ error: 'Invitation not found' });
        return;
      }

      // 409 if invitation is not pending
      if (invitation.status !== 'pending') {
        res.status(409).json({ code: 'INVITATION_NOT_PENDING' });
        return;
      }

      // Check if user is already a member of this org
      const [existingMembership] = await db
        .select()
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.userId, req.user!.id),
            eq(organizationMemberships.orgId, invitation.orgId)
          )
        )
        .limit(1);

      if (existingMembership) {
        res.status(409).json({
          code: 'ALREADY_IN_ORGANIZATION',
          message: 'You are already a member of this organization.',
        });
        return;
      }

      // Transaction: insert membership row + mark invitation accepted
      const now = new Date();

      await db.transaction(async (tx) => {
        // Insert membership row (multi-org support)
        await tx.insert(organizationMemberships).values({
          userId:   req.user!.id,
          orgId:    invitation.orgId,
          role:     invitation.role,
          joinedAt: now,
        });

        // Mark invitation accepted
        await tx
          .update(orgInvitations)
          .set({ status: 'accepted', acceptedAt: now })
          .where(eq(orgInvitations.id, invitation.id));

        // For backward compatibility: set users.orgId to first org if not set yet
        const currentUser = await tx
          .select({ orgId: users.orgId })
          .from(users)
          .where(eq(users.id, req.user!.id))
          .limit(1);

        if (!currentUser[0]?.orgId) {
          await tx
            .update(users)
            .set({ orgId: invitation.orgId, updatedAt: now })
            .where(eq(users.id, req.user!.id));
        }
      });

      // Fetch org details for the response
      const [org] = await db
        .select()
        .from(orgs)
        .where(eq(orgs.id, invitation.orgId))
        .limit(1);

      // Fetch updated user
      const [updatedUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user!.id))
        .limit(1);

      const { passwordHash: _omit, ...safeUser } = updatedUser as typeof updatedUser & { passwordHash?: string };

      res.status(200).json({
        message: 'Joined organization.',
        user: safeUser,
        org,
      });
    } catch (err) {
      console.error('POST /invitations/:id/accept error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ── POST /invitations/:id/decline ─────────────────────────────────────────────
// Declines a pending invitation.

invitationsRouter.post('/:id/decline', authenticate, async (req, res) => {
  const id = req.params.id as string;

  try {
    const [invitation] = await db
      .select()
      .from(orgInvitations)
      .where(eq(orgInvitations.id, id))
      .limit(1);

    if (!invitation || invitation.invitedEmail !== req.user!.email) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    if (invitation.status !== 'pending') {
      res.status(409).json({ code: 'INVITATION_NOT_PENDING' });
      return;
    }

    await db
      .update(orgInvitations)
      .set({ status: 'declined' })
      .where(eq(orgInvitations.id, id));

    res.status(200).json({ message: 'Invitation declined.' });
  } catch (err) {
    console.error('POST /invitations/:id/decline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /invitations ─────────────────────────────────────────────────────────
// Admin-only: creates a new invitation record.

invitationsRouter.post('/', authenticate, async (req, res) => {
  // Admin check
  if (req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { org_id, invited_email, role } = req.body ?? {};

  if (!org_id || !invited_email || !role) {
    res.status(400).json({ error: 'Missing required fields: org_id, invited_email, role' });
    return;
  }

  try {
    const [invitation] = await db
      .insert(orgInvitations)
      .values({
        id:           uuidv4(),
        orgId:        org_id,
        invitedEmail: invited_email,
        role,
        status:       'pending',
      })
      .returning();

    res.status(201).json(invitation);
  } catch (err) {
    console.error('POST /invitations error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
