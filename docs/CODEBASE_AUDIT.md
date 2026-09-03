# AI Study Buddy — Codebase Audit Report

> **Audit Type:** Read-Only Technical Architecture & Code Inspection  
> **Date:** July 23, 2026  
> **Target System:** SvelteKit Frontend & API Routes, Firebase Auth / Firestore, Python FastAPI ML Backend  
> **Scope:** All source files in `src/`, `ml_backend/`, `tests/`, `firestore.rules`, `.env.example`, and `ml_backend/.env.example`.

---

## 1. Executive Summary

The AI Study Buddy codebase is a hybrid architecture combining a SvelteKit web application (serving SSR pages, client components, and API routes), Firebase Authentication & Cloud Firestore (for database storage and real-time client state), and a self-hosted Python FastAPI ML inference backend (`ml_backend`) running HuggingFace models (`Flan-T5`, `TinyLlama`, `valhalla/t5-small-qg-prepend`, `potsawee/t5-large-generation-race-distractors`, and a FAISS vector store with `sentence-transformers/all-MiniLM-L6-v2`). Overall, the project's security and session verification model is **solid**: server-side API routes consistently authenticate requests using Firebase Admin SDK ID token verification (`verifySessionUser`), write logic is isolated to server-side transactions or strictly bounded rules (`firestore.rules`), and input data is sanitized (DOMPurify, URL stripping, H1 tag rejection). However, the system is **fragile** around its ML backend coupling and CPU-bound model inference: model executions are serialized globally via `inference_lock` in Python, heavy models are warm-loaded asynchronously in background threads, and long HTTP timeouts (90s–180s) are required during peak load. The **single biggest risk** identified is a configuration and diagnostic gap: there is no startup cross-validation between SvelteKit's `ML_BACKEND_API_KEY` and `ml_backend`'s API key check, and client-side chat components (`AssistantChat.svelte`) display generic network error messages when the ML backend returns HTTP 503 during model warmup.

---

## 2. Full File Manifest

Below is the complete manifest of all source files in `src/` and `ml_backend/` (excluding `node_modules`, build output, and `.svelte-kit`). Each entry includes a concise description of its actual runtime behavior based on code inspection.

### `src/` (Root Config & Templates)

- [app.d.ts](../src/app.d.ts) — Defines ambient TypeScript interfaces for SvelteKit `App.Locals`, `App.PageData`, and `App.Error`.
- [app.html](../src/app.html) — HTML5 entry template containing head tags, font imports, and the `%sveltekit.head%` / `%sveltekit.body%` placeholders.

### `src/lib/components/` (Frontend UI Components)

- [AppShell.svelte](../src/lib/components/AppShell.svelte) — Main layout container providing top navigation, responsive mobile drawer sidebar, theme wrapper, and toast notifications.
- [AssistantChat.svelte](../src/lib/components/AssistantChat.svelte) — Floating chat drawer component fetching Firestore course context client-side and communicating with `/api/chat`.
- [BadgeStrip.svelte](../src/lib/components/BadgeStrip.svelte) — Displays earned gamification achievement badges ("First Step", "3-Day Streak", etc.) with tooltips.
- [CompletionScreen.svelte](../src/lib/components/CompletionScreen.svelte) — Celebration modal rendered upon 100% course completion with certificate generation links.
- [CourseCard.svelte](../src/lib/components/CourseCard.svelte) — Dashboard card displaying course topic, description, module count, status badge, and progress bar.
- [DailyGoalRing.svelte](../src/lib/components/DailyGoalRing.svelte) — SVG circular ring component rendering daily target study completion percentages.
- [DraftOutlineEditor.svelte](../src/lib/components/DraftOutlineEditor.svelte) — Interactive form for editing, reordering, adding, or removing module slots in a generated course draft.
- [EmptyState.svelte](../src/lib/components/EmptyState.svelte) — Reusable placeholder component for zero-data views, empty course lists, or initial states.
- [Header.svelte](../src/lib/components/Header.svelte) — Top navigation bar rendering user avatar, streak counter, theme toggle, and mobile menu button.
- [PageIndicator.svelte](../src/lib/components/PageIndicator.svelte) — Pagination bar rendering dots/tabs for multi-page lesson reader views.
- [ProgressBar.svelte](../src/lib/components/ProgressBar.svelte) — Horizontal linear progress bar with customizable accent colors and percentage displays.
- [ShareModal.svelte](../src/lib/components/ShareModal.svelte) — Dialog modal for generating, displaying, copying, and revoking 12-character shared course links.
- [SharedCourseCard.svelte](../src/lib/components/SharedCourseCard.svelte) — Card component displaying shared course snapshot metadata before claiming/importing.
- [Skeleton.svelte](../src/lib/components/Skeleton.svelte) — Animated loading placeholder bar for asynchronous content state fallbacks.
- [StreakChip.svelte](../src/lib/components/StreakChip.svelte) — Flame icon badge displaying current active streak days and last studied indicator.
- [StreakHeatmap.svelte](../src/lib/components/StreakHeatmap.svelte) — Grid visualization rendering daily study activity over past months.
- [ThemeSwitcher.svelte](../src/lib/components/ThemeSwitcher.svelte) — Toggle button controlling client light/dark theme preference state.
- [Toast.svelte](../src/lib/components/Toast.svelte) — Fixed notification banner rendering error, success, and info toast alerts.

### `src/lib/firebase/` (Firebase Client Configuration)

- [client.ts](../src/lib/firebase/client.ts) — Initializes Firebase Client JS SDK (`initializeApp`, `getAuth`, `getFirestore`) with optional local emulator connection logic.
- [converters.ts](../src/lib/firebase/converters.ts) — Defines TypeScript document interfaces (`CourseDoc`, `ModuleDoc`, `UserProfileDoc`, `SharedCourseDoc`) and a generic Firestore data converter factory.
- [rules.test.ts](../src/lib/firebase/rules.test.ts) — Vitest test suite executing security rule assertions against local Firestore Emulator.

### `src/lib/server/` (Server Utilities & AI Services)

- [admin.ts](../src/lib/server/admin.ts) — Initializes Firebase Admin SDK using service account JSON from `.env` or local emulator fallbacks.
- [auth.ts](../src/lib/server/auth.ts) — Middleware verifying Firebase ID tokens from HTTP `Authorization` headers and auto-creating user documents in Firestore.
- [auth.test.ts](../src/lib/server/auth.test.ts) — Vitest unit tests for session token verification and user profile auto-provisioning.
- [outlineCache.ts](../src/lib/server/outlineCache.ts) — Short-lived (30-second) in-memory cache to deduplicate concurrent course outline queries.
- [outlineCache.test.ts](../src/lib/server/outlineCache.test.ts) — Vitest unit tests verifying outline caching and auto-eviction behavior.
- [rateLimiter.ts](../src/lib/server/rateLimiter.ts) — Helper executing atomic Firestore transaction updates for count-based rate limits per window key.
- [rateLimiter.test.ts](../src/lib/server/rateLimiter.test.ts) — Vitest unit tests verifying rate-limiter threshold enforcement.
- [ai/client.ts](../src/lib/server/ai/client.ts) — Low-level HTTP client forwarding requests to the Python FastAPI server with `X-API-Key` headers and timeouts.
- [ai/provider.ts](../src/lib/server/ai/provider.ts) — Higher-level AI service wrapper exposing `generateOutline`, `generateLesson`, `generateQuiz`, `summarize`, `paraphrase`, and `chat`.
- [ai/provider.test.ts](../src/lib/server/ai/provider.test.ts) — Vitest unit tests verifying Zod schema validation and provider responses.

### `src/lib/stores/` (Svelte 5 Reactive Stores)

- [auth.svelte.ts](../src/lib/stores/auth.svelte.ts) — Reactive store (`$state`) managing Firebase auth state, listening to Firestore user profile changes via `onSnapshot`, and caching local sessions.
- [theme.svelte.ts](../src/lib/stores/theme.svelte.ts) — Reactive store managing client theme selection (light/dark) and syncing with Firestore `users/{uid}`.
- [toast.svelte.ts](../src/lib/stores/toast.svelte.ts) — Reactive store managing notification queue states.

### `src/routes/` (Pages & Layouts)

- [+layout.svelte](../src/routes/+layout.svelte) — Root layout attaching global CSS styles and rendering top-level toast notifications.
- [+page.svelte](../src/routes/+page.svelte) — Landing page and authentication modal handling email sign in, sign up, Google SSO, and password reset.
- [layout.css](../src/routes/layout.css) — Core style sheet containing CSS custom properties, theme tokens, typography, and utility classes.
- [create/+page.svelte](../src/routes/create/+page.svelte) — **FLAGGED UNUSED/REDUNDANT**: Client-side redirect route forwarding `/create` to `/app/courses/createCourse`.
- [dashboard/+page.svelte](../src/routes/dashboard/+page.svelte) — **FLAGGED UNUSED/REDUNDANT**: Client-side redirect route forwarding `/dashboard` to `/app`.

### `src/routes/api/` (SvelteKit API Routes)

- [admin/analytics/+server.ts](../src/routes/api/admin/analytics/+server.ts) — GET endpoint returning system-wide course generation and completion analytics for admin users.
- [chat/+server.ts](../src/routes/api/chat/+server.ts) — POST endpoint enforcing rate limits (60 msg/hr) and proxying study chat prompts to ML backend `/chat`.
- [courses/+server.ts](../src/routes/api/courses/+server.ts) — POST endpoint generating course outlines via ML backend `/outline` and creating draft course/modules in Firestore.
- [courses/courses.test.ts](../src/routes/api/courses/courses.test.ts) — Vitest integration tests for course creation API route.
- [courses/[id]/+server.ts](../src/routes/api/courses/[id]/+server.ts) — DELETE endpoint removing a course document and all its subcollection module documents in a batch.
- [courses/[id]/certificate/+server.ts](../src/routes/api/courses/[id]/certificate/+server.ts) — GET endpoint verifying 100% course completion and returning a shareable completion certificate payload.
- [courses/[id]/draft/+server.ts](../src/routes/api/courses/[id]/draft/+server.ts) — PATCH and POST endpoints for saving edited outline drafts and transitioning course status to `'building'`.
- [courses/[id]/modules/add/+server.ts](../src/routes/api/courses/[id]/modules/add/+server.ts) — POST endpoint appending an additional module slot to an existing course in a transaction.
- [courses/[id]/share/+server.ts](../src/routes/api/courses/[id]/share/+server.ts) — POST and DELETE endpoints creating frozen 12-char snapshot tokens in `sharedCourses` or revoking them.
- [documents/+server.ts](../src/routes/api/documents/+server.ts) — GET, POST, DELETE endpoints proxying RAG vector store operations (`/rag-stats`, `/documents`) to ML backend.
- [flag/+server.ts](../src/routes/api/flag/+server.ts) — POST endpoint submitting content quality or safety flag reports into `flags` collection.
- [microservices.test.ts](../src/routes/api/microservices.test.ts) — Vitest integration tests for `/api/chat`, `/api/summarize`, and `/api/paraphrase`.
- [modules/modules.test.ts](../src/routes/api/modules/modules.test.ts) — Vitest integration tests for module generation and completion API routes.
- [modules/[id]/complete/+server.ts](../src/routes/api/modules/[id]/complete/+server.ts) — POST endpoint recording completed module IDs, updating streak statistics, badges, and progress counters atomically.
- [modules/[id]/generate/+server.ts](../src/routes/api/modules/[id]/generate/+server.ts) — POST endpoint executing AI lesson or quiz generation, enforcing 30 mod/hr rate limit, sanitizing HTML/Markdown, and updating module status.
- [modules/[id]/retry/+server.ts](../src/routes/api/modules/[id]/retry/+server.ts) — POST endpoint resetting a failed module status to `'pending'` to allow re-generation.
- [paraphrase/+server.ts](../src/routes/api/paraphrase/+server.ts) — POST endpoint verifying session, enforcing 60 req/hr rate limit, and calling Python ML `/paraphrase`.
- [share/[token]/+server.ts](../src/routes/api/share/[token]/+server.ts) — GET endpoint returning public preview metadata for a shared course token with IP rate limiting.
- [share/[token]/claim/+server.ts](../src/routes/api/share/[token]/claim/+server.ts) — POST endpoint atomically cloning a shared course snapshot into the user's workspace.
- [spaced-repetition/due/+server.ts](../src/routes/api/spaced-repetition/due/+server.ts) — GET endpoint fetching due quiz questions scheduled for review on or before today.
- [summarize/+server.ts](../src/routes/api/summarize/+server.ts) — POST endpoint verifying session, enforcing 60 req/hr rate limit, and calling Python ML `/summarize`.

### `src/routes/app/` (Protected Dashboard & App Pages)

- [app/+layout.svelte](../src/routes/app/+layout.svelte) — Protected layout enforcing user authentication, email verification checks, and main app container.
- [app/+page.svelte](../src/routes/app/+page.svelte) — Main user dashboard showing active courses, streak stats, goal progress ring, and due review alerts.
- [app/admin/+page.svelte](../src/routes/app/admin/+page.svelte) — Admin analytics dashboard displaying system performance stats and flagged content reports.
- [app/courses/[id]/+page.svelte](../src/routes/app/courses/[id]/+page.svelte) — Course details view displaying module list, outline status, generation controls, and certificate button.
- [app/courses/[id]/[moduleId]/+page.svelte](../src/routes/app/courses/[id]/[moduleId]/+page.svelte) — Combined module viewer route (used in `/app/courses/...`) for lesson pages and interactive quizzes.
- [app/courses/createCourse/+page.svelte](../src/routes/app/courses/createCourse/+page.svelte) — Step-by-step course generator wizard with topic input, level selection, and interactive draft editor.
- [app/explore/+page.svelte](../src/routes/app/explore/+page.svelte) — Community exploration page for browsing and cloning featured/public shared courses.
- [app/knowledge/+page.svelte](../src/routes/app/knowledge/+page.svelte) — Knowledge Base management page for staging, uploading `.txt`/`.md` files, viewing RAG stats, and clearing store.
- [app/settings/+page.svelte](../src/routes/app/settings/+page.svelte) — User settings page for managing account profile details, theme preferences, and streak info.
- [app/verify-email/+page.svelte](../src/routes/app/verify-email/+page.svelte) — Email verification landing page with resend timer and status polling interval.

### `src/routes/courses/` & `src/routes/share/` (Public & Viewer Pages)

- [courses/[id]/+page.ts](../src/routes/courses/[id]/+page.ts) — Compatibility redirect route performing HTTP 308 forwarding to authenticated app course routes.
- [share/[token]/+page.svelte](../src/routes/share/[token]/+page.svelte) — Shared course and certificate landing page displaying preview metadata and "Claim Course" action button.

### `ml_backend/` (Python FastAPI Backend & ML Models)

- [download_models.py](../ml_backend/download_models.py) — Pre-downloads required HuggingFace model weights into cache during Docker build or setup.
- [main.py](../ml_backend/main.py) — FastAPI entry point defining CORS middleware, API key auth dependency, background model warmup lifespan, and HTTP endpoints.
- [requirements.txt](../ml_backend/requirements.txt) — Python package dependency specification (FastAPI, uvicorn, transformers, sentence-transformers, faiss-cpu, pydantic).
- [test_ml_backend.py](../ml_backend/test_ml_backend.py) — Pytest suite testing quiz fallbacks, AutoConfig model detection, lesson sanitization, and short text rejection.
- [fine_tuning/01_summarizer_finetune.py](../ml_backend/fine_tuning/01_summarizer_finetune.py) — **FLAGGED UNUSED/OFFLINE**: Standalone Colab fine-tuning script for Flan-T5 summarization (not executed at runtime).
- [fine_tuning/02_paraphraser_finetune.py](../ml_backend/fine_tuning/02_paraphraser_finetune.py) — **FLAGGED UNUSED/OFFLINE**: Standalone Colab fine-tuning script for Flan-T5 paraphrasing (not executed at runtime).
- [models/chat_assistant.py](../ml_backend/models/chat_assistant.py) — RAG-augmented study chat assistant using TinyLlama-1.1B or Flan-T5 with ChatML formatting and safety keyword filter.
- [models/lesson_generator.py](../ml_backend/models/lesson_generator.py) — RAG-grounded lesson page generator using Flan-T5-large with word count enforcement and markdown sanitization.
- [models/model_registry.py](../ml_backend/models/model_registry.py) — Thread-safe pipeline cache and inference lock (`inference_lock`) serializing CPU-bound model executions.
- [models/outline_generator.py](../ml_backend/models/outline_generator.py) — RAG-grounded course outline generator using Flan-T5-large with JSON parser and deterministic fallback.
- [models/paraphraser.py](../ml_backend/models/paraphraser.py) — Text paraphrasing model wrapper supporting academic, simple, and formal style prompts.
- [models/quiz_pipeline.py](../ml_backend/models/quiz_pipeline.py) — 3-stage quiz generator pipeline (QG, Distractor Generation, Schema Assembly) with grounded fallback question builder.
- [models/rag_pipeline.py](../ml_backend/models/rag_pipeline.py) — FAISS-backed RAG retriever using `sentence-transformers/all-MiniLM-L6-v2` for text embedding and vector search.
- [models/summarizer.py](../ml_backend/models/summarizer.py) — Text summarization model wrapper using Flan-T5.
- [schemas/types.py](../ml_backend/schemas/types.py) — Pydantic request and response models defining schema validation contracts for all ML endpoints.
- [vector_store/build_index.py](../ml_backend/vector_store/build_index.py) — **FLAGGED UNUSED/OFFLINE**: CLI script for manually building vector index from local files (not imported by `main.py`).

---

## 3. End-to-End Data Flow Traces

### a. Sign up / login / email verification

```
[User Input (+page.svelte)]
       │
       ▼
[handleSubmit()] ──> firebase/auth (client.ts) ──> Firebase Auth Service
                                                       │
                                                       ▼
[authStore (auth.svelte.ts)] <── onAuthStateChanged ── UserCredential
       │
       ├──> onSnapshot(doc(db, 'users', uid))
       │
       ▼
[SvelteKit API Request] ──> Authorization: Bearer <idToken>
                               │
                               ▼
                        verifySessionUser() (auth.ts:L23)
                               │
                        adminAuth.verifyIdToken()
                               │
                        adminDb.collection('users').doc(uid).get()
                               │
                   (If user doc missing in Firestore)
                               │
                        userDocRef.set({ uid, email, theme, streak, ... })
```

- **Network calls:** Client to Firebase Auth (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `signInWithPopup`), client to SvelteKit API.
- **Firestore reads/writes:** `users/{uid}` read (`auth.ts` line 41) and write (`auth.ts` lines 53–66).
- **Failure / Fallback behavior:** If Firestore profile creation fails in `auth.ts` line 68 (e.g. missing service account credentials), the error is logged with `console.warn` and execution continues. **SILENT FALLBACK**: Token verification succeeds and the user is authenticated, but the user's profile document is not created in Firestore.

---

### b. Create course → draft outline generation → outline review/edit → confirm & generate → per-module content generation → real-time UI update

```
[createCourse/+page.svelte] ──> POST /api/courses ──> verifySessionUser()
                                                            │
                                                     generateOutline() (provider.ts:L112)
                                                            │
                                                     callML('/outline') (client.ts:L41)
                                                            │
                                                            ▼
[Python FastAPI main.py] <── POST http://localhost:8000/outline
       │
       ▼
outline_model.generate_outline() (outline_generator.py:L32)
       │
       ├──> RAG context retrieve (rag_pipeline.py)
       ├──> Flan-T5 Inference under inference_lock
       └──> _parse_outline()  ──(If JSON invalid)──> _fallback_outline() [SILENT FALLBACK]
                                                           │
                                                           ▼
[courses/+server.ts:L70] <── Returns Course Outline JSON ──┘
       │
       ▼
runTransaction():
  ├── Read & update usage/{uid} (daily limit max 10)
  ├── Write courses/{courseId} (status: 'draft')
  └── Write courses/{courseId}/modules/{moduleId} (status: 'pending')
       │
       ▼
[DraftOutlineEditor.svelte] <── Render draft outline for human review
       │
       ├──> (User edits) ──> PATCH /api/courses/[id]/draft ──> Update draft in Firestore
       │
       └──> (Confirm) ──> POST /api/courses/[id]/draft ──> Set status: 'building'
                                                                   │
                                                                   ▼
[Frontend loop over moduleIds] ──> POST /api/modules/[id]/generate
                                            │
                                    runTransaction():
                                      ├── Check usage/{uid} (hourly max 30)
                                      └── Set module status: 'generating'
                                            │
                                            ▼
                                    generateLesson() / generateQuiz()
                                            │
                                            ▼
[Python FastAPI /lesson or /quiz] ──> Word count & content length check (lesson_generator.py:L87)
                                      ├── (If text < 40 words) ──> RuntimeError [DISCLOSED]
                                      └── (On success) ──> Return pages / questions JSON
                                                                   │
                                                                   ▼
[generate/+server.ts:L171] <── DOMPurify.sanitize() + Security Rules Check (no <h1>, external links)
       │
       ▼
Update module status: 'ready' (or 'failed' on error) in Firestore
       │
       ▼
[Frontend Firestore onSnapshot] ──> Real-time progress bar & module UI update
```

- **Network calls:** Client -> SvelteKit API `/api/courses`, `/api/courses/[id]/draft`, `/api/modules/[id]/generate`; SvelteKit server -> Python FastAPI `/outline`, `/lesson`, `/quiz`.
- **Firestore reads/writes:** Transactions reading/writing `usage/{uid}`, `courses/{courseId}`, and `courses/{courseId}/modules/{moduleId}`.
- **Failure / Fallback behavior:**
  1. If Python `_parse_outline()` fails to parse JSON, `_fallback_outline()` is called. **SILENT FALLBACK**: Returns a static 6-subtopic template outline to the frontend without an error message.
  2. If Python `generate_lesson()` produces text < 40 words or < 200 chars, it raises a `RuntimeError`. SvelteKit sets module `status: 'failed'` and returns HTTP 500. **DISCLOSED FALLBACK**: User sees module failure and can click Retry.

---

### c. Opening a lesson module, reading pages, marking complete (including streak transaction)

```
[lessons/[mid]/+page.svelte] ──> Read pages from Firestore snapshot
                                        │
                                 (User reads pages)
                                        │
                                        ▼
                            Click "Mark Complete"
                                        │
                                        ▼
                           POST /api/modules/[id]/complete (complete/+server.ts:L12)
                                        │
                                 verifySessionUser()
                                        │
                                 adminDb.runTransaction():
                                   ├── Read courses/{courseId} (verify owner)
                                   ├── Read courses/{courseId}/modules/{moduleId} (verify exists)
                                   ├── Read users/{uid} (streak data & badges)
                                   ├── Read users/{uid}/progress/{courseId} (completedModuleIds)
                                   ├── Evaluate IANA timezone date (today vs yesterday)
                                   ├── Update streak (increment if yesterday, reset if missed)
                                   ├── Evaluate badge rules ('First Step', '3-Day Streak', etc.)
                                   ├── Update users/{uid} ('streak.*', badges)
                                   ├── Set users/{uid}/progress/{courseId} (completedModuleIds)
                                   └── Update courses/{courseId} (progress.completed)
```

- **Network calls:** Client to SvelteKit `/api/modules/[id]/complete`.
- **Firestore reads/writes:** Reads `courses`, `modules`, `users`, `progress`; updates `users`, sets `progress`, updates `courses`.
- **Failure / Fallback behavior:** Invalid input or missing documents throw explicit errors returning 404/403/401. No silent fallbacks.

---

### d. Opening a quiz module, answering questions, completion, scoring

```
[quizzes/[mid]/+page.svelte] ──> Read questions from Firestore module document
                                        │
                                 (User selects options)
                                        │
                                 Calculate Score (%)
                                        │
                                        ▼
                            POST /api/modules/[id]/complete (complete/+server.ts)
                                        │
                                 Execute streak & progress transaction (same as 3c)
```

- **Failure / Fallback behavior:** If quiz generation used `_fallback_question()` in `quiz_pipeline.py` line 190, the quiz questions are deterministic multiple-choice questions grounded in the key point. **SILENT FALLBACK**: Presented as normal quiz questions to the end user.

---

### e. Sharing a course and another user importing/cloning it

```
[ShareModal.svelte] ──> POST /api/courses/[id]/share (share/+server.ts:L7)
                             │
                      Verify ownership & fetch ready modules
                             │
                      Generate 12-char token: crypto.randomBytes(6).toString('hex')
                             │
                      Set sharedCourses/{token} (snapshot of title, desc, format, modules)
                             │
                      Return share URL: /share/{token}
                             │
                             ▼
[Recipient opens /share/{token}] ──> GET /api/share/[token] (share/[token]/+server.ts:L7)
                                          │
                                   IP Rate Limit Check (ip_rate_limits/{hash}, max 100/hr)
                                          │
                                   Read sharedCourses/{token} & return preview metadata
                                          │
                                          ▼
                            Click "Claim Course"
                                          │
                                          ▼
                           POST /api/share/[token]/claim (claim/+server.ts:L6)
                                          │
                                   runTransaction():
                                     ├── Check users/{uid}/claims/{token} (prevent duplicate)
                                     ├── Read sharedCourses/{token} (verify not revoked)
                                     ├── (If self-claim) Return original courseId
                                     ├── Increment claimCount & importCount in sharedCourses/{token}
                                     ├── Create new courses/{newCourseId} owned by recipient
                                     ├── Copy module snapshots into courses/{newCourseId}/modules
                                     ├── Create empty users/{uid}/progress/{newCourseId}
                                     └── Record users/{uid}/claims/{token}
```

- **Network calls:** Client to `/api/courses/[id]/share`, GET `/api/share/[token]`, POST `/api/share/[token]/claim`.
- **Firestore reads/writes:** `sharedCourses/{token}`, `ip_rate_limits/{hash}`, `courses/{newCourseId}`, `users/{uid}/progress/{newCourseId}`, `users/{uid}/claims/{token}`.
- **Failure / Fallback behavior:** If shared link is revoked, returns HTTP 410 REVOKED. **DISCLOSED**.

---

### f. Using the AI Study Assistant chat

```
[AssistantChat.svelte] ──> getActiveContext() (Reads courses & modules via Client Firestore SDK)
                                 │
                          POST /api/chat (chat/+server.ts:L22)
                                 │
                          Verify session & enforce 60 msg/hr limit on usage/{uid}
                                 │
                          callML('/chat') (client.ts:L41) ──> POST http://localhost:8000/chat
                                                                       │
                                                                       ▼
[Python FastAPI chat_assistant.py] <── Check is_loaded() (If loading ──> 503 Service Unavailable)
       │
       ├──> Retrieve RAG context: rag.retrieve(user_message)
       ├──> Format ChatML prompt with <reference_material> & prompt injection safety rules
       ├──> Run TinyLlama / Flan-T5 under inference_lock
       └──> Safety keyword check _is_safe() ──(If unsafe)──> Return refusal message
                                                                       │
                                                                       ▼
[AssistantChat.svelte] <── Return { reply, sources } ──────────────────┘
```

- **Network calls:** Client to SvelteKit `/api/chat`, SvelteKit server to Python `/chat`.
- **Firestore reads/writes:** Client SDK reads `courses/{id}` and `modules/{id}`; server transaction updates `usage/{uid}` chat counter.
- **Failure / Fallback behavior:** If ML backend returns 503 during warmup, SvelteKit returns HTTP 503 with `"AI assistant is currently warming up..."`. However, `AssistantChat.svelte` catch block line 126 catches fetch errors and displays generic connection error. **SILENT/DEGRADED DISCLOSURE**.

---

### g. Summarize / paraphrase microservice calls

```
[Client UI] ──> POST /api/summarize  OR  POST /api/paraphrase
                       │
                Verify session & enforce 60 req/hr rate limit on usage/{uid}
                       │
                Call summarize() / paraphrase() (provider.ts)
                       │
                callML('/summarize') / callML('/paraphrase')
                       │
                       ▼
        [Python FastAPI main.py / summarizer.py / paraphraser.py]
                       │
                Run Flan-T5 model under inference_lock
                       │
                       ▼
[Client UI] <── Return { summary } / { paraphrase }
```

- **Failure / Fallback behavior:** On ML backend error, returns HTTP 500 with friendly client message. **DISCLOSED**.

---

### h. Knowledge base / document upload / RAG indexing flow

```
[app/knowledge/+page.svelte] ──> GET /api/documents ──> GET http://localhost:8000/rag-stats
                                                                   │
                                                            Return { chunk_count, has_documents }
                                                                   │
                                 (User drops .txt/.md files)       │
                                           │                       │
                                           ▼                       │
                                  POST /api/documents (documents/+server.ts:L56)
                                           │
                                    Verify session & validate text >= 20 chars
                                           │
                                    Forward to POST http://localhost:8000/documents
                                                                   │
                                                                   ▼
[Python FastAPI main.py] ──> add_documents() (rag_pipeline.py:L56)
                                    │
                             Chunk text (400 chars, 50 overlap)
                                    │
                             Embed with sentence-transformers/all-MiniLM-L6-v2
                                    │
                             Add vectors to faiss.IndexFlatL2
                                    │
                             Serialize to vector_store/index.faiss & docs.pkl
                                    │
                                    ▼
[app/knowledge/+page.svelte] <── Return { status: "ok", chunks_added: N }
```

- **Auto-seed behavior:** On Python backend boot, `_async_seed_rag()` (`main.py` line 102) checks if FAISS index is empty. If empty, automatically reads files from `vector_store/sample_docs/` and embeds them into the index. **SILENT BACKGROUND AUTO-SEED**.

---

## 4. API Contract Table

| Method   | Path                            | Auth Requirement         | Request Shape                                                                                                   | Response Shape                                                                                                     | Rate Limiting                                    | Caching                   | Called By (Frontend Component / Page)                                                                          |
| -------- | ------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/healthcheck` _(ML)_           | None                     | None                                                                                                            | `{ status: str, models_loaded: Record<str, bool> }`                                                                | No                                               | No                        | `pingMLBackend()` ([client.ts](../src/lib/server/ai/client.ts#L93))                                            |
| `GET`    | `/rag-stats` _(ML)_             | `X-API-Key`              | None                                                                                                            | `{ chunk_count: int, has_documents: bool }`                                                                        | No                                               | No                        | `/api/documents` ([documents/+server.ts](../src/routes/api/documents/+server.ts#L34))                          |
| `POST`   | `/summarize` _(ML)_             | `X-API-Key`              | `{ text: str, max_length?: int, min_length?: int }`                                                             | `{ summary: str }`                                                                                                 | No                                               | Model cached              | `/api/summarize` ([summarize/+server.ts](../src/routes/api/summarize/+server.ts#L56))                          |
| `POST`   | `/paraphrase` _(ML)_            | `X-API-Key`              | `{ text: str, style?: str }`                                                                                    | `{ paraphrase: str }`                                                                                              | No                                               | Model cached              | `/api/paraphrase` ([paraphrase/+server.ts](../src/routes/api/paraphrase/+server.ts#L55))                       |
| `POST`   | `/outline` _(ML)_               | `X-API-Key`              | `{ topic: str, module_count: int, format: str, reference_text?: str }`                                          | `{ title: str, description: str, modules: OutlineModule[] }`                                                       | No                                               | Model cached              | `/api/courses` ([courses/+server.ts](../src/routes/api/courses/+server.ts#L46))                                |
| `POST`   | `/lesson` _(ML)_                | `X-API-Key`              | `{ course_title: str, module_title: str, learning_objective: str, key_points: str[], course_outline?: dict[] }` | `{ pages: LessonPage[] }`                                                                                          | No                                               | Model cached              | `/api/modules/[id]/generate` ([generate/+server.ts](../src/routes/api/modules/[id]/generate/+server.ts#L137))  |
| `POST`   | `/quiz` _(ML)_                  | `X-API-Key`              | `{ course_title: str, module_title: str, learning_objective: str, key_points: str[], lesson_body?: str }`       | `{ questions: QuizQuestion[] }`                                                                                    | No                                               | Model cached              | `/api/modules/[id]/generate` ([generate/+server.ts](../src/routes/api/modules/[id]/generate/+server.ts#L189))  |
| `POST`   | `/chat` _(ML)_                  | `X-API-Key`              | `{ messages: ChatMessage[], course_context?: str }`                                                             | `{ reply: str, sources?: ChatSource[] }`                                                                           | No                                               | Model cached              | `/api/chat` ([chat/+server.ts](../src/routes/api/chat/+server.ts#L63))                                         |
| `POST`   | `/documents` _(ML)_             | `X-API-Key`              | `{ texts: string[] }`                                                                                           | `{ status: str, chunks_added: int }`                                                                               | No                                               | No                        | `/api/documents` ([documents/+server.ts](../src/routes/api/documents/+server.ts#L82))                          |
| `DELETE` | `/documents` _(ML)_             | `X-API-Key`              | None                                                                                                            | `{ status: str, message: str }`                                                                                    | No                                               | No                        | `/api/documents` ([documents/+server.ts](../src/routes/api/documents/+server.ts#L110))                         |
| `GET`    | `/api/admin/analytics`          | Firebase Bearer (Admin)  | None                                                                                                            | `{ analytics: { coursesGenerated, completionRate, averageQuizAccuracy, flaggedContentCount, fallbackFrequency } }` | No                                               | No                        | `/app/admin` ([admin/+page.svelte](../src/routes/app/admin/+page.svelte))                                      |
| `POST`   | `/api/chat`                     | Firebase Bearer          | `{ messages: ChatMessage[], courseContext?: str }`                                                              | `{ reply: str, sources: ChatSource[] }`                                                                            | Yes (60 msg/hr per UID)                          | No                        | [AssistantChat.svelte](../src/lib/components/AssistantChat.svelte#L99)                                         |
| `POST`   | `/api/courses`                  | Firebase Bearer          | `{ topic: str, moduleCount: int, format: str, referenceText?: str, level?: str, goal?: str, tags?: str[] }`     | `{ courseId: str, status: 'draft', outline: CourseOutline }`                                                       | Yes (10 courses/day per UID)                     | Short-lived outline cache | `/app/courses/createCourse` ([createCourse/+page.svelte](../src/routes/app/courses/createCourse/+page.svelte)) |
| `DELETE` | `/api/courses/[id]`             | Firebase Bearer          | None                                                                                                            | 204 No Content                                                                                                     | No                                               | No                        | `/app/courses/[id]` ([courses/[id]/+page.svelte](../src/routes/app/courses/[id]/+page.svelte))                 |
| `GET`    | `/api/courses/[id]/certificate` | Firebase Bearer          | None                                                                                                            | `{ certificate: { id, courseId, courseTitle, studentName, issuedAt, shareUrl } }`                                  | No                                               | No                        | `/app/courses/[id]` & `/courses/[id]/complete`                                                                 |
| `PATCH`  | `/api/courses/[id]/draft`       | Firebase Bearer          | `{ title: str, description: str, level?: str, tags?: str[], modules: ModuleDraft[] }`                           | `{ status: 'draft', message: str }`                                                                                | No                                               | No                        | [DraftOutlineEditor.svelte](../src/lib/components/DraftOutlineEditor.svelte)                                   |
| `POST`   | `/api/courses/[id]/draft`       | Firebase Bearer          | None                                                                                                            | `{ status: 'building', courseId: str, moduleIds: string[], message: str }`                                         | No                                               | No                        | [DraftOutlineEditor.svelte](../src/lib/components/DraftOutlineEditor.svelte)                                   |
| `POST`   | `/api/courses/[id]/modules/add` | Firebase Bearer          | `{ title?: str, summary?: str, type?: 'lesson'                                                                  | 'quiz' }`                                                                                                          | `{ moduleId: str, courseId: str, message: str }` | No                        | No                                                                                                             | `/app/courses/[id]` ([courses/[id]/+page.svelte](../src/routes/app/courses/[id]/+page.svelte)) |
| `POST`   | `/api/courses/[id]/share`       | Firebase Bearer          | None                                                                                                            | `{ token: str, url: str }`                                                                                         | No                                               | No                        | [ShareModal.svelte](../src/lib/components/ShareModal.svelte)                                                   |
| `DELETE` | `/api/courses/[id]/share`       | Firebase Bearer          | None                                                                                                            | 204 No Content                                                                                                     | No                                               | No                        | [ShareModal.svelte](../src/lib/components/ShareModal.svelte)                                                   |
| `GET`    | `/api/documents`                | Firebase Bearer          | None                                                                                                            | `{ chunk_count: int, has_documents: bool }`                                                                        | No                                               | No                        | `/app/knowledge` ([knowledge/+page.svelte](../src/routes/app/knowledge/+page.svelte#L37))                      |
| `POST`   | `/api/documents`                | Firebase Bearer          | `{ texts: string[] }`                                                                                           | `{ status: str, chunks_added: int }`                                                                               | No                                               | No                        | `/app/knowledge` ([knowledge/+page.svelte](../src/routes/app/knowledge/+page.svelte#L121))                     |
| `DELETE` | `/api/documents`                | Firebase Bearer          | None                                                                                                            | `{ status: str, message: str }`                                                                                    | No                                               | No                        | `/app/knowledge` ([knowledge/+page.svelte](../src/routes/app/knowledge/+page.svelte#L153))                     |
| `POST`   | `/api/flag`                     | Firebase Bearer          | `{ courseId: str, moduleId?: str, contentType: str, reason: str }`                                              | `{ status: 'ok', flagId: str }`                                                                                    | No                                               | No                        | `/courses/[id]/lessons/[mid]` & `/quizzes/[mid]`                                                               |
| `POST`   | `/api/modules/[id]/complete`    | Firebase Bearer          | `{ courseId: str, timezone?: str }`                                                                             | `{ streak: { current: int, extended: bool } }`                                                                     | No                                               | No                        | `/courses/[id]/lessons/[mid]` & `/quizzes/[mid]`                                                               |
| `POST`   | `/api/modules/[id]/generate`    | Firebase Bearer          | `{ courseId: str }`                                                                                             | `{ status: 'ready', message: str }`                                                                                | Yes (30 mod/hr per UID)                          | Yes (`getCachedOutline`)  | `/app/courses/createCourse` & [DraftOutlineEditor.svelte](../src/lib/components/DraftOutlineEditor.svelte)     |
| `POST`   | `/api/modules/[id]/retry`       | Firebase Bearer          | `{ courseId: str }`                                                                                             | 202 Accepted                                                                                                       | No                                               | No                        | `/app/courses/[id]` ([courses/[id]/+page.svelte](../src/routes/app/courses/[id]/+page.svelte))                 |
| `POST`   | `/api/paraphrase`               | Firebase Bearer          | `{ text: str, style?: 'academic'                                                                                | 'simple'                                                                                                           | 'formal' }`                                      | `{ paraphrase: str }`     | Yes (60 req/hr per UID)                                                                                        | No                                                                                             | Contextual text action tools |
| `GET`    | `/api/share/[token]`            | Public (IP Rate limited) | None                                                                                                            | `{ title: str, description: str, sharedByName: str, moduleCount: int }`                                            | Yes (100 req/hr per IP)                          | No                        | `/share/[token]` ([share/[token]/+page.svelte](../src/routes/share/[token]/+page.svelte))                      |
| `POST`   | `/api/share/[token]/claim`      | Firebase Bearer          | None                                                                                                            | `{ courseId: str, isSelfClaim: bool, alreadyClaimed: bool }`                                                       | No                                               | No                        | `/share/[token]` ([share/[token]/+page.svelte](../src/routes/share/[token]/+page.svelte))                      |
| `GET`    | `/api/spaced-repetition/due`    | Firebase Bearer          | None                                                                                                            | `{ dueQuestions: DueQuestion[], today: str, count: int }`                                                          | No                                               | No                        | `/app` ([app/+page.svelte](../src/routes/app/+page.svelte))                                                    |
| `POST`   | `/api/summarize`                | Firebase Bearer          | `{ text: str, maxLength?: int, minLength?: int }`                                                               | `{ summary: str }`                                                                                                 | Yes (60 req/hr per UID)                          | No                        | Contextual text action tools                                                                                   |

---

## 5. Firestore Schema As It Actually Exists

Below is the document schema mapping verified against source code reads and writes, cross-referenced with `firestore.rules`.

### Collection: `users/{uid}`

- **Written by:** `src/lib/server/auth.ts` (lines 53–66), `src/lib/stores/theme.svelte.ts` (line 34), `src/routes/api/modules/[id]/complete/+server.ts` (lines 142–149).
- **Read by:** `src/lib/stores/auth.svelte.ts` (line 61), `src/lib/server/auth.ts` (line 41), `src/routes/api/courses/[id]/share/+server.ts` (line 72), `src/routes/api/admin/analytics/+server.ts` (line 10), `src/routes/api/modules/[id]/complete/+server.ts` (line 60).
- **Actual Fields:**
  - `uid`: `string`
  - `email`: `string`
  - `displayName`: `string | null`
  - `photoURL`: `string | null`
  - `theme`: `string` (`'light'` | `'dark'`)
  - `badges`: `string[]` (e.g. `['First Step', '3-Day Streak']`)
  - `longestStreak`: `number`
  - `isAdmin`: `boolean`
  - `streak`: `map` `{ current: number, longest: number, lastStudiedOn: string | null, timezone: string }`
  - `createdAt`: `timestamp`
- **Security Rules Cross-Check:**
  - [firestore.rules](../firestore.rules#L7-L12) allows `read` for owner (`isOwner(uid)`), and allows `update` for owner **only if diff contains only `['theme']`**. Creation and deletion are set to `false`.
  - **SECURITY AUDIT FINDING:** `themeStore.setTheme()` updates `theme` via Client SDK, which matches the rule. All streak and badge updates occur via Admin SDK in `complete/+server.ts`, bypassing client rules safely.

### Subcollection: `users/{uid}/progress/{courseId}`

- **Written by:** `src/routes/api/modules/[id]/complete/+server.ts` (lines 152–160), `src/routes/api/share/[token]/claim/+server.ts` (lines 99–105).
- **Read by:** `src/routes/api/modules/[id]/complete/+server.ts` (line 66).
- **Actual Fields:**
  - `courseId`: `string`
  - `completedModuleIds`: `string[]`
  - `quizScores`: `map` (e.g. `{ moduleId: score }`)
  - `lastPage`: `map`
  - `updatedAt`: `timestamp`
- **Security Rules Cross-Check:** Allowed `read, write` for owner (`isOwner(uid)`).

### Subcollection: `users/{uid}/claims/{token}`

- **Written by:** `src/routes/api/share/[token]/claim/+server.ts` (lines 108–111).
- **Read by:** `src/routes/api/share/[token]/claim/+server.ts` (line 18).
- **Actual Fields:** `courseId`: `string`, `claimedAt`: `timestamp`.
- **Security Rules Cross-Check:** Managed strictly by Admin SDK in server transaction.

### Collection: `courses/{courseId}`

- **Written by:** `src/routes/api/courses/+server.ts` (lines 101–119), `/api/courses/[id]/+server.ts` (delete), `/api/courses/[id]/draft/+server.ts`, `/api/courses/[id]/modules/add/+server.ts`, `/api/modules/[id]/generate/+server.ts`, `/api/modules/[id]/complete/+server.ts`, `/api/modules/[id]/retry/+server.ts`, `/api/share/[token]/claim/+server.ts`.
- **Read by:** `AssistantChat.svelte` (line 52), `/app/courses/[id]/+page.svelte`, `/api/courses/[id]/certificate/+server.ts`, `/api/courses/[id]/share/+server.ts`, `/api/admin/analytics/+server.ts`.
- **Actual Fields:**
  - `id`: `string`
  - `ownerUid`: `string`
  - `title`: `string`
  - `description`: `string`
  - `topic`: `string`
  - `format`: `'lessons_and_quizzes'` | `'quizzes_only'`
  - `moduleCount`: `number`
  - `status`: `'draft'` | `'building'` | `'ready'` | `'partial'` | `'failed'`
  - `accent`: `'violet'` | `'amber'` | `'emerald'`
  - `level`: `'beginner'` | `'intermediate'` | `'advanced'`
  - `goal`: `string`
  - `tags`: `string[]`
  - `estimatedMinutes`: `number`
  - `progress`: `map` `{ completed: number, total: number }`
  - `clonedFrom`: `string | null`
  - `createdAt`: `timestamp`
  - `updatedAt`: `timestamp`
- **Security Rules Cross-Check:** [firestore.rules](../firestore.rules#L19-L21) allows `read` for owner (`isOwner(resource.data.ownerUid)`), `write` set to `false` (Admin SDK only).

### Subcollection: `courses/{courseId}/modules/{moduleId}`

- **Written by:** `/api/courses/+server.ts`, `/api/courses/[id]/draft/+server.ts`, `/api/courses/[id]/modules/add/+server.ts`, `/api/modules/[id]/generate/+server.ts`, `/api/modules/[id]/retry/+server.ts`, `/api/share/[token]/claim/+server.ts`.
- **Read by:** `AssistantChat.svelte` (line 59), `/app/courses/[id]/[moduleId]/+page.svelte`, `/courses/[id]/lessons/[mid]/+page.svelte`, `/courses/[id]/quizzes/[mid]/+page.svelte`, `/api/spaced-repetition/due/+server.ts`.
- **Actual Fields:**
  - `id`: `string`, `order`: `number`, `type`: `'lesson'` | `'quiz'`, `title`: `string`, `summary`: `string`, `learningObjective`: `string`, `keyPoints`: `string[]`, `estimatedMinutes`: `number`, `status`: `'pending'` | `'generating'` | `'ready'` | `'failed'`, `error`: `string | null`, `attempts`: `number`, `model`: `string`, `generatedAt`: `timestamp`, `tokensIn`: `number`, `tokensOut`: `number`.
  - **Lesson Modules:** `pages`: `Array<{ order: number, heading: string, subheading?: string, body: string }>`
  - **Quiz Modules:** `questions`: `Array<{ question: string, options: string[], answerIndex: number, explanation: string, nextReviewDate?: string, intervalDays?: number }>`
- **Security Rules Cross-Check:** [firestore.rules](../firestore.rules#L23-L26) allows `read` for parent course owner; `write` set to `false` (Admin SDK only).

### Collection: `sharedCourses/{token}`

- **Written by:** `src/routes/api/courses/[id]/share/+server.ts`, `src/routes/api/share/[token]/claim/+server.ts`.
- **Read by:** `src/routes/api/share/[token]/+server.ts`, `src/routes/api/share/[token]/claim/+server.ts`.
- **Actual Fields:** `token`: `string`, `courseId`: `string`, `sharedByUid`: `string`, `sharedByName`: `string`, `claimCount`: `number`, `importCount`: `number`, `revoked`: `boolean`, `createdAt`: `timestamp`, `snapshot`: `map` (`title`, `description`, `format`, `modules`).
- **Security Rules Cross-Check:** Allowed `read` for signed-in users if not revoked (`!resource.data.revoked`); `write` set to `false` (Admin SDK only).

### Collection: `usage/{uid}`

- **Written by:** `/api/courses/+server.ts`, `/api/modules/[id]/generate/+server.ts`, `rateLimiter.ts` (`chat`, `summarize`, `paraphrase`).
- **Actual Fields:** `coursesToday`, `day`, `modulesThisHour`, `hour`, `chatCount`, `chatHour`, `summarizeCount`, `summarizeHour`, `paraphraseCount`, `paraphraseHour`.
- **Security Rules Cross-Check:** Allowed `read` for owner; `write` set to `false` (Admin SDK only).

### Collection: `flags/{flagId}`

- **Written by:** `src/routes/api/flag/+server.ts`.
- **Read by:** `src/routes/api/admin/analytics/+server.ts`.
- **Actual Fields:** `id`, `userId`, `userEmail`, `courseId`, `moduleId`, `contentType`, `reason`, `createdAt`.
- **Security Rules Cross-Check:** Admin SDK only.

### Collection: `ip_rate_limits/{ipHash}`

- **Written/Read by:** `src/routes/api/share/[token]/+server.ts` via `rateLimiter.ts`. Admin SDK only.

---

## 6. Environment & Configuration Audit

| Environment Variable                  | Consuming File(s)                                                                                                   | Status        | In `.env.example`? | Validation / Match Check                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUBLIC_FIREBASE_API_KEY`             | [client.ts](../src/lib/firebase/client.ts#L5)                                                                       | Required      | Yes                | None                                                                                                                                                               |
| `PUBLIC_FIREBASE_AUTH_DOMAIN`         | [client.ts](../src/lib/firebase/client.ts#L6)                                                                       | Required      | Yes                | None                                                                                                                                                               |
| `PUBLIC_FIREBASE_PROJECT_ID`          | [client.ts](../src/lib/firebase/client.ts#L7), [admin.ts](../src/lib/server/admin.ts#L4)                            | Required      | Yes                | None                                                                                                                                                               |
| `PUBLIC_FIREBASE_STORAGE_BUCKET`      | [client.ts](../src/lib/firebase/client.ts#L8)                                                                       | Required      | Yes                | None                                                                                                                                                               |
| `PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | [client.ts](../src/lib/firebase/client.ts#L9)                                                                       | Required      | Yes                | None                                                                                                                                                               |
| `PUBLIC_FIREBASE_APP_ID`              | [client.ts](../src/lib/firebase/client.ts#L10)                                                                      | Required      | Yes                | None                                                                                                                                                               |
| `PUBLIC_FIREBASE_USE_EMULATOR`        | [client.ts](../src/lib/firebase/client.ts#L27)                                                                      | Optional      | Yes                | None                                                                                                                                                               |
| `FIREBASE_PROJECT_ID`                 | [admin.ts](../src/lib/server/admin.ts#L11)                                                                          | Required      | Yes                | Fallback string provided in code (`study-fd50d`)                                                                                                                   |
| `FIREBASE_SERVICE_ACCOUNT`            | [admin.ts](../src/lib/server/admin.ts#L33)                                                                          | Prod Required | Yes                | Validated via `JSON.parse()` in `admin.ts`                                                                                                                         |
| `FIRESTORE_EMULATOR_HOST`             | [admin.ts](../src/lib/server/admin.ts#L7)                                                                           | Optional      | **MISSING**        | Checked in `admin.ts`                                                                                                                                              |
| `FIREBASE_AUTH_EMULATOR_HOST`         | [admin.ts](../src/lib/server/admin.ts#L7)                                                                           | Optional      | **MISSING**        | Checked in `admin.ts`                                                                                                                                              |
| `ML_BACKEND_URL`                      | [client.ts](../src/lib/server/ai/client.ts#L12), [documents/+server.ts](../src/routes/api/documents/+server.ts#L16) | Optional      | Yes                | Fallback `http://localhost:8000`                                                                                                                                   |
| `ML_BACKEND_API_KEY`                  | [client.ts](../src/lib/server/ai/client.ts#L17), [main.py](../ml_backend/main.py#L62)                               | Prod Required | Yes                | **NO CROSS-SERVICE MATCH CHECK!** SvelteKit and FastAPI read keys independently. If keys mismatch, requests fail with 401 Unauthorized without startup validation. |
| `APP_ENV`                             | [main.py](../ml_backend/main.py#L63)                                                                                | Optional      | Yes _(commented)_  | Enforces non-empty `ML_BACKEND_API_KEY` in production mode                                                                                                         |
| `PORT`                                | `ml_backend/.env.example`                                                                                           | Optional      | Yes                | Default: 8000                                                                                                                                                      |
| `ALLOWED_ORIGINS`                     | [main.py](../ml_backend/main.py#L149)                                                                               | Optional      | Yes                | Validates wildcard prohibiting in production mode                                                                                                                  |
| `SUMMARIZER_MODEL_ID`                 | [summarizer.py](../ml_backend/models/summarizer.py#L20)                                                             | Optional      | Yes                | Default `google/flan-t5-base`                                                                                                                                      |
| `PARAPHRASER_MODEL_ID`                | [paraphraser.py](../ml_backend/models/paraphraser.py#L20)                                                           | Optional      | Yes                | Default `google/flan-t5-base`                                                                                                                                      |
| `OUTLINE_MODEL_ID`                    | [outline_generator.py](../ml_backend/models/outline_generator.py#L21)                                               | Optional      | Yes                | Default `google/flan-t5-large`                                                                                                                                     |
| `LESSON_MODEL_ID`                     | [lesson_generator.py](../ml_backend/models/lesson_generator.py#L19)                                                 | Optional      | Yes                | Default `google/flan-t5-large`                                                                                                                                     |
| `CHAT_MODEL_ID`                       | [chat_assistant.py](../ml_backend/models/chat_assistant.py#L23)                                                     | Optional      | Yes                | Default `TinyLlama/TinyLlama-1.1B-Chat-v1.0`                                                                                                                       |
| `EMBED_MODEL_ID`                      | [rag_pipeline.py](../ml_backend/models/rag_pipeline.py#L27)                                                         | Optional      | Yes                | Default `sentence-transformers/all-MiniLM-L6-v2`                                                                                                                   |
| `FAISS_INDEX_PATH`                    | [rag_pipeline.py](../ml_backend/models/rag_pipeline.py#L28)                                                         | Optional      | Yes                | Default `vector_store/index.faiss`                                                                                                                                 |
| `FAISS_DOCS_PATH`                     | [rag_pipeline.py](../ml_backend/models/rag_pipeline.py#L29)                                                         | Optional      | Yes                | Default `vector_store/docs.pkl`                                                                                                                                    |

---

## 7. Fallback & Error-Handling Inventory

1. **Course Outline Generation Parsing Fallback**
   - **Location:** `ml_backend/models/outline_generator.py` (lines 133–167, `_fallback_outline`)
   - **Trigger:** Flan-T5 model generates text that fails JSON parsing or does not contain required module list length.
   - **Action/Result:** Returns a static template with subtopic labels ("Fundamentals & Overview", "Core Principles & Concepts", etc.).
   - **Persisted / Shown:** Persisted to Firestore as a course draft and displayed to the user in `DraftOutlineEditor.svelte`.
   - **Evaluation:** ACCEPTABLE & DISCLOSED. The user reviews and edits the draft in the interactive editor before confirming generation.
   - **RISKY PATTERN:** Line 150 `mod_title = f"{topic}: {subtopic}"` prepends the course topic title to the subtopic title in fallback mode (Open Issue d).

2. **Quiz Question Generation Grounded Fallback**
   - **Location:** `ml_backend/models/quiz_pipeline.py` (lines 190–205, `_fallback_question`)
   - **Trigger:** Question generation (QG) model or distractor generation (DG) model fails after 3 retries, or fails to produce 3 unique distractors.
   - **Action/Result:** Produces a deterministic multiple-choice question grounded in the module key point: `"Which of the following best describes the core concept of '{key_point}'?"` with 4 template options. Sets `is_fallback: True`.
   - **Persisted / Shown:** Persisted to Firestore as module `questions` array and presented during quiz taking.
   - **Evaluation:** APPROPRIATE. The question remains grounded in the module's key point and provides valid MCQ functionality rather than failing the entire quiz module.

3. **Lesson Generation Content Length Enforcement (NO PLACEHOLDER TEXT)**
   - **Location:** `ml_backend/models/lesson_generator.py` (lines 87–94) & `src/routes/api/modules/[id]/generate/+server.ts` (lines 225–256)
   - **Trigger:** Generated lesson body contains < 40 words or < 200 characters.
   - **Action/Result:** Python backend raises a `RuntimeError` (`"Lesson generation produced insufficient content..."`). SvelteKit catches this error, updates module status to `'failed'` with `error: message` in Firestore, and updates course status to `'partial'`.
   - **Persisted / Shown:** Module status marked as `'failed'` in Firestore; error message and Retry button displayed to user.
   - **Evaluation:** EXCELLENT / NO SILENT PLACEHOLDER. Failed content is explicitly rejected and marked as failed instead of writing generic filler text to Firestore.

4. **Chat Assistant Background Warmup Check**
   - **Location:** `ml_backend/models/chat_assistant.py` (line 97, `is_loaded()`)
   - **Trigger:** Chat prompt received while TinyLlama model is still loading in background thread.
   - **Action/Result:** Raises `RuntimeError("Chat model is still loading...")`. SvelteKit `/api/chat` catches error and returns HTTP 503 with `"AI assistant is currently warming up. Please try again in a few seconds."`.
   - **Persisted / Shown:** Displayed in chat drawer.
   - **Evaluation:** APPROPRIATE. Prevents request thread hanging for 180s on CPU cold start.

5. **Firestore User Profile Creation Catch Block**
   - **Location:** `src/lib/server/auth.ts` (line 68)
   - **Trigger:** Firestore read/set fails during token verification (e.g. invalid `FIREBASE_SERVICE_ACCOUNT` or emulator offline).
   - **Action/Result:** Logs warning `console.warn(...)` and returns `AuthenticatedUser` payload without creating profile doc in Firestore.
   - **Persisted / Shown:** SILENT FALLBACK. Token verification succeeds, but user document is missing in Firestore.

---

## 8. Test Coverage Map

| Feature Area                                                                  | Vitest Suite                                                                            | Playwright E2E                                             | Pytest Suite                                                                                                       | Uncovered Flows from Section 3                                                                                      |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Section 3a** (Sign up / login / email verification)                         | Unit test in `auth.test.ts` (ID token verification & profile creation)                  | Partial (verifies page title)                              | None                                                                                                               | Email verification polling (`verify-email/+page.svelte`) & Google SSO popup flows are uncovered by automated tests. |
| **Section 3b** (Course creation -> draft -> confirm -> per-module generation) | Covered in `courses.test.ts` & `modules.test.ts`                                        | Covered in `userJourney.e2e.ts` (mocked API route journey) | `test_quiz_fallback_question`, `test_lesson_body_sanitization`, `test_outline_fallback_titles_topic_parameterized` | Real unmocked end-to-end AI generation via actual ML backend is uncovered in E2E.                                   |
| **Section 3c** (Lesson module reading, page nav, streak completion)           | Covered in `modules.test.ts` (tests `/api/modules/[id]/complete` & streak calculations) | Covered in `userJourney.e2e.ts`                            | None                                                                                                               | Real browser UI page-by-page lesson navigation.                                                                     |
| **Section 3d** (Quiz module, answering, scoring, completion)                  | Covered in `modules.test.ts`                                                            | Covered in `userJourney.e2e.ts`                            | `test_quiz_fallback_question` & `test_quiz_generation_fallback_integration`                                        | Score computation for partial quiz answers in Svelte component.                                                     |
| **Section 3e** (Share course & claim/clone course)                            | **Zero Vitest coverage** for `/api/courses/[id]/share` and `/api/share/[token]/claim`   | **Zero Playwright coverage**                               | None                                                                                                               | **FLOW 3e HAS ZERO AUTOMATED TEST COVERAGE.**                                                                       |
| **Section 3f** (AI Study Assistant chat drawer)                               | Covered in `microservices.test.ts` (tests `/api/chat` auth & input validation)          | **Zero Playwright coverage**                               | `test_autoconfig_architecture_detection`                                                                           | Real context extraction from client Firestore in `AssistantChat.svelte`.                                            |
| **Section 3g** (Summarize / paraphrase microservices)                         | Covered in `microservices.test.ts` (tests `/api/summarize` & `/api/paraphrase` routes)  | **Zero Playwright coverage**                               | None                                                                                                               | Frontend UI text tool invocation.                                                                                   |
| **Section 3h** (Knowledge base / document upload / RAG indexing)              | **Zero Vitest coverage** for `/api/documents`                                           | **Zero Playwright coverage**                               | RAG pipeline tested indirectly                                                                                     | **FLOW 3h HAS ZERO TEST COVERAGE for SvelteKit API proxy endpoints (`/api/documents`).**                            |

---

## 9. Inconsistencies & Tech Debt

1. **Legacy Redirection Routes**: `src/routes/create/+page.svelte` and `src/routes/dashboard/+page.svelte` exist solely as 1-line client-side redirects to `/app/courses/createCourse` and `/app`.
2. **Outdated Model Identifier String in Firestore**: `src/routes/api/courses/+server.ts` line 138 and `modules/add/+server.ts` line 58 write `model: 'gemini-2.5-flash'` into Firestore module metadata, even though AI generation has been migrated to the self-hosted Python FastAPI backend (`Flan-T5` / `TinyLlama`).
3. **Hardcoded Analytics Response**: `src/routes/api/admin/analytics/+server.ts` lines 39–44 returns hardcoded dummy stats for `averageQuizAccuracy` (88%) and `fallbackStats` (`geminiCount: 92, mlBackendCount: 8, fallbackPercentage: 8.0`) instead of aggregating live Firestore database data.
4. **Client-Side Firestore Context Extraction in Chat**: `AssistantChat.svelte` lines 48–83 queries Firestore directly from the browser JS SDK (`getDoc(doc(db, 'courses', courseId))`) to construct chat context, bypassing server-side validation and sending un-sanitized module text over the wire to `/api/chat`.
5. **Lack of Startup Cross-Service Key Validation**: SvelteKit server (`client.ts`) and Python backend (`main.py`) both read `ML_BACKEND_API_KEY` independently from `.env`, but neither validates key agreement during application startup or healthcheck.

---

## 10. Open Issues Carried Into This Audit

### (a) ML backend occasionally unreachable (fetch failed / 503) with no clear frontend messaging

- **Status:** **PARTIALLY RESOLVED IN SERVER ROUTE, UNHANDLED IN CHAT UI.**
- **Findings:** In SvelteKit AI client (`src/lib/server/ai/client.ts` lines 68, 79), network failures and 503 responses throw `MLBackendError`. SvelteKit routes `/api/chat`, `/api/summarize`, and `/api/paraphrase` catch `MLBackendError` and return clean HTTP 503/500 JSON. However, in `AssistantChat.svelte` (line 126), non-200 HTTP responses fall into a generic catch block showing `"Sorry, I encountered an issue sending your message. Please check your connection."` without distinguishing 503 model warmup from network offline state.

### (b) A Firestore transaction with reads/writes out of order

- **Status:** **FULLY RESOLVED.**
- **Findings:** Verified all Firestore transactions across the codebase (`auth.ts`, `rateLimiter.ts`, `/api/courses/+server.ts`, `/api/courses/[id]/draft/+server.ts`, `/api/courses/[id]/modules/add/+server.ts`, `/api/modules/[id]/generate/+server.ts`, `/api/modules/[id]/complete/+server.ts`, `/api/share/[token]/claim/+server.ts`). All `transaction.get()` calls occur strictly before any `transaction.set()` or `transaction.update()` operations.

### (c) A lesson-generation fallback that produces generic placeholder text indistinguishable from real content

- **Status:** **FULLY RESOLVED.**
- **Findings:** Inspected `ml_backend/models/lesson_generator.py` (lines 86–94) and `src/routes/api/modules/[id]/generate/+server.ts` (lines 225–256). In `lesson_generator.py`, if generated text is under 40 words or 200 characters, it raises a `RuntimeError`. SvelteKit catches this error, updates module status to `'failed'` with `error: message`, and updates course status to `'partial'`. Generic placeholder text is **NO LONGER written to Firestore as ready content**.

### (d) Module titles in course outlines appearing to duplicate/echo the course title instead of generating distinct titles

- **Status:** **STILL PRESENT IN FALLBACK PATH.**
- **Findings:** Inspected `ml_backend/models/outline_generator.py`. While line 63 in the model prompt explicitly instructs `"Module titles must be concise, distinct subtopic titles... Do NOT repeat the full course title"`, line 150 inside `_fallback_outline()` explicitly sets: `mod_title = f"{topic}: {subtopic}"`. When the Flan-T5 model fails JSON parsing and triggers `_fallback_outline()`, every generated module title echoes the full course topic title (e.g. `"Cell Biology: Fundamentals & Overview"`).
