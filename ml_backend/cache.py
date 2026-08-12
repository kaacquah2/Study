"""
Cache Manager for ML Backend.

Provides dual-layer caching:
1. Primary: Redis (if available at REDIS_URL)
2. Fallback: In-memory cachetools.TTLCache (maxsize=1000, default ttl=86400s)

Ensures graceful failover if Redis is unreachable or fails mid-operation.
"""

import os
import json
import time
import hashlib
import logging
from typing import Any, Tuple, Optional
from cachetools import TTLCache

logger = logging.getLogger(__name__)

_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class CacheManager:
    def __init__(self, in_memory_maxsize: int = 1000, in_memory_ttl: int = 86400, redis_cooldown: float = 60.0):
        self._memory_cache = TTLCache(maxsize=in_memory_maxsize, ttl=in_memory_ttl)
        self._redis_client = None
        self._redis_available = False
        self._redis_cooldown = redis_cooldown
        self._last_redis_attempt = 0.0
        self._init_redis()

    def _init_redis(self) -> None:
        self._last_redis_attempt = time.time()
        try:
            import redis
            client = redis.from_url(_REDIS_URL, socket_connect_timeout=1, socket_timeout=1)
            # Test ping
            client.ping()
            self._redis_client = client
            self._redis_available = True
            logger.info(f"[CacheManager] Connected to Redis at {_REDIS_URL}")
        except Exception as e:
            self._redis_client = None
            self._redis_available = False
            logger.info(f"[CacheManager] Redis unavailable ({e}). Using in-memory TTLCache.")

    def _maybe_reconnect_redis(self) -> None:
        """Attempt to reconnect to Redis if the cooldown period has elapsed."""
        if not self._redis_available and (time.time() - self._last_redis_attempt) >= self._redis_cooldown:
            self._init_redis()

    @staticmethod
    def generate_key(prefix: str, params: dict) -> str:
        """
        Generate a deterministic SHA-256 cache key from a dictionary of parameters.
        Includes all generation parameters to prevent stale or wrong-parameter hits.
        """
        try:
            # Sort keys for deterministic JSON serialization
            serialized = json.dumps(params, sort_keys=True, ensure_ascii=True, default=str)
        except Exception:
            serialized = str(sorted(params.items()))
        
        hash_digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
        return f"ml_cache:{prefix}:{hash_digest}"

    def get(self, key: str) -> Tuple[Optional[Any], str]:
        """
        Retrieve value from cache.
        Returns tuple of (value, status) where status is 'HIT' or 'MISS'.
        """
        self._maybe_reconnect_redis()

        # Try Redis first
        if self._redis_available and self._redis_client is not None:
            try:
                raw_val = self._redis_client.get(key)
                if raw_val is not None:
                    data = json.loads(raw_val.decode("utf-8"))
                    return data, "HIT"
            except Exception as e:
                logger.warning(f"[CacheManager] Redis read error ({e}). Falling back to memory cache.")
                self._redis_available = False

        # Fallback to in-memory cache
        if key in self._memory_cache:
            val = self._memory_cache[key]
            if isinstance(val, (dict, list)):
                return val, "HIT"
            try:
                data = json.loads(val)
                if isinstance(data, (dict, list, str, int, float, bool)):
                    return data, "HIT"
            except Exception:
                logger.warning(f"[CacheManager] Failed to deserialize in-memory value for key {key}.")
                del self._memory_cache[key]
                return None, "MISS"

        return None, "MISS"

    def set(self, key: str, value: Any, ttl: int = 86400) -> None:
        """Store value in cache with specified TTL in seconds."""
        try:
            serialized = json.dumps(value, ensure_ascii=False)
        except Exception as e:
            logger.error(f"[CacheManager] Failed to serialize cache value for key {key}: {e}")
            return

        # Always set in memory cache
        self._memory_cache[key] = serialized

        # Set in Redis if available
        self._maybe_reconnect_redis()
        if self._redis_available and self._redis_client is not None:
            try:
                self._redis_client.setex(key, ttl, serialized)
            except Exception as e:
                logger.warning(f"[CacheManager] Redis write error ({e}). Using in-memory fallback.")
                self._redis_available = False

# Global Cache Singleton
cache = CacheManager()
