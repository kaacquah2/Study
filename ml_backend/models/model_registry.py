import os
import logging
import threading
import torch
from transformers import pipeline, Pipeline

logger = logging.getLogger(__name__)

# Device selection: CUDA GPU if available (device=0), else CPU (device=-1)
CUDA_AVAILABLE = torch.cuda.is_available()
DEVICE = 0 if CUDA_AVAILABLE else -1

if not CUDA_AVAILABLE:
    # Cap PyTorch CPU thread allocation to prevent thread thrashing
    cpu_count = os.cpu_count() or 1
    optimal_threads = min(4, max(1, cpu_count))
    torch.set_num_threads(optimal_threads)
    logger.info(f"Model Registry: PyTorch CPU thread count set to {optimal_threads}.")
else:
    logger.info(f"Model Registry: CUDA GPU detected ({torch.cuda.get_device_name(0)}). Using GPU acceleration.")

# Lock for thread-safe pipeline instantiation
_registry_lock = threading.Lock()

# Global lock kept for backwards compatibility (no longer acquired during inference)
inference_lock = threading.Lock()

# Per-model concurrency pools: bounded to 2 workers to limit memory while allowing parallel inference
_inference_semaphores: dict[str, threading.BoundedSemaphore] = {}

# Active inference counters — incremented before, decremented after (in finally) each inference call.
# These replace the deprecated global lock for health reporting.
_inference_active_counts: dict[str, int] = {}
_counts_lock = threading.Lock()


def get_inference_lock(model_id: str) -> threading.BoundedSemaphore:
    """Retrieve or create a per-model concurrency semaphore (max 2 concurrent workers)."""
    with _registry_lock:
        if model_id not in _inference_semaphores:
            _inference_semaphores[model_id] = threading.BoundedSemaphore(value=2)
        return _inference_semaphores[model_id]


def inference_start(model_id: str) -> None:
    """Increment the active inference counter for model_id. Call before inference."""
    with _counts_lock:
        _inference_active_counts[model_id] = _inference_active_counts.get(model_id, 0) + 1


def inference_end(model_id: str) -> None:
    """Decrement the active inference counter for model_id. Call in finally after inference."""
    with _counts_lock:
        current = _inference_active_counts.get(model_id, 0)
        _inference_active_counts[model_id] = max(0, current - 1)


def is_any_inference_busy() -> bool:
    """Return True if any model currently has at least one active inference call."""
    with _counts_lock:
        return any(v > 0 for v in _inference_active_counts.values())


_pipelines: dict[str, Pipeline] = {}
_loading_locks: dict[str, threading.Lock] = {}

def get_pipeline(task: str, model_id: str, **kwargs) -> Pipeline:
    """
    Retrieve an existing pipeline from the registry, or initialize and cache it.
    Thread-safe to prevent multiple threads from loading the same model concurrently.
    Does NOT hold global registry lock during heavy downloading to prevent blocking health checks.
    """
    key = f"{task}:{model_id}"
    with _registry_lock:
        if key in _pipelines:
            return _pipelines[key]
        if key not in _loading_locks:
            _loading_locks[key] = threading.Lock()
        load_lock = _loading_locks[key]

    with load_lock:
        with _registry_lock:
            if key in _pipelines:
                return _pipelines[key]

        logger.info(f"Model Registry: Loading model '{model_id}' for task '{task}' (device={DEVICE})...")
        # Set default device if not explicitly provided
        if "device" not in kwargs:
            kwargs["device"] = DEVICE
        
        if CUDA_AVAILABLE and "torch_dtype" not in kwargs:
            kwargs["torch_dtype"] = torch.float16

        from typing import Any, cast
        pipe: Any = pipeline(
            task=cast(Any, task),
            model=model_id,
            tokenizer=model_id,
            **kwargs
        )  # type: ignore

        # Apply PyTorch dynamic INT8 quantization on CPU for linear layers to boost CPU speed
        if DEVICE == -1:
            try:
                pipe.model = torch.ao.quantization.quantize_dynamic(  # type: ignore
                    pipe.model, {torch.nn.Linear}, dtype=torch.qint8
                )

                logger.info(f"Model Registry: Applied dynamic INT8 quantization to '{model_id}'.")
            except Exception as q_err:
                logger.debug(f"Model Registry: Dynamic quantization skipped for '{model_id}': {q_err}")


        with _registry_lock:
            _pipelines[key] = pipe
        logger.info(f"Model Registry: Model '{model_id}' successfully loaded.")
        return pipe

def is_pipeline_loaded(task: str, model_id: str) -> bool:
    """Check if the pipeline has already been initialized in memory."""
    key = f"{task}:{model_id}"
    with _registry_lock:
        return key in _pipelines

def get_device_diagnostics() -> dict:
    """Return runtime hardware acceleration, PyTorch thread configuration, and model load stats."""
    with _registry_lock:
        loaded_count = len(_pipelines)
        loaded_keys = list(_pipelines.keys())

    return {
        "cuda_available": CUDA_AVAILABLE,
        "device": "gpu" if CUDA_AVAILABLE else "cpu",
        "device_id": DEVICE,
        "torch_threads": torch.get_num_threads(),
        "loaded_pipelines_count": loaded_count,
        "loaded_pipelines": loaded_keys,
        "quantization": "dynamic_int8" if not CUDA_AVAILABLE else "fp16_cuda"
    }

