"""
Legacy backwards-compatibility wrapper for memorization_guard.py.
"""

from models.memorization_guard import (
    DEFAULT_SIMILARITY_THRESHOLD,
    normalize_text,
    get_ngrams,
    calculate_ngram_similarity,
    check_verbatim_leakage,
)

__all__ = [
    "DEFAULT_SIMILARITY_THRESHOLD",
    "normalize_text",
    "get_ngrams",
    "calculate_ngram_similarity",
    "check_verbatim_leakage",
]

