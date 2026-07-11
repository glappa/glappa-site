#!/usr/bin/env bash
# Wrapper um den echten librewolf-Binary (Pfad wurde beim Image-Build in
# /etc/librewolf-real-bin-path verifiziert, siehe Dockerfile). Liegt unter
# /usr/local/bin/librewolf — VOR /usr/bin in $PATH, wird also gefunden,
# bevor apt's eigener Symlink zum Zug kommt.
#
# Schreibt bei JEDEM Start eine frische Proxy-Policy aus $http_proxy (von
# shellgate gesetzt) — die VM hat KEINEN direkten Internet-Zugang (siehe
# _docker/shell-egress/), ohne diese Policy wuerde der Browser einfach
# nirgends hinkommen. Kein hart codierter Proxy-Wert hier: bleibt auch
# dann korrekt, wenn shellgate die Proxy-Adresse mal aendert (die IP wird
# dort zur Laufzeit von Docker vergeben, nicht fest codiert).
set -euo pipefail

PROXY_URL="${http_proxy:-${HTTP_PROXY:-}}"
if [ -z "$PROXY_URL" ]; then
    echo "librewolf: kein http_proxy gesetzt — diese VM hat keinen direkten" >&2
    echo "Internet-Zugang, ohne Egress-Proxy-Adresse startet der Browser nicht." >&2
    exit 1
fi

# "http://172.19.0.2:8118" -> Host=172.19.0.2 Port=8118 (Beispiel — die
# tatsaechliche IP vergibt Docker dynamisch, s.o.)
HOSTPORT="${PROXY_URL#*://}"
HOSTPORT="${HOSTPORT%%/*}"
export GLAPPA_PROXY_HOST="${HOSTPORT%%:*}"
export GLAPPA_PROXY_PORT="${HOSTPORT##*:}"

POLICY_DIR="$HOME/.librewolf-policy"
mkdir -p "$POLICY_DIR"
envsubst '${GLAPPA_PROXY_HOST} ${GLAPPA_PROXY_PORT}' \
    < /etc/librewolf/policies/policies.json.template \
    > "$POLICY_DIR/policies.json"

# LibreWolf liest System-Policies aus /etc/librewolf/policies/policies.json —
# "fallen" hat dort kein Schreibrecht (root-Verzeichnis), darum via sudo
# (passwortlos, siehe useradd-Block) aus dem eigenen, frisch geschriebenen
# Profil-Verzeichnis dorthin kopieren.
sudo cp "$POLICY_DIR/policies.json" /etc/librewolf/policies/policies.json

REAL_BIN="$(cat /etc/librewolf-real-bin-path)"
exec "$REAL_BIN" "$@"
