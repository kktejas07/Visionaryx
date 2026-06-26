"""Alerts endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from deps import current_user, get_db

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _alert_public(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": doc["_id"],
        "alert_type": doc["alert_type"],
        "severity": doc.get("severity", "info"),
        "message": doc.get("message", ""),
        "is_read": doc.get("is_read", False),
        "timestamp": doc["timestamp"].isoformat() if isinstance(doc["timestamp"], datetime) else doc["timestamp"],
        "camera_id": doc.get("camera_id"),
        "camera_name": doc.get("camera_name"),
    }


@router.get("")
async def list_alerts(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: str | None = None,
    severity: str | None = None,
    camera_id: str | None = None,
    today_only: bool = False,
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    db = get_db()
    flt: dict[str, Any] = {}
    if q:
        flt["$or"] = [
            {"alert_type": {"$regex": q, "$options": "i"}},
            {"message": {"$regex": q, "$options": "i"}},
        ]
    if severity and severity.lower() != "all":
        flt["severity"] = severity.lower()
    if camera_id:
        flt["camera_id"] = camera_id
    if today_only:
        flt["timestamp"] = {
            "$gte": datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        }
    total = await db.alerts.count_documents(flt)
    items = (
        await db.alerts.find(flt).sort("timestamp", -1).skip(offset).limit(limit).to_list(limit)
    )
    return {"items": [_alert_public(i) for i in items], "total": total}


@router.patch("/{alert_id}/read")
async def mark_alert_read(alert_id: str, _: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    db = get_db()
    r = await db.alerts.find_one_and_update(
        {"_id": alert_id}, {"$set": {"is_read": True}}, return_document=True,
    )
    if r is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    return _alert_public(r)


@router.post("/mark-all-read")
async def mark_all_alerts_read(_: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    db = get_db()
    r = await db.alerts.update_many({"is_read": False}, {"$set": {"is_read": True}})
    return {"modified": r.modified_count}
