"""
Summarizer model.

Uses a fine-tuned (or base) flan-t5 model for text summarization.
On first load the model is cached in memory for subsequent requests.
"""

import os
import logging
import torch
from transformers import pipeline, Pipeline
from models.model_registry import get_pipeline, is_pipeline_loaded, get_inference_lock

logger = logging.getLogger(__name__)

def get_model_id() -> str:
    model_id = os.getenv("SUMMARIZER_MODEL_ID", "google/flan-t5-base")
    if os.path.exists(model_id):
        return os.path.abspath(model_id)
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    rel_path = os.path.join(backend_dir, model_id)
    if os.path.exists(rel_path):
        return os.path.abspath(rel_path)
    return model_id


def load_summarizer() -> Pipeline:
    """Load and cache the summarization pipeline."""
    try:
        return get_pipeline("text2text-generation", get_model_id())
    except Exception:
        return get_pipeline("summarization", get_model_id())


def is_loaded() -> bool:
    return is_pipeline_loaded("text2text-generation", get_model_id()) or is_pipeline_loaded("summarization", get_model_id())


def summarize(text: str, max_length: int = 150, min_length: int = 40) -> str:
    """
    Summarize a block of text.

    Args:
        text: Input text to summarize (50–10,000 chars).
        max_length: Max token length of the summary.
        min_length: Min token length of the summary.

    Returns:
        A string containing the generated summary.
    """
    model_id = get_model_id()
    model = load_summarizer()
    model_lock = get_inference_lock(model_id)

    prompt = f"Summarize the following study material concisely:\n\n{text}"

    gen_kwargs = {
        "max_new_tokens": max_length,
        "do_sample": False,
        "truncation": True,
    }
    if getattr(model, "task", None) == "text-generation":
        gen_kwargs["return_full_text"] = False

    with model_lock, torch.inference_mode():
        result = model(
            prompt,
            **gen_kwargs
        )

    res0 = result[0]
    summary: str = res0.get("generated_text") or res0.get("summary_text") or ""
    
    # Clean prompt echoing if returned by pipeline
    if summary.startswith(prompt):
        summary = summary[len(prompt):]
    elif prompt.strip() in summary:
        summary = summary.replace(prompt.strip(), "")
    elif text.strip() in summary and len(summary.strip()) > len(text.strip()):
        summary = summary.replace(text.strip(), "")

    return summary.strip()
