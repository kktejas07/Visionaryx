"""Analytics endpoints — overview, trends, recent detections, object stats."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query

from deps import current_user, get_db

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
async def analytics_overview(_: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    db = get_db()
    total_users = await db.users.count_documents({})
    total_cameras = await db.cameras.count_documents({})
    active_cameras = await db.cameras.count_documents({"is_enabled": True, "status": "active"})
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    detections_today = await db.alerts.count_documents({"timestamp": {"$gte": today_start}})
    unknown_today = await db.alerts.count_documents(
        {"timestamp": {"$gte": today_start}, "alert_type": "Unrecognized entry"}
    )

    now = datetime.now(timezone.utc)
    last7_start = now - timedelta(days=7)
    prev14_start = now - timedelta(days=14)
    last7 = await db.alerts.count_documents({"timestamp": {"$gte": last7_start}})
    prev7 = await db.alerts.count_documents(
        {"timestamp": {"$gte": prev14_start, "$lt": last7_start}}
    )
    if prev7 > 0:
        trend_pct = round(((last7 - prev7) / prev7) * 100, 1)
    elif last7 > 0:
        trend_pct = 100.0
    else:
        trend_pct = 0.0

    return {
        "total_users": total_users,
        "total_cameras": total_cameras,
        "active_cameras": active_cameras,
        "detections_today": detections_today,
        "unknown_detections_today": unknown_today,
        "detection_trend_7d": trend_pct,
        "detections_last_7d": last7,
        "detections_prev_7d": prev7,
    }


@router.get("/detection-trends")
async def detection_trends(
    days: int = Query(7, ge=1, le=90),
    _: dict[str, Any] = Depends(current_user),
) -> list[dict[str, Any]]:
    db = get_db()
    docs = await db.detection_trends.find().sort("date", -1).to_list(days)
    docs.reverse()
    return [{"date": d["date"], "count": d["count"]} for d in docs]


@router.get("/recent-detections")
async def analytics_recent_detections(
    limit: int = Query(10, ge=1, le=100),
    _: dict[str, Any] = Depends(current_user),
) -> list[dict[str, Any]]:
    db = get_db()
    docs = await db.alerts.find().sort("timestamp", -1).limit(limit).to_list(limit)
    return [
        {
            "id": d["_id"],
            "camera_name": d.get("camera_name"),
            "status": "known" if "Face" in d.get("alert_type", "") else "unknown",
            "confidence": d.get("confidence", 0.85),
            "timestamp": d["timestamp"].isoformat() if isinstance(d["timestamp"], datetime) else d["timestamp"],
        }
        for d in docs
    ]


@router.get("/detection-status-trends")
async def analytics_status_trends(
    days: int = Query(14, ge=1, le=90),
    _: dict[str, Any] = Depends(current_user),
) -> list[dict[str, Any]]:
    """Real known/unknown split per day, computed from `db.alerts`.

    "known"   = alert_type contains "Face" (face-match events)
    "unknown" = everything else (unrecognized entries, forced entry, etc.)
    """
    db = get_db()
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    pipeline = [
        {"$match": {"timestamp": {"$gte": start}}},
        {
            "$group": {
                "_id": {
                    "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                    "is_known": {
                        "$cond": [{"$regexMatch": {"input": "$alert_type", "regex": "Face"}}, True, False]
                    },
                },
                "n": {"$sum": 1},
            }
        },
    ]
    raw = await db.alerts.aggregate(pipeline).to_list(None)

    by_date: dict[str, dict[str, int]] = {}
    for r in raw:
        d = r["_id"]["date"]
        bucket = by_date.setdefault(d, {"known": 0, "unknown": 0})
        if r["_id"]["is_known"]:
            bucket["known"] += r["n"]
        else:
            bucket["unknown"] += r["n"]

    # Emit a row per day in chronological order even if there were 0 alerts.
    out: list[dict[str, Any]] = []
    for i in range(days):
        day = (start + timedelta(days=i)).date().isoformat()
        b = by_date.get(day, {"known": 0, "unknown": 0})
        out.append({"date": day, "known": b["known"], "unknown": b["unknown"]})
    return out


@router.get("/object-stats")
async def analytics_object_stats(
    days: int = Query(14, ge=1, le=90),
    _: dict[str, Any] = Depends(current_user),
) -> list[dict[str, Any]]:
    """Object-class counts derived from `alert_type` strings in `db.alerts`."""
    db = get_db()
    start = datetime.now(timezone.utc) - timedelta(days=days)
    # Heuristic: map alert types → object class.
    pipeline = [
        {"$match": {"timestamp": {"$gte": start}}},
        {"$group": {"_id": "$alert_type", "n": {"$sum": 1}}},
    ]
    raw = await db.alerts.aggregate(pipeline).to_list(None)
    buckets = {"person": 0, "vehicle": 0, "bag": 0, "package": 0, "animal": 0, "other": 0}
    for r in raw:
        t = (r["_id"] or "").lower()
        n = r["n"]
        if "face" in t or "entry" in t or "loiter" in t or "person" in t:
            buckets["person"] += n
        elif "vehicle" in t or "car" in t:
            buckets["vehicle"] += n
        elif "bag" in t:
            buckets["bag"] += n
        elif "package" in t:
            buckets["package"] += n
        elif "animal" in t:
            buckets["animal"] += n
        else:
            buckets["other"] += n
    return [{"object": k, "count": v} for k, v in buckets.items() if v > 0] or [{"object": "person", "count": 0}]
