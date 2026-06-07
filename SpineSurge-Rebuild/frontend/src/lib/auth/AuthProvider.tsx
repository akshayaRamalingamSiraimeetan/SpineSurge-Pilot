/* Auth context: owns the JWT lifecycle, the resolved identity (GET /auth/me), and the active org.
   The login flow is abstracted behind `login`/`switchOrg`/`logout` so production OIDC can replace
   the dev-token mint without changing consumers. The API client reads the token through a getter
   wired here, so the client stays free of React.

   /auth/me is server state, so it lives in TanStack Query (keyed by token); status is derived from
   the query — no bootstrap effect, no manual setState. */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, setTokenGetter } from '@/lib/api/client';
import type { DevTokenRequest, DevTokenResponse, Me, Role } from '@/lib/api/types';
import { sessionStore, tokenStore, type DevSession } from './storage';

// Wire the API client to read the persisted token at module load, before any fetch.
setTokenGetter(() => tokenStore.get());

const ME_KEY = ['auth', 'me'] as const;

export interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  me: Me | null;
  orgName: string | null;
  login: (params: DevSession) => Promise<void>;
  switchOrg: (orgId: string, orgName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

async function mintDevToken(req: DevTokenRequest): Promise<string> {
  const res = await apiFetch<DevTokenResponse>('/auth/dev-token', {
    method: 'POST',
    body: req,
    anonymous: true,
  });
  return res.access_token;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => tokenStore.get());
  const [orgName, setOrgName] = useState<string | null>(() => sessionStore.get()?.orgName ?? null);

  const meQuery = useQuery({
    queryKey: [...ME_KEY, token],
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      try {
        return await apiFetch<Me>('/auth/me');
      } catch (err) {
        // A token that /auth/me rejects is dead — drop it so we fall back to the login screen.
        tokenStore.clear();
        sessionStore.clear();
        throw err;
      }
    },
  });

  const status: AuthState['status'] = !token
    ? 'unauthenticated'
    : meQuery.isSuccess
      ? 'authenticated'
      : meQuery.isError
        ? 'unauthenticated'
        : 'loading';

  const login = useCallback(
    async (params: DevSession) => {
      const newToken = await mintDevToken({
        subject: params.subject,
        org_id: params.orgId,
        org_name: params.orgName,
        role: params.role,
        email: params.email,
      });
      tokenStore.set(newToken);
      sessionStore.set(params);
      setOrgName(params.orgName);
      setToken(newToken); // rekeys + enables the /auth/me query
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
    [queryClient],
  );

  const switchOrg = useCallback(
    async (orgId: string, nextOrgName: string) => {
      const current = sessionStore.get();
      if (!current) throw new Error('No active session to switch from');
      await login({ ...current, orgId, orgName: nextOrgName });
    },
    [login],
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    sessionStore.clear();
    setToken(null);
    setOrgName(null);
    queryClient.removeQueries({ queryKey: ME_KEY });
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({ status, me: meQuery.data ?? null, orgName, login, switchOrg, logout }),
    [status, meQuery.data, orgName, login, switchOrg, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Cosmetic RBAC helper — the server enforces; the UI only reflects. */
// eslint-disable-next-line react-refresh/only-export-components
export function roleAtLeast(role: Role | undefined, min: Role): boolean {
  const order: Role[] = ['viewer', 'surgeon', 'admin', 'owner'];
  if (!role) return false;
  return order.indexOf(role) >= order.indexOf(min);
}
