# Wird bei jeder interaktiven Login-Shell (bash -l) einmal ausgefuehrt und
# erinnert an den Privacy-Modus dieser VM. Nur Anzeige, setzt sonst nichts.
if [ -n "${PS1:-}" ] && [ -z "${GLAPPA_HINT_SHOWN:-}" ]; then
    export GLAPPA_HINT_SHOWN=1
    printf '\033[1;32m[privacy]\033[0m Ausgang nur ueber Tor · DNS verschluesselt (dnscrypt) · Websuche: \033[1msuch <begriff>\033[0m (eigene SearXNG)\n'
    printf '\033[1;36m[gui]\033[0m Grafische Programme (\033[1mlibrewolf &\033[0m, \033[1mxeyes &\033[0m, …) holen den VM-Desktop automatisch als Fenster auf die Seite — Knopf \033[1m"Desktop"\033[0m geht weiterhin\n'
fi
