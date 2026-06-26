"""
Visioryx - Object Detector
YOLOv8 object detection via Ultralytics.
"""
import numpy as np

from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger("object_detector")

# Target classes from spec (YOLO COCO names may vary: cell phone, backpack, etc.)
TARGET_CLASSES = {"person", "cell phone", "laptop", "backpack", "handbag", "bottle", "chair", "car", "motorcycle", "bicycle", "cup", "book"}

_model = None


def _iou_xyxy(a: list[int], b: list[int]) -> float:
    """Intersection-over-union for two axis-aligned boxes [x1,y1,x2,y2]."""
    if len(a) < 4 or len(b) < 4:
        return 0.0
    ax1, ay1, ax2, ay2 = a[:4]
    bx1, by1, bx2, by2 = b[:4]
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    aa = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    ba = max(0, bx2 - bx1) * max(0, by2 - by1)
    union = aa + ba - inter
    return float(inter / union) if union > 0 else 0.0


def _nms_by_class(detections: list[dict], iou_thresh: float) -> list[dict]:
    """Greedy NMS per class so overlapping duplicate boxes are dropped (uses OBJECT_DETECTION_IOU_THRESHOLD)."""
    if not detections or iou_thresh <= 0:
        return detections
    from collections import defaultdict

    by_name: dict[str, list[dict]] = defaultdict(list)
    for d in detections:
        by_name[str(d.get("object_name", "?"))].append(d)
    out: list[dict] = []
    for objs in by_name.values():
        sorted_objs = sorted(objs, key=lambda x: -float(x.get("confidence", 0)))
        kept: list[dict] = []
        for o in sorted_objs:
            bb = o.get("bbox") or []
            if not isinstance(bb, list) or len(bb) < 4:
                kept.append(o)
                continue
            if all(_iou_xyxy(bb, k.get("bbox") or []) < iou_thresh for k in kept):
                kept.append(o)
        out.extend(kept)
    return out


def _get_model():
    global _model
    if _model is None:
        try:
            from ultralytics import YOLO
            _model = YOLO("yolov8n.pt")  # nano for speed; use yolov8m for accuracy
            logger.info("YOLOv8 model loaded")
        except ImportError:
            logger.warning("Ultralytics not installed. Object detection disabled.")
            _model = "unavailable"
    return _model


def detect_objects(frame: np.ndarray) -> list[dict]:
    """
    Detect objects in BGR frame.
    Returns list of {name, confidence, bbox: [x1,y1,x2,y2]}
    """
    model = _get_model()
    if model == "unavailable":
        return []
    settings = get_settings()
    results = model(frame, conf=settings.OBJECT_DETECTION_CONFIDENCE, verbose=False)
    detections = []
    for r in results:
        if r.boxes is None:
            continue
        names = r.names or {}
        for box in r.boxes:
            cls_id = int(box.cls[0])
            name = names.get(cls_id, "unknown")
            if name not in TARGET_CLASSES:
                continue  # Filter to target classes
            xyxy = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            detections.append({
                "object_name": name,
                "confidence": conf,
                "bbox": [int(x) for x in xyxy],
            })
    return _nms_by_class(detections, settings.OBJECT_DETECTION_IOU_THRESHOLD)
