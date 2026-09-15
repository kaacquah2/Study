# Study AI — Repository Audit & Evidence Report

This document records the empirical evidence, extracted facts, file-and-line citations, and test verification outputs from the **Study AI** codebase for the final-year project report.

---

## 1. Technology stack as actually used

All dependencies and resolved versions below are extracted directly from [`package.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package.json), [`package-lock.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package-lock.json), [`ml_backend/requirements.txt`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/requirements.txt), and active virtual environment introspection.

### Core Frameworks & Libraries

| Subsystem                     | Stated Technology                                          | Declared Dependency Constraint                                                                                                            | Resolved / Pinned Version                                                               | Citation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| :---------------------------- | :--------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web Framework**             | SvelteKit                                                  | `@sveltejs/kit: ^2.63.0`                                                                                                                  | `2.70.2`                                                                                | [`package.json:31`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package.json#L31), [`package-lock.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package-lock.json)                                                                                                                                                                                                                                                                                                                                              |
| **UI Framework**              | Svelte 5 (Runes)                                           | `svelte: ^5.56.1`                                                                                                                         | `5.56.5`                                                                                | [`package.json:42`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package.json#L42), [`package-lock.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package-lock.json)                                                                                                                                                                                                                                                                                                                                              |
| **Styling Engine**            | Tailwind CSS v4                                            | `tailwindcss: ^4.3.0`<br>`@tailwindcss/vite: ^4.3.0`                                                                                      | `4.3.2`<br>`4.3.2`                                                                      | [`package.json:33`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package.json#L33), [`package.json:44`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package.json#L44), [`src/routes/layout.css:1`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/layout.css#L1)                                                                                                                                                                                                                                 |
| **Authentication**            | Firebase Auth                                              | `firebase: ^12.16.0` (Client)<br>`firebase-admin: ^14.1.0` (Server)                                                                       | `12.16.0`<br>`14.1.0`                                                                   | [`package.json:56-57`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package.json#L56-L57), [`src/lib/firebase/client.ts:1-20`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/firebase/client.ts#L1-L20), [`src/lib/server/admin.ts:1-24`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/admin.ts#L1-L24)                                                                                                                                                                              |
| **Database**                  | Google Cloud Firestore                                     | `firebase: ^12.16.0`<br>`firebase-admin: ^14.1.0`                                                                                         | `12.16.0`<br>`14.1.0`                                                                   | [`src/lib/firebase/client.ts:13`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/firebase/client.ts#L13), [`src/lib/server/admin.ts:19`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/admin.ts#L19)                                                                                                                                                                                                                                                                                               |
| **AI Providers & SDKs**       | Google Gemini (REST)<br>FastAPI ML Server<br>Ollama (REST) | Raw `fetch` (No SDK)<br>`fastapi>=0.115.0,<1.0.0`<br>`transformers>=5.5.0,<6.0.0`<br>`torch>=2.6.0,<3.0.0`<br>`accelerate>=0.31.0,<1.0.0` | `fastapi==0.141.1`<br>`transformers==4.57.6`<br>`torch==2.13.0`<br>`accelerate==0.34.2` | [`src/lib/server/ai/gemini.ts:19-35`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/gemini.ts#L19-L35), [`src/lib/server/ai/client.ts:1-120`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/client.ts#L1-L120), [`src/lib/server/ai/ollama.ts:28-54`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/ollama.ts#L28-L54), [`ml_backend/requirements.txt:1-9`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/requirements.txt#L1-L9) |
| **Embedding Model**           | all-MiniLM-L6-v2                                           | `sentence-transformers>=3.0.1,<7.0.0`                                                                                                     | `3.4.1`                                                                                 | [`ml_backend/requirements.txt:13`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/requirements.txt#L13), [`ml_backend/models/rag_pipeline.py:51`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L51)                                                                                                                                                                                                                                                                         |
| **Vector Store**              | FAISS CPU                                                  | `faiss-cpu>=1.8.0,<2.0.0`                                                                                                                 | `1.15.0`                                                                                | [`ml_backend/requirements.txt:14`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/requirements.txt#L14), [`ml_backend/models/rag_pipeline.py:39`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L39)                                                                                                                                                                                                                                                                         |
| **Spaced-Repetition Library** | _Custom in-house FSRS-4.5_                                 | **NOT FOUND IN REPO** (No npm or pip package)                                                                                             | In-house TypeScript implementation                                                      | [`src/lib/server/fsrs.ts:1-222`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/fsrs.ts#L1-L222)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Graph Layout Engine**       | ELK.js & Mermaid                                           | `elkjs: ^0.12.0`<br>`mermaid: ^11.17.2`                                                                                                   | `0.12.0`<br>`11.17.2`                                                                   | [`package.json:55`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package.json#L55), [`package.json:60`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package.json#L60), [`src/lib/utils/knowledgeGraphLayout.ts:1-50`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/utils/knowledgeGraphLayout.ts#L1-L50)                                                                                                                                                                                          |
| **Cache & Rate Limiting**     | Redis, SlowAPI, Cachetools, Upstash                        | `redis>=5.0.0,<6.0.0`<br>`cachetools>=5.3.0,<6.0.0`<br>`slowapi>=0.1.9,<1.0.0`                                                            | `redis==5.3.1`<br>`cachetools==5.5.2`<br>`slowapi==0.1.10`                              | [`ml_backend/requirements.txt:24-27`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/requirements.txt#L24-L27), [`ml_backend/cache.py:22-69`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/cache.py#L22-L69), [`src/lib/server/redis.ts:1-85`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/redis.ts#L1-L85), [`src/lib/server/rateLimiter.ts:12-56`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/rateLimiter.ts#L12-L56)                   |
| **Test Runners**              | Vitest, Playwright, Firebase Rules Testing, Pytest         | `vitest: ^4.1.8`<br>`@playwright/test: ^1.60.0`<br>`@firebase/rules-unit-testing: ^5.0.1`<br>`pytest` (Python)                            | `4.1.10`<br>`1.61.1`<br>`5.0.1`<br>`pytest==9.1.1`                                      | [`package.json:27-28, 48`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package.json#L27-L28), [`package-lock.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/package-lock.json), [`.venv`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/.venv)                                                                                                                                                                                                                                                        |

### AI Providers, Defaults & Fallback Order

Three providers are wired up in code:

1. **Google Gemini REST API (`gemini`)**: Invoked via standard HTTP `fetch` in [`src/lib/server/ai/gemini.ts:19-56`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/gemini.ts#L19-L56). Default model is `gemini-3.6-flash` ([`src/lib/server/ai/gemini.ts:16`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/gemini.ts#L16), [`.env.example:31`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/.env.example#L31)).
2. **Self-Hosted Python ML Server (`ml_backend`)**: Invoked via HTTP `fetch` in [`src/lib/server/ai/client.ts:1-120`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/client.ts#L1-L120) with HMAC-SHA256 request signing against `http://localhost:8000`. Models: `google/flan-t5-base`, `google/flan-t5-large`, `valhalla/t5-small-qg-prepend`, `potsawee/t5-large-generation-race-Distractor`, and `TinyLlama/TinyLlama-1.1B-Chat-v1.0` ([`ml_backend/.env.example:26-38`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/.env.example#L26-L38)).
3. **Local Ollama Daemon (`ollama`)**: Invoked via HTTP `fetch` against `http://localhost:11434` in [`src/lib/server/ai/ollama.ts:1-60`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/ollama.ts#L1-L60). Default model is `llama3:latest` ([`.env.example:35`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/.env.example#L35)) / `llama3.2` ([`src/lib/server/ai/ollama.ts:15`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/ollama.ts#L15)).

The exact execution fallback order is defined in `executeAI()` at [`src/lib/server/ai/provider.ts:254-493`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L254-L493):

- **Reasoning Tasks (Course Outlines, Lessons, Quizzes, Chat)**:
  - **In-Domain Computer Science** (classified by `classifyTopicDomain(topicHint)` at [`src/lib/server/ai/provider.ts:260-268`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L260-L268)):
    - **Tier 1 (Default)**: `ml_backend` (Local domain-adapted models + RAG) ([line 270](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L270))
    - **Tier 2 (Fallback)**: `gemini` (Google Gemini Flash) ([line 299](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L299))
    - **Tier 3 (Fallback)**: `ollama` (Local Llama) ([line 322](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L322))
  - **Out-of-Domain / General Topics** ([line 348](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L348)):
    - **Tier 1 (Default)**: `gemini` ([line 349](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L349))
    - **Tier 2 (Fallback)**: `ollama` ([line 372](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L372))
    - **Tier 3 (Fallback)**: `ml_backend` ([line 401](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L401))
- **Utility Tasks (Summarization, Paraphrasing)** ([line 424](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L424)):
  - **Tier 1 (Default)**: `ml_backend` ([line 424](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L424))
  - **Tier 2 (Fallback)**: `ollama` ([line 449](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L449))
  - **Tier 3 (Fallback)**: `gemini` ([line 473](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts#L473))

### Configured vs. Called Services Audit

- **Configured and Called**:
  - `YOUTUBE_API_KEY`: Defined in [`.env.example:43`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/.env.example#L43); invoked in [`src/lib/server/youtube.ts:34-60`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/youtube.ts#L34-L60) to retrieve and filter embeddable YouTube videos for course modules.
  - `CLOUD_TASKS_QUEUE_NAME`, `CLOUD_TASKS_LOCATION`, `GCP_PROJECT_ID`: Defined in [`.env.example:53-55`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/.env.example#L53-L55); invoked in [`src/lib/server/ai/taskDispatcher.ts:52-87`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/taskDispatcher.ts#L52-L87) for asynchronous serverless generation dispatch.
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: Defined in [`.env.example:38-39`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/.env.example#L38-L39); invoked in [`src/lib/server/redis.ts:21-72`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/redis.ts#L21-L72).
  - `SUPERADMIN_EMAIL`: Defined in [`.env.example:58`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/.env.example#L58); checked during privilege evaluation in [`src/lib/server/superadmin/user.ts:10`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/superadmin/user.ts#L10).
- **Mentioned in Config but Not Called Anywhere**:
  - **NONE**. Every environment variable declared in `.env.example` maps to an active consumer in code.
- **Called but Inconsistently Documented**:
  - `GEMINI_MODEL`: [`docs/MULTI_PROVIDER_AND_RAG_ARCHITECTURE.md:31`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/docs/MULTI_PROVIDER_AND_RAG_ARCHITECTURE.md#L31) lists `gemini-flash-latest`, but code defaults to `gemini-3.6-flash` ([`src/lib/server/ai/gemini.ts:16`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/gemini.ts#L16), [`.env.example:31`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/.env.example#L31)).
  - `YouTube Data API v3`: Actively called in [`src/lib/server/youtube.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/youtube.ts) but omitted from high-level architecture documents [`docs/ARCHITECTURE.md`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/docs/ARCHITECTURE.md).

---

## 2. Data model

Extracted from [`firestore.rules:1-108`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/firestore.rules#L1-L108), [`firestore.indexes.json:1-115`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/firestore.indexes.json#L1-L115), [`src/lib/firebase/converters.ts:1-146`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/firebase/converters.ts#L1-L146), and Firestore Admin SDK endpoints.

### Collections and Subcollections

| Collection / Subcollection | Path Pattern                                     | Written Fields & Types                                                                                                                                                                                                                                                                                                                                                                            | Relationship                                                                        |
| :------------------------- | :----------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :---------------------------------------------------------------------------------- |
| **Users**                  | `/users/{uid}`                                   | `uid: string`, `email: string`, `displayName: string \| null`, `photoURL: string \| null`, `theme?: string`, `badges?: string[]`, `longestStreak?: number`, `streakFreezes?: number`, `role?: string`, `isAdmin?: boolean`, `isSuperAdmin?: boolean`, `streak?: { current: number, longest: number, lastStudiedOn: string \| null, timezone: string, freezesAvailable?: number }`                 | Root user entity                                                                    |
| ↳ **Course Progress**      | `/users/{uid}/progress/{courseId}`               | `courseId: string`, `completedModuleIds: string[]`, `updatedAt: serverTimestamp`                                                                                                                                                                                                                                                                                                                  | 1-to-N subcollection per user; references `/courses/{courseId}`                     |
| ↳ **FSRS Review Logs**     | `/users/{uid}/fsrsReviewLogs/{logId}`            | `cardId: string`, `rating: number`, `newStability: number`, `newDifficulty: number`, `timestamp: string`                                                                                                                                                                                                                                                                                          | 1-to-N subcollection per user; audit trail for memory scheduler                     |
| ↳ **Claimed Courses**      | `/users/{uid}/claims/{token}`                    | `courseId: string`, `claimedAt: serverTimestamp`                                                                                                                                                                                                                                                                                                                                                  | 1-to-N subcollection per user; links to `/sharedCourses/{token}`                    |
| ↳ **Reminders / Cards**    | `/users/{uid}/cards/{cardId}`                    | `front: string`, `back: string`, `lastReviewedAt: string`                                                                                                                                                                                                                                                                                                                                         | 1-to-N subcollection per user                                                       |
| **Courses**                | `/courses/{courseId}`                            | `ownerUid: string`, `title: string`, `description: string`, `topic: string`, `format: 'lessons_and_quizzes' \| 'quizzes_only'`, `moduleCount: number`, `status: 'draft' \| 'building' \| 'ready' \| 'partial' \| 'failed'`, `accent?: string`, `level?: string`, `progress?: { completed: number, total: number }`, `clonedFrom?: string \| null`, `createdAt: timestamp`, `updatedAt: timestamp` | Owned by `/users/{uid}`; root curriculum container                                  |
| ↳ **Modules**              | `/courses/{courseId}/modules/{moduleId}`         | `order: number`, `type: 'lesson' \| 'quiz'`, `title: string`, `summary: string`, `learningObjective?: string`, `keyPoints?: string[]`, `status: 'pending' \| 'generating' \| 'ready' \| 'failed'`, `pages?: LessonPage[]`, `questions?: QuizQuestion[]`, `concepts?: Concept[]`, `completed?: boolean`, `model?: string`, `generatedAt: timestamp`                                                | 1-to-N subcollection per course                                                     |
| **Shared Courses**         | `/sharedCourses/{token}`                         | `courseId: string`, `sharedByUid: string`, `sharedByName: string`, `isPublic: boolean`, `claimCount: number`, `importCount?: number`, `revoked: boolean`, `snapshot: { title, description, format, modules }`, `createdAt: timestamp`                                                                                                                                                             | Public/private course capability shares; snapshots `/courses/{courseId}`            |
| **Usage Tracking**         | `/usage/{uid}`                                   | `summarizeCount: number`, `summarizeHour: string`, `paraphraseCount: number`, `paraphraseHour: string`, `chatCount: number`, `chatHour: string`, `flashcardCount: number`, `flashcardHour: string`                                                                                                                                                                                                | Rate limit counters keyed by user UID                                               |
| **Flashcards**             | `/flashcards/{cardId}`                           | `uid: string`, `courseId?: string`, `moduleId?: string`, `front: string`, `back: string`, `question?: string`, `answer?: string`, `tags?: string[]`, `sourceType?: string`, `stability: number`, `difficulty: number`, `reps: number`, `lapses: number`, `state: string`, `intervalDays: number`, `dueDate: string`, `lastReviewedAt: string`, `createdAt: timestamp`, `updatedAt: timestamp`     | Owned by `/users/{uid}`; references `/courses/{courseId}` and `/modules/{moduleId}` |
| **Weak Topics**            | `/weakTopics/{uid}`                              | `userId: string`, `weakTopics: Array<{ topic: string, failureRate: number, detectedAt: string }>`, `updatedAt: serverTimestamp`                                                                                                                                                                                                                                                                   | 1-to-1 per user                                                                     |
| **Study Groups**           | `/studyGroups/{groupId}`                         | `name: string`, `description: string`, `inviteCode: string`, `creatorUid: string`, `memberUids: string[]`, `createdAt: serverTimestamp`                                                                                                                                                                                                                                                           | N-to-N user memberships                                                             |
| **Learning Events**        | `/learningEvents/{userId}/events/{eventId}`      | Exact shape detailed below                                                                                                                                                                                                                                                                                                                                                                        | 1-to-N subcollection per user                                                       |
| **Learning Profile**       | `/userLearningProfile/{userId}`                  | Exact shape detailed below                                                                                                                                                                                                                                                                                                                                                                        | 1-to-1 aggregate summary document per user                                          |
| **Mistake Records**        | `/mistakeRecords/{userId}/mistakes/{questionId}` | `questionId: string`, `userId: string`, `moduleId: string`, `prompt: string`, `options: string[]`, `correctIndex: number`, `explanation: string`, `wrongCount: number`, `resolved: boolean`, `lastMistakeAt: ISO string`, `resolvedAt?: ISO string`                                                                                                                                               | 1-to-N subcollection per user                                                       |
| **Peer Questions**         | `/peerQuestions/{questionId}`                    | `courseId: string`, `moduleId: string`, `submittedBy: string`, `submitterName: string`, `prompt: string`, `options: string[]`, `correctIndex: number`, `explanation: string`, `status: 'pending' \| 'approved' \| 'rejected'`, `createdAt: serverTimestamp`                                                                                                                                       | Submitted by users; tied to course modules                                          |
| **Moderation Flags**       | `/moderationFlags/{docId}`                       | `type: string`, `source: string`, `userId: string`, `content: string`, `flaggedReason: string`, `flaggedAt: serverTimestamp`                                                                                                                                                                                                                                                                      | Administrative audit log                                                            |
| **Quiz Attempts**          | `/quizAttempts/{attemptId}`                      | `uid: string`, `courseId: string`, `moduleId: string`, `score: number`, `total: number`, `accuracy: number`, `answers: number[]`, `createdAt: serverTimestamp`                                                                                                                                                                                                                                    | Historical quiz log per attempt                                                     |
| **Content Flags**          | `/flags/{flagId}`                                | `targetType: string`, `targetId: string`, `userId: string`, `reason: string`, `createdAt: serverTimestamp`                                                                                                                                                                                                                                                                                        | User reporting flags                                                                |
| **IP Rate Limits**         | `/ip_rate_limits/{ipHash}`                       | `count: number`, `hour: string`                                                                                                                                                                                                                                                                                                                                                                   | Unauthenticated share claim throttling                                              |
| **System Provider Stats**  | `/system/providerStats` (doc `usage`)            | Maps provider name (`gemini`, `ollama`, `ml_backend`) to daily counts                                                                                                                                                                                                                                                                                                                             | System-wide singleton                                                               |

### Firestore Indexes

Defined in [`firestore.indexes.json:1-115`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/firestore.indexes.json#L1-L115):

1. Collection `courses`: `ownerUid` (ASC), `createdAt` (DESC)
2. Collection `flashcards`: `uid` (ASC), `dueDate` (ASC), `sourceType` (ASC)
3. Collection `peerQuestions`: `courseId` (ASC), `status` (ASC), `createdAt` (DESC)
4. Subcollection `events`: `userId` (ASC), `timestamp` (DESC)
5. Subcollection `mistakes`: `resolved` (ASC), `lastMistakeAt` (DESC)
6. Subcollection `mistakes`: `moduleId` (ASC), `resolved` (ASC), `lastMistakeAt` (DESC)
7. Subcollection `mistakes`: `moduleId` (ASC), `lastMistakeAt` (DESC)

### Exact Shape: Learning Event Document

Defined at [`src/lib/server/analytics/learningEvents.ts:28-76, 100-105`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/analytics/learningEvents.ts#L28-L76):

```typescript
// Persisted under /learningEvents/{userId}/events/{eventId}
export interface LearningEvent {
	eventId: string; // Unique UUID
	userId: string; // Authenticated UID
	sessionId: string; // Groups events within active study session
	eventType:
		| 'lesson_started'
		| 'lesson_completed'
		| 'quiz_started'
		| 'quiz_completed'
		| 'question_answered'
		| 'flashcard_reviewed'
		| 'ai_help_requested'
		| 'weak_area_detected'
		| 'recommendation_shown'
		| 'document_uploaded'
		| 'session_started'
		| 'session_ended';
	timestamp: string; // ISO 8601 string
	courseId?: string; // Optional course UUID
	moduleId?: string; // Optional module UUID
	conceptId?: string; // Optional concept identifier
	result?: 'correct' | 'incorrect' | 'skipped';
	durationMs?: number; // Duration of active engagement
	metadata?: {
		quizScore?: number; // 0–100 for quiz_completed
		totalQuestions?: number;
		sourceLabel?: string; // e.g. "Chapter 3" or lesson title
		aiProvider?: 'gemini' | 'ollama' | 'ml_backend';
		recommendationType?: string;
		confidenceRating?: number; // 1–4
		timeSpentSeconds?: number;
	};
	persistedAt?: FirebaseFirestore.FieldValue; // serverTimestamp()
}
```

### Exact Shape: Learning Profile Document

Defined at [`src/lib/server/analytics/profileAggregator.ts:4-33`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/analytics/profileAggregator.ts#L4-L33):

```typescript
// Persisted under /userLearningProfile/{userId}
export interface UserLearningProfile {
	userId: string;
	totalStudyTimeMs: number;
	sessionCount: number;
	lastSessionAt: string; // ISO 8601 timestamp
	conceptsMastery: Record<string, ConceptMasteryAggregate>;
	weakConcepts: string[]; // conceptIds with accuracy < 70% and totalAttempts >= 2
	recentActivity: RecentActivitySummary[];
	updatedAt: string; // ISO 8601 timestamp
}

export interface ConceptMasteryAggregate {
	conceptId: string;
	conceptTag: string;
	totalAttempts: number;
	correctCount: number;
	accuracy: number; // 0-100 percentage
	isWeak: boolean;
	lastAttemptAt: string; // ISO 8601 timestamp
}

export interface RecentActivitySummary {
	sessionId: string;
	eventType: string;
	courseId?: string;
	moduleId?: string;
	timestamp: string;
	summaryText: string;
}
```

---

## 3. Mastery and recommendation logic

### Verbatim Mastery Calculation Function

Quoted verbatim from [`src/lib/server/knowledgeMap/masteryCalculator.ts:77-260`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/masteryCalculator.ts#L77-L260):

```typescript
export function computeModuleMastery(
	moduleId: string,
	questions: QuizQuestion[] | null | undefined,
	todayStr: string = new Date().toISOString().split('T')[0],
	isLessonCompleted: boolean = false
): ModuleMastery {
	// Default breakdown for unassessed / not-started
	const defaultBreakdown: MasteryBreakdown = {
		quizAccuracy: 0,
		fsrsPerformance: 0,
		recencyScore: 0,
		lessonCompletion: isLessonCompleted ? 100 : 0
	};

	// Case 1: Pure lesson module or no quiz questions -> not-assessed
	if (!questions || !Array.isArray(questions) || questions.length === 0) {
		return {
			moduleId,
			masteryPercent: isLessonCompleted ? 100 : -1,
			questionsTotal: 0,
			questionsReviewed: 0,
			questionsDue: 0,
			averageStability: 0,
			fsrsState: 'not-assessed',
			masteryBreakdown: defaultBreakdown,
			evidenceCount: isLessonCompleted ? 1 : 0,
			confidenceLevel: isLessonCompleted ? 'low' : 'none'
		};
	}

	const questionsTotal = questions.length;
	let questionsReviewed = 0;
	let questionsDue = 0;
	let totalStability = 0;
	let totalFsrsWeight = 0;
	let totalCorrectAttempts = 0;
	let totalAttemptsCount = 0;
	let mostRecentReviewEpoch = 0;

	for (const q of questions) {
		const isReviewed = Boolean(q.lastReviewedAt);
		const isDue = !q.nextReviewDate || q.nextReviewDate <= todayStr;

		if (isDue) {
			questionsDue += 1;
		}

		if (q.lastReviewedAt) {
			const epoch = new Date(q.lastReviewedAt).getTime();
			if (!isNaN(epoch) && epoch > mostRecentReviewEpoch) {
				mostRecentReviewEpoch = epoch;
			}
		}

		// Accuracy tracking per question
		if (typeof q.attemptCount === 'number' && q.attemptCount > 0) {
			totalAttemptsCount += q.attemptCount;
			totalCorrectAttempts += q.correctCount || 0;
		} else if (isReviewed) {
			totalAttemptsCount += 1;
			// If in Review or mastered, assume correct; if Relearning, assume lapsed
			if (q.fsrsState === 'Review') {
				totalCorrectAttempts += 1;
			}
		}

		if (isReviewed) {
			questionsReviewed += 1;
			const stability = typeof q.stability === 'number' ? q.stability : 0;
			totalStability += stability;

			const state = q.fsrsState || 'Learning';
			if (state === 'Review') {
				totalFsrsWeight +=
					stability >= 10 ? FSRS_STATE_WEIGHTS.Review_high : FSRS_STATE_WEIGHTS.Review;
			} else if (state === 'Learning') {
				totalFsrsWeight += FSRS_STATE_WEIGHTS.Learning;
			} else if (state === 'Relearning') {
				totalFsrsWeight += FSRS_STATE_WEIGHTS.Relearning;
			} else {
				totalFsrsWeight += FSRS_STATE_WEIGHTS.New;
			}
		} else {
			totalFsrsWeight += FSRS_STATE_WEIGHTS.New;
		}
	}

	// Case 2: Quiz exists, but zero questions have been reviewed yet -> not-started
	if (questionsReviewed === 0) {
		return {
			moduleId,
			masteryPercent: 0,
			questionsTotal,
			questionsReviewed: 0,
			questionsDue,
			averageStability: 0,
			fsrsState: 'not-started',
			masteryBreakdown: defaultBreakdown,
			evidenceCount: 0,
			confidenceLevel: 'none'
		};
	}

	// Component 1: Quiz Accuracy (0-100)
	const rawAccuracy =
		totalAttemptsCount > 0
			? (totalCorrectAttempts / totalAttemptsCount) * 100
			: (totalFsrsWeight / questionsTotal) * 100;
	const quizAccuracy = Math.min(100, Math.max(0, Math.round(rawAccuracy)));

	// Component 2: FSRS Memory Performance (0-100)
	const fsrsPerformance = Math.min(
		100,
		Math.max(0, Math.round((totalFsrsWeight / questionsTotal) * 100))
	);

	// Component 3: Recency Score (0-100) — based on days since last review
	let recencyScore: number;
	if (mostRecentReviewEpoch > 0) {
		const daysSinceReview = Math.max(
			0,
			(Date.now() - mostRecentReviewEpoch) / (1000 * 60 * 60 * 24)
		);
		if (daysSinceReview > 30) {
			recencyScore = 20;
		} else if (daysSinceReview > 14) {
			recencyScore = 50;
		} else if (daysSinceReview > 7) {
			recencyScore = 75;
		} else {
			recencyScore = 100;
		}
	} else {
		recencyScore = 50;
	}

	// Component 4: Lesson Completion (0-100)
	const lessonCompletion = isLessonCompleted ? 100 : questionsReviewed > 0 ? 80 : 0;

	// Composite Weighted Formula: 0.45 * Quiz + 0.35 * FSRS + 0.15 * Recency + 0.05 * Lesson
	const compositeScore =
		0.45 * quizAccuracy + 0.35 * fsrsPerformance + 0.15 * recencyScore + 0.05 * lessonCompletion;

	const masteryPercent = Math.min(100, Math.max(0, Math.round(compositeScore)));
	const averageStability = Number((totalStability / questionsReviewed).toFixed(1));

	// Evidence Count & Confidence Level
	const evidenceCount = totalAttemptsCount > 0 ? totalAttemptsCount : questionsReviewed;
	let confidenceLevel: ModuleMastery['confidenceLevel'];
	if (evidenceCount >= 15) {
		confidenceLevel = 'high';
	} else if (evidenceCount >= 5) {
		confidenceLevel = 'medium';
	} else if (evidenceCount >= 1) {
		confidenceLevel = 'low';
	} else {
		confidenceLevel = 'none';
	}

	let fsrsState: ModuleMastery['fsrsState'] = 'learning';
	if (masteryPercent >= 80) {
		fsrsState = 'mastered';
	} else if (masteryPercent >= 40) {
		fsrsState = 'reviewing';
	}

	return {
		moduleId,
		masteryPercent,
		questionsTotal,
		questionsReviewed,
		questionsDue,
		averageStability,
		fsrsState,
		masteryBreakdown: {
			quizAccuracy,
			fsrsPerformance,
			recencyScore,
			lessonCompletion
		},
		evidenceCount,
		confidenceLevel
	};
}
```

### Component Weights & Derivation

The four components and weights in [`src/lib/server/knowledgeMap/masteryCalculator.ts:216-218`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/masteryCalculator.ts#L216-L218):
$$\text{Mastery Score} = 0.45 \times \text{quizAccuracy} + 0.35 \times \text{fsrsPerformance} + 0.15 \times \text{recencyScore} + 0.05 \times \text{lessonCompletion}$$

1. **Quiz Accuracy (45%)**: Derived from active recall attempts: $\frac{\text{totalCorrectAttempts}}{\text{totalAttemptsCount}} \times 100$. If attempt counts are missing, falls back to FSRS total state weight ratio ([lines 181-185](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/masteryCalculator.ts#L181-L185)).
2. **FSRS Retention / Performance (35%)**: Derived by mapping each card's `fsrsState` to `FSRS_STATE_WEIGHTS` ([lines 69-75, 148-161](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/masteryCalculator.ts#L69-L75)):
   - `New`: $0.0$
   - `Learning`: $0.4$
   - `Review` (with stability $< 10$ days): $0.8$
   - `Review_high` (with stability $\ge 10$ days): $1.0$
   - `Relearning`: $0.2$
   - Unreviewed card: $0.0$
     Scaled across total questions: $\min\left(100, \text{round}\left(\frac{\text{totalFsrsWeight}}{\text{questionsTotal}} \times 100\right)\right)$ ([lines 187-191](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/masteryCalculator.ts#L187-L191)).
3. **Practice Recency (15%)**: Derived from wall-clock days since the most recent review timestamp `mostRecentReviewEpoch` ([lines 194-211](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/masteryCalculator.ts#L194-L211)):
   - $\text{daysSinceReview} > 30 \implies \text{recencyScore} = 20$
   - $\text{daysSinceReview} > 14 \implies \text{recencyScore} = 50$
   - $\text{daysSinceReview} > 7 \implies \text{recencyScore} = 75$
   - $\text{daysSinceReview} \le 7 \implies \text{recencyScore} = 100$
   - If no reviews have occurred: default $\text{recencyScore} = 50$
4. **Lesson Completion (5%)**: Binary/stepped score ([line 214](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/masteryCalculator.ts#L214)): $100$ if `isLessonCompleted` is true; $80$ if questions were reviewed; otherwise $0$.

### Recommendation Rules & Evaluation Order

Defined in `getRecommendedNext()` in [`src/lib/server/knowledgeMap/recommendNext.ts:98-270`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.ts#L98-L270):

1. **Cold-Start Foundational Check** ([lines 98-122](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.ts#L98-L122)):
   - **Condition**: `!hasAnyReviews` (no questions reviewed in any course module).
   - **Action**: Selects root node with 0 incoming prerequisite edges (`prereqs.length === 0`).
   - **Yields**: `type: 'continue_learning'`, Priority: `4`.
2. **Rule 1: Urgent FSRS Due Reviews** ([lines 124-155](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.ts#L124-L155)):
   - **Threshold**: `questionsDue > 0`.
   - **Tie-breaker**: Sorted descending by `questionsDue` (most overdue first).
   - **Yields**: `type: 'review'`, Priority: `1`.
3. **Rule 2: Targeted Weak Concept Remediation** ([lines 157-187](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.ts#L157-L187)):
   - **Threshold**: `0 < masteryPercent < 50`.
   - **Tie-breaker**: Sorted ascending by `masteryPercent` (weakest concept first).
   - **Yields**: `type: 'practice_weak'`, Priority: `3`.
4. **Rule 3: Curriculum Progression (Prerequisite-Ready)** ([lines 189-242](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.ts#L189-L242)):
   - **Threshold**: `masteryPercent < 80` where all incoming prerequisite nodes have `pMastery.masteryPercent >= 80 || pMastery.fsrsState === 'not-assessed'`.
   - **Ranking Score**: $\text{score} = (\text{prereqsMastered} ? 100 : 0) + \text{importance} - (0.5 \times \text{masteryPercent})$.
   - **Yields**: `type: 'continue_learning'`, Priority: `4`.
5. **Rule 4: Long-Term Memory Reinforcement** ([lines 244-270](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.ts#L244-L270)):
   - **Condition**: All course modules have $\ge 80\%$ mastery.
   - **Action**: Selects module with lowest memory stability (`averageStability`).
   - **Yields**: `type: 'explore'`, Priority: `5`.

_(Note: Priority Level 2 is defined in TypeScript types but not emitted in `getRecommendedNext`; direct mistake remediation is handled on a separate dedicated route `/app/mistakes`)._

### Weight & Threshold Derivation Provenance

- **Explanation in comments**: Stated in header comments at [`src/lib/server/knowledgeMap/masteryCalculator.ts:4-23`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/masteryCalculator.ts#L4-L23):
  _"Mastery is estimated as a multi-signal heuristic approximation rather than an uncalibrated statistical certainty... Quiz Accuracy (45%): Direct active-recall performance is the strongest empirical evidence of concept comprehension... Lesson Completion (5%): Passive reading does not prove understanding; hence it receives the lowest weighting."_
- **Explanation in git history**: Commit `72b435c224aaa5b1ab0444a5b41d42f018790cad` notes:
  _"NOTE ON HEURISTIC WEIGHTS: The MASTERY_WEIGHTS values below are hand-tuned heuristic approximations used for visual rank and prioritization within the knowledge map. They are not statistically calibrated probability models."_
- **Statistical / Empirical Dataset Fitting**: **NOT FOUND IN REPO**. The weights ($0.45, 0.35, 0.15, 0.05$) and thresholds ($50\%, 80\%$) were not fitted via linear regression or machine learning; they are hand-tuned heuristic values based on educational domain principles.

---

## 4. Retrieval pipeline

Audited from [`ml_backend/models/rag_pipeline.py:1-485`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L1-L485) and [`ml_backend/main.py:108-137`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/main.py#L108-L137):

- **Chunk Size & Overlap**: `chunk_size = 1000` characters, `chunk_overlap = 200` characters. Initialized via `RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200, separators=["\n\n", "\n", ". ", " ", ""])` ([`ml_backend/models/rag_pipeline.py:113-117`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L113-L117)).
- **Embedding Model & Dimension**: `sentence-transformers/all-MiniLM-L6-v2` ([line 51](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L51)). Embedding dimension is **384** ([line 103](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L103)).
- **Index Type**: Dense Euclidean L2 flat index wrapped in a monotonic ID map: `faiss.IndexIDMap(faiss.IndexFlatL2(384))` ([lines 156, 192, 238](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L156)).
- **Results Retrieved per Query**: Default `top_k = 3` ([line 254](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L254)). In [`ml_backend/main.py:734`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/main.py#L734), calls execute `rag.retrieve(query=..., user_id=..., top_k=3)`.
- **Reranking**: **NO RERANKING EXISTS IN CODE**. Results are ordered strictly by raw FAISS Euclidean distance ($L_2$ norm) ([line 313](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L313)). No cross-encoder or neural reranker is called.
- **Index Persistence Location**: Local container filesystem at `vector_store/index.faiss` (binary FAISS index) and `vector_store/docs.json` (JSON document registry) ([lines 52-53, 374-385](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L52-L53)).
- **Cold Start Behavior**:
  - On process initialization, if `vector_store/index.faiss` or `vector_store/docs.json` do not exist on disk, `_load_index()` is skipped ([lines 120-121](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L120-L121)).
  - `self._index` remains `None`, `self._id_to_doc` is initialized to `{}` and `self._next_id` to `0`.
  - In this unseeded state, calling `retrieve()` returns `""` (empty string context) immediately ([lines 274-275](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L274-L275)).
  - The first call to `add_documents()` dynamically instantiates `self._index = faiss.IndexIDMap(faiss.IndexFlatL2(384))` ([line 156](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L156)), assigns monotonic `int64` IDs, and writes both files to disk via `_save_index()` ([lines 182, 374-385](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L182)).
- **Authorisation Check on Document Chunks**:
  Two-tier enforcement in [`ml_backend/models/rag_pipeline.py:278-337`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L278-L337):
  1. **Pre-search FAISS ID Filter** ([lines 278-299](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L278-L299)): Generates `authorized_fids` where `doc.scope == "global"` OR `(doc.scope == "private" and doc.user_id == user_id)`. If supported by the installed FAISS library, passes an `IDSelectorBatch` to `SearchParameters` to prevent private candidate crowding during search.
  2. **Post-retrieval Defense-in-Depth Filter** ([lines 326-337](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L326-L337)): As candidates are extracted from the result matrix, each chunk's metadata is re-verified:
     ```python
     if doc_scope == "global":
         retrieved.append(doc["text"])
     elif doc_scope == "private" and doc_user_id == user_id:
         retrieved.append(doc["text"])
     # else: another user's private content — rejected
     ```

---

## 5. Tests

### Suite Counts & Breakdown

| Test Suite                   | Framework / Runner        | Test Files Count | Individual Test Cases Count | Status                            |
| :--------------------------- | :------------------------ | :--------------- | :-------------------------- | :-------------------------------- |
| **JS/TS Unit & Integration** | Vitest (Project `server`) | **44 files**     | **277 tests**               | **277 Passed**                    |
| **Firestore Security Rules** | Vitest (Project `rules`)  | **1 file**       | **8 tests**                 | **8 Skipped** (Emulator required) |
| **Python Unit & Regression** | Pytest                    | **6 files**      | **72 tests**                | **72 Passed** (3 warnings)        |
| **Playwright End-to-End**    | Playwright                | **3 files**      | **51 tests**                | Configured for E2E                |

### Playwright End-to-End Specs Breakdown

Audited from [`tests/`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/tests):

1. [`tests/fullPipeline.hermetic.e2e.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/tests/fullPipeline.hermetic.e2e.ts) (**1 test case**):
   - **Covers**: Full unmocked production pipeline against Firebase Auth and Firestore emulators. Executes real user account creation, navigation to `/app/courses/createCourse`, topic submission, preference selection, real `POST /api/courses` generation, draft confirmation, verified redirection to live `/app/courses/[id]`, and verifies live Firestore module persistence in the user library without network mocking. Skips gracefully when emulators are offline.
2. [`tests/responsiveLayout.e2e.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/tests/responsiveLayout.e2e.ts) (**48 test cases**):
   - **Covers**: Desktop and laptop viewport responsiveness. Tests 8 viewports (from 1024x600 Netbook / 175% scale up to 1920x1080 Full HD) across 6 pages: Landing Page (`/`), App Dashboard (`/app`), Course Creation Wizard (`/app/courses/createCourse`), Explore Catalog (`/app/explore`), Knowledge Base (`/app/knowledge`), and Settings (`/app/settings`). Asserts `scrollWidth <= clientWidth` to guarantee 0 horizontal layout overflow.
3. [`tests/userJourney.e2e.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/tests/userJourney.e2e.ts) (**2 test cases**):
   - **Covers**:
     1. Mocked UI client smoke test: course wizard rendering and handling mocked API responses from `/api/courses`, `/api/modules/mod1/generate`, and `/api/modules/mod1/complete`.
     2. Wizard state lifecycle: tests debounced (400ms) localStorage auto-save of active draft topics, confirms that URL query changes do not clobber user typing, and verifies complete draft clearance on logout.

### Test Coverage Numbers

- **Committed Coverage Reports**: **NOT FOUND IN REPO**.
- No `coverage/` directory, `lcov.info`, `.nyc_output`, or XML coverage files are committed in git.

### Live Test Run Summary Outputs

#### 1. Vitest Unit Suite (`npm run test:unit -- --run`)

```text
 Test Files  44 passed (44)
      Tests  277 passed (277)
   Start at  20:33:07
   Duration  57.22s (transform 18.10s, setup 0ms, import 152.59s, tests 9.54s, environment 55ms)
```

#### 2. Security Rules Suite (`npm run test:rules`)

```text
 RUN  v4.1.10 C:/Users/USER/Downloads/Telegram Desktop/Study

stderr | src/lib/firebase/rules.test.ts
[Firestore Rules Tests] Firestore emulator is not running at 127.0.0.1:8085. Skipping security rules tests. To run rules tests, execute: npm run test:rules:emulator

 ↓  rules  src/lib/firebase/rules.test.ts (8 tests | 8 skipped)

 Test Files  1 skipped (1)
      Tests  8 skipped (8)
   Start at  20:34:23
   Duration  4.16s (transform 184ms, setup 0ms, import 3.37s, tests 0ms, environment 1ms)
```

#### 3. Python Pytest Suite (`.\.venv\Scripts\python.exe -m pytest ml_backend/`)

```text
============================= test session starts =============================
platform win32 -- Python 3.12.9, pytest-9.1.1, pluggy-1.6.0
rootdir: C:\Users\USER\Downloads\Telegram Desktop\Study
plugins: anyio-4.14.2, langsmith-0.10.15
collected 72 items

ml_backend\test_cache.py .....                                           [  6%]
ml_backend\test_chat_safety.py ..........                                [ 20%]
ml_backend\test_error_sanitization.py ..                                 [ 23%]
ml_backend\test_ml_backend.py .........................................  [ 80%]
ml_backend\test_rag_regression.py ............                           [ 97%]
ml_backend\test_rate_limiter.py ..                                       [100%]

================= 72 passed, 3 warnings in 200.56s (0:03:20) ==================
```

---

## 6. Evaluation artifacts

Audited against [`evaluation/`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation), [`docs/EVALUATION.md`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/docs/EVALUATION.md), and [`docs/BENCHMARKS.md`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/docs/BENCHMARKS.md):

### 1. 50 Rated Multiple-Choice Questions (4.51/5 score, 92% rated >= 4/5)

- **Producing Script**: [`evaluation/scripts/evaluate_quiz_rubric.py:1-137`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/scripts/evaluate_quiz_rubric.py#L1-L137)
- **Raw Data Files**: [`evaluation/datasets/quiz_samples_50.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/datasets/quiz_samples_50.json) and [`evaluation/datasets/quiz_expert_eval_50.csv`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/datasets/quiz_expert_eval_50.csv)
- **Results Files**: [`evaluation/results/quiz_evaluation_summary.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/quiz_evaluation_summary.json) and [`evaluation/results/quiz_human_eval_50.csv`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/quiz_human_eval_50.csv)
- **Exact Item Count**: $N = 50$ multiple-choice questions.
- **Scoring Criteria & Rubric in Code**: 1–5 Likert scale evaluated by a single internal domain expert ($n=1$) across 5 dimensions: Relevance (mean 5.00), Clarity (mean 4.86), Correctness (mean 5.00), Distractor Plausibility (mean 4.14), Difficulty Appropriateness (mean 3.56) ([`evaluate_quiz_rubric.py:55-74`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/scripts/evaluate_quiz_rubric.py#L55-L74)).
- **Sample Selection**: 50 questions generated across 7 undergraduate CS topics stratified across Bloom's Taxonomy (Understand: 24, Analyze: 14, Apply: 7, Remember: 5).
- **True N & Recomputed Figure**:
  - True $N = 50$.
  - Recomputed overall composite mean: **`4.5120 / 5.0`** (matches reported 4.51).
  - Recomputed percentage scoring $\ge 4.0$: In the raw CSV data, **100.0%** (50 out of 50 questions) have `overall_score >= 4.0` (minimum is 4.0, maximum is 5.0). The `92.0%` figure in [`docs/EVALUATION.md:113`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/docs/EVALUATION.md#L113) is an author-inserted markdown table entry; the mean of the 5 dimension high-quality percentages is $(100 + 100 + 100 + 98 + 54) / 5 = \mathbf{90.4\%}$.

### 2. 30 Retrieval Queries (36.67% Precision@3, 50% Groundedness, 100% on Indexed Topics)

- **Producing Script**: [`evaluation/scripts/evaluate_rag.py:1-192`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/scripts/evaluate_rag.py#L1-L192)
- **Raw Data File**: [`evaluation/datasets/rag_queries_30.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/datasets/rag_queries_30.json)
- **Results Files**: [`evaluation/results/rag_metrics_summary.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/rag_metrics_summary.json) and [`evaluation/results/rag_evaluation_results.csv`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/rag_evaluation_results.csv)
- **Exact Item Count**: $N = 30$ test queries across 7 subject areas.
- **Scoring Criteria in Code**:
  - `is_relevant_hit` = `query_context_cosine_sim >= 0.50` OR `keyword_coverage_ratio >= 0.40` ([`evaluate_rag.py:99`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/scripts/evaluate_rag.py#L99)).
  - `is_grounded` = `gold_context_cosine_sim >= 0.45` OR `len(matched_kws) >= 2` ([`evaluate_rag.py:104`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/scripts/evaluate_rag.py#L104)).
- **Sample Selection**: 30 queries designed to span core CS undergraduate curricula: Computer Networks (6), Algorithms (6), Operating Systems (6), Databases (4), Compilers (3), AI (3), Computer Architecture (2).
- **True N & Recomputed Figures**:
  - True $N = 30$.
  - Precision@3: 11 hits / 30 queries = **`36.67%`** (recomputed matches report).
  - Groundedness Rate: 15 grounded / 30 queries = **`50.00%`** (recomputed matches report).
  - Domain Precision on Artificial Intelligence: 3 hits / 3 queries = **`100.00%`** (recomputed matches report; unindexed Computer Architecture achieved 0%).

### 3. 8 Summarisation Excerpts with ROUGE and Compression Figures

- **Producing Script**: [`evaluation/scripts/evaluate_summarization.py:1-250`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/scripts/evaluate_summarization.py#L1-L250)
- **Raw Data File**: [`evaluation/datasets/summarization_eval_data.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/datasets/summarization_eval_data.json)
- **Results Files**: [`evaluation/results/summarization_metrics_summary.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/summarization_metrics_summary.json) and [`evaluation/results/summarization_results.csv`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/summarization_results.csv)
- **Exact Item Count**: $N = 8$ lecture note excerpts (SUM-01 through SUM-08).
- **Scoring Criteria in Code**: Evaluates `google/flan-t5-base` inferences against `gold_summary` using Python `rouge_score` (unigram ROUGE-1, bigram ROUGE-2, longest common subsequence ROUGE-L), character compression ratio $1 - (\text{summary\_len} / \text{text\_len})$, and Flesch Reading Ease readability scoring.
- **Sample Selection**: 8 textbook excerpts across 7 core computer science subjects (OS, Compilers, Networks, DBMS, Algorithms, AI, Architecture).
- **True N & Recomputed Figures**:
  - True $N = 8$.
  - Mean ROUGE-1: **`26.44 ± 14.64`**
  - Mean ROUGE-2: **`5.57 ± 6.71`**
  - Mean ROUGE-L: **`20.87 ± 10.26`**
  - Mean Compression Ratio: **`75.15% ± 7.57%`**
  - Mean Flesch Reading Ease: **`47.22 ± 25.98`**
  - Mean Inference Latency: **`3.11s ± 2.55s`**

### 4. Adaptation Rule Tests Reporting 100%

- **Producing Script**: [`src/lib/server/knowledgeMap/recommendNext.test.ts:1-199`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.test.ts#L1-L199)
- **Raw Data / Benchmark File**: **NOT FOUND IN REPO** as an empirical benchmark dataset or CSV artifact.
- **Exact Case Count**: **4 unit test cases** in Vitest.
- **Scoring Criteria & Interpretation**: The "100%" reported in [`docs/EVALUATION.md:157-159`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/docs/EVALUATION.md#L157-L159) reflects that **4 out of 4 (100%)** automated unit test assertions in `recommendNext.test.ts` pass:
  1. Cold start returns Priority 4 foundational module ([lines 29-40](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.test.ts#L29-L40)).
  2. Questions due returns Priority 1 review ([lines 42-71](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.test.ts#L42-L71)).
  3. Weak concept ($< 50\%$) returns Priority 3 practice ([lines 73-144](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.test.ts#L73-L144)).
  4. All mastered ($\ge 80\%$) returns Priority 5 explore on lowest stability ([lines 146-197](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.test.ts#L146-L197)).

### 5. 15-Participant SUS Study (84.50 SUS, Cronbach's Alpha 0.946)

- **Producing Script**: [`evaluation/scripts/analyze_user_study.py:1-198`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/scripts/analyze_user_study.py#L1-L198)
- **Raw Data File**: [`evaluation/datasets/user_study_responses.csv`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/datasets/user_study_responses.csv)
- **Results Files**: [`evaluation/results/user_study_summary.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/user_study_summary.json) and [`evaluation/results/user_study_calculated_scores.csv`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/user_study_calculated_scores.csv)
- **Exact Participant Count**: $N = 15$ undergraduate students.
- **Scoring Criteria in Code**: Standard Brooke (1996) 10-item Likert scoring ($2.5 \times [\sum(\text{odd} - 1) + \sum(5 - \text{even})]$) and reverse-coded item variance for Cronbach's $\alpha = \frac{k}{k-1}\left(1 - \frac{\sum \sigma_i^2}{\sigma_X^2}\right)$ ([`analyze_user_study.py:26-36, 88-94`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/scripts/analyze_user_study.py#L26-L36)).
- **Sample Selection**: 15 students across KNUST computing programmes: BSc Computer Science (8), BSc Computer Engineering (4), BSc Information Technology (3); Years 2 to 4.
- **True N & Recomputed Figures**:
  - True $N = 15$.
  - Recomputed Mean SUS: **`84.5000`** (Grade A+, 96–100th percentile).
  - Recomputed Sample Std Dev: **`12.7195`** (12.72).
  - Recomputed 95% Confidence Interval: **`[78.06, 90.94]`**.
  - Recomputed Cronbach's $\alpha$: **`0.9464`** (matches reported 0.946).

### 6. Latency Figures per Provider Tier & FAISS at ~35 ms

- **Producing Script**: [`evaluation/scripts/run_latency_benchmarks.py:1-315`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/scripts/run_latency_benchmarks.py#L1-L315)
- **Raw Data File**: [`evaluation/results/latency_benchmarks.csv`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/latency_benchmarks.csv) (240 measured rows)
- **Results File**: [`evaluation/results/latency_summary.json`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/latency_summary.json)
- **Exact Item Count**: 240 benchmark measurements across 8 operations $\times$ 3 tiers $\times$ 10 iterations.
- **Recomputed Figures**:
  - **FAISS Dense Retrieval (`ml_backend`)**: Mean = **`0.033s ± 0.010s` (33 ms ± 10 ms)**; median = **`29 ms`**; P95 = **`51 ms`**; min = **`28 ms`**; max = **`64 ms`**. Confirms the "~35 ms" reported claim.
  - **Course Outline Generation**: Primary Cloud (Gemini Flash) = `2.05s ± 0.85s` vs. Local Fallback (`ml_backend`) = `12.69s ± 1.25s` vs. Cache Hit = `< 0.1ms`.
  - **Lesson Generation (3 pages)**: Gemini Flash = `4.46s ± 6.47s` vs. Local Fallback = `22.68s ± 2.88s` vs. Cache Hit = `< 0.0ms`.
  - **Quiz Generation (5 MCQs)**: Gemini Flash = `3.51s ± 5.68s` vs. Local Fallback = `8.55s ± 1.30s`.
  - **Summarization**: Gemini Flash = `4.09s ± 5.79s` vs. Local Fallback = `2.85s ± 0.34s`.
  - **Paraphrasing**: Gemini Flash = `4.47s ± 6.51s` vs. Local Fallback = `3.08s ± 0.44s`.
- **Methodology & Measurement Mode in Code**:
  [`evaluation/results/latency_summary.json:24, 57, 123`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/evaluation/results/latency_summary.json#L24) explicitly notes that `local_fallback_ml_backend` autoregressive generation tasks (outline, lesson, quiz, chat) are marked `"measurement_mode": "MODELLED_PROJECTION"` (simulating CPU throughput of 15–20 tok/sec on 780M–1.1B models), whereas FAISS search and Gemini API calls are measured as `"LIVE_EMPIRICAL"`.

---

## 7. Features present in code but missing from the report

### Implemented in Code but Omitted / Undocumented in Report

1. **Collaborative Study Groups** ([`src/routes/app/study-groups/+page.svelte:1-250`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/app/study-groups/+page.svelte#L1-L250), [`src/routes/api/study-groups/+server.ts:1-74`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/api/study-groups/+server.ts#L1-L74)):
   Allows users to create study groups, generate 6-character alphanumeric invite codes, join groups via code, view member lists, and manage shared group workspaces. Firestore path: `/studyGroups/{groupId}`.
2. **Mistake Notebook / Error Bank** ([`src/routes/app/mistakes/+page.svelte:1-260`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/app/mistakes/+page.svelte#L1-L260), [`src/lib/server/analytics/mistakeRecords.ts:1-120`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/analytics/mistakeRecords.ts#L1-L120)):
   Failed quiz questions are automatically logged to `/mistakeRecords/{userId}/mistakes/{questionId}`. Provides a dedicated practice notebook where students re-attempt previously failed questions until marked "resolved".
3. **Progressive Web App (PWA) & Offline Sync** ([`src/lib/pwa.ts:1-90`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/pwa.ts#L1-L90), [`src/lib/server/offlineSync.ts:1-110`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/offlineSync.ts#L1-L110), [`static/service-worker.js:1-70`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/static/service-worker.js#L1-L70), [`static/manifest.json:1-40`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/static/manifest.json#L1-L40)):
   Service worker with cache-first static asset caching, offline sync queues stored in localStorage/IndexedDB, and automatic reconciliation of offline quiz completions upon network reconnection.
4. **Streak Freezes & Streak Repair Mechanism** ([`src/lib/server/streak.ts:1-140`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/streak.ts#L1-L140), [`src/routes/api/user/streak-freeze/+server.ts:1-60`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/api/user/streak-freeze/+server.ts#L1-L60), [`src/routes/api/user/repair-streak/+server.ts:1-60`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/api/user/repair-streak/+server.ts#L1-L60)):
   Users receive streak freeze tokens (up to 2 freezes, auto-refilled every 30 days) to prevent streak loss if a single day is missed, plus a grace repair endpoint.
5. **AI Content Safety Moderation Guardrail** ([`src/lib/server/ai/moderation.ts:1-95`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/moderation.ts#L1-L95), [`src/routes/api/flag/+server.ts:1-50`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/api/flag/+server.ts#L1-L50)):
   Automated regex and heuristic scanning of peer-authored questions for toxicity, hate speech, sexual content, and prompt injection attacks before questions are accepted into the database.
6. **AI Memorization Guard** ([`src/lib/server/ai/memorizationGuard.ts:1-110`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/memorizationGuard.ts#L1-L110)):
   Detects whether generated lesson passages verbatim duplicate pre-training training data (e.g. SciQ or Wikipedia corpus) using sliding 8-gram lexical overlap windows.
7. **Automated Weak Topic Detector** ([`src/lib/server/ai/weakTopicDetector.ts:1-85`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/weakTopicDetector.ts#L1-L85)):
   Continuously analyzes question history across sessions; automatically flags topics with $< 60\%$ accuracy over $\ge 3$ attempts and writes alerts to `/weakTopics/{uid}`.
8. **Automated Course Consistency Checker** ([`src/routes/api/courses/[id]/consistency-check/+server.ts:1-80`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/api/courses/[id]/consistency-check/+server.ts#L1-L80)):
   Validates course structural integrity: ensures module numbering is sequential, quizzes follow lessons, and no orphaned modules exist.
9. **Superadmin User Management Panel** ([`src/lib/server/superadmin/user.ts:1-100`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/superadmin/user.ts#L1-L100), [`src/routes/app/admin/+page.svelte:1-1200`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/app/admin/+page.svelte#L1-L1200)):
   Administrative student directory, privilege escalation via `SUPERADMIN_EMAIL`, manual role assignment, course deletion overrides, and provider telemetry.
10. **Curated CS 10-Topic Taxonomy Routing Heuristic** ([`src/lib/server/ai/domainClassifier.ts:16-60`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/domainClassifier.ts#L16-L60)):
    Token-Jaccard lexical overlap heuristic routing requests between local Python models and Google Gemini.

### Claimed in Report but NOT Implemented in Code

1. **Client-Side Quiz Grading**: **CONTRADICTED BY CODE**. The report may claim quizzes are graded in the browser, but the code implements server-authoritative grading in [`src/routes/api/modules/[id]/complete/+server.ts:228-304`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/api/modules/%5Bid%5D/complete/+server.ts#L228-L304), while [`src/routes/app/courses/[id]/[moduleId]/+page.svelte:179-189`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/app/courses/%5Bid%5D/%5BmoduleId%5D/+page.svelte#L179-L189) strips answer keys from client payloads.
2. **Distributed Clustered Vector Store (Milvus / Qdrant)**: **NOT FOUND IN REPO**. While a migration helper script exists in [`ml_backend/scripts/migrate_vectors.py`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/scripts/migrate_vectors.py), no live connection or client for Milvus or Qdrant is instantiated in `rag_pipeline.py`.
3. **External Real-Time Error Tracking (Sentry / LogRocket)**: **NOT FOUND IN REPO**. Mentioned as a future roadmap item in [`docs/PROJECT_FEATURES.md:58`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/docs/PROJECT_FEATURES.md#L58); no Sentry SDK or initialization exists.
4. **Multi-Rater Inter-Annotator Reliability ($\kappa$)**: **NOT FOUND IN REPO**. Confirmed in [`docs/EVALUATION.md:97`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/docs/EVALUATION.md#L97) that evaluations were conducted by a single evaluator ($n=1$), so inter-rater agreement metrics do not exist.

---

## 8. Known limitations visible in the code

### 1. Client-Side Quiz Grading

- **Status**: **CONTRADICTED BY CODE** (Quiz grading is Server-Authoritative).
- **Evidence**:
  - In [`src/routes/app/courses/[id]/[moduleId]/+page.svelte:179-189`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/app/courses/%5Bid%5D/%5BmoduleId%5D/+page.svelte#L179-L189), the client explicitly strips answer keys (`correctIndex`, `answerIndex`, `explanation`) from the questions presented to the UI runner:
    ```svelte
    let sanitizedQuestions = $derived(
        (moduleData?.questions || []).map((q) => ({
            order: q.order,
            prompt: q.prompt || q.question || '',
            options: q.options || [],
            conceptId: q.conceptId,
            conceptTag: q.conceptTag
        }))
    );
    ```
  - When the student finishes the quiz, the browser submits only their selected indices (`answers: number[]`) to `POST /api/modules/[id]/complete` ([lines 192-208](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/app/courses/%5Bid%5D/%5BmoduleId%5D/+page.svelte#L192-L208)).
  - In [`src/routes/api/modules/[id]/complete/+server.ts:228-304`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/api/modules/%5Bid%5D/complete/+server.ts#L228-L304), grading occurs server-side inside a Firestore transaction:
    ```typescript
    // Server-side authoritative quiz grading
    const reviewItems = questions.map((q, i: number) => {
        const correctIndex = ...;
        const selectedIndex = answers[i];
        const isCorrect = selectedIndex === correctIndex;
        ...
    });
    ```
  - In [`firestore.rules:14-17`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/firestore.rules#L14-L17), direct client writes to course progress are blocked: `allow write: if false; // Server-authoritative via /api/modules/[id]/complete`.

### 2. Local FAISS Persistence

- **Status**: **CONFIRMED IN CODE**.
- **Evidence**:
  - In [`ml_backend/models/rag_pipeline.py:52-53`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L52-L53):
    ```python
    _INDEX_PATH = Path(os.getenv("FAISS_INDEX_PATH", "vector_store/index.faiss"))
    _DOCS_PATH  = Path(os.getenv("FAISS_DOCS_PATH",  "vector_store/docs.json"))
    ```
  - In [`ml_backend/models/rag_pipeline.py:374-385`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L374-L385), `_save_index()` writes vectors and metadata to disk using `faiss.write_index(self._index, str(_INDEX_PATH))` and `json.dump(payload, f)`.
  - **Limitation**: The vector store is bound to the local container filesystem. If deployed to ephemeral serverless containers (e.g. Render or Google Cloud Run without a mounted persistent volume), all ingested document vectors are discarded on container restarts or horizontal auto-scaling.

### 3. Lexical Domain Classifier

- **Status**: **CONFIRMED IN CODE**.
- **Evidence**:
  - In [`src/lib/server/ai/domainClassifier.ts:1-60`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/domainClassifier.ts#L1-L60), the classification mechanism is explicitly documented as a lexical heuristic:
    ```typescript
    export const CS_TAXONOMY_TOPICS = [
        'Data Structures & Algorithms',
        'Operating Systems',
        ...
    ];
    ```
  - The function `calculateDomainConfidence()` tokenizes the user input using regex `replace(/[^a-z0-9\s]/g, '')` and computes a Jaccard token intersection ratio against the 10 static taxonomy strings ([lines 36-60](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/domainClassifier.ts#L36-L60)).
  - **Limitation**: It has zero semantic understanding. Phrasings that describe CS concepts without using the exact lexical tokens (e.g., "Page replacement and thrashing in kernel space") receive zero token intersection against "Operating Systems" and are routed to general cloud models rather than the domain-adapted local ML backend.

### 4. In-Memory Rate-Limit Fallback

- **Status**: **CONFIRMED FOR ML BACKEND; CONTRADICTED FOR SVELTEKIT**.
- **Evidence**:
  - **Python ML Backend**: Confirmed. In [`ml_backend/main.py:157`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/main.py#L157), SlowAPI is initialized without a storage URI (`Limiter(key_func=user_key, default_limits=["120/minute"])`), which defaults to in-memory `MemoryStorage`. In [`ml_backend/cache.py:38-39`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/cache.py#L38-L39), cache fallback uses an in-memory `cachetools.TTLCache(maxsize=1000, ttl=86400)`.
  - **SvelteKit Server**: Contradicted. In [`src/lib/server/rateLimiter.ts:20-56`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/rateLimiter.ts#L20-L56), if Upstash Redis is not configured or fails, the code falls back to a **Firestore atomic transaction** (`adminDb.runTransaction`), NOT an in-memory data structure:
    ```typescript
    // Fallback to Firestore atomic transaction rate limiting
    await adminDb.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        ...
        transaction.set(docRef, { [countField]: currentCount + 1, [windowField]: windowKey }, { merge: true });
    });
    ```
    Therefore, on the SvelteKit edge/serverless tier, rate limits are preserved across serverless function instances via Firestore transactions rather than volatile process memory.

---

## 9. Items Marked NOT FOUND IN REPO

The following items were searched for across the repository's code, configuration, test files, and committed data artifacts and **cannot be found**:

1. **Third-party spaced-repetition library** (`ts-fsrs`, `fsrs.js`, or similar): **NOT FOUND IN REPO**. FSRS-4.5 is implemented as an in-house custom TypeScript module in [`src/lib/server/fsrs.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/fsrs.ts).
2. **Committed test coverage report**: **NOT FOUND IN REPO**. No `coverage/` directory, `lcov.info`, or XML test coverage files are present in the repository.
3. **Statistical / empirical calibration dataset for mastery weights**: **NOT FOUND IN REPO**. The 4 component weights ($0.45, 0.35, 0.15, 0.05$) and recommendation thresholds ($50\%, 80\%$) are hand-tuned heuristic approximations.
4. **Reranker model in RAG retrieval pipeline**: **NOT FOUND IN REPO**. Chunks are ordered purely by FAISS $L_2$ Euclidean distance without a cross-encoder or neural reranker.
5. **Separate empirical dataset or benchmark script for adaptation rule tests**: **NOT FOUND IN REPO**. The reported "100%" represents unit test assertions in [`src/lib/server/knowledgeMap/recommendNext.test.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.test.ts).
6. **Clustered vector database connection (Qdrant / Milvus)**: **NOT FOUND IN REPO**. Only a local migration helper script exists in `ml_backend/scripts/migrate_vectors.py`.
7. **External APM / error tracking integration (Sentry / LogRocket)**: **NOT FOUND IN REPO**.
8. **Multi-rater inter-annotator agreement metrics ($\kappa$)**: **NOT FOUND IN REPO**. Evaluation was single-expert ($n=1$).
9. **Python packaging lockfiles (`poetry.lock`, `Pipfile.lock`, `pyproject.toml`)**: **NOT FOUND IN REPO**. Python dependencies are managed exclusively via [`ml_backend/requirements.txt`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/requirements.txt).
