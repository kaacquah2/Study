"""
Paraphraser model.

Uses a fine-tuned (or base) flan-t5 model for academic paraphrasing.
Instruction-tuned with style prefixes: academic, simple, formal.
"""

import os
import logging
import torch
from transformers import pipeline, Pipeline

from models.model_registry import get_pipeline, is_pipeline_loaded, get_inference_lock

logger = logging.getLogger(__name__)

def get_model_id() -> str:
    model_id = os.getenv("PARAPHRASER_MODEL_ID", "google/flan-t5-base")
    if os.path.exists(model_id):
        return os.path.abspath(model_id)
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    rel_path = os.path.join(backend_dir, model_id)
    if os.path.exists(rel_path):
        return os.path.abspath(rel_path)
    return model_id

_STYLE_PROMPTS = {
    "academic": "Paraphrase the following sentence in a formal academic style:",
    "simple": "Rewrite the following sentence in simpler, easy-to-understand language:",
    "formal": "Rephrase the following text in a professional and formal tone:",
}


def load_paraphraser() -> Pipeline:
    """Load and cache the paraphrasing pipeline."""
    return get_pipeline("text2text-generation", get_model_id())


def is_loaded() -> bool:
    return is_pipeline_loaded("text2text-generation", get_model_id())


def paraphrase(text: str, style: str = "academic") -> str:
    """
    Paraphrase a piece of text.
    """
    model_id = get_model_id()
    model = load_paraphraser()
    model_lock = get_inference_lock(model_id)

    style_prefix = _STYLE_PROMPTS.get(style, _STYLE_PROMPTS["academic"])
    prompt = f"{style_prefix}\n\n{text}"

    with model_lock, torch.inference_mode():
        result = model(
            prompt,
            max_new_tokens=256,
            do_sample=True,
            temperature=0.7,
            top_p=0.9,
            truncation=True,
        )

    output: str = result[0]["generated_text"]
    return output.strip()
