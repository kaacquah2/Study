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

# Global lock kept for backwards compatibility
inference_lock = threading.Lock()

# Per-model inference locks to prevent CPU thrashing on the same model while allowing non-interfering parallel models
_inference_locks: dict[str, threading.Lock] = {}

def get_inference_lock(model_id: str) -> threading.Lock:
    """Retrieve or create a dedicated inference lock for a specific model ID."""
    with _registry_lock:
        if model_id not in _inference_locks:
            _inference_locks[model_id] = threading.Lock()
        return _inference_locks[model_id]

# Store of cached pipelines, keyed by "task:model_id"
_pipelines: dict[str, Pipeline] = {}

def get_pipeline(task: str, model_id: str, **kwargs) -> Pipeline:
    """
    Retrieve an existing pipeline from the registry, or initialize and cache it.
    Thread-safe to prevent multiple threads from loading the same model concurrently.
    """
    key = f"{task}:{model_id}"
    with _registry_lock:
        if key not in _pipelines:
            logger.info(f"Model Registry: Loading model '{model_id}' for task '{task}' (device={DEVICE})...")
            # Set default device if not explicitly provided
            if "device" not in kwargs:
                kwargs["device"] = DEVICE
            
            if CUDA_AVAILABLE and "torch_dtype" not in kwargs:
                kwargs["torch_dtype"] = torch.float16

            pipe = pipeline(
                task,
                model=model_id,
                tokenizer=model_id,
                **kwargs
            )

            # Apply PyTorch dynamic INT8 quantization on CPU for linear layers to boost CPU speed
            if DEVICE == -1:
                try:
                    pipe.model = torch.ao.quantization.quantize_dynamic(
                        pipe.model, {torch.nn.Linear}, dtype=torch.qint8
                    )
                    logger.info(f"Model Registry: Applied dynamic INT8 quantization to '{model_id}'.")
                except Exception as q_err:
                    logger.debug(f"Model Registry: Dynamic quantization skipped for '{model_id}': {q_err}")

            _pipelines[key] = pipe
            logger.info(f"Model Registry: Model '{model_id}' successfully loaded.")
        return _pipelines[key]

def is_pipeline_loaded(task: str, model_id: str) -> bool:
    """Check if the pipeline has already been initialized in memory."""
    key = f"{task}:{model_id}"
    return key in _pipelines
