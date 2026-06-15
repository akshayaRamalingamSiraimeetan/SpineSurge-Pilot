import { db } from '../db';
import { auditLog } from '../schema';

export async function log(
  action: string,
  entityType?: string | null,
  entityId?: string | null,
  metadata?: Record<string, unknown> | null,
  userId?: string | null,
  orgId?: string | null
): Promise<void> {
  const id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await db.insert(auditLog).values({
      id,
      orgId,
      userId,
      action,
      entityType,
      entityId,
      metadata,
    });
  } catch (err) {
    console.error('[auditLogger]', err);
  }
}
