# AI Study Buddy — Features & Roadmap

## 1. AI Course Generation & Customization

- Instant course creation: Type in any topic or prompt to generate a complete course outline with structured modules.
- Flexible draft outline editor: Review, reorder, edit, or add your own modules before finalizing your course.
- Asynchronous lesson generation: Course structure loads immediately while detailed lesson pages and code examples generate in the background.
- Dynamic quiz creator: Generates multiple-choice quizzes with plausible answer choices and explanations for every module.

## 2. Learning Experience & Course Player

- Clean lesson reader: Read through lesson modules step-by-step with real-time reading progress indicators.
- Interactive quizzes: Get instant answer feedback, view explanations, retry quizzes, and track your scores.
- Course completion certificates: Automatically download a PDF or HTML certificate after finishing all modules and quizzes in a course.
- Spaced repetition knowledge hub: Review flashcards and key concepts on a scheduled queue to help retain what you learn.

## 3. Built-In AI Study Assistants

- In-lesson AI tutor: An interactive assistant that stays by your side during lessons to answer questions and explain tricky concepts.
- Text summarizer: Condenses long lessons or articles into key takeaways and quick bullet points.
- Text paraphraser: Rephrases complex text into Academic, Simple, or Formal tones to match your learning style.

## 4. Streaks & Gamification

- Timezone-aware daily streaks: Accurately tracks your daily study streaks based on your local timezone.
- Daily goal rings: Visual progress rings that encourage you to meet your daily learning target.
- Learning heatmap: A calendar grid showing your daily study activity over time.
- Achievement badges: Unlock progress badges as you complete courses and maintain daily study streaks.

## 5. Course Sharing & Community

- Public explore catalog: Discover, search, and take public courses created by other learners.
- Easy course sharing: Generate shareable links and access codes to send your courses to friends.
- One-click course cloning: Save a copy of any shared course directly into your personal workspace.
- Course duplication / forking: Duplicate any ready course from your dashboard with pre-generated content to customize or retake without incurring AI generation costs.
- Peer-authored community questions: Submit and practice community-contributed questions on completed quizzes with automated AI safety moderation.

## 6. User Accounts, Themes & Security

- Simple sign-in options: Register with email and password or log in quickly with Google.
- Email verification: Built-in email verification workflow to keep accounts safe and verified.
- Color themes: Switch seamlessly between Calm Light, Sage, and Focus Dark visual themes.
- Admin dashboard: Tools for platform managers to view app metrics, manage courses, and review flagged content.
- App security: Keeps data safe with input sanitization, secure sessions, rate limiting, and caching for fast load times.

## 7. AI & Machine Learning Architecture

- Dual AI setup: Powered primarily by Google Gemini, with automatic fallback to a local Python server if needed.
- Context-aware RAG search: Uses vector search to pull relevant information into AI responses for higher accuracy.
- Local AI models: Open-weight foundation models (Flan-T5 and TinyLlama) with domain fine-tuning recipes and RAG handle summarization, paraphrasing, quiz generation, and chat offline.
- Asynchronous generation queue: Decouples heavy AI module generation from frontend requests to prevent serverless function timeouts.
- Persistent FAISS vector storage: FAISS binary index and chunk metadata are saved to disk to persist document embeddings across container restarts.
- Multi-tier rate limiting: Upstash Redis rate limiting with atomic Firestore transactions and in-memory fallback.
- Automated CI pipeline: GitHub Actions running type checks, linter, Vitest unit tests, security audits, and Pytest suites on every push.

## 8. Planned & Upcoming Features (To Be Done)

- Real-time error tracking: Integrates external APM/monitoring tools (e.g. Sentry/LogRocket) to track unhandled errors and generation failures in production.
- Accessible UI improvements: Enhances screen-reader compatibility and keyboard navigation across complex interactive elements.
- Webhook notification integration: Dispatch webhooks or email alerts when large background course generations complete.
