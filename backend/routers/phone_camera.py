"""Phone-as-camera.

Admins create a "wireless camera" → backend mints a pair_token + QR-code that
the user opens on their phone. The phone's browser captures `getUserMedia()`
frames and streams JPEG frames via WebSocket to this server.

Production-hardened version
---------------------------
- Frames live in MongoDB collection `phone_frames` (multi-worker safe — previous
  in-process dict didn't survive across uvicorn workers).
- WS ingest rate-limited to 10 fps per camera (frames arriving faster are
  dropped, not buffered).
- Per-frame size cap of 2 MB.
- QR endpoint host fallback chain: ?base → REACT_APP_BACKEND_URL → request.base_url.

Endpoints
---------
POST   /api/v1/phone-cameras                (admin) → create + return pair info
GET    /api/v1/phone-cameras/{id}/qr.png    (admin) → QR PNG of the pair URL
GET    /api/v1/phone-cameras/pair-info      (public) → resolve token → camera meta
WS     /api/v1/phone-cameras/ws/ingest      (token) → binary JPEG frames in
GET    /api/v1/phone-cameras/{id}/frame.jpg → latest frame (auth required)
"""
from __future__ import annotations

import asyncio
import io
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel

from deps import current_user, get_db, require_admin

router = APIRouter(prefix="/phone-cameras", tags=["phone-cameras"])

STALE_AFTER_S = 30                 # camera marked offline if no frame for this long
MAX_FRAME_BYTES = 2 * 1024 * 1024  # 2 MB cap per frame
MIN_FRAME_INTERVAL_S = 0.1         # 10 fps max per camera


class PhoneCameraCreate(BaseModel):
    camera_name: str


def _public_base_url(req: Request | None) -> str:
    """QR host resolution: env first, then live request.base_url, finally empty."""
    import os
    env = os.environ.get("REACT_APP_BACKEND_URL")
    if env:
        return env
    if req is not None:
        # request.base_url is like 'https://host/' — strip trailing slash.
        return str(req.base_url).rstrip("/")
    return ""


# -------------------------------------------------------------------- frame buffer
# Stored in MongoDB collection `phone_frames`:
#   { "_id": <camera_id>, "bytes": <Binary>, "ts": <float epoch> }
# We do NOT use Motor's GridFS — frames are small (~50KB) and well under the
# 16MB BSON limit, so a single doc upsert is cheaper and atomic.
async def _put_frame(camera_id: str, frame: bytes) -> None:
    db = get_db()
    await db.phone_frames.update_one(
        {"_id": camera_id},
        {"$set": {"bytes": frame, "ts": time.time()}},
        upsert=True,
    )


async def _get_frame(camera_id: str) -> tuple[bytes | None, float | None]:
    """Return the latest cached frame for a phone camera if it's fresh."""
    db = get_db()
    doc = await db.phone_frames.find_one({"_id": camera_id})
    if not doc:
        return None, None
    age = time.time() - doc["ts"]
    if age > STALE_AFTER_S:
        return None, age
    return bytes(doc["bytes"]), age


async def get_frame(camera_id: str) -> tuple[bytes | None, float | None]:
    """Public alias for other routers (e.g. camera_stream)."""
    return await _get_frame(camera_id)


# -------------------------------------------------------------------- endpoints
@router.post("", status_code=201)
async def create_phone_camera(
    body: PhoneCameraCreate,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    db = get_db()
    pair_token = secrets.token_urlsafe(24)
    cam_id = str(uuid.uuid4())
    doc = {
        "_id": cam_id,
        "camera_name": body.camera_name,
        "rtsp_url": f"phone://{cam_id}",
        "kind": "phone",
        "pair_token": pair_token,
        "pair_expires_at": datetime.now(timezone.utc).timestamp() + 86400,  # 24h
        "is_enabled": True,
        "status": "offline",
        "created_at": datetime.now(timezone.utc),
    }
    await db.cameras.insert_one(doc)
    return {
        "id": cam_id,
        "camera_name": body.camera_name,
        "pair_token": pair_token,
        "pair_url_path": f"/pair?token={pair_token}",
        "kind": "phone",
        "is_enabled": True,
        "status": "offline",
    }


@router.get("/{camera_id}/qr.png")
async def phone_camera_qr(
    camera_id: str,
    request: Request,
    base: str | None = Query(None, description="Override base URL (e.g. https://app.example.com)"),
    _: dict[str, Any] = Depends(require_admin),
) -> Response:
    import qrcode

    db = get_db()
    cam = await db.cameras.find_one({"_id": camera_id, "kind": "phone"})
    if not cam:
        raise HTTPException(status_code=404, detail="Phone camera not found")
    resolved_base = base or _public_base_url(request)
    pair_url = f"{resolved_base.rstrip('/')}/pair?token={cam['pair_token']}"
    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(pair_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/pair-info")
async def pair_info(token: str = Query(...)) -> dict[str, Any]:
    db = get_db()
    cam = await db.cameras.find_one({"pair_token": token, "kind": "phone"})
    if not cam:
        raise HTTPException(status_code=404, detail="Invalid pairing token")
    if cam.get("pair_expires_at", 0) < datetime.now(timezone.utc).timestamp():
        raise HTTPException(status_code=410, detail="Pairing token expired")
    return {
        "camera_id": cam["_id"],
        "camera_name": cam["camera_name"],
        "ws_path": f"/api/v1/phone-cameras/ws/ingest?token={token}",
    }


@router.websocket("/ws/ingest")
async def ws_ingest(ws: WebSocket, token: str = Query(...)):
    """Phone-side WebSocket. Receives binary JPEG frames at up to 10 fps."""
    db = get_db()
    cam = await db.cameras.find_one({"pair_token": token, "kind": "phone"})
    if not cam:
        await ws.close(code=4004)
        return
    if cam.get("pair_expires_at", 0) < datetime.now(timezone.utc).timestamp():
        await ws.close(code=4010)
        return

    camera_id = cam["_id"]
    await ws.accept()
    await db.cameras.update_one({"_id": camera_id}, {"$set": {"status": "active"}})
    last_persisted = 0.0  # epoch seconds of last frame we actually stored
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            frame = msg.get("bytes")
            if not frame:
                continue
            if len(frame) > MAX_FRAME_BYTES:
                continue  # drop oversized
            now = time.time()
            if now - last_persisted < MIN_FRAME_INTERVAL_S:
                continue  # rate-limit (>10 fps)
            last_persisted = now
            await _put_frame(camera_id, frame)
    except WebSocketDisconnect:
        pass
    finally:
        await db.cameras.update_one(
            {"_id": camera_id},
            {"$set": {"last_phone_disconnect": datetime.now(timezone.utc)}},
        )


@router.get("/{camera_id}/frame.jpg")
async def latest_frame(
    camera_id: str,
    _: dict[str, Any] = Depends(current_user),
) -> Response:
    body, age = await _get_frame(camera_id)
    if body is None:
        raise HTTPException(status_code=404, detail="No fresh frame")
    return Response(
        content=body,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store", "X-Frame-Age-S": str(round(age or 0, 1))},
    )


@router.get("/{camera_id}/stream.mjpeg")
async def phone_camera_mjpeg(
    request: Request,
    camera_id: str,
    token: str = Query(...),
):
    """MJPEG re-stream of cached phone frames. Token = bearer JWT (query)."""
    import jwt as _jwt
    from fastapi.responses import StreamingResponse
    from deps import JWT_ALGORITHM, JWT_SECRET

    try:
        _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth: {e}")

    boundary = b"--vxframe"

    async def gen():
        last_ts = 0.0
        last_disconnect_check = 0.0
        while True:
            # Disconnect check every ~500 ms.
            now = time.time()
            if now - last_disconnect_check > 0.5:
                last_disconnect_check = now
                if await request.is_disconnected():
                    return
            db = get_db()
            doc = await db.phone_frames.find_one({"_id": camera_id})
            if doc and doc["ts"] != last_ts:
                last_ts = doc["ts"]
                body = bytes(doc["bytes"])
                yield (boundary + b"\r\nContent-Type: image/jpeg\r\n"
                       + b"Content-Length: " + str(len(body)).encode() + b"\r\n\r\n"
                       + body + b"\r\n")
            await asyncio.sleep(0.1)

    return StreamingResponse(
        gen(),
        media_type="multipart/x-mixed-replace; boundary=vxframe",
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"},
    )
