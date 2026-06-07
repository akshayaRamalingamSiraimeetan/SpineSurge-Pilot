/* Live workspace sync over the collaboration channel (Step 9).
 *
 * Bridges the collab WebSocket to the workspace store: broadcasts the local measurement/annotation
 * snapshot when it changes, and applies a peer's snapshot when one arrives. An echo guard
 * (`lastSyncRef`, the JSON of the last sent-or-applied state) makes this loop-free: applying a
 * remote snapshot updates the guard first, so the resulting local change is recognized as already
 * synced and is NOT re-broadcast. Last-write-wins, consistent with the REST upsert persistence. */
import { useCallback, useEffect, useRef } from 'react';
import { useWorkspaceStore } from '@/lib/store/workspace';
import { useCollab, type CollabMessage, type CollabPeer } from '@/lib/collab/useCollab';
import { fromApiState, toApiState } from './contextSerde';

interface CollabSyncResult {
  connected: boolean;
  peers: CollabPeer[];
}

export function useCollabSync(roomId: string | undefined): CollabSyncResult {
  const calibration = useWorkspaceStore((s) => s.calibration);
  const measurements = useWorkspaceStore((s) => s.measurements);
  const annotations = useWorkspaceStore((s) => s.annotations);
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);

  // The JSON of the last state we sent or applied — the echo guard. Reset when the room changes.
  const lastSyncRef = useRef<string>('');
  const calibrationRef = useRef(calibration);
  useEffect(() => {
    calibrationRef.current = calibration;
  }, [calibration]);

  useEffect(() => {
    lastSyncRef.current = '';
  }, [roomId]);

  const onMessage = useCallback(
    (msg: CollabMessage) => {
      if (msg.type !== 'patch' || !Array.isArray(msg.items)) return;
      const items = msg.items;
      const json = JSON.stringify(items);
      lastSyncRef.current = json; // mark as synced BEFORE applying, so the local change won't re-emit
      loadWorkspace(fromApiState(items, calibrationRef.current));
    },
    [loadWorkspace],
  );

  const { connected, peers, broadcast } = useCollab(roomId, onMessage);

  // Broadcast local changes, but only when they differ from the last synced snapshot.
  useEffect(() => {
    if (!roomId) return;
    const items = toApiState(measurements, annotations);
    const json = JSON.stringify(items);
    if (json === lastSyncRef.current) return;
    lastSyncRef.current = json;
    broadcast({ type: 'patch', items });
  }, [measurements, annotations, roomId, broadcast]);

  return { connected, peers };
}
