# Academic Evaluation & Empirical AI Quality Verification

This document provides rigorous qualitative and quantitative evaluation data for the AI and adaptive components in the **Study AI** system.

> [!IMPORTANT]
> **Data Provenance & Replication:**
> All figures in this document are derived from automated benchmark scripts and human evaluation datasets located in the [`evaluation/`](../evaluation/) directory.
>
> - Raw results: [`evaluation/results/rag_evaluation_results.csv`](../evaluation/results/rag_evaluation_results.csv), [`evaluation/results/quiz_human_eval_50.csv`](../evaluation/results/quiz_human_eval_50.csv), [`evaluation/results/summarization_results.csv`](../evaluation/results/summarization_results.csv)
> - To replicate: `python evaluation/run_all_evaluations.py` (or `python evaluation/scripts/evaluate_rag.py`)

---

## 1. RAG (Retrieval-Augmented Generation) Evaluation

### Methodology

We evaluate RAG performance across two key dimensions:

1. **Retrieval Precision@3:** Does the semantic FAISS vector index return passages pertinent to the query (Cosine Similarity $\ge 0.50$ or keyword overlap $\ge 40\%$)?
2. **Answer Groundedness & Hallucination Rate:** Is the retrieved context factually faithful to the gold reference concept, mitigating fabricated extrapolations?

### Evaluation Dataset (30 Representative Test Queries across 7 CS Curricula)

Raw dataset: [`evaluation/datasets/rag_queries_30.json`](../evaluation/datasets/rag_queries_30.json)  
Raw results: [`evaluation/results/rag_evaluation_results.csv`](../evaluation/results/rag_evaluation_results.csv)

| Query ID | Domain     | Test Question                                                                               | Cosine Sim | Groundedness | Status   |
| :------- | :--------- | :------------------------------------------------------------------------------------------ | :--------- | :----------- | :------- |
| `Q-01`   | Networks   | "What is the purpose of subnetting an IPv4 network...?"                                     | `0.457`    | Grounded     | Relevant |
| `Q-02`   | Networks   | "Explain the 3-way TCP handshake process..."                                                | `0.428`    | Grounded     | Relevant |
| `Q-07`   | Algorithms | "What is the worst-case and average-case time complexity of QuickSort...?"                  | `0.461`    | Grounded     | Relevant |
| `Q-08`   | Algorithms | "How does Dijkstra algorithm find the shortest path in a weighted graph...?"                | `0.584`    | Grounded     | Relevant |
| `Q-14`   | OS         | "What is virtual memory and how does the Memory Management Unit MMU use page tables?"       | `0.518`    | Grounded     | Relevant |
| `Q-26`   | AI         | "Explain the difference between forward chaining and backward chaining in expert systems."  | `0.569`    | Grounded     | Relevant |
| `Q-27`   | AI         | "How does the A* search algorithm use heuristics f(n) = g(n) + h(n) to find optimal paths?" | `0.791`    | Grounded     | Relevant |
| `Q-28`   | AI         | "What is the difference between Supervised, Unsupervised, and Reinforcement Learning?"      | `0.387`    | Grounded     | Relevant |

### Empirical RAG Metrics Summary ($N = 30$)

Summary JSON: [`evaluation/results/rag_metrics_summary.json`](../evaluation/results/rag_metrics_summary.json)

- **Overall Retrieval Precision@3:** `36.7%` (11/30 hits across full computer science test suite on local syllabus index)
- **Answer Groundedness Rate:** `50.0%` (15/30 queries aligned with reference academic definitions)
- **Mean Query-Context Cosine Similarity:** `0.454 ± 0.113` (Min: `0.269`, Max: `0.791`)

### Domain-Level Breakdown & Observed Failure Modes

| Domain                           | Queries | Hits | Precision@3 | Mean Cosine Sim | Notes & Analysis                                                                             |
| :------------------------------- | :------ | :--- | :---------- | :-------------- | :------------------------------------------------------------------------------------------- |
| **Artificial Intelligence**      | 3       | 3    | **100.0%**  | `0.582`         | High precision due to comprehensive indexed lecture slides (`AI Lecture 1–5.pdf`).           |
| **Database Systems**             | 4       | 2    | **50.0%**   | `0.566`         | Strong hits on transactions & ACID; misses on niche WAL storage internals.                   |
| **Algorithms & Data Structures** | 6       | 2    | **33.3%**   | `0.420`         | Graph algorithms retrieved well; specialized trees (AVL rotations) lacked dense coverage.    |
| **Computer Networks**            | 6       | 2    | **33.3%**   | `0.379`         | Moderate retrieval on TCP/Subnetting; low relevance on higher-layer protocols.               |
| **Operating Systems**            | 6       | 1    | **16.7%**   | `0.465`         | Chunks retrieved general scheduling concepts; missed specific Coffman conditions.            |
| **Compilers**                    | 3       | 1    | **33.3%**   | `0.368`         | Partial hits on lexing/parsing; SSA optimizations unindexed.                                 |
| **Computer Architecture**        | 2       | 0    | **0.0%**    | `0.462`         | Complete miss due to absence of hardware architecture lecture notes in current vector store. |

> [!NOTE]
> **Defensible Academic Takeaways & Groundedness Analysis:**
>
> 1. **Coverage Bounds:** Semantic vector retrieval is strictly bounded by corpus ingestion coverage. In domains with dedicated lecture notes (e.g., Artificial Intelligence), retrieval achieves 100% precision. Unindexed domains (e.g., Computer Architecture) degrade to zero, demonstrating why multi-provider generative fallback and user document uploads are critical architectural requirements.
> 2. **50% Groundedness Rate (Primary Negative Result):** Half of answers across the $N=30$ suite were not factually anchored in the retrieved context despite citations being rendered. This establishes a clear **perceived-trust vs. actual-groundedness gap**: users attribute high authority to formatted citations even when retrieval fails to ground the model. The concrete design implication is that the system must visibly surface retrieval confidence scores and explicitly tag template-fallback outputs (`is_fallback: true`) rather than silently synthesizing unverified text.

### Architectural Limitations & Multi-Tenant Scalability Analysis

The current retrieval layer in [`ml_backend/models/rag_pipeline.py`](../ml_backend/models/rag_pipeline.py) operates as a single-node in-memory FAISS index (`IndexFlatL2` wrapped in `IndexIDMap`) persisted locally to `vector_store/index.faiss` and `vector_store/docs.json`. All users' chunks reside in one shared vector space, with access control enforced via a post-retrieval Python filter.

This architecture introduces three major production and theoretical limitations:

1. **Failure to Survive Horizontal Scaling:**
   - With multiple container replicas or worker instances behind a load balancer (e.g., 2+ FastAPI workers or multi-region pods), each instance maintains an isolated in-memory index.
   - Document uploads and deletions processed by Instance A never replicate to Instance B, resulting in divergent index states and inconsistent retrieval results depending on ingress request routing.

2. **Vulnerability to Ephemeral Container Disks:**
   - Standard cloud container environments (Render, Fly.io, Google Cloud Run) operate on ephemeral root filesystems.
   - On container redeployment, crash recovery, or scale-to-zero cold starts, local disk state in `vector_store/` is destroyed unless backed by persistent block storage volumes (which themselves reintroduce single-node lock bottlenecks and fail-over complexity).

3. **Recall Degradation via Candidate Crowding:**
   - **Theoretical Mechanism:** When nearest-neighbor candidates are retrieved globally ($k = \text{top\_k} \times 5$) prior to access-control filtering, a single user's high-density private corpus can monopolize all $k$ candidate slots in vector space. As a consequence, valid global or private chunks belonging to another user are crowded out of the candidate set before Python access control is evaluated, resulting in 0 chunks returned (total recall collapse).
   - **Empirical Analysis of the 36.67% Precision@3 Figure:**
     - In the automated evaluation benchmark ($N=30$, 11 hits), the 22,618 test chunks in `vector_store/docs.json` were uniformly attributed to `default_user`. Cross-user ACL crowding was therefore not the active driver of the 36.67% score on this specific dataset; rather, syllabus ingestion asymmetry (100% in AI vs. 0% in unindexed Computer Architecture) and fixed $k=3$ candidate windowing explain the static score.
     - However, empirical multi-tenant isolation testing confirmed the crowding hazard: adding 25 related private chunks for User A completely suppressed retrieval for User B's 2 private chunks under standard post-filtering.
   - **Interim Code Mitigation:**
     - [`ml_backend/models/rag_pipeline.py`](../ml_backend/models/rag_pipeline.py) was enhanced to execute native FAISS ID-prefiltering via `faiss.SearchParameters(sel=faiss.IDSelectorBatch(...))`. By restricting FAISS traversal strictly to candidate IDs authorized for the requesting user (`scope="global"` or `user_id=requesting_user`), cross-user candidate crowding is eliminated directly during search traversal.

4. **Post-Deadline Production Fix (Managed Vector Store):**
   - **Target Architecture:** Transition from local FAISS to a managed clustered vector database supporting native metadata pre-filtering (e.g., **Qdrant**, **Pinecone**, or **PostgreSQL with pgvector**).
   - **Native Filter Execution:** Queries apply access control rules directly at the indexing layer (`FILTER (scope == "global" OR (scope == "private" AND user_id == :uid))`), guaranteeing horizontal scaling across stateless API replicas, durability across container lifecycles, and sub-millisecond pre-filtered search with full recall preservation.

---

## 2. Quiz Generation Quality Evaluation

> [!NOTE]
> **Evaluation Methodology & Evaluator Provenance:**
> Ratings were conducted via a systematic rubric audit across $N = 50$ generated multiple-choice questions by a single internal domain expert / course author ($n=1$). Because ratings were performed by a single evaluator, inter-rater reliability metrics (such as Cohen's $\kappa$ or Fleiss' $\kappa$) are intentionally omitted. Results are presented as empirical descriptive distributions ($\mu$, $\sigma$, median, and percentage of questions scoring $\ge 4/5$).

Evaluated across $N = 50$ generated multiple-choice questions spanning 7 CS curriculum areas (Bloom taxonomy levels: _Remember_, _Understand_, _Apply_, _Analyze_) on a standard 1–5 Likert rubric (where 5 = Excellent).

Raw dataset: [`evaluation/datasets/quiz_samples_50.json`](../evaluation/datasets/quiz_samples_50.json)  
Expert evaluation dataset: [`evaluation/datasets/quiz_expert_eval_50.csv`](../evaluation/datasets/quiz_expert_eval_50.csv)  
Raw results CSV: [`evaluation/results/quiz_human_eval_50.csv`](../evaluation/results/quiz_human_eval_50.csv)  
Summary JSON: [`evaluation/results/quiz_evaluation_summary.json`](../evaluation/results/quiz_evaluation_summary.json)

| Metric                         | Definition                                                                             | Mean Score ($\mu \pm \sigma$) | Median | % High Quality ($\ge 4/5$) |
| :----------------------------- | :------------------------------------------------------------------------------------- | :---------------------------- | :----- | :------------------------- |
| **Relevance**                  | Question directly tests core concepts from the course syllabus                         | **`5.00 ± 0.00`**             | `5.0`  | `100.0%`                   |
| **Clarity**                    | Prompt and options are unambiguous, precise, and grammatically sound                   | **`4.86 ± 0.35`**             | `5.0`  | `100.0%`                   |
| **Correctness**                | Designated answer option and accompanying explanation are objectively true             | **`5.00 ± 0.00`**             | `5.0`  | `100.0%`                   |
| **Distractor Plausibility**    | Incorrect options represent realistic misconceptions rather than trivial non-sequiturs | **`4.14 ± 0.40`**             | `4.0`  | `98.0%`                    |
| **Difficulty Appropriateness** | Cognitive complexity aligns with stated Bloom taxonomy level                           | **`3.56 ± 0.67`**             | `4.0`  | `54.0%`                    |
| **Overall Composite Mean**     | Global average across all 5 dimensions ($N=50$)                                        | **`4.51 / 5.0`**              | `4.5`  | `92.0%`                    |

### Bloom Taxonomy Level Breakdown

| Bloom Level    | Item Count ($N$) | Composite Score ($\mu \pm \sigma$) | Qualitative Characteristic                                                                           |
| :------------- | :--------------- | :--------------------------------- | :--------------------------------------------------------------------------------------------------- |
| **Analyze**    | 14               | **`4.69 ± 0.16`**                  | High discriminative power; tests architectural trade-offs (e.g., B+ Trees vs BST, Belady's anomaly). |
| **Apply**      | 7                | **`4.51 ± 0.15`**                  | Strong algorithmic mechanics (e.g., subnet broadcast calculation, heap indexing).                    |
| **Understand** | 24               | **`4.46 ± 0.11`**                  | Core conceptual definitions; solid distractor plausibility.                                          |
| **Remember**   | 5                | **`4.28 ± 0.16`**                  | Direct factual retrieval; slightly lower difficulty challenge.                                       |

> [!WARNING]
> **Methodological Limitations:**
>
> 1. **Single-Rater Subjectivity:** An internal author evaluation ($n=1$) provides valuable qualitative sanity-checking but cannot guarantee cross-evaluator reliability.
> 2. **Ceiling Effects:** Relevance and correctness achieve ceiling scores because generation templates are tightly constrained to verified syllabus topics, whereas difficulty appropriateness demonstrates higher variance ($\sigma = 0.67$) indicating that automated generation occasionally produces simpler recall questions for higher-order topics.

---

## 3. Summarization Model Evaluation

> [!NOTE]
> **Model Provenance, Evaluation Baseline & Sample Size Scope:**
> Summarization benchmarks evaluate the `FLAN-T5-base` architecture across $N = 8$ academic lecture note excerpts against reference gold summaries. This represents an exploratory **pilot benchmark**, not a high-powered statistical evaluation. Confidence intervals for ROUGE scores at $N = 8$ are inherently wide ($\pm 14.64$ on ROUGE-1); results demonstrate the automated evaluation harness is functional and produces valid metrics, but cannot support fine-grained model ranking. In out-of-the-box mode, the runtime serves `google/flan-t5-base` with length and brevity constraints. When deployed with domain checkpoints trained via [`fine_tuning/01_summarizer_finetune.py`](../ml_backend/fine_tuning/01_summarizer_finetune.py) on SciTLDR, lexical overlap with scientific summaries increases.

Raw dataset: [`evaluation/datasets/summarization_eval_data.json`](../evaluation/datasets/summarization_eval_data.json)  
Raw results: [`evaluation/results/summarization_results.csv`](../evaluation/results/summarization_results.csv)  
Summary JSON: [`evaluation/results/summarization_metrics_summary.json`](../evaluation/results/summarization_metrics_summary.json)

| Metric                  | Score ($\mu \pm \sigma$) | Interpretation                                                    |
| :---------------------- | :----------------------- | :---------------------------------------------------------------- |
| **ROUGE-1**             | **`26.44 ± 14.64`**      | Unigram lexical overlap against gold academic summaries           |
| **ROUGE-2**             | **`5.57 ± 6.71`**        | Bigram phrase structure preservation                              |
| **ROUGE-L**             | **`20.87 ± 10.26`**      | Longest common subsequence retention                              |
| **Flesch Reading Ease** | **`47.22 ± 25.98`**      | Accessible undergraduate / academic prose level                   |
| **Compression Ratio**   | **`75.15% ± 7.57%`**     | Character reduction without discarding core technical terminology |
| **Mean Latency**        | **`3.11s ± 2.55s`**      | CPU wall-clock inference time per lecture passage                 |

---

## 4. Adaptive Learning & Spaced Repetition Efficacy

Empirical validation of the FSRS-4.5 scheduling engine and graph prerequisite traversals:

- **Root Concept Prioritization:** `100%` accuracy in prioritizing topics with 0 unsatisfied prerequisites during cold start.
- **Urgent Review Escalation:** `100%` of flashcards with memory retrievability $R < 0.90$ correctly flagged at Priority Level 1 (`review`).
- **Weak Area Detection Threshold:** Correctly identified concept nodes with $< 50\%$ active recall accuracy at Priority Level 3 (`practice_weak`).
