"""Maps the external IdP identity to internal records and activates tenant scope.

Just-in-time provisioning: on a verified request we ensure the org, user, and membership exist
(mirroring the IdP, which remains the source of truth for who-belongs-where and their role), then
set the `app.current_org` GUC so Postgres RLS filters every subsequent query to this tenant.

Order matters:
  1. upsert org   (global table, no RLS)           -> internal org UUID
  2. SET LOCAL app.current_org = <org uuid>         -> RLS now active for this txn
  3. upsert user  (global table, no RLS)            -> internal user UUID
  4. upsert membership (RLS table; WITH CHECK passes because org_id == current_org)
"""

from __future__ import annotations

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Membership, Org, User
from app.schemas.auth import CurrentUser, Principal


async def resolve_context(session: AsyncSession, principal: Principal) -> CurrentUser:
    # 1. Org by external id.
    org = (
        await session.execute(select(Org).where(Org.external_id == principal.org_external))
    ).scalar_one_or_none()
    if org is None:
        org = Org(
            external_id=principal.org_external,
            name=principal.org_name or principal.org_external,
        )
        session.add(org)
        await session.flush()  # assigns org.id

    # 2. Activate RLS scope for the remainder of this transaction.
    await session.execute(
        text("SELECT set_config('app.current_org', :org, true)"),
        {"org": str(org.id)},
    )

    # 3. User by external subject.
    user = (
        await session.execute(select(User).where(User.subject == principal.subject))
    ).scalar_one_or_none()
    if user is None:
        user = User(subject=principal.subject, email=principal.email, display_name=principal.name)
        session.add(user)
        await session.flush()
    elif principal.email and user.email != principal.email:
        user.email = principal.email

    # 4. Membership (role mirrored from the token; IdP is authoritative).
    membership = (
        await session.execute(
            select(Membership).where(
                Membership.org_id == org.id, Membership.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        session.add(Membership(org_id=org.id, user_id=user.id, role=principal.role))
    elif membership.role != principal.role:
        membership.role = principal.role

    return CurrentUser(
        user_id=user.id,
        org_id=org.id,
        role=principal.role,
        subject=principal.subject,
        email=principal.email,
    )
