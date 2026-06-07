/* Real-time collaboration client (Step 9).
 *
 * Opens a JWT-authenticated WebSocket to the backend collab relay for a given room (we key the room
 * by studyId so everyone viewing the same workspace collaborates), tracks peer presence, and exposes
 * a `broadcast` for live document patches. The relay is org-scoped server-side, so a room only ever
 * contains peers from the same tenant. Degrades gracefully: if the socket can't connect the hook is
 * inert and the workspace keeps working solo. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/api/client';
import { tokenStore } from '@/lib/auth/storage';

export interface CollabPeer {
  peerId: string;
  userId: string;
  name: string;
  role: string;
  color: string;
}

export interface CollabMessage {
  type: 'presence' | 'cursor' | 'patch';
  peerId?: string;
  [key: string]: unknown;
}

function wsUrl(roomId: string, token: string): string {
  // API_URL is like http(s)://host/api/v1 → ws(s)://host/api/v1/ws/collab/{room}?token=
  const base = API_URL.replace(/^http/, 'ws');
  return `${base}/ws/collab/${encodeURIComponent(roomId)}?token=${encodeURIComponent(token)}`;
}

interface UseCollabResult {
  connected: boolean;
  self: CollabPeer | null;
  peers: CollabPeer[];
  broadcast: (message: CollabMessage) => void;
}

export function useCollab(
  roomId: string | undefined,
  onMessage?: (message: CollabMessage) => void,
): UseCollabResult {
  const [connected, setConnected] = useState(false);
  const [self, setSelf] = useState<CollabPeer | null>(null);
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  // Keep the latest onMessage without forcing the socket to re-open on every render.
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const token = tokenStore.get();
    if (!roomId || !token) return;

    let cancelled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(roomId, token));
    } catch {
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => !cancelled && setConnected(true);
    ws.onclose = () => {
      if (cancelled) return;
      setConnected(false);
      setPeers([]);
      setSelf(null);
    };
    ws.onmessage = (ev) => {
      if (cancelled) return;
      let msg: {
        type: string;
        peerId?: string;
        peer?: CollabPeer;
        peers?: CollabPeer[];
        you?: CollabPeer;
        [key: string]: unknown;
      };
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'init':
          setSelf(msg.you ?? null);
          setPeers(msg.peers ?? []);
          break;
        case 'join':
          if (msg.peer) {
            const joined = msg.peer;
            setPeers((p) => [...p.filter((x) => x.peerId !== joined.peerId), joined]);
          }
          break;
        case 'leave':
          setPeers((p) => p.filter((x) => x.peerId !== msg.peerId));
          break;
        default:
          onMessageRef.current?.(msg as CollabMessage);
      }
    };

    return () => {
      cancelled = true;
      wsRef.current = null;
      ws.close();
    };
  }, [roomId]);

  const broadcast = useCallback((message: CollabMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  return { connected, self, peers, broadcast };
}
