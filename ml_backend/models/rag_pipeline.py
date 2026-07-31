"""
Shared RAG (Retrieval-Augmented Generation) pipeline.

Uses sentence-transformers to embed documents and FAISS for vector similarity search.
Supports per-user document isolation and JSON persistence (replacing pickle).

Usage:
    from models.rag_pipeline import RAGPipeline
    rag = RAGPipeline()
    rag.add_documents(["doc 1 text..."], user_id="user_123")
    context = rag.retrieve("What is recursion?", user_id="user_123", top_k=3)
"""

import os
import json
import logging
import threading
from pathlib import Path
from typing import Optional

import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    _HAS_LANGCHAIN_SPLITTER = True
except ImportError:
    _HAS_LANGCHAIN_SPLITTER = False

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
_EMBED_MODEL_ID = os.getenv("EMBED_MODEL_ID", "sentence-transformers/all-MiniLM-L6-v2")
_INDEX_PATH = Path(os.getenv("FAISS_INDEX_PATH", "vector_store/index.faiss"))
_DOCS_PATH = Path(os.getenv("FAISS_DOCS_PATH", "vector_store/docs.json"))


class RAGPipeline:
    """
    Lightweight RAG retriever with user isolation and JSON serialization.

    - Embeds text with sentence-transformers (all-MiniLM-L6-v2)
    - Stores embeddings in FAISS with metadata tracking per user_id
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        logger.info(f"Loading embedding model: {_EMBED_MODEL_ID}")
        self._embed_model = SentenceTransformer(_EMBED_MODEL_ID)
        self._dim = self._embed_model.get_sentence_embedding_dimension()
        self._index: Optional[faiss.IndexFlatL2] = None
        # List of dicts: [{"text": str, "user_id": str}]
        self._docs: list[dict[str, str]] = []

        if _HAS_LANGCHAIN_SPLITTER:
            self._text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000,
                chunk_overlap=200,
                separators=["\n\n", "\n", ". ", " ", ""]
            )

        # Load persisted index if available
        if _INDEX_PATH.exists() and _DOCS_PATH.exists():
            self._load_index()

    # ── Indexing ──────────────────────────────────────────────────────────────

    def add_documents(self, texts: list[str], user_id: str = "default_user") -> int:
        """Chunk, embed, and add documents to the FAISS index with user scope."""
        chunks = []
        for text in texts:
            chunks.extend(self._chunk_text(text))

        if not chunks:
            return 0

        logger.info(f"Embedding {len(chunks)} chunks for user '{user_id}'...")
        embeddings = self._embed_model.encode(chunks, show_progress_bar=False)
        embeddings = np.array(embeddings, dtype="float32")

        with self._lock:
            if self._index is None:
                self._index = faiss.IndexIDMap(faiss.IndexFlatL2(self._dim))

            start_id = len(self._docs)
            ids = np.arange(start_id, start_id + len(chunks), dtype="int64")
            self._index.add_with_ids(embeddings, ids)
            for chunk in chunks:
                self._docs.append({"text": chunk, "user_id": user_id})

            self._save_index()
            logger.info(f"Index now contains {self._index.ntotal} vectors.")
            return len(chunks)

    def clear(self, user_id: Optional[str] = None) -> None:
        """Clear documents for a specific user, or clear all if user_id is None."""
        if user_id is None:
            with self._lock:
                self._index = faiss.IndexIDMap(faiss.IndexFlatL2(self._dim))
                self._docs = []
                self._save_index()
        else:
            with self._lock:
                if self._index is None:
                    return

                target_ids = [idx for idx, d in enumerate(self._docs) if d.get("user_id") == user_id]
                if not target_ids:
                    return

                # Perform fast in-place vector deletion without re-embedding remaining documents
                try:
                    self._index.remove_ids(np.array(target_ids, dtype="int64"))
                except Exception as exc:
                    logger.warn(f"[RAG] remove_ids failed ({exc}), resetting index.")
                    self._index = faiss.IndexIDMap(faiss.IndexFlatL2(self._dim))

                # Re-index doc tracking metadata
                remaining_docs = [d for d in self._docs if d.get("user_id") != user_id]
                self._docs = remaining_docs
                self._save_index()
                logger.info(f"[RAG] Cleared {len(target_ids)} chunks for user '{user_id}'. Index ntotal: {self._index.ntotal}")

    # ── Retrieval ──────────────────────────────────────────────────────────────

    def retrieve(self, query: str, user_id: str = "default_user", top_k: int = 3, max_distance: Optional[float] = None) -> str:
        """
        Retrieve the top-k most relevant document chunks matching user_id.

        Args:
            query: User prompt or search query.
            user_id: User identifier to scope document retrieval.
            top_k: Number of relevant chunks to retrieve.
            max_distance: Optional L2 distance threshold to filter out low-relevance matches.

        Returns:
            A single formatted string of context ready for prompt injection.
        """
        with self._lock:
            if self._index is None or self._index.ntotal == 0:
                return ""

            query_embedding = self._embed_model.encode([query], show_progress_bar=False)
            query_embedding = np.array(query_embedding, dtype="float32")

            # Fetch extra candidates to account for user filtering
            k = min(self._index.ntotal, top_k * 5)
            distances, indices = self._index.search(query_embedding, k)

            retrieved = []
            for dist, i in zip(distances[0], indices[0]):
                if max_distance is not None and float(dist) > max_distance:
                    continue
                if i < len(self._docs):
                    doc_item = self._docs[i]
                    # Filter by user_id or legacy default
                    if doc_item.get("user_id") == user_id or doc_item.get("user_id") == "default_user":
                        retrieved.append(doc_item["text"])
                        if len(retrieved) >= top_k:
                            break

            return "\n\n---\n\n".join(retrieved)

    def has_documents(self, user_id: Optional[str] = None) -> bool:
        with self._lock:
            if self._index is None or self._index.ntotal == 0:
                return False
            if user_id is None:
                return len(self._docs) > 0
            return any(d.get("user_id") == user_id for d in self._docs)

    def chunk_count(self, user_id: Optional[str] = None) -> int:
        with self._lock:
            if self._index is None:
                return 0
            if user_id is None:
                return len(self._docs)
            return sum(1 for d in self._docs if d.get("user_id") == user_id)

    # ── Persistence ────────────────────────────────────────────────────────────

    def _save_index(self) -> None:
        _INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
        if self._index is not None:
            faiss.write_index(self._index, str(_INDEX_PATH))
        with open(_DOCS_PATH, "w", encoding="utf-8") as f:
            json.dump(self._docs, f, ensure_ascii=False, indent=2)

    def _load_index(self) -> None:
        logger.info("Loading persisted FAISS index & JSON metadata from disk...")
        try:
            # Guard against legacy pickle files (magic byte 0x80) — the codebase
            # migrated to JSON persistence; a stale .pkl will crash json.load().
            with open(_DOCS_PATH, "rb") as probe:
                magic = probe.read(2)
            if magic[:1] == b"\x80":
                logger.warning(
                    f"[RAG] Detected legacy pickle file at '{_DOCS_PATH}'. "
                    "The vector store has been migrated to JSON format. "
                    "Discarding stale index — documents will need to be re-indexed. "
                    "You can safely delete the old .pkl file."
                )
                # Don't load the stale FAISS index either — it would be out of sync.
                self._index = None
                self._docs = []
                return

            self._index = faiss.read_index(str(_INDEX_PATH))
            with open(_DOCS_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
                # Handle legacy string format or dictionary format
                self._docs = [
                    d if isinstance(d, dict) else {"text": d, "user_id": "default_user"}
                    for d in raw
                ]
            logger.info(f"Loaded {self._index.ntotal} vectors, {len(self._docs)} document chunks.")
        except Exception as exc:
            logger.error(
                f"[RAG] Failed to load persisted index ({exc}). Starting with an empty vector store."
            )
            self._index = None
            self._docs = []


    # ── Chunking ───────────────────────────────────────────────────────────────

    def _chunk_text(self, text: str) -> list[str]:
        if _HAS_LANGCHAIN_SPLITTER:
            return [c.strip() for c in self._text_splitter.split_text(text) if len(c.strip()) > 30]

        # Sentence-boundary fallback
        chunks = []
        start = 0
        chunk_size = 1000
        overlap = 200
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            start += chunk_size - overlap
        return [c for c in chunks if len(c) > 30]


# Singleton instance
rag = RAGPipeline()
