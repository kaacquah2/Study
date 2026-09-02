"""
Shared RAG (Retrieval-Augmented Generation) pipeline.

Uses sentence-transformers to embed documents and FAISS for vector similarity search.
Supports per-user document isolation and JSON persistence (replacing pickle).

Architecture
────────────
FAISS internal ID  (stable monotonic int64, never reused)
        ↓
_id_to_doc[faiss_id]  (dict — O(1), safe after any delete/insert)
        ↓
document metadata  {text, user_id, scope, faiss_id}

scope values
  "global"  — system-seeded educational reference material, visible to all users
  "private" — user-uploaded content, visible ONLY to its owner

This design means:
  • Deleting documents never shifts remaining IDs.
  • New insertions after deletions never reuse old IDs.
  • Retrieval is always correct across: initial insert, multiple inserts,
    delete, re-insert, app restart, persistence/reload, concurrent ops.

Usage:
    from models.rag_pipeline import rag
    rag.add_documents(["doc text…"], user_id="uid_123", scope="private")
    context = rag.retrieve("What is recursion?", user_id="uid_123", top_k=3)
"""

import os
import json
import logging
import threading
from pathlib import Path
from typing import Optional, Literal

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
_DOCS_PATH  = Path(os.getenv("FAISS_DOCS_PATH",  "vector_store/docs.json"))

DocScope = Literal["global", "private"]


class RAGPipeline:
    """
    Lightweight RAG retriever with stable FAISS ID mapping, user isolation,
    global/private scope separation, and JSON serialization.

    Key invariants
    ──────────────
    1. _next_id is a monotonically-increasing counter. It is NEVER reset or
       decremented — not even after document deletion.
    2. _id_to_doc maps every live FAISS ID to its document metadata dict.
       When a chunk is deleted both from FAISS and from _id_to_doc.
    3. Retrieval never indexes into a Python list by FAISS ID. It always does
       _id_to_doc[returned_id] which is safe regardless of deletion history.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        logger.info(f"Loading embedding model: {_EMBED_MODEL_ID}")
        prefer_local = (
            os.getenv("APP_ENV") == "production"
            or os.getenv("TRANSFORMERS_OFFLINE") == "1"
            or os.getenv("HF_HUB_OFFLINE") == "1"
        )
        try:
            if prefer_local:
                self._embed_model = SentenceTransformer(_EMBED_MODEL_ID, local_files_only=True)
            else:
                self._embed_model = SentenceTransformer(_EMBED_MODEL_ID)
        except Exception as e:
            if prefer_local and os.getenv("TRANSFORMERS_OFFLINE") != "1" and os.getenv("HF_HUB_OFFLINE") != "1":
                logger.warning(
                    f"RAG: Local embedding model load failed for '{_EMBED_MODEL_ID}' ({e}). "
                    "Attempting online fallback download..."
                )
                self._embed_model = SentenceTransformer(_EMBED_MODEL_ID)
            else:
                logger.error(f"RAG: Failed to load embedding model '{_EMBED_MODEL_ID}': {e}")
                raise

        # Get sentence embedding dimension with strict integer type guarantee
        raw_dim = getattr(self._embed_model, "get_sentence_embedding_dimension", lambda: 384)()
        self._dim: int = int(raw_dim) if raw_dim is not None else 384
        self._index: Optional[faiss.IndexIDMap] = None

        # ── Stable document registry ─────────────────────────────────────────
        # Maps FAISS ID → {text, user_id, scope, faiss_id}
        self._id_to_doc: dict[int, dict] = {}
        # Monotonic counter — only ever increments, never reused
        self._next_id: int = 0

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

    def add_documents(
        self,
        texts: list[str],
        user_id: str = "__system__",
        scope: DocScope = "private",
    ) -> int:
        """
        Chunk, embed, and add documents to the FAISS index.

        Args:
            texts:   Raw document strings.
            user_id: Owning user UID. Use "__system__" for globally-seeded content.
            scope:   "global" for reference material visible to all authenticated
                     users; "private" for content visible only to `user_id`.

        Returns:
            Number of chunks added.
        """
        chunks = []
        for text in texts:
            chunks.extend(self._chunk_text(text))

        if not chunks:
            return 0

        logger.info(f"Embedding {len(chunks)} chunks for user='{user_id}' scope='{scope}'…")
        embeddings = self._embed_model.encode(chunks, show_progress_bar=False)
        embeddings = np.array(embeddings, dtype="float32")

        with self._lock:
            if self._index is None:
                self._index = faiss.IndexIDMap(faiss.IndexFlatL2(self._dim))
            elif not isinstance(self._index, (faiss.IndexIDMap, faiss.IndexIDMap2)):
                self._index = faiss.IndexIDMap(self._index)

            # Assign stable IDs from the monotonic counter
            start = self._next_id
            ids = np.arange(start, start + len(chunks), dtype="int64")
            self._index.add_with_ids(embeddings, ids)

            for i, chunk in enumerate(chunks):
                fid = start + i
                self._id_to_doc[fid] = {
                    "text":    chunk,
                    "user_id": user_id,
                    "scope":   scope,
                    "faiss_id": fid,
                }

            self._next_id = start + len(chunks)
            self._save_index()
            logger.info(
                f"Index now contains {self._index.ntotal} vectors "
                f"(next_id={self._next_id})."
            )
            return len(chunks)

    def clear(self, user_id: Optional[str] = None) -> None:
        """
        Clear documents for a specific user (all scopes), or clear everything.

        When user_id is provided only that user's *private* documents are
        removed — global reference material is never affected by user clears.
        """
        with self._lock:
            if user_id is None:
                # Full reset
                self._index = faiss.IndexIDMap(faiss.IndexFlatL2(self._dim))
                self._id_to_doc = {}
                self._next_id = 0
                self._save_index()
                logger.info("[RAG] Full vector store reset.")
                return

            if self._index is None:
                return

            # Collect FAISS IDs belonging to this user (private scope only)
            target_ids = [
                fid for fid, doc in self._id_to_doc.items()
                if doc.get("user_id") == user_id and doc.get("scope") == "private"
            ]
            if not target_ids:
                return

            try:
                selector = faiss.IDSelectorBatch(np.array(target_ids, dtype="int64"))
                self._index.remove_ids(selector)
            except Exception as exc:
                logger.warning(
                    f"[RAG] remove_ids failed ({exc}). "
                    "Rebuilding index without the deleted entries."
                )
                self._rebuild_index_excluding(target_ids)

            # Remove from the doc registry — _next_id is NOT touched
            for fid in target_ids:
                del self._id_to_doc[fid]

            self._save_index()
            logger.info(
                f"[RAG] Cleared {len(target_ids)} private chunks for user='{user_id}'. "
                f"Index ntotal={self._index.ntotal}."
            )

    def _rebuild_index_excluding(self, excluded_ids: list[int]) -> None:
        """
        Fallback: re-embed remaining live docs when remove_ids is unavailable.
        Called inside self._lock.
        """
        excluded = set(excluded_ids)
        remaining = {fid: doc for fid, doc in self._id_to_doc.items() if fid not in excluded}

        new_index = faiss.IndexIDMap(faiss.IndexFlatL2(self._dim))
        if remaining:
            texts = [doc["text"] for doc in remaining.values()]
            fids  = list(remaining.keys())
            embeddings = self._embed_model.encode(texts, show_progress_bar=False)
            embeddings = np.array(embeddings, dtype="float32")
            new_index.add_with_ids(embeddings, np.array(fids, dtype="int64"))

        self._index = new_index

    # ── Retrieval ──────────────────────────────────────────────────────────────

    def retrieve(
        self,
        query: str,
        user_id: str = "__system__",
        top_k: int = 3,
        max_distance: Optional[float] = None,
    ) -> str:
        """
        Retrieve the top-k most relevant document chunks for this user.

        Access control:
          - scope="global" documents are returned to any authenticated user.
          - scope="private" documents are returned only to their owner.

        Args:
            query:        Search query string.
            user_id:      Requesting user's UID.
            top_k:        Maximum number of chunks to return.
            max_distance: Optional L2 distance threshold to filter low-relevance results.

        Returns:
            A newline-separated string of context chunks, or "" if none found.
        """
        with self._lock:
            if self._index is None or self._index.ntotal == 0:
                return ""

            query_embedding = self._embed_model.encode([query], show_progress_bar=False)
            query_embedding = np.array(query_embedding, dtype="float32")

            # Fetch extra candidates to account for access-control filtering
            k = min(self._index.ntotal, top_k * 5)
            distances, indices = self._index.search(query_embedding, k)

            retrieved: list[str] = []
            for dist, fid in zip(distances[0], indices[0]):
                if fid < 0:
                    # FAISS returns -1 for padding when fewer results exist
                    continue
                if max_distance is not None and float(dist) > max_distance:
                    continue

                doc = self._id_to_doc.get(int(fid))
                if doc is None:
                    # Stale FAISS ID — vector was removed but index not fully rebuilt
                    logger.debug(f"[RAG] Stale FAISS ID {fid} — skipping.")
                    continue

                doc_scope   = doc.get("scope",   "private")
                doc_user_id = doc.get("user_id", "__system__")

                # Access control
                if doc_scope == "global":
                    # Global reference material — accessible to all authenticated users
                    retrieved.append(doc["text"])
                elif doc_scope == "private" and doc_user_id == user_id:
                    # Private content — accessible only to the owner
                    retrieved.append(doc["text"])
                # else: another user's private content — skip

                if len(retrieved) >= top_k:
                    break

            return "\n\n---\n\n".join(retrieved)

    def has_documents(self, user_id: Optional[str] = None) -> bool:
        """
        Return True if there are any documents accessible to user_id.
        If user_id is None, returns True if the store is non-empty.
        """
        with self._lock:
            if self._index is None or self._index.ntotal == 0:
                return False
            if user_id is None:
                return len(self._id_to_doc) > 0
            return any(
                doc.get("scope") == "global"
                or (doc.get("scope") == "private" and doc.get("user_id") == user_id)
                for doc in self._id_to_doc.values()
            )

    def chunk_count(self, user_id: Optional[str] = None) -> int:
        """Count chunks accessible to user_id (global + user's private), or total."""
        with self._lock:
            if self._index is None:
                return 0
            if user_id is None:
                return len(self._id_to_doc)
            return sum(
                1 for doc in self._id_to_doc.values()
                if doc.get("scope") == "global"
                or (doc.get("scope") == "private" and doc.get("user_id") == user_id)
            )

    # ── Persistence ────────────────────────────────────────────────────────────

    def _save_index(self) -> None:
        """Persist FAISS index and doc registry to disk. Must be called inside self._lock."""
        _INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
        if self._index is not None:
            faiss.write_index(self._index, str(_INDEX_PATH))
        payload = {
            "next_id":   self._next_id,
            "id_to_doc": {str(k): v for k, v in self._id_to_doc.items()},
        }
        with open(_DOCS_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    def _load_index(self) -> None:
        logger.info("Loading persisted FAISS index & JSON metadata from disk…")
        try:
            # Guard against legacy pickle files
            with open(_DOCS_PATH, "rb") as probe:
                magic = probe.read(2)
            if magic[:1] == b"\x80":
                logger.warning(
                    "[RAG] Detected legacy pickle file. "
                    "Discarding stale index — documents need re-indexing."
                )
                self._index   = None
                self._id_to_doc = {}
                self._next_id   = 0
                return

            loaded = faiss.read_index(str(_INDEX_PATH))
            if not isinstance(loaded, (faiss.IndexIDMap, faiss.IndexIDMap2)):
                loaded = faiss.IndexIDMap(loaded)
            self._index = loaded

            with open(_DOCS_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)

            # Detect old format: list of strings or list of dicts (pre-stable-ID)
            if isinstance(raw, list):
                logger.warning(
                    "[RAG] Detected legacy list format in docs.json. "
                    "Rebuilding _id_to_doc from positional list — "
                    "IDs may be inconsistent; consider re-uploading documents."
                )
                self._id_to_doc = {}
                for i, item in enumerate(raw):
                    if isinstance(item, dict):
                        fid = item.get("faiss_id", i)
                        doc = {
                            "text":    item.get("text", ""),
                            "user_id": item.get("user_id", "__system__"),
                            "scope":   item.get("scope", "private"),
                            "faiss_id": int(fid),
                        }
                    else:
                        fid = i
                        doc = {
                            "text":    str(item),
                            "user_id": "__system__",
                            "scope":   "global",
                            "faiss_id": i,
                        }
                    self._id_to_doc[int(fid)] = doc
                self._next_id = max(self._id_to_doc.keys(), default=-1) + 1
            else:
                # New format: {"next_id": int, "id_to_doc": {"1001": {...}}}
                self._next_id   = int(raw.get("next_id", 0))
                id_to_doc_raw   = raw.get("id_to_doc", {})
                self._id_to_doc = {int(k): v for k, v in id_to_doc_raw.items()}

                # Migrate legacy entries that lack scope/faiss_id fields
                for fid, doc in self._id_to_doc.items():
                    if "scope" not in doc:
                        doc["scope"] = "private"
                    if "faiss_id" not in doc:
                        doc["faiss_id"] = fid

            logger.info(
                f"Loaded {self._index.ntotal} vectors, "
                f"{len(self._id_to_doc)} doc entries, "
                f"next_id={self._next_id}."
            )
        except Exception as exc:
            logger.error(
                f"[RAG] Failed to load persisted index ({exc}). "
                "Starting with an empty vector store."
            )
            self._index     = None
            self._id_to_doc = {}
            self._next_id   = 0

    # ── Chunking ───────────────────────────────────────────────────────────────

    def _chunk_text(self, text: str) -> list[str]:
        if _HAS_LANGCHAIN_SPLITTER:
            return [c.strip() for c in self._text_splitter.split_text(text) if len(c.strip()) > 30]

        # Sentence-boundary fallback
        chunks:    list[str] = []
        start      = 0
        chunk_size = 1000
        overlap    = 200
        while start < len(text):
            chunk = text[start:start + chunk_size].strip()
            if chunk:
                chunks.append(chunk)
            start += chunk_size - overlap
        return [c for c in chunks if len(c) > 30]


# Singleton instance
rag = RAGPipeline()
