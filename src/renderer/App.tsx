import { ThemeProvider } from "@/components/theme-provider"
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { useEffect } from "react"
import { useAppStore } from "@/lib/store/index"

import MainLayout from "@/components/layout/MainLayout"
import DashboardLayout from "@/components/dashboard/DashboardLayout"
import MainPage from "@/pages/MainPage"
import DashboardPage from "@/pages/DashboardPage"
import PatientCasesPage from "@/pages/PatientCasesPage"
import ComparePage from "@/pages/ComparePage"
import LoginPage from "@/pages/LoginPage"
import RegisterPage from "@/pages/RegisterPage"
import VerifyEmailPage from "@/pages/VerifyEmailPage"
import CompleteProfilePage from "@/pages/CompleteProfilePage"
import CreateOrgPage from "@/pages/CreateOrgPage"
import PendingInvitationsPage from "@/pages/PendingInvitationsPage"
import OrgMembersPage from "@/pages/OrgMembersPage"
import MemberWorkspacePage from "@/pages/MemberWorkspacePage"
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary"
import { RequireAuth, RequireVerified, RequireProfile, RedirectIfComplete } from "@/components/guards"

const App = () => {
  const initializeStore = useAppStore(state => state.initializeStore);

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <Router>
        <Routes>
          {/* ── Public routes — redirect fully-onboarded users away ── */}
          <Route path="/login" element={
            <RedirectIfComplete>
              <RouteErrorBoundary routeName="/login">
                <LoginPage />
              </RouteErrorBoundary>
            </RedirectIfComplete>
          } />

          <Route path="/register" element={
            <RedirectIfComplete>
              <RouteErrorBoundary routeName="/register">
                <RegisterPage />
              </RouteErrorBoundary>
            </RedirectIfComplete>
          } />

          {/* ── OTP verification — no auth required ─────────────── */}
          <Route path="/verify-email" element={
            <RouteErrorBoundary routeName="/verify-email">
              <VerifyEmailPage />
            </RouteErrorBoundary>
          } />

          {/* ── Profile completion — requires auth + email verified ─ */}
          <Route path="/complete-profile" element={
            <RequireAuth>
              <RequireVerified>
                <RouteErrorBoundary routeName="/complete-profile">
                  <CompleteProfilePage />
                </RouteErrorBoundary>
              </RequireVerified>
            </RequireAuth>
          } />

          {/* ── Root redirect ────────────────────────────────────── */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* ── Dashboard — auth + verified + profile complete ──────
              NOTE: RequireOrg has been removed.
              Organisation creation is now OPTIONAL.
              activeOrgId = null means Personal Workspace. ─────── */}
          <Route element={
            <RequireAuth>
              <RequireVerified>
                <RequireProfile>
                  <DashboardLayout />
                </RequireProfile>
              </RequireVerified>
            </RequireAuth>
          }>
            <Route path="/dashboard" element={
              <RouteErrorBoundary routeName="/dashboard">
                <DashboardPage />
              </RouteErrorBoundary>
            } />
            <Route path="/members" element={
              <RouteErrorBoundary routeName="/members">
                <OrgMembersPage />
              </RouteErrorBoundary>
            } />
            <Route path="/members/:userId/workspace" element={
              <RouteErrorBoundary routeName="/members/:userId/workspace">
                <MemberWorkspacePage />
              </RouteErrorBoundary>
            } />
          </Route>

          {/* ── Organization creation (optional, accessible from workspace switcher) ─ */}
          <Route path="/create-org" element={
            <RequireAuth>
              <RequireVerified>
                <RequireProfile>
                  <RouteErrorBoundary routeName="/create-org">
                    <CreateOrgPage />
                  </RouteErrorBoundary>
                </RequireProfile>
              </RequireVerified>
            </RequireAuth>
          } />

          {/* ── Pending invitations (accessible from workspace switcher) ─ */}
          <Route path="/pending-invitations" element={
            <RequireAuth>
              <RequireVerified>
                <RouteErrorBoundary routeName="/pending-invitations">
                  <PendingInvitationsPage />
                </RouteErrorBoundary>
              </RequireVerified>
            </RequireAuth>
          } />

          {/* ── Legacy onboarding hub — keep for deep-link backward compat ─
              Redirects to /dashboard since org is now optional.          ─ */}
          <Route path="/onboarding/*" element={
            <RequireAuth>
              <RequireVerified>
                <RequireProfile>
                  <Navigate to="/dashboard" replace />
                </RequireProfile>
              </RequireVerified>
            </RequireAuth>
          } />

          {/* ── Canvas Workspace (clinical routes) ─────────────────── */}
          <Route element={
            <RequireAuth>
              <RequireVerified>
                <RequireProfile>
                  <MainLayout />
                </RequireProfile>
              </RequireVerified>
            </RequireAuth>
          }>
            <Route path="/workspace" element={<RouteErrorBoundary routeName="/workspace"><MainPage /></RouteErrorBoundary>} />
            <Route path="/compare"   element={<RouteErrorBoundary routeName="/compare"><ComparePage /></RouteErrorBoundary>} />
          </Route>

          {/* ── Standalone protected route ───────────────────────── */}
          <Route path="/cases" element={
            <RequireAuth>
              <RequireVerified>
                <RequireProfile>
                  <RouteErrorBoundary routeName="/cases">
                    <PatientCasesPage />
                  </RouteErrorBoundary>
                </RequireProfile>
              </RequireVerified>
            </RequireAuth>
          } />
        </Routes>
      </Router>
    </ThemeProvider>
  );
};

export default App
