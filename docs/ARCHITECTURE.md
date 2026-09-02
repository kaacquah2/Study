# System Architecture — Adaptive AI-Powered Learning System

## 1. Architectural Philosophy: The Learning Intelligence Engine

**Study AI** is architected not as a collection of disjointed AI tools, but as an **Adaptive AI-Powered Learning System** centered around a unified **Learning Intelligence Engine**.

The engine continuously collects multi-signal learning events to answer the core educational question:

> **"What should this student study next, and why?"**

```
                     ┌────────────────────────────────┐
                     │   STUDENT LEARNING ACTIVITIES  │
                     └───────────────┬────────────────┘
                                     │
          ┌──────────────────────────┼─────────────────────────┐
          ▼                          ▼                         ▼
   Lesson Completed          Quiz Performance         Flashcard Review (FSRS)
          │                          │                         │
          └──────────────────────────┼─────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  LEARNING EVENT PERSISTENCE     │
                    │   (Firestore Server-Auth)       │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │   AGGREGATED LEARNING PROFILE   │
                    │   (Concepts, Weak Areas, Time)  │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │  HEURISTIC MASTERY CALCULATION  │
                    │ (0.45 Quiz + 0.35 FSRS + 0.15 R)│
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │   LEARNING INTELLIGENCE ENGINE  │
                    │     (Explicit Priority Rules)   │
                    └────────────────┬────────────────┘
                                     │
          ┌──────────────────────────┼─────────────────────────┐
          ▼                          ▼                         ▼
   Priority 1: Review        Priority 2: Mistakes       Priority 3: Weak Areas
   Urgent FSRS due cards     Direct Error Bank practice Targeted Concept drills
```

---

## 2. Learning Analytics Data Model

All analytics within the platform are **evidence-based**, derived from authoritative server-logged `LearningEvent` records:

### Canonical Event Model (`LearningEvent`)

```typescript
interface LearningEvent {
	eventId: string; // UUID
	userId: string; // Authenticated UID
	sessionId: string; // Active study session identifier
	eventType: LearningEventType; // 'lesson_completed' | 'question_answered' | ...
	timestamp: string; // ISO 8601
	courseId?: string;
	moduleId?: string;
	conceptId?: string;
	result?: 'correct' | 'incorrect' | 'skipped';
	durationMs?: number;
	metadata?: {
		quizScore?: number;
		sourceLabel?: string;
		aiProvider?: 'gemini' | 'ollama' | 'ml_backend';
	};
}
```

### Two-Tier Storage Architecture:

- **Tier 1 (Raw Events):** Persistent log of meaningful interactions (`/learningEvents/{uid}/events/{eventId}`).
- **Tier 2 (Aggregated Profile):** Maintained document (`/userLearningProfile/{uid}`) containing total study duration, per-concept mastery records, and active weak areas. Eliminates costly full-collection scans during dashboard rendering.

---

## 3. Heuristic Mastery Score Formula

Rather than presenting uncalibrated model probabilities as absolute truth, the system computes an academically defensible, multi-signal heuristic score:

$$\text{Mastery Score} = 0.45 \times A_{\text{quiz}} + 0.35 \times P_{\text{FSRS}} + 0.15 \times S_{\text{recency}} + 0.05 \times C_{\text{lesson}}$$

### Weighting Rationale:

1. **Quiz Accuracy ($A_{\text{quiz}}$, 45%):** Direct active recall under assessment conditions provides the strongest empirical evidence of concept comprehension.
2. **FSRS Retention ($P_{\text{FSRS}}$, 35%):** Free Spaced Repetition Scheduling states capture memory consolidation and interval stability over time.
3. **Practice Recency ($S_{\text{recency}}$, 15%):** Penalizes long intervals without review to reflect knowledge decay.
4. **Lesson Completion ($C_{\text{lesson}}$, 5%):** Passive reading does not prove understanding; therefore receives minimal weight.

### Empirical Confidence Calibration:

- **High Confidence:** $\ge 15$ learning interactions recorded.
- **Medium Confidence:** $5 - 14$ learning interactions recorded.
- **Low Confidence:** $1 - 4$ learning interactions recorded.
- **None:** Unassessed / 0 interactions.

---

## 4. Explicit Rule-Based Adaptation Engine

The system adapts to the student's needs using deterministic priority rules:

| Priority       | Condition                                       | System Action                                                   | Recommended Route               |
| -------------- | ----------------------------------------------- | --------------------------------------------------------------- | ------------------------------- |
| **Priority 1** | $\text{Due FSRS Questions} > 0$                 | Trigger immediate spaced repetition review before memory decays | `/app/review?moduleId=...`      |
| **Priority 2** | $\text{Unresolved Mistakes} \ge 3$ on concept   | Direct student to Mistake Notebook for error correction         | `/app/mistakes?moduleId=...`    |
| **Priority 3** | Concept Mastery $< 50\%$                        | Trigger targeted practice drill for weak concept                | `/app/courses/{cid}/{mid}`      |
| **Priority 4** | Unmastered module with prerequisites $\ge 80\%$ | Advance to next sequential curriculum topic                     | `/app/courses/{cid}/{mid}`      |
| **Priority 5** | All course modules mastered ($\ge 80\%$)        | Reinforce lowest stability module or explore new subjects       | `/app/review` or `/app/explore` |

---

## 5. Multi-Model ML Architecture & Model Registry

The inference architecture prioritizes high-availability dual-provider routing with Gemini Flash as primary cloud provider and local PyTorch / Hugging Face models as offline/self-hosted fallback.

| Model / Pipeline          | Target Task                                           | Parameter Size | Architectural Justification                                                                                                   |
| ------------------------- | ----------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Google Gemini Flash**   | Primary Generation (Outlines, Lessons, Quizzes, Chat) | Cloud LLM      | Sub-second latency, extensive context window, high instruction fidelity.                                                      |
| **FLAN-T5 Large**         | Local Summarization & Paraphrasing                    | 780M params    | Instruction-tuned seq2seq baseline (with turnkey support for custom domain fine-tuned checkpoints); superior prompt fidelity. |
| **T5 Question Generator** | Local Quiz Question Generation                        | 220M params    | Specialized question-generation head trained on SQuAD/SciQ.                                                                   |
| **Distractor Generator**  | Multiple-Choice Plausible Options                     | 110M params    | Sentence-level similarity model ensuring distractors represent plausible student misconceptions.                              |
| **TinyLlama 1.1B**        | Local AI Chat Assistant                               | 1.1B params    | Highly compact quantized LLM enabling local conversational inference on consumer hardware.                                    |
| **all-MiniLM-L6-v2**      | Sentence Embeddings for RAG                           | 22M params     | Dense 384-dimensional semantic embeddings optimized for low latency FAISS cosine similarity.                                  |

---

## 6. Competitive Advantage Matrix (Why Study AI vs Generic ChatGPT?)

| Dimension                | Generic ChatGPT / Claude               | Study AI Adaptive Learning System                               |
| ------------------------ | -------------------------------------- | --------------------------------------------------------------- |
| **Workflow**             | Generic conversational prompt-response | Structured curriculum generation & interactive lessons          |
| **Memory Retention**     | Ephemeral; forgetful across sessions   | Free Spaced Repetition Scheduler (FSRS-4.5 & SM-2)              |
| **Knowledge State**      | No structured concept tracking         | Interactive Concept Graph with ELKjs & mastery metrics          |
| **Assessment**           | Ad-hoc text questions                  | Multi-choice quizzes with distractor analysis & mistake banking |
| **Next Action Guidance** | Reactive; waits for user prompt        | Proactive recommendation engine (_"What to study next"_)        |
| **Grounding & Trust**    | Black-box general web knowledge        | Strict RAG citations (`📘 Strong source support`)               |
| **Student Analytics**    | None                                   | Evidence-based learning event stream & mastery breakdown        |
