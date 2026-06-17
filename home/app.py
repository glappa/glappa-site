from flask import Flask, Response, request, send_file, jsonify
import os, re, ssl, sys, json, uuid, threading, queue, time, glob

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
<link rel="icon" href="{glappa}/img/favicon.ico">
<style>
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
    background-image: url('{glappa}/img/gif/background.gif');
    background-repeat: repeat;
    background-attachment: fixed;
    color: #fff;
    font-family: "Comic Sans MS", "Comic Sans", cursive, sans-serif;
    cursor: url('{glappa}/coursor/WoW%20Cursor.cur'), auto;
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
    font-family: "Comic Sans MS", "Comic Sans", cursive, sans-serif;
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
    font-family: "Comic Sans MS", cursive, sans-serif;
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
    font-family: "Comic Sans MS", cursive, sans-serif;
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

  <div class="marquee">
    <span>&#9733; YT.DL &#9733; MP3 / MP4 RIPPER &#9733; POWERED BY GLAPPA &#9733; </span>
  </div>

  <header class="header">
    <img class="alien" src="{glappa}/img/gif/alien-dance.gif" alt="" width="70" height="98">
    <div class="page-banner yellow">
      <h2>YT ▸ RIP ▸ MP3</h2>
<pre>
   .--------------------.
   | [O]  ░ TAPE ░  [O] |
   |  rip them all yo   |
   '--------------------'
</pre>
    </div>
    <img class="alien" src="{glappa}/img/gif/alien-dance.gif" alt="" width="70" height="98">
  </header>

  <h1 class="title">YT<em>.</em>DL</h1>
  <p class="sub">YouTube &nbsp;&#9733;&nbsp; MP3 / MP4 &nbsp;&#9733;&nbsp;
    <a href="https://home.glappa.de">home.glappa.de</a>
  </p>

  <nav class="nav">
    <a href="{glappa}/index.html">&larr; Glappa</a>
    <span class="sep">|</span>
    <a href="{glappa}/page1.html">Video</a>
    <span class="sep">|</span>
    <a href="{glappa}/bounce.html">Bounce</a>
    <span class="sep">|</span>
    <a href="{home}">Home</a>
    <span class="sep">|</span>
    <a href="{glappa}/secret/pilzskip.html">SUPER Secret Page</a>
  </nav>

  <div class="construction">
    <img class="rocket" src="{glappa}/img/gif/rocket3.gif" alt="" aria-hidden="true">
    <img src="{glappa}/img/gif/Under_Construction.gif" alt="Under Construction">
    <img class="rocket rocket--flip" src="{glappa}/img/gif/Rocket.gif" alt="" aria-hidden="true">
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
      <img class="rocket" src="{glappa}/img/gif/rocket3.gif" alt="" aria-hidden="true">
      <img src="{glappa}/img/gif/Under_Construction.gif" alt="Under Construction">
      <img class="rocket rocket--flip" src="{glappa}/img/gif/Rocket.gif" alt="" aria-hidden="true">
    </div>

    <div class="footer-actions">
      <a href="mailto:lex@glappa.de?subject=Your Website so COOL! ;)">
        <img src="{glappa}/img/gif/animail1.gif" alt="You Got Mail!" width="88" height="31">
      </a>
      <a href="{glappa}/index.html">
        <img src="{glappa}/img/gif/anihome1.gif" alt="Home" width="88" height="31">
      </a>
    </div>

    <p class="copyright">Copyright <span id="year"></span>, Glappa</p>

    <div class="firefox">
      <a href="https://www.firefox.com">
        <img src="{glappa}/img/gif/userlovefirefox7dm4aroh2dt9.gif" alt="GO DOWNLOAD FIREFOX!">
      </a>
    </div>

    <div class="badges">
      <img src="{glappa}/img/gif/allbrowsers.gif" alt="">
      <img src="{glappa}/img/gif/blinktastic_spongebob.gif" alt="">
      <img src="{glappa}/img/gif/browser1.gif" alt="">
      <img src="{glappa}/img/gif/browsers.gif" alt="">
      <img src="{glappa}/img/gif/counter3.gif" alt="">
      <img src="{glappa}/img/gif/external-content.duckduckgo.com.gif" alt="">
      <img src="{glappa}/img/gif/hacker.gif" alt="">
      <img src="{glappa}/img/gif/hugsnotdrugs.gif" alt="">
    </div>

    <div class="marquee">
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
    return 'https://home.glappa.de/tunes.html'


# ── Routes ────────────────────────────────────────────────────────
@Downloader.route('/')
def index():
    glappa = _glappa_base()
    html = INDEX_HTML_TEMPLATE.format(glappa=glappa, home=_home_url(glappa), tunes=_tunes_url(glappa))
    return html, 200, {'Content-Type': 'text/html; charset=utf-8'}


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
    """Allow cross-origin from glappa.de + localhost."""
    origin = request.headers.get('Origin', '')
    allowed = ('https://glappa.de', 'http://glappa.de',
               'https://www.glappa.de', 'http://www.glappa.de',
               'http://localhost:8099', 'http://127.0.0.1:8099')
    if origin in allowed or origin.startswith(('http://192.168.', 'http://10.')):
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


@Downloader.errorhandler(Exception)
def handle_error(e):
    return jsonify({'error': str(e)}), 500


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
