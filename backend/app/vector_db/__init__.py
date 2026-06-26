"""Visioryx - Vector database for face embeddings (FAISS)."""
from app.vector_db.faiss_index import FAISSIndex, get_faiss_index

__all__ = ["FAISSIndex", "get_faiss_index"]
