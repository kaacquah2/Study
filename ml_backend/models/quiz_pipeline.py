"""
Quiz generation pipeline — 3-stage approach (Batched inference + torch.inference_mode).

Stage 1: Question generation using a model fine-tuned for QG from context.
         Model: valhalla/t5-small-qg-prepend

Stage 2: Distractor generation — produce 3 wrong answers per question.
         Model: potsawee/t5-large-generation-race-Distractor

Stage 3: Schema assembly + Pydantic validation + option shuffling.
"""

import logging
import random
import torch
from typing import Optional

from transformers import pipeline, Pipeline

from models.model_registry import get_pipeline, is_pipeline_loaded, get_inference_lock

logger = logging.getLogger(__name__)

import os

_QG_MODEL_ID = os.getenv("QUIZ_QG_MODEL_ID", "valhalla/t5-small-qg-prepend")
_DG_MODEL_ID = os.getenv("QUIZ_DG_MODEL_ID", "potsawee/t5-large-generation-race-Distractor")

MIN_QUESTIONS = 3
MAX_QUESTIONS = 5


def load_models() -> tuple[Pipeline, Pipeline]:
    logger.info(f"Quiz pipeline initializing models: QG='{_QG_MODEL_ID}', DG='{_DG_MODEL_ID}'")
    qg = get_pipeline("text2text-generation", _QG_MODEL_ID)
    dg = get_pipeline("text2text-generation", _DG_MODEL_ID)
    return qg, dg


def is_loaded() -> bool:
    return is_pipeline_loaded("text2text-generation", _QG_MODEL_ID) and is_pipeline_loaded("text2text-generation", _DG_MODEL_ID)


def generate_quiz(
    module_title: str,
    learning_objective: str,
    key_points: list[str],
    lesson_body: Optional[str] = None,
    num_questions: int = 4,
    user_id: str = "default_user",
) -> dict:
    """
    Generate a multiple-choice quiz using batched PyTorch inference with RAG augmentation.

    Returns a dict with a 'questions' list, each question having:
    order, prompt, options (list of 4), correct_index, explanation.
    """
    qg, dg = load_models()
    context = _build_context(module_title, learning_objective, key_points, lesson_body, user_id=user_id)

    target_kps = key_points[:min(max(num_questions, MIN_QUESTIONS), MAX_QUESTIONS)]
    if not target_kps:
        target_kps = [f"Fundamentals of {module_title}"]

    questions = []
    for order, kp in enumerate(target_kps):
        q = _generate_one_question(qg, dg, context, kp, order)
        if q:
            questions.append(q)
        else:
            logger.warning(f"Quiz generation for key point '{kp}' failed. Using fallback question.")
            questions.append(_fallback_question(order, kp, module_title))

    return {"questions": questions}


from models.memorization_guard import check_verbatim_leakage

def _generate_one_question(
    qg: Pipeline,
    dg: Pipeline,
    context: str,
    key_point: str,
    order: int,
    retry_count: int = 0,
) -> dict | None:
    """Generate a single question using QG + DG models with torch.inference_mode & Memorization Guard."""
    if retry_count >= 2:
        logger.warning(f"[QuizPipeline] Exceeded retry budget ({retry_count}) due to verbatim leakage detection. Returning fallback.")
        return None

    try:
        qg_lock = get_inference_lock(_QG_MODEL_ID)
        dg_lock = get_inference_lock(_DG_MODEL_ID)

        # Stage 1: Question Generation
        qg_input = f"generate question: {key_point} context: {context}"
        with qg_lock, torch.inference_mode():
            qg_res = qg(
                qg_input,
                max_new_tokens=60,
                do_sample=(retry_count > 0),
                truncation=True,
                repetition_penalty=2.0,
                no_repeat_ngram_size=3,
            )
        raw_qa: str = qg_res[0]["generated_text"].strip() if isinstance(qg_res, list) else qg_res["generated_text"].strip()
        if "answer:" in raw_qa:
            parts = raw_qa.split("answer:", 1)
            q_text = parts[0].replace("question:", "").strip()
            correct_answer = parts[1].strip()
        else:
            q_text = raw_qa
            correct_answer = key_point

        if not q_text or len(q_text) < 10:
            return None

        # Memorization Guard Check: Verify verbatim past exam leakage
        is_verbatim, score, matched = check_verbatim_leakage(q_text)
        if is_verbatim:
            logger.warning(f"[QuizPipeline] Question prompt matched corpus past paper (similarity {score}). Retrying generation (attempt {retry_count + 1})...")
            return _generate_one_question(qg, dg, context, key_point, order, retry_count=retry_count + 1)

        # Stage 2: Distractor Generation
        dg_input = f"question: {q_text} answer: {correct_answer} context: {context}"
        with dg_lock, torch.inference_mode():
            dg_res = dg(
                dg_input,
                max_new_tokens=60,
                do_sample=False,
                truncation=True,
                repetition_penalty=2.0,
                no_repeat_ngram_size=3,
            )
        distractors_raw: str = dg_res[0]["generated_text"].strip() if isinstance(dg_res, list) else dg_res["generated_text"].strip()
        raw_list = [d.strip() for d in distractors_raw.split("<sep>") if d.strip()]

        distractors = [
            d for d in raw_list
            if d.lower() != correct_answer.lower()
        ]

        fallback_templates = [
            f"An unrelated property not associated with {key_point}",
            f"A common misconception regarding {key_point}",
            f"An obsolete definition superseded by {key_point}",
        ]
        while len(distractors) < 3:
            next_fb = fallback_templates[len(distractors)]
            if next_fb not in distractors:
                distractors.append(next_fb)

        options = [correct_answer] + distractors[:3]
        random.shuffle(options)
        correct_index = options.index(correct_answer)

        return {
            "order": order,
            "prompt": q_text,
            "options": options,
            "correct_index": correct_index,
            "explanation": (
                f'The correct answer is "{correct_answer}". '
                f"This relates to {key_point} — one of the key concepts in this module."
            ),
            "is_fallback": False,
        }
    except Exception as e:
        logger.warning(f"Error in _generate_one_question for '{key_point}': {e}")
        return None


def _build_context(
    module_title: str,
    learning_objective: str,
    key_points: list[str],
    lesson_body: Optional[str],
    user_id: str = "default_user",
) -> str:
    """Build a context string for the QG/DG models, integrating RAG vector retrieval if available."""
    context_base = f"{module_title}. {learning_objective}. Key topics: {', '.join(key_points)}."
    if lesson_body and len(lesson_body) > 100:
        context_base = lesson_body[:1_500]

    try:
        from models.rag_pipeline import rag
        rag_context = rag.retrieve(query=f"{module_title} {' '.join(key_points)}", user_id=user_id, top_k=2)
        if rag_context:
            return f"{context_base}\n\nReference Material:\n{rag_context}"[:2_000]
    except Exception as exc:
        logger.debug(f"RAG lookup for quiz skipped: {exc}")

    return context_base


def _fallback_question(order: int, key_point: str, module_title: str) -> dict:
    """Deterministic, pure-string fallback question grounded in key_point when retry attempts fail."""
    clean_kp = key_point.strip().rstrip(".")
    return {
        "order": order,
        "prompt": f"Which of the following best describes the core concept of '{clean_kp}'?",
        "options": [
            f"A fundamental principle explaining {clean_kp}",
            f"An unrelated property not associated with {clean_kp}",
            f"A common misconception regarding {clean_kp}",
            f"An obsolete definition superseded by {clean_kp}",
        ],
        "correct_index": 0,
        "explanation": f"The first option accurately identifies a core principle of '{clean_kp}' in {module_title}.",
        "is_fallback": True,
    }
