"""
Visioryx - Cameras API
Camera management endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser, SurveillanceUser
from app.database.connection import get_db
from app.database.models import Camera
from app.schemas.cameras import CameraCreate, CameraResponse, CameraUpdate
from app.services.audit_service import record_audit

router = APIRouter()


@router.get("", response_model=list[CameraResponse])
async def list_cameras(
    db: AsyncSession = Depends(get_db),
    current_user: SurveillanceUser = None,
):
    """List all cameras (operators + admins; mutations remain admin-only)."""
    result = await db.execute(select(Camera).order_by(Camera.id))
    return result.scalars().all()


@router.post("", response_model=CameraResponse)
async def create_camera(
    data: CameraCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
):
    """Add a new camera."""
    camera = Camera(camera_name=data.camera_name, rtsp_url=data.rtsp_url)
    db.add(camera)
    await db.flush()
    await db.refresh(camera)
    await record_audit(
        db,
        actor=current_user,
        action="camera.create",
        resource_type="camera",
        resource_id=camera.id,
        detail={"camera_name": camera.camera_name},
    )
    return camera


@router.get("/{camera_id}", response_model=CameraResponse)
async def get_camera(
    camera_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: SurveillanceUser = None,
):
    """Get camera by ID."""
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera


@router.patch("/{camera_id}", response_model=CameraResponse)
async def update_camera(
    camera_id: int,
    data: CameraUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
):
    """Update camera."""
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(camera, k, v)
    await db.flush()
    await db.refresh(camera)
    await record_audit(
        db,
        actor=current_user,
        action="camera.update",
        resource_type="camera",
        resource_id=camera.id,
        detail={"camera_name": camera.camera_name},
    )
    return camera


@router.delete("/{camera_id}")
async def delete_camera(
    camera_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AdminUser = None,
):
    """Delete camera."""
    result = await db.execute(select(Camera).where(Camera.id == camera_id))
    camera = result.scalar_one_or_none()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    await record_audit(
        db,
        actor=current_user,
        action="camera.delete",
        resource_type="camera",
        resource_id=camera.id,
        detail={"camera_name": camera.camera_name},
    )
    await db.delete(camera)
    return {"ok": True}
