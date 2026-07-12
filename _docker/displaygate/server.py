"""
displaygate — Bruecke zwischen dem Browser (noVNC im Browser, WebSocket) und
dem Xvnc-Port der dauerhaften Gast-VM (siehe shellvm/Dockerfile: Xvnc laeuft
dort permanent auf :1 / TCP 5901, gehalten von supervisord). Seit dem
Sound-Passthrough zusaetzlich Bruecke fuer den VM-TON: dieselbe Byte-
Weiterleitung, nur mit dem Pulse-PCM-Abgriff (:5902, siehe shellvm/
glappa-pulse.pa) als Ziel — der Browser waehlt den Kanal per ?chan=audio.

Architektur (Schwester-Dienst zu shellgate, siehe dessen server.py):
  Browser (noVNC bzw.      <--WebSocket--> displaygate (dieser Prozess)
   AudioWorklet)                                |
                                       | rohes TCP, im internen Docker-Netz
                                       | glappa-shell-lan (Namensaufloesung
                                       | ueber Dockers eingebauten DNS)
                                       v
                              Gast-Container: Xvnc auf :5901
                              (?chan=audio: Pulse-PCM auf :5902)

Warum ein EIGENER Dienst statt Teil von shellgate? shellgate braucht den
docker.sock (erzeugt/steuert Container) — praktisch Host-Root. displaygate
braucht NICHTS davon, es verbindet sich nur per normalem TCP zum bereits
laufenden Gast. Getrennt zu halten heisst: dieser Dienst kann komplett OHNE
docker.sock und OHNE root laufen (siehe Dockerfile).

Auth-Design — WARUM ein Ticket statt direkt das Passwort auf dieser Leitung:
Die eigentliche VNC-Nutzlast ist ein ROHES Binaerprotokoll (RFB), das die
vendorte noVNC-Bibliothek unveraendert von Byte 1 an ueber die WebSocket-
Verbindung spricht — es gibt dort keinen Platz fuer eine eigene JSON-
Vorab-Nachricht wie bei shellgate (dort ist das Protokoll ohnehin JSON-
Textframes, ein "type":"auth" als erste Nachricht passt organisch rein).
Das Passwort selbst NIE in der WebSocket-URL (Apache access.log wuerde die
komplette Request-Zeile inkl. Query-String mitschneiden). Stattdessen:
  1) POST /auth (normales HTTPS, same-origin) mit dem Passwort im Body ->
     bei Erfolg ein zufaelliges, EINMALIGES, 30s gueltiges Ticket zurueck.
  2) Browser oeffnet die WebSocket-Verbindung mit ?ticket=... in der URL —
     das Ticket selbst ist wertlos, sobald es benutzt oder abgelaufen ist,
     verraet also selbst im Apache-Log nichts Bleibendes.
Das SHELL_PASSWORD_HASH-Geheimnis ist bewusst dasselbe wie bei shellgate
(eine Konfiguration, ein Passwort fuer Text-Terminal UND Desktop).

Protokoll:
  HTTP:
    POST /auth  {"password":"..."}  ->  {"ok":true,"ticket":"..."} | {"ok":false,"msg":"..."}
  WebSocket ?ticket=...:
    ab Verbindungsaufbau REINES binaeres RFB/VNC-Protokoll in beide
    Richtungen — kein eigenes Rahmenformat, 1:1-Byte-Weiterleitung
    (entspricht dem, was websockify fuer noVNC macht).
  WebSocket ?ticket=...&chan=audio:
    roher s16le-PCM-Strom (48 kHz stereo) vom Pulse-Abgriff der VM,
    faktisch nur Server->Client. Jeder Kanal braucht sein EIGENES
    Einmal-Ticket (der Browser macht pro Kanal einen /auth-POST).
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
import urllib.parse

import websockets

logging.basicConfig(level=logging.INFO, format='[displaygate] %(asctime)s %(message)s')
log = logging.getLogger('displaygate')

# ── Config (alles per env) ──────────────────────────────────────────────
PASSWORD_HASH   = (os.environ.get('SHELL_PASSWORD_HASH') or '').strip().lower()
GUEST_HOST      = os.environ.get('SHELL_CONTAINER_NAME', 'glappa-shell-persistent')
GUEST_VNC_PORT  = int(os.environ.get('GUEST_VNC_PORT', '5901'))
GUEST_AUDIO_PORT = int(os.environ.get('GUEST_AUDIO_PORT', '5902'))
WS_PORT         = int(os.environ.get('DISPLAYGATE_WS_PORT', '8766'))
HTTP_PORT       = int(os.environ.get('DISPLAYGATE_HTTP_PORT', '8767'))
IDLE_TIMEOUT    = int(os.environ.get('DISPLAYGATE_IDLE_TIMEOUT', '1800'))
MAX_SESSIONS    = int(os.environ.get('DISPLAYGATE_MAX_SESSIONS', '5'))
TICKET_TTL      = int(os.environ.get('DISPLAYGATE_TICKET_TTL', '30'))
CONNECT_TIMEOUT = int(os.environ.get('DISPLAYGATE_CONNECT_TIMEOUT', '10'))

MAX_ATTEMPTS = 5
LOCKOUT_SECS = 300

if not PASSWORD_HASH:
    raise SystemExit('SHELL_PASSWORD_HASH fehlt (env) — Server startet bewusst nicht ohne Passwort.')

_fail_lock = asyncio.Lock()
_fails: dict[str, tuple[int, float]] = {}   # ip -> (Anzahl, Zeitpunkt des ersten Fehlversuchs)

_tickets_lock = asyncio.Lock()
_tickets: dict[str, float] = {}   # ticket -> Ablaufzeitpunkt (time.time())

_sessions_lock = asyncio.Lock()
_active_sessions = 0


def check_password(candidate: str) -> bool:
    digest = hashlib.sha256(candidate.encode('utf-8', 'replace')).hexdigest()
    return hmac.compare_digest(digest, PASSWORD_HASH)


async def mint_ticket() -> str:
    ticket = secrets.token_hex(32)
    expiry = time.time() + TICKET_TTL
    async with _tickets_lock:
        # Nebenbei abgelaufene Alt-Tickets raus, sonst waechst das Dict bei
        # nie eingeloesten Versuchen (Scanner/Bots) unbegrenzt.
        now = time.time()
        for k in [k for k, v in _tickets.items() if now > v]:
            del _tickets[k]
        _tickets[ticket] = expiry
    return ticket


async def consume_ticket(ticket: str) -> bool:
    """Einmalig: gueltiges Ticket wird beim ersten (und einzigen) Gebrauch
    sofort geloescht, egal ob abgelaufen oder nicht."""
    if not ticket:
        return False
    async with _tickets_lock:
        expiry = _tickets.pop(ticket, None)
    return expiry is not None and time.time() <= expiry


# ── Ticket-Ausgabe: winziger, selbst geschriebener HTTP/1.1-Handler ──────
# Bewusst KEIN aiohttp/Flask-Dependency fuer eine einzelne Route — und
# bewusst NICHT ueber websockets' process_request-Hook gemultiplext (dessen
# genaue Signatur hat sich zwischen websockets-Versionen mehrfach geaendert;
# ein zweiter, eigener TCP-Listener ist hier das robustere, leichter
# nachvollziehbare Werkzeug). Einziger Klient ist ohnehin der eigene
# same-origin fetch() aus desktop.html, hinter Apache als Reverse-Proxy —
# kein allgemeiner HTTP-Server, der beliebige Requests aushalten muss.
async def _http_respond(writer: asyncio.StreamWriter, status: int, obj: dict) -> None:
    reason = {200: 'OK', 400: 'Bad Request', 401: 'Unauthorized',
              404: 'Not Found', 429: 'Too Many Requests'}.get(status, 'Error')
    body = json.dumps(obj).encode('utf-8')
    head = (f'HTTP/1.1 {status} {reason}\r\n'
            f'Content-Type: application/json\r\n'
            f'Content-Length: {len(body)}\r\n'
            f'Cache-Control: no-store\r\n'
            f'Connection: close\r\n\r\n').encode('ascii')
    try:
        writer.write(head + body)
        await writer.drain()
    except (OSError, ConnectionError):
        pass


async def handle_http(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    ip = 'unbekannt'
    try:
        peer = writer.get_extra_info('peername')
        ip = peer[0] if peer else 'unbekannt'

        request_line = await asyncio.wait_for(reader.readline(), timeout=10)
        if not request_line:
            return
        parts = request_line.decode('latin1', 'replace').strip().split(' ')
        method, path = (parts[0], parts[1]) if len(parts) >= 2 else ('', '')

        headers: dict[str, str] = {}
        while True:
            line = await asyncio.wait_for(reader.readline(), timeout=10)
            if not line or line in (b'\r\n', b'\n'):
                break
            if b':' in line:
                k, _, v = line.decode('latin1', 'replace').partition(':')
                headers[k.strip().lower()] = v.strip()

        length = 0
        try:
            length = int(headers.get('content-length', '0') or '0')
        except ValueError:
            length = 0
        # Winzige Nutzlast erwartet ({"password": "..."}) — hart begrenzen,
        # damit hier niemand grosse Bodies durchschleusen kann.
        length = max(0, min(length, 8192))
        body = await asyncio.wait_for(reader.readexactly(length), timeout=10) if length else b''

        if method != 'POST' or path.split('?', 1)[0] != '/auth':
            await _http_respond(writer, 404, {'ok': False, 'msg': 'not found'})
            return

        async with _fail_lock:
            count, first_ts = _fails.get(ip, (0, 0.0))
            if count >= MAX_ATTEMPTS and time.time() - first_ts < LOCKOUT_SECS:
                wait = int(LOCKOUT_SECS - (time.time() - first_ts))
                await _http_respond(writer, 429, {'ok': False, 'msg': f'Zu viele Fehlversuche — {wait}s warten.'})
                return

        try:
            data = json.loads(body.decode('utf-8', 'replace')) if body else {}
        except json.JSONDecodeError:
            await _http_respond(writer, 400, {'ok': False, 'msg': 'ungueltige Anfrage'})
            return

        if not check_password(str(data.get('password', ''))):
            async with _fail_lock:
                count, first_ts = _fails.get(ip, (0, time.time()))
                _fails[ip] = (count + 1, first_ts)
                if len(_fails) > 5000:
                    now = time.time()
                    for k in [k for k, v in _fails.items() if now - v[1] > LOCKOUT_SECS]:
                        del _fails[k]
            log.info('Fehlgeschlagener Login von %s (%d/%d)', ip, count + 1, MAX_ATTEMPTS)
            await _http_respond(writer, 401, {'ok': False, 'msg': 'Falsches Passwort.'})
            return

        async with _fail_lock:
            _fails.pop(ip, None)

        ticket = await mint_ticket()
        log.info('Ticket ausgestellt an %s', ip)
        await _http_respond(writer, 200, {'ok': True, 'ticket': ticket})

    except (asyncio.TimeoutError, asyncio.IncompleteReadError, ConnectionError, OSError):
        pass
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except (OSError, ConnectionError):
            pass


# ── WebSocket <-> TCP-Bruecke zum Xvnc-Port der Gast-VM ──────────────────
async def handle_ws(ws) -> None:
    global _active_sessions
    ip = 'unbekannt'
    try:
        fwd = ws.request.headers.get('X-Forwarded-For') if ws.request else None
        ip = (fwd.split(',')[0].strip() if fwd else None) or (ws.remote_address[0] if ws.remote_address else 'unbekannt')
    except Exception:
        pass

    path = ws.request.path if ws.request else ''
    query = urllib.parse.parse_qs(path.split('?', 1)[1] if '?' in path else '')
    ticket = (query.get('ticket') or [''])[0]
    # Kanalwahl: ?chan=audio -> Pulse-PCM-Abgriff der VM (s16le, Ton),
    # sonst VNC/RFB (Bild). Gleiche Ticket-Auth, gleiche Byte-Bruecke —
    # nur ein anderer Ziel-Port im Gast. Der Browser holt sich pro Kanal
    # ein eigenes Einmal-Ticket (Tickets sterben beim ersten Gebrauch).
    chan = 'audio' if (query.get('chan') or [''])[0] == 'audio' else 'vnc'
    guest_port = GUEST_AUDIO_PORT if chan == 'audio' else GUEST_VNC_PORT

    if not await consume_ticket(ticket):
        log.info('Ungueltiges/abgelaufenes Ticket von %s', ip)
        await ws.close(code=4401, reason='invalid or expired ticket')
        return

    async with _sessions_lock:
        if _active_sessions >= MAX_SESSIONS:
            await ws.close(code=4503, reason='busy')
            return
        _active_sessions += 1

    log.info('Ticket eingeloest von %s — verbinde zu Gast-Kanal %s (%d/%d Sessions)',
              ip, chan, _active_sessions, MAX_SESSIONS)

    reader = writer = None
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(GUEST_HOST, guest_port), timeout=CONNECT_TIMEOUT)
    except (OSError, asyncio.TimeoutError) as e:
        log.error('Gast-Kanal %s (%s:%d) nicht erreichbar: %s', chan, GUEST_HOST, guest_port, e)
        async with _sessions_lock:
            _active_sessions -= 1
        await ws.close(code=1011, reason='guest channel unreachable')
        return

    state = {'last_active': time.monotonic()}

    async def tcp_to_ws():
        try:
            while True:
                data = await reader.read(65536)
                if not data:
                    return
                state['last_active'] = time.monotonic()
                await ws.send(data)
        except (OSError, websockets.ConnectionClosed):
            pass

    async def ws_to_tcp():
        try:
            async for msg in ws:
                # Reines Binaerprotokoll (RFB) — Textframes duerften bei
                # unveraendertem noVNC-Client nie vorkommen, defensiv
                # trotzdem nicht abstuerzen, nur ignorieren.
                if isinstance(msg, str):
                    continue
                state['last_active'] = time.monotonic()
                writer.write(msg)
                await writer.drain()
        except (OSError, websockets.ConnectionClosed):
            pass

    async def idle_watchdog():
        while True:
            await asyncio.sleep(30)
            if time.monotonic() - state['last_active'] > IDLE_TIMEOUT:
                return

    tasks = [asyncio.create_task(tcp_to_ws()),
             asyncio.create_task(ws_to_tcp()),
             asyncio.create_task(idle_watchdog())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for t in tasks:
            t.cancel()
        try:
            writer.close()
            await writer.wait_closed()
        except (OSError, ConnectionError):
            pass
        try:
            await ws.close()
        except Exception:
            pass
        async with _sessions_lock:
            _active_sessions -= 1
        log.info('Sitzung beendet (%s)', ip)


async def main() -> None:
    log.info('displaygate: WS auf 0.0.0.0:%d, Ticket-Auth auf 0.0.0.0:%d '
              '(Gast-Ziele: VNC %s:%d, Audio %s:%d, max %d gleichzeitige Sessions)',
              WS_PORT, HTTP_PORT, GUEST_HOST, GUEST_VNC_PORT,
              GUEST_HOST, GUEST_AUDIO_PORT, MAX_SESSIONS)
    http_server = await asyncio.start_server(handle_http, '0.0.0.0', HTTP_PORT)
    async with http_server, websockets.serve(handle_ws, '0.0.0.0', WS_PORT, max_size=None):
        await asyncio.Future()


if __name__ == '__main__':
    asyncio.run(main())
