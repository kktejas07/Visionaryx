"""
Visioryx - Face Matcher
Cosine similarity matching against database embeddings.
Uses FAISS for fast vector search when available; falls back to linear scan.
"""
from __future__ import annotations

from typing import Optional

import numpy as np

from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger("face_matcher")


def cosine_similarity(a: list[float] | np.ndarray, b: list[float] | np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    a = np.array(a, dtype=np.float32)
    b = np.array(b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _linear_search(
    embedding: list[float],
    db_embeddings: list[tuple[int, list[float]]],
    threshold: float,
) -> Optional[tuple[int, float]]:
    """Linear scan fallback when FAISS is not available."""
    best_id = None
    best_sim = -1.0
    for user_id, db_emb in db_embeddings:
        if db_emb is None or len(db_emb) == 0:
            continue
        sim = cosine_similarity(embedding, db_emb)
        if sim > best_sim:
            best_sim = sim
            best_id = user_id
    if best_id is not None and best_sim >= threshold:
        return (best_id, best_sim)
    return None


def find_best_match(
    embedding: list[float],
    db_embeddings: list[tuple[int, list[float]]],
    *,
    threshold: Optional[float] = None,
) -> Optional[tuple[int, float]]:
    """
    Find best matching user by cosine similarity.
    Uses FAISS for fast search when index is built; otherwise linear scan.
    Returns (user_id, similarity) or None if below threshold.
    """
    th = threshold if threshold is not None else get_settings().FACE_SIMILARITY_THRESHOLD

    # Try FAISS first (faster for large embedding sets)
    try:
        from app.vector_db.faiss_index import get_faiss_index

        idx = get_faiss_index()
        if idx and idx.count > 0:
            result = idx.search(embedding, th)
            if result is not None:
                return result
    except Exception:
        pass

    # Fallback to linear search
    return _linear_search(embedding, db_embeddings, th)


def find_best_match_with_relaxed_fallback(
    embedding: list[float],
    db_embeddings: list[tuple[int, list[float]]],
) -> Optional[tuple[int, float]]:
    """
    Strict → relaxed → wide cosine similarity. Frontal enrollment vs profile/CCTV / small faces
    often needs the lower tiers; set FACE_SIMILARITY_THRESHOLD_WIDE >= RELAXED to disable the third pass.
    """
    settings = get_settings()
    strict = settings.FACE_SIMILARITY_THRESHOLD
    relaxed = settings.FACE_SIMILARITY_THRESHOLD_RELAXED
    wide = float(getattr(settings, "FACE_SIMILARITY_THRESHOLD_WIDE", 0.27))

    m = find_best_match(embedding, db_embeddings, threshold=strict)
    if m:
        return m
    if relaxed >= strict:
        return None
    m2 = find_best_match(embedding, db_embeddings, threshold=relaxed)
    if m2:
        logger.debug(
            "Face match used relaxed threshold (user_id=%s sim=%.3f strict=%.2f)",
            m2[0],
            m2[1],
            strict,
        )
        return m2
    if wide >= relaxed:
        return None
    m3 = find_best_match(embedding, db_embeddings, threshold=wide)
    if m3:
        logger.debug(
            "Face match used wide threshold (user_id=%s sim=%.3f relaxed=%.2f)",
            m3[0],
            m3[1],
            relaxed,
        )
    return m3
