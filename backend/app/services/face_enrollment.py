"""
Shared face enrollment: merge multiple angle photos into one L2-normalized embedding.
"""
from __future__ import annotations

import os
import tempfile
from typing import Optional

import numpy as np

from app.ai.face_embedding import extract_embeddings_from_bgr, load_image_bgr
from app.core.config import get_settings
from app.ai.face_detector import insightface_embeddings_enabled


def merge_embeddings(embeddings: list[list[float]]) -> list[float]:
    """Average L2-normalized 512-D vectors then re-normalize (common multi-pose enrollment)."""
    if not embeddings:
        raise ValueError("empty embeddings")
    arr = np.array(embeddings, dtype=np.float32)
    v = np.mean(arr, axis=0)
    n = float(np.linalg.norm(v))
    if n < 1e-12:
        raise ValueError("zero vector")
    return (v / n).tolist()


def _embedding_from_temp_path(path: str) -> Optional[list[float]]:
    img = load_image_bgr(path)
    if img is None:
        return None
    embs = extract_embeddings_from_bgr(img)
    if not embs:
        return None
    return embs[0]


def build_embedding_from_image_bytes_list(parts: list[tuple[str, bytes]]) -> list[float]:
    """
    From 1–N (filename, raw bytes) images, extract one embedding each and merge.
    """
    if not parts:
        raise ValueError("no files")
    if not insightface_embeddings_enabled():
        raise RuntimeError("insightface_missing")

    embeddings: list[list[float]] = []
    first_err: Optional[str] = None

    for filename, raw in parts:
        ext = filename.rsplit(".", 1)[-1].lower() if filename and "." in filename else "jpg"
        if ext not in ("jpg", "jpeg", "png", "webp", "gif", "heic", "heif"):
            ext = "jpg"
        tmp = None
        try:
            fd, tmp = tempfile.mkstemp(suffix=f".{ext}", prefix="enroll_")
            os.write(fd, raw)
            os.close(fd)
            emb = _embedding_from_temp_path(tmp)
            if emb:
                embeddings.append(emb)
            elif first_err is None:
                first_err = f"No usable face in {filename}"
        finally:
            if tmp and os.path.isfile(tmp):
                try:
                    os.remove(tmp)
                except OSError:
                    pass

    if not embeddings:
        raise ValueError(first_err or "Could not extract a face from any image")

    return merge_embeddings(embeddings)


def save_primary_face_image(user_id: int, first_filename: str, first_bytes: bytes) -> str:
    """Store first enrollment image as the user's profile photo on disk."""
    settings = get_settings()
    os.makedirs(settings.REGISTERED_FACES_PATH, exist_ok=True)
    ext = first_filename.split(".")[-1] if first_filename and "." in first_filename else "jpg"
    if ext.lower() not in ("jpg", "jpeg", "png", "webp", "gif", "heic", "heif"):
        ext = "jpg"
    path = os.path.join(settings.REGISTERED_FACES_PATH, f"user_{user_id}.{ext}")
    with open(path, "wb") as f:
        f.write(first_bytes)
    return path


def apply_embedding_to_user(user, merged: list[float], image_path: str) -> None:
    user.face_embedding = merged
    user.image_path = image_path
