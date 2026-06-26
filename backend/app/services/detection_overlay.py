"""
Visioryx - Detection Overlay
Draw face and object detection boxes on frames (sync, for use in capture thread).
"""
import os
import time
import uuid
from typing import Optional

import cv2
import numpy as np
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.logger import get_logger
from app.database.models import User
from app.services.runtime_app_settings import get_face_detection_enabled

logger = get_logger("detection_overlay")

MAX_EMBEDDINGS_CACHE = 500  # Max users to cache embeddings for
MAX_OVERLAY_CACHE = 16    # Max camera overlay caches to keep
MAX_USER_NAMES_CACHE = 500  # Max user names to cache

_embeddings_cache: list[tuple[int, list[float]]] = []
_user_names: dict[int, str] = {}
_embed_queue: list[int] = []  # Track insertion order for LRU
_embeddings_ts: float = 0
_engine = None
CACHE_TTL = 60.0  # Refresh embeddings every 60s
# Last drawn faces/objects per camera (bbox drawn on frames between AI runs)
_last_overlay_cache: dict[int, tuple[list[dict], list[dict]]] = {}


def _get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_engine(settings.DATABASE_URL_SYNC, pool_pre_ping=True)
    return _engine


def _load_embeddings_sync() -> list[tuple[int, list[float]]]:
    """Load user embeddings from DB (sync, for use in thread). Rebuilds FAISS index."""
    global _embeddings_cache, _embeddings_ts, _user_names
    import time
    now = time.time()
    if _embeddings_cache and (now - _embeddings_ts) < CACHE_TTL:
        return _embeddings_cache
    try:
        SessionLocal = sessionmaker(bind=_get_engine(), autoflush=False)
        with SessionLocal() as db:
            result = db.execute(
                select(User.id, User.face_embedding, User.name).where(User.face_embedding.isnot(None))
            )
            rows = result.all()
            # Limit cache size for memory efficiency
            cached_data = [(r[0], r[1]) for r in rows if r[1] is not None and len(r[1]) > 0]
            if len(cached_data) > MAX_EMBEDDINGS_CACHE:
                cached_data = cached_data[:MAX_EMBEDDINGS_CACHE]
            _embeddings_cache = cached_data
            _user_names = {r[0]: (r[2] or f"User {r[0]}") for r in rows if r[1] is not None and len(r[1]) > 0}
            # Limit user names cache
            if len(_user_names) > MAX_USER_NAMES_CACHE:
                _user_names = dict(list(_user_names.items())[:MAX_USER_NAMES_CACHE])
            _embeddings_ts = now
        # Rebuild FAISS index for fast vector search
        try:
            from app.vector_db.faiss_index import rebuild_faiss_from_embeddings
            rebuild_faiss_from_embeddings(_embeddings_cache)
        except Exception as e:
            logger.debug(f"FAISS rebuild skip: {e}")
    except Exception as e:
        logger.warning(f"Failed to load embeddings: {e}")
        _user_names = {}
    return _embeddings_cache


def invalidate_embedding_cache() -> None:
    """Call after registering/updating a user face so live matching picks up new embeddings."""
    global _embeddings_cache, _embeddings_ts, _user_names
    _embeddings_cache = []
    _user_names = {}
    _embeddings_ts = 0.0


def _save_unknown_face_crop(frame: np.ndarray, bbox: list, camera_id: int) -> Optional[str]:
    """Save unknown face crop to storage. Returns relative path or None."""
    try:
        settings = get_settings()
        path_dir = settings.UNKNOWN_FACES_PATH
        os.makedirs(path_dir, exist_ok=True)
        x1, y1, x2, y2 = [int(x) for x in bbox[:4]]
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            return None
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None
        fname = f"unknown_{int(time.time())}_{camera_id}_{uuid.uuid4().hex[:8]}.jpg"
        full_path = os.path.join(path_dir, fname)
        cv2.imwrite(full_path, crop)
        return os.path.join(path_dir, fname)
    except Exception as e:
        logger.debug(f"Save unknown face skip: {e}")
        return None


def _draw_detections(frame: np.ndarray, faces: list[dict], objects: list[dict]) -> np.ndarray:
    """Draw face and object boxes on frame."""
    out = frame.copy()
    h, w = out.shape[:2] if out.ndim == 3 else (out.shape[0], out.shape[1])
    
    for f in faces:
        bbox = f.get("bbox")
        if not bbox or len(bbox) < 4:
            continue
        x1, y1, x2, y2 = [int(x) for x in bbox[:4]]
        # Ensure coords are within frame
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            continue
            
        status = f.get("status", "unknown")
        if status == "known":
            color = (0, 255, 0)
            label = f.get("label") or "Registered"
        else:
            color = (0, 0, 255)
            label = "Unknown"
        
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        
        # Calculate text size for proper positioning
        (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        
        # Position text inside box at top-left if box is large enough, else above
        if (x2 - x1) > text_w + 10 and (y2 - y1) > text_h + 15:
            # Put text inside box
            text_x = x1 + 4
            text_y = y1 + text_h + 4
        else:
            # Put text above box
            text_x = x1
            text_y = max(y1 - 5, text_h + 5)
            # Adjust if text would go off right edge
            if text_x + text_w > x2:
                text_x = max(x2 - text_w - 2, 0)
        
        # Draw background for text readability
        cv2.rectangle(out, (text_x - 2, text_y - text_h - 2), (text_x + text_w + 2, text_y + 2), (0, 0, 0), -1)
        cv2.putText(out, label, (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
        
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
        cv2.rectangle(out, (x1, y1), (x2, y2), (255, 128, 0), 2)
        
        (text_w, text_h), _ = cv2.getTextSize(name, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        
        if (x2 - x1) > text_w + 10 and (y2 - y1) > text_h + 15:
            text_x = x1 + 4
            text_y = y1 + text_h + 4
        else:
            text_x = x1
            text_y = max(y1 - 5, text_h + 5)
            if text_x + text_w > x2:
                text_x = max(x2 - text_w - 2, 0)
        
        cv2.rectangle(out, (text_x - 2, text_y - text_h - 2), (text_x + text_w + 2, text_y + 2), (0, 0, 0), -1)
        cv2.putText(out, name, (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 128, 0), 1)
    return out


def annotate_frame(
    frame: np.ndarray,
    frame_count: int,
    camera_id: int = 0,
    run_detection_every: int = 1,
) -> np.ndarray:
    """
    Run face/object detection and draw boxes. Runs detection every frame for real-time response.
    Enqueues detections for logging. Returns annotated frame.
    """
    if frame is None or frame.size == 0:
        return frame
    
    face_enabled = get_face_detection_enabled()
    logger.debug(f"annotate_frame camera {camera_id} frame {frame_count}: face_enabled={face_enabled}")
    
    if not face_enabled:
        return frame
    
    # Always run detection on every frame (run_detection_every=1)
    # Skip only if explicitly set to higher value and frame_count doesn't align
    if run_detection_every > 1 and frame_count % run_detection_every != 0:
        cached = _last_overlay_cache.get(camera_id)
        if cached:
            faces_c, objs_c = cached
            return _draw_detections(frame, faces_c, objs_c)
        return frame
    
    # Log when detection runs for debugging
    logger.debug(f"Running detection on frame {frame_count} for camera {camera_id}")
    try:
        from app.ai.face_detector import detect_faces
        from app.ai.face_matcher import find_best_match
        from app.services.detection_log_queue import enqueue_detection, enqueue_object_detection

        settings = get_settings()
        faces_raw = detect_faces(frame)
        logger.debug(f"Face detection returned {len(faces_raw)} faces")
        embeddings = _load_embeddings_sync()
        faces_annotated = []
        for f in faces_raw:
            bbox = f.get("bbox")
            emb = f.get("embedding")
            det_score = f.get("det_score", 1.0)
            if det_score < settings.FACE_DETECTION_CONFIDENCE:
                continue
            status = "unknown"
            user_id = None
            confidence = float(det_score)
            display_label = "Unknown"
            if emb and embeddings:
                match = find_best_match(emb, embeddings)
                if match:
                    status = "known"
                    user_id, sim = match
                    confidence = sim
                    display_label = _user_names.get(user_id, f"User {user_id}")
            faces_annotated.append({"bbox": bbox, "status": status, "label": display_label})

            snapshot_path = None
            if status == "unknown" and bbox and emb and len(bbox) >= 4:
                snapshot_path = _save_unknown_face_crop(frame, bbox, camera_id)
            enqueue_detection(
                camera_id, user_id, status, confidence,
                snapshot_path=snapshot_path,
                embedding=emb if status == "unknown" else None,
                bbox=bbox,
            )
            logger.debug(f"Enqueued detection: status={status}, label={display_label}, bbox={bbox}")

        objects = []
        if settings.STREAM_ENABLE_YOLO_OVERLAY:
            try:
                from app.ai.object_detector import detect_objects

                objects = detect_objects(frame)
                for o in objects:
                    enqueue_object_detection(
                        camera_id,
                        o.get("object_name", "unknown"),
                        float(o.get("confidence", 0)),
                        o.get("bbox"),
                    )
            except Exception as e:
                logger.debug(f"Object detection skip: {e}")

        _last_overlay_cache[camera_id] = (
            [dict(f) for f in faces_annotated],
            [dict(o) for o in objects],
        )
        # Limit overlay cache size to prevent memory growth
        if len(_last_overlay_cache) > MAX_OVERLAY_CACHE:
            # Remove oldest entries
            keys_to_remove = list(_last_overlay_cache.keys())[:-MAX_OVERLAY_CACHE]
            for key in keys_to_remove:
                del _last_overlay_cache[key]
        return _draw_detections(frame, faces_annotated, objects)
    except Exception as e:
        logger.error(f"Detection overlay error: {e}")
        return frame
