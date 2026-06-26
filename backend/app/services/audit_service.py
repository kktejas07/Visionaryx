"""Append-only audit trail for dashboard actions (admin review)."""
from __future__ import annotations

from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AuditLog, AuthUser


async def record_audit(
    db: AsyncSession,
    *,
    actor: AuthUser,
    action: str,
    resource_type: str,
    resource_id: Optional[int] = None,
    detail: Optional[dict] = None,
) -> None:
    row = AuditLog(
        actor_id=actor.id,
        actor_email=actor.email,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
    )
    db.add(row)
