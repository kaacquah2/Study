"""
FastAPI ML Backend — main entry point.

Endpoints:
  GET  /healthcheck              — Check server + model load status (authenticated)
  GET  /health                   — Container probe (readiness by default, ?probe=liveness)
  GET  /health/live              — Container HTTP liveness probe
  GET  /health/ready             — Container ML model readiness probe
  POST /summarize                — Summarize text (Flan-T5: base or fine-tuned checkpoint)
  POST /paraphrase               — Paraphrase text (Flan-T5: base or fine-tuned checkpoint)
  POST /outline                  — Generate course outline (RAG + flan-t5-large)
  POST /lesson                   — Generate lesson pages  (RAG + flan-t5-large)
  POST /quiz                     — Generate quiz          (3-stage QG/DG pipeline)
  POST /chat                     — AI study assistant     (RAG + TinyLlama)
  POST /chat/stream              — AI study assistant SSE stream
  POST /documents                — Add documents to the RAG vector store
  DELETE /documents              — Clear user documents from vector store

Run locally:
  cd ml_backend
  uvicorn main:app --reload --port 8000
"""

import os
import uuid
import json
import secrets
import asyncio
import logging
import random
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from dotenv import load_dotenv

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Load environment variables before importing model packages
load_dotenv()

from cache import cache
from schemas.types import (
    SummarizeRequest, SummarizeResponse,
    ParaphraseRequest, ParaphraseResponse,
    OutlineRequest, OutlineResponse, OutlineModule,
    LessonRequest, LessonResponse, LessonPage,
    QuizRequest, QuizResponse, QuizQuestion,
    ChatRequest, ChatResponse, DocumentsRequest,
    HealthResponse, CompletionRequest, CompletionResponse,
    ModelProvenanceInfo, ModelManifestResponse,
)

import models.summarizer as summarizer_model
import models.paraphraser as paraphraser_model
import models.outline_generator as outline_model
import models.lesson_generator as lesson_model
import models.quiz_pipeline as quiz_model
import models.chat_assistant as chat_model
from models.model_registry import (
    inference_lock, is_any_inference_busy, get_device_diagnostics,
    inference_start, inference_end, get_model_provenance_manifest,
)
from models.rag_pipeline import rag

# ── Structured JSON Logging ────────────────────────────────────────────────────
_LOG_FORMAT = os.getenv("LOG_FORMAT", "text")  # "json" for structured, "text" for human-readable

if _LOG_FORMAT == "json" or os.getenv("APP_ENV") == "production":
    class _JsonFormatter(logging.Formatter):
        """Structured JSON log formatter for production log aggregation."""
        def format(self, record: logging.LogRecord) -> str:
            import json as _json
            log_entry = {
                "timestamp": self.formatTime(record, self.datefmt),
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
                "module": record.module,
                "function": record.funcName,
                "line": record.lineno,
            }
            if record.exc_info and record.exc_info[1]:
                log_entry["exception"] = self.formatException(record.exc_info)
            return _json.dumps(log_entry)

    _handler = logging.StreamHandler()
    _handler.setFormatter(_JsonFormatter())
    logging.root.handlers = [_handler]
    logging.root.setLevel(logging.INFO)
else:
    logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)

_API_KEY = os.getenv("ML_BACKEND_API_KEY", "")
_APP_ENV = os.getenv("APP_ENV", "development")
_INFERENCE_TIMEOUT = float(os.getenv("INFERENCE_TIMEOUT", "20.0"))


def _get_inference_timeout(request: Request, multiplier: float = 1.0) -> float:
    """
    Compute effective inference timeout bounded by incoming X-Timeout-Seconds
    header and the platform ceiling.
    """
    hdr = request.headers.get("X-Timeout-Seconds")
    if hdr:
        try:
            val = float(hdr)
            if val > 0:
                return min(val, _INFERENCE_TIMEOUT * multiplier)
        except (ValueError, TypeError):
            pass
    return _INFERENCE_TIMEOUT * multiplier

# Security verification: refuse to run in production without a secure key set
if not _API_KEY and _APP_ENV.lower() == "production":
    raise ValueError(
        "FATAL: ML_BACKEND_API_KEY environment variable is required and cannot be empty when APP_ENV is set to 'production'."
    )

# Model load status tracking
_MODEL_STATUS = {
    "summarizer": "pending",
    "paraphraser": "pending",
    "outline_generator": "pending",
    "lesson_generator": "pending",
    "quiz_pipeline": "pending",
    "chat_assistant": "pending",
}

# Per-model lazy load locks to prevent race conditions during on-demand initialization
_LAZY_LOAD_LOCKS = {
    "summarizer": asyncio.Lock(),
    "paraphraser": asyncio.Lock(),
    "outline_generator": asyncio.Lock(),
    "lesson_generator": asyncio.Lock(),
    "quiz_pipeline": asyncio.Lock(),
    "chat_assistant": asyncio.Lock(),
}

# Rate limiter setup: key on trusted X-User-ID header so SvelteKit proxy users aren't aggregated to single IP
def user_key(request: Request) -> str:
    return request.headers.get("X-User-ID") or get_remote_address(request)


limiter = Limiter(key_func=user_key, default_limits=["120/minute"])


# ── Lifespan: warm up models non-blockingly in background (parallel execution) ─────────────
async def _async_warmup_models():
    logger.info("Sequential background model warmup started...")
    models_to_load = [
        ("summarizer", summarizer_model.load_summarizer),
        ("paraphraser", paraphraser_model.load_paraphraser),
        ("outline_generator", outline_model.load_model),
        ("lesson_generator", lesson_model.load_model),
        ("quiz_pipeline", quiz_model.load_models),
        ("chat_assistant", chat_model.load_model),
    ]

    for model_name, load_fn in models_to_load:
        try:
            await asyncio.to_thread(load_fn)
            _MODEL_STATUS[model_name] = "ready"
            logger.info(f"Model '{model_name}' loaded successfully in background.")
        except Exception as e:
            logger.error(f"Failed to load {model_name}: {e}")
            _MODEL_STATUS[model_name] = f"error: {str(e)}"

    logger.info("Sequential background model warmup finished.")


async def _async_seed_rag():
    """Seed sample documents into the RAG store if it's currently empty."""
    if rag.has_documents():
        logger.info(f"RAG store already has {rag.chunk_count()} chunks — skipping auto-seed.")
        return

    sample_dir = Path(__file__).parent / "vector_store" / "sample_docs"
    if not sample_dir.is_dir():
        logger.info("No sample_docs directory found — skipping auto-seed.")
        return

    texts = []
    for filepath in sorted(sample_dir.rglob("*")):
        if filepath.suffix.lower() in {".txt", ".md"}:
            try:
                content = filepath.read_text(encoding="utf-8", errors="ignore").strip()
                if content:
                    texts.append(content)
                    logger.info(f"[RAG auto-seed] Loaded: {filepath.name} ({len(content)} chars)")
            except Exception as e:
                logger.warning(f"[RAG auto-seed] Could not read {filepath}: {e}")

    if texts:
        try:
            # Seed documents are GLOBAL scope: visible to all authenticated users,
            # not tied to any individual user's private namespace.
            added = await asyncio.to_thread(
                rag.add_documents, texts, "__system__", "global"
            )
            logger.info(f"[RAG auto-seed] Done. {added} global chunks added from {len(texts)} sample documents.")
        except Exception as e:
            logger.error(f"[RAG auto-seed] Failed to seed documents: {e}")
    else:
        logger.info("[RAG auto-seed] No sample documents found.")

_EAGER_WARMUP = os.getenv("EAGER_MODEL_WARMUP", "false").lower() in ("true", "1", "yes")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("ML backend server booted.")
    manifest = get_model_provenance_manifest()
    logger.info("======================================================================")
    logger.info("AI STUDY BUDDY — MODEL PROVENANCE MANIFEST")
    logger.info(f"System Operational Mode: {manifest['system_mode'].upper()}")
    logger.info(
        f"Fine-Tuned Checkpoints: {manifest['fine_tuned_count']} | "
        f"Base Foundation: {manifest['base_count']} | "
        f"Specialized: {manifest['specialized_count']}"
    )
    logger.info("----------------------------------------------------------------------")
    for name, info in manifest["models"].items():
        logger.info(f" • {name:<18}: {info['model_id']} [{info['tier'].upper()}]")
    logger.info("======================================================================")

    if _EAGER_WARMUP:
        logger.info("Launching eager model warmup in background...")
        asyncio.create_task(_async_warmup_models())
    else:
        logger.info("Eager model warmup disabled (EAGER_MODEL_WARMUP=false). Models will load lazily on demand.")
    asyncio.create_task(_async_seed_rag())
    logger.info("ML backend HTTP server ready.")
    yield


app = FastAPI(
    title="AI Study Buddy — ML Backend",
    description="Self-hosted ML inference server powering course generation, summarization, paraphrasing, and the AI study assistant.",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]


def _handle_500_error(request: Request, endpoint_name: str, exc: Exception) -> HTTPException:
    req_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID") or str(uuid.uuid4())
    logger.error(f"[req_id={req_id}] {endpoint_name} error: {exc}", exc_info=True)
    return HTTPException(
        status_code=500,
        detail={"message": "Internal Server Error", "request_id": req_id},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    req_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID") or str(uuid.uuid4())
    logger.error(f"[req_id={req_id}] Unhandled server exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": {"message": "Internal Server Error", "request_id": req_id}},
        headers={"X-Request-ID": req_id},
    )

# ── X-Request-ID and Latency Middleware ─────────────────────────────────────────
_METRICS_COUNTERS = {
    "total_requests": 0,
    "total_errors": 0,
    "start_time": time.time(),
}
# Lock protects counter increments from concurrent writer races under multi-threaded workers.
_METRICS_LOCK = threading.Lock()


def _incr_metric(key: str) -> None:
    """Atomically increment a metrics counter."""
    with _METRICS_LOCK:
        _METRICS_COUNTERS[key] += 1


def _get_metrics_snapshot() -> dict:
    """Return a consistent snapshot of all counters."""
    with _METRICS_LOCK:
        return dict(_METRICS_COUNTERS)


@app.middleware("http")
async def request_metrics_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    start_time = time.perf_counter()
    _incr_metric("total_requests")

    try:
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-Ms"] = str(duration_ms)
        logger.info(f"[{request.method}] {request.url.path} - status={response.status_code} - duration={duration_ms}ms [req_id={request_id}]")
        return response
    except Exception as e:
        _incr_metric("total_errors")
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.error(f"[{request.method}] {request.url.path} - FAILED - duration={duration_ms}ms [req_id={request_id}]: {e}")
        raise


allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "")
if _APP_ENV.lower() == "production":
    if not allowed_origins_raw or allowed_origins_raw == "*":
        raise ValueError(
            "FATAL: ALLOWED_ORIGINS environment variable must be set to a specific frontend domain in production. Wildcard '*' is prohibited."
        )
    allowed_origins = [origin.strip() for origin in allowed_origins_raw.split(",") if origin.strip()]
    if "*" in allowed_origins:
        raise ValueError(
            "FATAL: Wildcard '*' is prohibited in ALLOWED_ORIGINS in production mode."
        )
else:
    # Development: if ALLOWED_ORIGINS is unset, use explicit localhost origins instead of "*".
    # allow_credentials=True combined with allow_origins=["*"] is rejected by browsers per the
    # CORS spec (RFC 9110 §10.2 — credentials require a specific origin, not a wildcard).
    _DEFAULT_DEV_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    allowed_origins = (
        [origin.strip() for origin in allowed_origins_raw.split(",") if origin.strip()]
        if allowed_origins_raw
        else _DEFAULT_DEV_ORIGINS
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth dependency ────────────────────────────────────────────────────────────

_ML_SECRET = os.getenv("ML_BACKEND_SECRET", "")
from cachetools import TTLCache  # already in requirements via cache.py

_NONCE_TTL = 300  # 5 minutes window (seconds)

# Fallback in-memory nonce store: bounded to prevent flood-based memory exhaustion.
# maxsize=10_000 caps memory growth; TTL ensures automatic expiry aligns with the HMAC window.
_NONCE_FALLBACK: TTLCache = TTLCache(maxsize=10_000, ttl=float(_NONCE_TTL))
_NONCE_FALLBACK_LOCK = threading.Lock()


def _is_nonce_valid(nonce: str, now: float) -> bool:  # noqa: ARG001 (now kept for signature compat)
    """
    Validate and consume a nonce to prevent replay attacks.

    Strategy:
    1. Try Redis SET key 1 EX <TTL> NX — atomic across all uvicorn workers.
       Returns True (key was set = nonce is fresh) or False (key existed = replay).
    2. Fallback to a bounded in-memory TTLCache when Redis is unavailable.
       This is per-process, so multi-worker replay protection degrades gracefully.
    """
    redis_client = getattr(cache, "_redis_client", None)
    redis_available = getattr(cache, "_redis_available", False)

    if redis_available and redis_client is not None:
        try:
            # NX: only set if Not eXists. Returns True if the key was newly set.
            result = redis_client.set(f"nonce:{nonce}", 1, ex=_NONCE_TTL, nx=True)
            return bool(result)
        except Exception:
            pass  # fall through to in-memory fallback

    # Bounded in-memory fallback
    with _NONCE_FALLBACK_LOCK:
        if nonce in _NONCE_FALLBACK:
            return False
        _NONCE_FALLBACK[nonce] = 1
        return True

async def verify_api_key_only(request: Request) -> None:
    """Authentication dependency that checks the API key header without requiring HMAC signing. Used for lightweight health checks."""
    if not _API_KEY:
        if _APP_ENV.lower() == "production":
            raise HTTPException(status_code=401, detail="Invalid API key.")
    else:
        key = request.headers.get("X-API-Key", "")
        if not secrets.compare_digest(key, _API_KEY):
            raise HTTPException(status_code=401, detail="Invalid API key.")

async def verify_api_key(request: Request) -> None:
    """Dual-layer authentication: API key check and HMAC-SHA256 nonced request signature verification."""
    await verify_api_key_only(request)

    if _ML_SECRET:
        sig = request.headers.get("X-Signature", "")
        ts_str = request.headers.get("X-Timestamp", "")
        nonce = request.headers.get("X-Nonce", "")

        if not sig or not ts_str or not nonce:
            raise HTTPException(status_code=401, detail="Missing required HMAC authentication headers.")

        try:
            ts = float(ts_str)
        except ValueError:
            raise HTTPException(status_code=401, detail="Invalid HMAC timestamp.")

        import time
        now = time.time()
        if abs(now - ts) > _NONCE_TTL:
            raise HTTPException(status_code=401, detail="HMAC request signature timestamp expired.")

        if not _is_nonce_valid(nonce, now):
            raise HTTPException(status_code=401, detail="HMAC nonce already used (replay attack detected).")

        body_bytes = await request.body()
        body_str = body_bytes.decode("utf-8") if body_bytes else "{}"
        message = f"{ts_str}.{nonce}.{body_str}"
        import hmac, hashlib
        expected_sig = hmac.new(_ML_SECRET.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()

        if not hmac.compare_digest(sig, expected_sig):
            raise HTTPException(status_code=401, detail="Invalid HMAC request signature.")



# ── Helper for lazy loading models thread-safely ──────────────────────────────
async def _ensure_model_loaded(model_name: str, check_fn, load_fn):
    if not check_fn():
        async with _LAZY_LOAD_LOCKS[model_name]:
            if not check_fn():
                logger.info(f"Model '{model_name}' not loaded yet — initializing on demand...")
                await asyncio.to_thread(load_fn)


# ── Health & Probe Subsystem ───────────────────────────────────────────────────

def _evaluate_ml_readiness() -> tuple[bool, str, dict[str, bool], dict[str, str]]:
    """
    Evaluates ML subsystem readiness and model statuses.
    Returns: (is_ready, status_string, models_loaded_map, errors_map)
    """
    models_loaded = {
        "summarizer": summarizer_model.is_loaded(),
        "paraphraser": paraphraser_model.is_loaded(),
        "outline_generator": outline_model.is_loaded(),
        "lesson_generator": lesson_model.is_loaded(),
        "quiz_pipeline": quiz_model.is_loaded(),
        "chat_assistant": chat_model.is_loaded(),
        "rag_index": rag.has_documents(),
    }

    # Dynamically update the status map based on current is_loaded state
    for model_name in ["summarizer", "paraphraser", "outline_generator", "lesson_generator", "quiz_pipeline", "chat_assistant"]:
        status = _MODEL_STATUS.get(model_name, "pending")
        if not status.startswith("error"):
            if models_loaded[model_name]:
                _MODEL_STATUS[model_name] = "ready"
            elif status == "ready":
                _MODEL_STATUS[model_name] = "pending"

    errors = {name: status for name, status in _MODEL_STATUS.items() if status.startswith("error")}

    # Critical models failure check (if any model encountered an error)
    if errors:
        return False, "unhealthy", models_loaded, errors

    # If eager warmup is active, check if all required models have completed loading
    if _EAGER_WARMUP:
        pending_models = [name for name, status in _MODEL_STATUS.items() if status == "pending"]
        if pending_models:
            return False, "warming_up", models_loaded, {}

    return True, "ready", models_loaded, {}


@app.get("/health/live", tags=["Health"])
@app.get("/health/liveness", tags=["Health"])
async def health_liveness():
    """Unauthenticated HTTP liveness probe — returns 200 as long as FastAPI process is alive."""
    counters = _get_metrics_snapshot()
    return {
        "status": "alive",
        "uptime_seconds": round(time.time() - counters["start_time"], 1),
    }


@app.get("/health/ready", tags=["Health"])
@app.get("/health/readiness", tags=["Health"])
async def health_readiness():
    """
    Unauthenticated ML readiness probe — returns 200 if ML subsystem is ready to serve inference,
    or 503 if models are warming up or in an error state.
    """
    is_ready, status_str, models_loaded, errors = _evaluate_ml_readiness()

    payload: dict[str, Any] = {
        "status": status_str,
        "ready": is_ready,
        "models_loaded": models_loaded,
        "inference_busy": is_any_inference_busy(),
        "eager_warmup": _EAGER_WARMUP,
    }
    if errors:
        payload["errors"] = errors

    status_code = 200 if is_ready else 503
    return JSONResponse(status_code=status_code, content=payload)


@app.get("/health", tags=["Health"])
async def health_probe(probe: str = "readiness"):
    """
    Standard container probe endpoint.
    Defaults to 'readiness' probe (returning 200 when ready, 503 when warming/errored),
    or 'liveness' probe via ?probe=liveness.
    """
    if probe.lower() == "liveness":
        return await health_liveness()
    return await health_readiness()


@app.get("/healthcheck", response_model=HealthResponse, dependencies=[Depends(verify_api_key_only)], tags=["Health"])
async def healthcheck(response: Response):
    """
    Protected detailed ML healthcheck & diagnostic endpoint (requires X-API-Key).
    Used by SvelteKit backend client and administrative analytics dashboards.
    Returns HTTP 200 when fully ready, or HTTP 503 when warming up or errored.
    """
    is_ready, status_str, models_loaded, errors = _evaluate_ml_readiness()
    if not is_ready:
        response.status_code = 503

    manifest = get_model_provenance_manifest(models_loaded)
    provenance_summary = {
        "system_mode": manifest["system_mode"],
        "fine_tuned_count": manifest["fine_tuned_count"],
        "base_count": manifest["base_count"],
        "specialized_count": manifest["specialized_count"],
    }

    return HealthResponse(
        status="ok" if is_ready else status_str,
        ready=is_ready,
        models_loaded=models_loaded,
        inference_busy=is_any_inference_busy(),
        errors=errors if errors else None,
        model_provenance=provenance_summary,
    )


@app.get("/models/info", response_model=ModelManifestResponse, dependencies=[Depends(verify_api_key)], tags=["Models"])
@app.get("/api/models/info", response_model=ModelManifestResponse, dependencies=[Depends(verify_api_key)], tags=["Models"])
async def get_models_info():
    """
    Protected model manifest & provenance inspection endpoint (requires X-API-Key).
    Returns complete classification (base foundation vs fine-tuned domain checkpoints)
    along with hardware diagnostics and runtime loaded statuses.
    """
    _, _, models_loaded, _ = _evaluate_ml_readiness()
    manifest_data = get_model_provenance_manifest(models_loaded)
    return ModelManifestResponse(**manifest_data)


@app.get("/metrics", dependencies=[Depends(verify_api_key)], tags=["Health"])
@app.get("/admin/metrics", dependencies=[Depends(verify_api_key)], tags=["Health"])
def metrics():
    """Protected system, inference, and operational metrics endpoint."""
    import torch
    cuda_available = torch.cuda.is_available()
    ram_mb = None
    try:
        import psutil  # type: ignore[import-untyped]
        process = psutil.Process(os.getpid())
        ram_mb = round(process.memory_info().rss / (1024 * 1024), 2)
    except Exception:
        ram_mb = None
    counters = _get_metrics_snapshot()
    uptime_sec = round(time.time() - counters["start_time"], 1)

    metrics_data: dict[str, Any] = {
        "status": "up",
        "uptime_seconds": uptime_sec,
        "total_requests": counters["total_requests"],
        "total_errors": counters["total_errors"],
        "process_ram_mb": ram_mb,
        "cuda_available": cuda_available,
        "device_name": torch.cuda.get_device_name(0) if cuda_available else "CPU",
        "inference_lock_held": is_any_inference_busy(),
        "rag_chunks": rag.chunk_count(),
        "model_status": _MODEL_STATUS,
        "diagnostics": get_device_diagnostics(),
    }
    if cuda_available:
        metrics_data["gpu_memory_allocated_mb"] = round(torch.cuda.memory_allocated() / (1024 * 1024), 2)
        metrics_data["gpu_memory_reserved_mb"] = round(torch.cuda.memory_reserved() / (1024 * 1024), 2)
    return metrics_data


# ── RAG Stats ──────────────────────────────────────────────────────────────────

@app.get("/rag-stats", dependencies=[Depends(verify_api_key)], tags=["RAG"])
def rag_stats(request: Request):
    """Return current RAG vector store statistics for the requesting user."""
    user_id = request.headers.get("X-User-ID", "__anonymous__")
    return {
        "chunk_count": rag.chunk_count(user_id=user_id),
        "has_documents": rag.has_documents(user_id=user_id),
    }


# ── Summarize ──────────────────────────────────────────────────────────────────

@app.post("/summarize", response_model=SummarizeResponse, dependencies=[Depends(verify_api_key)], tags=["AI"])
@limiter.limit("30/minute")
async def summarize(request: Request, body: SummarizeRequest, response: Response):

    await _ensure_model_loaded("summarizer", summarizer_model.is_loaded, summarizer_model.load_summarizer)

    cache_key = cache.generate_key("summarize", body.model_dump())
    cached_val, status = cache.get(cache_key)
    response.headers["X-Cache"] = status
    if status == "HIT" and cached_val:
        return SummarizeResponse(**cached_val)

    try:
        summary = await asyncio.wait_for(
            asyncio.to_thread(
                summarizer_model.summarize,
                text=body.text,
                max_length=body.max_length,
                min_length=body.min_length,
            ),
            timeout=_get_inference_timeout(request),
        )
        _MODEL_STATUS["summarizer"] = "ready"
        res_data = {"summary": summary}
        cache.set(cache_key, res_data, ttl=86400)
        return SummarizeResponse(**res_data)
    except asyncio.TimeoutError:
        logger.error("Summarization request timed out.")
        raise HTTPException(status_code=504, detail="Inference request timed out.")
    except Exception as e:
        _MODEL_STATUS["summarizer"] = f"error: {str(e)}"
        raise _handle_500_error(request, "Summarize", e)


# ── Paraphrase ─────────────────────────────────────────────────────────────────

@app.post("/paraphrase", response_model=ParaphraseResponse, dependencies=[Depends(verify_api_key)], tags=["AI"])
@limiter.limit("30/minute")
async def paraphrase(request: Request, body: ParaphraseRequest, response: Response):

    await _ensure_model_loaded("paraphraser", paraphraser_model.is_loaded, paraphraser_model.load_paraphraser)

    cache_key = cache.generate_key("paraphrase", body.model_dump())
    cached_val, status = cache.get(cache_key)
    response.headers["X-Cache"] = status
    if status == "HIT" and cached_val:
        return ParaphraseResponse(**cached_val)

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(paraphraser_model.paraphrase, text=body.text, style=body.style),
            timeout=_get_inference_timeout(request),
        )
        _MODEL_STATUS["paraphraser"] = "ready"
        res_data = {"paraphrase": result}
        cache.set(cache_key, res_data, ttl=86400)
        return ParaphraseResponse(**res_data)
    except asyncio.TimeoutError:
        logger.error("Paraphrase request timed out.")
        raise HTTPException(status_code=504, detail="Inference request timed out.")
    except Exception as e:
        _MODEL_STATUS["paraphraser"] = f"error: {str(e)}"
        raise _handle_500_error(request, "Paraphrase", e)


# ── Outline ────────────────────────────────────────────────────────────────────

@app.post("/outline", response_model=OutlineResponse, dependencies=[Depends(verify_api_key)], tags=["AI"])
@limiter.limit("20/minute")
async def outline(body: OutlineRequest, request: Request, response: Response):

    await _ensure_model_loaded("outline_generator", outline_model.is_loaded, outline_model.load_model)

    # user_id derived from the trusted X-User-ID header set by the SvelteKit server
    # after Firebase token verification. Never from client-supplied body fields.
    user_id = request.headers.get("X-User-ID", "__anonymous__")
    # Outline is RAG-augmented: output varies per user — include user_id in cache key.
    cache_params = {**body.model_dump(), "user_id": user_id}
    cache_key = cache.generate_key("outline", cache_params)
    cached_val, status = cache.get(cache_key)
    response.headers["X-Cache"] = status
    if status == "HIT" and cached_val:
        return OutlineResponse(**cached_val)

    try:
        data = await asyncio.wait_for(
            asyncio.to_thread(
                outline_model.generate_outline,
                topic=body.topic,
                module_count=body.module_count,
                fmt=body.format,
                reference_text=body.reference_text,
                user_id=user_id,
            ),
            timeout=_get_inference_timeout(request),
        )
        _MODEL_STATUS["outline_generator"] = "ready"
        modules = [OutlineModule(**m) for m in data["modules"]]
        res_obj = OutlineResponse(
            title=data["title"],
            description=data["description"],
            modules=modules,
            is_fallback=data.get("is_fallback", False),
        )
        cache.set(cache_key, res_obj.model_dump(), ttl=86400)
        return res_obj
    except asyncio.TimeoutError:
        logger.error("Outline generation request timed out.")
        raise HTTPException(status_code=504, detail="Inference request timed out.")
    except Exception as e:
        _MODEL_STATUS["outline_generator"] = f"error: {str(e)}"
        raise _handle_500_error(request, "Outline generation", e)


# ── Lesson ─────────────────────────────────────────────────────────────────────

@app.post("/lesson", response_model=LessonResponse, dependencies=[Depends(verify_api_key)], tags=["AI"])
@limiter.limit("20/minute")
async def lesson(body: LessonRequest, request: Request, response: Response):

    await _ensure_model_loaded("lesson_generator", lesson_model.is_loaded, lesson_model.load_model)

    user_id = request.headers.get("X-User-ID", "__anonymous__")
    # Lesson is RAG-augmented: output varies per user — include user_id in cache key.
    cache_params = {**body.model_dump(), "user_id": user_id}
    cache_key = cache.generate_key("lesson", cache_params)
    cached_val, status = cache.get(cache_key)
    response.headers["X-Cache"] = status
    if status == "HIT" and cached_val:
        return LessonResponse(**cached_val)

    try:
        data = await asyncio.wait_for(
            asyncio.to_thread(
                lesson_model.generate_lesson,
                course_title=body.course_title,
                module_title=body.module_title,
                learning_objective=body.learning_objective,
                key_points=body.key_points,
                course_outline=body.course_outline,
                user_id=user_id,
            ),
            timeout=_get_inference_timeout(request, multiplier=1.5),
        )
        _MODEL_STATUS["lesson_generator"] = "ready"
        pages = [LessonPage(**p) for p in data["pages"]]
        res_obj = LessonResponse(pages=pages)
        cache.set(cache_key, res_obj.model_dump(), ttl=86400)
        return res_obj
    except asyncio.TimeoutError:
        logger.error("Lesson generation request timed out.")
        raise HTTPException(status_code=504, detail="Inference request timed out.")
    except Exception as e:
        _MODEL_STATUS["lesson_generator"] = f"error: {str(e)}"
        raise _handle_500_error(request, "Lesson generation", e)


# ── Quiz ───────────────────────────────────────────────────────────────────────

@app.post("/quiz", response_model=QuizResponse, dependencies=[Depends(verify_api_key)], tags=["AI"])
@limiter.limit("20/minute")
async def quiz(request: Request, body: QuizRequest, response: Response):

    await _ensure_model_loaded("quiz_pipeline", quiz_model.is_loaded, quiz_model.load_models)

    cache_key = cache.generate_key("quiz", body.model_dump())
    cached_val, status = cache.get(cache_key)
    response.headers["X-Cache"] = status
    if status == "HIT" and cached_val:
        # Dynamic post-cache shuffling of options to keep quiz interaction fresh
        res_obj = QuizResponse(**cached_val)
        for q in res_obj.questions:
            order = list(range(len(q.options)))
            random.shuffle(order)
            q.options = [q.options[i] for i in order]
            q.correct_index = order.index(q.correct_index)
        return res_obj

    try:
        data = await asyncio.wait_for(
            asyncio.to_thread(
                quiz_model.generate_quiz,
                module_title=body.module_title,
                learning_objective=body.learning_objective,
                key_points=body.key_points,
                lesson_body=body.lesson_body,
            ),
            timeout=_get_inference_timeout(request, multiplier=1.5),
        )
        _MODEL_STATUS["quiz_pipeline"] = "ready"
        questions = [QuizQuestion(**q) for q in data["questions"]]
        res_obj = QuizResponse(questions=questions)
        cache.set(cache_key, res_obj.model_dump(), ttl=300)  # 5-min ephemeral TTL for quiz caching
        return res_obj
    except asyncio.TimeoutError:
        logger.error("Quiz generation request timed out.")
        raise HTTPException(status_code=504, detail="Inference request timed out.")
    except Exception as e:
        _MODEL_STATUS["quiz_pipeline"] = f"error: {str(e)}"
        raise _handle_500_error(request, "Quiz generation", e)


# ── Chat ───────────────────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(verify_api_key)], tags=["AI"])
@limiter.limit("30/minute")
async def chat(body: ChatRequest, request: Request, response: Response):
    await _ensure_model_loaded("chat_assistant", chat_model.is_loaded, chat_model.load_model)
    try:
        user_id = request.headers.get("X-User-ID", "__anonymous__")
        # Chat is RAG-augmented and conversation-specific — user_id is in cache key.
        cache_params = {**body.model_dump(), "user_id": user_id}
        cache_key = cache.generate_key("chat", cache_params)
        cached_val, status = cache.get(cache_key)
        response.headers["X-Cache"] = status
        if status == "HIT" and cached_val:
            return ChatResponse(**cached_val)

        reply, sources = await asyncio.wait_for(
            asyncio.to_thread(
                chat_model.chat,
                messages=[m.model_dump() for m in body.messages],
                course_context=body.course_context,
                user_id=user_id,
            ),
            timeout=_get_inference_timeout(request),
        )
        _MODEL_STATUS["chat_assistant"] = "ready"
        res_obj = ChatResponse(reply=reply, sources=sources)
        cache.set(cache_key, res_obj.model_dump(), ttl=300)  # 5-min ephemeral TTL
        return res_obj
    except asyncio.TimeoutError:
        logger.error("Chat request timed out.")
        raise HTTPException(status_code=504, detail="Inference request timed out.")
    except RuntimeError as e:
        logger.warning(f"Chat model not ready: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        _MODEL_STATUS["chat_assistant"] = f"error: {str(e)}"
        raise _handle_500_error(request, "Chat", e)


@app.post("/chat/stream", dependencies=[Depends(verify_api_key)], tags=["AI"])
@limiter.limit("30/minute")
async def chat_stream_endpoint(body: ChatRequest, request: Request):
    """
    Stream AI chat response via Server-Sent Events (SSE).
    """
    await _ensure_model_loaded("chat_assistant", chat_model.is_loaded, chat_model.load_model)
    user_id = request.headers.get("X-User-ID", "__anonymous__")
    stream_timeout = _get_inference_timeout(request)

    async def _timed_stream_generator():
        gen = chat_model.chat_stream(
            messages=[m.model_dump() for m in body.messages],
            course_context=body.course_context,
            user_id=user_id,
            timeout=stream_timeout,
        )
        try:
            while True:
                chunk = await asyncio.wait_for(
                    asyncio.to_thread(lambda: next(gen, None)),
                    timeout=stream_timeout,
                )
                if chunk is None:
                    break
                yield chunk
            _MODEL_STATUS["chat_assistant"] = "ready"
        except asyncio.TimeoutError:
            logger.error("Chat stream request timed out.")
            payload_err = json.dumps({"error": "Inference request timed out.", "done": True, "sources": []})
            yield f"data: {payload_err}\n\n"
        except Exception as e:
            _MODEL_STATUS["chat_assistant"] = f"error: {str(e)}"
            req_id = getattr(request.state, "request_id", None) or request.headers.get("X-Request-ID") or str(uuid.uuid4())
            logger.error(f"[req_id={req_id}] Chat stream error: {e}", exc_info=True)
            payload_err = json.dumps({"error": "Internal Server Error", "request_id": req_id, "done": True, "sources": []})
            yield f"data: {payload_err}\n\n"

    return StreamingResponse(
        _timed_stream_generator(),
        media_type="text/event-stream"
    )


# ── AI Completion ─────────────────────────────────────────────────────────────

@app.post("/completion", response_model=CompletionResponse, dependencies=[Depends(verify_api_key)], tags=["AI"])
@limiter.limit("30/minute")
async def completion(body: CompletionRequest, request: Request, response: Response):
    await _ensure_model_loaded("chat_assistant", chat_model.is_loaded, chat_model.load_model)
    try:
        user_id = request.headers.get("X-User-ID", "__anonymous__")
        cache_key = cache.generate_key("completion", {**body.model_dump(), "user_id": user_id})
        cached_val, status = cache.get(cache_key)
        response.headers["X-Cache"] = status
        if status == "HIT" and cached_val:
            return CompletionResponse(**cached_val)

        messages = []
        if body.system_instruction:
            messages.append({"role": "user", "content": f"[System Context: {body.system_instruction}]\n\n{body.prompt}"})
        else:
            messages.append({"role": "user", "content": body.prompt})

        reply, _ = await asyncio.wait_for(
            asyncio.to_thread(
                chat_model.chat,
                messages=messages,
                course_context=None,
                user_id=user_id,
            ),
            timeout=_get_inference_timeout(request),
        )
        _MODEL_STATUS["chat_assistant"] = "ready"
        res_obj = CompletionResponse(text=reply)
        cache.set(cache_key, res_obj.model_dump(), ttl=300)
        return res_obj
    except asyncio.TimeoutError:
        logger.error("Completion request timed out.")
        raise HTTPException(status_code=504, detail="Inference request timed out.")
    except Exception as e:
        _MODEL_STATUS["chat_assistant"] = f"error: {str(e)}"
        raise _handle_500_error(request, "Completion", e)


# ── Documents (RAG ingestion) ──────────────────────────────────────────────────

@app.post("/documents", dependencies=[Depends(verify_api_key)], tags=["RAG"])
@limiter.limit("20/minute")
async def add_documents(body: DocumentsRequest, request: Request):
    """
    Add plain-text documents to the RAG vector store for the requesting user.

    Trust boundary: user_id is derived EXCLUSIVELY from the X-User-ID header,
    which is set by the SvelteKit application server after verifying the user's
    Firebase ID token. The ML backend API key + optional HMAC signing ensure
    only the trusted SvelteKit server can reach this endpoint.
    Client-supplied identity fields in the request body are ignored.
    """
    user_id = request.headers.get("X-User-ID", "__anonymous__")
    try:
        added = await asyncio.wait_for(
            asyncio.to_thread(rag.add_documents, body.texts, user_id, "private"),
            timeout=_get_inference_timeout(request),
        )
        return {"status": "ok", "chunks_added": added, "user_id": user_id}
    except Exception as e:
        raise _handle_500_error(request, "Add documents", e)


@app.delete("/documents", dependencies=[Depends(verify_api_key)], tags=["RAG"])
@limiter.limit("20/minute")
async def clear_documents(request: Request):
    """
    Clear private documents for the requesting user from the RAG vector store.
    Global reference documents are never affected by user-initiated clears.
    """
    user_id = request.headers.get("X-User-ID", "__anonymous__")
    try:
        await asyncio.to_thread(rag.clear, user_id=user_id)
        return {"status": "ok", "message": f"Private vector store cleared for user {user_id}."}
    except Exception as e:
        raise _handle_500_error(request, "Clear documents", e)
