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
import ssl
import hashlib
import logging
from typing import Any, Tuple, Optional
from cachetools import TTLCache  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)

_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
_ENABLE_REDIS = os.getenv("ENABLE_REDIS", "true").lower() in ("true", "1", "yes")
_CACHE_MAXSIZE = int(os.getenv("CACHE_IN_MEMORY_MAXSIZE", "1000"))
_CACHE_TTL = int(os.getenv("CACHE_IN_MEMORY_TTL", "86400"))
_REDIS_COOLDOWN = float(os.getenv("REDIS_CONNECT_COOLDOWN", "60.0"))

class CacheManager:
    def __init__(
        self,
        in_memory_maxsize: Optional[int] = None,
        in_memory_ttl: Optional[int] = None,
        redis_cooldown: Optional[float] = None,
        enable_redis: Optional[bool] = None,
    ):
        maxsize = in_memory_maxsize if in_memory_maxsize is not None else _CACHE_MAXSIZE
        ttl = in_memory_ttl if in_memory_ttl is not None else _CACHE_TTL
        self._memory_cache = TTLCache(maxsize=maxsize, ttl=ttl)
        self._redis_client = None
        self._redis_available = False
        self._redis_cooldown = redis_cooldown if redis_cooldown is not None else _REDIS_COOLDOWN
        self._enable_redis = enable_redis if enable_redis is not None else _ENABLE_REDIS
        self._last_redis_attempt = 0.0
        if self._enable_redis:
            self._init_redis()
        else:
            logger.info("[CacheManager] Redis disabled by ENABLE_REDIS=false. Using in-memory TTLCache.")

    def _init_redis(self) -> None:
        if not self._enable_redis:
            return
        self._last_redis_attempt = time.time()
        redis_url = os.getenv("REDIS_URL", _REDIS_URL)
        try:
            import redis
            kwargs: dict[str, Any] = {"socket_connect_timeout": 3, "socket_timeout": 3}
            if redis_url.startswith("rediss://"):
                kwargs["ssl_cert_reqs"] = ssl.CERT_NONE
            client = redis.from_url(redis_url, **kwargs)
            # Test ping
            client.ping()
            self._redis_client = client
            self._redis_available = True
            sanitized_url = redis_url.split("@")[-1] if "@" in redis_url else redis_url
            logger.info(f"[CacheManager] Connected to Redis at {sanitized_url}")
        except Exception as e:
            self._redis_client = None
            self._redis_available = False
            logger.info(f"[CacheManager] Redis unavailable ({e}). Using in-memory TTLCache.")

    def _maybe_reconnect_redis(self) -> None:
        """Attempt to reconnect to Redis if the cooldown period has elapsed."""
        if self._enable_redis and not self._redis_available and (time.time() - self._last_redis_attempt) >= self._redis_cooldown:
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
