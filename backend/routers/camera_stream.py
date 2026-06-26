"""Camera preview / synthetic MJPEG stream.

Browsers can't speak RTSP directly. Until a real RTSP→HLS gateway is wired,
this module generates **synthetic CCTV-style frames** per camera (dark grid,
camera name + timestamp + scanline) and exposes:

    GET /api/v1/cameras/{id}/preview.jpg     — single fresh JPEG (cacheable=1s)
    GET /api/v1/cameras/{id}/stream.mjpeg    — multipart/x-mixed-replace
                                                stream @ 10 fps

These accept the JWT via `?token=<jwt>` query param since `<img>` tags cannot
attach an Authorization header.
"""
from __future__ import annotations

import asyncio
import io
import math
import os
import time
from datetime import datetime, timezone
from typing import Any

import jwt
import numpy as np
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response, StreamingResponse

from deps import JWT_ALGORITHM, JWT_SECRET, get_db

router = APIRouter(prefix="/cameras", tags=["cameras-stream"])


async def _auth_from_query(token: str | None) -> dict[str, Any]:
    if not token:
        raise HTTPException(status_code=401, detail="Token query param required")
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _render_frame(name: str, status: str, frame_n: int) -> bytes:
    """Build a CCTV-styled synthetic JPEG frame in-memory.

    Pure numpy + PIL (no opencv writes here so we don't fight with the InsightFace
    cv2 import order).
    """
    from PIL import Image, ImageDraw, ImageFont

    W, H = 640, 360
    # Background with very slow drifting violet gradient.
    bg = np.zeros((H, W, 3), dtype=np.uint8)
    t = frame_n / 30.0
    grad_top = (12 + int(8 * math.sin(t * 0.4)), 8, 20)
    grad_bot = (4, 4, 12)
    for y in range(H):
        ratio = y / H
        bg[y, :, 0] = int(grad_top[0] * (1 - ratio) + grad_bot[0] * ratio)
        bg[y, :, 1] = int(grad_top[1] * (1 - ratio) + grad_bot[1] * ratio)
        bg[y, :, 2] = int(grad_top[2] * (1 - ratio) + grad_bot[2] * ratio)
    img = Image.fromarray(bg)
    draw = ImageDraw.Draw(img)

    # Grid lines (every 40 px).
    for x in range(0, W, 40):
        draw.line([(x, 0), (x, H)], fill=(36, 28, 56), width=1)
    for y in range(0, H, 40):
        draw.line([(0, y), (W, y)], fill=(36, 28, 56), width=1)

    # Scanline — moves vertically over time.
    scan_y = int((frame_n * 4) % H)
    draw.line([(0, scan_y), (W, scan_y)], fill=(139, 92, 246), width=2)
    for dy in range(1, 6):
        alpha = 80 - dy * 15
        draw.line([(0, scan_y + dy), (W, scan_y + dy)],
                  fill=(139, 92, 246, max(alpha, 0)), width=1)

    # Corner brackets
    bracket = (139, 92, 246)
    L = 22
    for (x, y, dx, dy) in [(12, 12, 1, 1), (W - 12, 12, -1, 1),
                            (12, H - 12, 1, -1), (W - 12, H - 12, -1, -1)]:
        draw.line([(x, y), (x + L * dx, y)], fill=bracket, width=2)
        draw.line([(x, y), (x, y + L * dy)], fill=bracket, width=2)

    # Top overlay: name + status + LIVE pill
    try:
        font_big = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", 18)
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf", 12)
    except Exception:
        font_big = ImageFont.load_default()
        font_sm = ImageFont.load_default()
    draw.text((20, 18), name, fill=(225, 226, 235), font=font_big)
    status_color = (6, 182, 212) if status == "active" else (255, 182, 107)
    draw.ellipse((20, 50, 28, 58), fill=status_color)
    draw.text((34, 47), f"NODE · {status.upper()}", fill=status_color, font=font_sm)

    # LIVE pill top-right
    live_x = W - 90
    draw.rounded_rectangle((live_x, 18, W - 18, 38), radius=10, fill=(239, 68, 68))
    draw.ellipse((live_x + 7, 24, live_x + 14, 31), fill=(255, 255, 255))
    draw.text((live_x + 20, 21), "LIVE", fill=(255, 255, 255), font=font_sm)

    # Bottom overlay: timestamp
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    draw.rectangle((0, H - 28, W, H), fill=(0, 0, 0, 180))
    draw.text((20, H - 22), f"⏵ {now}  ·  CHANNEL {(frame_n % 64):02d}", fill=(203, 195, 215), font=font_sm)

    # Encode JPEG.
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=72)
    return buf.getvalue()


@router.get("/{camera_id}/preview.jpg")
async def camera_preview(camera_id: str, token: str | None = Query(None)) -> Response:
    await _auth_from_query(token)
    db = get_db()
    cam = await db.cameras.find_one({"_id": camera_id})
    if cam is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    name = cam.get("camera_name", "Camera")
    status = cam.get("status", "offline")
    frame_n = int(time.time() * 10) % 4096
    body = _render_frame(name, status, frame_n)
    return Response(content=body, media_type="image/jpeg",
                    headers={"Cache-Control": "no-cache, no-store", "Pragma": "no-cache"})


@router.get("/{camera_id}/stream.mjpeg")
async def camera_mjpeg(camera_id: str, token: str | None = Query(None)) -> StreamingResponse:
    """Synthetic 10 fps MJPEG stream. The connection stays open and we yield a
    fresh frame every 100 ms until the client disconnects."""
    await _auth_from_query(token)
    db = get_db()
    cam = await db.cameras.find_one({"_id": camera_id})
    if cam is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    name = cam.get("camera_name", "Camera")
    status = cam.get("status", "offline")

    boundary = b"--vxframe"

    async def gen():
        frame_n = 0
        try:
            while True:
                body = _render_frame(name, status, frame_n)
                yield (boundary + b"\r\nContent-Type: image/jpeg\r\n"
                       + b"Content-Length: " + str(len(body)).encode() + b"\r\n\r\n"
                       + body + b"\r\n")
                frame_n += 1
                await asyncio.sleep(0.1)  # 10 fps
        except asyncio.CancelledError:
            return

    return StreamingResponse(
        gen(),
        media_type="multipart/x-mixed-replace; boundary=vxframe",
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"},
    )
