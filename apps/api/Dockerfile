# ============================================================
# Stage 1 — Builder: install Python dependencies into a venv
# ============================================================
FROM python:3.11-slim AS builder

WORKDIR /build

# System deps needed to compile some wheels (e.g. grpcio for google-cloud)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc g++ && \
    rm -rf /var/lib/apt/lists/*

RUN python -m venv /build/venv
ENV PATH="/build/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ============================================================
# Stage 2 — Runtime: slim image with just the venv + app code
# ============================================================
FROM python:3.11-slim AS runtime

# curl is needed by the Docker healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --create-home appuser

WORKDIR /app

# Copy the pre-built venv from the builder stage
COPY --from=builder /build/venv /app/venv
ENV PATH="/app/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Copy application code
COPY app/ /app/app/

# Switch to non-root user
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
