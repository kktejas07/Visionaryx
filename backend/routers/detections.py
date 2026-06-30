"""Detections + Audit list endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query

from deps import current_user, get_db, require_admin

router = APIRouter(tags=["detections"])


@router.get("/detections")
async def list_detections(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = None,
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """Recent detections — reuses alerts collection as the events log."""
    db = get_db()
    flt: dict[str, Any] = {}
    if q:
        flt["$or"] = [
            {"alert_type": {"$regex": q, "$options": "i"}},
            {"message": {"$regex": q, "$options": "i"}},
            {"camera_name": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.alerts.find(flt).sort("timestamp", -1).skip(offset).limit(limit).to_list(limit)
    return {
        "items": [
            {
                "id": d["_id"],
                "camera_name": d.get("camera_name"),
                "user_name": "Operator" if "Face" in d.get("alert_type", "") else None,
                "status": "known" if "Face" in d.get("alert_type", "") else "unknown",
                "confidence": d.get("confidence", 0.85),
                "timestamp": d["timestamp"].isoformat() if isinstance(d["timestamp"], datetime) else d["timestamp"],
            }
            for d in docs
        ],
        "total": await db.alerts.count_documents(flt),
    }


@router.get("/audit")
async def list_audit(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    actor: str | None = Query(None, description="Filter by actor email substring"),
    action: str | None = Query(None, description="Exact action match (e.g. 'auth.login')"),
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    db = get_db()
    flt: dict[str, Any] = {}
    if actor:
        flt["actor_email"] = {"$regex": actor, "$options": "i"}
    if action:
        flt["action"] = action
    cursor = db.audit_logs.find(flt).sort("created_at", -1).skip(offset).limit(limit)
    docs = await cursor.to_list(limit)
    return {
        "items": [
            {
                "id": d["_id"],
                "actor_email": d.get("actor_email"),
                "actor_id": d.get("actor_id"),
                "action": d.get("action"),
                "resource_type": d.get("resource_type"),
                "resource_id": d.get("resource_id"),
                "detail": d.get("detail") or {},
                "ip": d.get("ip"),
                "created_at": d["created_at"].isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at"),
            }
            for d in docs
        ],
        "total": await db.audit_logs.count_documents(flt),
    }
