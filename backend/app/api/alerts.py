"""
Visioryx - Alerts API
Alert management and listing.
"""
import csv
import io
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SurveillanceUser
from app.database.connection import get_db
from app.database.models import Alert
from app.schemas.alerts import AlertItem, AlertListResponse

router = APIRouter()


def _alerts_where(unread_only: bool, q: Optional[str], severity: Optional[str], camera_id: Optional[int], today_only: bool):
    filt_parts = []
    if unread_only:
        filt_parts.append(Alert.is_read == False)  # noqa: E712
    if q and q.strip():
        term = f"%{q.strip()}%"
        filt_parts.append(or_(Alert.message.ilike(term), Alert.alert_type.ilike(term)))
    if severity and severity.strip() and severity.strip().lower() != 'all':
        filt_parts.append(Alert.severity.ilike(f"%{severity.strip()}%"))
    if camera_id is not None and camera_id > 0:
        filt_parts.append(Alert.camera_id == camera_id)
    if today_only:
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        filt_parts.append(Alert.timestamp >= today_start)
    return and_(*filt_parts) if filt_parts else None


@router.get("", response_model=AlertListResponse)
async def list_alerts(
    db: AsyncSession = Depends(get_db),
    current_user: SurveillanceUser = None,
    unread_only: bool = False,
    q: Optional[str] = Query(None, description="Search message or alert type"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    camera_id: Optional[int] = Query(None, description="Filter by camera ID"),
    today_only: bool = Query(False, description="Filter to today's alerts only"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """List alerts with optional search and pagination."""
    where_clause = _alerts_where(unread_only, q, severity, camera_id, today_only)

    count_stmt = select(func.count(Alert.id))
    if where_clause is not None:
        count_stmt = count_stmt.where(where_clause)
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = select(Alert).order_by(Alert.timestamp.desc()).limit(limit).offset(offset)
    if where_clause is not None:
        stmt = stmt.where(where_clause)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return AlertListResponse(
        items=[AlertItem.model_validate(a) for a in rows],
        total=total,
    )


@router.get("/export.csv")
async def export_alerts_csv(
    db: AsyncSession = Depends(get_db),
    current_user: SurveillanceUser = None,
    unread_only: bool = False,
    q: Optional[str] = Query(None, max_length=200, description="Search message or alert type"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    camera_id: Optional[int] = Query(None, description="Filter by camera ID"),
    today_only: bool = Query(False, description="Filter to today's alerts only"),
    export_limit: int = Query(10000, le=50000),
):
    """Download alerts as CSV (same filters as list; capped rows)."""
    where_clause = _alerts_where(unread_only, q, severity, camera_id, today_only)
    stmt = select(Alert).order_by(Alert.timestamp.desc()).limit(export_limit)
    if where_clause is not None:
        stmt = stmt.where(where_clause)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "alert_type", "message", "severity", "is_read", "timestamp_iso"])
    for a in rows:
        writer.writerow(
            [
                a.id,
                a.alert_type,
                (a.message or "").replace("\n", " ").replace("\r", " ")[:2000],
                a.severity,
                a.is_read,
                a.timestamp.isoformat(),
            ]
        )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="visioryx-alerts.csv"'},
    )


@router.post("/mark-all-read")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: SurveillanceUser = None,
):
    """Mark every alert as read."""
    res = await db.execute(update(Alert).values(is_read=True))
    return {"ok": True, "updated": res.rowcount or 0}


@router.post("/mark-all-unread")
async def mark_all_unread(
    db: AsyncSession = Depends(get_db),
    current_user: SurveillanceUser = None,
):
    """Mark every alert as unread."""
    res = await db.execute(update(Alert).values(is_read=False))
    return {"ok": True, "updated": res.rowcount or 0}


@router.patch("/{alert_id}/read")
async def mark_read(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: SurveillanceUser = None,
):
    """Mark alert as read."""
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        return {"ok": False}
    alert.is_read = True
    await db.flush()
    return {"ok": True}
