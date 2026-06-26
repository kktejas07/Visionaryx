"""
Admin maintenance: purge old rows (detections, optional alerts/objects).
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser
from app.database.connection import get_db
from app.database.models import Alert, Detection, ObjectDetection, UnknownFace

router = APIRouter()


class PurgeRequest(BaseModel):
    """Delete rows older than this many days (destructive)."""

    days: int = Field(30, ge=1, le=3650, description="Delete data older than N days")
    include_alerts: bool = Field(False, description="Also delete old alerts")
    include_objects: bool = Field(True, description="Delete old object-detection rows")
    include_unknown_faces: bool = Field(False, description="Delete old unknown_face snapshot rows")


class PurgeResponse(BaseModel):
    detections_deleted: int
    alerts_deleted: int
    objects_deleted: int
    unknown_faces_deleted: int
    cutoff_iso: str


@router.post("/purge-old-data", response_model=PurgeResponse)
async def purge_old_data(
    body: PurgeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
):
    """
    Permanently remove historical rows before `now - days`. Use for retention / disk cleanup.
    """
    cutoff = datetime.utcnow() - timedelta(days=body.days)

    r_det = await db.execute(delete(Detection).where(Detection.timestamp < cutoff))
    det_n = r_det.rowcount or 0

    r_obj = None
    if body.include_objects:
        r_obj = await db.execute(delete(ObjectDetection).where(ObjectDetection.timestamp < cutoff))
    obj_n = (r_obj.rowcount or 0) if r_obj is not None else 0

    r_uf = None
    if body.include_unknown_faces:
        r_uf = await db.execute(delete(UnknownFace).where(UnknownFace.timestamp < cutoff))
    uf_n = (r_uf.rowcount or 0) if r_uf is not None else 0

    r_al = None
    if body.include_alerts:
        r_al = await db.execute(delete(Alert).where(Alert.timestamp < cutoff))
    al_n = (r_al.rowcount or 0) if r_al is not None else 0

    return PurgeResponse(
        detections_deleted=det_n,
        alerts_deleted=al_n,
        objects_deleted=obj_n,
        unknown_faces_deleted=uf_n,
        cutoff_iso=cutoff.isoformat(),
    )


@router.get("/storage-summary")
async def storage_summary(
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
):
    """Rough row counts for admin dashboard."""
    d = await db.execute(select(func.count(Detection.id)))
    a = await db.execute(select(func.count(Alert.id)))
    o = await db.execute(select(func.count(ObjectDetection.id)))
    u = await db.execute(select(func.count(UnknownFace.id)))
    return {
        "detections": d.scalar() or 0,
        "alerts": a.scalar() or 0,
        "object_detections": o.scalar() or 0,
        "unknown_face_snapshots": u.scalar() or 0,
    }
