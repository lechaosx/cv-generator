FROM python:3.12-alpine as base

WORKDIR /app

RUN apk add --no-cache postgresql-libs

COPY requirements.txt .

RUN apk add --no-cache --virtual .build-deps postgresql-dev && \
    pip install --no-cache-dir -r requirements.txt && \
    apk del --purge .build-deps

COPY . .

FROM base as dev

CMD alembic upgrade head && flask --app src/app.py --debug run --host=0.0.0.0

FROM base as prod

RUN pip install --no-cache-dir gunicorn

CMD alembic upgrade head && gunicorn --bind=0.0.0.0:5000 src.app:app
