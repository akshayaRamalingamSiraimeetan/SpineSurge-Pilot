import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '@/lib/store/index';

interface RedirectIfCompleteProps {
  children: React.ReactNode;
}

/**
 * Redirects fully-onboarded users away from public pages (login, register).
 *
 * Onboarding is now complete once the user has verified their email and
 * completed their profile. Organisation creation is OPTIONAL.
 *
 * Reads from persisted fields only — `user` is session-only and may be null
 * on page refresh even when the user is fully onboarded.
 */
const RedirectIfComplete: React.FC<RedirectIfCompleteProps> = ({ children }) => {
  const token            = useAppStore((state) => state.token);
  const isEmailVerified  = useAppStore((state) => state.isEmailVerified);
  const profileCompleted = useAppStore((state) => state.profileCompleted);

  // Profile completed is the final onboarding gate — go straight to dashboard.
  if (token && isEmailVerified && profileCompleted) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default RedirectIfComplete;
