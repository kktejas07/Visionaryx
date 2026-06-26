"""
Visioryx - Detection Log Queue
Thread-safe queue for detection events from capture threads.
Background task processes queue and calls log_detection / log_object_detection.
"""
import asyncio
import queue
import time
from typing import Any, Optional

from app.core.logger import get_logger
from app.services.logging_service import log_detection, log_object_detection

logger = get_logger("detection_log_queue")

_detection_queue: queue.Queue = queue.Queue()
_last_logged_face: dict[tuple[int, Optional[int]], float] = {}
_last_logged_object: dict[tuple[int, str], float] = {}
LOG_THROTTLE_SEC = 0.5  # Ultra fast - 500ms for real-time detection feed
OBJECT_THROTTLE_SEC = 1.0  # 1 second for object detection


def enqueue_detection(
    camera_id: int,
    user_id: Optional[int],
    status: str,
    confidence: float,
    snapshot_path: Optional[str] = None,
    embedding: Optional[list[float]] = None,
    bbox: Optional[list[float]] = None,
):
    """Enqueue a face detection for async logging (call from sync thread)."""
    key = (camera_id, user_id)
    now = time.time()
    if key in _last_logged_face and (now - _last_logged_face[key]) < LOG_THROTTLE_SEC:
        return
    _last_logged_face[key] = now
    try:
        _detection_queue.put_nowait(
            (
                "face",
                camera_id,
                user_id,
                status,
                confidence,
                snapshot_path,
                embedding,
                bbox,
            )
        )
    except queue.Full:
        pass


def enqueue_object_detection(
    camera_id: int,
    object_name: str,
    confidence: float,
    bbox: Optional[list[float]] = None,
):
    """Enqueue an object detection for async logging (call from sync thread)."""
    key = (camera_id, object_name)
    now = time.time()
    if key in _last_logged_object and (now - _last_logged_object[key]) < OBJECT_THROTTLE_SEC:
        return
    _last_logged_object[key] = now
    try:
        _detection_queue.put_nowait(("object", camera_id, object_name, confidence, bbox))
    except queue.Full:
        pass


async def _process_queue():
    """Process detection queue (run in main event loop)."""
    while True:
        try:
            if _detection_queue.empty():
                await asyncio.sleep(1)
                continue
            item = _detection_queue.get_nowait()
            if item[0] == "face":
                parts = list(item)
                camera_id, user_id, status, confidence = parts[1], parts[2], parts[3], parts[4]
                snapshot_path = parts[5] if len(parts) > 5 else None
                embedding = parts[6] if len(parts) > 6 else None
                bbox = parts[7] if len(parts) > 7 else None
                bbox_dict = bbox
                if isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
                    bbox_dict = {"x1": bbox[0], "y1": bbox[1], "x2": bbox[2], "y2": bbox[3]}
                await log_detection(
                    camera_id, user_id, status, confidence,
                    snapshot=snapshot_path,
                    bbox=bbox_dict,
                )
                if status == "unknown" and snapshot_path and embedding:
                    await _log_unknown_face(camera_id, snapshot_path, embedding)
            elif item[0] == "object":
                _, camera_id, object_name, confidence, bbox = item
                await log_object_detection(camera_id, object_name, confidence, bbox)
        except queue.Empty:
            await asyncio.sleep(0.5)
        except Exception as e:
            logger.warning(f"Detection log error: {e}")
            await asyncio.sleep(1)


async def _log_unknown_face(camera_id: int, image_path: str, embedding: list[float]) -> None:
    """Persist unknown face to database for clustering."""
    try:
        from app.database.connection import AsyncSessionLocal
        from app.database.models import UnknownFace

        async with AsyncSessionLocal() as db:
            uf = UnknownFace(
                camera_id=camera_id,
                image=image_path,
                embedding=embedding,
            )
            db.add(uf)
            await db.commit()
    except Exception as e:
        logger.debug(f"Unknown face persist skip: {e}")


def start_queue_processor():
    """Start the background queue processor. Call from lifespan."""
    return asyncio.create_task(_process_queue())
