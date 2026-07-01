"""MJPEG stream + H.264 WebSocket + face detection overlay (MongoDB backend)."""
from __future__ import annotations

import asyncio
import logging
import os
import time

import jwt
import numpy as np
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from deps import get_db

logger = logging.getLogger("visioryx")

# ---------------------------------------------------------------------------
# Lazy imports for face detection (graceful if models not installed)
# ---------------------------------------------------------------------------
_HAS_FACE_DETECTION = False
_FACE_DETECTOR = None
_FACE_MATCHER = None
_AI_FACE_ENABLED_DB: bool | None = None  # Overridden by MongoDB detection_overlays.face_detection_enabled
_AI_FACE_LAST_CHECK = 0.0

async def _refresh_ai_face_enabled():
    """Read face_detection_enabled from MongoDB settings (refreshes every 5s).
    Falls back to STREAM_ENABLE_AI_OVERLAY env var if no DB override."""
    global _AI_FACE_ENABLED_DB, _AI_FACE_LAST_CHECK
    now = time.time()
    if now - _AI_FACE_LAST_CHECK < 5:
        return
    _AI_FACE_LAST_CHECK = now
    try:
        db = get_db()
        doc = await db.settings.find_one({"_id": "detection_overlays"})
        if doc is not None and "face_detection_enabled" in doc:
            _AI_FACE_ENABLED_DB = bool(doc["face_detection_enabled"])
        else:
            _AI_FACE_ENABLED_DB = None  # use env fallback
    except Exception:
        pass

def _face_detection_effective_enabled() -> bool:
    """True when face detection should run. DB override takes priority;
    defaults to True (enabled) when no explicit DB setting exists."""
    if _AI_FACE_ENABLED_DB is not None:
        return _AI_FACE_ENABLED_DB
    return True

try:
    from app.ai.face_detector import detect_faces as _detect_faces
    from app.ai.face_matcher import find_best_match as _find_best_match
    import cv2
    _HAS_FACE_DETECTION = True
    _HAS_CV2 = True
    _FACE_DETECTOR = _detect_faces
    _FACE_MATCHER = _find_best_match
    logger.info("Face detection overlay ENABLED")
except Exception as exc:
    _HAS_CV2 = False
    logger.warning("Face detection modules not available: %s", exc)


def _draw_detections(frame, faces: list, objects: list):
    """Draw face and object boxes on frame — self-contained, no DB deps."""
    out = frame.copy()
    h, w = out.shape[:2] if out.ndim == 3 else (out.shape[0], out.shape[1])
    import cv2 as _cv
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
        label = f.get("label") or ("Registered" if status == "known" else "Unknown")
        _cv.rectangle(out, (x1, y1), (x2, y2), color, 2)
        (text_w, text_h), _ = _cv.getTextSize(label, _cv.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        pad = 3
        text_x, text_y = x1, y1 - pad
        if text_y - text_h < 0:
            text_y = y2 + text_h + pad
        if text_x + text_w > w:
            text_x = max(w - text_w - pad, 0)
        bg_x1, bg_y1 = max(text_x - pad, 0), max(text_y - text_h - pad, 0)
        bg_x2, bg_y2 = min(text_x + text_w + pad, w), min(text_y + pad, h)
        if bg_x2 > bg_x1 and bg_y2 > bg_y1:
            roi = out[bg_y1:bg_y2, bg_x1:bg_x2]
            out[bg_y1:bg_y2, bg_x1:bg_x2] = (roi * 0.25 + 30 * 0.75).astype(np.uint8)
        _cv.putText(out, label, (text_x, text_y), _cv.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    for o in objects:
        bbox = o.get("bbox")
        if not bbox or len(bbox) < 4:
            continue
        x1, y1, x2, y2 = [int(x) for x in bbox[:4]]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            continue
        name = o.get("object_name", "?")
        _cv.rectangle(out, (x1, y1), (x2, y2), (255, 128, 0), 2)
        (_tw, _th), _ = _cv.getTextSize(name, _cv.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        _pad = 3
        _tx, _ty = x1, y1 - _pad
        if _ty - _th < 0:
            _ty = y2 + _th + _pad
        if _tx + _tw > w:
            _tx = max(w - _tw - _pad, 0)
        _bgx1, _bgy1 = max(_tx - _pad, 0), max(_ty - _th - _pad, 0)
        _bgx2, _bgy2 = min(_tx + _tw + _pad, w), min(_ty + _pad, h)
        if _bgx2 > _bgx1 and _bgy2 > _bgy1:
            roi = out[_bgy1:_bgy2, _bgx1:_bgx2]
            out[_bgy1:_bgy2, _bgx1:_bgx2] = (roi * 0.25 + 30 * 0.75).astype(np.uint8)
        _cv.putText(out, name, (_tx, _ty), _cv.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    return out

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
    "-an",
    "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "15", "-r", "15", "-",
]

_FFMPEG_H264 = [
    "ffmpeg", "-rtsp_transport", "tcp",
    "-fflags", "nobuffer", "-flags", "low_delay",
    "-analyzeduration", "0", "-probesize", "32",
    "-flush_packets", "1",
    "-i", "__RTSP_URL__",
    "-an", "-c:v", "copy",
    "-f", "mpegts",
    "-",
]

_latest_frames: dict[str, bytes] = {}
_frame_events: dict[str, asyncio.Event] = {}

# ---------------------------------------------------------------------------
# Face detection overlay helpers (MongoDB embeddings)
# ---------------------------------------------------------------------------
_ai_embeddings: list[tuple[str, list[float]]] = []
_ai_counter: int = 0
# Debounced detection logging: collect in _annotate_jpeg, flush in _frame_grabber.
_pending_detections: dict[str, list[dict]] = {}
_last_detection_logged: dict[str, float] = {}
_DETECTION_LOG_COOLDOWN = 30  # seconds between alerts for same camera+person
# Cache last annotations per camera so boxes persist between detection frames.
_last_face_annots: dict[str, list[dict]] = {}


async def _load_ai_embeddings():
    """Load face embeddings from MongoDB users collection into memory (async)."""
    global _ai_embeddings
    if _ai_embeddings:
        return
    try:
        db = get_db()
        cursor = db.users.find(
            {"face_embedding": {"$exists": True, "$ne": None}},
            {"face_embedding": 1, "name": 1, "email": 1},
        )
        result = []
        async for doc in cursor:
            emb = doc.get("face_embedding")
            if emb and isinstance(emb, list) and len(emb) > 0:
                result.append((doc.get("name") or doc.get("email", "?"), emb))
        _ai_embeddings = result
        logger.info("Loaded %d face embeddings for detection", len(_ai_embeddings))
    except Exception as exc:
        logger.warning("Failed to load face embeddings: %s", exc)


def _annotate_jpeg(jpeg_bytes: bytes, camera_id: str = "") -> bytes:
    """Decode JPEG → run face detection every Nth frame → draw boxes every frame.
    Caches last annotations so boxes stay visible between detection runs."""
    global _ai_counter, _pending_detections, _last_detection_logged

    if not _HAS_FACE_DETECTION:
        return jpeg_bytes
    if not _face_detection_effective_enabled():
        _last_face_annots.pop(camera_id, None)
        return jpeg_bytes

    _ai_counter += 1
    run_detection = (_ai_counter % 3 == 0)

    # No cached boxes yet and not a detection frame — nothing to do.
    if not run_detection and camera_id not in _last_face_annots:
        return jpeg_bytes

    try:
        arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            return jpeg_bytes

        annots: list[dict] = []
        collected: list[dict] = []

        if run_detection:
            faces = _FACE_DETECTOR(frame, for_embedding=False)
            for f in faces:
                bbox = f.get("bbox")
                if f.get("det_score", 0) < 0.3:
                    continue
                status = "unknown"
                label = "Unknown"
                confidence = float(f.get("det_score", 0.5))
                if _ai_embeddings and f.get("embedding"):
                    match = _FACE_MATCHER(f["embedding"], [(i, e) for i, (_, e) in enumerate(_ai_embeddings)])
                    if match is not None:
                        idx, score = match
                        status = "known"
                        label = _ai_embeddings[idx][0] if idx < len(_ai_embeddings) else "Known"
                        confidence = score
                annots.append({"bbox": bbox, "status": status, "label": label})
                # Debounced logging.
                dedup_key = f"{camera_id}:{label}"
                last_ts = _last_detection_logged.get(dedup_key, 0)
                if camera_id and (time.time() - last_ts) > _DETECTION_LOG_COOLDOWN:
                    _last_detection_logged[dedup_key] = time.time()
                    collected.append({
                        "camera_id": camera_id,
                        "user_name": label,
                        "status": status,
                        "confidence": confidence,
                        "bbox": bbox,
                    })
            if camera_id:
                _last_face_annots[camera_id] = annots
            if collected and camera_id:
                _pending_detections.setdefault(camera_id, []).extend(collected)
        else:
            # Reuse cached annotations from previous detection run.
            annots = _last_face_annots.get(camera_id, [])

        if annots:
            frame = _draw_detections(frame, annots, [])

        _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return buf.tobytes()
    except Exception:
        return jpeg_bytes


async def _flush_detections(camera_id: str):
    """Write collected detection alerts to MongoDB (debounced)."""
    global _pending_detections
    dets = _pending_detections.pop(camera_id, None)
    if not dets:
        return
    try:
        db = get_db()
        cam = await db.cameras.find_one({"_id": camera_id})
        cam_name = (cam or {}).get("camera_name", camera_id)
        now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
        for det in dets:
            await db.alerts.insert_one({
                "_id": str(__import__("uuid").uuid4()),
                "alert_type": "Face detected" if det["status"] == "known" else "Face detected (unknown)",
                "severity": "info" if det["status"] == "known" else "medium",
                "message": f"{det['user_name']} detected",
                "user_name": det["user_name"],
                "status": det["status"],
                "confidence": det["confidence"],
                "camera_id": camera_id,
                "camera_name": cam_name,
                "timestamp": now,
                "is_read": False,
            })
    except Exception:
        pass


async def _frame_grabber(rtsp_url: str, camera_id: str):
    """Background ffmpeg: H264 → MJPEG, signals _frame_events on each frame."""
    import subprocess

    # Load face embeddings on first run (if detection is effectively enabled)
    if _HAS_FACE_DETECTION and not _ai_embeddings:
        await _load_ai_embeddings()

    _det_count = 0
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
                if time.time() - _AI_FACE_LAST_CHECK > 5:
                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(_refresh_ai_face_enabled())
                    except RuntimeError:
                        pass
                _latest_frames[camera_id] = _annotate_jpeg(frame, camera_id)
                _det_count += 1
                # Flush pending detections to MongoDB every 5 frames.
                if _det_count % 5 == 0 and camera_id in _pending_detections:
                    loop = asyncio.get_running_loop()
                    loop.create_task(_flush_detections(camera_id))
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
