"""
Visioryx - FAISS Vector Index
High-performance similarity search for face embeddings.
Uses cosine similarity via L2-normalized vectors + inner product.
"""
from __future__ import annotations

import threading
from typing import Optional

import numpy as np

from app.core.config import get_settings
from app.core.logger import get_logger

logger = get_logger("faiss_index")

_FAISS_AVAILABLE = False
try:
    import faiss  # type: ignore

    _FAISS_AVAILABLE = True
except ImportError:
    pass

_index: Optional["FAISSIndex"] = None
_lock = threading.Lock()


def _l2_normalize(x: np.ndarray) -> np.ndarray:
    """L2-normalize vectors for cosine similarity via inner product."""
    norm = np.linalg.norm(x, axis=1, keepdims=True)
    norm = np.where(norm == 0, 1.0, norm)
    return x.astype(np.float32) / norm


class FAISSIndex:
    """
    FAISS index for fast face embedding search.
    Uses IndexFlatIP (inner product) with L2-normalized vectors = cosine similarity.
    """

    def __init__(self, dimension: int = 512):
        self.dimension = dimension
        self._index: Optional["faiss.IndexFlatIP"] = None
        self._id_map: list[int] = []  # index position -> user_id
        self._count = 0

    def rebuild(self, embeddings: list[tuple[int, list[float]]]) -> None:
        """Rebuild index from (user_id, embedding) pairs."""
        if not _FAISS_AVAILABLE:
            return
        valid = [(uid, emb) for uid, emb in embeddings if emb is not None and len(emb) == self.dimension]
        if not valid:
            self._index = None
            self._id_map = []
            self._count = 0
            return
        ids = [x[0] for x in valid]
        vecs = np.array([x[1] for x in valid], dtype=np.float32)
        vecs = _l2_normalize(vecs)
        idx = faiss.IndexFlatIP(self.dimension)
        idx.add(vecs)
        self._index = idx
        self._id_map = ids
        self._count = len(ids)
        logger.info(f"FAISS index rebuilt with {self._count} embeddings")

    def search(self, embedding: list[float] | np.ndarray, threshold: float) -> Optional[tuple[int, float]]:
        """
        Search for best matching user. Returns (user_id, similarity) or None.
        Similarity is cosine (0-1 for normalized vectors via inner product).
        """
        if not _FAISS_AVAILABLE or self._index is None or self._count == 0:
            return None
        emb = np.array(embedding, dtype=np.float32).reshape(1, -1)
        emb = _l2_normalize(emb)
        scores, indices = self._index.search(emb, 1)
        if indices[0, 0] < 0:
            return None
        sim = float(scores[0, 0])
        if sim < threshold:
            return None
        user_id = self._id_map[indices[0, 0]]
        return (user_id, sim)

    @property
    def count(self) -> int:
        """Number of vectors in the index."""
        return self._count

    def search_batch(
        self, embeddings: np.ndarray, threshold: float, k: int = 1
    ) -> list[Optional[tuple[int, float]]]:
        """Batch search for multiple embeddings. Returns list of (user_id, sim) or None."""
        if not _FAISS_AVAILABLE or self._index is None or self._count == 0:
            return [None] * len(embeddings)
        if embeddings.ndim == 1:
            embeddings = embeddings.reshape(1, -1)
        embeddings = embeddings.astype(np.float32)
        embeddings = _l2_normalize(embeddings)
        scores, indices = self._index.search(embeddings, k)
        results = []
        for i in range(len(embeddings)):
            if indices[i, 0] < 0:
                results.append(None)
                continue
            sim = float(scores[i, 0])
            if sim < threshold:
                results.append(None)
            else:
                user_id = self._id_map[indices[i, 0]]
                results.append((user_id, sim))
        return results


def get_faiss_index() -> Optional[FAISSIndex]:
    """Get or create the global FAISS index."""
    global _index
    with _lock:
        if _index is None:
            settings = get_settings()
            _index = FAISSIndex(dimension=settings.EMBEDDING_DIMENSION)
        return _index


def rebuild_faiss_from_embeddings(embeddings: list[tuple[int, list[float]]]) -> None:
    """Rebuild the global FAISS index with given embeddings."""
    idx = get_faiss_index()
    if idx:
        idx.rebuild(embeddings)
