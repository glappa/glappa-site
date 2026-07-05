# 🖥️ HACKER TERMINAL - GLAPPA

Retro Terminal Simulator with Matrix Rain Effects

## Features

### 🎯 Three Modes

1. **Console Mode** (default)
   - Interactive command-line interface
   - Command history with ↑/↓ arrows
   - Tab autocomplete for commands
   - Scrollable output history

2. **Matrix Rain Mode** ⛈️
   - Classic falling Katakana characters
   - Multiple colors cycling through rain
   - 400px canvas overlay
   - Perfect Matrix aesthetic!

3. **Hacked Mode** 🔓
   - Simulated system compromise screen
   - Green text on black background
   - Glitch effects coming soon!

## Commands

| Command | Description |
|---------|-------------|
| `help` | List all available commands |
| `clear` | Clear console output |
| `date` | Show current date/time |
| `whoami` | Return user info |
| `pwd` | Print working directory |
| `ls` | List files in directory |
| `cat [file]` | Show file contents |
| `echo [text]` | Print text to console |
| `hostname` | Show hostname |
| `uptime` | System uptime |
| `load average` | Load averages |
| `neofetch` | Retro system info display |
| `glappa-chat [frage]` | Mit der Glappa-KI (LLM auf der VPS) chatten |

## 🤖 GLAPPA-CHAT (LLM-Chatbot)

`glappa-chat` öffnet einen Chat-Modus mit GLAPPA-BOT — einem kleinen LLM, das
auf der VPS läuft. `glappa-chat <frage>` stellt eine Einzelfrage ohne den
Modus zu betreten. Im Chat-Modus beendet `exit` (oder `quit`/`bye`) den Chat.

**Architektur:**

```
terminal.html ──POST /api/chat──> Apache (home.glappa.de:443)
                                    └──> Flask app.py /chat (:8080)
                                           └──> Ollama (Container glappa-ollama, intern :11434)
```

- Modell: `qwen2.5:14b` (Default, ~9 GB RAM, CPU-Inferenz). Änderbar via
  `GLAPPA_CHAT_MODEL` in `_docker/docker-compose.vps.yml` (knappere VPS:
  `qwen2.5:7b` ~5 GB, oder `qwen2.5:1.5b` ~2 GB).
- Persona/Limits (Rate-Limit 10 Nachrichten/Minute pro IP, max. 500 Zeichen)
  stecken in `home/app.py`.
- Der System-Prompt wird pro Request gebaut und enthält Datum/Uhrzeit
  (Europe/Berlin). Datumsfragen („welcher Wochentag ist in 11 Tagen?",
  „morgen", „am 15.07.?") erkennt der Server per Regex und rechnet die
  Antwort selbst aus — das Mini-Modell muss sie nur noch im Glappa-Ton
  formulieren, statt (falsch) zu rechnen.
- Deploy: `bash _docker/setup-home-apache.sh` auf der VPS — baut die Container
  (inkl. `glappa-ollama`), zieht das Modell und lädt den neuen Apache-vhost
  mit dem `/api/chat`-Proxy. Beim ersten Lauf einmalig
  `sudo a2ensite home.glappa.de && sudo systemctl reload apache2` falls der
  vhost neu installiert wurde (macht das Skript selbst).
- Von glappa.de (Webhoster) aus geht der Chat cross-origin auf
  `https://home.glappa.de/api/chat` (CORS-Allowlist in app.py).

## Special Features

✨ **Cursor Glitter** - Sparkle trail follows your mouse  
📜 **Marquee Messages** - Random retro phrases scroll above  
🎨 **Retro Styling** - Neon green/pink/yellow/cyan glow effects  
⌨️ **Keyboard Shortcuts**:
  - `↑` / `↓` - Command history navigation
  - `Tab` - Autocomplete commands

## Tech Stack

- Vanilla JavaScript (ES6+)
- Canvas API for Matrix rain
- CSS Grid/Flexbox layout
- No frameworks, pure retro!

## File Structure

```
glappa-site/
├── terminal.html          # Terminal page (new!)
├── index.html             # Updated with Terminal link
├── style.css              # Shared styles
└── script.js              # Shared JS effects
```

## Deployment

Upload `terminal.html` to your web server via FTP along with all shared assets. No backend required - runs entirely in browser! 🚀

## Credits

Made with ❤️ for Glappa.de  
Retro aesthetics inspired by:
- Matrix (1999)
- Neo-terminal (Windows 95/98)
- Classic GeoCities web design
