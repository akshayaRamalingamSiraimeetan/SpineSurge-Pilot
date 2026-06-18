import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '@/lib/store/index';

interface RequireOrgProps {
  children: React.ReactNode;
}

/**
 * Guard: user must belong to an organization (orgId is set and persisted).
 * Reads from the persisted `orgId` field — NOT from `user.orgId` which is
 * session-only and lost on page refresh.
 *
 * Users who have completed profile but not yet created/joined an org
 * are redirected back to the onboarding hub.
 */
const RequireOrg: React.FC<RequireOrgProps> = ({ children }) => {
  const orgId = useAppStore((state) => state.orgId);

  if (!orgId) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export default RequireOrg;
