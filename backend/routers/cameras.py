"""Cameras + stream endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from deps import current_user, get_db, require_admin
from schemas import CameraIn, CameraPatch

router = APIRouter(tags=["cameras"])


def _camera_public(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": doc["_id"],
        "camera_name": doc["camera_name"],
        "rtsp_url": doc["rtsp_url"],
        "is_enabled": doc.get("is_enabled", True),
        "status": doc.get("status", "active"),
    }


@router.get("/cameras")
async def list_cameras(_: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    db = get_db()
    docs = await db.cameras.find().to_list(None)
    return [_camera_public(d) for d in docs]


@router.post("/cameras", status_code=201)
async def create_camera(body: CameraIn, _: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    db = get_db()
    doc = {
        "_id": str(uuid.uuid4()),
        "camera_name": body.camera_name,
        "rtsp_url": body.rtsp_url,
        "is_enabled": body.is_enabled,
        "status": "active" if body.is_enabled else "offline",
        "created_at": datetime.now(timezone.utc),
    }
    await db.cameras.insert_one(doc)
    return _camera_public(doc)


@router.patch("/cameras/{camera_id}")
async def patch_camera(
    camera_id: str, body: CameraPatch, _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    db = get_db()
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "is_enabled" in update:
        update["status"] = "active" if update["is_enabled"] else "offline"
    result = await db.cameras.find_one_and_update(
        {"_id": camera_id}, {"$set": update}, return_document=True,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return _camera_public(result)


@router.delete("/cameras/{camera_id}")
async def delete_camera(camera_id: str, _: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    db = get_db()
    r = await db.cameras.delete_one({"_id": camera_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Camera not found")
    return {"ok": True}


@router.get("/stream/status")
async def stream_status(_: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    db = get_db()
    docs = await db.cameras.find({"is_enabled": True, "status": "active"}).to_list(None)
    return {"active_camera_ids": [d["_id"] for d in docs]}
