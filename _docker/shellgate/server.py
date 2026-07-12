"""
shellgate — passwortgeschuetzter Zugang zu EINER dauerhaften Ubuntu-Shell,
gesteuert ueber terminal.html ("terminal-boot").

Architektur (bewusst als EIGENER, isolierter Dienst — NICHT im Haupt-
Container "glappa" mitgemountet):
  Browser (xterm.js) <--WebSocket--> shellgate (dieser Prozess)
                                          |
                                          | Docker-API (docker.sock)
                                          v
                                 EIN dauerhafter Ubuntu-Gast-
                                 Container (fester Name statt
                                 Zufalls-Suffix, siehe shellvm/) —
                                 ueberlebt Reconnects UND Redeploys,
                                 wird bei Sitzungsende nicht gestoppt.
                                 Jede Sitzung startet nur eine eigene
                                 `bash -l`-Exec-Session darin (wie
                                 mehrere SSH-Sitzungen auf eine Kiste).

Warum ein eigener Dienst? Der Haupt-Container bedient yt-dlp/ffmpeg auf
oeffentlichen Nutzereingaben (URLs) — der Docker-Socket ist praktisch
"root auf dem Host". Den nur hier, in einem kleinen, single-purpose
Dienst zu mounten, haelt den Explosionsradius eines Bugs klein.

Protokoll (JSON-Textframes in beide Richtungen):
  Client -> Server:
    {"type":"auth",   "password":"..."}            (muss die ERSTE Nachricht sein)
    {"type":"input",  "data":"<getippter Text>"}
    {"type":"resize", "cols":N, "rows":N}
  Server -> Client:
    {"type":"auth",   "ok":true|false, "msg":"..."}
    {"type":"ready"}                                (Container laeuft, Shell haengt)
    {"type":"output", "data":"<Bytes aus der PTY>"}
    {"type":"error",  "msg":"..."}
    {"type":"closed", "reason":"idle"|"server"|...}
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import socket as pysocket
import time

import docker
import websockets
from docker.errors import APIError, DockerException
from docker.utils.socket import read as docker_sock_read

logging.basicConfig(level=logging.INFO, format='[shellgate] %(asctime)s %(message)s')
log = logging.getLogger('shellgate')

# ── Config (alles per env, kein Hardcoding von Geheimnissen im Code) ──
PASSWORD_HASH  = (os.environ.get('SHELL_PASSWORD_HASH') or '').strip().lower()
GUEST_IMAGE    = os.environ.get('SHELL_IMAGE', 'glappa-shellvm:latest')
GUEST_CONTAINER_NAME = os.environ.get('SHELL_CONTAINER_NAME', 'glappa-shell-persistent')
IDLE_TIMEOUT   = int(os.environ.get('SHELL_IDLE_TIMEOUT', '1800'))   # 30 Min. ohne Eingabe -> WS zu
MAX_SESSIONS   = int(os.environ.get('SHELL_MAX_SESSIONS', '5'))      # gleichzeitige Exec-Sitzungen
BOOT_TIMEOUT   = int(os.environ.get('SHELL_BOOT_TIMEOUT', '20'))     # Sek. bis Container+Shell stehen
LISTEN_PORT    = int(os.environ.get('SHELL_PORT', '8765'))

# ── Anti-Tracking-Netztopologie ("Ausgang nur ueber den Egress-Proxy") ──
# Der Gast haengt AUSSCHLIESSLICH am internen LAN (internal=True -> KEIN
# Internet-Gateway). Der einzige Weg nach draussen ist der Egress-Proxy-
# Container, der an beiden Netzen haengt:
#   LAN (internal)  -> Gast <-> Proxy; die tatsaechlich vom Docker vergebene
#                       IP des Proxys wird zur Laufzeit ausgelesen
#                       (egress_lan_ip()) und dem Gast als DNS-Server
#                       gesetzt — kein fest codiertes Subnetz mehr.
#   WAN (Bridge)    -> nur der Proxy, hat darueber Internet (NAT vom Host).
# Im Proxy: Tor (SOCKS) + privoxy (HTTP/HTTPS->Tor) + dnscrypt-proxy (DoH).
# Vorteil ggü. Firewall-Regeln im Gast: KEIN NET_ADMIN im Gast noetig, und
# es ist fail-closed (faellt der Proxy aus, kommt der Gast schlicht nicht
# mehr raus — nichts leakt an ISP/Tracker). Siehe _docker/shell-egress/.
LAN_NETWORK    = os.environ.get('SHELL_LAN_NETWORK', 'glappa-shell-lan')
WAN_NETWORK    = os.environ.get('SHELL_WAN_NETWORK', 'glappa-shell-wan')
EGRESS_IMAGE   = os.environ.get('SHELL_EGRESS_IMAGE', 'glappa-shell-egress:latest')
EGRESS_NAME    = os.environ.get('SHELL_EGRESS_CONTAINER', 'glappa-shell-egress')
PROXY_PORT     = int(os.environ.get('SHELL_PROXY_PORT', '8118'))
# KEIN fest codiertes Subnetz/keine feste IP mehr (siehe ensure_networks() +
# egress_lan_ip() unten) — ein hart codierter Wert (10.89.7.0/24) hat auf der
# VPS mit einem bereits existierenden Docker-Netz kollidiert ("Pool overlaps
# with other one on this address space"). Docker waehlt die Range jetzt
# selbst; die tatsaechlich vergebene IP des Egress-Proxys wird zur Laufzeit
# ausgelesen (egress_lan_ip()), nicht mehr angenommen.

MAX_ATTEMPTS  = 5      # Fehlversuche pro IP
LOCKOUT_SECS  = 300     # ... bevor die IP fuer 5 Minuten gesperrt wird

if not PASSWORD_HASH:
    raise SystemExit('SHELL_PASSWORD_HASH fehlt (env) — Server startet bewusst nicht ohne Passwort.')
if len(PASSWORD_HASH) != 64:
    log.warning('SHELL_PASSWORD_HASH ist kein 64-stelliger Hex-String (SHA-256?) - pruef den Wert.')

# max_pool_size: docker-py's Default ist nur 10 (DEFAULT_MAX_POOL_SIZE).
# JEDE gehijackte Exec-Verbindung (spawn_exec -> exec_start(socket=True))
# haelt fuer die GESAMTE Sitzungsdauer eine Verbindung aus genau diesem
# Pool fest — die HTTP-Verbindung wird ja fuer den rohen PTY-Bytestream
# gekapert, kommt also nie in den Pool zurueck. Bei mehreren Sitzungen
# (MAX_SESSIONS) plus normalen API-Aufrufen (spawn, resize, cleanup)
# ueber denselben Client reicht der Standard-Pool schnell nicht mehr —
# weitere Docker-API-Aufrufe blockieren dann, bis der Timeout greift.
client = docker.from_env(max_pool_size=max(64, MAX_SESSIONS * 4))

_fail_lock = asyncio.Lock()
_fails: dict[str, tuple[int, float]] = {}   # ip -> (Anzahl, Zeitpunkt des ersten Fehlversuchs)
_active_sessions = 0
_sessions_lock = asyncio.Lock()


def check_password(candidate: str) -> bool:
    digest = hashlib.sha256(candidate.encode('utf-8', 'replace')).hexdigest()
    return hmac.compare_digest(digest, PASSWORD_HASH)


def ensure_networks() -> None:
    """Legt die beiden Docker-Netze an, falls noetig — OHNE eigenes
    Subnetz/Gateway anzugeben: Docker waehlt selbst eine freie Range aus
    seinem Standard-Pool. Ein frueher hier fest codiertes Subnetz
    (10.89.7.0/24) hat auf der VPS mit einem bereits existierenden Netz
    kollidiert ("Pool overlaps with other one on this address space") —
    Docker vermeidet solche Kollisionen selbststaendig, wenn man es nicht
    durch eine eigene Vorgabe daran hindert.
      - LAN_NETWORK (internal=True): der Gast haengt NUR hier -> KEIN
        direkter Internet-Zugang.
      - WAN_NETWORK (normaler Bridge): nur der Egress-Proxy haengt hier und
        hat darueber Internet (NAT vom Host)."""
    try:
        client.networks.get(LAN_NETWORK)
    except docker.errors.NotFound:
        log.info('lege internes Gast-Netz %s an (internal, Docker waehlt das Subnetz)', LAN_NETWORK)
        client.networks.create(LAN_NETWORK, driver='bridge', internal=True)
    try:
        client.networks.get(WAN_NETWORK)
    except docker.errors.NotFound:
        log.info('lege Egress-Netz %s an (mit Internet)', WAN_NETWORK)
        client.networks.create(WAN_NETWORK, driver='bridge')


def ensure_egress() -> 'docker.models.containers.Container':
    """Stellt sicher, dass der EINE dauerhafte Egress-Proxy laeuft und an
    BEIDEN Netzen haengt. Er ist der einzige Weg des Gastes nach draussen:
    Tor + privoxy (HTTP/HTTPS anonymisiert) + dnscrypt-proxy (DNS via DoH).
    Faellt er aus, kommt der Gast schlicht nicht mehr raus (fail-closed) —
    es leakt nichts an ISP/Tracker. Kein docker.sock, keine Host-Mounts."""
    ensure_networks()
    try:
        client.images.get(EGRESS_IMAGE)
    except docker.errors.ImageNotFound:
        raise RuntimeError(
            f'Egress-Image {EGRESS_IMAGE} fehlt. Auf der VPS bauen mit:  '
            f'docker build -t {EGRESS_IMAGE} _docker/shell-egress   '
            f'(restart.sh --vps macht das automatisch).')

    try:
        c = client.containers.get(EGRESS_NAME)
        c.reload()
        nets = set((c.attrs.get('NetworkSettings', {}).get('Networks') or {}).keys())
        if LAN_NETWORK not in nets or WAN_NETWORK not in nets:
            log.warning('Egress-Proxy %s haengt nicht an beiden Netzen (%s) — neu anlegen',
                        EGRESS_NAME, sorted(nets))
            c.remove(force=True)
        else:
            if c.status != 'running':
                log.info('Egress-Proxy %s laeuft nicht (%s) — starte neu', EGRESS_NAME, c.status)
                c.start()
            return c
    except docker.errors.NotFound:
        pass

    log.info('lege Egress-Proxy %s an (Tor + privoxy + dnscrypt)', EGRESS_NAME)
    # Keine feste IP mehr (s. ensure_networks()) — normale containers.run()
    # reicht, das zweite Netz kommt per connect_container_to_network() dazu.
    c = client.containers.run(
        EGRESS_IMAGE,
        name=EGRESS_NAME,
        hostname='egress',
        detach=True,
        network=LAN_NETWORK,
        restart_policy={'Name': 'unless-stopped'},
        mem_limit='256m',
        pids_limit=256,
        nano_cpus=1_000_000_000,
    )
    # Zweites Netz (mit Internet) dazu: der Gast erreicht den Proxy ueber das
    # interne LAN, der Proxy das Internet ueber das WAN.
    client.api.connect_container_to_network(c.id, WAN_NETWORK)
    return c


def egress_lan_ip(container) -> str:
    """Liest die von Docker VERGEBENE IP des Egress-Proxys im internen LAN
    aus. Wird fuer dns=[...] im Gast gebraucht — das MUSS eine echte IP
    sein, kein Name (Dockers eingebauter Name-DNS ist im Gast ja gerade
    NICHT konfiguriert, dns=[...] ersetzt ihn vollstaendig, s.u.)."""
    container.reload()
    net = (container.attrs.get('NetworkSettings', {}).get('Networks') or {}).get(LAN_NETWORK) or {}
    ip = net.get('IPAddress')
    if not ip:
        raise RuntimeError(f'Egress-Proxy {EGRESS_NAME} hat (noch) keine IP im Netz {LAN_NETWORK}.')
    return ip


def spawn_guest_container() -> 'docker.models.containers.Container':
    """Gibt den EINEN dauerhaften Gast-Container zurueck — legt ihn beim
    allerersten Aufruf an, startet ihn bei jedem weiteren Aufruf nur neu,
    falls er (z.B. nach einem Host-Reboot) gerade nicht laeuft. KEIN
    Wegwerf-Container mehr pro Sitzung: fester Name statt Zufalls-Suffix,
    kein remove=True — installierte Pakete/Dateien bleiben ueber Sitzungen
    UND ueber restart.sh-Redeploys hinweg erhalten (shellgate wird neu
    gestartet, der Container selbst bleibt unberuehrt stehen). Reset auf
    einen sauberen Zustand: von Hand auf der VPS
    `docker rm -f glappa-shell-persistent` (naechste Sitzung baut ihn neu)."""
    # Egress-Proxy + Netze muessen stehen, BEVOR der Gast startet — seine DNS
    # (dns=[egress_ip]) und sein http(s)_proxy zeigen auf den Proxy. Laueft
    # der Proxy schon, ist das ein billiger get(); sonst wird er hier erzeugt.
    egress_ip = egress_lan_ip(ensure_egress())

    # Bewusst VORHER pruefen, ob das Gast-Image lokal existiert: sonst
    # versucht containers.run() es von Docker Hub zu ziehen (das Repo
    # gibt es dort nicht -> kryptisches "pull access denied"). Klarer
    # Hinweis auf den echten Fehler: das Image wurde nicht gebaut.
    try:
        client.images.get(GUEST_IMAGE)
    except docker.errors.ImageNotFound:
        raise RuntimeError(
            f'Gast-Image {GUEST_IMAGE} fehlt. Auf der VPS bauen mit:  '
            f'docker build -t {GUEST_IMAGE} _docker/shellvm   '
            f'(restart.sh --vps macht das automatisch).')

    # Alles ins Netz laeuft ueber den Egress-Proxy: HTTP/HTTPS per Proxy-Env,
    # DNS per dns=[egress_ip]. GLAPPA_EGRESS ist der Marker, an dem wir unten
    # erkennen, ob ein schon existierender Gast bereits zum gewuenschten Stand
    # passt (Env/CMD/mem_limit lassen sich an einem laufenden Container nicht
    # nachtraeglich aendern -> sonst muss er einmalig neu gebaut werden). Der
    # WERT wird hochgezaehlt, wenn sich am Image etwas aendert, das eine
    # Neuerzeugung braucht (nicht nur Netz/Proxy):
    #   1 -> 2: Xvnc/openbox/LibreWolf kamen dazu.
    #   2 -> 3: FALLE — der Marker haengt am CONTAINER (shellgate setzt ihn
    #           beim Anlegen), NICHT am Image-Inhalt. Beim zweiten VPS-Deploy
    #           wurde der Gast neu angelegt, waehrend der shellvm-Build
    #           (LibreWolf-Keyring) fehlgeschlagen war: der Container trug
    #           Marker 2, entstand aber aus dem ALTEN Image ohne LibreWolf/
    #           Xvnc ("firefox: command not found", live gesehen) — und galt
    #           damit faelschlich als aktuell. Ausserdem neu im Image:
    #           x11-apps als GUI-Testprogramme. Der Bump erzwingt GENAU
    #           EINMAL die Neuerzeugung aus dem reparierten Image.
    EGRESS_MARKER = '3'
    proxy_url = f'http://{egress_ip}:{PROXY_PORT}'
    guest_env = {
        'http_proxy':  proxy_url, 'https_proxy': proxy_url,
        'HTTP_PROXY':  proxy_url, 'HTTPS_PROXY': proxy_url,
        'no_proxy':    'localhost,127.0.0.1,::1',
        'NO_PROXY':    'localhost,127.0.0.1,::1',
        'GLAPPA_EGRESS': EGRESS_MARKER,
    }

    try:
        container = client.containers.get(GUEST_CONTAINER_NAME)
        container.reload()
        nets = set((container.attrs.get('NetworkSettings', {}).get('Networks') or {}).keys())
        env_list = (container.attrs.get('Config', {}) or {}).get('Env') or []
        locked = (f'GLAPPA_EGRESS={EGRESS_MARKER}' in env_list) and nets == {LAN_NETWORK}
        if not locked:
            # Alt-Container (noch am Internet, aus der Zeit vor der Egress-
            # Haertung, oder mit veraltetem Marker-Stand, s.o.) -> EINMALIG
            # verwerfen und neu bauen. Installierte Pakete in der alten Kiste
            # gehen dabei verloren; das ist der bewusste Umstieg.
            log.warning('Gast-Container %s passt nicht zum aktuellen Stand '
                        '(erwartet Marker %s + nur Netz %s; Netze=%s) — wird EINMALIG neu angelegt.',
                        GUEST_CONTAINER_NAME, EGRESS_MARKER, LAN_NETWORK, sorted(nets))
            container.remove(force=True)
        else:
            if container.status != 'running':
                log.info('dauerhafter Gast-Container %s existiert, laeuft aber nicht (%s) — starte neu',
                          GUEST_CONTAINER_NAME, container.status)
                container.start()
            return container
    except docker.errors.NotFound:
        pass

    log.info('lege dauerhaften Gast-Container %s an — nur internes Netz %s, '
             'Ausgang ausschliesslich ueber Egress-Proxy %s',
             GUEST_CONTAINER_NAME, LAN_NETWORK, egress_ip)
    return client.containers.run(
        GUEST_IMAGE,
        name=GUEST_CONTAINER_NAME,
        hostname='VIRT',
        detach=True,
        # Kein command=['sleep','infinity'] mehr — das Image-eigene CMD
        # (supervisord) haelt jetzt Xvnc+openbox dauerhaft am Leben, fuer
        # die GUI-Anzeige (desktop-boot). Siehe shellvm/Dockerfile.
        # NUR internes Netz (internal=True -> kein Internet-Gateway) + DNS auf
        # den Egress-Proxy + http(s)_proxy-Env. Damit kann der Gast NICHTS
        # direkt ins Netz schicken, nur ueber den Proxy (Tor/DoH).
        network=LAN_NETWORK,
        dns=[egress_ip],
        environment=guest_env,
        # Normale Docker-Standard-Capabilities (bewusst KEIN cap_drop=ALL
        # mehr): sudo braucht SETUID/SETGID/AUDIT_WRITE, apt/dpkg brauchen
        # DAC_OVERRIDE/FOWNER/CHOWN/SYS_CHROOT. Bleibt trotzdem OHNE
        # SYS_ADMIN/NET_ADMIN/SYS_PTRACE/--privileged und ohne jeden Host-
        # Mount — root IM Gast ist weiterhin kein Root auf dem Host. Die
        # Netz-Sperre kommt aus der Topologie (internes Netz), NICHT aus
        # Capabilities: der Gast braucht so gerade KEIN NET_ADMIN.
        pids_limit=256,
        # Angehoben von 512m: LibreWolf + Xvnc + openbox brauchen spuerbar
        # mehr als die reine Text-Shell. 1G passt bequem ins VPS-Budget
        # (24G RAM, ~12G Ollama, ~5G System/SearXNG -> ~7G frei).
        mem_limit='1024m',
        memswap_limit='1024m',
        nano_cpus=1_000_000_000,   # 1 CPU-Kern
    )


async def spawn_exec(container) -> tuple[str, object]:
    """Startet `bash` interaktiv im Gast-Container ueber die Low-Level-
    Docker-API und gibt die Exec-ID + den rohen Duplex-Socket zurueck.
    Laeuft in einem Thread, weil docker-py hier blockierend ist.

    WICHTIG: Was exec_start(socket=True) zurueckgibt, ist je nach Transport
    ein ANDERER Objekttyp (echter socket.socket MIT .recv/.send bei TCP,
    ein socket.SocketIO-Wrapper NUR MIT .read/.write beim ueblichen
    Unix-Socket-Transport zum lokalen Docker-Daemon, sonst File-Descriptor-
    Fallback) — NICHT auf ._sock verlassen, das gibt es nur im HTTPS-Fall.
    docker.utils.socket.read() (siehe docker_sock_read) kennt alle drei
    Faelle bereits; _socket_write() unten spiegelt dieselbe Fallunterscheidung
    fuers Schreiben (dafuer gibt es in docker-py selbst keinen Helper)."""
    def _do():
        api = client.api
        exec_id = api.exec_create(
            container.id, ['bash', '-l'],
            stdin=True, tty=True,
            # DISPLAY=:1 -> GUI-Programme, die man hier im Text-Terminal
            # startet (z.B. "librewolf &"), erscheinen auf demselben
            # Xvnc-Desktop, den desktop-boot anzeigt (selber Container,
            # supervisord haelt Xvnc auf :1 dauerhaft am Leben).
            environment={'TERM': 'xterm-256color', 'DISPLAY': ':1'},
        )['Id']
        sock = api.exec_start(exec_id, tty=True, socket=True)
        return exec_id, sock
    return await asyncio.to_thread(_do)


def _socket_write(sock, data: bytes) -> None:
    """Gegenstueck zu docker.utils.socket.read() — dieselbe Fallunter-
    scheidung, nur zum Schreiben (dafuer bietet docker-py keinen Helper).

    DER EIGENTLICHE BUG hinter "Terminal reagiert nicht" (Eingabe kam
    beim Server an, siehe first_input_seen-Log, aber der Container
    bekam nie etwas): im ueblichen Unix-Socket-Transport-Fall liefert
    exec_start(socket=True) ein socket.SocketIO, das INTERN aus
    http.client.HTTPResponse stammt — und das baut seinen Puffer per
    `sock.makefile("rb")` (siehe CPython socket.py). Das "rb" heisst
    READ-ONLY; SocketIO._writing wird dabei False gesetzt. Der ECHTE
    darunterliegende Socket ist trotzdem voll bidirektional (reine
    Python-Buchhaltung, keine OS-Beschraenkung) — aber sock.write(data)
    darauf wirft io.UnsupportedOperation, EINE OSError-UNTERKLASSE, die
    Session.write()s "except OSError: pass" bisher lautlos verschluckt
    hat. Verifiziert mit einem echten sock.makefile('rb')-Objekt (exakt
    das, was docker-py intern erzeugt): .write() wirft tatsaechlich
    UnsupportedOperation; ueber ._sock direkt (der ECHTE Socket) klappt
    sendall() einwandfrei, am kuenstlichen Flag vorbei."""
    if hasattr(sock, 'send'):
        sock.send(data)
    elif isinstance(sock, pysocket.SocketIO):
        real = getattr(sock, '_sock', None)
        if real is not None:
            real.sendall(data)
        else:
            sock.write(data)   # Fallback, falls ._sock mal nicht existiert
    else:
        os.write(sock.fileno(), data)


class Session:
    def __init__(self, ws, ip: str):
        self.ws = ws
        self.ip = ip
        self.container = None
        self.exec_id = None
        self.sock = None
        self.last_active = time.monotonic()
        self.closing = False
        self.first_input_seen = False
        self.write_error_logged = False

    async def send(self, obj: dict) -> None:
        try:
            await self.ws.send(json.dumps(obj))
        except websockets.ConnectionClosed:
            pass

    def touch(self) -> None:
        self.last_active = time.monotonic()

    async def idle_seconds(self) -> float:
        return time.monotonic() - self.last_active

    def reader_thread(self, loop: asyncio.AbstractEventLoop) -> None:
        """Blockierender Lese-Loop auf dem echten Docker-Exec-Socket —
        laeuft in einem eigenen OS-Thread, schiebt Daten per
        run_coroutine_threadsafe zurueck in den Event-Loop.
        docker_sock_read() ist docker-pys EIGENER Helper (docker/utils/
        socket.py) — der kennt die drei moeglichen Rueckgabetypen von
        exec_start(socket=True) bereits und waehlt selbst recv/read/os.read,
        inklusive select/poll-Wait bis Daten da sind (blockiert also nicht
        aktiv, sondern schlaeft bis zum naechsten Byte)."""
        while not self.closing:
            try:
                chunk = docker_sock_read(self.sock, 4096)
            except OSError:
                break
            except ValueError:
                # cleanup() hat self.sock waehrend eines laufenden reads
                # geschlossen — Pythons io-Schicht meldet das als
                # ValueError("I/O operation on closed file"), nicht als
                # OSError. Voellig normaler Shutdown-Fall, kein Fehler.
                break
            if not chunk:
                break
            text = chunk.decode('utf-8', 'replace')
            fut = asyncio.run_coroutine_threadsafe(
                self.send({'type': 'output', 'data': text}), loop)
            try:
                fut.result(timeout=5)
            except Exception:
                break
        asyncio.run_coroutine_threadsafe(self._on_reader_done(), loop)

    async def _on_reader_done(self) -> None:
        if not self.closing:
            await self.send({'type': 'closed', 'reason': 'shell-exit'})
            try:
                await self.ws.close()
            except Exception:
                pass

    def write(self, text: str) -> None:
        if self.sock is None:
            return
        try:
            _socket_write(self.sock, text.encode('utf-8', 'replace'))
        except OSError as e:
            # NICHT mehr lautlos verschlucken — genau das hat den echten
            # Bug (UnsupportedOperation beim Schreiben, s. _socket_write)
            # tagelang unsichtbar gemacht. Loggt hoechstens einmal pro
            # Sitzung, nicht pro Tastendruck.
            if not self.write_error_logged:
                self.write_error_logged = True
                log.error('Schreiben zur Gast-Shell fehlgeschlagen (Session %s): %s: %s',
                          self.ip, e.__class__.__name__, e)

    async def resize(self, cols: int, rows: int) -> None:
        if not self.exec_id:
            return
        cols = max(2, min(500, int(cols)))
        rows = max(2, min(200, int(rows)))
        # WICHTIG: client.api.exec_resize() ist eine BLOCKIERENDE HTTP-
        # Anfrage (docker-py ist synchron). Direkt aufgerufen wuerde das
        # die GESAMTE asyncio-Event-Loop einfrieren, bis sie zurueckkommt
        # — und damit fuer ALLE Sitzungen jede Eingabeverarbeitung
        # blockieren (die async-for-Schleife in handle() haengt am
        # selben Loop). Das war ein echter Bug: ein einziger haengender
        # Resize-Call (z.B. bei erschoepftem Connection-Pool, s.o.)
        # machte das komplette Terminal fuer JEDEN unbedienbar, nicht
        # nur fuer diese eine Sitzung. In einem Thread ausfuehren loest
        # das strukturell, unabhaengig von der Pool-Groesse.
        def _do():
            try:
                client.api.exec_resize(self.exec_id, height=rows, width=cols)
            except APIError:
                pass
        await asyncio.to_thread(_do)

    async def cleanup(self) -> None:
        # Beendet NUR die eigene bash-Exec-Sitzung (Socket zu) — der
        # dauerhafte Gast-Container selbst (siehe spawn_guest_container)
        # bleibt fuer parallele und zukuenftige Sitzungen weiterlaufen.
        # Kein container.stop() mehr hier — sonst wuerde jede einzelne
        # Sitzung beim Schliessen den GEMEINSAMEN Container fuer alle
        # anderen mit beenden.
        self.closing = True
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
        if self.container is not None:
            log.info('Sitzung beendet (Session %s, Container %s laeuft weiter)',
                      self.ip, self.container.name)


async def idle_watchdog(session: Session) -> None:
    while not session.closing:
        await asyncio.sleep(30)
        if session.closing:
            return
        if await session.idle_seconds() > IDLE_TIMEOUT:
            log.info('Session %s wegen Inaktivitaet beendet', session.ip)
            await session.send({'type': 'closed', 'reason': 'idle'})
            try:
                await session.ws.close()
            except Exception:
                pass
            return


async def handle(ws) -> None:
    global _active_sessions
    ip = 'unbekannt'
    try:
        fwd = ws.request.headers.get('X-Forwarded-For') if ws.request else None
        ip = (fwd.split(',')[0].strip() if fwd else None) or (ws.remote_address[0] if ws.remote_address else 'unbekannt')
    except Exception:
        pass

    # ── Bruteforce-Bremse ──────────────────────────────────────────
    async with _fail_lock:
        count, first_ts = _fails.get(ip, (0, 0.0))
        if count >= MAX_ATTEMPTS and time.time() - first_ts < LOCKOUT_SECS:
            wait = int(LOCKOUT_SECS - (time.time() - first_ts))
            await ws.send(json.dumps({'type': 'auth', 'ok': False,
                                       'msg': f'Zu viele Fehlversuche — {wait}s warten.'}))
            await ws.close()
            return

    # ── Passwort erwarten (muss die erste Nachricht sein) ───────────
    try:
        first = await asyncio.wait_for(ws.recv(), timeout=30)
    except (asyncio.TimeoutError, websockets.ConnectionClosed):
        return
    try:
        data = json.loads(first)
    except json.JSONDecodeError:
        await ws.close()
        return

    if data.get('type') != 'auth' or not check_password(str(data.get('password', ''))):
        async with _fail_lock:
            count, first_ts = _fails.get(ip, (0, time.time()))
            _fails[ip] = (count + 1, first_ts)
            # Der oeffentlich erreichbare Endpunkt zieht ueber Monate hinweg
            # Scanner/Bots an, die nie wieder vorbeikommen - ohne Aufraeumen
            # waechst _fails unbegrenzt. Einfache Groessenbremse statt eines
            # eigenen Timers: bei >5000 IPs alle laengst abgelaufenen raus.
            if len(_fails) > 5000:
                now = time.time()
                for k in [k for k, v in _fails.items() if now - v[1] > LOCKOUT_SECS]:
                    del _fails[k]
        log.info('Fehlgeschlagener Login von %s (%d/%d)', ip, count + 1, MAX_ATTEMPTS)
        await ws.send(json.dumps({'type': 'auth', 'ok': False, 'msg': 'Falsches Passwort.'}))
        await ws.close()
        return

    async with _fail_lock:
        _fails.pop(ip, None)

    async with _sessions_lock:
        if _active_sessions >= MAX_SESSIONS:
            await ws.send(json.dumps({'type': 'auth', 'ok': True}))
            await ws.send(json.dumps({'type': 'error',
                                       'msg': 'Server ausgelastet — alle Gast-Shells sind belegt. Später nochmal.'}))
            await ws.close()
            return
        _active_sessions += 1

    log.info('Login OK von %s - starte Gast-Container (%d/%d Sessions)', ip, _active_sessions, MAX_SESSIONS)
    await ws.send(json.dumps({'type': 'auth', 'ok': True}))

    session = Session(ws, ip)
    watchdog_task = None
    try:
        session.container = await asyncio.wait_for(
            asyncio.to_thread(spawn_guest_container), timeout=BOOT_TIMEOUT)
        session.exec_id, session.sock = await asyncio.wait_for(
            spawn_exec(session.container), timeout=BOOT_TIMEOUT)

        loop = asyncio.get_running_loop()
        # Reader laeuft im Hintergrund-THREAD (nicht awaited!) — sonst wuerde
        # er diese Coroutine blockieren, die GLEICHZEITIG Browser-Eingaben
        # lesen muss (async-for weiter unten). Er endet von selbst, sobald
        # cleanup() den Socket schliesst (recv() wirft dann OSError).
        loop.run_in_executor(None, session.reader_thread, loop)

        await session.send({'type': 'ready'})
        watchdog_task = asyncio.create_task(idle_watchdog(session))

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            mtype = msg.get('type')
            if mtype == 'input':
                session.touch()
                if not session.first_input_seen:
                    # EINMAL pro Sitzung: beweist, dass ueberhaupt Tastatur-
                    # Eingaben ankommen (kein Keystroke-Logging — nur DASS,
                    # nicht WAS getippt wurde). Hilft zu unterscheiden ob ein
                    # "Terminal reagiert nicht"-Problem client- oder
                    # serverseitig sitzt.
                    session.first_input_seen = True
                    log.info('erste Eingabe von %s angekommen (Kanal funktioniert)', session.ip)
                session.write(str(msg.get('data', '')))
            elif mtype == 'resize':
                session.touch()
                await session.resize(msg.get('cols', 80), msg.get('rows', 24))
    except asyncio.TimeoutError:
        await session.send({'type': 'error', 'msg': 'Gast-Container startet nicht rechtzeitig — bitte später erneut versuchen.'})
        await ws.close()
    except RuntimeError as e:
        # z.B. Gast-Image fehlt (spawn_guest_container) — die Nachricht ist
        # hier bewusst konkret genug, um das Deploy-Problem zu erkennen.
        log.error('Gast-Shell-Start fehlgeschlagen: %s', e)
        await session.send({'type': 'error', 'msg': str(e)})
        await ws.close()
    except (APIError, DockerException) as e:
        log.exception('Container-Start fehlgeschlagen')
        await session.send({'type': 'error', 'msg': f'Konnte keine Gast-Shell starten ({e.__class__.__name__}).'})
        await ws.close()
    except websockets.ConnectionClosed:
        pass
    finally:
        if watchdog_task:
            watchdog_task.cancel()
        await session.cleanup()
        async with _sessions_lock:
            _active_sessions -= 1


async def main() -> None:
    ensure_networks()
    # Egress-Proxy schon beim Start hochziehen (nicht erst bei der ersten
    # Sitzung). Fehlt das Image noch, NICHT den Server abschiessen — die
    # Sitzung meldet den Fehler dann klar ueber ensure_egress()/RuntimeError.
    try:
        ensure_egress()
    except RuntimeError as e:
        log.warning('%s', e)
    except (APIError, DockerException):
        log.exception('Egress-Proxy-Start beim Boot fehlgeschlagen — wird bei der ersten Sitzung erneut versucht')
    # Bindet innerhalb des Containers auf allen Interfaces (0.0.0.0) - der
    # eigentliche Zugriffsschutz nach aussen kommt vom docker-compose
    # Port-Mapping (127.0.0.1:PORT:PORT, siehe docker-compose.vps.yml)
    # und danach von Apache/Passwort, nicht vom Bind hier.
    log.info('shellgate lauscht intern auf 0.0.0.0:%d (max %d gleichzeitige Sessions, idle=%ds)',
              LISTEN_PORT, MAX_SESSIONS, IDLE_TIMEOUT)
    async with websockets.serve(handle, '0.0.0.0', LISTEN_PORT, max_size=1_000_000):
        await asyncio.Future()


if __name__ == '__main__':
    asyncio.run(main())
