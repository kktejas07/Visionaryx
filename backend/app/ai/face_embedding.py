"""
Visioryx - Face Embedding
Extract face embeddings for matching.
"""
from typing import Optional

import cv2
import numpy as np

from app.ai.face_detector import detect_faces


def load_image_bgr(path: str) -> Optional[np.ndarray]:
    """
    Load BGR image for OpenCV / InsightFace.

    Prefer Pillow first: applies EXIF orientation (critical for iPhone/HEIC photos;
    OpenCV's imread ignores EXIF so faces can be sideways/invisible to the detector).
    HEIC/HEIF needs pillow-heif.
    """
    try:
        from PIL import Image, ImageOps

        try:
            import pillow_heif

            pillow_heif.register_heif_opener()
        except ImportError:
            pass
        with Image.open(path) as pil:
            pil = ImageOps.exif_transpose(pil)
            rgb = pil.convert("RGB")
            arr = np.asarray(rgb, dtype=np.uint8)
            return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    except Exception:
        pass
    img = cv2.imread(path)
    if img is not None and img.size > 0:
        return img
    return None


def extract_embedding(frame: np.ndarray, bbox: Optional[list[int]] = None) -> Optional[list[float]]:
    """
    Extract embedding for a single face.
    If bbox provided, crop and use; else use first detected face.
    """
    faces = detect_faces(frame, for_embedding=True)
    if not faces:
        return None
    if bbox:
        for f in faces:
            if f.get("embedding") is not None:
                return f["embedding"]
        # No embedding from detector - would need separate model
        return None
    face = faces[0]
    return face.get("embedding")


def _largest_embedding_from_faces(faces: list[dict]) -> list[list[float]]:
    valid = [f for f in faces if f.get("embedding") is not None]
    if not valid:
        return []

    def area(f: dict) -> float:
        b = f.get("bbox") or [0, 0, 0, 0]
        return float((b[2] - b[0]) * (b[3] - b[1]))

    valid.sort(key=area, reverse=True)
    return [valid[0]["embedding"]]


def _upscale_for_detection(img: np.ndarray, min_side: int = 640) -> np.ndarray:
    """Upscale small enrollment photos so InsightFace can find faces."""
    h, w = img.shape[:2]
    m = min(h, w)
    if m >= min_side:
        return img
    scale = min(2.5, float(min_side) / float(max(1, m)))
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC)


def extract_embeddings_from_bgr(img: np.ndarray) -> list[list[float]]:
    """
    Extract face embedding(s) from a BGR image array.
    If multiple faces are present, uses the largest face (typical for enrollment photos).
    Retries once on an upscaled copy if the face is small in frame.
    """
    out = _largest_embedding_from_faces(detect_faces(img, for_embedding=True))
    if out:
        return out
    up = _upscale_for_detection(img)
    if up.shape == img.shape:
        return []
    return _largest_embedding_from_faces(detect_faces(up, for_embedding=True))


def extract_embeddings_from_image(image_path: str) -> list[list[float]]:
    """Load file from disk then extract embeddings (used by scripts / batch paths)."""
    img = load_image_bgr(image_path)
    if img is None:
        return []
    return extract_embeddings_from_bgr(img)
