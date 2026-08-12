# ML Backend — AI Study Buddy

Self-hosted Python FastAPI server that powers all AI features in the AI Study Buddy application.
Replaces the Google Gemini API with open-weight, locally-served models.

## Models Used

| Feature            | Model                                                                           | Strategy                              |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------- |
| Summarization      | `google/flan-t5-base` (fine-tuned)                                              | seq2seq, fine-tuned on study material |
| Paraphrasing       | `google/flan-t5-base` (fine-tuned)                                              | seq2seq, style-conditioned            |
| Outline Generation | `google/flan-t5-large` (base)                                                   | RAG + instruction prompting           |
| Lesson Generation  | `google/flan-t5-large` (base)                                                   | RAG + per-page generation             |
| Quiz Generation    | `valhalla/t5-small-qg-prepend` + `potsawee/t5-large-generation-race-Distractor` | 3-stage pipeline                      |
| AI Study Assistant | `TinyLlama/TinyLlama-1.1B-Chat-v1.0` (base)                                     | RAG + ChatML format                   |

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

| Method | Endpoint       | Description                |
| ------ | -------------- | -------------------------- |
| GET    | `/healthcheck` | Server + model load status |
| POST   | `/summarize`   | Summarize study text       |
| POST   | `/paraphrase`  | Paraphrase text with style |
| POST   | `/outline`     | Generate course outline    |
| POST   | `/lesson`      | Generate lesson pages      |
| POST   | `/quiz`        | Generate MCQ quiz          |
| POST   | `/chat`        | AI study assistant         |
| POST   | `/documents`   | Add docs to RAG index      |
| DELETE | `/documents`   | Clear RAG index            |

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
