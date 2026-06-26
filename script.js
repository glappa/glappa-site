// ---------- Sounds ----------
const welcomeSound = new Audio('mp3/welcome.mp3');
const mailSound = new Audio('mp3/yougotmail.mp3');

function bindSound(el, sound) {
  if (!el) return;
  el.addEventListener('click', () => {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  });
}
bindSound(document.getElementById('welcomeImg'), welcomeSound);
bindSound(document.getElementById('mailImg'), mailSound);

// ---------- Copyright-Jahr ----------
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ---------- Besucherzaehler (server-side, file-persistent) ----------
// app.py speichert pro Visitor-ID (Cookie + IP/UA-Hash Fallback) genau einmal.
// F5 zaehlt nicht hoch, derselbe Browser bleibt gleiche ID.
//
// Endpoint laeuft jetzt unter https://search.glappa.de/api/counter/ (Standard-
// Port 443 via Apache reverse_proxy). Vorher war's home.glappa.de:8080 direkt
// — Port 8080 wird in Mobilfunk / Office-WLAN oft geblockt, daher der Wechsel.
(function () {
  const el = document.getElementById('visitorCounter');
  if (!el) return;

  // Bestimme Counter-Endpoint je nach Umgebung.
  // home/search.glappa.de: SAME-ORIGIN via Apache-Proxy (/api/counter) →
  //   kein CORS, First-Party-Cookie, bombensicher.
  // Webhoster glappa.de (kein Backend): cross-origin zur VPS (CORS-Allowlist).
  const h = location.hostname;
  const isLocal = (h === 'localhost' || h === '127.0.0.1'
                   || h.startsWith('192.168.') || h.startsWith('10.'));
  let base;
  if (isLocal) {
    base = `${location.protocol}//${h}:8080/counter`;
  } else if (h === 'home.glappa.de' || h === 'search.glappa.de') {
    base = '/api/counter';                       // same-origin
  } else {
    base = 'https://home.glappa.de/api/counter'; // glappa.de → cross-origin
  }
  const site = (location.pathname.split('/').filter(Boolean).slice(-1)[0] || 'index')
                 .replace(/\.html$/, '');

  fetch(`${base}/visit?site=${encodeURIComponent(site)}`, {
    method: 'POST', credentials: 'include',
  })
    .then(r => r.json())
    .then(d => { el.textContent = String(d.count || 0).padStart(7, '0'); })
    .catch((err) => {
      console.warn('[counter] POST failed, trying GET fallback:', err);
      // GET-Fallback ohne Cookie — zeigt zumindest die aktuelle Zahl an,
      // auch wenn third-party-cookies geblockt sind.
      fetch(`${base}/visits?site=${encodeURIComponent(site)}`)
        .then(r => r.json())
        .then(d => { el.textContent = String(d.count || 0).padStart(7, '0'); })
        .catch(() => { el.textContent = '0000000'; });
    });
})();

// ---------- Random Marquee-Sprueche (dynamic, refresh per cycle) ----------
(function () {
  const SAYINGS = [
    // Retro / Web 1.0
    '★ WELCOME 2 THE WEB ★', '★ AOL KEYWORD: GLAPPA ★',
    '★ BEST VIEWED IN NETSCAPE 4 ★', '★ POWERED BY DIAL-UP ★',
    '★ MY OTHER SITE IS A MYSPACE ★', '★ Y2K SURVIVAL KIT INSIDE ★',
    '★ HAMSTERDANCE 4EVER ★', '★ SIGN MY GUESTBOOK ★',
    '★ DO NOT DEFLECT MAGNETIC TAPE ★', '★ UNDER CONSTRUCTION ★',
    '★ BEST VIEWED IN 800x600 ★', '★ POWERED BY ANGELFIRE ★',
    '★ THIS PAGE LOADED IN 47 SECONDS ★', '★ U R VISITOR #1337 ★',

    // Meme klassiker
    '★ ALL UR BASE R BELONG 2 US ★', '★ HACK THE PLANET ★',
    '★ MORE COWBELL ★', '★ THE CAKE IS A LIE ★',
    '★ I CAN HAS CHEEZBURGER? ★', '★ NO STEP ON SNEK ★',
    '★ DRINK YOUR OVALTINE ★', '★ POG CHAMP ★',
    '★ THIS IS FINE ★', '★ AND I OOP ★',
    '★ SUSSY BAKA ★', '★ GIGACHAD APPROVED ★',
    '★ SKIBIDI TOILET ★', '★ FANUM TAX ★',

    // Glappa-Flavor
    '★ GREETZ 2 ALL MY HOMIES ★', '★ THANX 4 VISITING ★',
    '★ HONK IF U LOVE GIFS ★', '★ ARE WE COOL YET ★',
    '★ FIRST RULE: DONT TALK ABOUT GLAPPA ★', '★ GLAPPA APPROVED ★',
    '★ TOUCH GRASS LATER ★', '★ INSERT COIN 2 CONTINUE ★',
    '★ THIS IS NOT A DRILL ★', '★ MADE WITH 100% RECYCLED PIXELS ★',
    '★ GLAPPA: ITS LIT ★',

    // Kaomoji & ASCII
    '( ͡° ͜ʖ ͡°) RAISE UR DONGERS ( ͡° ͜ʖ ͡°)',
    'ʕ•ᴥ•ʔ KUMA SAYS HI ʕ•ᴥ•ʔ',
    '¯\\_(ツ)_/¯ SHRUG IT OFF',
    '(╯°□°)╯︵ ┻━┻ FLIP IT', '┬─┬ ノ( ゜-゜ノ) PUT IT BACK',
    '( •_•) ( •_•)>⌐■-■ (⌐■_■) DEAL WITH IT',
    '(づ｡◕‿‿◕｡)づ HUGS FROM GLAPPA',
    '(◕‿◕✿) HAVE A NICE DAY',
    'ಠ_ಠ ARE U STILL THERE', 'ʘ‿ʘ HIIII',
    '≧◉◡◉≦ KAWAII MODE', '( •̀ᴗ•́ )و SUCCESS',
    '٩(◕‿◕)۶ YAYYY', '(ㆆ_ㆆ) SUSPICIOUS',
    '(╬ ಠ益ಠ) RAGE QUIT', 'ᕦ(ò_óˇ)ᕤ STRONK',
    '(҂◡_◡)  ᕤ NO BRAINS', '(˵ ͡° ͜ʖ ͡°˵) YOU KNOW',
    'd(⌐□_□)b VIBIN',

    // Geek / Code
    '404: COOLNESS NOT FOUND', 'HTTP 200 OK / VIBES ACCEPTED',
    'sudo rm -rf /world', 'CTRL+ALT+CHILL',
    '01001000 01001001 :)', 'cd / && rm -rf monday',
    'while(coffee--) { code(); }', 'git push --force --to-prod',
    'CSS IS NOT TURING COMPLETE BUT IT TRIES',
    'THERE ARE 10 TYPES OF PEOPLE', '> select cool from glappa;',
    'STACK OVERFLOW: NOT TODAY', '127.0.0.1 - HOME SWEET HOME',
    'PING glappa.de 64 bytes of fun',

    // ASCII / Glitch
    '▀▄▀▄ LOADING... PLEASE WAIT ▄▀▄▀',
    '▓▒░ ENTER THE VOID ░▒▓',
    '[█████████████░░░] 87%',
    '[▓▓▓▓▓░░░░░░░░░░] 33% FUN',
    '╔═══╗ ERROR ╔═══╗',
    '░░░ GLITCH IN THE MATRIX ░░░',
    '▌║█║▌ BUFFER OVERFLOW ▌║█║▌',
    '╳╳╳ FATAL EXCEPTION ╳╳╳',
    '◢◤ DANGER ◢◤ DANGER ◢◤',

    // Y2K / 2000s vibes
    '♫ DANCING IN THE SERVER ROOM ♪',
    '♪ DIAL-UP MODEM NOISES ♪',
    'WARNING: HIGH RADNESS DETECTED',
    'THE INTERNET IS A SERIES OF TUBES',
    'NEW: ANIMATED CURSORS!', 'GET YOUR FREE IPOD!',
    'YOU HAVE WON $1,000,000', 'BONZI BUDDY MISSES YOU',
    'PLEASE INSERT FLOPPY DISK #2',
    'ASL? 25/M/INTERNET', 'BRB MOM CALLING',
    'TRRRRR-DRRRRRR-EEEEEE (modem)',

    // Random absurdity
    'BANANAS HAVE NO BONES', 'EVERY CAT IS A LIQUID',
    'COWS ARE SECRETLY VOTING', 'THE MOON IS A HOLOGRAM',
    'PIGEONS ARE GOVERNMENT DRONES', 'HOT POCKETS = COLD CENTERS',
    'WHY IS THE SKY ALWAYS BLUE WHEN U LOOK UP',
    '★ DRINK MORE WATER ★', '★ DID U FEED THE CAT ★',
    '★ STRETCH YOUR SHOULDERS ★', '★ U R DOING GREAT ★',
  ];

  function pickN(arr, n) {
    const pool = arr.slice();
    const out = [];
    while (out.length < n && pool.length) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return out;
  }
  function freshText() {
    return pickN(SAYINGS, 4).join('   ✦   ') + '   ';
  }

  document.querySelectorAll('.marquee span').forEach(span => {
    span.textContent = freshText();
    const dur = 22 + Math.random() * 16;  // 22-38s per loop
    span.style.animation = 'scroll-left ' + dur.toFixed(1) + 's linear infinite';
    // Nach jedem Scroll-Durchlauf neuen Text setzen -> es kommen
    // staendig neue Spruche durch
    span.addEventListener('animationiteration', () => {
      span.textContent = freshText();
    });
  });
})();

// ---------- Glitzer/Trippy-Trail am Cursor ----------
(function () {
  const chars  = ['✨','⭐','✧','★','✦','✸','·','💫'];
  const colors = ['#ff00ff','#00ffff','#00ff00','#ffff00','#ff66cc','#66ffcc','#ff8800'];
  let last = 0;
  window.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - last < 50) return; // throttle, sonst zu viele DOM nodes
    last = now;
    const s = document.createElement('span');
    s.className = 'sparkle';
    s.textContent = chars[Math.floor(Math.random() * chars.length)];
    s.style.left = e.clientX + 'px';
    s.style.top  = e.clientY + 'px';
    s.style.color = colors[Math.floor(Math.random() * colors.length)];
    s.style.fontSize = (10 + Math.random() * 14) + 'px';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }, { passive: true });
})();

// ---------- Konami-Code Easter Egg (nur Sound, keine Bewegung) ----------
(function () {
  const seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let pos = 0;
  window.addEventListener('keydown', (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    pos = (key === seq[pos]) ? pos + 1 : 0;
    if (pos === seq.length) {
      pos = 0;
      welcomeSound.currentTime = 0;
      welcomeSound.play().catch(() => {});
    }
  });
})();
