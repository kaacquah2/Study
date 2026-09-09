# Study AI — Final Year Project Defense Master Guide

**Kwame Nkrumah University of Science & Technology (KNUST)**  
**Department of Computer Science**  
**Course:** Final Year Project (Group 13)  
**Supervisor:** Dr. Rosemary  
**Project Title:** Study AI — Adaptive AI-Powered Learning System  
**Presenters:** Ahado Ronald Ofoe (`3366322`) & Yoofi Ashon (`3377222`)  

---

## 🎯 Defense Logistics & Pacing Strategy

- **Total Defense Allotment:** 20 Minutes (15 minutes presentation + 5 minutes live demonstration) followed by 10–15 minutes of Technical Q&A.
- **Total Slides:** 15 Slides (~1:00 to 1:30 minute per slide).
- **Interactive Slide Deck:** Open `defense_presentation.html` in any browser or visit `http://localhost:5173/defense_presentation.html`.
- **Keyboard Shortcuts:**
  - `Right Arrow` / `Space`: Next slide
  - `Left Arrow`: Previous slide
  - `S`: Toggle Speaker Notes Drawer (shows live speaking cues & tips)
  - `O`: Toggle Slide Overview Grid (jump to any slide during Q&A)
  - `F`: Fullscreen mode
  - `T`: Toggle High-Contrast / Light Theme (for washed-out projector screens)
  - `Ctrl + P`: Instant high-resolution 16:9 PDF export for examiners' paper handouts

---

## 👥 Speaking Roles & Division of Responsibilities

| Slide # | Slide Title | Primary Speaker | Target Duration |
| :--- | :--- | :--- | :--- |
| **Slide 1** | Title & Defense Credentials | **Ronald (Ahado)** | 1:00 min |
| **Slide 2** | Paradox of Modern Generative AI in Education | **Ronald (Ahado)** | 1:15 min |
| **Slide 3** | Research Question & Core Objectives | **Ronald (Ahado)** | 1:15 min |
| **Slide 4** | Full-Stack Architecture & Multi-Tier Topology | **Yoofi Ashon** | 1:30 min |
| **Slide 5** | The Learning Intelligence Engine & Priority Rules | **Yoofi Ashon** | 1:30 min |
| **Slide 6** | Mathematical Model: Defensible Heuristic Mastery | **Ronald (Ahado)** | 1:30 min |
| **Slide 7** | Integrated Subsystems: Closing the Learning Loop | **Yoofi Ashon** | 1:20 min |
| **Slide 8** | Multi-Tier Hybrid Inference Strategy | **Yoofi Ashon** | 1:15 min |
| **Slide 9** | Empirical Evaluation: RAG Retrieval & Groundedness | **Ronald (Ahado)** | 1:30 min |
| **Slide 10** | Empirical Evaluation: Quiz Quality & Bloom's Taxonomy | **Ronald (Ahado)** | 1:20 min |
| **Slide 11** | System Performance Benchmarks & Latency Profiling | **Yoofi Ashon** | 1:20 min |
| **Slide 12** | Empirical User Study & System Usability Scale (SUS) | **Ronald (Ahado)** | 1:20 min |
| **Slide 13** | 12-Step Examiner Demonstration Narrative | **Yoofi & Ronald** | 1:30 min |
| **Slide 14** | Academic Limitations & Post-Deadline Roadmap | **Ronald (Ahado)** | 1:15 min |
| **Slide 15** | Conclusion, Summary of Contributions & Q&A | **Ronald & Yoofi** | 1:00 min |

---

## 🎤 Detailed Slide-by-Slide Script & Defense Walkthrough

### Slide 1: Title & Academic Credentials
- **Speaker:** Ahado Ronald Ofoe
- **Time:** 1:00 min
- **Verbatim Opening:**
  > "Good morning, respected members of the panel, our project supervisor Dr. Rosemary, and colleagues. I am Ahado Ronald Ofoe, and presenting with me is Yoofi Ashon. Today, we present our Final Year Project: **Study AI** — an Adaptive AI-Powered Learning System.
  > Rather than building another standalone conversational wrapper around an LLM, our project engineers an authoritative Learning Intelligence Engine that answers the core educational question: *'What should this student study next, and why?'*"

### Slide 2: Background & The Problem with Modern AI
- **Speaker:** Ahado Ronald Ofoe
- **Time:** 1:15 min
- **Key Talking Points:**
  - Introduce the **Illusion of Competence**: Chatbots provide instant fluency, but cognitive science shows students skip active retrieval, leading to rapid forgetting.
  - Explain the **Point Feature Problem**: Modern EdTech packages AI as isolated widgets (a flashcard generator here, a summarizer there). No system persists mistakes or maintains unified mastery.
  - Highlight the **Citation Trust Gap**: Students blindly trust conversational citations even when the underlying LLM hallucinates definitions.

### Slide 3: Research Question & Core Objectives
- **Speaker:** Ahado Ronald Ofoe
- **Time:** 1:15 min
- **Core Research Question:**
  > *"Does an adaptive learning system that continuously aggregates multi-signal performance evidence (quizzes, FSRS reviews, mistake banking) improve student gap identification and study workflow efficiency compared to generic conversational AI?"*
- **Four Core Engineering Objectives:**
  1. Immutable event-driven learning analytics stream (`LearningEvent`).
  2. Academically defensible, weighted heuristic mastery formula.
  3. Grounded RAG with explicit metadata-backed provenance tags.
  4. Closed-loop adaptation using deterministic priority rules.

### Slide 4: Full-Stack Architecture & Multi-Tier Topology
- **Speaker:** Yoofi Ashon
- **Time:** 1:30 min
- **Key Talking Points:**
  - **Frontend:** SvelteKit v2.63 utilizing **Svelte 5 Runes** (`$state`, `$derived`, `$props`) for zero-virtual-DOM fine-grained reactivity.
  - **Graph Visualizer:** ELK.js layout engine rendering prerequisite tree diagrams.
  - **Serverless BFF:** Netlify serverless functions with Upstash Redis REST distributed caching and Firebase Admin cryptographic token validation.
  - **Multi-Tier AI Pipeline:** Google Gemini 2.5 Flash for high-speed cloud generation, with self-hosted Python FastAPI backend (`ml_backend`) for offline INT8 local inference and FAISS vector retrieval.

### Slide 5: The Learning Intelligence Engine
- **Speaker:** Yoofi Ashon
- **Time:** 1:30 min
- **Key Talking Points:**
  - **Two-Tier Storage Architecture:** Tier 1 logs immutable raw events (`/learningEvents/{uid}/events/{eventId}`). Tier 2 maintains an aggregated profile document (`/userLearningProfile/{uid}`) eliminating costly collection scans.
  - **Deterministic Adaptation Decision Matrix:**
    - *Priority 1 (Critical):* Due FSRS flashcards > 0 $\rightarrow$ Immediate spaced review.
    - *Priority 2 (High):* Unresolved mistakes $\ge 3$ $\rightarrow$ Error Bank drill.
    - *Priority 3 (Medium):* Concept mastery $< 50\%$ $\rightarrow$ Targeted practice drill.
    - *Priority 4 (Normal):* Prerequisites $\ge 80\%$ $\rightarrow$ Next sequential syllabus chapter.

### Slide 6: Mathematical Model: Defensible Heuristic Mastery
- **Speaker:** Ahado Ronald Ofoe
- **Time:** 1:30 min
- **Formula Derivation:**
  $$\text{Mastery Score} = 0.45 \times A_{\text{quiz}} + 0.35 \times P_{\text{FSRS}} + 0.15 \times S_{\text{recency}} + 0.05 \times C_{\text{lesson}}$$
- **Weight Justifications:**
  - **45% Quiz Accuracy:** Active recall provides the strongest empirical evidence of comprehension.
  - **35% FSRS Retention:** Memory stability and interval difficulty over elapsed days.
  - **15% Practice Recency:** Models the Ebbinghaus forgetting curve decay.
  - **5% Lesson Read:** Reading alone is passive consumption and receives minimal weight.
  - **Confidence Ratings:** None (0), Low (1–4), Medium (5–14), High ($\ge 15$ interactions).

### Slide 7: Integrated Subsystems: Closing the Loop
- **Speaker:** Yoofi Ashon
- **Time:** 1:20 min
- **Key Talking Points:**
  - **RAG Provenance:** Explains the `📘 Strong source support — Chapter (Page)` citation badge.
  - **Mistake Notebook:** Captures full question snapshot and misconception reasoning for targeted error drills.
  - **Knowledge Map:** Directed acyclic graph with *"Explain My Progress"* providing natural language diagnostic explanations for low mastery.
  - **FSRS-4.5 Scheduler:** State-of-the-art spaced repetition algorithm with offline IndexedDB synchronization replay.

### Slide 8: Multi-Tier Hybrid Inference Strategy
- **Speaker:** Yoofi Ashon
- **Time:** 1:15 min
- **Key Talking Points:**
  - **Why Both Cloud and Local:** Gemini Flash provides sub-2-second generation on Cloud TPUs. The Python backend provides zero-cost uptime, offline continuity, and privacy for proprietary exam papers.
  - **Asynchronous UX Decoupling:** SvelteKit generation queue with skeleton loaders and Server-Sent Events (SSE) streaming prevents 12s–22s CPU generations from freezing the UI.

### Slide 9: Empirical Evaluation: RAG Retrieval & Groundedness
- **Speaker:** Ahado Ronald Ofoe
- **Time:** 1:30 min
- **Key Metrics ($N=30$ CS Queries):**
  - Retrieval Precision@3: **36.7%** overall (100% in AI, 50% in Databases, 0% in unindexed Computer Architecture).
  - Mean Query-Context Cosine Similarity: **0.454 ± 0.113**.
  - **The Perceived-Trust vs. Groundedness Gap (50%):** Half of responses lacked factual context grounding despite formatted citations.
  - **Technical Mitigation:** FAISS ID-prefiltering (`IDSelectorBatch`) to prevent multi-tenant candidate crowding.

### Slide 10: Empirical Evaluation: AI Quiz Generation Quality
- **Speaker:** Ahado Ronald Ofoe
- **Time:** 1:20 min
- **Key Metrics ($N=50$ Generated MCQs across Bloom's Taxonomy):**
  - Relevance: **5.00 / 5.0** (100% high quality)
  - Correctness: **5.00 / 5.0** (100% high quality)
  - Clarity: **4.86 / 5.0**
  - Distractor Plausibility: **4.14 / 5.0** (generates real misconceptions)
  - Difficulty: **3.56 / 5.0**
  - Overall Composite Score: **4.51 / 5.0 (92% high quality)**
  - Highest discriminative performance at Bloom's **Analyze** level (4.69).

### Slide 11: System Performance Benchmarks & Latency
- **Speaker:** Yoofi Ashon
- **Time:** 1:20 min
- **Key Empirical Figures ($N=10$ Iterations, 240 Runs):**
  - Outline Generation: Cloud **1.79s** vs Local **12.69s** vs Cache **< 0.1ms**.
  - Lesson Generation: Cloud **2.42s** vs Local **22.68s** vs Cache **< 0.1ms**.
  - FAISS Vector Search: **34ms to 40ms** (matches or beats cloud network roundtrip).
  - TTFT (Time-to-First-Token): **316ms**.
  - Outline Cache Hit Ratio: **78.4%** (99.2% latency reduction).
  - Peak ML Backend RAM: **2.42 GB** (within 2.5 GB container ceiling).

### Slide 12: Empirical User Study & System Usability Scale (SUS)
- **Speaker:** Ahado Ronald Ofoe
- **Time:** 1:20 min
- **User Study Metrics ($N=15$ CS Undergraduate Students, 6 Tasks):**
  - Mean SUS Score: **84.50 ± 12.72** (Industry benchmark is 68; **+16.5 points**).
  - SUS Grade: **Grade A+** (Top 96th–100th percentile ranking).
  - Scale Reliability: **Cronbach's $\alpha = 0.946$** (Extremely high internal consistency).
  - Qualitative Feature Ratings: Mistake Notebook (**4.68/5**), AI Tutor Citations (**4.52/5**), Knowledge Map (**4.50/5**), Next-Action Guidance (**4.37/5**).

### Slide 13: 12-Step Examiner Demonstration Narrative
- **Speaker:** Yoofi Ashon & Ronald
- **Time:** 1:30 min
- **Structure:** 3-Phase closed loop (Phase 1: Ingestion & Study $\rightarrow$ Phase 2: Active Recall & Gaps $\rightarrow$ Phase 3: Adaptive Closure).

### Slide 14: Academic Limitations & Post-Deadline Roadmap
- **Speaker:** Ahado Ronald Ofoe
- **Time:** 1:15 min
- **Identified Limitations & Concrete Solutions:**
  1. *Single-Node FAISS Index:* Migration to managed vector store (Qdrant/Pinecone/pgvector) with native index-level ACL filtering.
  2. *Client-Side Quiz Grading Integrity Gap:* Planned server-side session token verification (`/api/quiz/grade`).
  3. *Total Failover Latency Gap:* Implementation of a hard 8-second circuit-breaker timeout across the multi-tier failover chain.

### Slide 15: Conclusion & Technical Defense Floor Opening
- **Speaker:** Ronald & Yoofi
- **Time:** 1:00 min
- **Closing Statement:**
  > "Study AI demonstrates that generative AI can move beyond passive answer generation into an authoritative, adaptive, and defensible educational partner. We thank Dr. Rosemary and the Department of Computer Science, and we now welcome your questions."

---

## 🛡️ Top 10 Difficult Examiner Defense Questions & Defensible Answers

### Q1: "Why did you choose a mathematical heuristic formula for mastery instead of training a neural network or classifier?"
**Defensible Answer (Ronald):**
> *"That is an insightful question. We evaluated black-box neural approaches and rejected them for two critical academic reasons:*
> *First, educational transparency. If an AI tells a student or teacher their mastery is 42%, a neural model cannot explain why without post-hoc uncalibrated approximations. Our heuristic formula is 100% explainable: we can tell the student their score is low because active recall accuracy was 40% and FSRS retention lapsed over 14 days.*
> *Second, cold-start data scarcity. In a real-world classroom, an individual student does not have thousands of training samples per topic. Neural predictors overfit or hallucinate confidence on sparse interaction data. Our formula couples directly with an empirical sample-size confidence rating (Low, Medium, High), ensuring mastery claims are mathematically defensible."*

---

### Q2: "Your RAG precision@3 is 36.7%. Isn't that low? Why did you publish this figure instead of claiming 95%?"
**Defensible Answer (Ronald):**
> *"We intentionally chose academic honesty and empirical rigor over inflated synthetic benchmarks. Our 36.7% figure reflects testing across 30 comprehensive questions spanning 7 distinct Computer Science curricula on our local syllabus index.*
> *Our domain breakdown proves this: in subjects with ingested lecture slide decks—like Artificial Intelligence—our retrieval precision was 100%. In unindexed subjects like Computer Architecture, precision was 0%. The 36.7% composite score empirically proves that vector retrieval is strictly bounded by corpus coverage.*
> *This exact negative result led to our most important architectural contribution: building multi-provider generative fallback and user document uploads so the system never fails when local retrieval bounds are reached."*

---

### Q3: "Your local ML backend generation takes 12–22 seconds on CPU, while Gemini takes 1.8 seconds. Why keep the local tier at all?"
**Defensible Answer (Yoofi):**
> *"The local tier is architected as an offline resilience and privacy fallback, not the primary real-time generation path. There are three core engineering justifications:*
> *1. API Quota & Cloud Outage Resilience: If Gemini API rate limits are hit (HTTP 429) or internet connectivity drops, the system gracefully continues working rather than failing the student.*
> *2. Data Sovereignty: For unreleased university exam papers or proprietary departmental lecture notes, FAISS dense retrieval runs 100% on-premises in 35 milliseconds without transmitting data to third-party cloud APIs.*
> *3. Asynchronous UX Decoupling: We implemented an asynchronous background queue with skeleton placeholders and Server-Sent Events, so students never experience a frozen browser during local generations."*

---

### Q4: "What is 'Candidate Crowding' in FAISS and how did you resolve it?"
**Defensible Answer (Yoofi):**
> *"In a shared FAISS index where multiple students store private documents, standard nearest-neighbor search retrieves the top-K candidates globally before applying Python-level user filtering.*
> *Candidate crowding occurs when one user has a dense cluster of documents that completely fills all top-K candidate slots. When the Python filter runs, another user's valid documents have already been pushed out of the candidate pool, resulting in zero results returned.*
> *We resolved this in our Python backend by implementing native FAISS ID-prefiltering using `faiss.SearchParameters(sel=faiss.IDSelectorBatch(...))`. FAISS traversal is now restricted strictly to IDs authorized for the requesting user, completely eliminating cross-user crowding at the index level."*

---

### Q5: "Your quiz grading happens on the client side. Doesn't that compromise exam integrity?"
**Defensible Answer (Yoofi):**
> *"Yes, and we have explicitly documented this in our limitations as an 'Assessment Integrity Gap'.*
> *In our current implementation, grading runs on the client to eliminate network roundtrips during self-directed formative study. For formative practice, zero-latency feedback is pedagogically advantageous.*
> *However, for formal summative exams where grades or certificates are awarded, client-side grading is insecure because answer keys exist in browser memory. In Section 14 of our defense and Chapter 5 of our thesis, we have already specified the post-deadline architecture: a dedicated `/api/quiz/grade` endpoint with one-time server session tokens where the answer key never leaves the server."*

---

### Q6: "How does FSRS-4.5 compare to traditional Anki SM-2?"
**Defensible Answer (Ronald):**
> *"SuperMemo-2 (SM-2), created in 1987, relies on fixed ease factors and heuristic interval multipliers that assume uniform forgetting across all individuals and card types.*
> *FSRS-4.5 (Free Spaced Repetition Scheduler) is based on the modern DSR model—Difficulty, Stability, and Retrievability. It models memory stability as the number of days required for retention probability to fall from 100% to 90%. Empirical research across millions of repetition logs has shown FSRS reduces required review repetitions by 20% to 30% while maintaining the exact same target retention rate."*

---

### Q7: "Why did you build the frontend in SvelteKit rather than React or Next.js?"
**Defensible Answer (Yoofi):**
> *"We chose SvelteKit v2.63 with Svelte 5 Runes for three measurable performance advantages:*
> *First, no Virtual DOM diffing overhead: Svelte compiles down to minimal vanilla JavaScript that mutates the DOM directly, resulting in faster rendering on low-spec student laptops.*
> *Second, bundle size: SvelteKit delivers a client bundle less than half the size of equivalent Next.js apps, ensuring fast page loads on restricted mobile and campus Wi-Fi networks.*
> *Third, unified BFF architecture: SvelteKit's built-in server routes (`+server.ts`) allowed us to co-locate secure serverless endpoints with our frontend without managing a separate Node.js server."*

---

### Q8: "How did you measure System Usability (SUS) and what does a score of 84.50 mean?"
**Defensible Answer (Ronald):**
> *"We utilized John Brooke's standardized 10-item System Usability Scale (SUS), which is the global academic benchmark for software usability evaluation.*
> *15 undergraduate students completed 6 structured study tasks and rated the 10 alternating positive and negative items on a 5-point Likert scale.*
> *According to Bangor et al.'s usability percentile curves, a score of 68 is the industry average (Grade C). Our empirical score of 84.50 ± 12.72 ranks in the 96th to 100th percentile, corresponding to a certified **Grade A+**. Furthermore, our Cronbach's Alpha of 0.946 confirms exceptional internal scale reliability."*

---

### Q9: "Why use token-Jaccard lexical overlap for domain classification instead of BERT or a transformer classifier?"
**Defensible Answer (Yoofi):**
> *"That is an architectural tradeoff between routing latency and semantic depth.*
> *Every incoming prompt must be classified to determine model routing. Running a BERT or RoBERTa classifier adds 80 to 150 milliseconds of inference latency before generation even begins.*
> *Our token-Jaccard classifier evaluates in under 0.5 milliseconds synchronously in TypeScript against our 10-topic Computer Science taxonomy. For ambiguous or synonym-heavy queries, our pipeline fails safely to Google Gemini Flash rather than misrouting."*

---

### Q10: "What happens if a student loses internet connectivity while using Study AI?"
**Defensible Answer (Yoofi):**
> *"Study AI is built with offline continuity:*
> *1. Flashcard Reviews: Flashcards and FSRS scheduling calculations execute locally in the browser. Completed reviews are queued in an offline IndexedDB replay queue (`offlineSync.ts`). When connectivity resumes, the queue dispatches events to Firestore automatically.*
> *2. Caching: All previously loaded course outlines and lesson content are cached in client storage.*
> *3. If running the local desktop setup with `ml_backend`, document RAG search and AI tutoring continue functioning completely offline."*

---

## 🎬 Live Demonstration Checklist (Step-by-Step)

Before the panel enters the room, ensure the following are verified:

- [ ] SvelteKit dev server running: `npm run dev` at `http://localhost:5173`
- [ ] ML Backend running (if demoing local fallback): `cd ml_backend && uvicorn main:app --port 8000`
- [ ] Browser tabs prepared in order:
  - Tab 1: `defense_presentation.html` (Full screen)
  - Tab 2: `http://localhost:5173/app` (Logged-in student dashboard)
  - Tab 3: `http://localhost:5173/app/knowledge-map` (Knowledge Map)
  - Tab 4: `http://localhost:5173/app/mistakes` (Mistake Bank)
- [ ] Sample lecture notes PDF on Desktop (e.g. `Computer_Networks_Lecture.pdf`) ready for upload.
- [ ] Backup hotspot connected in case of campus Wi-Fi instability.

**Best of luck to Ahado Ronald Ofoe and Yoofi Ashon. You have built an extraordinary, defensible, and academically rigorous project!**
