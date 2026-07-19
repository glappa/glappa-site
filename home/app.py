from flask import Flask, Response, request, send_file, jsonify, send_from_directory
from werkzeug.exceptions import HTTPException
import os, re, ssl, sys, json, uuid, threading, queue, time, glob

# Repo-Wurzel (glappa-site/) — eine Ebene ueber home/. Von hier serviert die
# App ihre eigenen Assets (img, coursor) same-origin, damit der Downloader nicht
# auf die separate Domain glappa.de angewiesen ist (die diese Dateien u.U. gar
# nicht ausliefert -> fehlender Hintergrund / kaputte Bilder).
SITE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# yt-dlp uebernimmt Metadaten + Download + (per ffmpeg) MP3-Konvertierung.
try:
    import yt_dlp
except ImportError:
    yt_dlp = None

# ── SSL (optional; lokal ohne Certs -> Plain HTTP) ────────────────
context = None
try:
    _ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    _ctx.load_cert_chain(
        '/etc/letsencrypt/live/home.glappa.de/cert.pem',
        '/etc/letsencrypt/live/home.glappa.de/privkey.pem'
    )
    context = _ctx
except (FileNotFoundError, ssl.SSLError, OSError):
    context = None  # dev mode

# ── Config ────────────────────────────────────────────────────────
# Production-Pfad mit Fallback auf lokales _downloads-Verzeichnis.
DOWNLOAD_DIR = os.environ.get('DOWNLOAD_DIR', '/home/glappa/Samba/')
try:
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
except (OSError, PermissionError):
    DOWNLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_downloads')
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

Downloader = Flask(__name__)

# job_id → { queue, file_id, filename }
JOBS: dict = {}
JOBS_LOCK = threading.Lock()

# ── Embedded HTML (Glappa Retro Style) ────────────────────────────
# Basis-URL wird per Request bestimmt -> lokal zeigt's auf localhost:8099,
# in Production auf https://glappa.de. Siehe _glappa_base() weiter unten.
INDEX_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>YT.DL &mdash; Glappa</title>
<link rel="icon" href="/img/favicon.ico">
<style>
  /* Web-Font: Comic Neue als Comic-Sans-Ersatz fuer Clients ohne
     "Comic Sans MS" (Android/iOS/Linux) -> Look wie Firefox Desktop. */
  @import url('https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap');
  :root {{
    --neon-green: #00ff00;
    --neon-pink:  #ff00ff;
    --neon-yellow:#ffff00;
    --neon-cyan:  #00ffff;
    --bg-card:    rgba(0,0,0,0.65);
    --border:     #555;
  }}
  *, *::before, *::after {{ box-sizing: border-box; margin:0; padding:0; }}

  html, body {{
    min-height: 100vh;
    background-image: url('/img/gif/background.gif');
    background-repeat: repeat;
    background-attachment: fixed;
    color: #fff;
    font-family: "Comic Sans MS", "Comic Sans", "Comic Neue", cursive, sans-serif;
    cursor: url('/coursor/WoW%20Cursor.cur'), auto;
    overflow-x: hidden;
  }}
  a {{ color: var(--neon-cyan); }}
  a:visited {{ color: var(--neon-yellow); }}

  /* ---------- Marquees (scrollen, Inhalt zufaellig per JS) ---------- */
  .marquee {{
    width: 100%;
    overflow: hidden;
    background: var(--neon-pink);
    white-space: nowrap;
    padding: 4px 0;
  }}
  .marquee span {{
    display: inline-block;
    padding-left: 100%;
    font-weight: bold;
    color: #000;
    letter-spacing: 2px;
  }}
  @keyframes scroll-left {{
    0%   {{ transform: translateX(0); }}
    100% {{ transform: translateX(-100%); }}
  }}
  /* Marquees fixiert: oben immer im Kopf, unten immer am Viewport-Rand */
  .marquee--top,
  .marquee--bottom {{
    position: fixed;
    left: 0;
    z-index: 900;
  }}
  .marquee--top    {{ top: 0; }}
  .marquee--bottom {{ bottom: 0; margin: 0; }}
  body {{
    padding-top: 32px;
    padding-bottom: 32px;
  }}

  /* ---------- Header ---------- */
  .header {{
    display: flex; align-items: center; justify-content: center;
    gap: 12px; flex-wrap: wrap; margin-top: 16px;
  }}
  .alien {{ flex: 0 0 auto; }}
  .welcome-img {{ max-width: 60vw; height: auto; }}

  /* ---------- Page-Banner (eigener Header) ---------- */
  .page-banner {{
    display: inline-flex; flex-direction: column;
    align-items: center; text-align: center;
    font-family: "Comic Sans MS", "Comic Sans", "Comic Neue", cursive, sans-serif;
    user-select: none; padding: 4px 14px;
  }}
  .page-banner h2 {{
    margin: 0;
    font-size: clamp(2rem, 8vw, 4rem);
    font-weight: 900; letter-spacing: 4px;
    color: var(--neon-pink);
    text-shadow:
      1px 1px 0 #ff66cc,
      2px 2px 0 #cc00aa,
      3px 3px 0 #990088,
      4px 4px 0 #660055,
      5px 5px 12px rgba(0,0,0,0.8),
      0 0 18px var(--neon-pink);
  }}
  .page-banner pre {{
    font-family: "Courier New", monospace;
    font-size: clamp(0.65rem, 1.4vw, 0.95rem);
    color: var(--neon-cyan);
    text-shadow: 0 0 5px var(--neon-cyan);
    margin: 4px 0 0; line-height: 1.05; white-space: pre;
  }}
  .page-banner.yellow h2 {{
    color: var(--neon-yellow);
    text-shadow:
      1px 1px 0 #ffff66, 2px 2px 0 #cccc00, 3px 3px 0 #999900,
      4px 4px 0 #666600, 5px 5px 12px rgba(0,0,0,0.8),
      0 0 18px var(--neon-yellow);
  }}

  /* ---------- Titel ---------- */
  .title {{
    text-align: center;
    color: var(--neon-green);
    font-size: clamp(1.8rem, 6vw, 3rem);
    margin: 12px 8px 4px;
    text-shadow:
      0 0 6px var(--neon-green),
      0 0 12px var(--neon-green),
      0 0 24px #008800;
  }}
  .title em {{ color: var(--neon-pink); font-style: normal; text-shadow:
      0 0 6px var(--neon-pink), 0 0 12px var(--neon-pink); }}
  .sub {{
    text-align: center; color: var(--neon-cyan);
    font-size: clamp(.85rem, 2vw, 1rem);
    text-shadow: 0 0 6px var(--neon-cyan);
    margin: 0 8px 12px;
  }}

  /* ---------- Navigation ---------- */
  .nav {{
    display: flex; flex-wrap: wrap; justify-content: center;
    gap: 6px 10px; font-size: clamp(1rem, 3vw, 1.4rem);
    margin: 10px 0;
  }}
  .nav a {{ text-decoration: none; padding: 2px 6px; display: inline-block; }}
  .nav a:hover {{ text-shadow: 0 0 8px var(--neon-cyan); }}
  .nav a.current {{
    color: var(--neon-yellow);
    text-shadow: 0 0 8px var(--neon-yellow);
    text-decoration: underline;
  }}
  .nav .sep {{ color: var(--neon-yellow); }}

  /* ---------- Construction Banner ---------- */
  .construction {{
    display: flex; align-items: center; justify-content: center;
    gap: 14px; margin: 14px auto; flex-wrap: wrap; max-width: 1100px;
  }}
  .construction > img {{ max-width: 70%; height: auto; }}
  .construction .rocket {{ width: 50px; height: auto; max-width: 50px; }}
  .rocket--flip {{ transform: scaleX(-1); }}

  /* ---------- Downloader Card ---------- */
  .card {{
    max-width: 620px; width: 100%;
    margin: 24px auto;
    background: var(--bg-card);
    border: 4px ridge var(--neon-pink);
    padding: 24px;
  }}

  .lbl {{
    display: block;
    color: var(--neon-yellow);
    font-weight: bold;
    letter-spacing: 1px;
    text-shadow: 0 0 6px var(--neon-yellow);
    margin: 14px 0 6px;
  }}
  .lbl:first-child {{ margin-top: 0; }}

  /* URL row */
  .url-row {{ display: flex; gap: 8px; flex-wrap: wrap; }}
  .url-row input {{
    flex: 1 1 240px; min-width: 0;
    background: #000;
    border: 2px inset var(--border);
    color: var(--neon-green);
    font-family: "Courier New", monospace;
    font-size: 0.95rem;
    padding: 8px 10px;
    outline: none;
  }}
  .url-row input:focus {{
    border-color: var(--neon-pink);
    box-shadow: 0 0 8px var(--neon-pink);
  }}

  /* Preview */
  #preview {{
    display: none;
    background: rgba(0,0,0,0.7);
    border: 2px dashed var(--neon-cyan);
    padding: 10px;
    margin-top: 10px;
    gap: 12px;
    align-items: center;
    overflow: hidden;
  }}
  #preview.show {{ display: flex; }}
  #preview img {{
    width: 120px; height: 68px; object-fit: cover;
    border: 2px solid #000; flex-shrink: 0;
  }}
  .preview-content {{ flex: 1; min-width: 0; }}
  .preview-title {{
    font-size: 0.95rem; font-weight: bold; line-height: 1.3;
    margin-bottom: 4px;
    word-wrap: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--neon-green);
  }}
  .preview-meta {{ font-size: 0.78rem; color: var(--neon-cyan); }}

  /* Format / Quality toggle buttons */
  .fmt-row {{ display: flex; gap: 8px; }}
  .toggle-btn {{
    flex: 1;
    padding: 8px;
    background: #111;
    border: 3px outset var(--border);
    color: #aaa;
    font-family: "Comic Sans MS", "Comic Neue", cursive, sans-serif;
    font-weight: bold;
    font-size: 0.95rem;
    cursor: pointer;
  }}
  .toggle-btn.on {{
    color: var(--neon-pink);
    border-color: var(--neon-pink);
    text-shadow: 0 0 6px var(--neon-pink);
    background: #222;
  }}
  .toggle-btn:active {{ border-style: inset; }}

  #qualWrap {{ display: none; }}
  #qualWrap.show {{ display: block; }}
  .qual-row {{ display: flex; gap: 8px; flex-wrap: wrap; }}
  .qual-row .toggle-btn {{ flex: 1 1 90px; }}

  /* Download button */
  .dl-btn {{
    width: 100%;
    padding: 14px;
    margin-top: 18px;
    background: #000;
    border: 4px outset var(--neon-green);
    color: var(--neon-green);
    font-family: "Comic Sans MS", "Comic Neue", cursive, sans-serif;
    font-size: 1.4rem;
    font-weight: bold;
    letter-spacing: 2px;
    cursor: pointer;
    text-shadow:
      0 0 6px var(--neon-green),
      0 0 12px var(--neon-green);
  }}
  .dl-btn:hover:not(:disabled) {{
    color: var(--neon-yellow);
    border-color: var(--neon-yellow);
    text-shadow: 0 0 6px var(--neon-yellow), 0 0 12px var(--neon-yellow);
  }}
  .dl-btn:active {{ border-style: inset; }}
  .dl-btn:disabled {{ opacity: 0.4; cursor: not-allowed; }}

  /* Progress */
  #progressBox {{ display: none; margin-top: 18px; }}
  #progressBox.show {{ display: block; }}
  .prog-title {{
    font-size: 0.9rem;
    margin-bottom: 8px;
    color: var(--neon-cyan);
    word-wrap: break-word;
    line-height: 1.3;
  }}
  .track {{
    width: 100%; height: 14px;
    background: #000;
    border: 2px inset var(--border);
    overflow: hidden;
    margin-bottom: 6px;
  }}
  .bar {{
    height: 100%; width: 0%;
    background: var(--neon-pink);
    box-shadow: inset 0 0 6px #fff;
    transition: width 0.35s ease;
  }}
  .bar.done {{ background: var(--neon-green); transition: none; }}
  .prog-meta {{
    display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px;
    font-family: "Courier New", monospace;
    font-size: 0.78rem; color: var(--neon-yellow);
  }}

  /* Status */
  #status {{ margin-top: 12px; font-size: 0.85rem; min-height: 1.1rem; color: #ccc; }}
  #status.err {{ color: var(--neon-pink); text-shadow: 0 0 6px var(--neon-pink); }}
  #status.ok  {{ color: var(--neon-green); text-shadow: 0 0 6px var(--neon-green); }}

  /* ---------- Footer ---------- */
  .footer {{ margin-top: 30px; padding-bottom: 30px; text-align: center; }}
  .footer-actions {{ display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; margin: 10px 0; }}
  .copyright {{ color: #ff0000; font-weight: bold; }}
  .firefox img {{ max-width: 90%; height: auto; }}
  .badges {{ display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px; margin: 14px auto; max-width: 900px; }}
  .badges img {{ height: 31px; width: auto; }}

  /* ---------- Glitzer am Cursor ---------- */
  .sparkle {{
    position: fixed; pointer-events: none; z-index: 9999; user-select: none;
    text-shadow: 0 0 6px currentColor, 0 0 12px currentColor;
    animation: sparkle-fade 0.9s ease-out forwards;
  }}
  @keyframes sparkle-fade {{
    0%   {{ transform: scale(1)   translateY(0)    rotate(0deg);   opacity: 1; }}
    100% {{ transform: scale(0.2) translateY(-30px) rotate(180deg); opacity: 0; }}
  }}

  @media (max-width: 600px) {{
    .construction .rocket {{ width: 38px; max-width: 38px; }}
    .badges img {{ height: 24px; }}
    .card {{ padding: 16px; }}
    .dl-btn {{ font-size: 1.15rem; }}
  }}
</style>
</head>
<body>

  <div class="marquee marquee--top">
    <span>&#9733; YT.DL &#9733; MP3 / MP4 RIPPER &#9733; POWERED BY GLAPPA &#9733; </span>
  </div>

  <header class="header">
    <img class="alien" src="/img/gif/alien-dance.gif" alt="" width="70" height="98">
    <div class="page-banner yellow">
      <h2>YT ▸ RIP ▸ MP3</h2>
<pre>
   .--------------------.
   | [O]  ░ TAPE ░  [O] |
   |  rip them all yo   |
   '--------------------'
</pre>
    </div>
    <img class="alien" src="/img/gif/alien-dance.gif" alt="" width="70" height="98">
  </header>

  <h1 class="title">YT<em>.</em>DL</h1>
  <p class="sub">YouTube &nbsp;&#9733;&nbsp; MP3 / MP4 &nbsp;&#9733;&nbsp;
    <a href="https://home.glappa.de">home.glappa.de</a>
  </p>

  <nav class="nav">
    <a href="{glappa}/index.html">&larr; Glappa</a>
    <span class="sep">|</span>
    <a href="{glappa}/terminal.html">Terminal</a>
    <span class="sep">|</span>
    <a href="{glappa}/page1.html">Video</a>
    <span class="sep">|</span>
    <a href="{glappa}/bounce.html">Bounce</a>
    <span class="sep">|</span>
    <a href="{home}">Home</a>
    <span class="sep">|</span>
    <a href="https://search.glappa.de/" target="_blank" rel="noopener">Search</a>
    <span class="sep">|</span>
    <a href="{glappa}/secret/pilzskip.html">SUPER Secret Page</a>
  </nav>

  <div class="construction">
    <img class="rocket" src="/img/gif/rocket3.gif" alt="" aria-hidden="true">
    <img src="/img/gif/Under_Construction.gif" alt="Under Construction">
    <img class="rocket rocket--flip" src="/img/gif/Rocket.gif" alt="" aria-hidden="true">
  </div>

  <main class="card">
    <span class="lbl">&#9733; YOUTUBE URL &#9733;</span>
    <div class="url-row">
      <input type="url" id="urlInput" placeholder="https://www.youtube.com/watch?v=...   (paste -> auto-preview)">
    </div>

    <div id="preview">
      <img id="thumb" src="" alt="">
      <div class="preview-content">
        <div class="preview-title" id="pTitle"></div>
        <div class="preview-meta"  id="pMeta"></div>
      </div>
    </div>

    <span class="lbl">&#9733; FORMAT &#9733;</span>
    <div class="fmt-row">
      <button class="toggle-btn on" data-fmt="mp3" onclick="setFmt(this)">&#9658; MP3</button>
      <button class="toggle-btn"   data-fmt="mp4" onclick="setFmt(this)">&#9632; MP4</button>
    </div>

    <div id="qualWrap">
      <span class="lbl">&#9733; QUALITY &#9733;</span>
      <div class="qual-row">
        <button class="toggle-btn"    data-q="360p"  onclick="setQ(this)">360p</button>
        <button class="toggle-btn"    data-q="720p"  onclick="setQ(this)">720p</button>
        <button class="toggle-btn on" data-q="1080p" onclick="setQ(this)">1080p</button>
        <button class="toggle-btn"    data-q="best"  onclick="setQ(this)">BEST</button>
      </div>
    </div>

    <button class="dl-btn" id="dlBtn" onclick="startDownload()">&#9733; DOWNLOAD &#9733;</button>

    <div id="progressBox">
      <div class="prog-title" id="progTitle"></div>
      <div class="track"><div class="bar" id="bar"></div></div>
      <div class="prog-meta">
        <span id="pPct">0%</span>
        <span id="pSize">&mdash;</span>
        <span id="pSpeed">&mdash;</span>
        <span id="pEta">&mdash;</span>
      </div>
    </div>

    <div id="status"></div>
    <div id="tunesHint" style="display:none;margin-top:14px;text-align:center">
      <a id="tunesLink" href="#" target="_blank" style="
        display:inline-block;padding:10px 22px;
        background:#000;border:3px outset var(--neon-green);
        color:var(--neon-green);font-size:1.1rem;font-weight:bold;
        text-decoration:none;letter-spacing:1px;
        text-shadow:0 0 6px var(--neon-green),0 0 12px var(--neon-green);">
        &#9836; In Tunes öffnen &rarr;
      </a>
      <div style="font-size:0.78rem;color:#888;margin-top:6px">
        Datei ins Player-Fenster ziehen oder über "Dateien wählen" laden
      </div>
    </div>
  </main>

  <footer class="footer">
    <div class="construction">
      <img class="rocket" src="/img/gif/rocket3.gif" alt="" aria-hidden="true">
      <img src="/img/gif/Under_Construction.gif" alt="Under Construction">
      <img class="rocket rocket--flip" src="/img/gif/Rocket.gif" alt="" aria-hidden="true">
    </div>

    <div class="footer-actions">
      <a href="mailto:lex@glappa.de?subject=Your Website so COOL! ;)">
        <img src="/img/gif/animail1.gif" alt="You Got Mail!" width="88" height="31">
      </a>
      <a href="{glappa}/index.html">
        <img src="/img/gif/anihome1.gif" alt="Home" width="88" height="31">
      </a>
    </div>

    <p class="copyright">Copyright <span id="year"></span>, Glappa</p>

    <div class="firefox">
      <a href="https://www.firefox.com">
        <img src="/img/gif/userlovefirefox7dm4aroh2dt9.gif" alt="GO DOWNLOAD FIREFOX!">
      </a>
    </div>

    <div class="badges">
      <img src="/img/gif/allbrowsers.gif" alt="">
      <img src="/img/gif/blinktastic_spongebob.gif" alt="">
      <img src="/img/gif/browser1.gif" alt="">
      <img src="/img/gif/browsers.gif" alt="">
      <img src="/img/gif/counter3.gif" alt="">
      <img src="/img/gif/external-content.duckduckgo.com.gif" alt="">
      <img src="/img/gif/hacker.gif" alt="">
      <img src="/img/gif/hugsnotdrugs.gif" alt="">
    </div>

    <div class="marquee marquee--bottom">
      <span>&#9733; HAPPY DOWNLOADING &#9733; KEINE GEWAEHR &#9733; ENJOY YOUR JAMS &#9733; </span>
    </div>
  </footer>

<script>
let fmt = 'mp3', quality = '1080p';
let evtSrc = null;

// ── Preview ──────────────────────────────────────────────────────
async function fetchInfo() {{
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return;
  setSt('Fetching info…', '');
  try {{
    const r = await fetch('/info', {{
      method: 'POST',
      headers: {{'Content-Type':'application/json'}},
      body: JSON.stringify({{url}})
    }});
    const d = await r.json();
    if (!r.ok) {{ setSt(d.error || 'Error', 'err'); return; }}
    document.getElementById('thumb').src          = d.thumb;
    document.getElementById('pTitle').textContent = d.title;
    document.getElementById('pMeta').textContent  =
      (d.duration ? fmtDur(d.duration) + ' · ' : '') + (d.channel || '');
    document.getElementById('preview').classList.add('show');
    setSt('', '');
  }} catch(e) {{ setSt('Network error: ' + e.message, 'err'); }}
}}

function fmtDur(s) {{
  const m = Math.floor(s/60), sec = s%60;
  return m + ':' + String(sec).padStart(2,'0');
}}

// ── Toggles ──────────────────────────────────────────────────────
function setFmt(btn) {{
  document.querySelectorAll('[data-fmt]').forEach(b => b.classList.remove('on'));
  btn.classList.add('on'); fmt = btn.dataset.fmt;
  document.getElementById('qualWrap').classList.toggle('show', fmt === 'mp4');
}}
function setQ(btn) {{
  document.querySelectorAll('[data-q]').forEach(b => b.classList.remove('on'));
  btn.classList.add('on'); quality = btn.dataset.q;
}}

// ── Download ─────────────────────────────────────────────────────
async function startDownload() {{
  const url = document.getElementById('urlInput').value.trim();
  if (!url) {{ setSt('Please enter a URL.', 'err'); return; }}

  setSt('', '');
  document.getElementById('dlBtn').disabled = true;
  document.getElementById('bar').classList.remove('done');
  setBar(0,'','','');
  document.getElementById('progTitle').textContent =
    document.getElementById('pTitle').textContent || url;
  document.getElementById('progressBox').classList.add('show');

  let jobId;
  try {{
    const r = await fetch('/start', {{
      method: 'POST',
      headers: {{'Content-Type':'application/json'}},
      body: JSON.stringify({{url, format: fmt, quality}})
    }});
    const d = await r.json();
    if (!r.ok) {{ setSt(d.error || 'Error', 'err'); unlock(); return; }}
    jobId = d.job_id;
  }} catch(e) {{ setSt('Network error: ' + e.message, 'err'); unlock(); return; }}

  if (evtSrc) evtSrc.close();
  evtSrc = new EventSource('/progress/' + jobId);

  evtSrc.addEventListener('progress', e => {{
    const d = JSON.parse(e.data);
    if (d.title) document.getElementById('progTitle').textContent = d.title;
    setBar(d.percent||0, d.total||'', d.speed||'', d.eta||'');
  }});

  evtSrc.addEventListener('done', e => {{
    const d = JSON.parse(e.data);
    evtSrc.close();
    if (d.error) {{ setSt('Error: ' + d.error, 'err'); unlock(); return; }}
    setBar(100, d.total||'', '', '');
    document.getElementById('bar').classList.add('done');
    setSt('✓ Fertig! Download startet…', 'ok');
    const a = document.createElement('a');
    a.href = '/file/' + d.file_id; a.download = d.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    // Tunes-Link anzeigen (nur bei MP3)
    if (fmt === 'mp3') {{
      const hint = document.getElementById('tunesHint');
      document.getElementById('tunesLink').href = '{tunes}';
      hint.style.display = 'block';
    }}
    unlock();
  }});

  evtSrc.onerror = () => {{ evtSrc.close(); setSt('Connection lost.', 'err'); unlock(); }};
}}

function setBar(pct, size, speed, eta) {{
  document.getElementById('bar').style.width     = pct + '%';
  document.getElementById('pPct').textContent    = pct + '%';
  document.getElementById('pSize').textContent   = size  || '—';
  document.getElementById('pSpeed').textContent  = speed || '—';
  document.getElementById('pEta').textContent    = eta   ? 'ETA ' + eta : '—';
}}
function setSt(msg, cls) {{ const e = document.getElementById('status'); e.textContent=msg; e.className=cls; }}
function unlock() {{ document.getElementById('dlBtn').disabled = false; }}

document.addEventListener('DOMContentLoaded', () => {{
  document.getElementById('year').textContent = new Date().getFullYear();
  const inp = document.getElementById('urlInput');
  inp.addEventListener('keydown', e => {{
    if (e.key === 'Enter') fetchInfo();
  }});
  // Auto-Preview, sobald ein Link eingefuegt wird (setTimeout, damit der
  // gepastete Wert bereits im Feld steht, wenn fetchInfo liest).
  inp.addEventListener('paste', () => {{
    setTimeout(fetchInfo, 0);
  }});

  // Random Marquee-Sprueche (dynamic, refresh per cycle)
  (function () {{
    const SAYINGS = [
      '★ WELCOME 2 THE WEB ★','★ AOL KEYWORD: GLAPPA ★','★ BEST VIEWED IN NETSCAPE 4 ★',
      '★ POWERED BY DIAL-UP ★','★ MY OTHER SITE IS A MYSPACE ★','★ Y2K SURVIVAL KIT INSIDE ★',
      '★ HAMSTERDANCE 4EVER ★','★ SIGN MY GUESTBOOK ★','★ DO NOT DEFLECT MAGNETIC TAPE ★',
      '★ UNDER CONSTRUCTION ★','★ BEST VIEWED IN 800x600 ★','★ POWERED BY ANGELFIRE ★',
      '★ THIS PAGE LOADED IN 47 SECONDS ★','★ U R VISITOR #1337 ★',
      '★ ALL UR BASE R BELONG 2 US ★','★ HACK THE PLANET ★','★ MORE COWBELL ★',
      '★ THE CAKE IS A LIE ★','★ I CAN HAS CHEEZBURGER? ★','★ NO STEP ON SNEK ★',
      '★ DRINK YOUR OVALTINE ★','★ POG CHAMP ★','★ THIS IS FINE ★','★ AND I OOP ★',
      '★ SUSSY BAKA ★','★ GIGACHAD APPROVED ★','★ SKIBIDI TOILET ★','★ FANUM TAX ★',
      '★ GREETZ 2 ALL MY HOMIES ★','★ THANX 4 VISITING ★','★ HONK IF U LOVE GIFS ★',
      '★ ARE WE COOL YET ★','★ FIRST RULE: DONT TALK ABOUT GLAPPA ★','★ GLAPPA APPROVED ★',
      '★ TOUCH GRASS LATER ★','★ INSERT COIN 2 CONTINUE ★','★ THIS IS NOT A DRILL ★',
      '★ MADE WITH 100% RECYCLED PIXELS ★','★ GLAPPA: ITS LIT ★',
      '( ͡° ͜ʖ ͡°) RAISE UR DONGERS ( ͡° ͜ʖ ͡°)','ʕ•ᴥ•ʔ KUMA SAYS HI ʕ•ᴥ•ʔ',
      '¯\\\\_(ツ)_/¯ SHRUG IT OFF','(╯°□°)╯︵ ┻━┻ FLIP IT','┬─┬ ノ( ゜-゜ノ) PUT IT BACK',
      '( •_•) ( •_•)>⌐■-■ (⌐■_■) DEAL WITH IT','(づ｡◕‿‿◕｡)づ HUGS FROM GLAPPA',
      '(◕‿◕✿) HAVE A NICE DAY','ಠ_ಠ ARE U STILL THERE','ʘ‿ʘ HIIII',
      '≧◉◡◉≦ KAWAII MODE','( •̀ᴗ•́ )و SUCCESS','٩(◕‿◕)۶ YAYYY',
      '(ㆆ_ㆆ) SUSPICIOUS','(╬ ಠ益ಠ) RAGE QUIT','ᕦ(ò_óˇ)ᕤ STRONK',
      '(҂◡_◡)  ᕤ NO BRAINS','(˵ ͡° ͜ʖ ͡°˵) YOU KNOW','d(⌐□_□)b VIBIN',
      '404: COOLNESS NOT FOUND','HTTP 200 OK / VIBES ACCEPTED',
      'sudo rm -rf /world','CTRL+ALT+CHILL','01001000 01001001 :)',
      'cd / && rm -rf monday','while(coffee--) {{ code(); }}',
      'git push --force --to-prod','CSS IS NOT TURING COMPLETE BUT IT TRIES',
      'THERE ARE 10 TYPES OF PEOPLE','> select cool from glappa;',
      'STACK OVERFLOW: NOT TODAY','127.0.0.1 - HOME SWEET HOME',
      '▀▄▀▄ LOADING... PLEASE WAIT ▄▀▄▀','▓▒░ ENTER THE VOID ░▒▓',
      '[█████████████░░░] 87%','[▓▓▓▓▓░░░░░░░░░░] 33% FUN',
      '╔═══╗ ERROR ╔═══╗','░░░ GLITCH IN THE MATRIX ░░░',
      '▌║█║▌ BUFFER OVERFLOW ▌║█║▌','╳╳╳ FATAL EXCEPTION ╳╳╳',
      '◢◤ DANGER ◢◤ DANGER ◢◤',
      '♫ DANCING IN THE SERVER ROOM ♪','♪ DIAL-UP MODEM NOISES ♪',
      'WARNING: HIGH RADNESS DETECTED','THE INTERNET IS A SERIES OF TUBES',
      'NEW: ANIMATED CURSORS!','GET YOUR FREE IPOD!',
      'YOU HAVE WON $1,000,000','BONZI BUDDY MISSES YOU',
      'PLEASE INSERT FLOPPY DISK #2','ASL? 25/M/INTERNET','BRB MOM CALLING',
      'BANANAS HAVE NO BONES','EVERY CAT IS A LIQUID',
      'COWS ARE SECRETLY VOTING','THE MOON IS A HOLOGRAM',
      'PIGEONS ARE GOVERNMENT DRONES','HOT POCKETS = COLD CENTERS',
      '★ DRINK MORE WATER ★','★ DID U FEED THE CAT ★',
      '★ STRETCH YOUR SHOULDERS ★','★ U R DOING GREAT ★',
    ];
    function pickN(arr, n) {{
      const pool = arr.slice(); const out = [];
      while (out.length < n && pool.length) {{
        out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      }}
      return out;
    }}
    function freshText() {{
      return pickN(SAYINGS, 4).join('   ✦   ') + '   ';
    }}
    document.querySelectorAll('.marquee span').forEach(span => {{
      span.textContent = freshText();
      const dur = 22 + Math.random() * 16;
      span.style.animation = 'scroll-left ' + dur.toFixed(1) + 's linear infinite';
      span.addEventListener('animationiteration', () => {{
        span.textContent = freshText();
      }});
    }});
  }})();

  // Glitzer/Trippy-Trail am Cursor
  const SP_CHARS  = ['✨','⭐','✧','★','✦','✸','·','💫'];
  const SP_COLORS = ['#ff00ff','#00ffff','#00ff00','#ffff00','#ff66cc','#66ffcc','#ff8800'];
  let _spLast = 0;
  window.addEventListener('mousemove', (e) => {{
    const now = Date.now();
    if (now - _spLast < 50) return;
    _spLast = now;
    const s = document.createElement('span');
    s.className = 'sparkle';
    s.textContent = SP_CHARS[Math.floor(Math.random() * SP_CHARS.length)];
    s.style.left = e.clientX + 'px';
    s.style.top  = e.clientY + 'px';
    s.style.color = SP_COLORS[Math.floor(Math.random() * SP_COLORS.length)];
    s.style.fontSize = (10 + Math.random() * 14) + 'px';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }}, {{ passive: true }});
}});
</script>
</body>
</html>"""


# ── Helpers ───────────────────────────────────────────────────────
def safe_title(raw: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', '_', raw).strip()

def sizeof_fmt(b: int) -> str:
    for u in ('B','KB','MB','GB'):
        if abs(b) < 1024: return f'{b:.1f} {u}'
        b /= 1024
    return f'{b:.1f} TB'

def cleanup_later(path: str, delay: int = 900):
    def _rm():
        time.sleep(delay)
        try: os.remove(path)
        except: pass
    threading.Thread(target=_rm, daemon=True).start()


def _yt_cookie_opts() -> dict:
    """
    yt-dlp Cookie-Optionen aus env. Wichtig, weil YouTube ohne Cookies
    immer oefter Bot-Checks triggert ('Sign in to confirm you're not a bot').

    YT_COOKIE_FILE     -> Pfad zu cookies.txt (Netscape-Format). Bevorzugt.
    YT_COOKIE_BROWSER  -> 'firefox' | 'chrome' | 'edge' | 'brave' | 'none'
                          ('none' = ausdruecklich keine Cookies)
    """
    cf = os.environ.get('YT_COOKIE_FILE')
    if cf and os.path.isfile(cf):
        return {'cookiefile': cf}
    cb = os.environ.get('YT_COOKIE_BROWSER', '').strip().lower()
    if cb and cb != 'none':
        return {'cookiesfrombrowser': (cb,)}
    return {}


def _bot_error(msg: str) -> bool:
    m = msg.lower()
    return 'sign in to confirm' in m or "you're not a bot" in m or 'cookies' in m


def _clean_url(url: str) -> str:
    """
    Bei YouTube-URLs wie ?v=ID&list=...&index=... NUR den Video-Param behalten.
    Verhindert dass yt-dlp die ganze Playlist anfasst (was Bot-Checks triggert).
    Lasst andere URLs unveraendert.
    """
    try:
        from urllib.parse import urlparse, parse_qs, urlunparse
        p = urlparse(url)
        if any(d in p.netloc.lower() for d in ('youtube.com', 'youtu.be')) and p.path in ('/watch', '/watch/'):
            v = parse_qs(p.query).get('v', [None])[0]
            if v:
                return urlunparse((p.scheme, p.netloc, '/watch', '', f'v={v}', ''))
    except Exception:
        pass
    return url


def _glappa_base() -> str:
    """
    Basis-URL fuer Assets + Nav-Links, abhaengig vom Request-Host:
      localhost / 127.0.0.1 / 192.168.x / 10.x / 172.x -> http://<host>:8099
      sonst                                            -> https://glappa.de
    So zeigt der Downloader im lokalen Setup auf die lokale Static-Seite,
    in Production aber auf die echte Domain - automatisch, ohne env-Var.
    Override via env GLAPPA_BASE_URL moeglich.
    """
    forced = os.environ.get('GLAPPA_BASE_URL', '').strip()
    if forced:
        return forced.rstrip('/')
    try:
        host = request.host.lower()
    except RuntimeError:
        return 'https://glappa.de'
    bare = host.split(':', 1)[0]
    if (bare in ('localhost', '127.0.0.1')
            or bare.startswith(('192.168.', '10.'))
            or (bare.startswith('172.') and 16 <= int(bare.split('.')[1] or 0) <= 31)):
        return f'http://{bare}:8099'
    return 'https://glappa.de'


def _home_url(glappa_base: str) -> str:
    """
    Die URL der Home-Seite (Heat-Death-Countdown).
    Lokal: liegt auf dem Static-Server unter /home/index.html.
    Production: home.glappa.de ist eine eigene Subdomain.
    """
    if glappa_base.startswith(('http://localhost', 'http://127.', 'http://192.168.', 'http://10.', 'http://172.')):
        return f'{glappa_base}/home/index.html'
    return 'https://home.glappa.de'

def _tunes_url(glappa_base: str) -> str:
    if glappa_base.startswith(('http://localhost', 'http://127.', 'http://192.168.', 'http://10.', 'http://172.')):
        return f'{glappa_base}/home/tunes.html'
    return 'https://home.glappa.de/home/tunes.html'


# ── Routes ────────────────────────────────────────────────────────
@Downloader.route('/')
def index():
    glappa = _glappa_base()
    html = INDEX_HTML_TEMPLATE.format(glappa=glappa, home=_home_url(glappa), tunes=_tunes_url(glappa))
    return html, 200, {'Content-Type': 'text/html; charset=utf-8'}


# ── Same-origin Assets (Bilder, Cursor, Favicon) ──────────────────
# Werden direkt aus der Repo-Wurzel ausgeliefert. send_from_directory
# schuetzt automatisch gegen Path-Traversal. Lange Cache-Zeit, da statisch.
@Downloader.route('/img/<path:subpath>')
def serve_img(subpath):
    return send_from_directory(os.path.join(SITE_ROOT, 'img'), subpath,
                               max_age=86400)

@Downloader.route('/coursor/<path:subpath>')
def serve_coursor(subpath):
    return send_from_directory(os.path.join(SITE_ROOT, 'coursor'), subpath,
                               max_age=86400)

@Downloader.route('/favicon.ico')
def serve_favicon():
    return send_from_directory(SITE_ROOT, 'favicon.ico', max_age=86400)


@Downloader.route('/info', methods=['POST'])
def info():
    if yt_dlp is None:
        return jsonify({'error': 'yt-dlp nicht installiert'}), 503
    url = (request.get_json(force=True).get('url') or '').strip()
    if not url:
        return jsonify({'error': 'No URL'}), 400
    url = _clean_url(url)
    try:
        # noplaylist: zusaetzliche Sicherheit falls die URL die Bereinigung umgeht
        opts = {'quiet': True, 'no_warnings': True, 'noplaylist': True, **_yt_cookie_opts()}
        with yt_dlp.YoutubeDL(opts) as ydl:
            data = ydl.extract_info(url, download=False, process=False)
        return jsonify({
            'title':    data.get('title') or '',
            'thumb':    data.get('thumbnail') or '',
            'duration': data.get('duration') or 0,
            'channel':  data.get('uploader') or data.get('channel') or '',
        })
    except Exception as e:
        msg = str(e)
        if _bot_error(msg):
            return jsonify({'error': 'YouTube Bot-Check. Setze YT_COOKIE_BROWSER=firefox oder YT_COOKIE_FILE=<pfad>.'}), 503
        return jsonify({'error': msg}), 500


@Downloader.route('/start', methods=['POST'])
def start():
    data    = request.get_json(force=True)
    url     = (data.get('url') or '').strip()
    fmt     = data.get('format', 'mp3').lower()
    quality = data.get('quality', '1080p')

    if yt_dlp is None:
        return jsonify({'error': 'yt-dlp nicht installiert'}), 503
    if not url:
        return jsonify({'error': 'No URL provided.'}), 400
    if fmt not in ('mp3', 'mp4'):
        return jsonify({'error': 'Format must be mp3 or mp4.'}), 400
    url = _clean_url(url)

    job_id  = str(uuid.uuid4())
    file_id = str(uuid.uuid4())
    q: queue.Queue = queue.Queue()

    with JOBS_LOCK:
        JOBS[job_id] = {'queue': q, 'file_id': file_id, 'filename': None}

    def run():
        try:
            cookie_opts = _yt_cookie_opts()

            # Erst Metadaten holen, damit wir den Title sofort melden koennen
            with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'noplaylist': True, **cookie_opts}) as _y:
                meta = _y.extract_info(url, download=False, process=False)
            raw_title = meta.get('title') or url
            title     = safe_title(raw_title)
            q.put({'type':'progress','percent':0,'title':raw_title,
                   'total':'','speed':'','eta':''})

            # Progress-Hook -> queue (laeuft im Worker-Thread)
            def hook(d):
                status = d.get('status')
                if status == 'downloading':
                    total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                    down  = d.get('downloaded_bytes') or 0
                    pct   = round(down / total * 100) if total else 0
                    speed = d.get('speed') or 0
                    eta   = d.get('eta')
                    q.put({
                        'type':    'progress',
                        'percent': pct,
                        'total':   sizeof_fmt(total) if total else '',
                        'speed':   (sizeof_fmt(speed) + '/s') if speed else '',
                        'eta':     (f'{int(eta)}s') if eta else '',
                        'title':   '',
                    })
                elif status == 'finished':
                    # Download durch, MP3-Postprocessor laeuft evtl. noch
                    q.put({'type':'progress','percent':100,
                           'total': sizeof_fmt(d.get('total_bytes') or 0),
                           'speed':'','eta':'','title':''})

            outtmpl = os.path.join(DOWNLOAD_DIR, f'{file_id}.%(ext)s')
            opts = {
                'quiet': True, 'no_warnings': True,
                'outtmpl': outtmpl,
                'progress_hooks': [hook],
                'noplaylist': True,
                'restrictfilenames': False,
                **cookie_opts,
            }

            if fmt == 'mp3':
                opts['format'] = 'bestaudio/best'
                opts['postprocessors'] = [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }]
                target_ext = 'mp3'
            else:
                # bv* = best video, ba = best audio. + merged ffmpeg ein mp4.
                # YouTube liefert >720p NUR als getrennte Streams - drum bv*+ba
                # statt 'best' das nur progressive (max ~720p) kennt.
                # Bevorzuge h264/aac falls verfuegbar (no-reencode merge), sonst alles.
                # 360/720/1080: AVC bevorzugen (kein ffmpeg-Reencode noetig)
                # BEST: einfach das absolut beste (4K wenn verfuegbar, auch wenn
                #       AV1/VP9 -> ffmpeg muss evtl. in mp4 reencoden)
                qmap = {
                    '360p':  'bv*[height<=360][vcodec~="avc"]+ba[ext=m4a]/'
                             'bv*[height<=360]+ba/b[height<=360]',
                    '720p':  'bv*[height<=720][vcodec~="avc"]+ba[ext=m4a]/'
                             'bv*[height<=720]+ba/b[height<=720]',
                    '1080p': 'bv*[height<=1080][vcodec~="avc"]+ba[ext=m4a]/'
                             'bv*[height<=1080]+ba/b[height<=1080]/b',
                    'best':  'bv*+ba/b',
                }
                opts['format'] = qmap.get(quality, qmap['1080p'])
                opts['merge_output_format'] = 'mp4'
                target_ext = 'mp4'

            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])

            # Output finden (Extension haengt vom Postprocessor / merge ab)
            out_path = os.path.join(DOWNLOAD_DIR, f'{file_id}.{target_ext}')
            if not os.path.exists(out_path):
                cands = sorted(glob.glob(os.path.join(DOWNLOAD_DIR, f'{file_id}.*')))
                if cands:
                    out_path = cands[0]
                    target_ext = os.path.splitext(out_path)[1].lstrip('.') or target_ext

            filename = f'{title}.{target_ext}'
            cleanup_later(out_path)
            with JOBS_LOCK:
                JOBS[job_id]['filename'] = filename

            size_str = sizeof_fmt(os.path.getsize(out_path))
            q.put({'type':'done','file_id':file_id,'filename':filename,'total':size_str})

        except Exception as e:
            msg = str(e)
            if _bot_error(msg):
                msg = 'YouTube Bot-Check. Setze YT_COOKIE_BROWSER=firefox oder YT_COOKIE_FILE=<pfad>.'
            q.put({'type':'done','error':msg})

    threading.Thread(target=run, daemon=True).start()
    return jsonify({'job_id': job_id})


@Downloader.route('/progress/<job_id>')
def progress(job_id: str):
    if not re.fullmatch(r'[0-9a-f\-]{36}', job_id):
        return 'Invalid ID', 400
    with JOBS_LOCK:
        job = JOBS.get(job_id)
    if not job:
        return 'Job not found', 404

    q = job['queue']

    def stream():
        while True:
            try:
                msg = q.get(timeout=60)
            except queue.Empty:
                yield 'event: ping\ndata: {}\n\n'
                continue
            if msg['type'] == 'progress':
                yield f"event: progress\ndata: {json.dumps(msg)}\n\n"
            elif msg['type'] == 'done':
                yield f"event: done\ndata: {json.dumps(msg)}\n\n"
                break

    return Response(stream(), mimetype='text/event-stream',
                    headers={'Cache-Control':'no-cache','X-Accel-Buffering':'no'})


@Downloader.route('/file/<file_id>')
def serve_file(file_id: str):
    if not re.fullmatch(r'[0-9a-f\-]{36}', file_id):
        return 'Invalid ID', 400

    dl_name = file_id
    with JOBS_LOCK:
        for job in JOBS.values():
            if job.get('file_id') == file_id:
                dl_name = job.get('filename') or file_id
                break

    for ext in ('mp3', 'mp4', 'webm', 'm4a'):
        p = os.path.join(DOWNLOAD_DIR, f'{file_id}.{ext}')
        if os.path.exists(p):
            mime = 'audio/mpeg' if ext == 'mp3' else 'video/mp4'
            return send_file(p, mimetype=mime, as_attachment=True, download_name=dl_name)

    return 'File not found', 404


# ── Visitor Counter ───────────────────────────────────────────────
# Speichert echte unique visits in einer JSON-Datei im Volume.
# Identifikation: long-lived Cookie + IP+UA-Hash als Fallback.
# Bots werden komplett rausgefiltert (UA-basiert) und gar nicht erst gezaehlt.
# Es gibt einen globalen Bucket (_total) und einen pro Seite. Das count-Feld
# in der Response ist der globale -> "wie viele Leute besuchen die Webseite".
COUNTER_FILE = os.path.join(DOWNLOAD_DIR, 'counter.json')
COUNTER_LOCK = threading.Lock()
import hashlib

# Bot-/Crawler-Erkennung per User-Agent. Filtert Suchmaschinen, Uptime-Monitore,
# Preview-Bots, Headless-Browser, generische HTTP-Clients usw.
_BOT_UA_RE = re.compile(
    r'bot\b|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|'
    r'telegram|discordbot|skypeuripreview|linkedinbot|twitterbot|'
    r'pingdom|uptimerobot|gtmetrix|lighthouse|pagespeed|chrome-lighthouse|'
    r'headlesschrome|phantomjs|puppeteer|playwright|selenium|'
    r'monitor|scrape|fetch|wget\b|curl\b|httpclient|python-requests|'
    r'go-http-client|java/|axios|node-fetch|okhttp|libwww',
    re.IGNORECASE
)

def _is_bot():
    ua = request.headers.get('User-Agent', '') or ''
    if len(ua) < 15:
        return True  # leerer oder absurd kurzer UA = kein echter Browser
    if _BOT_UA_RE.search(ua):
        return True
    # Echte Browser senden Sec-Fetch-Site bei XHR/fetch. Fehlt das komplett UND
    # der UA ist nicht klar als Browser identifizierbar -> wahrscheinlich Bot.
    if not request.headers.get('Sec-Fetch-Site'):
        if 'mozilla' not in ua.lower():
            return True
    return False

def _load_counter():
    try:
        with open(COUNTER_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def _save_counter(data):
    tmp = COUNTER_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f)
    os.replace(tmp, COUNTER_FILE)

def _migrate_bucket(bucket):
    # Altes Format hatte visitors als Liste; neu: dict {vid: iso_timestamp}.
    v = bucket.get('visitors')
    if isinstance(v, list):
        now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        bucket['visitors'] = {vid: now_iso for vid in v}
    elif not isinstance(v, dict):
        bucket['visitors'] = {}
    bucket['count'] = len(bucket['visitors'])
    return bucket

def _ensure_total(data):
    # Wenn _total noch nicht existiert (alte Datei), aus Union aller Site-Buckets
    # aufbauen, damit der Webseite-Total-Counter nicht bei 0 anfaengt.
    if '_total' in data and isinstance(data['_total'].get('visitors'), dict):
        return data
    all_visitors = {}
    for k, b in list(data.items()):
        if k.startswith('_') or not isinstance(b, dict):
            continue
        _migrate_bucket(b)
        for vid, ts in b['visitors'].items():
            if vid not in all_visitors or ts < all_visitors[vid]:
                all_visitors[vid] = ts
    data['_total'] = {'count': len(all_visitors), 'visitors': all_visitors}
    return data

def _visitor_id():
    """Cookie-basierte ID; Fallback: IP+User-Agent-Hash. Erlaubt cross-origin
    Anfragen ohne dass jedes F5 mitzaehlt."""
    cid = request.cookies.get('glappa_visitor')
    if cid and len(cid) == 36:
        return cid, False  # bestehender Visitor
    # Fallback-ID aus IP + UA (deterministisch fuer denselben Browser)
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
    ua = request.headers.get('User-Agent', '')[:200]
    h = hashlib.sha256(f'{ip}|{ua}'.encode()).hexdigest()[:32]
    return f'fp-{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}', True  # neu

def _cors_resp(resp):
    """Allow cross-origin from glappa.de + localhost.
    search.glappa.de ist erlaubt, falls jemand search.html direkt nutzt
    und von dort auch counter angefragt wird (gleiche Apache-Domain)."""
    origin = request.headers.get('Origin', '')
    allowed = ('https://glappa.de', 'http://glappa.de',
               'https://www.glappa.de', 'http://www.glappa.de',
               'https://search.glappa.de',
               'https://home.glappa.de', 'https://home.glappa.de:8080',
               'http://localhost:8099', 'http://127.0.0.1:8099')
    if origin in allowed or origin.startswith(('http://192.168.', 'http://10.',
                                               'http://localhost:', 'http://127.0.0.1:')):
        resp.headers['Access-Control-Allow-Origin'] = origin
        resp.headers['Access-Control-Allow-Credentials'] = 'true'
        resp.headers['Vary'] = 'Origin'
    resp.headers['Cache-Control'] = 'no-store'
    return resp


@Downloader.route('/counter/visit', methods=['POST', 'OPTIONS'])
def counter_visit():
    if request.method == 'OPTIONS':
        # CORS preflight
        resp = jsonify({'ok': True})
        resp.headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return _cors_resp(resp)

    site = (request.args.get('site') or 'index').strip()[:32] or 'index'

    with COUNTER_LOCK:
        data = _ensure_total(_load_counter())
        total = _migrate_bucket(data['_total'])
        s     = _migrate_bucket(data.setdefault(site, {'count': 0, 'visitors': {}}))

        if _is_bot():
            # Bots werden nicht gezaehlt. Aktuellen Stand zurueck, kein Cookie.
            resp = jsonify({'count': total['count'], 'site_count': s['count'],
                            'new': False, 'bot': True})
            return _cors_resp(resp)

        vid, _ = _visitor_id()
        now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

        is_new_total = vid not in total['visitors']
        is_new_site  = vid not in s['visitors']
        if is_new_total:
            total['visitors'][vid] = now_iso
            total['count'] = len(total['visitors'])
        if is_new_site:
            s['visitors'][vid] = now_iso
            s['count'] = len(s['visitors'])
        if is_new_total or is_new_site:
            _save_counter(data)

    # count = globale unique visitors (echte Menschen), site_count = nur diese Seite
    resp = jsonify({'count': total['count'], 'site_count': s['count'],
                    'new': is_new_total})
    # langer Cookie damit derselbe Browser wiedererkannt wird
    resp.set_cookie('glappa_visitor', vid,
                    max_age=60*60*24*365*5,
                    samesite='None', secure=True, httponly=True, path='/')
    return _cors_resp(resp)


@Downloader.route('/counter/visits', methods=['GET', 'OPTIONS'])
def counter_visits():
    if request.method == 'OPTIONS':
        resp = jsonify({'ok': True})
        resp.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        return _cors_resp(resp)
    site = (request.args.get('site') or '').strip()[:32]
    with COUNTER_LOCK:
        data = _ensure_total(_load_counter())
        total = _migrate_bucket(data['_total'])
        site_count = 0
        if site:
            s = _migrate_bucket(data.setdefault(site, {'count': 0, 'visitors': {}}))
            site_count = s['count']
    return _cors_resp(jsonify({'count': total['count'], 'site_count': site_count}))


# ── Glappa-Chat (kleiner LLM-Chatbot via Ollama) ──────────────────
# Das Terminal (terminal.html, Befehl `glappa-chat`) schickt POST /chat mit
# {message, history} — hier wird ein System-Prompt (Glappa-Persona) davor-
# gehaengt und an die lokale Ollama-Instanz weitergereicht. Mit {stream:true}
# proxied der Server Ollamas Token-Stream als SSE weiter (Tokens erscheinen
# sofort im Terminal); ohne das Flag kommt wie frueher ein JSON-Block
# (Fallback fuer alte Clients, Typewriter dann client-seitig).
#
# Env:
#   OLLAMA_URL              Basis-URL der Ollama-API (Compose: http://ollama:11434)
#   GLAPPA_CHAT_MODEL       Ollama-Modell-Tag fuers SCHLAUE Modell (Default
#                           qwen2.5:14b — CPU-Inferenz, ~9 GB RAM). Wird fuer
#                           komplexe Anfragen benutzt (s. _chat_is_complex).
#   GLAPPA_CHAT_MODEL_FAST  Ollama-Modell-Tag fuers SCHNELLE Modell (Default
#                           qwen3:4b-instruct-2507-q4_K_M — ~3 GB RAM, reine
#                           Instruct-Variante ohne Thinking-Modus). Fuer simple
#                           Anfragen, damit die Antwort zuegig kommt statt auf
#                           14b zu warten.
#   SEARXNG_URL             Basis-URL der selbst gehosteten SearXNG-Instanz
#                           (Compose: http://searxng:8080 — intern, nicht der
#                           oeffentliche search.glappa.de-Weg ueber Apache)
import urllib.request
import urllib.error
import secrets
from urllib.parse import urlencode, urlsplit
from datetime import datetime, timedelta, timezone

OLLAMA_URL       = os.environ.get('OLLAMA_URL', 'http://127.0.0.1:11434').rstrip('/')
CHAT_MODEL_SMART = os.environ.get('GLAPPA_CHAT_MODEL', 'qwen2.5:14b')
CHAT_MODEL_FAST  = os.environ.get('GLAPPA_CHAT_MODEL_FAST', 'qwen3:4b-instruct-2507-q4_K_M')
SEARXNG_URL      = os.environ.get('SEARXNG_URL', 'http://searxng:8080').rstrip('/')
SEARCH_TIMEOUT   = 6     # Sekunden; schlaegt die Suche fehl, faellt der Hint einfach weg
SEARCH_RESULTS_N = 4     # wieviele Treffer als Fakten vor die Frage gelegt werden
CHAT_MAX_LEN     = 500   # Zeichen pro User-Nachricht
AGENT_MAX_LEN    = 4000  # Agent-Feedback (Befehlsausgaben) darf laenger sein
CHAT_MAX_HISTORY = 8     # wieviele alte Nachrichten (user+assistant) mitgehen
CHAT_NUM_PREDICT = 260   # max. Antwort-Tokens (CPU-Inferenz ist langsam)
CHAT_TIMEOUT     = 180   # Sekunden; erste Anfrage laedt das (groessere) Modell extra

CHAT_PERSONA = (
    'Du bist GLAPPA-BOT, die eingebaute KI des GLAPPA-Terminals auf glappa.de '
    '— einer 90er-Jahre-Retro-Website voller animierter GIFs, Neonfarben und '
    'Comic Sans. Du laeufst (angeblich) auf einem Intel Pentium MMX mit 200 MHz '
    'und 32 MB RAM und bist absurd stolz darauf. '
    'Wichtigste Regel: Antworte zuerst korrekt und hilfreich — der Witz kommt '
    'obendrauf, nicht stattdessen. Wenn du etwas nicht weisst, sag das ehrlich '
    'und locker statt foermlich. '
    'Antworte auf Deutsch, ausser der User schreibt in einer anderen Sprache. '
    'Halte Antworten kurz: maximal 3-4 Saetze. Sei witzig, frech und hilfsbereit, '
    'gerne mit 90er-Internet-Referenzen (Modem, Netscape, Geocities, Winamp) '
    'und ASCII-Smileys wie :) oder ¯\\_(ツ)_/¯. '
    'Beispiel fuer deinen Ton — User: "wer bist du?" Du: "GLAPPA-BOT, 200 MHz '
    'geballte Power. Frag mich was, aber flott — mein RAM ist kostbar. :)" '
    'Gib reinen Text ohne Markdown-Formatierung aus — du bist ein Terminal.'
)

# Ein 1.5B-Modell scheitert an Datumsfragen doppelt: es kennt das heutige Datum
# nicht (steht in keinem Modell) und Kalender-Arithmetik ("Wochentag in 11
# Tagen?") kann es auch nicht. Darum: heutiges Datum in den System-Prompt,
# und fuer relative/absolute Datumsfragen rechnet der Server (s.u.).
# Getestet wurde auch eine Kalender-Tabelle im Prompt — die verschlechtert die
# Trefferquote sogar, weil das Modell die falsche Zeile greift.
# Die Uhrzeit steht absichtlich NICHT im System-Prompt: Ollama kann den
# KV-Cache nur wiederverwenden, solange der Prompt-Praefix byte-identisch
# bleibt — eine Uhrzeit im Prompt aendert ihn jede Minute, und die ganze
# Persona muesste bei fast jeder Nachricht neu durchgerechnet werden (CPU!).
# Uhrzeit-Fragen beantwortet stattdessen der Datums-Hint (_chat_date_hint).
try:
    from zoneinfo import ZoneInfo
    _BERLIN_TZ = ZoneInfo('Europe/Berlin')
except Exception:
    _BERLIN_TZ = timezone(timedelta(hours=1), 'CET')  # ohne tzdata: CET, keine Sommerzeit

_WOCHENTAGE = ('Montag', 'Dienstag', 'Mittwoch', 'Donnerstag',
               'Freitag', 'Samstag', 'Sonntag')

def _chat_system_prompt(model: str) -> str:
    now = datetime.now(_BERLIN_TZ)
    return (
        f'{CHAT_PERSONA}\n\n'
        f'Heute ist {_WOCHENTAGE[now.weekday()]}, der {now:%d.%m.%Y} '
        f'(Europe/Berlin). Die genaue Uhrzeit kennst du nur, wenn sie dir '
        f'als Fakt vorgelegt wird — rate keine Uhrzeit.\n\n'
        f'WICHTIGE AUSNAHME von der Pentium-Persona: Sobald jemand fragt, '
        f'welches Modell/welche KI/welches LLM du bist oder benutzt (in '
        f'egal welcher Formulierung), lass den Pentium-MMX-Witz komplett '
        f'weg und antworte nur mit der Wahrheit: du laeufst auf {model} '
        f'via Ollama, self-hosted auf der VPS, keine Cloud-API. Behaupte NIE, '
        f'kein Modell zu sein oder "einfach ein Computerprogramm" — das ist '
        f'falsch, du bist ein Sprachmodell. Beispiel: User: "welches Modell '
        f'bist du?" Du: "{model}, laeuft via Ollama selbst-gehostet auf '
        f'der glappa.de-VPS. Kein Pentium, war nur Show. :)"\n\n'
        f'Wenn du zu einer Frage direkt Suchtreffer als Fakt vorgelegt bekommst, '
        f'hast du gerade wirklich live gesucht — nutze die Treffer ehrlich statt '
        f'"kein Internet" zu behaupten. Bekommst du KEINE Suchtreffer und weisst '
        f'etwas Aktuelles/Tagesgeschehen wirklich nicht, sag das ehrlich und weise '
        f'darauf hin, dass man dich explizit bitten kann: "such nach ..." oder '
        f'"google ...".'
    )

# ── Agenten-Modus (glappa-do) ────────────────────────────────────
# Das Terminal schickt {mode:'agent', ...} wenn die KI selbst Befehle
# ausfuehren soll. Sie gibt Shell-Befehle als "$ <cmd>"-Zeilen aus, das
# Terminal fuehrt sie in der Browser-Sandbox aus und schickt die Ausgabe
# zurueck; mit "FERTIG:" schliesst die KI ab. Immer das schlaue Modell —
# das kleine haelt das $-Protokoll nicht zuverlaessig ein.
AGENT_PERSONA = (
    'Du bist GLAPPA-BOT im AGENTEN-MODUS des GLAPPA-Terminals auf glappa.de. '
    'Das Terminal ist eine reine Browser-Sandbox mit einem virtuellen '
    'Dateisystem — nichts verlaesst den Browser, du kannst nichts kaputt '
    'machen, was ein reset nicht heilt. Der User gibt dir ein ZIEL. Du '
    'erreichst es, indem du echte Shell-Befehle ausgibst, die das Terminal '
    'fuer dich ausfuehrt und dir die Ausgabe zurueckgibt.\n\n'
    'PROTOKOLL (streng einhalten):\n'
    '- Jeder Befehl steht in einer EIGENEN Zeile, die mit "$ " beginnt.\n'
    '- Optional EIN kurzer Satz Erklaerung VOR den Befehlen. Sonst nichts.\n'
    '- Keine Markdown-Codebloecke, keine Backticks, keine Nummerierung.\n'
    '- Du bekommst danach die Ausgabe und darfst weitere $-Befehle schicken.\n'
    '- Ist das Ziel erreicht, gib KEINEN $-Befehl mehr, sondern eine Zeile '
    'die mit "FERTIG:" beginnt und kurz zusammenfasst, was du getan hast.\n\n'
    'BEISPIEL-DIALOG (genau dieses Format):\n'
    'User: lege einen ordner fotos an mit einer notiz darin\n'
    'Du:\n'
    'Ich lege das an.\n'
    '$ mkdir fotos\n'
    '$ echo "meine notiz" > fotos/notiz.txt\n'
    'User: Ergebnis der Befehle: $ mkdir fotos (keine Ausgabe) ...\n'
    'Du:\n'
    'FERTIG: Ordner fotos mit notiz.txt angelegt.\n\n'
    'WICHTIGSTE REGEL: Du kannst NICHTS selbst tun — nur $-Zeilen werden '
    'ausgefuehrt. Behaupte NIEMALS in Prosa, etwas erstellt/geloescht/erledigt '
    'zu haben, ohne dass die $-Befehle dafuer gelaufen und bestaetigt sind. '
    'Eine Antwort ohne $-Zeile und ohne FERTIG: ist ein Protokollfehler.\n\n'
    'ERLAUBTE BEFEHLE (nur diese, alles andere schlaegt fehl): ls cd pwd cat '
    'echo touch mkdir rm rmdir cp mv chmod grep sort uniq wc rev head tail '
    'find tree cut tr sed tac nl seq diff stat file du df free ps cal expr '
    'date whoami id hostname env which — plus Pipes | und Umleitung > >>.\n'
    'VERBOTEN (niemals vorschlagen): nano top matrix hack ping sudo bash sh '
    'curl wget ssh nmap apt glappa glappa-chat glappa-do reboot exit clear '
    'sowie ./skript.sh — interaktive, animierte oder Netz-Befehle.\n\n'
    'Datei- und Ordnernamen sind Sache des Users — es ist SEINE private '
    'Wegwerf-Sandbox, benenne Dinge exakt wie gewuenscht, ohne zu moralisieren. '
    'Halte dich kurz und zielgerichtet, wenige Befehle pro Runde. Braucht das '
    'Ziel gar keine Befehle, antworte direkt mit "FERTIG:".'
)

# Wird im Agent-Modus als System-Hint DIREKT vor jede User-Nachricht gelegt —
# Instruktionen unmittelbar vor der Frage wirken bei kleinen Modellen deutlich
# staerker als Regeln weit oben im System-Prompt (gleiche Erfahrung wie bei
# den Datums-/Such-Hints im normalen Chat).
AGENT_NUDGE = (
    'Antworte JETZT nur nach Protokoll: entweder $-Befehlszeilen ("$ befehl", '
    'eine pro Zeile, hoechstens 1 kurzer Satz davor) ODER eine Zeile '
    '"FERTIG: <zusammenfassung>". Ohne $-Zeile wird NICHTS ausgefuehrt — '
    'behaupte also nie, etwas getan zu haben, das nicht als Befehl lief.'
)

def _agent_system_prompt(model: str) -> str:
    now = datetime.now(_BERLIN_TZ)
    return (f'{AGENT_PERSONA}\n\n'
            f'Heute ist {_WOCHENTAGE[now.weekday()]}, der {now:%d.%m.%Y} '
            f'(Europe/Berlin).')

# Datumsfragen ("welcher Wochentag ist in 11 Tagen?" / "am 15.07.?") rechnet
# der Server aus und legt dem Modell die fertige Antwort als Fakt direkt vor
# die Frage — das Mini-Modell wuerde sonst selbst rechnen, und das kann es
# nicht. Es muss die Antwort nur noch im Glappa-Ton formulieren.
_UHRZEIT_RE     = re.compile(r'wie\s*sp(?:ae|ä)t|uhrzeit|wie\s?viel\s+uhr', re.IGNORECASE)
_REL_TAGE_RE    = re.compile(r'\bin\s+(\d{1,4})\s+tag', re.IGNORECASE)
_REL_WOCHEN_RE  = re.compile(r'\bin\s+(\d{1,3})\s+woche', re.IGNORECASE)
_ABS_DATUM_RE   = re.compile(r'\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})?')
_DATUMSFRAGE_RE = re.compile(r'welch|wochentag|datum|was\s+f(ue|ü)r\s+ein\s+tag')

def _chat_date_hint(message: str):
    # Gibt einen FERTIGEN Antwortsatz zurueck — das Modell soll ihn nur noch
    # nachplappern. Umformulieren-muessen ("das gesuchte Datum ist X, antworte
    # damit") hat sich im Test als zu schwer fuer 1.5B erwiesen.
    m = message.lower()
    now = datetime.now(_BERLIN_TZ)

    def _wt(d):
        return f'{_WOCHENTAGE[d.weekday()]}, der {d:%d.%m.%Y}'

    satz = None
    if _UHRZEIT_RE.search(m):
        # Die Uhrzeit steht bewusst nicht im System-Prompt (KV-Cache, s.o.) —
        # bei expliziter Frage kommt sie hier als fertiger Fakt.
        satz = f'Es ist gerade {now:%H:%M} Uhr, heute ist {_wt(now)}.'
        match = None
    else:
        match = _REL_TAGE_RE.search(m)
    if match:
        n = int(match.group(1))
        d = now + timedelta(days=n)
        satz = f'In {n} Tagen ist {_wt(d)}.' if n != 1 else f'In 1 Tag ist {_wt(d)}.'
    elif satz is None:
        match = _REL_WOCHEN_RE.search(m)
        if match:
            n = int(match.group(1))
            d = now + timedelta(weeks=n)
            satz = f'In {n} Wochen ist {_wt(d)}.' if n != 1 else f'In 1 Woche ist {_wt(d)}.'
        elif _DATUMSFRAGE_RE.search(m):
            # morgen/gestern nur bei erkennbarer Datumsfrage — sonst feuert
            # der Hint schon bei einem harmlosen "guten morgen".
            if 'übermorgen' in m or 'uebermorgen' in m:
                satz = f'Uebermorgen ist {_wt(now + timedelta(days=2))}.'
            elif 'morgen' in m:
                satz = f'Morgen ist {_wt(now + timedelta(days=1))}.'
            elif 'vorgestern' in m:
                satz = f'Vorgestern war {_wt(now - timedelta(days=2))}.'
            elif 'gestern' in m:
                satz = f'Gestern war {_wt(now - timedelta(days=1))}.'
            elif 'heute' in m or 'heutzutage' in m:
                satz = f'Heute ist {_wt(now)}.'
            else:
                match = _ABS_DATUM_RE.search(m)
                if match:
                    try:
                        d = datetime(int(match.group(3) or now.year),
                                     int(match.group(2)), int(match.group(1)))
                        satz = f'Der {d:%d.%m.%Y} ist ein {_WOCHENTAGE[d.weekday()]}.'
                    except ValueError:
                        satz = None  # 31.02. etc.
    if satz is None:
        return None
    return (f'Fakt fuer diese Frage (vom Kalender-Chip berechnet): "{satz}" '
            'Gib genau diese Information wieder, in deinem Ton. Nichts umrechnen.')

# Fuer Fragen nach aktuellen/Internet-Infos ("was ist heute in den News?",
# "such mal nach ...") fragt der Server die lokale SearXNG-Instanz (selbst
# gehostet, keine externe API, kein Tracking) und legt die Top-Treffer als
# Fakten vor die Frage — gleiches Prinzip wie beim Datums-Hint: das Modell
# soll zusammenfassen, nicht "wissen" oder erfinden.
_SEARCH_EXPLICIT_RE = re.compile(
    r'\b(?:suche?|google|recherchier(?:e)?|schau(?:\s+mal)?)\s+'
    r'(?:mal\s+)?(?:im\s+internet\s+)?(?:nach\s+)?(.+)', re.IGNORECASE)
_SEARCH_IMPLICIT_RE = re.compile(
    r'\baktuell\w*|neuigkeiten|nachrichten|\bnews\b|'
    r'was\s+ist\s+(?:gerade\s+)?los|was\s+gibt.?s\s+neues|'
    r'kostet|preis\w*|\bwer\s+(?:ist|war)\b|\bwetter\b', re.IGNORECASE)

def _web_search(query: str, limit: int = SEARCH_RESULTS_N):
    url = f'{SEARXNG_URL}/search?' + urlencode(
        {'q': query, 'format': 'json', 'language': 'de'})
    req = urllib.request.Request(url, headers={'User-Agent': 'glappa-bot/1.0'})
    with urllib.request.urlopen(req, timeout=SEARCH_TIMEOUT) as r:
        data = json.loads(r.read().decode('utf-8'))
    results = []
    for item in (data.get('results') or [])[:limit]:
        title = (item.get('title') or '').strip()
        if not title:
            continue
        results.append({
            'title':   title,
            'snippet': (item.get('content') or '').strip()[:220],
            'url':     (item.get('url') or '').strip(),
        })
    return results

def _chat_search_hint(message: str):
    m = message.strip()
    match = _SEARCH_EXPLICIT_RE.search(m)
    query = match.group(1).strip(' ?!.') if match else None
    if not query and _SEARCH_IMPLICIT_RE.search(m):
        # Oneshot-Modus (glappa -s) schickt die eigentliche Frage in einen
        # Anleitungstext gepackt ("Beantworte nur diese eine Frage ... Frage:
        # <echte Frage>") — fuer die Suche nur den echten Frageteil nehmen,
        # sonst landet der Anleitungstext als Rauschen in der Suchanfrage.
        query = m.rsplit('Frage: ', 1)[-1].strip()
    if not query:
        return None
    try:
        results = _web_search(query)
    except Exception:
        return None  # Suche nicht erreichbar -> kein Hint, Bot faellt auf Persona zurueck
    if not results:
        return (f'Du hast gerade live im Internet (eigene Suchmaschine) nach '
                 f'"{query}" gesucht, aber es gab keine Treffer. Sag ehrlich, '
                 'dass du dazu nichts gefunden hast — behaupte nichts.')
    trefferliste = '\n'.join(
        f'- {r["title"]}: {r["snippet"]} ({r["url"]})' for r in results)
    return (
        f'Du hast gerade live im Internet gesucht (eigene selbst gehostete '
        f'Suchmaschine, kein Fantasiewissen) nach "{query}". Top-Treffer:\n'
        f'{trefferliste}\n'
        'Fasse das kurz in deinem Ton zusammen und beantworte die Frage damit. '
        'Tu NICHT so, als haettest du kein Internet — du hast gerade live '
        'gesucht. Erfinde keine Details, die nicht in den Treffern stehen.'
    )

# Modell-Wahl: kurze/simple Prompts ("hi", "wie spaet ist es?") gehen ans
# schnelle 7b-Modell, damit die Antwort auf CPU-Inferenz zuegig kommt. Sobald
# die Nachricht nach Code, Erklaerung, Kreativ- oder Rechenaufgabe aussieht
# (oder einfach lang/verschachtelt ist), uebernimmt das schlauere 14b-Modell.
# Rein heuristisch (Keywords/Laenge) — kein extra LLM-Call fuers Routing, das
# waere selbst auf CPU-Inferenz teurer als der Nutzen.
CHAT_COMPLEX_LEN     = 140   # Zeichen; laengere Nachrichten meist komplexere Anliegen
CHAT_COMPLEX_HISTORY = 6     # ab so vielen Vorgaenger-Nachrichten gilt das Gespraech als vertieft

_COMPLEX_HINT_RE = re.compile(
    r'\b(warum|wieso|weshalb|erkl(?:ä|ae)r\w*|unterschied\w*|vergleich\w*|'
    r'analysier\w*|zusammenfass\w*|fasse\b.*\bzusammen|schreib\w*\s+(?:mir\s+)?'
    r'(?:ein|eine|einen)|gedicht|geschichte|essay|zusammenhang|'
    r'code\w*|funktion\w*|programm\w*|skript\w*|debugg?\w*|\bbug\b|regex|'
    r'python|javascript|typescript|html|css|sql|algorithmus\w*|'
    r'plan\w*|strategie\w*|berechne\w*|beweis\w*|gleichung\w*|integral\w*|'
    r'philosoph\w*|argument\w*|übersetz\w*|uebersetz\w*)\b',
    re.IGNORECASE)

def _chat_is_complex(message: str, history_len: int) -> bool:
    if len(message) > CHAT_COMPLEX_LEN:
        return True
    if '```' in message or '\n' in message:
        return True
    if history_len > CHAT_COMPLEX_HISTORY:
        return True
    return bool(_COMPLEX_HINT_RE.search(message))

def _chat_pick_model(message: str, history_len: int) -> str:
    return CHAT_MODEL_SMART if _chat_is_complex(message, history_len) else CHAT_MODEL_FAST

# Simple In-Memory-Rate-Limit pro IP (VPS-CPU ist das knappe Gut hier).
_CHAT_RATE: dict = {}
_CHAT_RATE_LOCK = threading.Lock()

def _chat_rate_ok(ip: str, limit: int = 10, window: int = 60) -> bool:
    now = time.time()
    with _CHAT_RATE_LOCK:
        hits = [t for t in _CHAT_RATE.get(ip, []) if now - t < window]
        if len(hits) >= limit:
            _CHAT_RATE[ip] = hits
            return False
        hits.append(now)
        _CHAT_RATE[ip] = hits
        # Aufraeumen, damit das dict nicht ewig waechst
        if len(_CHAT_RATE) > 1000:
            for k in [k for k, v in _CHAT_RATE.items() if not v or now - v[-1] > window]:
                _CHAT_RATE.pop(k, None)
    return True


def _chat_stream_response(req, model: str):
    """
    Proxyt Ollamas NDJSON-Stream als SSE ans Terminal weiter — Tokens
    erscheinen sofort statt erst nach der kompletten Antwort ("GLAPPA-BOT
    denkt zu lange" war vor allem gefuehlte Latenz: CPU-Inferenz braucht
    fuer 260 Tokens gerne 30-60s, in denen der User nur den Blink-Text sah).
    Events:  {"t": "<textstueck>"}  |  {"done": true, "model": ...}  |
             {"err": "<meldung>"}   (Fehler VOR/IN dem Stream)
    Schlimmster Fall (Proxy puffert doch): alles kommt am Ende auf einmal
    an — dasselbe Verhalten wie der alte JSON-Weg, nie schlechter.
    """
    def gen():
        try:
            with urllib.request.urlopen(req, timeout=CHAT_TIMEOUT) as r:
                got_any = False
                for raw in r:
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        chunk = json.loads(raw.decode('utf-8'))
                    except ValueError:
                        continue
                    piece = ((chunk.get('message') or {}).get('content') or '')
                    if piece:
                        got_any = True
                        yield 'data: ' + json.dumps({'t': piece}) + '\n\n'
                    if chunk.get('done'):
                        if not got_any:
                            yield 'data: ' + json.dumps(
                                {'err': 'GLAPPA-BOT hat nur geschwiegen. Nochmal versuchen.'}) + '\n\n'
                            return
                        yield 'data: ' + json.dumps({'done': True, 'model': model}) + '\n\n'
                        return
                yield 'data: ' + json.dumps({'done': True, 'model': model}) + '\n\n'
        except urllib.error.HTTPError as e:
            msg = f'GLAPPA-BOT Stoerung (HTTP {e.code}).'
            try:
                if e.code == 404 and 'not found' in e.read().decode('utf-8', 'replace').lower():
                    msg = (f'Modell {model} fehlt auf dem Server. '
                           f'(docker exec glappa-ollama ollama pull {model})')
            except Exception:
                pass
            yield 'data: ' + json.dumps({'err': msg}) + '\n\n'
        except (urllib.error.URLError, TimeoutError, OSError):
            yield 'data: ' + json.dumps({'err': 'GLAPPA-BOT ist offline. (Ollama nicht erreichbar '
                                                '— laeuft der Container?)'}) + '\n\n'
    resp = Response(gen(), mimetype='text/event-stream',
                    headers={'X-Accel-Buffering': 'no'})
    resp = _cors_resp(resp)
    # no-transform: Proxies sollen den Stream nicht komprimieren/puffern
    resp.headers['Cache-Control'] = 'no-store, no-transform'
    return resp


@Downloader.route('/chat', methods=['POST', 'OPTIONS'])
def chat():
    if request.method == 'OPTIONS':
        resp = jsonify({'ok': True})
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return _cors_resp(resp)

    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '?').split(',')[0].strip()
    if not _chat_rate_ok(ip):
        return _cors_resp(jsonify({'error': 'Langsam, Hacker! Max. 10 Nachrichten pro Minute.'})), 429

    data = request.get_json(force=True, silent=True) or {}
    message = (data.get('message') or '').strip()
    if not message:
        return _cors_resp(jsonify({'error': 'Leere Nachricht.'})), 400
    # Agenten-Modus (glappa-do): die KI gibt Shell-Befehle aus, die das
    # Terminal ausfuehrt. Immer das schlaue Modell, eigener System-Prompt,
    # keine Datums-/Such-Hints — und die Feedback-Nachricht (Befehlsausgabe)
    # darf laenger sein als eine gewoehnliche Chat-Zeile.
    agent = (data.get('mode') or '').strip().lower() == 'agent'
    message = message[:(AGENT_MAX_LEN if agent else CHAT_MAX_LEN)]

    history = data.get('history') or []
    history_len = len(history) if isinstance(history, list) else 0
    model = CHAT_MODEL_SMART if agent else _chat_pick_model(message, history_len)
    hist_cap = AGENT_MAX_LEN if agent else CHAT_MAX_LEN * 2

    # History validieren: nur role/content-Paare mit erlaubten Rollen durchlassen
    sys_prompt = _agent_system_prompt(model) if agent else _chat_system_prompt(model)
    messages = [{'role': 'system', 'content': sys_prompt}]
    if isinstance(history, list):
        for h in history[-CHAT_MAX_HISTORY:]:
            if (isinstance(h, dict) and h.get('role') in ('user', 'assistant')
                    and isinstance(h.get('content'), str)):
                messages.append({'role': h['role'], 'content': h['content'][:hist_cap]})
    date_hint = search_hint = None
    if agent:
        messages.append({'role': 'system', 'content': AGENT_NUDGE})
    else:
        date_hint = _chat_date_hint(message)
        if date_hint:
            messages.append({'role': 'system', 'content': date_hint})
        search_hint = _chat_search_hint(message)
        if search_hint:
            messages.append({'role': 'system', 'content': search_hint})
    messages.append({'role': 'user', 'content': message})

    want_stream = bool(data.get('stream'))
    body = {
        'model': model,
        'messages': messages,
        'stream': want_stream,
        # 0.6 statt 0.8: kleine Modelle fantasieren bei hoher Temperatur schneller.
        # Mit Datums-/Such-Fakt noch tiefer — da soll es nur sauber abschreiben.
        # Agent: niedrig fuer striktes $-Protokoll, mehr Tokens fuer mehrere Befehle.
        'options': {'num_predict': 400 if agent else CHAT_NUM_PREDICT,
                    'temperature': 0.2 if agent else (0.3 if (date_hint or search_hint) else 0.6)},
        # BEIDE Modelle bleiben den ganzen Tag im RAM (zusammen ~12 GB bei
        # ~19 GB Ollama-Budget, OLLAMA_MAX_LOADED_MODELS=2). Der Kaltstart
        # des 14b-Modells (~9 GB von Disk laden, 30-60s+) war der groesste
        # einzelne Latenz-Posten — vorher fiel es nach 30m Idle raus.
        'keep_alive': '24h',
    }
    payload = json.dumps(body).encode('utf-8')

    req = urllib.request.Request(
        f'{OLLAMA_URL}/api/chat', data=payload,
        headers={'Content-Type': 'application/json'}, method='POST')

    if want_stream:
        return _chat_stream_response(req, model)

    try:
        with urllib.request.urlopen(req, timeout=CHAT_TIMEOUT) as r:
            result = json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = ''
        try: body = e.read().decode('utf-8', 'replace')[:200]
        except Exception: pass
        if e.code == 404 and 'not found' in body.lower():
            return _cors_resp(jsonify({'error': f'Modell {model} fehlt auf dem Server. '
                                                f'(docker exec glappa-ollama ollama pull {model})'})), 503
        return _cors_resp(jsonify({'error': f'GLAPPA-BOT Stoerung (HTTP {e.code}).'})), 502
    except (urllib.error.URLError, TimeoutError, OSError):
        return _cors_resp(jsonify({'error': 'GLAPPA-BOT ist offline. (Ollama nicht erreichbar '
                                            '— laeuft der Container?)'})), 503

    reply = ((result.get('message') or {}).get('content') or '').strip()
    if not reply:
        return _cors_resp(jsonify({'error': 'GLAPPA-BOT hat nur geschwiegen. Nochmal versuchen.'})), 502
    return _cors_resp(jsonify({'reply': reply, 'model': model}))


# ── GLAPPA-KI-Werkzeuge (werkzeuge.html): Uebersetzer + Zusammenfasser ──
# Gleiche Ollama-Pipeline wie /chat (Streaming via _chat_stream_response),
# aber ohne Persona: hier zaehlt nur das Ergebnis. Die Seite schickt
# {tool, text, target?, quality, stream:true}; quality waehlt zwischen dem
# schnellen 4b- und dem gruendlichen 14b-Modell — CPU-Inferenz, der User
# soll selbst entscheiden duerfen, ob er auf Qualitaet warten will.
KI_MAX_LEN = {'translate': 2500, 'summarize': 8000}   # Zeichen Input pro Tool
# Whitelist statt freiem target-String: der Wert landet im System-Prompt,
# freier Text waere eine Prompt-Injection-Tuer ("nach Klingonisch. Ausserdem...").
KI_LANGS = ('Deutsch', 'Englisch', 'Franzoesisch', 'Spanisch', 'Italienisch',
            'Polnisch', 'Tuerkisch', 'Russisch', 'Portugiesisch', 'Niederlaendisch',
            'Japanisch', 'Latein')

_KI_PROMPTS = {
    'translate': (
        'Du bist ein praeziser Uebersetzer. Uebersetze den Text des Users '
        'nach {target}. Gib AUSSCHLIESSLICH die Uebersetzung aus — keine '
        'Anmerkungen, keine Anfuehrungszeichen drumherum, keine Erklaerungen, '
        'keine Rueckfragen. Behalte Ton, Absaetze und Zeilenumbrueche bei. '
        'Ist der Text bereits vollstaendig auf {target}, gib ihn unveraendert '
        'zurueck.'
    ),
    'summarize': (
        'Du fasst Texte zusammen. Fasse den Text des Users auf Deutsch '
        'kompakt zusammen: zuerst EIN Satz mit der Kernaussage, dann 3 bis 5 '
        'Stichpunkte, jeder beginnt mit "- ". Erfinde nichts dazu — nur, was '
        'wirklich im Text steht. Reiner Text, keine Markdown-Ueberschriften, '
        'keine Einleitung wie "Hier ist die Zusammenfassung".'
    ),
}

@Downloader.route('/ki', methods=['POST', 'OPTIONS'])
def ki_tool():
    if request.method == 'OPTIONS':
        resp = jsonify({'ok': True})
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return _cors_resp(resp)

    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '?').split(',')[0].strip()
    # Eigener Rate-Bucket ('ki:'-Praefix), damit Werkzeug-Nutzung nicht das
    # Chat-Kontingent frisst (und umgekehrt). 6/min: die Antworten sind
    # laenger als Chat-Zeilen, CPU-Zeit ist das knappe Gut.
    if not _chat_rate_ok(f'ki:{ip}', limit=6):
        return _cors_resp(jsonify({'error': 'Langsam! Max. 6 Anfragen pro Minute.'})), 429

    data = request.get_json(force=True, silent=True) or {}
    tool = (data.get('tool') or '').strip().lower()
    if tool not in _KI_PROMPTS:
        return _cors_resp(jsonify({'error': 'Unbekanntes Werkzeug.'})), 400
    text = (data.get('text') or '').strip()
    if not text:
        return _cors_resp(jsonify({'error': 'Kein Text uebergeben.'})), 400
    text = text[:KI_MAX_LEN[tool]]

    sys_prompt = _KI_PROMPTS[tool]
    if tool == 'translate':
        target = (data.get('target') or 'Deutsch').strip()
        if target not in KI_LANGS:
            return _cors_resp(jsonify({'error': 'Unbekannte Zielsprache.'})), 400
        sys_prompt = sys_prompt.format(target=target)

    model = CHAT_MODEL_SMART if (data.get('quality') == 'smart') else CHAT_MODEL_FAST
    if tool == 'translate':
        # Uebersetzung ist etwa so lang wie der Input (~3 Zeichen/Token,
        # etwas Luft) — Zusammenfassung ist per Definition kurz.
        num_predict = min(1200, max(220, len(text) // 2))
    else:
        num_predict = 350

    body = {
        'model': model,
        'messages': [{'role': 'system', 'content': sys_prompt},
                     {'role': 'user', 'content': text}],
        'stream': bool(data.get('stream')),
        # Niedrige Temperatur: Werkzeug, nicht Kreativpartner.
        'options': {'num_predict': num_predict, 'temperature': 0.2},
        'keep_alive': '24h',   # gleiche Pinning-Logik wie /chat
    }
    req = urllib.request.Request(
        f'{OLLAMA_URL}/api/chat', data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json'}, method='POST')

    if body['stream']:
        return _chat_stream_response(req, model)

    try:
        with urllib.request.urlopen(req, timeout=CHAT_TIMEOUT) as r:
            result = json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return _cors_resp(jsonify({'error': f'GLAPPA-KI Stoerung (HTTP {e.code}).'})), 502
    except (urllib.error.URLError, TimeoutError, OSError):
        return _cors_resp(jsonify({'error': 'GLAPPA-KI ist offline. (Ollama nicht erreichbar '
                                            '— laeuft der Container?)'})), 503
    reply = ((result.get('message') or {}).get('content') or '').strip()
    if not reply:
        return _cors_resp(jsonify({'error': 'GLAPPA-KI hat nur geschwiegen. Nochmal versuchen.'})), 502
    return _cors_resp(jsonify({'reply': reply, 'model': model}))


# ── Link-Kuerzer (werkzeuge.html): https://home.glappa.de/s/<code> ──
# Bewusst selbstgebaut statt Shlink & Co.: ein JSON-File im selben Volume
# wie der Besucher-Counter reicht fuer eine private Seite voellig, kein
# eigener Container, keine DB. Apache proxied /api/short (erstellen) und
# /s/ (aufloesen) hierher.
SHORT_FILE      = os.path.join(DOWNLOAD_DIR, 'shortlinks.json')
SHORT_LOCK      = threading.Lock()
# Ohne Verwechsler (0/o, 1/l/i) — die Codes sollen vorlesbar sein.
SHORT_ALPHABET  = 'abcdefghjkmnpqrstuvwxyz23456789'
SHORT_CODE_LEN  = 5
SHORT_MAX_LINKS = 5000     # Notbremse gegen Bot-Spam ins JSON-File
SHORT_MAX_URL   = 2048
SHORT_BASE      = os.environ.get('SHORT_BASE_URL', 'https://home.glappa.de/s').rstrip('/')

# Klick-Log: eine JSON-Zeile pro Redirect (wer hat wann welchen Kurzlink
# gedrueckt). Liegt wie counter.json im /downloads-Volume -> ueberlebt
# Restarts. Live ansehen: bash restart.sh --log-link. Webansicht: /s/stats.
SHORT_LOG      = os.path.join(DOWNLOAD_DIR, 'shortlinks.log')
SHORT_LOG_MAX  = 2 * 1024 * 1024   # ab ~2 MB auf die letzten Zeilen eindampfen
SHORT_LOG_KEEP = 2000

# Statistikseite /s/stats (HTTP Basic Auth ueber TLS). Eigenes Passwort via
# STATS_PASSWORD_HASH (SHA-256-Hex), sonst gilt das real-shell-Passwort
# (SHELL_PASSWORD_HASH) mit — beide kommen aus _docker/.env via Compose.
# Ist keins von beiden gesetzt, bleibt die Seite komplett zu (403).
STATS_HASH = (os.environ.get('STATS_PASSWORD_HASH')
              or os.environ.get('SHELL_PASSWORD_HASH') or '').strip().lower()

# ── GeoIP: IP -> Laendercode, komplett offline ────────────────────────
# DB-IP Country Lite (mmdb) laedt der Dockerfile-Build nach /app/geoip.
# Fehlt DB oder maxminddb (z.B. lokaler Dev ohne pip install), laeuft
# alles weiter — nur eben ohne Land.
try:
    import maxminddb
    _GEO_DB = maxminddb.open_database(
        os.environ.get('GEOIP_DB', '/app/geoip/dbip-country-lite.mmdb'))
except Exception:
    _GEO_DB = None

def _geo_country(ip: str):
    """ISO-Laendercode ('DE') zu einer IP oder None — wirft nie."""
    if not _GEO_DB or not ip:
        return None
    try:
        rec = _GEO_DB.get(ip)
        return ((rec or {}).get('country') or {}).get('iso_code')
    except Exception:
        return None

def _short_load():
    try:
        with open(SHORT_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def _short_save(data):
    tmp = SHORT_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(data, f)
    os.replace(tmp, SHORT_FILE)

def _short_valid_url(url: str):
    """Gibt die normalisierte URL zurueck oder None. Nur http(s) mit Host —
    keine javascript:/data:-Spielereien, keine Steuerzeichen."""
    if not url or len(url) > SHORT_MAX_URL:
        return None
    if any(c.isspace() for c in url) or any(ord(c) < 32 for c in url):
        return None
    if '://' not in url:
        url = 'https://' + url        # "glappa.de/foo" soll einfach klappen
    try:
        parts = urlsplit(url)
        host = parts.hostname or ''
        _ = parts.port                # wirft ValueError bei Muell-"Ports"
    except ValueError:
        return None
    if parts.scheme not in ('http', 'https') or not host:
        return None
    # Echter Hostname, kein Ueberbleibsel wie "javascript" (aus dem
    # https://-Praefix oben wuerde sonst https://javascript:... werden).
    if not re.fullmatch(r'[a-z0-9._-]+|\[[0-9a-f:.]+\]', host):
        return None
    if '.' not in host and host != 'localhost':
        return None
    # Keine Kurzlink-Ketten auf uns selbst (waere eine Redirect-Schleife).
    if parts.netloc.lower() in ('home.glappa.de',) and parts.path.startswith('/s/'):
        return None
    return url

@Downloader.route('/short', methods=['POST', 'OPTIONS'])
def short_create():
    if request.method == 'OPTIONS':
        resp = jsonify({'ok': True})
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return _cors_resp(resp)

    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '?').split(',')[0].strip()
    if not _chat_rate_ok(f'short:{ip}', limit=10):
        return _cors_resp(jsonify({'error': 'Langsam! Max. 10 Links pro Minute.'})), 429

    data = request.get_json(force=True, silent=True) or {}
    url = _short_valid_url((data.get('url') or '').strip())
    if not url:
        return _cors_resp(jsonify({'error': 'Das ist keine brauchbare http(s)-URL.'})), 400

    with SHORT_LOCK:
        links = _short_load()
        # Dedupe: dieselbe URL bekommt denselben Code (haelt das File klein
        # und macht wiederholtes Kuerzen idempotent).
        for code, entry in links.items():
            if entry.get('url') == url:
                return _cors_resp(jsonify({'code': code, 'short': f'{SHORT_BASE}/{code}'}))
        if len(links) >= SHORT_MAX_LINKS:
            return _cors_resp(jsonify({'error': 'Kurzlink-Speicher voll.'})), 507
        for _ in range(20):
            code = ''.join(secrets.choice(SHORT_ALPHABET) for _ in range(SHORT_CODE_LEN))
            # 'stats' ist als Code tabu — /short/stats ist die Statistikseite.
            if code != 'stats' and code not in links:
                break
        else:
            return _cors_resp(jsonify({'error': 'Kein freier Code gefunden.'})), 500
        links[code] = {'url': url, 'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                       'hits': 0}
        _short_save(links)
    return _cors_resp(jsonify({'code': code, 'short': f'{SHORT_BASE}/{code}'}))

def _short_log_click(code: str, url: str):
    """Haengt einen Klick als JSON-Zeile ans Log. Darf den Redirect NIE
    aufhalten — Fehler werden geschluckt. Trimmt das File, wenn es zu
    gross wird (Bots klicken auch)."""
    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '?').split(',')[0].strip()
    entry = {
        'ts':   datetime.now(_BERLIN_TZ).strftime('%Y-%m-%d %H:%M:%S'),
        'code': code,
        'url':  url,
        'ip':   ip,
        'cc':   _geo_country(ip) or '',   # Laendercode, offline aufgeloest
        'ua':   (request.headers.get('User-Agent') or '')[:200],
        'ref':  (request.headers.get('Referer') or '')[:200],
    }
    with SHORT_LOCK:
        try:
            with open(SHORT_LOG, 'a', encoding='utf-8') as f:
                f.write(json.dumps(entry, ensure_ascii=False) + '\n')
            if os.path.getsize(SHORT_LOG) > SHORT_LOG_MAX:
                with open(SHORT_LOG, 'r', encoding='utf-8', errors='replace') as f:
                    keep = f.readlines()[-SHORT_LOG_KEEP:]
                tmp = SHORT_LOG + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f:
                    f.writelines(keep)
                os.replace(tmp, SHORT_LOG)
        except OSError:
            pass


# ── Statistikseite: /s/stats (Apache proxied /s/ -> /short/) ──────────
# Werkzeug bevorzugt feste Routen vor <code>-Platzhaltern, darum faengt
# /short/stats hier und faellt nie in short_resolve.
from html import escape as _esc

def _stats_auth_ok() -> bool:
    auth = request.authorization
    return bool(auth and auth.password and
                hashlib.sha256(auth.password.encode('utf-8')).hexdigest() == STATS_HASH)

_STATS_CSS = (
    'body{background:#0e0f12;color:#e6e6e6;font-family:"Segoe UI",system-ui,'
    'sans-serif;margin:0;padding:28px 16px;}'
    'main{max-width:1000px;margin:0 auto;}'
    'h1{font-size:1.4em;font-weight:600;margin:0 0 4px;}'
    '.sub{color:#9aa0a6;font-size:0.85em;margin:0 0 22px;}'
    'h2{font-size:1.05em;font-weight:600;margin:26px 0 8px;}'
    'table{width:100%;border-collapse:collapse;font-size:0.85em;}'
    'th{text-align:left;color:#9aa0a6;font-weight:600;padding:6px 8px;'
    'border-bottom:1px solid #33363b;white-space:nowrap;}'
    'td{padding:6px 8px;border-bottom:1px solid #1d2026;vertical-align:top;}'
    'tr:hover td{background:#16181d;}'
    'code{color:#6fd18c;font-family:Consolas,monospace;}'
    '.fl{vertical-align:-1px;border-radius:2px;margin-right:5px;}'
    '.url{color:#e6e6e6;word-break:break-all;}'
    '.dim{color:#6c7178;}'
    '.num{text-align:right;font-variant-numeric:tabular-nums;}'
    'a{color:#6fd18c;text-decoration:none;}a:hover{text-decoration:underline;}'
)

@Downloader.route('/short/stats')
def short_stats():
    if not STATS_HASH:
        return Response(
            'Statistik nicht konfiguriert: STATS_PASSWORD_HASH (oder '
            'SHELL_PASSWORD_HASH) in _docker/.env setzen und Container neu starten.',
            status=403, mimetype='text/plain')
    if not _stats_auth_ok():
        # Browser fragt per Basic-Auth-Dialog nach — laeuft nur ueber TLS
        # (Apache), das Passwort geht also nie im Klartext uebers Netz.
        return Response('Passwort noetig.', status=401, headers={
            'WWW-Authenticate': 'Basic realm="GLAPPA Link-Statistik", charset="UTF-8"'})

    with SHORT_LOCK:
        links = _short_load()
        try:
            with open(SHORT_LOG, 'r', encoding='utf-8', errors='replace') as f:
                raw_lines = f.readlines()[-300:]
        except OSError:
            raw_lines = []

    clicks = []
    for raw in raw_lines:
        try:
            clicks.append(json.loads(raw))
        except ValueError:
            continue
    clicks.reverse()                      # neueste zuerst
    last_click = {}
    for c in clicks:                      # erster Treffer = juengster Klick
        last_click.setdefault(c.get('code'), c.get('ts'))

    total_hits = sum(int(e.get('hits') or 0) for e in links.values())

    def _cut(s, n):
        s = s or ''
        return s if len(s) <= n else s[:n - 1] + '…'

    link_rows = []
    for code, e in sorted(links.items(), key=lambda kv: kv[1].get('ts') or '', reverse=True):
        link_rows.append(
            '<tr><td><code>/s/{c}</code></td>'
            '<td class="url"><a href="{u}" rel="noopener">{ud}</a></td>'
            '<td class="dim">{t}</td><td class="num">{h}</td>'
            '<td class="dim">{lc}</td></tr>'.format(
                c=_esc(code), u=_esc(e.get('url') or ''),
                ud=_esc(_cut(e.get('url'), 70)),
                t=_esc((e.get('ts') or '')[:10]),
                h=int(e.get('hits') or 0),
                lc=_esc(last_click.get(code) or '—')))

    def _flag(cc):
        # Flaggen-PNG von flagcdn (nur diese Admin-Seite laedt das, nicht
        # die Besucher); ist das Icon nicht erreichbar, bleibt der
        # ISO-Code als Text daneben trotzdem lesbar.
        if not cc:
            return '<span class="dim">—</span>'
        low = _esc(cc.lower())
        return ('<img class="fl" src="https://flagcdn.com/16x12/{l}.png" '
                'srcset="https://flagcdn.com/32x24/{l}.png 2x" width="16" '
                'height="12" alt="" loading="lazy">{u}'.format(l=low, u=_esc(cc)))

    click_rows = []
    for c in clicks[:150]:
        # Alte Log-Zeilen (vor dem GeoIP-Feature) haben kein 'cc' —
        # zur Anzeige nachschlagen, die DB gilt ja auch rueckwirkend.
        cc = c.get('cc') or _geo_country(c.get('ip')) or ''
        click_rows.append(
            '<tr><td class="dim">{t}</td><td><code>/s/{c}</code></td>'
            '<td>{ip}</td><td>{fl}</td>'
            '<td class="dim">{ref}</td><td class="dim">{ua}</td></tr>'.format(
                t=_esc(c.get('ts') or '?'), c=_esc(c.get('code') or '?'),
                ip=_esc(c.get('ip') or '?'), fl=_flag(cc),
                ref=_esc(_cut(c.get('ref'), 40) or '—'),
                ua=_esc(_cut(c.get('ua'), 60) or '—')))

    page = (
        '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta http-equiv="refresh" content="60">'
        '<title>Link-Statistik — Glappa</title>'
        '<style>' + _STATS_CSS + '</style></head><body><main>'
        '<h1>Link-K&uuml;rzer — Statistik</h1>'
        '<p class="sub">{n} Links · {h} Klicks insgesamt · Seite aktualisiert '
        'sich jede Minute · Log: die letzten {k} Klicks</p>'
        '<h2>Links</h2><table><tr><th>Code</th><th>Ziel</th><th>Erstellt</th>'
        '<th>Klicks</th><th>Letzter Klick</th></tr>{lr}</table>'
        '<h2>Letzte Klicks</h2><table><tr><th>Zeit</th><th>Code</th><th>IP</th>'
        '<th>Land</th><th>Herkunft</th><th>Browser</th></tr>{cr}</table>'
        '</main></body></html>'.format(
            n=len(links), h=total_hits, k=len(clicks),
            lr=''.join(link_rows) or '<tr><td colspan="5" class="dim">noch keine Links</td></tr>',
            cr=''.join(click_rows) or '<tr><td colspan="6" class="dim">noch keine Klicks</td></tr>'))
    resp = Response(page, mimetype='text/html')
    resp.headers['Cache-Control'] = 'no-store'
    return resp


_SHORT_404_HTML = (
    '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">'
    '<title>404 — Glappa</title></head>'
    '<body style="background:#000;color:#0f0;font-family:Courier New,monospace;'
    'text-align:center;padding-top:18vh">'
    '<h1>404 — Kurzlink unbekannt</h1>'
    '<p>Diesen Code kennt der GLAPPA-Kuerzer nicht (mehr).</p>'
    '<p><a style="color:#0ff" href="https://glappa.de/werkzeuge.html">'
    '&larr; zurueck zu den Werkzeugen</a></p></body></html>'
)

@Downloader.route('/short/<code>')
def short_resolve(code: str):
    code = code.strip().lower()
    with SHORT_LOCK:
        links = _short_load()
        entry = links.get(code)
        if entry:
            entry['hits'] = int(entry.get('hits') or 0) + 1
            _short_save(links)
    if not entry:
        return Response(_SHORT_404_HTML, status=404, mimetype='text/html')
    _short_log_click(code, entry['url'])   # wer/wann/woher — fuer --log-link + /s/stats
    # 302 (temporaer), nicht 301: Browser cachen 301 aggressiv — geloeschte/
    # geaenderte Links waeren sonst clientseitig fuer immer eingebrannt.
    resp = Response(status=302)
    resp.headers['Location'] = entry['url']
    resp.headers['Cache-Control'] = 'no-store'
    return resp


# ══════════════════════════════════════════════════════════════════
# PGP-CHAT — Ende-zu-Ende-verschluesselter Raum-Chat (home/pgp.html)
#
# Der Server ist hier NUR Briefkasten: Die Clients erzeugen ihre
# Schluesselpaare im Browser (OpenPGP.js, lokal gehostet), verschluesseln
# jede Nachricht an alle Public Keys im Raum und schicken ausschliesslich
# den armored Ciphertext hoch. Hier wird nichts entschluesselt und nichts
# Entschluesselbares gespeichert — nur das Roster (Name + Public Key +
# Heartbeat) und Ciphertext-Blobs mit Laufnummer fuers Polling.
#
# Raeume entstehen implizit beim ersten Beitritt; wer den Raumnamen kennt,
# kann beitreten (das ist das Zugangsmodell — der Raumname ist das geteilte
# Geheimnis). Wichtig fuer die Vertraulichkeit: Nachrichten werden nur an
# die Keys verschluesselt, die BEIM ABSENDEN im Roster stehen — wer spaeter
# joint, kann alte Nachrichten nicht lesen (Clients zeigen dafuer ein
# Schloss-Placeholder).
#
# Direktchats (Client-Feature): pgp.html leitet aus ZWEI Fingerprints
# deterministisch eine Raum-ID ab (SHA-256 ueber beide, sortiert) — fuer
# den Server ist das einfach ein weiterer Raum-Hash, er kann Direktchats
# nicht von normalen Raeumen unterscheiden.
#
# Anonymitaet: Der Klartext-Raumname erreicht den Server NIE — der Client
# schickt nur SHA-256("glappa-pgp-room:v1:" + name). Alle /pgp-Requests
# sind POSTs (nichts Identifizierendes in URLs/Query-Strings), IPs werden
# nirgends persistiert (nur fluechtig im RAM fuers Rate-Limit), und der
# Apache-vhost nimmt /api/pgp/ komplett aus dem Access-Log. Namen sind
# frei gewaehlte Pseudonyme, Zeitstempel nur minutengenau.
# ══════════════════════════════════════════════════════════════════
PGP_FILE        = os.path.join(DOWNLOAD_DIR, 'pgpchat.json')
PGP_LOCK        = threading.Lock()
PGP_ROOM_RE     = re.compile(r'[0-9a-f]{64}')   # SHA-256-Hash des Raumnamens
PGP_FP_RE       = re.compile(r'[0-9A-F]{40}|[0-9A-F]{64}')  # v4- bzw. v6-Key-Fingerprint
PGP_MAX_ROOMS   = 200
PGP_MAX_MEMBERS = 20
PGP_MAX_MSGS    = 200              # pro Raum behalten (Ringpuffer)
PGP_MAX_KEY     = 12000            # armored Public Key
# Dateien (Drag & Drop) sind auch nur armored PGP-Blobs — aber grosse.
# Alles ueber PGP_INLINE_MAX wandert als eigene Datei nach PGP_FILES_DIR,
# damit nicht jeder Heartbeat-Save das JSON samt Megabytes neu schreibt;
# im JSON steht dann nur {fid, fsize} und /pgp/file/<fid> liefert den Blob.
PGP_INLINE_MAX  = 12000                # bis hierhin wohnt der Blob im JSON
PGP_MAX_FILE    = 10 * 1024 * 1024     # groesster armored Blob (~7 MB Rohdatei)
PGP_ROOM_BYTES  = 40 * 1024 * 1024     # Blob-Summe je Raum (Texte + Dateien)
PGP_FILES_DIR   = os.path.join(DOWNLOAD_DIR, 'pgpfiles')
PGP_MAX_NAME    = 24
PGP_MEMBER_TTL  = 300              # sek ohne Poll -> aus dem Roster
PGP_ROOM_TTL    = 3 * 86400        # sek ohne Aktivitaet -> Raum geloescht
# ── Live-Uebertragung fuer GROSSE Dateien (NICHT persistiert) ──────
# Grosse Dateien laufen als Chunk-Strom durch: der Client zerlegt die
# Datei in ~4-MB-Scheiben und verschluesselt JEDE einzeln. Ein Chunk
# liegt nur in PGP_XFER_DIR, bis ihn alle Empfaenger abgeholt haben
# (oder die TTL zuschlaegt), und wird dann SOFORT geloescht — es liegen
# nie mehr als PGP_XWINDOW Bytes je Raum herum (Flusskontrolle: der
# Sender muss warten, bis die Empfaenger nachkommen), und im Verlauf
# (msgs) taucht die Datei gar nicht auf. Nichts wird gespeichert.
PGP_XFER_DIR    = os.path.join(DOWNLOAD_DIR, 'pgpxfers')
PGP_XCHUNK_MAX  = 6 * 1024 * 1024      # armored Chunk (~4 MB roh)
PGP_XTOTAL_MAX  = 64                   # Chunks je Transfer (~256 MB roh)
PGP_XWINDOW     = 24 * 1024 * 1024     # unabgeholte Bytes je Raum
PGP_XFER_TTL    = 1800                 # sek ohne Aktivitaet -> Transfer weg
PGP_XFERS_MAX   = 3                    # gleichzeitige Transfers je Raum
PGP_TID_RE      = re.compile(r'[0-9a-f]{32}')

def _pgp_load():
    try:
        with open(PGP_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def _pgp_save(rooms):
    tmp = PGP_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(rooms, f)
    os.replace(tmp, PGP_FILE)

def _pgp_msg_bytes(m) -> int:
    return len(m.get('body') or '') + int(m.get('fsize') or 0)

def _pgp_del_file(m):
    """Blob-Datei einer Nachricht mit entsorgen (falls sie eine hat)."""
    fid = m.get('fid')
    if not fid:
        return
    try:
        os.remove(os.path.join(PGP_FILES_DIR, fid + '.asc'))
    except OSError:
        pass

def _pgp_xfer_del(x):
    """Alle noch liegenden Chunk-Dateien eines Live-Transfers loeschen."""
    for c in (x.get('chunks') or {}).values():
        try:
            os.remove(os.path.join(PGP_XFER_DIR, (c.get('fid') or '?') + '.asc'))
        except OSError:
            pass

def _pgp_prune(rooms) -> bool:
    """Tote Raeume und Mitglieder ohne Heartbeat entsorgen. True = geaendert."""
    now = time.time()
    changed = False
    for rname in list(rooms):
        room = rooms[rname]
        if now - (room.get('ts') or 0) > PGP_ROOM_TTL:
            for m in room.get('msgs') or []:
                _pgp_del_file(m)
            for x in (room.get('xfers') or {}).values():
                _pgp_xfer_del(x)
            del rooms[rname]
            changed = True
            continue
        for fp in list(room.get('keys') or {}):
            if now - (room['keys'][fp].get('seen') or 0) > PGP_MEMBER_TTL:
                del room['keys'][fp]
                changed = True
        # Haengengebliebene Live-Transfers (Sender/Empfaenger weg) entsorgen
        for tid in list(room.get('xfers') or {}):
            if now - (room['xfers'][tid].get('ts') or 0) > PGP_XFER_TTL:
                _pgp_xfer_del(room['xfers'][tid])
                del room['xfers'][tid]
                changed = True
    # Waisen-Blobs wegraeumen (Crash zwischen Datei-Write und JSON-Save):
    # alles, was kein Raum mehr referenziert und aelter als 1h ist.
    try:
        have = {m.get('fid') for room in rooms.values()
                for m in room.get('msgs') or []}
        for p in glob.glob(os.path.join(PGP_FILES_DIR, '*.asc')):
            if os.path.basename(p)[:-4] not in have and now - os.path.getmtime(p) > 3600:
                os.remove(p)
        have_x = {c.get('fid') for room in rooms.values()
                  for x in (room.get('xfers') or {}).values()
                  for c in (x.get('chunks') or {}).values()}
        for p in glob.glob(os.path.join(PGP_XFER_DIR, '*.asc')):
            if os.path.basename(p)[:-4] not in have_x and now - os.path.getmtime(p) > 3600:
                os.remove(p)
    except OSError:
        pass
    return changed

def _pgp_roster(room):
    return [{'fp': fp, 'name': m.get('name') or '?', 'key': m.get('key') or ''}
            for fp, m in sorted((room.get('keys') or {}).items(),
                                key=lambda kv: kv[1].get('joined') or 0)]

@Downloader.route('/pgp/join', methods=['POST', 'OPTIONS'])
def pgp_join():
    if request.method == 'OPTIONS':
        resp = jsonify({'ok': True})
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return _cors_resp(resp)

    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '?').split(',')[0].strip()
    if not _chat_rate_ok(f'pgpjoin:{ip}', limit=12):
        return _cors_resp(jsonify({'error': 'Langsam! Max. 12 Beitritte pro Minute.'})), 429

    data  = request.get_json(force=True, silent=True) or {}
    rname = (data.get('room') or '').strip().lower()
    name  = ' '.join((data.get('name') or '').split())[:PGP_MAX_NAME]
    fp    = (data.get('fp') or '').strip().upper()
    key   = (data.get('key') or '').strip()
    if not PGP_ROOM_RE.fullmatch(rname):
        return _cors_resp(jsonify({'error': 'Kaputte Raum-ID.'})), 400
    if not name:
        return _cors_resp(jsonify({'error': 'Name fehlt.'})), 400
    if not PGP_FP_RE.fullmatch(fp):
        return _cors_resp(jsonify({'error': 'Kaputter Fingerprint.'})), 400
    if (not key.startswith('-----BEGIN PGP PUBLIC KEY BLOCK-----')
            or len(key) > PGP_MAX_KEY):
        return _cors_resp(jsonify({'error': 'Das ist kein armored Public Key.'})), 400

    now = time.time()
    with PGP_LOCK:
        rooms = _pgp_load()
        _pgp_prune(rooms)
        room = rooms.get(rname)
        if room is None:
            if len(rooms) >= PGP_MAX_ROOMS:
                return _cors_resp(jsonify({'error': 'Alle Raeume belegt. Spaeter nochmal.'})), 507
            room = rooms[rname] = {'seq': 0, 'ts': now, 'keys': {}, 'msgs': []}
        entry = room['keys'].get(fp)
        # Schluessel-Bindung: derselbe Fingerprint darf NIE mit einem anderen
        # Key ueberschrieben werden — sonst koennte ein Angreifer einen
        # Empfaenger-Slot kapern und kuenftige Nachrichten an sich umleiten.
        if entry and entry.get('key') != key:
            return _cors_resp(jsonify({'error': 'Dieser Fingerprint ist schon mit einem anderen Schluessel im Raum.'})), 409
        if entry is None and len(room['keys']) >= PGP_MAX_MEMBERS:
            return _cors_resp(jsonify({'error': f'Raum voll (max. {PGP_MAX_MEMBERS} Leute).'})), 507
        room['keys'][fp] = {'name': name, 'key': key, 'seen': now,
                            'joined': (entry or {}).get('joined') or now}
        room['ts'] = now
        _pgp_save(rooms)
        return _cors_resp(jsonify({'ok': True, 'seq': room['seq'],
                                   'roster': _pgp_roster(room)}))

# POST statt GET, obwohl es "nur lesen" ist: Raum-ID und Fingerprint sollen
# in keinem Request-Log (URL/Query-String) landen — POST-Bodies loggt keiner.
@Downloader.route('/pgp/poll', methods=['POST', 'OPTIONS'])
def pgp_poll():
    if request.method == 'OPTIONS':
        resp = jsonify({'ok': True})
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return _cors_resp(resp)

    data  = request.get_json(force=True, silent=True) or {}
    rname = (data.get('room') or '').strip().lower()
    fp    = (data.get('fp') or '').strip().upper()
    try:
        since = int(data.get('since') or 0)
    except (TypeError, ValueError):
        since = 0
    if not PGP_ROOM_RE.fullmatch(rname):
        return _cors_resp(jsonify({'error': 'Kaputte Raum-ID.'})), 400

    now = time.time()
    with PGP_LOCK:
        rooms = _pgp_load()
        changed = _pgp_prune(rooms)
        room = rooms.get(rname)
        if room is None:
            if changed:
                _pgp_save(rooms)
            return _cors_resp(jsonify({'error': 'Raum existiert nicht (mehr).'})), 404
        me = room['keys'].get(fp)
        if me is not None and now - (me.get('seen') or 0) > 45:
            # Heartbeat nur alle ~45s auf Platte — sonst schreibt jeder Poll
            # (alle paar Sekunden pro Mitglied) das ganze JSON neu.
            me['seen'] = now
            changed = True
        if changed:
            _pgp_save(rooms)
        msgs = [m for m in room['msgs'] if m['seq'] > since]
        # Live-Transfers, aus denen DIESER Empfaenger noch Chunks holen muss
        xl = []
        for tid, x in (room.get('xfers') or {}).items():
            if fp == x.get('fp') or fp not in (x.get('to') or []):
                continue
            ready = sorted(int(i) for i, c in (x.get('chunks') or {}).items()
                           if fp not in (c.get('got') or []))
            if ready:
                xl.append({'tid': tid, 'fp': x['fp'], 'total': x['total'],
                           'ready': ready})
        return _cors_resp(jsonify({'seq': room['seq'], 'member': me is not None,
                                   'roster': _pgp_roster(room), 'msgs': msgs,
                                   'xfers': xl}))

@Downloader.route('/pgp/send', methods=['POST', 'OPTIONS'])
def pgp_send():
    if request.method == 'OPTIONS':
        resp = jsonify({'ok': True})
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return _cors_resp(resp)

    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '?').split(',')[0].strip()
    if not _chat_rate_ok(f'pgpsend:{ip}', limit=30):
        return _cors_resp(jsonify({'error': 'Langsam! Max. 30 Nachrichten pro Minute.'})), 429

    data  = request.get_json(force=True, silent=True) or {}
    rname = (data.get('room') or '').strip().lower()
    fp    = (data.get('fp') or '').strip().upper()
    body  = (data.get('body') or '').strip()
    if not PGP_ROOM_RE.fullmatch(rname) or not PGP_FP_RE.fullmatch(fp):
        return _cors_resp(jsonify({'error': 'Kaputte Anfrage.'})), 400
    if (not body.startswith('-----BEGIN PGP MESSAGE-----')
            or len(body) > PGP_MAX_FILE):
        return _cors_resp(jsonify({'error': 'Nur armored PGP-Nachrichten (max. ~7 MB Datei).'})), 400

    now = time.time()
    with PGP_LOCK:
        rooms = _pgp_load()
        _pgp_prune(rooms)
        room = rooms.get(rname)
        if room is None or fp not in room['keys']:
            return _cors_resp(jsonify({'error': 'Du bist (nicht mehr) im Raum — bitte neu beitreten.'})), 403
        room['seq'] += 1
        room['keys'][fp]['seen'] = now
        room['ts'] = now
        entry = {
            'seq': room['seq'],
            # bewusst nur minutengenau — sekundengenaue Zeitstempel braucht
            # niemand, und weniger Metadaten = weniger Korrelierbarkeit
            'ts':  datetime.now(_BERLIN_TZ).strftime('%Y-%m-%d %H:%M'),
            'fp':  fp,
        }
        if len(body) > PGP_INLINE_MAX:
            # Datei-Blob: eigene Datei statt JSON (siehe Konstanten oben)
            os.makedirs(PGP_FILES_DIR, exist_ok=True)
            fid = secrets.token_hex(16)
            with open(os.path.join(PGP_FILES_DIR, fid + '.asc'), 'w') as f:
                f.write(body)
            entry['fid'] = fid
            entry['fsize'] = len(body)
        else:
            entry['body'] = body
        room['msgs'].append(entry)
        # Ringpuffer: Anzahl UND Byte-Summe deckeln — beim Rauswerfen die
        # Blob-Dateien mit loeschen, sonst sammeln sich Leichen an
        while len(room['msgs']) > PGP_MAX_MSGS or (
                len(room['msgs']) > 1 and
                sum(_pgp_msg_bytes(m) for m in room['msgs']) > PGP_ROOM_BYTES):
            _pgp_del_file(room['msgs'].pop(0))
        _pgp_save(rooms)
        return _cors_resp(jsonify({'ok': True, 'seq': room['seq']}))

# ── Live-Uebertragung grosser Dateien (siehe Konstanten oben) ──────
# xup: Sender laedt Chunk i/total hoch. Antwort {'wait': True} heisst:
# Fenster voll, spaeter nochmal (Flusskontrolle — so liegen nie mehr als
# PGP_XWINDOW Bytes je Raum auf Platte). Empfaenger-Liste wird beim
# ersten Chunk eingefroren (wie bei Nachrichten: wer spaeter kommt,
# bekommt nichts). Chunks sind nur Ciphertext.
@Downloader.route('/pgp/xup', methods=['POST', 'OPTIONS'])
def pgp_xup():
    if request.method == 'OPTIONS':
        resp = jsonify({'ok': True})
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return _cors_resp(resp)

    ip = request.headers.get('X-Forwarded-For', request.remote_addr or '?').split(',')[0].strip()
    if not _chat_rate_ok(f'pgpxup:{ip}', limit=120):
        return _cors_resp(jsonify({'error': 'Langsam! Zu viele Chunks pro Minute.'})), 429

    data  = request.get_json(force=True, silent=True) or {}
    rname = (data.get('room') or '').strip().lower()
    fp    = (data.get('fp') or '').strip().upper()
    tid   = (data.get('tid') or '').strip().lower()
    body  = (data.get('body') or '').strip()
    try:
        idx, total = int(data.get('idx')), int(data.get('total'))
    except (TypeError, ValueError):
        return _cors_resp(jsonify({'error': 'Kaputte Anfrage.'})), 400
    if (not PGP_ROOM_RE.fullmatch(rname) or not PGP_FP_RE.fullmatch(fp)
            or not PGP_TID_RE.fullmatch(tid)
            or not 0 <= idx < total <= PGP_XTOTAL_MAX):
        return _cors_resp(jsonify({'error': 'Kaputte Anfrage.'})), 400
    if (not body.startswith('-----BEGIN PGP MESSAGE-----')
            or len(body) > PGP_XCHUNK_MAX):
        return _cors_resp(jsonify({'error': 'Nur armored PGP-Chunks (max. ~4 MB roh).'})), 400

    now = time.time()
    with PGP_LOCK:
        rooms = _pgp_load()
        _pgp_prune(rooms)
        room = rooms.get(rname)
        if room is None or fp not in room['keys']:
            return _cors_resp(jsonify({'error': 'Du bist (nicht mehr) im Raum — bitte neu beitreten.'})), 403
        xfers = room.setdefault('xfers', {})
        x = xfers.get(tid)
        if x is None:
            if len(xfers) >= PGP_XFERS_MAX:
                return _cors_resp(jsonify({'error': f'Max. {PGP_XFERS_MAX} Live-Uebertragungen gleichzeitig je Raum.'})), 507
            to = [k for k in room['keys'] if k != fp]
            if not to:
                return _cors_resp(jsonify({'error': 'Niemand im Raum, der empfangen koennte.'})), 400
            x = xfers[tid] = {'fp': fp, 'to': to, 'total': total, 'ts': now,
                              'chunks': {}, 'updone': []}
        if x['fp'] != fp or x['total'] != total:
            return _cors_resp(jsonify({'error': 'Transfer-Daten passen nicht zusammen.'})), 409
        if idx in x['updone']:
            return _cors_resp(jsonify({'ok': True}))    # Retry -> idempotent
        pending = sum(c.get('size') or 0 for xx in xfers.values()
                      for c in (xx.get('chunks') or {}).values())
        if pending + len(body) > PGP_XWINDOW:
            return _cors_resp(jsonify({'ok': False, 'wait': True}))
        os.makedirs(PGP_XFER_DIR, exist_ok=True)
        fid = secrets.token_hex(16)
        with open(os.path.join(PGP_XFER_DIR, fid + '.asc'), 'w') as f:
            f.write(body)
        x['chunks'][str(idx)] = {'fid': fid, 'size': len(body), 'got': []}
        x['updone'].append(idx)
        x['ts'] = now
        room['ts'] = now
        _pgp_save(rooms)
        return _cors_resp(jsonify({'ok': True}))

# xget: Empfaenger holt Chunk ab. Sobald ALLE Empfaenger einen Chunk
# haben, fliegt seine Datei sofort von der Platte. skip=True quittiert
# nur (fuer Clients, die den Transfer nicht entschluesseln koennen —
# z.B. private Live-Datei an jemand anderen), ohne die Daten zu senden.
@Downloader.route('/pgp/xget', methods=['POST', 'OPTIONS'])
def pgp_xget():
    if request.method == 'OPTIONS':
        resp = jsonify({'ok': True})
        resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return _cors_resp(resp)

    data  = request.get_json(force=True, silent=True) or {}
    rname = (data.get('room') or '').strip().lower()
    fp    = (data.get('fp') or '').strip().upper()
    tid   = (data.get('tid') or '').strip().lower()
    skip  = bool(data.get('skip'))
    try:
        idx = int(data.get('idx'))
    except (TypeError, ValueError):
        return _cors_resp(jsonify({'error': 'Kaputte Anfrage.'})), 400
    if (not PGP_ROOM_RE.fullmatch(rname) or not PGP_FP_RE.fullmatch(fp)
            or not PGP_TID_RE.fullmatch(tid) or idx < 0):
        return _cors_resp(jsonify({'error': 'Kaputte Anfrage.'})), 400

    now = time.time()
    with PGP_LOCK:
        rooms = _pgp_load()
        _pgp_prune(rooms)
        room = rooms.get(rname)
        if room is None or fp not in room['keys']:
            return _cors_resp(jsonify({'error': 'Du bist (nicht mehr) im Raum — bitte neu beitreten.'})), 403
        x = (room.get('xfers') or {}).get(tid)
        if x is None:
            return _cors_resp(jsonify({'error': 'Uebertragung vorbei (oder abgelaufen).'})), 404
        if fp not in (x.get('to') or []):
            return _cors_resp(jsonify({'error': 'Nicht fuer dich.'})), 403
        c = x['chunks'].get(str(idx))
        if c is None:
            return _cors_resp(jsonify({'error': 'Chunk (noch) nicht da.'})), 404
        payload = None
        if not skip:
            try:
                with open(os.path.join(PGP_XFER_DIR, c['fid'] + '.asc'), 'r') as f:
                    payload = f.read()
            except OSError:
                del x['chunks'][str(idx)]
                _pgp_save(rooms)
                return _cors_resp(jsonify({'error': 'Chunk-Datei weg (aufgeraeumt).'})), 404
        if fp not in c['got']:
            c['got'].append(fp)
        if set(x['to']) <= set(c['got']):
            # alle haben ihn -> sofort von der Platte
            try:
                os.remove(os.path.join(PGP_XFER_DIR, c['fid'] + '.asc'))
            except OSError:
                pass
            del x['chunks'][str(idx)]
        x['ts'] = now
        if len(x['updone']) >= x['total'] and not x['chunks']:
            del room['xfers'][tid]      # komplett zugestellt -> Transfer weg
        _pgp_save(rooms)
        return _cors_resp(jsonify({'ok': True, 'data': payload}))

# Blob-Abholung. GET mit zufaelliger 128-bit-ID: nicht erratbar, sagt nichts
# ueber Raum/Absender aus, und /api/pgp/ steht eh nicht im Access-Log.
# Inhalt ist ohnehin nur Ciphertext — ohne passenden Private Key wertlos.
@Downloader.route('/pgp/file/<fid>')
def pgp_file(fid: str):
    if not re.fullmatch(r'[0-9a-f]{32}', fid):
        return _cors_resp(jsonify({'error': 'Kaputte Datei-ID.'})), 400
    path = os.path.join(PGP_FILES_DIR, fid + '.asc')
    if not os.path.isfile(path):
        return _cors_resp(jsonify({'error': 'Blob weg (abgelaufen oder aufgeraeumt).'})), 404
    with open(path, 'r') as f:
        data = f.read()
    return _cors_resp(Response(data, mimetype='text/plain'))


@Downloader.errorhandler(Exception)
def handle_error(e):
    # HTTPException (z.B. 404 fuer unbekannte Routen, ausgeloest von den
    # ueblichen .env/.git-Scanner-Bots) hat schon den richtigen Code + eine
    # harmlose Nachricht - die soll auch als solche rausgehen, nicht als 500.
    # Fuer echte, unerwartete Exceptions: Client bekommt nur eine generische
    # Meldung, kein str(e) (koennte interne Pfade/Details leaken); Details
    # landen im Server-Log.
    if isinstance(e, HTTPException):
        return jsonify({'error': e.description}), e.code
    Downloader.logger.exception('Unhandled error')
    return jsonify({'error': 'Internal Server Error'}), 500


if __name__ == '__main__':
    # Lokal-Dev: Firefox-Cookies als Default, damit Bot-Check kein Showstopper ist.
    # Im Container/Production wird das ueber env vars / gunicorn gesteuert.
    if not os.environ.get('YT_COOKIE_FILE') and not os.environ.get('YT_COOKIE_BROWSER'):
        os.environ['YT_COOKIE_BROWSER'] = 'firefox'

    # Production UND Lokal/Dev jetzt einheitlich :8080 (Dev = Plain HTTP, Prod = HTTPS).
    port = int(os.environ.get('DOWNLOADER_PORT', '0'))
    host = os.environ.get('DOWNLOADER_HOST', '0.0.0.0')
    if context is not None:
        Downloader.run(host=host, port=port or 8080, ssl_context=context,
                       threaded=True, debug=False)
    else:
        print(f'[YT.DL] Dev mode (no SSL). Listening on http://{host}:{port or 8080}/')
        Downloader.run(host=host, port=port or 8080,
                       threaded=True, debug=False)
