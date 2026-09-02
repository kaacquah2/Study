"""
Pre-download ML models at Docker build time so cold starts are fast.
Model availability is enforced as a strict build-time invariant with
exponential-backoff retries and mandatory offline verification.

Run via: python download_models.py
"""

import os
import sys
import time
import logging
from typing import Callable, List, Tuple
from dotenv import load_dotenv

# Load .env variables if present
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("download_models")


def is_local_model_path(model_id: str) -> bool:
    """Check if model_id points to an existing local directory."""
    if os.path.isdir(model_id):
        return True
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    rel_path = os.path.join(backend_dir, model_id)
    return os.path.isdir(rel_path)


def cache_embedding_model(model_id: str, name: str) -> None:
    """Download and cache a SentenceTransformer embedding model."""
    from sentence_transformers import SentenceTransformer
    logger.info(f"[{name}] Downloading embedding model: '{model_id}'...")
    start = time.perf_counter()
    SentenceTransformer(model_id)
    elapsed = time.perf_counter() - start
    logger.info(f"[{name}] Successfully downloaded model '{model_id}' in {elapsed:.2f}s.")


def cache_seq2seq(model_id: str, name: str) -> None:
    """Download and cache a Seq2Seq (Encoder-Decoder) transformer model and tokenizer."""
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
    logger.info(f"[{name}] Downloading model (Seq2Seq): '{model_id}'...")
    start = time.perf_counter()
    AutoTokenizer.from_pretrained(model_id)
    AutoModelForSeq2SeqLM.from_pretrained(model_id)
    elapsed = time.perf_counter() - start
    logger.info(f"[{name}] Successfully downloaded model '{model_id}' in {elapsed:.2f}s.")


def cache_causallm(model_id: str, name: str) -> None:
    """Download and cache a CausalLM (Decoder-Only) transformer model and tokenizer."""
    from transformers import AutoTokenizer, AutoModelForCausalLM
    logger.info(f"[{name}] Downloading model (CausalLM): '{model_id}'...")
    start = time.perf_counter()
    AutoTokenizer.from_pretrained(model_id)
    AutoModelForCausalLM.from_pretrained(model_id)
    elapsed = time.perf_counter() - start
    logger.info(f"[{name}] Successfully downloaded model '{model_id}' in {elapsed:.2f}s.")


def cache_chat_model(model_id: str, name: str) -> None:
    """Inspect model architecture config and cache Chat model dynamically."""
    from transformers import AutoConfig
    logger.info(f"[{name}] Inspecting config for model: '{model_id}'...")
    try:
        config = AutoConfig.from_pretrained(model_id)
        if getattr(config, "is_encoder_decoder", False):
            cache_seq2seq(model_id, name)
        else:
            cache_causallm(model_id, name)
    except Exception as e:
        logger.warning(f"[{name}] Could not inspect config for '{model_id}': {e}. Falling back to CausalLM caching.")
        cache_causallm(model_id, name)


def download_with_retry(
    cache_fn: Callable[[str, str], None],
    model_id: str,
    name: str,
    max_retries: int = 3,
    initial_delay: float = 2.0,
    backoff_factor: float = 2.0,
) -> None:
    """Download and cache a model with exponential backoff retries for network resilience."""
    last_error: Exception | None = None
    delay = initial_delay
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"[{name}] Attempt {attempt}/{max_retries} downloading '{model_id}'...")
            cache_fn(model_id, name)
            return
        except Exception as exc:
            last_error = exc
            logger.warning(
                f"[{name}] Attempt {attempt}/{max_retries} failed for '{model_id}': {exc}"
            )
            if attempt < max_retries:
                time.sleep(delay)
                delay *= backoff_factor

    raise RuntimeError(
        f"Failed to download {name} ('{model_id}') after {max_retries} attempts: {last_error}"
    ) from last_error


# ── Strict Offline Verification ───────────────────────────────────────────────

def verify_offline_embedding(model_id: str, name: str) -> None:
    """Verify that an embedding model can load and run strictly offline with local_files_only=True."""
    from sentence_transformers import SentenceTransformer
    logger.info(f"[{name}] Verifying offline loading for embedding model '{model_id}'...")
    model = SentenceTransformer(model_id, local_files_only=True)
    emb = model.encode(["Build verification smoke test"])
    if emb is None or len(emb) == 0:
        raise ValueError(f"Embedding model '{model_id}' returned empty output during offline verification.")
    logger.info(f"[{name}] Offline verification PASSED for embedding model '{model_id}'.")


def verify_offline_seq2seq(model_id: str, name: str) -> None:
    """Verify that a Seq2Seq model and tokenizer can load strictly offline with local_files_only=True."""
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
    logger.info(f"[{name}] Verifying offline loading for Seq2Seq model '{model_id}'...")
    tokenizer = AutoTokenizer.from_pretrained(model_id, local_files_only=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_id, local_files_only=True)
    tokens = tokenizer("Build verification smoke test", return_tensors="pt")
    if tokens is None or "input_ids" not in tokens:
        raise ValueError(f"Tokenizer for '{model_id}' failed tokenization during offline verification.")
    logger.info(f"[{name}] Offline verification PASSED for Seq2Seq model '{model_id}'.")


def verify_offline_causallm(model_id: str, name: str) -> None:
    """Verify that a CausalLM model and tokenizer can load strictly offline with local_files_only=True."""
    from transformers import AutoTokenizer, AutoModelForCausalLM
    logger.info(f"[{name}] Verifying offline loading for CausalLM model '{model_id}'...")
    tokenizer = AutoTokenizer.from_pretrained(model_id, local_files_only=True)
    model = AutoModelForCausalLM.from_pretrained(model_id, local_files_only=True)
    tokens = tokenizer("Build verification smoke test", return_tensors="pt")
    if tokens is None or "input_ids" not in tokens:
        raise ValueError(f"Tokenizer for '{model_id}' failed tokenization during offline verification.")
    logger.info(f"[{name}] Offline verification PASSED for CausalLM model '{model_id}'.")


def verify_offline_chat(model_id: str, name: str) -> None:
    """Inspect model architecture offline and verify offline loading."""
    from transformers import AutoConfig
    logger.info(f"[{name}] Verifying offline architecture config for '{model_id}'...")
    try:
        config = AutoConfig.from_pretrained(model_id, local_files_only=True)
        if getattr(config, "is_encoder_decoder", False):
            verify_offline_seq2seq(model_id, name)
        else:
            verify_offline_causallm(model_id, name)
    except Exception as e:
        logger.warning(f"[{name}] Could not inspect config offline for '{model_id}': {e}. Testing CausalLM verification.")
        verify_offline_causallm(model_id, name)


def download_all_models() -> List[Tuple[str, str, str]]:
    """
    Download, cache, and strictly verify all configured ML models offline.
    
    Returns:
        List of failed model tuples: (task_name, model_id, error_message)
    """
    summarizer_id = os.getenv("SUMMARIZER_MODEL_ID", "google/flan-t5-base")
    paraphraser_id = os.getenv("PARAPHRASER_MODEL_ID", "google/flan-t5-base")
    outline_id = os.getenv("OUTLINE_MODEL_ID", "google/flan-t5-large")
    lesson_id = os.getenv("LESSON_MODEL_ID", "google/flan-t5-large")
    chat_id = os.getenv("CHAT_MODEL_ID", "TinyLlama/TinyLlama-1.1B-Chat-v1.0")
    embed_id = os.getenv("EMBED_MODEL_ID", "sentence-transformers/all-MiniLM-L6-v2")
    qg_id = os.getenv("QUIZ_QG_MODEL_ID", "valhalla/t5-small-qg-prepend")
    dg_id = os.getenv("QUIZ_DG_MODEL_ID", "potsawee/t5-large-generation-race-Distractor")

    download_tasks: List[Tuple[str, str, Callable[[str, str], None], Callable[[str, str], None]]] = [
        ("Embeddings", embed_id, cache_embedding_model, verify_offline_embedding),
        ("Summarizer", summarizer_id, cache_seq2seq, verify_offline_seq2seq),
        ("Outline Generator", outline_id, cache_seq2seq, verify_offline_seq2seq),
        ("Chat Assistant", chat_id, cache_chat_model, verify_offline_chat),
        ("Quiz Question Generator", qg_id, cache_seq2seq, verify_offline_seq2seq),
        ("Quiz Distractor Generator", dg_id, cache_seq2seq, verify_offline_seq2seq),
    ]

    # Add distinct models if configured
    if paraphraser_id != summarizer_id:
        download_tasks.append(("Paraphraser", paraphraser_id, cache_seq2seq, verify_offline_seq2seq))
    if lesson_id != outline_id:
        download_tasks.append(("Lesson Generator", lesson_id, cache_seq2seq, verify_offline_seq2seq))

    logger.info(f"Starting pre-caching & build-time verification for {len(download_tasks)} model targets...")
    start_total = time.perf_counter()
    failed_models: List[Tuple[str, str, str]] = []

    # ── Phase 1: Resilient Download ───────────────────────────────────────────
    logger.info("=== Phase 1: Model Pre-download (with Exponential Retries) ===")
    for name, model_id, cache_fn, _ in download_tasks:
        try:
            download_with_retry(cache_fn, model_id, name)
        except Exception as exc:
            err_msg = str(exc)
            logger.error(f"FAILED to pre-download {name} ('{model_id}'): {err_msg}", exc_info=True)
            failed_models.append((name, model_id, f"Download failure: {err_msg}"))

    # ── Phase 2: Strict Offline Build Verification ─────────────────────────────
    logger.info("=== Phase 2: Mandatory Offline Verification (Build-time Invariant) ===")
    failed_names = {name for name, _, _ in failed_models}
    for name, model_id, _, verify_fn in download_tasks:
        if name in failed_names:
            logger.warning(f"[{name}] Skipping offline verification due to prior download failure.")
            continue
        try:
            verify_fn(model_id, name)
        except Exception as exc:
            err_msg = str(exc)
            logger.error(f"FAILED offline verification for {name} ('{model_id}'): {err_msg}", exc_info=True)
            failed_models.append((name, model_id, f"Offline verification failure: {err_msg}"))

    total_elapsed = time.perf_counter() - start_total
    passed_count = len(download_tasks) - len(failed_models)
    logger.info(
        f"Model caching & verification completed in {total_elapsed:.2f}s. "
        f"Status: {passed_count}/{len(download_tasks)} verified."
    )
    return failed_models


def main() -> None:
    failed = download_all_models()
    if failed:
        logger.critical("=" * 70)
        logger.critical(f"FATAL: Build-time invariant check failed! {len(failed)} model(s) are invalid/missing:")
        for name, m_id, err in failed:
            logger.critical(f"  - [{name}] '{m_id}': {err}")
        logger.critical("Aborting image build. Incomplete models cannot be shipped to production.")
        logger.critical("=" * 70)
        # Explicit non-zero exit code to fail Docker / CI build deterministically
        sys.exit(1)
    
    logger.info("=" * 70)
    logger.info("SUCCESS: All production models verified offline and pre-cached.")
    logger.info("Build-time invariant satisfied: Image is self-contained and offline-ready.")
    logger.info("=" * 70)


if __name__ == "__main__":
    main()
