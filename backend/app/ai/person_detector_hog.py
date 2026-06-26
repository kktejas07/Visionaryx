"""
OpenCV HOG pedestrian detector — CPU-only, no PyTorch.
Useful when Haar face cascades miss (ceiling cameras, profiles, tiny faces).
"""
from __future__ import annotations

from typing import Optional

import cv2
import numpy as np

from app.core.logger import get_logger

logger = get_logger("person_detector_hog")

_hog: Optional[cv2.HOGDescriptor] = None
_hog_init_failed: bool = False


def _get_hog() -> Optional[cv2.HOGDescriptor]:
    global _hog, _hog_init_failed
    if _hog_init_failed:
        return None
    if _hog is not None:
        return _hog
    try:
        hog = cv2.HOGDescriptor()
        hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        _hog = hog
    except Exception as e:
        logger.warning("HOG person detector unavailable: %s", e)
        _hog_init_failed = True
    return _hog


def _iou_xyxy(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a[:4]
    bx1, by1, bx2, by2 = b[:4]
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = float((ix2 - ix1) * (iy2 - iy1))
    area_a = float((ax2 - ax1) * (ay2 - ay1))
    area_b = float((bx2 - bx1) * (by2 - by1))
    u = area_a + area_b - inter
    return inter / u if u > 0 else 0.0


def detect_people_hog(frame: np.ndarray, max_width: int = 640) -> list[dict]:
    """
    Returns list of {bbox: [x1,y1,x2,y2], confidence, object_name: 'person'}.
    Coordinates are in the same space as the input frame (may downscale internally for speed).
    """
    hog = _get_hog()
    if hog is None or frame is None or frame.size == 0:
        return []
    fh, fw = frame.shape[:2]
    scale_back = 1.0
    work = frame
    if max_width > 0 and fw > max_width:
        scale_back = fw / float(max_width)
        new_w = max_width
        new_h = max(1, int(fh / scale_back))
        work = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    try:
        rects, weights = hog.detectMultiScale(
            gray,
            winStride=(8, 8),
            padding=(16, 16),
            scale=1.06,
            hitThreshold=0.0,
        )
    except Exception as e:
        logger.debug("HOG detectMultiScale skip: %s", e)
        return []
    out: list[dict] = []
    if rects is None or len(rects) == 0:
        return out
    w_arr = weights.flatten() if weights is not None and hasattr(weights, "flatten") else weights
    n = len(rects)
    for i in range(n):
        x, y, w, h = [int(v) for v in rects[i].ravel()[:4]]
        conf = 0.5
        if w_arr is not None:
            try:
                flat = w_arr.ravel()
                if i < len(flat):
                    conf = float(flat[i])
            except Exception:
                pass
        x1 = int(round(x * scale_back))
        y1 = int(round(y * scale_back))
        x2 = int(round((x + w) * scale_back))
        y2 = int(round((y + h) * scale_back))
        out.append({
            "bbox": [x1, y1, x2, y2],
            "confidence": max(0.1, min(1.0, conf)),
            "object_name": "person",
        })
    return out


def _face_redundant_with_hog(face: list, hog_bb: list[float], iou_suppress: float) -> bool:
    """True if a face is already represented (center inside HOG body box or high IoU)."""
    if len(face) < 4 or len(hog_bb) < 4:
        return False
    if _iou_xyxy(face, hog_bb) >= iou_suppress:
        return True
    fx1, fy1, fx2, fy2 = [float(x) for x in face[:4]]
    hx1, hy1, hx2, hy2 = [float(x) for x in hog_bb[:4]]
    cx, cy = (fx1 + fx2) / 2, (fy1 + fy2) / 2
    return hx1 <= cx <= hx2 and hy1 <= cy <= hy2


def filter_hog_by_faces(
    hog_people: list[dict],
    face_bboxes: list[list],
    iou_suppress: float = 0.12,
) -> list[dict]:
    """Drop HOG boxes when a face box already covers that person (avoid duplicate boxes)."""
    if not hog_people:
        return []
    faces = [f for f in face_bboxes if f and len(f) >= 4]
    if not faces:
        return hog_people
    kept: list[dict] = []
    for h in hog_people:
        hb = h.get("bbox") or []
        if len(hb) < 4:
            continue
        if any(_face_redundant_with_hog(f, hb, iou_suppress) for f in faces):
            continue
        kept.append(h)
    return kept
