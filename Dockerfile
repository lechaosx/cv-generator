FROM python:3.12-alpine AS base

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY server ./server
RUN uv sync --frozen

ENV PYTHONUNBUFFERED=1

FROM base AS dev

CMD uv run flask --app server/app.py --debug run --host=0.0.0.0

FROM oven/bun:alpine AS ts-build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY editor ./editor
COPY scss    ./scss
RUN bun run build && bun run build:css

FROM base AS prod

COPY --from=ts-build /app/server/static/ ./server/static/

CMD uv run gunicorn --bind=0.0.0.0:5000 server.app:app
