from pydantic import BaseModel, Field, model_validator
from typing import Optional


# ── Summarization ─────────────────────────────────────────────────────────────

class SummarizeRequest(BaseModel):
    text: str = Field(..., min_length=50, max_length=10_000)
    max_length: int = Field(default=150, ge=30, le=400)
    min_length: int = Field(default=40, ge=10, le=200)

    @model_validator(mode="after")
    def check_length_bounds(self):
        if self.min_length > self.max_length:
            raise ValueError("min_length must be less than or equal to max_length.")
        return self


class SummarizeResponse(BaseModel):
    summary: str


# ── Paraphrasing ──────────────────────────────────────────────────────────────

class ParaphraseRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=2_000)
    style: str = Field(default="academic", pattern="^(academic|simple|formal)$")


class ParaphraseResponse(BaseModel):
    paraphrase: str


# ── Course Outline ─────────────────────────────────────────────────────────────

class OutlineModule(BaseModel):
    order: int
    type: str  # "lesson" | "quiz"
    title: str
    summary: str
    learning_objective: str
    key_points: list[str]


class OutlineRequest(BaseModel):
    topic: str = Field(..., min_length=3, max_length=500)
    module_count: int = Field(default=4, ge=3, le=6)
    format: str = Field(default="lessons_and_quizzes", pattern="^(lessons_and_quizzes|quizzes_only)$")
    reference_text: Optional[str] = Field(default=None, max_length=15_000)


class OutlineResponse(BaseModel):
    title: str
    description: str
    modules: list[OutlineModule]
    is_fallback: bool = False


# ── RAG Documents ─────────────────────────────────────────────────────────────

from pydantic import BaseModel, Field, model_validator, field_validator

class DocumentsRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=100)
    user_id: Optional[str] = Field(default="default_user", max_length=128)

    @field_validator("texts")
    @classmethod
    def validate_individual_texts(cls, v: list[str]) -> list[str]:
        for idx, text in enumerate(v):
            if not text or len(text.strip()) < 10:
                raise ValueError(f"Document text at index {idx} must contain at least 10 non-whitespace characters.")
        return v




# ── Lesson ─────────────────────────────────────────────────────────────────────

class LessonPage(BaseModel):
    order: int
    heading: str
    subheading: Optional[str]
    body: str


class LessonBlock(BaseModel):
    type: str
    markdown: Optional[str] = None
    style: Optional[str] = None
    title: Optional[str] = None
    mermaid: Optional[str] = None
    caption: Optional[str] = None
    term: Optional[str] = None
    definition: Optional[str] = None
    prompt: Optional[str] = None
    options: Optional[list[str]] = None
    answerIndex: Optional[int] = None
    explanation: Optional[str] = None
    front: Optional[str] = None
    back: Optional[str] = None
    language: Optional[str] = None
    code: Optional[str] = None
    runnable: Optional[bool] = None
    nodeId: Optional[str] = None
    label: Optional[str] = None


class LessonPageV2(BaseModel):
    order: int
    heading: str
    subheading: Optional[str] = None
    blocks: list[LessonBlock]


class LessonRequest(BaseModel):
    course_title: str = Field(..., min_length=1, max_length=500)
    module_title: str = Field(..., min_length=1, max_length=500)
    learning_objective: str = Field(..., min_length=1, max_length=2000)
    key_points: list[str] = Field(default_factory=list)
    course_outline: Optional[list[dict]] = None


class LessonResponse(BaseModel):
    pages: list[LessonPage]


class LessonResponseV2(BaseModel):
    pages: list[LessonPageV2]


# ── Quiz ───────────────────────────────────────────────────────────────────────

class QuizQuestion(BaseModel):
    order: int
    prompt: str
    options: list[str] = Field(..., min_length=4, max_length=4)
    correct_index: int = Field(..., ge=0, le=3)
    explanation: str


class QuizRequest(BaseModel):
    course_title: str = Field(..., min_length=1, max_length=500)
    module_title: str = Field(..., min_length=1, max_length=500)
    learning_objective: str = Field(..., min_length=1, max_length=2000)
    key_points: list[str] = Field(default_factory=list)
    lesson_body: Optional[str] = Field(default=None, max_length=15_000)  # Used as context for QG model


class QuizResponse(BaseModel):
    questions: list[QuizQuestion]


# ── Chat ───────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=10_000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)
    course_context: Optional[str] = Field(default=None, max_length=15_000)  # If chat is within a course


class ChatResponse(BaseModel):
    reply: str
    sources: Optional[list[dict]] = Field(default_factory=list)


# ── Health ─────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    models_loaded: dict[str, bool]
    inference_busy: bool = False


# ── AI Completion ─────────────────────────────────────────────────────────────

class CompletionRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=15_000)
    system_instruction: Optional[str] = Field(default=None, max_length=5_000)


class CompletionResponse(BaseModel):
    text: str

