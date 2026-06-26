"""
Admin audit log — who changed users, cameras, email settings, etc.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser
from app.database.connection import get_db
from app.database.models import AuditLog

router = APIRouter()

_AUDIT_TABLE_HINT = (
    "Audit log table is missing. From the project `backend` folder run: alembic upgrade head"
)


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_email: str
    action: str
    resource_type: str
    resource_id: Optional[int] = None
    detail: Optional[dict] = None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogRead]
    total: int


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None, description="Search actor email, action, or resource type"),
    action: Optional[str] = Query(None, description="Filter by action substring"),
):
    """Paginated audit events (newest first)."""
    filt_parts = []
    if q and q.strip():
        term = f"%{q.strip()}%"
        filt_parts.append(
            or_(
                AuditLog.actor_email.ilike(term),
                AuditLog.action.ilike(term),
                AuditLog.resource_type.ilike(term),
            )
        )
    if action and action.strip():
        filt_parts.append(AuditLog.action.ilike(f"%{action.strip()}%"))

    where_clause = and_(*filt_parts) if filt_parts else None

    try:
        count_stmt = select(func.count(AuditLog.id))
        if where_clause is not None:
            count_stmt = count_stmt.where(where_clause)
        total = (await db.execute(count_stmt)).scalar() or 0

        stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
        if where_clause is not None:
            stmt = stmt.where(where_clause)
        result = await db.execute(stmt)
        rows = result.scalars().all()
    except ProgrammingError as e:
        err = str(e).lower()
        if "audit_logs" in err or "does not exist" in err or "undefinedtable" in err:
            raise HTTPException(status_code=503, detail=_AUDIT_TABLE_HINT) from e
        raise

    return AuditLogListResponse(
        items=[AuditLogRead.model_validate(r) for r in rows],
        total=total,
    )
