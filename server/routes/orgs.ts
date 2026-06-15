import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { orgs } from '../schema';

export const orgsRouter = Router();

// GET /orgs/:id
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
