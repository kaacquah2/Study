# 12-Step Examiner Demonstration Script

This structured walkthrough is designed to demonstrate **Study AI** to academic examiners as **one unified, adaptive learning system**, rather than a disconnected list of AI features.

---

## The Core Demonstration Story: "A Complete Adaptive Learning Journey"

### Step 1: Onboarding & Workspace Entry

- **Action:** Log in as a student or open the dashboard.
- **Narrative:** "The student enters the platform and is greeted by the intelligent onboarding guide, presenting clear learning paths."

### Step 2: Ingesting Reference Material (RAG Ingestion)

- **Action:** Upload a sample Computer Networks lecture notes PDF into **Study Library** (`/app/knowledge`).
- **Narrative:** "The system extracts text, chunks it with semantic metadata, and embeds it into the FAISS vector index."

### Step 3: Grounded Course Curriculum Generation

- **Action:** Create a course outline on 'Computer Networking & Subnetting'.
- **Narrative:** "The course generator grounds module creation in the uploaded PDF notes, producing structured lesson modules with prerequisite dependencies."

### Step 4: Interactive Lesson Study & Visual Knowledge Graph

- **Action:** Open Module 1 (e.g., 'IPv4 Addressing') and review the lesson with interactive Mermaid flowcharts.
- **Narrative:** "The student studies the interactive lesson text. As they finish, the system logs a `lesson_completed` learning event."

### Step 5: Active AI Study Tutor with Grounded Citations

- **Action:** Highlight text or open the AI Tutor (`AssistantChat.svelte`) and ask: _"How does a subnet mask work according to my notes?"_
- **Narrative:** "Notice the AI Tutor returns a response with `📘 Strong source support — Chapter 3 (Page 12)` citations, distinguishing between material-grounded knowledge and general explanation."

### Step 6: Active Recall Assessment (Quiz)

- **Action:** Take the end-of-module quiz. Intentionally answer 1 or 2 subnetting questions incorrectly.
- **Narrative:** "The student engages in active recall. Behind the scenes, each response dispatches an authoritative `question_answered` event to Firestore."

### Step 7: Automated Error Capture in Mistake Notebook

- **Action:** Navigate to **Mistake Bank** (`/app/mistakes`).
- **Narrative:** "The system automatically captured the exact question snapshots and user's misconception. The student can practice these errors directly until resolved."

### Step 8: Evidence-Based Mastery Update on Knowledge Map

- **Action:** Open **Knowledge Map** (`/app/knowledge-map`) and click on the 'Subnetting' node.
- **Narrative:** "The map visually highlights the node in amber (`Learning`). Opening the inspector panel reveals the **Heuristic Mastery Formula Breakdown**: Quiz Accuracy (45%), FSRS Memory (35%), Practice Recency (15%), and Lesson Completion (5%), accompanied by an empirical confidence level."

### Step 9: Explaining Student Progress

- **Action:** Inspect the 'Explain My Progress' section on the node.
- **Narrative:** "Instead of an opaque percentage, the system explains: _'Your mastery is low because 2 of your recent answers were incorrect and you have pending due flashcards.'_"

### Step 10: Intelligent Next-Action Recommendation

- **Action:** Return to the Dashboard and observe the **Primary Recommendation** banner (`recommendNext.ts`).
- **Narrative:** "The Learning Intelligence Engine answers: _'What should this student study next?'_ It dynamically prioritizes reviewing due flashcards and practicing weak areas before starting downstream modules."

### Step 11: Spaced Repetition Scheduling (FSRS & SM-2)

- **Action:** Open **Practice & Review** (`/app/review`) and drill flashcards for the weak module.
- **Narrative:** "Free Spaced Repetition Scheduler (FSRS-4.5) calculates memory stability, difficulty, and schedules optimal future review dates."

### Step 12: Superadmin & Observability Metrics

- **Action:** Show the `/superadmin` dashboard or `/admin/metrics` endpoint.
- **Narrative:** "Demonstrates robust platform health, model latency logging, and system observability."
