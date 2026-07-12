# Egress-Proxy fuer die Gast-Shell (real-shell / terminal-boot).
#
# EINZIGER Weg des Gast-Containers nach draussen. Der Gast haengt an einem
# internen Docker-Netz OHNE Internet (siehe shellgate/server.py: LAN_NETWORK,
# internal=True) und erreicht ausschliesslich diesen Proxy. Hier drin laufen
# drei kleine, quelloffene Dienste unter supervisord:
#
#   tor            -> anonymisierter SOCKS-Ausgang (127.0.0.1:9050, nur
#                     containerintern fuer privoxy erreichbar)
#   privoxy        -> HTTP/HTTPS-Proxy auf :8118, leitet ALLES per
#                     forward-socks5t an Tor weiter (remote DNS ueber Tor,
#                     kein DNS-Leak) — AUSSER *.glappa.de, das geht direkt
#                     (eigene Infrastruktur, kein Tracking, schneller)
#   dnscrypt-proxy -> DNS auf :53, loest verschluesselt via DoH ueber
#                     No-Log-Resolver auf (statt im Klartext zum ISP-DNS)
#
# Faellt einer aus, faellt der Ausgang zu (fail-closed) — es leakt nichts.
# Der Container hat KEINEN docker.sock, KEINE Host-Mounts.
#
# alpine:latest bewusst wie ubuntu:latest im shellvm — folgt automatisch der
# aktuellen stabilen Version, statt eine Nummer veralten zu lassen.
FROM alpine:latest

RUN apk add --no-cache \
        tor \
        privoxy \
        dnscrypt-proxy \
        supervisor \
        ca-certificates

# Verzeichnisse anlegen; Tor-DataDirectory MUSS dem tor-User gehoeren, sonst
# verweigert tor den Start ("not owned by this user"). Der tor-User kommt aus
# dem apk-Paket.
RUN mkdir -p /var/log/privoxy /var/cache/dnscrypt-proxy /var/lib/tor \
    && chown -R tor:tor /var/lib/tor

# privoxy: die vom Paket mitgelieferte Config als Basis NEHMEN (damit die
# confdir/actionsfile-Verweise sicher stimmen) und nur das Noetige aendern —
# auf allen Interfaces lauschen (der Gast erreicht uns hier) und ALLES ueber
# Tor forwarden, *.glappa.de direkt.
#   Alpines privoxy-Paket liefert seine Config-Dateien bewusst als *.new aus
#   (Alpines conffile-Schutzkonvention: eigene Aenderungen ueberleben ein
#   Paket-Upgrade, weil die "config" selbst nie vom Paket ueberschrieben
#   wird) — MUESSEN erst auf die echten Namen umbenannt werden, sonst startet
#   privoxy gar nicht ("No such file or directory"). Verifiziert gegen
#   Alpines echte Paketinhalte (pkgs.alpinelinux.org).
#   sed: jede aktive listen-address auskommentieren -> genau EINE eigene setzen
#        (verhindert Doppel-Bind 127.0.0.1 + 0.0.0.0).
RUN mv /etc/privoxy/config.new /etc/privoxy/config \
    && mv /etc/privoxy/default.action.new /etc/privoxy/default.action \
    && mv /etc/privoxy/default.filter.new /etc/privoxy/default.filter \
    && mv /etc/privoxy/match-all.action.new /etc/privoxy/match-all.action \
    && sed -i 's|^[[:space:]]*listen-address|#listen-address|' /etc/privoxy/config \
    && printf '%s\n' \
        '' \
        '# --- glappa egress ---' \
        'listen-address 0.0.0.0:8118' \
        'enable-remote-toggle 0' \
        'enable-remote-http-toggle 0' \
        'enable-edit-actions 0' \
        'forward-socks5t / 127.0.0.1:9050 .' \
        'forward   .glappa.de/   .' \
        'forward    glappa.de/   .' \
        >> /etc/privoxy/config \
    # user.action/user.filter stehen in der Stock-Config, liegen aber in
    # KEINER Alpine-Paketversion bei — und privoxy 4.0 bricht bei fehlenden
    # referenzierten Dateien FATAL ab ("can't load re_filterfile
    # '/etc/privoxy/user.filter'", live: supervisord-Retry-Schleife, :8118
    # lauschte nie, der Gast sah nur "refusing connections"). Leere Dateien
    # genuegen; kaeme kuenftig doch ein *.new vom Paket, gewinnt dessen Inhalt.
    && for f in user.action user.filter; do \
           if [ -f "/etc/privoxy/$f.new" ]; then mv "/etc/privoxy/$f.new" "/etc/privoxy/$f"; \
           elif [ ! -f "/etc/privoxy/$f" ]; then : > "/etc/privoxy/$f"; fi; \
       done \
    # Bau bricht ab, wenn die zusammengesetzte Config nicht laedt — genau die
    # Fehlerklasse oben waere so schon beim Image-Build aufgefallen statt erst
    # zur Laufzeit im supervisord-Log des laufenden Proxys.
    && privoxy --config-test /etc/privoxy/config

COPY torrc                /etc/tor/torrc
COPY dnscrypt-proxy.toml  /etc/dnscrypt-proxy/dnscrypt-proxy.toml
COPY supervisord.conf     /etc/supervisord.conf

# :53 DNS (dnscrypt) und :8118 HTTP-Proxy (privoxy) — nur innerhalb des
# internen Docker-Netzes erreichbar (kein Host-Port-Mapping).
EXPOSE 53/udp 53/tcp 8118/tcp

ENTRYPOINT ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
