import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '@/lib/store/index';

interface RequireAuthProps {
  children: React.ReactNode;
}

const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const token = useAppStore((state) => state.token);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default RequireAuth;
