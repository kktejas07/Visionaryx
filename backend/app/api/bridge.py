"""
Bridge agent setup wizard — generates a one-liner Docker command
that proxies local RTSP cameras into the cloud backend.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser
from app.core.config import get_settings
from app.database.connection import get_db
from app.services.audit_service import record_audit
from app.services.bridge_config_store import (
    generate_bridge_token,
    load_bridge_config,
    save_bridge_config,
)
from app.services.runtime_app_settings import get_public_api_url

router = APIRouter()


class BridgeSettingsResponse(BaseModel):
    enabled: bool
    token_configured: bool
    docker_command: str


class BridgeGenerateResponse(BaseModel):
    token: str
    docker_command: str


@router.get("/bridge", response_model=BridgeSettingsResponse)
async def get_bridge_settings(
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    cfg = await load_bridge_config(db)
    settings = get_settings()
    api_url = get_public_api_url() or settings.PUBLIC_DASHBOARD_URL
    token = cfg.get("token", "")
    enabled = bool(cfg.get("enabled"))
    cmd = _build_docker_command(token, api_url, settings.APP_NAME)
    return BridgeSettingsResponse(
        enabled=enabled,
        token_configured=bool(token),
        docker_command=cmd,
    )


@router.post("/bridge/generate", response_model=BridgeGenerateResponse)
async def generate_bridge_token(
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    cfg = await load_bridge_config(db)
    token = generate_bridge_token()
    cfg["token"] = token
    cfg["enabled"] = True
    cfg["created_at"] = datetime.now(timezone.utc).isoformat()
    await save_bridge_config(db, cfg)
    await record_audit(
        db,
        actor=current_user,
        action="settings.bridge.generate",
        resource_type="settings",
        resource_id=None,
        detail={"enabled": True},
    )
    await db.commit()
    settings = get_settings()
    api_url = get_public_api_url() or settings.PUBLIC_DASHBOARD_URL
    cmd = _build_docker_command(token, api_url, settings.APP_NAME)
    return BridgeGenerateResponse(token=token, docker_command=cmd)


@router.post("/bridge/revoke")
async def revoke_bridge_token(
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    cfg = await load_bridge_config(db)
    cfg["token"] = ""
    cfg["enabled"] = False
    cfg["created_at"] = None
    await save_bridge_config(db, cfg)
    await record_audit(
        db,
        actor=current_user,
        action="settings.bridge.revoke",
        resource_type="settings",
        resource_id=None,
        detail={"enabled": False},
    )
    await db.commit()
    return {"ok": True, "message": "Bridge token revoked"}


def _build_docker_command(token: str, api_url: str, app_name: str) -> str:
    if not token:
        return ""
    parts = [
        "docker run -d",
        f"  --name {app_name.lower()}-bridge",
        f"  -e VX_API_URL={api_url}",
        f"  -e VX_TOKEN={token}",
        "  --restart unless-stopped",
        "  visionaryx/bridge:latest",
    ]
    return " \\\n".join(parts)
