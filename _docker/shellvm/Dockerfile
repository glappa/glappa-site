# Gast-Image fuer die passwortgeschuetzte echte Shell (terminal.html "real-shell").
#
# `ubuntu:latest` statt einer festgepinnten Versionsnummer — der offizielle
# Ubuntu-Image-Maintainer zeigt "latest" IMMER auf das aktuell unterstuetzte
# LTS-Release. So bleibt "neueste LTS" automatisch wahr, ohne dass hier
# irgendwann eine veraltete Versionsnummer rumliegt.
#
# WICHTIG: Dieses Image ist NUR die Gast-Umgebung. Es laeuft selbst NICHT
# mit erweiterten Rechten — die eigentliche Haertung (cap_drop, Ressourcen-
# Limits, kein eigenes Docker-Netz zu den anderen Containern) setzt der
# shellgate-Server beim Erzeugen des Containers (server.py: spawn_container).
FROM ubuntu:latest

ENV DEBIAN_FRONTEND=noninteractive

# iputils-ping   -> echtes ping (Datei-Capability cap_net_raw, kein setuid-root noetig)
# dnsutils       -> dig/nslookup
# net-tools      -> ifconfig/netstat (viele Leute suchen die aus Gewohnheit)
# curl/wget      -> HTTP-Testing
# nano/less/htop -> Basis-Werkzeuge, damit es sich wie eine echte Kiste anfuehlt
# sudo           -> "fallen" darf root werden (die eigentliche Sicherheitsgrenze
#                    ist die Docker-Capability/Ressourcen-Haertung, NICHT das
#                    fehlen von root IM Container)
# jq -> fuer das `such`-Such-CLI (JSON aus SearXNG parsen)
RUN apt-get update && apt-get install -y --no-install-recommends \
        iputils-ping \
        dnsutils \
        net-tools \
        curl \
        wget \
        jq \
        nano \
        less \
        htop \
        procps \
        ca-certificates \
        sudo \
        bash-completion \
    && rm -rf /var/lib/apt/lists/*

# Ubuntu-Telemetrie / Phone-Home entfernen, falls im Base-Image vorhanden.
# ubuntu:latest ist minimal -> meist gar nicht installiert, daher tolerant
# (|| true). Kostet nichts und stellt sicher, dass hier nichts nach Hause funkt.
RUN apt-get purge -y popularity-contest ubuntu-report apport whoopsie >/dev/null 2>&1 || true

RUN useradd -m -s /bin/bash fallen \
    && echo 'fallen ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/fallen \
    && chmod 0440 /etc/sudoers.d/fallen

# ── Privacy-Werkzeuge ─────────────────────────────────────────────────
# such            -> Websuche nur ueber die eigene SearXNG (search.glappa.de)
# .curlrc/.wgetrc -> generischer User-Agent statt "curl/x" (Anti-Fingerprint)
# glappa-privacy  -> einmaliger Login-Hinweis auf den Privacy-Modus
# Der eigentliche Ausgang (Tor/DoH) sitzt im Egress-Proxy, nicht hier — diese
# Dateien machen die VM nur bewusst "privacy-first" bedienbar.
COPY such /usr/local/bin/such
COPY --chown=fallen:fallen curlrc /home/fallen/.curlrc
COPY --chown=fallen:fallen wgetrc /home/fallen/.wgetrc
COPY glappa-privacy.sh /etc/profile.d/glappa-privacy.sh
RUN chmod +x /usr/local/bin/such /etc/profile.d/glappa-privacy.sh

USER fallen
WORKDIR /home/fallen

# Der Container tut sonst nichts — der Gateway haengt sich per
# `docker exec -it <container> bash` rein (server.py). "sleep infinity"
# haelt ihn nur am Leben, bis der Gateway ihn nach Sitzungsende stoppt.
CMD ["sleep", "infinity"]
