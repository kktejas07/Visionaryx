"""
Visioryx - Logging Service
Log detection events to database and broadcast via WebSocket.
"""
from __future__ import annotations

from typing import Any, Optional

from app.core.logger import get_logger
from app.core.websocket_manager import ws_manager
from app.services.webhook_notify import notify_alert_webhook
from app.database.connection import AsyncSessionLocal
from app.database.models import Alert, Detection, ObjectDetection

logger = get_logger("logging_service")


async def log_object_detection(
    camera_id: int,
    object_name: str,
    confidence: float,
    bbox: Optional[dict | list] = None,
) -> int:
    """Log object detection to DB and broadcast. Returns detection id."""
    bbox_dict = None
    if bbox is not None:
        bbox_dict = {"x1": bbox[0], "y1": bbox[1], "x2": bbox[2], "y2": bbox[3]} if isinstance(bbox, (list, tuple)) and len(bbox) >= 4 else bbox
    async with AsyncSessionLocal() as db:
        obj = ObjectDetection(
            camera_id=camera_id,
            object_name=object_name,
            confidence=confidence,
            bbox=bbox_dict,
        )
        db.add(obj)
        await db.commit()
        await db.refresh(obj)
        await ws_manager.broadcast(
            "object_detected",
            {
                "camera_id": camera_id,
                "object_name": object_name,
                "confidence": confidence,
                "object_id": obj.id,
                "bbox": bbox_dict,
            },
        )
        return obj.id


async def log_detection(
    camera_id: int,
    user_id: Optional[int],
    status: str,
    confidence: float,
    snapshot: Optional[str] = None,
    bbox: Optional[dict] = None,
) -> int:
    """Log face detection to DB and broadcast. Returns detection id."""
    logger.info(f"Logging detection: camera={camera_id}, status={status}, user_id={user_id}, bbox={bbox}")
    async with AsyncSessionLocal() as db:
        det = Detection(
            camera_id=camera_id,
            user_id=user_id,
            status=status,
            confidence=confidence,
            snapshot=snapshot,
            bbox=bbox,
        )
        db.add(det)
        await db.commit()
        await db.refresh(det)
        await ws_manager.broadcast(
            "face_recognized" if status == "known" else "unknown_person_detected",
            {
                "camera_id": camera_id,
                "user_id": user_id,
                "status": status,
                "confidence": confidence,
                "detection_id": det.id,
                "snapshot": snapshot,
                "bbox": bbox,
            },
        )
        if status == "unknown":
            await create_alert(camera_id, "unknown_face", f"Unknown person detected (conf: {confidence:.0%})")
        return det.id


async def create_alert(camera_id: Optional[int], alert_type: str, message: str, severity: str = "warning"):
    """Create alert and broadcast."""
    async with AsyncSessionLocal() as db:
        alert = Alert(
            camera_id=camera_id,
            alert_type=alert_type,
            message=message,
            severity=severity,
        )
        db.add(alert)
        await db.commit()
        await db.refresh(alert)
        await ws_manager.broadcast("alert", {"id": alert.id, "type": alert_type, "message": message})
        await notify_alert_webhook(alert.id, alert_type, message)
