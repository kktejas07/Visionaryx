"""
SMTP sending for enrollment emails. Configuration is stored in app_settings (key smtp_mailer).
"""
from __future__ import annotations

import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Any, Optional

KEY_SMTP_MAILER = "smtp_mailer"


def default_smtp_config() -> dict[str, Any]:
    return {
        "enabled": False,
        "host": "",
        "port": 587,
        "user": "",
        "password": "",
        "from_email": "",
        "from_name": "Visioryx",
        "use_tls": True,
        "use_ssl": False,
        "public_base_url": "",
    }


def merge_smtp_config(raw: Optional[dict]) -> dict[str, Any]:
    out = default_smtp_config()
    if not raw or not isinstance(raw, dict):
        return out
    for k in out:
        if k in raw:
            out[k] = raw[k]
    # normalize types
    try:
        out["port"] = int(out["port"])
    except (TypeError, ValueError):
        out["port"] = 587
    out["enabled"] = bool(out["enabled"])
    out["use_tls"] = bool(out["use_tls"])
    out["use_ssl"] = bool(out["use_ssl"])
    return out


def public_dashboard_base_for_links(cfg: dict[str, Any]) -> str:
    """Base URL for /enroll?token=… links (DB override or PUBLIC_DASHBOARD_URL)."""
    cfg = merge_smtp_config(cfg)
    raw = (cfg.get("public_base_url") or "").strip()
    if raw:
        return raw.rstrip("/")
    from app.core.config import get_settings

    return get_settings().PUBLIC_DASHBOARD_URL.rstrip("/")


def public_smtp_view(cfg: dict[str, Any]) -> dict[str, Any]:
    """Strip password for API responses."""
    c = merge_smtp_config(cfg)
    c.pop("password", None)
    c["password_configured"] = bool(cfg.get("password"))
    return c


def send_smtp_mail_sync(cfg: dict[str, Any], to_email: str, subject: str, text: str, html: Optional[str] = None) -> None:
    """Blocking SMTP send. Raises on failure."""
    cfg = merge_smtp_config(cfg)
    if not cfg.get("enabled"):
        raise ValueError("SMTP is disabled")
    host = (cfg.get("host") or "").strip()
    if not host:
        raise ValueError("SMTP host is not configured")
    port = int(cfg.get("port") or 587)
    user = (cfg.get("user") or "").strip()
    password = cfg.get("password") or ""
    from_email = (cfg.get("from_email") or user or "").strip()
    if not from_email:
        raise ValueError("From email is not configured")
    from_name = (cfg.get("from_name") or "Visioryx").strip()
    use_tls = bool(cfg.get("use_tls", True))
    use_ssl = bool(cfg.get("use_ssl", False))

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_email))
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    if html:
        msg.attach(MIMEText(html, "html", "utf-8"))

    ctx = ssl.create_default_context()
    if use_ssl:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=30) as smtp:
            if user:
                smtp.login(user, password)
            smtp.sendmail(from_email, [to_email], msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.ehlo()
            if use_tls:
                smtp.starttls(context=ctx)
                smtp.ehlo()
            if user:
                smtp.login(user, password)
            smtp.sendmail(from_email, [to_email], msg.as_string())
