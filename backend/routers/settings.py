"""Settings endpoints — SMTP email config + test."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from deps import get_db, require_admin, write_audit

router = APIRouter(prefix="/settings", tags=["settings"])


class EmailSettingsPatch(BaseModel):
    enabled: bool | None = None
    host: str | None = None
    port: int | None = None
    user: str | None = None
    smtp_password: str | None = None
    from_email: str | None = None
    from_name: str | None = None
    use_tls: bool | None = None
    use_ssl: bool | None = None
    public_base_url: str | None = None


@router.get("/email")
async def settings_email(_: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    db = get_db()
    doc = await db.settings.find_one({"_id": "email"}) or {}
    return {
        "enabled": doc.get("enabled", False),
        "host": doc.get("host", ""),
        "port": doc.get("port", 587),
        "user": doc.get("user", ""),
        "from_email": doc.get("from_email", ""),
        "from_name": doc.get("from_name", "VisionaryX Alerts"),
        "use_tls": doc.get("use_tls", True),
        "use_ssl": doc.get("use_ssl", False),
        "public_base_url": doc.get("public_base_url", ""),
        "password_configured": bool(doc.get("password")),
        "public_dashboard_url_default": os.environ.get("APP_URL", ""),
    }


@router.patch("/email")
async def settings_email_patch(
    body: EmailSettingsPatch, request: Request, admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    db = get_db()
    update: dict[str, Any] = {}
    changed: list[str] = []
    for k, v in body.model_dump(exclude_none=True).items():
        if k == "smtp_password":
            update["password"] = v
            changed.append("password")
        else:
            update[k] = v
            changed.append(k)
    update["updated_at"] = datetime.now(timezone.utc)
    await db.settings.update_one({"_id": "email"}, {"$set": update}, upsert=True)
    await write_audit(
        action="settings.email.update", actor=admin, request=request,
        resource_type="settings", resource_id="email",
        detail={"fields": changed},
    )
    return {"ok": True}


@router.post("/email/test")
async def settings_email_test(
    body: dict[str, str], _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    to = body.get("to", "")
    if not to:
        raise HTTPException(status_code=400, detail="Missing 'to' address")
    return {"ok": True, "to": to, "mocked": True}
