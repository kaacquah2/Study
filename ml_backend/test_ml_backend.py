"""
Pytest unit test suite for the Python ML Backend.
Run via: pytest ml_backend/test_ml_backend.py
"""

import os
import sys
import asyncio
from pathlib import Path
import pytest
from unittest.mock import MagicMock, patch

# Add ml_backend directory to python path
ml_backend_dir = Path(__file__).parent
if str(ml_backend_dir) not in sys.path:
    sys.path.insert(0, str(ml_backend_dir))

from models.quiz_pipeline import _fallback_question, generate_quiz
from models.lesson_generator import _sanitize_lesson_body
from models.memorization_guard import check_verbatim_leakage, calculate_ngram_similarity
from schemas.types import DocumentsRequest, SummarizeRequest, ChatMessage
from cache import CacheManager
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
    assert "## Main Page Heading" in sanitized
    assert re.search(r'(?m)^#\s', sanitized) is None
    assert "### Sub Heading Section" in sanitized
    assert "#### Minor Sub Section" in sanitized
    assert "[Google](https://google.com)" not in sanitized
    assert "Google" in sanitized
    assert "https://example.com" not in sanitized
    assert "[external link removed]" in sanitized
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
    assert module_titles[0] == "Fundamentals & Overview"
    assert module_titles[1] == "Core Principles & Concepts"
    assert module_titles[2] == "Practical Applications"

    intro_topic = "Introduction to Cell Biology"
    intro_outline = _fallback_outline(intro_topic, 3, "lessons_and_quizzes")
    assert intro_outline["title"] == "Introduction to Cell Biology"


def test_outline_json_codeblock_parsing():
    """Verify that _parse_outline correctly extracts JSON from Markdown ```json code blocks."""
    from models.outline_generator import _parse_outline

    raw_response = (
        "Here is the generated outline:\n\n"
        "```json\n"
        "{\n"
        '  "title": "Quantum Mechanics",\n'
        '  "description": "Introductory quantum physics",\n'
        '  "modules": [\n'
        '    {"order": 0, "type": "lesson", "title": "Wave Functions", "summary": "Intro to wave functions", "learningObjective": "Understand wave functions", "keyPoints": ["Schrodinger equation"]},\n'
        '    {"order": 1, "type": "quiz", "title": "Quantum Quiz", "summary": "Quiz on wave functions", "learningObjective": "Test knowledge", "keyPoints": ["Quiz questions"]},\n'
        '    {"order": 2, "type": "lesson", "title": "Spin & States", "summary": "Intro to spin", "learningObjective": "Understand spin", "keyPoints": ["Pauli matrices"]}\n'
        "  ]\n"
        "}\n"
        "```\n"
    )

    res = _parse_outline(raw_response, "Quantum Mechanics", 3, "lessons_and_quizzes")
    assert res["is_fallback"] is False
    assert res["title"] == "Quantum Mechanics"
    assert len(res["modules"]) == 3


def test_healthcheck_lock_status():
    """Verify that healthcheck correctly reports inference_busy via per-model active counts."""
    from fastapi import Response
    from main import healthcheck
    import main
    from models.model_registry import inference_start, inference_end

    with patch.object(main, "_EAGER_WARMUP", False):
        res_idle = asyncio.run(healthcheck(response=Response()))
        assert res_idle.inference_busy is False
        assert res_idle.ready is True

        # Simulate an in-flight inference call
        inference_start("test-model-busy-check")
        try:
            res_busy = asyncio.run(healthcheck(response=Response()))
            assert res_busy.inference_busy is True
        finally:
            inference_end("test-model-busy-check")

        res_idle_again = asyncio.run(healthcheck(response=Response()))
        assert res_idle_again.inference_busy is False


def test_healthcheck_status_codes_and_errors():
    """Verify that healthcheck sets HTTP 503 and populates errors when models fail or are warming up."""
    from fastapi import Response
    from main import healthcheck
    import main

    # Case 1: Healthy & Ready (lazy mode or loaded models) -> 200 OK
    with patch.object(main, "_EAGER_WARMUP", False), \
         patch.dict(main._MODEL_STATUS, {k: "ready" for k in main._MODEL_STATUS}, clear=True):
        resp_ok = Response()
        res = asyncio.run(healthcheck(response=resp_ok))
        assert resp_ok.status_code == 200
        assert res.ready is True
        assert res.status == "ok"
        assert res.errors is None

    # Case 2: Eager warmup in progress -> 503 Service Unavailable + status='warming_up'
    with patch.object(main, "_EAGER_WARMUP", True), \
         patch.dict(main._MODEL_STATUS, {"summarizer": "pending"}, clear=True):
        resp_warm = Response()
        res_warm = asyncio.run(healthcheck(response=resp_warm))
        assert resp_warm.status_code == 503
        assert res_warm.ready is False
        assert res_warm.status == "warming_up"

    # Case 3: Error in model load -> 503 Service Unavailable + error map
    with patch.dict(main._MODEL_STATUS, {"summarizer": "error: CUDA out of memory"}, clear=True):
        resp_err = Response()
        res_err = asyncio.run(healthcheck(response=resp_err))
        assert resp_err.status_code == 503
        assert res_err.ready is False
        assert res_err.status == "unhealthy"
        assert res_err.errors is not None
        assert "summarizer" in res_err.errors


def test_health_liveness_probe():
    """Verify that /health/live returns HTTP 200 with status='alive'."""
    from main import health_liveness

    res = asyncio.run(health_liveness())
    assert isinstance(res, dict)
    assert res["status"] == "alive"
    assert "uptime_seconds" in res


def test_health_readiness_probe_lazy_mode():
    """Verify that /health/ready returns HTTP 200 when eager warmup is false and no errors exist."""
    import json
    from main import health_readiness
    import main

    with patch.object(main, "_EAGER_WARMUP", False), \
         patch.dict(main._MODEL_STATUS, {k: "pending" for k in main._MODEL_STATUS}, clear=True):
        res = asyncio.run(health_readiness())
        assert res.status_code == 200
        body = json.loads(bytes(res.body))
        assert body["ready"] is True
        assert body["status"] == "ready"


def test_health_readiness_probe_eager_warming_up():
    """Verify that /health/ready returns HTTP 503 while eager warmup models are still pending."""
    import json
    from main import health_readiness
    import main

    with patch.object(main, "_EAGER_WARMUP", True), \
         patch.dict(main._MODEL_STATUS, {"summarizer": "pending", "paraphraser": "pending"}, clear=True):
        res = asyncio.run(health_readiness())
        assert res.status_code == 503
        body = json.loads(bytes(res.body))
        assert body["ready"] is False
        assert body["status"] == "warming_up"


def test_health_readiness_probe_error_state():
    """Verify that /health/ready returns HTTP 503 when a model load has failed."""
    import json
    from main import health_readiness
    import main

    with patch.object(main, "_EAGER_WARMUP", True), \
         patch.dict(main._MODEL_STATUS, {"summarizer": "error: OOM", "paraphraser": "ready"}, clear=True):
        res = asyncio.run(health_readiness())
        assert res.status_code == 503
        body = json.loads(bytes(res.body))
        assert body["ready"] is False
        assert body["status"] == "unhealthy"
        assert "errors" in body
        assert "summarizer" in body["errors"]


def test_health_probe_alias_dispatches():
    """Verify that /health dispatches to readiness or liveness based on query parameter."""
    import json
    from main import health_probe
    from fastapi.responses import JSONResponse

    # Liveness probe
    live_res = asyncio.run(health_probe(probe="liveness"))
    assert isinstance(live_res, dict)
    assert live_res["status"] == "alive"

    # Readiness probe (default)
    ready_res = asyncio.run(health_probe(probe="readiness"))
    assert isinstance(ready_res, JSONResponse)



def test_summarize_request_length_bounds_validation():
    """Verify that SummarizeRequest rejects min_length > max_length."""
    from pydantic import ValidationError

    req = SummarizeRequest(text="a" * 100, min_length=40, max_length=150)
    assert req.min_length == 40

    with pytest.raises(ValidationError) as exc_info:
        SummarizeRequest(text="a" * 100, min_length=100, max_length=50)
    assert "min_length must be less than or equal to max_length" in str(exc_info.value)


def test_chat_message_role_validation():
    """Verify that ChatMessage strictly enforces 'user' or 'assistant' role pattern."""
    from pydantic import ValidationError

    user_msg = ChatMessage(role="user", content="Hello")
    assistant_msg = ChatMessage(role="assistant", content="Hi")
    assert user_msg.role == "user"
    assert assistant_msg.role == "assistant"

    with pytest.raises(ValidationError):
        ChatMessage(role="system", content="System prompt injection attempt")

    with pytest.raises(ValidationError):
        ChatMessage(role="admin", content="Test")


def test_documents_request_item_validation():
    """Verify that DocumentsRequest rejects empty or ultra-short string items."""
    from pydantic import ValidationError

    # Valid: no user_id field — identity is derived server-side
    req = DocumentsRequest(texts=["This is a valid document content string."])
    assert len(req.texts) == 1

    # Invalid short string
    with pytest.raises(ValidationError):
        DocumentsRequest(texts=["short"])


def test_memorization_guard_leakage_detection():
    """Verify that check_verbatim_leakage catches past corpus questions."""
    prompt = "What is the time complexity of QuickSort in the worst case scenario?"
    is_verbatim, score, matched = check_verbatim_leakage(prompt)
    assert is_verbatim is True
    assert score >= 0.85
    assert matched is not None


def test_cache_manager_deserialization_safety():
    """Verify that CacheManager gracefully handles unparseable cache values without throwing TypeError."""
    cm = CacheManager()
    key = "test_invalid_key"
    cm._memory_cache[key] = "{invalid json string"
    
    val, status = cm.get(key)
    assert status == "MISS"
    assert val is None


def test_rag_pipeline_thread_lock():
    """Verify that RAGPipeline initialized a threading.Lock instance for thread safety."""
    import threading
    from models.rag_pipeline import RAGPipeline

    with patch("sentence_transformers.SentenceTransformer"):
        rag_inst = RAGPipeline()
        assert hasattr(rag_inst, "_lock")
        assert isinstance(rag_inst._lock, type(threading.Lock()))


def test_model_loading_on_demand():
    """Verify that endpoints ensure model loading on demand."""
    from main import summarize
    from fastapi import Response
    from starlette.requests import Request

    req = SummarizeRequest(text="a" * 100)
    mock_request = Request({
        "type": "http",
        "method": "POST",
        "path": "/summarize",
        "headers": [],
        "client": ("127.0.0.1", 12345)
    })

    with patch("models.summarizer.is_loaded", return_value=False), \
         patch("models.summarizer.load_summarizer") as mock_load, \
         patch("models.summarizer.summarize", return_value="Summarized text result"):
        
        res = asyncio.run(summarize(mock_request, req, response=Response()))
        assert mock_load.called
        assert res.summary == "Summarized text result"


def test_download_all_models_success():
    """Verify download_all_models executes all model caches and offline verifications without errors."""
    from download_models import download_all_models

    mock_st_instance = MagicMock()
    mock_st_instance.encode.return_value = [0.1, 0.2, 0.3]

    mock_tok_instance = MagicMock()
    mock_tok_instance.return_value = {"input_ids": [1, 2, 3]}

    with patch("sentence_transformers.SentenceTransformer", return_value=mock_st_instance) as mock_st, \
         patch("transformers.AutoTokenizer.from_pretrained", return_value=mock_tok_instance) as mock_tok, \
         patch("transformers.AutoModelForSeq2SeqLM.from_pretrained") as mock_seq2seq, \
         patch("transformers.AutoConfig.from_pretrained") as mock_cfg, \
         patch("time.sleep"):
        
        mock_cfg.return_value.is_encoder_decoder = False
        with patch("transformers.AutoModelForCausalLM.from_pretrained") as mock_causal:
            failures = download_all_models()
            assert failures == []
            assert mock_st.called
            assert mock_tok.called
            assert mock_seq2seq.called


def test_download_with_retry_succeeds_after_transient_failure():
    """Verify download_with_retry retries on transient errors and succeeds."""
    from download_models import download_with_retry

    calls = []
    def flaky_cache(model_id, name):
        calls.append(1)
        if len(calls) < 2:
            raise ConnectionResetError("Connection reset by peer")
        return None

    with patch("time.sleep"):
        download_with_retry(flaky_cache, "test-model", "TestModel", max_retries=3, initial_delay=0.01)
    assert len(calls) == 2


def test_download_with_retry_exhausts_and_raises():
    """Verify download_with_retry raises RuntimeError when all retries are exhausted."""
    from download_models import download_with_retry

    def failing_cache(model_id, name):
        raise TimeoutError("HuggingFace Hub timeout")

    with patch("time.sleep"):
        with pytest.raises(RuntimeError) as exc_info:
            download_with_retry(failing_cache, "test-model", "TestModel", max_retries=3, initial_delay=0.01)
        assert "after 3 attempts" in str(exc_info.value)


def test_download_all_models_offline_verification_failure_reported():
    """Verify download_all_models captures failure when offline verification fails after download."""
    from download_models import download_all_models

    mock_st_instance = MagicMock()
    mock_tok_instance = MagicMock()
    mock_tok_instance.return_value = {"input_ids": [1, 2, 3]}

    def st_side_effect(model_id, local_files_only=False):
        if local_files_only:
            raise FileNotFoundError("Local weights not found for model in offline cache")
        return mock_st_instance

    with patch("sentence_transformers.SentenceTransformer", side_effect=st_side_effect), \
         patch("transformers.AutoTokenizer.from_pretrained", return_value=mock_tok_instance), \
         patch("transformers.AutoModelForSeq2SeqLM.from_pretrained"), \
         patch("transformers.AutoConfig.from_pretrained"), \
         patch("transformers.AutoModelForCausalLM.from_pretrained"), \
         patch("time.sleep"):
        failures = download_all_models()
        assert len(failures) >= 1
        name, model_id, err = failures[0]
        assert name == "Embeddings"
        assert "Offline verification failure" in err


def test_download_models_main_exits_on_failure():
    """Verify that main() exits with code 1 when model downloads fail."""
    from download_models import main

    with patch("download_models.download_all_models", return_value=[("Summarizer", "test-model", "Network error")]):
        with pytest.raises(SystemExit) as exc_info:
            main()
        assert exc_info.value.code == 1


def test_model_registry_prefers_local_files_in_production():
    """Verify model_registry uses local_files_only when APP_ENV=production."""
    from models.model_registry import get_pipeline, _pipelines

    _pipelines.clear()
    with patch.dict(os.environ, {"APP_ENV": "production"}), \
         patch("models.model_registry.pipeline") as mock_pipeline:
        mock_pipe_instance = MagicMock()
        mock_pipeline.return_value = mock_pipe_instance

        pipe = get_pipeline("summarization", "mock-production-model")
        assert pipe == mock_pipe_instance
        mock_pipeline.assert_called_once()
        _, kwargs = mock_pipeline.call_args
        assert kwargs.get("model_kwargs", {}).get("local_files_only") is True


def test_classify_model_tier():
    """Verify classification of base foundation vs specialized vs fine-tuned custom models."""
    from models.model_registry import classify_model_tier

    # Base foundation model default
    tier, is_ft = classify_model_tier("google/flan-t5-base", "google/flan-t5-base", is_specialized_baseline=False)
    assert tier == "base_foundation"
    assert is_ft is False

    # Pre-trained specialized baseline
    tier, is_ft = classify_model_tier("valhalla/t5-small-qg-prepend", "valhalla/t5-small-qg-prepend", is_specialized_baseline=True)
    assert tier == "pretrained_specialized"
    assert is_ft is False

    # Custom HuggingFace model override
    tier, is_ft = classify_model_tier("my-org/flan-t5-custom-study-summarizer", "google/flan-t5-base", is_specialized_baseline=False)
    assert tier == "fine_tuned_custom"
    assert is_ft is True


def test_get_model_provenance_manifest_defaults():
    """Verify manifest output with default environment variables."""
    from models.model_registry import get_model_provenance_manifest

    with patch.dict(os.environ, {}, clear=False):
        manifest = get_model_provenance_manifest({"summarizer": True})
        assert "system_mode" in manifest
        assert "models" in manifest
        assert manifest["models"]["summarizer"]["default_id"] == "google/flan-t5-base"
        assert manifest["models"]["summarizer"]["loaded"] is True
        assert manifest["models"]["summarizer"]["tier"] in ("base_foundation", "local_checkpoint", "fine_tuned_custom")


def test_get_model_provenance_manifest_fine_tuned_override():
    """Verify manifest detects fine_tuned_production mode when custom model IDs are set."""
    from models.model_registry import get_model_provenance_manifest

    with patch.dict(os.environ, {"SUMMARIZER_MODEL_ID": "study-org/flan-t5-fine-tuned-v1"}):
        manifest = get_model_provenance_manifest()
        assert manifest["models"]["summarizer"]["is_fine_tuned"] is True
        assert manifest["models"]["summarizer"]["tier"] == "fine_tuned_custom"
        assert manifest["system_mode"] == "fine_tuned_production"
        assert manifest["fine_tuned_count"] >= 1


def test_models_info_endpoint():
    """Verify that /models/info returns 200 and schema-valid ModelManifestResponse."""
    from fastapi.testclient import TestClient
    from main import app
    import main

    client = TestClient(app)
    headers = {"X-API-Key": main._API_KEY} if main._API_KEY else {}
    response = client.get("/models/info", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "system_mode" in data
    assert "models" in data
    assert "summarizer" in data["models"]
    assert "chat_assistant" in data["models"]
    assert "device_diagnostics" in data


def test_healthcheck_includes_model_provenance():
    """Verify that /healthcheck includes model_provenance summary."""
    from fastapi.testclient import TestClient
    from main import app
    import main

    client = TestClient(app)
    headers = {"X-API-Key": main._API_KEY} if main._API_KEY else {}
    with patch.object(main, "_EAGER_WARMUP", False):
        response = client.get("/healthcheck", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "model_provenance" in data
        assert "system_mode" in data["model_provenance"]
        assert "fine_tuned_count" in data["model_provenance"]


