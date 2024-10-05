FROM python:3.12-alpine as base

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1

FROM base as dev

CMD flask --app src/app.py --debug run --host=0.0.0.0

FROM base as prod

RUN pip install --no-cache-dir gunicorn

CMD gunicorn --bind=0.0.0.0:5000 src.app:app
