# Build stage
FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .

# Install dependencies (CPU-only torch keeps image < 2GB)
RUN pip install --no-cache-dir --user -r requirements.txt

# ── Production image ───────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Copy installed packages
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy app source
COPY . .

# Create vector store directory
RUN mkdir -p vector_store

# Render / Railway uses PORT env var
ENV PORT=8000
ENV APP_ENV=production
EXPOSE 8000

# Standardize Hugging Face cache location
ENV HF_HOME=/root/.cache/huggingface

# Pre-download and verify models at build time so cold starts are fast and offline availability is guaranteed.
# Model availability is a strict build-time invariant; any download or offline verification failure halts the build.
# Use --build-arg PRELOAD_MODELS=false for fast lightweight dev builds.
ARG PRELOAD_MODELS=true
COPY download_models.py .
RUN if [ "$PRELOAD_MODELS" = "true" ]; then \
        echo "==> Enforcing build-time invariant: Downloading and verifying all production ML models..."; \
        python download_models.py || exit 1; \
    else \
        echo "==> Model pre-download explicitly skipped (PRELOAD_MODELS=false)"; \
    fi

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]

