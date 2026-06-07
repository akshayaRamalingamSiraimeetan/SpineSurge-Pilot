/* Token + dev-session persistence. Kept tiny and serializable so the auth layer can rehydrate on
   reload without re-prompting. In production the token comes from the OIDC provider; the storage
   shape stays the same so swapping the login flow doesn't touch the rest of the app. */
import type { Role } from '@/lib/api/types';

const TOKEN_KEY = 'ss-token';
const SESSION_KEY = 'ss-session';

/** The dev-token inputs we re-mint from when switching orgs (dev mode only). */
export interface DevSession {
  subject: string;
  email: string;
  role: Role;
  orgId: string;
  orgName: string;
}

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

export const sessionStore = {
  get(): DevSession | null {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DevSession;
    } catch {
      return null;
    }
  },
  set(session: DevSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  },
  clear(): void {
    localStorage.removeItem(SESSION_KEY);
  },
};
