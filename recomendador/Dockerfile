FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/datos/huggingface \
    RECOMENDADOR_DATOS=/datos

COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt

COPY modulo_tutorias/ ./modulo_tutorias/
COPY servicio.py catalogo_materias.json .
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "servicio:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
