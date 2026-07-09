# shellgate — kleiner, isolierter Dienst (siehe server.py fuer die
# Architektur-Begruendung). Braucht KEINE der schweren Deps von Dockerfile
# im Repo-Root (kein ffmpeg/yt-dlp/Deno) — eigenes, schlankes Image.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .

# Bewusst ROOT (kein USER hier): der gemountete docker.sock ist ohnehin
# host-root-aequivalent — die In-Container-UID einzuschraenken taeuscht
# hier nur zusaetzliche Sicherheit vor, bringt aber keine (haette man
# staendig Berechtigungsprobleme mit der Host-GID des Sockets, fuer
# nichts). Die eigentliche Haertung passiert bei den GAST-Containern,
# die dieser Prozess erzeugt (siehe spawn_guest_container in server.py).

EXPOSE 8765
CMD ["python", "server.py"]
