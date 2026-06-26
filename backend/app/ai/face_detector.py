"""
Visioryx - Face Detector
InsightFace for embeddings / registration; optional OpenCV Haar for live stream on macOS (stability).
"""
import sys

import cv2
import numpy as np

from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger("face_detector")

_insightface_app = None  # FaceAnalysis instance, or "missing"
_live_opencv_notice_logged = False


def _live_prefers_opencv() -> bool:
    """True → live path uses Haar only (no InsightFace in capture thread — avoids macOS SIGSEGV)."""
    s = get_settings()
    b = (s.FACE_DETECTION_BACKEND or "auto").lower().strip()
    if b == "opencv":
        return True
    if b == "insightface":
        return False
    return sys.platform == "darwin"


def _get_insightface_app():
    global _insightface_app
    if _insightface_app is not None:
        return _insightface_app
    try:
        from insightface.app import FaceAnalysis

        settings = get_settings()
        app = FaceAnalysis(name="buffalo_l", root="models/insightface")
        ctx_id = settings.INSIGHTFACE_CTX_ID
        app.prepare(
            ctx_id=ctx_id,
            det_size=(640, 640),
            det_thresh=float(settings.INSIGHTFACE_DET_THRESH),
        )
        logger.info("InsightFace FaceAnalysis loaded")
        _insightface_app = app
    except ImportError:
        logger.warning("InsightFace not installed. Using OpenCV fallback.")
        _insightface_app = "missing"
    return _insightface_app


def insightface_embeddings_enabled() -> bool:
    """False when InsightFace is not installed (OpenCV fallback only — no embeddings)."""
    return _get_insightface_app() != "missing"


def detect_faces(frame: np.ndarray, *, for_embedding: bool = False) -> list[dict]:
    """
    Detect faces in BGR frame.
    Returns list of {bbox: [x1,y1,x2,y2], landmarks, embedding (if available)}

    Use for_embedding=True for registration / recognition (always InsightFace when available).
    Default live path uses OpenCV on macOS when FACE_DETECTION_BACKEND=auto.
    """
    use_opencv_only = (not for_embedding) and _live_prefers_opencv()
    if use_opencv_only:
        global _live_opencv_notice_logged
        if not _live_opencv_notice_logged:
            logger.info(
                "Live faces: OpenCV Haar (darwin/auto safe mode). "
                "Boxes work; no embeddings on live → unknown/red unless FACE_DETECTION_BACKEND=insightface."
            )
            _live_opencv_notice_logged = True
        return _detect_faces_opencv(frame)

    app = _get_insightface_app()
    if app == "missing":
        return _detect_faces_opencv(frame)
    faces = app.get(frame)
    result = []
    for f in faces:
        emb = None
        if hasattr(f, "embedding") and f.embedding is not None:
            emb = f.embedding.tolist()
        result.append({
            "bbox": f.bbox.astype(int).tolist(),
            "landmarks": getattr(f, "kps", None),
            "embedding": emb,
            "det_score": float(getattr(f, "det_score", 1.0)),
        })
    return result


def _iou_xyxy(a: list[int], b: list[int]) -> float:
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


def _nms_face_boxes(boxes: list[list[int]], iou_thresh: float = 0.35) -> list[list[int]]:
    """Greedy NMS — keep larger boxes when Haar double-fires on frontal+profile."""
    if not boxes:
        return []
    order = sorted(range(len(boxes)), key=lambda i: (boxes[i][2] - boxes[i][0]) * (boxes[i][3] - boxes[i][1]), reverse=True)
    keep: list[list[int]] = []
    while order:
        i = order.pop(0)
        bi = boxes[i]
        keep.append(bi)
        order = [j for j in order if _iou_xyxy(bi, boxes[j]) < iou_thresh]
    return keep


def _haar_detect(
    cascade: cv2.CascadeClassifier,
    gray: np.ndarray,
    min_sz: int,
) -> list[tuple[int, int, int, int]]:
    rects = cascade.detectMultiScale(
        gray,
        scaleFactor=1.06,
        minNeighbors=2,
        minSize=(min_sz, min_sz),
        flags=cv2.CASCADE_SCALE_IMAGE,
    )
    return [(int(x), int(y), int(w), int(h)) for (x, y, w, h) in rects]


def _detect_faces_opencv(frame: np.ndarray) -> list[dict]:
    """Fallback: OpenCV Haar cascade (no embedding). Tuned for IP cams / CCTV (smaller + profile faces)."""
    if frame is None or frame.size == 0:
        return []
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    root = cv2.data.haarcascades
    frontal_path = root + "haarcascade_frontalface_default.xml"
    profile_path = root + "haarcascade_profileface.xml"
    frontal = cv2.CascadeClassifier(frontal_path)
    if frontal.empty():
        logger.error("Haar cascade missing at %s — face detection disabled", frontal_path)
        return []
    h, w = gray.shape[:2]
    min_side = min(h, w)
    # Smaller min size for ceiling / wide shots (tiny faces in frame)
    min_sz = max(14, min(96, min_side // 42))
    combined: list[tuple[int, int, int, int]] = []
    combined.extend(_haar_detect(frontal, gray, min_sz))
    prof = cv2.CascadeClassifier(profile_path)
    if not prof.empty():
        combined.extend(_haar_detect(prof, gray, min_sz))

    boxes: list[list[int]] = []
    for (x, y, rw, rh) in combined:
        boxes.append([int(x), int(y), int(x + rw), int(y + rh)])
    boxes = _nms_face_boxes(boxes, iou_thresh=0.35)
    # OpenCV Haar is less accurate - use lower confidence score to reduce false positives
    return [
        {
            "bbox": b,
            "landmarks": None,
            "embedding": None,
            "det_score": 0.3,  # Lower score - needs higher threshold in overlay
        }
        for b in boxes
    ]
