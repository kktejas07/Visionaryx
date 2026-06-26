"""Optional outbound webhook when alerts are created (Slack-compatible JSON)."""
from __future__ import annotations

import httpx

from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger("webhook_notify")


async def notify_alert_webhook(alert_id: int, alert_type: str, message: str) -> None:
    url = (get_settings().ALERT_WEBHOOK_URL or "").strip()
    if not url:
        return
    payload = {
        "text": f"[Visioryx] {alert_type}: {message}",
        "visioryx": True,
        "alert_id": alert_id,
        "alert_type": alert_type,
        "message": message,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=payload, headers={"Content-Type": "application/json"})
            r.raise_for_status()
    except Exception as e:
        logger.warning("ALERT_WEBHOOK_URL post failed: %s", e)
