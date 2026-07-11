# shell-egress — Anti-Tracking-Ausgang fuer die Gast-Shell

Der Gast-Container der Browser-Shell (`terminal-boot` → `shell.html` →
shellgate → `glappa-shellvm`) darf **nicht mehr direkt ins Internet**. Er
haengt nur noch an einem internen Docker-Netz und erreicht als einzigen
Ausgang diesen Proxy-Container.

```
 Browser (xterm.js)
     │  WebSocket
     ▼
 shellgate ──docker.sock──▶ Gast  (glappa-shell-lan, internal=True, KEIN Internet)
                             │ http(s)_proxy=<Proxy-IP>:8118
                             │ dns=<Proxy-IP>:53
                             │   (IP wird von shellgate zur Laufzeit
                             │    ausgelesen, kein fester Wert)
                             ▼
                       shell-egress
                          ├─ privoxy :8118 ─┐
                          ├─ tor    :9050 ◀─┘  forward-socks5t (remote DNS)
                          └─ dnscrypt :53 ── DoH ── No-Log-Resolver
                             │  (glappa-shell-wan = Bridge mit Internet)
                             ▼
                          Internet  (Tor-Exit / DoH / direkt nur *.glappa.de)
```

## Was das bewirkt

- **Web/HTTPS** (`curl`, `wget`, `apt`, `pip`, …) laeuft ueber `http_proxy`
  → privoxy → **Tor**. Ziel-IP ist ein Tor-Exit, nicht die VPS-IP; DNS wird
  am Exit aufgeloest (kein DNS-Leak).
- **Suche** nur ueber deine eigene, tracking-freie SearXNG: der Befehl
  `such <begriff>` im Gast fragt `search.glappa.de` (JSON) ab. `*.glappa.de`
  geht per privoxy-Regel **direkt** (nicht ueber Tor) → schnell.
- **DNS** aller Tools, die selbst aufloesen, laeuft verschluesselt (DoH,
  No-Log) statt im Klartext zum ISP.
- **Fail-closed:** faellt der Proxy aus, kommt der Gast schlicht nicht mehr
  raus. Es leakt nichts.
- **Kein `NET_ADMIN`** im Gast noetig — die Sperre sitzt in der Netz-
  Topologie (internes Netz ohne Gateway), nicht in Firewall-Regeln im Gast.

## Deploy (auf der VPS)

`restart.sh --vps` baut das Image `glappa-shell-egress:latest` automatisch
(`build_shell_egress_image`) und shellgate erzeugt Netze + Proxy zur Laufzeit.
Manuell:

```bash
docker build -t glappa-shell-egress:latest _docker/shell-egress
docker rm -f glappa-shell-persistent   # einmalig: alten Gast auf Privacy-Modus umstellen
```

Der Gast wird beim naechsten Sitzungsstart **einmalig neu angelegt** (die
alte Uebungs-Kiste ohne Egress-Bindung wird verworfen — installierte Pakete
darin gehen dabei verloren, das ist der Umstieg).

## Verifizieren (in der Browser-Shell)

```bash
curl -s https://check.torproject.org/api/ip     # {"IsTor":true,...} erwartet
curl -s https://api.ipify.org ; echo            # zeigt eine Tor-Exit-IP, NICHT die VPS-IP
such wetter berlin                              # Treffer aus der eigenen SearXNG
```

## Rueckbau

In `_docker/shellgate/server.py` zeigt `spawn_guest_container()` wieder auf
ein normales Bridge-Netz (kein `internal`, kein `dns`/`http_proxy`), dann
`docker rm -f glappa-shell-persistent glappa-shell-egress`. Details im Header
von server.py.
