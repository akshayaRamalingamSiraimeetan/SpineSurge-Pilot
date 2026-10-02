import { describe, it, expect, vi } from 'vitest';
import { api, UNAUTHORIZED_EVENT } from './api';

describe('api fetch wrapper', () => {
    it('calls fetch exactly once per request (no self-recursion)', async () => {
        const f = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
        vi.stubGlobal('fetch', f);
        await api.getContexts('p1', 't');
        expect(f).toHaveBeenCalledTimes(1);
        vi.unstubAllGlobals();
    });

    it('signals 401s so the app can sign out', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
        const seen = vi.fn();
        window.addEventListener(UNAUTHORIZED_EVENT, seen);
        await api.getContexts('p1', 't').catch(() => {});
        expect(seen).toHaveBeenCalledTimes(1);
        window.removeEventListener(UNAUTHORIZED_EVENT, seen);
        vi.unstubAllGlobals();
    });
});
