"""
Empirical User Study & System Usability Scale (SUS) Analysis Harness.

Analyzes 15 undergraduate participant responses from evaluation/datasets/user_study_responses.csv.
Applies the standardized Brooke (1996) SUS scoring formula, computes Cronbach's alpha internal consistency,
confidence intervals, and qualitative AI rating averages.
Outputs calculated participant scores and summary metrics to results/.

Usage:
    cd Study
    python evaluation/scripts/analyze_user_study.py
"""

import sys
import csv
import json
import logging
from pathlib import Path
import numpy as np

project_root = Path(__file__).resolve().parent.parent.parent
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def calculate_cronbach_alpha(item_matrix: np.ndarray) -> float:
    """Calculate Cronbach's Alpha for internal consistency of scale items."""
    k = item_matrix.shape[1]
    if k <= 1:
        return 1.0
    item_variances = np.var(item_matrix, axis=0, ddof=1)
    total_score_variance = np.var(np.sum(item_matrix, axis=1), ddof=1)
    if total_score_variance == 0:
        return 1.0
    alpha = (k / (k - 1)) * (1.0 - (np.sum(item_variances) / total_score_variance))
    return float(alpha)


def run_user_study_analysis():
    datasets_dir = project_root / "evaluation" / "datasets"
    results_dir = project_root / "evaluation" / "results"
    results_dir.mkdir(parents=True, exist_ok=True)

    input_file = datasets_dir / "user_study_responses.csv"
    if not input_file.exists():
        logger.error(f"User study file {input_file} not found.")
        return {}

    with open(input_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    logger.info(f"Loaded {len(rows)} participant responses from {input_file}")

    sus_scores = []
    calculated_rows = []
    sus_item_matrix = []
    
    ai_ratings = {
        "q_ai1_citations_trust": [],
        "q_ai2_knowledge_map_clarity": [],
        "q_ai3_mistake_bank_value": [],
        "q_ai4_next_step_accuracy": []
    }

    for row in rows:
        pid = row["participant_id"]
        prog = row["program"]
        yr = row["year_of_study"]

        # Parse the 10 SUS items
        q = [int(row[f"q{i}_{suffix}"]) for i, suffix in [
            (1, "frequent_use"),
            (2, "complex"),
            (3, "easy_to_use"),
            (4, "tech_support_needed"),
            (5, "well_integrated"),
            (6, "inconsistency"),
            (7, "learn_quickly"),
            (8, "cumbersome"),
            (9, "confident"),
            (10, "learning_curve"),
        ]]
        # For internal consistency (Cronbach's alpha), reverse-code even items so all scale in same positive direction
        q_aligned = [q[i] if (i % 2 == 0) else (6 - q[i]) for i in range(10)]
        sus_item_matrix.append(q_aligned)

        # Standard SUS calculation:
        # Odd items (1, 3, 5, 7, 9): score contribution = response - 1
        # Even items (2, 4, 6, 8, 10): score contribution = 5 - response
        odd_sum = sum(q[i] - 1 for i in [0, 2, 4, 6, 8])
        even_sum = sum(5 - q[i] for i in [1, 3, 5, 7, 9])
        sus_score = 2.5 * (odd_sum + even_sum)
        sus_scores.append(sus_score)

        # Parse domain AI questions
        ai1 = float(row["q_ai1_citations_trust"])
        ai2 = float(row["q_ai2_knowledge_map_clarity"])
        ai3 = float(row["q_ai3_mistake_bank_value"])
        ai4 = float(row["q_ai4_next_step_accuracy"])
        
        ai_ratings["q_ai1_citations_trust"].append(ai1)
        ai_ratings["q_ai2_knowledge_map_clarity"].append(ai2)
        ai_ratings["q_ai3_mistake_bank_value"].append(ai3)
        ai_ratings["q_ai4_next_step_accuracy"].append(ai4)

        row_copy = dict(row)
        row_copy["calculated_sus_score"] = round(sus_score, 2)
        calculated_rows.append(row_copy)

    # Save calculated scores CSV
    csv_file = results_dir / "user_study_calculated_scores.csv"
    with open(csv_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(calculated_rows[0].keys()))
        writer.writeheader()
        writer.writerows(calculated_rows)

    # Compute descriptive stats
    n = len(sus_scores)
    mean_sus = float(np.mean(sus_scores))
    std_sus = float(np.std(sus_scores, ddof=1))
    sem_sus = std_sus / np.sqrt(n)
    ci95_low = mean_sus - 1.96 * sem_sus
    ci95_high = mean_sus + 1.96 * sem_sus

    # SUS Grade classification (Sauro & Lewis, 2016)
    if mean_sus >= 84.1:
        grade = "A+"
        percentile = "96-100th"
    elif mean_sus >= 80.3:
        grade = "A"
        percentile = "90-95th"
    elif mean_sus >= 74.1:
        grade = "B"
        percentile = "70-89th"
    elif mean_sus >= 68.0:
        grade = "C (Above Average)"
        percentile = "50-69th"
    else:
        grade = "D / F (Below Average)"
        percentile = "< 50th"

    cronbach = calculate_cronbach_alpha(np.array(sus_item_matrix))

    summary = {
        "study_name": "System Usability Scale (SUS) & Qualitative Empirical Study",
        "sample_size_participants": n,
        "sus_metrics": {
            "mean_sus_score": round(mean_sus, 2),
            "std_dev": round(std_sus, 2),
            "std_error_mean": round(sem_sus, 2),
            "ci_95_percent": [round(ci95_low, 2), round(ci95_high, 2)],
            "min_score": round(float(np.min(sus_scores)), 2),
            "max_score": round(float(np.max(sus_scores)), 2),
            "industry_benchmark_threshold": 68.0,
            "sus_grade": grade,
            "percentile_rank": percentile,
            "cronbach_alpha_reliability": round(cronbach, 3)
        },
        "qualitative_ai_ratings": {
            "Q-AI1_citations_trust": {
                "description": "The AI Study Tutor citations helped me trust answer accuracy",
                "mean": round(float(np.mean(ai_ratings["q_ai1_citations_trust"])), 2),
                "std": round(float(np.std(ai_ratings["q_ai1_citations_trust"])), 2)
            },
            "Q-AI2_knowledge_map_clarity": {
                "description": "Knowledge Map gave a clear understanding of weak topics",
                "mean": round(float(np.mean(ai_ratings["q_ai2_knowledge_map_clarity"])), 2),
                "std": round(float(np.std(ai_ratings["q_ai2_knowledge_map_clarity"])), 2)
            },
            "Q-AI3_mistake_bank_value": {
                "description": "Practicing errors in Mistake Notebook reinforced weak concepts",
                "mean": round(float(np.mean(ai_ratings["q_ai3_mistake_bank_value"])), 2),
                "std": round(float(np.std(ai_ratings["q_ai3_mistake_bank_value"])), 2)
            },
            "Q-AI4_next_step_accuracy": {
                "description": "Recommended next action (What should I study next?) was accurate",
                "mean": round(float(np.mean(ai_ratings["q_ai4_next_step_accuracy"])), 2),
                "std": round(float(np.std(ai_ratings["q_ai4_next_step_accuracy"])), 2)
            }
        }
    }

    json_file = results_dir / "user_study_summary.json"
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    logger.info("\n--- User Study Analysis Complete ---")
    logger.info(f"Mean SUS: {mean_sus:.2f} ± {std_sus:.2f} (Grade: {grade}, {percentile})")
    logger.info(f"95% CI: [{ci95_low:.2f}, {ci95_high:.2f}]")
    logger.info(f"Cronbach's Alpha: {cronbach:.3f}")
    logger.info(f"Results saved to {csv_file} and {json_file}")
    return summary


if __name__ == "__main__":
    run_user_study_analysis()
