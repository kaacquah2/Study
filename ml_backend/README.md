# ML Backend — AI Study Buddy

Self-hosted Python FastAPI server that powers all AI features in the AI Study Buddy application.
Replaces the Google Gemini API with open-weight, locally-served models.

## Architectural Framework: Dual-Mode Operation

The ML backend operates in two transparent modes depending on deployment configuration:

1. **Mode A: Out-of-the-Box / Development (Default)**
   - Uses canonical open-weight base foundation models (`google/flan-t5-base`, `google/flan-t5-large`, `TinyLlama/TinyLlama-1.1B-Chat-v1.0`) combined with prompt engineering and FAISS vector RAG.
   - Requires zero custom training or private Hugging Face weights to run immediately.
2. **Mode B: Domain-Adapted Production (Fine-Tuned)**
   - Uses domain-adapted checkpoints trained on academic study corpora using the included [`fine_tuning/`](fine_tuning/) pipelines.
   - Point the corresponding environment variables in `.env` (`SUMMARIZER_MODEL_ID`, `PARAPHRASER_MODEL_ID`, etc.) to your custom Hugging Face Hub repository or local checkpoint directory.

The server dynamically detects model provenance at boot and exposes runtime classification via `GET /models/info` and `GET /healthcheck`.

## Models Used & Provenance

| Feature            | Default Baseline Model                                                          | Provenance Tier          | Fine-Tuning Strategy / Recipe                                 |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------- |
| Summarization      | `google/flan-t5-base`                                                           | Base Foundation Fallback | `fine_tuning/01_summarizer_finetune.py` (SciTLDR / SAMSum)    |
| Paraphrasing       | `google/flan-t5-base`                                                           | Base Foundation Fallback | `fine_tuning/02_paraphraser_finetune.py` (Style conditioning) |
| Outline Generation | `google/flan-t5-large`                                                          | Base Foundation Model    | `fine_tuning/03_outline_finetune.py` + RAG Context            |
| Lesson Generation  | `google/flan-t5-large`                                                          | Base Foundation Model    | `fine_tuning/04_lesson_finetune.py` + RAG Context             |
| Quiz Generation    | `valhalla/t5-small-qg-prepend` + `potsawee/t5-large-generation-race-Distractor` | Pretrained Specialized   | 3-Stage Pipeline (QG + DG + Reranking)                        |
| AI Study Assistant | `TinyLlama/TinyLlama-1.1B-Chat-v1.0`                                            | Base Chat Foundation     | RAG + ChatML Prompt Format                                    |
| Vector Embeddings  | `sentence-transformers/all-MiniLM-L6-v2`                                        | Pretrained Specialized   | Dense FAISS Bi-Encoder                                        |

## Local Development Setup

### 1. Create and activate a virtual environment (Root directory)

It is highly recommended to use a single virtual environment in the root directory to avoid duplicate installations of heavy packages like PyTorch and Transformers (especially if disk space is limited).

From the root directory:

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate
```

### 2. Install dependencies

From the root directory:

```bash
pip install -r ml_backend/requirements.txt
```

> [!NOTE]
> **Environment Note:** The root-level `.venv` is a shared environment used strictly for _local development_ to avoid duplicate, heavy installs of PyTorch and Transformers (particularly helpful for machines with limited disk space). For containerized or production environments (e.g. `Dockerfile` and `docker-compose.yml`), services remain isolated and run their own local package installations independently.

### 3. Configure environment variables

```bash
cp .env.example .env
# Edit .env as needed
```

### 4. Start the server

From the `ml_backend` directory (with the root virtual environment activated):

```bash
python -m uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.
Interactive docs: `http://localhost:8000/docs`

### 5. Open Data & RAG Seed Setup

To ensure 100% copyright compliance for public repository distribution, reference documents and fine-tuning datasets are separated:

```bash
# Seed vector_store/sample_docs with CC-BY OpenStax, OSTEP, and original student notes:
python vector_store/seed_open_docs.py
```

## Fine-Tuning (Run on Google Colab)

### Prepare training data

Automate open dataset loading (SciQ, SAMSum) from Hugging Face Hub:

```bash
python fine_tuning/prepare_data.py --fetch-hf
python fine_tuning/prepare_data.py --validate
```

Or manually manage examples in:

- `fine_tuning/data/summarization.jsonl` — `{"input": "...", "output": "..."}`
- `fine_tuning/data/paraphrasing.jsonl` — `{"input": "...", "output": "...", "style": "academic"}`

Aim for 150–300 examples per task for meaningful improvement.

### Run fine-tuning

```bash
# On Google Colab (T4 GPU — Free Tier):
!pip install transformers datasets evaluate rouge_score sacrebleu
!python fine_tuning/01_summarizer_finetune.py
!python fine_tuning/02_paraphraser_finetune.py
```

### Upload to HuggingFace Hub

```python
from huggingface_hub import HfApi
api = HfApi()
api.upload_folder(
    folder_path="./flan-t5-study-summarizer",
    repo_id="your-username/flan-t5-study-summarizer",
    repo_type="model"
)
```

### Switch to fine-tuned models

In your `.env`:

```
SUMMARIZER_MODEL_ID=your-username/flan-t5-study-summarizer
PARAPHRASER_MODEL_ID=your-username/flan-t5-study-paraphraser
```

## API Endpoints

| Method | Endpoint        | Description                                                                               | Auth Required |
| ------ | --------------- | ----------------------------------------------------------------------------------------- | ------------- |
| GET    | `/health/live`  | Unauthenticated HTTP liveness probe (returns 200 OK process heartbeat)                    | No            |
| GET    | `/health/ready` | Unauthenticated ML readiness probe (returns 200 OK when ready, 503 while warming/errored) | No            |
| GET    | `/health`       | Container probe alias (defaults to readiness, `?probe=liveness` supported)                | No            |
| GET    | `/healthcheck`  | Protected server + detailed model load diagnostic (200 OK when ready, 503 when warming)   | `X-API-Key`   |
| GET    | `/models/info`  | Protected model manifest, provenance classification, and device telemetry                 | `X-API-Key`   |
| GET    | `/metrics`      | Protected operational metrics, VRAM/RAM utilization, and device telemetry                 | `X-API-Key`   |
| POST   | `/summarize`    | Summarize study text                                                                      | `X-API-Key`   |
| POST   | `/paraphrase`   | Paraphrase text with style                                                                | `X-API-Key`   |
| POST   | `/outline`      | Generate course outline                                                                   | `X-API-Key`   |
| POST   | `/lesson`       | Generate lesson pages                                                                     | `X-API-Key`   |
| POST   | `/quiz`         | Generate MCQ quiz                                                                         | `X-API-Key`   |
| POST   | `/chat`         | AI study assistant                                                                        | `X-API-Key`   |
| POST   | `/chat/stream`  | AI study assistant SSE stream                                                             | `X-API-Key`   |
| POST   | `/documents`    | Add docs to RAG index                                                                     | `X-API-Key`   |
| DELETE | `/documents`    | Clear RAG index                                                                           | `X-API-Key`   |

Full interactive API docs: `http://localhost:8000/docs`

## Deployment (Render.com Free Tier)

1. Push this `ml_backend/` directory to a GitHub repo (can be a subdirectory)
2. Create a new **Web Service** on [Render.com](https://render.com)
3. Set the **Docker** environment and point to the `Dockerfile`
4. Add the same environment variables from `.env`
5. Set the deployed URL as `ML_BACKEND_URL` in the SvelteKit app's Netlify environment variables

> **Note:** Render's free tier spins down after 15 minutes of inactivity.
> The SvelteKit app pings `/healthcheck` on page load and shows a "Warming up AI..." message
> while the backend is waking up.
