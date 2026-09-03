"""
Master Academic Evaluation & Benchmarking Suite Runner.

Executes all 5 empirical evaluation harnesses sequentially, generating raw CSV and JSON artifacts
in evaluation/results/ with zero hardcoded target assertions.

Usage:
    cd Study
    python evaluation/run_all_evaluations.py
"""

import sys
import logging
from pathlib import Path

# Force UTF-8 stdout if possible on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ["utf-8", "utf8"]:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

# Add project root and ml_backend to path
project_root = Path(__file__).resolve().parent.parent
ml_backend_dir = project_root / "ml_backend"
evaluation_dir = project_root / "evaluation"

for p in [str(project_root), str(ml_backend_dir), str(evaluation_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def main():
    print("=" * 80)
    print("STUDY AI: MASTER ACADEMIC EVALUATION & BENCHMARK SUITE")
    print("=" * 80)
    print("Running empirical benchmarks live against local models, FAISS vector store, and data...")
    print("-" * 80)

    from scripts.evaluate_rag import run_rag_evaluation
    from scripts.evaluate_summarization import run_summarization_evaluation
    from scripts.evaluate_quiz_rubric import run_quiz_evaluation
    from scripts.run_latency_benchmarks import run_latency_benchmarks
    from scripts.analyze_user_study import run_user_study_analysis

    results = {}

    # 1. RAG Vector Store Evaluation
    print("\n[1/5] Executing RAG Retrieval & Groundedness Evaluation...")
    results["rag"] = run_rag_evaluation()

    # 2. Summarization Evaluation
    print("\n[2/5] Executing Summarization & Readability Evaluation...")
    results["summarization"] = run_summarization_evaluation()

    # 3. Quiz Rubric Evaluation
    print("\n[3/5] Executing Quiz Human Rubric & Reliability Evaluation...")
    results["quiz"] = run_quiz_evaluation()

    # 4. Latency Benchmarks
    print("\n[4/5] Executing Latency & Performance Benchmarks (10 iterations)...")
    results["latency"] = run_latency_benchmarks(num_runs=10)

    # 5. User Study Analysis
    print("\n[5/5] Executing Empirical User Study & SUS Analysis...")
    results["user_study"] = run_user_study_analysis()

    # Summary Report
    print("\n" + "=" * 80)
    print("EVALUATION SUMMARY DASHBOARD (Empirical Results)")
    print("=" * 80)

    if results.get("rag"):
        rag_m = results["rag"]["metrics"]
        print(f"* RAG Retrieval Precision@3:    {rag_m['retrieval_precision_at_3_percent']:.1f}% ({rag_m['hits_count']}/{rag_m['total_count']} hits)")
        print(f"* Answer Groundedness Rate:      {rag_m['answer_groundedness_rate_percent']:.1f}%")
        print(f"* Mean Query Cosine Sim:         {rag_m['mean_query_context_cosine_sim']:.4f} +/- {rag_m['std_query_context_cosine_sim']:.4f}")

    if results.get("summarization"):
        sum_m = results["summarization"]["metrics"]
        print(f"* Summarizer ROUGE-1 / 2 / L:    {sum_m['mean_rouge_1']:.1f} / {sum_m['mean_rouge_2']:.1f} / {sum_m['mean_rouge_l']:.1f}")
        print(f"* Flesch Reading Ease:           {sum_m['mean_flesch_reading_ease']:.1f} (Plain Academic English)")
        print(f"* Compression Ratio:             {sum_m['mean_compression_ratio_percent']:.1f}%")

    if results.get("quiz"):
        quiz_m = results["quiz"]
        print(f"* Quiz Expert Rubric Mean:       {quiz_m['overall_composite_mean']:.2f} / 5.0 (n=1 Domain Expert, N={quiz_m['sample_size']})")
        dim_m = quiz_m["dimension_metrics"]
        print(f"   - Relevance:     {dim_m['relevance']['mean']:.2f} +/- {dim_m['relevance']['std_dev']:.2f} (>=4.0: {dim_m['relevance']['pct_high_quality_ge_4']}%)")
        print(f"   - Clarity:       {dim_m['clarity']['mean']:.2f} +/- {dim_m['clarity']['std_dev']:.2f} (>=4.0: {dim_m['clarity']['pct_high_quality_ge_4']}%)")
        print(f"   - Correctness:   {dim_m['correctness']['mean']:.2f} +/- {dim_m['correctness']['std_dev']:.2f} (>=4.0: {dim_m['correctness']['pct_high_quality_ge_4']}%)")
        print(f"   - Distractors:   {dim_m['distractor_plausibility']['mean']:.2f} +/- {dim_m['distractor_plausibility']['std_dev']:.2f} (>=4.0: {dim_m['distractor_plausibility']['pct_high_quality_ge_4']}%)")
        print(f"   - Difficulty:    {dim_m['difficulty_appropriateness']['mean']:.2f} +/- {dim_m['difficulty_appropriateness']['std_dev']:.2f} (>=4.0: {dim_m['difficulty_appropriateness']['pct_high_quality_ge_4']}%)")

    if results.get("user_study"):
        sus_m = results["user_study"]["sus_metrics"]
        print(f"* Mean SUS Usability Score:      {sus_m['mean_sus_score']:.1f} / 100.0 ({sus_m['sus_grade']}, {sus_m['percentile_rank']})")
        print(f"* 95% Confidence Interval:       [{sus_m['ci_95_percent'][0]}, {sus_m['ci_95_percent'][1]}]")
        print(f"* Scale Reliability (Alpha):     {sus_m['cronbach_alpha_reliability']:.3f}")

    print("-" * 80)
    print(f"All raw CSVs and summary JSONs saved in: {project_root / 'evaluation' / 'results'}")
    print("=" * 80)


if __name__ == "__main__":
    main()
