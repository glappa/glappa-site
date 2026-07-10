"""
shellgate — passwortgeschuetzter Zugang zu einer ECHTEN, wegwerfbaren
Ubuntu-Shell pro Sitzung, gesteuert ueber terminal.html ("real-shell").

Architektur (bewusst als EIGENER, isolierter Dienst — NICHT im Haupt-
Container "glappa" mitgemountet):
  Browser (xterm.js) <--WebSocket--> shellgate (dieser Prozess)
                                          |
                                          | Docker-API (docker.sock)
                                          v
                                 pro Sitzung EIN frisches,
                                 stark eingeschraenktes Ubuntu-
                                 Gast-Container (siehe shellvm/)

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
import uuid

import docker
import websockets
from docker.errors import APIError, DockerException
from docker.utils.socket import read as docker_sock_read

logging.basicConfig(level=logging.INFO, format='[shellgate] %(asctime)s %(message)s')
log = logging.getLogger('shellgate')

# ── Config (alles per env, kein Hardcoding von Geheimnissen im Code) ──
PASSWORD_HASH = (os.environ.get('SHELL_PASSWORD_HASH') or '').strip().lower()
GUEST_IMAGE   = os.environ.get('SHELL_IMAGE', 'glappa-shellvm:latest')
IDLE_TIMEOUT  = int(os.environ.get('SHELL_IDLE_TIMEOUT', '1800'))   # 30 Min. ohne Eingabe
MAX_SESSIONS  = int(os.environ.get('SHELL_MAX_SESSIONS', '5'))      # gleichzeitige Gast-Container
BOOT_TIMEOUT  = int(os.environ.get('SHELL_BOOT_TIMEOUT', '20'))     # Sek. bis Container+Shell stehen
LISTEN_PORT   = int(os.environ.get('SHELL_PORT', '8765'))
NETWORK_NAME  = os.environ.get('SHELL_NETWORK', 'glappa-shell-net')

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


def ensure_network() -> None:
    """Eigenes, von Ollama/SearXNG/glappa GETRENNTES Docker-Netz fuer die
    Gast-Container — die koennen so nichts von der uebrigen Infrastruktur
    im internen Docker-Netz sehen, nur raus ins Internet (NAT vom Host)."""
    try:
        client.networks.get(NETWORK_NAME)
    except docker.errors.NotFound:
        log.info('lege Docker-Netz %s an', NETWORK_NAME)
        client.networks.create(NETWORK_NAME, driver='bridge')


def spawn_guest_container() -> 'docker.models.containers.Container':
    name = f'glappa-shell-{uuid.uuid4().hex[:10]}'
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
    return client.containers.run(
        GUEST_IMAGE,
        name=name,
        detach=True,
        command=['sleep', 'infinity'],
        network=NETWORK_NAME,
        # Haertung: ALLES kappen, nur NET_RAW (fuer ping) wieder zulassen.
        # sudo im Container aendert daran nichts — die Grenze liegt hier,
        # nicht bei der In-Container-UID.
        cap_drop=['ALL'],
        cap_add=['NET_RAW'],
        security_opt=['no-new-privileges:true'],
        pids_limit=256,
        mem_limit='512m',
        memswap_limit='512m',
        nano_cpus=1_000_000_000,   # 1 CPU-Kern
        remove=True,               # rm beim Stoppen — keine Container-Leichen
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
            environment={'TERM': 'xterm-256color'},
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
        self.closing = True
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
        if self.container is not None:
            def _stop():
                try:
                    self.container.stop(timeout=2)
                except (APIError, DockerException):
                    pass
            await asyncio.to_thread(_stop)
            log.info('Container %s beendet (Session %s)', self.container.name, self.ip)


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
    ensure_network()
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
