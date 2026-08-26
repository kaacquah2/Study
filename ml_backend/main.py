"""
FastAPI ML Backend — main entry point.

Endpoints:
  GET  /healthcheck              — Check server + model load status
  GET  /health                   — Container liveness probe
  POST /summarize                — Summarize text (fine-tuned flan-t5)
  POST /paraphrase               — Paraphrase text (fine-tuned flan-t5)
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
import secrets
import asyncio
import logging
import random
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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
)

import models.summarizer as summarizer_model
import models.paraphraser as paraphraser_model
import models.outline_generator as outline_model
import models.lesson_generator as lesson_model
import models.quiz_pipeline as quiz_model
import models.chat_assistant as chat_model
from models.model_registry import inference_lock, is_any_inference_busy, get_device_diagnostics, inference_start, inference_end
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
_INFERENCE_TIMEOUT = float(os.getenv("INFERENCE_TIMEOUT", "60.0"))

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

# Rate limiter setup
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])


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

# ── X-Request-ID and Latency Middleware ─────────────────────────────────────────
import time
import psutil  # type: ignore[import-untyped]

_METRICS_COUNTERS = {
    "total_requests": 0,
    "total_errors": 0,
    "start_time": time.time(),
}

@app.middleware("http")
async def request_metrics_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    start_time = time.perf_counter()
    _METRICS_COUNTERS["total_requests"] += 1

    try:
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time-Ms"] = str(duration_ms)
        logger.info(f"[{request.method}] {request.url.path} - status={response.status_code} - duration={duration_ms}ms [req_id={request_id}]")
        return response
    except Exception as e:
        _METRICS_COUNTERS["total_errors"] += 1
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
    allowed_origins = [origin.strip() for origin in allowed_origins_raw.split(",") if origin.strip()] if allowed_origins_raw else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth dependency ────────────────────────────────────────────────────────────

_ML_SECRET = os.getenv("ML_BACKEND_SECRET", "")
import threading

# In-memory nonce store with timestamp expiration to prevent replay attacks
_SEEN_NONCES: dict[str, float] = {}
_NONCE_LOCK = threading.Lock()
_NONCE_TTL = 300.0  # 5 minutes window

def _is_nonce_valid(nonce: str, now: float) -> bool:
    with _NONCE_LOCK:
        expired = [k for k, exp in _SEEN_NONCES.items() if exp < now]
        for k in expired:
            del _SEEN_NONCES[k]

        if nonce in _SEEN_NONCES:
            return False
        _SEEN_NONCES[nonce] = now + _NONCE_TTL
        return True

async def verify_api_key(request: Request) -> None:
    """Dual-layer authentication: API key check and HMAC-SHA256 nonced request signature verification."""
    if not _API_KEY:
        if _APP_ENV.lower() == "production":
            raise HTTPException(status_code=401, detail="Invalid API key.")
    else:
        key = request.headers.get("X-API-Key", "")
        if not secrets.compare_digest(key, _API_KEY):
            raise HTTPException(status_code=401, detail="Invalid API key.")

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


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/healthcheck", response_model=HealthResponse, dependencies=[Depends(verify_api_key)], tags=["Health"])
async def healthcheck():
    # Dynamically update the status if is_loaded is true and we don't have an error recorded
    for model_name, status in _MODEL_STATUS.items():
        if not status.startswith("error"):
            loaded = False
            if model_name == "summarizer":
                loaded = summarizer_model.is_loaded()
            elif model_name == "paraphraser":
                loaded = paraphraser_model.is_loaded()
            elif model_name == "outline_generator":
                loaded = outline_model.is_loaded()
            elif model_name == "lesson_generator":
                loaded = lesson_model.is_loaded()
            elif model_name == "quiz_pipeline":
                loaded = quiz_model.is_loaded()
            elif model_name == "chat_assistant":
                loaded = chat_model.is_loaded()
            
            if loaded:
                _MODEL_STATUS[model_name] = "ready"
            elif status == "ready":
                _MODEL_STATUS[model_name] = "pending"

    is_healthy = not any(status.startswith("error") for status in _MODEL_STATUS.values())
    if _MODEL_STATUS["summarizer"].startswith("error") or _MODEL_STATUS["paraphraser"].startswith("error"):
        is_healthy = False
        
    return HealthResponse(
        status="ok" if is_healthy else "unhealthy",
        models_loaded={
            "summarizer": summarizer_model.is_loaded(),
            "paraphraser": paraphraser_model.is_loaded(),
            "outline_generator": outline_model.is_loaded(),
            "lesson_generator": lesson_model.is_loaded(),
            "quiz_pipeline": quiz_model.is_loaded(),
            "chat_assistant": chat_model.is_loaded(),
            "rag_index": rag.has_documents(),
        },
        inference_busy=is_any_inference_busy(),
    )


@app.get("/health", tags=["Health"])
async def health_alias():
    """Simple standard /health endpoint for container probes."""
    return {"status": "ok"}


@app.get("/metrics", dependencies=[Depends(verify_api_key)], tags=["Health"])
@app.get("/admin/metrics", dependencies=[Depends(verify_api_key)], tags=["Health"])
def metrics():
    """Protected system, inference, and operational metrics endpoint."""
    import torch
    cuda_available = torch.cuda.is_available()
    process = psutil.Process(os.getpid())
    ram_mb = round(process.memory_info().rss / (1024 * 1024), 2)
    uptime_sec = round(time.time() - _METRICS_COUNTERS["start_time"], 1)

    metrics_data: dict[str, Any] = {
        "status": "up",
        "uptime_seconds": uptime_sec,
        "total_requests": _METRICS_COUNTERS["total_requests"],
        "total_errors": _METRICS_COUNTERS["total_errors"],
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
            timeout=_INFERENCE_TIMEOUT,
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
        logger.error(f"Summarize error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
            timeout=_INFERENCE_TIMEOUT,
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
        logger.error(f"Paraphrase error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
            timeout=_INFERENCE_TIMEOUT,
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
        logger.error(f"Outline generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
            timeout=_INFERENCE_TIMEOUT * 1.5,
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
        logger.error(f"Lesson generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
            correct_opt = q.options[q.correct_index]
            random.shuffle(q.options)
            q.correct_index = q.options.index(correct_opt)
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
            timeout=_INFERENCE_TIMEOUT * 1.5,
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
        logger.error(f"Quiz generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Chat ───────────────────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(verify_api_key)], tags=["AI"])
@limiter.limit("30/minute")
async def chat(body: ChatRequest, request: Request, response: Response):
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
            timeout=_INFERENCE_TIMEOUT,
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
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat/stream", dependencies=[Depends(verify_api_key)], tags=["AI"])
@limiter.limit("30/minute")
async def chat_stream_endpoint(body: ChatRequest, request: Request):
    """
    Stream AI chat response via Server-Sent Events (SSE).
    """
    user_id = request.headers.get("X-User-ID", "__anonymous__")
    return StreamingResponse(
        chat_model.chat_stream(
            messages=[m.model_dump() for m in body.messages],
            course_context=body.course_context,
            user_id=user_id,
        ),
        media_type="text/event-stream"
    )


# ── AI Completion ─────────────────────────────────────────────────────────────

@app.post("/completion", response_model=CompletionResponse, dependencies=[Depends(verify_api_key)], tags=["AI"])
@limiter.limit("30/minute")
async def completion(body: CompletionRequest, request: Request, response: Response):
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
            timeout=_INFERENCE_TIMEOUT,
        )
        res_obj = CompletionResponse(text=reply)
        cache.set(cache_key, res_obj.model_dump(), ttl=300)
        return res_obj
    except asyncio.TimeoutError:
        logger.error("Completion request timed out.")
        raise HTTPException(status_code=504, detail="Inference request timed out.")
    except Exception as e:
        logger.error(f"Completion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    added = await asyncio.wait_for(
        asyncio.to_thread(rag.add_documents, body.texts, user_id, "private"),
        timeout=_INFERENCE_TIMEOUT,
    )
    return {"status": "ok", "chunks_added": added, "user_id": user_id}


@app.delete("/documents", dependencies=[Depends(verify_api_key)], tags=["RAG"])
@limiter.limit("20/minute")
async def clear_documents(request: Request):
    """
    Clear private documents for the requesting user from the RAG vector store.
    Global reference documents are never affected by user-initiated clears.
    """
    user_id = request.headers.get("X-User-ID", "__anonymous__")
    await asyncio.to_thread(rag.clear, user_id=user_id)
    return {"status": "ok", "message": f"Private vector store cleared for user {user_id}."}
