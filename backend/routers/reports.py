"""Reports — filterable detection records + analytics summaries."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query

from deps import current_user, get_db

router = APIRouter(prefix="/reports", tags=["reports"])


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


@router.get("/detections")
async def report_detections(
    start: str | None = Query(None, description="ISO8601 start"),
    end: str | None = Query(None, description="ISO8601 end"),
    person: str | None = Query(None, description="Substring match on actor/camera/message"),
    camera_id: str | None = Query(None),
    status: str | None = Query(None, description="known | unknown"),
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    db = get_db()
    flt: dict[str, Any] = {}
    ts_range: dict[str, Any] = {}
    if (s := _parse_iso(start)):
        ts_range["$gte"] = s
    if (e := _parse_iso(end)):
        ts_range["$lte"] = e
    if ts_range:
        flt["timestamp"] = ts_range
    if camera_id:
        flt["camera_id"] = camera_id
    if person:
        flt["$or"] = [
            {"message": {"$regex": person, "$options": "i"}},
            {"alert_type": {"$regex": person, "$options": "i"}},
            {"camera_name": {"$regex": person, "$options": "i"}},
        ]
    if status == "known":
        flt["alert_type"] = {"$regex": "Face", "$options": "i"}
    elif status == "unknown":
        flt["alert_type"] = {"$not": {"$regex": "Face", "$options": "i"}}
    docs = await db.alerts.find(flt).sort("timestamp", -1).skip(offset).limit(limit).to_list(limit)
    total = await db.alerts.count_documents(flt)
    return {
        "items": [
            {
                "id": d["_id"],
                "timestamp": d["timestamp"].isoformat() if isinstance(d["timestamp"], datetime) else d["timestamp"],
                "alert_type": d.get("alert_type"),
                "severity": d.get("severity"),
                "message": d.get("message"),
                "camera_name": d.get("camera_name"),
                "camera_id": d.get("camera_id"),
                "status": "known" if "Face" in d.get("alert_type", "") else "unknown",
                "confidence": d.get("confidence"),
            }
            for d in docs
        ],
        "total": total,
    }


@router.get("/summary")
async def report_summary(
    days: int = Query(30, ge=1, le=180),
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    """High-level KPIs + chart-ready buckets."""
    db = get_db()
    start = datetime.now(timezone.utc) - timedelta(days=days)
    flt = {"timestamp": {"$gte": start}}

    total = await db.alerts.count_documents(flt)
    known = await db.alerts.count_documents({**flt, "alert_type": {"$regex": "Face", "$options": "i"}})
    unknown = total - known

    # Per-day timeseries
    per_day = await db.alerts.aggregate([
        {"$match": flt},
        {"$group": {
            "_id": {
                "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                "known": {"$cond": [{"$regexMatch": {"input": "$alert_type", "regex": "Face"}}, True, False]},
            },
            "n": {"$sum": 1},
        }},
    ]).to_list(None)
    by_date: dict[str, dict[str, int]] = {}
    for r in per_day:
        d = r["_id"]["date"]
        b = by_date.setdefault(d, {"known": 0, "unknown": 0})
        if r["_id"]["known"]:
            b["known"] += r["n"]
        else:
            b["unknown"] += r["n"]
    timeseries = [
        {"date": d, "known": v["known"], "unknown": v["unknown"], "total": v["known"] + v["unknown"]}
        for d, v in sorted(by_date.items())
    ]

    # Top cameras
    by_camera = await db.alerts.aggregate([
        {"$match": flt},
        {"$group": {"_id": "$camera_name", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}},
        {"$limit": 10},
    ]).to_list(None)
    top_cameras = [{"camera": r["_id"] or "Unknown", "count": r["n"]} for r in by_camera]

    # Top persons (parsed from message for face matches)
    by_person = await db.alerts.aggregate([
        {"$match": {**flt, "alert_type": {"$regex": "Face", "$options": "i"}}},
        {"$group": {"_id": "$message", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}},
        {"$limit": 10},
    ]).to_list(None)
    top_persons = [{"person": (r["_id"] or "Unknown")[:60], "count": r["n"]} for r in by_person]

    # Severity histogram
    by_sev = await db.alerts.aggregate([
        {"$match": flt},
        {"$group": {"_id": "$severity", "n": {"$sum": 1}}},
    ]).to_list(None)
    by_severity = [{"severity": r["_id"] or "info", "count": r["n"]} for r in by_sev]

    # Hourly distribution
    by_hour = await db.alerts.aggregate([
        {"$match": flt},
        {"$group": {"_id": {"$hour": "$timestamp"}, "n": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]).to_list(None)
    hours = {r["_id"]: r["n"] for r in by_hour}
    hourly = [{"hour": h, "count": hours.get(h, 0)} for h in range(24)]

    return {
        "window_days": days,
        "totals": {"total": total, "known": known, "unknown": unknown,
                   "known_pct": round(100 * known / total, 1) if total else 0},
        "timeseries": timeseries,
        "top_cameras": top_cameras,
        "top_persons": top_persons,
        "by_severity": by_severity,
        "hourly": hourly,
    }
