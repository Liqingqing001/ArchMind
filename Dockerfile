# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir -r requirements.txt
RUN useradd --create-home --uid 10001 knowledge
COPY --chown=knowledge:knowledge backend/app ./app
COPY --chown=knowledge:knowledge backend/examples ./examples
COPY --chown=knowledge:knowledge backend/migrations ./migrations
COPY --chown=knowledge:knowledge backend/alembic.ini ./
COPY --from=frontend --chown=knowledge:knowledge /build/dist ./static
ENV STATIC_DIR=/app/static PYTHONUNBUFFERED=1
USER knowledge
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
