"""Real-time collaboration WebSocket (Step 9).

`WS /api/v1/ws/collab/{context_id}?token=<jwt>` — a JWT-authenticated, org-scoped presence + state
relay. Browsers can't set Authorization headers on a WebSocket, so the token is passed as a query
param (acceptable for the dev token; production should prefer a short-lived ticket — noted). The
room is keyed by the token's org + the context id, so cross-tenant observation is impossible.

Protocol (JSON):
  server → client:  {type:"init", you, peers}        on connect
                    {type:"join", peer} / {type:"leave", peerId}
                    {type:"presence"|"cursor"|"patch", peerId, ...}   relayed from a peer
  client → server:  {type:"presence"|"cursor"|"patch", ...}          relayed to other peers
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.security import AuthError, verify_token
from app.deps.auth import ROLE_RANK
from app.services.collab import rooms

router = APIRouter(prefix="/ws", tags=["collab"])

# WebSocket close codes (RFC 6455 / app-specific in the 4000 range).
_POLICY_VIOLATION = 1008


def _principal_from_token(token: str | None) -> dict | None:
    """Decode + validate the token into the fields collaboration needs, or None if unauthorized."""
    if not token:
        return None
    try:
        claims = verify_token(token)
    except AuthError:
        return None
    subject = claims.get("sub")
    org_external = claims.get(settings.oidc_org_claim)
    role = claims.get(settings.oidc_role_claim, "viewer")
    if not subject or not org_external or role not in ROLE_RANK:
        return None
    return {
        "subject": str(subject),
        "org_external": str(org_external),
        "role": role,
        "name": claims.get("name") or (str(claims.get("email") or subject).split("@")[0]),
    }


@router.websocket("/collab/{context_id}")
async def collab(websocket: WebSocket, context_id: str, token: str | None = None) -> None:
    principal = _principal_from_token(token)
    if principal is None:
        await websocket.close(code=_POLICY_VIOLATION)
        return

    key = rooms.room_key(principal["org_external"], context_id)
    peer_id = uuid.uuid4().hex
    await websocket.accept()
    await rooms.join(
        key, peer_id,
        user_id=principal["subject"], name=principal["name"], role=principal["role"],
        websocket=websocket,
    )
    try:
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict) or "type" not in message:
                continue
            # Only relay known collaboration message types; ignore anything else.
            if message["type"] in {"presence", "cursor", "patch"}:
                await rooms.relay(key, peer_id, message)
    except WebSocketDisconnect:
        pass
    finally:
        await rooms.leave(key, peer_id)
