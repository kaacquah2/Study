# User Study Protocol & Empirical Evaluation Plan

This document defines the formal experiment protocol, ethical standards, informed consent terms, and System Usability Scale (SUS) questionnaire for evaluating the **Adaptive AI-Powered Learning System**.

---

## 1. Research Objectives & Hypothesis

### Primary Research Question
> *Does an adaptive learning system that continuously aggregates multi-signal performance evidence (quizzes, FSRS reviews, mistake banking) improve student gap identification and study workflow efficiency compared to generic conversational AI?*

### Hypothesis
Students using the integrated **Learning Intelligence Engine** will achieve significantly higher task completion efficiency, express clearer awareness of their knowledge gaps (via the Knowledge Map & Mistake Notebook), and rate the platform above the standard benchmark of **68** on the System Usability Scale (SUS).

---

## 2. Ethical Considerations & Informed Consent

> [!IMPORTANT]
> **Ethics & Participant Protection Standards:**
> 1. **Voluntary Participation:** Students participate purely voluntarily and may withdraw at any point without penalty.
> 2. **No Grade Influence:** Explicit written statement that study results or quiz performance within the system have zero impact on academic grading or course standings.
> 3. **Anonymity:** All responses, interaction logs, and feedback are collected under randomized participant identifiers (`P-01`, `P-02`, etc.) without recording real names or student ID numbers.
> 4. **Data Minimization:** No personal contact information or private device files are retained beyond the duration of the evaluation session.

---

## 3. Experiment Protocol

### Participants
- **Target Sample Size:** 10 – 15 undergraduate computer science students / classmates.
- **Prerequisite:** Basic familiarity with web applications and standard course materials.

### Standardized Evaluation Tasks (Approx. 25–30 minutes per participant)

| Task # | Task Description | Target System Feature | Success Metric |
|---|---|---|---|
| **Task 1** | Upload a sample Computer Networks lecture PDF notes | Document RAG Ingestion | Document processed into vector store < 15s |
| **Task 2** | Create a course outline and review the generated lesson | Course Generator & Lesson Reader | Completes reading 1 interactive lesson |
| **Task 3** | Take the interactive end-of-module quiz | Quiz Runner & Analytics Logger | Quiz completed, events dispatched to Firestore |
| **Task 4** | Navigate to Knowledge Map and inspect module mastery | Knowledge Map & Mastery Breakdown | Identifies estimated mastery % and confidence level |
| **Task 5** | Ask AI Tutor a specific question from the uploaded notes | Assistant Chat with RAG Citations | Reads citation tag (`📘 Strong source support`) |
| **Task 6** | Open Mistake Bank and practice 1 previously missed question | Mistake Notebook (`/app/mistakes`) | Completes interactive practice item & resolves |

---

## 4. Standard System Usability Scale (SUS) Questionnaire

Each participant answers the following 10 standardized SUS questions on a 5-point Likert scale (1 = Strongly Disagree, 5 = Strongly Agree):

1. *I think that I would like to use this system frequently for my exam revision.*
2. *I found the system unnecessarily complex.*
3. *I thought the system was easy to use.*
4. *I think that I would need the support of a technical person to be able to use this system.*
5. *I found the various functions in this system were well integrated.*
6. *I thought there was too much inconsistency in this system.*
7. *I would imagine that most students would learn to use this system very quickly.*
8. *I found the system very cumbersome to use.*
9. *I felt very confident using the system.*
10. *I needed to learn a lot of things before I could get going with this system.*

### SUS Calculation Formula:
$$\text{SUS Score} = 2.5 \times \left( \sum_{i \in \text{odd}} (R_i - 1) + \sum_{i \in \text{even}} (5 - R_i) \right)$$
*Target: $> 75.0$ (Grade A Usability).*

---

## 5. Domain-Specific Qualitative Survey Questions

In addition to SUS, participants rate specific intelligent capabilities (1 = Strongly Disagree to 5 = Strongly Agree):

| Item | Question | Target Mean |
|---|---|---|
| `Q-AI1` | "The AI Study Tutor's citations helped me trust the accuracy of the answers." | `> 4.2` |
| `Q-AI2` | "The Knowledge Map gave me a clear understanding of why a topic was marked as weak." | `> 4.4` |
| `Q-AI3` | "Practicing errors in the Mistake Notebook helped reinforce my weak concepts." | `> 4.5` |
| `Q-AI4` | "The system's recommended next action ('What should I study next?') was accurate and useful." | `> 4.3` |
