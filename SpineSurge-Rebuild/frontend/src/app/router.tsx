/* Route table. Public: /login. Everything else sits behind RequireAuth and inside the single
   icon-rail AppShell, so navigation is identical across screens (DESIGN.md §3). Settings is a modal
   opened from the rail, not a route. Reporting lives inside the workspace Report tab. */
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/shells/AppShell';
import { RequireAuth } from '@/lib/auth/RequireAuth';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { PatientsScreen } from '@/features/patients/PatientsScreen';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { WorkspaceScreen } from '@/features/workspace/WorkspaceScreen';
import { DicomVerifyPage } from '@/features/dicom/DicomVerifyPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginScreen /> },
  // DEV-ONLY: visual verification of the Step 8b Cornerstone/VTK pipeline (no auth). Remove on cutover.
  { path: '/dicom-verify', element: <DicomVerifyPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/dashboard', element: <Dashboard /> },
          { path: '/workspace', element: <WorkspaceScreen /> },
          { path: '/workspace/:studyId', element: <WorkspaceScreen /> },
          { path: '/patients', element: <PatientsScreen /> },
          { path: '/library', element: <LibraryScreen /> },
          { index: true, path: '/', element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
