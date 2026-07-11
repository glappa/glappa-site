# displaygate — Bruecke zwischen dem Browser (noVNC ueber WebSocket) und dem
# Xvnc-Port der dauerhaften Gast-VM (siehe server.py fuer die Architektur-
# Begruendung). Schwester-Dienst zu shellgate, aber bewusst OHNE docker.sock:
# displaygate erzeugt/steuert keine Container, sondern verbindet sich nur per
# normalem TCP zum Gast (beide haengen am selben internen Docker-Netz,
# Namensaufloesung ueber Dockers eingebauten DNS). Deshalb kann dieser Dienst
# — anders als shellgate — komplett OHNE root laufen.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .

# Kein docker.sock, keine Host-Mounts -> non-root ist hier ein echter,
# nicht nur symbolischer Gewinn (anders als bei shellgate, s. dessen
# Dockerfile-Kommentar).
RUN useradd -m -u 10001 displaygate
USER displaygate

EXPOSE 8766 8767
CMD ["python", "server.py"]
