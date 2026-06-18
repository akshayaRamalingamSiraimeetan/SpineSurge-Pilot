import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '@/lib/store/index';

interface RequireProfileProps {
  children: React.ReactNode;
}

const RequireProfile: React.FC<RequireProfileProps> = ({ children }) => {
  const profileCompleted = useAppStore((state) => state.profileCompleted);

  if (profileCompleted === false) {
    return <Navigate to="/complete-profile" replace />;
  }

  return <>{children}</>;
};

export default RequireProfile;
