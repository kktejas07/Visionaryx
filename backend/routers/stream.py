"""MJPEG stream endpoints (MongoDB backend)."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from deps import get_db

logger = logging.getLogger("visioryx")

router = APIRouter(tags=["stream"])

JWT_SECRET = None  # set at module load time
SURVEILLANCE_ROLES = {"admin", "operator"}


def _get_jwt_secret() -> str:
    global JWT_SECRET
    if JWT_SECRET is None:
        import os
        JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
    return JWT_SECRET


def _verify_surveillance_token(token: str | None) -> bool:
    if not token:
        return False
    try:
        payload = jwt.decode(token, _get_jwt_secret(), algorithms=["HS256"])
        return payload.get("role") in SURVEILLANCE_ROLES
    except Exception:
        return False


_FFMPEG_CMD = [
    "ffmpeg",
    "-rtsp_transport", "tcp",
    "-fflags", "nobuffer",
    "-flags", "low_delay",
    "-analyzeduration", "0",
    "-probesize", "32",
    "-flush_packets", "1",
    "-i", "__RTSP_URL__",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-q:v", "10",
    "-",
]


async def _generate_mjpeg(rtsp_url: str):
    """Yield MJPEG frames from ffmpeg. Falls back to placeholder on error."""
    import subprocess

    placeholder = _placeholder_jpeg()
    cmd = [w if w != "__RTSP_URL__" else rtsp_url for w in _FFMPEG_CMD]
    buf = b""
    boundary = "frame"
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        while True:
            chunk = await process.stdout.read(65536)
            if not chunk:
                stderr = await process.communicate()
                logger.error("ffmpeg exited code=%s stderr=%s", process.returncode, stderr[1].decode(errors="replace")[:500])
                break
            buf += chunk
            while True:
                start = buf.find(b"\xff\xd8")
                if start == -1:
                    break
                end = buf.find(b"\xff\xd9", start + 2)
                if end == -1:
                    break
                frame = buf[start:end + 2]
                buf = buf[end + 2:]
                yield (
                    b"--" + boundary.encode() + b"\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(frame)).encode() + b"\r\n\r\n"
                    + frame + b"\r\n"
                )
    except Exception:
        logger.exception("MJPEG stream error")
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()
        while True:
            frame = placeholder
            yield (
                b"--" + boundary.encode() + b"\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(frame)).encode() + b"\r\n\r\n"
                + frame + b"\r\n"
            )
            await asyncio.sleep(2)


def _placeholder_jpeg() -> bytes:
    """Minimal 1x1 black JPEG (works without PIL/OpenCV)."""
    return (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
        b"\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f"
        b"\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342"
        b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00"
        b"\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b"
        b"\xff\xc4\x00\xb5\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04\x04\x00\x00\x00\x01\x02\x03\x00\x04\x11\x05\x12\x06!1"
        b"\x06\x15Q\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"
        b"\xff\xda\x00\x08\x01\x01\x00\x00?\x00\x9a\xfa\x00"
        b"\xff\xd9"
    )


_latest_frames: dict[str, bytes] = {}
_frame_counters: dict[str, int] = {}


async def _frame_grabber(rtsp_url: str, camera_id: str):
    """Keep ffmpeg running and cache latest frame in memory."""
    import subprocess

    while True:
        cmd = [w if w != "__RTSP_URL__" else rtsp_url for w in _FFMPEG_CMD]
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        buf = b""
        counter = 0
        while True:
            chunk = await process.stdout.read(65536)
            if not chunk:
                stderr_b, _ = await process.communicate()
                logger.warning(
                    "ffmpeg grabber exited for camera=%s code=%s stderr=%s",
                    camera_id, process.returncode, stderr_b.decode(errors="replace")[:500],
                )
                break
            buf += chunk
            while True:
                start = buf.find(b"\xff\xd8")
                if start == -1:
                    break
                end = buf.find(b"\xff\xd9", start + 2)
                if end == -1:
                    break
                frame = buf[start:end + 2]
                buf = buf[end + 2:]
                _latest_frames[camera_id] = frame
                counter += 1
                _frame_counters[camera_id] = counter
        await asyncio.sleep(1)


_grabber_tasks: set[asyncio.Task] = set()


def _ensure_grabber(rtsp_url: str, camera_id: str):
    task_key = camera_id
    if not any(t.get_name() == task_key for t in _grabber_tasks):
        task = asyncio.create_task(_frame_grabber(rtsp_url, camera_id))
        task.set_name(task_key)
        _grabber_tasks.add(task)
        task.add_done_callback(_grabber_tasks.discard)


async def _stream_from_grabber(camera_id: str):
    """Yield MJPEG frames from the background grabber (no per-request ffmpeg)."""
    placeholder = _placeholder_jpeg()
    boundary = "frame"
    last_counter = _frame_counters.get(camera_id, 0)

    while True:
        frame = _latest_frames.get(camera_id)
        counter = _frame_counters.get(camera_id, 0)

        if frame is None or counter == last_counter:
            frame = placeholder
            await asyncio.sleep(0.04)
            continue

        last_counter = counter
        yield (
            b"--" + boundary.encode() + b"\r\n"
            b"Content-Type: image/jpeg\r\n"
            b"Content-Length: " + str(len(frame)).encode() + b"\r\n\r\n"
            + frame + b"\r\n"
        )


@router.get("/stream/{camera_id}/mjpeg")
async def stream_mjpeg(
    camera_id: str,
    token: str | None = Query(None),
):
    """MJPEG stream. Use <img src='/api/v1/stream/{camera_id}/mjpeg?token=JWT'>."""
    if not _verify_surveillance_token(token):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    db = get_db()
    doc = await db.cameras.find_one({"_id": camera_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not doc.get("is_enabled", True):
        raise HTTPException(status_code=400, detail="Camera disabled")
    rtsp_url = doc.get("rtsp_url")
    if not rtsp_url:
        raise HTTPException(status_code=400, detail="Camera has no RTSP URL")

    # use the persistent background grabber — no per-request ffmpeg startup
    _ensure_grabber(rtsp_url, camera_id)

    return StreamingResponse(
        _stream_from_grabber(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
        },
    )


@router.get("/stream/{camera_id}/frame")
async def stream_frame(
    camera_id: str,
    token: str | None = Query(None),
):
    """Single latest JPEG frame. Frontend polls this with <img> + cache busting."""
    if not _verify_surveillance_token(token):
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    db = get_db()
    doc = await db.cameras.find_one({"_id": camera_id})
    if doc is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    if not doc.get("is_enabled", True):
        raise HTTPException(status_code=400, detail="Camera disabled")
    rtsp_url = doc.get("rtsp_url")
    if not rtsp_url:
        raise HTTPException(status_code=400, detail="Camera has no RTSP URL")

    # ensure background grabber is running (auto-retries on ffmpeg crash)
    _ensure_grabber(rtsp_url, camera_id)

    frame = _latest_frames.get(camera_id)
    if frame is None:
        for _ in range(50):
            await asyncio.sleep(0.1)
            frame = _latest_frames.get(camera_id)
            if frame:
                break

    if frame is None:
        frame = _placeholder_jpeg()

    from fastapi.responses import Response
    return Response(
        content=frame,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
        },
    )
