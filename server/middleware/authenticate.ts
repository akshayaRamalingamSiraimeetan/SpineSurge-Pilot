import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users, orgs } from '../schema';
import { refreshMediaCookie } from '../media';

// Extend Express Request with pilot fields
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      orgId: string | null;
      email: string;
      fullName: string | null;
      role: 'admin' | 'surgeon' | 'viewer';
      isActive: boolean;
      isEmailVerified: boolean;
      profileCompleted: boolean;
    };
    org?: {
      id: string;
      name: string;
      slug: string;
    };
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Already authenticated earlier in the chain (app.use('/api', authenticate)).
  if (req.user) { next(); return; }

  // 1. Extract Authorization header
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7); // remove "Bearer "

  // 2. Verify JWT
  let payload: { id: string; orgId: string | null; email: string; role: string; iat?: number };
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as typeof payload;
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // 3. Load user from DB
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.id))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  // Signed in before the password was reset → sign in again (AUTH-01)
  if (user.passwordChangedAt && (payload.iat ?? 0) < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // 4. Load org from DB (may be null — no org = Personal Workspace)
  let org: { id: string; name: string; slug: string } | undefined;
  if (user.orgId) {
    const [dbOrg] = await db
      .select()
      .from(orgs)
      .where(eq(orgs.id, user.orgId))
      .limit(1);
    org = dbOrg ? { id: dbOrg.id, name: dbOrg.name, slug: dbOrg.slug } : undefined;
  }

  // 5. Attach to request and proceed
  req.user = {
    id:               user.id,
    orgId:            user.orgId ?? null,
    email:            user.email,
    fullName:         user.fullName ?? null,
    role:             user.role as 'admin' | 'surgeon' | 'viewer',
    isActive:         user.isActive,
    isEmailVerified:  user.isEmailVerified ?? false,
    profileCompleted: user.profileCompleted ?? false,
  };
  req.org = org;
  refreshMediaCookie(req, res, token); // lets <img>/viewer requests open private uploads

  next();
}
