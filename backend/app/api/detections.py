"""
Visioryx - Detections API
Detection history and search endpoints.
"""
import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import SurveillanceUser
from app.database.connection import get_db
from app.database.models import Camera, Detection, UnknownFace, User
from app.schemas.detections import DetectionListItem, DetectionListResponse

router = APIRouter()


def _detection_to_item(d: Detection) -> DetectionListItem:
    cam = d.camera
    usr = d.user
    return DetectionListItem(
        id=d.id,
        camera_id=d.camera_id,
        camera_name=cam.camera_name if cam else None,
        user_id=d.user_id,
        user_name=usr.name if usr else None,
        status=d.status,
        confidence=d.confidence,
        timestamp=d.timestamp,
    )


def _detection_filters(
    *,
    camera_id: Optional[int],
    status_filter: Optional[str],
    from_date: Optional[datetime],
    to_date: Optional[datetime],
    q: Optional[str],
) -> Optional[object]:
    parts = []
    if camera_id is not None:
        parts.append(Detection.camera_id == camera_id)
    if status_filter:
        parts.append(Detection.status == status_filter)
    if from_date:
        parts.append(Detection.timestamp >= from_date)
    if to_date:
        parts.append(Detection.timestamp <= to_date)
    if q and q.strip():
        s = q.strip()
        term = f"%{s}%"
        term_conds = [
            Camera.camera_name.ilike(term),
            User.name.ilike(term),
        ]
        if s.isdigit():
            term_conds.append(Detection.id == int(s))
        parts.append(or_(*term_conds))
    if not parts:
        return None
    return and_(*parts)


@router.get("", response_model=DetectionListResponse)
async def list_detections(
    db: AsyncSession = Depends(get_db),
    current_user: SurveillanceUser = None,
    camera_id: Optional[int] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    q: Optional[str] = Query(None, max_length=200, description="Search camera name, person name, or numeric id"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
):
    """List detections with filters and pagination."""
    where_clause = _detection_filters(
        camera_id=camera_id,
        status_filter=status_filter,
        from_date=from_date,
        to_date=to_date,
        q=q,
    )
    count_stmt = (
        select(func.count(Detection.id))
        .select_from(Detection)
        .outerjoin(Camera, Detection.camera_id == Camera.id)
        .outerjoin(User, Detection.user_id == User.id)
    )
    if where_clause is not None:
        count_stmt = count_stmt.where(where_clause)
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        select(Detection)
        .outerjoin(Camera, Detection.camera_id == Camera.id)
        .outerjoin(User, Detection.user_id == User.id)
        .options(selectinload(Detection.user), selectinload(Detection.camera))
        .order_by(Detection.timestamp.desc())
        .limit(limit)
        .offset(offset)
    )
    if where_clause is not None:
        stmt = stmt.where(where_clause)
    result = await db.execute(stmt)
    rows = result.scalars().unique().all()
    return DetectionListResponse(
        items=[_detection_to_item(d) for d in rows],
        total=total,
    )


@router.get("/export.csv")
async def export_detections_csv(
    db: AsyncSession = Depends(get_db),
    current_user: SurveillanceUser = None,
    camera_id: Optional[int] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    q: Optional[str] = Query(None),
    export_limit: int = Query(10000, le=50000),
):
    """Download detections as CSV (same filters as list; capped rows)."""
    where_clause = _detection_filters(
        camera_id=camera_id,
        status_filter=status_filter,
        from_date=from_date,
        to_date=to_date,
        q=q,
    )
    stmt = (
        select(Detection)
        .outerjoin(Camera, Detection.camera_id == Camera.id)
        .outerjoin(User, Detection.user_id == User.id)
        .options(selectinload(Detection.user), selectinload(Detection.camera))
        .order_by(Detection.timestamp.desc())
        .limit(export_limit)
    )
    if where_clause is not None:
        stmt = stmt.where(where_clause)
    result = await db.execute(stmt)
    rows = result.scalars().unique().all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["id", "camera_id", "camera_name", "user_name", "status", "confidence", "timestamp_iso"]
    )
    for d in rows:
        item = _detection_to_item(d)
        writer.writerow(
            [
                item.id,
                item.camera_id,
                item.camera_name or "",
                item.user_name or "",
                item.status,
                item.confidence,
                item.timestamp.isoformat(),
            ]
        )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="visioryx-detections.csv"'},
    )


@router.get("/unknown-faces")
async def list_unknown_faces(
    db: AsyncSession = Depends(get_db),
    current_user: SurveillanceUser = None,
    cluster_id: Optional[int] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
):
    """List unknown face snapshots."""
    q = select(UnknownFace).order_by(UnknownFace.timestamp.desc())
    if cluster_id is not None:
        q = q.where(UnknownFace.cluster_id == cluster_id)
    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/stats")
async def detection_stats(
    db: AsyncSession = Depends(get_db),
    current_user: SurveillanceUser = None,
):
    """Today's detection counts."""
    today = datetime.utcnow().date()
    total = await db.execute(
        select(func.count(Detection.id)).where(
            func.date(Detection.timestamp) == today
        )
    )
    unknown = await db.execute(
        select(func.count(Detection.id)).where(
            and_(
                func.date(Detection.timestamp) == today,
                Detection.status == "unknown"
            )
        )
    )
    return {
        "today_total": total.scalar() or 0,
        "today_unknown": unknown.scalar() or 0,
    }
