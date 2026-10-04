import { claimSettings } from '@/lib/settings';
import { StateCreator } from 'zustand';
import axios from 'axios';
import { UserProfile } from './types';
import type { AppState } from './index';
import { API_BASE } from '../api';

const BASE_URL = API_BASE;

/** Server returns `fullName`; the UI reads `name`. Normalise once here (BUGS NAV-12). */
export function normalizeUser(raw: any): UserProfile | null {
  if (!raw) return null;
  const avatar: string | undefined = raw.avatarUrl ?? undefined;
  return {
    ...raw,
    name:      raw.name ?? raw.fullName ?? raw.email ?? '',
    avatarUrl: avatar && avatar.startsWith('/') ? `${API_BASE}${avatar}` : avatar,
  };
}

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
  /** Full sign-out: clears auth AND all patient/workspace data in memory. */
  logout:              () => void;
  /** On app boot with a persisted token: validate it and restore user + orgs. */
  bootstrapSession:    () => Promise<void>;
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
  /** Resolves true when both lists loaded successfully. */
  fetchOrgLists:       () => Promise<boolean>;
  /** @internal overridden by patientSlice at runtime */
  initializeStore:     () => Promise<void>;
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

  logout: () => get().clearAuth(),

  bootstrapSession: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const meRes = await axios.get(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: (s) => s < 500,
      });
      if (meRes.status === 401) { get().clearAuth(); return; }
      if (meRes.status === 200) {
        const u = meRes.data.user ?? meRes.data;
        claimSettings(u?.id);
        set({
          isAuthenticated:  true,
          user:             normalizeUser(u),
          isEmailVerified:  u?.isEmailVerified ?? get().isEmailVerified,
          profileCompleted: u?.profileCompleted ?? get().profileCompleted,
        });
      }
    } catch (err) {
      console.error('[bootstrapSession]', err); // network error: keep session, retry on next action
    }
    const orgsLoaded = await get().fetchOrgLists();
    // Drop a persisted org workspace the user no longer belongs to (BUGS NAV-18).
    const ws = get().activeWorkspace;
    if (orgsLoaded && ws.type === 'organization') {
      const { joinedOrgs, createdOrgs } = get();
      const known = [...joinedOrgs, ...createdOrgs].some(o => o.orgId === ws.orgId);
      if (!known) {
        set({ activeWorkspace: { type: 'personal' } });
      }
    }
    await get().initializeStore();
  },

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
  setActiveWorkspace: (ws) => {
    // Different workspace = different data set: drop everything first so
    // nothing from the previous workspace is shown or saved (BUGS NAV-17).
    get().resetWorkspace();
    set({ activeWorkspace: ws, patients: [] });
    void get().initializeStore();
  },

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

    const { token } = loginData as { token: string; user?: any };
    const loginUser = (loginData as any).user;
    // Start from a clean slate — never show the previous user's data.
    get().resetWorkspace();
    claimSettings(loginUser?.id);
    set({
      token,
      patients:         [],
      isAuthenticated:  true,
      user:             normalizeUser(loginUser),
      // Login only succeeds for verified users; trust the login payload (BUGS NAV-10).
      isEmailVerified:  loginUser?.isEmailVerified ?? true,
      profileCompleted: loginUser?.profileCompleted ?? false,
      orgId:            loginUser?.orgId ?? null,
    });

    // Enrich profile (avatar etc.) + orgs + patients; failures here never undo the login.
    await get().bootstrapSession();
  },

  // ── clearAuth ──────────────────────────────────────────────────────────────
  clearAuth: () => {
    // Drop the private-uploads cookie on this browser (DEPLOY-05)
    void fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    get().disconnectLiveRoom?.();
    get().resetWorkspace();
    set({
    patients:         [],
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
    });
  },

  // ── fetchOrgLists ──────────────────────────────────────────────────────────
  fetchOrgLists: async () => {
    const token = get().token;
    if (!token) return false;

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
      return joinedRes.status === 200 && createdRes.status === 200;
    } catch (err) {
      console.error('[fetchOrgLists]', err);
      return false;
    }
  },

  // ── initializeStore ────────────────────────────────────────────────────────
  // Stub: overridden by patientSlice at runtime (spread order in index.ts).
  // Sets isAuthenticated from persisted token so guards work on first render.
  initializeStore: async () => {},
});
