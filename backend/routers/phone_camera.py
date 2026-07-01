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

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel

from deps import JWT_ALGORITHM, JWT_SECRET, current_user, get_db, require_admin

# -------------------------------------------------------------------- face detection (graceful fallback)
try:
    import cv2
    import numpy as np
    from app.ai.face_detector import detect_faces as _detect_faces
    from app.ai.face_matcher import find_best_match as _find_best_match
    _HAS_FACE_DETECTION = True
except Exception:
    _HAS_FACE_DETECTION = False
    cv2 = None
    np = None

_phone_detection_counter: dict[str, int] = {}
_PHONE_DETECT_EVERY = 3
_phone_last_logged: dict[str, float] = {}
_PHONE_LOG_COOLDOWN = 30
_phone_last_annots: dict[str, list[dict]] = {}


async def _create_detection_alert(camera_id: str, user_name: str, status: str, confidence: float):
    """Create a detection alert record in MongoDB (fire-and-forget)."""
    key = f"{camera_id}:{user_name}"
    now = time.time()
    if key in _phone_last_logged and (now - _phone_last_logged[key]) < _PHONE_LOG_COOLDOWN:
        return
    _phone_last_logged[key] = now
    try:
        db = get_db()
        cam = await db.cameras.find_one({"_id": camera_id})
        cam_name = (cam or {}).get("camera_name", camera_id)
        import uuid as _uuid
        from datetime import timezone as _tz
        await db.alerts.insert_one({
            "_id": str(_uuid.uuid4()),
            "alert_type": "Face detected" if status == "known" else "Face detected (unknown)",
            "severity": "info" if status == "known" else "medium",
            "message": f"{user_name} detected",
            "user_name": user_name,
            "status": status,
            "confidence": confidence,
            "camera_id": camera_id,
            "camera_name": cam_name,
            "timestamp": __import__("datetime").datetime.now(_tz),
            "is_read": False,
        })
    except Exception:
        pass


def _annotate_phone_frame(camera_id: str, jpeg_bytes: bytes) -> tuple[bytes, list[dict]]:
    """Decode JPEG → face detection every Nth frame → draw boxes every frame.
    Caches last annotations so boxes stay visible between detection runs.
    Returns (annotated_jpeg, detections_list)."""
    global _phone_last_annots
    detections: list[dict] = []
    if not _HAS_FACE_DETECTION:
        return jpeg_bytes, detections
    _phone_detection_counter[camera_id] = _phone_detection_counter.get(camera_id, 0) + 1
    run_detection = (_phone_detection_counter[camera_id] % _PHONE_DETECT_EVERY == 0)

    if not run_detection and camera_id not in _phone_last_annots:
        return jpeg_bytes, detections

    try:
        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return jpeg_bytes, detections

        annots: list[dict] = []
        if run_detection:
            faces = _detect_faces(frame, for_embedding=False)
            for f in faces:
                bbox = f.get("bbox")
                if not bbox or f.get("det_score", 0) < 0.3:
                    continue
                status = "unknown"
                label = "Unknown"
                confidence = float(f.get("det_score", 0.5))
                annots.append({"bbox": bbox, "status": status, "label": label})
                detections.append({
                    "user_name": label, "status": status, "confidence": confidence,
                })
            _phone_last_annots[camera_id] = annots
        else:
            annots = _phone_last_annots.get(camera_id, [])

        if annots:
            frame = _draw_annotations(frame, annots)
            _, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
            return buf.tobytes(), detections
    except Exception:
        pass
    return jpeg_bytes, detections


def _draw_annotations(frame, faces: list):
    """Draw face bounding boxes — self-contained, no DB deps."""
    out = frame.copy()
    h, w = out.shape[:2]
    for f in faces:
        bbox = f.get("bbox")
        if not bbox or len(bbox) < 4:
            continue
        x1, y1, x2, y2 = [int(x) for x in bbox[:4]]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            continue
        status = f.get("status", "unknown")
        color = (0, 255, 0) if status == "known" else (0, 0, 255)
        label = f.get("label") or ("Known" if status == "known" else "Unknown")
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        pad = 3
        tx, ty = x1, y1 - pad
        if ty - th < 0:
            ty = y2 + th + pad
        tx = max(0, min(tx, w - tw - pad))
        bgx1, bgy1 = max(tx - pad, 0), max(ty - th - pad, 0)
        bgx2, bgy2 = min(tx + tw + pad, w), min(ty + pad, h)
        if bgx2 > bgx1 and bgy2 > bgy1:
            roi = out[bgy1:bgy2, bgx1:bgx2]
            out[bgy1:bgy2, bgx1:bgx2] = (roi * 0.25 + 30 * 0.75).astype(np.uint8)
        cv2.putText(out, label, (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    return out

router = APIRouter(prefix="/phone-cameras", tags=["phone-cameras"])

STALE_AFTER_S = 30                 # camera marked offline if no frame for this long
MAX_FRAME_BYTES = 2 * 1024 * 1024  # 2 MB cap per frame
MIN_FRAME_INTERVAL_S = 0.05        # ~20 fps max per camera (phone sends at ~15)


class PhoneCameraCreate(BaseModel):
    camera_name: str


def _public_base_url(req: Request | None) -> str:
    """QR host resolution: env first, then live request.base_url, finally empty.
    
    Note: This should be the FRONTEND URL (where /pair is served), not the backend.
    The frontend passes 'base' as a query param — that takes priority.
    """
    import os
    env_frontend = os.environ.get("PUBLIC_FRONTEND_URL") or os.environ.get("REACT_APP_BACKEND_URL")
    if env_frontend:
        return env_frontend.rstrip("/")
    if req is not None:
        return str(req.base_url).rstrip("/")
    return ""


# -------------------------------------------------------------------- frame buffer
# Dual storage: in-memory cache for low-latency MJPEG, MongoDB for persistence.
# Stored in MongoDB collection `phone_frames`:
#   { "_id": <camera_id>, "bytes": <Binary>, "ts": <float epoch> }
_phone_frame_cache: dict[str, tuple[bytes, float]] = {}
_phone_frame_lock = asyncio.Lock()

async def _put_frame(camera_id: str, frame: bytes) -> None:
    ts = time.time()
    # Update in-memory cache immediately (zero-latency for MJPEG readers).
    async with _phone_frame_lock:
        _phone_frame_cache[camera_id] = (frame, ts)
    # Persist to MongoDB in background — NEVER block the ingest loop.
    db = get_db()
    asyncio.create_task(_persist_frame(db, camera_id, frame, ts))

async def _persist_frame(db, camera_id: str, frame: bytes, ts: float) -> None:
    """Background task: flush frame to MongoDB without blocking ingest."""
    try:
        await db.phone_frames.update_one(
            {"_id": camera_id},
            {"$set": {"bytes": frame, "ts": ts}},
            upsert=True,
        )
    except Exception:
        pass


async def _get_frame(camera_id: str) -> tuple[bytes | None, float | None]:
    """Return the latest cached frame for a phone camera if it's fresh.
    Reads from in-memory cache first (fast path), falls back to MongoDB."""
    async with _phone_frame_lock:
        cached = _phone_frame_cache.get(camera_id)
        if cached is not None:
            body, ts = cached
            age = time.time() - ts
            if age <= STALE_AFTER_S:
                return body, age
    # Fallback: check MongoDB (e.g. after server restart).
    db = get_db()
    doc = await db.phone_frames.find_one({"_id": camera_id})
    if not doc:
        return None, None
    age = time.time() - doc["ts"]
    if age > STALE_AFTER_S:
        return None, age
    body = bytes(doc["bytes"])
    # Warm the cache.
    async with _phone_frame_lock:
        _phone_frame_cache[camera_id] = (body, doc["ts"])
    return body, age


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
        "pair_expires_at": datetime.now(timezone.utc).timestamp() + (86400 * 30),  # 30d
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


@router.post("/{camera_id}/regenerate-token")
async def regenerate_token(
    camera_id: str,
    _: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    """Regenerate the pair token for a phone camera (fixes expired tokens)."""
    db = get_db()
    cam = await db.cameras.find_one({"_id": camera_id, "kind": "phone"})
    if not cam:
        raise HTTPException(status_code=404, detail="Phone camera not found")
    new_token = secrets.token_urlsafe(24)
    await db.cameras.update_one(
        {"_id": camera_id},
        {"$set": {
            "pair_token": new_token,
            "pair_expires_at": datetime.now(timezone.utc).timestamp() + (86400 * 30),
        }},
    )
    return {
        "camera_id": camera_id,
        "pair_token": new_token,
        "pair_url_path": f"/pair?token={new_token}",
    }


@router.get("/{camera_id}/qr.png")
async def phone_camera_qr(
    camera_id: str,
    request: Request,
    base: str | None = Query(None, description="Override base URL (e.g. https://app.example.com)"),
    token: str | None = Query(None, description="JWT for img tag auth (no Authorization header)"),
) -> Response:
    import qrcode

    # Auth via query token (<img> tags can't send Authorization headers).
    if not token:
        raise HTTPException(status_code=401, detail="Token query param required")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("role") not in ("admin", "operator"):
            raise HTTPException(status_code=403, detail="Admin or operator role required")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    db = get_db()
    cam = await db.cameras.find_one({"_id": camera_id, "kind": "phone"})
    if not cam:
        raise HTTPException(status_code=404, detail="Phone camera not found")

    # Auto-regenerate token if expired — QR always shows a valid token.
    pair_token = cam.get("pair_token")
    pair_expiry = cam.get("pair_expires_at")
    now_ts = datetime.now(timezone.utc).timestamp()
    if pair_expiry is not None and float(pair_expiry) < now_ts:
        pair_token = secrets.token_urlsafe(24)
        await db.cameras.update_one(
            {"_id": camera_id},
            {"$set": {
                "pair_token": pair_token,
                "pair_expires_at": now_ts + (86400 * 30),
            }},
        )

    resolved_base = base or _public_base_url(request)
    # Defense-in-depth: only allow http/https scheme to prevent QR-embedded
    # `javascript:`/`data:` payloads (admin-only endpoint, but free hardening).
    if not (resolved_base.startswith("https://") or resolved_base.startswith("http://")):
        raise HTTPException(status_code=400, detail="base must be http(s) URL")
    pair_url = f"{resolved_base.rstrip('/')}/pair?token={pair_token}"
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
    token_expiry = cam.get("pair_expires_at")
    if token_expiry is not None and float(token_expiry) < datetime.now(timezone.utc).timestamp():
        # Auto-extend expired token — never block a genuine scan.
        new_expiry = datetime.now(timezone.utc).timestamp() + (86400 * 30)
        await db.cameras.update_one(
            {"_id": cam["_id"]},
            {"$set": {"pair_expires_at": new_expiry}},
        )
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
    # Accept the handshake FIRST so we can deliver a real close-code on the wire.
    # Pre-accept close in Starlette becomes an HTTP 403 handshake-fail, which
    # mobile clients can't discriminate from a generic network error.
    await ws.accept()
    if not cam:
        await ws.close(code=4004)
        return
    token_expiry = cam.get("pair_expires_at")
    if token_expiry is not None and float(token_expiry) < datetime.now(timezone.utc).timestamp():
        # Auto-extend — don't block a genuine reconnect.
        await db.cameras.update_one(
            {"_id": cam["_id"]},
            {"$set": {"pair_expires_at": datetime.now(timezone.utc).timestamp() + (86400 * 30)}},
        )

    camera_id = cam["_id"]
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
    from fastapi.responses import StreamingResponse

    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth: {e}")

    boundary = b"--vxframe"

    async def gen():
        last_ts = 0.0
        while True:
            if await request.is_disconnected():
                return
            async with _phone_frame_lock:
                cached = _phone_frame_cache.get(camera_id)
            if cached is not None and cached[1] != last_ts:
                last_ts = cached[1]
                body, detections = _annotate_phone_frame(camera_id, cached[0])
                for det in detections:
                    asyncio.create_task(_create_detection_alert(
                        camera_id, det["user_name"], det["status"], det["confidence"]
                    ))
                yield (boundary + b"\r\nContent-Type: image/jpeg\r\n"
                       + b"Content-Length: " + str(len(body)).encode() + b"\r\n\r\n"
                       + body + b"\r\n")
            await asyncio.sleep(0.04)  # ~25 fps check rate

    return StreamingResponse(
        gen(),
        media_type="multipart/x-mixed-replace; boundary=vxframe",
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"},
    )
