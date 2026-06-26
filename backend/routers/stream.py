"""MJPEG stream + H.264 WebSocket endpoints (MongoDB backend)."""
from __future__ import annotations

import asyncio
import logging

import jwt
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from deps import get_db

logger = logging.getLogger("visioryx")

router = APIRouter(tags=["stream"])

JWT_SECRET = None
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


async def _get_camera_rtsp(camera_id: str, token: str | None) -> str:
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
    return rtsp_url


def _placeholder_jpeg() -> bytes:
    """Minimal 1x1 black JPEG."""
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


_FFMPEG_MJPEG = [
    "ffmpeg", "-rtsp_transport", "tcp",
    "-fflags", "nobuffer", "-flags", "low_delay",
    "-analyzeduration", "0", "-probesize", "32",
    "-flush_packets", "1",
    "-i", "__RTSP_URL__",
    "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "10", "-",
]

_FFMPEG_H264 = [
    "ffmpeg", "-rtsp_transport", "tcp",
    "-fflags", "nobuffer", "-flags", "low_delay",
    "-analyzeduration", "0", "-probesize", "32",
    "-flush_packets", "1",
    "-i", "__RTSP_URL__",
    "-c", "copy",
    "-f", "mpegts",
    "-",
]

_latest_frames: dict[str, bytes] = {}
_frame_events: dict[str, asyncio.Event] = {}


async def _frame_grabber(rtsp_url: str, camera_id: str):
    """Background ffmpeg: H264 → MJPEG, signals _frame_events on each frame."""
    import subprocess
    while True:
        cmd = [w if w != "__RTSP_URL__" else rtsp_url for w in _FFMPEG_MJPEG]
        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        buf = b""
        while True:
            chunk = await process.stdout.read(65536)
            if not chunk:
                stderr_b, _ = await process.communicate()
                logger.warning("grabber exit camera=%s code=%s stderr=%s", camera_id, process.returncode, stderr_b.decode(errors="replace")[:300])
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
                ev = _frame_events.get(camera_id)
                if ev is not None:
                    ev.set()
        await asyncio.sleep(1)


_grabber_tasks: set[asyncio.Task] = set()


def _ensure_grabber(rtsp_url: str, camera_id: str):
    if not any(t.get_name() == camera_id for t in _grabber_tasks):
        task = asyncio.create_task(_frame_grabber(rtsp_url, camera_id))
        task.set_name(camera_id)
        _grabber_tasks.add(task)
        task.add_done_callback(_grabber_tasks.discard)


async def _stream_mjpeg_from_grabber(camera_id: str):
    """Event-driven MJPEG stream — no polling, no placeholder frames."""
    boundary = "frame"
    while True:
        ev = _frame_events.setdefault(camera_id, asyncio.Event())
        try:
            await asyncio.wait_for(ev.wait(), timeout=10)
        except asyncio.TimeoutError:
            continue
        ev.clear()
        frame = _latest_frames.get(camera_id)
        if frame is None:
            continue
        yield (
            b"--" + boundary.encode() + b"\r\n"
            b"Content-Type: image/jpeg\r\n"
            b"Content-Length: " + str(len(frame)).encode() + b"\r\n\r\n"
            + frame + b"\r\n"
        )


@router.get("/stream/{camera_id}/mjpeg")
async def stream_mjpeg(camera_id: str, token: str | None = Query(None)):
    """MJPEG stream via <img> tag — event-driven, no polling."""
    rtsp_url = await _get_camera_rtsp(camera_id, token)
    _ensure_grabber(rtsp_url, camera_id)
    return StreamingResponse(
        _stream_mjpeg_from_grabber(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
        },
    )


@router.get("/stream/{camera_id}/frame")
async def stream_frame(camera_id: str, token: str | None = Query(None)):
    """Single latest JPEG frame (for fallback polling)."""
    rtsp_url = await _get_camera_rtsp(camera_id, token)
    _ensure_grabber(rtsp_url, camera_id)
    ev = _frame_events.setdefault(camera_id, asyncio.Event())
    frame = _latest_frames.get(camera_id)
    if frame is None:
        try:
            await asyncio.wait_for(ev.wait(), timeout=5)
        except asyncio.TimeoutError:
            pass
        frame = _latest_frames.get(camera_id) or _placeholder_jpeg()

    from fastapi.responses import Response
    return Response(
        content=frame,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
        },
    )


@router.websocket("/stream/{camera_id}/h264")
async def stream_h264_ws(websocket: WebSocket, camera_id: str, token: str | None = Query(None)):
    """WebSocket — H.264 MPEG-TS bytes (no re-encode, -c copy). Feed to MSE with 'video/mp2t'."""
    import subprocess

    await websocket.accept()

    try:
        rtsp_url = await _get_camera_rtsp(camera_id, token)
    except HTTPException as e:
        await websocket.close(code=4001, reason=e.detail)
        return

    cmd = [w if w != "__RTSP_URL__" else rtsp_url for w in _FFMPEG_H264]
    process = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )

    async def _reader():
        while True:
            chunk = await process.stdout.read(65536)
            if not chunk:
                break
            try:
                await websocket.send_bytes(chunk)
            except Exception:
                break

    async def _watcher():
        await process.wait()
        stderr_b = await process.stderr.read()
        if process.returncode != 0:
            logger.warning("h264 ws exit camera=%s code=%s msg=%s", camera_id, process.returncode, stderr_b.decode(errors="replace")[:200])

    try:
        await asyncio.gather(_reader(), _watcher())
    except WebSocketDisconnect:
        pass
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()
