# Glappa.de + home.glappa.de Downloader in einem Container.
# nginx serviert die statische Seite auf :80, gunicorn fährt app.py auf :8090.

FROM python:3.12-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System-Deps: ffmpeg (yt-dlp MP3-Postprocessor), nginx, supervisord, tini fuer PID 1
# + curl/unzip fuer Deno-Install
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ffmpeg \
        nginx \
        supervisor \
        tini \
        ca-certificates \
        curl \
        unzip \
 && rm -rf /var/lib/apt/lists/*

# Deno (JS-Runtime) fuer yt-dlps EJS Signature/Challenge Solving.
# YouTube hat 11/2025 neue Signatures eingefuehrt; ohne JS-Runtime sieht
# yt-dlp nur Storyboards -> "Requested format is not available".
RUN curl -fsSL "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip" -o /tmp/deno.zip \
 && unzip -q /tmp/deno.zip -d /usr/local/bin/ \
 && rm /tmp/deno.zip \
 && chmod +x /usr/local/bin/deno \
 && /usr/local/bin/deno --version

# Python-Deps zuerst (Layer-Cache fuer den heaviest step)
# --pre erlaubt yt-dlp Pre-Release (Nightlies haben aktuellen EJS-Support
# fuer YouTubes neue Signature-Challenges)
WORKDIR /app
COPY _docker/requirements.txt .
RUN pip install --no-cache-dir --pre -r requirements.txt

# Code und statische Seiten in den Container (Build-Context = Projektroot,
# .dockerignore-Datei hier drueber haelt _docker selbst draussen)
COPY . /app/glappa-site/

# Service-Configs aus dem _docker-Unterordner
RUN rm /etc/nginx/sites-enabled/default 2>/dev/null || true
COPY _docker/docker/nginx.conf /etc/nginx/sites-enabled/glappa.conf
COPY _docker/docker/supervisord.conf /etc/supervisor/supervisord.conf

# Downloads landen ausserhalb der App in einem Volume-Mountpoint
RUN mkdir -p /downloads
ENV DOWNLOAD_DIR=/downloads \
    DOWNLOADER_PORT=8090 \
    DOWNLOADER_HOST=0.0.0.0

EXPOSE 80 8090

# tini fängt SIGTERM ordentlich, supervisord hält beide Services am Leben
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
