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

from transformers import pipeline, Pipeline, AutoModelForSeq2SeqLM, AutoTokenizer


class Seq2SeqPipelineWrapper:
    """Wrapper providing pipeline-compatible interface for Seq2Seq architectures across transformers versions."""
    def __init__(self, model, tokenizer, device: int = -1):
        self.model = model
        self.tokenizer = tokenizer
        self.task = "text2text-generation"
        self.device = device

    def __call__(self, text, **kwargs):
        is_single = isinstance(text, str)
        texts = [text] if is_single else list(text)

        max_new_tokens = kwargs.get("max_new_tokens", kwargs.get("max_length", 128))
        min_length = kwargs.get("min_length", 0)
        do_sample = kwargs.get("do_sample", False)
        temperature = kwargs.get("temperature", 1.0)
        top_p = kwargs.get("top_p", 1.0)
        repetition_penalty = kwargs.get("repetition_penalty", 1.0)
        truncation = kwargs.get("truncation", True)
        max_input_length = kwargs.get("max_input_length", 512)

        inputs = self.tokenizer(
            texts,
            return_tensors="pt",
            padding=True,
            truncation=truncation,
            max_length=max_input_length
        )
        if self.device != -1 and torch.cuda.is_available():
            inputs = {k: v.to("cuda") for k, v in inputs.items()}

        gen_kwargs = {
            "max_new_tokens": max_new_tokens,
            "do_sample": do_sample,
        }
        if min_length > 0:
            gen_kwargs["min_length"] = min_length
        if do_sample:
            gen_kwargs["temperature"] = temperature
            gen_kwargs["top_p"] = top_p
        if repetition_penalty != 1.0:
            gen_kwargs["repetition_penalty"] = repetition_penalty

        with torch.no_grad():
            outputs = self.model.generate(**inputs, **gen_kwargs)

        results = []
        for out in outputs:
            gen_text = self.tokenizer.decode(out, skip_special_tokens=True).strip()
            results.append({"generated_text": gen_text, "summary_text": gen_text})

        return results


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
        model_kwargs = kwargs.pop("model_kwargs", None) or {}
        prefer_local = (
            os.getenv("APP_ENV") == "production"
            or os.getenv("TRANSFORMERS_OFFLINE") == "1"
            or os.getenv("HF_HUB_OFFLINE") == "1"
        )

        def _build_pipeline(t: str, offline: bool) -> Any:
            kw = dict(kwargs)
            mk = dict(model_kwargs) if model_kwargs else {}
            if offline:
                mk["local_files_only"] = True
            if t in ("text2text-generation", "summarization"):
                try:
                    tok = AutoTokenizer.from_pretrained(model_id, **mk)
                    mod = AutoModelForSeq2SeqLM.from_pretrained(model_id, **mk)
                    if DEVICE != -1 and CUDA_AVAILABLE:
                        mod = mod.to("cuda")
                    return Seq2SeqPipelineWrapper(mod, tok, device=DEVICE)
                except Exception as seq2seq_err:
                    logger.debug(f"Direct Seq2Seq load for {model_id} skipped: {seq2seq_err}")
            return pipeline(
                task=cast(Any, t),
                model=model_id,
                tokenizer=model_id,
                model_kwargs=mk if mk else None,
                **kw
            )

        try:
            try:
                pipe = _build_pipeline(task, prefer_local)
            except (KeyError, ValueError) as task_err:
                alt_task = "text-generation" if task in ("summarization", "text2text-generation") else "text2text-generation"
                logger.info(f"Model Registry: Retrying pipeline load with fallback task '{alt_task}' ({task_err})")
                pipe = _build_pipeline(alt_task, prefer_local)
        except Exception as load_err:
            if prefer_local and os.getenv("TRANSFORMERS_OFFLINE") != "1" and os.getenv("HF_HUB_OFFLINE") != "1":
                logger.warning(
                    f"Model Registry: Local cached load failed for '{model_id}' ({load_err}). "
                    "Attempting online fallback download..."
                )
                try:
                    pipe = _build_pipeline(task, False)
                except (KeyError, ValueError):
                    alt_task = "text-generation" if task in ("summarization", "text2text-generation") else "text2text-generation"
                    pipe = _build_pipeline(alt_task, False)
            else:
                logger.error(f"Model Registry: Failed to load model '{model_id}': {load_err}")
                raise

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


def classify_model_tier(model_id: str, default_id: str, is_specialized_baseline: bool = False) -> tuple[str, bool]:
    """
    Classify a model identifier into its provenance tier.
    Returns (tier, is_fine_tuned)
    Tiers:
      - 'base_foundation': generic open-weight foundation model (e.g. google/flan-t5-base)
      - 'pretrained_specialized': community task-specialized pre-trained checkpoint (e.g. valhalla/t5-small-qg-prepend)
      - 'local_checkpoint': local fine-tuned weights on filesystem
      - 'fine_tuned_custom': custom fine-tuned weights hosted on HuggingFace Hub
    """
    if os.path.exists(model_id) or (os.path.isabs(model_id) and os.path.exists(model_id)):
        return ("local_checkpoint", True)

    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    rel_path = os.path.join(backend_dir, model_id)
    if os.path.exists(rel_path):
        return ("local_checkpoint", True)

    if model_id == default_id:
        if is_specialized_baseline:
            return ("pretrained_specialized", False)
        return ("base_foundation", False)

    return ("fine_tuned_custom", True)


def get_model_provenance_manifest(loaded_models_map: dict[str, bool] | None = None) -> dict:
    """
    Generate the complete provenance manifest for all ML components.
    Distinguishes whether the runtime is operating with default base foundation models
    or custom domain fine-tuned checkpoints.
    """
    if loaded_models_map is None:
        loaded_models_map = {}

    configs = [
        ("summarizer", "SUMMARIZER_MODEL_ID", "google/flan-t5-base", "seq2seq_prompting", "seq2seq_domain_adapted", False),
        ("paraphraser", "PARAPHRASER_MODEL_ID", "google/flan-t5-base", "seq2seq_prompting", "seq2seq_domain_adapted", False),
        ("outline_generator", "OUTLINE_MODEL_ID", "google/flan-t5-large", "rag_instruction_prompting", "rag_domain_adapted", False),
        ("lesson_generator", "LESSON_MODEL_ID", "google/flan-t5-large", "rag_page_generation", "rag_domain_adapted", False),
        ("quiz_qg", "QUIZ_QG_MODEL_ID", "valhalla/t5-small-qg-prepend", "t5_question_generation", "t5_question_generation", True),
        ("quiz_dg", "QUIZ_DG_MODEL_ID", "potsawee/t5-large-generation-race-Distractor", "distractor_generation", "distractor_generation", True),
        ("chat_assistant", "CHAT_MODEL_ID", "TinyLlama/TinyLlama-1.1B-Chat-v1.0", "chatml_rag_prompting", "chatml_domain_adapted", False),
        ("rag_embeddings", "EMBED_MODEL_ID", "sentence-transformers/all-MiniLM-L6-v2", "dense_faiss_biencoder", "dense_faiss_biencoder", True),
    ]

    models_manifest = {}
    fine_tuned_count = 0
    base_count = 0
    specialized_count = 0

    for name, env_var, default_id, base_strat, ft_strat, is_specialized in configs:
        configured_id = os.getenv(env_var, default_id)
        tier, is_ft = classify_model_tier(configured_id, default_id, is_specialized_baseline=is_specialized)

        if is_ft:
            fine_tuned_count += 1
            strategy = ft_strat
        elif tier == "pretrained_specialized":
            specialized_count += 1
            strategy = base_strat
        else:
            base_count += 1
            strategy = base_strat

        # Check loaded status from mapping or internal pipeline registry
        is_loaded = loaded_models_map.get(name, is_pipeline_loaded("summarization" if name == "summarizer" else name, configured_id))

        models_manifest[name] = {
            "model_id": configured_id,
            "tier": tier,
            "is_fine_tuned": is_ft,
            "default_id": default_id,
            "strategy": strategy,
            "loaded": is_loaded,
        }

    system_mode = "fine_tuned_production" if fine_tuned_count > 0 else "base_foundation_development"

    return {
        "system_mode": system_mode,
        "fine_tuned_count": fine_tuned_count,
        "base_count": base_count,
        "specialized_count": specialized_count,
        "models": models_manifest,
        "device_diagnostics": get_device_diagnostics(),
    }

