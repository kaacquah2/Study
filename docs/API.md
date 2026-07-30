# AI Study Buddy — Backend API Specification

This document provides complete technical specifications for all serverless REST API endpoints in the AI Study Buddy application (`src/routes/api/`).

---

## 🔐 Authentication & Headers

All API endpoints (except public share links) require authentication using Firebase Authentication ID Tokens passed via the standard HTTP `Authorization` header.

### Required Headers

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
Content-Type: application/json
```

### Optional Headers

- `X-Client-Timezone` (e.g. `Africa/Accra`, `America/New_York`): IANA timezone identifier used for authoritative streak date calculation.
- `X-Client-Theme` (`calm` | `sage` | `focus`): Theme preference synced on profile creation.

---

## ⚠️ Standard Error Response Format

All API errors return a uniform JSON error structure:

```json
{
	"error": {
		"code": "ERROR_CODE",
		"message": "Human-readable description of the error",
		"fields": {}
	}
}
```

### Common HTTP Status Codes & Error Codes

| Status Code | Code                   | Description                                                                 |
| ----------- | ---------------------- | --------------------------------------------------------------------------- |
| `400`       | `INVALID_INPUT`        | Request body failed Zod schema validation. `fields` contains field details. |
| `401`       | `UNAUTHORIZED`         | Missing, malformed, or expired Firebase ID token.                           |
| `403`       | `FORBIDDEN`            | Requesting user does not own the target resource.                           |
| `404`       | `NOT_FOUND`            | Target user, course, or module does not exist.                              |
| `429`       | `RATE_LIMIT_EXCEEDED`  | Daily or hourly quota exceeded for the authenticated user.                  |
| `500`       | `AI_GENERATION_FAILED` | Python ML backend failed to generate structured response.                   |
| `500`       | `SERVER_ERROR`         | Internal server or Firestore transaction failure.                           |

---

## 📚 Course Endpoints

### 1. Create Course

Creates a new course outline and skeletal module containers.

- **URL:** `POST /api/courses`
- **Auth Required:** Yes
- **Rate Limit:** 10 courses per day

#### Request Body

```json
{
	"topic": "Linear Algebra and Vector Spaces",
	"moduleCount": 4,
	"format": "lessons_and_quizzes",
	"referenceText": "Optional reference reading material up to 15,000 characters"
}
```

#### Response (`201 Created`)

```json
{
	"courseId": "doc_id_string"
}
```

---

### 2. Fetch Course & Modules

Retrieves a course document along with all sub-collection module objects.

- **URL:** `GET /api/courses/[id]`
- **Auth Required:** Yes

#### Response (`200 OK`)

```json
{
  "course": {
    "id": "doc_id_string",
    "ownerUid": "user_uid",
    "title": "Linear Algebra",
    "description": "Fundamental matrix operations",
    "status": "ready",
    "accent": "violet",
    "progress": { "completed": 2, "total": 4 }
  },
  "modules": [
    {
      "id": "mod_1",
      "order": 1,
      "type": "lesson",
      "title": "Vector Spaces",
      "status": "ready",
      "pages": [...]
    }
  ]
}
```

---

### 3. Delete Course

Deletes a course document and its sub-collections from Firestore.

- **URL:** `DELETE /api/courses/[id]`
- **Auth Required:** Yes (Owner only)

#### Response (`200 OK`)

```json
{
	"message": "Course deleted successfully"
}
```

---

### 4. Share Course

Generates an unrevoked share token for a course.

- **URL:** `POST /api/courses/[id]/share`
- **Auth Required:** Yes (Owner only)

#### Response (`200 OK`)

```json
{
	"shareToken": "generated_uuid_token",
	"shareUrl": "https://aistudybuddy.netlify.app/share/generated_uuid_token"
}
```

---

### 5. Access / Clone Shared Course

Retrieves snapshot of a shared course or clones it into the authenticated user's workspace.

- **URL:** `GET /api/share/[token]`
- **Auth Required:** Yes

#### Response (`200 OK`)

```json
{
  "course": {
    "title": "Shared Course Title",
    "description": "Shared Course Description",
    "modules": [...]
  }
}
```

---

## 🧩 Module Endpoints

### 6. Generate Module Content

Triggers asynchronous AI generation for a single lesson or quiz module.

- **URL:** `POST /api/modules/[id]/generate`
- **Auth Required:** Yes (Owner only)
- **Rate Limit:** 30 modules per hour

#### Request Body

```json
{
	"courseId": "parent_course_id"
}
```

#### Response (`200 OK`)

```json
{
	"status": "ready",
	"message": "Module generated successfully"
}
```

---

### 7. Complete Module & Update Streak

Submits completed module progress and updates daily streak authoritatively on server.

- **URL:** `POST /api/modules/[id]/complete`
- **Auth Required:** Yes (Owner only)

#### Request Body

```json
{
	"courseId": "parent_course_id",
	"timezone": "Africa/Accra"
}
```

#### Response (`200 OK`)

```json
{
	"streak": {
		"current": 5,
		"extended": true
	}
}
```

---

### 8. Retry Failed Module Generation

Resets a failed module's status to `pending` and re-triggers generation.

- **URL:** `POST /api/modules/[id]/retry`
- **Auth Required:** Yes (Owner only)

#### Request Body

```json
{
	"courseId": "parent_course_id"
}
```

---

## 🤖 Microservice Endpoints

### 9. AI Study Assistant Chat

Multi-turn AI study helper for context-aware Q&A.

- **URL:** `POST /api/chat`
- **Auth Required:** Yes
- **Rate Limit:** 60 messages per hour

#### Request Body

```json
{
	"messages": [{ "role": "user", "content": "Explain matrix transposition" }],
	"courseContext": "Course Title: Linear Algebra"
}
```

#### Response (`200 OK`)

```json
{
	"reply": "Matrix transposition flips a matrix over its diagonal..."
}
```

---

### 10. AI Summarization

Summarizes long-form study material into concise bullet points or paragraphs.

- **URL:** `POST /api/summarize`
- **Auth Required:** Yes
- **Rate Limit:** 60 requests per hour

#### Request Body

```json
{
	"text": "Long study material content (minimum 50 characters)...",
	"maxLength": 150,
	"minLength": 40
}
```

#### Response (`200 OK`)

```json
{
	"summary": "Summary of the study text..."
}
```

---

### 11. AI Paraphrasing

Rewrites sentences or paragraphs in standard academic, simple, or formal tone.

- **URL:** `POST /api/paraphrase`
- **Auth Required:** Yes
- **Rate Limit:** 60 requests per hour

#### Request Body

```json
{
	"text": "Text to rewrite in different style",
	"style": "academic"
}
```

#### Response (`200 OK`)

```json
{
	"paraphrase": "Paraphrased text version..."
}
```

---

## 📑 Custom Document RAG & Spaced Repetition Endpoints

### 12. Upload & Index RAG Document

Uploads a custom PDF or plain text reference document into the FAISS vector database store for RAG prompt injection.

- **URL:** `POST /api/documents`
- **Auth Required:** Yes
- **Rate Limit:** 20 documents per hour

#### Request Body

```json
{
	"title": "Quantum Physics Lecture Notes",
	"content": "Full text content extracted from document..."
}
```

#### Response (`201 Created`)

```json
{
	"documentId": "doc_vector_123",
	"chunksIndexed": 12,
	"status": "ready"
}
```

---

### 13. Fetch Due Spaced Repetition Flashcards

Retrieves flashcard review items due for study based on SM-2 / FSRS algorithm schedules.

- **URL:** `GET /api/spaced-repetition/due`
- **Auth Required:** Yes

#### Response (`200 OK`)

```json
{
	"dueItems": [
		{
			"id": "card_001",
			"courseId": "course_123",
			"moduleId": "mod_456",
			"prompt": "What is Matrix Transposition?",
			"answer": "Flipping a matrix over its diagonal",
			"interval": 6,
			"easeFactor": 2.5,
			"repetitions": 1,
			"dueDate": "2026-07-30"
		}
	]
}
```

---

### 14. Submit Spaced Repetition Review Rating

Submits a student's review rating (0 to 5) for a flashcard, recalculating next review interval and ease factor via SuperMemo 2 (SM-2) or FSRS algorithms.

- **URL:** `POST /api/spaced-repetition/review`
- **Auth Required:** Yes

#### Request Body

```json
{
	"cardId": "card_001",
	"qualityRating": 4
}
```

#### Response (`200 OK`)

```json
{
	"nextReview": {
		"interval": 15,
		"easeFactor": 2.6,
		"repetitions": 2,
		"nextReviewDate": "2026-08-14"
	}
}
```

---

## 🛡️ Moderation, Security & Administration Endpoints

### 15. Content Moderation Flag Reporting

Submits a user flag for objectionable or inaccurate AI-generated lesson content or quiz questions.

- **URL:** `POST /api/flag`
- **Auth Required:** Yes

#### Request Body

```json
{
	"courseId": "course_123",
	"moduleId": "mod_456",
	"reason": "Inaccurate explanation of matrix eigenvalues",
	"details": "Optional additional user feedback"
}
```

#### Response (`200 OK`)

```json
{
	"flagId": "flag_789",
	"message": "Content flag recorded for review."
}
```

---

### 16. System & AI Provider Health Check

Returns detailed operational metrics and availability status for AI backends (Gemini API, Ollama Local LLM, Python FastAPI ML Backend).

- **URL:** `GET /api/health`
- **Auth Required:** No

#### Response (`200 OK`)

```json
{
	"status": "healthy",
	"providers": {
		"gemini": { "available": true, "quotaRemaining": "94%" },
		"ollama": { "available": true, "model": "llama3.2" },
		"ml_backend": { "available": true, "busy": false }
	},
	"redis": { "connected": true }
}
```

---

### 17. Superadmin Analytics & User Management

Retrieves platform analytics, system usage metrics, and user profiles (Superadmin role required).

- **URL:** `GET /api/superadmin/stats`
- **Auth Required:** Yes (Superadmin role)

#### Response (`200 OK`)

```json
{
	"totalUsers": 1250,
	"totalCoursesGenerated": 4820,
	"activeStreaks": 310,
	"flaggedContentCount": 4
}
```

---

### 18. GDPR User Data Export & Account Deletion

Export user account profile data or request account deletion.

- **URL:** `GET /api/user/export` / `DELETE /api/user/delete-account`
- **Auth Required:** Yes
