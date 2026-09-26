"""Protokolltest fuer mpgate: startet den Server im selben Prozess (Port 8779) und spielt Clients durch.

Aufruf:  python _docker/mpgate/test_protokoll.py   (braucht websockets >= 13)
Nach jeder Aenderung an server.py laufen lassen - am Ende muss "N/N bestanden" stehen.
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server  # noqa: E402
from websockets.asyncio.client import connect  # noqa: E402

server.PORT = 8779
URL = 'ws://127.0.0.1:8779/'
ORIGIN = 'http://localhost:8098'
ok = []


def check(name, cond):
    ok.append(bool(cond))
    print(('OK   ' if cond else 'FEHL ') + name)


async def recv(ws, t=2):
    return json.loads(await asyncio.wait_for(ws.recv(), t))


async def main():
    srv = asyncio.create_task(server.main())
    await asyncio.sleep(0.4)

    # 1) fremde Herkunft wird abgewiesen
    try:
        async with connect(URL, origin='https://boese.example') as ws:
            await ws.send('{}')
            await recv(ws)
        check('fremde Origin abgewiesen', False)
    except Exception:
        check('fremde Origin abgewiesen', True)

    # 2) A erstellt Raum mit 2 Sternen
    a = await connect(URL, origin=ORIGIN)
    await a.send(json.dumps({'t': 'join', 'room': 'NEW', 'name': 'Anna<script>', 'cat': 'kappi', 'stars': ['tower', 'bad id!', 'dustA']}))
    w = await recv(a)
    code = w.get('room')
    check('Raum erstellt, Code 5 Zeichen', w['t'] == 'welcome' and len(code) == 5)
    check('ungueltige Stern-ID verworfen', w['stars'] == ['dustA', 'tower'])

    # 3) B tritt mit anderem Stern bei
    b = await connect(URL, origin=ORIGIN)
    await b.send(json.dumps({'t': 'join', 'room': code.lower(), 'name': 'Ben', 'cat': 'astro', 'stars': ['pilz']}))
    wb = await recv(b)
    check('B bekommt Vereinigung der Sterne', wb['stars'] == ['dustA', 'pilz', 'tower'])
    check('B sieht A mit bereinigtem Namen', wb['players'] and wb['players'][0]['name'] == 'Annascript')
    j = await recv(a)
    s = await recv(a)
    check('A erfaehrt von B', j == {'t': 'join', 'id': wb['id'], 'name': 'Ben', 'cat': 'astro'})
    check('A bekommt Bs neuen Stern', s == {'t': 'stars', 'ids': ['pilz'], 'by': 'Ben'})

    # 4) Pose weiterreichen, kaputte Pose verwerfen
    await a.send(json.dumps({'t': 'st', 'lv': 'garden', 'c': 'kappi', 'p': [1.5, 0, 40, 3.14]}))
    st = await recv(b)
    check('Pose kommt bei B an', st == {'t': 'st', 'id': w['id'], 'lv': 'garden', 'c': 'kappi', 'p': [1.5, 0, 40, 3.14]})
    await a.send(json.dumps({'t': 'st', 'lv': 'garden', 'c': 'kappi', 'p': [True, 1e9]}))
    try:
        await recv(b, 0.4)
        check('kaputte Pose verworfen', False)
    except asyncio.TimeoutError:
        check('kaputte Pose verworfen', True)

    # 5) Stern holen: nur neue werden verteilt
    await b.send(json.dumps({'t': 'star', 'id': 'hof'}))
    check('neuer Stern an A', await recv(a) == {'t': 'stars', 'ids': ['hof'], 'by': 'Ben'})
    await b.send(json.dumps({'t': 'star', 'id': 'hof'}))
    try:
        await recv(a, 0.4)
        check('doppelter Stern nicht nochmal', False)
    except asyncio.TimeoutError:
        check('doppelter Stern nicht nochmal', True)

    # 6) Drossel: 200 Nachrichten auf einmal -> nur ~RATE kommen durch
    for i in range(200):
        await a.send(json.dumps({'t': 'st', 'lv': 'garden', 'c': 'kappi', 'p': [i]}))
    n = 0
    try:
        while True:
            await recv(b, 0.4)
            n += 1
    except asyncio.TimeoutError:
        pass
    check(f'Drossel greift ({n} von 200 durch)', 30 <= n <= 60)

    # 7) Unbekannter Raum, voller Raum
    c = await connect(URL, origin=ORIGIN)
    await c.send(json.dumps({'t': 'join', 'room': 'ZZZZZ', 'name': 'X', 'cat': 'astro'}))
    check('unbekannter Raum -> Fehler', (await recv(c))['t'] == 'error')
    await c.close()

    # 8) B geht -> A bekommt leave; Raum bleibt fuer Wiederverbinden
    await b.close()
    lv = await recv(a)
    check('A bekommt leave', lv == {'t': 'leave', 'id': wb['id']})
    await a.close()
    await asyncio.sleep(0.2)
    check('leerer Raum bleibt vorerst bestehen', code in server.rooms and not server.rooms[code].players)

    # 9) Server-Neustart simulieren: Raum weg. rejoin belebt ihn wieder, Handeingabe nicht
    server.rooms.clear()
    d = await connect(URL, origin=ORIGIN)
    await d.send(json.dumps({'t': 'join', 'room': code, 'name': 'Anna', 'cat': 'kappi', 'stars': ['tower']}))
    check('unbekannter Code ohne rejoin -> Fehler', (await recv(d))['t'] == 'error')
    await d.close()
    e = await connect(URL, origin=ORIGIN)
    await e.send(json.dumps({'t': 'join', 'room': code, 'rejoin': True, 'name': 'Anna', 'cat': 'kappi', 'stars': ['tower']}))
    we = await recv(e)
    check('rejoin belebt Raum mit altem Code wieder', we['t'] == 'welcome' and we['room'] == code and we['stars'] == ['tower'])
    await e.close()

    srv.cancel()
    print(f'\n{sum(ok)}/{len(ok)} bestanden')


asyncio.run(main())
