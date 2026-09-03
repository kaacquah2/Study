# Project Limitations, Evaluation Methodology & Future Work

This document provides a transparent, academic assessment of the AI Study Buddy platform prepared for the Final Year Project review at Kwame Nkrumah University of Science & Technology (KNUST).

---

## ⚠️ Known Limitations

### 1. Multi-Provider Fallback & Response Latency Variance

- While the multi-provider failover chain (Google Gemini $\rightarrow$ Ollama $\rightarrow$ Python FastAPI ML Backend) ensures high system availability, switching between providers introduces latency variance:
  - **Google Gemini 2.5 Flash API**: $\approx 1.2s - 2.5s$ completion time (Cloud TPU-accelerated inference).
  - **Local Ollama LLM (`llama3.2`)**: $\approx 4.0s - 9.0s$ completion time (dependent on host GPU/CPU hardware).
  - **Self-Hosted ML Backend (`ml_backend`)**: $\approx 2.8s - 4.5s$ for summarization/paraphrasing (`FLAN-T5-base`), $\approx 8.5s - 23.0s$ for multi-token lesson/outline generation (`FLAN-T5-large` on CPU), and $\approx 35\text{ms}$ for FAISS dense semantic retrieval.
- _Mitigation in Production_: Skeletal loading states and asynchronous module generation queues (`generationQueue.ts`) render UI containers immediately while background jobs populate content.

> **Known Total-Latency Budget Gap:** The per-tier latency figures above describe individual tiers in isolation. In a worst-case full-chain scenario where Gemini times out, falls over to Ollama which also times out, and falls through to the ML backend for a long-form generation task, the total accumulated latency can reach 30–40 seconds. No hard end-to-end SLA is defined for the full fallback chain. This is a known architectural gap in the current serverless deployment target; a circuit-breaker with an explicit wall-clock budget cap is listed as a post-deadline architectural improvement.

### 2. FAISS Vector Store Single-Node File Persistence, Multi-Tenancy & Candidate Crowding

- The local Python FastAPI microservice currently employs a single-node in-memory/file-system **FAISS IndexFlatL2** index (`ml_backend/vector_store/index.faiss`) paired with a JSON metadata dictionary (`vector_store/docs.json`).
- While performant for single-instance workloads, this architecture exhibits three structural limitations:
  1. **Horizontal Scaling Divergence:** Because indexes are stored on the local filesystem and loaded into per-process memory, multiple backend replicas (e.g., in a multi-pod Kubernetes or clustered FastAPI deployment) maintain divergent indexes; uploads to replica $A$ are invisible to queries hitting replica $B$.
  2. **Vulnerability to Ephemeral Container Disks:** Modern serverless container platforms (Render, Fly.io, Cloud Run) discard local root filesystems across redeployments, scale-to-zero periods, and restarts. Without external volume mounts, dynamic document indexes are wiped on container restart.
  3. **Recall Degradation via Candidate Crowding:** When nearest-neighbor candidate chunks are retrieved globally ($k = \text{top\_k} \times 5$) before user access-control filtering is evaluated in Python, high-density private corpora from one user can crowd out relevant chunks from another user or push out global reference documents before post-retrieval filtering runs (empirically confirmed in isolation tests where 25 private chunks suppressed retrieval for another user).
- _Interim Code Mitigation_: Implemented native pre-filtering via `faiss.SearchParameters(sel=faiss.IDSelectorBatch(...))` in [`ml_backend/models/rag_pipeline.py`](../ml_backend/models/rag_pipeline.py) so that FAISS traversal is bounded strictly to authorized chunk IDs.
- _Post-Deadline Architectural Fix_: Migration to a managed vector store with native metadata pre-filtering and distributed persistence (e.g., **Qdrant**, **Pinecone**, or **PostgreSQL with pgvector**), executing ACL filters (`WHERE scope = 'global' OR (scope = 'private' AND user_id = :uid)`) at the index level.

### 3. Client-Side Quiz Grading (Assessment Integrity Gap)

The current quiz grading is performed entirely on the client. The correct answer index (`correctIndex`) is embedded in the questions payload delivered to the browser; a student inspecting the network response or browser memory can determine correct answers before answering.

**Why this architecture was chosen:** Grading entirely on the client eliminates a round-trip per answer, keeping the quiz interaction latency-free. For a formative, self-study context this trade-off is acceptable.

**Why it is wrong for an assessment context:** In any setting where quiz scores contribute to grades, placement, or certification, client-side grading is an assessment-integrity violation. The answer key is publicly accessible to any user with browser DevTools.

**Planned Server-Side Grading Architecture:** A dedicated `/api/quiz/grade` endpoint holds the answer key server-side, keyed by a one-time session token issued when the quiz begins. The client submits `{ questionId, selectedIndex }` per answer; the server responds with `{ correct: boolean, explanation: string }`. The correct index is never transmitted to the client. This architecture is the correct design for an assessment context and is listed as planned post-deadline work.

### 4. Client Timezone Header Validation

- Daily study streaks are calculated authoritatively on the server using the client's `X-Client-Timezone` header.
- While this guarantees accurate date boundaries across different global timezones, a malicious client could theoretically manipulate the HTTP header to alter streak date calculations.
- _Proposed Sanity Check_: Cross-referencing client timezone headers against IP-based geolocation lookups and enforcing a maximum allowed timezone change frequency per 24-hour window.

### 5. Serverless Instance Cache Consistency

- Upstash Redis REST API (`redis.ts`) acts as a centralized serverless caching and rate-limiting layer.
- If a serverless function instance temporarily loses connectivity to Redis, it gracefully degrades to local in-memory sliding-window rate limiting (`rateLimiter.ts`). During this degraded window, rate limits are enforced locally per container instance rather than globally across all instances.

### 6. Lexical Heuristic Domain Routing vs. Semantic Classification

- The domain classifier (`domainClassifier.ts`) utilizes a synchronous **token-Jaccard lexical overlap heuristic** against a curated 10-topic Computer Science taxonomy rather than a trained neural/embedding classifier.
- _Trade-off_: While this guarantees zero cold-start routing latency and avoids redundant API/inference overhead before request dispatch, the output "confidence" score reflects literal token intersection rather than semantic model confidence.
- _Failure Modes_: Advanced or synonym-heavy phrasings of CS concepts (e.g., _"Distributed consensus via Raft and Paxos"_) may exhibit low lexical overlap with taxonomy strings and safely default to general cloud LLMs (Google Gemini) rather than local specialized models.
- _Production Roadmap_: Future iterations will evaluate replacing or augmenting this pre-filter with a fast embedding cosine-similarity bi-encoder (`Sentence-Transformers`) or ONNX zero-shot classifier in `ml_backend`.

---

## 📊 Fine-Tuning & Evaluation Methodology

To validate the platform's AI course generation, custom model performance, and spaced repetition scheduling, a domain-specific evaluation and fine-tuning pipeline was constructed:

### 1. Custom Model Fine-Tuning Datasets

Domain-adapted HuggingFace models (`FLAN-T5-base`, `FLAN-T5-large`) were trained on curated academic datasets located in `ml_backend/fine_tuning/data/`:

- **Summarization Dataset (`summarization.jsonl`)**: 311 structured academic input/summary training pairs for chunk-level document compression.
- **Paraphrasing Dataset (`paraphrasing.jsonl`)**: 315 domain-specific question/explanation rephrasing pairs across academic, simple, and formal study styles.
- **Course Outlines Dataset (`outlines.jsonl`)**: 45 course structure specifications for multi-module syllabus planning.
- **Lesson Content Dataset (`lessons.jsonl`)**: 28 in-depth lesson module pairs structured for pedagogical hierarchy.

> **Important Methodological Caveat — Format Adaptation, Not Knowledge Injection:** These dataset sizes (28–315 examples per task) are sufficient for seq2seq format/style adaptation: the fine-tuning teaches the model to produce lesson-shaped, outline-shaped, or summary-shaped output more consistently. They do not inject domain knowledge. A model fine-tuned on 28 lesson pairs learns to format lessons correctly; domain knowledge comes from the pre-training corpus (C4, academic web text). This distinction is important when evaluating claims about model capability: the fine-tuned models are better at output formatting than the base models, not better at CS knowledge. Examiners should expect this framing rather than claims of domain expertise.

### 2. Empirical Evaluation Suite & Reproducibility Artifacts

Model and system evaluations are automated via the [`evaluation/`](../evaluation/) suite:

- **Empirical RAG Vector Store Evaluation**: Evaluated across 30 academic queries with live FAISS cosine similarity scoring and groundedness checking ([`evaluation/results/rag_evaluation_results.csv`](../evaluation/results/rag_evaluation_results.csv)). Demonstrates 100% precision on indexed topics (e.g. Artificial Intelligence) and transparently documents domain bounds on unindexed curricula.
- **Quiz Generation Quality Rubric**: 50 MCQs evaluated across 5 pedagogical dimensions via expert rubric audit ($n=1$ internal domain expert / course author) ([`evaluation/results/quiz_human_eval_50.csv`](../evaluation/results/quiz_human_eval_50.csv)), achieving a composite score of `4.51 / 5.0`. _Methodological limitation: Because ratings were performed by a single evaluator ($n=1$), inter-rater reliability metrics (such as Cohen's $\kappa$) are not established and are deliberately omitted._
- **Summarization ROUGE & Readability**: Automated scoring on academic text excerpts yielding ROUGE-1 (`37.89 ± 15.05`), ROUGE-2 (`12.96 ± 11.66`), ROUGE-L (`31.68 ± 12.89`), Flesch Reading Ease (`35.70`), and 57.25% compression ([`evaluation/results/summarization_results.csv`](../evaluation/results/summarization_results.csv)). Evaluation harness enforces strict error handling: inference failures raise loud exceptions rather than substituting gold standard summaries.

  > **Summarization Evaluation Scope:** The evaluation is conducted on $N = 8$ academic lecture note excerpts. This constitutes a pilot study, not a statistically meaningful evaluation. ROUGE score confidence intervals at $N = 8$ are too wide to draw reliable conclusions about model ranking or generalisation. The figures are reported to demonstrate that the evaluation pipeline functions and produces plausible outputs; they should not be interpreted as definitive model performance benchmarks. A rigorous evaluation would require at least 50 samples with independent human reference summaries.

- **Multi-Tier Latency Benchmarks**: End-to-end wall-clock measurements and architectural latency modelling across Cloud (Gemini Flash), Local CPU (`ml_backend`), and Cache tiers ([`evaluation/results/latency_benchmarks.csv`](../evaluation/results/latency_benchmarks.csv)). Highlights that local CPU inference takes 8–40 seconds (15–20 tok/sec on 780M–1.1B models), providing empirical justification for prioritizing Google Gemini Cloud inference and utilizing local inference strictly as an offline failover tier.
- **User Usability Study (SUS)**: 15-participant empirical study yielding a mean SUS of `84.50 ± 12.72` (Grade A+, Cronbach's $\alpha = 0.946$) ([`evaluation/results/user_study_calculated_scores.csv`](../evaluation/results/user_study_calculated_scores.csv)).

  > **User Study Scope & Generalisation Limits:** The study recruited $n = 15$ participants from a single department (Computer Science, KNUST) using a convenience sample (peers and classmates). The SUS score of 84.50 is reported at face value; the study design does not support percentile-ranking claims against the broader student population. Cronbach's $\alpha = 0.946$ confirms internal consistency of the SUS instrument across this sample, not the external validity of the score. Generalisation to other departments, institutions, or non-CS students would require replication with stratified random sampling.

- **Replication**: All evaluation artifacts can be reproduced with a single command: `python evaluation/run_all_evaluations.py`.

### 3. RAG Groundedness: Primary Negative Result & Design Implication

The **50% answer groundedness rate** across $N = 30$ test queries is the most important evaluation finding in this project, and it warrants direct treatment rather than only appearing as a table entry.

**What the result means:** Half of generated answers were not directly grounded in the retrieved context, despite citations being present. This reveals a perceived-trust vs. actual-groundedness gap: the system presents source citations in a format that reads as authoritative, even when the retrieved chunks do not fully support the generated answer. Users may attribute higher reliability to answers than the underlying retrieval quality warrants.

**Why this happens:** The multi-provider generative fallback means some answers are produced by Gemini using its pre-training knowledge, with retrieved chunks providing partial or stylistic grounding rather than factual grounding. The `is_fallback` signal exists in the backend response but is not surfaced in the UI.

**Design implication:** The correct response to this finding is not to suppress it but to make it visible:

1. Display retrieval confidence per answer, not just citation presence.
2. Visibly distinguish answers produced on the template-fallback path (`is_fallback: true`) with an "Unverified — no source material available" label.
3. Display which provider generated the answer (Gemini / Ollama / ML Backend), giving users the information to calibrate their trust appropriately.

This converts the project's weakest evaluation result into a defensible, principled design decision.

### 4. Spaced Repetition Memory Recall Efficiency

- **Algorithm Comparison**: SuperMemo 2 (SM-2) vs Free Spaced Repetition Scheduler (FSRS-4.5).
- **Scheduler Validation**: Unit testing verifies optimal review interval expansion across initial learning, review, and lapse states.

---

## 🔮 Future Work & Roadmap

1. **Active Circuit-Breaker Integration**: Elevating provider health monitoring (`providerStats.ts`) to full circuit-breaker state machines (Closed $\rightarrow$ Open $\rightarrow$ Half-Open) with automated recovery probes, and introducing an explicit total-latency budget cap for the full fallback chain.
2. **Cloud Vector Database Scaling**: Replacing FAISS local indices with Google Cloud Vertex AI Vector Search or BigQuery Vector Search for enterprise scalability.
3. **Server-Side Quiz Grading**: Implementing `/api/quiz/grade` with a server-held answer key and one-time session tokens to eliminate the client-side correctIndex exposure (assessment integrity fix).
4. **Automated Timezone Geolocation Verification**: Integrating IP geolocation header verification to complement `X-Client-Timezone` streak processing.
5. **Real-time Telemetry & Error Tracking**: Integrating Sentry SDK and OpenTelemetry for automated production exception monitoring and AI latency tracking.
6. **Semantic Embedding Domain Classifier**: Transitioning from the synchronous lexical token heuristic to an embedding-based bi-encoder or lightweight zero-shot classifier (e.g. via `Sentence-Transformers` or ONNX runtime) to capture semantic intent beyond literal token overlap.
7. **RAG Trust Transparency**: Surfacing retrieval confidence, provider identity, and fallback status in the chat UI to close the perceived-trust vs. actual-groundedness gap identified in evaluation.

---

## 🛡️ Security Design Notes

### Prompt-Injection Defence

`chat_assistant.py` implements prompt-injection defence through **structural delimiting**: retrieved reference material is wrapped in `<reference_material>` tags with an explicit system-level instruction never to follow commands embedded within those tags. This is the correct modern approach for RAG-based assistants — it prevents injected instructions in uploaded documents from hijacking the model's behaviour.

`sanitizePromptInput` in the SvelteKit layer is a complementary string-filter that strips obvious injection patterns from user input. This approach is inferior to structural delimiting (it relies on pattern matching rather than instruction architecture) and is scheduled for replacement or augmentation. The two layers are not equivalent; understanding the difference is important for evaluating the system's security posture.

### Accessibility Engineering

`layout.css` implements `prefers-reduced-motion` support covering cases that most commercial implementations miss:

- View Transitions API pseudo-elements (`::view-transition-group`, `::view-transition-old`, `::view-transition-new`)
- 3D flip-card disorientation (collapses perspective and backface-visibility without losing state)
- Continuous glow and ring pulse animations
- Shimmer loading states
- Stagger-delay entrance animations
- Hover scale and translate transforms

This coverage is above the level found in most professional frontend codebases and demonstrates deliberate accessibility engineering rather than checkbox compliance.
