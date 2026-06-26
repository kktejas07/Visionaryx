"""
Postal HTTP API email sender.
https://docs.postalserver.io/developer-guide/api/send-message
"""
from __future__ import annotations

from typing import Any, Optional

import httpx


def send_postal_mail_sync(cfg: dict[str, Any], to_email: str, subject: str, text: str, html: Optional[str] = None) -> None:
    """Blocking Postal HTTP API send. Raises on failure."""
    host = (cfg.get("postal_host") or "").strip().rstrip("/")
    api_key = (cfg.get("postal_api_key") or "").strip()
    from_email = (cfg.get("from_email") or "").strip()
    from_name = (cfg.get("from_name") or "Visioryx").strip()

    if not host:
        raise ValueError("Postal server URL is not configured")
    if not api_key:
        raise ValueError("Postal API key is not configured")
    if not from_email:
        raise ValueError("From email is not configured")

    url = f"{host}/api/v1/send/message"
    headers = {
        "X-Server-API-Key": api_key,
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "to": [to_email],
        "from": f"{from_name} <{from_email}>",
        "subject": subject,
        "plain_body": text,
    }
    if html:
        payload["html_body"] = html

    response = httpx.post(url, json=payload, headers=headers, timeout=30)
    if response.status_code != 200:
        detail = response.text[:500]
        raise ValueError(f"Postal API error (HTTP {response.status_code}): {detail}")
    body = response.json()
    if body.get("status") != "sent" and body.get("status") != "queued":
        detail = body.get("message", response.text[:500])
        raise ValueError(f"Postal send failed: {detail}")
