/* Typed fetch client. Attaches the Bearer JWT to every request and surfaces a structured
   ApiError. The token is read lazily via a getter so the auth layer owns its lifecycle and the
   client stays a pure transport (no React, no store). */

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type TokenGetter = () => string | null;
let getToken: TokenGetter = () => null;

/** Wire the token source once at app boot (see AuthProvider). */
export function setTokenGetter(fn: TokenGetter): void {
  getToken = fn;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Skip the Authorization header (e.g. dev-token mint). */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(API_URL + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/** Core transport: attach auth, build the URL, throw a structured ApiError on non-2xx, and return
    the raw Response. Use this directly for binary/streamed bodies (e.g. WADO DICOM); use `apiFetch`
    for the common JSON case. */
export async function apiFetchRaw(path: string, opts: RequestOptions = {}): Promise<Response> {
  const { query, body, anonymous, headers, ...rest } = opts;
  const finalHeaders = new Headers(headers);

  if (!anonymous) {
    const token = getToken();
    if (token) finalHeaders.set('Authorization', `Bearer ${token}`);
  }

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (body instanceof FormData) {
      payload = body;
    } else {
      finalHeaders.set('Content-Type', 'application/json');
      payload = JSON.stringify(body);
    }
  }

  const res = await fetch(buildUrl(path, query), { ...rest, headers: finalHeaders, body: payload });

  if (!res.ok) {
    let errBody: unknown;
    let message = `${res.status} ${res.statusText}`;
    try {
      errBody = await res.json();
      if (errBody && typeof errBody === 'object' && 'detail' in errBody) {
        message = String((errBody as { detail: unknown }).detail);
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, errBody);
  }

  return res;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await apiFetchRaw(path, opts);
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return undefined as T;
  return (await res.json()) as T;
}
