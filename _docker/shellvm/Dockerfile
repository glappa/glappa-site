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
# sudo           -> "guest" darf root werden (die eigentliche Sicherheitsgrenze
#                    ist die Docker-Capability/Ressourcen-Haertung, NICHT das
#                    fehlen von root IM Container)
RUN apt-get update && apt-get install -y --no-install-recommends \
        iputils-ping \
        dnsutils \
        net-tools \
        curl \
        wget \
        nano \
        less \
        htop \
        procps \
        ca-certificates \
        sudo \
        bash-completion \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash guest \
    && echo 'guest ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/guest \
    && chmod 0440 /etc/sudoers.d/guest

USER guest
WORKDIR /home/guest

# Der Container tut sonst nichts — der Gateway haengt sich per
# `docker exec -it <container> bash` rein (server.py). "sleep infinity"
# haelt ihn nur am Leben, bis der Gateway ihn nach Sitzungsende stoppt.
CMD ["sleep", "infinity"]
