"""
Unit tests for CacheManager and fallback resilience.
"""

import pytest
from cache import CacheManager

def test_cache_key_generation_deterministic():
    params1 = {"prompt": "What is Python?", "max_length": 150, "temperature": 0.7}
    params2 = {"temperature": 0.7, "max_length": 150, "prompt": "What is Python?"}
    
    key1 = CacheManager.generate_key("summarize", params1)
    key2 = CacheManager.generate_key("summarize", params2)
    
    assert key1 == key2, "Cache key generation must be deterministic regardless of dictionary key insertion order."

def test_cache_key_generation_param_variation():
    params1 = {"prompt": "What is Python?", "temperature": 0.7}
    params2 = {"prompt": "What is Python?", "temperature": 0.9}
    
    key1 = CacheManager.generate_key("summarize", params1)
    key2 = CacheManager.generate_key("summarize", params2)
    
    assert key1 != key2, "Different generation parameters must produce distinct cache keys."

def test_memory_cache_hit_miss():
    cm = CacheManager(in_memory_maxsize=10, in_memory_ttl=60)
    key = "ml_cache:test:123"
    
    val, status = cm.get(key)
    assert status == "MISS"
    assert val is None
    
    cm.set(key, {"summary": "Python is a programming language."})
    
    val, status = cm.get(key)
    assert status == "HIT"
    assert val == {"summary": "Python is a programming language."}

def test_memory_cache_maxsize_eviction():
    maxsize = 5
    cm = CacheManager(in_memory_maxsize=maxsize, in_memory_ttl=60)
    
    for i in range(10):
        key = f"ml_cache:test:{i}"
        cm.set(key, {"data": i})
        
    assert len(cm._memory_cache) <= maxsize, f"Memory cache must not exceed maxsize {maxsize}."
    
    # Oldest key (0) should have been evicted
    val, status = cm.get("ml_cache:test:0")
    assert status == "MISS"

def test_redis_unreachable_fallback():
    # Force an invalid Redis URL to test startup fallback resilience
    cm = CacheManager()
    cm._redis_available = False
    cm._redis_client = None
    
    key = "ml_cache:test:fallback"
    cm.set(key, {"result": "fallback_ok"})
    
    val, status = cm.get(key)
    assert status == "HIT"
    assert val == {"result": "fallback_ok"}
