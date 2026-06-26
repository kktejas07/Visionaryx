"""SQLAlchemy declarative base — imported without creating an engine (safe for Alembic)."""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """ORM base for all models."""

    pass
