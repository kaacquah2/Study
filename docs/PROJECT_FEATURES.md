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

## 6. User Accounts, Themes & Security

- Simple sign-in options: Register with email and password or log in quickly with Google.
- Email verification: Built-in email verification workflow to keep accounts safe and verified.
- Color themes: Switch seamlessly between Calm Light, Sage, and Focus Dark visual themes.
- Admin dashboard: Tools for platform managers to view app metrics, manage courses, and review flagged content.
- App security: Keeps data safe with input sanitization, secure sessions, rate limiting, and caching for fast load times.

## 7. AI & Machine Learning Architecture

- Dual AI setup: Powered primarily by Google Gemini, with automatic fallback to a local Python server if needed.
- Context-aware RAG search: Uses vector search to pull relevant information into AI responses for higher accuracy.
- Local AI models: Fine-tuned local models (Flan-T5 and TinyLlama) handle summarization, paraphrasing, quiz generation, and chat offline.

## 8. Planned & Upcoming Features (To Be Done)

- Background job queue: Runs long-running course generation tasks in the background so request timeouts never interrupt course creation.
- Saved vector index: Saves uploaded document embeddings to disk or database so reference files stay available even after server restarts.
- Multi-region rate limiting: Connects to Redis to manage rate limits consistently across all server regions.
- Real-time error tracking: Integrates monitoring tools like Sentry to catch bugs and generation errors automatically.
- Accessible UI improvements: Enhances screen-reader compatibility and keyboard navigation for interactive elements like the outline editor.
- Automated testing pipeline: Sets up GitHub Actions to run tests automatically whenever code is updated.
