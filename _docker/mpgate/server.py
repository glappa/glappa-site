"""mpgate - Raumserver fuer den Mehrspieler von SUPER GLAPPA 64 (secret/glappa64.html).

Reiner Verteiler: jeder Client rechnet seine Physik selbst und schickt ~15x pro Sekunde
seine fertige Pose. Der Server reicht sie an die anderen im selben Raum weiter und haelt
die gemeinsam geholten Sterne (Vereinigung aller Mitglieder = gemeinsamer Fortschritt).

Raeume: 5-stelliger Code, hoechstens 8 Spieler, leben nur im Speicher. Ein leerer Raum
bleibt ROOM_TTL Sekunden bestehen (Wiederverbinden nach Wackelleitung), dann ist er weg.

Datenschutz: KEINE IP-Adressen, Namen oder Inhalte im Log (Apache loggt /api/mp/ ebenfalls
nicht, siehe apache/home.glappa.de.conf). websockets-Verbindungsmeldungen sind stumm.

Betrieb:
  VPS    eigener Container, nur 127.0.0.1:8768 (docker-compose.vps.yml), von aussen
         ausschliesslich ueber Apache: wss://home.glappa.de/api/mp/ws
  lokal  python _docker/mpgate/server.py   -> das Spiel auf localhost verbindet sich
         direkt mit ws://localhost:8768/

Protokoll (JSON, Client -> Server):
  {t:'join', room:'NEW'|CODE, name, cat, stars:[ids], rejoin?}   erste Nachricht, sonst Schluss
                                                          (rejoin = automatisch nach Abbruch)
  {t:'st', lv:level, c:cat, p:[zahlen]}                   Pose (siehe POSE_KEYS in glappa64.js)
  {t:'star', id}                                          Stern geholt
Server -> Client:
  {t:'welcome', id, room, stars, players:[{id,name,cat,st}]}, {t:'join', id, name, cat},
  {t:'leave', id}, {t:'st', id, lv, c, p}, {t:'stars', ids, by}, {t:'error', msg}
"""

import asyncio
import json
import logging
import math
import os
import re
import secrets
import time

from websockets.asyncio.server import broadcast, serve
from websockets.exceptions import ConnectionClosed

PORT = int(os.environ.get('MP_PORT', '8768'))
HOST = os.environ.get('MP_HOST', '0.0.0.0')     # im Container; nach aussen bindet Compose nur an 127.0.0.1
ORIGINS = [o.strip() for o in os.environ.get(
    'MP_ORIGINS',
    'https://home.glappa.de,https://glappa.de,https://www.glappa.de,http://localhost:8098,http://127.0.0.1:8098',
).split(',') if o.strip()]

MAX_PLAYERS = 8
MAX_ROOMS = 200
MAX_MSG = 2048          # Bytes je Nachricht (eine Pose sind ~250)
MAX_STARS = 200
MAX_POSE = 40           # Zahlen je Pose
RATE = 40               # Nachrichten pro Sekunde je Verbindung; darueber wird verworfen
JOIN_TIMEOUT = 10       # Sekunden bis zur join-Nachricht
ROOM_TTL = 15 * 60      # leerer Raum lebt so lange weiter

CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'    # ohne 0/O und 1/I - am Telefon diktierbar
CODE_RE = re.compile(r'^[A-HJ-NP-Z2-9]{5}$')
STAR_RE = re.compile(r'^[A-Za-z0-9_-]{1,32}$')
CAT_RE = re.compile(r'^[a-z]{1,12}$')
LEVEL_RE = re.compile(r'^[a-z0-9_]{1,24}$')
NAME_BAD = re.compile(r'[^\w äöüÄÖÜß.\-]')

rooms = {}


class Player:
    def __init__(self, ws, pid, name, cat):
        self.ws, self.id, self.name, self.cat = ws, pid, name, cat
        self.st = None                                  # letzte Pose, fuer spaeter Beitretende
        self.bucket, self.bucket_t = float(RATE), time.monotonic()

    def allow(self):
        """Eimer-Drossel: RATE Nachrichten pro Sekunde, kurze Spitzen erlaubt."""
        now = time.monotonic()
        self.bucket = min(RATE, self.bucket + (now - self.bucket_t) * RATE)
        self.bucket_t = now
        if self.bucket < 1:
            return False
        self.bucket -= 1
        return True


class Room:
    def __init__(self, code):
        self.code, self.players, self.stars = code, {}, set()
        self.next_id, self.empty_since = 1, time.monotonic()   # gilt als leer, bis jemand wirklich drin ist

    def others(self, me):
        return [p.ws for p in self.players.values() if p is not me]


def new_code():
    for _ in range(50):
        c = ''.join(secrets.choice(CODE_CHARS) for _ in range(5))
        if c not in rooms:
            return c
    return None


def clean_name(n):
    n = NAME_BAD.sub('', str(n or ''))[:16].strip()
    return n or 'Gast'


def clean_stars(ids):
    if not isinstance(ids, list):
        return set()
    return {s for s in ids[:MAX_STARS] if isinstance(s, str) and STAR_RE.match(s)}


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and abs(v) < 1e5


def clean_state(m):
    lv, c, p = m.get('lv'), m.get('c'), m.get('p')
    if not (isinstance(lv, str) and LEVEL_RE.match(lv)):
        return None
    if not (isinstance(c, str) and CAT_RE.match(c)):
        return None
    if not (isinstance(p, list) and 0 < len(p) <= MAX_POSE and all(is_num(v) for v in p)):
        return None
    return {'lv': lv, 'c': c, 'p': p}


def dumps(msg):
    return json.dumps(msg, separators=(',', ':'), ensure_ascii=False)


async def send(ws, msg):
    try:
        await ws.send(dumps(msg))
    except ConnectionClosed:
        pass


async def handler(ws):
    room = player = None
    try:
        try:
            raw = await asyncio.wait_for(ws.recv(), JOIN_TIMEOUT)
        except asyncio.TimeoutError:
            return
        m = json.loads(raw) if isinstance(raw, str) else None
        if not isinstance(m, dict) or m.get('t') != 'join':
            return
        code = str(m.get('room', '')).upper().strip()
        if code == 'NEW':
            if len(rooms) >= MAX_ROOMS or not (code := new_code()):
                await send(ws, {'t': 'error', 'msg': 'Server ist gerade voll - bitte gleich nochmal.'})
                return
            rooms[code] = Room(code)
        elif code not in rooms:
            # Automatisches Wiederverbinden nach einem Server-Neustart (Deploy): Raum mit demselben Code
            # wiederbeleben - die Sterne kommen mit den join-Nachrichten der Spieler zurueck. Von Hand
            # eingetippte, unbekannte Codes bleiben ein Fehler (sonst entstuende bei jedem Tippfehler ein Raum).
            if m.get('rejoin') is True and CODE_RE.match(code) and len(rooms) < MAX_ROOMS:
                rooms[code] = Room(code)
            else:
                await send(ws, {'t': 'error', 'msg': 'Diesen Raum gibt es nicht (mehr).'})
                return
        room = rooms[code]
        if len(room.players) >= MAX_PLAYERS:
            await send(ws, {'t': 'error', 'msg': f'Raum ist voll ({MAX_PLAYERS} Spieler).'})
            room = None
            return
        cat = m.get('cat')
        player = Player(ws, room.next_id, clean_name(m.get('name')), cat if isinstance(cat, str) and CAT_RE.match(cat) else 'astro')
        room.next_id += 1
        mine = clean_stars(m.get('stars'))
        fresh = sorted(mine - room.stars)
        room.stars |= set(sorted(mine)[:max(0, MAX_STARS - len(room.stars))])
        await send(ws, {'t': 'welcome', 'id': player.id, 'room': code, 'stars': sorted(room.stars),
                        'players': [{'id': p.id, 'name': p.name, 'cat': p.cat, 'st': p.st} for p in room.players.values()]})
        room.players[player.id] = player
        room.empty_since = None
        broadcast(room.others(player), dumps({'t': 'join', 'id': player.id, 'name': player.name, 'cat': player.cat}))
        if fresh:
            broadcast(room.others(player), dumps({'t': 'stars', 'ids': fresh, 'by': player.name}))

        async for raw in ws:
            if not isinstance(raw, str) or not player.allow():
                continue
            try:
                m = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(m, dict):
                continue
            t = m.get('t')
            if t == 'st':
                st = clean_state(m)
                if st:
                    player.st = st
                    player.cat = st['c']
                    broadcast(room.others(player), dumps({'t': 'st', 'id': player.id, **st}))
            elif t == 'star':
                s = m.get('id')
                if isinstance(s, str) and STAR_RE.match(s) and s not in room.stars and len(room.stars) < MAX_STARS:
                    room.stars.add(s)
                    broadcast(room.others(player), dumps({'t': 'stars', 'ids': [s], 'by': player.name}))
    except (ConnectionClosed, ValueError):
        pass
    finally:
        if room is not None and player is not None and room.players.get(player.id) is player:
            del room.players[player.id]
            broadcast(room.others(None), dumps({'t': 'leave', 'id': player.id}))
            if not room.players:
                room.empty_since = time.monotonic()


async def janitor():
    """Leere Raeume nach ROOM_TTL wegraeumen."""
    while True:
        await asyncio.sleep(60)
        now = time.monotonic()
        for code, r in list(rooms.items()):
            if not r.players and r.empty_since is not None and now - r.empty_since > ROOM_TTL:
                rooms.pop(code, None)


async def main():
    quiet = logging.getLogger('mpgate.ws')
    quiet.setLevel(logging.CRITICAL)                    # keine Verbindungs-/Handshake-Meldungen (IPs, Bot-Laerm)
    asyncio.get_running_loop().create_task(janitor())
    async with serve(handler, HOST, PORT, origins=ORIGINS, max_size=MAX_MSG, logger=quiet,
                     ping_interval=20, ping_timeout=20):
        print(f'mpgate hoert auf {HOST}:{PORT}', flush=True)
        await asyncio.get_running_loop().create_future()


if __name__ == '__main__':
    logging.basicConfig(level=logging.WARNING)
    asyncio.run(main())
