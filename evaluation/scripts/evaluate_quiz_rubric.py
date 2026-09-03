"""
Empirical Quiz Evaluation & Single-Expert Rubric Analysis Harness.

Calculates descriptive statistics, score distributions, and Bloom taxonomy breakdowns
across 50 computer science quiz questions evaluated by an internal domain expert on a 1–5 scale.
Outputs granular evaluation data and summary metrics to results/.

Usage:
    cd Study
    python evaluation/scripts/evaluate_quiz_rubric.py
"""

import sys
import json
import csv
import logging
from pathlib import Path
import numpy as np

project_root = Path(__file__).resolve().parent.parent.parent
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def run_quiz_evaluation():
    datasets_dir = project_root / "evaluation" / "datasets"
    results_dir = project_root / "evaluation" / "results"
    results_dir.mkdir(parents=True, exist_ok=True)

    expert_file = datasets_dir / "quiz_expert_eval_50.csv"
    if not expert_file.exists():
        raise FileNotFoundError(f"Expert evaluation dataset not found: {expert_file}")

    rows = []
    with open(expert_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append({
                "question_id": r["question_id"],
                "course": r["course"],
                "topic": r["topic"],
                "bloom_taxonomy": r["bloom_taxonomy"],
                "relevance": float(r["relevance"]),
                "clarity": float(r["clarity"]),
                "correctness": float(r["correctness"]),
                "distractor_plausibility": float(r["distractor_plausibility"]),
                "difficulty_appropriateness": float(r["difficulty_appropriateness"]),
                "overall_score": float(r["overall_score"]),
                "expert_notes": r.get("expert_notes", "")
            })

    n_samples = len(rows)
    logger.info(f"Loaded {n_samples} expert-evaluated quiz items from {expert_file}")

    dimensions = [
        "relevance",
        "clarity",
        "correctness",
        "distractor_plausibility",
        "difficulty_appropriateness"
    ]

    dimension_metrics = {}
    for dim in dimensions:
        scores = [r[dim] for r in rows]
        high_quality_count = sum(1 for s in scores if s >= 4.0)
        dimension_metrics[dim] = {
            "mean": round(float(np.mean(scores)), 2),
            "std_dev": round(float(np.std(scores)), 2),
            "median": round(float(np.median(scores)), 2),
            "min": round(float(np.min(scores)), 2),
            "max": round(float(np.max(scores)), 2),
            "pct_high_quality_ge_4": round((high_quality_count / n_samples) * 100.0, 1)
        }

    # Taxonomy level breakdown
    bloom_groups = {}
    for r in rows:
        b = r["bloom_taxonomy"]
        if b not in bloom_groups:
            bloom_groups[b] = []
        bloom_groups[b].append(r["overall_score"])

    bloom_breakdown = {}
    for b_level, b_scores in bloom_groups.items():
        bloom_breakdown[b_level] = {
            "count": len(b_scores),
            "mean_composite_score": round(float(np.mean(b_scores)), 2),
            "std_dev": round(float(np.std(b_scores)), 2)
        }

    overall_composite_mean = round(float(np.mean([r["overall_score"] for r in rows])), 2)

    summary = {
        "evaluation_name": "Quiz Generation Quality Expert Rubric Evaluation",
        "sample_size": n_samples,
        "num_raters": 1,
        "evaluator_type": "Internal Domain Expert / Course Author",
        "scale": "1 to 5 Likert Scale (5 = Excellent)",
        "dimension_metrics": dimension_metrics,
        "bloom_taxonomy_breakdown": bloom_breakdown,
        "overall_composite_mean": overall_composite_mean,
        "methodology_notes": (
            "Evaluated by an internal domain expert across 5 pedagogical dimensions. "
            "Reported values reflect true descriptive distributions without synthetic perturbations or simulated multi-rater kappa."
        )
    }

    # Save results to CSV
    csv_file = results_dir / "quiz_human_eval_50.csv"
    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        fieldnames = [
            "question_id", "course", "topic", "bloom_taxonomy",
            "relevance", "clarity", "correctness", "distractor_plausibility",
            "difficulty_appropriateness", "overall_score", "expert_notes"
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    # Save summary JSON
    json_file = results_dir / "quiz_evaluation_summary.json"
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    logger.info("\n--- Quiz Expert Evaluation Complete ---")
    for k, v in dimension_metrics.items():
        logger.info(f"{k.capitalize()}: {v['mean']} ± {v['std_dev']} (Median: {v['median']}, >=4.0: {v['pct_high_quality_ge_4']}%)")
    logger.info(f"Composite Mean: {overall_composite_mean} / 5.0")
    logger.info(f"Results saved to {csv_file} and {json_file}")

    return summary


if __name__ == "__main__":
    run_quiz_evaluation()
