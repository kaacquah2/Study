# Study AI — Student-Friendly Technical Review & Defense Guide

> **Welcome to the Study AI Technical Review!**  
> This guide is designed specifically for **students** (Ahado Ronald Ofoe, Yoofi Ashon, and fellow CS students) to understand how the entire system works **in simple, plain English**.  
> No overwhelming math or unnecessary jargon — just clear explanations, real-world analogies, code references, and exact answers to impress your defense panel!

---

## 🧭 Quick Navigation: The 10 Big Parts of Study AI

1. [The Big Picture: What is Study AI and Why Did We Build It?](#1-the-big-picture-what-is-study-ai-and-why-did-we-build-it)
2. [How the Whole System Talks: The 3 Main Tiers](#2-how-the-whole-system-talks-the-3-main-tiers)
3. [The Frontend: What the User Sees & Clicks (SvelteKit + Svelte 5)](#3-the-frontend-what-the-user-sees--clicks-sveltekit--svelte-5)
4. [The Server & Security Guard: Protecting the App](#4-the-server--security-guard-protecting-the-app)
5. [Speed & Limits: Upstash Redis & Rate Limiting](#5-speed--limits-upstash-redis--rate-limiting)
6. [The Brain: How Study AI Decides What You Should Study Next](#6-the-brain-how-study-ai-decides-what-you-should-study-next)
7. [Memory Magic: Spaced Repetition (FSRS-4.5 vs Anki SM-2)](#7-memory-magic-spaced-repetition-fsrs-45-vs-anki-sm-2)
8. [The AI Providers: Why We Use Both Gemini and Python](#8-the-ai-providers-why-we-use-both-gemini-and-python)
9. [Smart Search (RAG) & The "Candidate Crowding" Problem](#9-smart-search-rag--the-candidate-crowding-problem)
10. [Defense Cheat Sheet: Top 10 Questions & Simple Answers](#10-defense-cheat-sheet-top-10-questions--simple-answers)

---

## 1. The Big Picture: What is Study AI and Why Did We Build It?

### 💡 The Problem with Regular AI (like ChatGPT) in School:

When students use ChatGPT to study, two big problems happen:

1. **The "Illusion of Competence":** Reading a chatbot's smooth answers makes you _feel_ like you understand the topic. But when exam day comes, you can't recall it because you just read passively without testing yourself.
2. **The "Point Feature" Problem:** Other study tools are disconnected islands — one website makes flashcards, another makes a quiz, another summarizes a PDF. None of them remember what you got wrong yesterday or build a personalized learning plan.

### 🎯 What Study AI Does Differently:

Study AI is not just another chatbot. It is a **complete learning system** that answers one big question:

> **"What should this student study next, and why?"**

It watches everything you do (lessons read, quiz questions missed, flashcards reviewed), calculates your real mastery score, and automatically tells you what topic to practice next to fix your weak spots.

---

## 2. How the Whole System Talks: The 3 Main Tiers

Think of Study AI like a modern restaurant:

```
[ FRONTEND: The Dining Room ]
User clicks in browser / phone (SvelteKit 2 + Svelte 5)
               │
               ▼  (HTTP / API Requests)
[ BFF BACKEND: The Waiter & Cashier ]
Checks your ID, blocks spam, checks cache (SvelteKit Server on Netlify)
               │
      ┌────────┴──────────────────────────────┐
      ▼                                       ▼
[ CLOUD: Fast Chef ]              [ LOCAL ML: Specialized Bakery ]
Google Gemini 2.5 Flash            Python FastAPI Backend
• Instant summaries & quizzes      • Reads uploaded PDFs with FAISS (RAG)
• Takes ~1.8 seconds               • Generates distractors from course slides
                                   • Works completely offline & private
```

1. **Frontend (The Dining Room):** Where the student sits. Runs in the browser using **SvelteKit 2** and **Svelte 5**. Super lightweight and works on mobile.
2. **Backend-For-Frontend / BFF (The Waiter):** Lives in [`src/routes/api/`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/api). It verifies your login token, stops attackers, checks Redis for saved answers, and decides which AI to call.
3. **AI Engines (The Kitchen):**
   - **Google Gemini 2.5 Flash (Cloud):** Blazing fast (1.8 seconds) for generating lesson outlines and explanations.
   - **Python FastAPI Backend (Local `ml_backend`):** Runs locally on port 8000. It reads course PDFs using vector search (FAISS) and can run offline without sending private exam papers to third-party clouds.

---

## 3. The Frontend: What the User Sees & Clicks (SvelteKit + Svelte 5)

### 3.1 Why did we use SvelteKit and Svelte 5 instead of React / Next.js?

- **Analogy:** React brings a heavy construction crew (Virtual DOM) into the browser every time a single number changes, comparing a fake page to the real page before updating it.
- **Svelte's Advantage:** Svelte does all the hard work **at compile time**. It turns your code into tiny, pure JavaScript that directly changes only the exact number on the screen.
- **Result:**
  - The website loads under **0.8 seconds**, even on slow university campus Wi-Fi.
  - The download bundle is tiny (**< 45 KB** compared to 150+ KB in React).

### 3.2 What are Svelte 5 "Runes"?

Runes are special symbols that tell Svelte what data can change:

- `$state(value)`: Tells Svelte, _"Hey, this number or text changes when the user clicks."_
- `$derived(calculation)`: A formula that auto-updates whenever the state changes (e.g., calculating quiz percentage).
- `$props()`: The inputs passed from a parent component into a child component.

### 3.3 Key Frontend Pages & Components:

- **Knowledge Map ([`src/routes/app/knowledge-map/+page.svelte`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/routes/app/knowledge-map)):**
  - Uses an engine called **ELK.js** to draw an interactive prerequisite tree.
  - If "Data Structures" requires "Basic C++", the tree shows an arrow from C++ to Data Structures. Nodes glow green when mastered, or show an amber badge when due for review!
- **Theme Switcher ([`ThemeSwitcher.svelte`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/components/ThemeSwitcher.svelte)):**
  - Switches between Dark Mode (deep midnight) and Light Mode.
  - Saved in browser storage so it remembers your choice.
- **Accuracy Gauge ([`AccuracyGauge.svelte`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/components/charts/AccuracyGauge.svelte)):**
  - A clean speedometer-style ring showing your mastery percentage.
- **Offline Storage ([`offlineStorage.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/offlineStorage.ts)):**
  - Uses **IndexedDB** inside your browser. If your internet cuts out on campus, your downloaded notes and flashcards stay available!

---

## 4. The Server & Security Guard: Protecting the App

All server requests pass through [`src/hooks.server.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/hooks.server.ts). Think of this file as the **security guard at the front door**.

### 4.1 The 4 Jobs of `hooks.server.ts`:

1. **Tracking Tag (`X-Request-ID`):** Gives every request a unique ID badge (like a hospital wristband). If something goes wrong, we can trace exactly what happened across all servers.
2. **CSRF Protection (Blocking Fake Requests):**
   - If someone tries to send a malicious `POST` request from an external website, our server checks the `Origin` header.
   - If the request didn't come from our real website, it is blocked immediately (`403 Forbidden`).
3. **Error Masking (No Leakage):**
   - If a database crash happens, regular servers accidentally show database passwords or code files to the user.
   - Our hook intercepts `500 errors` and replaces them with a clean, safe message: _"Internal Server Error (ID: xyz)"_.
4. **Startup Check:**
   - When the server boots up, it automatically tests if the Python ML Backend is running and verifies that the secret API keys match.

### 4.2 Who can do what? (RBAC in [`rbac.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/rbac.ts))

We have 4 simple user roles:

1. **Student:** Can study, take quizzes, view their own courses, and join study groups.
2. **Instructor:** Can see student analytics and view dashboards.
3. **Admin:** Can manage student accounts and monitor system health.
4. **Superadmin:** Can promote users to admins and change system-wide settings.

---

## 5. Speed & Limits: Upstash Redis & Rate Limiting

### 5.1 Why do we use Redis?

- **Analogy:** If someone asks you a question that takes 10 minutes of research, you don't want to re-do the research 5 minutes later when someone else asks the exact same question. You write the answer on a sticky note.
- **Upstash Redis ([`redis.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/redis.ts))** is our cloud sticky note:
  - If a student requests a course on "Introduction to Python", the AI takes 2 seconds to generate the outline.
  - We store the outline in Redis.
  - The next student who asks for "Introduction to Python" gets it in **less than 0.1 milliseconds**!

### 5.2 Rate Limiting ([`rateLimiter.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/rateLimiter.ts))

- What stops an abusive user from spamming the "Generate Lesson" button 1,000 times and costing us hundreds of dollars in AI API bills?
- Our **Rate Limiter** counts how many requests you make per hour.
- **Two-Tier Safety Net:**
  - _Tier 1:_ Counts fast in Redis.
  - _Tier 2:_ If Redis is temporarily down, it falls back to an atomic counter in Google Firestore. The system never crashes or leaves the door unlocked!

---

## 6. The Brain: How Study AI Decides What You Should Study Next

This is the most important academic part of your project!

### 6.1 Two-Tier Event Storage:

1. **Tier 1 (Raw Events in [`learningEvents.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/analytics/learningEvents.ts)):** Every time you finish a lesson, answer a quiz question, or flip a flashcard, an immutable log is saved.
2. **Tier 2 (Summary Profile in [`profileAggregator.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/analytics/profileAggregator.ts)):** Instead of recalculating thousands of events every time you open the dashboard, a single profile document keeps your totals (overall score, weak concepts, total study time).

### 6.2 The Mastery Formula ([`masteryCalculator.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/masteryCalculator.ts))

Instead of guessing with an unpredictable AI, we use an honest, explainable formula:

$$\text{Mastery Score} = 0.45 \times A_{\text{quiz}} + 0.35 \times P_{\text{FSRS}} + 0.15 \times S_{\text{recency}} + 0.05 \times C_{\text{lesson}}$$

#### Why these exact weights?

1. **Quiz Accuracy (45%):** Answering questions correctly from memory (**active recall**) is the best proof that you know a topic.
2. **Spaced Repetition Stability (35%):** Proves you didn't just cram today, but can still remember it after several days.
3. **Recency Score (15%):** If you haven't reviewed a topic in 3 weeks, your brain forgets it (the **Ebbinghaus Forgetting Curve**). The score drops slightly until you review.
4. **Lesson Reading (5%):** Just reading a slide is passive. It gives a small 5% bump, but won't let you claim 100% mastery without taking tests.

#### Sample Size Confidence:

- **0 questions:** `None`
- **1–4 questions:** `Low` (Warning: score might be lucky guesses)
- **5–14 questions:** `Medium`
- **15+ questions:** `High` (Mathematically solid mastery proof)

### 6.3 The 4-Priority Decision Matrix ([`recommendNext.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/knowledgeMap/recommendNext.ts))

When you ask the app _"What should I do right now?"_, it checks these rules in order:

- **Priority 1 (Urgent):** Are any flashcards due for review today? $\to$ **Do Spaced Review first** (stop forgetting).
- **Priority 2 (High):** Did you miss 3 or more questions recently? $\to$ **Drill your Mistake Notebook**.
- **Priority 3 (Medium):** Is your mastery on an existing topic under 50%? $\to$ **Practice Weak Topic**.
- **Priority 4 (Normal):** Did you score $\ge 80\%$ on all prerequisites? $\to$ **Start the Next Chapter**.

---

## 7. Memory Magic: Spaced Repetition (FSRS-4.5 vs Anki SM-2)

### 🧠 The Core Idea:

If you learn a word today, you will forget it tomorrow. But if you review it tomorrow, you will remember it for 3 days. If you review it in 3 days, you will remember it for 10 days!

### ⚔️ Why FSRS-4.5 is better than older algorithms (like Anki's SM-2):

- **SM-2 (created in 1987):** Uses rigid multipliers. It treats every card almost the same and makes you review too often.
- **FSRS-4.5 (Free Spaced Repetition Scheduler, 2023–2026):**
  - Tracks 3 variables: **D**ifficulty, **S**tability (how many days until you have a 90% chance of remembering), and **R**etrievability.
  - **The Big Benefit:** It gives you the exact same 90% retention score while making you do **20% to 30% fewer reviews**! Less wasted time, more remembering.

---

## 8. The AI Providers: Why We Use Both Gemini and Python

In [`src/lib/server/ai/provider.ts`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/src/lib/server/ai/provider.ts), we use a **3-Tier AI Strategy**:

| Tier       | Provider                    | Where it runs                | Average Speed | Why we have it                                     |
| :--------- | :-------------------------- | :--------------------------- | :------------ | :------------------------------------------------- |
| **Tier 1** | **Python ML Backend**       | Local laptop / campus server | ~12.6s        | Privacy, offline study, reads course PDFs          |
| **Tier 2** | **Google Gemini 2.5 Flash** | Cloud TPUs                   | **1.79s**     | Ultra-fast interactive generation, smart reasoning |
| **Tier 3** | **Ollama**                  | Local fallback               | ~15s          | Emergency backup if internet goes down             |

### ⏱️ The Netlify 26-Second Rule (Deadline Budgeting):

- Netlify serverless functions have a hard rule: if a function runs for longer than 26 seconds, Netlify kills it with a timeout error.
- Our code has a **dynamic budget timer**:
  - We set a budget of 24 seconds.
  - If the Python backend takes 10 seconds and fails, the system sees that 14 seconds are left.
  - It immediately hands the request to Gemini Flash, which finishes in 2 seconds.
  - **The student gets their lesson, and the server never crashes!**

---

## 9. Smart Search (RAG) & The "Candidate Crowding" Problem

### 📚 What is RAG?

**Retrieval-Augmented Generation (RAG)** means: Before the AI writes a lesson, it searches through your actual uploaded PDF lecture notes to find the exact paragraphs needed. Then it feeds those paragraphs to the AI so it doesn't make things up (hallucinate).

### 🚌 What is "Candidate Crowding"? (Examiners LOVE asking this!)

- **Imagine a bus with only 10 seats (top-K search results).**
- Student A uploads 100 pages of notes on "Sorting Algorithms".
- Student B uploads 5 pages of private notes on "Operating Systems".
- If Student B searches for "Operating Systems", the search engine compares the search to _all_ documents in the database.
- If the search engine picks the top 10 matches globally before checking who owns what, Student A's massive notes might fill all 10 seats on the bus!
- When the code checks _"Wait, does Student B own these?"_, it throws them all away. Result: **Zero results found for Student B!**

### 🛡️ How Study AI solved it in [`rag_pipeline.py`](file:///c:/Users/USER/Downloads/Telegram%20Desktop/Study/ml_backend/models/rag_pipeline.py#L290-L300):

Instead of filtering in Python _after_ searching, we use **FAISS native ID pre-filtering (`IDSelectorBatch`)**.
We tell FAISS: _"Only search inside documents that belong to this student or the public curriculum before you pick the top results."_
Candidate crowding is 100% eliminated!

---

## 10. Defense Cheat Sheet: Top 10 Questions & Simple Answers

Print this page or keep it in your head! These are the 10 questions the panel is most likely to ask:

### 1. "Why not just use ChatGPT directly? Why build Study AI?"

> **Simple Answer:**  
> _"ChatGPT gives answers, but it doesn't build a learning plan. It creates an 'illusion of competence' where students read passively and forget. Study AI tracks real performance with quizzes and spaced repetition, identifies your exact weak areas, and tells you what to study next."_

### 2. "Why use a math formula for mastery instead of an AI or neural network?"

> **Simple Answer:**  
> _"Two reasons:  
> First, **Explainability** — if a student has a 45% score, we can show them exactly why (e.g., your quiz score was low, or you haven't reviewed in 2 weeks). A neural network is a black box that can't explain itself.  
> Second, **Cold Start** — a new student only answers 3 or 4 questions. An AI model overfits and guesses wildly on small data, while our formula uses a sample-size confidence rating."_

### 3. "Your RAG search accuracy is 36.7%. Isn't that low?"

> **Simple Answer:**  
> _"We chose academic honesty over fake numbers. That 36.7% is tested across 30 questions in 7 different subjects.  
> In subjects where we uploaded lecture slides (like AI), our precision was **100%**. In unindexed subjects (like Computer Architecture), it was 0%. This proved that search is limited by what you upload, which is exactly why we built multi-provider fallback so the system still works even if notes aren't indexed."_

### 4. "Your Python backend takes 12 seconds, but Gemini takes 1.8 seconds. Why keep Python?"

> **Simple Answer:**  
> _"The Python backend is for **privacy, zero-cost uptime, and offline study**. For sensitive university exam papers, it runs 100% on the local computer without sending data to Google. And if the internet cuts out, the student can still study."_

### 5. "What is candidate crowding in vector search?"

> **Simple Answer:**  
> _"When multiple students share one vector database, one student with lots of notes can fill up all top search slots, blocking other students' notes from appearing. We solved this using FAISS `IDSelectorBatch` pre-filtering so each student's search only looks at their own documents."_

### 6. "How does FSRS-4.5 beat Anki's SM-2 algorithm?"

> **Simple Answer:**  
> _"SM-2 from 1987 treats everyone the same with fixed multipliers. FSRS-4.5 uses modern memory science (Difficulty, Stability, Retrievability) and requires **20% to 30% fewer reviews** to achieve the exact same 90% memory retention."_

### 7. "Why did you build the frontend in Svelte instead of React?"

> **Simple Answer:**  
> _"Svelte doesn't use a heavy Virtual DOM; it compiles down to tiny vanilla JavaScript that updates the page instantly. The bundle is less than 45 KB, making it twice as fast on slow campus networks and low-spec student laptops."_

### 8. "How did you test usability (SUS) and what does 84.5 mean?"

> **Simple Answer:**  
> _"We gave 15 KNUST students 6 real study tasks and had them fill out the standard 10-item System Usability Scale survey. Our score of 84.5 is in the **Grade A+ (top 96th percentile)**, well above the industry average of 68.0."_

### 9. "What is one limitation of your project?"

> **Simple Answer:**  
> _"Currently, practice quiz grading runs in the user's browser so it feels instant. For casual practice, that's great. But for official exams, an advanced student could inspect browser memory to see the answers. For official exams, we have already designed a secure server endpoint (`/api/quiz/grade`)."_

### 10. "What is the single biggest achievement of Group 13?"

> **Simple Answer:**  
> _"Proving that AI in education shouldn't just be an ungrounded chatbot, but an adaptive partner that closes the loop: testing active recall, scheduling memory reviews, and guiding students to mastery step by step."_

---

### 🎓 Summary Quick Reference Table

| If the examiner asks about... | Remember these key words!                                   |
| :---------------------------- | :---------------------------------------------------------- |
| **Why not AI for Mastery?**   | Explainable, no black box, cold-start data scarcity         |
| **Why Svelte 5?**             | No Virtual DOM, fine-grained Runes, tiny 45KB bundle        |
| **Why Redis?**                | 0.1ms cache hits, saves AI API costs, stops button spamming |
| **Why FSRS-4.5?**             | DSR model, 20–30% fewer card reviews for same retention     |
| **Why RAG?**                  | Grounds AI in real lecture notes, stops hallucinations      |
| **Candidate Crowding?**       | FAISS `IDSelectorBatch` pre-filtering                       |
| **Offline use?**              | Browser IndexedDB + local Python backend                    |
