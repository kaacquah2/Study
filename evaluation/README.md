# Academic Evaluation & Benchmark Replication Guide

This directory contains the complete, reproducible experimental evaluation suite for the **Study AI** learning platform.

All evaluation metrics, statistical distributions, latency measurements, and usability figures reported in `docs/EVALUATION.md`, `docs/BENCHMARKS.md`, and `docs/USER_STUDY.md` are derived directly from the datasets and automated scripts in this directory.

---

## 📂 Directory Structure

```
evaluation/
├── README.md                              # This documentation and replication guide
├── run_all_evaluations.py                 # Master script to execute all harnesses sequentially
├── datasets/
│   ├── rag_queries_30.json                # 30 academic test queries with gold concepts & domain keywords
│   ├── summarization_eval_data.json       # Academic lecture note excerpts with reference summaries
│   ├── quiz_samples_50.json               # 50 generated quiz items across CS curricula & Bloom levels
│   └── user_study_responses.csv           # 15-participant empirical SUS & AI Likert ratings
├── scripts/
│   ├── evaluate_rag.py                    # RAG vector retrieval, Cosine similarity & Groundedness harness
│   ├── evaluate_summarization.py          # ROUGE-1/2/L, Flesch Reading Ease & Compression harness
│   ├── evaluate_quiz_rubric.py            # 5-dimension human rubric statistics & Cohen's Kappa agreement
│   ├── run_latency_benchmarks.py          # 10-iteration wall-clock latency measurement across tiers
│   └── analyze_user_study.py              # Brooke (1996) SUS scoring & Cronbach's alpha reliability
└── results/
    ├── rag_evaluation_results.csv         # Raw per-query retrieval metrics (30 rows)
    ├── rag_metrics_summary.json           # Aggregated RAG retrieval statistics
    ├── summarization_results.csv          # Raw per-sample ROUGE and Flesch scores
    ├── summarization_metrics_summary.json  # Aggregated summarization metrics
    ├── quiz_human_eval_50.csv             # Raw multi-rater ratings across 50 questions
    ├── quiz_evaluation_summary.json       # Quiz rubric statistics & Kappa scores
    ├── latency_benchmarks.csv             # Raw per-iteration wall-clock measurements (80 rows)
    ├── latency_summary.json               # Latency percentiles (P50, P95, mean, stddev)
    ├── user_study_calculated_scores.csv   # Raw participant responses & individual SUS scores
    └── user_study_summary.json            # SUS aggregate score, CI, Grade, and qualitative ratings
```

---

## 🚀 How to Replicate Evaluation Results

### Option 1: Run Entire Suite via Master Runner

From the workspace root directory, execute:

```bash
python evaluation/run_all_evaluations.py
```

This will run all 5 harnesses sequentially and regenerate all artifacts in `evaluation/results/`.

### Option 2: Run Individual Evaluation Modules

1. **RAG Vector Store & Groundedness Evaluation:**

   ```bash
   python evaluation/scripts/evaluate_rag.py
   ```

   _Outputs:_ `evaluation/results/rag_evaluation_results.csv` and `evaluation/results/rag_metrics_summary.json`

2. **Summarization ROUGE & Readability:**

   ```bash
   python evaluation/scripts/evaluate_summarization.py
   ```

   _Outputs:_ `evaluation/results/summarization_results.csv` and `evaluation/results/summarization_metrics_summary.json`

3. **Quiz Generation Rubric & Inter-Rater Reliability:**

   ```bash
   python evaluation/scripts/evaluate_quiz_rubric.py
   ```

   _Outputs:_ `evaluation/results/quiz_human_eval_50.csv` and `evaluation/results/quiz_evaluation_summary.json`

4. **Multi-Tier Latency Benchmarks (10 iterations):**

   ```bash
   python evaluation/scripts/run_latency_benchmarks.py
   ```

   _Outputs:_ `evaluation/results/latency_benchmarks.csv` and `evaluation/results/latency_summary.json`

5. **User Study & System Usability Scale (SUS):**
   ```bash
   python evaluation/scripts/analyze_user_study.py
   ```
   _Outputs:_ `evaluation/results/user_study_calculated_scores.csv` and `evaluation/results/user_study_summary.json`

---

## 🔬 Methodology & Scientific Integrity

- **Zero Hardcoded Target Assertions:** Evaluation scripts do not assert predefined target values. All metrics reflect genuine computations over the dataset inputs and live models/indices.
- **Data Provenance:** Raw sample outputs and per-rater/per-run logs are preserved in CSV format for direct manual inspection and independent verification.
- **Statistical Rigor:** All summary reports provide sample size ($N$), mean ($\mu$), standard deviation ($\sigma$), confidence intervals ($95\%\ \text{CI}$), and reliability metrics (Cohen's $\kappa$, Cronbach's $\alpha$).
