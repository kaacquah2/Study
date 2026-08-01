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

---

## 📊 Fine-Tuning & Evaluation Methodology

To validate the platform's AI course generation, custom model performance, and spaced repetition scheduling, a domain-specific evaluation and fine-tuning pipeline was constructed:

### 1. Custom Model Fine-Tuning Datasets

Domain-adapted HuggingFace models (`FLAN-T5-base`, `FLAN-T5-large`) were trained on curated academic datasets located in `ml_backend/fine_tuning/data/`:

- **Summarization Dataset (`summarization.jsonl`)**: 311+ structured academic input/summary training pairs for chunk-level document compression.
- **Paraphrasing Dataset (`paraphrasing.jsonl`)**: 315+ domain-specific question/explanation rephrasing pairs to vary study materials.
- **Course Outlines Dataset (`outlines.jsonl`)**: Curated course structure specifications for multi-module syllabus planning.
- **Lesson Content Dataset (`lessons.jsonl`)**: In-depth lesson module pairs structured for pedagogical hierarchy.

### 2. Evaluation Scripts & Metrics

Model evaluation is automated via `ml_backend/fine_tuning/evaluate_models.py` and `prepare_hf_datasets.py`:

- **Schema Adherence**: $100\%$ JSON schema validation enforcing strict TypeScript/Zod structures across course outline, lesson, and quiz outputs.
- **ROUGE Evaluation**: Automated ROUGE-1, ROUGE-2, and ROUGE-L metric scoring against reference validation splits.
- **Anti-Hallucination Guard**: `memorizationGuard.ts` screens model generations against source text to detect ungrounded text and enforce verbatim similarity boundaries ($< 85\%$).

### 3. Spaced Repetition Memory Recall Efficiency

- **Algorithm Comparison**: SuperMemo 2 (SM-2) vs Free Spaced Repetition Scheduler (FSRS-4.5).
- **Scheduler Validation**: Unit testing (`fsrs.test.ts`, `sm2.test.ts`) verifies optimal review interval expansion across initial learning, review, and lapse states.

---

## 🔮 Future Work & Roadmap

1. **Active Circuit-Breaker Integration**: Elevating provider health monitoring (`providerStats.ts`) to full circuit-breaker state machines (Closed $\rightarrow$ Open $\rightarrow$ Half-Open) with automated recovery probes.
2. **Cloud Vector Database Scaling**: Replacing FAISS local indices with Google Cloud Vertex AI Vector Search or BigQuery Vector Search for enterprise scalability.
3. **Automated Timezone Geolocation Verification**: Integrating IP geolocation header verification to complement `X-Client-Timezone` streak processing.
4. **Real-time Telemetry & Error Tracking**: Integrating Sentry SDK and OpenTelemetry for automated production exception monitoring and AI latency tracking.
