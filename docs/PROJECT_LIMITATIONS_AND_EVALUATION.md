# Project Limitations, Evaluation Methodology & Future Work

This document provides a transparent, academic assessment of the AI Study Buddy platform prepared for the Final Year Project review at Kwame Nkrumah University of Science & Technology (KNUST).

---

## ⚠️ Known Limitations

### 1. Multi-Provider Fallback & Response Latency Variance

- While the multi-provider failover chain (Google Gemini $\rightarrow$ Ollama $\rightarrow$ Python FastAPI ML Backend) ensures high system availability, switching between providers introduces latency variance:
  - **Google Gemini API**: $\approx 1.2s - 2.5s$ completion time.
  - **Local Ollama LLM (`llama3.2`)**: $\approx 4.0s - 9.0s$ completion time (dependent on host GPU/CPU hardware).
  - **Self-Hosted ML Backend**: $\approx 2.0s - 5.0s$ completion time.
- _Mitigation in Production_: Skeletal loading states and asynchronous module generation queues (`generationQueue.ts`) render UI containers immediately while background jobs populate content.

### 2. FAISS Vector Store Persistence & Scalability

- The local Python FastAPI microservice currently employs an in-memory/file-system **FAISS IndexFlatL2** vector store (`ml_backend/vector_store/`).
- While highly performant for individual and small-group study workloads ($\le 10,000$ document chunks), scaling to enterprise multi-tenant workloads with millions of vectors requires transitioning to a distributed cloud vector database (e.g. Pinecone, Weaviate, or BigQuery Vector Search).

### 3. Client Timezone Header Validation

- Daily study streaks are calculated authoritatively on the server using the client's `X-Client-Timezone` header.
- While this guarantees accurate date boundaries across different global timezones, a malicious client could theoretically manipulate the HTTP header to alter streak date calculations.
- _Proposed Sanity Check_: Cross-referencing client timezone headers against IP-based geolocation lookups and enforcing a maximum allowed timezone change frequency per 24-hour window.

### 4. Serverless Instance Cache Consistency

- Upstash Redis REST API (`redis.ts`) acts as a centralized serverless caching and rate-limiting layer.
- If a serverless function instance temporarily loses connectivity to Redis, it gracefully degrades to local in-memory sliding-window rate limiting (`rateLimiter.ts`). During this degraded window, rate limits are enforced locally per container instance rather than globally across all instances.

### 5. Lexical Heuristic Domain Routing vs. Semantic Classification

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

### 2. Empirical Evaluation Suite & Reproducibility Artifacts

Model and system evaluations are automated via the [`evaluation/`](../evaluation/) suite:

- **Empirical RAG Vector Store Evaluation**: Evaluated across 30 academic queries with live FAISS cosine similarity scoring and groundedness checking ([`evaluation/results/rag_evaluation_results.csv`](../evaluation/results/rag_evaluation_results.csv)). Demonstrates 100% precision on indexed topics (e.g. Artificial Intelligence) and transparently documents domain bounds on unindexed curricula.
- **Quiz Generation Quality Rubric**: 50 MCQs evaluated across 5 pedagogical dimensions by independent raters ([`evaluation/results/quiz_human_eval_50.csv`](../evaluation/results/quiz_human_eval_50.csv)), achieving a composite score of `4.75 / 5.0`.
- **Summarization ROUGE & Readability**: Automated scoring on academic text excerpts yielding ROUGE-1 (`37.89 ± 15.05`), ROUGE-2 (`12.96 ± 11.66`), ROUGE-L (`31.68 ± 12.89`), Flesch Reading Ease (`35.70`), and 57.25% compression ([`evaluation/results/summarization_results.csv`](../evaluation/results/summarization_results.csv)).
- **Multi-Tier Latency Benchmarks**: 10-iteration wall-clock measurements across Cloud, Local, and Cache tiers ([`evaluation/results/latency_benchmarks.csv`](../evaluation/results/latency_benchmarks.csv)).
- **User Usability Study (SUS)**: 15-participant empirical study yielding a mean SUS of `84.50 ± 12.72` (Grade A+, Cronbach's $\alpha = 0.946$) ([`evaluation/results/user_study_calculated_scores.csv`](../evaluation/results/user_study_calculated_scores.csv)).
- **Replication**: All evaluation artifacts can be reproduced with a single command: `python evaluation/run_all_evaluations.py`.

### 3. Spaced Repetition Memory Recall Efficiency

- **Algorithm Comparison**: SuperMemo 2 (SM-2) vs Free Spaced Repetition Scheduler (FSRS-4.5).
- **Scheduler Validation**: Unit testing verifies optimal review interval expansion across initial learning, review, and lapse states.

---

## 🔮 Future Work & Roadmap

1. **Active Circuit-Breaker Integration**: Elevating provider health monitoring (`providerStats.ts`) to full circuit-breaker state machines (Closed $\rightarrow$ Open $\rightarrow$ Half-Open) with automated recovery probes.
2. **Cloud Vector Database Scaling**: Replacing FAISS local indices with Google Cloud Vertex AI Vector Search or BigQuery Vector Search for enterprise scalability.
3. **Automated Timezone Geolocation Verification**: Integrating IP geolocation header verification to complement `X-Client-Timezone` streak processing.
4. **Real-time Telemetry & Error Tracking**: Integrating Sentry SDK and OpenTelemetry for automated production exception monitoring and AI latency tracking.
5. **Semantic Embedding Domain Classifier**: Transitioning from the synchronous lexical token heuristic to an embedding-based bi-encoder or lightweight zero-shot classifier (e.g. via `Sentence-Transformers` or ONNX runtime) to capture semantic intent beyond literal token overlap.
