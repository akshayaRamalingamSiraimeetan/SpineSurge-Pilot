import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '@/lib/store/index';

interface RequireVerifiedProps {
  children: React.ReactNode;
}

const RequireVerified: React.FC<RequireVerifiedProps> = ({ children }) => {
  const isEmailVerified = useAppStore((state) => state.isEmailVerified);

  if (isEmailVerified === false) {
    return <Navigate to="/verify-email" replace />;
  }

  return <>{children}</>;
};

export default RequireVerified;
