# System Performance Benchmarks & Latency Evaluation

This document outlines the performance characteristics, inference latency benchmarks, memory footprint, and cold/warm start profiles of the **Adaptive AI-Powered Learning System** across both cloud (Google Gemini Flash) and self-hosted local inference tiers (Python FastAPI `ml_backend`).

> [!IMPORTANT]
> **Replication & Raw Data:**
> All latency measurements were captured using wall-clock timers (`time.perf_counter()`) over 10 consecutive iterations per operation.
>
> - Raw per-run measurements: [`evaluation/results/latency_benchmarks.csv`](../evaluation/results/latency_benchmarks.csv) (240 recorded runs)
> - Summary statistics: [`evaluation/results/latency_summary.json`](../evaluation/results/latency_summary.json)
> - Replicate via: `python evaluation/scripts/run_latency_benchmarks.py`

---

## 1. Operational Latency Benchmarks

Measured across simulated educational payloads (average input length: 800 tokens; output target: 400 tokens) over 10 consecutive runs per operation.

> [!WARNING]
> **Local Fallback column caveat:** The `Local Fallback (ml_backend)` column was measured with `test_mode=True` in the benchmark script (`run_latency_benchmarks.py`), which returns mock stub responses rather than running real model inference. Actual FLAN-T5-large cold inference on CPU takes **15–40s** (informal measurement, n=3 runs, 8-core laptop). Warm/cached model inference: **~2s**. Cache hit: **<1ms** (TTLCache). The benchmark column is retained as a latency floor for the caching layer, not a real inference benchmark.

| Operation                           | Primary Cloud (Gemini Flash)      | Local Fallback (`ml_backend`)    | Cache Hit Latency             | Target SLA |
| :---------------------------------- | :-------------------------------- | :------------------------------- | :---------------------------- | :--------- |
| **Course Outline Generation**       | `1.81s ± 0.21s` (P95: `2.11s`)    | `0.026s ± 0.000s`                | `< 0.1ms` (In-Memory / Redis) | `< 5.0s`   |
| **Lesson Generation (3 Pages)**     | `2.40s ± 0.37s` (P95: `3.00s`)    | `0.036s ± 0.000s`                | `< 0.1ms`                     | `< 8.0s`   |
| **Quiz Generation (5 MCQs)**        | `1.56s ± 0.15s` (P95: `1.84s`)    | `0.021s ± 0.000s`                | `< 0.1ms`                     | `< 4.0s`   |
| **Document RAG Search & Retrieval** | `0.040s ± 0.010s` (P95: `0.046s`) | `0.035s ± 0.004s` (FAISS Cosine) | `< 0.1ms`                     | `< 100ms`  |
| **Chat Assistant (First Token)**    | `0.340s ± 0.054s` (P95: `0.404s`) | `0.018s ± 0.000s`                | `< 0.1ms`                     | `< 1.0s`   |
| **Chat Assistant (Full Response)**  | `1.86s ± 0.20s` (P95: `2.12s`)    | `0.018s ± 0.000s`                | `< 0.1ms`                     | `< 5.0s`   |
| **Text Summarization**              | `1.11s ± 0.16s` (P95: `1.33s`)    | `0.016s ± 0.000s`                | `< 0.1ms`                     | `< 3.0s`   |
| **Text Paraphrasing (3 Tones)**     | `1.19s ± 0.18s` (P95: `1.48s`)    | `0.015s ± 0.000s`                | `< 0.1ms`                     | `< 3.0s`   |

---

## 2. Resource Utilization & Memory Footprint

### ML Backend Process (`ml_backend`)

- **Base Startup RAM (No eager load):** `180 MB`
- **Working RAM (Lazy-loaded FLAN-T5 + SentenceTransformers + FAISS):** `1.45 GB`
- **Peak RAM during concurrent batch inference:** `2.60 GB`
- **FAISS Vector Index File Size (22,618 indexed chunks):** `34.9 MB`

### SvelteKit API Serverless Functions

- **Cold Start Duration:** `~240ms`
- **Warm Execution Duration:** `12ms – 85ms` (excluding external AI roundtrips)
- **Memory Allocated:** `256 MB per Netlify function`

---

## 3. Caching & Stampede Prevention Efficiency

| Cache Layer                  | Mechanism                                | Hit Ratio (Simulated 500 Requests) | Latency Reduction               |
| :--------------------------- | :--------------------------------------- | :--------------------------------- | :------------------------------ |
| **Outline Cache**            | Upstash Redis + In-Memory Fallback       | `78.4%`                            | `99.2%` (from 1.81s to < 0.1ms) |
| **YouTube Video Enrichment** | 90-Day Firestore Cache + Stampede Lock   | `94.2%`                            | `98.6%` (from 420ms to 6ms)     |
| **ML Backend Query Cache**   | Python In-Memory TTLCache (`cachetools`) | `42.0%`                            | `99.7%` (from 1.56s to 0.03ms)  |

---

## 4. Benchmark Replication Instructions

To re-run and verify latency measurements on your local machine:

```bash
# Execute latency benchmark suite
python evaluation/scripts/run_latency_benchmarks.py
```

Or query the metrics endpoint on the running server:

```bash
curl -H "Authorization: Bearer <ML_BACKEND_API_KEY>" http://localhost:8000/admin/metrics
```
