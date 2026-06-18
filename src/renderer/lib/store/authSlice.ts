import { StateCreator } from 'zustand';
import axios from 'axios';
import { UserProfile } from './types';
import type { AppState } from './index';

const BASE_URL = 'http://localhost:3001';

export interface OrgListItem {
  orgId: string;
  name:  string;
  slug:  string;
  role:  string;
}

/**
 * Active workspace — stored in Zustand + persisted to localStorage.
 * No database column. No JWT changes.
 * Switching workspace is pure frontend state.
 */
export type ActiveWorkspace =
  | { type: 'personal' }
  | { type: 'organization'; orgId: string };

export interface AuthSlice {
  // ── Core auth state ────────────────────────────────────────────────────────
  isAuthenticated:  boolean;
  user:             UserProfile | null;

  // ── Persisted scalars ──────────────────────────────────────────────────────
  token:            string | null;
  isEmailVerified:  boolean;
  profileCompleted: boolean;
  /** backward-compat: first org this user ever joined/created */
  orgId:            string | null;

  // ── Active workspace — persisted to localStorage, never sent to server ─────
  activeWorkspace:  ActiveWorkspace;

  pendingEmail:     string | null;

  // ── Session-only list caches ───────────────────────────────────────────────
  joinedOrgs:  OrgListItem[];
  createdOrgs: OrgListItem[];

  // ── Actions ────────────────────────────────────────────────────────────────
  login:               (email: string) => void;
  logout:              () => void;
  updateUser:          (updates: Partial<UserProfile>) => void;
  setToken:            (token: string | null) => void;
  setIsEmailVerified:  (value: boolean) => void;
  setProfileCompleted: (value: boolean) => void;
  /** @deprecated kept for backward compat with CreateOrgPage/PendingInvitationsPage */
  setOrgId:            (orgId: string | null) => void;
  setPendingEmail:     (email: string | null) => void;
  setJoinedOrgs:       (orgs: OrgListItem[]) => void;
  setCreatedOrgs:      (orgs: OrgListItem[]) => void;
  /** Switch active workspace — pure local state, no server call */
  setActiveWorkspace:  (ws: ActiveWorkspace) => void;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  clearAuth:           () => void;
  fetchOrgLists:       () => Promise<void>;
  initializeStore:     () => void;
}

export const createAuthSlice: StateCreator<AppState, [], [], AuthSlice> = (set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  isAuthenticated:  false,
  user:             null,
  token:            null,
  isEmailVerified:  false,
  profileCompleted: false,
  orgId:            null,
  activeWorkspace:  { type: 'personal' },
  pendingEmail:     null,
  joinedOrgs:       [],
  createdOrgs:      [],

  // ── Legacy login action (preserved) ───────────────────────────────────────
  login: (email: string) => set({
    isAuthenticated: true,
    user: {
      name:       'Dr. Veera',
      email,
      title:      'Chief Surgical Consultant',
      specialty:  'Spine Surgery',
      joined:     '2024-12-01',
      subsection: 'Lumbar',
    },
  }),

  logout: () => set({ isAuthenticated: false, user: null }),

  updateUser: (updates) => set((state) => ({
    user: state.user ? { ...state.user, ...updates } : null,
  })),

  // ── Simple setters ─────────────────────────────────────────────────────────
  setToken:            (token) => set({ token }),
  setIsEmailVerified:  (value) => set({ isEmailVerified: value }),
  setProfileCompleted: (value) => set({ profileCompleted: value }),
  setPendingEmail:     (email) => set({ pendingEmail: email }),
  setJoinedOrgs:       (orgs)  => set({ joinedOrgs: orgs }),
  setCreatedOrgs:      (orgs)  => set({ createdOrgs: orgs }),

  /** @deprecated — kept for backward compat */
  setOrgId: (orgId) => set({ orgId }),

  /** Switch workspace — pure frontend state, no server call, no JWT change */
  setActiveWorkspace: (ws) => set({ activeWorkspace: ws }),

  // ── loginWithCredentials ───────────────────────────────────────────────────
  loginWithCredentials: async (email: string, password: string) => {
    // Step 1: POST /auth/login
    let loginData: { token: string };
    try {
      const loginRes = await axios.post(
        `${BASE_URL}/auth/login`,
        { email, password },
        { validateStatus: (s) => s < 500 }
      );

      if (loginRes.status === 403 && loginRes.data?.code === 'EMAIL_NOT_VERIFIED') {
        const err = new Error('EMAIL_NOT_VERIFIED') as Error & { code: string };
        err.code = 'EMAIL_NOT_VERIFIED';
        throw err;
      }

      if (loginRes.status !== 200) {
        throw new Error(loginRes.data?.error ?? 'Login failed');
      }

      loginData = loginRes.data;
    } catch (err) {
      throw err;
    }

    const { token } = loginData;
    get().setToken(token);

    // Step 2: GET /auth/me
    try {
      const meRes = await axios.get(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: (s) => s < 500,
      });

      if (meRes.status === 200) {
        const userPayload = meRes.data.user ?? meRes.data;
        set({
          isAuthenticated:  true,
          user:             userPayload,
          isEmailVerified:  userPayload?.isEmailVerified  ?? false,
          profileCompleted: userPayload?.profileCompleted ?? false,
          orgId:            userPayload?.orgId ?? null,
        });
        // Restore activeWorkspace from localStorage (already done by persist middleware).
        // If no stored workspace, default stays personal — no change needed.
      } else {
        set({
          isAuthenticated:  true,
          isEmailVerified:  false,
          profileCompleted: false,
          orgId:            null,
        });
      }
    } catch {
      set({
        isAuthenticated:  true,
        isEmailVerified:  false,
        profileCompleted: false,
        orgId:            null,
      });
    }
  },

  // ── clearAuth ──────────────────────────────────────────────────────────────
  clearAuth: () => set({
    isAuthenticated:  false,
    user:             null,
    token:            null,
    isEmailVerified:  false,
    profileCompleted: false,
    orgId:            null,
    activeWorkspace:  { type: 'personal' },
    pendingEmail:     null,
    joinedOrgs:       [],
    createdOrgs:      [],
  }),

  // ── fetchOrgLists ──────────────────────────────────────────────────────────
  fetchOrgLists: async () => {
    const token = get().token;
    if (!token) return;

    try {
      const [joinedRes, createdRes] = await Promise.all([
        axios.get(`${BASE_URL}/orgs/joined`,  {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: (s) => s < 500,
        }),
        axios.get(`${BASE_URL}/orgs/created`, {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: (s) => s < 500,
        }),
      ]);

      if (joinedRes.status === 200) {
        set({ joinedOrgs: joinedRes.data ?? [] });
      }

      if (createdRes.status === 200) {
        // GET /orgs/created returns { id, name, slug, ... } — normalize to OrgListItem
        const normalized = (createdRes.data ?? []).map(
          (o: { id: string; name: string; slug: string; role?: string }) => ({
            orgId: o.id,
            name:  o.name,
            slug:  o.slug,
            role:  o.role ?? 'admin',
          })
        );
        set({ createdOrgs: normalized });
      }
    } catch (err) {
      console.error('[fetchOrgLists]', err);
    }
  },

  // ── initializeStore ────────────────────────────────────────────────────────
  // Called once on app mount. Derives isAuthenticated from persisted token.
  initializeStore: () => {
    const { token } = get();
    if (token) {
      set({ isAuthenticated: true });
    }
  },
});
