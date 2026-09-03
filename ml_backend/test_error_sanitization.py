"""
Unit tests for ML Backend error sanitization and correlation ID propagation.
"""

from unittest.mock import MagicMock
import pytest
from fastapi import HTTPException
from main import _handle_500_error

def test_handle_500_error_sanitization():
    # Mock request with state.request_id
    mock_request = MagicMock()
    mock_request.state.request_id = "test-req-correlation-1234"

    sensitive_exception = ValueError("Internal DB connection failed: postgresql://admin:secretpass@10.0.0.5:5432/core")

    http_exc = _handle_500_error(mock_request, "TestEndpoint", sensitive_exception)

    assert isinstance(http_exc, HTTPException)
    assert http_exc.status_code == 500
    assert http_exc.detail == {
        "message": "Internal Server Error",
        "request_id": "test-req-correlation-1234"
    }

    # Ensure sensitive information is never included in the detail dictionary
    detail_str = str(http_exc.detail)
    assert "secretpass" not in detail_str
    assert "10.0.0.5" not in detail_str
    assert "postgresql" not in detail_str

def test_handle_500_error_fallback_request_id():
    mock_request = MagicMock()
    mock_request.state = MagicMock(spec=[]) # No request_id attribute
    mock_request.headers.get.return_value = "header-req-id-5678"

    sensitive_exception = RuntimeError("PyTorch CUDA out of memory on /device:0/cuda_allocator.cpp:389")

    http_exc = _handle_500_error(mock_request, "TestEndpoint", sensitive_exception)

    assert http_exc.status_code == 500
    assert http_exc.detail["request_id"] == "header-req-id-5678"
    assert http_exc.detail["message"] == "Internal Server Error"
    assert "cuda_allocator" not in str(http_exc.detail)
