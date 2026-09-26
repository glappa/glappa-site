# mpgate - Raumserver fuer den Mehrspieler von SUPER GLAPPA 64 (siehe server.py)
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
# Kein root im Container: der Dienst braucht weder Dateien noch Rechte
USER nobody
EXPOSE 8768
CMD ["python", "-u", "server.py"]
