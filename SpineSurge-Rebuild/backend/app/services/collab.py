"""In-process collaboration room manager (presence + live state relay).

Rooms are keyed `"{org_external}:{context_id}"` so they are physically tenant-isolated: two users
in the same org share a room; a user targeting another org's context id lands in their *own* org's
(empty) room and can never observe it. Each peer holds an open WebSocket; the manager relays
presence (join/leave/cursor) and document patches (measurement/annotation deltas) to the other
peers in the same room. State of record still persists through the REST contexts upsert — this
layer is the live channel, not the source of truth.

Single-process scope (fine for dev / one API instance). Horizontal scaling would add a Redis
pub/sub fan-out behind the same interface; the room key and message shapes would not change.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket


@dataclass
class Peer:
    peer_id: str
    user_id: str
    name: str
    role: str
    websocket: WebSocket
    color: str = "#2563eb"


@dataclass
class Room:
    key: str
    peers: dict[str, Peer] = field(default_factory=dict)


# A small palette so each collaborator gets a stable, distinguishable presence color.
_PALETTE = ["#2563eb", "#16a34a", "#db2777", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"]


class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def room_key(org_external: str, context_id: str) -> str:
        return f"{org_external}:{context_id}"

    def _color_for(self, room: Room) -> str:
        return _PALETTE[len(room.peers) % len(_PALETTE)]

    async def join(self, key: str, peer_id: str, user_id: str, name: str, role: str,
                   websocket: WebSocket) -> Peer:
        async with self._lock:
            room = self._rooms.setdefault(key, Room(key=key))
            peer = Peer(
                peer_id=peer_id, user_id=user_id, name=name, role=role,
                websocket=websocket, color=self._color_for(room),
            )
            existing = [self._peer_public(p) for p in room.peers.values()]
            room.peers[peer_id] = peer
        # Tell the newcomer who's already here.
        await self._safe_send(peer, {"type": "init", "you": self._peer_public(peer),
                                     "peers": existing})
        # Tell everyone else a peer joined.
        await self.broadcast(key, {"type": "join", "peer": self._peer_public(peer)},
                             exclude=peer_id)
        return peer

    async def leave(self, key: str, peer_id: str) -> None:
        async with self._lock:
            room = self._rooms.get(key)
            if not room or peer_id not in room.peers:
                return
            del room.peers[peer_id]
            empty = not room.peers
            if empty:
                self._rooms.pop(key, None)
        if not empty:
            await self.broadcast(key, {"type": "leave", "peerId": peer_id})

    async def relay(self, key: str, sender_id: str, message: dict[str, Any]) -> None:
        """Forward a client message (presence/cursor/patch) to other peers, tagged with sender."""
        out = {**message, "peerId": sender_id}
        await self.broadcast(key, out, exclude=sender_id)

    async def broadcast(
        self, key: str, message: dict[str, Any], *, exclude: str | None = None
    ) -> None:
        async with self._lock:
            room = self._rooms.get(key)
            targets = [p for pid, p in room.peers.items() if pid != exclude] if room else []
        for peer in targets:
            await self._safe_send(peer, message)

    def peer_count(self, key: str) -> int:
        room = self._rooms.get(key)
        return len(room.peers) if room else 0

    @staticmethod
    def _peer_public(peer: Peer) -> dict[str, Any]:
        return {"peerId": peer.peer_id, "userId": peer.user_id, "name": peer.name,
                "role": peer.role, "color": peer.color}

    @staticmethod
    async def _safe_send(peer: Peer, message: dict[str, Any]) -> None:
        try:
            await peer.websocket.send_json(message)
        except Exception:  # noqa: BLE001 — a dead socket is cleaned up on its own disconnect path
            pass


rooms = RoomManager()
