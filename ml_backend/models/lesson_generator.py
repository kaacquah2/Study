"""
Lesson content generator.

Strategy: RAG + flan-t5-large (Batched inference + torch.inference_mode).
Retrieves relevant course material from the vector store and uses it as
grounded context so the model expands known content rather than hallucinating.
"""

import os
import logging
import torch
from transformers import pipeline, Pipeline
from typing import Optional

from models.model_registry import get_pipeline, is_pipeline_loaded, get_inference_lock
from models.rag_pipeline import rag

logger = logging.getLogger(__name__)

_MODEL_ID = os.getenv("LESSON_MODEL_ID", "google/flan-t5-large")

# Max chars of context to inject (avoids exceeding model token limits)
_MAX_CONTEXT_CHARS = 1_200


def load_model() -> Pipeline:
    return get_pipeline("text2text-generation", _MODEL_ID)


def is_loaded() -> bool:
    return is_pipeline_loaded("text2text-generation", _MODEL_ID)


def generate_lesson(
    course_title: str,
    module_title: str,
    learning_objective: str,
    key_points: list[str],
    course_outline: Optional[list[dict]] = None,
    user_id: str = "default_user",
) -> dict:
    """
    Generate lesson pages for a module using batched PyTorch inference.

    Returns a dict with a 'pages' list, each page having:
    order, heading, subheading, body.
    """
    model = load_model()
    model_lock = get_inference_lock(_MODEL_ID)

    # RAG retrieval: combine module title + objective as the query
    query = f"{module_title}: {learning_objective}"
    context = rag.retrieve(query, user_id=user_id, top_k=3)[:_MAX_CONTEXT_CHARS] if rag.has_documents(user_id=user_id) else ""
    context_block = f"\n\nReference material:\n{context}\n" if context else ""

    effective_key_points = key_points[:4] if key_points else [f"Overview of {module_title}"]

    prompts = [
        f"""You are an expert e-learning tutor writing a comprehensive lesson page.
Course: "{course_title}"
Module: "{module_title}"
Learning objective: {learning_objective}
This page covers: {kp}
{context_block}
Write the lesson page body in clear, structured educational markdown.
Requirements:
- Explain core concepts thoroughly with clear examples.
- Include structured sections using bold subheadings, bullet points, and callout notes (> [!NOTE]).
- For programming or technical topics, include formatted code blocks (```python, ```java, or ```cpp).
- Do NOT use top-level headers (#), raw URLs, or broken links.
Lesson page body:"""
        for kp in effective_key_points
    ]

    # Batched inference under single lock pass
    with model_lock, torch.inference_mode():
        results = model(
            prompts,
            batch_size=len(prompts),
            max_new_tokens=250,
            do_sample=True,
            temperature=0.4,
            top_p=0.9,
            truncation=True,
            repetition_penalty=2.0,
            no_repeat_ngram_size=3,
        )

    pages = []
    for i, (key_point, res, prompt) in enumerate(zip(effective_key_points, results, prompts)):
        body: str = res[0]["generated_text"].strip() if isinstance(res, list) else res["generated_text"].strip()

        word_count = len(body.split())
        if word_count < 40 or len(body) < 200:
            logger.warning(
                f"Lesson page {i} ('{key_point}') output short ({word_count} words). Attempting individual retry..."
            )
            # Retry up to 2 times for this specific page
            for attempt in range(2):
                with model_lock, torch.inference_mode():
                    retry_res = model(
                        prompt,
                        max_new_tokens=300,
                        do_sample=False,
                        repetition_penalty=1.5,
                        no_repeat_ngram_size=3,
                    )
                retry_body: str = (
                    retry_res[0]["generated_text"].strip()
                    if isinstance(retry_res, list)
                    else retry_res["generated_text"].strip()
                )
                retry_words = len(retry_body.split())
                if retry_words >= 40 and len(retry_body) >= 200:
                    body = retry_body
                    word_count = retry_words
                    logger.info(f"Lesson page {i} retry attempt {attempt + 1} succeeded ({word_count} words).")
                    break

        if word_count < 40 or len(body) < 200:
            logger.error(
                f"Lesson generation failed for module '{module_title}', page {i} ('{key_point}'): "
                f"generated text too short after retries ({word_count} words, {len(body)} chars). Marking module as failed."
            )
            raise RuntimeError(
                f"Lesson generation produced insufficient content for key point '{key_point}' ({word_count} words)."
            )

        pages.append({
            "order": i,
            "heading": key_point[:50],
            "subheading": None,
            "body": _sanitize_lesson_body(body),
        })

    if not pages:
        logger.error(f"Lesson generation failed for module '{module_title}': zero valid pages generated.")
        raise RuntimeError(f"Lesson generation for module '{module_title}' produced zero pages.")

    return {"pages": pages}


def _sanitize_lesson_body(body: str) -> str:
    """
    Sanitize generated lesson markdown:
    1. Uniformly shift heading levels down by 1 level to preserve relative hierarchy
    2. Neutralize raw external URLs
    """
    import re
    body = re.sub(r'(?m)^###\s+(.*)$', r'#### \1', body)
    body = re.sub(r'(?m)^##\s+(.*)$', r'### \1', body)
    body = re.sub(r'(?m)^#\s+(.*)$', r'## \1', body)

    body = re.sub(r'\[([^\]]+)\]\(https?://[^\)]+\)', r'\1', body)
    body = re.sub(r'https?://[^\s<]+', '[external link removed]', body)

    return body
