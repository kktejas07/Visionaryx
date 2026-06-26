"""
Visioryx - Database Connection
Async SQLAlchemy engine and session management.
"""
from typing import AsyncGenerator
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.database.base import Base  # re-export for callers that import from connection

settings = get_settings()


def normalize_async_database_url(url: str) -> str:
    """Neon/UI often paste `postgresql://…`; async engine must use asyncpg."""
    u = url.strip()
    if u.startswith("postgresql+asyncpg://"):
        return u
    if u.startswith("postgresql://"):
        return "postgresql+asyncpg://" + u[len("postgresql://") :]
    if u.startswith("postgres://"):
        return "postgresql+asyncpg://" + u[len("postgres://") :]
    return u


# asyncpg does not accept libpq query params (sslmode, etc.) — they are forwarded from the URL
# and break connect(). TLS for Neon is set via connect_args["ssl"] instead.
_LIBPQ_QUERY_KEYS_ASYNCPG_REJECTS = frozenset(
    {"sslmode", "channel_binding", "gssencmode", "target_session_attrs"}
)


def strip_libpq_params_for_asyncpg(url: str) -> str:
    """Remove query keys that SQLAlchemy would pass through to asyncpg.connect() but asyncpg rejects."""
    parsed = urlparse(url)
    if not parsed.query:
        return url
    pairs = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if k.lower() not in _LIBPQ_QUERY_KEYS_ASYNCPG_REJECTS
    ]
    new_query = urlencode(pairs)
    return urlunparse(parsed._replace(query=new_query))


def _cloud_postgres_async_connect_args(database_url: str) -> dict:
    """asyncpg requires explicit TLS for Neon (and similar) even when the URL includes sslmode=require."""
    u = database_url.lower()
    if (
        "neon.tech" in u
        or "sslmode=require" in u
        or "ssl=true" in u
        or ".pooler.neon.tech" in u
    ):
        return {"ssl": True}
    return {}


def _cloud_postgres_engine_kwargs(database_url: str) -> dict:
    """Neon closes idle connections; recycle pooled connections periodically."""
    u = database_url.lower()
    extra = {}
    if "neon.tech" in u:
        extra["pool_recycle"] = 300
    return extra


_raw_async_url = normalize_async_database_url(settings.DATABASE_URL)
_async_url = strip_libpq_params_for_asyncpg(_raw_async_url)
engine = create_async_engine(
    _async_url,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    connect_args=_cloud_postgres_async_connect_args(_raw_async_url),
    **_cloud_postgres_engine_kwargs(_raw_async_url),
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for async database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
