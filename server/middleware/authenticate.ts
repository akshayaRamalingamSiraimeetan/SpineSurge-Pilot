import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users, orgs } from '../schema';

// Extend Express Request with pilot fields
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      orgId: string;
      email: string;
      fullName: string;
      role: 'admin' | 'surgeon' | 'viewer';
      isActive: boolean;
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
  // 1. Extract Authorization header
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7); // remove "Bearer "

  // 2. Verify JWT
  let payload: { id: string; orgId: string; email: string; role: string };
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

  // 4. Load org from DB
  const [org] = await db
    .select()
    .from(orgs)
    .where(eq(orgs.id, user.orgId))
    .limit(1);

  // 5. Attach to request and proceed
  req.user = {
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    fullName: user.fullName,
    role: user.role as 'admin' | 'surgeon' | 'viewer',
    isActive: user.isActive,
  };
  req.org = org
    ? { id: org.id, name: org.name, slug: org.slug }
    : undefined;

  next();
}
