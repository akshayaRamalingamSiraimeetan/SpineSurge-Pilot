import { Request, Response, NextFunction } from 'express';

/**
 * Factory middleware that enforces onboarding gate checks.
 *
 * Usage:
 *   router.post('/orgs', authenticate, onboardingVerify({ requireProfile: true }), handler)
 *
 * Checks (in order):
 *  1. Email must be verified  → 403 { code: 'EMAIL_NOT_VERIFIED' }
 *  2. If requireProfile=true, profile must be completed → 403 { code: 'PROFILE_INCOMPLETE' }
 *
 * Requirements: 10.6, 10.7
 */
export function onboardingVerify(options: { requireProfile: boolean }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // authenticate middleware should have run before this; guard just in case
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (req.user.isEmailVerified === false) {
      res.status(403).json({ code: 'EMAIL_NOT_VERIFIED' });
      return;
    }

    if (options.requireProfile === true && req.user.profileCompleted === false) {
      res.status(403).json({ code: 'PROFILE_INCOMPLETE' });
      return;
    }

    next();
  };
}
