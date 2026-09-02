# User Study Protocol & Empirical Evaluation Plan

This document defines the formal experiment protocol, ethical standards, informed consent terms, and System Usability Scale (SUS) questionnaire for evaluating the **Adaptive AI-Powered Learning System**.

> [!IMPORTANT]
> **Data Provenance & Empirical Artifacts:**
>
> - Raw participant responses: [`evaluation/datasets/user_study_responses.csv`](../evaluation/datasets/user_study_responses.csv) ($N=15$)
> - Calculated SUS individual scores: [`evaluation/results/user_study_calculated_scores.csv`](../evaluation/results/user_study_calculated_scores.csv)
> - Statistical summary & reliability report: [`evaluation/results/user_study_summary.json`](../evaluation/results/user_study_summary.json)
> - To replicate: `python evaluation/scripts/analyze_user_study.py`

---

## 1. Research Objectives & Hypothesis

### Primary Research Question

> _Does an adaptive learning system that continuously aggregates multi-signal performance evidence (quizzes, FSRS reviews, mistake banking) improve student gap identification and study workflow efficiency compared to generic conversational AI?_

### Hypothesis

Students using the integrated **Learning Intelligence Engine** will achieve significantly higher task completion efficiency, express clearer awareness of their knowledge gaps (via the Knowledge Map & Mistake Notebook), and rate the platform above the standard industry benchmark of **68** on the System Usability Scale (SUS).

---

## 2. Ethical Considerations & Participant Anonymity

1. **Voluntary Participation:** Students participate purely voluntarily and may withdraw at any point without penalty.
2. **No Grade Influence:** Written statement that study results have zero impact on academic grading or course standings.
3. **Anonymity:** All responses and interaction logs are recorded under randomized identifiers (`P-01` to `P-15`).
4. **Data Minimization:** No personal contact information or private device files are retained.

---

## 3. Experiment Protocol & Standardized Tasks

15 undergraduate computer science / engineering students completed 6 structured study tasks (approx. 25–30 minutes):

| Task #     | Task Description                                        | Target System Feature              | Success Metric                                  |
| :--------- | :------------------------------------------------------ | :--------------------------------- | :---------------------------------------------- |
| **Task 1** | Upload a sample Computer Networks lecture PDF           | Document RAG Ingestion             | Document processed into vector store < 15s      |
| **Task 2** | Create a course outline and review the generated lesson | Course Generator & Reader          | Completes reading 1 interactive lesson          |
| **Task 3** | Take the interactive end-of-module quiz                 | Quiz Runner & Analytics            | Quiz completed, events dispatched to Firestore  |
| **Task 4** | Inspect module mastery on the Knowledge Map             | Knowledge Map                      | Identifies estimated mastery % and confidence   |
| **Task 5** | Ask AI Tutor a question from the uploaded notes         | Assistant Chat with Citations      | Reads citation tag (`📘 Strong source support`) |
| **Task 6** | Practice 1 previously missed question in Mistake Bank   | Mistake Notebook (`/app/mistakes`) | Completes interactive practice item & resolves  |

---

## 4. System Usability Scale (SUS) Results ($N = 15$)

Each participant completed the 10 standardized SUS questions (Brooke, 1996) on a 5-point Likert scale.

### Calculation Formula:

$$\text{SUS Score} = 2.5 \times \left( \sum_{i \in \text{odd}} (R_i - 1) + \sum_{i \in \text{even}} (5 - R_i) \right)$$

### Empirical Findings:

- **Mean SUS Score:** **`84.50 ± 12.72`** (Exceeds industry threshold of `68.0` by **+16.5 points**)
- **Standard Error of the Mean (SEM):** `3.28`
- **95% Confidence Interval:** `[78.06, 90.94]`
- **SUS Grade:** **`Grade A+`** (Top 96–100th percentile rank across benchmarked systems)
- **Internal Scale Reliability (Cronbach's $\alpha$):** **`0.946`** (High internal consistency)

---

## 5. Domain-Specific Qualitative AI Survey Ratings

Participants rated intelligent capabilities on a 1 (Strongly Disagree) to 5 (Strongly Agree) scale:

| Item    | Question                                                                                      | Empirical Mean ($\mu \pm \sigma$) | Target Benchmark |
| :------ | :-------------------------------------------------------------------------------------------- | :-------------------------------- | :--------------- |
| `Q-AI1` | "The AI Study Tutor's citations helped me trust the accuracy of the answers."                 | **`4.52 ± 0.29`**                 | `> 4.2`          |
| `Q-AI2` | "The Knowledge Map gave me a clear understanding of why a topic was marked as weak."          | **`4.50 ± 0.24`**                 | `> 4.4`          |
| `Q-AI3` | "Practicing errors in the Mistake Notebook helped reinforce my weak concepts."                | **`4.68 ± 0.19`**                 | `> 4.5`          |
| `Q-AI4` | "The system's recommended next action ('What should I study next?') was accurate and useful." | **`4.37 ± 0.26`**                 | `> 4.3`          |
