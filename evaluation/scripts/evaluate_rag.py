"""
Empirical RAG Vector Store Evaluation Harness.

Evaluates semantic retrieval performance across 30 academic computer science queries
using the live FAISS index and sentence-transformers embedding model.
No target figures are pre-programmed. Outputs raw measurements directly to results/.

Usage:
    cd Study
    python evaluation/scripts/evaluate_rag.py
"""

import os
import sys
import json
import csv
import logging
from pathlib import Path
import numpy as np

# Set environment paths to ml_backend
project_root = Path(__file__).resolve().parent.parent.parent
ml_backend_dir = project_root / "ml_backend"
if str(ml_backend_dir) not in sys.path:
    sys.path.insert(0, str(ml_backend_dir))

# Configure vector store paths if not set
if "FAISS_INDEX_PATH" not in os.environ:
    os.environ["FAISS_INDEX_PATH"] = str(ml_backend_dir / "vector_store" / "index.faiss")
if "FAISS_DOCS_PATH" not in os.environ:
    os.environ["FAISS_DOCS_PATH"] = str(ml_backend_dir / "vector_store" / "docs.json")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two 1D vectors."""
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def run_rag_evaluation():
    datasets_dir = project_root / "evaluation" / "datasets"
    results_dir = project_root / "evaluation" / "results"
    results_dir.mkdir(parents=True, exist_ok=True)

    queries_file = datasets_dir / "rag_queries_30.json"
    with open(queries_file, "r", encoding="utf-8") as f:
        test_queries = json.load(f)

    logger.info(f"Loaded {len(test_queries)} evaluation queries from {queries_file}")

    from models.rag_pipeline import rag
    embedder = rag._embed_model

    raw_results = []
    hits_count = 0
    grounded_count = 0
    cosine_scores = []

    for item in test_queries:
        qid = item["id"]
        domain = item["domain"]
        query = item["query"]
        expected_keywords = item["keywords"]
        gold_concept = item["gold_concept"]

        # Live retrieval from FAISS
        context = rag.retrieve(query=query, user_id="default_user", top_k=3)
        context_clean = context.strip()
        context_lower = context_clean.lower()

        matched_kws = [kw for kw in expected_keywords if kw.lower() in context_lower]
        kw_coverage = len(matched_kws) / len(expected_keywords) if expected_keywords else 0.0

        # Compute embedding similarities
        query_emb = embedder.encode(query)
        if context_clean:
            # Measure similarity between query and retrieved context
            context_emb = embedder.encode(context_clean[:1000])
            query_context_cos = cosine_similarity(query_emb, context_emb)

            # Measure similarity between retrieved context and gold reference concept
            gold_emb = embedder.encode(gold_concept)
            gold_context_cos = cosine_similarity(gold_emb, context_emb)
        else:
            query_context_cos = 0.0
            gold_context_cos = 0.0

        cosine_scores.append(query_context_cos)

        # Objective criteria:
        # 1. Relevant if query-context cosine >= 0.50 OR keyword coverage >= 0.40
        is_relevant = (query_context_cos >= 0.50) or (kw_coverage >= 0.40)
        if is_relevant:
            hits_count += 1

        # 2. Grounded if retrieved content aligns with gold standard (cosine >= 0.45 or >=2 kws)
        is_grounded = (gold_context_cos >= 0.45) or (len(matched_kws) >= 2)
        if is_grounded:
            grounded_count += 1

        hallucination_detected = not is_grounded if context_clean else False

        raw_results.append({
            "query_id": qid,
            "domain": domain,
            "query": query,
            "context_length_chars": len(context_clean),
            "matched_keywords": "; ".join(matched_kws),
            "keyword_coverage_ratio": round(kw_coverage, 4),
            "query_context_cosine_sim": round(query_context_cos, 4),
            "gold_context_cosine_sim": round(gold_context_cos, 4),
            "is_relevant_hit": is_relevant,
            "is_grounded": is_grounded,
            "hallucination_detected": hallucination_detected,
            "retrieved_snippet": context_clean[:120].replace("\n", " ") + "..." if context_clean else "[NO CONTEXT RETRIEVED]"
        })

        logger.info(
            f"[{qid}] {domain}: Cosine={query_context_cos:.3f}, KW={len(matched_kws)}/{len(expected_keywords)}, "
            f"Hit={'YES' if is_relevant else 'NO'}, Grounded={'YES' if is_grounded else 'NO'}"
        )

    total_queries = len(test_queries)
    precision_at_3 = (hits_count / total_queries) * 100.0
    groundedness_rate = (grounded_count / total_queries) * 100.0
    hallucination_rate = ((total_queries - grounded_count) / total_queries) * 100.0
    mean_cosine = float(np.mean(cosine_scores))
    std_cosine = float(np.std(cosine_scores))

    # Save granular CSV
    csv_file = results_dir / "rag_evaluation_results.csv"
    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(raw_results[0].keys()))
        writer.writeheader()
        writer.writerows(raw_results)

    # Save summary JSON
    summary = {
        "evaluation_name": "RAG Retrieval & Groundedness Evaluation",
        "timestamp_utc": "live_run",
        "sample_size": total_queries,
        "embedding_model": os.getenv("EMBED_MODEL_ID", "sentence-transformers/all-MiniLM-L6-v2"),
        "metrics": {
            "retrieval_precision_at_3_percent": round(precision_at_3, 2),
            "hits_count": hits_count,
            "total_count": total_queries,
            "answer_groundedness_rate_percent": round(groundedness_rate, 2),
            "grounded_count": grounded_count,
            "hallucination_rate_percent": round(hallucination_rate, 2),
            "mean_query_context_cosine_sim": round(mean_cosine, 4),
            "std_query_context_cosine_sim": round(std_cosine, 4),
            "min_query_context_cosine_sim": round(float(np.min(cosine_scores)), 4),
            "max_query_context_cosine_sim": round(float(np.max(cosine_scores)), 4)
        },
        "domain_breakdown": {}
    }

    # Domain breakdown
    domains = set(r["domain"] for r in raw_results)
    for dom in sorted(domains):
        dom_rows = [r for r in raw_results if r["domain"] == dom]
        dom_hits = sum(1 for r in dom_rows if r["is_relevant_hit"])
        summary["domain_breakdown"][dom] = {
            "queries": len(dom_rows),
            "hits": dom_hits,
            "precision_percent": round((dom_hits / len(dom_rows)) * 100.0, 2),
            "mean_cosine": round(float(np.mean([r["query_context_cosine_sim"] for r in dom_rows])), 4)
        }

    json_file = results_dir / "rag_metrics_summary.json"
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    logger.info(f"\n--- RAG Evaluation Complete ---")
    logger.info(f"Precision@3: {precision_at_3:.1f}% ({hits_count}/{total_queries})")
    logger.info(f"Groundedness: {groundedness_rate:.1f}% ({grounded_count}/{total_queries})")
    logger.info(f"Hallucination Rate: {hallucination_rate:.1f}%")
    logger.info(f"Mean Cosine: {mean_cosine:.4f} ± {std_cosine:.4f}")
    logger.info(f"Results saved to {csv_file} and {json_file}")
    return summary


if __name__ == "__main__":
    run_rag_evaluation()
