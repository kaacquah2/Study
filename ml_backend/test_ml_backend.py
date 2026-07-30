"""
Pytest unit test suite for the Python ML Backend.
Run via: pytest ml_backend/test_ml_backend.py
"""

import sys
from pathlib import Path
import pytest
from unittest.mock import MagicMock, patch

# Add ml_backend directory to python path
ml_backend_dir = Path(__file__).parent
if str(ml_backend_dir) not in sys.path:
    sys.path.insert(0, str(ml_backend_dir))

from models.quiz_pipeline import _fallback_question, generate_quiz
from models.lesson_generator import _sanitize_lesson_body
from transformers import AutoConfig


def test_quiz_fallback_question():
    """Verify that _fallback_question produces a grounded, schema-compliant QuizQuestion dict with zero model calls."""
    key_point = "Variables and Data Types"
    module_title = "Introduction to Python"
    
    result = _fallback_question(0, key_point, module_title)
    
    assert isinstance(result, dict)
    assert result["order"] == 0
    assert key_point in result["prompt"]
    assert len(result["options"]) == 4
    assert 0 <= result["correct_index"] <= 3
    assert result["is_fallback"] is True
    assert isinstance(result["explanation"], str)


def test_quiz_generation_fallback_integration():
    """Verify that generate_quiz seamlessly uses _fallback_question when generation returns None for a key point."""
    with patch("models.quiz_pipeline.load_models", return_value=(MagicMock(), MagicMock())), \
         patch("models.quiz_pipeline._generate_one_question", return_value=None):
        
        data = generate_quiz(
            module_title="Python Basics",
            learning_objective="Understand basic Python syntax",
            key_points=["Variables", "Loops"],
            num_questions=2
        )
        
        assert "questions" in data
        assert len(data["questions"]) == 2
        for q in data["questions"]:
            assert q["is_fallback"] is True
            assert isinstance(q["prompt"], str)


def test_autoconfig_architecture_detection():
    """Verify that AutoConfig correctly identifies encoder-decoder (Seq2Seq) vs decoder-only (CausalLM) architectures."""
    seq2seq_config = AutoConfig.from_pretrained("google/flan-t5-small")
    assert seq2seq_config.is_encoder_decoder is True

    causal_config = AutoConfig.from_pretrained("gpt2")
    assert getattr(causal_config, "is_encoder_decoder", False) is False


def test_lesson_body_sanitization():
    """Verify uniform heading shifts and external URL neutralization in _sanitize_lesson_body."""
    raw_markdown = (
        "# Main Page Heading\n\n"
        "## Sub Heading Section\n\n"
        "### Minor Sub Section\n\n"
        "Check out [Google](https://google.com) or visit https://example.com for more info.\n"
        "Internal reference: [RAG Notes](#rag-docs) is preserved."
    )
    
    sanitized = _sanitize_lesson_body(raw_markdown)
    
    import re
    # H1 -> H2 (verify no standalone H1 remains at line start)
    assert "## Main Page Heading" in sanitized
    assert re.search(r'(?m)^#\s', sanitized) is None
    
    # H2 -> H3
    assert "### Sub Heading Section" in sanitized
    
    # H3 -> H4
    assert "#### Minor Sub Section" in sanitized
    
    # External markdown link target neutralized to plain anchor
    assert "[Google](https://google.com)" not in sanitized
    assert "Google" in sanitized
    
    # Standalone raw URL neutralized
    assert "https://example.com" not in sanitized
    assert "[external link removed]" in sanitized
    
    # Internal anchor link preserved
    assert "[RAG Notes](#rag-docs)" in sanitized


def test_lesson_generation_raises_on_insufficient_content():
    """Verify that generate_lesson raises a RuntimeError instead of returning fallback filler text when model output is too short."""
    from models.lesson_generator import generate_lesson
    
    mock_model = MagicMock(return_value=[{"generated_text": "Short text."}])
    with patch("models.lesson_generator.load_model", return_value=mock_model):
        with pytest.raises(RuntimeError) as exc_info:
            generate_lesson(
                course_title="Python Basics",
                module_title="Functions",
                learning_objective="Write basic functions",
                key_points=["Def statement"],
            )
        assert "produced insufficient content" in str(exc_info.value)


def test_outline_fallback_titles_topic_parameterized():
    """Verify that _fallback_outline generates distinct, topic-parameterized titles without repetitive title concatenation."""
    from models.outline_generator import _fallback_outline
    
    topic = "Cell Biology"
    outline = _fallback_outline(topic, 3, "lessons_and_quizzes")
    
    assert outline["title"] == f"Introduction to {topic}"
    assert len(outline["modules"]) == 3
    
    module_titles = [m["title"] for m in outline["modules"]]
    # Ensure titles are distinct subtopics and do not repetitively echo topic prefix or '— Part X'
    assert module_titles[0] == "Fundamentals & Overview"
    assert module_titles[1] == "Core Principles & Concepts"
    assert module_titles[2] == "Practical Applications"

    # Verify no duplicate prefix when topic already starts with 'Introduction to'
    intro_topic = "Introduction to Cell Biology"
    intro_outline = _fallback_outline(intro_topic, 3, "lessons_and_quizzes")
    assert intro_outline["title"] == "Introduction to Cell Biology"


def test_healthcheck_lock_status():
    """Verify that healthcheck reports inference_busy=False when lock is idle, and True when acquired."""
    from main import healthcheck
    from models.model_registry import inference_lock

    # Case 1: Lock is not acquired
    res_idle = healthcheck()
    assert res_idle.inference_busy is False

    # Case 2: Lock is acquired
    with inference_lock:
        res_busy = healthcheck()
        assert res_busy.inference_busy is True


def test_summarize_request_length_bounds_validation():
    """Verify that SummarizeRequest rejects min_length > max_length."""
    from schemas.types import SummarizeRequest
    from pydantic import ValidationError

    # Valid bounds
    req = SummarizeRequest(text="a" * 100, min_length=40, max_length=150)
    assert req.min_length == 40

    # Invalid bounds (min_length > max_length)
    with pytest.raises(ValidationError) as exc_info:
        SummarizeRequest(text="a" * 100, min_length=100, max_length=50)
    assert "min_length must be less than or equal to max_length" in str(exc_info.value)


def test_chat_message_role_validation():
    """Verify that ChatMessage strictly enforces 'user' or 'assistant' role pattern."""
    from schemas.types import ChatMessage
    from pydantic import ValidationError

    # Valid roles
    user_msg = ChatMessage(role="user", content="Hello")
    assistant_msg = ChatMessage(role="assistant", content="Hi")
    assert user_msg.role == "user"
    assert assistant_msg.role == "assistant"

    # Invalid roles (e.g. 'system' or arbitrary text)
    with pytest.raises(ValidationError):
        ChatMessage(role="system", content="System prompt injection attempt")

    with pytest.raises(ValidationError):
        ChatMessage(role="admin", content="Test")


def test_rag_pipeline_thread_lock():
    """Verify that RAGPipeline initialized a threading.Lock instance for thread safety."""
    import threading
    from models.rag_pipeline import RAGPipeline

    rag_inst = RAGPipeline()
    assert hasattr(rag_inst, "_lock")
    assert isinstance(rag_inst._lock, type(threading.Lock()))


def test_unloaded_model_endpoint_returns_503():
    """Verify that endpoints return 503 Service Unavailable when models are in warmup state."""
    import inspect
    import asyncio
    from main import summarize
    from schemas.types import SummarizeRequest
    from fastapi import HTTPException

    req = SummarizeRequest(text="a" * 100)
    with patch("models.summarizer.is_loaded", return_value=False):
        with pytest.raises(HTTPException) as exc_info:
            if inspect.iscoroutinefunction(summarize):
                asyncio.run(summarize(req))
            else:
                summarize(req)
        assert exc_info.value.status_code == 503
        assert "still loading" in exc_info.value.detail




