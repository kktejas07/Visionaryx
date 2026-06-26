"""
Admin SMTP / email settings and test send (stored in app_settings).
Supports SMTP and Postal HTTP API providers.
"""
from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminUser
from app.core.config import get_settings
from app.database.connection import get_db
from app.services.smtp_config_store import load_smtp_settings, save_smtp_settings
from app.services.smtp_mailer import public_dashboard_base_for_links, public_smtp_view, send_email_sync
from app.services.audit_service import record_audit

router = APIRouter()


class EmailSettingsResponse(BaseModel):
    provider: str
    enabled: bool
    host: str
    port: int
    user: str
    from_email: str
    from_name: str
    use_tls: bool
    use_ssl: bool
    public_base_url: str
    password_configured: bool
    postal_host: str
    postal_api_key_configured: bool
    public_dashboard_url_default: str


class EmailSettingsPatch(BaseModel):
    provider: Optional[str] = Field(default=None, description="'smtp' or 'postal'")
    enabled: Optional[bool] = None
    host: Optional[str] = None
    port: Optional[int] = None
    user: Optional[str] = None
    smtp_password: Optional[str] = Field(
        default=None,
        description="Set new SMTP password. Omit to keep existing. Send empty string to clear.",
    )
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    use_tls: Optional[bool] = None
    use_ssl: Optional[bool] = None
    public_base_url: Optional[str] = Field(
        default=None,
        description="Dashboard base URL for enrollment links (e.g. https://visioryx.example.com). Empty = use env PUBLIC_DASHBOARD_URL.",
    )
    postal_host: Optional[str] = Field(
        default=None,
        description="Postal server URL (e.g. https://postal.example.com)",
    )
    postal_api_key: Optional[str] = Field(
        default=None,
        description="Postal API key. Omit to keep existing. Send empty string to clear.",
    )


class EmailTestRequest(BaseModel):
    to: EmailStr


class EnrollmentBaseUrlResponse(BaseModel):
    base_url: str


@router.get("/enrollment-base-url", response_model=EnrollmentBaseUrlResponse)
async def get_enrollment_base_url(
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    cfg = await load_smtp_settings(db)
    base = public_dashboard_base_for_links(cfg)
    return EnrollmentBaseUrlResponse(base_url=base)


def _response_from_cfg(cfg: dict) -> EmailSettingsResponse:
    pub = public_smtp_view(cfg)
    settings = get_settings()
    return EmailSettingsResponse(
        provider=pub.get("provider", "smtp"),
        enabled=pub["enabled"],
        host=pub["host"],
        port=pub["port"],
        user=pub["user"],
        from_email=pub["from_email"],
        from_name=pub["from_name"],
        use_tls=pub["use_tls"],
        use_ssl=pub["use_ssl"],
        public_base_url=pub["public_base_url"],
        password_configured=pub["password_configured"],
        postal_host=pub.get("postal_host", ""),
        postal_api_key_configured=pub["postal_api_key_configured"],
        public_dashboard_url_default=settings.PUBLIC_DASHBOARD_URL,
    )


@router.get("/email", response_model=EmailSettingsResponse)
async def get_email_settings(
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    cfg = await load_smtp_settings(db)
    return _response_from_cfg(cfg)


@router.patch("/email", response_model=EmailSettingsResponse)
async def patch_email_settings(
    body: EmailSettingsPatch,
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    cfg = await load_smtp_settings(db)
    if body.provider is not None:
        cfg["provider"] = body.provider
    if body.enabled is not None:
        cfg["enabled"] = body.enabled
    if body.host is not None:
        cfg["host"] = body.host.strip()
    if body.port is not None:
        cfg["port"] = int(body.port)
    if body.user is not None:
        cfg["user"] = body.user.strip()
    if body.smtp_password is not None:
        if body.smtp_password == "":
            cfg["password"] = ""
        else:
            cfg["password"] = body.smtp_password
    if body.from_email is not None:
        cfg["from_email"] = body.from_email.strip()
    if body.from_name is not None:
        cfg["from_name"] = body.from_name.strip()
    if body.use_tls is not None:
        cfg["use_tls"] = body.use_tls
    if body.use_ssl is not None:
        cfg["use_ssl"] = body.use_ssl
    if body.public_base_url is not None:
        cfg["public_base_url"] = body.public_base_url.strip()
    if body.postal_host is not None:
        cfg["postal_host"] = body.postal_host.strip()
    if body.postal_api_key is not None:
        if body.postal_api_key == "":
            cfg["postal_api_key"] = ""
        else:
            cfg["postal_api_key"] = body.postal_api_key

    if cfg.get("use_ssl") and cfg.get("use_tls"):
        cfg["use_tls"] = False

    await save_smtp_settings(db, cfg)
    await record_audit(
        db,
        actor=current_user,
        action="settings.email.patch",
        resource_type="settings",
        resource_id=None,
        detail={
            "provider": (cfg.get("provider") or "smtp")[:10],
            "enabled": bool(cfg.get("enabled")),
        },
    )
    await db.commit()
    return _response_from_cfg(cfg)


@router.post("/email/test")
async def post_email_test(
    body: EmailTestRequest,
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    cfg = await load_smtp_settings(db)
    if not cfg.get("enabled"):
        raise HTTPException(status_code=400, detail="Email is disabled. Enable it and save first.")
    subject = f"{get_settings().APP_NAME} — test email"
    text = "Your email settings are working. This is a test message from Visioryx."
    html = f"<p>{text}</p>"
    try:
        await asyncio.to_thread(send_email_sync, cfg, body.to, subject, text, html)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Send failed: {e!s}") from e
    return {"ok": True, "message": f"Test email sent to {body.to}"}
