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

# Pre-download models at build time so cold starts are fast
# Comment out this block (COPY + RUN) if you prefer a smaller image
# and are okay with models loading on first request instead.
COPY download_models.py .
RUN python download_models.py || echo "Model pre-download skipped"

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
