FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN groupadd --system --gid 10001 mpims \
    && useradd --system --uid 10001 --gid mpims --create-home mpims \
    && mkdir -p /app/media /app/staticfiles \
    && chown -R mpims:mpims /app

COPY requirements.txt .
RUN pip install --no-cache-dir --require-hashes -r requirements.txt

COPY --chown=mpims:mpims . .

EXPOSE 8000
USER 10001:10001
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "mpims.wsgi:application"]
