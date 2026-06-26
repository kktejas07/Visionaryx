"""Persist SMTP settings in app_settings."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import AppSetting
from app.services.smtp_mailer import KEY_SMTP_MAILER, merge_smtp_config

__all__ = ["load_smtp_settings", "save_smtp_settings"]


async def load_smtp_settings(db: AsyncSession) -> dict:
    result = await db.execute(select(AppSetting).where(AppSetting.key == KEY_SMTP_MAILER))
    row = result.scalar_one_or_none()
    if not row or not isinstance(row.value, dict):
        return merge_smtp_config(None)
    return merge_smtp_config(row.value)


async def save_smtp_settings(db: AsyncSession, data: dict) -> None:
    result = await db.execute(select(AppSetting).where(AppSetting.key == KEY_SMTP_MAILER))
    row = result.scalar_one_or_none()
    if row is None:
        db.add(AppSetting(key=KEY_SMTP_MAILER, value=data))
    else:
        row.value = data
    await db.flush()
