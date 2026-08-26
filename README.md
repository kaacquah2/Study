# Study AI — Adaptive AI-Powered Learning System

[![Svelte](https://img.shields.io/badge/Svelte-v5.56-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev/)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-v2.63-FF3E00?logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![Vite](https://img.shields.io/badge/Vite-v8.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4.3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-v12.16-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-v6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python FastAPI](https://img.shields.io/badge/Python-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Ollama](https://img.shields.io/badge/Ollama-Local_LLM-000000?logo=ollama&logoColor=white)](https://ollama.com/)
[![Upstash Redis](https://img.shields.io/badge/Redis-Upstash-00E599?logo=redis&logoColor=black)](https://upstash.com/)
[![Vitest](https://img.shields.io/badge/Vitest-v4.1-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-v1.60-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Deploy Netlify](https://img.shields.io/badge/Deploy-Netlify-00AD9F?logo=netlify&logoColor=white)](https://www.netlify.com/)

**Study AI** is an **Adaptive AI-Powered Learning System** engineered around a central **Learning Intelligence Engine**. Rather than functioning as a collection of isolated AI utilities, the platform continuously logs student interaction signals (lesson reads, quiz performance, active recall errors, and FSRS review states) into an authoritative learning analytics stream. The engine synthesizes these signals to compute defensible mastery estimates and answer the core educational question: _**"What should this student study next, and why?"**_

Developed as a Final Year Project for the Department of Computer Science at **Kwame Nkrumah University of Science & Technology (KNUST)**.

---

## 📚 Academic & Architectural Documentation

- 🏛️ **[System Architecture Document (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md):** Learning Intelligence Engine pipeline, `LearningEvent` schema, heuristic mastery formula derivation, adaptation rules, and multi-model registry.
- 🔬 **[Evaluation Framework (`docs/EVALUATION.md`)](docs/EVALUATION.md):** RAG retrieval precision, answer groundedness, hallucination mitigation, and quiz generation quality rubrics.
- ⚡ **[Performance Benchmarks (`docs/BENCHMARKS.md`)](docs/BENCHMARKS.md):** End-to-end latency benchmarks across cloud and local inference tiers, memory profiles, and caching ratios.
- 👥 **[User Study Protocol (`docs/USER_STUDY.md`)](docs/USER_STUDY.md):** Ethical experiment guidelines, informed consent, and 10-item System Usability Scale (SUS) survey.
- 🎬 **[Examiner Demonstration Script (`docs/DEMO_SCRIPT.md`)](docs/DEMO_SCRIPT.md):** 12-step structured demonstration narrative.
- 🔒 **[Privacy & Retention Policy (`docs/PRIVACY.md`)](docs/PRIVACY.md):** Data retention, vector isolation, and GDPR-compliant cascade deletion workflows.

---

## 🎓 Academic Project Context

- **Institution:** Kwame Nkrumah University of Science & Technology (KNUST)
- **Department:** Department of Computer Science
- **Course:** Final Year Project (Group 13)
- **Supervisor:** Dr. Rosemary
- **Submitted By:**
  - **Ahado Ronald Ofoe** (Index: `3366322`)
  - **Yoofi Ashon** (Index: `3377222`)

---

## ✨ Key Intelligent Capabilities

- **Learning Intelligence Engine & Next-Action Guidance (`recommendNext.ts`):** Dynamic rule-based adaptation engine that prioritizes urgent FSRS reviews, mistake corrections, and prerequisite-ready curriculum paths.
- **Defensible Heuristic Mastery Score (`masteryCalculator.ts`):** Transparent multi-signal formula combining Quiz Accuracy (45%), FSRS Memory Retention (35%), Practice Recency (15%), and Lesson Completion (5%), accompanied by empirical confidence level ratings.
- **Mistake Notebook & Error Bank (`/app/mistakes`, `MistakeNotebook.svelte`):** Automatically captures full question snapshots and student misconceptions on missed quiz questions, enabling targeted error drills.
- **Interactive Onboarding Workflow (`Onboarding.svelte`):** First-time guided setup directing students across material uploads, course generation, knowledge mapping, and AI tutoring.
- **RAG Citations & Source Support Attribution (`AssistantChat.svelte`):** Grounded assistant chat with metadata-aware citations (`📘 Strong source support`) and transparent distinction from general explanation.
- **Interactive Knowledge Map (`/app/knowledge-map`, `KnowledgeMap.svelte`):** Concept graph visualization powered by ELK.js with 'Explain My Progress' diagnostics.
- **Spaced Repetition Knowledge Hub (`/app/review`, `/api/spaced-repetition`):** Flashcard scheduling powered by **SuperMemo 2 (SM-2)** (`sm2.ts`) and **Free Spaced Repetition Scheduler (FSRS-4.5)** (`fsrs.ts`).
- **Custom Document RAG Ingestion (`/app/knowledge`, `/api/documents`):** User PDF/notes vector store ingestion with isolated FAISS semantic search.
  - User data deletion and privacy compliance endpoints (`deleteUserData.ts`, `/api/user`).
- **Curated Theme System & Security:**
  - Dynamic style switching between curated color palettes (**Calm**, **Sage**, **Focus Dark**).
  - Client-side XSS sanitization via `isomorphic-dompurify`.
  - Upstash / Redis REST integration (`redis.ts`) for distributed serverless rate limiting and outline caching with smooth fallback to in-memory sliding-window rate limiting (`rateLimiter.ts`) and outline caching (`outlineCache.ts`).
- **Certified Laptop Responsiveness:** Fully responsive interface validated across 7 laptop viewport scales (1093x614, 1228x691, 1280x720, 1366x768, 1440x900, 1536x864, and 1920x1080) with zero horizontal scroll overflow.

---

## 🛠️ Tech Stack & Dependencies

### Frontend & Serverless Framework

- **Framework:** SvelteKit (`v2.63+`) with Svelte 5 Runes (`$state`, `$derived`, `$props`)
- **Build Tool:** Vite (`v8.0+`)
- **Graph Layout Engine:** ELK.js (`elkjs` `v0.12+`) for Knowledge Map graph visualization layout
- **Styling & UI:** Tailwind CSS (`v4.3+`) via `@tailwindcss/vite`, Lucide Svelte icons (`@lucide/svelte`), and Google Fonts (`@fontsource/inter`, `@fontsource/jetbrains-mono`, `@fontsource/poppins`)
- **Database & Auth:** Cloud Firestore & Firebase Auth (`v12.16+`) with server-side session token verification via Firebase Admin SDK (`v14.1+`)
- **Serverless API Layer:** SvelteKit API endpoints (`src/routes/api/`) deployed on Netlify Functions with distributed Upstash Redis / in-memory rate limiting and outline caching

### AI & Machine Learning Microservices

- **Google Gemini API:** Primary generative AI provider (`gemini-flash-latest`)
- **Ollama Local LLM:** Local model provider (`llama3.2`) for offline/tier-2 inference
- **Python FastAPI Microservice (`ml_backend`):** PyTorch, Hugging Face Transformers, Sentence-Transformers, and FAISS for vector embedding & RAG retrieval
- **Spaced Repetition Engines:** Custom TypeScript implementations of SuperMemo 2 (`sm2.ts`) and Free Spaced Repetition Scheduler FSRS-4.5 (`fsrs.ts`)
- **Content Moderation & Guardrails:** Domain classifier (`domainClassifier.ts`), memorization guard (`memorizationGuard.ts`), weak topic detector (`weakTopicDetector.ts`), pricing tracker (`pricingConfig.ts`), and moderation pipeline (`moderation.ts`)

### Distributed Caching & External APIs

- **Upstash Redis REST API:** Distributed caching and rate limiting across serverless instances (`redis.ts`)
- **YouTube Data API v3:** Educational video enrichment with 90-day Firestore caching (`youtube.ts`)

### Testing & Quality Assurance

- **Unit & API Testing:** Vitest (`v4.1+`) with `@firebase/rules-unit-testing`
- **Python Backend Testing:** Pytest (`v9.1+`) for Python ML backend & FastAPI endpoints
- **End-to-End Testing:** Playwright (`v1.60+`) for full user journey verification & laptop responsiveness testing
- **Code Standards:** ESLint (`v10.4+`), Prettier (`v3.8+`), and `svelte-check` (`v4.6+`)

---

## 📂 Project Structure

```
Study/
├── docs/                       # Project documentation & specs
│   ├── API.md                  # Complete REST API endpoint specification
│   ├── CODEBASE_AUDIT.md       # Comprehensive codebase quality review & metrics
│   ├── Group_13_documentation_redone.pdf # Final academic project thesis document
│   ├── MULTI_PROVIDER_AND_RAG_ARCHITECTURE.md # Multi-provider decision tree & RAG vector pipeline spec
│   ├── PROJECT_FEATURES.md     # Feature list, roadmap, and architecture notes
│   ├── PROJECT_LIMITATIONS_AND_EVALUATION.md # Academic limitations, evaluation methodology & future work
│   └── production_readiness_audit.md # Production deployment checklist
├── ml_backend/                 # Python FastAPI ML Microservice
│   ├── fine_tuning/            # Fine-tuning scripts & datasets
│   ├── models/                 # Model inference modules & registries
│   ├── schemas/                # Data models and Pydantic schemas
│   ├── vector_store/           # FAISS vector database & sample_docs
│   ├── cache.py                # Embedding & inference result caching
│   ├── convert_pdfs.py         # PDF text extraction & processing script
│   ├── download_models.py      # Hugging Face model pre-downloader
│   ├── evaluate_models.py      # Model benchmarking evaluation script
│   ├── ingest_sciq.py          # SciQ dataset ingestion script
│   ├── main.py                 # FastAPI application entrypoint
│   ├── test_cache.py           # ML cache test suite
│   ├── test_ml_backend.py      # FastAPI endpoint unit test suite
│   ├── Dockerfile              # Container deployment manifest
│   ├── .dockerignore           # Excludes local virtual environment and vector caches
│   └── requirements.txt        # Python backend dependencies

├── scripts/                    # Development & administrative utility scripts
│   └── calibrate_domain_classifier.ts # Calibrates domain classifier thresholds
├── src/                        # SvelteKit Application Source
│   ├── lib/
│   │   ├── components/         # Reusable Svelte 5 UI components
│   │   │   ├── AccuracyDisclaimer.svelte # AI content disclaimer banner
│   │   │   ├── AppShell.svelte         # Application layout & navigation container
│   │   │   ├── AssistantChat.svelte    # Interactive AI Study Buddy chat widget
│   │   │   ├── AuthForm.svelte         # Authentication form component
│   │   │   ├── AuthModal.svelte        # Modal wrapper for login/signup
│   │   │   ├── BadgeStrip.svelte       # Gamification achievement badges
│   │   │   ├── CertificateModal.svelte # Course completion certificate viewer
│   │   │   ├── CompletionScreen.svelte # Quiz score summary & review
│   │   │   ├── ContentFlagModal.svelte # AI content flagging & reporting modal
│   │   │   ├── CourseCard.svelte       # Dashboard course card component
│   │   │   ├── DailyGoalRing.svelte    # Daily goal progress indicator
│   │   │   ├── DesktopSidebar.svelte   # Desktop navigation sidebar
│   │   │   ├── DraftOutlineEditor.svelte # Interactive course outline editor
│   │   │   ├── EmptyState.svelte       # Empty state placeholder component
│   │   │   ├── Header.svelte           # Top navigation bar with profile menu
│   │   │   ├── HeroPanel.svelte        # Dashboard hero greeting banner
│   │   │   ├── KnowledgeMap.svelte     # Interactive ELK.js concept map visualizer
│   │   │   ├── LessonAudioPlayer.svelte # Text-to-speech audio player component
│   │   │   ├── MermaidDiagram.svelte   # Interactive Mermaid flowchart renderer
│   │   │   ├── MobileNav.svelte        # Mobile responsive navigation bar
│   │   │   ├── PageIndicator.svelte    # Page step indicator component
│   │   │   ├── ProgressBar.svelte      # Visual progress bar component
│   │   │   ├── ShareModal.svelte       # Course share modal & link generator
│   │   │   ├── SharedCourseCard.svelte # Community catalog course card
│   │   │   ├── Skeleton.svelte         # UI loading skeleton placeholder
│   │   │   ├── StreakChip.svelte       # User streak status badge
│   │   │   ├── StreakHeatmap.svelte    # Calendar streak activity heatmap
│   │   │   ├── ThemeSwitcher.svelte    # App theme toggle (Calm, Sage, Focus Dark)
│   │   │   └── Toast.svelte            # Global toast notifications
│   │   ├── firebase/           # Client Firebase init, converters & security rules tests
│   │   │   ├── client.ts       # Client Firebase App & Auth init
│   │   │   ├── converters.ts   # Firestore typed document converters
│   │   │   └── rules.test.ts   # Firestore security rules unit tests
│   │   ├── server/             # Server-only utilities
│   │   │   ├── admin.ts        # Firebase Admin SDK initialization
│   │   │   ├── auth.test.ts    # Session token authentication unit tests
│   │   │   ├── auth.ts         # Server-side auth & session token verification
│   │   │   ├── fsrs.test.ts    # FSRS scheduling unit tests
│   │   │   ├── fsrs.ts         # Free Spaced Repetition Scheduler algorithm
│   │   │   ├── offlineSync.test.ts # Offline synchronization test suite
│   │   │   ├── outlineCache.test.ts # Outline cache test suite
│   │   │   ├── outlineCache.ts # Course outline caching layer
│   │   │   ├── rateLimiter.test.ts  # Rate limiter test suite
│   │   │   ├── rateLimiter.ts  # In-memory sliding-window rate limiter
│   │   │   ├── redis.ts        # Upstash Redis REST client for distributed caching
│   │   │   ├── sm2.test.ts     # SM-2 scheduling unit tests
│   │   │   ├── sm2.ts          # SuperMemo 2 spaced repetition algorithm
│   │   │   ├── youtube.test.ts # YouTube API fetcher unit tests
│   │   │   ├── youtube.ts      # YouTube Data API video fetcher & cacher
│   │   │   ├── ai/             # Multi-provider AI abstraction layer
│   │   │   │   ├── burnin.test.ts # Provider burn-in load test suite
│   │   │   │   ├── client.ts   # AI client initialization
│   │   │   │   ├── domainClassifier.test.ts # Domain classifier unit tests
│   │   │   │   ├── domainClassifier.ts # Subject domain classifier
│   │   │   │   ├── gemini.ts   # Google Gemini provider integration
│   │   │   │   ├── generationQueue.ts # Module generation queuing system
│   │   │   │   ├── memorizationGuard.test.ts # Memorization guard unit tests
│   │   │   │   ├── memorizationGuard.ts # Grounding & anti-hallucination guard
│   │   │   │   ├── moderation.test.ts # Moderation filter unit tests
│   │   │   │   ├── moderation.ts # AI output content moderation
│   │   │   │   ├── ollama.ts   # Ollama local LLM provider integration
│   │   │   │   ├── pricingConfig.ts # Provider token pricing and cost tracking
│   │   │   │   ├── provider.test.ts # AI orchestrator unit tests
│   │   │   │   ├── provider.ts # Unified AI provider orchestrator
│   │   │   │   ├── providerStats.ts # Provider metrics & health tracker
│   │   │   │   ├── weakTopicDetector.test.ts # Weak topic detector unit tests
│   │   │   │   └── weakTopicDetector.ts # Quiz analytics weak topic identification
│   │   │   ├── knowledgeMap/   # Concept graph & recommendations engine
│   │   │   │   ├── elkSpike.test.ts # ELK.js layout integration test suite
│   │   │   │   ├── masteryCalculator.ts # Module & course mastery calculation
│   │   │   │   ├── masteryCalculator.test.ts # Mastery calculation unit tests
│   │   │   │   ├── recommendNext.ts # Learning recommendation engine
│   │   │   │   └── recommendNext.test.ts # Recommendation engine unit tests
│   │   │   ├── superadmin/     # Superadmin management backend service
│   │   │   │   ├── user.test.ts # Superadmin user management unit tests
│   │   │   │   └── user.ts     # User management & platform admin utilities
│   │   │   └── user/           # User account server utilities
│   │   │       └── deleteUserData.ts # User data deletion & privacy handler
│   │   └── stores/             # Svelte stores for app, auth, & theme state
│   └── routes/                 # SvelteKit page routes & API endpoints
│       ├── +layout.svelte      # Root layout & global style setup
│       ├── +page.svelte        # Landing page & Authentication (Login / Sign-Up)
│       ├── layout.css          # Tailwind CSS v4 design tokens & theme classes
│       ├── api/                # REST API endpoints
│       │   ├── admin/          # Admin management & analytics API (`/analytics`)
│       │   ├── chat/           # AI Study Assistant chat endpoint
│       │   ├── courses/        # Course creation, listing, retrieval, & sharing API
│       │   ├── documents/      # RAG custom document upload & indexing API
│       │   ├── flag/           # Content moderation flagging API
│       │   ├── health/         # System health check API
│       │   ├── knowledge-map/  # Knowledge map concept graph endpoint
│       │   ├── microservices.test.ts # API microservices test suite
│       │   ├── modules/        # On-demand module content & quiz generation API
│       │   ├── paraphrase/     # Text paraphrasing microservice API
│       │   ├── quiz/           # Quiz explanation API (`/explain`)
│       │   ├── share/          # Shared course token resolution API
│       │   ├── spaced-repetition/ # Spaced repetition review & queue API
│       │   ├── study-groups/   # Study groups creation & join API (`/join`)
│       │   ├── summarize/      # Text summarization microservice API
│       │   ├── superadmin/     # Superadmin stats & user management API
│       │   └── user/           # User profile management API
│       ├── app/                # Authenticated application view
│       │   ├── +layout.svelte  # AppShell wrapper with sidebar & header profile menu
│       │   ├── +page.svelte    # User Dashboard (Resume course, streaks, badges)
│       │   ├── admin/          # Platform administration dashboard
│       │   ├── courses/        # Course player, draft editor, lesson view, & module quizzes
│       │   ├── explore/        # Public course discovery catalog & clone trigger
│       │   ├── knowledge/      # Custom document RAG knowledge base
│       │   ├── knowledge-map/  # Interactive visual concept graph & recommendations
│       │   ├── review/         # Spaced repetition flashcard review queue & drill selector
│       │   ├── settings/       # User account settings & theme options
│       │   └── verify-email/   # Email verification alert & resend screen
│       ├── courses/            # Public course viewing & quiz routes ([id])
│       ├── share/              # Public share link resolver route ([token])
│       ├── shared/             # Shared course preview & clone handler ([shareId])
│       └── superadmin/         # Platform superadmin control portal
├── tests/                      # End-to-End Playwright test suite
│   ├── responsiveLayout.e2e.ts # Viewport responsiveness suite across 7 laptop resolutions
│   └── userJourney.e2e.ts      # Comprehensive E2E user flow test script
├── firebase.json               # Firebase CLI & emulator configuration
├── firestore.rules             # Declarative Cloud Firestore security rules
├── firestore.indexes.json      # Firestore composite indexes definition
├── package.json                # Frontend dependencies & npm scripts
├── playwright.config.ts        # Playwright E2E configuration
├── svelte.config.js            # SvelteKit setup & preprocessor config
├── tsconfig.json               # TypeScript compiler configuration
```

└── vite.config.ts # Vite bundler, Tailwind CSS v4 & Vitest setup

````

---

## 📐 System Architecture

The application employs a serverless architecture designed for fast initial response times, resilient multi-provider AI execution, spaced repetition memory review, document RAG grounding, and secure data access.

```mermaid
graph TD
    User["User (Browser)"] <-->|"Svelte 5 UI (Runes)"| Frontend["SvelteKit Client (Netlify / local)"]
    Frontend <-->|"Auth / SSO"| FirebaseAuth["Firebase Authentication"]
    Frontend <-->|"Direct Reads & Profile Updates"| Firestore["Cloud Firestore (Security Rules Enforced)"]

    Frontend -->|"Server API (/api/courses, /api/modules, /api/chat, /api/documents, /api/spaced-repetition)"| ServerAPI["SvelteKit API Endpoints"]
    ServerAPI -->|"Rate Limit & Cache"| RateCache["Upstash Redis / In-Memory Rate Limiter & Outline Cache"]
    ServerAPI -->|"Admin Operations"| FirestoreAdmin["Cloud Firestore (Firebase Admin SDK)"]
    ServerAPI -->|"Token Verification"| AuthAdmin["Firebase Auth (Firebase Admin SDK)"]
    ServerAPI -->|"Orchestrated AI Requests"| AIOrchestrator["AI Provider Orchestrator (Domain Classifier & Moderation)"]

    AIOrchestrator -->|"Primary Provider"| Gemini["Google Gemini API (gemini-flash-latest)"]
    AIOrchestrator -->|"Local Provider"| Ollama["Ollama Local LLM (llama3.2)"]
    AIOrchestrator -->|"Fallback / RAG Provider"| MLBackend["Python FastAPI ML Backend (PyTorch + FAISS)"]

    ServerAPI -->|"Video Enrichment"| YouTubeAPI["YouTube Data API v3 (90-day Firestore Cache)"]
````

---

## 🚀 Local Development Setup

Follow these instructions to run the full application locally.

### Prerequisites

- **Node.js:** v18.0.0 or higher
- **npm:** v9.0.0 or higher
- **Python:** 3.10+ (for `ml_backend`)
- **Ollama (Optional):** Installed and running locally if using local LLM inference

### 1. Clone & Install Dependencies

```bash
# Install SvelteKit frontend dependencies
npm install

# Create and activate Python virtual environment in the root directory
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Mac/Linux:
source .venv/bin/activate

# Install Python ML backend dependencies
pip install -r ml_backend/requirements.txt
```

> [!NOTE]
> **Environment Note:** The root-level `.venv` is a shared environment used strictly for _local development_ to avoid duplicate, heavy installs of PyTorch and Transformers (particularly helpful for machines with limited disk space). For containerized or production environments (e.g. `Dockerfile` and `docker-compose.yml`), services remain isolated and run their own local package installations independently.

### 2. Configure Environment Variables

Create a `.env` file in the root directory (copy from `.env.example`):

```bash
cp .env.example .env
```

Required `.env` variables:

```env
# Firebase Client Configuration
PUBLIC_FIREBASE_API_KEY=demo-api-key
PUBLIC_FIREBASE_AUTH_DOMAIN=ai-study-buddy-knust.firebaseapp.com
PUBLIC_FIREBASE_PROJECT_ID=ai-study-buddy-knust
FIREBASE_PROJECT_ID=ai-study-buddy-knust
PUBLIC_FIREBASE_STORAGE_BUCKET=ai-study-buddy-knust.appspot.com
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
PUBLIC_FIREBASE_APP_ID=1:1234567890:web:1234567890

# Optional: Set true when using local Firebase emulators
PUBLIC_FIREBASE_USE_EMULATOR=false

# Primary AI Provider Key (Google Gemini API)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-flash-latest

# Local Ollama LLM Settings (Tier 2 Fallback)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Fallback Python ML Backend Endpoint & Key
ML_BACKEND_URL=http://localhost:8000
ML_BACKEND_API_KEY=your-ml-backend-key

# Distributed Upstash Redis Configuration (Optional)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# YouTube Data API v3 Key (Supplementary Video Fetching)
YOUTUBE_API_KEY=
```

### 3. Start Python ML Backend

In a dedicated terminal, activate the root virtual environment and launch the Uvicorn FastAPI server from the `ml_backend` directory:

```bash
# On Windows:
.venv\Scripts\activate
cd ml_backend
python -m uvicorn main:app --reload --port 8000

# On Mac/Linux:
source .venv/bin/activate
cd ml_backend
python -m uvicorn main:app --reload --port 8000
```

### 4. Start Firebase Emulators (Optional for local Auth/Firestore testing)

In another terminal, start local Firestore and Auth emulators:

```bash
npx firebase emulators:start
```

### 5. Start SvelteKit Dev Server

In your primary terminal, launch the Vite development server:

```bash
npm run dev
```

Open your browser and visit `http://localhost:5173`.

---

## 🔒 Firestore Security Rules

Database access is secured using declarative Firestore security rules (`firestore.rules`):

- **/users/{uid}**: Authenticated users can read their own profile. Direct client updates are restricted strictly to the `theme` field to prevent client-side modification of streak metrics or course stats.
- **/courses/{courseId}**: Users can only read courses where `userId == request.auth.uid`. Direct document creation and deletion via client SDK are blocked (handled exclusively by server-side Firebase Admin SDK).
- **/sharedCourses/{token}**: Read access is permitted for authenticated users presenting a valid share token; write operations are restricted to server-side Admin SDK.

---

## 📖 API Documentation

Detailed REST API specifications for all routes (`/api/courses`, `/api/modules`, `/api/chat`, `/api/summarize`, `/api/paraphrase`, `/api/quiz/explain`, `/api/study-groups`, `/api/share`, `/api/documents`, `/api/spaced-repetition`, `/api/flag`, `/api/superadmin`, `/api/admin/analytics`) are available in [docs/API.md](docs/API.md).

---

## 🧪 Testing & Code Quality Commands

The repository features 100% test passing verification across type checks, linting, unit tests, Python backend tests, and End-to-End browser suites:

- **Type Checking (0 errors, 0 warnings):**
  ```bash
  npm run check
  ```
- **Code Linting & Formatting:**
  ```bash
  npm run lint     # Check formatting with Prettier & run ESLint
  npm run format   # Auto-format codebase with Prettier
  ```
- **Frontend & Server Unit Tests (Vitest - 26 test files / 114 tests passed):**
  ```bash
  npm run test:unit -- --run
  ```
- **Python ML Backend Test Suite (Pytest - 20 tests passed):**
  ```bash
  .venv\Scripts\pytest.exe ml_backend/
  ```
- **End-to-End & Responsiveness Tests (Playwright - 49 tests passed):**
  ```bash
  npm run test:e2e
  ```
- **Run Full Automated Frontend Verification Suite:**
  ```bash
  npm run test
  ```
- **Calibrate AI Domain Classifier:**
  ```bash
  npx tsx scripts/calibrate_domain_classifier.ts
  ```
