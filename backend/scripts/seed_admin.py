#!/usr/bin/env python3
"""Seed initial admin user. Run: cd backend && ./venv/bin/python scripts/seed_admin.py"""
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))
os.chdir(BACKEND_ROOT)

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.database.models import AuthUser, User


def _sync_database_url() -> str:
    """Use sync URL for this script (psycopg2). Prefer DATABASE_URL_SYNC."""
    settings = get_settings()
    url = settings.DATABASE_URL_SYNC or settings.DATABASE_URL
    if url.startswith("postgresql+asyncpg://"):
        return "postgresql://" + url.split("postgresql+asyncpg://", 1)[1]
    return url


def seed() -> None:
    settings = get_settings()
    url = _sync_database_url()
    engine = create_engine(url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine, class_=Session)

    with SessionLocal() as db:
        result = db.execute(select(AuthUser).where(AuthUser.email == "admin@visioryx.dev"))
        if result.scalar_one_or_none():
            print("Admin already exists")
            return
        admin = AuthUser(
            email="admin@visioryx.dev",
            hashed_password=get_password_hash("admin123"),
            role="admin",
            is_active=True,
        )
        db.add(admin)

        rec_user = User(
            name="System Admin",
            email="admin@visioryx.dev",
            role="admin",
            is_active=True,
        )
        db.add(rec_user)

        db.commit()
        print("Created admin: admin@visioryx.dev / admin123")

    engine.dispose()


def _print_db_help() -> None:
    print(
        "\nERROR: Cannot connect to PostgreSQL.\n"
        "  • Local: docker compose -f docker/docker-compose.dev.yml up -d\n"
        "  • Neon: check DATABASE_URL_SYNC in backend/.env and Neon dashboard.\n",
        file=sys.stderr,
    )


if __name__ == "__main__":
    try:
        seed()
    except OSError as e:
        msg = str(e).lower()
        if "connect call failed" in msg or "errno 61" in msg:
            _print_db_help()
            sys.exit(1)
        raise
    except Exception as e:  # noqa: BLE001
        msg = str(e).lower()
        if "connect call failed" in msg or "connection refused" in msg:
            _print_db_help()
            sys.exit(1)
        raise
