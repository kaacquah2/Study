"""
Memorization Guard — Verbatim Past Exam Question Leakage Protection.

Calculates n-gram overlap and text similarity between generated quiz question prompts
and the fine-tuning training corpus. Prevents emitting exact or near-verbatim past questions.
"""

import os
import re
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Default similarity threshold — can be overridden via MEMORIZATION_SIMILARITY_THRESHOLD env var
DEFAULT_SIMILARITY_THRESHOLD = float(os.getenv("MEMORIZATION_SIMILARITY_THRESHOLD", "0.85"))

# Pre-indexed past question snippets / key point stems from training set (sample/cached)
_CORPUS_QUESTIONS: list[str] = [
    "What is the time complexity of QuickSort in the worst case scenario?",
    "Explain the concept of page fault in virtual memory operating systems.",
    "Which data structure is primarily used to implement Depth First Search?",
    "Describe the difference between process and thread execution in Linux.",
    "What is third normal form (3NF) in relational database design?",
    "Calculate the maximum number of nodes in a binary tree of height h.",
    "How does the TCP three-way handshake establish a connection?",
    "Explain the RSA public key encryption algorithm and key generation steps.",
]


def normalize_text(text: str) -> list[str]:
    """Lowercase and extract alphanumeric word tokens."""
    return re.findall(r"\w+", text.lower())


def get_ngrams(tokens: list[str], n: int = 4) -> set[tuple[str, ...]]:
    """Generate n-grams set from token list."""
    if len(tokens) < n:
        return set()
    return {tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1)}


def calculate_ngram_similarity(text1: str, text2: str, n: int = 4) -> float:
    """Calculate Jaccard n-gram similarity between two text strings."""
    tokens1 = normalize_text(text1)
    tokens2 = normalize_text(text2)

    ngrams1 = get_ngrams(tokens1, n)
    ngrams2 = get_ngrams(tokens2, n)

    if not ngrams1 or not ngrams2:
        # Fallback to 1-gram Jaccard if text is short
        set1, set2 = set(tokens1), set(tokens2)
        if not set1 or not set2:
            return 0.0
        return len(set1 & set2) / len(set1 | set2)

    intersection = ngrams1 & ngrams2
    union = ngrams1 | ngrams2
    return len(intersection) / len(union)


def _load_training_corpus() -> list[str]:
    questions = list(_CORPUS_QUESTIONS)
    data_dir = Path(__file__).parent.parent / "fine_tuning" / "data"
    if data_dir.exists():
        for jsonl_file in data_dir.glob("*.jsonl"):
            try:
                with open(jsonl_file, "r", encoding="utf-8") as f:
                    for line in f:
                        if not line.strip():
                            continue
                        row = json.loads(line)
                        text = row.get("output") or row.get("input") or ""
                        if text and len(text) > 20:
                            questions.append(text[:200])
            except Exception as e:
                logger.debug(f"Could not load memorization corpus file {jsonl_file}: {e}")
    return questions

_ACTIVE_CORPUS: list[str] = _load_training_corpus()


def check_verbatim_leakage(
    question_prompt: str,
    threshold: Optional[float] = None,
) -> tuple[bool, float, Optional[str]]:
    """
    Check if a generated question prompt leaks a verbatim or near-verbatim past question.

    Returns:
        (is_verbatim: bool, max_similarity: float, matched_corpus_question: Optional[str])
    """
    if threshold is None:
        threshold = DEFAULT_SIMILARITY_THRESHOLD

    max_sim = 0.0
    matched_q: Optional[str] = None

    for corpus_q in _ACTIVE_CORPUS:
        sim = calculate_ngram_similarity(question_prompt, corpus_q, n=4)
        if sim > max_sim:
            max_sim = sim
            matched_q = corpus_q

    is_verbatim = max_sim >= threshold
    if is_verbatim:
        logger.warning(
            f"[MemorizationGuard] Verbatim past question leak detected (score: {max_sim:.3f} >= {threshold}): "
            f"Prompt='{question_prompt}' matched Corpus='{matched_q}'"
        )

    return is_verbatim, round(max_sim, 3), matched_q if is_verbatim else None
