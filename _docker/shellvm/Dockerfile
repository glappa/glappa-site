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
# jq              -> fuer das `such`-Such-CLI (JSON aus SearXNG parsen)
# gettext-base     -> envsubst, fuer das librewolf-Wrapperskript (Proxy-Policy
#                     wird bei jedem Start frisch aus $http_proxy generiert)
# tigervnc-standalone-server -> Xvnc (X-Server + VNC-Server in einem Prozess)
# openbox/dbus-x11/xterm     -> minimaler Desktop fuer die GUI-Anzeige
# x11-apps         -> xeyes/xclock/xcalc: winzige klassische GUI-Testprogramme,
#                     um den kompletten Desktop-Weg (Xvnc -> displaygate ->
#                     noVNC im Browser) UNABHAENGIG von LibreWolf zu testen —
#                     starten in <1s, brauchen kein Netz, kein Profil, nichts
# supervisor       -> haelt Xvnc+openbox dauerhaft am Leben (ersetzt "sleep
#                     infinity" als CMD, siehe Dateiende)
RUN apt-get update && apt-get install -y --no-install-recommends \
        iputils-ping \
        dnsutils \
        net-tools \
        curl \
        wget \
        jq \
        gettext-base \
        tigervnc-standalone-server \
        openbox \
        dbus-x11 \
        xterm \
        x11-apps \
        supervisor \
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

# ── LibreWolf: gehaerteter, quelloffener Firefox-Fork ──────────────────
# Bewusst NICHT "apt install firefox" — Ubuntu ersetzt das Paket seit einigen
# Versionen durch einen reinen Snap-Wrapper ("requires the firefox snap"),
# und snapd laeuft in einem Container ohne systemd nicht. LibreWolf hat ein
# eigenes APT-Repo mit einem echten .deb (kein Snap), UND bringt schon ab
# Werk das mit, was hier gewuenscht ist: Telemetrie raus, uBlock Origin
# vorinstalliert, kein Pocket/gesponserte Inhalte, staerkere Anti-
# Fingerprinting-Vorgaben als Standard-Firefox.
#
# Host ist repo.librewolf.net (NICHT deb.librewolf.net — das war ein
# Irrtum, liefert 404; live gegen den echten Server verifiziert). Die Suite
# heisst dort schlicht "librewolf" (EIN fester Name fuer alle Debian/Ubuntu-
# Versionen, kein Codename-Mapping noetig — /dists/ listet nur diesen einen
# Eintrag, kein per-Codename-Ordner). Keyring wird als binaere OpenPGP-Datei
# ausgeliefert (kein --dearmor noetig) — und MUSS deshalb als .gpg gespeichert
# werden: apt prueft inzwischen die Datei-Endung gegen den Inhalt und
# ignoriert einen binaeren Key in einer .asc-Datei komplett ("ignored as the
# file has an unsupported filetype" -> NO_PUBKEY; .asc ist ausschliesslich
# fuer ASCII-armored zulaessig). Genau daran ist der zweite VPS-Deploy
# gescheitert. SHA256 gegen die auf der Repo-Seite angegebene Pruefsumme
# verifiziert:
#   537df0094eeac2c301e0959b08d48b0fd0e8de507836d8720a4abe46522b70d5
RUN mkdir -p /etc/apt/keyrings \
    && wget -O /etc/apt/keyrings/librewolf.gpg https://repo.librewolf.net/keyring.gpg \
    && echo "537df0094eeac2c301e0959b08d48b0fd0e8de507836d8720a4abe46522b70d5  /etc/apt/keyrings/librewolf.gpg" | sha256sum -c - \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/librewolf.gpg] https://repo.librewolf.net librewolf main" \
         > /etc/apt/sources.list.d/librewolf.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends librewolf \
    && rm -rf /var/lib/apt/lists/* \
    && REAL_BIN="$(dpkg -L librewolf | grep -E '/librewolf$' | grep -v '^/usr/bin/librewolf$' | head -n1)" \
    && test -x "$REAL_BIN" \
    && echo "$REAL_BIN" > /etc/librewolf-real-bin-path

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

# ── librewolf-Wrapper ────────────────────────────────────────────────
# /usr/local/bin liegt im PATH VOR /usr/bin — dieses Skript wird also
# gefunden, bevor apt's eigener /usr/bin/librewolf-Symlink zum Zug kommt.
# Es schreibt bei JEDEM Start die Proxy-Policy frisch aus $http_proxy
# (von shellgate gesetzt, siehe shellgate/server.py: guest_env) — dadurch
# muss die Egress-Proxy-Adresse hier nicht hart codiert werden und bleibt
# auch dann korrekt, wenn sie sich mal aendert.
COPY librewolf-policy.json.template /etc/librewolf/policies/policies.json.template
COPY librewolf-wrapper.sh /usr/local/bin/librewolf
RUN chmod +x /usr/local/bin/librewolf \
    && ln -sf /usr/local/bin/librewolf /usr/local/bin/firefox

# ── Minimaler Desktop (Xvnc + openbox) fuer die GUI-Anzeige ───────────
# Rechtsklick-Menue mit LibreWolf + Terminal — reicht als Ausgangspunkt,
# weitere GUI-Programme lassen sich per apt nachinstallieren und ueber
# xterm starten. KEIN Autostart von LibreWolf: der Desktop soll im Ruhe-
# zustand leicht bleiben (wie der Rest dieser dauerhaften VM), der Browser
# startet nur, wenn ihn wer tatsaechlich anklickt/eintippt.
COPY openbox-menu.xml /etc/xdg/openbox/menu.xml
COPY supervisord.conf /etc/supervisord.conf
RUN mkdir -p /var/log/glappa-desktop && chown fallen:fallen /var/log/glappa-desktop

USER fallen
WORKDIR /home/fallen

# supervisord haelt Xvnc + openbox dauerhaft am Leben (Details siehe
# supervisord.conf) — laeuft komplett als "fallen", keine root-Rechte
# noetig. Der Text-Terminal-Zugang (terminal.html "terminal-boot") haengt
# sich weiterhin per `docker exec -it <container> bash` separat rein
# (server.py); shellgate setzt dort DISPLAY=:1, GUI-Programme, die man im
# Text-Terminal startet, tauchen also auf demselben Desktop auf, den
# desktop-boot anzeigt.
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf", "-n"]
