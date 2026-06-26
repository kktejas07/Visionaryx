"""
Visioryx - AI Powered Real-Time Face Recognition & Surveillance System
Main FastAPI application entry point.
"""
import sys

import app.runtime_env  # noqa: F401 — BLAS thread limits before numpy/opencv

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import DEFAULT_DEV_SECRET_KEY, get_settings
from app.core.logger import setup_logger

settings = get_settings()
logger = setup_logger("visioryx")


def _cors_allow_origins() -> list[str]:
    raw = settings.CORS_ORIGINS.strip()
    if not raw:
        return ["http://localhost:3000", "http://127.0.0.1:3000"]
    return [o.strip() for o in raw.split(",") if o.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown."""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    if sys.platform == "darwin" and getattr(settings, "STREAM_ENABLE_HOG_PERSONS", False):
        logger.warning(
            "STREAM_ENABLE_HOG_PERSONS=true on macOS can crash Python (SIGFPE in OpenBLAS/numpy). "
            "Remove it from backend/.env or set STREAM_ENABLE_HOG_PERSONS=false."
        )
    if not settings.DEBUG and settings.SECRET_KEY == DEFAULT_DEV_SECRET_KEY:
        logger.warning(
            "SECRET_KEY is still the default placeholder. Set a strong SECRET_KEY in production."
        )
    from app.services.detection_log_queue import start_queue_processor
    from app.services.runtime_app_settings import load_from_database

    try:
        load_from_database()
    except Exception as e:
        logger.warning("Could not load app_settings from DB (run migrations?): %s", e)
    _detection_task = start_queue_processor()
    yield
    _detection_task.cancel()
    try:
        await _detection_task
    except asyncio.CancelledError:
        pass
    logger.info("Shutting down Visioryx")


app = FastAPI(
    title=settings.APP_NAME,
    description="AI Powered Real-Time Face Recognition & Surveillance System",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add security headers (must be after CORS)
from app.core.security_headers import (
    SecurityHeadersMiddleware,
    RateLimitMiddleware,
    LoginRateLimitMiddleware,
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware, requests_per_minute=100)
app.add_middleware(LoginRateLimitMiddleware)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
    }


@app.get("/health")
async def health():
    """Health check for load balancers."""
    return {"status": "healthy"}


@app.get("/health/db")
async def health_db():
    """Database connectivity check. Returns 503 when the database is unreachable."""
    try:
        from sqlalchemy import text
        from app.database.connection import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        # Log the actual error internally but don't expose to users
        import logging
        logging.getLogger("visioryx").error(f"Health check failed: {type(e).__name__}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "database": "disconnected",
                "message": "Database connection failed",
            },
        )


# API routes
from app.api import auth, enroll, users, cameras, detections, analytics, alerts, settings as app_settings, email_smtp, audit, maintenance, meta
from app.core.websocket_manager import ws_manager

app.include_router(meta.router, prefix=f"{settings.API_V1_PREFIX}/meta", tags=["meta"])
app.include_router(auth.router, prefix=f"{settings.API_V1_PREFIX}/auth", tags=["auth"])
app.include_router(enroll.router, prefix=f"{settings.API_V1_PREFIX}/enroll", tags=["enroll"])
app.include_router(users.router, prefix=f"{settings.API_V1_PREFIX}/users", tags=["users"])
app.include_router(cameras.router, prefix=f"{settings.API_V1_PREFIX}/cameras", tags=["cameras"])
app.include_router(detections.router, prefix=f"{settings.API_V1_PREFIX}/detections", tags=["detections"])
app.include_router(analytics.router, prefix=f"{settings.API_V1_PREFIX}/analytics", tags=["analytics"])
app.include_router(alerts.router, prefix=f"{settings.API_V1_PREFIX}/alerts", tags=["alerts"])
app.include_router(app_settings.router, prefix=f"{settings.API_V1_PREFIX}/settings", tags=["settings"])
app.include_router(email_smtp.router, prefix=f"{settings.API_V1_PREFIX}/settings", tags=["settings"])
app.include_router(audit.router, prefix=f"{settings.API_V1_PREFIX}/audit", tags=["audit"])
app.include_router(maintenance.router, prefix=f"{settings.API_V1_PREFIX}/admin", tags=["admin"])
from app.api import stream
from app.api import mobile_app
from app.api import cloudflare
from app.api import brand

app.include_router(stream.router, prefix=f"{settings.API_V1_PREFIX}/stream", tags=["stream"])
app.include_router(mobile_app.router, prefix=f"{settings.API_V1_PREFIX}/mobile-app", tags=["mobile-app"])
app.include_router(cloudflare.router, prefix=f"{settings.API_V1_PREFIX}/settings", tags=["settings"])
app.include_router(brand.router, prefix=f"{settings.API_V1_PREFIX}/settings", tags=["settings"])
logger.info("Stream API registered: /api/v1/stream/{camera_id}/start, /stop, /mjpeg")
from fastapi.staticfiles import StaticFiles
import os
storage_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage")
if not os.path.exists(storage_path):
    os.makedirs(storage_path, exist_ok=True)
app.mount("/storage", StaticFiles(directory=storage_path), name="storage")
logger.info(f"Storage directory mounted at /storage (path: {storage_path})")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time events."""
    import uuid
    client_id = str(uuid.uuid4())
    await ws_manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Heartbeat / keepalive
            if data == "ping":
                await websocket.send_text("pong")
    except Exception:
        pass
    finally:
        ws_manager.disconnect(client_id)
