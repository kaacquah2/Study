"""
Unit tests for ML Backend rate limiting key function.
"""

from unittest.mock import MagicMock
import pytest
from main import user_key


def test_user_key_uses_x_user_id():
    """Verify user_key extracts X-User-ID header when present."""
    mock_request = MagicMock()
    mock_request.headers.get.side_effect = lambda key, default=None: "student-123" if key == "X-User-ID" else default

    key = user_key(mock_request)
    assert key == "student-123"


def test_user_key_fallback_to_remote_address():
    """Verify user_key falls back to remote address when X-User-ID header is absent."""
    mock_request = MagicMock()
    mock_request.headers.get.return_value = None
    mock_request.client.host = "192.168.1.50"

    key = user_key(mock_request)
    assert key == "192.168.1.50"
