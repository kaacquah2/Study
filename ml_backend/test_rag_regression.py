"""
RAG Pipeline Regression Tests
══════════════════════════════
Verifies correctness of the stable FAISS-ID / doc-registry design across:

  1. Basic insert → retrieve
  2. Delete → retrieve (deleted user's docs absent)
  3. Delete → re-insert → retrieve (no ID collision, correct docs)
  4. Multi-user isolation (User A docs not visible to User B)
  5. Global scope (visible to all authenticated users)
  6. Private scope (visible only to owner)
  7. Persistence round-trip (save + reload maintains correct mapping)
  8. chunk_count / has_documents bookkeeping after all operations
  9. Stale-ID safety (retrieved FAISS ID that was deleted returns nothing harmful)
 10. Concurrent insert safety (basic smoke test under threading)

Run:
    cd ml_backend
    pytest test_rag_regression.py -v
"""

import sys
import json
import threading
import tempfile
from pathlib import Path

import pytest
import numpy as np

# ── Path bootstrap ─────────────────────────────────────────────────────────────
ml_backend_dir = Path(__file__).parent
if str(ml_backend_dir) not in sys.path:
    sys.path.insert(0, str(ml_backend_dir))


# ── Isolated RAGPipeline factory ───────────────────────────────────────────────

def make_rag(tmp_path: Path):
    """Return a fresh RAGPipeline that persists to an isolated tmp directory."""
    import os
    # Point env vars to temp paths before importing so the singleton
    # picks up the right location.  We bypass the module-level singleton
    # by instantiating RAGPipeline directly.
    index_path = tmp_path / "index.faiss"
    docs_path  = tmp_path / "docs.json"

    os.environ["FAISS_INDEX_PATH"] = str(index_path)
    os.environ["FAISS_DOCS_PATH"]  = str(docs_path)

    # Reimport to pick up new env vars (needed because the module reads them at
    # class-definition time via module-level constants).
    import importlib
    import models.rag_pipeline as rag_mod
    importlib.reload(rag_mod)

    return rag_mod.RAGPipeline()


# ──────────────────────────────────────────────────────────────────────────────
# 1. Basic insert → retrieve
# ──────────────────────────────────────────────────────────────────────────────

def test_basic_insert_retrieve(tmp_path):
    """Inserted documents must be retrievable immediately after insertion."""
    rag = make_rag(tmp_path)
    rag.add_documents(
        ["Python is a high-level interpreted programming language."],
        user_id="user_alpha",
        scope="private",
    )
    result = rag.retrieve("programming language", user_id="user_alpha", top_k=1)
    assert "Python" in result, f"Expected 'Python' in retrieved text, got: {result!r}"


# ──────────────────────────────────────────────────────────────────────────────
# 2. Delete → retrieve (deleted docs must vanish)
# ──────────────────────────────────────────────────────────────────────────────

def test_delete_removes_user_docs(tmp_path):
    """After clear(user_id), that user's private docs must not be retrievable."""
    rag = make_rag(tmp_path)
    rag.add_documents(
        ["Secret study notes for user alpha only."],
        user_id="user_alpha",
        scope="private",
    )
    assert rag.has_documents(user_id="user_alpha")

    rag.clear(user_id="user_alpha")

    result = rag.retrieve("secret study notes", user_id="user_alpha", top_k=5)
    assert result == "", f"Expected empty result after deletion, got: {result!r}"
    assert not rag.has_documents(user_id="user_alpha")
    assert rag.chunk_count(user_id="user_alpha") == 0


# ──────────────────────────────────────────────────────────────────────────────
# 3. Delete → re-insert → retrieve  (no ID collision; correct doc returned)
# ──────────────────────────────────────────────────────────────────────────────

def test_delete_then_reinsert_no_id_collision(tmp_path):
    """
    After deletion and re-insertion the new documents must be returned, not
    stale/wrong ones.  This is the critical regression for the len(_docs) ID bug.
    """
    rag = make_rag(tmp_path)

    rag.add_documents(["First batch: intro to algorithms."], user_id="user_alpha", scope="private")
    rag.clear(user_id="user_alpha")

    # Re-insert completely different content under the same user
    rag.add_documents(["Second batch: machine learning fundamentals."], user_id="user_alpha", scope="private")

    result = rag.retrieve("machine learning", user_id="user_alpha", top_k=3)
    assert "machine learning" in result.lower(), \
        f"Expected new doc after re-insert, got: {result!r}"

    # Old content must NOT appear
    assert "algorithms" not in result.lower(), \
        f"Stale old document appeared after delete+re-insert: {result!r}"


# ──────────────────────────────────────────────────────────────────────────────
# 4. Multi-user isolation (User A docs invisible to User B)
# ──────────────────────────────────────────────────────────────────────────────

def test_multi_user_isolation(tmp_path):
    """User B must not be able to retrieve User A's private documents."""
    rag = make_rag(tmp_path)

    rag.add_documents(
        ["User Alpha's confidential study notes on cryptography."],
        user_id="user_alpha",
        scope="private",
    )
    rag.add_documents(
        ["User Beta's notes on machine learning and neural networks."],
        user_id="user_beta",
        scope="private",
    )

    result_alpha = rag.retrieve("cryptography", user_id="user_alpha", top_k=5)
    result_beta  = rag.retrieve("cryptography", user_id="user_beta",  top_k=5)

    assert "cryptography" in result_alpha.lower(), \
        "User Alpha cannot see their own doc"
    assert "cryptography" not in result_beta.lower(), \
        f"User Beta can see User Alpha's private doc: {result_beta!r}"

    # Symmetric check
    result_alpha_ml = rag.retrieve("neural networks", user_id="user_alpha", top_k=5)
    assert "neural networks" not in result_alpha_ml.lower(), \
        f"User Alpha can see User Beta's private doc: {result_alpha_ml!r}"


# ──────────────────────────────────────────────────────────────────────────────
# 5. Global scope — visible to all authenticated users
# ──────────────────────────────────────────────────────────────────────────────

def test_global_scope_visible_to_all(tmp_path):
    """Global reference documents must be retrievable by any authenticated user."""
    rag = make_rag(tmp_path)

    rag.add_documents(
        ["General reference material: Introduction to computer science concepts."],
        user_id="__system__",
        scope="global",
    )

    result_alpha  = rag.retrieve("computer science", user_id="user_alpha",  top_k=3)
    result_beta   = rag.retrieve("computer science", user_id="user_beta",   top_k=3)
    result_gamma  = rag.retrieve("computer science", user_id="user_gamma",  top_k=3)

    assert "computer science" in result_alpha.lower(),  "User Alpha cannot see global doc"
    assert "computer science" in result_beta.lower(),   "User Beta cannot see global doc"
    assert "computer science" in result_gamma.lower(),  "User Gamma cannot see global doc"


# ──────────────────────────────────────────────────────────────────────────────
# 6. Private scope — visible only to owner
# ──────────────────────────────────────────────────────────────────────────────

def test_private_scope_owner_only(tmp_path):
    """Private documents must not be accessible to other users or anonymous."""
    rag = make_rag(tmp_path)

    rag.add_documents(
        ["Private medical notes for Alpha only: rare disease pathology."],
        user_id="user_alpha",
        scope="private",
    )

    result_owner     = rag.retrieve("pathology", user_id="user_alpha",     top_k=3)
    result_other     = rag.retrieve("pathology", user_id="user_beta",      top_k=3)
    result_anonymous = rag.retrieve("pathology", user_id="__anonymous__",  top_k=3)

    assert "pathology" in result_owner.lower(),        "Owner cannot access own private doc"
    assert "pathology" not in result_other.lower(),    f"Other user sees private doc: {result_other!r}"
    assert "pathology" not in result_anonymous.lower(), f"Anonymous sees private doc: {result_anonymous!r}"


# ──────────────────────────────────────────────────────────────────────────────
# 7. Persistence round-trip
# ──────────────────────────────────────────────────────────────────────────────

def test_persistence_roundtrip(tmp_path):
    """Save + reload must produce identical retrieval results and correct next_id."""
    rag = make_rag(tmp_path)

    rag.add_documents(["Persistence test: sorting algorithms.", "Binary search trees."],
                      user_id="user_alpha", scope="private")
    rag.add_documents(["Global reference: big-O notation."],
                      user_id="__system__", scope="global")

    next_id_before = rag._next_id
    id_to_doc_keys_before = set(rag._id_to_doc.keys())

    # Reload from disk
    rag2 = make_rag(tmp_path)

    assert rag2._next_id == next_id_before, \
        f"next_id mismatch: {rag2._next_id} vs {next_id_before}"
    assert set(rag2._id_to_doc.keys()) == id_to_doc_keys_before, \
        "ID registry mismatch after reload"

    result = rag2.retrieve("sorting algorithms", user_id="user_alpha", top_k=3)
    assert "sorting" in result.lower(), f"Private doc not found after reload: {result!r}"

    result_global = rag2.retrieve("big-O notation", user_id="user_beta", top_k=3)
    assert "big-O" in result_global or "big" in result_global.lower(), \
        f"Global doc not found after reload for different user: {result_global!r}"


# ──────────────────────────────────────────────────────────────────────────────
# 8. chunk_count / has_documents bookkeeping
# ──────────────────────────────────────────────────────────────────────────────

def test_chunk_count_and_has_documents(tmp_path):
    """Verify chunk_count and has_documents reflect actual state after all ops."""
    rag = make_rag(tmp_path)

    assert not rag.has_documents(user_id="user_alpha")
    assert rag.chunk_count(user_id="user_alpha") == 0

    rag.add_documents(["Doc 1.", "Doc 2. " * 40], user_id="user_alpha", scope="private")
    rag.add_documents(["Global ref. " * 30],      user_id="__system__",  scope="global")

    # user_alpha count = their private chunks + global chunks
    total_alpha = rag.chunk_count(user_id="user_alpha")
    assert total_alpha > 0, "chunk_count should be > 0 for user_alpha"
    assert rag.has_documents(user_id="user_alpha")

    # Delete user_alpha private docs — global should remain
    rag.clear(user_id="user_alpha")
    count_after = rag.chunk_count(user_id="user_alpha")
    # Global docs are still accessible to user_alpha
    assert count_after >= 1, "Global docs should still be counted for user_alpha after private clear"


# ──────────────────────────────────────────────────────────────────────────────
# 9. Stale FAISS ID safety — _id_to_doc.get() returns None gracefully
# ──────────────────────────────────────────────────────────────────────────────

def test_stale_faiss_id_safety(tmp_path):
    """
    If FAISS somehow returns an ID not present in _id_to_doc, retrieval
    must skip it gracefully rather than raising KeyError or returning wrong data.
    """
    rag = make_rag(tmp_path)
    rag.add_documents(["Safety test document: operating systems."],
                      user_id="user_alpha", scope="private")

    # Manually poison _id_to_doc by removing an entry (simulates stale state)
    with rag._lock:
        stale_id = next(iter(rag._id_to_doc))
        del rag._id_to_doc[stale_id]

    # Must not raise; should return empty or partial results
    try:
        result = rag.retrieve("operating systems", user_id="user_alpha", top_k=3)
    except Exception as exc:
        pytest.fail(f"retrieve() raised on stale FAISS ID: {exc}")


# ──────────────────────────────────────────────────────────────────────────────
# 10. Concurrent insert smoke test
# ──────────────────────────────────────────────────────────────────────────────

def test_concurrent_inserts(tmp_path):
    """Multiple threads inserting simultaneously must not corrupt _next_id or _id_to_doc."""
    rag = make_rag(tmp_path)

    errors: list[Exception] = []

    def insert(user_id: str, content: str):
        try:
            rag.add_documents([content], user_id=user_id, scope="private")
        except Exception as exc:
            errors.append(exc)

    threads = [
        threading.Thread(target=insert, args=(f"user_{i}", f"Thread {i} content about topic {i}. " * 5))
        for i in range(8)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"Concurrent inserts raised exceptions: {errors}"

    # Each thread should have successfully registered at least some chunks
    all_ids = set(rag._id_to_doc.keys())
    assert len(all_ids) >= 8, f"Expected at least 8 doc entries, got {len(all_ids)}"

    # _next_id must be strictly greater than every registered ID
    with rag._lock:
        if rag._id_to_doc:
            assert rag._next_id > max(rag._id_to_doc.keys()), \
                f"_next_id {rag._next_id} is not greater than max ID {max(rag._id_to_doc.keys())}"


# ──────────────────────────────────────────────────────────────────────────────
# 11. Global docs NOT deleted by user clear
# ──────────────────────────────────────────────────────────────────────────────

def test_global_docs_survive_user_clear(tmp_path):
    """clear(user_id) must never delete global reference documents."""
    rag = make_rag(tmp_path)

    rag.add_documents(["Global: fundamentals of data structures and algorithms."],
                      user_id="__system__", scope="global")
    rag.add_documents(["Private: user alpha's personal study notes."],
                      user_id="user_alpha", scope="private")

    rag.clear(user_id="user_alpha")

    # Global must still be present for any user
    result = rag.retrieve("data structures", user_id="user_beta", top_k=3)
    assert "data structures" in result.lower(), \
        f"Global doc was incorrectly deleted by user clear: {result!r}"
