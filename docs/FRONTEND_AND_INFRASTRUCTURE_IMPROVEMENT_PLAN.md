# AI Study Buddy — Comprehensive Frontend & Infrastructure Improvement Strategy

**Document Version:** 1.2.0  
**Date:** August 2026  
**Target Platform:** AI Study Buddy (SvelteKit 2, Svelte 5, Tailwind CSS 4, Firebase, Upstash Redis, Google Gemini, Ollama, Python ML Backend)  
**Authors:** Academic Project Group 13 / Platform Engineering

---

## 1. Executive Summary

This document presents a comprehensive, user-centric improvement strategy for the **AI Study Buddy** e-learning platform. It evaluates the entire frontend architecture, user interaction models, serverless backend workflows, multi-provider AI pipelines, database schemas, and caching mechanisms.

The objective is to elevate the platform from a functional academic prototype to a state-of-the-art, high-engagement educational experience that maximizes learning retention, eliminates cognitive friction, and guarantees resilient, offline-capable infrastructure.

```mermaid
graph TD
    subgraph Client Experience
        A[Landing & Onboarding] --> B[Course Generation Wizard]
        B --> C[Lesson Studio & Zen Mode]
        C --> D[Adaptive Multi-Format Quizzes]
        D --> E[FSRS Spaced Repetition Drill]
        C --> F[Dual-Mode Knowledge Graph Canvas / Tree]
        C --> G[Docked Socratic AI Companion]
    end
    subgraph Shared Session Working Memory
        SSM[studySessionStore: Highlights, Quizzes, Flashcards in sessionStorage]
        C <--> SSM
        G <--> SSM
    end
    subgraph Canonical Taxonomy & Dedup Engine
        CT[Module Canonical Concept Taxonomy]
        C --> CT
        D --> CT
        CT -->|Deduplicated FSRS Sync| E
    end
    subgraph Infrastructure Core
        H[SvelteKit 2 + Svelte 5 Runes]
        I[Cloud Firestore + Single-Listener Orchestrator]
        J[Upstash Redis + Multi-Bucket Rate Limiter]
        K[Multi-Provider AI: Persisted Provenance & Versioning Metadata]
        L[FSRS-4.5 Authoritative Memory Engine]
    end
    Client Experience <--> Infrastructure Core
```

---

## 2. Deep-Dive Architectural Resolutions

### 2.1 Canonical Concept Taxonomy & Flashcard Deduplication
- **Problem**: Study Lens text highlights and Quiz Misses generating uncontrolled free-form slugs (`newtons-second-law` vs `f-equals-ma`) causes exact-match deduplication to fail.
- **Architectural Resolution**:
  1. **Canonical Taxonomy at Module Creation**:
     During course/module generation (`generateLessonV2`), the AI outputs a canonical `concepts` dictionary stored directly on the module document:
     ```typescript
     export interface CanonicalConcept {
         id: string;             // e.g. 'concept_newtons_second_law'
         term: string;           // e.g. "Newton's Second Law of Motion"
         aliases: string[];      // e.g. ["F=ma", "force equals mass times acceleration"]
         summary: string;
     }
     ```
  2. **Study Lens Concept Resolution**: When a student highlights text and clicks *"Generate Flashcard"*, the client resolves the highlight against the module's canonical `concepts` list (via exact alias match or token overlap). If matched, it anchors to `concept.id`.
  3. **Quiz Miss Pipeline**: Quiz questions are explicitly generated with `conceptId: string` tied to the module's canonical concept dictionary.
  4. **Deterministic Dedup Key**:
     ```typescript
     const cardDedupKey = `${courseId}:${moduleId}:${canonicalConceptId}`;
     ```
     If a card with `cardDedupKey` already exists in `/users/{uid}/flashcards`, the system increments its `lapses` and updates its review schedule rather than spawning a duplicate twin card.

---

### 2.2 FSRS-4.5 Authoritative Engine & Persisted One-Time Backfill
- **Problem**: Coexistence of FSRS-4.5 and legacy SM-2 math corrupts stability curves. Runtime recomputation drifts without persistence.
- **Architectural Resolution**:
  1. **Deprecate `sm2.ts`**: Permanently remove `sm2.ts` and `sm2.test.ts` from the codebase.
  2. **Standard Conversion Mapping (Open-Spaced-Repetition standard)**:
     $$D = \text{clamp}\left(11 - \frac{\text{easeFactor} - 1.3}{0.2}, 1, 10\right)$$
     $$S = \max\left(1, \text{intervalDays} \times \left(\frac{D}{5}\right)^{-0.5}\right)$$
     $$\text{state} = \text{reps} > 0 ? \text{'Review'} : \text{'New'}$$
  3. **Persisted One-Time Migration**:
     - Standalone migration script `scripts/migrate_sm2_to_fsrs.ts` backfills existing database records.
     - Fail-safe on card load: If an un-migrated card is fetched by `/api/spaced-repetition/due`, the server converts it and immediately writes `{ stability: S, difficulty: D, state, migratedFromSM2: true }` back to Firestore so conversion is persisted permanently.
  4. **Retention Decay Visualizer**: Evaluates true continuous FSRS retrievability:
     $$R(t) = \exp\left(-\frac{\Delta t}{S}\right)$$
     with zero possibility of NaN or cold-start crashes.

---

### 2.3 Persisted AI Provenance & Content Versioning
- **Problem**: Silent failover and model drift cause untraceable quality drops unless provenance is permanently persisted in Firestore.
- **Architectural Resolution**:
  1. Every generated course, module, quiz, and chat log document in Firestore stores a typed `AIProvenanceMetadata` signature:
     ```typescript
     export interface AIProvenanceMetadata {
         provider: 'gemini' | 'ollama' | 'ml_backend';
         isGrounded: boolean;              // True only if grounded via RAG vector chunks
         groundingChunkCount: number;      // Source chunks used
         degradedTier: boolean;            // True if served by fallback tier
         promptVersion: string;            // e.g. '2026.08-v2-blocks'
         schemaVersion: number;            // e.g. 2
         domainConfidenceScore?: number;
         generatedAt: string;
     }
     ```
  2. **Subtle UI Signal**: When `degradedTier === true`, display a non-intrusive badge:
     > ⚡ *Generated with lightweight model during peak traffic.* `[✨ Upgrade with Gemini Pro]`
  3. Server logs failovers to `/analytics/failovers` for platform QA.

---

### 2.4 Shared Working Memory (`studySessionStore` with `sessionStorage`)
- **Problem**: In-memory state loss on page refresh breaks the single-tutor mental model.
- **Architectural Resolution**:
  1. [`src/lib/stores/studySession.svelte.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/stores/studySession.svelte.ts) synchronizes with `sessionStorage` scoped by `study_session_${moduleId}`.
  2. Captures all Study Lens events (*Explain, Example, Instant Quiz, Flashcard creation, TTS*) and quiz answers.
  3. When `/api/chat/stream` is called, recent events (last 15 minutes) are injected into the system prompt. Survives browser refresh and inter-module navigation.

---

### 2.5 Bulk Flashcard Creation & Rate Limiting (Upstash Redis)
- **Problem**: CompletionScreen's "Drill Missed Concepts" creates bursts of cards; Study Lens micro-actions need dedicated quotas.
- **Architectural Resolution**:
  1. **Zero-AI Bulk Creation**: CompletionScreen "Drill Missed Concepts" does *not* invoke AI models; it directly maps existing quiz question prompts and explanations into FSRS cards using batched Firestore writes.
  2. **Multi-Tiered Redis Action Buckets**:
     - `study_lens`: 30 calls / 10 min window (~150 tokens/call).
     - `chat_stream`: 20 messages / 10 min window (~600 tokens/call).
     - `quiz_explain`: 15 explanations / 10 min window (~400 tokens/call).
     - `fsrs_card_write`: 50 cards / 10 min window (DB write protection).
     - `course_gen`: 5 courses / 1 hr window (~4,000 tokens/call).

---

### 2.6 Full-Parity Accessible Tree View (WCAG 2.2 SC 2.5.1)
- **Problem**: Screen-reader users need 100% functional parity with the Knowledge Map canvas.
- **Architectural Resolution**:
  - The Accessible Tree View (`<nav aria-label="Course Knowledge Hierarchy">`) provides full parity:
    1. **Concept Search Filter**: Real-time filtering and highlighting across tree nodes.
    2. **Segmented Mode Toggle**:
       - `All-Time Mastery`: Displays lifetime FSRS stability percentages ($0–100\%$) and badges.
       - `7-Day Weak Topics`: Highlights concepts with $<70\%$ accuracy over the last 7 days with `<span class="badge-weak" role="status">⚠️ Needs Review</span>` ARIA announcements.
    3. **Keyboard Action Links**: Direct focusable links: `[Study Lesson]`, `[Take Quiz]`, `[Review Flashcards]`.
  - Canvas view includes keyboard pan (arrow keys) and dedicated Zoom In ($+$), Zoom Out ($-$), and Reset buttons.

---

### 2.7 Dock Mode Specifications & Responsive Breakpoints
- **Desktop ($\ge 1024\text{px}$)**: Toggle between Floating Modal and Docked Side-by-Side Mode.
- **Dock Width**: Default $380\text{px}$, resizable with hard constraints: **Min $300\text{px}$, Max $540\text{px}$**, clamped so the main lesson container remains $\ge 560\text{px}$.
- **Tablet & Mobile ($< 1024\text{px}$)**: Dock mode automatically disables and collapses to full-height drawer mode.
- **Persistence**: `isDocked` and `dockWidth` persist in `localStorage` across page navigation without layout jitter.

---

### 2.8 Single-Listener Orchestrator Pattern
- Parent route [`[moduleId]/+page.svelte`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/app/courses/[id]/[moduleId]/+page.svelte) maintains the **sole** centralized Firestore snapshot listener.
- Data passed to `<LessonReader />`, `<QuizRunner />`, `<CompletionScreen />`, and `<ModuleVideoGallery />` strictly via reactive Svelte 5 `$props()`. Zero child listeners.

---

### 2.9 SSE Streaming for AI Endpoints
- `/api/chat/stream` (existing)
- `/api/quiz/explain` (upgraded to SSE so step explanations render progressively)
- `/api/summarize` & `/api/paraphrase` (upgraded to SSE streaming)
- `/api/courses/outline` (streamed outline generation)

---

## 3. Prioritized Execution Roadmap

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Immediate Core UI/UX, Taxonomy & Memory (Weeks 1 - 2)         │
│ ├─ Canonical concept taxonomy & flashcard deduplication engine         │
│ ├─ studySessionStore with sessionStorage persistence & chat injection  │
│ ├─ Dockable resizable AI Companion with <1024px responsive guards      │
│ ├─ Distraction-free Zen Mode in LessonReader                           │
│ └─ FSRS-4.5 authoritative migration, SM-2 deprecation & persisted backfill│
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: Cognitive Tools, Accessible Graph & SSE (Weeks 3 - 4)         │
│ ├─ Full-parity Accessible Tree View + Pan/Zoom Canvas Knowledge Map   │
│ ├─ 7-day weak topic radar border vs. all-time cumulative mastery fill  │
│ ├─ SSE streaming conversion for /api/quiz/explain, summarize, outline │
│ └─ Multi-bucket rate limiter in Upstash Redis                          │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: Provenance Metadata & Curriculum Ingestion (Weeks 5 - 6)      │
│ ├─ AIProvenanceMetadata Firestore persistence on all generated docs    │
│ ├─ Multi-format document ingestion (.pdf, .docx in course wizard)      │
│ ├─ 1-Click Curriculum Templates (Exam Prep, Career Track, Speed Primer)│
│ └─ Audio player playback speed control & text tracking                 │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 4: Infra Hardening, PWA & Single-Listener Architecture (Weeks 7-8)│
│ ├─ Single-listener orchestrator refactoring for [moduleId]/+page       │
│ ├─ Full PWA offline caching with background IndexedDB synchronization  │
│ ├─ Prompt & schema version stamping with legacy upgrade actions        │
│ └─ Execute one-time FSRS migration script on legacy records            │
└────────────────────────────────────────────────────────────────────────┘
```
