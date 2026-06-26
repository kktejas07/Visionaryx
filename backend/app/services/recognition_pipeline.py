"""
Visioryx - Recognition Pipeline
Process frame: detect faces, match, classify known/unknown.
"""
from typing import Optional

import cv2
import numpy as np

from app.ai.face_detector import detect_faces
from app.ai.face_matcher import find_best_match_with_relaxed_fallback
from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger("recognition_pipeline")


async def process_frame(
    frame: np.ndarray,
    db_embeddings: list[tuple[int, list[float]]],
) -> list[dict]:
    """
    Process single frame for face recognition.
    Returns list of {user_id?, status, confidence, bbox, embedding}
    """
    settings = get_settings()
    faces = detect_faces(frame, for_embedding=True)
    results = []
    for f in faces:
        bbox = f["bbox"]
        embedding = f.get("embedding")
        det_score = f.get("det_score", 1.0)
        if det_score < settings.FACE_DETECTION_CONFIDENCE:
            continue
        if embedding is None:
            results.append({
                "status": "unknown",
                "confidence": 0,
                "bbox": bbox,
                "user_id": None,
            })
            continue
        match = find_best_match_with_relaxed_fallback(embedding, db_embeddings)
        if match:
            user_id, sim = match
            results.append({
                "user_id": user_id,
                "status": "known",
                "confidence": sim,
                "bbox": bbox,
                "embedding": embedding,
            })
        else:
            results.append({
                "user_id": None,
                "status": "unknown",
                "confidence": 0,
                "bbox": bbox,
                "embedding": embedding,
            })
    return results
