FROM python:3.12-alpine AS base

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

COPY . .
RUN uv sync --frozen

ENV PYTHONUNBUFFERED=1

FROM base AS dev

CMD uv run flask --app src/app.py --debug run --host=0.0.0.0

FROM base AS prod

CMD uv run gunicorn --bind=0.0.0.0:5000 src.app:app
