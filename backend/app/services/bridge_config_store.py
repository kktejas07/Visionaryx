"""Persist bridge agent token in app_settings."""
from __future__ import annotations

import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AppSetting

KEY_BRIDGE = "bridge"

DEFAULT_BRIDGE_CONFIG: dict = {
    "token": "",
    "enabled": False,
    "created_at": None,
}


async def load_bridge_config(db: AsyncSession) -> dict:
    result = await db.execute(select(AppSetting).where(AppSetting.key == KEY_BRIDGE))
    row = result.scalar_one_or_none()
    if not row or not isinstance(row.value, dict):
        return dict(DEFAULT_BRIDGE_CONFIG)
    return {**DEFAULT_BRIDGE_CONFIG, **row.value}


async def save_bridge_config(db: AsyncSession, data: dict) -> None:
    result = await db.execute(select(AppSetting).where(AppSetting.key == KEY_BRIDGE))
    row = result.scalar_one_or_none()
    if row is None:
        db.add(AppSetting(key=KEY_BRIDGE, value=data))
    else:
        row.value = data
    await db.flush()


def generate_bridge_token() -> str:
    return secrets.token_urlsafe(32)
