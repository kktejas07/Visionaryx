"""Unified activity stream — merges last N audit events + agent runs + alerts
into one chronological feed for the Dashboard.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query

from deps import current_user, get_db

router = APIRouter(tags=["activity"])


def _iso(v: Any) -> str | None:
    if v is None:
        return None
    return v.isoformat() if isinstance(v, datetime) else str(v)


@router.get("/activity")
async def activity_feed(
    limit: int = Query(15, ge=1, le=50),
    user: dict[str, Any] = Depends(current_user),
) -> list[dict[str, Any]]:
    """Mixed chronological stream sourced from `audit_logs`, `ai_agent_runs`
    and `alerts`. Admins see everything; non-admins see only alerts + their
    own agent runs (audit events suppressed for non-admins).
    """
    db = get_db()
    is_admin = user.get("role") == "admin"

    out: list[dict[str, Any]] = []

    # Alerts (everyone)
    async for d in db.alerts.find().sort("timestamp", -1).limit(limit):
        out.append({
            "id": f"alert:{d['_id']}",
            "kind": "alert",
            "title": d.get("alert_type", "Alert"),
            "subtitle": d.get("message") or d.get("camera_name") or "",
            "severity": d.get("severity", "info"),
            "actor": d.get("camera_name"),
            "icon": "bell-ring-outline",
            "ts": _iso(d.get("timestamp")),
            "ref": d["_id"],
        })

    # Agent runs (admin: all, others: own)
    runs_query: dict[str, Any] = {} if is_admin else {"actor_email": user.get("email")}
    async for d in db.ai_agent_runs.find(runs_query).sort("started_at", -1).limit(limit):
        out.append({
            "id": f"run:{d['_id']}",
            "kind": "agent_run",
            "title": f"Agent run · {d.get('status', 'complete').upper()}",
            "subtitle": (d.get("input") or "")[:120],
            "severity": "info" if d.get("status") == "complete" else "warning",
            "actor": d.get("model_id"),
            "icon": "robot-happy-outline",
            "ts": _iso(d.get("started_at")),
            "ref": d["_id"],
            "duration_ms": d.get("duration_ms"),
            "tool_calls": len(d.get("tool_calls") or []),
        })

    # Audit (admin only)
    if is_admin:
        async for d in db.audit_logs.find().sort("created_at", -1).limit(limit):
            out.append({
                "id": f"audit:{d['_id']}",
                "kind": "audit",
                "title": d.get("action", "system"),
                "subtitle": f"{d.get('actor_email') or 'system'}"
                            f"{(' · ' + str(d['resource_type'])) if d.get('resource_type') else ''}",
                "severity": "danger" if "failed" in (d.get("action") or "") else "info",
                "actor": d.get("actor_email"),
                "icon": "shield-check-outline",
                "ts": _iso(d.get("created_at")),
                "ref": d["_id"],
                "ip": d.get("ip"),
            })

    # Sort chronologically (newest first) — drop entries missing a ts.
    out = [o for o in out if o.get("ts")]
    out.sort(key=lambda o: str(o["ts"]), reverse=True)
    return out[:limit]
