/* ═══════════════════════════════════════════════════════════════════════
   SUPER GLAPPA 64 — eigenes kleines 3D-Jump'n'Run im 64-Stil
   Eigene WebGL-Engine, keine Bibliotheken, keine fremden Grafiken/Musik.
   Figuren (Glappo, Grummel, Knallkiste, Toasti) sind Eigenkreationen.
   Steuerung: Tastatur, Maus, Touch und Controller (Gamepad-API).
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

  /* ═══════════ Spielstand ═══════════
     Sterne + Einstellungen bleiben (localStorage), Muenzen/Leben gelten
     nur fuer diesen Besuch. */
  const KEY = 'glappa64';
  const state = { stars: {}, doorOpen: false, sfx: true, music: false, intro: false, filter: 'crt' };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  if (!state.stars || typeof state.stars !== 'object') state.stars = {};
  if (!['crt', 'n64', 'aus'].includes(state.filter)) state.filter = 'crt';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
  const run = { coins: 0, red: 0, lives: 4, health: 8, taken: new Set(), blueGot: 0 };
  const STARS = {
    red:    { name: 'Acht rote Münzen',        where: 'Schlossgarten' },
    coins:  { name: 'Der 50-Münzen-Stern',     where: 'überall' },
    toast:  { name: 'Fang den Toaster Toasti', where: 'Schlosshalle' },
    sun:    { name: 'Ein Blick ins Sonnenlicht', where: 'Schlosshalle' },
    tower:  { name: 'Der Wachturm der Wüstenstadt', where: 'Wüstenstadt' },
    terminal: { name: 'Kennwort: GLAPPA',        where: 'Terminal-Tal' },
    video:    { name: 'Das Licht des Leuchtturms', where: 'Video-Bucht' },
    bounce:   { name: 'Ganz oben am Bounce-Berg', where: 'Bounce-Berg' },
    spuk:     { name: 'Die Wand, die lügt',       where: 'Spuk-Home' },
    uhrwerk:  { name: 'Drei verlegte Lupen',      where: 'Such-Uhrwerk' },
    fraktal:  { name: 'Im Herzen des Fraktals',   where: 'Mandelbrot-Regenbogen' },
    pilz:     { name: 'Der Pilz-Skip',            where: 'Pilzwald' },
    neon:     { name: 'Tanz der vier Ecken',      where: 'Neon-Garten' },
    serverberg: { name: 'Gipfel des Serverbergs',  where: 'Terminal-Tal' },
    wrack:      { name: 'Das Wrack in der Senke',  where: 'Video-Bucht' },
    rodel:      { name: 'Die Rodelbahn',           where: 'Bounce-Berg' },
    geister:    { name: 'Geisterjagd im Herrenhaus', where: 'Spuk-Home' },
    uhrspitze:  { name: 'Die Spitze des Uhrwerks',  where: 'Such-Uhrwerk' },
    teppich:    { name: 'Der Teppich-Express',     where: 'Mandelbrot-Regenbogen' },
    wasserfall: { name: 'Hoch über dem Wasserfall', where: 'Pilzwald' },
    synth:      { name: 'Ende der Synth-Strecke',  where: 'Neon-Garten' },
    pyramide:   { name: 'Spitze der Pyramide',     where: 'Wüstenstadt' },
    verlies:    { name: 'Tief im Verlies',         where: 'Schloss: Verlies' },
    bibliothek: { name: 'Das verbotene Buch',      where: 'Schloss: Bibliothek' },
    aquarium:   { name: 'Im Mini-Schloss',         where: 'Schloss: Aquarium' },
    musik:      { name: 'Die Schloss-Melodie',     where: 'Schloss: Musikzimmer' },
    spiel:      { name: 'Oben im Spielzimmer',     where: 'Schloss: Spielzimmer' },
    sternwarte: { name: 'Blick durchs Teleskop',   where: 'Schloss: Sternwarte' },
    huehner:    { name: 'Fünf freche Hühner',      where: 'Schlossgarten' },
    skarab:     { name: 'Die goldenen Skarabäen',  where: 'Wüstenstadt' },
    disketten:  { name: 'Drei verlorene Disketten', where: 'Terminal-Tal' },
    strandgut:  { name: 'Strandgut der Bucht',     where: 'Video-Bucht' },
    rennen:     { name: 'Wettlauf um den Berg',    where: 'Bounce-Berg' },
    kuerbis:    { name: 'Fünf Kürbislichter',      where: 'Spuk-Home' },
    leuchtpilz: { name: 'Fünf Leuchtpilze',        where: 'Pilzwald' },
    hof:        { name: 'Die Geister vom Brunnen', where: 'Schloss: Schlosshof' },
    turm:       { name: 'Ganz oben im Turm',       where: 'Schloss: Obergeschoss' },
  };
  const STAR_TOTAL = Object.keys(STARS).length;
  const starCount = () => Object.keys(STARS).filter((id) => state.stars[id]).length;

  /* ═══════════ Sound — alles live per WebAudio gepiepst ═══════════ */
  const Snd = (() => {
    let ctx = null, sfxBus = null, musicBus = null, noiseBuf = null;
    function ac() {
      if (!ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ctx = new C();
        const master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
        sfxBus = ctx.createGain(); sfxBus.gain.value = 0.6; sfxBus.connect(master);
        musicBus = ctx.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(f, at, dur, o = {}) {
      const c = ac(); if (!c) return;
      const t0 = c.currentTime + Math.max(0, at);
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(f, t0);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, f * o.slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.vol ?? 0.18, t0 + (o.attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(o.bus || sfxBus);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
    }
    function noise(at, dur, o = {}) {
      const c = ac(); if (!c) return;
      const t0 = c.currentTime + Math.max(0, at);
      const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const flt = c.createBiquadFilter(); flt.type = o.filter || 'lowpass';
      flt.frequency.setValueAtTime(o.f || 1200, t0);
      if (o.fTo) flt.frequency.exponentialRampToValueAtTime(o.fTo, t0 + dur);
      flt.Q.value = o.q || 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.vol ?? 0.3, t0 + (o.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(flt); flt.connect(g); g.connect(o.bus || sfxBus);
      src.start(t0); src.stop(t0 + dur + 0.05);
    }
    // Hall: Verzoegerung mit Rueckkopplung, fuer magische Klaenge
    let echo = null;
    function echoBus() {
      if (echo) return echo;
      const c = ac(); if (!c) return undefined;
      const input = c.createGain();
      const dl = c.createDelay(1.0); dl.delayTime.value = 0.21;
      const fb = c.createGain(); fb.gain.value = 0.45;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
      const wet = c.createGain(); wet.gain.value = 0.6;
      input.connect(sfxBus); input.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(sfxBus);
      echo = input;
      return echo;
    }
    const N = (name) => {
      const m = /^([A-G])(#?)(\d)$/.exec(name);
      const semi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
      return 440 * Math.pow(2, (semi + (+m[3] + 1) * 12 - 69) / 12);
    };
    const fx = (fn) => (...a) => { if (state.sfx) fn(...a); };

    const api = {
      unlock: () => { ac(); },
      coin:  fx(() => { tone(1175, 0, .06, { type: 'triangle', vol: .25 }); tone(1760, .05, .3, { type: 'triangle', vol: .22 }); tone(2349, .1, .2, { vol: .04 }); }),
      red:   fx((n) => {
        const f = N(['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'][Math.min(7, n - 1)]);
        tone(f, 0, .12, { type: 'triangle', vol: .3 }); tone(f * 2, .09, .3, { vol: .08 });
      }),
      blue:  fx(() => [1319, 1568, 2093].forEach((f, i) => tone(f, i * .06, .25, { vol: .1 }))),
      starAppear: fx(() => [1047, 1319, 1568, 2093, 2637, 3136].forEach((f, i) => {
        tone(f, i * .07, .35, { type: 'triangle', vol: .16 });
        tone(f, i * .07 + .2, .3, { type: 'triangle', vol: .05 });
      })),
      starGet: fx(() => {
        let t = 0;
        [['G5', .12], ['C6', .12], ['E6', .12], ['G6', .24], ['E6', .12], ['G6', .6]].forEach(([n, d]) => {
          tone(N(n), t, d * .95, { vol: .12 }); tone(N(n) / 2, t, d * .95, { type: 'triangle', vol: .22 }); t += d;
        });
      }),
      jump:  fx((lvl) => {
        tone(260 + lvl * 90, 0, .2 + lvl * .05, { vol: .1, slide: 2.4 });
        if (lvl === 3) [880, 1175, 1568].forEach((f, i) => tone(f, .08 + i * .06, .18, { type: 'triangle', vol: .09 }));
      }),
      whoosh: fx(() => { noise(0, .6, { filter: 'bandpass', f: 300, fTo: 3200, q: 1.2, vol: .35, attack: .15 }); tone(700, 0, .45, { type: 'sine', vol: .12, slide: .35 }); }),
      splash: fx(() => noise(0, .5, { filter: 'bandpass', f: 1400, fTo: 300, q: .9, vol: .35, attack: .01 })),
      stroke: fx(() => { noise(0, .35, { filter: 'bandpass', f: 700, fTo: 1800, q: 1.4, vol: .16, attack: .04 }); tone(420, 0, .18, { type: 'sine', vol: .04, slide: 1.4 }); }),
      punch: fx((n = 1) => {
        noise(0, n === 3 ? .16 : .1, { filter: 'bandpass', f: n === 3 ? 700 : 1300, fTo: n === 3 ? 250 : 500, q: 1.2, vol: .3, attack: .005 });
        tone(n === 3 ? 180 : 240 + n * 40, 0, n === 3 ? .16 : .1, { type: 'triangle', vol: .16, slide: .5 });
      }),
      dive:  fx(() => { noise(0, .35, { filter: 'bandpass', f: 500, fTo: 2400, q: 1, vol: .25, attack: .03 }); tone(330, 0, .25, { type: 'triangle', vol: .12, slide: 1.8 }); }),
      grab:  fx(() => { tone(330, 0, .07, { type: 'triangle', vol: .16 }); noise(0, .08, { filter: 'bandpass', f: 1600, q: 2, vol: .12 }); }),
      climb: fx(() => { tone(392, 0, .09, { type: 'triangle', vol: .12, slide: 1.5 }); tone(587, .08, .12, { type: 'triangle', vol: .1 }); }),
      // Magischer Eintauch-Klang: Glitzer-Glissando, aufsteigender Teppich, Bluete beim Eintauchen
      magic: fx(() => {
        const bus = echoBus();
        const scale = [0, 2, 4, 7, 9];
        for (let i = 0; i < 15; i++) {
          const f = 523.25 * Math.pow(2, (scale[i % 5] + 12 * Math.floor(i / 5)) / 12);
          tone(f, 0.05 + i * 0.052, 0.45, { type: 'triangle', vol: 0.075, bus });
          tone(f * 2.01, 0.06 + i * 0.052, 0.22, { type: 'sine', vol: 0.025, bus });
        }
        [261.63, 329.63, 392, 493.88, 587.33].forEach((f, i) => tone(f, 0.1 + i * 0.04, 2.05, { type: 'sine', vol: 0.045, attack: 0.9, slide: 2, bus }));
        noise(0.15, 1.95, { filter: 'bandpass', f: 380, fTo: 7000, q: 3, vol: 0.1, attack: 1.3, bus });
        [523.25, 659.25, 783.99, 987.77, 1318.5].forEach((f, i) => tone(f, 2.02 + i * 0.035, 1.7, { type: 'triangle', vol: 0.085, bus }));
        [2093, 2637, 3136, 4186, 5274].forEach((f, i) => tone(f, 2.08 + i * 0.08, 0.5, { type: 'sine', vol: 0.035, bus }));
        tone(130.8, 2.02, 1.4, { type: 'sine', vol: 0.12, attack: 0.02 });
      }),
      arrive: fx(() => {
        const bus = echoBus();
        [2637, 2093, 1568, 1319, 1047].forEach((f, i) => tone(f, i * 0.045, 0.4, { type: 'triangle', vol: 0.06, bus }));
      }),
      blip:  fx(() => tone(700 + Math.random() * 250, 0, .035, { vol: .035 })),
      stomp: fx(() => { tone(260, 0, .14, { vol: .2, slide: .45 }); tone(900, .01, .05, { vol: .06 }); }),
      fuse:  fx(() => noise(0, 1.2, { filter: 'highpass', f: 4000, vol: .06 })),
      boom:  fx(() => { noise(0, 1.1, { f: 1400, fTo: 70, vol: .7, attack: .005 }); tone(110, 0, .7, { type: 'sine', vol: .4, slide: .3 }); }),
      hurt:  fx(() => { tone(620, 0, .12, { type: 'sawtooth', vol: .12, slide: .6 }); tone(420, .12, .25, { type: 'sawtooth', vol: .12, slide: .5 }); }),
      deny:  fx(() => { tone(150, 0, .15, { vol: .12 }); tone(120, .17, .25, { vol: .12 }); }),
      door:  fx(() => { tone(90, 0, 1.2, { type: 'sawtooth', vol: .08, slide: 1.6, attack: .2 }); noise(0, 1.2, { filter: 'bandpass', f: 500, q: 4, vol: .12, attack: .3 }); }),
      start: fx(() => ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => tone(N(n), i * .07, .18, { vol: .14 }))),
      pause: fx(() => { tone(1047, 0, .08, { vol: .1 }); tone(784, .08, .12, { vol: .1 }); }),
      tick:  fx((hi) => tone(hi ? 1800 : 1400, 0, .03, { vol: .05 })),
      beep:  fx(() => tone(1500, 0, .08, { type: 'square', vol: .08, slide: .8 })),
      press: fx(() => tone(500, 0, .08, { vol: .14, slide: .6 })),
      bonk: fx(() => {
        tone(150, 0, .16, { type: 'square', vol: .28, slide: .45 }); noise(0, .14, { f: 900, vol: .35 });
        [1900, 2300, 2700].forEach((f, i) => tone(f, .14 + i * .07, .07, { type: 'sine', vol: .06 }));
      }),
      chime: fx((n = 0) => { const f = 660 * Math.pow(2, n / 12); tone(f, 0, .25, { type: 'triangle', vol: .2 }); tone(f * 1.5, .06, .3, { type: 'sine', vol: .08 }); }),
      boing: fx(() => { tone(170, 0, .38, { type: 'triangle', vol: .32, slide: 3.4 }); tone(340, .02, .28, { type: 'sine', vol: .1, slide: 2.6 }); }),
      burn:  fx(() => { noise(0, .5, { filter: 'bandpass', f: 900, fTo: 200, q: .8, vol: .35 }); tone(520, 0, .35, { type: 'sawtooth', vol: .1, slide: 1.8 }); }),
      note:  fx((f) => { tone(f, 0, 0.7, { type: 'triangle', vol: .26 }); tone(f * 2, 0, 0.35, { type: 'sine', vol: .07 }); tone(f / 2, 0, 0.5, { type: 'sine', vol: .08 }); }),
      drum:  fx(() => { tone(110, 0, .3, { type: 'sine', vol: .45, slide: .5 }); noise(0, .15, { f: 900, vol: .25 }); }),
      poof:  fx(() => { noise(0, .35, { filter: 'bandpass', f: 2400, fTo: 600, q: 1.5, vol: .2 }); tone(880, 0, .25, { type: 'sine', vol: .1, slide: .5 }); }),
      rumbleRoll: fx(() => noise(0, .5, { f: 180, fTo: 90, vol: .16, attack: .1 })),
      whistle: fx(() => { tone(1568, 0, .12, { type: 'sine', vol: .12 }); tone(2093, .13, .25, { type: 'sine', vol: .12 }); }),
      // Pop-up-Fenster geht auf: zwei kurze Toene (eigener Klang)
      popup: fx(() => { tone(988, 0, .09, { type: 'square', vol: .07 }); tone(740, .09, .16, { type: 'square', vol: .07 }); }),
      // Virus teilt sich: blubbernder Doppelklang
      split: fx(() => { tone(300, 0, .16, { type: 'sawtooth', vol: .08, slide: 2.2 }); tone(450, .08, .16, { type: 'sawtooth', vol: .07, slide: 2.2 }); noise(0, .2, { filter: 'bandpass', f: 1800, q: 3, vol: .12 }); }),
      // Geister-Kichern: zwei wackelige Glissandi
      boo: fx(() => { tone(560, 0, .2, { type: 'sine', vol: .1, slide: 1.5 }); tone(760, .14, .26, { type: 'triangle', vol: .08, slide: .55 }); tone(640, .3, .22, { type: 'sine', vol: .06, slide: 1.3 }); }),
      sun:   fx(() => {
        noise(0, 1.2, { filter: 'highpass', f: 2000, fTo: 8000, vol: .1, attack: .4 });
        [784, 988, 1175, 1568].forEach((f, i) => tone(f, .2 + i * .1, .5, { type: 'sine', vol: .1 }));
      }),
    };

    // Eigene kleine Schleife (keine Nintendo-Melodie): 8 Takte, Achtel-Raster
    const MEL = ('E5 . G5 . C6 . G5 E5 A5 . G5 E5 C5 . . . F5 . A5 . C6 . A5 F5 G5 . B5 . D6 C6 B5 G5 ' +
                 'E5 . G5 . C6 . E6 D6 C6 . A5 . E5 . A5 C6 D6 . C6 A5 B5 . G5 . C6 . G5 E5 C5 . . .').split(' ');
    const BASS = ('C3 . G2 . C3 . G2 . A2 . E3 . A2 . E3 . F2 . C3 . F2 . C3 . G2 . D3 . G2 . D3 . ' +
                  'C3 . G2 . C3 . G2 . A2 . E3 . A2 . E3 . D3 . A2 . G2 . D3 . C3 . G2 . C3 . . .').split(' ');
    let musicTimer = null, step = 0, nextT = 0;
    function schedule() {
      const slot = 60 / 132 / 2;
      if (nextT < ctx.currentTime) nextT = ctx.currentTime + .03;
      while (nextT < ctx.currentTime + .15) {
        const at = nextT - ctx.currentTime;
        const m = MEL[step % MEL.length], b = BASS[step % BASS.length];
        if (m !== '.') tone(N(m), at, slot * .8, { vol: .09, bus: musicBus });
        if (b !== '.') tone(N(b), at, slot * 1.6, { type: 'triangle', vol: .3, bus: musicBus });
        if (step % 2) noise(at, .04, { filter: 'highpass', f: 7000, vol: .05, bus: musicBus });
        step++; nextT += slot;
      }
    }
    api.music = (on) => {
      if (on) {
        if (musicTimer || !ac()) return;
        nextT = ctx.currentTime + .05;
        musicTimer = setInterval(schedule, 40);
      } else if (musicTimer) {
        clearInterval(musicTimer); musicTimer = null;
      }
    };
    return api;
  })();

  /* ═══════════ Rumble am Controller ═══════════ */
  function rumble(strong, ms) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (p && p.vibrationActuator && p.vibrationActuator.playEffect) {
        p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * .6 }).catch(() => {});
      }
    }
  }

  /* ═══════════ 2D-Stern fuer Titelbild + "Stern erhalten" ═══════════ */
  const StarGfx = (() => {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const rim = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.44 : 1;
      rim.push([Math.cos(a) * r, Math.sin(a) * r, 0]);
    }
    const tris = [];
    for (let i = 0; i < 10; i++) {
      const a = rim[i], b = rim[(i + 1) % 10];
      tris.push([[0, 0, 0.34], a, b], [[0, 0, -0.34], b, a]);
    }
    const L = norm([-0.45, -0.6, 0.66]);
    const Hv = norm([L[0], L[1], L[2] + 1]);
    function draw(ctx, w, h, t, o = {}) {
      const S = Math.min(w, h) * (o.size || 0.36), cx = w / 2, cy = h / 2 + S * 0.05;
      const ry = t * (o.speed || 2.2), rx = 0.18 * Math.sin(t * 0.9);
      const cY = Math.cos(ry), sY = Math.sin(ry), cX = Math.cos(rx), sX = Math.sin(rx);
      const rot = (p) => {
        const x = p[0] * cY + p[2] * sY, z = -p[0] * sY + p[2] * cY, y = p[1];
        return [x, y * cX - z * sX, y * sX + z * cX];
      };
      const proj = (p) => { const k = 3.4 / (3.4 - p[2]); return [cx + p[0] * S * k, cy + p[1] * S * k]; };
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(cx, cy, S * 0.1, cx, cy, S * 1.5);
      g.addColorStop(0, 'rgba(255,240,150,.55)'); g.addColorStop(1, 'rgba(255,240,150,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.4);
      ctx.fillStyle = 'rgba(255,255,210,.13)';
      for (let i = 0; i < 12; i++) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(S * 1.7, -S * 0.09); ctx.lineTo(S * 1.7, S * 0.09); ctx.fill();
      }
      ctx.restore();
      star(ctx, cx, cy, S, ry, rx);
    }
    // nur der facettierte Stern (Mitte cx/cy, Groesse S, Drehung ry/rx)
    function star(ctx, cx, cy, S, ry, rx = 0) {
      const cY = Math.cos(ry), sY = Math.sin(ry), cX = Math.cos(rx), sX = Math.sin(rx);
      const rot = (p) => {
        const x = p[0] * cY + p[2] * sY, z = -p[0] * sY + p[2] * cY, y = p[1];
        return [x, y * cX - z * sX, y * sX + z * cX];
      };
      const proj = (p) => { const k = 3.4 / (3.4 - p[2]); return [cx + p[0] * S * k, cy + p[1] * S * k]; };
      const faces = [];
      for (const tr of tris) {
        const r = tr.map(rot);
        let n = norm(cross(sub(r[1], r[0]), sub(r[2], r[0])));
        const c = [(r[0][0] + r[1][0] + r[2][0]) / 3, (r[0][1] + r[1][1] + r[2][1]) / 3, (r[0][2] + r[1][2] + r[2][2]) / 3];
        if (dot(n, c) < 0) n = [-n[0], -n[1], -n[2]];
        if (n[2] > -0.02) faces.push({ r, n, z: c[2] });
      }
      faces.sort((a, b) => a.z - b.z);
      for (const f of faces) {
        const lam = Math.max(0, dot(f.n, L));
        const spec = Math.pow(Math.max(0, dot(f.n, Hv)), 18);
        const k = 0.4 + 0.6 * lam;
        const col = [255, 198, 24].map((ch) => Math.min(255, Math.round(ch * k + 255 * spec * 0.6)));
        ctx.fillStyle = ctx.strokeStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
        const p0 = proj(f.r[0]), p1 = proj(f.r[1]), p2 = proj(f.r[2]);
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.closePath();
        ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
      }
    }
    return { draw, star };
  })();

  /* ═══════════ "Stern erhalten" im Vollbild ═══════════
     0,00 s  weisser Blitz + Schockwelle dort, wo der Stern eingesammelt wurde
     0,00-0,55 s  der Stern fliegt wirbelnd in die Bildmitte (mit Funkenschweif) und ploppt gross auf
     0,50 s  Konfetti-/Sternchen-Explosion, danach pulsierende Ringe, Strahlenkranz, Glitzerpunkte
     2,55-3,00 s  der Stern saust zur Sternanzeige oben, alles blendet aus */
  const StarFx = (() => {
    const el = $('#starGet'), cv = $('#starGetCanvas'), ctx = cv.getContext('2d');
    const DUR = 3, OUT = 2.55;
    let t0 = 0, lastT = 0, from = [0, 0], to = [0, 0], W = 0, H = 0, dpr = 1, bits = [], glints = [], trail = [], burst2 = false;
    const COLS = ['#ffe14a', '#ffffff', '#ff5fc8', '#5ff0ff', '#8dff5a', '#ffb13f'];
    const ease = (k) => 1 - Math.pow(1 - k, 3);
    const back = (k) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
    function pop(x, y, n, sp) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = (0.35 + Math.random() * 0.9) * sp;
        bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.25, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14,
          life: 1.2 + Math.random() * 1.1, age: 0, size: (0.012 + Math.random() * 0.02) * Math.min(W, H),
          kind: i % 3 === 0 ? 'star' : i % 3 === 1 ? 'confetti' : 'spark', col: COLS[i % COLS.length] });
      }
    }
    function start(p, isNew) {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      W = cv.width = Math.round(innerWidth * dpr); H = cv.height = Math.round(innerHeight * dpr);
      const s = p && toScreen(p);
      from = s ? [s[0] * dpr, s[1] * dpr] : [W / 2, H / 2];
      const hs = document.querySelector('.hud-item.stars');
      const r = hs ? hs.getBoundingClientRect() : null;
      to = r && r.width ? [(r.left + r.width * 0.25) * dpr, (r.top + r.height / 2) * dpr] : [W * 0.1, H * 0.06];
      t0 = lastT = clock; bits = []; glints = []; trail = []; burst2 = false;
      el.classList.remove('out');
      el.hidden = false;
      el.dataset.fresh = isNew ? '1' : '0';
    }
    function draw() {
      if (el.hidden) return;
      const t = clock - t0, S = Math.min(W, H), cx = W / 2, cy = H * 0.44, dt = clamp(clock - lastT, 0, 0.05);
      lastT = clock;
      const fadeIn = smooth(t / 0.25), fadeOut = 1 - smooth((t - OUT - 0.1) / 0.35);
      if (t > OUT && !el.classList.contains('out')) { el.classList.add('out'); Snd.whoosh(); }
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.globalAlpha = fadeIn * fadeOut;
      // Hintergrund: warmes Leuchten in der Mitte, dunkler Rand
      const R = Math.hypot(W, H) / 2;
      const bg = ctx.createRadialGradient(cx, cy, S * 0.05, cx, cy, R);
      bg.addColorStop(0, 'rgba(255,236,140,.62)'); bg.addColorStop(0.35, 'rgba(180,70,190,.5)'); bg.addColorStop(1, 'rgba(12,0,40,.88)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // Strahlenkranz: zwei gegenlaeufige Kraenze
      const rays = (n, rot, len, col, wid) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.fillStyle = col;
        for (let i = 0; i < n; i++) {
          ctx.rotate(TAU / n);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, -len * wid); ctx.lineTo(len, len * wid); ctx.fill();
        }
        ctx.restore();
      };
      const grow = ease(clamp((t - 0.35) / 0.6, 0, 1));
      rays(18, t * 0.35, R * 1.1 * grow, 'rgba(255,248,200,.14)', 0.1);
      rays(12, -t * 0.22, R * 0.9 * grow, 'rgba(255,200,90,.12)', 0.06);
      // pulsierende Ringe aus der Mitte
      for (let k = 0; k < 4; k++) {
        const a = ((t - 0.5) * 0.9 + k / 4) % 1;
        if (t < 0.5) break;
        ctx.strokeStyle = `rgba(255,230,120,${0.35 * (1 - a)})`; ctx.lineWidth = S * 0.012 * (1 - a) + 1;
        ctx.beginPath(); ctx.arc(cx, cy, S * (0.18 + a * 0.75), 0, TAU); ctx.stroke();
      }
      // Blitz und Schockwelle am Fundort
      if (t < 0.6) {
        const k = t / 0.6;
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`; ctx.lineWidth = S * 0.03 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(from[0], from[1], S * 0.9 * ease(k), 0, TAU); ctx.stroke();
      }
      // Flug des Sterns: Fundort -> Mitte, am Ende -> Sternanzeige
      let px, py, sz;
      const fly = clamp(t / 0.55, 0, 1), outK = clamp((t - OUT) / 0.42, 0, 1);
      if (t < OUT) {
        const e2 = ease(fly);
        px = lerp(from[0], cx, e2); py = lerp(from[1], cy, e2) - Math.sin(fly * Math.PI) * S * 0.12;
        sz = S * lerp(0.05, 0.19, back(fly)) * (1 + Math.sin(t * 5) * 0.025 * (fly >= 1 ? 1 : 0));
      } else {
        const e3 = outK * outK;
        px = lerp(cx, to[0], e3); py = lerp(cy, to[1], e3) - Math.sin(outK * Math.PI) * S * 0.08;
        sz = S * lerp(0.19, 0.02, e3);
      }
      trail.push([px, py, sz]); if (trail.length > 14) trail.shift();
      ctx.globalCompositeOperation = 'lighter';
      trail.forEach(([x, y, s2], i) => {
        const a = i / trail.length;
        ctx.fillStyle = `rgba(255,220,90,${0.18 * a})`;
        ctx.beginPath(); ctx.arc(x, y, s2 * 0.55 * a, 0, TAU); ctx.fill();
      });
      const halo = ctx.createRadialGradient(px, py, 0, px, py, sz * 2.4);
      halo.addColorStop(0, 'rgba(255,250,200,.9)'); halo.addColorStop(0.3, 'rgba(255,210,80,.45)'); halo.addColorStop(1, 'rgba(255,160,40,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(px, py, sz * 2.4, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // Explosionen
      if (t >= 0.5 && bits.length === 0 && !burst2) { pop(cx, cy, 110, S * 1.4); Snd.chime(12); }
      if (t >= 1.5 && !burst2) { burst2 = true; pop(cx, cy, 50, S * 0.9); }
      // der Stern selbst: erst wild, dann gemaechlich drehend
      const spin = 2.2 * t + 12 * (1 - Math.exp(-2.6 * t)) + (t > OUT ? outK * 9 : 0);
      StarGfx.star(ctx, px, py, sz, spin, 0.2 * Math.sin(t * 1.3));
      // Glitzerpunkte rund um den Stern
      if (t > 0.55 && t < OUT && Math.random() < 0.5) glints.push({ a: Math.random() * TAU, r: sz * (1.1 + Math.random() * 1.2), age: 0, life: 0.5 + Math.random() * 0.4 });
      ctx.fillStyle = '#fff';
      glints = glints.filter((q) => (q.age += dt) < q.life);
      for (const q of glints) {
        const k = Math.sin(q.age / q.life * Math.PI), s3 = S * 0.022 * k, x = px + Math.cos(q.a) * q.r, y = py + Math.sin(q.a) * q.r;
        ctx.beginPath(); ctx.moveTo(x, y - s3 * 2); ctx.lineTo(x + s3 * 0.35, y); ctx.lineTo(x, y + s3 * 2); ctx.lineTo(x - s3 * 0.35, y); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - s3 * 2, y); ctx.lineTo(x, y + s3 * 0.35); ctx.lineTo(x + s3 * 2, y); ctx.lineTo(x, y - s3 * 0.35); ctx.closePath(); ctx.fill();
      }
      // Konfetti, Sternchen, Funken
      for (const b of bits) {
        b.age += dt; if (b.age > b.life) continue;
        b.vx *= 0.985; b.vy = b.vy * 0.985 + S * 0.9 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
        const a = 1 - smooth((b.age - b.life + 0.4) / 0.4);
        ctx.save(); ctx.globalAlpha = fadeOut * a; ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.fillStyle = ctx.strokeStyle = b.col;
        if (b.kind === 'confetti') ctx.fillRect(-b.size * 0.5, -b.size * 0.25, b.size, b.size * 0.5 * Math.abs(Math.cos(b.rot * 1.7)) + 1);
        else if (b.kind === 'spark') { ctx.lineWidth = Math.max(1, b.size * 0.2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-b.vx * 0.03, -b.vy * 0.03); ctx.stroke(); }
        else {
          ctx.beginPath();
          for (let i = 0; i < 10; i++) { const r2 = i % 2 ? b.size * 0.42 : b.size; ctx.lineTo(Math.cos(-Math.PI / 2 + i * Math.PI / 5) * r2, Math.sin(-Math.PI / 2 + i * Math.PI / 5) * r2); }
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      // Blitz ganz am Anfang
      if (t < 0.3) { ctx.globalAlpha = 0.85 * (1 - t / 0.3); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
      ctx.restore();
      if (t >= DUR) { el.hidden = true; el.classList.remove('out'); }
    }
    return { start, draw, DUR, get active() { return !el.hidden; } };
  })();

  /* ═══════════ Stern-Blende ═══════════ */
  const Iris = (() => {
    const cv = $('#iris'), ctx = cv.getContext('2d');
    let W = 0, H = 0;
    function frame(x, y, R, rot) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      if (R < 0.5) return;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = rot - Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.5 : R;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
    }
    function anim(from, to, dur, x, y) {
      return new Promise((res) => {
        if (reduceMotion) { cv.hidden = to > 0; if (to === 0) { W = cv.width = 2; H = cv.height = 2; frame(0, 0, 0, 0); cv.hidden = false; } res(); return; }
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        W = cv.width = Math.round(innerWidth * dpr); H = cv.height = Math.round(innerHeight * dpr);
        x *= dpr; y *= dpr;
        const max = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) / 0.5 * 1.05;
        cv.hidden = false;
        const t0 = performance.now();
        let done = false;
        const finish = () => {
          if (done) return; done = true;
          if (to > 0) cv.hidden = true; else frame(x, y, 0, 0);
          res();
        };
        const stepFn = (now) => {
          if (done) return;
          const k = Math.min(1, (now - t0) / dur), e = k * k * (3 - 2 * k);
          frame(x, y, (from + (to - from) * e) * max, e * 1.4 * (to > from ? -1 : 1));
          if (k < 1) requestAnimationFrame(stepFn); else finish();
        };
        requestAnimationFrame(stepFn);
        setTimeout(finish, dur + 400);
      });
    }
    return {
      close: (x, y, d = 650) => anim(1, 0, d, x ?? innerWidth / 2, y ?? innerHeight / 2),
      open:  (x, y, d = 650) => anim(0, 1, d, x ?? innerWidth / 2, y ?? innerHeight / 2),
      hide:  () => { cv.hidden = true; },
    };
  })();

  /* ═══════════ Dialogbox ═══════════ */
  const Dialog = (() => {
    const box = $('#dialog'), txt = $('#dlgText'), spk = $('#dlgSpeaker'), nxt = $('#dlgNext');
    let lines = [], idx = 0, typing = null, full = '', done = null, openedAt = 0;
    function typeLine() {
      clearInterval(typing);
      full = lines[idx]; txt.textContent = ''; nxt.classList.add('wait');
      if (reduceMotion) { txt.textContent = full; nxt.classList.remove('wait'); typing = null; return; }
      let pos = 0;
      typing = setInterval(() => {
        pos++;
        txt.textContent = full.slice(0, pos);
        if (pos % 2 === 0 && full[pos - 1] !== ' ') Snd.blip();
        if (pos >= full.length) { clearInterval(typing); typing = null; nxt.classList.remove('wait'); }
      }, 22);
    }
    function show(speaker, list, onDone) {
      if (done) { const cb = done; done = null; cb(); }
      lines = Array.isArray(list) ? list : [list]; idx = 0; done = onDone || null;
      spk.textContent = speaker || ''; box.hidden = false; openedAt = performance.now();
      typeLine();
    }
    function close() {
      clearInterval(typing); typing = null; box.hidden = true;
      const cb = done; done = null; if (cb) cb();
    }
    function advance() {
      if (box.hidden || performance.now() - openedAt < 180) return;
      if (typing) { clearInterval(typing); typing = null; txt.textContent = full; nxt.classList.remove('wait'); return; }
      if (++idx < lines.length) typeLine(); else close();
    }
    box.addEventListener('click', advance);
    return { show, advance, close, get open() { return !box.hidden; } };
  })();

  /* ═══════════ HUD + Power-Anzeige ═══════════ */
  const hud = { lives: $('#hudLives'), coins: $('#hudCoins'), stars: $('#hudStars') };
  function renderHud(which) {
    hud.lives.textContent = run.lives;
    hud.coins.textContent = run.coins;
    hud.stars.textContent = starCount();
    if (which) {
      const box = hud[which].parentElement;
      box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
    }
  }
  const Power = (() => {
    const svg = $('#power'), g = $('#pwWedges');
    const paths = [];
    for (let i = 0; i < 8; i++) {
      const a0 = (-90 + i * 45 + 2) * Math.PI / 180, a1 = (-90 + (i + 1) * 45 - 2) * Math.PI / 180;
      const r = 33, cx = 50, cy = 66;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', `M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`);
      g.appendChild(p); paths.push(p);
    }
    let hideT = null;
    function render(hurt) {
      const h = run.health;
      const col = h >= 7 ? '#2f6dff' : h >= 5 ? '#2fbf3a' : h >= 3 ? '#ffcc00' : '#ff3030';
      paths.forEach((p, i) => p.setAttribute('fill', i < h ? col : '#3a3a3a'));
      clearTimeout(hideT);
      if (h < 8) svg.style.opacity = 1;
      else hideT = setTimeout(() => { svg.style.opacity = 0; }, 1800);
      if (hurt) { svg.classList.remove('hurt'); void svg.getBoundingClientRect(); svg.classList.add('hurt'); }
    }
    render();
    return { render };
  })();

  /* ═══════════ Vektor-/Matrix-Mathe (Spalten-Major wie WebGL) ═══════════ */
  const v3 = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  };
  const M4 = {
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
      }
      return o;
    },
    persp(fovy, asp, n, f) {
      const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
      o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
      return o;
    },
    lookAt(e, c, up) {
      const z = v3.norm(v3.sub(e, c)), x = v3.norm(v3.cross(up, z)), y = v3.cross(z, x);
      return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
        -v3.dot(x, e), -v3.dot(y, e), -v3.dot(z, e), 1]);
    },
    // T * Ry * Rx * Rz * S
    from(tx = 0, ty = 0, tz = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
      const cy = Math.cos(ry), sY = Math.sin(ry), cx = Math.cos(rx), sX = Math.sin(rx), cz = Math.cos(rz), sZ = Math.sin(rz);
      // Zeilenform R = Ry*Rx*Rz
      const r00 = cy * cz + sY * sX * sZ, r01 = -cy * sZ + sY * sX * cz, r02 = sY * cx;
      const r10 = cx * sZ,                r11 = cx * cz,                 r12 = -sX;
      const r20 = -sY * cz + cy * sX * sZ, r21 = sY * sZ + cy * sX * cz, r22 = cy * cx;
      return new Float32Array([r00 * sx, r10 * sx, r20 * sx, 0, r01 * sy, r11 * sy, r21 * sy, 0,
        r02 * sz, r12 * sz, r22 * sz, 0, tx, ty, tz, 1]);
    },
    // Basis aus Achsen (fuer schraege Lichtstrahlen u.ae.)
    basis(o, x, y, z) {
      return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1]);
    },
    point: (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]],
    dir: (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]],
  };
  const I4 = M4.from();

  /* ═══════════ WebGL-Grundgeruest ═══════════ */
  const canvas = $('#gl');
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl');
  if (!gl) {
    $('#nogl').hidden = false;
    $('#titleScreen').hidden = true;
    return;
  }
  const VS = `
    attribute vec3 aPos; attribute vec3 aNrm; attribute vec3 aCol; attribute vec2 aUV;
    uniform mat4 uProj; uniform mat4 uView; uniform mat4 uModel;
    uniform vec4 uRip; uniform float uRipOn; uniform float uTrip; uniform float uTime;
    varying vec3 vCol; varying vec3 vNrm; varying vec2 vUV; varying vec3 vWPos;
    void main() {
      vec3 p = aPos;
      if (uRipOn > 0.5) {
        // Wellenringe beim Reinspringen ins Gemaelde (uRip: Mitte xy, Zeit, Staerke)
        float d = distance(p.xy, uRip.xy);
        float behind = uRip.z * 6.0 - d;
        if (behind > 0.0) p.z += sin(behind * 3.4) * uRip.w * exp(-behind * 0.35) * exp(-uRip.z * 0.9);
      }
      vec4 wp = uModel * vec4(p, 1.0);
      if (uTrip > 0.0) {
        // Trip: die Welt atmet und wabert (seitlich mehr als in der Hoehe, damit die Fuesse nicht einsinken)
        vec3 w = wp.xyz;
        wp.xyz += uTrip * vec3(sin(w.y * 0.45 + w.z * 0.21 + uTime * 1.3) * 0.16,
                               sin(w.x * 0.33 + w.z * 0.27 + uTime * 1.7) * 0.05,
                               sin(w.y * 0.41 + w.x * 0.19 - uTime * 1.1) * 0.16);
      }
      vec4 vp = uView * wp;
      vWPos = wp.xyz;
      vNrm = (uModel * vec4(aNrm, 0.0)).xyz;
      vCol = aCol; vUV = aUV;
      gl_Position = uProj * vp;
    }`;
  const FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    varying vec3 vCol; varying vec3 vNrm; varying vec2 vUV; varying vec3 vWPos;
    uniform vec3 uLight; uniform vec3 uFogCol; uniform vec2 uFog; uniform vec4 uTint;
    uniform float uLit; uniform float uAlpha; uniform sampler2D uTex; uniform float uUseTex;
    uniform vec3 uCam; uniform float uShine; uniform float uRim; uniform float uDim;
    uniform float uArt; uniform float uSwirl; uniform float uDetail; uniform float uTrip; uniform float uTime;
    // Farbton drehen (fuer den Trip)
    vec3 hue(vec3 c, float a) {
      const vec3 k = vec3(0.57735);
      float ca = cos(a);
      return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
    }
    float h21(vec2 p) { p = mod(p, 251.0); return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    // Rauschen auf einem groben Texel-Raster, bilinear verwischt: sieht aus wie eine kleine 32er-Konsolentextur
    float tnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      // Abstand pro Pixel: bei riesigen Dreiecken (Fernboden) waere der pro Ecke gerechnete Wert ueberall "weit weg"
      float dist = distance(vWPos, uCam);
      vec3 n = normalize(vNrm);
      float dif = max(dot(n, -uLight), 0.0);
      float amb = 0.5 + 0.14 * n.y;
      vec3 base = mix(vCol, uTint.rgb, uTint.a);
      vec2 uv = vUV;
      if (uArt > 0.0 && uv.y < 0.857) {
        // Gemaelde atmen leicht; in der Cutscene zieht ein Wirbel ins Bild
        vec2 q = uv - vec2(0.5, 0.43);
        float d = length(q * vec2(1.333, 1.0));
        float ang = uSwirl * 3.4 * exp(-d * 3.2) + sin(uArt * 0.35 + d * 9.0) * 0.01;
        float cs = cos(ang), sn = sin(ang);
        uv = vec2(0.5, 0.43) + mat2(cs, sn, -sn, cs) * q * (1.0 - uSwirl * 0.18);
        uv += vec2(sin(vUV.y * 23.0 + uArt * 0.8), cos(vUV.x * 19.0 - uArt * 0.6)) * (0.0022 + uSwirl * 0.006);
        uv = clamp(uv, vec2(0.002), vec2(0.998, 0.852));
      }
      if (uUseTex > 0.5) base *= texture2D(uTex, uv).rgb;
      if (uArt > 0.0) base *= 1.0 + uSwirl * 0.45;
      if (uDetail > 0.0) {
        // Boeden: Sprenkel wie Gras/Sand; Waende: waagrecht gestreckt wie Steinlagen
        vec3 an = abs(n);
        vec2 tp = an.y > 0.6 ? vWPos.xz : (an.x > an.z ? vWPos.zy : vWPos.xy) * vec2(0.75, 1.25);
        float fine = (tnoise(tp * 4.0) - 0.5) * clamp(1.4 - dist / 45.0, 0.0, 1.0);
        float blot = tnoise(tp * 0.6 + 31.0) - 0.5;
        base *= 1.0 + (fine * 0.2 + blot * 0.16) * uDetail;
      }
      if (uTrip > 0.0) {
        // Trip: Farben wandern in Wellen durch die Welt, Flaechen schillern wie Oelfilm
        float wv = sin(vWPos.x * 0.07 + vWPos.z * 0.05 + uTime * 0.6) + sin(vWPos.y * 0.13 - uTime * 0.9);
        base = hue(base, uTrip * (wv * 1.1 + uTime * 0.35));
        vec3 vv = normalize(uCam - vWPos);
        float fr = 1.0 - max(dot(n, vv), 0.0);
        base += uTrip * 0.35 * (0.5 + 0.5 * cos(6.2832 * (fr * 1.6 + uTime * 0.15 + vec3(0.0, 0.33, 0.67)))) * fr;
        base *= 1.0 + uTrip * 0.12 * sin(dist * 0.35 - uTime * 4.0);
      }
      vec3 c = base * mix(1.0, amb + dif * 0.62, uLit) * mix(1.0, uDim, uLit);
      if (uShine + uRim > 0.0) {
        // Glanzpunkt + Randlicht (nur fuer Figuren)
        vec3 v = normalize(uCam - vWPos);
        vec3 h = normalize(v - uLight);
        c += vec3(pow(max(dot(n, h), 0.0), 28.0) * uShine);
        c += (base * 0.7 + vec3(0.18, 0.22, 0.3)) * pow(1.0 - max(dot(n, v), 0.0), 3.0) * uRim;
      }
      float f = clamp((dist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
      gl_FragColor = vec4(mix(c, uFogCol, f), uAlpha);
    }`;
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const A = {}, U = {};
  ['aPos', 'aNrm', 'aCol', 'aUV'].forEach((n) => { A[n] = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(A[n]); });
  ['uProj', 'uView', 'uModel', 'uLight', 'uFogCol', 'uFog', 'uTint', 'uLit', 'uAlpha', 'uTex', 'uUseTex', 'uRip', 'uRipOn', 'uCam', 'uShine', 'uRim', 'uDim', 'uArt', 'uSwirl', 'uDetail', 'uTrip', 'uTime']
    .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
  gl.enable(gl.DEPTH_TEST);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform1i(U.uTex, 0);

  function makeTex(src) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    return t;
  }
  const whiteTex = makeTex(null);
  function updateTex(t, src) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  /* ═══════════ Geometrie-Baukasten ═══════════ */
  class Geo {
    constructor() { this.pos = []; this.nrm = []; this.col = []; this.uv = []; }
    tri(a, b, c, col, uvs, ns) {
      let n = null;
      if (!ns) {
        const cr = v3.cross(v3.sub(b, a), v3.sub(c, a));
        if (v3.len(cr) < 1e-9) return;   // entartet (Kegelspitze)
        n = v3.norm(cr);
      }
      const vs = [a, b, c];
      for (let i = 0; i < 3; i++) {
        this.pos.push(vs[i][0], vs[i][1], vs[i][2]);
        const nn = ns ? ns[i] : n;
        this.nrm.push(nn[0], nn[1], nn[2]);
        const cc = Array.isArray(col[0]) ? col[i] : col;
        this.col.push(cc[0], cc[1], cc[2]);
        const u = uvs ? uvs[i] : [0, 0];
        this.uv.push(u[0], u[1]);
      }
    }
    quad(a, b, c, d, col, uvs) {
      const cs = Array.isArray(col[0]) ? col : null;
      this.tri(a, b, c, cs ? [cs[0], cs[1], cs[2]] : col, uvs && [uvs[0], uvs[1], uvs[2]]);
      this.tri(a, c, d, cs ? [cs[0], cs[2], cs[3]] : col, uvs && [uvs[0], uvs[2], uvs[3]]);
    }
  }
  const P = (m, x, y, z) => M4.point(m, [x, y, z]);

  // Quader, mittig um den Ursprung (lokal), Farbe oder {top, side, bottom}
  function box(g, m, sx, sy, sz, col) {
    const x = sx / 2, y = sy / 2, z = sz / 2;
    const top = col.top || col, side = col.side || col, bot = col.bottom || side;
    const q = (a, b, c, d, cc) => g.quad(P(m, ...a), P(m, ...b), P(m, ...c), P(m, ...d), cc);
    q([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], side);
    q([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], side);
    q([x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], side);
    q([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], side);
    q([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], top);
    q([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], bot);
  }
  /* 64er-Look fuer Figuren: waehrend lowPoly(...) baut, werden Kugeln, Zylinder und Scheiben
     deutlich grober unterteilt (wenige, gut sichtbare Flaechen wie auf der Konsole). */
  const CHAR_POLY = 0.42;
  let polyK = 1;
  const segs = (n, min) => (polyK === 1 ? n : Math.max(min, Math.round(n * polyK)));
  function lowPoly(fn) { const k = polyK; polyK = CHAR_POLY; try { return fn(); } finally { polyK = k; } }
  // Zylinder/Kegel von y=0 bis y=h (lokal)
  function cyl(g, m, r0, r1, h, seg, col, capCol) {
    seg = segs(seg, 5);
    const side = col, cap = capCol || col;
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
      const b0 = P(m, Math.cos(a0) * r0, 0, Math.sin(a0) * r0), b1 = P(m, Math.cos(a1) * r0, 0, Math.sin(a1) * r0);
      const t0 = P(m, Math.cos(a0) * r1, h, Math.sin(a0) * r1), t1 = P(m, Math.cos(a1) * r1, h, Math.sin(a1) * r1);
      g.quad(b1, b0, t0, t1, side);
      if (r1 > 0) g.tri(P(m, 0, h, 0), t1, t0, cap);
      if (r0 > 0) g.tri(P(m, 0, 0, 0), b0, b1, cap);
    }
  }
  // Ellipsoid; smooth = weiche Normalen, yMin/yMax (0..PI) fuer Halbkugeln
  function sphere(g, m, rx, ry, rz, su0, sv0, col, smoothN, th0 = 0, th1 = Math.PI) {
    const su = segs(su0, 6), sv = segs(sv0, 4);
    const pt = (th, ph) => [rx * Math.sin(th) * Math.cos(ph), ry * Math.cos(th), rz * Math.sin(th) * Math.sin(ph)];
    const nr = (th, ph) => v3.norm(M4.dir(m, v3.norm([Math.sin(th) * Math.cos(ph) / rx, Math.cos(th) / ry, Math.sin(th) * Math.sin(ph) / rz])));
    for (let j = 0; j < sv; j++) {
      const ta = lerp(th0, th1, j / sv), tb = lerp(th0, th1, (j + 1) / sv);
      for (let i = 0; i < su; i++) {
        const pa = i / su * TAU, pb = (i + 1) / su * TAU;
        // Farbfunktionen bekommen weiter Indizes im urspruenglichen Raster (Verlaeufe bleiben gleich)
        const cc = typeof col === 'function' ? col(Math.floor(i * su0 / su), Math.floor(j * sv0 / sv)) : col;
        const q = [[ta, pa], [ta, pb], [tb, pb], [tb, pa]];
        const vs = q.map(([t, p]) => M4.point(m, pt(t, p)));
        if (smoothN) {
          const ns = q.map(([t, p]) => nr(t, p));
          if (j > 0 || th0 > 0) g.tri(vs[0], vs[1], vs[2], cc, null, [ns[0], ns[1], ns[2]]);
          g.tri(vs[0], vs[2], vs[3], cc, null, [ns[0], ns[2], ns[3]]);
          if (j === 0 && th0 === 0) g.tri(vs[0], vs[1], vs[2], cc, null, [ns[0], ns[1], ns[2]]);
        } else {
          g.quad(vs[0], vs[1], vs[2], vs[3], cc);
        }
      }
    }
  }
  // Scheibe in der XY-Ebene, zeigt nach +z; cols: Farbe oder Farbliste pro Segment
  function disc(g, m, r, seg, cols, a0 = 0, a1 = TAU) {
    seg = segs(seg, 6);
    const c = P(m, 0, 0, 0);
    for (let i = 0; i < seg; i++) {
      const pa = lerp(a0, a1, i / seg), pb = lerp(a0, a1, (i + 1) / seg);
      const cc = Array.isArray(cols[0]) ? cols[i % cols.length] : cols;
      g.tri(c, P(m, Math.cos(pa) * r, Math.sin(pa) * r, 0), P(m, Math.cos(pb) * r, Math.sin(pb) * r, 0), cc);
    }
  }
  // Fuenfzackiger Stern (dick), zeigt nach +z
  function starGeo(g, m, R, depth, col) {
    const rim = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.44 : R;
      rim.push([Math.cos(a) * r, Math.sin(a) * r, 0]);
    }
    const F = P(m, 0, 0, depth), B = P(m, 0, 0, -depth);
    for (let i = 0; i < 10; i++) {
      const a = P(m, ...rim[i]), b = P(m, ...rim[(i + 1) % 10]);
      g.tri(F, a, b, col); g.tri(B, b, a, col);
    }
  }

  function upload(g) {
    const mk = (arr) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); return b; };
    return { p: mk(g.pos), n: mk(g.nrm), c: mk(g.col), t: mk(g.uv), count: g.pos.length / 3 };
  }
  function build(fn) { const g = new Geo(); fn(g); return upload(g); }

  const NO_TINT = [0, 0, 0, 0];
  function draw(mesh, model, o = {}) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.p); gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.n); gl.vertexAttribPointer(A.aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.c); gl.vertexAttribPointer(A.aCol, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.t); gl.vertexAttribPointer(A.aUV, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(U.uModel, false, model || I4);
    gl.uniform4fv(U.uTint, o.tint || NO_TINT);
    gl.uniform1f(U.uLit, o.lit ?? 1);
    gl.uniform1f(U.uAlpha, o.alpha ?? 1);
    gl.uniform1f(U.uUseTex, o.tex ? 1 : 0);
    gl.uniform1f(U.uRipOn, o.rip ? 1 : 0);
    if (o.rip) gl.uniform4fv(U.uRip, o.rip);
    gl.uniform1f(U.uShine, o.shine || 0);
    gl.uniform1f(U.uRim, o.rim || 0);
    gl.uniform1f(U.uArt, o.art || 0);
    gl.uniform1f(U.uSwirl, o.swirl || 0);
    gl.uniform1f(U.uDetail, o.detail || 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, o.tex || whiteTex);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  /* ═══════════ Levels: statische Geometrie + feste Quader ═══════════ */
  const C = {
    grassA: hex('#58c43e'), grassB: hex('#46a932'), dirt: hex('#9a6a3a'), dirtDark: hex('#7a5028'),
    wall: hex('#f1e2b3'), wallShade: hex('#dcc790'), roof: hex('#e0332b'), roofDark: hex('#b8261f'),
    stone: hex('#b9b3a6'), stoneDark: hex('#8c877c'), wood: hex('#9c6630'), woodDark: hex('#6b4214'),
    gold: hex('#f2c230'), black: hex('#141414'), white: hex('#ffffff'), leaf: hex('#2e9e3e'), leafLight: hex('#4cc25a'),
    water: hex('#3d8fe8'), moatBed: hex('#35508a'), red: hex('#e52521'), blue: hex('#2f6dff'),
    floorA: hex('#a0703c'), floorB: hex('#d9b077'), carpet: hex('#b3161b'), hallWall: hex('#efdcae'),
  };
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  class Level {
    constructor(o) {
      Object.assign(this, o);
      this.solids = []; this.geo = new Geo(); this.glowGeo = new Geo();
      this.coins = []; this.enemies = []; this.stars = []; this.props = [];
      this.movers = []; this.blinkers = []; this.items = []; this.talkers = []; this.waters = []; this.falls = [];
      this.life = []; this.anims = []; this.scatterPts = [];
      this.doors = []; this.decals = [];
      this.fixedStars = []; this.paintings = null;
    }
    // Bewegliche Plattform: fn(t) liefert den Versatz [dx, dy, dz] zur Grundposition
    mover(cx, cy, cz, sx, sy, sz, col, fn, tag = 'mover') {
      const b = this.solid(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, tag);
      const m = { b, base: [cx, cy, cz], half: [sx / 2, sy / 2, sz / 2], fn, off: [0, 0, 0], vel: [0, 0, 0], mesh: build((g) => box(g, I4, sx, sy, sz, col)) };
      b.mover = m;
      this.movers.push(m);
      return m;
    }
    // Plattform, die im Takt verschwindet: an fuer Anteil "on" der Periode
    blinker(cx, top, cz, sx, sz, col, period, phase, on = 0.65) {
      const th = 0.6;
      const b = this.solid(cx - sx / 2, top - th, cz - sz / 2, cx + sx / 2, top, cz + sz / 2, 'blink');
      const k = { b, y: [top - th, top], period, phase, on, visible: true, mesh: build((g) => box(g, I4, sx, th, sz, col)), pos: [cx, top - th / 2, cz] };
      this.blinkers.push(k);
      return k;
    }
    solid(x0, y0, z0, x1, y1, z1, tag) {
      const b = { min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], tag };
      this.solids.push(b);
      return b;
    }
    block(cx, cy, cz, sx, sy, sz, col, tag, visible = true) {
      if (visible) box(this.geo, M4.from(cx, cy, cz), sx, sy, sz, col);
      return this.solid(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, tag);
    }
    // Schachbrett-Boden mit leicht zufaelliger Helligkeit (64-Textur-Gefuehl)
    checker(x0, z0, x1, z1, y, tile, a, b) {
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let x = x0; x < x1 - 1e-6; x += tile) {
        for (let z = z0; z < z1 - 1e-6; z += tile) {
          const xe = Math.min(x1, x + tile), ze = Math.min(z1, z + tile);
          const base = ((Math.floor((x - x0) / tile) + Math.floor((z - z0) / tile)) % 2) ? a : b;
          const col = shade(base, 0.94 + rnd() * 0.1);
          this.geo.quad([x, y, ze], [xe, y, ze], [xe, y, z], [x, y, z], col);
        }
      }
    }
    // Rampe: Grundflaeche x0..x1 / z0..z1, steigt in Richtung rise ('x+', 'x-', 'z+', 'z-') von yLo auf yHi.
    // Kollision ist ein Quader mit schraeger Oberkante (siehe topAt); o.chute = Rutschbahn, o.bottom = Unterkante.
    ramp(x0, z0, x1, z1, yLo, yHi, rise, col, tag = 'ramp', o = {}) {
      const axis = rise[0] === 'x' ? 0 : 2, up = rise[1] === '+';
      const lo = axis === 0 ? (up ? x0 : x1) : (up ? z0 : z1), hi = axis === 0 ? (up ? x1 : x0) : (up ? z1 : z0);
      const bot = o.bottom ?? Math.min(yLo, yHi) - 1;
      const b = this.solid(x0, bot, z0, x1, Math.max(yLo, yHi), z1, tag);
      b.slope = { axis, c0: lo, c1: hi, y0: yLo, y1: yHi };
      if (o.chute) { const s = up ? -1 : 1; b.chute = axis === 0 ? [s, 0] : [0, s]; }
      if (o.visible === false) return b;
      const top = col.top || col, side = col.side || col, g = this.geo;
      const yAt = (x, z) => topAt(b, x, z);
      // Oberseite in Streifen quer zur Steigung (ein bisschen Farbrauschen wie beim Schachbrett)
      const n = Math.max(1, Math.round(Math.abs(hi - lo) / 2));
      for (let i = 0; i < n; i++) {
        const c = shade(top, (i % 2 ? 0.95 : 1.02));
        if (axis === 0) {
          const a = lerp(x0, x1, i / n), e = lerp(x0, x1, (i + 1) / n);
          g.quad([a, yAt(a, 0), z1], [e, yAt(e, 0), z1], [e, yAt(e, 0), z0], [a, yAt(a, 0), z0], c);
        } else {
          const a = lerp(z0, z1, i / n), e = lerp(z0, z1, (i + 1) / n);
          g.quad([x0, yAt(0, e), e], [x1, yAt(0, e), e], [x1, yAt(0, a), a], [x0, yAt(0, a), a], c);
        }
      }
      if (o.sides === false) return b;
      // Seitenwaende bis zur Unterkante, dazu Stirn- und Rueckseite
      if (axis === 0) {
        for (const z of [z0, z1]) g.quad([x0, bot, z], [x1, bot, z], [x1, yAt(x1, z), z], [x0, yAt(x0, z), z], side);
        for (const x of [x0, x1]) g.quad([x, bot, z0], [x, bot, z1], [x, yAt(x, z1), z1], [x, yAt(x, z0), z0], side);
      } else {
        for (const x of [x0, x1]) g.quad([x, bot, z0], [x, bot, z1], [x, yAt(x, z1), z1], [x, yAt(x, z0), z0], side);
        for (const z of [z0, z1]) g.quad([x0, bot, z], [x1, bot, z], [x1, yAt(x1, z), z], [x0, yAt(x0, z), z], side);
      }
      return b;
    }
    coin(kind, x, y, z) { this.coins.push({ kind, pos: [x, y, z], taken: false, spin: Math.random() * TAU, hidden: kind === 'blue' }); }
    finish() {
      this.mesh = upload(this.geo); this.geo = null;
      if (this.glowGeo.pos.length) this.glowMesh = upload(this.glowGeo);
      this.glowGeo = null;
      this.buildGrid();
    }
    // Raster fuer die Kollision: jede Zelle kennt die festen Quader in ihrer Naehe (plus alle
    // beweglichen Plattformen). So pruefen Spieler und Gegner nur eine Handvoll statt aller Quader.
    buildGrid() {
      const dyn = new Set(this.movers.map((m) => m.b)), M = GRID_MARGIN;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const b of this.solids) {
        if (dyn.has(b)) continue;
        x0 = Math.min(x0, b.min[0]); z0 = Math.min(z0, b.min[2]); x1 = Math.max(x1, b.max[0]); z1 = Math.max(z1, b.max[2]);
      }
      x0 = Math.max(-600, x0 - M); z0 = Math.max(-600, z0 - M); x1 = Math.min(600, x1 + M); z1 = Math.min(600, z1 + M);
      const nx = Math.max(1, Math.ceil((x1 - x0) / GRID_CELL)), nz = Math.max(1, Math.ceil((z1 - z0) / GRID_CELL));
      const dynList = [...dyn];
      const cells = Array.from({ length: nx * nz }, () => dynList.slice());
      for (const b of this.solids) {
        if (dyn.has(b)) continue;
        const i0 = clamp(Math.floor((b.min[0] - M - x0) / GRID_CELL), 0, nx - 1), i1 = clamp(Math.floor((b.max[0] + M - x0) / GRID_CELL), 0, nx - 1);
        const k0 = clamp(Math.floor((b.min[2] - M - z0) / GRID_CELL), 0, nz - 1), k1 = clamp(Math.floor((b.max[2] + M - z0) / GRID_CELL), 0, nz - 1);
        for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) cells[k * nx + i].push(b);
      }
      this.grid = { x0, z0, nx, nz, cells, dyn: dynList };
    }
  }
  const GRID_CELL = 8, GRID_MARGIN = 2.5;
  // Quader in der Naehe von (x, z) — reicht fuer alles, was naeher als GRID_MARGIN liegt
  function near(L, x, z) {
    const g = L.grid;
    if (!g) return L.solids;
    const i = Math.floor((x - g.x0) / GRID_CELL), k = Math.floor((z - g.z0) / GRID_CELL);
    if (i < 0 || k < 0 || i >= g.nx || k >= g.nz) return g.dyn;
    return g.cells[k * g.nx + i];
  }
  // Oberkante eines Quaders an der Stelle (x, z): bei Rampen schraeg, sonst flach
  function topAt(b, x, z) {
    const s = b.slope;
    if (!s) return b.max[1];
    const k = clamp(((s.axis === 0 ? x : z) - s.c0) / (s.c1 - s.c0), 0, 1);
    return s.y0 + (s.y1 - s.y0) * k;
  }

  /* ═══════════ Gemaelde-Texturen (Canvas) ═══════════ */
  const vgrad = (c, h, stops) => { const g = c.createLinearGradient(0, 0, 0, h); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
  const dot2 = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
  const PAINT_BG = {
    hills(c, w, h) {
      c.fillStyle = vgrad(c, h, [[0, '#5fb8ff'], [1, '#d8f1ff']]); c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff6b0'; dot2(c, w * .82, h * .2, h * .1);
      c.fillStyle = '#6fcf5e'; c.beginPath(); c.ellipse(w * .25, h * 1.05, w * .45, h * .45, 0, 0, TAU); c.fill();
      c.fillStyle = '#3f9f2e'; c.beginPath(); c.ellipse(w * .8, h * 1.1, w * .5, h * .42, 0, 0, TAU); c.fill();
    },
    ocean(c, w, h) {
      c.fillStyle = vgrad(c, h, [[0, '#0b3a8a'], [.6, '#1f8fd8'], [1, '#7fe0ff']]); c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3;
      for (let r = 0; r < 5; r++) {
        c.beginPath();
        for (let x = 0; x <= w; x += 6) c.lineTo(x, h * (.18 + r * .17) + Math.sin(x * .05 + r) * 5);
        c.stroke();
      }
      c.fillStyle = '#e8d08a'; c.fillRect(0, h * .9, w, h * .1);
    },
    snow(c, w, h) {
      c.fillStyle = vgrad(c, h, [[0, '#8fc4ff'], [1, '#eaf6ff']]); c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(w * .02, h); c.lineTo(w * .45, h * .16); c.lineTo(w * .98, h); c.fill();
      c.fillStyle = '#c6dcf5'; c.beginPath(); c.moveTo(w * .45, h * .16); c.lineTo(w * .98, h); c.lineTo(w * .5, h); c.fill();
      c.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 40; i++) dot2(c, (i * 73) % w, (i * 151) % h, 1.6);
    },
    haunt(c, w, h) {
      c.fillStyle = vgrad(c, h, [[0, '#1a0633'], [1, '#5a3a8a']]); c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff3a8'; dot2(c, w * .78, h * .25, h * .14);
      c.fillStyle = '#240a44'; dot2(c, w * .74, h * .21, h * .13);
      c.fillStyle = '#120424'; c.fillRect(w * .06, h * .58, w * .3, h * .42);
      c.beginPath(); c.moveTo(w * .02, h * .6); c.lineTo(w * .21, h * .34); c.lineTo(w * .4, h * .6); c.fill();
      c.fillStyle = '#ffd84a'; c.fillRect(w * .12, h * .68, w * .05, h * .08); c.fillRect(w * .24, h * .68, w * .05, h * .08);
    },
    clock(c, w, h) {
      const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * .7);
      g.addColorStop(0, '#f2c46a'); g.addColorStop(1, '#6a3c0c');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const gear = (x, y, r, teeth) => {
        c.fillStyle = 'rgba(90,50,10,.55)'; c.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
          const a = i / (teeth * 2) * TAU, rr = i % 2 ? r : r * 1.2;
          c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        c.closePath(); c.fill();
        c.fillStyle = 'rgba(242,196,106,.6)'; dot2(c, x, y, r * .35);
      };
      gear(w * .16, h * .24, h * .2, 10); gear(w * .86, h * .78, h * .26, 12); gear(w * .9, h * .14, h * .12, 8);
    },
    rainbow(c, w, h) {
      c.fillStyle = '#10103a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      for (let i = 0; i < 30; i++) c.fillRect((i * 89) % w, (i * 41) % h, 1.5, 1.5);
      ['#ff3b3b', '#ff9a2e', '#ffe14a', '#4cd964', '#3aa0ff', '#8a5cff'].forEach((col, i) => {
        c.strokeStyle = col; c.lineWidth = h * .06;
        c.beginPath(); c.arc(w / 2, h * 1.08, h * (.95 - i * .065), Math.PI, 0); c.stroke();
      });
    },
    mushroom(c, w, h) {
      c.fillStyle = '#d6232a'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff';
      [[.12, .2, .12], [.5, .08, .08], [.86, .3, .14], [.3, .78, .1], [.74, .84, .12], [.06, .92, .07]]
        .forEach(([x, y, r]) => dot2(c, w * x, h * y, h * r));
    },
    desert(c, w, h) {
      c.fillStyle = vgrad(c, h, [[0, '#3a7bd5'], [.55, '#f6c27a'], [1, '#f0a050']]); c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff2b0'; dot2(c, w * .78, h * .24, h * .09);
      c.fillStyle = '#c89660';
      [[.06, .6, .16, .3], [.24, .52, .14, .4], [.42, .22, .1, .7], [.54, .58, .2, .34], [.78, .56, .14, .36]]
        .forEach(([x, y, ww, hh]) => c.fillRect(w * x, h * y, w * ww, h * hh));
      c.fillStyle = '#b07e4a'; c.fillRect(w * .4, h * .2, w * .14, h * .04);
      c.fillStyle = '#5a3a20';
      [[.1, .68], [.28, .6], [.45, .32], [.45, .46], [.6, .66], [.82, .64]].forEach(([x, y]) => c.fillRect(w * x, h * y, w * .03, h * .06));
      c.fillStyle = '#e8b870'; c.beginPath(); c.moveTo(0, h * .86); c.quadraticCurveTo(w * .35, h * .74, w * .65, h * .88); c.quadraticCurveTo(w * .85, h * .8, w, h * .84); c.lineTo(w, h); c.lineTo(0, h); c.fill();
      c.strokeStyle = '#2f7f2e'; c.lineWidth = 5;
      for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(w * .9, h * .5); c.quadraticCurveTo(w * (.9 + Math.cos(k * 1.3) * .06), h * .42, w * (.9 + Math.cos(k * 1.3) * .1), h * (.5 + Math.sin(k * 1.3) * .04)); c.stroke(); }
      c.strokeStyle = '#8a6a3a'; c.lineWidth = 6; c.beginPath(); c.moveTo(w * .88, h * .9); c.quadraticCurveTo(w * .86, h * .7, w * .9, h * .5); c.stroke();
    },
    neon(c, w, h) {
      c.fillStyle = vgrad(c, h, [[0, '#12002e'], [.55, '#3a0060'], [1, '#ff2fb0']]); c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(0,255,255,.55)'; c.lineWidth = 1.5;
      for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(w / 2 + i * 8, h * .6); c.lineTo(w / 2 + i * w * .14, h); c.stroke(); }
      for (let j = 0; j < 6; j++) { const yy = h * .6 + Math.pow(j / 5, 2) * h * .4; c.beginPath(); c.moveTo(0, yy); c.lineTo(w, yy); c.stroke(); }
      c.fillStyle = '#fff';
      for (let i = 0; i < 30; i++) c.fillRect((i * 97) % w, (i * 53) % (h * .5), 1.5, 1.5);
    },
  };
  // Jedes Bild fuehrt in eine eigene Welt; darin steht ein Portal zur echten Webseite (href)
  const PAINTINGS = [
    { href: '../terminal.html',   bg: 'hills',    gif: 'tux_computer_dig_md_clr.gif', name: 'Terminal-Tal',          level: 'terminal' },
    { href: '../page1.html',      bg: 'ocean',    gif: 'pra.gif',                     name: 'Video-Bucht',           level: 'video' },
    { href: '../bounce.html',     bg: 'snow',     gif: 'bounce.gif',                  name: 'Bounce-Berg',           level: 'bounce' },
    { href: '../home/index.html', bg: 'haunt',    gif: 'devil_boy.gif',               name: 'Spuk-Home',             level: 'spuk' },
    { href: 'https://search.glappa.de/', bg: 'clock', gif: 'computer.gif',            name: 'Such-Uhrwerk',          level: 'uhrwerk' },
    { href: 'mandelbrot.html',    bg: 'rainbow',  gif: 'mandelbrot-preview.gif',      name: 'Mandelbrot-Regenbogen', level: 'fraktal' },
    { href: 'pilzskip.html',      bg: 'mushroom', gif: 'kittenhammock.gif',           name: 'Pilzwald',              level: 'pilz' },
    { href: '../index.html',      bg: 'neon',     gif: 'welcome.gif',                 name: 'Neon-Garten',           level: 'neon' },
  ];
  /* ═══════════ Halluzinations-Kunst fuer die Gemaelde ═══════════
     Jedes Bild ist ein eigenes Fragment-Programm (abstrakt, zum Thema des Titels).
     Es wird einmal auf der GPU in eine 1024er-Textur gerendert — in Streifen ueber
     mehrere Frames verteilt, damit nichts ruckelt — und bekommt dann Mipmaps.
     Bis dahin haengt ein schnelles Canvas-Ersatzbild im Rahmen. */
  const ART_GLSL = {
    common: `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uSeed; uniform sampler2D uLabel;
const float PI = 3.14159265; const float TAU = 6.2831853; const float ART_H = 0.857142857;
float PX;
float ss(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 RM = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = RM * p + vec2(3.1, 1.7); a *= 0.5; } return s / 0.984; }
float fbm3(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = RM * p + vec2(3.1, 1.7); a *= 0.5; } return s / 0.875; }
float ridged(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * (1.0 - abs(vnoise(p) * 2.0 - 1.0)); p = RM * p + vec2(1.3, 2.9); a *= 0.5; } return s / 0.984; }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
vec3 hsv(vec3 c) { vec3 q = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(q - 1.0, 0.0, 1.0), c.y); }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
vec3 voro(vec2 p) {
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)); vec2 r = g + h22(i + g) - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h21(i + g); } else if (d < d2) { d2 = d; }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
`,
    main: `
void main() {
  vec2 frag = gl_FragCoord.xy;
  PX = 1.3333 / uRes.x;
  vec2 uv = frag / uRes;
  vec2 p = vec2((uv.x - 0.5) * 1.3333, 0.5 - uv.y / ART_H);
  vec3 col = art(p);
  col *= 1.0 - 0.3 * pow(clamp(length(p * vec2(0.8, 1.05)), 0.0, 1.0), 2.5);
  col += (h21(frag * 1.37 + uSeed) - 0.5) * 0.03;
  vec4 lab = texture2D(uLabel, uv);
  gl_FragColor = vec4(mix(clamp(col, 0.0, 1.0), lab.rgb, lab.a), 1.0);
}
`,
    // Terminal-Tal: Huegel aus leuchtendem Code, Daten-Wirbel, Leiterbahnen
    hills: `
float glyph(vec2 cell, vec2 f) {
  if (f.x < 0.14 || f.x > 0.86 || f.y < 0.1 || f.y > 0.9) return 0.0;
  vec2 g = floor((f - vec2(0.14, 0.1)) / vec2(0.72, 0.8) * vec2(5.0, 7.0));
  return step(0.52, h21(cell * 7.13 + g * vec2(1.37, 3.91)));
}
vec3 art(vec2 p) {
  vec3 col = mix(vec3(0.0, 0.1, 0.045), vec3(0.0, 0.015, 0.01), ss(-0.2, 0.5, p.y));
  vec2 c = p - vec2(0.2, 0.22);
  float r = length(c), a = atan(c.y, c.x);
  float s = a * 3.0 + log(r + 0.02) * 6.0;
  float sw = fbm(vec2(cos(s), sin(s)) * (1.5 + r * 4.0) + vec2(r * 6.0, 1.0));
  float arms = pow(0.5 + 0.5 * cos(s), 3.0);
  col += vec3(0.1, 0.95, 0.45) * arms * sw * 1.2 * ss(0.8, 0.05, r);
  col += vec3(0.2, 1.0, 0.5) * ss(0.46, 0.5, abs(fract(r * 22.0) - 0.5)) * 0.2 * ss(0.5, 0.08, r);
  col += vec3(0.25, 1.0, 0.55) * 0.004 / (r * r + 0.004) * 0.6;
  col = mix(col, vec3(0.82, 1.0, 0.82), ss(0.064, 0.056, r));
  vec2 w = p * 11.0 + (vec2(fbm3(p * 2.5), fbm3(p * 2.5 + 7.7)) - 0.5) * 3.0;
  vec2 gw = abs(fract(w) - 0.5);
  float trace = ss(0.46, 0.5, max(gw.x, gw.y)) * step(0.62, h21(floor(w) + 0.5));
  float node = ss(0.1, 0.06, length(fract(w) - 0.5)) * step(0.82, h21(floor(w)));
  col += vec3(0.1, 0.75, 0.3) * (trace * 0.4 + node * 0.7) * ss(-0.15, 0.2, p.y);
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float h = 0.02 - fk * 0.1 + 0.16 * fbm3(vec2(p.x * (1.6 + fk * 0.9) + fk * 7.3, fk * 3.1)) + 0.03 * sin(p.x * (4.0 + fk) + fk);
    if (p.y < h) {
      float depth = h - p.y;
      vec2 q = vec2(p.x + fk * 0.37, p.y - h * 0.6) * (95.0 - fk * 15.0);
      vec2 cell = floor(q);
      float g = glyph(cell + fk * 31.0, fract(q));
      float lum = h21(cell + vec2(fk, 9.0));
      float head = step(0.9, h21(vec2(cell.x, fk))) * ss(0.03, 0.0, abs(depth - 0.04 - 0.25 * h21(vec2(cell.x, fk + 1.0))));
      vec3 base = mix(vec3(0.0, 0.05, 0.02), vec3(0.01, 0.17, 0.065), fk / 4.0) * max(0.0, 1.0 - depth * 1.5);
      col = base + vec3(0.12, 1.0, 0.42) * g * (0.12 + 0.88 * lum * lum) * exp(-depth * 5.0) * (0.35 + fk * 0.16);
      col += vec3(0.75, 1.0, 0.8) * g * head;
      col += vec3(0.35, 1.0, 0.55) * ss(0.004 + PX, 0.0, depth) * (0.5 + fk * 0.12);
    }
  }
  col *= 0.88 + 0.12 * sin(p.y * 880.0);
  return col;
}
`,
    // Video-Bucht: Sonnenuntergang, Filmstreifen-Spirale, Brandungswirbel
    ocean: `
vec4 curlWave(vec2 wc, float R, float seed) {
  float wr = length(wc), wa = atan(wc.y, wc.x);
  float cu = fract(wa / TAU + wr / R * 1.6 - fbm3(wc * 9.0 + seed) * 0.25);
  float m = ss(R, R - PX * 2.0, wr) * ss(0.0, R * 0.12, wr);
  vec3 c = mix(vec3(0.03, 0.2, 0.5), vec3(0.25, 0.75, 0.9), cu);
  float foam = ss(0.8, 0.9, cu) + step(0.7, fbm(wc * 40.0 + seed)) * ss(0.55, 0.95, cu);
  c = mix(c, vec3(0.95, 0.98, 1.0), clamp(foam, 0.0, 1.0));
  c *= 0.75 + 0.25 * sin(wr / R * 40.0 + wa * 2.0);
  return vec4(c, m);
}
vec3 art(vec2 p) {
  float hz = -0.04;
  float sy = clamp((p.y - hz) / 0.55, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.58, 0.28), vec3(0.8, 0.22, 0.5), ss(0.0, 0.45, sy));
  col = mix(col, vec3(0.13, 0.05, 0.3), ss(0.4, 1.0, sy));
  float cl = fbm(vec2(p.x * 3.0 + fbm3(p * 4.0) * 1.5, p.y * 15.0));
  col = mix(col, vec3(1.0, 0.78, 0.58), ss(0.55, 0.8, cl) * 0.55);
  col = mix(col, vec3(0.38, 0.1, 0.36), ss(0.64, 0.9, cl) * 0.35);
  vec2 sc = p - vec2(0.0, 0.06);
  float r = length(sc), a = atan(sc.y, sc.x);
  float cutMask = step(ss(0.0, -0.18, sc.y) * 0.65, fract(-sc.y * 26.0));
  vec3 sunCol = mix(vec3(1.0, 0.95, 0.5), vec3(1.0, 0.35, 0.45), ss(0.17, -0.17, sc.y));
  col = mix(col, sunCol, ss(0.17 + PX, 0.17, r) * cutMask);
  col += vec3(1.0, 0.6, 0.3) * 0.02 / (r * r * 3.0 + 0.02) * 0.35;
  float lr = log(r + 0.001);
  float armC = a / TAU * 3.0 - lr * 0.9;
  float across = abs(fract(armC) - 0.5);
  float along = lr * 7.0;
  float strip = ss(0.1, 0.092, across) * ss(0.12, 0.22, r) * ss(0.8, 0.55, r);
  if (strip > 0.0) {
    float inPic = step(across, 0.065) * step(abs(fract(along) - 0.5), 0.42);
    vec3 pic = hsv(vec3(fract(h21(vec2(floor(along), floor(armC))) * 0.35 + 0.88), 0.7, 1.0));
    pic *= 0.55 + 0.45 * fbm3(vec2(along * 3.0, across * 30.0));
    float hole = step(0.074, across) * step(across, 0.09) * step(abs(fract(along * 4.0) - 0.5), 0.2);
    vec3 fc = mix(vec3(0.05, 0.03, 0.06), pic, inPic);
    fc = mix(fc, col * 1.25, hole);
    col = mix(col, fc, strip * 0.92);
  }
  if (p.y < hz) {
    float d = hz - p.y;
    float z = 0.08 / (d + 0.004);
    vec2 wq = vec2(p.x * z, z);
    float wv = fbm(wq * vec2(1.2, 2.6) + vec2(0.0, fbm3(wq * 0.7) * 2.0));
    float crest = pow(0.5 + 0.5 * sin(z * 3.2 + wv * 7.0 + p.x * 3.0), 6.0);
    vec3 sea = mix(vec3(0.95, 0.45, 0.35), vec3(0.05, 0.25, 0.42), ss(0.0, 0.2, d));
    sea = mix(sea, vec3(0.02, 0.08, 0.22), ss(0.2, 0.45, d));
    sea += vec3(1.0, 0.72, 0.48) * crest * 0.35 * (1.0 - ss(0.0, 0.3, d));
    float glit = step(0.84, h21(floor(vec2(p.x * 180.0 + wv * 20.0, z * 18.0)))) * exp(-abs(p.x) * 14.0 / (1.0 + d * 4.0));
    sea += vec3(1.0, 0.9, 0.62) * glit * 0.9;
    col = mix(sea, vec3(1.0, 0.82, 0.62), ss(0.004, 0.0, d) * 0.6);
  }
  vec4 w1 = curlWave(p - vec2(-0.42, -0.33), 0.3, 1.0);
  col = mix(col, w1.rgb, w1.a);
  vec4 w2 = curlWave((p - vec2(0.5, -0.38)) * vec2(-1.0, 1.0), 0.22, 7.0);
  col = mix(col, w2.rgb, w2.a);
  return col;
}
`,
    // Bounce-Berg: Polarlicht, Kristall-Schneeflocken, Gebirge, Huepf-Bahnen
    snow: `
float flakeSD(vec2 q) {
  float r = length(q), a = atan(q.y, q.x);
  a = abs(mod(a + PI / 6.0, PI / 3.0) - PI / 6.0);
  vec2 k = r * vec2(cos(a), sin(a));
  float d = sdSeg(k, vec2(0.0), vec2(0.2, 0.0));
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 s0 = vec2(0.045 + fi * 0.04, 0.0);
    d = min(d, sdSeg(k, s0, s0 + (0.07 - fi * 0.013) * vec2(0.5, 0.866)));
  }
  return min(d, abs(r - 0.035));
}
vec3 art(vec2 p) {
  vec3 col = mix(vec3(0.02, 0.05, 0.16), vec3(0.12, 0.28, 0.48), ss(0.5, -0.2, p.y));
  vec2 sq = p * 90.0;
  col += vec3(0.8, 0.9, 1.0) * step(0.985, h21(floor(sq))) * ss(0.35, 0.0, length(fract(sq) - 0.5));
  float au = fbm(vec2(p.x * 2.2, p.y * 0.8) + 2.0);
  float curtain = pow(0.5 + 0.5 * sin(p.x * 55.0 + au * 14.0), 4.0);
  float bandA = ss(0.02, 0.2, p.y - (0.06 + au * 0.15)) * ss(0.55, 0.2, p.y - au * 0.1);
  vec3 auc = mix(vec3(0.1, 1.0, 0.6), vec3(0.8, 0.3, 1.0), ss(0.2, 0.5, p.y + au * 0.2));
  col += auc * (0.35 + curtain * 0.9) * bandA * 0.7;
  vec2 fc = rot(0.2) * (p - vec2(-0.3, 0.2));
  float fd = flakeSD(fc / 0.9) * 0.9;
  col += vec3(0.7, 0.9, 1.0) * 0.004 / (fd + 0.004) * 0.35 * ss(0.3, 0.1, length(fc));
  col = mix(col, vec3(0.93, 0.97, 1.0), ss(0.004 + PX, 0.004, fd));
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2(h21(vec2(fi, 1.3)) * 1.2 - 0.6, h21(vec2(fi, 4.7)) * 0.45 + 0.02);
    float s = 0.18 + h21(vec2(fi, 8.1)) * 0.25;
    float d2 = flakeSD(rot(fi) * (p - c) / s) * s;
    col = mix(col, vec3(0.85, 0.95, 1.0), ss(0.0025 + PX, 0.0025, d2) * 0.8);
  }
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float fq = 2.2 + fk;
    float h = -0.14 - fk * 0.12 + ridged(vec2(p.x * fq + fk * 5.0, fk)) * (0.28 - fk * 0.05);
    if (p.y < h) {
      float e = 0.004;
      float hx = ridged(vec2((p.x + e) * fq + fk * 5.0, fk)) - ridged(vec2((p.x - e) * fq + fk * 5.0, fk));
      float dd = h - p.y;
      // Fels-Struktur: Rinnen folgen dem Hang, Schnee sammelt sich oben und in Mulden
      vec2 tp = rot(0.5 - hx * 0.08) * p * 13.0 + fk * 3.0;
      float tex = fbm(tp);
      float gully = ridged(tp * 1.4 + vec2(fbm3(p * 9.0) * 2.0, 0.0));
      float light = clamp(0.55 - hx * 2.5 + (tex - 0.5) * 0.9 - (gully - 0.5) * 0.35, 0.0, 1.0);
      vec3 snowC = mix(vec3(0.5, 0.62, 0.86), vec3(1.0, 1.0, 1.0), light);
      vec3 rock = mix(vec3(0.1, 0.12, 0.22), vec3(0.34, 0.37, 0.5), light) * (0.8 + 0.4 * tex);
      float snowAmt = ss(0.52, 0.62, tex * 0.7 + gully * 0.25 + (0.1 - dd) * 2.2);
      vec3 mtn = mix(rock, snowC, snowAmt);
      mtn = mix(mtn, vec3(0.32, 0.42, 0.68), (2.0 - fk) * 0.22);
      col = mtn;
      col += vec3(0.7, 0.85, 1.0) * ss(PX * 2.5, 0.0, dd) * 0.55;
    }
  }
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x0 = -0.62 + fi * 0.1, w = 0.16 + fi * 0.04, y0 = -0.42 + fi * 0.05, hgt = 0.33 - fi * 0.06;
    float u = (p.x - x0) / w;
    float fu = fract(u);
    float decay = pow(0.72, floor(u));
    float yy = y0 + hgt * decay * 4.0 * fu * (1.0 - fu);
    float slope = hgt * decay * 4.0 * (1.0 - 2.0 * fu) / w;
    float dist = abs(p.y - yy) / sqrt(1.0 + slope * slope);
    vec3 hc = hsv(vec3(0.3 + fi * 0.15, 0.65, 1.0));
    col += hc * ss(0.004 + PX, 0.0, dist) * step(0.5, fract(u * 14.0 + 0.25)) * step(0.0, u) * step(u, 4.0) * 0.9;
    vec2 bc = vec2(x0 + 0.5 * w, y0 + hgt);
    vec2 lq = (p - bc) / 0.03;
    vec3 nrm = vec3(lq, sqrt(max(0.0, 1.0 - dot(lq, lq))));
    vec3 bcol = hc * (0.3 + 0.7 * max(0.0, dot(nrm, normalize(vec3(-0.4, 0.6, 0.7))))) + vec3(pow(max(0.0, dot(nrm, normalize(vec3(-0.3, 0.4, 0.86)))), 30.0));
    col = mix(col, bcol, ss(PX, 0.0, length(p - bc) - 0.03));
  }
  vec2 gq = p * 60.0;
  vec2 gf = fract(gq) - 0.5;
  float crs = max(ss(0.03, 0.0, abs(gf.x)), ss(0.03, 0.0, abs(gf.y))) * ss(0.45, 0.1, length(gf));
  col += vec3(0.8, 0.95, 1.0) * step(0.93, h21(floor(gq) + 17.0)) * crs * 0.8;
  return col;
}
`,
    // Spuk-Home: Rauchstrudel, Mond, schiefes Haus, Augen im Dunkeln, Geister, Spinnennetz
    haunt: `
vec3 art(vec2 p) {
  vec2 q = vec2(fbm(p * 2.6), fbm(p * 2.6 + vec2(5.2, 1.3)));
  vec2 r2 = vec2(fbm(p * 2.6 + 3.5 * q + vec2(1.7, 9.2)), fbm(p * 2.6 + 3.5 * q + vec2(8.3, 2.8)));
  float f = fbm(p * 2.6 + 3.5 * r2);
  vec3 col = mix(vec3(0.02, 0.0, 0.05), vec3(0.34, 0.09, 0.48), clamp(f * f * 1.8, 0.0, 1.0));
  col = mix(col, vec3(0.06, 0.42, 0.32), clamp(length(q) - 0.55, 0.0, 1.0) * 0.7);
  col = mix(col, vec3(0.78, 0.58, 1.0), clamp(r2.x * r2.x * f - 0.15, 0.0, 1.0) * 0.6);
  vec2 mc = p - vec2(0.33, 0.24);
  float mr = length(mc);
  col += vec3(0.8, 0.7, 1.0) * 0.01 / (pow(max(mr - 0.1, 0.0), 2.0) * 6.0 + 0.01) * 0.25;
  col += vec3(0.6, 0.5, 0.9) * ss(0.47, 0.5, abs(fract(mr * 16.0) - 0.5)) * ss(0.35, 0.12, mr) * 0.25;
  if (mr < 0.1 + PX) {
    vec3 vr = voro(mc * 38.0);
    float crater = ss(0.3, 0.1, vr.x) * step(0.5, vr.z);
    vec2 mq = mc / 0.1;
    vec3 mn = vec3(mq, sqrt(max(0.0, 1.0 - dot(mq, mq))));
    vec3 moon = vec3(1.0, 0.96, 0.8) * (0.45 + 0.55 * max(0.0, dot(mn, normalize(vec3(-0.5, 0.3, 0.8)))));
    moon *= 1.0 - crater * 0.25 - (fbm3(mc * 40.0) - 0.5) * 0.25;
    col = mix(col, moon, ss(0.1 + PX, 0.1, mr));
  }
  vec2 eg = p * vec2(9.0, 11.0);
  vec2 eid = floor(eg), ef = fract(eg) - 0.5;
  float eh = h21(eid + 11.0);
  if (eh > 0.78 && f < 0.55) {
    vec2 o = (h22(eid) - 0.5) * 0.3;
    vec3 ecol = eh > 0.92 ? vec3(1.0, 0.25, 0.2) : vec3(1.0, 0.9, 0.3);
    for (int s = 0; s < 2; s++) {
      vec2 e = ef - o - vec2(float(s) * 0.26 - 0.13, 0.0);
      float el = length(e * vec2(1.0, 2.4)) - 0.09;
      float pupil = length(e * vec2(3.5, 1.0)) - 0.05;
      col += ecol * 0.02 / (max(el, 0.0) + 0.02) * 0.1;
      col = mix(col, ecol, ss(0.02, 0.0, el));
      col = mix(col, vec3(0.0), ss(0.02, 0.0, pupil) * step(el, 0.0));
    }
  }
  vec2 hp = p - vec2(-0.3, -0.5);
  hp.x += hp.y * 0.18;
  float house = sdBox(hp - vec2(0.0, 0.2), vec2(0.17, 0.2));
  house = min(house, sdBox(hp - vec2(0.1, 0.45), vec2(0.05, 0.12)));
  vec2 rp = hp - vec2(0.0, 0.4);
  house = min(house, max(abs(rp.x) * 0.9 + rp.y * 0.8 - 0.14, -rp.y));
  vec2 tp = hp - vec2(0.1, 0.57);
  house = min(house, max(abs(tp.x) * 1.4 + tp.y * 0.5 - 0.07, -tp.y));
  vec2 wg = (hp - vec2(-0.12, 0.08)) / vec2(0.075, 0.09);
  vec2 wid = floor(wg), wf = fract(wg) - 0.5;
  float win = step(sdBox(wf, vec2(0.22, 0.26)), 0.0) * step(0.0, wid.x) * step(wid.x, 3.0) * step(0.0, wid.y) * step(wid.y, 2.0);
  vec3 wcol = mix(vec3(0.05, 0.02, 0.08), vec3(1.0, 0.8, 0.3) * (0.7 + 0.3 * h21(wid)), step(0.35, h21(wid + 3.0)));
  col = mix(col, mix(vec3(0.012, 0.0, 0.025), wcol, win), ss(PX, 0.0, house));
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 gc = vec2(-0.05 + fi * 0.24, 0.1 + sin(fi * 2.3) * 0.12);
    vec2 g = rot(0.3 - fi * 0.3) * (p - gc) / (0.8 + fi * 0.2);
    float wob = (fbm3(vec2(g.y * 8.0, fi * 3.0)) - 0.5) * 0.08;
    float headG = length(g) - 0.07;
    float sheet = max(abs(g.x + wob * max(-g.y, 0.0) * 6.0) - 0.07 - max(-g.y, 0.0) * 0.15, max(g.y, (-0.17 + 0.018 * sin(g.x * 70.0 + fi)) - g.y));
    float gd = min(headG, sheet);
    float ga = ss(PX * 1.5, -0.01, gd) * 0.75;
    col += vec3(0.6, 0.9, 1.0) * 0.01 / (max(gd, 0.0) + 0.01) * 0.08;
    col = mix(col, vec3(0.9, 0.95, 1.0), ga);
    float ge = min(length((g - vec2(-0.025, 0.01)) * vec2(1.0, 0.6)) - 0.013, length((g - vec2(0.025, 0.01)) * vec2(1.0, 0.6)) - 0.013);
    ge = min(ge, length((g - vec2(0.0, -0.035)) * vec2(1.0, 0.8)) - 0.015);
    col = mix(col, vec3(0.02, 0.0, 0.05), ss(PX, 0.0, ge) * ga / 0.75);
  }
  vec2 wq = p - vec2(-0.667, 0.5);
  float wr = length(wq), wa = atan(wq.y, wq.x);
  float web = max(ss(PX * 1.2, 0.0, abs(sin(wa * 8.0)) * wr / 8.0), ss(0.5 - 22.0 * PX, 0.5, abs(fract(wr * 18.0 + sin(wa * 8.0) * 0.06) - 0.5)));
  col = mix(col, vec3(0.75, 0.75, 0.9), web * ss(0.42, 0.25, wr) * 0.55);
  return col;
}
`,
    // Such-Uhrwerk: Messing-Zahnraeder, Zifferblatt-Gravur, Lichtstrahlen, Lupe mit Vergroesserung
    clock: `
float gearSD(vec2 q, float R, float N, float ang) {
  float r = length(q), a = atan(q.y, q.x) + ang;
  float d = r - R - ss(-0.25, 0.25, cos(a * N)) * R * 0.13;
  d = max(d, R * 0.16 - r);
  float cut = max(max(R * 0.34 - r, r - R * 0.76), (0.35 - cos(a * 5.0)) * r * 0.35);
  return max(d, -cut);
}
vec3 metal(float t) { return t < 0.5 ? vec3(0.85, 0.62, 0.25) : (t < 0.8 ? vec3(0.78, 0.42, 0.24) : vec3(0.62, 0.64, 0.68)); }
vec3 scene(vec2 p) {
  float r = length(p), a = atan(p.y, p.x);
  vec3 col = mix(vec3(0.17, 0.1, 0.045), vec3(0.04, 0.02, 0.01), clamp(r * 1.2, 0.0, 1.0));
  col *= 0.85 + 0.3 * fbm3(p * 14.0);
  col += vec3(0.5, 0.35, 0.15) * ss(0.5 - 30.0 * PX, 0.5, abs(fract(r * 12.0) - 0.5)) * 0.25;
  float tick = ss(PX * 1.5, 0.0, abs(sin(a * 30.0)) * r / 30.0) * step(0.4, r) * step(r, 0.44);
  float tick5 = ss(PX * 3.0, 0.0, abs(sin(a * 6.0)) * r / 6.0) * step(0.38, r) * step(r, 0.46);
  col += vec3(0.9, 0.7, 0.35) * max(tick * 0.5, tick5);
  vec2 lp = p - vec2(0.8, 0.7);
  float la = atan(lp.y, lp.x);
  col += vec3(1.0, 0.8, 0.45) * pow(max(0.0, sin(la * 24.0 + fbm3(vec2(la * 4.0, 0.0)) * 3.0)), 6.0) * 0.18 * ss(1.6, 0.4, length(lp));
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    vec2 c = (h22(vec2(fi * 3.7, 1.9)) - 0.5) * vec2(1.4, 1.05);
    float R = 0.05 + 0.16 * h21(vec2(fi, 7.7));
    vec2 q = p - c;
    if (length(q) > R * 1.3 + 0.05) continue;
    float N = floor(8.0 + R * 70.0);
    float ang = fi * 1.3;
    col *= 1.0 - 0.55 * ss(0.02, -0.01, gearSD(q + vec2(-0.012, 0.016), R, N, ang));
    float d = gearSD(q, R, N, ang);
    float m = ss(PX, -PX, d);
    if (m > 0.0) {
      float rr = length(q), aa = atan(q.y, q.x);
      vec3 mb = metal(h21(vec2(fi, 3.3)));
      float brushed = 0.85 + 0.15 * sin(rr * 900.0 + fbm3(q * 30.0) * 4.0);
      vec3 gc = mb * brushed * (0.55 + 0.5 * (0.55 + 0.45 * cos(aa - 2.2)) * ss(R * 1.15, R * 0.2, rr));
      gc += vec3(1.0, 0.9, 0.7) * pow(max(0.0, cos(aa * 2.0 - 1.4)), 20.0) * 0.25;
      gc *= 1.0 - 0.45 * ss(-0.012, 0.0, d);
      gc = mix(gc, gc * 0.55, ss(0.004, 0.0, abs(rr - R * 0.55)));
      vec2 rq = vec2(rr, mod(aa + ang, TAU / 6.0) - TAU / 12.0);
      gc = mix(gc, mb * 1.3, ss(PX, 0.0, length(vec2(rq.x - R * 0.26, rq.y * rr)) - R * 0.03));
      col = mix(col, gc, m);
    }
  }
  return col;
}
vec3 art(vec2 p) {
  vec2 lc = vec2(-0.2, -0.04);
  float LR = 0.21;
  vec2 lq = p - lc;
  float ld = length(lq);
  float inLens = step(ld, LR);
  float k = ld / LR;
  vec2 sp = mix(p, lc + lq * (0.45 + 0.25 * k * k), inLens);
  vec3 col = scene(sp);
  vec3 lens = col * 1.12 + vec3(0.05, 0.07, 0.08) + vec3(pow(max(0.0, 1.0 - length(lq - vec2(-0.08, 0.09)) / 0.07), 3.0) * 0.5);
  col = mix(col, lens, inLens * ss(LR, LR - PX, ld));
  vec2 hd = normalize(vec2(1.0, -1.0));
  float handle = sdSeg(p, lc + hd * LR * 1.05, lc + hd * LR * 2.2) - 0.028;
  col = mix(col, vec3(0.28, 0.13, 0.05) * (0.7 + 0.5 * fbm3(p * 60.0)), ss(PX, 0.0, handle));
  vec3 rimCol = vec3(0.85, 0.62, 0.25) * (0.6 + 0.5 * cos(atan(lq.y, lq.x) - 2.2));
  col = mix(col, rimCol, ss(PX, 0.0, abs(ld - LR) - 0.012));
  return col;
}
`,
    // Mandelbrot-Regenbogen: gespiegelte Seepferdchen-Spiralen mit Streifen-Faerbung
    rainbow: `
vec3 art(vec2 p) {
  vec2 pp = rot(0.35) * vec2(abs(p.x), p.y);
  vec2 c = vec2(-0.7453, 0.1127) + pp * 0.012;
  vec2 z = vec2(0.0);
  float n = 0.0, m2 = 0.0, trap = 1000.0, stripe = 0.0;
  for (int i = 0; i < 220; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    m2 = dot(z, z);
    if (m2 > 1024.0) break;
    trap = min(trap, abs(z.y) + abs(z.x - 0.3) * 0.2);
    stripe += 0.5 + 0.5 * sin(4.0 * atan(z.y, z.x));
    n += 1.0;
  }
  vec3 col;
  if (m2 > 1024.0) {
    float mu = n + 1.0 - log(log(m2) * 0.5 / log(2.0)) / log(2.0);
    float st = stripe / max(n, 1.0);
    col = hsv(vec3(fract(mu * 0.021 + st * 0.12 + 0.55), 0.85, 1.0));
    col *= 0.72 + 0.28 * sin(mu * 0.35 + st * 3.0);
    col += hsv(vec3(fract(mu * 0.05), 0.4, 1.0)) * st * 0.2;
  } else {
    col = hsv(vec3(fract(trap * 3.0 + 0.7), 0.7, 0.25)) + vec3(0.02, 0.0, 0.05);
  }
  col += vec3(1.0, 0.95, 0.8) * 0.0015 / (trap + 0.0015) * 0.35;
  return col;
}
`,
    // Pilzwald: Farbringe, leuchtendes Myzel-Netz, zerfliessende Riesenpilze, Sporen
    mushroom: `
vec3 art(vec2 p) {
  vec2 cc = p - vec2(0.0, 0.55);
  float r = length(cc), a = atan(cc.y, cc.x);
  float warp = fbm(p * 3.0);
  float rings = sin(r * 42.0 - warp * 9.0 + sin(a * 7.0) * 0.6);
  vec3 col = hsv(vec3(fract(r * 0.9 + warp * 0.4 + 0.35), 0.65, 0.22 + 0.12 * rings));
  vec3 vr = voro(p * vec2(9.0, 12.0) + vec2(fbm3(p * 6.0), fbm3(p * 6.0 + 3.0)) * 1.3);
  float edge = vr.y - vr.x;
  float net = ss(0.06, 0.0, edge) * ss(0.1, -0.35, p.y);
  col += vec3(0.25, 1.0, 0.85) * net * (0.5 + 0.5 * h21(vec2(vr.z * 97.0, 1.0)));
  col += vec3(0.1, 0.6, 0.5) * ss(0.25, 0.0, edge) * ss(0.05, -0.4, p.y) * 0.15;
  float ground = -0.3 + fbm3(vec2(p.x * 4.0, 0.0)) * 0.1;
  if (p.y < ground) {
    col = mix(col, vec3(0.03, 0.09, 0.05) * (0.6 + 0.8 * fbm(p * 25.0)), 0.8);
    col += vec3(0.25, 1.0, 0.85) * net * 0.6;
  }
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float x = -0.55 + fi * 0.22 + (h21(vec2(fi, 2.0)) - 0.5) * 0.08;
    float sc = 0.55 + h21(vec2(fi, 5.0)) * 0.6 + fi * 0.05;
    float stemH = 0.2 * sc + h21(vec2(fi, 9.0)) * 0.15;
    float capW = 0.15 * sc, capH = 0.1 * sc;
    vec2 q = p - vec2(x, -0.32 - fi * 0.015);
    float bend = sin(q.y * 9.0 + fi) * 0.02 * sc;
    float sw = 0.022 * sc * (1.0 + 0.4 * ss(stemH * 0.3, 0.0, q.y));
    float stem = max(abs(q.x - bend) - sw, max(-q.y, q.y - stemH));
    vec3 capCol = hsv(vec3(fract(h21(vec2(fi, 13.0)) * 0.9 + 0.93), 0.8, 0.95));
    col = mix(col, vec3(0.92, 0.88, 0.75) * (0.7 + 0.3 * ss(-sw, sw, q.x - bend)), ss(PX, -PX, stem));
    vec2 cq = q - vec2(sin(stemH * 9.0 + fi) * 0.02 * sc, stemH);
    float gill = max(abs(cq.x) - capW * 0.95, max(-cq.y - 0.012 * sc, cq.y));
    col = mix(col, vec3(0.6, 0.45, 0.4) * (0.7 + 0.3 * sin(cq.x * 400.0 / sc)), ss(PX, -PX, gill));
    vec2 e = cq / vec2(capW, capH);
    float cap = max(length(e) - 1.0, -e.y) * capH;
    float slot = capW * 0.25;
    float cx2 = (floor(cq.x / slot) + 0.5) * slot;
    float dl = h21(vec2(floor(cq.x / slot), fi + 0.5)) * 0.06 * sc * step(abs(cx2), capW * 0.8);
    float dw = 0.008 * sc;
    float drip = min(max(abs(cq.x - cx2) - dw, max(cq.y, -dl - cq.y)), length(cq - vec2(cx2, -dl)) - dw * 1.3);
    if (dl > 0.004) cap = min(cap, drip);
    float capMask = ss(PX, -PX, cap);
    col += capCol * 0.02 / (max(cap, 0.0) + 0.02) * 0.12;
    if (capMask > 0.0) {
      vec3 cn = normalize(vec3(e.x, max(e.y, 0.0), sqrt(max(0.0, 1.0 - dot(e, e))) + 0.001));
      vec3 cc2 = capCol * (0.45 + 0.55 * max(0.0, dot(cn, normalize(vec3(-0.4, 0.7, 0.6)))));
      vec3 vs = voro(e * 3.5 + fi * 7.0);
      cc2 = mix(cc2, vec3(1.0, 0.97, 0.9), ss(0.28, 0.18, vs.x) * step(0.35, vs.z) * step(0.0, cq.y));
      cc2 += capCol * 0.6 * ss(0.8, 1.0, length(e)) * step(0.0, cq.y);
      col = mix(col, cc2, capMask);
    }
  }
  vec2 sg = p * 45.0 + vec2(0.0, fbm3(p * 3.0) * 4.0);
  vec2 sid = floor(sg);
  vec2 sf = fract(sg) - 0.5 - (h22(sid) - 0.5) * 0.6;
  col += hsv(vec3(fract(h21(sid) * 0.3 + 0.45), 0.5, 1.0)) * step(0.86, h21(sid + 5.0)) * ss(0.12, 0.0, length(sf)) * 0.9;
  return col;
}
`,
    // Neon-Garten: Synthwave-Sonne mit Glitch, Ringtunnel, Drahtgitter-Berge, Raster, Palmen
    neon: `
vec3 art(vec2 p) {
  float hz = -0.06;
  vec3 col = mix(vec3(1.0, 0.25, 0.62), vec3(0.2, 0.04, 0.38), ss(hz, hz + 0.25, p.y));
  col = mix(col, vec3(0.02, 0.0, 0.08), ss(hz + 0.2, 0.5, p.y));
  vec2 sq = p * 110.0;
  col += vec3(0.9, 0.85, 1.0) * step(0.988, h21(floor(sq))) * ss(0.4, 0.0, length(fract(sq) - 0.5)) * ss(hz + 0.1, hz + 0.3, p.y);
  vec2 tc = p - vec2(0.0, 0.1);
  float tr = length(tc), ta = atan(tc.y, tc.x);
  float tun = pow(0.5 + 0.5 * sin(log(tr + 0.001) * 18.0 + ta * 3.0), 12.0);
  col += hsv(vec3(fract(log(tr + 0.001) * 0.4), 0.8, 1.0)) * tun * 0.18 * ss(0.05, 0.25, tr) * step(hz, p.y);
  vec2 sc = p - vec2(0.0, 0.12);
  float gy = floor(p.y * 90.0);
  sc.x += step(0.93, h21(vec2(gy, 3.0))) * (h21(vec2(gy, 7.0)) - 0.5) * 0.06;
  float sr = length(sc);
  float cutMask = step(ss(0.02, -0.2, sc.y) * 0.7, fract(-sc.y * 22.0));
  vec3 sunCol = mix(vec3(1.0, 0.95, 0.35), vec3(1.0, 0.2, 0.55), ss(0.2, -0.2, sc.y));
  col = mix(col, sunCol, ss(0.2 + PX, 0.2, sr) * cutMask * step(hz, p.y));
  col += vec3(1.0, 0.3, 0.6) * 0.01 / (max(sr - 0.2, 0.0) * 4.0 + 0.01) * 0.12 * step(hz, p.y);
  float mh = hz + ridged(vec2(p.x * 3.0, 1.0)) * 0.22 * ss(0.05, 0.5, abs(p.x));
  if (p.y < mh && p.y > hz) {
    vec2 mg = vec2(p.x * 40.0, (p.y - hz) / max(mh - hz, 0.001) * 6.0);
    vec2 gm = abs(fract(mg) - 0.5);
    col = mix(vec3(0.08, 0.0, 0.15), vec3(0.2, 1.0, 1.0), ss(0.44, 0.5, max(gm.x, gm.y)) * 0.8);
    col += vec3(1.0, 0.3, 0.8) * ss(PX * 3.0, 0.0, mh - p.y);
  }
  if (p.y < hz) {
    float d = hz - p.y;
    float z = 0.12 / (d + 0.002);
    vec2 g = vec2(p.x * z * 9.0, z * 5.0);
    vec2 gf = abs(fract(g) - 0.5);
    float wx = min(PX * z * 9.0 * 1.2 + 0.03, 0.5);
    float wz = min(PX * 0.6 / ((d + 0.002) * (d + 0.002)) * 1.2 + 0.03, 0.5);
    float grid = max(ss(0.5 - wx, 0.5, gf.x), ss(0.5 - wz, 0.5, gf.y)) * ss(0.0, 0.08, d);
    vec3 floorC = mix(vec3(0.05, 0.0, 0.1), vec3(0.18, 0.0, 0.25), ss(0.5, 0.0, d));
    vec3 lineC = mix(vec3(0.2, 1.0, 1.0), vec3(1.0, 0.25, 0.8), step(0.5, fract(floor(g.x) * 0.5)));
    col = floorC + lineC * grid;
    col += vec3(1.0, 0.3, 0.7) * ss(0.06, 0.0, d) * 0.6;
    col += vec3(1.0, 0.4, 0.6) * ss(0.2, 0.0, abs(p.x)) * ss(0.25, 0.0, d) * 0.25 * (0.5 + 0.5 * sin(z * 6.0));
  }
  for (int i = 0; i < 2; i++) {
    float sd = float(i) * 2.0 - 1.0;
    vec2 base = vec2(sd * 0.5, -0.5);
    vec2 top = vec2(sd * 0.42, 0.18);
    vec2 q = p - base;
    float t = clamp(q.y / (top.y - base.y), 0.0, 1.0);
    float trunk = abs(q.x - (top.x - base.x) * t * t) - (0.016 - t * 0.008) - step(0.5, fract(t * 18.0)) * 0.003;
    trunk = max(trunk, max(-q.y, q.y - (top.y - base.y)));
    float palm = trunk;
    for (int k = 0; k < 9; k++) {
      // Wedel: gebogene, spitz zulaufende Blaetter mit gezackten Fiedern
      float fk = float(k);
      float ang = -0.1 + fk * 0.415 + sd * 0.1;
      vec2 dir = vec2(cos(ang), sin(ang) * 0.75);
      float L = 0.2 + 0.05 * sin(fk * 2.3 + sd);
      float droop = 0.1 + 0.06 * abs(cos(ang));
      vec2 prev = top;
      for (int j = 1; j <= 5; j++) {
        float u = float(j) / 5.0;
        vec2 cur = top + dir * u * L + vec2(0.0, -droop * u * u);
        float w = 0.024 * (1.0 - u * 0.85);
        palm = min(palm, sdSeg(p, prev, cur) - w);
        prev = cur;
      }
    }
    col = mix(col, vec3(0.03, 0.0, 0.06), ss(PX, -PX, palm));
    col += vec3(1.0, 0.3, 0.75) * ss(PX * 3.0, 0.0, abs(palm)) * 0.7;
  }
  col.r *= 0.92 + 0.08 * sin(p.y * 700.0);
  col.b *= 0.92 + 0.08 * sin(p.y * 700.0 + 2.0);
  return col;
}
`,
    // Wuestenstadt: Stern-Mosaik am Himmel, flimmernde Sonne, Minarette, Luftspiegelung, Duenen
    desert: `
float sdStar(vec2 p, float r, float n, float m) {
  float an = PI / n, en = PI / m;
  vec2 acs = vec2(cos(an), sin(an)), ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}
float duneH(float x, float k) {
  return -0.08 - k * 0.1 + 0.07 * sin(x * (3.0 + k) + k * 2.0 + fbm3(vec2(x * 2.0, k)) * 3.0) + 0.03 * fbm3(vec2(x * 6.0, k + 4.0));
}
vec3 art(vec2 p) {
  float hz = -0.02;
  vec3 col = mix(vec3(1.0, 0.8, 0.55), vec3(0.2, 0.45, 0.85), ss(hz, 0.45, p.y));
  vec2 mq = p * 5.0;
  vec2 mid = floor(mq), mf = fract(mq) - 0.5;
  float star = sdStar(mf, 0.38, 8.0, 3.0);
  float inner = sdStar(rot(PI / 8.0) * mf, 0.2, 8.0, 3.0);
  float lm = min(min(abs(star), abs(inner)), abs(max(abs(mf.x), abs(mf.y)) - 0.5));
  vec3 tile = hsv(vec3(fract(0.55 + h21(mid) * 0.12 + step(inner, 0.0) * 0.45), 0.55, 0.9));
  float skyMask = ss(hz + 0.08, hz + 0.3, p.y);
  col = mix(col, mix(col, tile, 0.35), skyMask * step(star, 0.0));
  col = mix(col, vec3(1.0, 0.86, 0.45), skyMask * ss(0.03, 0.0, lm) * 0.85);
  vec2 sp = p - vec2(0.28, 0.08);
  sp.x += sin(p.y * 140.0 + fbm3(p * 20.0) * 5.0) * 0.004 * ss(0.2, 0.0, p.y - hz);
  float sr = length(sp);
  col += vec3(1.0, 0.85, 0.5) * 0.02 / (sr * sr * 5.0 + 0.02) * 0.4;
  col = mix(col, vec3(1.0, 0.97, 0.8), ss(0.11 + PX, 0.11, sr));
  vec2 cp = p - vec2(-0.25, hz - 0.02);
  float city = sdBox(cp - vec2(0.0, 0.05), vec2(0.3, 0.05));
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float x = -0.27 + fi * 0.11;
    float h = 0.06 + h21(vec2(fi, 4.0)) * 0.1;
    city = min(city, sdBox(cp - vec2(x, h * 0.5), vec2(0.03, h * 0.5)));
    city = min(city, length(cp - vec2(x, h)) - 0.03);
  }
  city = min(city, sdBox(cp - vec2(0.12, 0.17), vec2(0.012, 0.17)));
  city = min(city, length((cp - vec2(0.12, 0.35)) * vec2(1.0, 0.7)) - 0.02);
  vec3 cityCol = vec3(0.42, 0.2, 0.2) + vec3(1.0, 0.75, 0.3) * step(0.9, h21(floor(cp * vec2(90.0, 60.0)))) * step(city, -0.006);
  col = mix(col, cityCol, ss(PX, -PX, city));
  if (p.y < hz && p.y > hz - 0.07) {
    vec2 mp = vec2(p.x + sin(p.y * 260.0) * 0.01, hz + (hz - p.y) * 2.5);
    col = mix(col, mix(vec3(1.0, 0.8, 0.55), vec3(0.2, 0.45, 0.85), ss(hz, 0.45, mp.y)), 0.6);
  }
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float h = duneH(p.x, fk);
    if (p.y < h) {
      float e = 0.003;
      float slope = (duneH(p.x + e, fk) - duneH(p.x - e, fk)) / (2.0 * e);
      float light = ss(-0.6, 0.6, -slope);
      float dd = h - p.y;
      vec3 sand = mix(mix(vec3(0.75, 0.42, 0.28), vec3(0.45, 0.2, 0.2), fk / 3.0), mix(vec3(1.0, 0.78, 0.45), vec3(1.0, 0.6, 0.35), fk / 3.0), light);
      float rip = 0.5 + 0.5 * sin(dd * (300.0 - fk * 40.0) + fbm3(vec2(p.x * 12.0, dd * 4.0)) * 6.0 + p.x * 40.0);
      sand *= (0.9 + 0.1 * rip) * (1.0 - dd * 0.6);
      col = sand + vec3(1.0, 0.9, 0.7) * ss(PX * 2.5, 0.0, dd) * light * 0.6;
    }
  }
  return col;
}
`,
  };
  // Grund- und Leuchtfarbe je Thema (Blende, Funken, Ersatzbild)
  const ART_TINT = {
    hills: ['#062a12', '#3fff6a'], ocean: ['#5a1e50', '#ffa060'], snow: ['#1a3a66', '#bfe8ff'],
    haunt: ['#1a0830', '#b58cff'], clock: ['#3a2410', '#f2c060'], rainbow: ['#1a1050', '#ff6ae8'],
    mushroom: ['#0a3020', '#6fffd0'], neon: ['#200040', '#ff3fb0'], desert: ['#3a6ab8', '#ffd080'],
  };
  function labelCanvas(n, name) {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 896;
    const c = cv.getContext('2d'), H = 768;
    c.fillStyle = '#4a2a0a'; c.fillRect(0, H, 1024, 128);
    c.fillStyle = '#f2c230'; c.fillRect(0, H, 1024, 10);
    dot2(c, 68, H + 68, 40);
    c.fillStyle = '#000'; c.font = '900 52px Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(n), 68, H + 70);
    c.fillStyle = '#ffe9a8'; c.font = 'italic 900 60px Arial Black, sans-serif'; c.textAlign = 'left';
    c.fillText(name, 132, H + 70, 1024 - 160);
    return cv;
  }
  // Ersatzbild (Canvas), solange die GPU-Kunst noch rendert oder falls sie nicht geht
  function paintingTexture(pd, n, label) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 448;
    const c = cv.getContext('2d');
    (PAINT_BG[pd.bg] || PAINT_BG.hills)(c, 512, 384);
    c.drawImage(label || labelCanvas(n, pd.name), 0, 0, 512, 448);
    return makeTex(cv);
  }
  const ArtGen = (() => {
    const SIZE = 1024;
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const VSA = 'attribute vec2 aP; void main() { gl_Position = vec4(aP, 0.0, 1.0); }';
    const progs = {}, cache = {}, queue = [], errors = [], timings = {};
    let fbo = null;
    const par = gl.getExtension('KHR_parallel_shader_compile');
    // Mit KHR_parallel_shader_compile blockiert nichts: bis der Treiber fertig ist, liefert program() 'wait'
    function program(theme) {
      let st = progs[theme];
      if (!st) {
        const pr = gl.createProgram();
        const mk = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); gl.attachShader(pr, sh); return sh; };
        const fs = mk(gl.FRAGMENT_SHADER, ART_GLSL.common + ART_GLSL[theme] + ART_GLSL.main);
        mk(gl.VERTEX_SHADER, VSA);
        gl.bindAttribLocation(pr, 0, 'aP');
        gl.linkProgram(pr);
        st = progs[theme] = { p: pr, fs, t0: performance.now(), ready: false, failed: false };
      }
      if (st.failed) return null;
      if (!st.ready) {
        if (par && !gl.getProgramParameter(st.p, par.COMPLETION_STATUS_KHR)) return 'wait';
        if (!gl.getProgramParameter(st.p, gl.LINK_STATUS)) {
          const msg = gl.getShaderInfoLog(st.fs) || gl.getProgramInfoLog(st.p) || 'link';
          errors.push(theme + ': ' + msg);
          console.warn('[glappa64] Kunst-Shader', theme, msg);
          st.failed = true;
          return null;
        }
        st.ready = true;
        st.uRes = gl.getUniformLocation(st.p, 'uRes'); st.uSeed = gl.getUniformLocation(st.p, 'uSeed'); st.uLabel = gl.getUniformLocation(st.p, 'uLabel');
        timings[theme] = Math.round(performance.now() - st.t0);
      }
      return st;
    }
    function request(holder, bg, n, name) {
      const key = bg + '|' + n + '|' + name;
      let e = cache[key];
      if (!e) {
        const label = labelCanvas(n, name);
        e = cache[key] = { key, bg, n, label, tex: paintingTexture({ bg, name }, n, label), done: false, holders: [], row: 0, target: null, labelTex: null };
        if (ART_GLSL[bg]) { queue.push(e); if (par) program(bg); } else e.done = true;
      }
      holder.tex = e.tex;
      holder.art = true;
      holder.bg = bg;
      if (!e.done) e.holders.push(holder);
      return e;
    }
    function drop(e) {
      const i = queue.indexOf(e);
      if (i >= 0) queue.splice(i, 1);
      e.done = true; e.holders.length = 0;
    }
    function finish(e) {
      gl.bindTexture(gl.TEXTURE_2D, e.target);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      gl.deleteTexture(e.labelTex); e.labelTex = null;
      const old = e.tex;
      e.tex = e.target;
      e.holders.forEach((h) => { h.tex = e.tex; });
      gl.deleteTexture(old);
      drop(e);
    }
    // rendert hoechstens "budget" Zeilen (verteilt ueber die Warteschlange)
    function pump(budget) {
      while (budget > 0 && queue.length) {
        let e = null, pr = null, again = false;
        for (const q of queue) {
          const r = program(q.bg);
          if (r === null) { drop(q); again = true; break; }
          if (r !== 'wait') { e = q; pr = r; break; }
        }
        if (again) continue;
        if (!e) return;
        if (!e.target) {
          e.target = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, e.target);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIZE, SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          e.labelTex = makeTex(e.label);
          fbo = fbo || gl.createFramebuffer();
        }
        const rows = Math.min(budget, 48, SIZE - e.row);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, e.target, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          errors.push('framebuffer'); drop(e); continue;
        }
        gl.viewport(0, 0, SIZE, SIZE);
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
        gl.enable(gl.SCISSOR_TEST); gl.scissor(0, e.row, SIZE, rows);
        gl.useProgram(pr.p);
        gl.uniform2f(pr.uRes, SIZE, SIZE);
        gl.uniform1f(pr.uSeed, e.n * 17.3);
        gl.uniform1i(pr.uLabel, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, e.labelTex);
        const locs = Object.values(A).filter((l) => l >= 0);
        locs.forEach((l) => gl.disableVertexAttribArray(l));
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disableVertexAttribArray(0);
        locs.forEach((l) => gl.enableVertexAttribArray(l));
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(prog);
        gl.enable(gl.DEPTH_TEST);
        e.row += rows; budget -= rows;
        if (e.row >= SIZE) finish(e);
      }
    }
    // fuer Tests: fertiges Bild als Canvas auslesen
    function snapshot(bg) {
      const e = Object.values(cache).find((x) => x.bg === bg && x.done && x.tex && !x.labelTex);
      if (!e) return null;
      fbo = fbo || gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, e.tex, 0);
      const px = new Uint8Array(SIZE * SIZE * 4);
      gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const cv = document.createElement('canvas');
      cv.width = SIZE; cv.height = SIZE;
      cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer), SIZE, SIZE), 0, 0);
      return cv;
    }
    return { request, pump, snapshot, errors, timings, pending: () => queue.length, cache };
  })();
  function repeatTexture(draw, w = 512, h = 512) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }
  function labelTexture(draw, w = 256, h = 256) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    return makeTex(cv);
  }
  // unterteilte Flaeche in der XY-Ebene (fuer Wellen), Normal +z
  function planeGeo(g, m, w, h, nx, ny, col) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x0 = -w / 2 + w * i / nx, x1 = -w / 2 + w * (i + 1) / nx;
        const y0 = h / 2 - h * j / ny, y1 = h / 2 - h * (j + 1) / ny;
        const u0 = i / nx, u1 = (i + 1) / nx, v0 = j / ny, v1 = (j + 1) / ny;
        g.quad(P(m, x0, y1, 0), P(m, x1, y1, 0), P(m, x1, y0, 0), P(m, x0, y0, 0), col,
          [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]);
      }
    }
  }

  /* ═══════════ Wiederverwendbare Meshes ═══════════ */
  const MESH = {};
  MESH.coin = {};
  [['yellow', '#ffd21f', '#c98a00'], ['red', '#ff2a2a', '#9a0000'], ['blue', '#3c7bff', '#0a2fb0']].forEach(([k, a, b]) => {
    MESH.coin[k] = build((g) => {
      const m = M4.from(0, 0, 0, 0, Math.PI / 2, 0);
      cyl(g, M4.mul(m, M4.from(0, -0.07, 0)), 0.55, 0.55, 0.14, 14, hex(b), hex(a));
      box(g, M4.from(0, 0, 0.075), 0.1, 0.5, 0.02, shade(hex(b), .8));
      box(g, M4.from(0, 0, -0.075), 0.1, 0.5, 0.02, shade(hex(b), .8));
    });
  });
  MESH.star = build((g) => {
    starGeo(g, I4, 1, 0.38, hex('#ffcc1a'));
    sphere(g, M4.from(-0.17, 0.08, 0.3), 0.07, 0.17, 0.05, 6, 4, C.black);
    sphere(g, M4.from(0.17, 0.08, 0.3), 0.07, 0.17, 0.05, 6, 4, C.black);
  });
  MESH.shadow = build((g) => disc(g, M4.from(0, 0, 0, 0, -Math.PI / 2, 0), 1, 16, C.black));
  MESH.cube = build((g) => box(g, I4, 1, 1, 1, C.white));
  MESH.ball = build((g) => sphere(g, I4, 1, 1, 1, 8, 6, C.white, true));
  MESH.water = build((g) => g.quad([-1, 0, 1], [1, 0, 1], [1, 0, -1], [-1, 0, -1], C.water));
  // Achteckige Wasserflaeche (Brunnenbecken), Kanten achsparallel, Innenradius 1
  MESH.waterOct = build((g) => {
    const r = 1 / Math.cos(Math.PI / 8);
    for (let i = 0; i < 8; i++) {
      const a0 = Math.PI / 8 + i * Math.PI / 4, a1 = a0 + Math.PI / 4;
      g.tri([0, 0, 0], [Math.cos(a1) * r, 0, Math.sin(a1) * r], [Math.cos(a0) * r, 0, Math.sin(a0) * r], C.water);   // Normale nach oben
    }
  });
  MESH.painting = build((g) => planeGeo(g, I4, 5.2, 4.55, 20, 18, C.white));
  // Bilderrahmen: Leisten oben/unten ueber die volle Breite, Pfosten nur dazwischen —
  // so liegen nirgends zwei Flaechen deckungsgleich uebereinander (das hat geflackert)
  MESH.frame = build((g) => {
    const fc = hex('#e8b923'), fd = hex('#8a5a00'), fl = hex('#fff0a0');
    box(g, M4.from(0, 2.475, 0), 6, 0.4, 0.5, { top: fc, side: fd });
    box(g, M4.from(0, -2.475, 0), 6, 0.4, 0.5, { top: fc, side: fd });
    box(g, M4.from(-2.8, 0, 0), 0.4, 4.55, 0.5, fc);
    box(g, M4.from(2.8, 0, 0), 0.4, 4.55, 0.5, fc);
    // helle Profilleiste an der Innenkante (steht 7 cm vor)
    box(g, M4.from(0, 2.22, 0.16), 5.3, 0.12, 0.32, fl); box(g, M4.from(0, -2.22, 0.16), 5.3, 0.12, 0.32, fl);
    box(g, M4.from(-2.56, 0, 0.16), 0.12, 4.32, 0.32, fl); box(g, M4.from(2.56, 0, 0.16), 0.12, 4.32, 0.32, fl);
    // Eckrosetten und Krone
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) sphere(g, M4.from(sx * 2.8, sy * 2.475, 0.28), 0.26, 0.26, 0.14, 10, 6, fl, true);
    sphere(g, M4.from(0, 2.85, 0.05), 0.55, 0.32, 0.2, 12, 6, fc, true, 0, Math.PI / 2);
    starGeo(g, M4.from(0, 2.95, 0.22), 0.28, 0.06, fl);
  });
  MESH.beam = build((g) => {
    // schraeger Lichtstrahl, lokal von y=0 (Boden) bis y=1 (Fenster)
    const q = (a, b, c2, d) => g.quad(a, b, c2, d, hex('#fff6c8'));
    const bot = [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1]], top = [[-.4, 1, -.4], [.4, 1, -.4], [.4, 1, .4], [-.4, 1, .4]];
    for (let i = 0; i < 4; i++) q(bot[i], bot[(i + 1) % 4], top[(i + 1) % 4], top[i]);
  });
  MESH.marker = build((g) => starGeo(g, M4.from(0, 0, 0, 0, -Math.PI / 2, 0), 1.6, 0.02, hex('#ffe680')));
  MESH.doorLeaf = build((g) => {
    box(g, M4.from(1.5, 3.5, 0), 3, 7, 0.4, { top: C.woodDark, side: C.wood });
    for (let i = 0; i < 4; i++) box(g, M4.from(0.35 + i * 0.75, 3.5, 0.22), 0.08, 6.6, 0.05, C.woodDark);
    box(g, M4.from(2.6, 3.3, 0.3), 0.18, 0.6, 0.12, C.gold);
  });
  MESH.emblem = build((g) => planeGeo(g, I4, 3, 3, 1, 1, C.white));
  MESH.plaque = build((g) => planeGeo(g, I4, 2.9, 1, 1, 1, C.white));

  /* ═══════════ Glappo, die Alien-Katze — mehrere Entwuerfe ═══════════
     Jeder Entwurf liefert Kopf, Koerper, Arm, Bein und Schwanz (Drehpunkt jeweils im
     Ursprung), optional leuchtende Teile (werden unbeleuchtet gezeichnet) und ein
     Skelett (rig) mit den Gelenkpunkten ueber dem Boden. */
  const grad = (hi, lo, sv) => (i, j) => v3.add(v3.scale(hi, 1 - j / sv), v3.scale(lo, j / sv));
  const WHITE = hex('#ffffff'), INK = hex('#0b0e14');
  function build2(fn) { const g = new Geo(), gw = new Geo(); fn(g, gw); return [upload(g), gw.pos.length ? upload(gw) : null]; }
  // Matrix auf der Vorderseite eines Ellipsoids (Mitte c, Radien r) bei (x, y); +z zeigt nach aussen
  function onSurf(c, r, x, y, out = 0, roll = 0) {
    const z = r[2] * Math.sqrt(Math.max(0, 1 - (x / r[0]) ** 2 - (y / r[1]) ** 2));
    const n = v3.norm([x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2])]);
    return M4.from(c[0] + x + n[0] * out, c[1] + y + n[1] * out, c[2] + z + n[2] * out, Math.atan2(n[0], n[2]), -Math.asin(n[1]), roll);
  }
  // Auge: dunkler Rand, Augapfel, Iris, Pupille (rund oder Schlitz), zwei Glanzpunkte
  function catEye(g, E, w, h, o) {
    if (o.rim) sphere(g, M4.mul(E, M4.from(0, 0, -0.014)), w * 1.13, h * 1.15, 0.06, 18, 10, o.rim, true);
    sphere(o.ballGeo || g, E, w, h, 0.06, 20, 12, o.ball, true);
    if (o.iris) sphere(g, M4.mul(E, M4.from(0, -h * 0.04, 0.018)), w * o.irisK, h * o.irisK, 0.052, 18, 10, o.iris, true);
    if (o.pupil) sphere(g, M4.mul(E, M4.from(0, -h * 0.04, 0.03)), w * o.pupil[0], h * o.pupil[1], 0.046, 14, 10, INK, true);
    const sg = o.shineGeo || g;
    sphere(sg, M4.mul(E, M4.from(-w * 0.3, h * 0.32, 0.058)), w * 0.22, w * 0.22, 0.01, 10, 8, WHITE, true);
    sphere(sg, M4.mul(E, M4.from(w * 0.28, -h * 0.32, 0.056)), w * 0.1, w * 0.1, 0.008, 8, 6, WHITE, true);
  }
  // Augenlid: flache Kuppel ueber dem Auge. Beim Zeichnen wird sie in der Hoehe skaliert —
  // 0 = offen (unsichtbar flach), 1 = geschlossen.
  function catLid(g, E, w, h, col) {
    sphere(g, M4.mul(E, M4.from(0, 0, 0.012)), w * 1.18, h * 1.25, 0.07, 16, 10, col, true);
  }
  // Blinzeln: alle gut vier Sekunden ein Doppel-Lidschlag, je Figur leicht versetzt
  function blinkAt(t, seed = 0) {
    const p = (((t + seed * 1.73) % 4.6) + 4.6) % 4.6;
    const ramp = (a) => (a < 0.04 ? a / 0.04 : a < 0.09 ? 1 - (a - 0.04) / 0.05 : 0);
    return clamp(Math.max(ramp(p), ramp(p - 0.14)), 0, 1);
  }
  // Spitzes Katzenohr (flacher Kegel) mit farbiger Innenseite
  function catEar(g, m, r, h, col, inner, innerGeo) {
    cyl(g, m, r, 0, h, 16, col, col);
    cyl(innerGeo || g, M4.mul(m, M4.from(0, 0.02, r * 0.7, 0, 0, 0, 1, 1, 0.55)), r * 0.68, 0, h * 0.8, 14, inner, inner);
  }
  // Schnurrhaare: drei pro Seite, leicht gefaechert
  function whiskers(g, x, y, z, len, col) {
    for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) {
      cyl(g, M4.from(s * x, y + k * 0.026, z, s * 0.3, 0, -s * (Math.PI / 2 + k * 0.2)), 0.008, 0.003, len, 5, col);
    }
  }
  // Schwanz aus Gliedern, rollt sich nach oben ein; optional Leuchtringe und Leuchtspitze
  function catTail(g, o, gw) {
    let m = I4, r = o.r0;
    for (let k = 0; k < o.n; k++) {
      const r1 = r * (o.taper || 0.9);
      cyl(g, m, r, r1, o.len, 10, k % 2 ? o.col : (o.col2 || o.col));
      sphere(g, M4.mul(m, M4.from(0, o.len, 0)), r1, r1, r1, 8, 5, o.col, true);
      if (gw && o.ring && k % 2 === 1) cyl(gw, M4.mul(m, M4.from(0, o.len * 0.35, 0)), r * 1.1, r1 * 1.1, o.len * 0.3, 10, o.ring);
      m = M4.mul(m, M4.from(0, o.len, 0, 0, typeof o.curl === 'function' ? o.curl(k) : o.curl));
      r = r1;
    }
    if (o.tip) sphere(o.tipGlow ? gw : g, M4.mul(m, M4.from(0, r * 0.4, 0)), o.tipR, o.tipR * 1.15, o.tipR, 12, 8, o.tip, true);
  }
  // Leuchtband um einen Ellipsoid-Koerper (Mitte cy, Radien rx/ry/rz) auf Hoehe y
  function glowBand(gw, cy, rx, ry, rz, y, col, hgt = 0.026) {
    const r = rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)) + 0.007;
    cyl(gw, M4.from(0, cy + y - hgt / 2, 0, 0, 0, 0, 1, 1, rz / rx), r, r, hgt, 26, col, col);
  }

  const CAT_DEFS = [];
  // 1) Knuddel: grosser runder Kopf, Kulleraugen, weisse Pfoten, Leucht-Antenne
  {
    const SK = hex('#74d45a'), HI = hex('#b4f08c'), LO = hex('#489c3a'), CREAM = hex('#ecfbdc'), PINK = hex('#ff8fbf'), DARK = hex('#2e6a28');
    const HC = [0, 0, 0], HR = [0.42, 0.37, 0.39];
    CAT_DEFS.push({
      id: 'knuddel', name: 'Knuddel',
      rig: { legX: 0.15, legY: 0.45, bodyY: 0.8, armX: 0.27, armY: 1.02, headY: 1.5, headZ: 0.03, tailY: 0.6, tailZ: -0.2 },
      head(g, gw) {
        sphere(g, M4.from(...HC), HR[0], HR[1], HR[2], 26, 16, grad(HI, SK, 16), true);
        sphere(g, M4.from(0, -0.16, 0.06), 0.36, 0.2, 0.3, 22, 10, SK, true);
        for (const s of [-1, 1]) {
          sphere(g, M4.from(s * 0.24, -0.13, 0.1), 0.16, 0.14, 0.17, 14, 8, SK, true);
          sphere(g, M4.from(s * 0.072, -0.155, 0.33), 0.085, 0.068, 0.07, 14, 8, CREAM, true);
          catEye(g, onSurf(HC, HR, s * 0.155, 0.01, -0.035), 0.1, 0.135, { rim: DARK, ball: INK, iris: hex('#1f8f8a'), irisK: 0.78, pupil: [0.44, 0.56] });
          catEar(g, M4.from(s * 0.25, 0.25, -0.03, s * 0.2, -0.1, -s * 0.5, 1, 1, 0.5), 0.17, 0.36, SK, PINK);
        }
        whiskers(g, 0.13, -0.15, 0.36, 0.2, DARK);
        sphere(g, M4.from(0, -0.22, 0.29), 0.075, 0.05, 0.06, 12, 6, CREAM, true);
        sphere(g, M4.from(0, -0.095, 0.395), 0.048, 0.032, 0.03, 12, 8, PINK, true);
        const a0 = M4.from(0, 0.33, -0.03, 0, -0.35);
        cyl(g, a0, 0.022, 0.015, 0.18, 8, LO);
        const a1 = M4.mul(a0, M4.from(0, 0.18, 0, 0, 0.6));
        cyl(g, a1, 0.015, 0.011, 0.15, 8, LO);
        sphere(gw, M4.mul(a1, M4.from(0, 0.2, 0)), 0.065, 0.065, 0.065, 14, 10, hex('#ffe45c'), true);
      },
      body(g) {
        sphere(g, M4.from(0, 0.03, 0), 0.29, 0.34, 0.25, 20, 12, grad(HI, SK, 12), true);
        sphere(g, M4.from(0, -0.15, 0), 0.27, 0.22, 0.24, 18, 10, SK, true);
        sphere(g, onSurf([0, 0.03, 0], [0.29, 0.34, 0.25], 0, -0.08, -0.012), 0.17, 0.2, 0.04, 18, 10, CREAM, true);
        cyl(g, M4.from(0, 0.22, 0), 0.15, 0.13, 0.4, 14, SK);
      },
      arm(g) {
        sphere(g, I4, 0.088, 0.088, 0.088, 12, 8, SK, true);
        cyl(g, M4.from(0, -0.27, 0), 0.062, 0.078, 0.27, 12, SK);
        sphere(g, M4.from(0, -0.32, 0.015), 0.088, 0.085, 0.092, 12, 8, CREAM, true);
      },
      leg(g) {
        sphere(g, I4, 0.125, 0.11, 0.125, 12, 8, SK, true);
        cyl(g, M4.from(0, -0.31, 0), 0.098, 0.124, 0.31, 12, SK);
        sphere(g, M4.from(0, -0.365, 0.07), 0.125, 0.085, 0.175, 14, 8, CREAM, true);
      },
      lids(g) { for (const s of [-1, 1]) catLid(g, onSurf(HC, HR, s * 0.155, 0.01, -0.035), 0.1, 0.135, SK); },
      tail(g, gw) { catTail(g, { n: 9, r0: 0.075, len: 0.12, curl: 0.23, col: SK, col2: shade(SK, 0.93), tip: CREAM, tipR: 0.075 }, gw); },
    });
  }
  // 2) Sphinx: Nacktkatze wie auf dem Referenzbild, Riesenohren, schwarze Mandelaugen, Stirnfalten
  {
    const SK = hex('#74c85f'), HI = hex('#a8e68c'), LO = hex('#447f3a'), FLESH = hex('#e8a3b0'), NOSE = hex('#c97f8e');
    const HC = [0, 0.06, -0.02], HR = [0.31, 0.29, 0.31];
    const TC = [0, 0.06, 0], TR = [0.27, 0.35, 0.21];
    CAT_DEFS.push({
      id: 'sphinx', name: 'Sphinx',
      rig: { legX: 0.14, legY: 0.64, bodyY: 1.0, armX: 0.27, armY: 1.3, headY: 1.74, headZ: 0.05, tailY: 0.78, tailZ: -0.17 },
      head(g) {
        sphere(g, M4.from(...HC), HR[0], HR[1], HR[2], 24, 16, grad(HI, SK, 16), true);
        for (const s of [-1, 1]) {
          sphere(g, M4.from(s * 0.16, -0.085, 0.1), 0.125, 0.11, 0.145, 14, 10, SK, true);
          sphere(g, M4.from(s * 0.05, -0.145, 0.285), 0.058, 0.046, 0.048, 12, 8, HI, true);
          catEye(g, onSurf(HC, HR, s * 0.135, 0.02, -0.03, s * 0.38), 0.098, 0.06, { rim: LO, ball: INK, iris: hex('#173f2d'), irisK: 0.84 });
          catEar(g, M4.from(s * 0.18, 0.26, -0.05, s * 0.3, -0.08, -s * 0.52, 1, 1, 0.36), 0.19, 0.54, SK, FLESH);
        }
        sphere(g, M4.from(0, -0.13, 0.22), 0.13, 0.095, 0.13, 14, 8, SK, true);
        sphere(g, M4.from(0, -0.205, 0.215), 0.07, 0.048, 0.062, 10, 6, SK, true);
        sphere(g, M4.from(0, 0.0, 0.27, 0, -0.45), 0.052, 0.125, 0.056, 12, 8, HI, true);
        sphere(g, M4.from(0, -0.083, 0.342), 0.038, 0.026, 0.026, 10, 6, NOSE, true);
        for (let k = 0; k < 3; k++) sphere(g, onSurf(HC, HR, 0, 0.11 + k * 0.045, -0.004), 0.105 - k * 0.018, 0.011, 0.018, 12, 4, LO, true);
      },
      body(g) {
        sphere(g, M4.from(...TC), TR[0], TR[1], TR[2], 20, 12, grad(HI, SK, 12), true);
        sphere(g, M4.from(0, -0.2, 0), 0.24, 0.17, 0.2, 16, 8, SK, true);
        sphere(g, onSurf(TC, TR, 0, -0.1, -0.012), 0.15, 0.17, 0.04, 16, 8, HI, true);
        cyl(g, M4.from(0, 0.3, 0.02, 0, 0.12), 0.115, 0.095, 0.44, 14, SK);
      },
      arm(g) {
        sphere(g, I4, 0.082, 0.082, 0.082, 10, 8, SK, true);
        cyl(g, M4.from(0, -0.27, 0), 0.056, 0.072, 0.27, 10, SK);
        sphere(g, M4.from(0, -0.27, 0), 0.058, 0.058, 0.058, 8, 6, SK, true);
        cyl(g, M4.from(0, -0.5, 0), 0.046, 0.056, 0.23, 10, SK);
        sphere(g, M4.from(0, -0.55, 0.015), 0.062, 0.072, 0.062, 10, 8, HI, true);
      },
      leg(g) {
        sphere(g, I4, 0.11, 0.1, 0.11, 10, 8, SK, true);
        cyl(g, M4.from(0, -0.31, 0), 0.084, 0.11, 0.31, 10, SK);
        sphere(g, M4.from(0, -0.31, 0), 0.084, 0.084, 0.084, 8, 6, SK, true);
        cyl(g, M4.from(0, -0.56, 0), 0.062, 0.082, 0.25, 10, SK);
        sphere(g, M4.from(0, -0.595, 0.07), 0.08, 0.05, 0.155, 12, 8, HI, true);
      },
      lids(g) { for (const s of [-1, 1]) catLid(g, onSurf(HC, HR, s * 0.135, 0.02, -0.03, s * 0.38), 0.098, 0.06, SK); },
      tail(g, gw) { catTail(g, { n: 12, r0: 0.05, len: 0.1, taper: 0.93, curl: (k) => (k < 6 ? 0.1 : 0.22), col: SK, col2: shade(SK, 0.94) }, gw); },
    });
  }
  // 3) Astro-Katze: lila Raumanzug mit Stern, Jetpack, gelbe Katzenaugen mit Schlitzpupille
  {
    const SK = hex('#82da66'), HI = hex('#c0f39e'), PINK = hex('#ff93c0');
    const SUIT = hex('#7550d8'), SUIT_L = hex('#a084f4'), SUIT_D = hex('#4f33a0'), GLOVE = hex('#f4f4fa'), GOLD = hex('#ffc93a'), METAL = hex('#c7cfdf'), RED = hex('#e8483e');
    const HC = [0, 0, 0], HR = [0.37, 0.33, 0.35];
    CAT_DEFS.push({
      id: 'astro', name: 'Astro-Katze',
      rig: { legX: 0.15, legY: 0.5, bodyY: 0.88, armX: 0.29, armY: 1.1, headY: 1.58, headZ: 0.03, tailY: 0.62, tailZ: -0.24 },
      head(g) {
        sphere(g, M4.from(...HC), HR[0], HR[1], HR[2], 26, 16, grad(HI, SK, 16), true);
        sphere(g, M4.from(0, -0.15, 0.05), 0.32, 0.18, 0.27, 20, 10, SK, true);
        for (const s of [-1, 1]) {
          sphere(g, M4.from(s * 0.21, -0.12, 0.08), 0.14, 0.13, 0.15, 12, 8, SK, true);
          sphere(g, M4.from(s * 0.064, -0.14, 0.3), 0.075, 0.06, 0.062, 12, 8, HI, true);
          catEye(g, onSurf(HC, HR, s * 0.14, 0.02, -0.032, s * 0.12), 0.09, 0.11, { rim: hex('#2f6a26'), ball: hex('#d6f05a'), iris: hex('#f5bf2e'), irisK: 0.84, pupil: [0.2, 0.84] });
          catEar(g, M4.from(s * 0.22, 0.22, -0.03, s * 0.2, -0.1, -s * 0.48, 1, 1, 0.48), 0.15, 0.32, SK, PINK);
        }
        whiskers(g, 0.12, -0.14, 0.33, 0.19, GLOVE);
        sphere(g, M4.from(0, -0.2, 0.27), 0.065, 0.045, 0.055, 10, 6, HI, true);
        sphere(g, M4.from(0, -0.085, 0.35), 0.042, 0.028, 0.028, 10, 6, PINK, true);
      },
      body(g) {
        sphere(g, M4.from(0, 0.03, 0), 0.3, 0.34, 0.26, 20, 12, grad(SUIT_L, SUIT, 12), true);
        sphere(g, M4.from(0, -0.15, 0), 0.28, 0.21, 0.25, 18, 10, SUIT, true);
        cyl(g, M4.from(0, -0.165, 0, 0, 0, 0, 1, 1, 0.9), 0.292, 0.292, 0.075, 24, GOLD, GOLD);
        starGeo(g, M4.from(0, -0.128, 0.268), 0.07, 0.02, GOLD);
        box(g, M4.from(0, 0.1, 0.255), 0.016, 0.3, 0.012, SUIT_D);
        const badge = M4.from(0.13, 0.14, 0.215, 0.5);
        disc(g, badge, 0.068, 18, GLOVE);
        starGeo(g, M4.mul(badge, M4.from(0, 0, 0.008)), 0.05, 0.006, RED);
        cyl(g, M4.from(0, 0.27, 0), 0.2, 0.18, 0.09, 22, METAL, METAL);
        cyl(g, M4.from(0, 0.3, 0), 0.14, 0.13, 0.3, 14, SK);
        box(g, M4.from(0, 0.06, -0.27), 0.36, 0.4, 0.14, { top: METAL, side: shade(METAL, 0.85) });
        for (const s of [-1, 1]) {
          cyl(g, M4.from(s * 0.1, -0.12, -0.36), 0.075, 0.075, 0.38, 14, RED, METAL);
          sphere(g, M4.from(s * 0.1, 0.26, -0.36), 0.075, 0.05, 0.075, 12, 6, RED, true);
          cyl(g, M4.from(s * 0.1, -0.2, -0.36), 0.05, 0.07, 0.08, 10, hex('#555c6a'));
        }
      },
      arm(g) {
        sphere(g, I4, 0.095, 0.095, 0.095, 12, 8, SUIT, true);
        cyl(g, M4.from(0, -0.25, 0), 0.068, 0.085, 0.25, 12, SUIT);
        cyl(g, M4.from(0, -0.3, 0), 0.082, 0.078, 0.07, 12, GLOVE, GLOVE);
        sphere(g, M4.from(0, -0.35, 0.015), 0.09, 0.088, 0.095, 12, 8, GLOVE, true);
      },
      leg(g) {
        sphere(g, I4, 0.11, 0.1, 0.11, 12, 8, SUIT, true);
        cyl(g, M4.from(0, -0.28, 0), 0.09, 0.11, 0.28, 12, SUIT);
        cyl(g, M4.from(0, -0.42, 0), 0.1, 0.098, 0.16, 12, GLOVE, GLOVE);
        sphere(g, M4.from(0, -0.42, 0.07), 0.115, 0.075, 0.17, 14, 8, GLOVE, true);
        box(g, M4.from(0, -0.485, 0.06), 0.2, 0.03, 0.32, hex('#5b5f6e'));
      },
      lids(g) { for (const s of [-1, 1]) catLid(g, onSurf(HC, HR, s * 0.14, 0.02, -0.032, s * 0.12), 0.09, 0.11, SK); },
      tail(g, gw) { catTail(g, { n: 8, r0: 0.065, len: 0.12, curl: 0.24, col: SK, col2: shade(SK, 0.93), tip: HI, tipR: 0.065 }, gw); },
    });
  }
  // 4) Neon: dunkelgruen mit leuchtenden Streifen, gluehenden Tuerkis-Augen und Leuchtringen
  {
    const SK = hex('#2f8a60'), HI = hex('#58ba88'), NEON = hex('#8dff5a'), CYAN = hex('#63f7ff'), DARK = hex('#0f2a1f');
    const HC = [0, 0.03, 0], HR = [0.34, 0.31, 0.32];
    const TC = [0, 0.04, 0], TR = [0.27, 0.34, 0.22];
    CAT_DEFS.push({
      id: 'neon', name: 'Neon',
      rig: { legX: 0.15, legY: 0.56, bodyY: 0.95, armX: 0.27, armY: 1.22, headY: 1.68, headZ: 0.04, tailY: 0.7, tailZ: -0.2 },
      head(g, gw) {
        sphere(g, M4.from(...HC), HR[0], HR[1], HR[2], 24, 16, grad(HI, SK, 16), true);
        sphere(g, M4.from(0, -0.13, 0.06), 0.29, 0.18, 0.26, 20, 10, SK, true);
        for (const s of [-1, 1]) {
          const CC = [s * 0.19, -0.1, 0.09], CR = [0.13, 0.12, 0.14];
          sphere(g, M4.from(...CC), CR[0], CR[1], CR[2], 12, 8, SK, true);
          sphere(g, M4.from(s * 0.058, -0.13, 0.28), 0.068, 0.055, 0.058, 12, 8, HI, true);
          catEye(g, onSurf(HC, HR, s * 0.13, 0.0, -0.03, s * 0.3), 0.095, 0.07, { rim: DARK, ball: CYAN, ballGeo: gw, shineGeo: gw });
          for (let k = 0; k < 2; k++) sphere(gw, onSurf(CC, CR, s * 0.07, 0.02 - k * 0.05, -0.004, -s * 0.2), 0.05, 0.011, 0.014, 10, 4, NEON, true);
          catEar(g, M4.from(s * 0.2, 0.24, -0.03, s * 0.25, -0.1, -s * 0.5, 1, 1, 0.42), 0.16, 0.44, SK, NEON, gw);
        }
        for (let k = -1; k <= 1; k++) sphere(gw, onSurf(HC, HR, k * 0.065, 0.19 - Math.abs(k) * 0.03, -0.004), 0.016, 0.06, 0.02, 8, 6, NEON, true);
        sphere(g, M4.from(0, -0.2, 0.25), 0.065, 0.045, 0.055, 10, 6, SK, true);
        sphere(g, M4.from(0, -0.085, 0.335), 0.04, 0.027, 0.027, 10, 6, DARK, true);
      },
      body(g, gw) {
        sphere(g, M4.from(...TC), TR[0], TR[1], TR[2], 20, 12, grad(HI, SK, 12), true);
        sphere(g, M4.from(0, -0.17, 0), 0.25, 0.2, 0.21, 18, 10, SK, true);
        cyl(g, M4.from(0, 0.26, 0), 0.13, 0.115, 0.36, 14, SK);
        glowBand(gw, TC[1], TR[0], TR[1], TR[2], 0.2, NEON);
        glowBand(gw, TC[1], TR[0], TR[1], TR[2], -0.1, NEON);
        disc(g, M4.from(0, 0.06, 0.218), 0.085, 22, DARK);
        disc(gw, M4.from(0, 0.06, 0.223), 0.058, 22, CYAN);
      },
      arm(g, gw) {
        sphere(g, I4, 0.085, 0.085, 0.085, 12, 8, SK, true);
        cyl(g, M4.from(0, -0.3, 0), 0.058, 0.074, 0.3, 12, SK);
        cyl(gw, M4.from(0, -0.29, 0), 0.064, 0.064, 0.03, 12, NEON, NEON);
        sphere(g, M4.from(0, -0.35, 0.015), 0.078, 0.078, 0.08, 12, 8, DARK, true);
      },
      leg(g, gw) {
        sphere(g, I4, 0.105, 0.1, 0.105, 12, 8, SK, true);
        cyl(g, M4.from(0, -0.44, 0), 0.08, 0.105, 0.44, 12, SK);
        cyl(gw, M4.from(0, -0.43, 0), 0.086, 0.086, 0.03, 12, NEON, NEON);
        sphere(g, M4.from(0, -0.5, 0.07), 0.1, 0.065, 0.16, 14, 8, DARK, true);
      },
      lids(g) { for (const s of [-1, 1]) catLid(g, onSurf(HC, HR, s * 0.13, 0.0, -0.03, s * 0.3), 0.095, 0.07, SK); },
      tail(g, gw) { catTail(g, { n: 10, r0: 0.06, len: 0.11, curl: 0.22, col: SK, ring: NEON, tip: CYAN, tipR: 0.06, tipGlow: true }, gw); },
    });
  }
  // Figuren im 64er-Look: grob unterteilt (lowPoly)
  const CATS = lowPoly(() => CAT_DEFS.map((d) => {
    const c = { id: d.id, name: d.name, rig: d.rig, glow: {} };
    for (const k of ['head', 'body', 'arm', 'leg', 'tail', 'lids']) if (d[k]) [c[k], c.glow[k]] = build2(d[k]);
    return c;
  }));
  const buildLP = (fn) => lowPoly(() => build(fn));
  // "Z" fuer die Schlafblasen (zeigt nach +z)
  MESH.zee = build((g) => {
    box(g, M4.from(0, 0.26, 0), 0.52, 0.12, 0.06, C.white);
    box(g, M4.from(0, -0.26, 0), 0.52, 0.12, 0.06, C.white);
    box(g, M4.from(0, 0, 0, 0, 0, -0.78), 0.12, 0.66, 0.06, C.white);
  });
  // Standard ist die Astro-Katze; gewaehlt wird im Pausenmenue (ESC), gemerkt im Browser
  let catIdx = Math.max(0, CATS.findIndex((c) => c.id === 'astro'));
  try {
    const want = localStorage.getItem('glappa64-cat');
    const i = CATS.findIndex((c) => c.id === want);
    if (i >= 0) catIdx = i;
  } catch (e) { /* ohne Speicher: Standard */ }
  let CAT = CATS[catIdx];
  function setCat(i) {
    catIdx = ((i % CATS.length) + CATS.length) % CATS.length; CAT = CATS[catIdx];
    try { localStorage.setItem('glappa64-cat', CAT.id); } catch (e) { /* egal */ }
    return CAT.name;
  }
  // Grummel: griesgraemiger Laufstein mit einem Auge
  MESH.grummel = buildLP((g) => {
    sphere(g, M4.from(0, 0.75, 0), 0.8, 0.68, 0.75, 9, 6, (i, j) => shade(hex('#7d8aa8'), 0.86 + ((i * 7 + j * 3) % 4) * 0.05));
    sphere(g, M4.from(0, 0.9, 0.62), 0.26, 0.3, 0.14, 8, 6, C.white, true);
    sphere(g, M4.from(0, 0.86, 0.73), 0.11, 0.15, 0.06, 6, 5, C.black, true);
    box(g, M4.from(0, 1.25, 0.62, 0, 0.3), 0.7, 0.14, 0.12, hex('#3a3f55'));
    box(g, M4.from(0, 0.46, 0.7, 0, 0, 0), 0.34, 0.06, 0.04, hex('#2a2f40'));
  });
  MESH.foot = buildLP((g) => box(g, M4.from(0, 0.12, 0.08), 0.34, 0.24, 0.5, hex('#3a3f55')));
  // Knallkiste: rote Kiste mit Zuendschnur und Glubschaugen
  MESH.bomb = buildLP((g) => {
    box(g, M4.from(0, 0.75, 0), 1.3, 1.3, 1.3, { top: hex('#d8342b'), side: hex('#c22a22'), bottom: hex('#8a1a14') });
    box(g, M4.from(0, 0.45, 0), 1.34, 0.16, 1.34, hex('#2a2a2a'));
    box(g, M4.from(0, 1.05, 0), 1.34, 0.16, 1.34, hex('#2a2a2a'));
    sphere(g, M4.from(-0.28, 0.8, 0.66), 0.2, 0.26, 0.08, 8, 6, C.white, true);
    sphere(g, M4.from(0.28, 0.8, 0.66), 0.2, 0.26, 0.08, 8, 6, C.white, true);
    sphere(g, M4.from(-0.26, 0.76, 0.73), 0.08, 0.12, 0.04, 6, 5, C.black, true);
    sphere(g, M4.from(0.26, 0.76, 0.73), 0.08, 0.12, 0.04, 6, 5, C.black, true);
    cyl(g, M4.from(0, 1.4, 0), 0.16, 0.16, 0.14, 8, hex('#9a9a9a'));
    cyl(g, M4.from(0, 1.54, 0, 0, 0.3), 0.04, 0.04, 0.4, 5, hex('#caa46a'));
  });
  MESH.spark = buildLP((g) => sphere(g, I4, 0.14, 0.14, 0.14, 6, 4, hex('#ffcf3a')));
  // Toasti: Toaster auf Beinchen, Scheibe Toast huepft raus
  MESH.toaster = buildLP((g) => {
    box(g, M4.from(0, 0.95, 0), 1.2, 0.9, 0.8, { top: hex('#e4e8ef'), side: hex('#c4cad6') });
    box(g, M4.from(-0.25, 1.41, 0), 0.14, 0.03, 0.56, C.black);
    box(g, M4.from(0.25, 1.41, 0), 0.14, 0.03, 0.56, C.black);
    sphere(g, M4.from(-0.26, 1.02, 0.41), 0.16, 0.2, 0.05, 8, 6, C.white, true);
    sphere(g, M4.from(0.26, 1.02, 0.41), 0.16, 0.2, 0.05, 8, 6, C.white, true);
    sphere(g, M4.from(-0.26, 1.0, 0.45), 0.07, 0.1, 0.03, 6, 4, C.black, true);
    sphere(g, M4.from(0.26, 1.0, 0.45), 0.07, 0.1, 0.03, 6, 4, C.black, true);
    box(g, M4.from(0.64, 0.95, 0), 0.08, 0.14, 0.26, hex('#2a2a2a'));
    cyl(g, M4.from(-0.3, 0, 0), 0.05, 0.05, 0.5, 5, C.black);
    cyl(g, M4.from(0.3, 0, 0), 0.05, 0.05, 0.5, 5, C.black);
  });
  MESH.toast = build((g) => box(g, I4, 0.1, 0.5, 0.46, { top: hex('#c88a3a'), side: hex('#e8b86a') }));
  // Rollkugel: eckige Eisenkugel, das Karomuster zeigt das Rollen
  MESH.roller = build((g) => sphere(g, I4, 1, 1, 1, 10, 8, (i, j) => ((i + j) % 2 ? hex('#4a4c58') : hex('#6a6c7a')), false));
  // Geist: Bettlaken-Gespenst mit Wellensaum, Knopfaugen und kleinen Aermchen
  MESH.ghost = buildLP((g) => {
    const W = hex('#f6f2ff'), S = hex('#dcd4f4'), K = hex('#1a1426');
    sphere(g, M4.from(0, 1.0, 0), 0.75, 0.8, 0.72, 14, 10, W, true, 0, Math.PI * 0.62);
    cyl(g, M4.from(0, 0.12, 0), 0.86, 0.71, 0.6, 14, S, W);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; sphere(g, M4.from(Math.cos(a) * 0.78, 0.14, Math.sin(a) * 0.78), 0.2, 0.16, 0.2, 8, 5, S, true); }
    for (const s of [-1, 1]) {
      sphere(g, M4.from(s * 0.25, 1.1, 0.62), 0.1, 0.17, 0.07, 8, 6, K, true);
      sphere(g, M4.from(s * 0.22, 1.16, 0.67), 0.035, 0.05, 0.02, 6, 4, C.white, true);
      sphere(g, M4.from(s * 0.8, 0.78, 0.15), 0.2, 0.16, 0.2, 8, 5, W, true);
    }
    sphere(g, M4.from(0, 0.8, 0.64), 0.17, 0.12, 0.07, 10, 6, hex('#3a2a4a'), true);
  });

  /* ═══════════ Computer-Gegner (eigene Entwuerfe): Virus, Wurm, Pop-up, Spam-Mail, Bug ═══════════ */
  // Richtung d als lokale y-Achse (fuer Stacheln rund um eine Kugel)
  const alongY = (o, d) => { const x = v3.norm(v3.cross(d, Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])); return M4.basis(o, x, d, v3.cross(x, d)); };
  // Virus: Kugel mit Noppen-Stacheln, boese Augen, Zackenmund
  const virusMesh = (body, knob) => buildLP((g) => {
    const B = hex(body), K = hex(knob);
    sphere(g, I4, 0.62, 0.62, 0.62, 14, 10, (i, j) => shade(B, 0.9 + ((i + j) % 3) * 0.06), true);
    for (let i = 0; i < 16; i++) {
      const y = 1 - (i + 0.5) / 16 * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996, d = [Math.cos(a) * r, y, Math.sin(a) * r];
      if (d[2] > 0.55 && Math.abs(d[1]) < 0.5) continue;   // Gesicht frei lassen
      cyl(g, alongY(v3.scale(d, 0.55), d), 0.05, 0.04, 0.34, 6, shade(B, 0.8));
      sphere(g, alongY(v3.scale(d, 0.92), d), 0.12, 0.12, 0.12, 8, 6, K, true);
    }
    for (const s of [-1, 1]) {
      sphere(g, M4.from(s * 0.2, 0.12, 0.52), 0.15, 0.13, 0.08, 10, 6, C.white, true);
      sphere(g, M4.from(s * 0.17, 0.1, 0.59), 0.07, 0.07, 0.04, 8, 5, C.black, true);
      box(g, M4.from(s * 0.2, 0.3, 0.55, 0, 0.2, s * 0.45), 0.26, 0.06, 0.06, shade(B, 0.4));
    }
    box(g, M4.from(0, -0.2, 0.56), 0.34, 0.12, 0.05, hex('#2a0a14'));
    for (let k = 0; k < 4; k++) g.tri([-0.15 + k * 0.1, -0.14, 0.59], [-0.1 + k * 0.1, -0.14, 0.59], [-0.125 + k * 0.1, -0.21, 0.59], C.white);
  });
  const VIRUS_BIG = virusMesh('#5ad84a', '#d8ff5a'), VIRUS_MINI = virusMesh('#ff4fb8', '#ffd0f0');
  // Computerwurm: Pixel-Schlange aus Wuerfeln
  MESH.wormSeg = buildLP((g) => {
    box(g, I4, 0.78, 0.78, 0.78, { top: hex('#6aff5a'), side: hex('#3fc83a'), bottom: hex('#2a8a2a') });
    box(g, M4.from(0, 0.4, 0), 0.4, 0.03, 0.4, hex('#b8ff9a'));
  });
  MESH.wormHead = buildLP((g) => {
    box(g, I4, 0.95, 0.9, 0.95, { top: hex('#6aff5a'), side: hex('#3fc83a'), bottom: hex('#2a8a2a') });
    for (const s of [-1, 1]) { box(g, M4.from(s * 0.22, 0.15, 0.48), 0.24, 0.24, 0.04, C.white); box(g, M4.from(s * 0.2, 0.13, 0.5), 0.12, 0.12, 0.04, C.black); }
    box(g, M4.from(0, -0.2, 0.62), 0.1, 0.05, 0.3, hex('#e8302a'));
    for (const s of [-1, 1]) box(g, M4.from(s * 0.06, -0.2, 0.8), 0.06, 0.05, 0.1, hex('#e8302a'));
  });
  // Pop-up-Fenster: grauer Rahmen, vorne eine Fehlermeldung im 95er-Stil
  MESH.popWin = buildLP((g) => box(g, I4, 2.2, 1.6, 0.14, { top: hex('#dcdcdc'), side: hex('#c0c0c0') }));
  MESH.popFront = build((g) => planeGeo(g, I4, 2.1, 1.5, 1, 1, C.white));
  let popupTex = null;
  const POPUPS = [
    { title: 'Fehler', icon: 'x', lines: ['Glappo.exe reagiert', 'nicht mehr.'], btn: 'OK' },
    { title: 'GEWONNEN!!!', icon: '!', lines: ['Sie sind der 1.000.000.', 'Besucher! Hier klicken!'], btn: 'Klick!' },
    { title: 'Werbung', icon: 'i', lines: ['Werbung überspringen', 'in 5 … 4 … 3 …'], btn: '>>' },
    { title: 'Warnung', icon: '!', lines: ['Speicher voll.', 'Bitte Katze löschen?'], btn: 'Nein' },
  ];
  function popupTexture(i) {
    popupTex = popupTex || POPUPS.map((P) => signTexture((c, w, h) => {
      c.fillStyle = '#c0c0c0'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.fillRect(0, 0, w, 4); c.fillRect(0, 0, 4, h);
      c.fillStyle = '#404040'; c.fillRect(w - 4, 0, 4, h); c.fillRect(0, h - 4, w, 4);
      const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#000080'); gr.addColorStop(1, '#1084d0');
      c.fillStyle = gr; c.fillRect(8, 8, w - 16, 44);
      c.fillStyle = '#fff'; c.font = '700 30px Tahoma, Arial, sans-serif'; c.textBaseline = 'middle'; c.fillText(P.title, 18, 31);
      c.fillStyle = '#c0c0c0'; c.fillRect(w - 50, 14, 34, 30); c.fillStyle = '#000'; c.font = '700 26px Arial'; c.fillText('×', w - 42, 30);
      // Symbol
      const ix = 60, iy = 118;
      if (P.icon === 'x') { c.fillStyle = '#e02020'; c.beginPath(); c.arc(ix, iy, 30, 0, TAU); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 7; c.beginPath(); c.moveTo(ix - 13, iy - 13); c.lineTo(ix + 13, iy + 13); c.moveTo(ix + 13, iy - 13); c.lineTo(ix - 13, iy + 13); c.stroke(); }
      else if (P.icon === '!') { c.fillStyle = '#ffd21f'; c.beginPath(); c.moveTo(ix, iy - 32); c.lineTo(ix + 34, iy + 28); c.lineTo(ix - 34, iy + 28); c.closePath(); c.fill(); c.fillStyle = '#000'; c.font = '900 40px Arial'; c.textAlign = 'center'; c.fillText('!', ix, iy + 8); c.textAlign = 'left'; }
      else { c.fillStyle = '#2050e0'; c.beginPath(); c.arc(ix, iy, 30, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.font = '900 40px Georgia'; c.textAlign = 'center'; c.fillText('i', ix, iy + 2); c.textAlign = 'left'; }
      c.fillStyle = '#000'; c.font = '26px Tahoma, Arial, sans-serif';
      P.lines.forEach((l, k) => c.fillText(l, 110, 104 + k * 34));
      // Knopf
      const bw = 130, bx = w / 2 - bw / 2, by = h - 70;
      c.fillStyle = '#c0c0c0'; c.fillRect(bx, by, bw, 44);
      c.fillStyle = '#fff'; c.fillRect(bx, by, bw, 3); c.fillRect(bx, by, 3, 44);
      c.fillStyle = '#404040'; c.fillRect(bx + bw - 3, by, 3, 44); c.fillRect(bx, by + 41, bw, 3);
      c.fillStyle = '#000'; c.font = '700 26px Tahoma, Arial, sans-serif'; c.textAlign = 'center'; c.fillText(P.btn, w / 2, by + 23); c.textAlign = 'left';
    }, 512, 366, 512, 512));
    return popupTex[i % popupTex.length];
  }
  // Spam-Mail: Briefumschlag, der mit der Lasche flattert
  MESH.mail = buildLP((g) => {
    box(g, I4, 1.2, 0.1, 0.8, { top: hex('#fff8e8'), side: hex('#e8dcc0') });
    g.tri([-0.6, 0.052, 0.4], [0.6, 0.052, 0.4], [0, 0.052, -0.02], hex('#e8dcc0'));
    box(g, M4.from(0.38, 0.06, -0.22), 0.26, 0.02, 0.2, hex('#e8302a'));
    sphere(g, M4.from(0, 0.07, 0.02), 0.1, 0.03, 0.1, 8, 4, hex('#c81a1a'), true);
    for (const s of [-1, 1]) { sphere(g, M4.from(s * 0.18, 0.1, 0.3), 0.07, 0.06, 0.05, 8, 5, C.white, true); sphere(g, M4.from(s * 0.17, 0.13, 0.33), 0.035, 0.03, 0.02, 6, 4, C.black, true); }
  });
  MESH.mailFlap = buildLP((g) => { g.tri([-0.6, 0, 0], [0.6, 0, 0], [0, 0, -0.5], hex('#f4ecd8')); g.tri([0.6, 0, 0], [-0.6, 0, 0], [0, 0, -0.5], hex('#f4ecd8')); });
  // Software-Bug: Kaefer mit Platinenmuster und Fuehlern
  MESH.bug = buildLP((g) => {
    const SH = hex('#1f5a4a'), GOLD = hex('#e8c040');
    sphere(g, M4.from(0, 0.55, -0.1), 0.72, 0.45, 0.92, 12, 8, SH, true, 0, Math.PI * 0.6);
    box(g, M4.from(0, 0.99, -0.1), 0.04, 0.02, 1.5, hex('#0a2a20'));
    for (const [x, z, l, rot] of [[-0.3, -0.2, 0.5, 0], [0.3, -0.4, 0.4, 0], [-0.25, 0.25, 0.3, Math.PI / 2], [0.35, 0.15, 0.25, Math.PI / 2], [0.2, -0.65, 0.3, Math.PI / 2]]) {
      box(g, M4.from(x, 0.97, z, rot), 0.035, 0.02, l, GOLD);
      sphere(g, M4.from(x + (rot ? l / 2 : 0), 0.98, z + (rot ? 0 : l / 2)), 0.05, 0.03, 0.05, 6, 4, hex('#7aff5a'), true);
    }
    sphere(g, M4.from(0, 0.55, 0.75), 0.36, 0.32, 0.3, 10, 8, hex('#2a3a44'), true);
    for (const s of [-1, 1]) {
      sphere(g, M4.from(s * 0.15, 0.66, 0.98), 0.12, 0.13, 0.07, 8, 6, C.white, true);
      sphere(g, M4.from(s * 0.13, 0.64, 1.04), 0.06, 0.07, 0.03, 6, 4, C.black, true);
      cyl(g, M4.from(s * 0.12, 0.8, 0.85, 0, 0.5, -s * 0.4), 0.025, 0.02, 0.55, 5, hex('#2a3a44'));
      sphere(g, M4.from(s * 0.34, 1.26, 1.1), 0.07, 0.07, 0.07, 6, 5, hex('#7aff5a'), true);
    }
  });
  MESH.bugLeg = buildLP((g) => box(g, M4.from(0, 0, 0.3), 0.08, 0.08, 0.6, hex('#10302a')));

  /* ═══════════ Gegner in Farbvarianten (werden bei Bedarf gebaut) ═══════════ */
  const VARIANTS = {
    // Stachi: Kugel mit Stacheln oben, grimmige Augen
    spiky(c) {
      return build((g) => {
        sphere(g, M4.from(0, 0.78, 0), 0.78, 0.72, 0.78, 12, 8, (i, j) => shade(c, 0.9 + ((i + j) % 2) * 0.1), true);
        for (let k = 0; k < 16; k++) {
          const th = 0.35 + (k % 3) * 0.42, ph = k * 2.4;
          const d = [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)];
          if (d[2] > 0.55 && d[1] < 0.75) continue;                               // Gesicht frei lassen
          cyl(g, M4.from(d[0] * 0.74, 0.78 + d[1] * 0.68, d[2] * 0.74, ph, th), 0.17, 0, 0.5, 5, hex('#f4ecd8'));
        }
        for (const s of [-1, 1]) {
          sphere(g, M4.from(s * 0.26, 0.9, 0.66), 0.17, 0.2, 0.08, 8, 6, C.white, true);
          sphere(g, M4.from(s * 0.24, 0.87, 0.73), 0.08, 0.11, 0.04, 6, 4, C.black, true);
          box(g, M4.from(s * 0.26, 1.13, 0.7, 0, 0, s * 0.45), 0.34, 0.08, 0.06, shade(c, 0.45));
        }
        box(g, M4.from(0, 0.55, 0.74), 0.36, 0.06, 0.04, shade(c, 0.4));
      });
    },
    // Flatterling: runder Koerper, Ohren, gelbe Augen, kleine Zaehne
    bat(c) {
      return build((g) => {
        sphere(g, I4, 0.38, 0.34, 0.36, 10, 7, c, true);
        for (const s of [-1, 1]) {
          cyl(g, M4.from(s * 0.18, 0.22, 0, 0, 0, -s * 0.35), 0.1, 0, 0.3, 4, shade(c, 0.8));
          sphere(g, M4.from(s * 0.14, 0.06, 0.3), 0.08, 0.09, 0.05, 6, 4, hex('#ffe040'), true);
          sphere(g, M4.from(s * 0.13, 0.05, 0.34), 0.03, 0.05, 0.02, 5, 4, C.black, true);
          cyl(g, M4.from(s * 0.06, -0.12, 0.31, 0, Math.PI), 0.03, 0, 0.09, 4, C.white);
        }
      });
    },
    wing(c) {
      return build((g) => {
        const m = shade(c, 0.7), a = [0, 0, 0.16], b = [0, 0, -0.16], tip = [1.2, 0.25, -0.05];
        g.tri(a, tip, [0.85, -0.18, 0], m); g.tri(a, [0.85, -0.18, 0], [0.45, -0.1, 0], m);
        g.tri(a, [0.45, -0.1, 0], b, m); g.tri(b, [0.45, -0.1, 0], [0.85, -0.18, 0], shade(m, 0.9));
        g.tri(b, [0.85, -0.18, 0], tip, shade(m, 0.9));
        box(g, M4.from(0.6, 0.12, 0, 0, 0, 0.12), 1.2, 0.05, 0.05, shade(c, 0.5));
      });
    },
    // Hopsi: glaenzender Wackelpudding mit Kulleraugen
    hopper(c) {
      return build((g) => {
        sphere(g, M4.from(0, 0.62, 0), 0.72, 0.62, 0.72, 14, 8, (i, j) => (j < 2 ? shade(c, 1.2) : c), true);
        cyl(g, M4.from(0, 0.02, 0), 0.74, 0.72, 0.2, 14, shade(c, 0.85));
        for (const s of [-1, 1]) {
          sphere(g, M4.from(s * 0.25, 0.82, 0.55), 0.17, 0.2, 0.1, 8, 6, C.white, true);
          sphere(g, M4.from(s * 0.23, 0.82, 0.63), 0.08, 0.1, 0.05, 6, 4, C.black, true);
          sphere(g, M4.from(s * 0.42, 0.52, 0.5), 0.1, 0.06, 0.04, 6, 4, hex('#ff8ab0'), true);
        }
        box(g, M4.from(0, 0.55, 0.69), 0.22, 0.05, 0.04, shade(c, 0.35));
      });
    },
  };
  const variantCache = {};
  function variantMesh(kind, col) {
    const k = kind + col;
    return variantCache[k] || (variantCache[k] = lowPoly(() => VARIANTS[kind](hex(col))));
  }

  /* ═══════════ Schloss-Tueren: Steinrahmen, Rundbogen, Doppelfluegel, Beschlaege ═══════════
     Lokal steht die Tuer bei x = 0 auf y = 0 in der Ebene z = 0, die Vorderseite zeigt nach +z.
     arch: Rundbogen oben (sonst gerader Sturz), plaque: Textur fuers Schild darueber. */
  function castleDoor(L, x, y, z, ry, o = {}) {
    const g = L.geo, gw = L.glowGeo, M = M4.from(x, y, z, ry), T = (m) => M4.mul(M, m);
    const w = o.w || 3.6, h = o.h || 4.4, arch = o.arch !== false, half = w / 2;
    const WOOD = o.wood || hex('#6a3a14'), DK = shade(WOOD, 0.6), IRON = hex('#2a2a32'), BRASS = hex('#d8aa4a');
    const ST = o.stone || { top: hex('#d8d0c0'), side: hex('#b8ae9c') }, KEY = { top: shade(ST.top, 1.05), side: shade(ST.side, 1.08) };
    for (const s of [-1, 1]) {
      const cx = s * half / 2;
      box(g, T(M4.from(cx, h / 2, 0.12)), half - 0.03, h, 0.24, WOOD);
      for (let k = 1; k < 3; k++) box(g, T(M4.from(s * half * k / 3, h / 2, 0.26)), 0.06, h - 0.2, 0.06, DK);
      for (const yy of [0.2, 0.78]) {
        box(g, T(M4.from(cx, h * yy, 0.27)), half - 0.25, 0.18, 0.06, IRON);
        for (let k = 0; k < 4; k++) sphere(g, T(M4.from(cx + (k - 1.5) * (half - 0.5) / 3, h * yy, 0.31)), 0.05, 0.05, 0.04, 5, 3, hex('#6a6a74'), true);
      }
      const hx = s * Math.min(0.4, half * 0.25), hy = h * 0.48;
      sphere(g, T(M4.from(hx, hy, 0.3)), 0.1, 0.1, 0.06, 6, 4, BRASS, true);
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; box(g, T(M4.from(hx + Math.sin(a) * 0.17, hy - 0.2 - Math.cos(a) * 0.17, 0.33, 0, 0, -a)), 0.05, 0.11, 0.04, BRASS); }
    }
    box(g, T(M4.from(0, h / 2, 0.25)), 0.08, h, 0.04, DK);                                 // Mittelfuge
    if (arch) {
      disc(g, T(M4.from(0, h, 0.24)), half, 18, WOOD, 0, Math.PI);
      disc(g, T(M4.from(0, h, 0.005)), half, 18, WOOD, 0, Math.PI);
      for (let k = 0; k < 6; k++) { const a = (k + 1) / 7 * Math.PI; box(g, T(M4.from(Math.cos(a) * half * 0.5, h + Math.sin(a) * half * 0.5, 0.26, 0, 0, a - Math.PI / 2)), 0.05, half, 0.04, DK); }
      for (let k = 0; k < 9; k++) {
        const a = (k + 0.5) / 9 * Math.PI, rr = half + 0.32, big = k === 4;
        box(g, T(M4.from(Math.cos(a) * rr, h + Math.sin(a) * rr, 0.28, 0, 0, a - Math.PI / 2)), big ? 0.8 : 0.6, big ? 0.75 : 0.62, 0.56, big ? KEY : ST);
      }
    } else {
      box(g, T(M4.from(0, h + 0.45, 0.28)), w + 1.4, 0.9, 0.56, ST);
      box(g, T(M4.from(0, h + 0.45, 0.58)), 1, 0.7, 0.1, KEY);
    }
    for (const s of [-1, 1]) {
      box(g, T(M4.from(s * (half + 0.35), h / 2, 0.28)), 0.7, h, 0.56, ST);
      box(g, T(M4.from(s * (half + 0.35), 0.2, 0.3)), 0.86, 0.4, 0.66, KEY);
    }
    box(g, T(M4.from(0, 0.05, 0.45)), w + 1.4, 0.1, 0.6, KEY);                                // Schwelle
    if (o.plaque) {
      const pa = o.plaqueAt || [0, h + (arch ? half + 1.15 : 1.6)];
      L.decals.push({ mesh: MESH.plaque, model: T(M4.from(pa[0], pa[1], pa[2] ?? 0.62, 0, 0, 0, o.plaqueScale ?? 1.2)), tex: o.plaque });
    }
    if (o.torches) for (const s of [-1, 1]) {
      const m = T(M4.from(s * (half + 1.4), h * 0.72, 0.18));
      box(g, M4.mul(m, M4.from(0, -0.2, 0)), 0.22, 0.5, 0.36, IRON);
      cyl(g, M4.mul(m, M4.from(0, 0.05, 0.08)), 0.1, 0.16, 0.3, 6, hex('#3a3a44'));
      cyl(gw, M4.mul(m, M4.from(0, 0.35, 0.08)), 0.14, 0, 0.5, 6, hex('#ffb13f'));
    }
  }
  // Schild ueber einer Tuer: Holztafel mit Goldrand, Symbol und Name
  // Schild-Textur: in einem Raster von cw x ch gezeichnet, aber auf eine 2er-Potenz-Leinwand gebracht,
  // damit es Mipmaps + anisotrope Filterung gibt (bleibt auch klein und schraeg gesehen lesbar)
  const ANISO = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  function signTexture(drawFn, cw, ch, W = 1024, H = 512) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.scale(W / cw, H / ch);
    drawFn(c, cw, ch);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (ANISO) gl.texParameterf(gl.TEXTURE_2D, ANISO.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ANISO.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  }
  // Schild ueber einer Tuer: Holztafel mit Goldrand, Symbol und Name — grosse, fette Schrift,
  // lange Namen ("Mandelbrot-Regenbogen") in zwei Zeilen statt winzig in einer
  function plaqueTex(text, icon, col = '#ffd21f') {
    return signTexture((c, w, h) => {
      const bg = c.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#4e2c0c'); bg.addColorStop(1, '#2a1404');
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#e8b84a'; c.lineWidth = 12; c.strokeRect(6, 6, w - 12, h - 12);
      c.strokeStyle = '#6a4418'; c.lineWidth = 3; c.strokeRect(17, 17, w - 34, h - 34);
      c.textBaseline = 'middle'; c.textAlign = 'center';
      c.font = '64px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; c.fillText(icon, 66, h / 2 + 4);
      const x0 = 112, avail = w - x0 - 26, cx = x0 + avail / 2;
      const font = (fs) => { c.font = `900 ${fs}px "Arial Black", "Comic Sans MS", "Comic Neue", sans-serif`; };
      let lines = [text], fs = 62;
      font(fs);
      while (fs > 40 && c.measureText(text).width > avail) { fs -= 2; font(fs); }
      if (c.measureText(text).width > avail) {
        // an Bindestrich oder Leerzeichen nahe der Mitte umbrechen
        let best = -1;
        for (let k = 1; k < text.length - 1; k++) if ((text[k] === '-' || text[k] === ' ') && (best < 0 || Math.abs(k - text.length / 2) < Math.abs(best - text.length / 2))) best = k;
        if (best > 0) lines = [text.slice(0, best + (text[best] === '-' ? 1 : 0)), text.slice(best + 1)];
        fs = 58; font(fs);
        while (fs > 24 && Math.max(...lines.map((l) => c.measureText(l).width)) > avail) { fs -= 2; font(fs); }
      }
      const lh = fs * 1.02, y0 = h / 2 - (lines.length - 1) * lh / 2 + 3;
      c.lineJoin = 'round'; c.lineWidth = Math.max(6, fs * 0.2); c.strokeStyle = '#000'; c.fillStyle = col;
      lines.forEach((l, k) => { c.strokeText(l, cx, y0 + k * lh, avail); c.fillText(l, cx, y0 + k * lh, avail); });
    }, 512, 176);
  }
  // Tuer in der Halle oder einem Flur, die in einen Raum fuehrt. dir = Richtung aus der Wand in den Flur:
  // 'e' (+x, Tuer in der Westwand), 'w' (-x, Ostwand), 's' (+z, Nordwand), 'n' (-z, Suedwand)
  const DOOR_DIRS = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };
  function hubDoor(L, x, y, z, dir, to, name, icon, col, o = {}) {
    const [fx, fz] = DOOR_DIRS[dir], ry = Math.atan2(fx, fz);
    castleDoor(L, x, y, z, ry, { w: 3.6, h: 4.4, plaque: plaqueTex(name, icon, col), torches: true, ...o });
    const d = { to, label: 'Eintreten: ' + name, pos: [x + fx * 1.4, y, z + fz * 1.4], ret: [x + fx * 3.2, y, z + fz * 3.2], retFace: ry };
    L.doors.push(d);
    const hw = (o.w || 3.6) / 2, hh = o.h || 4.4;
    const b = fx ? L.solid(Math.min(x, x + fx * 0.5), y, z - hw, Math.max(x, x + fx * 0.5), y + hh, z + hw, 'door')
      : L.solid(x - hw, y, Math.min(z, z + fz * 0.5), x + hw, y + hh, Math.max(z, z + fz * 0.5), 'door');
    b.door = d;
    return d;
  }

  /* ═══════════ Level 1: Schlossgarten ═══════════ */
  const DOOR_BLOCKS = [];
  function buildGarden() {
    const L = new Level({
      name: 'Schlossgarten', spawn: [0, 0, 40], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#cdeeff'), fogNear: 90, fogFar: 320, light: v3.norm([-0.4, -0.85, -0.35]),
      sky: 'day', bounds: [-104, 104, -100, 92],
    });
    const g = L.geo, K = kit(L);
    // Boden: Stuecke um Burggraben und Teich; das Schachbrett liegt auf einem festen 4-m-Raster,
    // damit die Felder an den Stoss-Kanten weiterlaufen
    const field = (x0, z0, x1, z1, y = 0, a = C.grassA, b = C.grassB, solid = true) => {
      if (solid) L.solid(x0, y - 4, z0, x1, y, z1, 'ground');
      for (let x = Math.floor(x0 / 4) * 4; x < x1 - 1e-6; x += 4) {
        for (let z = Math.floor(z0 / 4) * 4; z < z1 - 1e-6; z += 4) {
          const xa = Math.max(x, x0), xe = Math.min(x + 4, x1), za = Math.max(z, z0), ze = Math.min(z + 4, z1);
          const hs = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453, k = 0.94 + (hs - Math.floor(hs)) * 0.1;
          g.quad([xa, y, ze], [xe, y, ze], [xe, y, za], [xa, y, za], shade(((Math.floor(x / 4) + Math.floor(z / 4)) & 1) ? a : b, k));
        }
      }
    };
    [[-104, -16, 104, 96], [-64, -28, 104, -16], [-104, -40, -80, -16], [-64, -40, -30, -28], [-104, -100, -30, -40], [30, -100, 104, -28], [-30, -100, 30, -34]]
      .forEach(([x0, z0, x1, z1]) => field(x0, z0, x1, z1));
    // Burggraben + Wasser
    L.solid(-30, -6, -34, 30, -1.6, -28, 'moatbed');
    L.checker(-30, -34, 30, -28, -1.6, 2, C.moatBed, shade(C.moatBed, .85));
    g.quad([-30, -1.6, -28], [30, -1.6, -28], [30, 0, -28], [-30, 0, -28], C.dirtDark);
    g.quad([30, -1.6, -34], [-30, -1.6, -34], [-30, 0, -34], [30, 0, -34], C.dirtDark);
    g.quad([-30, -1.6, -34], [-30, -1.6, -28], [-30, 0, -28], [-30, 0, -34], C.dirtDark);
    g.quad([30, -1.6, -28], [30, -1.6, -34], [30, 0, -34], [30, 0, -28], C.dirtDark);
    L.waters.push({ x0: -30, x1: 30, z0: -34, z1: -28, y: -0.45, tint: [0.14, 0.45, 0.9, 0.7] });
    // Bruecke
    L.block(0, 0.05, -31, 6, 0.5, 7.4, { top: C.wood, side: C.woodDark }, 'bridge');
    for (let z = -34; z <= -28; z += 1.2) box(g, M4.from(0, 0.31, z), 6, 0.02, 0.08, C.woodDark);
    L.block(-3.1, 0.8, -31, 0.3, 1.1, 7.4, C.woodDark, 'rail');
    L.block(3.1, 0.8, -31, 0.3, 1.1, 7.4, C.woodDark, 'rail');

    // ── Schloss ──
    const wall = { top: C.wallShade, side: C.wall };
    L.block(0, 9, -48, 26, 18, 20, wall, 'keep');
    // Walmdach
    const r0 = [-13.6, 18, -37.4], r1 = [13.6, 18, -37.4], r2 = [13.6, 18, -58.6], r3 = [-13.6, 18, -58.6], apexA = [-5, 25, -48], apexB = [5, 25, -48];
    g.quad(r0, r1, apexB, apexA, C.roof); g.quad(r2, r3, apexA, apexB, C.roofDark);
    g.tri(r3, r0, apexA, C.roofDark); g.tri(r1, r2, apexB, C.roof);
    // Mittelturm
    L.block(0, 24, -50, 8, 14, 8, wall, 'keep');
    cyl(g, M4.from(0, 31, -50, Math.PI / 8), 6.4, 0, 9, 8, C.roof);
    cyl(g, M4.from(0, 40, -50), 0.12, 0.12, 4, 4, C.stoneDark);
    g.tri([0, 44, -50], [0, 42.4, -50], [2.6, 43.2, -50], C.gold);
    g.tri([0, 42.4, -50], [0, 44, -50], [2.6, 43.2, -50], C.gold);
    // runde Tuerme
    [[-17, -44, 4.5, 22, 8], [17, -44, 4.5, 22, 8], [-27, -40, 3.5, 15, 6], [27, -40, 3.5, 15, 6]].forEach(([x, z, r, h, rh]) => {
      cyl(g, M4.from(x, 0, z), r, r, h, 12, C.wall, C.wallShade);
      cyl(g, M4.from(x, h, z), r + 1, 0, rh, 12, C.roof);
      L.solid(x - r * .9, 0, z - r * .9, x + r * .9, h, z + r * .9, 'tower');
      for (const a of [0.6, 2.2]) box(g, M4.from(x + Math.sin(a) * r, h * .62, z + Math.cos(a) * r, a), 0.9, 1.8, 0.3, hex('#3a2a1a'));
    });
    // Verbindungsmauern mit Zinnen
    [[-20, 1], [20, -1]].forEach(([x]) => {
      L.block(x, 5.5, -42, 14, 11, 4, wall, 'wall');
      for (let i = -6; i <= 6; i += 2.4) box(g, M4.from(x + i, 11.6, -40.5), 1.2, 1.2, 1, C.wall);
    });
    // Fenster am Hauptbau
    [[-8, 7], [8, 7], [-8, 13], [8, 13]].forEach(([x, y]) => box(g, M4.from(x, y, -37.9), 1.4, 2.4, 0.2, hex('#3a2a1a')));
    // Buntglasfenster mit Stern
    const win = M4.from(0, 12.5, -37.85);
    cyl(g, M4.mul(win, M4.from(0, 0, -0.05, 0, Math.PI / 2)), 3.6, 3.6, 0.12, 20, C.gold);
    disc(g, M4.mul(win, M4.from(0, 0, 0.1)), 3.2, 16, [hex('#ff5fa2'), hex('#ffe14a'), hex('#6fd3ff'), hex('#7cff7a')]);
    starGeo(g, M4.mul(win, M4.from(0, 0, 0.2)), 1.3, 0.12, C.white);
    // Tor
    box(g, M4.from(0, 2.6, -37.9), 4.6, 5.2, 0.3, hex('#5a3414'));
    cyl(g, M4.from(0, 5.2, -37.9, 0, Math.PI / 2), 2.3, 2.3, 0.3, 12, hex('#5a3414'));
    box(g, M4.from(0, 2.9, -37.7), 0.14, 5.4, 0.1, hex('#3a2008'));
    L.door = { pos: [0, 0, -38.2], to: 'hall', label: 'Eintreten', spawn: [0, 0, 13], face: Math.PI, yaw: 0 };

    // ── Garten-Deko und Parcours ──
    const tree = (x, z, s = 1) => {
      cyl(g, M4.from(x, 0, z), 0.5 * s, 0.4 * s, 3 * s, 6, C.woodDark);
      sphere(g, M4.from(x, 4.6 * s, z), 2.6 * s, 2.5 * s, 2.6 * s, 8, 6, (i, j) => (i + j) % 3 ? C.leaf : C.leafLight);
      L.solid(x - .6 * s, 0, z - .6 * s, x + .6 * s, 3 * s, z + .6 * s, 'tree');
    };
    [[-40, -8], [-56, 22, 1.2], [44, 36], [58, 8, 1.1], [-26, 48, .9], [22, 50], [-54, -52, 1.3], [60, -50, 1.2],
     [-14, 70], [14, 72, 1.1], [-30, 80, 1.2], [32, 82], [-78, 62, 1.3], [62, 20, 0.9], [88, 8, 1.2], [-40, -86, 1.2], [44, -88, 1.1], [70, -70, 1.3], [-66, -84]].forEach((t) => tree(...t));
    // Stufenhuegel
    [[16, 1.2], [12, 2.4], [8, 3.6], [4, 4.8]].forEach(([s, h]) => L.block(-42, h / 2, 24, s, h, s, { top: C.grassA, side: C.dirt }, 'hill'));
    // Schwebende Steine zur Saeule
    L.block(30, 0.6, 15, 3, 1.2, 3, { top: C.stone, side: C.stoneDark }, 'stone');
    [[34.5, 2.6, 11], [38.5, 4.0, 6.5], [42, 5.4, 1.5], [45, 6.8, -4]].forEach(([x, y, z]) => L.block(x, y - 0.4, z, 3, 0.8, 3, { top: C.stone, side: C.stoneDark }, 'stone'));
    L.block(48, 4.1, -10, 4, 8.2, 4, { top: C.stone, side: C.stoneDark }, 'pillar');
    // Pilz-Plattform + Kiste
    cyl(g, M4.from(-15, 0, 40), 0.9, 0.8, 3, 8, hex('#f2e6c8'));
    sphere(g, M4.from(-15, 3, 40), 3.2, 1.4, 3.2, 12, 4, (i, j) => (i % 3 === 0 && j === 1) ? C.white : C.red, false, 0, Math.PI / 2);
    L.solid(-17.6, 0, 37.4, -12.4, 3.3, 42.6, 'mushroom');
    L.block(-10.6, 0.6, 40, 1.4, 1.2, 1.4, { top: hex('#c9974a'), side: hex('#a8763a') }, 'crate');
    // Wolken-Plattform (nur mit Dreifachsprung)
    // Oberkante 7 m: Doppelsprung schafft ~6,2 m, Dreifachsprung ~8,2 m
    sphere(g, M4.from(0, 6.7, 14), 2.6, 0.7, 2.6, 10, 5, C.white, true);
    sphere(g, M4.from(-1.6, 6.9, 13.2), 1.2, 0.8, 1.2, 8, 5, C.white, true);
    sphere(g, M4.from(1.5, 7.0, 14.8), 1.1, 0.8, 1.1, 8, 5, C.white, true);
    L.solid(-2.3, 6.2, 11.7, 2.3, 7.0, 16.3, 'cloud');
    // Schild
    cyl(g, M4.from(-6, 0, -24), 0.12, 0.12, 1.5, 5, C.woodDark);
    box(g, M4.from(-6, 1.8, -24, 0.3), 2, 1.2, 0.2, { top: C.woodDark, side: C.wood });
    box(g, M4.from(-6, 1.8, -23.88, 0.3), 0.18, 0.7, 0.02, C.woodDark);
    L.solid(-6.2, 0, -24.2, -5.8, 2.4, -23.8, 'sign');
    L.sign = { pos: [-6, 0, -24] };
    // Blauer Schalter
    L.blueSwitch = { pos: [20, 0, 30], pressed: false, t: 0, solid: L.solid(19.2, 0, 29.2, 20.8, 0.6, 30.8, 'switch') };
    // Sternmarke fuer die roten Muenzen
    L.marker = [0, 0.03, 4];
    // Rand: unsichtbare Waende + ferne Huegel
    const [bx0, bx1, bz0, bz1] = L.bounds;
    L.solid(bx0 - 5, -5, bz0 - 5, bx0, 40, bz1 + 5, 'bound'); L.solid(bx1, -5, bz0 - 5, bx1 + 5, 40, bz1 + 5, 'bound');
    L.solid(bx0 - 5, -5, bz0 - 5, bx1 + 5, 40, bz0, 'bound'); L.solid(bx0 - 5, -5, bz1, bx1 + 5, 40, bz1 + 5, 'bound');
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU, r = 150 + (i % 3) * 12;
      cyl(g, M4.from(Math.cos(a) * r, -2, Math.sin(a) * r, a), 28 + (i % 4) * 7, 0, 22 + (i % 5) * 7, 7, (i % 2) ? hex('#5cbf4e') : hex('#4aa83e'));
    }
    g.quad([-260, -1.7, 260], [260, -1.7, 260], [260, -1.7, -260], [-260, -1.7, -260], C.grassB);   // unter Graben + Teich

    // ── Schloss: Sockel, Torbogen, Fahnen ──
    const PL = { top: C.stone, side: C.stoneDark };
    box(g, M4.from(0, 0.6, -58), 26.5, 1.2, 0.5, PL);
    for (const sx of [-1, 1]) { box(g, M4.from(sx * 13, 0.6, -48), 0.5, 1.2, 20.5, PL); box(g, M4.from(sx * 8.25, 0.6, -38), 10, 1.2, 0.5, PL); }
    for (const sx of [-1, 1]) box(g, M4.from(sx * 2.85, 2.9, -37.75), 0.8, 5.8, 0.5, { top: C.stone, side: C.stoneDark });
    for (let i = 0; i <= 6; i++) {
      const a = i / 6 * Math.PI;
      box(g, M4.from(Math.cos(a) * 2.85, 5.2 + Math.sin(a) * 2.85, -37.75, 0, 0, a + Math.PI / 2), 1.55, 0.85, 0.5, i === 3 ? hex('#e8e2d2') : C.stone);
    }
    [[-17, -44, 22 + 8], [17, -44, 22 + 8], [-27, -40, 15 + 6], [27, -40, 15 + 6]].forEach(([x, z, top], i) => {
      cyl(g, M4.from(x, top - 0.4, z), 0.09, 0.09, 3.4, 4, C.stoneDark);
      const fc = hex(['#ff5fa2', '#6fd3ff', '#6fd3ff', '#ff5fa2'][i]), a = [x, top + 2.9, z], b = [x, top + 1.5, z], c = [x + (x < 0 ? -2.4 : 2.4), top + 2.2, z + 0.3];
      g.tri(a, b, c, fc); g.tri(a, c, b, shade(fc, 0.8));
    });
    for (const sx of [-1, 1]) K.bush(sx * 9.5, -36.3, 0, 0.75);

    // ── Steinweg vom Tunnel bis zur Bruecke, runder Platz um die Sternmarke, Laternen ──
    const rnd = seeded(4711), SLAB = [hex('#c9c2b2'), hex('#b8b1a2'), hex('#d4cdbd')];
    for (let z = 90; z > -27; z -= 2.3) {
      if (z < 14 && z > -6) continue;
      box(g, M4.from((rnd() - 0.5) * 0.5, 0.03, z, (rnd() - 0.5) * 0.12), 4.4 + rnd() * 0.8, 0.06, 1.95, SLAB[Math.floor(rnd() * 3)]);
    }
    cyl(g, M4.from(0, -0.2, 4), 9.6, 9.6, 0.225, 28, C.stoneDark, hex('#d8d0bf'));
    for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; box(g, M4.from(Math.cos(a) * 9.9, 0.08, 4 + Math.sin(a) * 9.9, -a), 0.5, 0.16, 2.2, C.stoneDark); }
    for (const z of [22, 36, 50, 64, 78, -12, -22]) for (const sx of [-1, 1]) K.lamp(sx * 4.2, z);

    // ── Beete, Buesche, Grasbueschel ──
    for (const sx of [-1, 1]) {
      for (const x of [12, 20, 28]) K.bush(sx * x, -21);
      K.flowers(sx > 0 ? 9 : -31, -19.4, sx > 0 ? 31 : -9, -16, 50);
      K.flowers(sx > 0 ? 11 : -19, -2, sx > 0 ? 19 : -11, 10, 26);
    }
    K.flowers(-40, 56, -20, 66, 40); K.flowers(20, 56, 40, 66, 40);
    const PATH = [-7, -40, 7, 96], PLAZA = [-11, -7, 11, 15];
    K.tufts(-100, -16, 100, 90, 320, 0, hex('#3f9a32'), [PATH, PLAZA, [-52, 14, -32, 34], [-106, 6, -76, 16]]);
    K.tufts(-104, -98, 104, -40, 120, 0, hex('#3f9a32'), [[-16, -98, 16, -60], [-30, -60, 30, -34]]);

    // ── Westklippe mit Wasserfall, Nische dahinter, Teich davor ──
    const CLIFF = { top: C.grassA, side: hex('#8e877a') };
    L.block(-92, 5, -52, 24, 10, 40, CLIFF, 'cliff');
    L.block(-92, 5, -8, 24, 10, 32, CLIFF, 'cliff');
    L.block(-95, 5, -28, 18, 10, 8, CLIFF, 'cliff');
    L.block(-83, 7, -28, 6, 6, 8, CLIFF, 'cliff');
    box(g, M4.from(-85.93, 2, -28), 0.1, 4, 7.9, hex('#4a4034'));   // dunkle Rueckwand der Nische
    for (const [z0, z1] of [[-72, -32], [-24, 8]]) {
      for (let z = z0 + 1; z < z1 - 2; ) {
        const len = Math.min(2.5 + rnd() * 4, z1 - 1 - z), y = 1.2 + rnd() * 7.2, hh = 0.8 + rnd() * 1.6;
        box(g, M4.from(-79.83, y, z + len / 2), 0.35, hh, len, { top: hex('#a09a8c'), side: shade(hex('#8e877a'), 0.85 + rnd() * 0.25) });
        z += len + 1 + rnd() * 3;
      }
    }
    for (const [x, z, sc] of [[-79, -44, 1.6], [-79.4, -60, 1.3], [-79, -6, 1.5], [-79.2, 4, 1.2]]) K.rock(x, 0, z, sc, hex('#8a8478'));
    box(g, M4.from(-92, 10.03, -28), 24, 0.05, 4.2, C.water);
    K.fall(-79.75, -28, 10, -0.45, 7.4, 'z', { speed: 11 });
    K.coinLine([-83, 1.1, -30.8], [-83, 1.1, -25.2], 3);
    // Aufgang an der Suedseite + Absatz
    L.ramp(-100, 8, -78, 14, 0, 10, 'x-', { top: hex('#c8b890'), side: hex('#9a8a70') }, 'ramp');
    L.block(-102, 5, 11, 4, 10, 6, CLIFF, 'cliff');
    for (const [x, z, h] of [[-98, -66, 7], [-90, -62, 6], [-100, -44, 8], [-97, -4, 6], [-87, 2, 7], [-100, -14, 6]]) K.pine(x, z, 10, h);
    K.flowers(-102, -70, -82, -34, 50, 10); K.flowers(-102, -22, -82, 6, 30, 10);
    K.coinRing(-92, 11.1, -50, 4, 8);
    K.talker(-84, 10, 4, 'Schild', ['AUSSICHTSPUNKT', 'Vom Wasserfall erzählt man sich, dass es dahinter glitzert …']);
    // Teich
    L.solid(-80, -6, -40, -64, -1.6, -16, 'pondbed');
    field(-80, -40, -64, -16, -1.6, C.moatBed, shade(C.moatBed, 0.85), false);
    g.quad([-80, -1.6, -16], [-64, -1.6, -16], [-64, 0, -16], [-80, 0, -16], C.dirtDark);
    g.quad([-64, -1.6, -40], [-80, -1.6, -40], [-80, 0, -40], [-64, 0, -40], C.dirtDark);
    g.quad([-64, -1.6, -16], [-64, -1.6, -40], [-64, 0, -40], [-64, 0, -16], C.dirtDark);
    L.waters.push({ x0: -80, x1: -64, z0: -40, z1: -16, y: -0.45, tint: [0.14, 0.5, 0.85, 0.7] });
    for (const [x, z, r] of [[-70, -22, 0.9], [-67, -33, 0.7], [-74, -36, 0.8], [-68, -27, 0.6]]) {
      cyl(g, M4.from(x, -0.43, z), r, r, 0.04, 10, hex('#3a9a3a'));
      if (r > 0.75) sphere(g, M4.from(x + 0.2, -0.3, z), 0.2, 0.15, 0.2, 6, 4, hex('#ff8ac8'), true);
    }
    K.rock(-62, 0, -18, 1.6); K.rock(-62.5, 0, -38, 1.3); K.rock(-66, 0, -13.5, 1.1);

    // ── Heckengarten mit Brunnen (Osten) ──
    const HEDGE = { top: hex('#3fae4a'), side: hex('#2e8a3a') }, FX = 76, FZ = 56;
    const hedge = (x0, z0, x1, z1, h) => L.block((x0 + x1) / 2, h / 2, (z0 + z1) / 2, x1 - x0, h, z1 - z0, HEDGE, 'hedge');
    for (const s2 of [-1, 1]) {
      // innerer Ring (Luecken Ost/West), aeusserer Ring (Luecken Nord/Sued)
      hedge(FX - 11, FZ + s2 * 11 - 0.6, FX + 11, FZ + s2 * 11 + 0.6, 1.6);
      hedge(FX + s2 * 11 - 0.6, FZ - 11, FX + s2 * 11 + 0.6, FZ - 2, 1.6);
      hedge(FX + s2 * 11 - 0.6, FZ + 2, FX + s2 * 11 + 0.6, FZ + 11, 1.6);
      hedge(FX - 18, FZ + s2 * 18 - 0.6, FX - 2.5, FZ + s2 * 18 + 0.6, 2);
      hedge(FX + 2.5, FZ + s2 * 18 - 0.6, FX + 18, FZ + s2 * 18 + 0.6, 2);
      hedge(FX + s2 * 18 - 0.6, FZ - 18, FX + s2 * 18 + 0.6, FZ + 18, 2);
      for (const s3 of [-1, 1]) {
        const tx = FX + s2 * 20.5, tz = FZ + s3 * 20.5;
        cyl(g, M4.from(tx, 0, tz), 0.3, 0.25, 1.6, 6, C.woodDark);
        sphere(g, M4.from(tx, 2.6, tz), 1.3, 1.3, 1.3, 10, 6, (i, j) => ((i + j) % 3 ? HEDGE.top : HEDGE.side));
        L.solid(tx - 0.5, 0, tz - 0.5, tx + 0.5, 3.8, tz + 0.5, 'topiary');
      }
    }
    const RIM2 = { top: hex('#e0dccf'), side: hex('#b8b2a2') };
    L.block(FX, 0.3, FZ - 5, 10.6, 0.6, 0.8, RIM2, 'rim'); L.block(FX, 0.3, FZ + 5, 10.6, 0.6, 0.8, RIM2, 'rim');
    L.block(FX - 5, 0.3, FZ, 0.8, 0.6, 9.2, RIM2, 'rim'); L.block(FX + 5, 0.3, FZ, 0.8, 0.6, 9.2, RIM2, 'rim');
    L.waters.push({ x0: FX - 4.6, x1: FX + 4.6, z0: FZ - 4.6, z1: FZ + 4.6, y: 0.45, tint: [0.3, 0.75, 1, 0.5] });
    cyl(g, M4.from(FX, 0, FZ), 0.7, 0.55, 2.4, 10, RIM2.side);
    cyl(g, M4.from(FX, 2.4, FZ), 0.5, 1.7, 0.6, 12, RIM2.top, RIM2.side);
    L.solid(FX - 0.8, 0, FZ - 0.8, FX + 0.8, 3, FZ + 0.8, 'fountain');
    K.fall(FX, FZ, 4.4, 0.45, 0.9, 'x', { speed: 6 });
    K.coinRing(FX, 1.1, FZ, 7.6, 8);
    K.flowers(FX - 17, FZ - 17, FX + 17, FZ + 17, 90, 0, undefined, [[FX - 12, FZ - 12, FX + 12, FZ + 12]]);

    // ── Huegel hinter dem Schloss (Rampen rundherum, oben eine rote Muenze) ──
    K.mountain(0, -82, [[14, 3.5], [8.5, 7], [3.5, 10.5]], { col: { top: C.grassA, side: C.dirt }, ramp: 5, rampCol: { top: hex('#c8b890'), side: C.dirt } });
    K.pine(-6, -76, 7, 5); K.pine(-10, -92, 3.5, 6);
    K.coinRing(0, 8.1, -82, 6, 6);

    // ── Grenze: Zinnenmauer, Tunnel-Tor im Sueden ──
    const WALLC = { top: hex('#c9c2b2'), side: hex('#a8a090') };
    const rampart = (x0, z0, x1, z1, y) => {
      const ax = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = ax ? Math.abs(x1 - x0) : Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      box(g, M4.from(cx, y + 0.4, cz), ax ? len : 1.6, 4.4, ax ? 1.6 : len, WALLC);
      for (let t = 1; t < len - 0.5; t += 3) box(g, M4.from(ax ? Math.min(x0, x1) + t : cx, y + 3, ax ? cz : Math.min(z0, z1) + t), ax ? 1.4 : 1.6, 0.8, ax ? 1.6 : 1.4, WALLC);
    };
    rampart(-104.8, -100, -104.8, -72, 0); rampart(-104.8, -72, -104.8, 14, 10); rampart(-104.8, 14, -104.8, 92, 0);
    rampart(104.8, -100, 104.8, 92, 0); rampart(-105.6, -100.8, 105.6, -100.8, 0);
    L.block(0, 6, 94.5, 214, 12, 5, { top: C.grassA, side: hex('#b0a084') }, 'cliff');
    // Suedrand als bewachsener Hang statt schwarzer Wand (Tunnel bleibt frei)
    for (const [hx0, hx1] of [[-107, -8], [8, 107]]) {
      L.ramp(hx0, 84, hx1, 92, 0, 7, 'z+', { top: C.grassA, side: C.dirt }, 'slope');
      L.block((hx0 + hx1) / 2, 9.5, 93.2, hx1 - hx0, 5, 2.4, { top: C.grassA, side: C.dirt }, 'slope');
    }
    for (const [tx, tz] of [[-70, 86], [-46, 88], [-22, 87], [24, 88], [52, 86], [78, 88], [-92, 87], [96, 86]]) {
      K.pine(tx, tz, (tz - 84) / 8 * 7, 5 + (tx % 3));
    }
    box(g, M4.from(0, 3.4, 91.97), 6.2, 6.8, 0.1, hex('#1a1410'));
    for (const sx of [-1, 1]) box(g, M4.from(sx * 3.9, 3.4, 91.7), 1.6, 6.8, 0.8, { top: C.stone, side: C.stoneDark });
    for (let i = 0; i <= 8; i++) {
      const a = i / 8 * Math.PI;
      box(g, M4.from(Math.cos(a) * 3.9, 6.8 + Math.sin(a) * 3.9, 91.7, 0, 0, a + Math.PI / 2), 1.6, 1.7, 0.8, i === 4 ? C.gold : C.stone);
    }
    disc(g, M4.from(0, 6.8, 91.93), 3.15, 12, hex('#1a1410'), 0, Math.PI);

    // ══ Glappa-Dorf: Haeuser, Markt, Brunnen, Windmuehle, Feld, Steg ══
    const WOOD_B = hex('#6b4214'), THATCH = { top: hex('#c8a45a'), side: hex('#a8823c') };
    // Haus: Mauern, Fachwerk, zwei begehbare Dachhaelften, Tuer, Fenster, Schornstein
    const house = (x, z, w, d, h, wall, roof, o = {}) => {
      const WC = { top: shade(wall, 0.9), side: wall }, RC = { top: roof, side: shade(roof, 0.8) };
      L.block(x, h / 2, z, w, h, d, WC, 'house');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, M4.from(x + sx * (w / 2 - 0.12), h / 2, z + sz * (d / 2 - 0.12)), 0.28, h, 0.28, WOOD_B);
      for (const sz of [-1, 1]) {
        box(g, M4.from(x, h - 0.25, z + sz * (d / 2 - 0.06)), w, 0.3, 0.16, WOOD_B);
        box(g, M4.from(x, h * 0.55, z + sz * (d / 2 - 0.06)), w, 0.22, 0.14, WOOD_B);
      }
      for (const sx of [-1, 1]) box(g, M4.from(x + sx * (w / 2 - 0.06), h * 0.55, z), 0.14, 0.22, d, WOOD_B);
      const rh = o.rh ?? w * 0.42, ov = 0.35;
      L.ramp(x - w / 2 - ov, z - d / 2 - ov, x, z + d / 2 + ov, h, h + rh, 'x+', RC, 'roof');
      L.ramp(x, z - d / 2 - ov, x + w / 2 + ov, z + d / 2 + ov, h, h + rh, 'x-', RC, 'roof');
      for (const sz of [-1, 1]) {   // Giebel (bis unter die Dachkante)
        for (const zz of [z + sz * (d / 2 + 0.02), z + sz * (d / 2 + ov)]) {
          g.tri([x - w / 2 - ov, h, zz], [x + w / 2 + ov, h, zz], [x, h + rh, zz], shade(wall, zz === z + sz * (d / 2 + ov) ? 0.7 : 0.82));
        }
      }
      // Tuer + Fenster auf der Suedseite
      const zf = z + d / 2 + 0.03;
      box(g, M4.from(x + (o.doorX ?? 0), 1.05, zf), 1.1, 2.1, 0.12, hex('#5a3414'));
      box(g, M4.from(x + (o.doorX ?? 0), 1.05, zf + 0.07), 0.08, 1.9, 0.06, shade(hex('#5a3414'), 0.6));
      sphere(g, M4.from(x + (o.doorX ?? 0) + 0.38, 1.05, zf + 0.12), 0.07, 0.07, 0.07, 6, 4, hex('#d8aa4a'), true);
      for (const wx of (o.win || [-w / 2 + 1, w / 2 - 1])) {
        box(g, M4.from(x + wx, h * 0.62, zf), 0.95, 0.85, 0.1, hex('#cfe8f5'));
        box(g, M4.from(x + wx, h * 0.62, zf + 0.05), 1.1, 0.14, 0.08, WOOD_B);
        box(g, M4.from(x + wx, h * 0.62, zf + 0.05), 0.12, 0.95, 0.08, WOOD_B);
        box(g, M4.from(x + wx, h * 0.62 - 0.52, zf + 0.12), 1.0, 0.22, 0.3, WOOD_B);   // Blumenkasten
        for (let i = 0; i < 3; i++) sphere(g, M4.from(x + wx - 0.3 + i * 0.3, h * 0.62 - 0.34, zf + 0.2), 0.12, 0.12, 0.12, 6, 4, hex(['#ff5fa2', '#ffe14a', '#ff8a3a'][i]), true);
      }
      // Schornstein mit Rauch
      const cx = x + (o.chim ?? -w / 4), cy = h + rh * (1 - Math.abs(o.chim ?? -w / 4) / (w / 2 + ov)) + 0.9;
      box(g, M4.from(cx, cy - 0.9, z), 0.8, 2, 0.8, { top: hex('#8c877c'), side: hex('#b9b3a6') });
      K.life.smoke(cx, cy + 0.2, z, 5, { speed: 0.7 });
    };
    // Marktstand mit gestreifter Markise
    const stall = (x, z, col) => {
      const C2 = hex(col);
      L.block(x, 0.5, z, 3.4, 1, 1.6, { top: hex('#c9974a'), side: hex('#a8763a') }, 'stall');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, M4.from(x + sx * 1.6, 1.2, z + sz * 0.8), 0.14, 2.4, 0.14, WOOD_B);
      for (let i = 0; i < 6; i++) box(g, M4.from(x - 1.75 + i * 0.7, 2.42, z + 0.45, 0, -0.32), 0.72, 0.1, 2.3, i % 2 ? C2 : C.white);
      for (let i = 0; i < 5; i++) sphere(g, M4.from(x - 1.2 + i * 0.6, 1.12, z + 0.2), 0.22, 0.2, 0.22, 7, 5, hex(['#e03a2a', '#ffb02a', '#5ac83a', '#ff7ac8', '#8a5ad8'][i]), true);
      box(g, M4.from(x + 1.1, 1.25, z - 0.3), 0.8, 0.5, 0.7, hex('#b88a4a'));
    };
    const VX = -17, VZ = 60;
    // Dorfweg (Erde) vom Hauptweg nach Westen
    for (let x = -8; x > -78; x -= 2.4) box(g, M4.from(x, 0.03, VZ + Math.sin(x * 0.12) * 1.2, 0, 0, 0.02), 2.5, 0.06, 4.2 + Math.sin(x) * 0.3, shade(hex('#b08a58'), 0.9 + (x % 3) * 0.05));
    cyl(g, M4.from(VX, -0.2, VZ), 7.2, 7.2, 0.225, 20, C.stoneDark, hex('#d8d0bf'));
    // Brunnen
    cyl(g, M4.from(VX, 0, VZ), 1.7, 1.7, 1.1, 14, hex('#a8a090'), hex('#cfc8b8'));
    cyl(g, M4.from(VX, 1.1, VZ), 1.45, 1.45, 0.06, 14, hex('#2a5a7a'));
    L.solid(VX - 1.7, 0, VZ - 1.7, VX + 1.7, 1.15, VZ + 1.7, 'well');
    for (const sx of [-1, 1]) box(g, M4.from(VX + sx * 1.5, 2.3, VZ), 0.18, 3, 0.18, WOOD_B);
    box(g, M4.from(VX, 3.75, VZ), 4.4, 0.16, 4.2, { top: THATCH.top, side: THATCH.side });
    cyl(g, M4.from(VX, 3.83, VZ, Math.PI / 4), 3.1, 0, 1.5, 4, THATCH.top);
    cyl(g, M4.from(VX, 3.55, VZ, 0, 0, Math.PI / 2), 0.1, 0.1, 2.6, 6, WOOD_B);
    const eimer = build((gg) => {
      cyl(gg, M4.from(0, 0, 0), 0.26, 0.3, 0.45, 8, hex('#8a6a3a'), hex('#6b4214'));
      box(gg, M4.from(0, 0.5, 0), 0.04, 0.6, 0.04, hex('#3a3a42'));
    });
    K.anim(eimer, (t) => M4.from(VX, 2.1 + Math.sin(t * 0.6) * 0.9, VZ, Math.sin(t * 0.4) * 0.3), { lit: 0.85 });
    // Marktstaende
    stall(VX + 5.5, VZ - 3.5, '#e03a4a'); stall(VX - 5.5, VZ + 3.5, '#2f6dff'); stall(VX + 4.5, VZ + 5, '#2fa84a');
    // Haeuser: Nordreihe und Suedreihe
    house(-28, 50, 7, 6, 3.2, hex('#f0e2c0'), hex('#c85a3a'), { chim: -2 });
    house(-42, 47, 8, 6.5, 3.6, hex('#e8d8b0'), hex('#a8503a'), { chim: 2.4, doorX: -1 });
    house(-57, 51, 7, 6, 3.2, hex('#f2e8d0'), hex('#8a6a4a'), { chim: -2 });
    house(-33, 71, 8, 6.5, 3.4, hex('#eee0c8'), hex('#c07a3a'), { chim: 2.4 });
    house(-49, 74, 7, 6, 3.2, hex('#f0e4c4'), hex('#b0503a'), { chim: -2 });
    house(-65, 68, 9, 7, 3.8, hex('#f6ecd4'), hex('#c88a3a'), { chim: 3, doorX: 1.2, win: [-2.8, 1.2] });
    // Baeckerei-Schild am grossen Haus
    box(g, M4.from(-65, 4.6, 71.6), 2.6, 1.3, 0.16, { top: WOOD_B, side: hex('#9c6630') });
    sphere(g, M4.from(-65, 4.6, 71.75), 0.7, 0.42, 0.12, 10, 5, hex('#d8a24a'), true);
    // Waescheleine zwischen zwei Haeusern
    for (const sx of [-1, 1]) box(g, M4.from(-41 + sx * 0.06, 1.6, 72.5), 0.12, 3.2, 0.12, WOOD_B);
    box(g, M4.from(-41, 3.05, 76), 0.05, 0.05, 7, hex('#d8c08a'));
    for (let i = 0; i < 4; i++) box(g, M4.from(-41, 2.65, 73.4 + i * 1.7, 0, 0, Math.sin(i) * 0.06), 0.06, 0.9, 1.1, hex(['#ffffff', '#8ad8ff', '#ffd2e8', '#fff2a8'][i]));
    // Feld mit Zaun
    K.fence(-74, 46, -58, 46); K.fence(-74, 56, -58, 56); K.fence(-74, 46, -74, 56); K.fence(-58, 46, -58, 56);
    for (let r2 = 0; r2 < 5; r2++) for (let c2 = 0; c2 < 14; c2++) {
      const fx = -72.5 + c2 * 1.05, fz = 47.5 + r2 * 1.9;
      box(g, M4.from(fx, 0.12, fz), 0.9, 0.24, 1.2, hex('#7a5a38'));
      sphere(g, M4.from(fx, 0.45, fz), 0.3, 0.35, 0.3, 6, 4, hex(r2 % 2 ? '#4aa83a' : '#5cbf4e'), true);
    }
    // Windmuehle auf kleinem Huegel
    const MX = -84, MZ = 80;
    L.block(MX, 0.6, MZ, 16, 1.2, 16, { top: C.grassA, side: C.dirt }, 'mound');
    cyl(g, M4.from(MX, 1.2, MZ), 3.2, 2.4, 8.5, 12, hex('#e8dcc0'), hex('#e0d2b0'));
    L.solid(MX - 2.9, 1.2, MZ - 2.9, MX + 2.9, 9.7, MZ + 2.9, 'mill');
    cyl(g, M4.from(MX, 9.7, MZ), 2.8, 0, 2.2, 12, hex('#8a4a2a'));
    box(g, M4.from(MX, 3, MZ + 2.5), 1.1, 2.1, 0.5, hex('#5a3414'));
    for (const sx of [-1, 1]) box(g, M4.from(MX + sx * 1.6, 6, MZ + 2.4), 0.8, 0.8, 0.3, hex('#cfe8f5'));
    const fluegel = build((gg) => {
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU;
        const m = M4.from(0, 0, 0, 0, 0, a);
        box(gg, M4.mul(m, M4.from(0, 3.4, 0)), 0.3, 6.8, 0.2, WOOD_B);
        for (let j = 0; j < 5; j++) box(gg, M4.mul(m, M4.from(0.55, 1.4 + j * 1.2, 0)), 1.1, 0.14, 0.12, hex('#f0e6d0'));
      }
      cyl(gg, M4.from(0, 0, 0, 0, Math.PI / 2), 0.4, 0.4, 0.8, 8, hex('#3a3a42'));
    });
    K.anim(fluegel, (t) => M4.from(MX, 8.2, MZ + 3.4, 0, 0, t * 0.55), { lit: 0.9 });
    // Steg mit Ruderboot am Teich
    K.bridge(-66, -24, -60, -20, 0.5, hex('#a8763a'));
    const boot = build((gg) => {
      const H2 = hex('#c04a3a'), D2 = hex('#8a3226');
      for (let i = 0; i < 6; i++) {
        const t = i / 5, w2 = 1.5 - Math.abs(t - 0.5) * 1.1;
        box(gg, M4.from(0, 0.25, -1.6 + t * 3.2), w2, 0.5, 0.65, i % 2 ? H2 : D2);
      }
      box(gg, M4.from(0, 0.55, 0), 1.2, 0.12, 0.7, hex('#d8b070'));
      box(gg, M4.from(0.85, 0.5, 0.4, 0, 0, 0.5), 0.1, 2.4, 0.1, WOOD_B);
      box(gg, M4.from(-0.85, 0.5, -0.4, 0, 0, -0.5), 0.1, 2.4, 0.1, WOOD_B);
    });
    K.anim(boot, (t) => M4.from(-69, -0.75 + Math.sin(t * 1.1) * 0.08, -22, 0.4, Math.sin(t * 0.9) * 0.05, Math.sin(t * 1.3) * 0.06), { lit: 0.9 });
    // Wegweiser am Abzweig
    K.talker(-9, 0, 57, 'Wegweiser', ['← GLAPPA-DORF · Markt, Bäckerei, Mühle', '→ SCHLOSS: einfach dem Steinweg folgen.']);
    // Muenzen im Dorf
    K.coinRing(VX, 1.1, VZ, 5.4, 6);
    K.coinLine([-28, 5.9, 50], [-42, 6.3, 47], 2);
    K.coinLine([-70, 1.1, 51], [-62, 1.1, 51], 3);
    L.coin('yellow', MX, 11.2, MZ);

    // ══ Leben im Garten ══
    K.life.butterflies(-60, 20, 60, 90, 16);
    K.life.butterflies(-34, -24, 34, -14, 8, { cols: ['#ffe14a', '#ffd21f'], speed: 1.3, yr: 1.6 });
    K.life.birds(7, { cx: 0, cz: -20, y: 30 });
    K.life.birds(4, { cx: -20, cz: 60, y: 22, col: '#e8e0d0' });
    K.life.fish(-30, -34, 30, -28, -0.45, 6, { col: '#ff9a3a' });
    K.life.fish(-80, -40, -64, -16, -0.45, 5, { col: '#6ad8e8' });
    K.life.critters('frog', -78, -38, -66, -18, 3, { hop: 0.2, speed: 0.7 });
    K.life.critters('hen', -72, 44, -20, 80, 3, { speed: 0.8 });
    K.life.critters('beetle', -100, -95, -40, -45, 4, { speed: 0.6 });
    K.life.critters('bunny', 20, 50, 90, 88, 3, { s: 0.55, hop: 0.25 });
    K.life.drifts(-70, 60, 70, 90, 14, { y0: 0, y1: 12, col: '#8ad84a', s: 0.8 });
    // Bewohner
    K.life.npc(-14, 57, 'Händlerin Mira', ['Frische Sternfrüchte! … na gut, heute nur zum Anschauen.',
      'Hinter dem Wasserfall im Westen soll es glitzern. Ich war zu nass zum Nachsehen.'], { cat: 0, r: 6, tint: '#ffb04a', mix: 0.35 });
    K.life.npc(-64, 64, 'Bäcker Konrad', ['Ofen ist an, riechst du das?',
      'Auf mein Dach kommst du mit einem Dreifachsprung: dreimal im Lauf springen.'], { cat: 1, r: 5, tint: '#f0d0a0', mix: 0.3 });
    K.life.npc(-24, 63, 'Pelle', ['Fünf Hühner sind ausgebüxt! Sie rennen weg, wenn du näher kommst.',
      'Lauf sie einfach um — dann bringe ich sie ins Gehege hinter dem Dorf.',
      'Wenn alle fünf drin sind, gibt es einen Stern. Ehrenwort!'], { cat: 2, r: 9, tint: '#8ad8ff', mix: 0.35, s: 0.78, speed: 1.3 });
    K.life.npc(-84, 74, 'Müllerin Wanda', ['Guter Wind heute. Hörst du die Flügel?',
      'Oben auf der Mühle liegt eine Münze. Nimm den Hügel als Absprung.'], { cat: 3, r: 5, tint: '#c8b0ff', mix: 0.3, y: 1.2 });
    K.life.npc(-62, -20, 'Fischerin Ada', ['Die Fische springen heute. Gutes Zeichen.',
      'Der Teich ist flach — du kannst hindurchwaten.'], { cat: 0, r: 4, tint: '#4ab0d8', mix: 0.35 });
    K.life.npc(-9, -24, 'Wache Bruno', ['Willkommen im Schlossgarten!',
      'Oben im Schloss ist eine Tür mit Sternen drauf. Vier Sterne, dann geht sie auf.'], { cat: 3, r: 3, tint: '#b0b8c8', mix: 0.4 });

    // ── Muenzen ──
    [[-40, 6.1, 24], [48, 9.3, -10], [-16, -0.2, -31], [-15, 4.4, 40], [0, 11.6, -82], [42, 6.8, 1.5], [-60, 1.1, 52], [0, 8.2, 14]]
      .forEach(([x, y, z]) => L.coin('red', x, y, z));
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; L.coin('yellow', Math.cos(a) * 6, 1.1, 4 + Math.sin(a) * 6); }
    for (let i = 0; i < 5; i++) L.coin('yellow', 0, 1.4, -33.5 + i * 1.5);
    for (let i = 0; i < 8; i++) L.coin('yellow', -14 - i * 3, 1.1, 10 + Math.sin(i / 7 * Math.PI) * 6);
    [[34.5, 3.2, 11], [38.5, 4.6, 6.5], [45, 7.4, -4]].forEach((p) => L.coin('yellow', ...p));
    for (let i = 0; i < 6; i++) L.coin('yellow', 16 + i * 2.5, 1.1, -12);
    L.coin('blue', 27, 1.1, 40); L.coin('blue', 11, 1.1, 46);

    // ── Gegner ──
    for (let i = 0; i < 5; i++) L.coin('yellow', 0, 1.1, 30 + i * 9);
    L.enemies.push(makeGrummel(-10, 20), makeGrummel(16, 2), makeGrummel(-30, -12), makeGrummel(34, 26));
    L.enemies.push(makeGrummel(60, 10), makeGrummel(-62, 62), makeGrummel(40, -70), makeGrummel(-50, -70), makeGrummel(-92, -12, 12));
    L.enemies.push(makeBomb(8, 32), makeBomb(-54, 42), makeBomb(-92, -40, 12), makeBomb(70, 82));
    L.enemies.push(makeSpiky(62, 56, 3, '#3f8a3a'), makeSpiky(90, 44, 3, '#3f8a3a'));
    L.enemies.push(makeHopper(68, 50, 3), makeHopper(-10, -80, 5));
    L.enemies.push(makeBat(-72, 8, -28), makeBat(10, 12, -20));
    // ── Auftrag: fünf ausgebüxte Hühner einfangen ──
    // Gehege hinter dem Dorf; gefangene Hühner laufen dort weiter herum
    const PEN = [-52, 58, -42, 68];
    K.fence(PEN[0], PEN[1], PEN[2], PEN[1]); K.fence(PEN[0], PEN[3], PEN[2], PEN[3]);
    K.fence(PEN[0], PEN[1], PEN[0], PEN[3]); K.fence(PEN[2], PEN[1], PEN[2], PEN[3]);
    L.block(-50, 1, 66.5, 3.4, 2, 2.6, { top: hex('#c85a3a'), side: hex('#e8d8b0') }, 'coop');
    box(g, M4.from(-50, 0.6, 65.1), 0.9, 1.2, 0.2, hex('#5a3414'));
    box(g, M4.from(-50, 2.2, 66.5), 3.8, 0.3, 3, hex('#a8503a'));
    const huehner = K.life.critters('hen', -68, 44, -22, 84, 5, { speed: 1.05 });
    huehner.forEach((h) => { h.flee = true; h.quest = true; });
    let gefangen = 0;
    L.update = () => {
      if (gefangen >= huehner.length) return;
      for (const h of huehner) {
        if (h.caught) continue;
        if (Math.hypot(pl.pos[0] - h.pos[0], pl.pos[2] - h.pos[2]) > 1.3 || Math.abs(pl.pos[1] - h.pos[1]) > 2) continue;
        h.caught = true; h.flee = false; h.rush = 1;
        h.box = PEN.slice(); h.pos[0] = -47 + Math.random() * 3; h.pos[2] = 61 + Math.random() * 5; h.tgt = null;
        gefangen++;
        Snd.chime(gefangen * 3);
        toast(`\u{1F414} Huhn ${gefangen} / ${huehner.length} im Gehege`);
        if (gefangen === huehner.length) {
          spawnStar('huehner', L, [-17, 3.6, 60]);
          Dialog.show('Pelle', ['Alle fünf wieder da — du bist schneller als die Hühner!', 'Über dem Brunnen ist ein Stern aufgetaucht.']);
        }
      }
    };
    L.finish();
    return L;
  }

  /* ═══════════ Level 2: Schlosshalle ═══════════ */
  function buildHall() {
    const L = new Level({
      name: 'Schlosshalle', spawn: [0, 0, 16], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#4a3018'), fogNear: 60, fogFar: 170, light: v3.norm([0.35, -0.8, -0.45]), sky: 'day',
    });
    const g = L.geo, KH = kit(L);
    const W = 24, ZN = -30, ZS = 20, H = 16;
    L.solid(-W - 2, -4, ZN - 2, W + 2, 0, ZS + 2, 'ground');
    L.checker(-W, ZN, W, ZS, 0, 3, C.floorA, C.floorB);
    g.quad([-3.2, 0.05, ZS], [3.2, 0.05, ZS], [3.2, 0.05, -12], [-3.2, 0.05, -12], C.gold);
    g.quad([-2.8, 0.09, ZS], [2.8, 0.09, ZS], [2.8, 0.09, -12], [-2.8, 0.09, -12], C.carpet);
    for (let z = ZS - 1; z > -12; z -= 3) starGeo(g, M4.from(0, 0.1, z, 0, -Math.PI / 2), 0.5, 0.005, C.gold);
    const hw = { top: C.hallWall, side: C.hallWall };
    L.block(-W - 1, H / 2, (ZN + ZS) / 2, 2, H, ZS - ZN + 4, hw, 'wallL');
    L.block(W + 1, H / 2, (ZN + ZS) / 2, 2, H, ZS - ZN + 4, hw, 'wallR');
    L.block(0, H / 2, ZN - 1, W * 2 + 4, H, 2, hw, 'wallN');
    L.block(-14, H / 2, ZS + 1, 20, H, 2, hw, 'wallS'); L.block(14, H / 2, ZS + 1, 20, H, 2, hw, 'wallS');
    L.block(0, 11, ZS + 1, 8, 10, 2, hw, 'wallS');
    L.solid(-4, 0, ZS - 0.1, 4, 6, ZS + 2, 'exitdoor');
    // Decke + Holzleiste
    // Decke mit grossem Oberlicht in der Mitte: dort sieht man den Himmel
    const CEIL = hex('#7a4f22'), HX = 7, HZ0 = -12, HZ1 = 2;
    g.quad([-W, H, HZ0], [-W, H, ZN], [W, H, ZN], [W, H, HZ0], CEIL);
    g.quad([-W, H, ZS], [-W, H, HZ1], [W, H, HZ1], [W, H, ZS], CEIL);
    g.quad([-W, H, HZ1], [-W, H, HZ0], [-HX, H, HZ0], [-HX, H, HZ1], CEIL);
    g.quad([HX, H, HZ1], [HX, H, HZ0], [W, H, HZ0], [W, H, HZ1], CEIL);
    box(g, M4.from(0, H, HZ0), HX * 2 + 1, 0.8, 0.5, C.gold); box(g, M4.from(0, H, HZ1), HX * 2 + 1, 0.8, 0.5, C.gold);
    box(g, M4.from(-HX, H, (HZ0 + HZ1) / 2), 0.5, 0.8, HZ1 - HZ0, C.gold); box(g, M4.from(HX, H, (HZ0 + HZ1) / 2), 0.5, 0.8, HZ1 - HZ0, C.gold);
    L.solid(-W, H, ZN, W, H + 2, ZS, 'roof');
    [[-W + .05, 1], [W - .05, -1]].forEach(([x, s]) => {
      box(g, M4.from(x, 0.6, (ZN + ZS) / 2), 0.15, 1.2, ZS - ZN, hex('#8a5a2a'));
      box(g, M4.from(x, 9.5, (ZN + ZS) / 2), 0.15, 0.5, ZS - ZN, C.gold);
    });
    // Eingangstuer: fuellt die 8 m breite Oeffnung ganz aus, darueber ein Bogenfeld mit Stern
    castleDoor(L, 0, 0, ZS, Math.PI, { w: 8, h: 6, arch: false, torches: true, wood: hex('#5a3010') });
    const TY = M4.from(0, 6.9, ZS - 0.12, Math.PI);
    disc(g, TY, 3.2, 20, hex('#b08a3a'), 0, Math.PI);
    disc(g, M4.mul(TY, M4.from(0, 0, 0.04)), 2.8, 20, hex('#5a3a8a'), 0, Math.PI);
    starGeo(g, M4.mul(TY, M4.from(0, 1.3, 0.1)), 1, 0.08, C.gold);
    L.door = { pos: [0, 0, ZS - 0.4], to: 'garden', label: 'Hinausgehen', spawn: [0, 0, -35.6], face: 0, yaw: 0 };
    // ── Tueren: unten je Seite drei (vier Bilderzimmer + Bibliothek + Musikzimmer), oben auf der Galerie zwei.
    //    Unter der Galerie geht es in den Keller und in den Schlosshof, hinter der Sterntuer ins Obergeschoss. ──
    const ROOMS = [
      { key: 'bild_terminal', name: 'Terminal-Tal', icon: '\u{1F4BE}', side: -1, z: 14, y: 0, col: '#3fff6a' },
      { key: 'bibliothek', name: 'Bibliothek', icon: '\u{1F4DA}', side: -1, z: 2, y: 0, col: '#ffd21f' },
      { key: 'bild_pilz', name: 'Pilzwald', icon: '\u{1F344}', side: -1, z: -10, y: 0, col: '#ff6a5a' },
      { key: 'bild_bounce', name: 'Bounce-Berg', icon: '\u{2744}\u{FE0F}', side: 1, z: 14, y: 0, col: '#aee8ff' },
      { key: 'musik', name: 'Musikzimmer', icon: '\u{1F3B9}', side: 1, z: 2, y: 0, col: '#ff7ae0' },
      { key: 'bild_video', name: 'Video-Bucht', icon: '\u{1F30A}', side: 1, z: -10, y: 0, col: '#6ac8ff' },
      { key: 'spiel', name: 'Spielzimmer', icon: '\u{1F9F8}', side: -1, z: -25.5, y: 5, col: '#7aff5a' },
      { key: 'sternwarte', name: 'Sternwarte', icon: '\u{1F52D}', side: 1, z: -25.5, y: 5, col: '#b8a8ff' },
    ];
    for (const R of ROOMS) hubDoor(L, R.side * W, R.y, R.z, R.side < 0 ? 'e' : 'w', R.key, R.name, R.icon, R.col);
    // Saeulen
    [[-14, 8], [14, 8], [-14, -6], [14, -6]].forEach(([x, z]) => {
      L.block(x, H / 2, z, 2, H, 2, { top: C.stone, side: hex('#e8dcc0') }, 'pillar');
      box(g, M4.from(x, 0.4, z), 2.6, 0.8, 2.6, C.stone);
    });
    // Treppe zur Galerie
    const steps = 10, rise = 0.5, depth = 0.8, z0 = -12;
    for (let i = 0; i < steps; i++) {
      const top = rise * (i + 1), zc = z0 - depth * i - depth / 2;
      L.block(0, top / 2, zc, 10, top, depth, { top: C.carpet, side: hex('#8a5a2a') }, 'stair');
    }
    const balZ0 = z0 - depth * steps;
    L.block(0, 2.5, (balZ0 + ZN) / 2, W * 2, 5, balZ0 - ZN, { top: C.floorB, side: hex('#8a5a2a') }, 'balcony');
    // Galerie-Front: Saeulen-Relief und Gesims
    for (const x of [-21, -7, 7, 21]) box(g, M4.from(x, 2.5, balZ0 + 0.2), 0.9, 5, 0.4, { top: C.stone, side: hex('#e8dcc0') });
    box(g, M4.from(0, 4.8, balZ0 + 0.25), W * 2, 0.4, 0.5, C.gold);
    [[-15, -1], [15, 1]].forEach(([x]) => {
      L.block(x, 5.6, balZ0 + 0.2, 18, 1.2, 0.4, C.gold, 'rail');
    });
    // Unter der Galerie: links hinab in den Keller, rechts hinaus in den Schlosshof (Schild neben der Tuer)
    hubDoor(L, -14, 0, balZ0, 's', 'keller', 'Keller', '\u{1F56F}\u{FE0F}', '#ffb13f', { h: 3.9, arch: false, plaqueAt: [-4.9, 3.1, 0.1], plaqueScale: 1 });
    hubDoor(L, 14, 0, balZ0, 's', 'hof', 'Schlosshof', '\u{26F2}', '#8ae8ff', { h: 3.9, arch: false, plaqueAt: [4.9, 3.1, 0.1], plaqueScale: 1 });
    // Sterntuer oben an der Nordwand
    L.starDoor = { pos: [0, 5, ZN + 0.1], open: 0, opening: false, emblem: labelTexture((c, w, h) => {
      c.fillStyle = '#3a2008'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd21f'; c.strokeStyle = '#000'; c.lineWidth = 8; c.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 50 : 115; c.lineTo(w / 2 + Math.cos(a) * r, h / 2 + 8 + Math.sin(a) * r); }
      c.closePath(); c.stroke(); c.fill();
      c.fillStyle = '#fff'; c.font = 'italic 900 84px Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 10; c.strokeText('4', w / 2, h / 2 + 18); c.fillText('4', w / 2, h / 2 + 18);
    }) };
    box(g, M4.from(0, 8.8, ZN + 0.12), 7.4, 7.6, 0.1, hex('#6a6a6a'));
    for (const s of [-1, 1]) box(g, M4.from(s * 4.1, 8.8, ZN + 0.35), 0.8, 7.8, 0.6, { top: C.stone, side: hex('#e8dcc0') });
    box(g, M4.from(0, 13, ZN + 0.35), 9, 0.9, 0.6, C.gold);
    L.solid(-3.2, 5, ZN, 3.2, 12, ZN + 0.6, 'stardoor');
    // Hinter der Sterntuer liegt das Obergeschoss; von dort kommt man hier oben wieder heraus
    L.backSpots = { og: { pos: [0, 5, ZN + 3.6], face: 0 } };
    // Die Gemaelde haengen nicht mehr hier: jedes Bild hat sein eigenes Zimmer hinter einer Tuer
    // Sonnenstrahl durchs Fenster
    const win = [-W + 0.1, 13, -2], spot = [-12, 0.02, 4];
    box(g, M4.from(win[0], win[1], win[2]), 0.2, 3, 2.2, hex('#fff6c8'));
    L.sun = { spot, win, r: 2.2 };
    const axis = v3.sub(win, spot), yl = v3.len(axis), yA = v3.norm(axis);
    const xA = v3.norm(v3.cross(yA, [0, 0, 1])), zA = v3.cross(xA, yA);
    L.beamModel = M4.mul(M4.basis(spot, xA, yA, zA), M4.from(0, 0, 0, 0, 0, 0, 2.2, yl, 2.2));
    // Muenzen
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; L.coin('yellow', Math.cos(a) * 6, 1.1, 3 + Math.sin(a) * 6); }
    for (let i = 0; i < 8; i++) L.coin('yellow', -19 + i * 5.4, 6.1, -26);
    for (let i = 0; i < 4; i++) L.coin('yellow', 0, 1.1 + (i + 1) * 1, -12.4 - i * 1.6);
    // ── Mehr Schloss: Kronleuchter, Fahnen, Fenster, Wandleuchter, Kamin, Vitrine, Statuen, Pflanzen ──
    const gw = L.glowGeo;
    const chandelier = (x, y, z) => {
      cyl(g, M4.from(x, y, z), 0.05, 0.05, H - y, 4, hex('#2a2a2a'));
      cyl(g, M4.from(x, y - 0.2, z), 2, 1.6, 0.35, 14, C.gold);
      cyl(g, M4.from(x, y - 1.2, z), 0.25, 1.1, 1, 10, C.gold);
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * TAU, cx = x + Math.cos(a) * 1.8, cz = z + Math.sin(a) * 1.8;
        cyl(g, M4.from(cx, y + 0.15, cz), 0.07, 0.07, 0.4, 5, hex('#f4ecd8'));
        cyl(gw, M4.from(cx, y + 0.55, cz), 0.07, 0, 0.25, 5, hex('#ffd878'));
      }
    };
    chandelier(-11, 11, 12); chandelier(11, 11, 12); chandelier(0, 12.5, -24);
    for (const side of [-1, 1]) {
      const x = side * (W - 0.02), ry = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      // Fahnen zwischen den Tueren
      for (const z of [8, -4]) {
        box(g, M4.from(x - side * 0.3, 14.2, z), 0.12, 0.12, 2.4, C.gold);
        const m = M4.from(x - side * 0.08, 12, z, ry);
        box(g, m, 2, 4.2, 0.04, hex('#a8161b'));
        g.tri(P(m, -1, -2.1, 0.03), P(m, 1, -2.1, 0.03), P(m, 0, -2.9, 0.03), hex('#a8161b'));
        starGeo(g, M4.mul(m, M4.from(0, 0.3, 0.05)), 0.6, 0.02, C.gold);
      }
      // Bogenfenster oben
      for (const z of [12, 4.5, -10.5]) {
        if (side < 0 && z === 4.5) continue;
        const m = M4.from(x - side * 0.04, 12.2, z, ry);
        box(gw, m, 2.2, 3, 0.05, hex('#dff0ff'));
        disc(gw, M4.mul(m, M4.from(0, 1.5, 0.01)), 1.1, 12, hex('#dff0ff'), 0, Math.PI);
        box(g, M4.mul(m, M4.from(0, 0, 0.05)), 0.12, 3, 0.06, hex('#5a4a3a')); box(g, M4.mul(m, M4.from(0, 0.3, 0.05)), 2.2, 0.12, 0.06, hex('#5a4a3a'));
        box(g, M4.mul(m, M4.from(0, -1.7, 0.2)), 2.6, 0.25, 0.4, C.stone);
      }
      // Wandleuchter zwischen den Tueren
      for (const z of [8, -4]) {
        const m = M4.from(x - side * 0.15, 6.3, z, ry);
        box(g, m, 0.3, 0.5, 0.3, C.gold);
        cyl(gw, M4.mul(m, M4.from(0, 0.3, 0.1)), 0.13, 0, 0.5, 6, hex('#ffb13f'));
      }
    }
    // Deckenbalken
    for (const z of [17, 11, 5, -15, -21, -27]) box(g, M4.from(0, H - 0.4, z), W * 2, 0.8, 0.7, hex('#5a3a18'));
    // Kamin an der Suedwand (links vom Eingang)
    L.block(-14, 1.4, ZS - 0.7, 6, 2.8, 1.4, { top: C.stone, side: hex('#c8bca8') }, 'fireplace');
    box(g, M4.from(-14, 1.1, ZS - 1.42), 3.4, 2, 0.05, hex('#1a1008'));
    box(gw, M4.from(-14, 0.6, ZS - 1.46), 2.4, 0.9, 0.05, hex('#ff8a2a')); box(gw, M4.from(-14, 0.45, ZS - 1.5), 1.6, 0.5, 0.05, hex('#ffe060'));
    box(g, M4.from(-14, 3, ZS - 0.9), 6.6, 0.4, 1.8, C.wood);
    box(g, M4.from(-14, 6.5, ZS - 0.4), 4.6, 6.6, 0.8, { top: C.stone, side: hex('#c8bca8') });
    [hex('#3a8aff'), hex('#ffd21f'), hex('#d8342b')].forEach((c, k) => cyl(g, M4.from(-15.8 + k * 1.8, 3.2, ZS - 1.1), 0.18, 0.14, 0.5, 6, c));
    // Sternvitrine rechts vom Eingang: zeigt jeden gesammelten Stern
    L.block(14, 2.2, ZS - 0.8, 7, 4.4, 1.6, { top: hex('#6a3a14'), side: hex('#8a5a2a') }, 'vitrine');
    box(gw, M4.from(14, 2.4, ZS - 1.62), 6.2, 3.6, 0.04, hex('#2a1a4a'));
    const vitrineMesh = build((gg) => starGeo(gg, I4, 0.22, 0.06, C.gold));
    // Sockel fuer die Statuen der gewaehlten Figur neben der Treppe
    for (const s of [-1, 1]) {
      L.block(s * 7.5, 0.8, -13.5, 2.2, 1.6, 2.2, { top: C.stone, side: hex('#c8bca8') }, 'pedestal');
      box(g, M4.from(s * 7.5, 1.7, -13.5), 2.5, 0.2, 2.5, C.gold);
    }
    // Pflanzen am Eingang
    for (const s of [-1, 1]) {
      cyl(g, M4.from(s * 6.5, 0, ZS - 1.2), 0.6, 0.8, 1, 8, hex('#b8683a'));
      for (let k = 0; k < 6; k++) sphere(g, M4.from(s * 6.5 + Math.cos(k) * 0.5, 1.6 + (k % 3) * 0.35, ZS - 1.2 + Math.sin(k) * 0.5), 0.55, 0.45, 0.55, 8, 5, C.leaf, true);
      L.solid(s * 6.5 - 0.7, 0, ZS - 1.9, s * 6.5 + 0.7, 2, ZS - 0.5, 'plant');
    }
    L.drawSolid = () => {
      const got = Object.keys(STARS).filter((id) => state.stars[id]);
      got.forEach((id, i) => {
        const col = i % 9, row = Math.floor(i / 9);
        draw(vitrineMesh, M4.from(10.8 + col * 0.8, 3.7 - row * 0.9, ZS - 1.7, clock * 1.2 + i), { lit: 0.4 });
      });
      for (const s of [-1, 1]) drawCatStatue(M4.from(s * 7.5, 1.8, -13.5, s * 0.35, 0, 0, 1.25), { tint: [0.74, 0.72, 0.68, 0.9], lit: 1 });
    };
    L.enemies.push(makeGrummel(-12, -25, 8), makeToaster(10, 0));
    // ── Leben ──
    KH.life.glows(-22, -28, 22, 18, 20, { y: 1, yr: 9, col: '#ffdba0', s: 0.6, speed: 0.3 });
    KH.life.critters('mouse', -20, -26, 20, 16, 4, { speed: 1 });
    KH.life.npc(-11, 9, 'Hallenwache Tilda', ['Willkommen in der Halle! Jedes Bild hat jetzt ein eigenes Zimmer – das Schild über der Tür sagt, welches.',
      'Unter der Galerie geht es links in den KELLER und rechts in den SCHLOSSHOF mit dem Geisterbrunnen.',
      'Und hinter der Sterntür oben liegt das OBERGESCHOSS mit dem großen Turm. Reinlaufen genügt überall.'], { cat: 1, r: 4, tint: '#c8b0ff', mix: 0.3 });
    L.finish();
    return L;
  }

  /* ═══════════ Level 3: Wuestenstadt ═══════════
     Eigene Karte (kein Nachbau): Stadttor im Sueden, Strasse zum Brunnenplatz,
     Tunnel nach Osten, Gassen im Westen, Terrasse mit Wachturm im Norden.
     Der Stern oben auf dem Turm will ueber Kisten, Dach, Planke und Simse erklettert werden. */
  function buildDesert() {
    const L = new Level({
      name: 'Wüstenstadt', spawn: [0, 0, 40], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#f3ddb0'), fogNear: 110, fogFar: 340, light: v3.norm([0.3, -0.9, 0.3]), sky: 'desert',
    });
    const g = L.geo, K2 = kit(L);
    const STONE = { top: hex('#c9a574'), side: hex('#dcbc8c') };
    const TRIM = hex('#b08a5a'), DARK = hex('#4a3520'), WOOD = hex('#b8864a'), WOOD_D = hex('#7a5530'), TRIMX = hex('#b08a5a');
    const X0 = -60, X1 = 60, Z0 = -60, Z1 = 50;
    L.solid(X0 - 6, -4, Z0 - 6, X1 + 6, 0, Z1 + 6, 'ground');
    L.checker(X0, Z0, X1, Z1, 0, 4, hex('#e9d09a'), hex('#dcc08a'));

    // ── Stadtmauer + Tor im Sueden ──
    L.block(X0 - 1, 7, (Z0 + Z1) / 2, 2, 14, Z1 - Z0 + 4, STONE, 'citywall');
    // Ostmauer mit Tor (z -4..4) hinaus in die offene Wueste
    L.block(X1 + 1, 7, (Z0 - 2 - 4) / 2, 2, 14, -4 - (Z0 - 2), STONE, 'citywall');
    L.block(X1 + 1, 7, (4 + Z1 + 2) / 2, 2, 14, Z1 + 2 - 4, STONE, 'citywall');
    L.block(X1 + 1, 10.5, 0, 2, 7, 8, STONE, 'citywall');
    for (const s of [-1, 1]) box(g, M4.from(X1 + 1, 3.5, s * 4.3), 2.6, 7, 0.8, TRIMX);
    box(g, M4.from(X1 + 1, 7.3, 0), 2.6, 0.8, 9.4, TRIMX);
    L.block(0, 7, Z0 - 1, X1 - X0 + 4, 14, 2, STONE, 'citywall');
    L.block(-32.5, 7, Z1 + 1, 59, 14, 2, STONE, 'citywall');
    L.block(32.5, 7, Z1 + 1, 59, 14, 2, STONE, 'citywall');
    L.block(0, 9.75, Z1 + 1, 6, 8.5, 2, STONE, 'citywall');
    box(g, M4.from(0, 2.75, Z1 - 0.05), 5.6, 5.5, 0.1, hex('#5a3414'));
    box(g, M4.from(0, 2.9, Z1 - 0.12), 0.12, 5.2, 0.05, hex('#3a2008'));
    L.solid(-3, 0, Z1 - 0.1, 3, 5.5, Z1 + 2, 'exitdoor');
    L.door = { pos: [0, 0, Z1 - 0.4], to: 'hall', label: 'Zurück ins Schloss', back: true };
    for (let x = X0; x <= X1; x += 6) { box(g, M4.from(x, 14.6, Z0 - 1), 2.4, 1.2, 2, TRIM); box(g, M4.from(x, 14.6, Z1 + 1), 2.4, 1.2, 2, TRIM); }
    for (let z = Z0; z <= Z1; z += 6) { box(g, M4.from(X0 - 1, 14.6, z), 2, 1.2, 2.4, TRIM); box(g, M4.from(X1 + 1, 14.6, z), 2, 1.2, 2.4, TRIM); }

    // ── Bausteine ──
    const windows = (x0, z0, x1, z1, y0, h) => {
      for (let y = y0 + 2.4; y < y0 + h - 1.2; y += 3.4) {
        for (let x = x0 + 2.5; x < x1 - 1.5; x += 4.5) {
          box(g, M4.from(x, y, z0 - 0.04), 1.1, 1.6, 0.1, DARK); box(g, M4.from(x, y, z1 + 0.04), 1.1, 1.6, 0.1, DARK);
        }
        for (let z = z0 + 2.5; z < z1 - 1.5; z += 4.5) {
          box(g, M4.from(x0 - 0.04, y, z), 0.1, 1.6, 1.1, DARK); box(g, M4.from(x1 + 0.04, y, z), 0.1, 1.6, 1.1, DARK);
        }
      }
    };
    const house = (x0, z0, x1, z1, h, y0 = 0) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0, sz = z1 - z0, top = y0 + h;
      L.block(cx, y0 + h / 2, cz, sx, h, sz, STONE, 'house');
      box(g, M4.from(cx, top - 0.3, cz), sx + 0.3, 0.6, sz + 0.3, TRIM);
      // Bruestung 0,45 m hoch: man kann drueberlaufen
      const pc = { top: TRIM, side: STONE.side };
      L.block(cx, top + 0.225, z0 + 0.25, sx, 0.45, 0.5, pc, 'parapet');
      L.block(cx, top + 0.225, z1 - 0.25, sx, 0.45, 0.5, pc, 'parapet');
      L.block(x0 + 0.25, top + 0.225, cz, 0.5, 0.45, sz - 1, pc, 'parapet');
      L.block(x1 - 0.25, top + 0.225, cz, 0.5, 0.45, sz - 1, pc, 'parapet');
      windows(x0, z0, x1, z1, y0, h);
    };
    const crate = (x, y, z, s = 2.4) => {
      L.block(x, y + s / 2, z, s, s, s, { top: hex('#c89456'), side: WOOD }, 'crate');
      const m = M4.from(x, y + s / 2, z);
      for (const [dx, dz, ry] of [[0, s / 2 + 0.03, 0], [0, -s / 2 - 0.03, 0], [s / 2 + 0.03, 0, Math.PI / 2], [-s / 2 - 0.03, 0, Math.PI / 2]]) {
        const f = M4.mul(m, M4.from(dx, 0, dz, ry));
        box(g, M4.mul(f, M4.from(0, 0, 0, 0, 0, Math.PI / 4)), s * 1.25, 0.22, 0.04, WOOD_D);
        box(g, M4.mul(f, M4.from(0, s / 2 - 0.12, 0)), s, 0.24, 0.05, WOOD_D);
        box(g, M4.mul(f, M4.from(0, -s / 2 + 0.12, 0)), s, 0.24, 0.05, WOOD_D);
      }
    };
    // Markise: gestreiftes Tuch, zur hohen Seite (hi) an der Wand; federt wie ein Trampolin
    const awning = (x0, z0, x1, z1, yHi, yLo, hi, col) => {
      const yAt = (x, z) => lerp(yHi, yLo, hi === 'w' ? (x - x0) / (x1 - x0) : hi === 'e' ? (x1 - x) / (x1 - x0) : hi === 'n' ? (z - z0) / (z1 - z0) : (z1 - z) / (z1 - z0));
      const acrossX = hi === 'n' || hi === 's';
      const n = Math.max(2, Math.round((acrossX ? x1 - x0 : z1 - z0) / 1.1));
      for (let i = 0; i < n; i++) {
        const c = i % 2 ? hex('#f4ecd8') : col;
        if (acrossX) {
          const a = lerp(x0, x1, i / n), b = lerp(x0, x1, (i + 1) / n);
          g.quad([a, yAt(a, z0), z0], [b, yAt(b, z0), z0], [b, yAt(b, z1), z1], [a, yAt(a, z1), z1], c);
        } else {
          const a = lerp(z0, z1, i / n), b = lerp(z0, z1, (i + 1) / n);
          g.quad([x0, yAt(x0, a), a], [x1, yAt(x1, a), a], [x1, yAt(x1, b), b], [x0, yAt(x0, b), b], c);
        }
      }
      L.solid(x0, Math.min(yHi, yLo) - 0.15, z0, x1, (yHi + yLo) / 2 + 0.1, z1, 'awning');
    };
    const palm = (x, z, h = 8) => {
      const lean = (t) => Math.sin(t * 1.4) * h * 0.14;
      for (let i = 0; i < 6; i++) {
        const t0 = i / 6, t1 = (i + 1) / 6;
        cyl(g, M4.from(x + lean(t0), h * t0, z), 0.42 - t0 * 0.14, 0.42 - t1 * 0.14, h / 6 + 0.05, 7, i % 2 ? hex('#8a6a3a') : hex('#9c7a48'));
      }
      const tx = x + lean(1);
      for (let k = 0; k < 7; k++) {
        box(g, M4.mul(M4.from(tx, h, z, k / 7 * TAU), M4.from(0, -0.5, 1.7, 0, 0.45)), 0.9, 0.1, 3.6, k % 2 ? hex('#3f9a3a') : hex('#2f7f2e'));
      }
      sphere(g, M4.from(tx, h - 0.15, z), 0.5, 0.4, 0.5, 6, 4, hex('#6a4a22'));
      L.solid(x - 0.45, 0, z - 0.45, x + 0.45, h * 0.6, z + 0.45, 'palm');
    };
    const barrel = (x, z) => {
      cyl(g, M4.from(x, 0, z), 0.6, 0.6, 1.3, 10, hex('#7a5030'), hex('#6a4428'));
      cyl(g, M4.from(x, 0.25, z), 0.62, 0.62, 0.1, 10, hex('#3a3a3a'));
      cyl(g, M4.from(x, 0.95, z), 0.62, 0.62, 0.1, 10, hex('#3a3a3a'));
      L.solid(x - 0.6, 0, z - 0.6, x + 0.6, 1.3, z + 0.6, 'barrel');
    };
    const stall = (x, z, col) => {
      L.block(x, 0.55, z, 5, 1.1, 2, { top: hex('#a8763a'), side: WOOD }, 'stall');
      for (const [dx, dz] of [[-2.4, -2], [2.4, -2], [-2.4, 2], [2.4, 2]]) cyl(g, M4.from(x + dx, 0, z + dz), 0.1, 0.1, 3.4, 5, WOOD_D);
      awning(x - 2.7, z - 2.2, x + 2.7, z + 2.2, 3.7, 3.2, 'n', col);
      [hex('#e8a020'), hex('#c83020'), hex('#7ab030'), hex('#e8d040')].forEach((c, i) => sphere(g, M4.from(x - 1.8 + i * 1.2, 1.36, z), 0.28, 0.25, 0.28, 6, 4, c));
    };

    // ── Haeuser ──
    house(-44, 20, -10, 44, 7.5);          // Westhaus an der Strasse
    house(10, 16, 40, 44, 9);              // Osthaus an der Strasse
    house(-58, -20, -30, 14, 12);          // Grosses Westhaus
    house(26, 7, 58, 16, 9);               // Haus ueber dem Tunnel (Nord)
    house(26, -22, 42, -7, 11);            // Haus neben dem Tunnel (Sued)
    awning(-10, 28, -7, 36, 3.6, 3.0, 'w', hex('#c8402a'));
    awning(-30, -8, -27, 0, 3.6, 3.0, 'w', hex('#2a5fa8'));

    // ── Brunnenplatz ──
    cyl(g, M4.from(0, 0, 0), 2.6, 2.6, 1.1, 14, hex('#b8a080'), hex('#a89070'));
    disc(g, M4.from(0, 0.95, 0, 0, -Math.PI / 2), 2.15, 14, hex('#3d7fc8'));
    cyl(g, M4.from(-2.2, 1.1, 0), 0.15, 0.15, 3.2, 5, WOOD_D);
    cyl(g, M4.from(2.2, 1.1, 0), 0.15, 0.15, 3.2, 5, WOOD_D);
    box(g, M4.from(0, 4.35, 0), 5.2, 0.3, 0.5, WOOD_D);
    L.solid(-2.4, 0, -2.4, 2.4, 1.1, 2.4, 'well');
    stall(-18, 6, hex('#2a8a5a'));
    stall(18, 8, hex('#c8402a'));
    [[-14, -10], [14, -10], [-22, 13], [22, 13]].forEach(([x, z]) => palm(x, z, 7 + Math.abs(x) % 3));

    // ── Tunnel nach Osten ──
    L.block(34, 3, 6, 16, 6, 2, STONE, 'house');
    L.block(34, 3, -6, 16, 6, 2, STONE, 'house');
    L.block(34, 6.5, 0, 16, 1, 14, STONE, 'house');
    box(g, M4.from(34, 5.97, 0), 16, 0.02, 10, hex('#6a5438'));
    for (let x = 27; x <= 41; x += 3.5) box(g, M4.from(x, 5.7, 0), 0.4, 0.5, 10, WOOD_D);
    barrel(24.5, 8.5); barrel(24.5, -8.5); barrel(55, -40); barrel(56.4, -37.6);

    // ── Terrasse mit Treppen und Torbogen ──
    L.block(0, 2, -33, 48, 4, 22, STONE, 'terrace');
    for (let i = 0; i < 8; i++) L.block(0, (i + 1) * 0.25, -14.5 - i, 8, (i + 1) * 0.5, 1, { top: hex('#cfae7e'), side: TRIM }, 'stair');
    for (let i = 0; i < 8; i++) L.block(-31.5 + i, (i + 1) * 0.25, -26, 1, (i + 1) * 0.5, 4, { top: hex('#cfae7e'), side: TRIM }, 'stair');
    for (let i = 0; i < 8; i++) L.block(31.5 - i, (i + 1) * 0.25, -26, 1, (i + 1) * 0.5, 4, { top: hex('#cfae7e'), side: TRIM }, 'stair');
    L.block(-5.2, 3.5, -18, 1.6, 7, 1.6, STONE, 'arch');
    L.block(5.2, 3.5, -18, 1.6, 7, 1.6, STONE, 'arch');
    L.block(0, 7.7, -18, 12, 1.4, 1.6, { top: TRIM, side: STONE.side }, 'arch');
    sphere(g, M4.from(0, 8.4, -18), 1.6, 1.4, 0.8, 10, 4, TRIM, false, 0, Math.PI / 2);

    // ── Haeuser auf der Terrasse + Wachturm ──
    house(-24, -44, -12, -30, 8, 4);       // Dach auf 12 m
    house(12, -44, 24, -30, 6, 4);         // Dach auf 10 m
    L.block(0, 14, -36, 6, 20, 6, STONE, 'tower');
    box(g, M4.from(0, 23.7, -36), 6.4, 0.6, 6.4, TRIM);
    const tp = { top: TRIM, side: STONE.side };
    L.block(0, 24.225, -38.75, 6, 0.45, 0.5, tp, 'parapet'); L.block(0, 24.225, -33.25, 6, 0.45, 0.5, tp, 'parapet');
    L.block(-2.75, 24.225, -36, 0.5, 0.45, 5, tp, 'parapet'); L.block(2.75, 24.225, -36, 0.5, 0.45, 5, tp, 'parapet');
    for (let y = 7; y < 23; y += 4) { box(g, M4.from(0, y, -32.96), 1, 1.8, 0.1, DARK); box(g, M4.from(0, y, -39.04), 1, 1.8, 0.1, DARK); }
    cyl(g, M4.from(2.2, 24.4, -38.2), 0.08, 0.08, 4, 4, hex('#555555'));
    g.tri([2.2, 28.3, -38.2], [2.2, 27, -38.2], [4.8, 27.65, -38.2], hex('#c8402a'));
    g.tri([2.2, 27, -38.2], [2.2, 28.3, -38.2], [4.8, 27.65, -38.2], hex('#c8402a'));
    // Kletterweg: Kisten -> Westdach -> Planke -> Simse rund um den Turm
    crate(-8, 4, -25);
    crate(-10.6, 4, -27.4); crate(-10.6, 6.4, -27.4);
    crate(-13.2, 4, -28.6); crate(-13.2, 6.4, -28.6); crate(-13.2, 8.8, -28.6);
    L.block(-8.7, 11.8, -36, 6.6, 0.4, 2, { top: WOOD, side: WOOD_D }, 'plank');
    const ledge = { top: TRIM, side: STONE.side };
    // Jedes Sims ragt an einer Ecke 0,4 m ueber den Turm hinaus -> dort startet der naechste Sprung
    L.block(-4.2, 14.25, -36.2, 2.4, 0.5, 6.4, ledge, 'ledge');   // West, 14,5 m
    L.block(0.2, 16.75, -40.2, 6.4, 0.5, 2.4, ledge, 'ledge');    // Nord, 17 m
    L.block(4.2, 19.25, -35.8, 2.4, 0.5, 6.4, ledge, 'ledge');    // Ost, 19,5 m
    L.block(-0.2, 21.75, -31.8, 6.4, 0.5, 2.4, ledge, 'ledge');   // Sued, 22 m
    L.fixedStars.push({ id: 'tower', pos: [0, 26, -36] });

    // ── Hoefe ──
    crate(-50, 0, -50); crate(-50, 2.4, -50); crate(-46.6, 0, -50);
    crate(50, 0, 36); crate(47.6, 0, 38.4);
    palm(-40, -54, 9); palm(52, 44, 8); palm(-52, 30, 7);

    // Schild am Tor
    cyl(g, M4.from(6, 0, 38), 0.12, 0.12, 1.5, 5, WOOD_D);
    box(g, M4.from(6, 1.8, 38, 0.4), 2, 1.2, 0.2, { top: WOOD_D, side: WOOD });
    L.solid(5.8, 0, 37.8, 6.2, 2.4, 38.2, 'sign');
    L.sign = { pos: [6, 0, 38], text: [
      '★ WÜSTENSTADT ★\nWillkommen, Reisender!',
      'Oben auf dem WACHTURM hinter dem Brunnenplatz glitzert ein Stern.',
      'Der Weg nach oben: über die Kisten aufs Westdach, über die Planke zum Turm und dann die Simse hinauf.',
      'Die bunten MARKISEN sind übrigens erstaunlich federnd …',
      'Hinter dem OSTTOR (durch den Tunnel) liegt die offene Wüste mit einer großen Pyramide – dort wartet der zweite Stern.',
      'Zurück ins Schloss geht es durchs Tor hinter dir.',
    ] };

    // ── Muenzen ──
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; L.coin('yellow', Math.cos(a) * 4.8, 1.1, Math.sin(a) * 4.8); }
    for (let i = 0; i < 6; i++) L.coin('yellow', 0, 1.1, 36 - i * 4);
    for (let i = 0; i < 6; i++) L.coin('yellow', 28 + i * 2.6, 1.1, 0);
    [[-8, 7.5, -25], [-10.6, 9.9, -27.4], [-13.2, 12.3, -28.6], [-18, 13.1, -37], [-8.7, 13.1, -36],
     [-4.2, 15.6, -36], [0, 18.1, -40.2], [4.2, 20.6, -36], [0, 23.1, -31.8]].forEach((p) => L.coin('yellow', ...p));
    for (let i = 0; i < 5; i++) L.coin('yellow', -27 + i * 4, 8.6, 32);
    for (let i = 0; i < 5; i++) L.coin('yellow', -52 + i * 6, 1.1, 17);
    for (let i = 0; i < 4; i++) L.coin('yellow', 46 + i * 3, 1.1, 28);
    for (let i = 0; i < 4; i++) L.coin('yellow', -44 + i * 4, 1.1, -44);

    // ════ Die offene Wueste hinter dem Osttor: Pyramide, Sphinx, Oase ════
    const SA = hex('#e9d09a'), SB = hex('#dcc08a');
    L.solid(62, -4, -100, 190, 0, 70, 'ground');
    L.checker(62, -95, 185, 65, 0, 5, SA, SB);
    L.solid(185, -5, -100, 195, 40, 70, 'bound'); L.solid(62, -5, -105, 195, 40, -95, 'bound'); L.solid(62, -5, 65, 195, 40, 75, 'bound');
    L.block(63, 7, -79, 2, 14, 32, STONE, 'citywall'); L.block(63, 7, 59, 2, 14, 14, STONE, 'citywall');
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (i / 15) * Math.PI, rr = 150 + (i % 3) * 25;
      sphere(g, M4.from(125 + Math.cos(a) * rr, -3, -15 + Math.sin(a) * rr * 1.2), 40 + (i % 4) * 12, 10 + (i % 3) * 5, 30, 12, 5, (ii, jj) => shade(hex('#e8c888'), 0.9 + ((ii + jj) % 2) * 0.08), true, 0, Math.PI / 2);
    }
    // Stufenpyramide: 7 Stufen zu je 3 m, Treppe an der Westseite, Schrein oben
    const PYR = { top: hex('#e0c080'), side: hex('#c8a060') }, PX0 = 125, PZ0 = -15;
    // jede Stufe in drei Teile: Nord, Sued und die Mitte erst dort, wo die Treppe darueber liegt
    for (let k = 0; k < 7; k++) {
      const hs = 30 - 4 * k, x0 = PX0 - hs, x1 = PX0 + hs, z0 = PZ0 - hs, z1 = PZ0 + hs, y0 = 3 * k, zc0 = PZ0 - 3, zc1 = PZ0 + 3;
      const xr = Math.max(x0, 95 + (y0 + 3) * 24 / 21);
      L.block(PX0, y0 + 1.5, (z0 + zc0) / 2, hs * 2, 3, zc0 - z0, PYR, 'pyramid');
      L.block(PX0, y0 + 1.5, (zc1 + z1) / 2, hs * 2, 3, z1 - zc1, PYR, 'pyramid');
      if (x1 - xr > 0.01) L.block((xr + x1) / 2, y0 + 1.5, PZ0, x1 - xr, 3, 6, PYR, 'pyramid');
      const TR = hex('#ecd098');
      box(g, M4.from(PX0, y0 + 2.85, (z0 - 0.1 + zc0) / 2), hs * 2 + 0.2, 0.3, zc0 - z0 + 0.1, TR);
      box(g, M4.from(PX0, y0 + 2.85, (zc1 + z1 + 0.1) / 2), hs * 2 + 0.2, 0.3, z1 + 0.1 - zc1, TR);
      if (x1 - xr > 0.01) box(g, M4.from((xr + x1 + 0.1) / 2, y0 + 2.85, PZ0), x1 + 0.1 - xr, 0.3, 6, TR);
    }
    L.ramp(95, PZ0 - 3, 119, PZ0 + 3, 0, 21, 'x+', { top: hex('#ecd8a8'), side: hex('#c8a060') }, 'stairs');
    for (let x = 96; x < 119; x += 1.5) box(g, M4.from(x, (x - 95) * 21 / 24 + 0.02, PZ0), 0.12, 0.05, 6, hex('#b8904a'));
    for (const s of [-1, 1]) L.ramp(95, PZ0 + s * 3.4 - 0.4, 119, PZ0 + s * 3.4 + 0.4, 1, 22, 'x+', { top: hex('#c8a060'), side: hex('#b08a50') }, 'rail');
    for (const [x, z] of [[120, -20], [130, -20], [120, -10], [130, -10]]) K2.column(x, z, 21, 4.6, 0.6, hex('#e8dcc0'));
    L.block(PX0, 25.9, PZ0, 13, 0.6, 13, PYR, 'roof');
    cyl(g, M4.from(PX0, 26.2, PZ0, Math.PI / 4), 8.6, 0, 5, 4, hex('#f2c230'));
    K2.star('pyramide', [PX0, 23.3, PZ0]);
    K2.coinLine([98, 3.9, PZ0], [116, 19.6, PZ0], 6);
    for (let k = 0; k < 6; k++) { const hs = 30 - 4 * k; L.coin('yellow', PX0 + hs - 2, 3 * (k + 1) + 1.1, PZ0 + hs - 2); }
    // Katzen-Sphinx am Weg
    const SPH = hex('#d8b878'), SX = 92, SZ = 28;
    sphere(g, M4.from(SX, 3, SZ), 5.5, 3, 3.5, 16, 8, SPH, true);
    sphere(g, M4.from(SX - 4.6, 5.8, SZ), 2.4, 2.4, 2.2, 14, 8, SPH, true);
    for (const s of [-1, 1]) {
      cyl(g, M4.from(SX - 4.9, 7.6, SZ + s * 1.2, 0, 0, s * 0.3 * 0), 0.9, 0, 1.6, 4, SPH);
      sphere(g, M4.from(SX - 8.2, 0.8, SZ + s * 1.8), 2.4, 0.8, 0.9, 10, 6, SPH, true);
      sphere(g, M4.from(SX - 6.9, 6.2, SZ + s * 0.9), 0.35, 0.45, 0.2, 8, 5, hex('#3a8a6a'), true);
    }
    cyl(g, M4.from(SX + 5, 1.2, SZ + 2.5, 0, 0, -1.2), 0.5, 0.35, 5, 8, SPH);
    L.solid(SX - 5.5, 0, SZ - 3.3, SX + 5.5, 5.2, SZ + 3.3, 'sphinx'); L.solid(SX - 6.8, 5.2, SZ - 2, SX - 2.4, 8.2, SZ + 2, 'sphinx');
    L.solid(SX - 10.6, 0, SZ - 3, SX - 5.5, 1.6, SZ + 3, 'sphinx');
    K2.coinRing(SX - 4.6, 9.4, SZ, 1.4, 6);
    // Oase: flaches Becken mit Palmen
    const RIM = { top: hex('#c8a870'), side: hex('#b09060') };
    L.block(150, 0.25, 24.5, 22, 0.5, 1, RIM, 'rim'); L.block(150, 0.25, 45.5, 22, 0.5, 1, RIM, 'rim');
    L.block(139.5, 0.25, 35, 1, 0.5, 20, RIM, 'rim'); L.block(160.5, 0.25, 35, 1, 0.5, 20, RIM, 'rim');
    L.waters.push({ x0: 140, x1: 160, z0: 25, z1: 45, y: 0.45, tint: [0.2, 0.7, 0.7, 0.4] });
    for (const [x, z, h] of [[137, 22, 8], [163, 24, 9], [136, 44, 7], [164, 47, 8], [150, 49, 9], [145, 20, 7]]) K2.palm(x, z, 0, h);
    K2.coinRing(150, 1.1, 35, 6, 10);
    // Kakteen, Saeulenruinen, Obelisk, Zelte, Felsen
    const cactus = (x, z, h) => {
      const CC = hex('#4a8a3a');
      cyl(g, M4.from(x, 0, z), 0.55, 0.5, h, 8, CC); sphere(g, M4.from(x, h, z), 0.5, 0.4, 0.5, 8, 4, CC, true);
      for (const s of [-1, 1]) { const ah = h * (0.4 + (s > 0 ? 0.15 : 0)); cyl(g, M4.from(x + s * 0.5, ah, z, 0, 0, -s * Math.PI / 2), 0.32, 0.32, 0.9, 6, CC); cyl(g, M4.from(x + s * 1.35, ah, z), 0.32, 0.3, h * 0.35, 6, CC); }
      L.solid(x - 0.55, 0, z - 0.55, x + 0.55, h, z + 0.55, 'cactus');
    };
    [[80, -40], [100, 50], [160, -60], [170, 10], [140, -80], [75, 45], [175, -30], [110, -75], [165, 55]].forEach(([x, z], i) => cactus(x, z, 3 + (i % 3)));
    for (let k = 0; k < 8; k++) {
      const z = -60 + (k % 4) * 8, x = k < 4 ? 82 : 88, h = [6, 3.5, 6, 2.2, 4.4, 6, 3, 5.2][k];
      K2.column(x, z, 0, h, 0.8, hex('#e8dcc0'));
      if (h < 5) for (let j = 0; j < 3; j++) box(g, M4.from(x + 2 + j * 0.8, 0.4, z + (j - 1) * 0.9, j), 1.4, 0.8, 1.4, hex('#e0d4b8'));
    }
    cyl(g, M4.from(100, 0, -55, Math.PI / 4), 2.2, 1.2, 14, 4, hex('#d8c498')); cyl(g, M4.from(100, 14, -55, Math.PI / 4), 1.2, 0, 1.8, 4, hex('#f2c230'));
    L.solid(98.4, 0, -56.6, 101.6, 14, -53.4, 'obelisk');
    for (const [x, z, c1] of [[74, 14, '#c8402a'], [74, -30, '#2a5fa8']]) {
      cyl(g, M4.from(x, 0, z, Math.PI / 4), 4, 0, 4.5, 4, hex(c1));
      box(g, M4.from(x, 0.03, z), 7, 0.04, 7, hex('#a8401a'));
      L.solid(x - 2.4, 0, z - 2.4, x + 2.4, 2.6, z + 2.4, 'tent');
    }
    [[150, -40], [178, 40], [120, 40], [95, -85]].forEach(([x, z]) => K2.rock(x, 0, z, 2.4, hex('#c89a6a')));
    K2.talker(68, 0, 7, 'Schild', [
      'OSTTOR\nDahinter: die offene Wüste und die GROSSE PYRAMIDE.',
      'Oben auf der Pyramide liegt im Schrein ein Stern. Die Treppe an der Westseite führt hinauf – aber von oben rollen Steinkugeln!',
      'Durstig? Die Oase liegt im Südosten.',
    ]);

    // ── Gegner ──
    L.enemies.push(makeGrummel(-8, 10), makeGrummel(-40, 17), makeGrummel(8, -30), makeGrummel(48, 30), makeGrummel(110, 20), makeGrummel(160, -20), makeGrummel(96, -68));
    L.enemies.push(makeBomb(50, -20), makeBomb(-45, -38), makeBomb(140, 10), makeBomb(170, -70));
    L.enemies.push(makeSpiky(-20, 30, 3, '#c8a060'), makeSpiky(20, -45, 7, '#c8a060'), makeSpiky(95, 0, 3, '#c8a060'), makeSpiky(150, -60, 3, '#c8a060'), makeSpiky(125, -15, 24, '#c8a060'));
    L.enemies.push(makeHopper(0, 20, 3, '#e8c070'), makeHopper(-30, -10, 3, '#e8c070'), makeHopper(150, 35, 3, '#6ac8c8'), makeHopper(120, -40, 8, '#e8c070'));
    L.enemies.push(makeBat(0, 18, -36, '#8a5a2a'), makeBat(125, 30, -15, '#8a5a2a'), makeBat(90, 12, 28, '#8a5a2a'), makeBat(-40, 12, -20, '#8a5a2a'));
    L.enemies.push(makeRoller([[118, PZ0], [95, PZ0], [85, PZ0]], { speed: 8, r: 1.3, delay: 1, tint: [0.85, 0.7, 0.45, 0.6] }),
      makeRoller([[118, PZ0], [95, PZ0], [85, PZ0]], { speed: 8, r: 1.3, delay: 4.5, tint: [0.85, 0.7, 0.45, 0.6] }));
    // ── Leben ──
    K2.life.birds(6, { cx: 60, cz: -10, y: 34, col: '#4a4038', speed: 0.8 });
    K2.life.critters('beetle', -60, -60, 60, 40, 6, { speed: 0.7 });
    K2.life.critters('beetle', 95, -40, 170, 40, 5, { speed: 0.7 });
    K2.life.fish(141, 26, 159, 44, 0.45, 5, { col: '#6ad8e8', depth: 1 });
    K2.life.butterflies(134, 18, 168, 52, 6, { cols: ['#ffe14a', '#ff9a4a'], yr: 1.8 });
    K2.life.npc(-8, 34, 'Basar-Katze Nuri', ['Wasser? Teuer. Schatten? Umsonst.',
      'Fünf goldene Skarabäen sind in der Stadt verstreut — auf Dächern, am Wachturm, an der Pyramide und draußen an der Oase.',
      'Bring mir alle fünf, dann erscheint hier am Tor ein Stern.'], { cat: 2, r: 5, tint: '#e8c070', mix: 0.35 });
    K2.life.npc(6, 28, 'Wächter Basil', ['Der Wachturm ist hoch: Kisten, Dach, Planke, Simse — dann bist du oben.'], { cat: 3, r: 4, tint: '#c8a060', mix: 0.35 });
    // ── Deko: Kruege, Marktkarren, Teppiche, Palmen, Feuerstellen ──
    const krug = (x, y, z, r2) => {
      const CC = hex(['#c86a3a', '#b8884a', '#a8582a'][Math.floor(r2() * 3)]);
      sphere(g, M4.from(x, y + 0.55, z), 0.42, 0.55, 0.42, 8, 6, CC, true);
      cyl(g, M4.from(x, y + 1.0, z), 0.16, 0.22, 0.35, 8, shade(CC, 0.85));
      L.solid(x - 0.45, y, z - 0.45, x + 0.45, y + 1.2, z + 0.45, 'jar');
    };
    K2.scatter(-60, -60, 170, 45, 22, (x, y, z, i, r) => krug(x, y, z, r), { avoid: [[-12, 28, 12, 46], [92, -24, 160, 8]] });
    K2.scatter(-60, -70, 170, 45, 12, (x, y, z, i, r) => {   // Marktkarren mit Markise
      const CC = hex(['#c8402a', '#2f6dff', '#2fa84a'][i % 3]);
      L.block(x, y + 0.55, z, 2.6, 1.1, 1.4, { top: hex('#c9974a'), side: hex('#a8763a') }, 'cart');
      for (const sx of [-1, 1]) box(g, M4.from(x + sx * 1.2, y + 1.6, z), 0.12, 2, 0.12, hex('#6b4214'));
      box(g, M4.from(x, y + 2.5, z, 0, -0.2), 2.8, 0.12, 2, CC);
      cyl(g, M4.from(x - 1.3, y + 0.5, z + 0.75, 0, 0, Math.PI / 2), 0.5, 0.5, 0.12, 10, hex('#6b4214'));
      cyl(g, M4.from(x + 1.3, y + 0.5, z + 0.75, 0, 0, Math.PI / 2), 0.5, 0.5, 0.12, 10, hex('#6b4214'));
    }, { avoid: [[-14, 26, 14, 46], [92, -26, 162, 10]] });
    K2.scatter(-60, -70, 170, 45, 16, (x, y, z, i, r) => {   // Teppich + Kissen
      box(g, M4.from(x, y + 0.03, z, r() * 3), 3 + r(), 0.06, 2 + r(), hex(['#a8324a', '#2a4a8a', '#8a5a2a'][i % 3]));
      for (let k = 0; k < 2; k++) box(g, M4.from(x + (k - 0.5) * 1.2, y + 0.2, z + 0.4, r() * 3), 0.7, 0.3, 0.7, hex(['#e8c070', '#c85a3a'][k]));
    }, { avoid: [[-12, 28, 12, 46]] });
    K2.scatter(-60, -70, 170, 45, 10, (x, y, z, i, r) => {   // Feuerstelle
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; box(g, M4.from(x + Math.cos(a) * 0.9, y + 0.15, z + Math.sin(a) * 0.9, -a), 0.45, 0.3, 0.3, hex('#8a7a6a')); }
      for (let k = 0; k < 3; k++) box(g, M4.from(x, y + 0.2, z, k * 1.2, 0.3), 1.4, 0.16, 0.16, hex('#5a4030'));
      K2.life.glows(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 3, { y, yr: 1.2, col: '#ff9a3a', s: 0.8, speed: 0.4 });
      K2.life.smoke(x, y + 0.6, z, 4, { speed: 0.6, col: '#c8c0b4', s: 0.7 });
    }, { avoid: [[-12, 28, 12, 46]] });
    // ── Auftrag: fünf goldene Skarabäen ──
    K2.quest('skarab', MESH.skarab, [[-32, 15.6, -60], [136, 16.5, -6], [118, 19.6, -24], [84, 2.8, 28], [150, 1.5, 22]],
      { icon: '\u{1FAB2}', label: 'Skarabäus', speaker: 'Basar-Katze Nuri', starPos: [0, 2.4, 30],
        done: ['Alle fünf Skarabäen! Die Wüste gibt sie nur ungern her.', 'Auf dem Platz beim Tor wartet ein Stern.'] });
    L.finish();
    return L;
  }

  /* ═══════════ Baukasten fuer die Bilder-Welten ═══════════ */
  const PAGE_NAMES = ['Terminal', 'Video', 'Bounce', 'Home', 'Search', 'Mandelbrot', 'Secret Page', 'Startseite'];
  MESH.lupe = build((g) => {
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; box(g, M4.from(Math.cos(a) * 0.6, Math.sin(a) * 0.6 + 0.9, 0, 0, 0, a), 0.14, 0.26, 0.16, hex('#e8b923')); }
    disc(g, M4.from(0, 0.9, 0.01), 0.52, 16, hex('#bfe8ff'));
    disc(g, M4.from(0, 0.9, -0.01, Math.PI), 0.52, 16, hex('#bfe8ff'));
    cyl(g, M4.from(0.45, 0.35, 0, 0, 0, 0.7), 0.09, 0.07, 0.7, 6, hex('#6b3f14'));
  });
  MESH.chest = build((g) => {
    box(g, M4.from(0, 0.5, 0), 1.6, 1, 1.1, { top: hex('#8a5a2a'), side: hex('#a86a30') });
    sphere(g, M4.from(0, 1, 0), 0.8, 0.45, 0.55, 10, 4, hex('#9c6230'), false, 0, Math.PI / 2);
    box(g, M4.from(0, 0.75, 0.57), 0.3, 0.4, 0.06, hex('#f2c230'));
    for (const x of [-0.6, 0.6]) box(g, M4.from(x, 0.7, 0), 0.12, 1.3, 1.16, hex('#f2c230'));
  });
  MESH.hat = build((g) => {
    cyl(g, I4, 0.75, 0.75, 0.12, 12, hex('#1a1a1a'));
    cyl(g, M4.from(0, 0.12, 0), 0.5, 0.5, 0.8, 12, hex('#222222'));
    cyl(g, M4.from(0, 0.25, 0), 0.52, 0.52, 0.14, 12, hex('#c8302a'));
  });
  MESH.gear = build((g) => {
    const brass = hex('#c89a3a');
    cyl(g, I4, 4, 4, 0.6, 24, shade(brass, 0.85), brass);
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; box(g, M4.from(Math.cos(a) * 4.3, 0.3, Math.sin(a) * 4.3, -a), 0.9, 0.6, 0.9, brass); }
    cyl(g, M4.from(0, -0.05, 0), 1, 1, 0.7, 12, hex('#5a4020'));
  });
  MESH.hand = build((g) => box(g, M4.from(0, 1.4, 0), 0.28, 2.8, 0.1, hex('#1a1208')));
  MESH.rod = build((g) => cyl(g, I4, 0.55, 0.55, 1, 10, hex('#b0b4bc')));
  // Fundstuecke der Auftraege
  MESH.skarab = build((g) => {
    const GO = hex('#f2c230'), DK = hex('#b08a1a');
    sphere(g, M4.from(0, 0.3, 0), 0.42, 0.3, 0.56, 10, 6, GO, true);
    sphere(g, M4.from(0, 0.26, 0.5), 0.22, 0.18, 0.2, 8, 5, DK, true);
    box(g, M4.from(0, 0.58, -0.05), 0.04, 0.1, 0.6, DK);
    for (const sx of [-1, 1]) {
      box(g, M4.from(sx * 0.3, 0.44, 0.1, 0, 0, sx * 0.5), 0.5, 0.06, 0.34, DK);
      for (let i = 0; i < 3; i++) box(g, M4.from(sx * 0.38, 0.12, 0.25 - i * 0.26, 0, 0, sx * 0.9), 0.3, 0.05, 0.05, DK);
      sphere(g, M4.from(sx * 0.1, 0.34, 0.62), 0.06, 0.06, 0.05, 5, 4, hex('#2a2a32'), true);
    }
  });
  MESH.diskette = build((g) => {
    const B = hex('#2a2a3a'), M2 = hex('#b8bcc8'), L2 = hex('#e8e8f0');
    box(g, M4.from(0, 0.5, 0), 1, 1, 0.12, { top: B, side: B });
    box(g, M4.from(0, 0.85, 0.07), 0.55, 0.3, 0.04, M2);
    box(g, M4.from(0.12, 0.85, 0.09), 0.16, 0.26, 0.03, B);
    box(g, M4.from(0, 0.3, 0.07), 0.66, 0.42, 0.03, L2);
    box(g, M4.from(-0.36, 0.14, 0.07), 0.16, 0.16, 0.03, B);
  });
  MESH.flasche = build((g) => {
    const GL = hex('#6ad8c8');
    cyl(g, M4.from(0, 0, 0), 0.22, 0.22, 0.6, 9, GL);
    cyl(g, M4.from(0, 0.6, 0), 0.22, 0.09, 0.22, 9, GL);
    cyl(g, M4.from(0, 0.82, 0), 0.09, 0.09, 0.24, 8, GL);
    cyl(g, M4.from(0, 1.02, 0), 0.1, 0.1, 0.12, 8, hex('#c8a060'));
    box(g, M4.from(0, 0.3, 0), 0.24, 0.34, 0.12, hex('#f4ecd0'));
  });
  MESH.kuerbis = build((g) => {
    const O = hex('#e08a2a'), D = hex('#a85a18');
    for (let i = 0; i < 6; i++) sphere(g, M4.from(0, 0.55, 0, i / 6 * TAU), 0.28, 0.55, 0.62, 8, 6, i % 2 ? O : shade(O, 0.92), true);
    cyl(g, M4.from(0, 1.05, 0), 0.1, 0.12, 0.3, 6, hex('#4a6a2a'));
    for (const sx of [-1, 1]) g.tri([sx * 0.1, 0.72, 0.58], [sx * 0.32, 0.72, 0.5], [sx * 0.2, 0.5, 0.56], hex('#3a1a08'));
    g.tri([-0.28, 0.34, 0.55], [0.28, 0.34, 0.55], [0, 0.18, 0.56], hex('#3a1a08'));
    box(g, M4.from(0, 0.4, -0.5), 0.5, 0.5, 0.1, D);
  });
  MESH.leuchtpilz = build((g) => {
    const ST = hex('#eaf6e0');
    cyl(g, M4.from(0, 0, 0), 0.16, 0.13, 0.7, 8, ST);
    sphere(g, M4.from(0, 0.7, 0), 0.55, 0.38, 0.55, 10, 5, hex('#7affc8'), true, 0, Math.PI / 2);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; sphere(g, M4.from(Math.cos(a) * 0.26, 0.86, Math.sin(a) * 0.26), 0.09, 0.05, 0.09, 6, 4, hex('#eaffe8'), true); }
  });
  MESH.flagge = build((g) => {
    cyl(g, M4.from(0, 0, 0), 0.09, 0.07, 3, 6, hex('#b8bcc8'));
    for (let i = 0; i < 3; i++) {
      const y = 2.9 - i * 0.55;
      g.tri([0, y, 0], [0, y - 0.5, 0], [1.3, y - 0.25, 0.1], hex('#ffd21f'));
      g.tri([0, y, 0], [1.3, y - 0.25, 0.1], [0, y - 0.5, 0], hex('#e0a800'));
    }
  });

  /* ═══════════ Leben: Falter, Voegel, Fische, Krabbler, Bewohner ═══════════
     Alles hier ist Staffage ohne Kollision: jeder Eintrag in L.life wird pro Bild
     bewegt und gezeichnet. Bewohner (npc) haengen zusaetzlich in L.talkers — deren
     pos ist dasselbe Array, darum wandert das Gespraechsfeld mit.
     L.anims sind bewegte Deko-Teile (Windrad, Wasserrad, Leuchtfeuer): fn(t) -> Matrix. */
  const Life = (() => {
    const M = {};
    const mesh = (k, fn) => M[k] || (M[k] = lowPoly(() => build(fn)));
    const BLACK = hex('#22222a');
    const SHAPES = {
      bflyBody: (g) => {
        box(g, I4, 0.05, 0.05, 0.2, BLACK);
        for (const s of [-1, 1]) box(g, M4.from(s * 0.03, 0.06, 0.1, 0, 0, s * 0.5), 0.02, 0.12, 0.02, BLACK);
      },
      bflyWing: (g) => {
        g.tri([0, 0, 0.02], [0.3, 0.03, 0.14], [0.26, 0.03, -0.04], C.white);
        g.tri([0, 0, -0.02], [0.26, 0.02, -0.04], [0.19, 0.02, -0.17], C.white);
      },
      birdBody: (g) => {
        sphere(g, I4, 0.11, 0.11, 0.28, 6, 4, C.white, true);
        g.tri([0, 0.02, 0.26], [0.06, -0.02, 0.42], [-0.06, -0.02, 0.42], hex('#f0a020'));
        g.tri([0, 0.16, -0.3], [0.16, 0.02, -0.16], [-0.16, 0.02, -0.16], C.white);
      },
      birdWing: (g) => { g.tri([0, 0, 0.14], [0.8, 0.02, -0.02], [0, 0, -0.16], C.white); },
      hen: (g) => {
        const W = hex('#f6f2e8'), R2 = hex('#e04a2a'), Y = hex('#f2b030');
        sphere(g, M4.from(0, 0.3, 0), 0.26, 0.26, 0.34, 8, 6, W, true);
        sphere(g, M4.from(0, 0.58, 0.14), 0.16, 0.17, 0.16, 8, 6, W, true);
        box(g, M4.from(0, 0.74, 0.1), 0.05, 0.12, 0.16, R2);
        g.tri([0, 0.58, 0.3], [0.06, 0.53, 0.42], [-0.06, 0.53, 0.42], Y);
        for (const s of [-1, 1]) sphere(g, M4.from(s * 0.08, 0.62, 0.24), 0.03, 0.03, 0.02, 5, 4, BLACK, true);
        g.tri([0, 0.42, -0.3], [0.1, 0.72, -0.5], [-0.1, 0.72, -0.5], W);
        for (const s of [-1, 1]) box(g, M4.from(s * 0.09, 0.08, 0.02), 0.04, 0.18, 0.04, Y);
      },
      crab: (g) => {
        const R2 = hex('#e0542a'), D = hex('#a8381a');
        sphere(g, M4.from(0, 0.16, 0), 0.34, 0.16, 0.24, 8, 5, R2, true);
        for (const s of [-1, 1]) {
          sphere(g, M4.from(s * 0.3, 0.22, 0.2, 0, 0, s * 0.4), 0.14, 0.1, 0.16, 6, 4, D, true);
          box(g, M4.from(s * 0.16, 0.3, 0.06), 0.05, 0.14, 0.05, D);
          sphere(g, M4.from(s * 0.16, 0.4, 0.06), 0.05, 0.05, 0.05, 5, 4, BLACK, true);
          for (let i = 0; i < 3; i++) box(g, M4.from(s * 0.3, 0.08, -0.06 - i * 0.12, 0, 0, s * 0.7), 0.24, 0.04, 0.04, D);
        }
      },
      beetle: (g) => {
        const B = hex('#3a6a4a'), D = hex('#22402c');
        sphere(g, M4.from(0, 0.14, 0), 0.2, 0.15, 0.3, 8, 5, B, true);
        sphere(g, M4.from(0, 0.12, 0.26), 0.12, 0.1, 0.1, 6, 4, D, true);
        box(g, M4.from(0, 0.2, -0.02), 0.02, 0.06, 0.3, D);
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) box(g, M4.from(s * 0.18, 0.05, 0.1 - i * 0.14, 0, 0, s * 0.8), 0.16, 0.03, 0.03, D);
      },
      frog: (g) => {
        const G2 = hex('#4aa83a'), D = hex('#2e7a28');
        sphere(g, M4.from(0, 0.14, 0), 0.22, 0.16, 0.28, 8, 5, G2, true);
        for (const s of [-1, 1]) {
          sphere(g, M4.from(s * 0.1, 0.28, 0.12), 0.08, 0.08, 0.08, 6, 4, G2, true);
          sphere(g, M4.from(s * 0.11, 0.31, 0.15), 0.04, 0.04, 0.03, 5, 4, BLACK, true);
          box(g, M4.from(s * 0.18, 0.06, -0.12, 0, 0, s * 0.5), 0.1, 0.05, 0.22, D);
        }
        box(g, M4.from(0, 0.04, 0.24), 0.16, 0.03, 0.08, D);
      },
      mouse: (g) => {
        const GY = hex('#9a94a0'), P = hex('#ffb0c8');
        sphere(g, M4.from(0, 0.12, 0), 0.14, 0.12, 0.22, 7, 5, GY, true);
        sphere(g, M4.from(0, 0.14, 0.18), 0.09, 0.09, 0.1, 6, 4, GY, true);
        for (const s of [-1, 1]) {
          sphere(g, M4.from(s * 0.08, 0.24, 0.14), 0.07, 0.07, 0.02, 6, 4, P, true);
          sphere(g, M4.from(s * 0.05, 0.15, 0.25), 0.02, 0.02, 0.02, 4, 3, BLACK, true);
        }
        for (let i = 0; i < 4; i++) box(g, M4.from(0, 0.08, -0.2 - i * 0.08, 0, 0, 0), 0.02, 0.02, 0.09, P);
      },
      drone: (g) => {
        const B = hex('#3a4050'), L2 = hex('#8ad8ff');
        box(g, M4.from(0, 0, 0), 0.34, 0.16, 0.34, B);
        sphere(g, M4.from(0, -0.08, 0.1), 0.08, 0.06, 0.08, 6, 4, L2, true);
        for (const s of [-1, 1]) for (const t of [-1, 1]) cyl(g, M4.from(s * 0.22, 0.02, t * 0.22), 0.05, 0.05, 0.06, 6, B);
      },
      rotor: (g) => { for (const s of [-1, 1]) for (const t of [-1, 1]) disc(g, M4.from(s * 0.22, 0.1, t * 0.22, 0, -Math.PI / 2), 0.18, 8, hex('#b8d8f0')); },
      note: (g) => {
        sphere(g, M4.from(-0.1, 0, 0, 0, 0, 0.4), 0.14, 0.1, 0.05, 8, 5, C.white, true);
        box(g, M4.from(0.02, 0.24, 0), 0.04, 0.48, 0.04, C.white);
        box(g, M4.from(0.12, 0.42, 0, 0, 0, -0.5), 0.2, 0.05, 0.04, C.white);
      },
      leaf: (g) => { g.tri([-0.12, 0, 0], [0.12, 0, 0.04], [0, 0, 0.22], C.white); g.tri([-0.12, 0, 0], [0, 0, 0.22], [0.12, 0, 0.04], C.white); },
    };
    const get = (k) => mesh(k, SHAPES[k]);
    const rr = (a, b) => a + Math.random() * (b - a);
    const inBox = (b) => [rr(b[0], b[2]), 0, rr(b[1], b[3])];
    // steckt der Punkt in einer Wand? (Tiere sollen nicht in Haeusern oder Felsen starten)
    const blocked = (L, x, z, y) => L.solids.some((b) => x > b.min[0] - 0.3 && x < b.max[0] + 0.3 && z > b.min[2] - 0.3 && z < b.max[2] + 0.3 && b.min[1] <= y + 1.2 && b.max[1] > y + 0.25);
    const freeSpot = (L, box, y) => {
      for (let i = 0; i < 40; i++) { const p = inBox(box); if (!blocked(L, p[0], p[2], y)) return p; }
      return inBox(box);
    };

    // ── Anlegen ──
    function add(L, c) { L.life.push(c); return c; }
    const API = (L) => ({
      // Falter/Bienen: schwirren in einem Kasten herum
      butterflies(x0, z0, x1, z1, n, o = {}) {
        for (let i = 0; i < n; i++) {
          const p = inBox([x0, z0, x1, z1]);
          const cols = o.cols || ['#ff7ac8', '#ffe14a', '#8ad8ff', '#ff9a4a', '#ffffff'];
          add(L, { k: 'bfly', pos: [p[0], (o.y ?? 0) + rr(0.6, 2.2), p[2]], tgt: null, box: [x0, z0, x1, z1],
            y: o.y ?? 0, yr: o.yr ?? 2.4, col: [...hex(cols[i % cols.length]), 1], s: o.s ?? 1, mesh: o.mesh || null,
            sp: rr(1.4, 2.6) * (o.speed ?? 1), ph: Math.random() * TAU, flap: rr(14, 20), face: 0 });
        }
      },
      // Voegel: ziehen ihre Kreise ueber der Welt
      birds(n, o = {}) {
        for (let i = 0; i < n; i++) {
          add(L, { k: 'bird', cx: (o.cx ?? 0) + rr(-20, 20), cz: (o.cz ?? 0) + rr(-20, 20), y: (o.y ?? 26) + rr(-4, 4),
            r: rr(12, 26) * (o.r ?? 1), a: Math.random() * TAU, sp: rr(0.18, 0.32) * (o.speed ?? 1) * (Math.random() < 0.5 ? -1 : 1),
            col: [...hex(o.col || '#f4f4f8'), 1], s: o.s ?? 1, pos: [0, 0, 0], face: 0 });
        }
      },
      // Fische: schwimmen unter der Oberflaeche, springen gelegentlich heraus
      fish(x0, z0, x1, z1, surf, n, o = {}) {
        for (let i = 0; i < n; i++) {
          const p = inBox([x0, z0, x1, z1]);
          add(L, { k: 'fish', pos: [p[0], surf - rr(0.5, 1.4), p[2]], tgt: null, box: [x0, z0, x1, z1], surf,
            depth: o.depth ?? 1.4, col: o.col ? [...hex(o.col), 0.75] : null, s: o.s ?? 1, sp: rr(1.6, 3.2) * (o.speed ?? 1),
            face: 0, jump: o.jump === false ? -1 : rr(4, 14), jy: 0, jv: 0 });
        }
      },
      // Krabbler am Boden: hen, crab, beetle, frog, mouse, bunny
      critters(kind, x0, z0, x1, z1, n, o = {}) {
        const made = [];
        for (let i = 0; i < n; i++) {
          const p = freeSpot(L, [x0, z0, x1, z1], o.y ?? 0);
          made.push(add(L, { k: 'walk', kind, pos: [p[0], o.y ?? 0, p[2]], tgt: null, box: [x0, z0, x1, z1], y0: o.y ?? 0,
            s: o.s ?? 1, sp: rr(0.8, 1.8) * (o.speed ?? 1), hop: o.hop ?? 0.06, ph: Math.random() * TAU,
            wait: rr(0, 2.5), face: Math.random() * TAU, col: o.col ? [...hex(o.col), 0.55] : null }));
        }
        return made;
      },
      // Leuchtpunkte: Gluehwuermchen, Sporen, Irrlichter
      glows(x0, z0, x1, z1, n, o = {}) {
        for (let i = 0; i < n; i++) {
          const p = inBox([x0, z0, x1, z1]);
          add(L, { k: 'glow', pos: [p[0], (o.y ?? 0) + rr(0.4, o.yr ?? 3), p[2]], box: [x0, z0, x1, z1], y: o.y ?? 0, yr: o.yr ?? 3,
            col: [...hex(o.col || '#ffe98a'), 1], s: (o.s ?? 1) * rr(0.7, 1.3), ph: Math.random() * TAU, sp: rr(0.3, 0.9) * (o.speed ?? 1),
            dir: [rr(-1, 1), rr(-0.4, 0.4), rr(-1, 1)] });
        }
      },
      // Rieseln: Blaetter, Schnee, Asche, Funken
      drifts(x0, z0, x1, z1, n, o = {}) {
        for (let i = 0; i < n; i++) {
          const p = inBox([x0, z0, x1, z1]);
          add(L, { k: 'fall', pos: [p[0], rr(o.y0 ?? 0, o.y1 ?? 14), p[2]], box: [x0, z0, x1, z1], y0: o.y0 ?? 0, y1: o.y1 ?? 14,
            col: [...hex(o.col || '#e8c060'), 1], s: (o.s ?? 1) * rr(0.7, 1.3), ph: Math.random() * TAU,
            sp: rr(0.6, 1.5) * (o.speed ?? 1), spin: rr(-2, 2), glow: !!o.glow, mesh: o.mesh || 'leaf' });
        }
      },
      // Rauch: steigt aus Schornsteinen, Lagerfeuern, Schloten
      smoke(x, y, z, n, o = {}) {
        for (let i = 0; i < n; i++) {
          add(L, { k: 'smoke', base: [x, y, z], pos: [x, y, z], t: i / n * (o.life ?? 3.4), life: o.life ?? 3.4,
            sp: o.speed ?? 1, s: o.s ?? 1, rise: o.rise ?? 3.4, col: [...hex(o.col || '#d8d4cc'), 1], dx: rr(-0.3, 0.3), dz: rr(-0.3, 0.3) });
        }
      },
      // Bewohner: wandert um sein Zuhause, bleibt beim Spieler stehen und winkt
      npc(x, z, speaker, text, o = {}) {
        const c = add(L, { k: 'npc', pos: [x, o.y ?? 0, z], home: [x, o.y ?? 0, z], r: o.r ?? 7, cat: o.cat ?? 0,
          tint: o.tint ? [...hex(o.tint), o.mix ?? 0.5] : null, s: o.s ?? 1, sp: rr(1.4, 2.0) * (o.speed ?? 1),
          tgt: null, wait: rr(0, 2), face: o.face ?? 0, walk: 0, t: Math.random() * 10 });
        L.talkers.push({ pos: c.pos, speaker, text });
        return c;
      },
    });

    // ── Bewegen ──
    function update(L, dt) {
      const px = pl.pos[0], pz = pl.pos[2];
      for (const c of L.life) {
        switch (c.k) {
          case 'bfly': {
            c.ph += dt * c.flap;
            if (!c.tgt || Math.hypot(c.tgt[0] - c.pos[0], c.tgt[2] - c.pos[2]) < 0.5) {
              c.tgt = [clamp(c.pos[0] + rr(-7, 7), c.box[0], c.box[2]), c.y + rr(0.4, c.yr), clamp(c.pos[2] + rr(-7, 7), c.box[1], c.box[3])];
            }
            const dx = c.tgt[0] - c.pos[0], dy = c.tgt[1] - c.pos[1], dz = c.tgt[2] - c.pos[2];
            const len = Math.max(0.001, Math.hypot(dx, dy, dz)), st = Math.min(1, c.sp * dt / len);
            c.pos[0] += dx * st; c.pos[1] += dy * st + Math.sin(c.ph * 0.5) * dt * 0.5; c.pos[2] += dz * st;
            c.face = Math.atan2(dx, dz);
            break;
          }
          case 'bird': {
            c.a += c.sp * dt;
            c.pos[0] = c.cx + Math.cos(c.a) * c.r;
            c.pos[2] = c.cz + Math.sin(c.a) * c.r;
            c.pos[1] = c.y + Math.sin(c.a * 1.7) * 1.6;
            c.face = -c.a + (c.sp > 0 ? Math.PI : 0);
            break;
          }
          case 'fish': {
            if (c.jy > 0 || c.jv > 0) {                      // Sprung ueber die Oberflaeche
              c.jv -= 22 * dt; c.jy += c.jv * dt;
              if (c.jy <= 0) { c.jy = 0; c.jv = 0; c.jump = rr(6, 16); }
            } else if (c.jump > 0) {
              c.jump -= dt;
              if (c.jump <= 0) { c.jv = rr(4.5, 6.5); c.jy = 0.01; }
            }
            if (!c.tgt || Math.hypot(c.tgt[0] - c.pos[0], c.tgt[2] - c.pos[2]) < 0.6) {
              c.tgt = [clamp(c.pos[0] + rr(-9, 9), c.box[0] + 0.8, c.box[2] - 0.8), 0, clamp(c.pos[2] + rr(-9, 9), c.box[1] + 0.8, c.box[3] - 0.8)];
            }
            const dx = c.tgt[0] - c.pos[0], dz = c.tgt[2] - c.pos[2], len = Math.max(0.001, Math.hypot(dx, dz));
            const st = Math.min(1, c.sp * dt / len);
            c.pos[0] += dx * st; c.pos[2] += dz * st;
            c.pos[1] = c.surf - 0.35 - (0.5 + 0.5 * Math.sin(clock * 0.8 + c.sp)) * (c.depth - 0.5);
            c.face = Math.atan2(dx, dz);
            break;
          }
          case 'walk': {
            c.ph += dt * 6;
            if (c.flee && !c.caught) {                        // scheu: laeuft vor dem Spieler weg
              const fx = c.pos[0] - px, fz = c.pos[2] - pz, fd = Math.hypot(fx, fz);
              c.rush = fd < 7 ? 2.6 : 1;
              if (fd < 7 && fd > 0.001) {
                c.tgt = [clamp(c.pos[0] + fx / fd * 9, c.box[0], c.box[2]), 0, clamp(c.pos[2] + fz / fd * 9, c.box[1], c.box[3])];
                c.wait = 0;
              }
            }
            if (c.wait > 0) { c.wait -= dt; break; }
            if (!c.tgt || Math.hypot(c.tgt[0] - c.pos[0], c.tgt[2] - c.pos[2]) < 0.4) {
              if (c.tgt && Math.random() < 0.6) { c.wait = rr(0.6, 3); c.tgt = null; break; }
              c.tgt = [clamp(c.pos[0] + rr(-6, 6), c.box[0], c.box[2]), 0, clamp(c.pos[2] + rr(-6, 6), c.box[1], c.box[3])];
            }
            const dx = c.tgt[0] - c.pos[0], dz = c.tgt[2] - c.pos[2], len = Math.max(0.001, Math.hypot(dx, dz));
            const st = Math.min(1, c.sp * (c.rush || 1) * dt / len);
            const nx = c.pos[0] + dx * st, nz = c.pos[2] + dz * st;
            const gy = groundAt(L, nx, nz, c.y0 + 2.5, 0.3);
            if (gy === -Infinity || Math.abs(gy - c.y0) > 1.2) { c.tgt = null; c.wait = rr(0.3, 1); break; }
            c.pos[0] = nx; c.pos[2] = nz; c.y0 = gy; c.pos[1] = gy;
            c.face = Math.atan2(dx, dz);
            break;
          }
          case 'glow': {
            c.ph += dt * 1.8;
            for (let i = 0; i < 3; i++) c.dir[i] += rr(-1, 1) * dt * 2;
            const dl = Math.max(0.001, Math.hypot(c.dir[0], c.dir[1], c.dir[2]));
            for (let i = 0; i < 3; i++) c.pos[i] += c.dir[i] / dl * c.sp * dt;
            c.pos[0] = clamp(c.pos[0], c.box[0], c.box[2]); c.pos[2] = clamp(c.pos[2], c.box[1], c.box[3]);
            c.pos[1] = clamp(c.pos[1], c.y + 0.3, c.y + c.yr);
            break;
          }
          case 'fall': {
            c.ph += dt * 2.2;
            c.pos[1] -= c.sp * dt;
            c.pos[0] += Math.sin(c.ph) * dt * 0.8;
            c.pos[2] += Math.cos(c.ph * 0.7) * dt * 0.6;
            if (c.pos[1] < c.y0) { c.pos[1] = c.y1; c.pos[0] = rr(c.box[0], c.box[2]); c.pos[2] = rr(c.box[1], c.box[3]); }
            break;
          }
          case 'smoke': {
            c.t += dt * c.sp;
            if (c.t > c.life) { c.t = 0; c.dx = rr(-0.3, 0.3); c.dz = rr(-0.3, 0.3); }
            const k2 = c.t / c.life;
            c.pos[0] = c.base[0] + c.dx * k2 * 3;
            c.pos[1] = c.base[1] + k2 * c.rise;
            c.pos[2] = c.base[2] + c.dz * k2 * 3;
            break;
          }
          case 'npc': {
            c.t += dt;
            const near2 = Math.hypot(px - c.pos[0], pz - c.pos[2]);
            if (near2 < 4 || Dialog.open) {                    // stehen bleiben und zum Spieler schauen
              c.walk = Math.max(0, c.walk - dt * 4);
              c.face += angDiff(c.face, Math.atan2(px - c.pos[0], pz - c.pos[2])) * Math.min(1, dt * 6);
              c.tgt = null; c.wait = rr(0.4, 1.6);
              break;
            }
            if (c.wait > 0) { c.wait -= dt; c.walk = Math.max(0, c.walk - dt * 4); break; }
            if (!c.tgt || Math.hypot(c.tgt[0] - c.pos[0], c.tgt[2] - c.pos[2]) < 0.5) {
              if (c.tgt && Math.random() < 0.5) { c.wait = rr(1, 4); c.tgt = null; break; }
              const a = Math.random() * TAU, rad = Math.random() * c.r;
              c.tgt = [c.home[0] + Math.cos(a) * rad, 0, c.home[2] + Math.sin(a) * rad];
            }
            const dx = c.tgt[0] - c.pos[0], dz = c.tgt[2] - c.pos[2], len = Math.max(0.001, Math.hypot(dx, dz));
            const st = Math.min(1, c.sp * dt / len);
            const nx = c.pos[0] + dx * st, nz = c.pos[2] + dz * st;
            const gy = groundAt(L, nx, nz, c.pos[1] + 2.5, 0.4);
            if (gy === -Infinity || Math.abs(gy - c.pos[1]) > 1.2) { c.tgt = null; c.wait = rr(0.4, 1.5); break; }
            c.pos[0] = nx; c.pos[2] = nz; c.pos[1] = gy;
            c.walk = Math.min(1, c.walk + dt * 4);
            c.face += angDiff(c.face, Math.atan2(dx, dz)) * Math.min(1, dt * 5);
            break;
          }
        }
      }
    }

    // ── Zeichnen ──
    const FAR = 110 * 110;
    const far = (c) => (c.pos[0] - cam.pos[0]) ** 2 + (c.pos[2] - cam.pos[2]) ** 2 > FAR;
    function drawCat(G, base, t, walk, wave, tint) {
      const RG = G.rig, FIG = { shine: 0.06, rim: 0.16, lit: 0.78, tint }, GLOW = { lit: 0, tint };
      const bob = Math.sin(t * 2.2) * 0.012 + Math.abs(Math.sin(t * 7)) * 0.03 * walk;
      const sw = Math.sin(t * 7) * 0.85 * walk;
      const part = (key, tx, ty, tz, rx2, rz2, o = FIG) => {
        const m = M4.mul(base, M4.from(tx, ty + bob, tz, 0, rx2, rz2));
        draw(G[key], m, o);
        if (G.glow[key]) draw(G.glow[key], m, GLOW);
        return m;
      };
      part('leg', -RG.legX, RG.legY - bob, 0, sw, 0);
      part('leg', RG.legX, RG.legY - bob, 0, -sw, 0);
      part('body', 0, RG.bodyY, 0, 0, 0);
      part('tail', 0, RG.tailY, RG.tailZ, -1.85, Math.sin(t * 2.3) * 0.3);
      part('arm', -RG.armX, RG.armY, 0, -sw * 0.7, -0.14);
      part('arm', RG.armX, RG.armY, 0, wave ? -2.7 : sw * 0.7, wave ? 0.5 + Math.sin(t * 7) * 0.35 : 0.14);
      const hOpt = { shine: 0.14, rim: 0.16, lit: 0.78, tint };
      const hm = part('head', 0, RG.headY, RG.headZ, 0, Math.sin(t * 1.3) * 0.05, hOpt);
      const bl = blinkAt(t, 2);
      if (G.lids && bl > 0.02) draw(G.lids, M4.mul(hm, M4.from(0, 0, 0, 0, 0, 0, 1, bl, 1)), hOpt);
    }
    function drawOpaque(L) {
      for (const c of L.life) {
        if (c.k === 'glow' || c.k === 'fall' || c.k === 'smoke') continue;
        if (c.k !== 'bird' && far(c)) continue;
        if (c.k === 'bfly') {
          const m = M4.from(c.pos[0], c.pos[1], c.pos[2], c.face, 0, 0, c.s);
          const f = Math.sin(c.ph) * 1.15;
          if (c.mesh) {
            draw(get(c.mesh), M4.mul(m, M4.from(0, Math.sin(c.ph * 0.3) * 0.1, 0)), { lit: c.mesh === 'note' ? 0 : 0.85, tint: c.col });
            if (c.mesh === 'drone') draw(get('rotor'), M4.mul(m, M4.from(0, 0, 0, clock * 22)), { lit: 0.6 });
            continue;
          }
          draw(get('bflyBody'), m, { lit: 0.7 });
          draw(get('bflyWing'), M4.mul(m, M4.from(0, 0.03, 0, 0, 0, f)), { tint: c.col, lit: 0.55 });
          draw(get('bflyWing'), M4.mul(m, M4.from(0, 0.03, 0, 0, 0, -f, -1, 1, 1)), { tint: c.col, lit: 0.55 });
        } else if (c.k === 'bird') {
          const m = M4.from(c.pos[0], c.pos[1], c.pos[2], c.face, 0, 0, c.s);
          const f = Math.sin(clock * 9 + c.a) * 0.7;
          draw(get('birdBody'), m, { tint: c.col, lit: 0.8 });
          draw(get('birdWing'), M4.mul(m, M4.from(0, 0.04, 0, 0, 0, f)), { tint: c.col, lit: 0.7 });
          draw(get('birdWing'), M4.mul(m, M4.from(0, 0.04, 0, 0, 0, -f, -1, 1, 1)), { tint: c.col, lit: 0.7 });
        } else if (c.k === 'fish') {
          const y = c.pos[1] + c.jy, out = c.jy > 0;
          draw(MESH.fish, M4.from(c.pos[0], y, c.pos[2], c.face, out ? clamp(c.jv * 0.12, -1, 1) : Math.sin(clock * 3) * 0.08, 0, c.s),
            { lit: out ? 0.9 : 0.7, tint: c.col, shine: out ? 0.4 : 0 });
        } else if (c.k === 'walk') {
          const hop = Math.abs(Math.sin(c.ph)) * (c.tgt ? c.hop * 4 : 0);
          const m = M4.from(c.pos[0], c.pos[1] + hop, c.pos[2], c.face, 0, Math.sin(c.ph) * 0.06 * (c.tgt ? 1 : 0), c.s);
          draw(c.kind === 'bunny' ? MESH.bunny : get(c.kind), m, { lit: 0.8, tint: c.col });
          if (c.kind === 'drone') draw(get('rotor'), M4.mul(m, M4.from(0, 0, 0, clock * 22)), { lit: 0.5, alpha: 1 });
        } else if (c.k === 'npc') {
          const base = M4.from(c.pos[0], c.pos[1], c.pos[2], c.face, 0, 0, c.s);
          drawCat(CATS[c.cat % CATS.length], base, c.t, c.walk, Dialog.open && Math.hypot(pl.pos[0] - c.pos[0], pl.pos[2] - c.pos[2]) < 4, c.tint);
        }
      }
    }
    function drawGlow(L) {
      for (const c of L.life) {
        if (c.k === 'glow') {
          if (far(c)) continue;
          const k = 0.55 + 0.45 * Math.sin(c.ph);
          draw(MESH.ball, M4.from(c.pos[0], c.pos[1], c.pos[2], 0, 0, 0, c.s * (0.1 + k * 0.05)), { tint: c.col, alpha: 0.5 + k * 0.45, lit: 0 });
          draw(MESH.ball, M4.from(c.pos[0], c.pos[1], c.pos[2], 0, 0, 0, c.s * (0.3 + k * 0.16)), { tint: c.col, alpha: 0.16 * k, lit: 0 });
        } else if (c.k === 'smoke') {
          if (far(c)) continue;
          const k = c.t / c.life;
          draw(MESH.ball, M4.from(c.pos[0], c.pos[1], c.pos[2], 0, 0, 0, c.s * (0.22 + k * 0.75)), { tint: c.col, alpha: 0.42 * (1 - k), lit: 0.4 });
        } else if (c.k === 'fall') {
          if (far(c)) continue;
          const m = M4.from(c.pos[0], c.pos[1], c.pos[2], c.ph * c.spin, Math.sin(c.ph) * 0.9, c.ph * 0.5, c.s);
          draw(get(c.mesh || 'leaf'), m, { tint: c.col, alpha: c.glow ? 0.75 : 1, lit: c.glow ? 0 : 0.75 });
        }
      }
    }
    return { API, update, drawOpaque, drawGlow, drawCat };
  })();

  function kit(L) {
    const g = L.geo, glow = L.glowGeo;
    const K = {
      g, glow,
      ground(x0, z0, x1, z1, a, b, y = 0, tile = 4) {
        L.solid(x0, y - 8, z0, x1, y, z1, 'ground');
        L.checker(x0, z0, x1, z1, y, tile, a, b);
      },
      bounds(x0, z0, x1, z1) {
        L.solid(x0 - 5, -80, z0 - 5, x0, 90, z1 + 5, 'bound'); L.solid(x1, -80, z0 - 5, x1 + 5, 90, z1 + 5, 'bound');
        L.solid(x0 - 5, -80, z0 - 5, x1 + 5, 90, z0, 'bound'); L.solid(x0 - 5, -80, z1, x1 + 5, 90, z1 + 5, 'bound');
      },
      hills(r, n, a, b, y = -2, s = 1, cx = 0, cz = 0) {
        for (let i = 0; i < n; i++) {
          const t = i / n * TAU, rr = r + (i % 3) * 9 * s;
          cyl(g, M4.from(cx + Math.cos(t) * rr, y, cz + Math.sin(t) * rr, t), (18 + (i % 4) * 5) * s, 0, (14 + (i % 5) * 5) * s, 7, i % 2 ? a : b);
        }
      },
      plat(cx, top, cz, sx, sz, col, th = 0.8, tag = 'plat') { return L.block(cx, top - th / 2, cz, sx, th, sz, col, tag); },
      coinLine(a, b, n) {
        for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1); L.coin('yellow', lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)); }
      },
      coinRing(cx, y, cz, r, n) { for (let i = 0; i < n; i++) { const t = i / n * TAU; L.coin('yellow', cx + Math.cos(t) * r, y, cz + Math.sin(t) * r); } },
      talker(x, y, z, speaker, text, sign = true) {
        if (sign) {
          cyl(g, M4.from(x, y, z), 0.12, 0.12, 1.5, 5, hex('#6b4214'));
          box(g, M4.from(x, y + 1.8, z, 0.3), 2, 1.2, 0.2, { top: hex('#6b4214'), side: hex('#9c6630') });
          L.solid(x - 0.2, y, z - 0.2, x + 0.2, y + 2.4, z + 0.2, 'sign');
        }
        L.talkers.push({ pos: [x, y, z], speaker, text });
      },
      // Ausgangstor zurueck in die Schlosshalle (reinlaufen oder B)
      exit(x, z, y = 0) {
        const fr = { top: hex('#a8a8b8'), side: hex('#8a8a9a') };
        L.block(x - 2.3, y + 3, z, 0.8, 6, 1.2, fr, 'gate');
        L.block(x + 2.3, y + 3, z, 0.8, 6, 1.2, fr, 'gate');
        L.block(x, y + 6.4, z, 5.4, 0.8, 1.2, fr, 'gate');
        box(g, M4.from(x, y + 2.9, z), 3.8, 5.8, 0.5, hex('#5a3414'));
        box(g, M4.from(x, y + 2.9, z + 0.27), 0.1, 5.4, 0.05, hex('#3a2008'));
        L.solid(x - 1.9, y, z - 0.3, x + 1.9, y + 5.8, z + 0.3, 'exitdoor');
        starGeo(glow, M4.from(x, y + 6.4, z + 0.66), 0.55, 0.12, hex('#ffd21f'));
        L.door = { pos: [x, y, z + 1.2], to: 'hall', label: 'Zurück ins Schloss', back: true };
      },
      // Rahmen, der auf die echte Glappa-Seite fuehrt (reinspringen)
      portal(x, y, z, idx, o = {}) {
        const pd = PAINTINGS[idx], s = o.scale || 1, cy = y + (o.lift ?? 3.35) * s;
        const pt = {
          name: o.name || 'Webseite: ' + PAGE_NAMES[idx], href: pd.href, level: null, n: idx + 1,
          x, y: cy, z: z + 0.3, axis: 'x', scale: s, wallTag: o.wallTag || 'portal', rip: null, noFrame: !!o.noFrame,
          model: M4.from(x, cy, z + 0.3, 0, 0, 0, s), frame: M4.from(x, cy, z + 0.25, 0, 0, 0, s),
          tex: o.tex || null,
        };
        if (!o.tex) ArtGen.request(pt, pd.bg, idx + 1, pd.name);
        if (!o.wallTag) {
          L.solid(x - 2.9 * s, y, z - 0.3, x + 2.9 * s, cy + 2.7 * s, z + 0.05, 'portal');
          box(g, M4.from(x, cy, z - 0.13), 6 * s, 5.4 * s, 0.3, hex('#4a2a0a'));
          const legH = cy - 2.7 * s - y;
          if (legH > 0.05) for (const sx of [-1, 1]) box(g, M4.from(x + sx * 2.2 * s, y + legH / 2, z - 0.1), 0.3, legH, 0.3, hex('#6b4214'));
          starGeo(glow, M4.from(x, cy + 3.05 * s, z + 0.1), 0.4 * s, 0.08, hex('#ffe680'));
        }
        L.paintings = L.paintings || [];
        L.paintings.push(pt);
        return pt;
      },
      tree(x, z, y = 0, h = 4, leaf = C.leaf, trunk = C.woodDark) {
        cyl(g, M4.from(x, y, z), 0.45, 0.35, h, 6, trunk);
        sphere(g, M4.from(x, y + h + 1.6, z), 2.4, 2.2, 2.4, 8, 6, (i, j) => ((i + j) % 3 ? leaf : shade(leaf, 1.25)));
        L.solid(x - 0.5, y, z - 0.5, x + 0.5, y + h, z + 0.5, 'tree');
      },
      pine(x, z, y = 0, h = 6, snow = false) {
        cyl(g, M4.from(x, y, z), 0.4, 0.3, h * 0.4, 6, C.woodDark);
        for (let k = 0; k < 3; k++) {
          const yy = y + h * 0.3 + k * h * 0.22, r = h * 0.42 - k * h * 0.11;
          cyl(g, M4.from(x, yy, z, k * 0.4), r, 0, h * 0.35, 8, hex('#2f6a3a'));
          if (snow) cyl(g, M4.from(x, yy + h * 0.2, z, k * 0.4), r * 0.45, 0, h * 0.15, 8, hex('#f4f8ff'));
        }
        L.solid(x - 0.5, y, z - 0.5, x + 0.5, y + h, z + 0.5, 'tree');
      },
      palm(x, z, y = 0, h = 7, trunkCol = hex('#8a6a3a'), leafCol = hex('#3f9a3a'), geo = g) {
        const lean = (t) => Math.sin(t * 1.4) * h * 0.12;
        for (let i = 0; i < 6; i++) {
          const t0 = i / 6, t1 = (i + 1) / 6;
          cyl(geo, M4.from(x + lean(t0), y + h * t0, z), 0.4 - t0 * 0.12, 0.4 - t1 * 0.12, h / 6 + 0.05, 7, i % 2 ? trunkCol : shade(trunkCol, 1.15));
        }
        const tx = x + lean(1);
        for (let k = 0; k < 7; k++) box(geo, M4.mul(M4.from(tx, y + h, z, k / 7 * TAU), M4.from(0, -0.5, 1.7, 0, 0.45)), 0.9, 0.1, 3.6, k % 2 ? leafCol : shade(leafCol, 0.8));
        L.solid(x - 0.45, y, z - 0.45, x + 0.45, y + h * 0.6, z + 0.45, 'palm');
      },
      item(mesh, pos, onTake, r = 1.7) { const it = { mesh, pos, onTake, r, taken: false }; L.items.push(it); return it; },
      // Sammel-Auftrag: n Fundstuecke einsammeln, Fortschritt als Einblendung, am Ende erscheint ein Stern.
      // o: { icon, label, speaker, done, starPos, r }
      quest(id, mesh, spots, o = {}) {
        let got = 0;
        const take = () => {
          got++;
          Snd.chime(got * 3);
          toast(`${o.icon || '⭐'} ${o.label || 'Fundstück'} ${got} / ${spots.length}`);
          if (got < spots.length) return;
          spawnStar(id, L, o.starPos || [0, 2, 0]);
          Dialog.show(o.speaker || L.name, o.done || ['Alles gefunden!', 'Ein Stern ist aufgetaucht.']);
        };
        spots.forEach((p) => K.item(mesh, p, take, o.r));
      },
      star(id, pos) { L.fixedStars.push({ id, pos }); },

      // ── Deko + Gelaende (fuer die grossen Welten) ──
      rnd: seeded(L.name.length * 7919 + 17),
      ramp(x0, z0, x1, z1, yLo, yHi, rise, col, o = {}) { return L.ramp(x0, z0, x1, z1, yLo, yHi, rise, col, o.tag || 'ramp', o); },
      // Findling: zwei, drei kantige Brocken; fest, damit man draufklettern kann
      rock(x, y, z, s = 1.5, col = hex('#8a8478'), solid = true) {
        const r = K.rnd;
        for (let k = 0; k < 3; k++) {
          const ox = (r() - 0.5) * s * 0.9, oz = (r() - 0.5) * s * 0.9, sc = s * (0.55 + r() * 0.5);
          sphere(g, M4.from(x + ox, y + sc * 0.35, z + oz, r() * TAU), sc, sc * (0.6 + r() * 0.3), sc * (0.8 + r() * 0.3), 6, 4,
            (i, j) => shade(col, 0.85 + ((i * 5 + j * 3 + k) % 4) * 0.07), false);
        }
        if (solid) L.solid(x - s * 0.75, y, z - s * 0.75, x + s * 0.75, y + s * 0.8, z + s * 0.75, 'rock');
      },
      // Blumenwiese: Stiel + vier Bluetenblaetter + Mitte, nur Deko
      flowers(x0, z0, x1, z1, n, y = 0, cols = ['#ff5fa2', '#ffe14a', '#ffffff', '#8a7bff', '#ff8a3a'], avoid = []) {
        const r = K.rnd, stem = hex('#2f8a2f');
        for (let i = 0; i < n; i++) {
          const x = lerp(x0, x1, r()), z = lerp(z0, z1, r()), h = 0.25 + r() * 0.3, c = hex(cols[Math.floor(r() * cols.length)]);
          if (avoid.some(([a, b, c2, d]) => x > a && x < c2 && z > b && z < d)) continue;
          box(g, M4.from(x, y + h / 2, z), 0.05, h, 0.05, stem);
          for (let k = 0; k < 4; k++) box(g, M4.from(x, y + h, z, k * Math.PI / 2 + r()), 0.12, 0.05, 0.3, c);
          box(g, M4.from(x, y + h + 0.03, z), 0.1, 0.06, 0.1, hex('#ffd21f'));
        }
      },
      // Grasbueschel: gekreuzte Halme, nur Deko
      tufts(x0, z0, x1, z1, n, y = 0, col = hex('#3f9a32'), avoid = []) {
        const r = K.rnd;
        for (let i = 0; i < n; i++) {
          const x = lerp(x0, x1, r()), z = lerp(z0, z1, r()), a = r() * TAU, h = 0.35 + r() * 0.35;
          if (avoid.some(([a2, b, c2, d]) => x > a2 && x < c2 && z > b && z < d)) continue;
          for (let k = 0; k < 3; k++) {
            const m = M4.from(x, y, z, a + k * 1.05, (r() - 0.5) * 0.4);
            g.tri(P(m, -0.12, 0, 0), P(m, 0.12, 0, 0), P(m, 0, h, 0), shade(col, 0.9 + r() * 0.25));
          }
        }
      },
      bush(x, z, y = 0, s = 1, col = hex('#2e8a3a')) {
        for (let k = 0; k < 3; k++) sphere(g, M4.from(x + (k - 1) * 0.7 * s, y + 0.6 * s, z + (k % 2) * 0.4 * s), 0.9 * s, 0.75 * s, 0.9 * s, 8, 5, (i, j) => ((i + j + k) % 3 ? col : shade(col, 1.2)));
        L.solid(x - 1.4 * s, y, z - 0.7 * s, x + 1.4 * s, y + 1.1 * s, z + 1.1 * s, 'bush');
      },
      // Holzzaun entlang einer Achse; 1,1 m hoch, man kann drueberspringen
      fence(x0, z0, x1, z1, y = 0, col = hex('#c89a5a')) {
        const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), len = alongX ? x1 - x0 : z1 - z0, n = Math.max(1, Math.round(Math.abs(len) / 2.4));
        for (let i = 0; i <= n; i++) {
          const x = alongX ? lerp(x0, x1, i / n) : x0, z = alongX ? z0 : lerp(z0, z1, i / n);
          box(g, M4.from(x, y + 0.6, z), 0.22, 1.2, 0.22, shade(col, 0.8));
        }
        for (const h of [0.45, 0.9]) {
          if (alongX) box(g, M4.from((x0 + x1) / 2, y + h, z0), Math.abs(len), 0.14, 0.08, col);
          else box(g, M4.from(x0, y + h, (z0 + z1) / 2), 0.08, 0.14, Math.abs(len), col);
        }
        if (alongX) L.solid(Math.min(x0, x1), y, z0 - 0.12, Math.max(x0, x1), y + 1.1, z0 + 0.12, 'fence');
        else L.solid(x0 - 0.12, y, Math.min(z0, z1), x0 + 0.12, y + 1.1, Math.max(z0, z1), 'fence');
      },
      lamp(x, z, y = 0, col = hex('#fff2a8'), post = hex('#2a2a32')) {
        cyl(g, M4.from(x, y, z), 0.14, 0.1, 3.4, 6, post);
        box(g, M4.from(x, y + 3.45, z), 0.6, 0.1, 0.6, post);
        box(glow, M4.from(x, y + 3.8, z), 0.42, 0.6, 0.42, col);
        cyl(g, M4.from(x, y + 4.1, z, Math.PI / 4), 0.45, 0, 0.35, 4, post);
        L.solid(x - 0.2, y, z - 0.2, x + 0.2, y + 3.4, z + 0.2, 'post');
      },
      // Holzbruecke (entlang x oder z) mit Seilgelaender
      bridge(x0, z0, x1, z1, y, col = hex('#a8763a')) {
        const alongX = (x1 - x0) >= (z1 - z0), len = alongX ? x1 - x0 : z1 - z0, w = alongX ? z1 - z0 : x1 - x0;
        L.solid(x0, y - 0.35, z0, x1, y, z1, 'bridge');
        const n = Math.max(2, Math.round(len / 0.8));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, c = shade(col, 0.88 + (i % 3) * 0.08);
          if (alongX) box(g, M4.from(lerp(x0, x1, t), y - 0.17, (z0 + z1) / 2), len / n - 0.08, 0.34, w, c);
          else box(g, M4.from((x0 + x1) / 2, y - 0.17, lerp(z0, z1, t)), w, 0.34, len / n - 0.08, c);
        }
        for (const s of [0, 1]) {
          const px = alongX ? null : (s ? x1 : x0), pz = alongX ? (s ? z1 : z0) : null;
          for (let i = 0; i <= Math.round(len / 3); i++) {
            const t = i / Math.round(len / 3);
            box(g, M4.from(alongX ? lerp(x0, x1, t) : px, y + 0.55, alongX ? pz : lerp(z0, z1, t)), 0.16, 1.1, 0.16, hex('#6b4214'));
          }
          if (alongX) box(g, M4.from((x0 + x1) / 2, y + 1.05, pz), len, 0.07, 0.07, hex('#d8c08a'));
          else box(g, M4.from(px, y + 1.05, (z0 + z1) / 2), 0.07, 0.07, len, hex('#d8c08a'));
        }
      },
      column(x, z, y, h, r = 1, col = hex('#e8dcc0'), tag = 'column') {
        cyl(g, M4.from(x, y, z), r, r, h, 10, col);
        box(g, M4.from(x, y + 0.25, z), r * 2.6, 0.5, r * 2.6, shade(col, 0.9));
        box(g, M4.from(x, y + h - 0.2, z), r * 2.5, 0.4, r * 2.5, shade(col, 1.05));
        return L.solid(x - r * 1.25, y, z - r * 1.25, x + r * 1.25, y + h, z + r * 1.25, tag);
      },
      // Treppe: n Stufen in Richtung dir ('x+', 'x-', 'z+', 'z-'), Start bei (x, z) auf Hoehe y0
      stairs(x, z, y0, n, rise, run, w, dir, col, tag = 'stair') {
        const ax = dir[0] === 'x', s = dir[1] === '+' ? 1 : -1;
        for (let i = 0; i < n; i++) {
          const top = y0 + rise * (i + 1), c = (i + 0.5) * run * s;
          L.block(ax ? x + c : x, (y0 + top) / 2, ax ? z : z + c, ax ? run : w, top - y0, ax ? w : run, col, tag);
        }
      },
      // Leuchtender Kristall (Doppelspitze)
      crystal(x, y, z, h = 2, col = hex('#9af0ff'), ry = 0) {
        cyl(glow, M4.from(x, y, z, ry), h * 0.22, h * 0.3, h * 0.35, 6, col);
        cyl(glow, M4.from(x, y + h * 0.35, z, ry), h * 0.3, 0, h * 0.65, 6, shade(col, 1.15));
      },
      // Spiralberg: gestapelte Stufen, an jeder Seite fuehrt eine Rampe zur naechsten (S -> O -> N -> W)
      mountain(cx, cz, tiers, o = {}) {
        const w = o.ramp || 5.5, col = o.col, rampCol = o.rampCol || col, sides = ['s', 'e', 'n', 'w'];
        const out = { ramps: [] };
        let prevTop = o.base || 0;
        tiers.forEach(([h, top], k) => {
          L.block(cx, (top + (o.base || 0)) / 2 - 0.5, cz, h * 2, top - (o.base || 0) + 1, h * 2, col, o.tag || 'mountain');
          // Grasnarbe als Kante oben + dunkle Gesteinsschichten an den Seiten
          if (o.trim !== false) box(g, M4.from(cx, top - 0.18, cz), h * 2 + 0.3, 0.4, h * 2 + 0.3, { top: col.top, side: shade(col.top, 0.85) });
          const sideC = shade(col.side || col, 0.82);
          for (let y = top - 2.2; y > prevTop + 0.6; y -= 2.4) box(g, M4.from(cx, y, cz), h * 2 + 0.06, 0.35, h * 2 + 0.06, sideC);
          const side = sides[(k + (o.start || 0)) % 4], m = o.margin ?? 3;
          let r;
          if (side === 's') r = L.ramp(cx - h + m, cz + h, cx + h, cz + h + w, prevTop, top, 'x+', rampCol, 'ramp');
          else if (side === 'e') r = L.ramp(cx + h, cz - h, cx + h + w, cz + h - m, prevTop, top, 'z-', rampCol, 'ramp');
          else if (side === 'n') r = L.ramp(cx - h, cz - h - w, cx + h - m, cz - h, prevTop, top, 'x-', rampCol, 'ramp');
          else r = L.ramp(cx - h - w, cz - h + m, cx - h, cz + h, prevTop, top, 'z+', rampCol, 'ramp');
          // Bruestung am oberen Ende: wer mit Schwung ankommt, faellt nicht ueber die Ecke
          const cH = top + 1.9 - prevTop, cY = (prevTop - 1 + top + 0.9) / 2, CURB = o.curbCol || { top: hex('#b8b0a0'), side: (rampCol.side || rampCol) };
          if (side === 's') L.block(cx + h + 0.3, cY, cz + h + w / 2, 0.6, cH, w, CURB, 'curb');
          else if (side === 'e') L.block(cx + h + w / 2, cY, cz - h - 0.3, w, cH, 0.6, CURB, 'curb');
          else if (side === 'n') L.block(cx - h - 0.3, cY, cz - h - w / 2, 0.6, cH, w, CURB, 'curb');
          else L.block(cx - h - w / 2, cY, cz + h + 0.3, w, cH, 0.6, CURB, 'curb');
          out.ramps.push({ side, b: r, h, top, from: prevTop });
          prevTop = top;
        });
        return out;
      },
      // Wasserfall (Deko) + Becken unten
      fall(x, z, top, bot, w, axis = 'x', o = {}) { L.falls.push({ x, z, top, bot, w, axis, speed: o.speed || 10, col: o.col }); },
      // Streut Deko ueber den Boden: fn(x, y, z, i, rnd) baut ein Teil. Gesetzt wird nur dort,
      // wo Boden auf der gewuenschten Hoehe liegt und nichts direkt darueber steht — so landet
      // nichts in Haeusern, auf Wegen ueber dem Kopf oder mitten in der Hindernisstrecke.
      scatter(x0, z0, x1, z1, n, fn, o = {}) {
        const r = K.rnd, avoid = o.avoid || [], yWant = o.y ?? 0, tol = o.yTol ?? 0.6, clear = o.clear ?? 5;
        const minD = o.minDist ?? 4, mine = [];
        let placed = 0, tries = 0;
        while (placed < n && tries < n * 40) {
          tries++;
          const x = lerp(x0, x1, r()), z = lerp(z0, z1, r());
          if (avoid.some(([ax0, az0, ax1, az1]) => x > ax0 && x < ax1 && z > az0 && z < az1)) continue;
          if (L.scatterPts.some(([qx, qz]) => (qx - x) ** 2 + (qz - z) ** 2 < minD * minD)) continue;
          let top = -Infinity, blocked = false;
          for (const b of L.solids) {
            if (x <= b.min[0] || x >= b.max[0] || z <= b.min[2] || z >= b.max[2]) continue;
            if (b.max[1] > top && b.max[1] < yWant + tol) top = b.max[1];
          }
          if (top === -Infinity || Math.abs(top - yWant) > tol) continue;
          for (const b of L.solids) {
            if (x <= b.min[0] - 1.2 || x >= b.max[0] + 1.2 || z <= b.min[2] - 1.2 || z >= b.max[2] + 1.2) continue;
            if (b.min[1] > top + 0.3 && b.min[1] < top + clear) { blocked = true; break; }
          }
          if (blocked) continue;
          fn(x, top, z, placed, r);
          L.scatterPts.push([x, z]);
          mine.push([x, z]);
          placed++;
        }
        return placed;
      },
      // Tiere und Bewohner
      life: Life.API(L),
      // bewegtes Deko-Teil: fn(t) liefert die Matrix (Windrad, Wasserrad, Leuchtfeuer ...)
      anim(mesh, fn, o = {}) { L.anims.push({ mesh, fn, o }); },
    };
    return K;
  }
  // Wiederholbarer Zufall (jede Welt sieht bei jedem Besuch gleich aus)
  function seeded(s) {
    let seed = (s % 2147483646) + 1;
    return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  }

  /* ─────────── Welt 1: Terminal-Tal ───────────
     Riesiger Retro-Rechner auf gruener Wiese, dahinter der Serverberg (Idee: Wiese mit
     Spiralberg, eigenes Layout). Gimmicks: die Riesentastatur — wer mit den Fuessen
     G-L-A-P-P-A tippt, bekommt einen Stern; ein Rampenweg um den Berg, auf dem Datenkugeln
     herunterrollen; eine Sprungfeder zur schwebenden Datenwolke; CD-Stufen aufs Monitordach.
     Geheim: ein Heckengarten, in den man nur hineinkrabbeln kann. */
  function buildTerminal() {
    const L = new Level({ name: 'Terminal-Tal', spawn: [0, 0, 46], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#cdeeff'), fogNear: 120, fogFar: 330, light: v3.norm([-0.4, -0.85, -0.3]), sky: 'day' });
    const K = kit(L), g = K.g;
    const GA = hex('#58c43e'), GB = hex('#46a932'), EARTH = hex('#8a6a42');
    // Wiese; der Teich im Westen ist ein Loch im Boden
    [[-95, -105, 95, -30], [-95, 5, 95, 62], [-95, -30, -85, 5], [-55, -30, 95, 5]].forEach(([x0, z0, x1, z1]) => K.ground(x0, z0, x1, z1, GA, GB));
    K.bounds(-92, -102, 92, 60);
    K.hills(140, 24, hex('#5cbf4e'), hex('#4aa83e'), -2, 1.9);
    g.quad([-400, -2.05, 400], [400, -2.05, 400], [400, -2.05, -400], [-400, -2.05, -400], GB);

    const BEIGE = { top: hex('#ece4cc'), side: hex('#d8cfb4') };
    L.block(0, 5, -24, 14, 10, 8, BEIGE, 'pc');
    box(g, M4.from(-3.5, 6.2, -19.94), 4, 0.9, 0.1, hex('#3a3a3a'));
    box(g, M4.from(-3.5, 3.6, -19.94), 4, 1.4, 0.1, hex('#bdb49a'));
    for (let i = 0; i < 6; i++) box(g, M4.from(2.6 + i * 0.6, 2.4, -19.94), 0.22, 2.6, 0.08, hex('#bdb49a'));
    box(K.glow, M4.from(4.6, 7.8, -19.93), 0.6, 0.6, 0.08, hex('#3fff5a'));
    box(K.glow, M4.from(3.6, 7.8, -19.93), 0.6, 0.3, 0.08, hex('#ffb13f'));
    for (let i = 0; i < 7; i++) box(g, M4.from(-6.96, 3 + i * 0.7, -24), 0.1, 0.3, 5, hex('#bdb49a'));   // Lueftungsschlitze
    L.block(0, 14.5, -26.5, 13, 9, 2, BEIGE, 'monitor');
    box(g, M4.from(0, 14.64, -25.47), 9.4, 8.4, 0.02, hex('#2a2a2a'));
    box(g, M4.from(0, 10.2, -24.2), 5, 0.4, 3, BEIGE.side);                                            // Monitorfuss
    const screenTex = labelTexture((c, w, h) => {
      c.fillStyle = '#031a08'; c.fillRect(0, 0, w, h);
      for (let y = 0; y < 384; y += 4) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, y, w, 2); }
      c.fillStyle = '#3fff6a'; c.font = 'bold 30px Courier New, monospace';
      ['GLAPPA-DOS 6.4', '', 'C:\\> dir', 'TERMINAL.EXE  1337 KB', '', 'C:\\> spring rein_'].forEach((l, i) => c.fillText(l, 26, 58 + i * 50));
      c.fillStyle = '#4a2a0a'; c.fillRect(0, 384, w, 64);
      c.fillStyle = '#ffe9a8'; c.font = 'italic 900 30px Arial Black, sans-serif'; c.fillText('→ Terminal', 30, 427);
    }, 512, 448);
    K.portal(0, 10, -25.75, 0, { scale: 1.6, lift: 2.9, tex: screenTex, wallTag: 'monitor', noFrame: true });
    // Kabel vom Rechner zur Riesenmaus
    for (let i = 0; i < 11; i++) box(g, M4.from(-8 - i * 1.5, 0.25, -22 + i * 1.12, Math.atan2(1.12, 1.5)), 1.9, 0.5, 0.5, hex('#2a2a2a'));
    // Disketten-Treppe aufs Gehaeuse
    const floppy = (x, top, z, col) => {
      K.plat(x, top, z, 4, 4, { top: col, side: shade(col, 0.7) }, 0.5, 'floppy');
      box(g, M4.from(x - 0.4, top + 0.02, z - 0.9), 2, 0.04, 1.6, hex('#c8ccd4'));
      box(g, M4.from(x, top + 0.02, z + 1), 3, 0.04, 1.4, hex('#f4f0e0'));
    };
    floppy(13, 2.6, -13, hex('#2a4ab0')); floppy(14, 5.2, -18.5, hex('#b02a3a')); floppy(10, 7.8, -23, hex('#2a8a4a'));
    K.coinLine([13, 3.7, -13], [10, 8.9, -23], 3);
    // CD-Stufen hinter dem Rechner hinauf aufs Monitordach (19 m)
    const cd = (x, top, z) => {
      cyl(g, M4.from(x, top - 0.16, z), 1.7, 1.7, 0.16, 20, hex('#c8ccd8'), hex('#eef2ff'));
      disc(g, M4.from(x, top + 0.012, z, 0, -Math.PI / 2), 1.62, 16, [hex('#ffb0e0'), hex('#b0e0ff'), hex('#e0ffb0'), hex('#fff0b0')]);
      cyl(g, M4.from(x, top - 0.15, z), 0.34, 0.34, 0.18, 10, hex('#3a3a44'));
      L.solid(x - 1.3, top - 0.16, z - 1.3, x + 1.3, top, z + 1.3, 'cd');
    };
    cd(11.5, 10.2, -27.5); cd(8, 12.6, -31.5); cd(3, 15, -32); cd(-2, 17.2, -31);
    K.coinLine([-5, 20.1, -26.5], [5, 20.1, -26.5], 5);

    // Riesentastatur
    const ROWS = ['QWERTZUIOP', 'ASDFGHJKL', 'YXCVBNM'];
    const atlas = labelTexture((c, w, h) => {
      c.fillStyle = '#e8e6de'; c.fillRect(0, 0, w, h);
      c.font = '900 52px Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < 26; i++) {
        const cx = (i % 6) * 85 + 42, cy2 = Math.floor(i / 6) * 85 + 42;
        c.strokeStyle = '#bdbab0'; c.lineWidth = 4; c.strokeRect(cx - 38, cy2 - 38, 76, 76);
        c.fillStyle = '#222'; c.fillText(String.fromCharCode(65 + i), cx, cy2 + 3);
      }
    }, 512, 512);
    L.block(0, 0.1, 7, 32, 0.2, 11, { top: hex('#4a4a52'), side: hex('#3a3a40') }, 'kbd');
    // Leertaste + Funktionstasten als Deko (nicht Teil des Kennworts)
    box(g, M4.from(0, 0.4, 12.2, 0), 13, 0.4, 1.4, { top: hex('#dddad0'), side: hex('#b8b5aa') });
    for (let i = 0; i < 8; i++) box(g, M4.from(-12 + i * 3.4, 0.3, 1.9), 2.6, 0.2, 0.8, { top: hex('#c8c4b8'), side: hex('#a8a498') });
    const capGeo = new Geo(), keyBoxes = {};
    ROWS.forEach((row, r) => {
      [...row].forEach((ch, i) => {
        const x = -12.15 + r * 1.35 + i * 2.7, z = 3.5 + r * 3;
        keyBoxes[ch] = L.block(x, 0.4, z, 2.4, 0.4, 2.4, { top: hex('#dddad0'), side: hex('#b8b5aa') }, 'key:' + ch);
        const li = ch.charCodeAt(0) - 65, u0 = ((li % 6) * 85 + 4) / 512, v0 = (Math.floor(li / 6) * 85 + 4) / 512, u1 = u0 + 77 / 512, v1 = v0 + 77 / 512;
        capGeo.quad([x - 1.1, 0.605, z + 1.1], [x + 1.1, 0.605, z + 1.1], [x + 1.1, 0.605, z - 1.1], [x - 1.1, 0.605, z - 1.1], C.white, [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]);
      });
    });
    const capMesh = upload(capGeo);
    const SEQ = 'GLAPPA';
    let seqIdx = 0, lastKey = null;
    const flash = {};
    L.update = () => {
      const gb = pl.grounded ? pl.groundBox : null;
      const onKey = gb && (gb.tag || '').startsWith('key:') ? gb : null;
      if (onKey && (onKey !== lastKey || pl.landT === time)) {
        const ch = onKey.tag.slice(4);
        flash[ch] = clock;
        if (ch === SEQ[seqIdx]) {
          seqIdx++;
          Snd.chime(seqIdx * 2);
          toast('⌨  ' + SEQ.slice(0, seqIdx) + '_'.repeat(SEQ.length - seqIdx));
          if (seqIdx === SEQ.length) {
            seqIdx = 0;
            spawnStar('terminal', L, [0, 3.5, 8]);
            Dialog.show('Terminal', ['KENNWORT AKZEPTIERT.', 'Über der Tastatur wurde ein Stern ausgegeben.']);
          }
        } else if (seqIdx > 0) {
          seqIdx = ch === SEQ[0] ? 1 : 0;
          Snd.deny(); toast('⌨  Tippfehler – nochmal von vorn');
        }
      }
      lastKey = onKey;
    };
    L.drawSolid = () => draw(capMesh, I4, { tex: atlas });
    L.drawAlpha = () => {
      for (const ch in flash) {
        const k = 1 - (clock - flash[ch]) / 0.6;
        if (k <= 0) continue;
        const b = keyBoxes[ch];
        draw(MESH.cube, M4.from((b.min[0] + b.max[0]) / 2, 0.63, (b.min[2] + b.max[2]) / 2, 0, 0, 0, 2.4, 0.05, 2.4), { tint: [0.3, 1, 0.4, 1], alpha: 0.55 * k, lit: 0 });
      }
    };

    // Riesen-Computermaus (man kann draufklettern)
    const MOUSE = hex('#e8e6de');
    sphere(g, M4.from(-24, 0, -6), 3, 2.3, 4.4, 16, 8, MOUSE, true, 0, Math.PI / 2);
    box(g, M4.from(-24, 2.02, -8.4, 0, -0.42), 0.14, 0.3, 2.4, hex('#9a988e'));
    box(g, M4.from(-24, 2.16, -7.9), 0.5, 0.25, 0.9, hex('#6a6860'));
    L.solid(-26.7, 0, -10, -21.3, 1.5, -2, 'mouse');
    L.solid(-25.8, 1.5, -9, -22.2, 2.2, -3.2, 'mouse');
    L.coin('yellow', -24, 3.3, -6);

    // Geheim: Heckengarten, Eingang nur krabbelnd (1,1 m hoch)
    const HEDGE = { top: hex('#3f8f35'), side: hex('#2f7a2a') };
    L.block(-24, 1.5, -30, 14, 3, 1, HEDGE, 'hedge'); L.block(-24, 1.5, -18, 14, 3, 1, HEDGE, 'hedge');
    L.block(-31, 1.5, -24, 1, 3, 13, HEDGE, 'hedge');
    L.block(-17, 1.5, -27.5, 1, 3, 6, HEDGE, 'hedge'); L.block(-17, 1.5, -20.25, 1, 3, 3.5, HEDGE, 'hedge');
    L.block(-17, 2.075, -23.25, 1, 1.85, 2.5, HEDGE, 'hedge');   // ueber dem Krabbelloch
    K.coinRing(-24, 1.1, -24, 3, 8);
    K.tree(-24, -24, 0, 2.5, hex('#e0609a'));
    K.flowers(-30, -29, -18, -19, 40, 0, ['#ff5fa2', '#ffffff', '#ffe14a']);

    // ── Serverberg: Stufenberg mit Rampenweg (S -> O -> N -> W), Gipfel auf 23 m ──
    const MT = { top: hex('#5fbf48'), side: EARTH }, RP = { top: hex('#c8a878'), side: EARTH };
    const MX = 52, MZ = -62;
    K.mountain(MX, MZ, [[25, 6], [18.5, 12], [12, 18], [6.5, 23]], { col: MT, rampCol: RP, ramp: 5.5 });
    // Felsen und Grasbueschel auf den Stufen
    [[31, 6, -80], [74, 6, -84], [36, 12, -76], [66, 12, -48], [44, 18, -52], [61, 18, -70], [30, 0, -26], [80, 0, -40]].forEach(([x, y, z]) => K.rock(x, y, z, 1.6, hex('#8a8478')));
    K.tufts(28, -86, 76, -38, 90, 6); K.tufts(34, -80, 70, -44, 60, 12); K.tufts(40, -74, 64, -50, 40, 18);
    K.pine(30, -40, 6, 6); K.pine(75, -85, 6, 7); K.pine(36, -46, 12, 5); K.pine(68, -45, 12, 5);
    K.star('serverberg', [MX, 25.3, MZ]);
    L.block(49, 24.6, -66.4, 2.2, 3.2, 1.4, { top: hex('#2a2a32'), side: hex('#3a3a44') }, 'rack');
    for (let i = 0; i < 8; i++) box(K.glow, M4.from(48.35 + (i % 4) * 0.42, 23.8 + Math.floor(i / 4) * 1.2, -65.66), 0.2, 0.14, 0.05, i % 3 ? hex('#3fff5a') : hex('#ffb13f'));
    cyl(g, M4.from(56, 23, -66), 0.1, 0.1, 6, 5, hex('#dddddd'));
    g.tri([56, 29, -66], [56, 27.3, -66], [59.2, 28.15, -66], hex('#3fff5a'));
    g.tri([56, 27.3, -66], [56, 29, -66], [59.2, 28.15, -66], hex('#3fff5a'));
    // Muenzen entlang des Weges
    K.coinLine([34, 1.4, -34.25], [72, 6.3, -34.25], 6);
    K.coinLine([73.25, 7.5, -50], [73.25, 12.4, -77], 4);
    K.coinLine([60, 13.2, -76.75], [42, 18.6, -76.75], 4);
    K.coinLine([42.75, 19.8, -64], [42.75, 23.3, -57], 3);
    K.talker(22, 0, -28, 'Schild', [
      '★ SERVERBERG ★\nGanz oben summt ein Server – und daneben glitzert ein Stern.',
      'Der Weg führt außen herum nach oben. Achtung: Von oben rollen DATENKUGELN herunter! Ausweichen oder drüberspringen.',
    ]);

    // ── Datenwolke: schwebende Insel, nur ueber die Sprungfeder erreichbar ──
    L.block(-60, 19, -72, 12, 2, 12, { top: GA, side: EARTH }, 'island');
    cyl(g, M4.from(-60, 18, -72, 0, Math.PI), 6.6, 0, 9, 8, hex('#7a5a38'));
    for (const [dx, dy, dz, s] of [[-7, 18.5, -3, 1.6], [6.5, 19, 2, 1.3], [2, 17.2, -7, 1.8], [-4, 17, 6.5, 1.4]]) sphere(g, M4.from(-60 + dx, dy, -72 + dz), 2.2 * s, 0.9 * s, 1.6 * s, 10, 5, C.white, true);
    K.tree(-63, -75, 20, 3, hex('#4cc25a'));
    K.coinRing(-60, 21.1, -72, 3.2, 8);
    K.item(MESH.chest, [-57, 20, -68], (it) => {
      Snd.starAppear(); addCoins(10);
      burst([it.pos[0], it.pos[1] + 1, it.pos[2]], 16, { spread: 3, up: 4, life: .8, size: .2, cols: [[1, .85, .2], [1, 1, 1]], grav: 2 });
      toast('💾 Datenwolke: +10 Münzen!');
    }, 2);
    // Sprungfeder
    cyl(g, M4.from(-60, 0, -55), 2, 2, 0.12, 14, hex('#6a6a72'));
    for (let k = 0; k < 3; k++) cyl(g, M4.from(-60, 0.08 + k * 0.1, -55), 1.2 - k * 0.1, 1.2 - k * 0.1, 0.06, 12, hex('#c8c8d0'));
    cyl(g, M4.from(-60, 0.38, -55), 1.8, 1.8, 0.14, 14, hex('#d8342b'), hex('#ff5a4a'));
    const sp = L.solid(-61.7, 0, -56.7, -58.3, 0.52, -53.3, 'bouncy'); sp.bounce = 115;
    K.talker(-54, 0, -44, 'Schild', ['SPRUNGFEDER: Anlauf nehmen, draufspringen … und ab zur Datenwolke!']);

    // ── Teich mit Holzsteg ──
    L.solid(-85, -8, -30, -55, -3.2, 5, 'pondbed');
    L.checker(-85, -30, -55, 5, -3.2, 3, hex('#3a6a8a'), hex('#335f7c'));
    for (const [a, b] of [[[-85, -30], [-55, -30]], [[-55, 5], [-85, 5]], [[-85, 5], [-85, -30]], [[-55, -30], [-55, 5]]]) {
      g.quad([a[0], -3.2, a[1]], [b[0], -3.2, b[1]], [b[0], 0, b[1]], [a[0], 0, a[1]], hex('#7a5028'));
    }
    L.waters.push({ x0: -85, x1: -55, z0: -30, z1: 5, y: -0.4 });
    K.bridge(-72, -30, -68, 5, 0.5);
    for (const [x, z] of [[-80, -20], [-62, -4], [-78, 0], [-60, -24], [-66, -12]]) {
      disc(g, M4.from(x, -0.36, z, 0, -Math.PI / 2), 1.2, 10, hex('#3f9a3a'));
      sphere(g, M4.from(x + 0.4, -0.2, z - 0.3), 0.2, 0.15, 0.2, 6, 4, hex('#ffb0d8'));
    }
    K.tufts(-88, -33, -82, 8, 30, 0, hex('#5a8a3a')); K.tufts(-58, -33, -52, 8, 30, 0, hex('#5a8a3a'));
    K.coinLine([-70, 1.6, -26], [-70, 1.6, 1], 6);
    K.coinRing(-78, -1.8, -14, 2.5, 6);

    // ── Pixel-Weide: eingezaeunt, Tor im Westen ──
    K.fence(30, 12, 70, 12); K.fence(30, 46, 70, 46); K.fence(70, 12, 70, 46); K.fence(30, 12, 30, 24); K.fence(30, 34, 30, 46);
    for (const [x, z] of [[40, 38], [60, 18], [55, 40]]) {
      cyl(g, M4.from(x, 1.1, z - 1.2, 0, Math.PI / 2), 1.1, 1.1, 2.4, 12, hex('#e8c860'), hex('#d8b048'));
      L.solid(x - 1.1, 0, z - 1.2, x + 1.1, 2.2, z + 1.2, 'bale');
    }
    K.flowers(31, 13, 69, 45, 120);
    K.coinRing(50, 1.1, 29, 5, 10);

    // ── Baeume, Blumen, Felsen ──
    [[-28, 10], [28, -6], [24, 30, 5], [-40, 45], [-60, 30], [-80, 50], [80, 55], [85, 5], [-85, -60], [-40, -90], [0, -95], [15, -80, 5], [-20, -60]].forEach(([x, z, h]) => K.tree(x, z, 0, h || 4));
    [[-45, -40], [-35, -70], [10, -50], [-88, -90], [88, -95], [-70, 55]].forEach(([x, z]) => K.pine(x, z, 0, 7));
    [[-50, 20], [10, 35], [-10, -45], [35, -8], [-35, 55], [80, -10], [-88, 30]].forEach(([x, z]) => K.bush(x, z));
    [[-45, 5], [18, -40], [-12, 55], [85, 30], [-30, -80]].forEach(([x, z]) => K.rock(x, 0, z, 1.8));
    K.flowers(-50, 15, -10, 55, 110); K.flowers(18, -15, 28, 18, 40); K.flowers(-90, -100, -30, -40, 90);
    K.tufts(-90, -100, 90, 58, 420, 0, undefined, [[-17, 0, 17, 14], [-86, -31, -54, 6], [-8, -29, 8, -19], [26, -88, 78, -31]]);

    K.coinRing(20, 1.1, 20, 4, 8);
    K.coinLine([-6, 1.1, 30], [6, 1.1, 30], 5);
    K.talker(5, 0, 50, 'Schild', [
      '★ TERMINAL-TAL ★\nWillkommen im Inneren des Internets.',
      'Das Kennwort für den ersten Stern ist der Name dieser Webseite. Tipp es auf der Riesentastatur – mit den Füßen! Tipp: von Taste zu Taste springen.',
      'Hinter dem Rechner ragt der SERVERBERG auf. Oben wartet ein zweiter Stern.',
      'Wer in den Bildschirm springt, landet im echten Terminal. Hinter dem Rechner führen CDs aufs Monitordach.',
      'Manche Wege sind nur was für Leute, die sich klein machen.',
    ]);
    K.exit(0, 57);
    // Computer-Plagen: Software-Bugs, Viren, Wuermer, Pop-ups und Spam-Mails
    L.enemies.push(makeBug(-12, 26), makeBug(20, 8), makeBug(-20, -4), makeGrummel(42, 22), makeBug(58, 36),
      makeGrummel(45, -40), makeBug(-40, 30), makeGrummel(62, -84));
    L.enemies.push(makeWorm(26, 38), makeWorm(-36, 16, undefined, 9));
    L.enemies.push(makePopup(12, 20, undefined, 0), makePopup(-26, 4, undefined, 1), makePopup(52, 8, undefined, 3));
    L.enemies.push(makeBomb(18, -46), makeBomb(10, -62), makeBomb(60, -52), makeBomb(-40, -60));
    L.enemies.push(
      makeRoller([[76, -34.25], [30, -34.25], [14, -34.25]], { speed: 8, delay: 0.5 }),
      makeRoller([[76, -34.25], [30, -34.25], [14, -34.25]], { speed: 8, delay: 5 }),
      makeRoller([[73.25, -80], [73.25, -41]], { speed: 7, delay: 2.5, r: 1.2 }));
    // Viren (teilen sich beim Treffer), Stachis, Spam-Mails und Wackel-Pixel
    L.enemies.push(...makeVirus(-45, -15, 5), ...makeVirus(-70, 40, 5), ...makeVirus(40, 52, 5), ...makeVirus(8, 32, 5));
    L.enemies.push(makeSpiky(15, -70, 5, '#7a3ac8'), makeSpiky(4, -44, 5, '#7a3ac8'));
    L.enemies.push(makeBat(40, 15, -48, '#3a3a6a'), makeSpam(64, 21, -72), makeBat(52, 28.5, -58, '#3a3a6a'), makeSpam(-30, 7, 22), makeSpam(30, 8, -14));
    L.enemies.push(makeHopper(50, 30, 5, '#4cd964'), makeHopper(38, 18, 5, '#ffd24a'), makeHopper(-48, 10, 5, '#4cd964'), makeHopper(-62, -70, 25, '#ff6ab0'), makeHopper(-15, 40, 5, '#ffd24a'));
    // ── Leben ──
    K.life.butterflies(-70, -60, 70, 40, 5, { mesh: 'drone', y: 3, yr: 6, cols: ['#8ad8ff'], speed: 0.8 });
    K.life.glows(-80, -60, 80, 50, 24, { y: 0.5, yr: 5, col: '#7affc8', s: 0.8, speed: 0.6 });
    K.life.fish(-83, -28, -57, 3, -0.4, 5, { col: '#6ad8ff' });
    K.life.birds(5, { cx: 0, cz: -20, y: 30, col: '#dfe8f0' });
    K.life.critters('beetle', -60, 12, 60, 55, 5, { speed: 0.6 });
    K.life.npc(9, 40, 'Admin-Katze Root', ['Das Kennwort steht auf der Riesentastatur — tipp es mit den Füßen.',
      'Und mir sind drei Disketten abhanden gekommen: eine hoch im Osten, eine hoch im Westen, eine unten am Seeufer.',
      'Bring alle drei her, dann fährt das System hoch — und ein Stern kommt gleich mit.'], { cat: 3, r: 5, tint: '#7affc8', mix: 0.3 });
    // ── Deko: Serverschraenke, Kabeltrommeln, Bildschirme, Buesche ──
    const rack = (x, y, z, r2) => {
      const B = hex('#3a4050');
      box(g, M4.from(x, y + 1.6, z), 1.8, 3.2, 1.2, { top: hex('#4a5060'), side: B });
      for (let k = 0; k < 7; k++) {
        box(g, M4.from(x, y + 0.4 + k * 0.42, z + 0.62), 1.5, 0.28, 0.08, hex('#22262e'));
        box(K.glow, M4.from(x - 0.55 + (k % 3) * 0.1, y + 0.4 + k * 0.42, z + 0.68), 0.1, 0.1, 0.04, hex(k % 2 ? '#7affc8' : '#ff8a5a'));
      }
      L.solid(x - 0.9, y, z - 0.6, x + 0.9, y + 3.2, z + 0.6, 'rack');
    };
    K.scatter(-88, -100, 88, 58, 14, (x, y, z, i, r) => rack(x, y, z, r), { avoid: [[-30, -30, 30, 50]] });
    K.scatter(-88, -100, 88, 58, 16, (x, y, z, i, r) => {   // Kabeltrommel
      cyl(g, M4.from(x, y, z, 0, 0, Math.PI / 2), 1.1, 1.1, 0.1, 12, hex('#6b4214'));
      cyl(g, M4.from(x + 0.55, y, z, 0, 0, Math.PI / 2), 0.75, 0.75, 0.5, 12, hex('#2a2a32'));
      cyl(g, M4.from(x + 1.1, y, z, 0, 0, Math.PI / 2), 1.1, 1.1, 0.1, 12, hex('#6b4214'));
      L.solid(x - 0.2, y, z - 1.1, x + 1.3, y + 2.2, z + 1.1, 'spool');
    }, { avoid: [[-26, -26, 26, 48]] });
    K.scatter(-88, -100, 88, 58, 20, (x, y, z, i, r) => K.bush(x, z, y, 0.8 + r() * 0.7, hex('#3f9a4a')), { avoid: [[-22, -22, 22, 46]] });
    K.scatter(-88, -100, 88, 58, 12, (x, y, z, i, r) => K.tree(x, z, y, 3 + r() * 3), { avoid: [[-26, -26, 26, 48]] });
    // ── Auftrag: drei verlorene Disketten ──
    K.quest('disketten', MESH.diskette, [[59, 19, -53], [-61, 21, -77], [-70, 1.7, -10]],
      { icon: '\u{1F4BE}', label: 'Diskette', speaker: 'Admin-Katze Root', starPos: [0, 2.4, 20],
        done: ['Alle drei Disketten gefunden — das System fährt hoch!', 'Vor der Tastatur ist ein Stern erschienen.'] });
    L.finish();
    return L;
  }

  /* ─────────── Welt 2: Video-Bucht ───────────
     Sonnenuntergang ueber einer grossen Lagune (Idee: Bucht mit versunkenem Schiff, eigenes
     Layout). Gimmicks: Floesse, Bojen-Trampoline, Schwimmen, Tauchen. Stern oben am Leuchtturm,
     zweiter Stern im Laderaum des Wracks unten in der Senke. Saeulenweg zum Sprungfelsen,
     Steg mit Bootshaus, geheime Grotte hinter der Ostklippe (nur tauchend). */
  MESH.fish = buildLP((g) => {
    sphere(g, I4, 0.18, 0.2, 0.42, 8, 6, hex('#ffb13f'), true);
    g.tri([0, 0, -0.35], [0, 0.22, -0.62], [0, -0.22, -0.62], hex('#ff8a1f'));
    sphere(g, M4.from(0.1, 0.05, 0.22), 0.05, 0.05, 0.05, 5, 4, C.black, true);
    sphere(g, M4.from(-0.1, 0.05, 0.22), 0.05, 0.05, 0.05, 5, 4, C.black, true);
    box(g, M4.from(0, 0.18, -0.05), 0.02, 0.14, 0.3, hex('#ff8a1f'));
  });
  function buildVideo() {
    const L = new Level({ name: 'Video-Bucht', spawn: [0, 0.6, 28], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#e8a07a'), fogNear: 110, fogFar: 380, light: v3.norm([0.1, -0.45, 0.88]), sky: 'sunset' });
    const K = kit(L), g = K.g, gw = K.glow, r = K.rnd;
    const SAND = { top: hex('#f0d49a'), side: hex('#c8a870') }, ROCK = { top: hex('#8a7a6a'), side: hex('#6a5a4c') };
    const CLIFF = { top: hex('#7a8a5a'), side: hex('#7a6a5a') }, BED = [hex('#3a6a78'), hex('#325e6a')];
    // Meeresgrund auf -7, im Nordwesten die tiefe Wracksenke (-19)
    [[-110, -80, 106, 48], [-50, -150, 106, -80], [-110, -150, -100, -80], [-100, -150, -50, -140]].forEach(([x0, z0, x1, z1]) => {
      L.solid(x0, -14, z0, x1, -7, z1, 'ground'); L.checker(x0, z0, x1, z1, -7, 5, BED[0], BED[1]);
    });
    L.solid(-100, -26, -140, -50, -19, -80, 'ground'); L.checker(-100, -140, -50, -80, -19, 5, hex('#2a5060'), hex('#244858'));
    for (const [a, b] of [[[-100, -80], [-50, -80]], [[-50, -140], [-100, -140]], [[-100, -140], [-100, -80]], [[-50, -80], [-50, -140]]]) {
      g.quad([a[0], -19, a[1]], [b[0], -19, b[1]], [b[0], -7, b[1]], [a[0], -7, a[1]], hex('#3a5a64'));
    }
    K.bounds(-108, -148, 104, 45);
    L.waters.push({ x0: -110, x1: 106, z0: -150, z1: 48, y: 0 });
    L.block(0, -3.2, 29, 32, 7.6, 22, SAND, 'beach');
    L.block(0, -2.7, -3, 18, 8.6, 18, SAND, 'island');
    L.block(0, 1, -35, 28, 16, 10, ROCK, 'cliff');
    L.block(-8, -2.9, -22, 4, 8.2, 4, ROCK, 'rock');
    L.block(-8, -1.6, -28, 4, 10.8, 4, ROCK, 'rock');
    L.block(-4, -0.3, -28.5, 4, 13.4, 3, ROCK, 'rock');
    K.portal(0, 9, -37, 1, { scale: 1.4 });
    K.palm(-5, -6, 1.6, 7); K.palm(5, 2, 1.6, 6); K.palm(-12, 34, 0.6, 7); K.palm(12, 22, 0.6, 6); K.palm(-14, 20, 0.6, 8); K.palm(6, -9, 1.6, 5);
    // ferne Inseln am Horizont
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.15 + i * 0.09), rr = 190 + (i % 3) * 30;
      cyl(g, M4.from(Math.cos(a) * rr * (i % 2 ? 1 : -1), -2, -Math.sin(a) * rr, a), 26 + (i % 3) * 10, 0, 16 + (i % 4) * 6, 7, i % 2 ? hex('#6a5a7a') : hex('#7a5a6a'));
    }

    // ── Leuchtturm-Insel ──
    L.block(28, -2.9, -10, 12, 8.2, 12, ROCK, 'rock');
    for (let k = 0; k < 9; k++) {
      const r0 = 3 - k * 0.07, r1 = 3 - (k + 1) * 0.07;
      cyl(g, M4.from(28, 1.2 + k * 1.98, -10), r0, r1, 2, 16, k % 2 ? hex('#f4f0e8') : hex('#d8342b'));
    }
    L.solid(25.4, 1.2, -12.6, 30.6, 19, -7.4, 'lighthouse');
    box(g, M4.from(28, 2.4, -7.1), 1.2, 2.4, 0.2, hex('#5a3414'));
    L.block(28, 18.8, -10, 4.2, 0.4, 4.2, { top: hex('#7a7a7a'), side: hex('#5a5a5a') }, 'plat');
    cyl(g, M4.from(28, 19, -10), 3, 3, 0.3, 16, hex('#6a6a6a'));
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; box(g, M4.from(28 + Math.cos(a) * 2.9, 19.7, -10 + Math.sin(a) * 2.9, -a), 0.1, 1, 0.1, hex('#3a3a3a')); }
    cyl(gw, M4.from(28, 19.3, -10), 1.1, 1.1, 1.6, 12, hex('#fff2a8'));
    cyl(g, M4.from(28, 20.9, -10), 1.5, 0, 1.3, 12, hex('#d8342b'));
    for (let k = 0; k < 6; k++) {
      const a = Math.PI + k * Math.PI / 3, top = 3.8 + k * 2.6;
      const x = 28 + Math.cos(a) * 4.3, z = -10 + Math.sin(a) * 4.3;
      K.plat(x, top, z, 2.6, 2.6, { top: hex('#9a9a9a'), side: hex('#6a6a6a') }, 0.5, 'ledge');
      L.coin('yellow', x, top + 1.1, z);
    }
    K.star('video', [28, 21.2, -11.3]);
    // Floesse
    const WOOD = { top: hex('#b8864a'), side: hex('#7a5530') };
    L.mover(15.5, 0.25, -10, 4, 0.5, 4, WOOD, (t) => [Math.sin(t * 0.6) * 4.5, 0, 0], 'raft');
    L.mover(0, 0.25, 12, 4, 0.5, 4, WOOD, (t) => [0, 0, Math.sin(t * 0.5 + 1) * 4], 'raft');
    L.mover(50, 0.25, -30, 4, 0.5, 4, WOOD, (t) => [Math.sin(t * 0.45) * 10, 0, Math.cos(t * 0.45) * 6], 'raft');
    // Bojen federn, fuehren zum Riff
    [[-20, 12], [-26, 6], [-30, -1], [40, 4], [46, -2]].forEach(([x, z], i) => {
      cyl(g, M4.from(x, -1, z), 0.8, 0.8, 1.6, 10, i % 2 ? hex('#f4f0e8') : hex('#d8342b'));
      sphere(gw, M4.from(x, 0.75, z), 0.2, 0.2, 0.2, 6, 4, hex('#ffe680'));
      const b = L.solid(x - 0.8, -1, z - 0.8, x + 0.8, 0.6, z + 0.8, 'bouncy'); b.bounce = 62;
    });
    L.block(-34, -2.5, -10, 8, 9, 8, ROCK, 'rock');
    K.coinRing(-34, 3.1, -10, 2.2, 6);
    // Versunkene Schatzkiste
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; L.block(-40 + Math.cos(a) * 3.2, -6, -22 + Math.sin(a) * 3.2, 1.6, 2, 1.6, ROCK, 'rock'); }
    K.item(MESH.chest, [-40, -7, -22], (it) => {
      Snd.starAppear(); addCoins(10);
      burst([it.pos[0], it.pos[1] + 1, it.pos[2]], 16, { spread: 3, up: 4, life: .8, size: .2, cols: [[1, .85, .2], [1, 1, 1]], grav: 2 });
      toast('🏴‍☠️ Versunkener Schatz: +10 Münzen!');
    }, 2);

    // ── Saeulenweg zum Sprungfelsen ──
    const COL = hex('#d8ccb0');
    for (let i = 0; i < 10; i++) {
      const t = i / 9, x = lerp(-13.5, -52, t), z = lerp(-10, -56, t), top = lerp(2.8, 11, t);
      K.column(x, z, -7, top + 7, 1.3, i % 2 ? COL : shade(COL, 0.92));
      if (i % 2) L.coin('yellow', x, top + 1.2, z);
    }
    L.block(-62, 2, -64, 12, 18, 12, CLIFF, 'rock');                                   // Sprungfelsen, Oberkante 11
    L.block(-62, 11.35, -73.5, 2, 0.3, 7, { top: hex('#e8e0c8'), side: hex('#b8a888') }, 'board');
    box(g, M4.from(-62, 10.6, -70.5), 0.4, 1.2, 0.4, hex('#6a6a6a'));
    K.palm(-58, -60, 11, 6);
    K.coinLine([-62, 12.6, -70], [-62, 12.6, -76], 3);
    K.talker(-65, 11, -60, 'Schild', ['SPRUNGBRETT. Darunter liegt die tiefe Senke – und da unten liegt ein altes Wrack …']);

    // ── Das Wrack in der Senke ──
    const HULL = { top: hex('#6a4a2a'), side: hex('#5a3c20') }, DECK = { top: hex('#8a6a42'), side: hex('#5a3c20') };
    const WX = -75, WZ = -110, WY = -19;
    L.block(WX, WY + 0.5, WZ, 30, 1, 9, HULL, 'hull');                                   // Boden
    L.block(WX, WY + 4, WZ - 4.1, 30, 6, 0.8, HULL, 'hull');                            // Nordwand
    L.block(WX - 10, WY + 4, WZ + 4.1, 10, 6, 0.8, HULL, 'hull');                       // Suedwand (mit Leck)
    L.block(WX + 6.5, WY + 4, WZ + 4.1, 17, 6, 0.8, HULL, 'hull');
    L.block(WX - 3.5, WY + 5.75, WZ + 4.1, 3, 2.5, 0.8, HULL, 'hull');                  // ueber dem Leck
    L.block(WX - 14.6, WY + 4, WZ, 0.8, 6, 9, HULL, 'hull');                            // Heck
    L.block(WX + 14.6, WY + 4, WZ, 0.8, 6, 9, HULL, 'hull');                            // Bug
    for (const s of [-1, 1]) g.tri([WX + 15, WY + 1, WZ + s * 4.5], [WX + 21, WY + 6.8, WZ], [WX + 15, WY + 7, WZ + s * 4.5], HULL.side);
    g.tri([WX + 15, WY + 1, WZ - 4.5], [WX + 15, WY + 1, WZ + 4.5], [WX + 21, WY + 6.8, WZ], HULL.side);
    L.solid(WX + 15, WY, WZ - 2, WX + 19, WY + 6, WZ + 2, 'hull');
    // Deck mit Luke in der Mitte
    L.block(WX - 10, WY + 6.8, WZ, 10, 0.4, 9, DECK, 'deck');
    L.block(WX + 10, WY + 6.8, WZ, 10, 0.4, 9, DECK, 'deck');
    L.block(WX, WY + 6.8, WZ - 3.25, 10, 0.4, 2.5, DECK, 'deck');
    L.block(WX, WY + 6.8, WZ + 3.25, 10, 0.4, 2.5, DECK, 'deck');
    for (let x = WX - 14; x < WX + 14; x += 1.2) if (Math.abs(x - WX) > 5.2) box(g, M4.from(x, WY + 7.02, WZ), 0.06, 0.02, 9, hex('#4a3018'));
    L.block(WX - 11, WY + 8.6, WZ, 7, 3.2, 9, HULL, 'hull');                             // Achteraufbau
    for (const z of [-2.5, 2.5]) box(gw, M4.from(WX - 14.62, WY + 8.8, WZ + z), 0.1, 0.9, 0.9, hex('#6ac8ff'));
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) cyl(g, M4.mul(M4.from(WX - 6 + i * 5, WY + 4.5, WZ + s * 4.5), M4.from(0, 0, 0, 0, s * Math.PI / 2)), 0.3, 0.3, 1.1, 8, hex('#2a2a2a'));
    // Masten (einer abgeknickt) mit Segelfetzen
    cyl(g, M4.from(WX + 3, WY + 7, WZ), 0.4, 0.3, 14, 8, hex('#6a4a2a'));
    L.solid(WX + 2.6, WY + 7, WZ - 0.4, WX + 3.4, WY + 21, WZ + 0.4, 'mast');
    box(g, M4.from(WX + 3, WY + 17, WZ), 0.3, 0.3, 8, hex('#6a4a2a'));
    g.quad([WX + 3.1, WY + 16.8, WZ - 3.6], [WX + 3.1, WY + 16.8, WZ + 3.4], [WX + 3.1, WY + 11, WZ + 2.2], [WX + 3.1, WY + 12.4, WZ - 2.8], hex('#d8ccb0'));
    cyl(g, M4.from(WX - 5, WY + 7, WZ, 0, 0, 0.5), 0.4, 0.34, 8, 8, hex('#6a4a2a'));
    // Laderaum: Kisten, Faesser, Muenzen und der Stern
    for (const [dx, dz] of [[-11, -2.5], [-11, 2], [9, -2.8], [11, 2.4]]) L.block(WX + dx, WY + 1.8, WZ + dz, 1.6, 1.6, 1.6, { top: hex('#a8763a'), side: hex('#8a5a2a') }, 'crate');
    cyl(g, M4.from(WX + 7, WY + 1, WZ + 2.5), 0.6, 0.6, 1.3, 10, hex('#7a5030'));
    K.coinRing(WX, WY + 2.2, WZ, 3.2, 8);
    K.star('wrack', [WX, WY + 3, WZ]);
    // Seetang, Felsen und Muenzen rund ums Wrack
    for (let i = 0; i < 26; i++) {
      const x = lerp(-98, -52, r()), z = lerp(-138, -82, r());
      if (Math.abs(x - WX) < 18 && Math.abs(z - WZ) < 7) continue;
      const h = 2 + r() * 4;
      for (let k = 0; k < 3; k++) box(g, M4.from(x + Math.sin(k) * 0.2, -19 + h * (k + 0.5) / 3, z, r() * TAU, 0, (r() - 0.5) * 0.5), 0.35, h / 3 + 0.1, 0.06, shade(hex('#3f8a3a'), 0.8 + r() * 0.4));
    }
    [[-90, -85], [-58, -132], [-95, -130], [-55, -95]].forEach(([x, z]) => K.rock(x, -19, z, 2.4, hex('#5a6a6a')));
    K.coinLine([-60, -12, -84], [-72, -15, -100], 5);

    // ── Steg mit Bootshaus ──
    K.bridge(16, 30, 44, 33.6, 1.1);
    for (let x = 18; x <= 42; x += 4) for (const z of [30.2, 33.4]) cyl(g, M4.from(x, -7, z), 0.22, 0.22, 7.9, 6, hex('#5a3c20'));
    L.block(49, -2.85, 32, 10, 8.3, 11, { top: hex('#a8763a'), side: hex('#5a3c20') }, 'dock');          // Boden auf 1,3
    const HUT = { top: hex('#e8dcc0'), side: hex('#d8c8a0') };
    L.block(49, 3.1, 36.9, 10, 3.6, 0.6, HUT, 'hut'); L.block(53.7, 3.1, 32, 0.6, 3.6, 10.4, HUT, 'hut');
    L.block(44.7, 3.1, 35, 0.6, 3.6, 3.2, HUT, 'hut'); L.block(44.7, 3.1, 28.8, 0.6, 3.6, 2.8, HUT, 'hut');   // Tuer zum Steg
    L.block(49, 3.1, 27.1, 10, 3.6, 0.6, HUT, 'hut');
    L.block(49, 5.1, 32, 11, 0.4, 11, { top: hex('#c8402a'), side: hex('#a8301f') }, 'hutroof');
    g.quad([43.5, 5.3, 37.5], [54.5, 5.3, 37.5], [54.5, 7.4, 32], [43.5, 7.4, 32], hex('#c8402a'));
    g.quad([54.5, 5.3, 26.5], [43.5, 5.3, 26.5], [43.5, 7.4, 32], [54.5, 7.4, 32], hex('#a8301f'));
    g.tri([43.5, 5.3, 26.5], [43.5, 5.3, 37.5], [43.5, 7.4, 32], HUT.side); g.tri([54.5, 5.3, 37.5], [54.5, 5.3, 26.5], [54.5, 7.4, 32], HUT.side);
    box(gw, M4.from(50, 3.4, 37.23), 1.6, 1.2, 0.05, hex('#ffd878'));
    K.coinRing(49, 2.4, 32, 2.2, 6);
    K.lamp(41, 33.25, 1.1, hex('#ffd878'));

    // ── Strandleben ──
    const umbrella = (x, z, c1, c2) => {
      cyl(g, M4.from(x, 0.6, z, 0, 0, 0.08), 0.07, 0.07, 3, 5, hex('#dddddd'));
      for (let i = 0; i < 10; i++) {
        const a0 = i / 10 * TAU, a1 = (i + 1) / 10 * TAU;
        g.tri([x + 0.24, 3.9, z], [x + Math.cos(a0) * 2.2, 3.1, z + Math.sin(a0) * 2.2], [x + Math.cos(a1) * 2.2, 3.1, z + Math.sin(a1) * 2.2], i % 2 ? c1 : c2);
      }
    };
    umbrella(-9, 25, hex('#ff5fa2'), hex('#ffffff')); umbrella(7, 36, hex('#3a8aff'), hex('#ffe14a'));
    box(g, M4.from(-7.5, 0.62, 27.4, 0.3), 1.2, 0.03, 2.2, hex('#3ad8c8')); box(g, M4.from(8.8, 0.62, 33.8, -0.2), 1.2, 0.03, 2.2, hex('#ff8a3a'));
    sphere(g, M4.from(3, 1.05, 30), 0.45, 0.45, 0.45, 8, 6, (i) => [hex('#ff3b3b'), hex('#ffffff'), hex('#3a8aff'), hex('#ffe14a')][i % 4], true);
    for (const [dx, dz, h] of [[0, 0, 1.4], [1.1, 0, 1], [-1.1, 0, 1], [0, 1.1, 1], [0, -1.1, 1]]) {
      cyl(g, M4.from(5 + dx, 0.6, 24.5 + dz), 0.42, 0.36, h, 6, hex('#e8c888'));
      for (let k = 0; k < 4; k++) box(g, M4.from(5 + dx + Math.cos(k * Math.PI / 2) * 0.3, 0.6 + h + 0.1, 24.5 + dz + Math.sin(k * Math.PI / 2) * 0.3), 0.14, 0.2, 0.14, hex('#e8c888'));
    }
    L.solid(3.5, 0.6, 23, 6.5, 1.6, 26, 'sandcastle');
    for (let i = 0; i < 10; i++) starGeo(g, M4.from(lerp(-14, 14, r()), 0.62, lerp(19, 39, r()), 0, -Math.PI / 2, r() * TAU), 0.25, 0.04, [hex('#ff8a5a'), hex('#ff5a7a'), hex('#ffd05a')][i % 3]);

    // ── Ostklippe mit geheimer Grotte (Eingang unter Wasser) ──
    const CL2 = { top: hex('#8aa05a'), side: hex('#a08a70') };
    L.block(94, 2.5, 13, 24, 19, 66, CL2, 'cliff');                                     // z -20..46
    L.block(94, 1.5, -64, 24, 17, 48, CL2, 'cliff');                                    // z -88..-40, niedriger
    L.block(94, 4.5, -118, 24, 23, 60, CL2, 'cliff');                                   // z -148..-88, hoeher
    for (const [z0, z1, top] of [[-20, 46, 12], [-88, -40, 10], [-148, -88, 16]]) {
      for (let y = top - 2.5; y > -1; y -= 3) box(g, M4.from(81.97, y, (z0 + z1) / 2), 0.06, 0.4, z1 - z0, shade(CL2.side, 0.85));
      box(g, M4.from(94, top - 0.15, (z0 + z1) / 2), 24.3, 0.5, z1 - z0 + 0.3, { top: CL2.top, side: shade(CL2.top, 0.85) });
    }
    [[88, 30, 12], [92, -2, 12], [88, -60, 10], [90, -110, 16], [86, -130, 16]].forEach(([x, z, y]) => K.palm(x, z, y, 6 + (z & 3)));
    [[85, 12, 12], [86, -75, 10], [87, -100, 16]].forEach(([x, z, y]) => K.rock(x, y, z, 2.2, hex('#9a8a78')));
    K.fall(81.6, 24, 12, 0, 7, 'z', { speed: 11 });
    box(g, M4.from(82.2, 11.9, 24), 0.8, 0.5, 7.4, hex('#6a8ac8'));
    L.block(87, 2.5, -36.5, 10, 19, 7, CLIFF, 'cliff'); L.block(87, 2.5, -23.5, 10, 19, 7, CLIFF, 'cliff');
    L.block(87, 5, -30, 10, 14, 6, CLIFF, 'cliff');                                     // Tunneldach ab -2
    L.block(104, 2.5, -30, 4, 19, 20, CLIFF, 'cliff');                                  // Rueckwand
    const GROT = { top: hex('#6a7a8a'), side: hex('#4a5a6a') };
    L.block(99, -3.2, -30, 6, 7.6, 20, GROT, 'grotto'); L.block(94, -3.2, -36.5, 4, 7.6, 7, GROT, 'grotto'); L.block(94, -3.2, -23.5, 4, 7.6, 7, GROT, 'grotto');
    L.block(97, 9.5, -30, 10, 5, 20, CLIFF, 'cliff');                                   // Grottendecke ab 7
    for (const [x, z] of [[100, -38], [101, -22], [97, -37.5], [100.5, -30]]) K.crystal(x, 0.6, z, 1.6 + r(), hex('#8af0ff'), r() * 3);
    for (let i = 0; i < 14; i++) cyl(g, M4.from(lerp(93, 101.5, r()), 7, lerp(-39.5, -20.5, r()), 0, Math.PI), 0.3 + r() * 0.35, 0, 0.8 + r() * 1.6, 5, hex('#5a6a7a'));
    for (const [x, z] of [[96, -21.5], [98.5, -38.5]]) { cyl(g, M4.from(x, 0.6, z), 0.12, 0.1, 0.5, 5, hex('#e8e0d0')); sphere(gw, M4.from(x, 1.15, z), 0.4, 0.22, 0.4, 8, 4, hex('#7affc8'), true, 0, Math.PI / 2); }
    K.coinRing(99, 1.7, -30, 2.2, 8);
    K.item(MESH.chest, [100.5, 0.6, -24], (it) => {
      Snd.starAppear(); addCoins(10);
      burst([it.pos[0], it.pos[1] + 1, it.pos[2]], 16, { spread: 3, up: 4, life: .8, size: .2, cols: [[1, .85, .2], [1, 1, 1]], grav: 2 });
      toast('🐚 Geheime Grotte: +10 Münzen!');
    }, 2);
    K.coinLine([78, -4.5, -30], [92, -4.5, -30], 4);
    // Korallenriff vor der Klippe und um die Leuchtturm-Insel
    const coral = (x, z, y = -7) => {
      const kind = Math.floor(r() * 3), c = [hex('#ff6a8a'), hex('#ff9a3a'), hex('#b86aff'), hex('#ffd24a'), hex('#4ad8c8')][Math.floor(r() * 5)];
      if (kind === 0) for (let k = 0; k < 4; k++) cyl(g, M4.from(x, y, z, k * 1.6, 0.35 * (k % 2 ? 1 : -1), 0.3 * (k - 1.5)), 0.18, 0.12, 1.4 + r(), 5, c);
      else if (kind === 1) sphere(g, M4.from(x, y + 0.3, z), 0.8, 0.6, 0.8, 8, 5, (i, j) => ((i + j) % 2 ? c : shade(c, 0.8)), false);
      else for (let k = 0; k < 5; k++) cyl(g, M4.from(x + (k - 2) * 0.3, y, z + (k % 2) * 0.3), 0.14, 0.2, 0.8 + k * 0.25, 6, c);
    };
    for (let i = 0; i < 70; i++) {
      const x = lerp(38, 80, r()), z = lerp(-70, 30, r());
      if (Math.abs(x - 50) < 4 && Math.abs(z - 32) < 7) continue;
      coral(x, z);
    }
    for (let i = 0; i < 25; i++) coral(lerp(-45, -15, r()), lerp(-50, -5, r()));
    for (let i = 0; i < 40; i++) {
      const x = lerp(-100, 100, r()), z = lerp(-75, 42, r()), h = 1.5 + r() * 3;
      if (Math.abs(x) < 17 && z > 17) continue;
      for (let k = 0; k < 3; k++) box(g, M4.from(x + Math.sin(k * 2) * 0.15, -7 + h * (k + 0.5) / 3, z, r() * TAU, 0, (r() - 0.5) * 0.4), 0.3, h / 3 + 0.1, 0.06, shade(hex('#4a9a3a'), 0.8 + r() * 0.4));
    }
    // Fischschwaerme
    const schools = [[45, -3, -20, 7, 0.5], [-30, -4, -60, 6, -0.4], [-75, -13, -110, 11, 0.35], [70, -4, 10, 8, 0.45], [96, -4, -30, 5, -0.6]];
    L.drawSolid = () => {
      for (const [cx, cy, cz, rr, w] of schools) {
        for (let i = 0; i < 6; i++) {
          const a = clock * w + i * 0.35, rad = rr + Math.sin(i * 1.7) * 1.2;
          draw(MESH.fish, M4.from(cx + Math.cos(a) * rad, cy + Math.sin(clock * 1.3 + i) * 0.4 + (i % 3) * 0.5, cz + Math.sin(a) * rad, -a + (w > 0 ? 0 : Math.PI)), { lit: 0.8 });
        }
      }
    };

    K.coinLine([-20, -3, 20], [-26, -5, -18], 6);
    K.coinRing(0, 2.7, -3, 5, 8);
    K.coinLine([-8, 1.1, 34], [8, 1.1, 34], 5);
    K.coinLine([20, 2.4, 31.8], [40, 2.4, 31.8], 5);
    K.talker(-6, 0.6, 28, 'Schild', [
      '★ VIDEO-BUCHT ★\nSchönes Wetter zum Schwimmen! (Im Wasser: A = Schwimmzug, Z = tauchen)',
      'Oben am LEUCHTTURM wartet ein Stern. Die Flöße bringen dich hin, die Simse führen hinauf.',
      'Tief unten in der SENKE im Nordwesten liegt ein altes WRACK. Durch die Luke im Deck kommt man in den Laderaum.',
      'Die Säulen im Westen führen zum Sprungbrett – von dort geht es kopfüber in die Senke.',
      'Und die Ostklippe? Unter Wasser hat sie ein Loch …',
    ]);
    K.exit(0, 40, 0.6);
    L.enemies.push(makeGrummel(-4, -8), makeGrummel(10, 26), makeGrummel(-10, 36), makeGrummel(49, 30, 3));
    // Seeigel (Stachis) am Strand und am Grund, Flatterlinge an Leuchtturm und Sprungfelsen, Quallen-Hopsis
    L.enemies.push(makeSpiky(8, 26, 3, '#3a2a4a'), makeSpiky(-9, 21, 3, '#3a2a4a'), makeSpiky(3, -7, 5, '#3a2a4a'), makeSpiky(-20, -42, -5, '#3a2a4a'),
      makeSpiky(60, -50, -5, '#3a2a4a'), makeSpiky(-70, -95, -15, '#3a2a4a'), makeSpiky(-82, -122, -15, '#3a2a4a'));
    L.enemies.push(makeBat(28, 24, -10, '#5a2a7a'), makeBat(-62, 16, -64, '#5a2a7a'), makeBat(49, 9, 32, '#5a2a7a'), makeSpam(-30, 10, -30));
    L.enemies.push(makePopup(-8, 24, 3, 2), makePopup(0, 0, 5, 2));
    L.enemies.push(makeHopper(30, 31.8, 3, '#6ac8ff'), makeHopper(-60, -62, 14, '#6ac8ff'), makeHopper(-4, 34, 3, '#ff8ab0'));
    // ── Leben ──
    K.life.birds(8, { cx: 0, cz: -40, y: 24, col: '#f8f8ff', speed: 1.2 });
    K.life.fish(-60, -120, 60, 18, 0, 10, { col: '#6ad8e8' });
    K.life.critters('crab', -14, 20, 14, 38, 5, { speed: 0.8, y: 0.6 });
    K.life.butterflies(-16, 18, 16, 40, 4, { cols: ['#ffe14a'], y: 0.6, yr: 1.6 });
    K.life.npc(7, 31, 'Kapitän Bo', ['Die Flöße tragen dich raus zum Leuchtturm.',
      'Sechs Flaschenposten treiben in der Bucht: auf den Klippen, auf der Insel — und eine liegt auf dem Grund.',
      'Sammel sie ein, dann liegt hier am Strand ein Stern für dich.'], { cat: 0, r: 4, tint: '#4ab0d8', mix: 0.35, y: 0.6 });
    // ── Deko: Sonnenschirme, Liegen, Sandburgen, Kisten, Bojen ──
    K.scatter(-30, 14, 30, 42, 5, (x, y, z, i, r) => {   // Sonnenschirm + Liege
      cyl(g, M4.from(x, y, z), 0.1, 0.08, 2.6, 6, hex('#e8e0d0'));
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.tri([x, y + 2.9, z], [x + Math.cos(a) * 1.6, y + 2.3, z + Math.sin(a) * 1.6], [x + Math.cos(a + 0.8) * 1.6, y + 2.3, z + Math.sin(a + 0.8) * 1.6], k % 2 ? hex('#e03a4a') : C.white); }
      box(g, M4.from(x + 1.8, y + 0.28, z, 0, 0, 0), 2.2, 0.16, 0.9, hex('#e8e0c0'));
      for (const sx of [-1, 1]) box(g, M4.from(x + 1.8 + sx * 0.9, y + 0.14, z), 0.12, 0.28, 0.8, hex('#8a6a3a'));
    }, { y: 0.6, minDist: 7, avoid: [[-8, 22, 8, 40]] });
    K.scatter(-28, 14, 28, 42, 4, (x, y, z, i, r) => {   // Sandburg
      const SC = hex('#e8cf9a');
      box(g, M4.from(x, y + 0.5, z), 2, 1, 2, SC);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { cyl(g, M4.from(x + sx * 0.9, y + 0.9, z + sz * 0.9), 0.35, 0.3, 1, 8, SC); cyl(g, M4.from(x + sx * 0.9, y + 1.9, z + sz * 0.9), 0.4, 0, 0.5, 8, shade(SC, 0.9)); }
      L.solid(x - 1.1, y, z - 1.1, x + 1.1, y + 1, z + 1.1, 'castle');
    }, { y: 0.6, minDist: 7, avoid: [[-8, 22, 8, 40]] });
    K.scatter(-30, 12, 30, 42, 6, (x, y, z, i, r) => K.rock(x, y, z, 0.8 + r() * 1.2, hex('#b8a894')), { y: 0.6, minDist: 6, avoid: [[-7, 22, 7, 40]] });
    K.scatter(-30, 12, 30, 42, 4, (x, y, z, i, r) => {   // Kiste + Fass
      box(g, M4.from(x, y + 0.55, z, r() * 3), 1.1, 1.1, 1.1, { top: hex('#c9974a'), side: hex('#a8763a') });
      L.solid(x - 0.6, y, z - 0.6, x + 0.6, y + 1.1, z + 0.6, 'crate');
    }, { y: 0.6, avoid: [[-7, 22, 7, 40]] });
    // ── Auftrag: sechs Flaschenposten (eine liegt unter Wasser) ──
    K.quest('strandgut', MESH.flasche, [[-50, 11.6, -56], [-62, 12.7, -74], [-14, 10.2, -38], [46, 6.4, 28], [-8, 2.7, -4], [12, -5.5, -4]],
      { icon: '\u{1F37E}', label: 'Flaschenpost', speaker: 'Kapitän Bo', starPos: [0, 2.4, 34],
        done: ['Sechs Flaschenposten — die Bucht ist sauber!', 'Am Strand ist ein Stern aufgetaucht.'] });
    L.finish();
    return L;
  }

  /* ─────────── Welt 3: Bounce-Berg ───────────
     Verschneiter Terrassenberg (Idee: Schneeberg mit Huette und Rutschbahn, eigenes Layout).
     Gimmicks: Seerosen-Trampoline, Serpentinenweg mit rollenden Schneebaellen, Eissee (rutschig),
     Schneefall, Berghuette mit Rodelbahn (Zeitmessung, Stern am Ziel).
     Geheim: der Hut des Schneemanns, das Iglu. */
  MESH.bunny = buildLP((g) => {
    const W = hex('#f8f8ff'), P = hex('#ffb0c8');
    sphere(g, M4.from(0, 0.55, 0), 0.5, 0.55, 0.45, 12, 8, W, true);
    sphere(g, M4.from(0, 1.25, 0.05), 0.36, 0.34, 0.34, 12, 8, W, true);
    for (const s of [-1, 1]) {
      sphere(g, M4.from(s * 0.14, 1.78, -0.02, 0, 0, s * 0.15), 0.1, 0.34, 0.07, 8, 6, W, true);
      sphere(g, M4.from(s * 0.14, 1.78, 0.03, 0, 0, s * 0.15), 0.05, 0.25, 0.02, 6, 4, P, true);
      sphere(g, M4.from(s * 0.13, 1.3, 0.33), 0.05, 0.06, 0.03, 6, 4, C.black, true);
      sphere(g, M4.from(s * 0.22, 0.1, 0.2), 0.14, 0.1, 0.22, 8, 5, W, true);
    }
    sphere(g, M4.from(0, 1.2, 0.38), 0.05, 0.04, 0.03, 6, 4, P, true);
    sphere(g, M4.from(0, 0.45, -0.45), 0.16, 0.16, 0.16, 8, 5, W, true);
    box(g, M4.from(0, 1.02, 0.18), 0.5, 0.12, 0.3, hex('#d8342b'));              // Schal
    box(g, M4.from(0.18, 0.8, 0.3, 0, 0.3), 0.12, 0.4, 0.06, hex('#d8342b'));
  });
  function buildBounce() {
    const L = new Level({ name: 'Bounce-Berg', spawn: [0, 0, 40], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#e6eef8'), fogNear: 100, fogFar: 320, light: v3.norm([-0.3, -0.85, -0.45]), sky: 'snow' });
    const K = kit(L), g = K.g, gw = K.glow, r = K.rnd;
    K.ground(-110, -135, 110, 50, hex('#f6f9ff'), hex('#e4ecf6'));
    K.bounds(-108, -133, 108, 48);
    K.hills(170, 22, hex('#f2f6fc'), hex('#d8e2ee'), -2, 1.9);
    g.quad([-500, -2.05, 500], [500, -2.05, 500], [500, -2.05, -500], [-500, -2.05, -500], hex('#e8eef6'));
    const TER = { top: hex('#f8fbff'), side: hex('#7a8494') }, ROCKC = hex('#8a93a3');
    // ── Vier Terrassen (Vorderkante, halbe Breite, Hoehe), alle reichen bis z = -100 ──
    const TERR = [[-10, 36, 6], [-24, 28, 13], [-36, 20, 20], [-48, 12, 27]];
    TERR.forEach(([zf, hw, top]) => {
      L.block(0, top / 2 - 0.5, (zf - 100) / 2, hw * 2, top + 1, 100 + zf, TER, 'terrace');
      box(g, M4.from(0, top - 0.15, zf + 0.1), hw * 2 + 0.4, 0.3, 0.6, hex('#ffffff'));
      for (let y = top - 2; y > top - 6.5 && y > 0.5; y -= 2.2) box(g, M4.from(0, y, zf + 0.03), hw * 2, 0.3, 0.1, shade(TER.side, 0.85));
      for (let i = 0; i < 5; i++) K.rock(-hw + 3 + i * (hw * 2 - 6) / 4, top - 0.4, zf - 1.5 - (i % 2) * 2, 1.1, ROCKC, false);
    });
    // Seerosen-Trampoline: vom Fuss jeder Terrasse auf die naechste
    const pad = (x, y, z) => {
      cyl(g, M4.from(x, y, z), 1.9, 1.9, 0.32, 14, hex('#2f9a3a'), hex('#4cc85a'));
      sphere(g, M4.from(x + 0.6, y + 0.4, z - 0.4), 0.35, 0.25, 0.35, 8, 4, hex('#ffb0d8'));
      const b = L.solid(x - 1.6, y, z - 1.6, x + 1.6, y + 0.32, z + 1.6, 'bouncy'); b.bounce = 82;
    };
    pad(0, 0, -5); pad(14, 6, -19); pad(-6, 13, -31); pad(6, 20, -43);
    K.coinLine([0, 3, -6], [0, 8, -9], 3); K.coinLine([14, 9, -20], [14, 15, -22], 3); K.coinLine([-6, 16, -32], [-6, 22, -34], 3); K.coinLine([6, 23, -44], [6, 29, -46], 3);
    K.star('bounce', [0, 28.6, -52]);
    // ── Serpentinenweg an der Ostflanke (vier Rampen nach Norden) ──
    const PATH = { top: hex('#dfe8f4'), side: hex('#7a8494') }, CURB = { top: hex('#ffffff'), side: hex('#8a93a3') };
    const eramp = (x0, x1, zLo, zHi, yLo, yHi) => {
      K.ramp(x0, zHi, x1, zLo, yLo, yHi, 'z-', PATH);
      L.block((x0 + x1) / 2, (yLo + yHi + 1.8) / 2 - 0.5, zHi - 0.3, x1 - x0, yHi - yLo + 1.9, 0.6, CURB, 'curb');
    };
    eramp(36, 42, -10, -46, 0, 6);        // Boden -> Terrasse 1
    eramp(28, 33.5, -24, -58, 6, 13);     // Terrasse 1 -> 2
    eramp(20, 25.5, -36, -70, 13, 20);    // Terrasse 2 -> 3
    eramp(12, 17.5, -48, -82, 20, 27);    // Terrasse 3 -> 4
    K.coinLine([39, 1.6, -14], [39, 6.5, -42], 5); K.coinLine([30.75, 8, -28], [30.75, 13.5, -54], 4);
    K.coinLine([22.75, 15, -40], [22.75, 20.5, -66], 4); K.coinLine([14.75, 22, -52], [14.75, 27.5, -78], 4);
    // Frosch-Statue und Portal auf der zweiten Terrasse
    sphere(g, M4.from(-16, 14.4, -30), 2, 1.5, 1.8, 12, 8, hex('#4caf50'), true);
    for (const s of [-1, 1]) {
      sphere(g, M4.from(-16 + s * 1.1, 16, -29), 0.6, 0.6, 0.6, 10, 8, hex('#4caf50'), true);
      sphere(g, M4.from(-16 + s * 1.1, 16.1, -28.5), 0.3, 0.35, 0.2, 8, 6, C.black, true);
    }
    L.solid(-18, 13, -32, -14, 16.6, -28, 'statue');
    K.portal(22, 13, -30, 2, { scale: 0.9 });

    // ── Berghuette auf dem Gipfelplateau (Tuer vorn und hinten) ──
    const LOG = { top: hex('#8a5a2a'), side: hex('#9c6a36') }, HY = 27;
    L.block(-3.1, HY + 2, -76, 3.8, 4, 0.6, LOG, 'cabin'); L.block(3.1, HY + 2, -76, 3.8, 4, 0.6, LOG, 'cabin');
    L.block(0, HY + 3.3, -76, 2.4, 1.4, 0.6, LOG, 'cabin');
    L.block(-3.1, HY + 2, -86, 3.8, 4, 0.6, LOG, 'cabin'); L.block(3.1, HY + 2, -86, 3.8, 4, 0.6, LOG, 'cabin');
    L.block(0, HY + 3.3, -86, 2.4, 1.4, 0.6, LOG, 'cabin');
    L.block(-5, HY + 2, -81, 0.6, 4, 10.6, LOG, 'cabin'); L.block(5, HY + 2, -81, 0.6, 4, 10.6, LOG, 'cabin');
    for (let y = HY + 0.5; y < HY + 4; y += 0.7) for (const x of [-5.32, 5.32]) box(g, M4.from(x, y, -81), 0.1, 0.12, 10.6, hex('#6a4218'));
    L.solid(-5.5, HY + 4, -86.5, 5.5, HY + 4.4, -75.5, 'cabin');
    const RF = hex('#6a3a1a'), SNW = hex('#fafcff');
    g.quad([-6.2, HY + 4, -74.8], [6.2, HY + 4, -74.8], [6.2, HY + 7, -81], [-6.2, HY + 7, -81], RF);
    g.quad([6.2, HY + 4, -87.2], [-6.2, HY + 4, -87.2], [-6.2, HY + 7, -81], [6.2, HY + 7, -81], RF);
    g.quad([-6.2, HY + 4.12, -74.8], [6.2, HY + 4.12, -74.8], [6.2, HY + 7.12, -81], [-6.2, HY + 7.12, -81], SNW);
    g.quad([6.2, HY + 4.12, -87.2], [-6.2, HY + 4.12, -87.2], [-6.2, HY + 7.12, -81], [6.2, HY + 7.12, -81], SNW);
    for (const x of [-5, 5]) g.tri([x, HY + 4, -75.7], [x, HY + 4, -86.3], [x, HY + 7, -81], LOG.side);
    L.block(3, HY + 6.5, -83.5, 1.2, 3, 1.2, { top: hex('#5a5a5a'), side: hex('#7a6a6a') }, 'chimney');
    // drinnen: Kamin, Tisch, Schneehase
    L.block(4.2, HY + 1.1, -81, 1, 2.2, 2.6, { top: hex('#6a6a6a'), side: hex('#8a8a8a') }, 'fireplace');
    box(gw, M4.from(3.68, HY + 0.6, -81), 0.1, 0.8, 1.6, hex('#ff8a2a'));
    box(gw, M4.from(3.72, HY + 0.45, -81), 0.1, 0.4, 1.0, hex('#ffe060'));
    L.block(-2, HY + 0.45, -81, 2.4, 0.9, 1.6, { top: hex('#b8864a'), side: hex('#8a5a2a') }, 'table');
    box(gw, M4.from(-2, HY + 1.05, -81), 0.14, 0.3, 0.14, hex('#fff2a8'));
    box(gw, M4.from(-4.72, HY + 2.4, -79), 0.06, 1, 1.2, hex('#ffd878'));
    box(gw, M4.from(4.72, HY + 2.4, -78), 0.06, 1, 1.2, hex('#ffd878'));
    const hare = { pos: [-3.2, HY, -83.6] };
    K.talker(hare.pos[0], HY, hare.pos[2], 'Schneehase', [
      'Brrr! Na, auch Lust auf eine Abfahrt?',
      'Hinter der Hütte beginnt die RODELBAHN. Einfach reinlaufen – dann geht es auf dem Bauch bergab. Mit dem Stick lenkst du.',
      'Unten im Ziel wartet ein Stern. Und wer schnell ist, bekommt von mir einen Applaus!',
    ], false);
    L.solid(-3.7, HY, -84.1, -2.7, HY + 1.9, -83.1, 'npc');

    // ── Rodelbahn: fuenf Abschnitte mit Kurven an der Westflanke ──
    const ICE = { top: hex('#cfe8ff'), side: hex('#8ab0d8') }, RAIL = { top: hex('#fafcff'), side: hex('#b8c8dc') };
    const seg = (x0, z0, x1, z1, yLo, yHi, rise) => {
      const b = K.ramp(x0, z0, x1, z1, yLo, yHi, rise, ICE, { tag: 'chute', chute: true });
      // Banden: schraege Leisten 1 m ueber der Bahn
      if (rise[0] === 'x') { K.ramp(x0, z0 - 0.5, x1, z0, yLo + 1, yHi + 1, rise, RAIL, { tag: 'rail' }); K.ramp(x0, z1, x1, z1 + 0.5, yLo + 1, yHi + 1, rise, RAIL, { tag: 'rail' }); }
      else { K.ramp(x0 - 0.5, z0, x0, z1, yLo + 1, yHi + 1, rise, RAIL, { tag: 'rail' }); K.ramp(x1, z0, x1 + 0.5, z1, yLo + 1, yHi + 1, rise, RAIL, { tag: 'rail' }); }
      return b;
    };
    const corner = (x0, z0, x1, z1, y, dir, walls) => {
      const b = L.block((x0 + x1) / 2, y - 0.5, (z0 + z1) / 2, x1 - x0, 1, z1 - z0, ICE, 'chute');
      b.chute = dir;
      for (const w of walls) {
        if (w === '-x') L.block(x0 - 0.25, y + 0.5, (z0 + z1) / 2, 0.5, 2, z1 - z0 + 1, RAIL, 'rail');
        if (w === '+x') L.block(x1 + 0.25, y + 0.5, (z0 + z1) / 2, 0.5, 2, z1 - z0 + 1, RAIL, 'rail');
        if (w === '-z') L.block((x0 + x1) / 2, y + 0.5, z0 - 0.25, x1 - x0 + 1, 2, 0.5, RAIL, 'rail');
        if (w === '+z') L.block((x0 + x1) / 2, y + 0.5, z1 + 0.25, x1 - x0 + 1, 2, 0.5, RAIL, 'rail');
      }
      return b;
    };
    const segA = seg(-44, -98, -12, -90, 22, 27, 'x+');
    corner(-52, -98, -44, -90, 22, [0, 1], ['-x', '-z']);
    seg(-52, -90, -44, -50, 15, 22, 'z-');
    corner(-52, -50, -44, -42, 15, [-1, 0], ['+x', '+z']);
    seg(-90, -50, -52, -42, 9, 15, 'x+');
    corner(-98, -50, -90, -42, 9, [0, 1], ['-x', '-z']);
    seg(-98, -42, -90, 0, 2.5, 9, 'z-');
    corner(-98, 0, -90, 8, 2.5, [1, 0], ['-x', '+z']);
    seg(-90, 0, -62, 8, 0.4, 2.5, 'x-');
    // Stuetzen unter der Bahn
    const post = (x, z, top) => { if (top > 1.2) cyl(g, M4.from(x, 0, z), 0.35, 0.35, top - 1, 6, hex('#8a6a4a')); };
    for (let x = -40; x >= -52; x -= 8) { post(x, -97.5, lerp(22, 27, (x + 44) / 32) - 0.2); post(x, -90.5, 21); }
    for (let z = -86; z <= -54; z += 8) { post(-51.5, z, lerp(22, 15, (z + 90) / 40)); post(-44.5, z, lerp(22, 15, (z + 90) / 40)); }
    for (let x = -56; x >= -96; x -= 8) { post(x, -49.5, lerp(15, 9, (-52 - x) / 38)); post(x, -42.5, lerp(15, 9, (-52 - x) / 38)); }
    for (let z = -38; z <= 4; z += 8) { post(-97.5, z, lerp(9, 2.5, (z + 42) / 42)); post(-90.5, z, lerp(9, 2.5, (z + 42) / 42)); }
    // Start-Tor und Ziel-Bogen
    for (const z of [-98.6, -89.4]) cyl(g, M4.from(-12.5, HY, z), 0.25, 0.25, 4.6, 6, hex('#d8342b'));
    box(g, M4.from(-12.5, HY + 4.6, -94), 0.4, 0.8, 9.6, hex('#ffffff'));
    const bannerTex = labelTexture((c, w, h) => {
      c.fillStyle = '#d8342b'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.font = '900 120px Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ZIEL', w / 2, h / 2 + 6);
    }, 512, 192);
    for (const z of [-2.5, 10.5]) cyl(g, M4.from(-58, 0, z), 0.25, 0.25, 4.6, 6, hex('#d8342b'));
    box(g, M4.from(-58, 4.6, 4), 0.4, 0.8, 13.4, hex('#ffffff'));
    const bannerMesh = build((gg) => gg.quad([0, -0.9, -4], [0, -0.9, 4], [0, 0.9, 4], [0, 0.9, -4], C.white, [[0, 1], [1, 1], [1, 0], [0, 0]]));
    K.coinLine([-16, 27.2, -94], [-42, 22.8, -94], 6);
    K.coinLine([-48, 22, -84], [-48, 17, -56], 5);
    K.coinLine([-58, 15, -46], [-86, 10.6, -46], 5);
    K.coinLine([-94, 9, -36], [-94, 4.4, -6], 5);
    // Zeitmessung
    let raceT = -1, racing = false;
    const best = () => (state.rodel || 0);
    L.update = (dt) => {
      if (parts.length < 110 && Math.random() < dt * 30) {
        parts.push({ p: [cam.pos[0] + (Math.random() - 0.5) * 40, cam.pos[1] + 12, cam.pos[2] + (Math.random() - 0.5) * 40], v: [0.4, -2.2, 0.2],
          life: 6, max: 6, s: 0.12, col: [1, 1, 1], g: 0, rot: Math.random() * 6 });
      }
      if (pl.grounded && pl.groundBox === segA && !racing) { racing = true; raceT = 0; Snd.whistle(); toast('🛷 Los geht\'s!'); }
      if (racing) {
        raceT += dt;
        const p = pl.pos;
        if (p[0] > -58 && p[2] > -3 && p[2] < 11 && p[1] < 3) {
          racing = false;
          const t = raceT.toFixed(1).replace('.', ','), rec = !best() || raceT < best();
          if (rec) { state.rodel = +raceT.toFixed(2); save(); }
          Snd.chime(8);
          toast(`🏁 Ziel! ${t} s` + (rec ? ' – neuer Rekord!' : ` (Rekord: ${String(best().toFixed(1)).replace('.', ',')} s)`));
          spawnStar('rodel', L, [-50, 3, 4]);
          if (raceT < 13) setTimeout(() => { Snd.coin(); addCoins(5); toast('🐰 Schneehase: Wahnsinnstempo! +5 Münzen'); }, 900);
        } else if (raceT > 90 || pl.dead || pl.pos[1] < -5) racing = false;
      }
    };
    L.drawSolid = () => {
      if (hatOn) draw(MESH.hat, M4.from(58, 6.3, 8, 0.3, 0, 0.12));
      draw(MESH.bunny, M4.from(hare.pos[0], HY, hare.pos[2], 0.5 + Math.sin(clock * 0.8) * 0.3, 0, 0, 1.05 + Math.abs(Math.sin(clock * 3)) * 0.03));
      draw(bannerMesh, M4.from(-57.75, 4.5, 4), { tex: bannerTex, lit: 0 });
    };

    // ── Eissee, Schneemann mit Hut-Geheimnis, Iglu ──
    L.block(30, -0.12, 18, 28, 0.3, 24, { top: hex('#bfe6ff'), side: hex('#9ccbe8') }, 'ice');
    for (let i = 0; i < 12; i++) box(g, M4.from(lerp(18, 42, r()), 0.04, lerp(8, 28, r()), r() * 3), 1.5 + r() * 2, 0.01, 0.08, hex('#e8f6ff'));
    K.coinRing(30, 1.1, 18, 7, 10);
    const SN = hex('#f8fbff');
    sphere(g, M4.from(58, 1.5, 8), 1.6, 1.5, 1.6, 12, 8, SN, true);
    sphere(g, M4.from(58, 3.9, 8), 1.2, 1.1, 1.2, 12, 8, SN, true);
    sphere(g, M4.from(58, 5.6, 8), 0.85, 0.8, 0.85, 12, 8, SN, true);
    cyl(g, M4.from(58, 5.6, 8.8, 0, Math.PI / 2), 0.14, 0, 0.7, 6, hex('#f08020'));
    for (const s of [-1, 1]) { sphere(g, M4.from(58 + s * 0.3, 5.85, 8.7), 0.1, 0.1, 0.08, 5, 4, C.black); cyl(g, M4.from(58 + s * 1.1, 3.9, 8, 0, 0, -s * 1.1), 0.06, 0.04, 1.6, 4, hex('#6b4214')); }
    for (let k = 0; k < 3; k++) sphere(g, M4.from(58, 3.4 + k * 0.45, 9.12), 0.09, 0.09, 0.06, 5, 4, C.black);
    L.solid(56.6, 0, 6.6, 59.4, 5, 9.4, 'snowman');
    L.solid(57.3, 5, 7.3, 58.7, 6.45, 8.7, 'snowhat');
    L.block(62, 2, 8, 3, 4, 3, TER, 'snowpile');
    let hatOn = true;
    L.onLand = (gb) => {
      if (gb.tag !== 'snowhat' || !hatOn) return;
      hatOn = false;
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; L.coin('yellow', 58 + Math.cos(a) * 3.6, 1.1, 8 + Math.sin(a) * 3.6); }
      Snd.starAppear(); toast('🎩 Unter dem Hut lagen 10 Münzen!');
      burst([58, 6.5, 8], 14, { spread: 3, up: 5, life: .7, size: .18, cols: [[1, 1, 1], [1, .85, .2]], grav: 6 });
    };
    // Iglu: Kuppel aus Eisbloecken, Eingang zum Hineinkrabbeln
    const IX = 72, IZ = -24, IGL = hex('#eef6ff');
    sphere(g, M4.from(IX, 0, IZ), 4.2, 3.4, 4.2, 14, 6, (i, j) => shade(IGL, (i + j) % 2 ? 1 : 0.94), false, 0, Math.PI / 2);
    for (let j = 1; j < 4; j++) box(g, M4.from(IX, j * 0.85, IZ), 8.6 - j * 1.2, 0.05, 8.6 - j * 1.2, hex('#c8dcf0'));
    for (const s of [-1, 1]) L.block(IX + s * 1.1, 0.6, IZ + 4.8, 0.6, 1.2, 2.4, { top: IGL, side: hex('#d8e8f8') }, 'igloo');
    L.block(IX, 1.35, IZ + 4.8, 2.8, 0.3, 2.4, { top: IGL, side: hex('#d8e8f8') }, 'igloo');
    L.solid(IX - 4, 0, IZ - 4, IX + 4, 3.4, IZ - 2.2, 'igloo'); L.solid(IX - 4, 0, IZ - 2.2, IX - 2.2, 3.4, IZ + 3.6, 'igloo');
    L.solid(IX + 2.2, 0, IZ - 2.2, IX + 4, 3.4, IZ + 3.6, 'igloo'); L.solid(IX - 2.2, 1.2, IZ + 2.4, IX + 2.2, 3.4, IZ + 3.6, 'igloo');
    L.solid(IX - 2.2, 2.8, IZ - 2.2, IX + 2.2, 3.4, IZ + 2.4, 'igloo');
    K.coinRing(IX, 0.9, IZ, 1.2, 6);
    K.item(MESH.chest, [IX, 0, IZ - 0.8], (it) => {
      Snd.starAppear(); addCoins(10);
      burst([it.pos[0], it.pos[1] + 1, it.pos[2]], 16, { spread: 3, up: 4, life: .8, size: .2, cols: [[1, .85, .2], [1, 1, 1]], grav: 2 });
      toast('🧊 Im Iglu: +10 Münzen!');
    }, 1.8);

    // ── Tannenwald, Felsen, Schneehuegel ──
    for (let i = 0; i < 46; i++) {
      const x = lerp(-104, 104, r()), z = lerp(-130, 44, r());
      if (Math.abs(x) < 44 && z < -4) continue;                           // Berg
      if (x < -40 && z < 12 && z > -104) continue;                         // Rodelbahn
      if (Math.abs(x - 30) < 18 && Math.abs(z - 18) < 16) continue;        // Eissee
      if (Math.abs(x - IX) < 7 && Math.abs(z - IZ) < 8) continue;
      if (Math.abs(x) < 8 && z > 26) continue;                             // Weg zum Tor
      if (Math.abs(x + 50) < 14 && Math.abs(z - 4) < 10) continue;         // Ziel
      if (Math.abs(x - 60) < 7 && Math.abs(z - 8) < 6) continue;           // Schneemann
      if (Math.abs(x - 39) < 5 && z < 8) continue;                         // Schneeball-Bahn
      K.pine(x, z, 0, 6 + r() * 5, true);
    }
    for (let i = 0; i < 14; i++) {
      const x = lerp(-110, 110, r()), z = lerp(-150, -138, r());
      sphere(g, M4.from(x, -0.5, z), 6 + r() * 6, 3 + r() * 3, 5 + r() * 4, 10, 5, (ii, jj) => shade(hex('#f4f8ff'), 0.95 + ((ii + jj) % 2) * 0.05), true, 0, Math.PI / 2);
    }
    [[-30, 20], [45, -60], [80, 30], [-80, 30], [90, -90]].forEach(([x, z]) => K.rock(x, 0, z, 2, ROCKC));
    K.coinRing(-30, 1.1, 30, 4, 8);
    K.talker(6, 0, 44, 'Schild', [
      '★ BOUNCE-BERG ★\nVorsicht, glatt! Der See ist gefroren.',
      'Die Seerosen sind Trampoline: von Terrasse zu Terrasse springen – ganz oben wartet ein Stern.',
      'Wer lieber läuft: An der Ostflanke führt ein Serpentinenweg hinauf. Achtung, da rollen Schneebälle!',
      'Oben steht eine Berghütte. Der Schneehase dort kennt die RODELBAHN.',
      'Neben dem Frosch auf der zweiten Terrasse geht es zur echten Bounce-Seite.',
      'Der Schneemann trägt seinen Hut erstaunlich locker. Und ins Iglu passt man nur auf allen vieren.',
    ]);
    K.exit(0, 47);
    L.enemies.push(makeGrummel(-12, 20), makeGrummel(20, 36), makeGrummel(-25, -20, 8), makeGrummel(-22, -30, 15),
      makeGrummel(60, -10), makeGrummel(-70, 25), makeGrummel(80, -70));
    L.enemies.push(makeSpiky(-25, -15, 8, '#5aa0e0'), makeSpiky(10, -29, 15, '#5aa0e0'), makeSpiky(-8, -40, 22, '#5aa0e0'), makeSpiky(-60, 30, 5, '#5aa0e0'), makeSpiky(70, 10, 5, '#5aa0e0'), makeSpiky(-30, -110, 5, '#5aa0e0'));
    L.enemies.push(makeBat(6, 33, -70, '#3a4a8a'), makeBat(30, 16, -40, '#3a4a8a'), makeBat(-20, 18, -30, '#3a4a8a'), makeBat(72, 6, -24, '#3a4a8a'));
    L.enemies.push(makeHopper(26, 16, 3, '#ffffff'), makeHopper(36, 22, 3, '#bfe6ff'), makeHopper(-40, -20, 3, '#ffffff'), makeHopper(80, 0, 3, '#bfe6ff'), makeHopper(0, -60, 30, '#ffffff'));
    L.enemies.push(makeRoller([[39, -44], [39, -12], [39, 2]], { speed: 7, delay: 1, r: 1.1, tint: [1, 1, 1, 0.85] }),
      makeRoller([[22.75, -68], [22.75, -38]], { speed: 6, delay: 3, r: 1, tint: [1, 1, 1, 0.85] }));
    // ── Leben ──
    K.life.drifts(-100, -120, 100, 44, 40, { y0: 0, y1: 26, col: '#ffffff', s: 0.7, speed: 0.6 });
    K.life.critters('bunny', -60, -40, 60, 38, 4, { s: 0.7, hop: 0.3, speed: 1.1 });
    K.life.birds(5, { cx: 0, cz: -40, y: 34, col: '#cfe0f0' });
    K.life.npc(-9, 34, 'Schneekatze Frost', ['Die Seerosen federn — spring einfach drauf.',
      'Traust du dich zu einem Wettlauf? Stell dich auf die rote Kachel, dann vier Fahnen um den Berg und zurück — 45 Sekunden.',
      'Ganz oben am Gipfel wartet außerdem ein Stern. Und die Rodelbahn.'], { cat: 1, r: 4, tint: '#8ad8ff', mix: 0.35 });
    // ── Deko: Tannen, Schneemaenner, Eisbrocken, Iglu, Fahnen ──
    const schneemann = (x, y, z, r2) => {
      const W2 = hex('#f8fbff');
      sphere(g, M4.from(x, y + 0.7, z), 0.9, 0.8, 0.9, 10, 6, W2, true);
      sphere(g, M4.from(x, y + 1.7, z), 0.62, 0.58, 0.62, 10, 6, W2, true);
      sphere(g, M4.from(x, y + 2.5, z), 0.45, 0.44, 0.45, 10, 6, W2, true);
      for (const sx of [-1, 1]) sphere(g, M4.from(x + sx * 0.16, y + 2.58, z + 0.36), 0.06, 0.06, 0.04, 5, 4, C.black, true);
      cyl(g, M4.from(x, y + 2.62, z, 0, Math.PI / 2), 0.09, 0, 0.45, 6, hex('#ff8a3a'));
      cyl(g, M4.from(x, y + 2.86, z), 0.42, 0.42, 0.06, 10, hex('#2a2a32'));
      cyl(g, M4.from(x, y + 2.9, z), 0.3, 0.3, 0.42, 10, hex('#2a2a32'));
      for (const sx of [-1, 1]) box(g, M4.from(x + sx * 0.75, y + 1.8, z, 0, 0, sx * 0.5), 1.1, 0.1, 0.1, hex('#6b4214'));
      L.solid(x - 0.9, y, z - 0.9, x + 0.9, y + 2.2, z + 0.9, 'snowman');
    };
    const iglu = (x, y, z) => {
      sphere(g, M4.from(x, y, z), 3.4, 2.6, 3.4, 12, 6, (i, j) => shade(hex('#e8f2ff'), 0.92 + ((i + j) % 3) * 0.05), false, 0, Math.PI / 2);
      box(g, M4.from(x, y + 0.9, z + 3.2), 1.6, 1.8, 1.6, hex('#dfeaf8'));
      box(g, M4.from(x, y + 0.8, z + 4), 1.1, 1.5, 0.2, hex('#1a2a3a'));
      L.solid(x - 3.2, y, z - 3.2, x + 3.2, y + 2.6, z + 3.9, 'iglu');
    };
    K.scatter(-100, -118, 100, 42, 26, (x, y, z, i, r) => K.pine(x, z, y, 4 + r() * 5, true), { avoid: [[-16, -20, 16, 44]] });
    K.scatter(-95, -110, 95, 40, 10, (x, y, z, i, r) => schneemann(x, y, z, r), { avoid: [[-14, -18, 14, 44]] });
    K.scatter(-98, -112, 98, 42, 18, (x, y, z, i, r) => K.rock(x, y, z, 1 + r() * 1.8, hex('#dfe8f0')), { avoid: [[-14, -18, 14, 44]] });
    K.scatter(-90, -100, 90, 30, 3, (x, y, z) => iglu(x, y, z), { avoid: [[-20, -24, 20, 44]] });
    K.scatter(-96, -110, 96, 40, 16, (x, y, z, i, r) => {   // Wimpel-Stangen
      cyl(g, M4.from(x, y, z), 0.1, 0.08, 3 + r(), 6, hex('#6b4214'));
      for (let k = 0; k < 3; k++) g.tri([x, y + 3.2 - k * 0.5, z], [x, y + 2.9 - k * 0.5, z], [x + 1.2, y + 3.05 - k * 0.5, z + 0.2], hex(['#e03a4a', '#2f6dff', '#ffd21f'][k]));
    }, { avoid: [[-16, -20, 16, 44]] });
    // ── Auftrag: Wettlauf um den Berg (vier Fahnen in 45 Sekunden) ──
    const FLAGS = [[-46, 0, -16], [46, 0, -16], [46, 0, 22], [-46, 0, 22]];
    FLAGS.forEach(([fx, fy, fz]) => box(g, M4.from(fx, fy + 0.06, fz), 2.6, 0.12, 2.6, hex('#ffd21f')));
    K.anim(MESH.flagge, (t) => M4.from(FLAGS[0][0], 0, FLAGS[0][2], Math.sin(t) * 0.2), { lit: 0.9 });
    K.anim(MESH.flagge, (t) => M4.from(FLAGS[1][0], 0, FLAGS[1][2], Math.PI / 2 + Math.sin(t + 1) * 0.2), { lit: 0.9 });
    K.anim(MESH.flagge, (t) => M4.from(FLAGS[2][0], 0, FLAGS[2][2], Math.PI + Math.sin(t + 2) * 0.2), { lit: 0.9 });
    K.anim(MESH.flagge, (t) => M4.from(FLAGS[3][0], 0, FLAGS[3][2], -Math.PI / 2 + Math.sin(t + 3) * 0.2), { lit: 0.9 });
    box(g, M4.from(0, 0.06, 34), 5, 0.12, 5, hex('#e03a4a'));
    box(g, M4.from(0, 0.08, 34), 4, 0.1, 1.2, C.white);
    const prevUpdate = L.update;
    let race = 0, hit = [false, false, false, false], lastS = 0;
    L.update = (dt) => {
      if (prevUpdate) prevUpdate(dt);
      const p = pl.pos, at = (x, z, r2) => Math.hypot(p[0] - x, p[2] - z) < r2 && p[1] < 2.5;
      if (race <= 0 && at(0, 34, 2.6)) {
        race = 45; lastS = 45; hit = [false, false, false, false];
        Snd.chime(0); toast('\u{1F3C1} Los! Vier Fahnen in 45 Sekunden!');
      }
      if (race <= 0) return;
      race -= dt;
      if (Math.ceil(race) < lastS) { lastS = Math.ceil(race); Snd.tick(race < 5); }
      FLAGS.forEach(([fx, , fz], i) => {
        if (!hit[i] && at(fx, fz, 2.4)) { hit[i] = true; Snd.chime(3 + i * 3); toast(`\u{1F6A9} Fahne ${hit.filter(Boolean).length} / 4`); }
      });
      if (hit.every(Boolean) && at(0, 34, 2.8)) {
        race = 0;
        spawnStar('rennen', L, [0, 2.6, 30]);
        Dialog.show('Schneekatze Frost', ['Geschafft — und das im Schnee!', 'Am Ziel ist ein Stern aufgetaucht.']);
      } else if (race <= 0) { Snd.deny(); toast('\u{1F3C1} Zeit um! Zurück auf die rote Kachel.'); }
    };
    L.finish();
    return L;
  }

  /* ─────────── Welt 4: Spuk-Home ───────────
     Nacht, Friedhof und ein begehbares Herrenhaus (Idee: Spukvilla, eigenes Layout).
     Innen: Eingangshalle mit Treppe und Galerie, Bibliothek, Speisesaal, Kueche, Hinterhalle
     mit Klavier; oben Ahnengalerie, Schlafzimmer, Musikzimmer; das Dach ist begehbar.
     Sterne: die luegende Wand in der Hinterhalle (Geheimraum) und die Geisterjagd (5 Hausgeister).
     Draussen: Geisterplattformen aufs Dach, Friedhof, Sumpfteich mit Boot, Gruft zum Hineinkrabbeln. */
  function buildSpuk() {
    const L = new Level({ name: 'Spuk-Home', spawn: [0, 0, 34], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#1e1430'), fogNear: 45, fogFar: 190, light: v3.norm([0.4, -0.8, 0.45]), sky: 'night', dim: 0.62 });
    const K = kit(L), g = K.g, gw = K.glow, r = K.rnd;
    const GA = hex('#2c3a2a'), GB = hex('#243020');
    // Boden mit Sumpfteich im Osten
    [[-90, -110, 90, -10], [-90, 15, 90, 44], [-90, -10, 35, 15], [70, -10, 90, 15]].forEach(([x0, z0, x1, z1]) => K.ground(x0, z0, x1, z1, GA, GB));
    L.solid(35, -8, -10, 70, -2.4, 15, 'pondbed'); L.checker(35, -10, 70, 15, -2.4, 3, hex('#1a2a1a'), hex('#162416'));
    for (const [a, b] of [[[35, -10], [70, -10]], [[70, 15], [35, 15]], [[35, 15], [35, -10]], [[70, -10], [70, 15]]]) g.quad([a[0], -2.4, a[1]], [b[0], -2.4, b[1]], [b[0], 0, b[1]], [a[0], 0, a[1]], hex('#2a2418'));
    L.waters.push({ x0: 35, x1: 70, z0: -10, z1: 15, y: -0.35, tint: [0.2, 0.45, 0.3, 0.7], alpha: 0.75 });
    K.bounds(-88, -108, 88, 42);
    K.hills(120, 18, hex('#2a1e3a'), hex('#221830'), -2, 1.6);
    g.quad([-400, -2.05, 400], [400, -2.05, 400], [400, -2.05, -400], [-400, -2.05, -400], hex('#1a1426'));

    // ── Das Herrenhaus ──
    const WALL = { top: hex('#3a2e4a'), side: hex('#5a4a6a') }, IN = { top: hex('#6a4a4a'), side: hex('#a8807a') };
    const H1 = 8, H2 = 16, T = 0.8;
    const wx = (x0, x1, z, y0, y1, th, col, tag = 'manor') => L.block((x0 + x1) / 2, (y0 + y1) / 2, z, x1 - x0, y1 - y0, th, col, tag);
    const wz = (z0, z1, x, y0, y1, th, col, tag = 'manor') => L.block(x, (y0 + y1) / 2, (z0 + z1) / 2, th, y1 - y0, z1 - z0, col, tag);
    // Wand entlang x mit Tueren [a, b, hoehe]
    const wallX = (x0, x1, z, y0, y1, th, col, doors = []) => {
      let x = x0;
      for (const [a, b, h] of doors) { if (a > x) wx(x, a, z, y0, y1, th, col); wx(a, b, z, y0 + h, y1, th, col); x = b; }
      if (x < x1) wx(x, x1, z, y0, y1, th, col);
    };
    const wallZ = (z0, z1, x, y0, y1, th, col, doors = []) => {
      let z = z0;
      for (const [a, b, h] of doors) { if (a > z) wz(z, a, x, y0, y1, th, col); wz(a, b, x, y0 + h, y1, th, col); z = b; }
      if (z < z1) wz(z, z1, x, y0, y1, th, col);
    };
    // Aussenmauern (Nordwand mit der luegenden Stelle bei x -3..3)
    wallX(-24.8, 24.8, -35.4, 0, H2, T, WALL, [[-2.5, 2.5, 5.5]]);
    wx(-24.8, -3, -85.4, 0, H2, T, WALL); wx(3, 24.8, -85.4, 0, H2, T, WALL); wx(-3, 3, -85.4, 6, H2, T, WALL);
    box(g, M4.from(0, 3, -85.4), 6, 6, T, WALL);                                         // die Wand, die luegt
    for (const [x, y, a, h] of [[-1.2, 3.8, 0.5, 2.4], [1.1, 2.2, -0.4, 1.8], [0.2, 4.6, 0.1, 1.2]]) box(g, M4.from(x, y, -84.97, 0, 0, a), 0.08, h, 0.04, hex('#1a1424'));
    wallZ(-85.8, -35, -24.4, 0, H2, T, WALL); wallZ(-85.8, -35, 24.4, 0, H2, T, WALL);
    // Fassade: Fenster (einige erleuchtet), Sims, Tuerrahmen
    for (const [x, y, lit] of [[-18, 3, 1], [8, 3, 1], [18, 3, 1], [-18, 11, 1], [-8, 11, 1], [0, 11, 0], [8, 11, 1], [18, 11, 0]]) {
      box(lit ? gw : g, M4.from(x, y, -34.95), 2, 3, 0.1, lit ? hex('#ffd860') : hex('#1a1424'));
      box(g, M4.from(x, y - 1.7, -34.8), 2.6, 0.3, 0.4, hex('#4a3e5a'));
    }
    box(g, M4.from(0, 8.2, -34.7), 49.6, 0.5, 0.6, hex('#4a3e5a'));
    box(g, M4.from(0, 5.8, -34.8), 6.2, 0.6, 0.5, hex('#2a2238'));
    for (const s of [-1, 1]) box(g, M4.from(s * 2.9, 2.9, -34.8), 0.6, 5.8, 0.5, hex('#2a2238'));
    for (const x of [-24.4, 24.4]) for (const z of [-35.4, -85.4]) box(g, M4.from(x, H2 / 2, z), 1.4, H2 + 0.2, 1.4, hex('#3a2e4a'));
    K.portal(-9, 0, -35.05, 3, { wallTag: 'manor', scale: 0.8, lift: 3.1 });
    // Treppe vor der Tuer
    for (let i = 0; i < 2; i++) L.block(0, 0.15 + i * 0.15, -33.2 - i * 0.7, 8 - i * 1.2, 0.3 + i * 0.3, 1.4, { top: hex('#6a6a74'), side: hex('#4a4a54') }, 'step');
    // Obergeschoss-Boden und Dach
    const SLAB = { top: hex('#6a4a32'), side: hex('#7a5a4a') };
    L.block(-18, H1 + 0.25, -60, 12, 0.5, 50, SLAB, 'manor');                         // Westfluegel
    L.block(18, H1 + 0.25, -60, 12, 0.5, 50, SLAB, 'manor');                          // Ostfluegel
    L.block(0, H1 + 0.25, -72.5, 24, 0.5, 25, SLAB, 'manor');                         // hinten
    L.block(-10, H1 + 0.25, -47.5, 4, 0.5, 25, SLAB, 'manor'); L.block(10, H1 + 0.25, -47.5, 4, 0.5, 25, SLAB, 'manor');   // Galerien
    L.block(0, H2 + 0.3, -60.4, 49.6, 0.6, 50.8, { top: hex('#3a3444'), side: hex('#2a2238') }, 'manor');
    for (let x = -24; x <= 24; x += 2.4) { box(g, M4.from(x, H2 + 1, -35.1), 1.2, 0.8, 0.6, WALL); box(g, M4.from(x, H2 + 1, -85.7), 1.2, 0.8, 0.6, WALL); }
    for (let z = -84; z <= -36; z += 2.4) { box(g, M4.from(-24.7, H2 + 1, z), 0.6, 0.8, 1.2, WALL); box(g, M4.from(24.7, H2 + 1, z), 0.6, 0.8, 1.2, WALL); }
    // Tuerme an den hinteren Ecken
    for (const x of [-19, 19]) {
      cyl(g, M4.from(x, H2 + 0.6, -80), 3.6, 3.6, 7, 10, WALL.side, WALL.top);
      cyl(g, M4.from(x, H2 + 7.6, -80, 0.3), 4.4, 0, 7, 10, hex('#241a30'));
      L.solid(x - 3.2, H2 + 0.6, -83.2, x + 3.2, H2 + 7.6, -76.8, 'manor');
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; box(k % 2 ? gw : g, M4.from(x + Math.sin(a) * 3.62, H2 + 4, -80 + Math.cos(a) * 3.62, a), 0.9, 1.6, 0.1, k % 2 ? hex('#ffd860') : hex('#1a1424')); }
    }
    // Innenwaende Erdgeschoss (Tueren 4 m breit, 5,5 m hoch)
    wallZ(-60, -35.8, -12, 0, H1, 0.5, IN, [[-50, -46, 5.5]]);
    wallZ(-60, -35.8, 12, 0, H1, 0.5, IN, [[-50, -46, 5.5]]);
    wallX(-24, 24, -60, 0, H1, 0.5, IN, [[-20, -16, 5.5], [-9.5, -5.5, 5.5], [5.5, 9.5, 5.5], [16, 20, 5.5]]);
    wallZ(-85, -60, -12, 0, H1, 0.5, IN, [[-75, -71, 5.5]]);
    wallZ(-85, -60, 12, 0, H1, 0.5, IN, [[-75, -71, 5.5]]);
    // Innenwaende Obergeschoss
    wallZ(-85, -35.8, -12, H1 + 0.5, H2, 0.5, IN, [[-50, -46.5, 4], [-75, -71.5, 4]]);
    wallZ(-85, -35.8, 12, H1 + 0.5, H2, 0.5, IN, [[-50, -46.5, 4], [-75, -71.5, 4]]);
    // Gelaender der Galerie
    const RAILC = { top: hex('#8a5a2a'), side: hex('#6a4218') };
    L.block(-8, H1 + 1, -47.9, 0.3, 1, 24.2, RAILC, 'rail'); L.block(8, H1 + 1, -47.9, 0.3, 1, 24.2, RAILC, 'rail');
    L.block(-5.6, H1 + 1, -60, 5, 1, 0.3, RAILC, 'rail'); L.block(5.6, H1 + 1, -60, 5, 1, 0.3, RAILC, 'rail');
    // Treppe in der Halle (17 Stufen bis aufs Obergeschoss)
    K.stairs(0, -46, 0, 17, 0.5, 0.82, 6, 'z-', { top: hex('#8a1a2a'), side: hex('#5a3a2a') });
    for (const s of [-1, 1]) for (let i = 0; i < 17; i += 2) box(g, M4.from(s * 3.1, 0.5 * (i + 1) + 0.55, -46 - 0.82 * (i + 0.5)), 0.12, 1.1, 0.12, RAILC.side);
    // Boeden je Raum
    const floor = (x0, z0, x1, z1, y, a, b, tile = 2) => L.checker(x0, z0, x1, z1, y + 0.05, tile, a, b);
    floor(-12, -60, 12, -35, 0, hex('#d8d0c0'), hex('#2a2430'));                        // Halle: Schachbrett
    floor(-24, -60, -12, -35, 0, hex('#6a4a2a'), hex('#5a3c22'), 1.5);                 // Bibliothek
    floor(-24, -85, -12, -60, 0, hex('#4a3a5a'), hex('#3a2e4a'), 1.5);
    floor(12, -60, 24, -35, 0, hex('#7a2a2a'), hex('#6a2222'), 1.5);                   // Speisesaal
    floor(12, -85, 24, -60, 0, hex('#c8c8c0'), hex('#8a8a84'), 1);                     // Kueche
    floor(-12, -85, 12, -60, 0, hex('#5a3a2a'), hex('#4a3022'), 1.5);                  // Hinterhalle
    box(g, M4.from(0, 0.08, -41), 6, 0.02, 10, hex('#8a1a2a'));
    // Wandleuchter in allen Raeumen
    const sconce = (x, y, z, ry) => {
      box(g, M4.from(x, y - 0.3, z, ry), 0.3, 0.3, 0.3, hex('#c8a040'));
      box(gw, M4.from(x + Math.sin(ry) * 0.12, y + 0.05, z + Math.cos(ry) * 0.12, ry), 0.16, 0.4, 0.16, hex('#ffd878'));
    };
    for (const z of [-40, -55]) { sconce(-11.6, 5, z, Math.PI / 2); sconce(11.6, 5, z, -Math.PI / 2); sconce(-23.5, 5, z, Math.PI / 2); sconce(23.5, 5, z, -Math.PI / 2); }
    for (const z of [-66, -79]) { sconce(-11.6, 5, z, Math.PI / 2); sconce(11.6, 5, z, -Math.PI / 2); sconce(-23.5, 5, z, Math.PI / 2); sconce(23.5, 5, z, -Math.PI / 2); }
    for (const z of [-44, -56, -68, -80]) { sconce(-23.5, 13, z, Math.PI / 2); sconce(23.5, 13, z, -Math.PI / 2); }
    for (const x of [-7, 7]) sconce(x, 13, -84.5, 0);
    // Kronleuchter
    cyl(g, M4.from(0, 12.4, -47), 0.05, 0.05, 3.6, 4, hex('#2a2a2a'));
    cyl(g, M4.from(0, 12, -47), 2.2, 2.2, 0.3, 12, hex('#c8a040'));
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; box(gw, M4.from(Math.cos(a) * 2.1, 12.55, -47 + Math.sin(a) * 2.1), 0.14, 0.5, 0.14, hex('#fff2a8')); }
    // Bibliothek: Regale voller Buecher
    const BOOKS = ['#8a2a2a', '#2a4a8a', '#2a6a3a', '#8a6a2a', '#5a2a6a', '#3a3a3a', '#a8883a'];
    const shelf = (x, z, len, alongZ, face, y0 = 0, h = 6) => {
      const sx = alongZ ? 0.8 : len, sz = alongZ ? len : 0.8;
      L.block(x, y0 + h / 2, z, sx, h, sz, { top: hex('#4a2a14'), side: hex('#5a3418') }, 'shelf');
      for (let row = 0; row < 5; row++) {
        let u = -len / 2 + 0.2;
        while (u < len / 2 - 0.3) {
          const w = 0.14 + r() * 0.12, bh = 0.7 + r() * 0.35, c = hex(BOOKS[Math.floor(r() * BOOKS.length)]);
          const bx = alongZ ? x + face * 0.42 : x + u + w / 2, bz = alongZ ? z + u + w / 2 : z + face * 0.42;
          box(g, M4.from(bx, y0 + 0.2 + row * 1.15 + bh / 2, bz, 0, 0, (r() - 0.5) * 0.08), alongZ ? 0.12 : w, bh, alongZ ? w : 0.12, c);
          u += w + 0.02;
        }
      }
    };
    shelf(-23.4, -47.5, 22, true, 1); shelf(-14, -59.3, 3.6, false, 1); shelf(-16, -36.3, 7, false, -1);
    L.block(-17, 0.45, -47, 3, 0.9, 1.6, { top: hex('#6a4a2a'), side: hex('#4a3018') }, 'table');
    box(gw, M4.from(-17, 1.05, -47), 0.3, 0.3, 0.3, hex('#fff2a8'));
    // Arbeitszimmer dahinter: Globus + Sessel + Kamin
    sphere(g, M4.from(-20, 1.6, -70), 0.7, 0.7, 0.7, 10, 6, (i, j) => ((i + j) % 3 ? hex('#3a6ac8') : hex('#4a9a3a')), false);
    cyl(g, M4.from(-20, 0, -70), 0.1, 0.3, 0.9, 6, hex('#6a4a2a'));
    L.block(-23.2, 1.2, -78, 1, 2.4, 3, { top: hex('#6a6a6a'), side: hex('#8a8a8a') }, 'fireplace');
    box(gw, M4.from(-22.68, 0.7, -78), 0.1, 0.9, 1.8, hex('#ff8a2a'));
    // Speisesaal: lange Tafel mit Kerzenleuchtern
    L.block(18, 0.9, -47.5, 3, 0.2, 16, { top: hex('#e8e0d0'), side: hex('#c8c0b0') }, 'table');
    for (const z of [-54, -41]) for (const s of [-1, 1]) box(g, M4.from(18 + s * 1.2, 0.4, z), 0.3, 0.8, 0.3, hex('#4a3018'));
    for (let z = -54; z <= -41; z += 2.6) for (const s of [-1, 1]) {
      L.block(18 + s * 2.3, 0.3, z, 0.9, 0.6, 0.9, { top: hex('#6a2a2a'), side: hex('#4a3018') }, 'chair');
      box(g, M4.from(18 + s * 2.7, 1.1, z), 0.12, 1.2, 0.9, hex('#4a3018'));
    }
    for (const z of [-51, -44]) { cyl(g, M4.from(18, 1, z), 0.12, 0.08, 0.7, 6, hex('#c8a040')); for (const d of [-0.35, 0, 0.35]) box(gw, M4.from(18 + d, 1.85, z), 0.08, 0.3, 0.08, hex('#fff2a8')); }
    // Kueche: Arbeitsplatten, Herd, Toepfe
    L.block(23.2, 0.5, -72, 1.2, 1, 22, { top: hex('#b8b0a0'), side: hex('#6a5a4a') }, 'counter');
    L.block(18, 0.5, -84.2, 11, 1, 1.2, { top: hex('#b8b0a0'), side: hex('#6a5a4a') }, 'counter');
    for (const [x, z] of [[23.2, -66], [23.2, -76], [16, -84.2]]) { cyl(g, M4.from(x, 1, z), 0.45, 0.45, 0.6, 8, hex('#3a3a44')); sphere(gw, M4.from(x, 1.55, z), 0.35, 0.08, 0.35, 8, 3, hex('#8aff5a')); }
    // Hinterhalle: Klavier, Portraits, Hinweis auf die luegende Wand
    L.block(-6, 0.7, -80, 4, 1.4, 2, { top: hex('#1a1a1a'), side: hex('#222222') }, 'piano');
    box(g, M4.from(-6, 1.42, -78.95), 3.6, 0.06, 0.4, C.white);
    for (let k = 0; k < 14; k++) box(g, M4.from(-7.7 + k * 0.26, 1.46, -79.05), 0.1, 0.04, 0.22, C.black);
    box(g, M4.from(-6, 2.1, -80.8), 4, 1.4, 0.3, hex('#1a1a1a'));
    const portrait = (x, y, z, ry, col) => {
      box(g, M4.from(x, y, z, ry), 1.8, 2.4, 0.12, hex('#c8a040'));
      box(g, M4.from(x + Math.sin(ry) * 0.07, y, z + Math.cos(ry) * 0.07, ry), 1.4, 2, 0.02, col);
      sphere(gw, M4.from(x + Math.sin(ry) * 0.09, y + 0.3, z + Math.cos(ry) * 0.09, ry), 0.12, 0.05, 0.02, 6, 3, hex('#ffe040'));
    };
    portrait(-11.7, 4, -66, Math.PI / 2, hex('#3a2a4a')); portrait(11.7, 4, -66, -Math.PI / 2, hex('#2a3a4a'));
    portrait(-11.7, 12, -42, Math.PI / 2, hex('#4a2a2a')); portrait(11.7, 12, -42, -Math.PI / 2, hex('#2a4a3a'));
    portrait(-23.5, 12, -55, Math.PI / 2, hex('#3a3a2a')); portrait(-23.5, 12, -65, Math.PI / 2, hex('#2a2a3a')); portrait(-23.5, 12, -75, Math.PI / 2, hex('#4a2a3a'));
    K.talker(4, 0, -82, 'Schild', ['Psst … die NORDWAND dieses Zimmers sagt nicht die Wahrheit.']);
    // Geheimraum hinter der luegenden Wand
    wz(-93.8, -85.8, -5.4, 0, 6.6, T, WALL); wz(-93.8, -85.8, 5.4, 0, 6.6, T, WALL); wx(-5.8, 5.8, -93.4, 0, 6.6, T, WALL);
    L.block(0, 6.9, -89.8, 11.6, 0.6, 8, { top: hex('#3a3444'), side: hex('#2a2238') }, 'manor');
    cyl(g, M4.from(0, 7.2, -89.8, Math.PI / 4), 6.5, 0, 4, 4, hex('#241a30'));
    for (const x of [-4, 4]) cyl(gw, M4.from(x, 0, -92.5), 0.12, 0.12, 0.9, 6, hex('#ffe8a0'));
    K.star('spuk', [0, 1.8, -89.5]);
    // Obergeschoss: Ahnengalerie (West), Schlafzimmer (Ost), Musikzimmer (hinten)
    const bed = (x, z) => {
      L.block(x, H1 + 1, z, 3.2, 1, 4.6, { top: hex('#8a2a4a'), side: hex('#4a2a1a') }, 'bed');
      box(g, M4.from(x, H1 + 1.6, z - 1.8), 2.8, 0.35, 0.9, hex('#e8e0f0'));
      for (const s of [-1, 1]) for (const t of [-1, 1]) box(g, M4.from(x + s * 1.5, H1 + 2, z + t * 2.2), 0.2, 3, 0.2, hex('#4a2a1a'));
      box(g, M4.from(x, H1 + 3.5, z), 3.2, 0.12, 4.6, hex('#6a1a3a'));
    };
    bed(18, -45); bed(18, -58);
    L.block(22.8, H1 + 2.2, -72, 1.6, 4.4, 4, { top: hex('#4a2a1a'), side: hex('#5a3418') }, 'wardrobe');
    shelf(-23.4, -72, 12, true, 1, H1 + 0.5, 5);
    // Musikzimmer: Harfe + Notenstaender
    for (let k = 0; k < 7; k++) box(g, M4.from(4 + k * 0.18, H1 + 0.5 + (1 + k * 0.25) / 2, -76), 0.03, 1 + k * 0.25, 0.03, hex('#e8d8a0'));
    box(g, M4.from(4.6, H1 + 0.5 + 1.1, -76, 0, 0, 0.9), 0.12, 2.8, 0.12, hex('#c8a040'));
    box(g, M4.from(-3, H1 + 1.6, -70, 0, -0.5), 1.4, 0.05, 1, hex('#3a3a3a')); cyl(g, M4.from(-3, H1 + 0.5, -70), 0.05, 0.05, 1.2, 4, hex('#3a3a3a'));
    // Muenzen im Haus
    K.coinRing(0, 1.1, -42, 3, 8); K.coinLine([-20, 1.1, -40], [-20, 1.1, -56], 4); K.coinLine([18, 2.2, -41], [18, 2.2, -54], 4);
    K.coinRing(18, 1.1, -73, 2.5, 6); K.coinLine([-3, 9.6, -64], [-3, 9.6, -82], 4); K.coinLine([-10, 9.6, -38], [-10, 9.6, -58], 5);
    K.coinRing(-18, 9.6, -62, 3, 6);
    // Dach: Muenzen und eine Truhe
    K.coinRing(0, 17.7, -60, 5, 10);
    K.item(MESH.chest, [0, H2 + 0.6, -48], (it) => {
      Snd.starAppear(); addCoins(10);
      burst([it.pos[0], it.pos[1] + 1, it.pos[2]], 16, { spread: 3, up: 4, life: .8, size: .2, cols: [[1, .85, .2], [1, 1, 1]], grav: 2 });
      toast('🦇 Dachschatz: +10 Münzen!');
    }, 2);

    // ── Geisterplattformen an der Ostseite hinauf aufs Dach ──
    const GH = hex('#c8b8ff');
    [[30, 2.6, -40], [34, 5.2, -45], [30, 7.8, -50], [34, 10.4, -55], [30, 13, -60], [34, 15.6, -65]].forEach(([x, top, z], i) => L.blinker(x, top, z, 3.2, 3.2, GH, 2.4, i % 2 ? 0.5 : 0));
    L.block(27.6, 16.3, -65, 5.6, 0.6, 3.2, { top: hex('#3a3444'), side: hex('#2a2238') }, 'ledge');   // Sims am Dach

    // ── Draussen: Weg, Laternen, Eisenzaun, Friedhof, Gruft, Sumpf ──
    box(g, M4.from(0, 0.02, 2), 5, 0.02, 72, hex('#5a5048'));
    for (let z = 32; z >= -30; z -= 10) for (const s of [-1, 1]) K.lamp(s * 4, z, 0, hex('#ff9a3a'), hex('#1a1424'));
    const IRON = hex('#1a1424');
    const ironFence = (x0, z0, x1, z1) => {
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = alongX ? x1 - x0 : z1 - z0, n = Math.round(Math.abs(len) / 0.5);
      for (let i = 0; i <= n; i++) {
        const x = alongX ? lerp(x0, x1, i / n) : x0, z = alongX ? z0 : lerp(z0, z1, i / n);
        box(g, M4.from(x, 0.9, z), 0.07, 1.8, 0.07, IRON);
        cyl(g, M4.from(x, 1.8, z), 0.07, 0, 0.22, 4, IRON);
      }
      for (const h of [0.3, 1.5]) box(g, M4.from((x0 + x1) / 2, h, (z0 + z1) / 2), alongX ? Math.abs(len) : 0.08, 0.08, alongX ? 0.08 : Math.abs(len), IRON);
      L.solid(Math.min(x0, x1) - 0.08, 0, Math.min(z0, z1) - 0.08, Math.max(x0, x1) + 0.08, 1.9, Math.max(z0, z1) + 0.08, 'fence');
    };
    ironFence(-80, 22, -5, 22); ironFence(5, 22, 80, 22);
    for (const s of [-1, 1]) { box(g, M4.from(s * 5, 1.6, 22), 0.9, 3.2, 0.9, hex('#3a3444')); sphere(gw, M4.from(s * 5, 3.5, 22), 0.35, 0.35, 0.35, 8, 5, hex('#ff9a3a'), true); L.solid(s * 5 - 0.45, 0, 21.55, s * 5 + 0.45, 3.2, 22.45, 'post'); }
    // Friedhof im Westen
    const STONE = { top: hex('#8a8a92'), side: hex('#6a6a74') };
    for (let i = 0; i < 24; i++) {
      const x = -72 + (i % 6) * 9 + ((i * 7) % 3), z = -30 + Math.floor(i / 6) * 11 + ((i * 5) % 4);
      if (i % 5 === 3) {
        L.block(x, 1.1, z, 0.35, 2.2, 0.35, STONE, 'tomb'); box(g, M4.from(x, 1.6, z), 1.3, 0.3, 0.3, STONE.side);
      } else {
        L.block(x, 0.9, z, 1.4, 1.8, 0.4, STONE, 'tomb');
        cyl(g, M4.from(x, 1.8, z, 0, Math.PI / 2), 0.7, 0.7, 0.4, 8, STONE.side);
      }
      box(g, M4.from(x, 0.04, z + 1.4), 1.2, 0.08, 2, hex('#2a2418'));
    }
    const deadTree = (x, z, h = 7) => {
      cyl(g, M4.from(x, 0, z), 0.5, 0.25, h, 6, hex('#2a2018'));
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3 + x, y = h * (0.45 + k * 0.1);
        cyl(g, M4.from(x, y, z, a, 0.9 + (k % 2) * 0.3), 0.18, 0.04, 2.2 + (k % 3) * 0.6, 4, hex('#2a2018'));
      }
      L.solid(x - 0.5, 0, z - 0.5, x + 0.5, h, z + 0.5, 'tree');
    };
    [[-40, -45], [-78, 8], [-55, 15], [60, -40], [75, 30], [-30, 30], [45, 35], [80, -95], [-80, -95], [30, -100]].forEach(([x, z], i) => deadTree(x, z, 6 + (i % 3) * 1.5));
    // Kuerbisse mit leuchtenden Gesichtern
    [[-8, 26], [8, 26], [-30, -10], [30, -10], [-50, 10], [-66, -20], [12, -30], [-12, -30]].forEach(([x, z]) => {
      sphere(g, M4.from(x, 0.6, z), 0.8, 0.6, 0.8, 10, 6, (i) => (i % 2 ? hex('#e07a1a') : hex('#c8681a')), true);
      cyl(g, M4.from(x, 1.15, z), 0.08, 0.06, 0.25, 4, hex('#4a6a2a'));
      for (const s of [-1, 1]) box(gw, M4.from(x + s * 0.28, 0.75, z + 0.76), 0.2, 0.2, 0.05, hex('#ffe060'));
      box(gw, M4.from(x, 0.42, z + 0.77), 0.5, 0.1, 0.05, hex('#ffe060'));
    });
    // Gruft zum Hineinkrabbeln (Osten)
    const CX = 50, CZ = -62;
    L.block(CX, 2.5, CZ - 4, 8, 5, 1, STONE, 'crypt');
    L.block(CX - 3.5, 2.5, CZ, 1, 5, 7, STONE, 'crypt'); L.block(CX + 3.5, 2.5, CZ, 1, 5, 7, STONE, 'crypt');
    L.block(CX - 2, 2.5, CZ + 4, 3, 5, 1, STONE, 'crypt'); L.block(CX + 2.5, 2.5, CZ + 4, 1, 5, 1, STONE, 'crypt');
    L.block(CX + 0.5, 3.075, CZ + 4, 2, 3.85, 1, STONE, 'crypt');
    L.block(CX, 5.25, CZ, 8, 0.5, 9, STONE, 'crypt');
    cyl(g, M4.from(CX, 5.5, CZ, Math.PI / 4), 5.6, 0, 2.4, 4, STONE.side);
    K.coinRing(CX, 1.1, CZ, 1.8, 6);
    // Sumpfteich: Ruderboot, Schilf, Seerosen
    L.block(52, -0.1, 2, 2.6, 0.5, 6, { top: hex('#6a4a2a'), side: hex('#5a3a1a') }, 'boat');
    for (const s of [-1, 1]) box(g, M4.from(52 + s * 1.2, 0.35, 2), 0.2, 0.5, 6, hex('#4a3018'));
    box(g, M4.from(52, 0.35, 5), 2.6, 0.5, 0.2, hex('#4a3018')); box(g, M4.from(52, 0.35, -1), 2.6, 0.5, 0.2, hex('#4a3018'));
    K.tufts(33, -12, 37, 17, 30, 0, hex('#4a6a2a')); K.tufts(68, -12, 72, 17, 30, 0, hex('#4a6a2a'));
    K.coinLine([40, 0.8, 2], [48, 0.8, 2], 3); K.coinLine([56, 0.8, 2], [66, 0.8, 2], 3);
    // Nebelschwaden
    const fogPuffs = Array.from({ length: 16 }, (_, i) => [lerp(-80, 80, r()), 0.4, lerp(-100, 38, r()), 3 + r() * 4, r() * 6]);
    L.drawAlpha = () => {
      for (const [x, y, z, s, ph] of fogPuffs) draw(MESH.ball, M4.from(x + Math.sin(clock * 0.2 + ph) * 3, y, z, 0, 0, 0, s, s * 0.3, s), { tint: [0.7, 0.65, 0.9, 1], alpha: 0.08, lit: 0 });
    };
    // Geisterjagd: fuenf Hausgeister, besiegte bleiben weg
    let hunted = 0;
    L.onDefeat = (e) => {
      if (!e.hunt) return;
      e.t = 1e9; hunted++;
      toast(`👻 Hausgeister: ${hunted} / 5`);
      if (hunted === 5) {
        spawnStar('geister', L, [0, 2.5, -42]);
        setTimeout(() => Dialog.show('???', ['Buuuh … na gut, du hast gewonnen.', 'In der Eingangshalle ist ein Stern aufgetaucht.']), 600);
      }
    };
    const houseGhosts = [[0, 0.3, -42, 4, 0.5], [-18, 0.3, -48, 3.5, -0.6], [18, 0.3, -66, 3.5, 0.55], [-18, H1 + 0.8, -62, 4.5, -0.45], [18, H1 + 0.8, -70, 4, 0.5]]
      .map(([x, y, z, rr, w], i) => Object.assign(makeGhost(x, y, z, rr, w, i * 1.3), { hunt: true }));
    L.enemies.push(...houseGhosts);
    L.enemies.push(makeGhost(-45, 0.6, -10, 7, 0.35), makeGhost(-60, 0.6, -25, 5, -0.45), makeGhost(50, 0.4, 2, 9, 0.3));
    L.enemies.push(makeBat(-40, 9, -45, '#3a1a4a'), makeBat(0, 21, -60, '#3a1a4a'), makeBat(34, 12, -52, '#3a1a4a'), makeBat(-60, 7, 0, '#3a1a4a'), makeBat(60, 8, -70, '#3a1a4a'));
    L.enemies.push(makeSpiky(-50, -35, 3, '#5a3a1a'), makeSpiky(-20, 8, 3, '#5a3a1a'), makeSpiky(30, -25, 3, '#5a3a1a'), makeSpiky(70, -85, 3, '#5a3a1a'));
    L.enemies.push(makeHopper(-66, -2, 3, '#8aff5a'), makeHopper(20, 10, 3, '#8aff5a'), makeHopper(-30, -95, 3, '#8aff5a'), makeHopper(18, -80, 3, '#8aff5a'));
    L.enemies.push(makeGrummel(-10, 8), makeGrummel(15, 30), makeGrummel(60, -20), makeGrummel(-70, -60));
    K.coinLine([-6, 1.1, 30], [6, 1.1, 30], 5);
    K.coinRing(-45, 1.1, -10, 3, 8);
    K.talker(7, 0, 34, 'Schild', [
      '★ SPUK-HOME ★\nHier spukt es … ein bisschen mehr als früher.',
      'Das alte HERRENHAUS steht offen. Innen treiben fünf HAUSGEISTER ihr Unwesen – wer alle erwischt, bekommt einen Stern. (Draufspringen oder hauen!)',
      'Die GEISTERPLATTFORMEN an der Ostseite sind nur manchmal da. Zähl im Kopf mit, dann kommst du aufs Dach.',
      'Das Bild neben der Haustür führt zur echten Home-Seite.',
      'In die alte Gruft kommt man nur auf allen vieren. Und in der Hinterhalle … lies das Schild.',
    ]);
    K.exit(0, 39);
    // ── Leben ──
    K.life.glows(-70, -90, 70, 36, 26, { y: 0.5, yr: 6, col: '#8affc8', s: 1.1, speed: 0.5 });
    K.life.drifts(-70, -90, 70, 36, 16, { y0: 0, y1: 16, col: '#6a6a78', s: 0.9, speed: 0.5 });
    K.life.critters('mouse', -50, -50, 50, 30, 5, { speed: 1 });
    K.life.fish(37, -8, 68, 13, -0.35, 4, { col: '#6a9a5a', jump: false });
    K.life.npc(-12, 30, 'Hausmeisterin Nell', ['Eine Wand hier lügt. Lauf einfach hinein.',
      'Fünf Kürbislichter stehen herum, drei im Hof, zwei hoch oben. Zünde alle an — berühren reicht.',
      'Die Geister zähle ich schon lange nicht mehr — fang du sie doch.'], { cat: 2, r: 5, tint: '#9a8ab8', mix: 0.4 });
    // ── Deko: Grabsteine, tote Baeume, Laternen, Kuerbisse ──
    const grab = (x, y, z, r2) => {
      const ST = hex('#8a8a96');
      box(g, M4.from(x, y + 0.8, z, (r2() - 0.5) * 0.3), 1.2, 1.6, 0.3, ST);
      cyl(g, M4.from(x, y + 1.6, z, 0, Math.PI / 2), 0.6, 0.6, 0.3, 10, ST);
      box(g, M4.from(x, y + 0.12, z), 1.7, 0.25, 0.8, shade(ST, 0.85));
      L.solid(x - 0.7, y, z - 0.35, x + 0.7, y + 1.8, z + 0.35, 'grave');
    };
    const totbaum = (x, y, z, r2) => {
      const D = hex('#3a3038');
      cyl(g, M4.from(x, y, z), 0.45, 0.28, 5 + r2() * 2, 7, D);
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * TAU;
        box(g, M4.from(x + Math.cos(a) * 0.8, y + 3.4 + k * 0.4, z + Math.sin(a) * 0.8, a, 0, 0.9), 2.4, 0.18, 0.18, D);
      }
      L.solid(x - 0.5, y, z - 0.5, x + 0.5, y + 5, z + 0.5, 'tree');
    };
    K.scatter(-80, -100, 80, 40, 14, (x, y, z, i, r) => grab(x, y, z, r), { avoid: [[-10, 20, 10, 40]] });
    K.scatter(-80, -100, 80, 40, 10, (x, y, z, i, r) => totbaum(x, y, z, r), { avoid: [[-12, 18, 12, 42]] });
    K.scatter(-80, -100, 80, 40, 12, (x, y, z, i, r) => {   // Kuerbis mit Kerze
      sphere(g, M4.from(x, y + 0.42, z), 0.6, 0.45, 0.6, 10, 6, hex('#e08a2a'), true);
      box(g, M4.from(x, y + 0.9, z), 0.1, 0.22, 0.1, hex('#4a6a2a'));
      sphere(K.glow, M4.from(x, y + 0.42, z + 0.4), 0.18, 0.14, 0.1, 6, 4, hex('#ffe14a'), true);
      K.life.glows(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 1, { y: y + 0.4, yr: 0.6, col: '#ffb02a', s: 0.7, speed: 0.2 });
    }, { avoid: [[-8, 20, 8, 40]] });
    K.scatter(-80, -100, 80, 40, 10, (x, y, z) => K.lamp(x, z, y, hex('#9affc8')), { avoid: [[-8, 18, 8, 40]] });
    // ── Auftrag: fünf Kürbislichter anzünden ──
    K.quest('kuerbis', MESH.kuerbis, [[-21, 24.8, -83], [-9, 17.8, -35], [-30, 1.1, 10], [20, 1.1, -20], [40, 1.1, 20]],
      { icon: '\u{1F383}', label: 'Kürbislicht', speaker: 'Hausmeisterin Nell', starPos: [0, 2.4, 20], r: 2,
        done: ['Alle fünf Kürbisse brennen — jetzt traut sich sogar das Haus aus dem Nebel.', 'Vor dem Tor ist ein Stern aufgetaucht.'] });
    L.finish();
    return L;
  }

  /* ─────────── Welt 5: Such-Uhrwerk ───────────
     Messing-Maschinenhof in der Abenddaemmerung, dahinter der grosse Uhrwerk-Turm (Idee: Uhrturm
     von innen, eigenes Layout). Hof: Kolben-Aufzuege, Foerderband, Uhr mit der echten Uhrzeit,
     Stern fuer drei verlegte Lupen. Turm: Kolben, Schiebebuehne, Foerderband, Kolbenschacht,
     Wandsimse und ein kreisender Uhrzeiger bis zur Spitze — dort der zweite Stern. */
  function buildUhrwerk() {
    const L = new Level({ name: 'Such-Uhrwerk', spawn: [0, 0, 26], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#b88048'), fogNear: 110, fogFar: 330, light: v3.norm([-0.5, -0.6, 0.6]), sky: 'brass' });
    const K = kit(L), g = K.g, gw = K.glow, r = K.rnd;
    K.ground(-80, -130, 80, 40, hex('#8a6a3a'), hex('#76582e'));
    K.bounds(-78, -128, 78, 38);
    K.hills(150, 18, hex('#6a4a2a'), hex('#5a3e22'), -2, 1.8);
    g.quad([-400, -2.05, 400], [400, -2.05, 400], [400, -2.05, -400], [-400, -2.05, -400], hex('#5a3e22'));
    const DARK = { top: hex('#6a4e2a'), side: hex('#4e3a20') }, BRASS = { top: hex('#d8aa4a'), side: hex('#b08a3a') };
    const IRON = { top: hex('#6a6a72'), side: hex('#4a4a52') };
    // Uhrturm im Hof mit echter Uhrzeit
    L.block(0, 11, -31, 12, 22, 10, DARK, 'clocktower');
    for (let y = 2; y < 22; y += 4) box(g, M4.from(0, y, -25.95), 12.2, 0.3, 0.1, hex('#c89a3a'));
    disc(g, M4.from(0, 15, -25.88), 4.6, 24, hex('#c89a3a'));
    disc(g, M4.from(0, 15, -25.84), 4.2, 24, hex('#f4ecd4'));
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; box(g, M4.from(Math.sin(a) * 3.6, 15 + Math.cos(a) * 3.6, -25.8, 0, 0, -a), 0.22, i % 3 ? 0.4 : 0.8, 0.05, hex('#3a2a1a')); }
    // Kolben-Aufzuege
    const PIST = [[12, -18, 4, 3.5, 0], [12, -24.5, 10, 4, 1.6], [9.5, -30, 16, 4.2, 3.2]];
    const pistons = PIST.map(([x, z, mid, amp, ph]) => {
      cyl(g, M4.from(x, 0, z), 1.6, 1.6, 0.6, 12, hex('#5a5a62'));
      return L.mover(x, 0, z, 4, 1, 4, BRASS, (t) => [0, mid + amp * Math.sin(t * 1.1 + ph), 0], 'piston');
    });
    // Foerderband: schiebt nach Osten, die Lupe liegt am Westende
    const belt = L.block(-20, 0.25, 0, 20, 0.5, 4, { top: hex('#2a2a2e'), side: hex('#1e1e22') }, 'conveyor');
    belt.dir = [9, 0];
    L.block(-20, 1.5, -2.6, 20, 2, 1.2, DARK, 'beltwall'); L.block(-20, 1.5, 2.6, 20, 2, 1.2, DARK, 'beltwall');
    L.block(-33, 0.5, 0, 3, 1, 3, BRASS, 'plat');
    // Zahnrad auf Stelzen — darunter nur krabbelnd erreichbar
    for (const [dx, dz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) L.block(-20 + dx, 0.575, -24 + dz, 0.6, 1.15, 0.6, DARK, 'post');
    L.solid(-24, 1.15, -28, -16, 1.75, -20, 'gear');
    let lupen = 0;
    const takeLupe = () => {
      lupen++;
      Snd.chime(lupen * 3);
      toast(`🔍 Lupe ${lupen} / 3`);
      if (lupen === 3) {
        spawnStar('uhrwerk', L, [18, 3.2, -4]);
        Dialog.show('Such-Uhrwerk', ['Alle drei Lupen gefunden!', 'Vor dem Suchrahmen ist ein Stern aufgetaucht.']);
      }
    };
    K.item(MESH.lupe, [0, 22.2, -31], takeLupe);
    K.item(MESH.lupe, [-33, 1.1, 0], takeLupe);
    K.item(MESH.lupe, [-20, 0.1, -24], takeLupe, 1.4);
    const searchTex = labelTexture((c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, 384); gr.addColorStop(0, '#6a4a22'); gr.addColorStop(1, '#c89a4a');
      c.fillStyle = gr; c.fillRect(0, 0, w, 384);
      c.fillStyle = '#fff'; c.beginPath(); c.roundRect ? c.roundRect(40, 150, 432, 84, 42) : c.rect(40, 150, 432, 84); c.fill();
      c.fillStyle = '#555'; c.font = 'bold 34px Arial, sans-serif'; c.fillText('search.glappa.de', 76, 204);
      c.strokeStyle = '#333'; c.lineWidth = 8; c.beginPath(); c.arc(420, 186, 18, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(433, 199); c.lineTo(452, 218); c.stroke();
      c.fillStyle = '#4a2a0a'; c.fillRect(0, 384, w, 64);
      c.fillStyle = '#ffe9a8'; c.font = 'italic 900 30px Arial Black, sans-serif'; c.fillText('5  Such-Uhrwerk', 26, 427);
    }, 512, 448);
    K.portal(18, 0, -8, 4, { scale: 1.1, tex: searchTex });

    // ── Der grosse Uhrwerk-Turm (innen hohl, Tuer im Sueden) ──
    const TX = 0, TZ = -95, TH = 60, WALLC = { top: hex('#7a5a32'), side: hex('#8a6a42') };
    L.block(TX - 14.5, TH / 2, TZ, 1, TH, 30, WALLC, 'clockwall'); L.block(TX + 14.5, TH / 2, TZ, 1, TH, 30, WALLC, 'clockwall');
    L.block(TX, TH / 2, TZ - 14.5, 28, TH, 1, WALLC, 'clockwall');
    L.block(TX - 8.5, TH / 2, TZ + 14.5, 11, TH, 1, WALLC, 'clockwall'); L.block(TX + 8.5, TH / 2, TZ + 14.5, 11, TH, 1, WALLC, 'clockwall');
    L.block(TX, (6 + TH) / 2, TZ + 14.5, 6, TH - 6, 1, WALLC, 'clockwall');
    L.block(TX, TH + 0.5, TZ, 30, 1, 30, WALLC, 'clockwall');
    for (let y = 8; y < TH; y += 8) {                                                                  // Messingbaender aussen
      for (const s of [-1, 1]) { box(g, M4.from(TX + s * 15.05, y, TZ), 0.1, 0.5, 30.2, hex('#b08a3a')); box(g, M4.from(TX, y, TZ + s * 15.05), 30.2, 0.5, 0.1, hex('#b08a3a')); }
    }
    cyl(g, M4.from(TX, TH + 1, TZ, Math.PI / 4), 22, 0, 16, 4, hex('#6a4a2a'));                          // Pyramidendach
    cyl(g, M4.from(TX, TH + 17, TZ), 0.3, 0.3, 5, 6, hex('#c89a3a'));
    sphere(gw, M4.from(TX, TH + 22.4, TZ), 0.8, 0.8, 0.8, 8, 6, hex('#ffe680'), true);
    // Grosses Zifferblatt an der Suedseite (echte Uhrzeit)
    disc(g, M4.from(TX, 44, TZ + 15.04), 9, 32, hex('#c89a3a'));
    disc(g, M4.from(TX, 44, TZ + 15.08), 8.3, 32, hex('#f4ecd4'));
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; box(g, M4.from(TX + Math.sin(a) * 7.2, 44 + Math.cos(a) * 7.2, TZ + 15.12, 0, 0, -a), 0.4, i % 3 ? 0.8 : 1.6, 0.05, hex('#3a2a1a')); }
    for (const s of [-1, 1]) box(g, M4.from(TX + s * 3.3, 3.1, TZ + 15.1), 0.6, 6.2, 0.3, hex('#5a3a1a'));   // Torrahmen
    box(g, M4.from(TX, 6.3, TZ + 15.1), 7.2, 0.6, 0.3, hex('#5a3a1a'));
    for (const s of [-1, 1]) for (let y = 14; y < TH - 6; y += 12) box(gw, M4.from(TX + s * 15.02, y, TZ, Math.PI / 2), 1.2, 3, 0.08, hex('#ffd878'));
    // innen: Boden, Stuetzsaeulen, Laternen
    L.checker(TX - 14, TZ - 14, TX + 14, TZ + 14, 0.05, 2, hex('#6a5a4a'), hex('#5a4a3a'));
    for (const [x, z] of [[-13.2, -108.2], [13.2, -108.2], [-13.2, -81.8], [13.2, -81.8]]) cyl(g, M4.from(x, 0, z), 0.6, 0.6, TH, 8, hex('#6a4a2a'));
    for (let y = 6; y < TH; y += 9) for (const [x, z, ry] of [[-13.9, -95, Math.PI / 2], [13.9, -95, -Math.PI / 2], [0, -108.9, 0]]) box(gw, M4.from(x, y, z, ry), 0.8, 0.8, 0.1, hex('#ffd878'));

    // Stufe 1: Kolben an der Tuer -> Simse an der Ostwand
    const SIMS = { top: hex('#c89a3a'), side: hex('#8a6a3a') };
    const tp = [];
    tp.push(L.mover(10.5, 0, -85, 3.5, 1, 3.5, BRASS, (t) => [0, 2.2 + 2.1 * Math.sin(t * 1.2), 0], 'piston'));
    K.plat(12.5, 5.5, -91, 3, 4, SIMS, 0.8, 'ledge');
    K.plat(12.5, 7.7, -98, 3, 4, SIMS, 0.8, 'ledge');
    K.plat(12.5, 9.9, -105, 3, 4, SIMS, 0.8, 'ledge');
    // Stufe 2: Schiebebuehne an der Nordwand
    L.mover(0, 11.7, -107.5, 3, 0.8, 3, BRASS, (t) => [8.5 * Math.cos(t * 0.55), 0, 0], 'slider');
    K.plat(-12, 14.3, -107, 4, 4, SIMS, 0.8, 'ledge');
    // Stufe 3: Foerderband an der Westwand schiebt nach Norden
    const tbelt = L.block(-12.25, 13.9, -96, 3.5, 0.8, 18, { top: hex('#2a2a2e'), side: hex('#1e1e22') }, 'conveyor');
    tbelt.dir = [0, -6];
    K.plat(-12, 16.5, -85, 4, 4, SIMS, 0.8, 'ledge');
    // Stufe 4: Kolbenschacht in der Mitte (fuenf Kolben, versetzt im Takt)
    const SHAFT = [[-6.5, -85, 17.5], [-2, -88.5, 20], [2.5, -85, 22.5], [7, -88.5, 25], [6.5, -94, 27.5]];
    SHAFT.forEach(([x, z, mid], i) => tp.push(L.mover(x, 0, z, 3.5, 1, 3.5, BRASS, (t) => [0, mid - 0.5 + 2 * Math.sin(t * 1.3 - i * 1.25), 0], 'piston')));
    // Stufe 5: Simse an der Ostwand, dann der kreisende Uhrzeiger
    K.plat(12.25, 31, -95, 3.5, 4, SIMS, 0.8, 'ledge');
    K.plat(12.25, 33.2, -88, 3.5, 4, SIMS, 0.8, 'ledge');
    K.plat(7, 35.4, -82.5, 4, 3, SIMS, 0.8, 'ledge');
    const HAND = { top: hex('#3a2a1a'), side: hex('#2a1e12') }, OM = 0.32;
    for (const rr of [2, 5, 8]) L.mover(TX, 37.2, TZ, 3, 0.8, 3, HAND, (t) => [Math.cos(t * OM - 0.35) * rr, 0, -Math.sin(t * OM - 0.35) * rr], 'hand');
    // Spitze: Plattform an der Westwand mit dem Stern
    K.plat(-11.75, 39.8, -95, 4.5, 8, BRASS, 0.8, 'ledge');
    K.star('uhrspitze', [-12, 42, -95]);
    for (const [x, y, z] of [[12.5, 7, -91], [12.5, 9.2, -98], [12.5, 11.4, -105], [0, 13.2, -107.5], [-12, 15.8, -107], [-12, 15.5, -100], [-12, 15.5, -92], [-12, 18, -85], [12.25, 32.5, -95], [12.25, 34.7, -88], [7, 36.9, -82.5], [0, 39, -95]]) L.coin('yellow', x, y, z);
    K.coinRing(TX, 1.1, TZ, 4, 8);
    // Zahnraeder an den Innenwaenden (drehen sich), Pendel an der Suedwand
    const WG = [[-13.6, 22, -100, 1], [13.6, 18, -86, -1], [0, 48, -108.6, 1], [-13.6, 44, -88, -1], [13.6, 50, -104, 1]];
    L.drawSolid = () => {
      for (const m of pistons.concat(tp)) {
        const top = m.base[1] + m.off[1], w = tp.includes(m) ? 0.4 : 1;
        draw(MESH.rod, M4.from(m.base[0], 0, m.base[2], 0, 0, 0, w, Math.max(0.1, top), w));
      }
      draw(MESH.gear, M4.from(-20, 1.15, -24, clock * 0.4));
      for (let i = 0; i < 3; i++) draw(MESH.gear, M4.mul(M4.from(-35.4, 6 + i * 7, -20 + i * 12, 0, 0, Math.PI / 2), M4.from(0, 0, 0, (i % 2 ? -1 : 1) * clock * 0.3)));
      for (const [x, y, z, s] of WG) {
        const spin = M4.from(0, 0, 0, s * clock * 0.25, 0, 0, 1.4);
        draw(MESH.gear, M4.mul(z < -108 ? M4.from(x, y, z, 0, Math.PI / 2) : M4.from(x, y, z, 0, 0, Math.PI / 2), spin));
      }
      draw(MESH.gear, M4.mul(M4.from(-58, 5, -98.6, 0, Math.PI / 2), M4.from(0, 0, 0, clock * 1.2, 0, 0, 1.1)));
      draw(MESH.gear, M4.from(TX, 36.6, TZ, -clock * OM, 0, 0, 0.5));
      const sw = Math.sin(clock * 1.4) * 0.5;
      draw(MESH.rod, M4.mul(M4.from(TX, 58, TZ - 12.5, 0, 0, sw), M4.from(0, -26, 0, 0, 0, 0, 0.12, 26, 0.12)));
      draw(MESH.gear, M4.mul(M4.from(TX, 58, TZ - 12.5, 0, 0, sw), M4.from(0, -27, 0, 0, Math.PI / 2, 0, 0.55)));
      for (let i = 0; i < 10; i++) {
        const x = -30 + ((i * 2 + clock * 9) % 20);
        draw(MESH.cube, M4.from(x, 0.52, 0, 0, 0, 0, 0.3, 0.04, 3.8), { tint: [0.45, 0.45, 0.5, 1] });
      }
      for (let i = 0; i < 6; i++) {
        const z = -87.2 - ((i * 3 + clock * 6) % 17.6);
        draw(MESH.cube, M4.from(-12.25, 14.32, z, 0, 0, 0, 3.3, 0.04, 0.3), { tint: [0.45, 0.45, 0.5, 1] });
      }
      const now = new Date(), hr = (now.getHours() % 12 + now.getMinutes() / 60) / 12 * TAU, mn = (now.getMinutes() + now.getSeconds() / 60) / 60 * TAU;
      draw(MESH.hand, M4.from(0, 15, -25.75, 0, 0, -hr, 1, 0.75, 1));
      draw(MESH.hand, M4.from(0, 15, -25.72, 0, 0, -mn, 0.7, 1.1, 1));
      draw(MESH.hand, M4.from(TX, 44, TZ + 15.2, 0, 0, -hr, 2.2, 1.6, 1));
      draw(MESH.hand, M4.from(TX, 44, TZ + 15.25, 0, 0, -mn, 1.6, 2.3, 1));
    };

    // ── Hof: Rohre, Dampfventile, Kran, Kisten ──
    const pipe = (x0, z0, x1, z1, y, rr = 0.6) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
      cyl(g, M4.mul(M4.from(x0, y, z0, ry), M4.from(0, 0, 0, 0, Math.PI / 2)), rr, rr, len, 10, hex('#8a7a5a'));
      for (let k = 0; k <= len; k += 4) cyl(g, M4.mul(M4.from(x0, y, z0, ry), M4.from(0, 0, k, 0, Math.PI / 2)), rr + 0.12, rr + 0.12, 0.3, 10, hex('#b08a3a'));
      L.solid(Math.min(x0, x1) - rr, y - rr, Math.min(z0, z1) - rr, Math.max(x0, x1) + rr, y + rr, Math.max(z0, z1) + rr, 'pipe');
    };
    pipe(-60, -40, -6, -40, 0.7); pipe(6, -40, 60, -40, 0.7); pipe(-50, 10, -50, -70, 0.7); pipe(45, 30, 45, -70, 0.9); pipe(-70, -60, -20, -60, 3.2, 0.5);
    for (const [x, z] of [[-50, -40], [45, -40], [-20, -60]]) { box(g, M4.from(x, 1.2, z), 1.8, 2.4, 1.8, IRON); cyl(g, M4.from(x, 2.4, z), 0.4, 0.3, 1.4, 8, hex('#8a7a5a')); L.solid(x - 0.9, 0, z - 0.9, x + 0.9, 3.8, z + 0.9, 'valve'); }
    const vents = [[-50, 3.8, -40], [45, 3.8, -40], [-20, 3.8, -60], [30, 0.3, -60]];
    for (const [x, y, z] of vents.slice(3)) cyl(g, M4.from(x, 0, z), 0.8, 0.8, y, 8, hex('#4a4a52'));
    // Kran mit Haken
    for (const [x, z] of [[-45, -80], [-45, -72]]) cyl(g, M4.from(x, 0, z), 0.4, 0.4, 16, 6, hex('#c8a040'));
    box(g, M4.from(-38, 16, -76), 18, 0.8, 1, hex('#c8a040'));
    cyl(g, M4.from(-31, 9, -76), 0.05, 0.05, 7, 4, hex('#2a2a2a'));
    L.block(-31, 8.6, -76, 2.4, 0.8, 2.4, IRON, 'plat');
    L.solid(-45.4, 0, -80.4, -44.6, 16, -71.6, 'crane');
    for (const [x, n] of [[-35.5, 3], [-38, 2], [-40.5, 1]]) for (let k = 0; k < n; k++) L.block(x, 1.1 + k * 2.2, -76, 2.2, 2.2, 2.2, { top: hex('#a8763a'), side: hex('#8a5a2a') }, 'crate');
    K.item(MESH.chest, [-31, 9, -76], (it) => {
      Snd.starAppear(); addCoins(10);
      burst([it.pos[0], it.pos[1] + 1, it.pos[2]], 16, { spread: 3, up: 4, life: .8, size: .2, cols: [[1, .85, .2], [1, 1, 1]], grav: 2 });
      toast('🏗️ Kranhaken: +10 Münzen!');
    }, 1.8);
    for (const [x, z, h] of [[30, 15, 1], [33, 15, 2], [30, 18, 1], [-60, 20, 2], [-62, 23, 1], [60, -100, 2], [63, -100, 1]]) {
      for (let k = 0; k < h; k++) L.block(x, 1.1 + k * 2.2, z, 2.2, 2.2, 2.2, { top: hex('#a8763a'), side: hex('#8a5a2a') }, 'crate');
    }
    // Schwungrad-Maschine
    L.block(-58, 2, -95, 10, 4, 6, IRON, 'engine');
    cyl(g, M4.from(-58, 4, -95), 1.2, 1, 5, 10, hex('#4a4a52'));
    L.drawAlpha = () => {
      for (const [x, y, z] of vents) {
        for (let k = 0; k < 4; k++) {
          const ph = ((clock * 0.6 + k * 0.25 + x * 0.01) % 1);
          draw(MESH.ball, M4.from(x + Math.sin(k + clock) * 0.3, y + 0.4 + ph * 4, z, 0, 0, 0, 0.5 + ph * 1.2), { tint: [1, 1, 1, 1], alpha: 0.28 * (1 - ph), lit: 0 });
        }
      }
    };

    K.coinLine([-28, 1.1, 0], [-12, 1.1, 0], 6);
    K.coinRing(0, 1.1, 10, 4, 8);
    K.coinLine([12, 2, -18], [12, 2, -18], 1);
    K.coinLine([-40, 1.1, -40 + 3], [40, 1.1, -40 + 3], 9);
    K.coinRing(-58, 5.1, -95, 2.5, 6);
    K.talker(6, 0, 30, 'Schild', [
      '★ SUCH-UHRWERK ★\nHier sind drei LUPEN verlegt worden. Findest du sie, gibt es einen Stern.',
      'Eine liegt ganz oben auf dem kleinen Uhrturm – die Kolben fahren dich hoch.',
      'Eine liegt am Ende des Förderbands. Es schiebt dir leider entgegen.',
      'Und eine hat sich unter dem großen Zahnrad verkrochen. Mach dich klein!',
      'Dahinter steht der GROSSE UHRWERK-TURM. Innen geht es über Kolben, Bänder und den Uhrzeiger bis zur Spitze.',
      'Der Suchrahmen führt zur echten Suchmaschine.',
    ]);
    K.talker(6, 0, -76, 'Schild', ['UHRWERK-TURM\nBitte nicht in die Zahnräder fassen. Oben an der Westwand wartet ein Stern.']);
    K.exit(0, 35);
    L.enemies.push(makeBomb(-10, 18), makeBomb(20, 14), makeBomb(-40, -50), makeBomb(40, -60), makeBomb(-60, 0));
    L.enemies.push(makeGrummel(-30, 20), makeGrummel(30, -20), makeGrummel(0, -60), makeGrummel(-55, -110));
    L.enemies.push(makeSpiky(20, 25, 3, '#c89a3a'), makeSpiky(-25, -45, 3, '#c89a3a'), makeSpiky(55, -30, 3, '#c89a3a'), makeSpiky(-65, -80, 3, '#c89a3a'));
    L.enemies.push(makeHopper(-40, 20, 3, '#3a3a44'), makeHopper(35, -85, 3, '#3a3a44'), makeHopper(0, -95, 3, '#3a3a44'), makeHopper(60, 20, 3, '#3a3a44'));
    L.enemies.push(makeBat(0, 26, -100, '#6a4a2a'), makeBat(-4, 44, -92, '#6a4a2a'), makeSpam(-45, 12, -76), makeSpam(30, 10, 0));
    // Suchmaschine ohne Werbung? Denkste: Pop-ups und Viren
    L.enemies.push(makePopup(-20, 6, undefined, 2), makePopup(24, -8, undefined, 1), ...makeVirus(-50, -30, 3));
    // ── Leben ──
    K.life.glows(-60, -100, 60, 30, 22, { y: 1, yr: 7, col: '#ffcf6a', s: 0.8, speed: 0.5 });
    K.life.critters('mouse', -46, -70, 46, 26, 6, { speed: 1.2 });
    K.life.butterflies(-50, -80, 50, 30, 4, { mesh: 'drone', y: 4, yr: 5, cols: ['#ffd8a0'], speed: 0.7 });
    K.life.npc(-10, 21, 'Uhrmacher Tick', ['Drei Lupen sind verlegt. Eine liegt immer dort, wo es am lautesten tickt.',
      'Nach oben geht es über die Kolben — im Takt.'], { cat: 3, r: 4, tint: '#d8aa4a', mix: 0.35 });
    // ── Deko: Zahnraeder an der Wand, Werkbaenke, Kisten, Oelkannen ──
    K.scatter(-70, -110, 70, 34, 12, (x, y, z, i, r) => {   // Werkbank mit Werkzeug
      L.block(x, y + 0.6, z, 2.6, 1.2, 1.2, { top: hex('#8a5a2a'), side: hex('#6b4214') }, 'bench');
      for (let k = 0; k < 3; k++) box(g, M4.from(x - 0.8 + k * 0.8, y + 1.3, z, r() * 3, 0, 1.4), 0.6, 0.1, 0.1, hex('#b0b4bc'));
      cyl(g, M4.from(x + 1, y + 1.2, z), 0.22, 0.18, 0.3, 8, hex('#c85a2a'));
    }, { avoid: [[-12, 14, 12, 34]] });
    K.scatter(-70, -110, 70, 34, 16, (x, y, z, i, r) => {   // Zahnrad an die Wand gelehnt
      cyl(g, M4.from(x, y + 1.1, z, 0, 0, 0.2), 1.1, 1.1, 0.22, 12, hex('#b8944a'));
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; box(g, M4.from(x + Math.cos(a) * 1.2, y + 1.1 + Math.sin(a) * 1.2, z, 0, 0, a), 0.3, 0.3, 0.24, hex('#a88440')); }
      L.solid(x - 1.1, y, z - 0.3, x + 1.1, y + 2.2, z + 0.3, 'gear');
    }, { avoid: [[-14, 12, 14, 34]] });
    K.scatter(-70, -110, 70, 34, 14, (x, y, z, i, r) => {   // Kistenstapel
      const n = 1 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) box(g, M4.from(x, y + 0.55 + k * 1.05, z, r() * 0.4), 1, 1, 1, { top: hex('#c9974a'), side: hex('#a8763a') });
      L.solid(x - 0.55, y, z - 0.55, x + 0.55, y + n * 1.05, z + 0.55, 'crate');
    }, { avoid: [[-12, 12, 12, 34]] });
    L.finish();
    return L;
  }

  /* ─────────── Welt 6: Mandelbrot-Regenbogen ───────────
     Schwebende Plattformen im Weltall (Idee: Regenbogen-Ritt am Himmel, eigenes Layout).
     Gimmicks: eine Fraktal-Spirale, die sich langsam dreht — jede Stufe kleiner und hoeher;
     ein fliegender Teppich, der eine lange Regenbogenbahn zum Himmelspavillon abfaehrt
     (Hindernisse: drueberspringen oder ducken). Geheim: unsichtbare Stufen, das Apfelmaennchen. */
  function buildFraktal() {
    const L = new Level({ name: 'Mandelbrot-Regenbogen', spawn: [0, 0, 16], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#140a3a'), fogNear: 200, fogFar: 520, light: v3.norm([-0.6, -0.5, 0.6]), sky: 'fractal', voidY: -40, dim: 0.95, trip: 1 });
    const K = kit(L), g = K.g, gw = K.glow, r = K.rnd;
    const RAINBOW = ['#ff3b3b', '#ff9a2e', '#ffe14a', '#4cd964', '#3aa0ff', '#8a5cff'];
    const CRYS = { top: hex('#b8a8ff'), side: hex('#6a4ac8') };
    L.block(0, -1, 20, 12, 2, 12, CRYS, 'plat');
    RAINBOW.forEach((col, i) => L.block(-1.5 + i * 0.6, -0.2, 6, 0.6, 0.4, 16, hex(col), 'bridge'));
    L.block(0, -1, -10, 16, 2, 16, { top: hex('#d8c8ff'), side: hex('#7a5ad8') }, 'plat');
    for (const [x, z] of [[-6, 14], [6, 14], [-6, 26], [6, 26], [-8, -18], [8, -18], [-8, -2], [8, -2]]) K.crystal(x, 0, z, 1.4 + r() * 0.8, hex(RAINBOW[Math.floor(r() * 6)]), r() * 3);
    for (let i = 0; i < 12; i++) sphere(g, M4.from(Math.cos(i) * 60 + (i % 3) * 20, -70 - (i % 4) * 6, Math.sin(i * 1.7) * 60), 30, 8, 22, 10, 5, i % 2 ? hex('#c8b8f0') : hex('#e8e0ff'));
    // Die Spirale: 14 Stufen, jede 10 % kleiner, 2,4 m hoeher, 50° weiter
    const C0 = [0, -10], OMEGA = 0.13;
    for (let k = 0; k < 14; k++) {
      const rr = 13 * Math.pow(0.9, k), s = 7.5 * Math.pow(0.9, k), top = 2.4 * (k + 1), a0 = Math.PI / 2 + k * 50 * Math.PI / 180;
      const bx = C0[0] + Math.cos(a0) * rr, bz = C0[1] + Math.sin(a0) * rr;
      const col = hex(RAINBOW[Math.floor(k / 14 * 6) % 6]);
      L.mover(bx, top - 0.4, bz, s, 0.8, s, { top: col, side: shade(col, 0.6) },
        (t) => [C0[0] + Math.cos(a0 + OMEGA * t) * rr - bx, 0, C0[1] + Math.sin(a0 + OMEGA * t) * rr - bz], 'fractal');
    }
    L.block(0, 35, -10, 3, 2, 3, { top: hex('#ffe680'), side: hex('#c8a030') }, 'plat');
    K.star('fraktal', [0, 37.6, -10]);
    K.portal(-4.5, 0, -17.2, 5, { scale: 0.8 });
    // Unsichtbare Stufen neben der Bruecke hinab zur Geheiminsel
    const invis = [[10.5, -2, 17], [14, -4, 12.5], [16.5, -6, 7.5], [19, -8, 1]];
    const invisBoxes = invis.map(([x, top, z], i) => {
      const sz = i === 3 ? 7 : 3;
      return { b: L.solid(x - sz / 2, top - 0.6, z - sz / 2, x + sz / 2, top, z + sz / 2, 'invis'), x, top, z, sz };
    });
    K.coinRing(19, -6.9, 1, 2.4, 8);

    // ── Das Apfelmaennchen: begehbare Mandelbrot-Insel im Westen ──
    const MB = (re, im) => [-24 + re * 14, 3.6, 8 + im * 14];
    const card = (th) => { const c = [Math.cos(th) / 2 - Math.cos(2 * th) / 4, Math.sin(th) / 2 - Math.sin(2 * th) / 4]; return MB(c[0], c[1]); };
    const blob = (pts, cen, col, rimCols) => {
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        g.tri(cen, b, a, col);
        g.quad([a[0], a[1] - 2, a[2]], [b[0], b[1] - 2, b[2]], b, a, hex('#2a1a4a'));
        rimCols.forEach((rc, k) => {
          const s = 1 + (k + 1) * 0.035;
          const a2 = [cen[0] + (a[0] - cen[0]) * s, a[1] + 0.02, cen[2] + (a[2] - cen[2]) * s], b2 = [cen[0] + (b[0] - cen[0]) * s, b[1] + 0.02, cen[2] + (b[2] - cen[2]) * s];
          const s0 = 1 + k * 0.035, a1 = [cen[0] + (a[0] - cen[0]) * s0, a[1] + 0.02, cen[2] + (a[2] - cen[2]) * s0], b1 = [cen[0] + (b[0] - cen[0]) * s0, b[1] + 0.02, cen[2] + (b[2] - cen[2]) * s0];
          gw.quad(a1, b1, b2, a2, hex(rc));
        });
      }
    };
    const cardPts = Array.from({ length: 64 }, (_, i) => card(0.001 + i / 64 * (TAU - 0.002)));
    blob(cardPts, MB(-0.2, 0), hex('#0a0614'), RAINBOW);
    blob(Array.from({ length: 40 }, (_, i) => { const a = i / 40 * TAU; return MB(-1 + Math.cos(a) * 0.25, Math.sin(a) * 0.25); }), MB(-1, 0), hex('#0a0614'), RAINBOW);
    blob(Array.from({ length: 24 }, (_, i) => { const a = i / 24 * TAU; return MB(-1.31 + Math.cos(a) * 0.06, Math.sin(a) * 0.06); }), MB(-1.31, 0), hex('#0a0614'), RAINBOW.slice(0, 3));
    L.solid(-33, 1.6, 1.5, -22, 3.6, 14.5, 'mandel'); L.solid(-36, 1.6, 6.5, -33, 3.6, 9.5, 'mandel');
    L.solid(-41.4, 1.6, 5.4, -36.6, 3.6, 10.6, 'mandel'); L.solid(-43.2, 1.6, 7.2, -41.9, 3.6, 8.8, 'mandel');
    for (const [x, top, z] of [[-10, 0.8, 21], [-15, 1.8, 17], [-19.5, 2.8, 13]]) K.plat(x, top, z, 2.6, 2.6, CRYS, 0.6, 'stone');
    K.coinRing(-28, 4.7, 8, 3.5, 8); K.coinLine([-35, 4.7, 8], [-42.5, 4.7, 8], 4);
    K.item(MESH.chest, [-39, 3.6, 8], (it) => {
      Snd.starAppear(); addCoins(10);
      burst([it.pos[0], it.pos[1] + 1, it.pos[2]], 16, { spread: 3, up: 4, life: .8, size: .2, cols: [[1, .85, .2], [1, 1, 1]], grav: 2 });
      toast('🍎 Apfelmännchen: +10 Münzen!');
    }, 2);

    // ── Teppich-Steg und die Regenbogenbahn ──
    RAINBOW.forEach((col, i) => L.block(10, -0.2, 22.3 + i * 0.5, 8, 0.4, 0.5, hex(col), 'bridge'));
    L.block(18, -1, 26, 8, 2, 8, CRYS, 'dock');
    const PATH = [[24, 0.15, 26], [44, 0.15, 26], [62, 5, 10], [72, 8.15, -8], [72, 8.15, -32], [64, 13, -56], [48, 18.15, -78], [24, 18.15, -78], [6, 23, -100], [-14, 26.15, -116], [-33, 26.15, -123]];
    const cum = [0];
    for (let i = 1; i < PATH.length; i++) cum.push(cum[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1], PATH[i][2] - PATH[i - 1][2]));
    const TOTAL = cum[cum.length - 1];
    const pathAt = (s) => {
      s = clamp(s, 0, TOTAL);
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const k = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), a = PATH[i - 1], b = PATH[i];
      return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    };
    // Regenbogenband unter der Bahn (leuchtend) + Muenzen
    for (let i = 1; i < PATH.length; i++) {
      const a = PATH[i - 1], b = PATH[i], dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, px = -dz / l, pz = dx / l;
      RAINBOW.forEach((col, k) => {
        const o0 = -1.5 + k * 0.5, o1 = o0 + 0.5;
        gw.quad([a[0] + px * o0, a[1] - 0.7, a[2] + pz * o0], [b[0] + px * o0, b[1] - 0.7, b[2] + pz * o0], [b[0] + px * o1, b[1] - 0.7, b[2] + pz * o1], [a[0] + px * o1, a[1] - 0.7, a[2] + pz * o1], hex(col));
      });
    }
    for (let s = 14; s < TOTAL - 6; s += 11) { const q = pathAt(s); L.coin('yellow', q[0], q[1] + 1.4, q[2]); }
    const CARPET = { top: hex('#c8284a'), side: hex('#f2c230') };
    const ride = { s: 0, state: 'dock', idle: 0, t: 0 };
    const P0 = PATH[0];
    const carpet = L.mover(P0[0], P0[1], P0[2], 4, 0.3, 4, CARPET, () => { const q = pathAt(ride.s); return [q[0] - P0[0], q[1] - P0[1], q[2] - P0[2]]; }, 'carpet');
    // Hindernisse: Kristallwand (drueber springen), Leuchtstange (ducken oder drueber), Kristallwand
    const OBST = { top: hex('#ff7ae0'), side: hex('#c83ab0') };
    L.block(36, 0.95, 26, 1, 1.2, 5, OBST, 'obstacle');
    L.block(72, 10.25, -20, 6, 0.8, 0.6, { top: hex('#ffe14a'), side: hex('#e0a020') }, 'obstacle');
    for (const x of [69, 75]) cyl(g, M4.from(x, 5, -20), 0.2, 0.2, 5.3, 6, hex('#e0a020'));
    L.block(36, 18.95, -78, 1, 1.2, 5, OBST, 'obstacle');
    K.talker(20, 0, 23, 'Schild', [
      'TEPPICH-EXPRESS: Einsteigen, und der Teppich fliegt los – immer den Regenbogen entlang.',
      'Unterwegs: Kristallwände → drüberspringen. Die gelbe Stange → ducken (Z / Shift) oder drüberhüpfen.',
      'Wer runterfällt, fällt tief. Am Ziel wartet der Himmelspavillon.',
    ]);
    // Himmelspavillon am Ende der Bahn
    L.block(-45, 25.3, -125, 18, 2, 18, CRYS, 'island');
    cyl(g, M4.from(-45, 24.3, -125, 0, Math.PI), 9.5, 0, 12, 10, hex('#4a2a8a'));
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; K.column(-45 + Math.cos(a) * 5, -125 + Math.sin(a) * 5, 26.3, 5, 0.45, hex('#e8e0ff')); }
    sphere(g, M4.from(-45, 31.3, -125), 6, 3.6, 6, 16, 6, (i) => hex(RAINBOW[i % 6]), false, 0, Math.PI / 2);
    L.solid(-51, 31.1, -131, -39, 31.6, -119, 'roof');
    K.star('teppich', [-45, 28.4, -125]);
    K.coinRing(-45, 27.4, -125, 7.5, 12);
    // Rueckkehr-Ring: bringt zurueck zum Start
    cyl(gw, M4.from(-45, 26.3, -132), 1.4, 1.4, 0.08, 20, hex('#7affc8'));
    for (let k = 0; k < 3; k++) cyl(gw, M4.from(-45, 26.45 + k * 0.5, -132), 1.5 - k * 0.2, 1.5 - k * 0.2, 0.05, 20, hex('#baffe8'));
    let warping = false;
    L.update = (dt) => {
      const on = pl.grounded && pl.groundBox === carpet.b;
      if (ride.state === 'dock') {
        if (on) { ride.state = 'go'; ride.idle = 0; Snd.chime(4); toast('🧞 Festhalten!'); }
      } else if (ride.state === 'go') {
        ride.s = Math.min(TOTAL, ride.s + 7 * dt);
        ride.idle = on ? 0 : ride.idle + dt;
        if (ride.s >= TOTAL) { ride.state = 'end'; ride.t = 0; }
        else if (ride.idle > 2.2) ride.state = 'back';
      } else if (ride.state === 'end') {
        ride.t += dt;
        if (!on && ride.t > 2) ride.state = 'back';
      } else if (ride.state === 'back') {
        const q = pathAt(ride.s);
        burst([q[0], q[1] + 0.5, q[2]], 12, { spread: 3, up: 2, life: .6, size: .2, cols: RAINBOW.map(hex), grav: 0 });
        ride.s = 0; ride.state = 'dock';
        burst([P0[0], P0[1] + 0.5, P0[2]], 12, { spread: 3, up: 2, life: .6, size: .2, cols: RAINBOW.map(hex), grav: 0 });
      }
      if (!warping && pl.grounded && Math.hypot(pl.pos[0] + 45, pl.pos[2] + 132) < 1.5 && Math.abs(pl.pos[1] - 26.3) < 0.5) {
        warping = true; Snd.magic();
        transition(() => { respawn(); warping = false; });
      }
    };
    L.drawAlpha = () => {
      for (const v of invisBoxes) {
        const d = Math.hypot(pl.pos[0] - v.x, pl.pos[2] - v.z) + Math.abs(pl.pos[1] - v.top) * 0.5;
        const a = clamp(1 - d / 7, 0, 0.45);
        if (a > 0.01) draw(MESH.cube, M4.from(v.x, v.top - 0.3, v.z, 0, 0, 0, v.sz, 0.6, v.sz), { tint: [0.8, 0.9, 1, 1], alpha: a, lit: 0 });
      }
      // Teppich-Fransen und Glitzer
      const q = pathAt(ride.s);
      for (let k = 0; k < 3; k++) draw(MESH.cube, M4.from(q[0] + Math.sin(clock * 3 + k) * 1.8, q[1] - 0.3 - k * 0.3, q[2] + Math.cos(clock * 2.3 + k) * 1.8, clock + k, k, 0, 0.18), { tint: [1, 0.9, 0.4, 1], alpha: 0.7, lit: 0 });
    };
    // schwebende Kristallfelsen als Deko
    for (let i = 0; i < 22; i++) {
      const x = lerp(-90, 110, r()), y = r() < 0.5 ? lerp(-30, -9, r()) : lerp(40, 60, r()), z = lerp(-150, 60, r());
      if (Math.hypot(x, z + 10) < 30 || Math.hypot(x + 30, z - 8) < 18) continue;
      sphere(g, M4.from(x, y, z, r() * 3), 2 + r() * 3, 1.2 + r() * 2, 2 + r() * 3, 6, 4, (ii, jj) => shade(hex('#5a4a8a'), 0.8 + ((ii + jj) % 3) * 0.12), false);
      K.crystal(x, y + 1, z, 1.5 + r() * 2, hex(RAINBOW[i % 6]), r() * 3);
    }
    K.coinLine([0, 1.1, 12], [0, 1.1, 0], 5);
    K.coinRing(0, 1.1, -10, 5, 8);
    K.talker(4, 0, 17, 'Schild', [
      '★ MANDELBROT-REGENBOGEN ★\nAchtung: Hier geht es tief runter.',
      'Die FRAKTAL-SPIRALE dreht sich langsam. Jede Stufe ist kleiner als die davor – oben in der Mitte leuchtet ein Stern.',
      'Rechts am Steg wartet ein fliegender TEPPICH. Er bringt dich über den Regenbogen zum Himmelspavillon – dort wartet der zweite Stern.',
      'Links schwebt das APFELMÄNNCHEN. Und: nicht alles, was man nicht sieht, ist nicht da. Rechts neben der Brücke zum Beispiel.',
      'Auf der Plattform hängt das Tor zum echten Mandelbrot-Explorer.',
    ]);
    K.exit(0, 25.2);
    L.enemies.push(makeBat(0, 9, -10, '#ff5ae0'), makeBat(-28, 9, 8, '#ff5ae0'), makeBat(60, 11, 4, '#ff5ae0'), makeBat(40, 23, -80, '#ff5ae0'), makeBat(-45, 32, -125, '#ff5ae0'));
    L.enemies.push(makeSpiky(-4, -6, 3, '#3aa0ff'), makeSpiky(5, -14, 3, '#3aa0ff'), makeSpiky(-45, -120, 30, '#3aa0ff'));
    L.enemies.push(makeHopper(-27, 5, 6, '#8a5cff'), makeHopper(-30, 12, 6, '#ff9a2e'), makeHopper(18, 26, 3, '#4cd964'));
    // ── Leben ──
    K.life.glows(-40, -30, 40, 22, 24, { y: 0, yr: 8, col: '#ff7ae0', s: 1.2, speed: 0.6 });
    K.life.drifts(-40, -30, 40, 22, 12, { y0: -6, y1: 18, col: '#8ad8ff', s: 0.9, glow: true, speed: 0.5 });
    K.life.npc(-6, 16, 'Fraktalkatze Mandy', ['Alles hier wiederholt sich. Ich auch, ein bisschen.',
      'Stell dich auf den Teppich, dann fährt er los.'], { cat: 0, r: 3, tint: '#ff7ae0', mix: 0.4 });
    L.finish();
    return L;
  }

  /* ─────────── Welt 7: Pilzwald ───────────
     Riesenpilze in der Daemmerung, dahinter die Wasserfall-Klippe (Idee: hoher Berg mit Pilzen
     und Wasserfall, eigenes Layout). Gimmicks: federnde blaue Pilze, Pilz-Spirale, Pilz-Simse an
     der Klippe, drei Wasserfaelle bis in den Teich. Geheim: der hohle Baum ist eine Abkuerzung
     (der "Pilz-Skip"), ein hohler Baumstamm will durchkrabbelt werden. Im Westen: das Pilzdorf. */
  MESH.shroomling = buildLP((g) => {
    cyl(g, I4, 0.35, 0.3, 0.9, 10, hex('#f4ecd8'));
    sphere(g, M4.from(0, 0.9, 0), 0.75, 0.5, 0.75, 14, 5, hex('#d6232a'), true, 0, Math.PI / 2);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; sphere(g, M4.from(Math.cos(a) * 0.45, 1.25, Math.sin(a) * 0.45), 0.12, 0.05, 0.12, 6, 3, C.white); }
    for (const s of [-1, 1]) { sphere(g, M4.from(s * 0.12, 0.62, 0.3), 0.06, 0.09, 0.04, 6, 4, C.black, true); sphere(g, M4.from(s * 0.22, 0.48, 0.28), 0.07, 0.04, 0.03, 6, 3, hex('#ff9ab0'), true); }
    sphere(g, M4.from(0, 0.7, -0.05), 0.2, 0.08, 0.2, 6, 3, hex('#f8f0e0'));
    for (const s of [-1, 1]) box(g, M4.from(s * 0.4, 0.45, 0, 0, 0, s * 0.5), 0.1, 0.4, 0.1, hex('#f4ecd8'));
  });
  function buildPilz() {
    const L = new Level({ name: 'Pilzwald', spawn: [0, 0, 22], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#7aa890'), fogNear: 80, fogFar: 300, light: v3.norm([0.5, -0.7, 0.5]), sky: 'forest', dim: 0.88 });
    const K = kit(L), g = K.g, gw = K.glow, r = K.rnd;
    const GA = hex('#4a7a3a'), GB = hex('#3f6a32');
    [[-100, -58, 95, 45], [-100, -150, 95, -80], [-100, -80, 52, -58], [88, -80, 95, -58]].forEach(([x0, z0, x1, z1]) => K.ground(x0, z0, x1, z1, GA, GB));
    K.bounds(-98, -148, 93, 43);
    K.hills(170, 20, hex('#2f5a3a'), hex('#26502f'), -2, 1.8);
    g.quad([-500, -2.05, 500], [500, -2.05, 500], [500, -2.05, -500], [-500, -2.05, -500], hex('#26502f'));
    const mush = (x, z, h, rr, capCol, tag = 'mushcap', bounce = 0, y = 0) => {
      cyl(g, M4.from(x, y, z), rr * 0.28, rr * 0.22, h, 10, hex('#efe4c8'));
      sphere(g, M4.from(x, y + h, z), rr, rr * 0.55, rr, 14, 5, capCol, true, 0, Math.PI / 2);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + rr; sphere(g, M4.from(x + Math.cos(a) * rr * 0.62, y + h + rr * 0.42, z + Math.sin(a) * rr * 0.62), rr * 0.14, rr * 0.05, rr * 0.14, 6, 3, C.white); }
      const hs = rr * 0.72;
      const b = L.solid(x - hs, y + h + rr * 0.25, z - hs, x + hs, y + h + rr * 0.52, z + hs, tag);
      if (bounce) b.bounce = bounce;
      L.solid(x - rr * 0.26, y, z - rr * 0.26, x + rr * 0.26, y + h, z + rr * 0.26, 'stem');
      return y + h + rr * 0.52;
    };
    const RED = hex('#d6232a'), BLUE = hex('#3a8aff');
    mush(0, -26, 26, 7, RED);
    K.star('pilz', [0, 31.3, -26]);
    for (let k = 0; k < 10; k++) {
      const a = Math.PI / 2 + k * 35 * Math.PI / 180, top = 3 + k * 2.7;
      const x = Math.cos(a) * 9.5, z = -26 + Math.sin(a) * 9.5;
      mush(x, z, top - 2.4 * 0.52, 2.4, k % 2 ? hex('#e8a020') : RED);
      L.coin('yellow', x, top + 1.1, z);
    }
    [[-12, 8], [14, 10], [22, -14], [-30, 0], [-45, -22], [-68, -2], [36, -40]].forEach(([x, z]) => mush(x, z, 1.2, 1.8, BLUE, 'bouncy', 78));
    // Der hohle Baum: Suedseite nur Rinde-Kulisse, drinnen ein Riesen-Federpilz
    const BARK = { top: hex('#5a3e22'), side: hex('#6b4a2a') };
    L.block(-26.5, 15, -20, 1, 30, 6, BARK, 'trunk');
    L.block(-21.5, 15, -20, 1, 30, 6, BARK, 'trunk');
    L.block(-24, 15, -22.5, 4, 30, 1, BARK, 'trunk');
    box(g, M4.from(-24, 15, -17.5), 4, 30, 1, BARK);
    for (let i = 0; i < 5; i++) sphere(g, M4.from(-24 + Math.cos(i * 1.3) * 3, 31 + (i % 2), -20 + Math.sin(i * 1.3) * 3), 3.2, 1.8, 3.2, 8, 5, hex('#3f7f3a'));
    mush(-24, -20, 0.4, 1.5, BLUE, 'bouncy', 135);
    for (let i = 0; i < 6; i++) L.coin('yellow', -24, 3 + i * 4, -20);
    L.block(-16.5, 30.2, -20, 9, 0.4, 2, { top: hex('#8a6a3a'), side: hex('#6b4a2a') }, 'plank');
    for (let i = 0; i < 5; i++) L.block(-10.6 + i * 1.3, 30 - i * 0.08, -21.2 - i * 0.9, 1.4, 0.3, 2, { top: hex('#a8804a'), side: hex('#6b4a2a') }, 'plank');
    // Schlafkatze in der Haengematte
    K.tree(18, 8, 0, 3.5, hex('#3f8f3a')); K.tree(26, 8, 0, 3.5, hex('#3f8f3a'));
    for (let i = 0; i < 7; i++) { const t = i / 6; box(g, M4.from(18.6 + t * 6.8, 2.2 - Math.sin(t * Math.PI) * 0.8, 8), 1.1, 0.12, 1.4, hex('#e8d0a0')); }
    sphere(g, M4.from(22, 1.75, 8), 0.9, 0.5, 0.6, 10, 6, hex('#f0a040'), true);
    sphere(g, M4.from(22.9, 1.85, 8.1), 0.42, 0.38, 0.4, 10, 6, hex('#f0a040'), true);
    for (const s of [-1, 1]) cyl(g, M4.from(23.05, 2.15, 8.1 + s * 0.22, 0, 0, -0.2), 0.12, 0, 0.3, 4, hex('#d08030'));
    cyl(g, M4.from(21.2, 1.7, 8, 0, 0, 1.3), 0.1, 0.08, 1.1, 5, hex('#d08030'));
    K.talker(22, 0, 10.5, 'Schlafkatze', [
      'Zzz … hm? Ach, ein Besucher.',
      'Auf den Riesenpilz kommst du über die Pilz-Spirale … oder du nimmst den Pilz-Skip.',
      'Der HOHLE BAUM ist innen hohl. Die Südseite ist nur Rinde auf Pappe. Zzz …',
      'Und ganz hinten an der Wasserfall-Klippe wachsen Pilze aus dem Fels. Oben soll ein Stern liegen … Zzz …',
    ], false);
    K.portal(22, 0, 1, 6, { scale: 0.9 });
    // Hohler Baumstamm am Boden: nur krabbelnd
    cyl(g, M4.from(-30, 1.2, 10, 0, 0, -Math.PI / 2), 1.3, 1.3, 12, 10, hex('#6b4a2a'), hex('#3a2812'));
    L.solid(-30, 1.15, 8.7, -18, 2.5, 11.3, 'log'); L.solid(-30, 0, 8.3, -18, 2.5, 8.7, 'log'); L.solid(-30, 0, 11.3, -18, 2.5, 11.7, 'log');
    K.coinLine([-28.5, 0.7, 10], [-19.5, 0.7, 10], 5);

    // ── Wasserfall-Klippe: drei Stufen, Rampe, Pilz-Simse, Rampe, Gipfel ──
    const ROCK = { top: hex('#5a8a4a'), side: hex('#6a6a5e') };
    const tier = (x0, z0, x1, z1, top) => {
      L.block((x0 + x1) / 2, top / 2 - 0.5, (z0 + z1) / 2, x1 - x0, top + 1, z1 - z0, ROCK, 'mountain');
      box(g, M4.from((x0 + x1) / 2, top - 0.18, (z0 + z1) / 2), x1 - x0 + 0.3, 0.4, z1 - z0 + 0.3, { top: ROCK.top, side: shade(ROCK.top, 0.8) });
      for (let y = top - 2.4; y > 0.8; y -= 2.6) box(g, M4.from((x0 + x1) / 2, y, (z0 + z1) / 2), x1 - x0 + 0.06, 0.3, z1 - z0 + 0.06, shade(ROCK.side, 0.85));
    };
    tier(30, -146, 92, -80, 12); tier(46, -146, 92, -100, 24); tier(62, -146, 92, -118, 36);
    const PATHC = { top: hex('#a8905a'), side: hex('#6a6a5e') }, CURB = { top: hex('#8a8a7e'), side: hex('#6a6a5e') };
    K.ramp(25, -132, 30, -84, 0, 12, 'z-', PATHC); L.block(27.5, 6.4, -132.3, 5, 13.8, 0.6, CURB, 'curb');
    K.ramp(57, -140, 62, -120, 24, 36, 'z-', PATHC); L.block(59.5, 30.4, -140.3, 5, 13.8, 0.6, CURB, 'curb');
    // Pilz-Simse an der Suedwand der zweiten Stufe
    const CAPC = [hex('#d6232a'), hex('#e8a020'), hex('#d6232a'), hex('#c83ab0')];
    [[49, 14.4], [53.5, 16.8], [58, 19.2], [62.5, 21.6]].forEach(([x, top], i) => {
      cyl(g, M4.mul(M4.from(x, top - 1.3, -100.2), M4.from(0, 0, 0, 0, Math.PI / 2)), 0.5, 0.4, 2.2, 8, hex('#efe4c8'));
      sphere(g, M4.from(x, top - 0.9, -98.4), 2, 0.9, 1.9, 14, 5, CAPC[i], true, 0, Math.PI / 2);
      for (let k = 0; k < 4; k++) sphere(g, M4.from(x + Math.cos(k * 1.6) * 1.1, top - 0.2, -98.4 + Math.sin(k * 1.6) * 1.1), 0.24, 0.08, 0.24, 6, 3, C.white);
      L.solid(x - 1.8, top - 0.5, -100, x + 1.8, top, -97, 'mushcap');
      L.coin('yellow', x, top + 1.2, -98.5);
    });
    // Wasserfaelle: von ganz oben bis in den Teich
    const WATERC = hex('#5ab0e8');
    for (const [z0, z1, y] of [[-140, -118, 36], [-118, -100, 24], [-100, -80, 12]]) g.quad([72, y + 0.05, z1], [80, y + 0.05, z1], [80, y + 0.05, z0], [72, y + 0.05, z0], WATERC);
    K.fall(76, -117.8, 36, 24, 8, 'x', { speed: 12 }); K.fall(76, -99.8, 24, 12, 8, 'x', { speed: 12 }); K.fall(76, -79.8, 12, -0.3, 8, 'x', { speed: 12 });
    K.rock(76, 36, -141, 3, hex('#7a7a6e'));
    L.solid(52, -8, -80, 88, -2.8, -58, 'pondbed'); L.checker(52, -80, 88, -58, -2.8, 3, hex('#2a4a3a'), hex('#244232'));
    for (const [a, b] of [[[52, -58], [88, -58]], [[52, -80], [52, -58]], [[88, -58], [88, -80]]]) g.quad([a[0], -2.8, a[1]], [b[0], -2.8, b[1]], [b[0], 0, b[1]], [a[0], 0, a[1]], hex('#5a4a32'));
    L.waters.push({ x0: 52, x1: 88, z0: -80, z1: -58, y: -0.3, tint: [0.3, 0.6, 0.55, 0.4] });
    K.bridge(52, -71, 88, -67, 0.5);
    for (const [x, z] of [[58, -62], [66, -76], [84, -62], [60, -75]]) { disc(g, M4.from(x, -0.26, z, 0, -Math.PI / 2), 1.3, 10, hex('#3f9a3a')); sphere(g, M4.from(x + 0.4, -0.1, z - 0.3), 0.22, 0.16, 0.22, 6, 4, hex('#ffb0d8')); }
    // Gipfel: Aussichtspunkt, Riesenpilz, Stern
    mush(86, -140, 5, 3.5, hex('#8a3ab0'), 'mushcap', 0, 36);
    L.block(70, 36.5, -126, 4, 1, 1.2, { top: hex('#8a5a2a'), side: hex('#6a4218') }, 'bench');
    K.flowers(64, -144, 90, -120, 60, 36); K.tufts(64, -144, 90, -120, 60, 36);
    K.star('wasserfall', [80, 38.3, -130]);
    K.coinLine([27.5, 2, -88], [27.5, 12.8, -128], 5); K.coinLine([59.5, 26, -122], [59.5, 36.8, -138], 4); K.coinRing(80, 37.2, -130, 4, 8);
    K.talker(22, 0, -80, 'Schild', [
      'WASSERFALL-KLIPPE\nLinks führt ein Pfad auf die erste Stufe.',
      'Dort wachsen PILZE aus dem Fels – von Hut zu Hut springen, dann geht es über den nächsten Pfad bis zum Gipfel.',
    ]);

    // ── Pilzdorf im Westen: Pilzhaeuser, Brunnen, Gemuesegarten, Pilz-Oma ──
    const house = (x, z, h, rr, capCol) => {
      cyl(g, M4.from(x, 0, z), rr * 0.62, rr * 0.55, h, 12, hex('#f4ecd8'));
      sphere(g, M4.from(x, h, z), rr, rr * 0.6, rr, 16, 6, capCol, true, 0, Math.PI / 2);
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; sphere(g, M4.from(x + Math.cos(a) * rr * 0.65, h + rr * 0.45, z + Math.sin(a) * rr * 0.65), rr * 0.13, rr * 0.05, rr * 0.13, 6, 3, C.white); }
      box(g, M4.from(x, 1.3, z + rr * 0.56), 1.4, 2.6, 0.2, hex('#6a3a14'));
      disc(g, M4.from(x, 2.6, z + rr * 0.57), 0.7, 10, hex('#6a3a14'), 0, Math.PI);
      for (const s of [-1, 1]) box(gw, M4.from(x + s * rr * 0.4, h * 0.6, z + rr * 0.45, s * 0.6), 0.8, 0.8, 0.1, hex('#ffd878'));
      L.solid(x - rr * 0.55, 0, z - rr * 0.55, x + rr * 0.55, h, z + rr * 0.55, 'house');
      L.solid(x - rr * 0.72, h + rr * 0.2, z - rr * 0.72, x + rr * 0.72, h + rr * 0.55, z + rr * 0.72, 'mushcap');
    };
    house(-62, -34, 5, 6, hex('#d6232a')); house(-80, -12, 6, 7, hex('#e8a020')); house(-58, 4, 4.5, 5, hex('#3a8aff')); house(-84, -44, 5, 6, hex('#c83ab0'));
    cyl(g, M4.from(-70, 0, -20), 1.6, 1.6, 1, 12, hex('#8a8478')); disc(g, M4.from(-70, 0.9, -20, 0, -Math.PI / 2), 1.3, 12, WATERC);
    for (const s of [-1, 1]) cyl(g, M4.from(-70 + s * 1.4, 1, -20), 0.12, 0.12, 2.2, 5, hex('#6b4214'));
    box(g, M4.from(-70, 3.3, -20), 3.4, 0.3, 0.4, hex('#6b4214')); L.solid(-71.6, 0, -21.6, -68.4, 1, -18.4, 'well');
    for (let i = 0; i < 18; i++) { const x = -52 + (i % 6) * 1.6, z = -52 + Math.floor(i / 6) * 1.8; sphere(g, M4.from(x, 0.25, z), 0.35, 0.3, 0.35, 6, 4, i % 3 ? hex('#3f9a3a') : hex('#ff8a2a'), true); }
    K.fence(-54, -56, -40, -56); K.fence(-54, -46, -40, -46); K.fence(-54, -56, -54, -46);
    for (const [x, z] of [[-66, -24], [-74, -30], [-56, -10], [-76, 0]]) K.lamp(x, z, 0, hex('#ffd878'), hex('#6b4214'));
    const oma = [-66, 0, -16];
    K.talker(oma[0], 0, oma[2], 'Pilz-Oma', [
      'Na, mein Kleines? Willkommen im Pilzdorf!',
      'Die blauen Pilze federn – damit kommst du auch auf unsere Dächer. Oben liegen Münzen, die der Wind hochgeweht hat.',
      'Und pass auf die Kastanien-Igel auf. Die stechen!',
    ], false);
    L.solid(oma[0] - 0.4, 0, oma[2] - 0.4, oma[0] + 0.4, 1.4, oma[2] + 0.4, 'npc');
    for (const [x, z, h] of [[-62, -34, 8.6], [-80, -12, 10.2], [-58, 4, 7.5], [-84, -44, 8.6]]) K.coinRing(x, h + 1.1, z, 2, 6);
    // ── Wald: grosse Baeume, Farne, Stuempfe, Felsen, Leuchtpilze ──
    for (let i = 0; i < 40; i++) {
      const x = lerp(-96, 90, r()), z = lerp(-146, 40, r());
      if (Math.hypot(x, z + 26) < 22 || (x > 20 && z < -55) || (x < -45 && x > -92 && z > -60 && z < 12) || Math.abs(x) < 8 && z > 14) continue;
      if (Math.abs(x - 22) < 8 && z > -18 && z < 14) continue;
      if (Math.abs(x + 24) < 5 && Math.abs(z + 20) < 6) continue;
      K.tree(x, z, 0, 4 + r() * 5, r() < 0.5 ? hex('#3f7f3a') : hex('#4a9a3a'));
    }
    for (let i = 0; i < 28; i++) {
      const x = lerp(-96, 90, r()), z = lerp(-146, 40, r());
      if ((x > 20 && z < -55) || Math.hypot(x, z + 26) < 14) continue;
      cyl(g, M4.from(x, 0, z), 0.08, 0.06, 0.6, 5, hex('#e8e0d0'));
      sphere(gw, M4.from(x, 0.6, z), 0.35, 0.2, 0.35, 8, 4, [hex('#7affc8'), hex('#b8a8ff'), hex('#ffe680')][i % 3], true, 0, Math.PI / 2);
    }
    [[-40, 30], [40, 30], [-90, -100], [10, -120], [-30, -110], [45, 20]].forEach(([x, z]) => { cyl(g, M4.from(x, 0, z), 1.2, 1.4, 1.2, 10, hex('#6b4a2a'), hex('#c8a870')); L.solid(x - 1.2, 0, z - 1.2, x + 1.2, 1.2, z + 1.2, 'stump'); });
    [[-50, -80], [15, -60], [-85, 25], [70, 25], [-20, -140]].forEach(([x, z]) => K.rock(x, 0, z, 2, hex('#7a7a6e')));
    K.tufts(-96, -146, 90, 40, 500, 0, hex('#4a9a3a'), [[52, -80, 88, -58]]);
    K.flowers(-96, -60, 20, 40, 140, 0, ['#ff9ad8', '#ffe14a', '#ffffff', '#b8a8ff']);
    L.update = (dt) => {
      if (parts.length < 110 && Math.random() < dt * 10) {
        parts.push({ p: [pl.pos[0] + (Math.random() - 0.5) * 34, pl.pos[1] + Math.random() * 4, pl.pos[2] + (Math.random() - 0.5) * 34], v: [0, 0.8, 0],
          life: 4, max: 4, s: 0.1, col: [0.7, 1, 0.5], g: -0.05, rot: 0 });
      }
    };
    L.drawSolid = () => draw(MESH.shroomling, M4.from(oma[0], 0, oma[2], Math.sin(clock * 0.7) * 0.4, 0, 0, 1.4 + Math.abs(Math.sin(clock * 2.4)) * 0.04));
    K.coinRing(0, 1.1, 14, 4, 8);
    K.coinLine([55, 1.6, -69], [85, 1.6, -69], 6);
    K.talker(6, 0, 26, 'Schild', [
      '★ PILZWALD ★\nDie blauen Pilze federn, die roten tragen.',
      'Oben auf dem RIESENPILZ steht ein Stern. Die Katze in der Hängematte kennt eine Abkürzung.',
      'Hinten rechts rauscht die WASSERFALL-KLIPPE – dort wartet ein zweiter Stern. Links liegt das Pilzdorf.',
      'Neben der Hängematte hängt das Bild zur echten Secret Page.',
    ]);
    K.exit(0, 34);
    L.enemies.push(makeGrummel(-10, 12), makeGrummel(12, -6), makeGrummel(-14, -34), makeGrummel(40, -30), makeGrummel(-60, -50));
    L.enemies.push(makeSpiky(-35, -10, 3, '#6a3a1a'), makeSpiky(30, 0, 3, '#6a3a1a'), makeSpiky(-70, -8, 3, '#6a3a1a'), makeSpiky(40, -110, 15, '#6a3a1a'), makeSpiky(75, -110, 27, '#6a3a1a'));
    L.enemies.push(makeHopper(-20, 25, 3, '#8ac83a'), makeHopper(10, -50, 3, '#8ac83a'), makeHopper(-80, -30, 3, '#8ac83a'), makeHopper(60, -90, 15, '#8ac83a'), makeHopper(78, -138, 39, '#c8ff5a'));
    L.enemies.push(makeBat(0, 12, -26, '#3a2a1a'), makeBat(-24, 20, -20, '#3a2a1a'), makeBat(50, 20, -95, '#3a2a1a'), makeBat(70, 40, -130, '#3a2a1a'));
    L.enemies.push(makeBomb(-45, 15), makeBomb(35, -60));
    L.enemies.push(makeRoller([[27.5, -130], [27.5, -82], [27.5, -70]], { speed: 7, r: 1.1, delay: 2, tint: [0.45, 0.28, 0.12, 0.6] }));
    // ── Leben ──
    K.life.butterflies(-70, -60, 70, 36, 14, { cols: ['#ff7ac8', '#ffe14a', '#c8ff8a'] });
    K.life.glows(-70, -100, 70, 36, 24, { y: 0.5, yr: 5, col: '#a8ff7a', s: 0.9, speed: 0.4 });
    K.life.drifts(-70, -60, 70, 36, 14, { y0: 0, y1: 16, col: '#8ad84a', s: 0.9 });
    K.life.critters('frog', 55, -77, 85, -61, 3, { hop: 0.22 });
    K.life.fish(54, -78, 86, -60, -0.3, 4, { col: '#ffb13f' });
    K.life.critters('bunny', -55, -30, 55, 30, 3, { s: 0.6, hop: 0.25 });
    K.life.birds(5, { cx: 0, cz: -30, y: 28, col: '#e8d8b0' });
    K.life.npc(-8, 18, 'Sammlerin Flora', ['Der hohle Baum ist keine Sackgasse.',
      'Fünf Leuchtpilze wachsen im Wald — zwei oben in den Kronen, einer am Wasser, zwei am Boden.',
      'Sammel sie für meine Laterne, dann liegt hier ein Stern für dich.'], { cat: 1, r: 5, tint: '#a8ff7a', mix: 0.3 });
    // ── Deko: Baumstuempfe, Farne, Steine, kleine Pilzgruppen ──
    K.scatter(-90, -140, 90, 40, 26, (x, y, z, i, r) => {   // Pilzgruppe
      for (let k = 0; k < 3; k++) {
        const px2 = x + (r() - 0.5) * 1.6, pz = z + (r() - 0.5) * 1.6, hh = 0.5 + r() * 0.7;
        cyl(g, M4.from(px2, y, pz), 0.14, 0.12, hh, 7, hex('#f2e6c8'));
        sphere(g, M4.from(px2, y + hh, pz), 0.5, 0.3, 0.5, 8, 4, hex(['#e03a4a', '#e08a2a', '#7a5ad8'][k % 3]), true, 0, Math.PI / 2);
      }
    }, { avoid: [[-12, 12, 12, 36]] });
    K.scatter(-90, -140, 90, 40, 14, (x, y, z, i, r) => {   // Baumstumpf
      cyl(g, M4.from(x, y, z), 0.9, 0.85, 1.1, 10, hex('#6b4214'), hex('#a8763a'));
      L.solid(x - 0.85, y, z - 0.85, x + 0.85, y + 1.1, z + 0.85, 'stump');
    }, { avoid: [[-12, 12, 12, 36]] });
    K.scatter(-90, -140, 90, 40, 20, (x, y, z, i, r) => {   // Farn
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; box(g, M4.from(x, y + 0.5, z, a, 0.5), 0.25, 1.2, 0.5, hex('#2f8a3a')); }
    }, { avoid: [[-10, 12, 10, 36]] });
    K.scatter(-90, -140, 90, 40, 12, (x, y, z, i, r) => K.rock(x, y, z, 1 + r() * 1.4, hex('#7a8a6a')), { avoid: [[-12, 12, 12, 36]] });
    // ── Auftrag: fünf Leuchtpilze ──
    K.quest('leuchtpilz', MESH.leuchtpilz, [[-25, 31.1, -22], [47, 25.1, -118], [5, 20.3, -34], [-20, 1.1, -40], [60, 1.6, -70]],
      { icon: '\u{1F344}', label: 'Leuchtpilz', speaker: 'Sammlerin Flora', starPos: [0, 2.4, 14],
        done: ['Fünf Leuchtpilze — daraus mache ich die hellste Laterne des Waldes!', 'Am Waldrand ist ein Stern aufgetaucht.'] });
    L.finish();
    return L;
  }

  /* ─────────── Welt 8: Neon-Garten ───────────
     Synthwave-Nacht. Im Hof: Tanzflaeche mit Zeit-Challenge, Schwungpfeile, WELCOME-Buchstaben,
     Arcade-Automaten, Buehne. Nach Norden fuehrt die Synth-Strecke ins Nichts (Idee: Hindernis-
     parcours ueber dem Abgrund, eigenes Layout) — mit Checkpoint und Stern am Ende. */
  function buildNeon() {
    const L = new Level({ name: 'Neon-Garten', spawn: [0, 0, 20], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#1a0630'), fogNear: 90, fogFar: 320, light: v3.norm([0, -0.7, 0.7]), sky: 'synth', dim: 0.6, voidY: -30 });
    const K = kit(L), g = K.g, gw = K.glow, r = K.rnd;
    K.ground(-60, -62, 60, 40, hex('#140a24'), hex('#1b0d30'));
    K.bounds(-60, -250, 60, 40);
    for (let x = -60; x <= 60; x += 4) box(gw, M4.from(x, 0.02, -11), 0.1, 0.02, 102, x % 8 ? hex('#ff3fb0') : hex('#3ff0ff'));
    for (let z = -62; z <= 40; z += 4) box(gw, M4.from(0, 0.02, z), 120, 0.02, 0.1, z % 8 ? hex('#ff3fb0') : hex('#3ff0ff'));
    // WELCOME aus Leuchtbloecken (eigene 5x7-Schrift)
    const FONT = {
      W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
      E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
      L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
      C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
      O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
      M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    };
    const COLS = ['#ff3fb0', '#3ff0ff', '#ffe45a', '#7aff5a', '#ff9a3a', '#ff5ae0', '#5ab0ff'];
    const PX = 1.2;
    [...'WELCOME'].forEach((ch, li) => {
      const col = hex(COLS[li]), x0 = -25.2 + li * 6 * PX;
      FONT[ch].forEach((row, rr) => {
        const y = (6 - rr) * PX;
        let c = 0;
        while (c < 5) {
          if (row[c] !== '1') { c++; continue; }
          let e = c;
          while (e < 5 && row[e] === '1') e++;
          const cx = x0 + ((c + e) / 2) * PX, w = (e - c) * PX;
          box(gw, M4.from(cx, y + PX / 2, -24), w, PX, PX, col);
          L.solid(cx - w / 2, y, -24.6, cx + w / 2, y + PX, -23.4, 'letter');
          c = e;
        }
      });
    });
    // Tanzflaeche mit Zeit-Challenge
    L.block(0, 0.05, 5, 24, 0.1, 18, { top: hex('#0a0614'), side: hex('#3a1a5a') }, 'disco');
    const CORNERS = [[-10.5, -2.5], [10.5, -2.5], [-10.5, 12.5], [10.5, 12.5]];
    let active = false, timer = 0, touched = [false, false, false, false], lastSec = 0, cp = false;
    // Schwungpfeile + Sprungpad zur schwebenden Plattform
    const boost = L.block(-28, 0.05, 18, 3, 0.1, 6, { top: hex('#3ff0ff'), side: hex('#1a8aa0') }, 'boost');
    boost.dir = [0, -1];
    for (let i = 0; i < 3; i++) { box(gw, M4.from(-28.7, 0.12, 19.5 - i * 1.6, 0.6), 1.4, 0.03, 0.3, hex('#ffffff')); box(gw, M4.from(-27.3, 0.12, 19.5 - i * 1.6, -0.6), 1.4, 0.03, 0.3, hex('#ffffff')); }
    cyl(gw, M4.from(-28, 0, 4), 1.6, 1.6, 0.3, 14, hex('#ff3fb0'));
    const jp = L.solid(-29.6, 0, 2.4, -26.4, 0.3, 5.6, 'bouncy'); jp.bounce = 95;
    L.block(-28, 11.6, -19, 8, 0.8, 16, { top: hex('#2a0a4a'), side: hex('#ff3fb0') }, 'plat');
    K.coinRing(-28, 13.1, -19, 2.8, 8);
    K.coinLine([-28, 1.1, 14], [-28, 1.1, 8], 3);
    // Leuchtpalmen, Neonboegen
    [[-18, 22], [18, 22], [30, -30], [-32, -32], [30, 10], [-50, 30], [50, 30], [-54, -8], [54, -50], [-40, -55]].forEach(([x, z]) => K.palm(x, z, 0, 7, hex('#ff3fb0'), hex('#3ff0ff'), gw));
    for (const z of [30, -40]) for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI; box(gw, M4.from(Math.cos(a) * 6, Math.sin(a) * 6, z, 0, 0, a), 0.3, 1.6, 0.3, hex(k % 2 ? '#ff3fb0' : '#3ff0ff')); }
    K.portal(26, 0, -10, 7, { scale: 0.9 });
    // Arcade-Automaten (Osten)
    const SCREENS = ['#3ff0ff', '#7aff5a', '#ffe45a', '#ff5ae0', '#ff9a3a', '#5ab0ff'];
    for (let i = 0; i < 6; i++) {
      const x = 38 + (i % 3) * 5, z = -24 + Math.floor(i / 3) * 14, face = i < 3 ? 0 : Math.PI;
      const M = M4.from(x, 0, z, face);
      box(g, M4.mul(M, M4.from(0, 1.6, 0)), 2.2, 3.2, 1.6, { top: hex('#2a0a4a'), side: hex('#3a1a6a') });
      box(gw, M4.mul(M, M4.from(0, 2.2, 0.82)), 1.6, 1.2, 0.05, hex(SCREENS[i]));
      box(gw, M4.mul(M, M4.from(0, 3.05, 0.6)), 2.2, 0.35, 0.5, hex('#ff3fb0'));
      box(g, M4.mul(M, M4.from(0, 1.3, 0.95)), 2, 0.2, 0.6, hex('#1a0a2a'));
      for (const dx of [-0.5, 0.4]) sphere(gw, M4.mul(M, M4.from(dx, 1.45, 1.05)), 0.1, 0.1, 0.1, 6, 4, hex(i % 2 ? '#ff3f3f' : '#ffe45a'), true);
      L.solid(x - 1.1, 0, z - 0.8, x + 1.1, 3.2, z + 0.8, 'arcade');
    }
    // Buehne mit Lautsprechern (Westen)
    L.block(-44, 0.75, -30, 14, 1.5, 12, { top: hex('#1a0a2a'), side: hex('#ff3fb0') }, 'stage');
    for (const s of [-1, 1]) {
      L.block(-44 + s * 6, 3.9, -34, 2, 4.8, 2, { top: hex('#1a1a22'), side: hex('#2a2a36') }, 'speaker');
      for (const y of [2.8, 4.8]) cyl(gw, M4.mul(M4.from(-44 + s * 6, y, -32.98), M4.from(0, 0, 0, 0, Math.PI / 2)), 0.7, 0.7, 0.04, 14, hex('#3ff0ff'));
    }
    L.block(-44, 2.3, -33, 5, 1.6, 1.6, { top: hex('#3ff0ff'), side: hex('#2a0a4a') }, 'booth');
    K.coinRing(-44, 2.6, -28, 3, 8);
    // Neon-Skyline rund um den Hof
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * TAU, rr = 110 + (i % 4) * 16, hh = 20 + (i * 37 % 50), w = 10 + (i % 3) * 5;
      const x = Math.cos(a) * rr, z = -60 + Math.sin(a) * rr * 1.4;
      if (Math.abs(x) < 70 && z < -40) continue;                       // nicht neben die Synth-Strecke
      box(g, M4.from(x, hh / 2 - 5, z, -a), w, hh, w, { top: hex('#1a0630'), side: hex('#12002a') });
      box(gw, M4.from(x, hh - 5, z, -a), w + 0.4, 0.5, w + 0.4, hex(COLS[i % COLS.length]));
      for (let k = 0; k < 6; k++) box(gw, M4.mul(M4.from(x, hh / 2 - 5, z, -a), M4.from((((k * 7) % 5) - 2) * w * 0.18, (k - 2.5) * hh * 0.14, w / 2 + 0.05)), 0.8, 0.6, 0.05, hex(k % 2 ? '#ffe45a' : '#3ff0ff'));
    }

    // ── Synth-Strecke nach Norden ──
    const PLAT = { top: hex('#1a0a2a'), side: hex('#2a0a4a') };
    const plat = (x0, z0, x1, z1, top, col = '#3ff0ff') => {
      const b = L.block((x0 + x1) / 2, top - 0.5, (z0 + z1) / 2, x1 - x0, 1, z1 - z0, PLAT, 'course');
      for (const [ax, az, sx, sz] of [[x0, (z0 + z1) / 2, 0.12, z1 - z0], [x1, (z0 + z1) / 2, 0.12, z1 - z0], [(x0 + x1) / 2, z0, x1 - x0, 0.12], [(x0 + x1) / 2, z1, x1 - x0, 0.12]]) box(gw, M4.from(ax, top + 0.02, az), sx, 0.06, sz, hex(col));
      return b;
    };
    // Tor am Hofrand
    for (const s of [-1, 1]) box(gw, M4.from(s * 4, 4, -61.5), 0.5, 8, 0.5, hex('#ff3fb0'));
    box(gw, M4.from(0, 8, -61.5), 8.5, 0.6, 0.5, hex('#ff3fb0'));
    const gateTex = plaqueTex('SYNTH-STRECKE', '\u{1F3C1}', '#3ff0ff');
    L.decals.push({ mesh: MESH.plaque, model: M4.from(0, 9.2, -61.2, 0, 0, 0, 1.8), tex: gateTex });
    plat(-3, -72, 3, -66, 0);
    [[0, -77, 0], [-4, -82, 0.33], [4, -87, 0.66]].forEach(([x, z, ph]) => L.blinker(x, 0, z, 3.2, 3.2, hex('#ff5ae0'), 2.2, ph, 0.6));
    L.mover(0, -0.25, -94, 4, 0.5, 4, { top: hex('#3ff0ff'), side: hex('#1a8aa0') }, (t) => [Math.sin(t * 1.05) * 7, 0, 0], 'mover');
    L.mover(0, -0.25, -101, 4, 0.5, 4, { top: hex('#3ff0ff'), side: hex('#1a8aa0') }, (t) => [-Math.sin(t * 1.05) * 7, 0, 0], 'mover');
    plat(-5, -128, 5, -106, 0);
    for (const z of [-110.5, -115.5, -120.5, -125]) {
      L.block(0, 0.04, z, 10, 0.08, 1.6, { top: hex('#ff2a3a'), side: hex('#ff2a3a') }, 'lava');
      box(gw, M4.from(0, 0.1, z), 10, 0.04, 1.6, hex('#ff3a4a'));
      for (const s of [-1, 1]) box(gw, M4.from(s * 5.3, 0.6, z), 0.4, 1.2, 0.4, hex('#ff3a4a'));
    }
    const cpB = plat(-5, -140, 5, -132, 0, '#7aff5a');
    cyl(g, M4.from(4, 0, -133), 0.1, 0.1, 4, 5, hex('#dddddd'));
    const flag = build((gg) => { gg.tri([0, 4, 0], [0, 3, 0], [1.6, 3.5, 0], hex('#7aff5a')); gg.tri([0, 3, 0], [0, 4, 0], [1.6, 3.5, 0], hex('#7aff5a')); });
    const boostC = L.block(0, 0.05, -138.5, 3, 0.1, 3, { top: hex('#3ff0ff'), side: hex('#1a8aa0') }, 'boost');
    boostC.dir = [0, -1];
    for (let i = 0; i < 2; i++) { box(gw, M4.from(-0.7, 0.12, -137.8 - i * 1.2, 0.6), 1.4, 0.03, 0.3, hex('#ffffff')); box(gw, M4.from(0.7, 0.12, -137.8 - i * 1.2, -0.6), 1.4, 0.03, 0.3, hex('#ffffff')); }
    plat(-6, -166, 6, -152, -2);
    const PUSH = { top: hex('#ff9a3a'), side: hex('#c86a1a') };
    L.mover(0, -0.8, -156, 3, 2.4, 1.2, PUSH, (t) => [Math.sin(t * 1.3) * 5.5, 0, 0], 'pusher');
    L.mover(0, -0.8, -162, 3, 2.4, 1.2, PUSH, (t) => [Math.sin(t * 1.3 + Math.PI) * 5.5, 0, 0], 'pusher');
    [[-171, 0], [-176.5, 2.5], [-182, 5]].forEach(([z, mid], i) => L.mover(0, 0, z, 3.5, 1, 3.5, { top: hex('#ffe45a'), side: hex('#c8a020') }, (t) => [0, mid - 0.5 + 2 * Math.sin(t * 1.4 - i * 1.3), 0], 'piston'));
    plat(-0.8, -212, 0.8, -186, 6, '#ff5ae0');
    plat(-8, -230, 8, -216, 6, '#ffe45a');
    for (let k = 0; k <= 14; k++) { const a = k / 14 * Math.PI; box(gw, M4.from(Math.cos(a) * 7, 6 + Math.sin(a) * 7, -224, 0, 0, a), 0.35, 1.6, 0.35, hex(COLS[k % COLS.length])); }
    K.star('synth', [0, 8.2, -224]);
    cyl(gw, M4.from(0, 6, -228.5), 1.4, 1.4, 0.08, 20, hex('#7affc8'));
    for (let k = 0; k < 3; k++) cyl(gw, M4.from(0, 6.15 + k * 0.5, -228.5), 1.5 - k * 0.2, 1.5 - k * 0.2, 0.05, 20, hex('#baffe8'));
    for (const [x, y, z] of [[0, 1.2, -69], [0, 1.2, -77], [-4, 1.2, -82], [4, 1.2, -87], [0, 1.2, -108], [0, 1.2, -118], [0, 1.2, -136], [0, -0.8, -158], [0, -0.8, -164], [0, 7.2, -190], [0, 7.2, -198], [0, 7.2, -206]]) L.coin('yellow', x, y, z);
    let warping = false;
    L.update = (dt) => {
      const p = pl.pos, onFloor = pl.grounded && p[1] < 0.5 && p[2] > -60;
      const inTile = (cx, cz) => onFloor && Math.abs(p[0] - cx) < 1.6 && Math.abs(p[2] - cz) < 1.6;
      // Checkpoint (nach dem Verlassen der Welt gilt er nicht mehr)
      if (cp && !L.respawnAt) cp = false;
      if (!cp && pl.grounded && pl.groundBox === cpB) { cp = true; L.respawnAt = [0, 0, -135]; Snd.chime(6); toast('\u{1F3C1} Checkpoint!'); }
      if (!warping && pl.grounded && Math.hypot(p[0], p[2] + 228.5) < 1.5 && Math.abs(p[1] - 6) < 0.5) { warping = true; Snd.magic(); transition(() => { L.respawnAt = null; respawn(); warping = false; }); }
      if (!active && inTile(0, 5)) {
        active = true; timer = 14; lastSec = 14; touched = [false, false, false, false];
        Snd.chime(0); toast('\u{1F57A} Los! Alle vier Ecken in 14 Sekunden!');
      }
      if (!active) return;
      timer -= dt;
      if (Math.ceil(timer) < lastSec) { lastSec = Math.ceil(timer); Snd.tick(timer < 4); }
      CORNERS.forEach(([cx, cz], i) => {
        if (!touched[i] && inTile(cx, cz)) { touched[i] = true; Snd.chime(3 + i * 3); toast(`\u{1F57A} Ecke ${touched.filter(Boolean).length} / 4`); }
      });
      if (touched.every(Boolean)) {
        active = false;
        spawnStar('neon', L, [0, 3.2, 5]);
        Dialog.show('DJ Glappa', ['WAS FÜR EIN MOVE!', 'In der Mitte der Tanzfläche ist ein Stern erschienen.']);
      } else if (timer <= 0) {
        active = false; Snd.deny(); toast('\u{1F57A} Zeit um! Nochmal auf die START-Kachel.');
      }
    };
    L.drawSolid = () => {
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 6; j++) {
          const x = -10.5 + i * 3, z = -2.5 + j * 3;
          const h = (Math.sin(clock * 2 + i * 0.9 + j * 1.3) + 1) / 2;
          let c2 = [0.3 + 0.7 * h, 0.2 + 0.5 * (1 - h), 0.9, 1];
          const ci = CORNERS.findIndex(([cx, cz]) => cx === x && cz === z);
          if (ci >= 0) c2 = touched[ci] && active ? [0.3, 1, 0.4, 1] : active ? [1, 1, 1, 1] : [1, 0.85, 0.2, 1];
          draw(MESH.cube, M4.from(x, 0.12, z, 0, 0, 0, 2.8, 0.04, 2.8), { tint: c2, lit: 0 });
        }
      }
      draw(MESH.cube, M4.from(0, 0.16, 5, 0, 0, 0, 2.6, 0.04, 2.6), { tint: active ? [0.2, 0.2, 0.2, 1] : [0.3, 1, 1, 1], lit: 0 });
      draw(flag, M4.from(4, 0, -133, Math.sin(clock * 3) * 0.3), { lit: 0, tint: cp ? [0.3, 1, 0.4, 1] : [0.5, 0.5, 0.5, 1] });
    };
    L.drawAlpha = () => {
      for (let k = 0; k < 4; k++) {
        const a = Math.sin(clock * 0.8 + k * 1.6) * 0.5;
        draw(MESH.beam, M4.mul(M4.from(-50 + k * 4, 0, -36, 0, 0, a), M4.from(0, 0, 0, 0, 0, 0, 1.4, 16, 1.4)), { tint: hex(COLS[k]).concat(1), alpha: 0.12, lit: 0 });
      }
    };
    K.coinLine([-6, 1.1, 20], [6, 1.1, 20], 5);
    K.coinRing(44, 1.1, -10, 4, 8);
    K.talker(6, 0, 24, 'Schild', [
      '★ NEON-GARTEN ★\nWelcome to the 90s!',
      'TANZFLÄCHE: Stell dich auf die START-Kachel in der Mitte und berühre dann alle VIER ECKEN, bevor die Zeit abläuft.',
      'Im Norden beginnt die SYNTH-STRECKE: ein Parcours über dem Nichts. Halbzeit-Checkpoint inklusive, am Ende wartet ein Stern.',
      'Die Pfeile auf dem Boden geben ordentlich Schwung. Die WELCOME-Buchstaben kann man übrigens beklettern.',
    ]);
    K.talker(-6, 0, -58, 'Schild', ['SYNTH-STRECKE\nRosa Platten blinken, orange Blöcke schieben, rote Laser brennen. Am Checkpoint den Pfeil nutzen – der Abgrund danach ist breit!']);
    K.exit(0, 31);
    L.enemies.push(makeGrummel(15, 18), makeGrummel(-15, -10), makeGrummel(40, 20), makeGrummel(-40, 10));
    L.enemies.push(makeSpiky(20, -40, 3, '#ff3fb0'), makeSpiky(-20, -45, 3, '#3ff0ff'), makeSpiky(50, -5, 3, '#ffe45a'), makeSpiky(4, -222, 9, '#ff3fb0'));
    L.enemies.push(makeHopper(-10, -50, 3, '#3ff0ff'), makeHopper(30, 0, 3, '#ff5ae0'), makeHopper(-44, -28, 4, '#7aff5a'), makeHopper(0, -136, 3, '#ffe45a'));
    L.enemies.push(makeBat(0, 5, -90, '#3ff0ff'), makeBat(0, 5, -148, '#ff5ae0'), makeBat(0, 11, -200, '#3ff0ff'), makeSpam(-30, 8, 0));
    L.enemies.push(...makeVirus(25, -25, 3), ...makeVirus(-30, -40, 3), makeWorm(-12, 4));
    L.enemies.push(makeBomb(20, -20), makeBomb(-35, 20));
    L.enemies.push(makeRoller([[0, -211], [0, -186], [0, -183]], { speed: 6, r: 0.8, delay: 1, tint: [1, 0.3, 0.8, 0.6] }), makeRoller([[0, -211], [0, -186], [0, -183]], { speed: 6, r: 0.8, delay: 4.5, tint: [0.3, 1, 1, 0.6] }));
    // ── Leben ──
    K.life.butterflies(-40, -200, 40, 30, 8, { mesh: 'drone', y: 3, yr: 7, cols: ['#ff2ad8'], speed: 1 });
    K.life.glows(-45, -215, 45, 34, 28, { y: 0.5, yr: 7, col: '#2affe0', s: 1.1, speed: 0.8 });
    K.life.npc(-8, 16, 'DJ Vio', ['Vier Ecken, ein Takt — schaff es, bevor die Zeit aus ist.',
      'Die Pfeile auf dem Boden geben Schub.'], { cat: 2, r: 4, tint: '#ff2ad8', mix: 0.4 });
    // ── Deko: Lautsprechertuerme, Leuchtkegel, Sitzwuerfel ──
    K.scatter(-50, -200, 50, 32, 12, (x, y, z, i, r) => {   // Boxenturm
      box(g, M4.from(x, y + 1.6, z), 1.6, 3.2, 1.4, { top: hex('#2a2a3a'), side: hex('#1a1a26') });
      for (let k = 0; k < 2; k++) cyl(g, M4.from(x, y + 1 + k * 1.3, z + 0.72, 0, Math.PI / 2), 0.45, 0.45, 0.1, 10, hex('#3a3a4a'));
      box(K.glow, M4.from(x, y + 3.3, z), 1.2, 0.12, 1, hex(i % 2 ? '#ff2ad8' : '#2affe0'));
      L.solid(x - 0.8, y, z - 0.7, x + 0.8, y + 3.2, z + 0.7, 'speaker');
    }, { avoid: [[-14, -60, 14, 30]] });
    K.scatter(-50, -200, 50, 32, 16, (x, y, z, i, r) => {   // Sitzwuerfel
      box(g, M4.from(x, y + 0.45, z, r() * 3), 1.3, 0.9, 1.3, hex(['#ff2ad8', '#2affe0', '#ffe14a'][i % 3]));
      L.solid(x - 0.7, y, z - 0.7, x + 0.7, y + 0.9, z + 0.7, 'cube');
    }, { avoid: [[-12, -60, 12, 30]] });
    K.scatter(-50, -200, 50, 32, 10, (x, y, z, i, r) => K.crystal(x, y, z, 2 + r() * 2, hex(i % 2 ? '#ff7ae0' : '#7affe0')), { avoid: [[-12, -60, 12, 30]] });
    L.finish();
    return L;
  }

  /* ═══════════ Schloss-Raeume: sechs Zimmer mit eigenem Thema ═══════════
     Jeder Raum ist ein eigenes Level (eigenes Licht, eigener Nebel) hinter einer Tuer der
     Schlosshalle; die Tuer im Sueden fuehrt zurueck in die Halle. */
  function roomKit(L) {
    const K = kit(L), g = K.g;
    // Raumhuelle: Boden, Waende (mit Durchlaessen), Decke, Sockelleiste + Gesims
    K.shell = (x0, z0, x1, z1, h, c) => {
      if (!c.noFloor) K.ground(x0, z0, x1, z1, c.floorA, c.floorB, 0, c.tile || 3);
      const T = 1.5, W = c.wall, gaps = c.gaps || [], open = c.openAbove;   // open: Waende nur bis hier sichtbar, keine Decke
      const wallAlong = (side, a0, a1) => {
        const gs = gaps.filter((q) => q.side === side).sort((p, q) => p.a - q.a);
        let a = a0;
        const piece = (u0, u1, y0, y1) => {
          if (u1 - u0 < 0.01) return;
          const vis = open == null ? y1 : Math.min(y1, open);
          const blk = (ya, yb, show) => {
            if (yb - ya < 0.01) return;
            if (side === 'w' || side === 'e') { const x = side === 'w' ? x0 - T / 2 : x1 + T / 2; L.block(x, (ya + yb) / 2, (u0 + u1) / 2, T, yb - ya, u1 - u0, W, 'bigwall', show); }
            else { const z = side === 'n' ? z0 - T / 2 : z1 + T / 2; L.block((u0 + u1) / 2, (ya + yb) / 2, z, u1 - u0, yb - ya, T, W, 'bigwall', show); }
          };
          blk(y0, Math.max(y0, vis), true); blk(Math.max(y0, vis), y1, false);
        };
        for (const q of gs) { piece(a, q.a, 0, h); piece(q.a, q.b, q.h, h); a = q.b; }
        piece(a, a1, 0, h);
      };
      wallAlong('w', z0 - T, z1 + T); wallAlong('e', z0 - T, z1 + T); wallAlong('n', x0, x1); wallAlong('s', x0, x1);
      L.block((x0 + x1) / 2, h + 0.5, (z0 + z1) / 2, x1 - x0 + 2 * T, 1, z1 - z0 + 2 * T, { top: c.ceil, side: c.ceil }, 'roof', open == null);
      for (const [y, hh] of open == null ? [[0.35, 0.7], [h - 0.35, 0.7]] : [[0.35, 0.7], [open - 0.1, 0.2]]) {
        box(g, M4.from(x0 + 0.12, y, (z0 + z1) / 2), 0.24, hh, z1 - z0, c.trim);
        box(g, M4.from(x1 - 0.12, y, (z0 + z1) / 2), 0.24, hh, z1 - z0, c.trim);
        box(g, M4.from((x0 + x1) / 2, y - 0.02, z0 + 0.12), x1 - x0 - 0.2, hh - 0.04, 0.24, c.trim);
        box(g, M4.from((x0 + x1) / 2, y - 0.02, z1 - 0.12), x1 - x0 - 0.2, hh - 0.04, 0.24, c.trim);
      }
    };
    // Tuer zurueck dorthin, wo man hereinkam (Halle, Keller, Hof, Obergeschoss); Suedwand, zeigt in den Raum
    K.roomExit = (x, z, y = 0) => {
      const hub = HUBS[HOME[buildingKey]] || HUBS.hall;
      castleDoor(L, x, y, z, Math.PI, { w: 3.6, h: 4.4, plaque: plaqueTex(hub.name, hub.icon, '#ffd21f'), torches: true });
      L.door = { pos: [x, y, z - 1.4], to: HOME[buildingKey] || 'hall', label: 'Zurück: ' + hub.name, back: true };
      L.solid(x - 1.8, y, z - 0.5, x + 1.8, y + 4.4, z, 'exitdoor');
    };
    // Wandfackel; ry dreht die Vorderseite in den Raum
    K.torch = (x, y, z, ry, col = hex('#ffb13f')) => {
      const m = M4.from(x, y, z, ry);
      box(g, M4.mul(m, M4.from(0, -0.25, 0.15)), 0.22, 0.5, 0.3, hex('#2a2a32'));
      cyl(g, M4.mul(m, M4.from(0, 0.05, 0.25)), 0.1, 0.16, 0.3, 6, hex('#3a3a44'));
      cyl(K.glow, M4.mul(m, M4.from(0, 0.35, 0.25)), 0.16, 0, 0.6, 6, col);
    };
    // Wandflaeche mit Wiederhol-Textur (Regale, Tapete); Rechteck auf einer Wand, leicht davor
    K.wallTex = (tex, side, a0, a1, y0, y1, x0, z0, x1, z1, tw = 4, th = 4.6, off = 0.06) => {
      const mesh = build((gg) => {
        const u0 = a0 / tw, u1 = a1 / tw, v0 = -y1 / th, v1 = -y0 / th;
        let p;
        if (side === 'w') { const x = x0 + off; p = [[x, y0, a1], [x, y0, a0], [x, y1, a0], [x, y1, a1]]; }
        else if (side === 'e') { const x = x1 - off; p = [[x, y0, a0], [x, y0, a1], [x, y1, a1], [x, y1, a0]]; }
        else if (side === 'n') { const z = z0 + off; p = [[a0, y0, z], [a1, y0, z], [a1, y1, z], [a0, y1, z]]; }
        else { const z = z1 - off; p = [[a1, y0, z], [a0, y0, z], [a0, y1, z], [a1, y1, z]]; }
        gg.quad(p[0], p[1], p[2], p[3], C.white, [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]);
      });
      L.decals.push({ mesh, model: I4, tex });
    };
    return K;
  }
  const CHEST_TAKE = (msg) => (it) => {
    Snd.starAppear(); addCoins(10);
    burst([it.pos[0], it.pos[1] + 1, it.pos[2]], 16, { spread: 3, up: 4, life: .8, size: .2, cols: [[1, .85, .2], [1, 1, 1]], grav: 2 });
    toast(msg);
  };

  /* ─────────── Schloss-Raum: Verlies ───────────
     Kerkerzellen, ein Lavagraben mit drei Wegen (Wandsims mit Luecke, wandernde Steine,
     schmale Bruecke mit rollenden Eisenkugeln) und die Schatzkammer mit dem Stern. */
  function buildVerlies() {
    const L = new Level({ name: 'Verlies', spawn: [0, 0, 5], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#1c0e0a'), fogNear: 28, fogFar: 120, light: v3.norm([0.3, -0.9, 0.25]), sky: null, dim: 0.72, voidY: -30 });
    const K = roomKit(L), g = K.g, gw = K.glow, r = K.rnd;
    const X0 = -30, X1 = 30, Z0 = -72, Z1 = 9, H = 12;
    const FA = hex('#4a4038'), FB = hex('#3e362f'), STONE = { top: hex('#5a5048'), side: hex('#6a5e54') };
    K.shell(X0, Z0, X1, Z1, H, { noFloor: true, wall: { top: hex('#3e362f'), side: hex('#5a4e44') }, ceil: hex('#2a2420'), trim: hex('#3a322c') });
    K.ground(X0, -10, X1, Z1, FA, FB, 0, 2);
    K.ground(X0, Z0, X1, -40, FA, FB, 0, 2);
    // Lavagraben
    L.block(0, -5, -25, 60, 5, 30, { top: hex('#ff6a1a'), side: hex('#c8401a') }, 'lava');
    gw.quad([X0, -2.44, -10], [X1, -2.44, -10], [X1, -2.44, -40], [X0, -2.44, -40], hex('#ff7a2a'));
    for (let i = 0; i < 40; i++) { const x = lerp(X0, X1, r()), z = lerp(-39, -11, r()), s = 0.6 + r() * 1.6; gw.quad([x - s, -2.42, z + s * 0.4], [x + s, -2.42, z + s * 0.4], [x + s, -2.42, z - s * 0.4], [x - s, -2.42, z - s * 0.4], hex('#ffd24a')); }
    for (const z of [-10, -40]) g.quad([X0, -2.5, z], [X1, -2.5, z], [X1, 0, z], [X0, 0, z], hex('#4a3a30'));
    // Weg 1: Wandsims im Westen mit Luecke
    L.block(-29.2, -1.25, -33.5, 1.6, 2.5, 13, STONE, 'ledge'); L.block(-29.2, -1.25, -16.5, 1.6, 2.5, 13, STONE, 'ledge');
    // Weg 2: Trittsteine, zwei davon wandern
    const PIL = { top: hex('#6a5e54'), side: hex('#4a403a') };
    [[-3, -13.5], [-3, -22.5], [-3, -31.5], [3, -36]].forEach(([x, z]) => L.block(x, -1.25, z, 2.6, 2.5, 2.6, PIL, 'stone'));
    L.mover(3, -1.25, -18, 2.6, 2.5, 2.6, PIL, (t) => [Math.sin(t * 1.1) * 3.2, 0, 0], 'stone');
    L.mover(3, -1.25, -27, 2.6, 2.5, 2.6, PIL, (t) => [Math.sin(t * 1.1 + 2) * 3.2, 0, 0], 'stone');
    // Weg 3: schmale Bruecke im Osten, Eisenkugeln rollen entgegen
    L.block(22, -0.3, -25, 2, 0.6, 30, { top: hex('#7a5a3a'), side: hex('#5a3c20') }, 'bridge');
    for (let z = -39; z <= -11; z += 4) for (const x of [21, 23]) cyl(g, M4.from(x, -2.5, z), 0.1, 0.1, 3.6, 5, hex('#3a2a1a'));
    for (const x of [21, 23]) box(g, M4.from(x, 1.05, -25), 0.06, 0.06, 30, hex('#c8a870'));
    // Kerkerzellen vorn (links und rechts), Gitter mit offener Tuer
    const BAR = hex('#2a2a32');
    for (const s of [-1, 1]) {
      const bx = s * 20;
      L.block(s * 25, 3, -0.5, 10, 6, 0.6, STONE, 'cellwall'); L.block(s * 25, 3, -9.8, 10, 6, 0.6, STONE, 'cellwall');
      const door = s < 0 ? [3, 5] : [-6, -4];
      for (let z = -9.5; z <= 8.5; z += 0.5) if (!(z > door[0] && z < door[1])) box(g, M4.from(bx, 3, z), 0.1, 6, 0.1, BAR);
      for (const y of [0.2, 5.8]) box(g, M4.from(bx, y, -0.5), 0.14, 0.14, 18, BAR);
      L.solid(bx - 0.1, 0, -9.5, bx + 0.1, 6, door[0], 'bars'); L.solid(bx - 0.1, 0, door[1], bx + 0.1, 6, 8.5, 'bars');
      box(g, M4.from(bx + s * 0.9, 3, door[1] + 0.9, s * 0.6), 0.1, 5.6, 1.8, BAR);
      for (const cz of [-5, 4]) {
        box(g, M4.from(s * 27, 0.05, cz), 3, 0.1, 5, hex('#c8a84a'));
        L.coin('yellow', s * 25, 1.1, cz);
      }
      cyl(g, M4.from(s * 28, 0, -7), 0.5, 0.6, 1, 8, hex('#6a5a4a'));
    }
    K.item(MESH.chest, [-27, 0, 6], CHEST_TAKE('\u{1F5DD}\u{FE0F} Kerkerschatz: +10 Münzen!'), 1.8);
    // Schatzkammer hinten: Podest mit Stufen, Sockel, Stern
    L.block(0, 0.75, -64, 18, 1.5, 12, { top: hex('#8a1a1a'), side: hex('#5a4a3a') }, 'dais');
    for (let i = 0; i < 3; i++) L.block(0, 0.25 * (i + 1), -56.75 - i * 0.5, 10, 0.5 * (i + 1), 0.5, STONE, 'step');
    L.block(0, 2.1, -66, 2.2, 1.2, 2.2, { top: C.gold, side: hex('#b08a3a') }, 'pedestal');
    K.star('verlies', [0, 4.6, -66]);
    for (const [x, z] of [[-6, -66], [6, -66], [-5, -61], [5, -61]]) {
      sphere(g, M4.from(x, 1.5, z), 1.3, 0.55, 1, 10, 4, C.gold, true, 0, Math.PI / 2);
      for (let k = 0; k < 5; k++) cyl(g, M4.from(x + (k - 2) * 0.4, 1.9, z + (k % 2) * 0.3, 0, 0.2 * k, 0.4), 0.28, 0.28, 0.06, 8, hex('#ffd24a'));
    }
    K.item(MESH.chest, [8, 1.5, -68], CHEST_TAKE('\u{1F451} Schatzkammer: +10 Münzen!'), 1.8);
    // Fackeln, Rippenboegen, Ketten, Faesser, Spinnweben
    for (let z = 4; z > Z0; z -= 8) { K.torch(X0 + 0.25, 4.5, z, Math.PI / 2); K.torch(X1 - 0.25, 4.5, z, -Math.PI / 2); }
    for (let z = 0; z > Z0; z -= 9) {
      box(g, M4.from(0, H - 0.5, z), X1 - X0, 0.9, 1, hex('#4a4038'));
      if (z < -10 && z > -40) continue;
      for (const x of [X0 + 0.6, X1 - 0.6]) L.block(x, H / 2, z, 1.2, H, 1.2, { top: hex('#4a4038'), side: hex('#4a4038') }, 'pillar');
    }
    for (const [x, z, n] of [[-10, -20, 7], [10, -30, 9], [0, -45, 6], [-16, -60, 8], [16, -58, 7]]) {
      for (let k = 0; k < n; k++) box(g, M4.from(x, H - 0.5 - k * 0.5, z, k * 1.2), 0.3, 0.45, 0.12, hex('#5a5a64'));
    }
    for (const [x, z] of [[-26, -45], [-24, -47], [26, -46], [25, -69], [-26, -69], [18, 6], [-18, 6]]) {
      cyl(g, M4.from(x, 0, z), 0.9, 0.9, 1.8, 10, hex('#6a4428'), hex('#5a3a20'));
      for (const y of [0.4, 1.4]) cyl(g, M4.from(x, y, z), 0.93, 0.93, 0.1, 10, hex('#3a3a3a'));
      L.solid(x - 0.9, 0, z - 0.9, x + 0.9, 1.8, z + 0.9, 'barrel');
    }
    for (const [x, z, sx, sz] of [[X0, Z1, 1, -1], [X1, Z1, -1, -1], [X0, Z0, 1, 1], [X1, Z0, -1, 1]]) {
      for (let k = 0; k < 5; k++) g.tri([x + sx * 0.3, H - 0.3, z + sz * (0.3 + k * 0.5)], [x + sx * (0.3 + k * 0.5), H - 0.3, z + sz * 0.3], [x + sx * 0.3, H - 0.3 - k * 0.5, z + sz * 0.3], hex('#d8d8d8'));
    }
    // Lava: Funken steigen auf, Blasen platzen
    L.update = (dt) => {
      if (parts.length < 100 && Math.random() < dt * 14) {
        parts.push({ p: [lerp(X0, X1, Math.random()), -2.3, lerp(-39, -11, Math.random())], v: [(Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 1.4, 0],
          life: 2.2, max: 2.2, s: 0.12, col: Math.random() < 0.5 ? [1, 0.55, 0.15] : [1, 0.85, 0.3], g: -0.2, rot: Math.random() * 6 });
      }
    };
    L.drawAlpha = () => {
      for (let i = 0; i < 12; i++) {
        const ph = (clock * 0.7 + i * 0.37) % 1, x = -27 + ((i * 17) % 54), z = -12 - ((i * 23) % 26);
        draw(MESH.ball, M4.from(x, -2.45, z, 0, 0, 0, 0.3 + ph * 0.6, 0.2 + ph * 0.3, 0.3 + ph * 0.6), { tint: [1, 0.6, 0.15, 1], alpha: 0.7 * (1 - ph), lit: 0 });
      }
    };
    // Muenzen
    K.coinLine([22, 1.2, -13], [22, 1.2, -37], 6); K.coinLine([-29.2, 1.2, -12], [-29.2, 1.2, -38], 6);
    for (const [x, z] of [[-3, -13.5], [-3, -22.5], [-3, -31.5], [3, -36]]) L.coin('yellow', x, 1.3, z);
    K.coinRing(0, 2.6, -50, 4, 8);
    K.talker(4, 0, 5, 'Schild', [
      '★ VERLIES ★\nHier unten ist es warm. Sehr warm.',
      'Über den LAVAGRABEN führen drei Wege: der Wandsims links (mit einer Lücke), die Trittsteine in der Mitte (zwei davon wandern) und die schmale Brücke rechts – dort rollen Eisenkugeln.',
      'In der Schatzkammer ganz hinten wartet ein Stern. Wer in die Lava fällt, hüpft schnell wieder raus – aber es tut weh!',
    ]);
    K.roomExit(0, Z1);
    L.enemies.push(makeGrummel(-25, -4, 3), makeGrummel(25, 4, 3), makeGrummel(-12, -50), makeGrummel(12, -48));
    L.enemies.push(makeBomb(-10, -62, 3), makeBomb(10, -62, 3), makeBomb(0, -46));
    L.enemies.push(makeSpiky(-20, -55, 3, '#3a1a14'), makeSpiky(20, -52, 3, '#3a1a14'), makeSpiky(0, 0, 3, '#3a1a14'));
    L.enemies.push(makeBat(-10, 6, -25, '#5a1a1a'), makeBat(12, 7, -20, '#5a1a1a'), makeBat(0, 8, -55, '#5a1a1a'), makeBat(-20, 6, -30, '#5a1a1a'));
    L.enemies.push(makeRoller([[22, -41], [22, -9]], { speed: 6, r: 0.9, delay: 0.5 }), makeRoller([[22, -41], [22, -9]], { speed: 6, r: 0.9, delay: 4 }));
    // ── Leben ──
    K.life.critters('mouse', -22, -18, 22, 6, 5, { speed: 1.2 });
    K.life.glows(-26, -40, 26, 7, 16, { y: 1, yr: 6, col: '#ff8a3a', s: 0.7, speed: 0.35 });
    K.life.drifts(-26, -30, 26, 7, 10, { y0: 0, y1: 11, col: '#6a5a4a', s: 0.7, speed: 0.4 });
    K.life.npc(-12, 3, 'Häftling Rufus', ['Psst! Ich zähle die Steine. Zwölftausend … oder vier.',
      'Ganz unten liegt ein Stern. Und Lava. Viel Lava.'], { cat: 3, r: 3, tint: '#8a8a9a', mix: 0.4 });
    L.finish();
    return L;
  }

  /* ─────────── Schloss-Raum: Bibliothek ───────────
     Regale bis unter die Decke, zwei Galerien, Buecher-Treppe, Buecher-Aufzug und
     schwebende Buecher bis zum Lesepult mit dem verbotenen Buch. Geheim: ein Regal ist Attrappe. */
  function buildBibliothek() {
    const L = new Level({ name: 'Bibliothek', spawn: [0, 0, 5], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#2a1a0e'), fogNear: 45, fogFar: 150, light: v3.norm([-0.3, -0.85, -0.4]), sky: null, dim: 0.9 });
    const K = roomKit(L), g = K.g, gw = K.glow, r = K.rnd;
    const X0 = -24, X1 = 24, Z0 = -52, Z1 = 9, H = 28;
    const WOOD = { top: hex('#6a3a14'), side: hex('#7a4a1c') }, DARKW = { top: hex('#4a2a10'), side: hex('#5a3414') };
    K.shell(X0, Z0, X1, Z1, H, { floorA: hex('#8a5a2a'), floorB: hex('#7a4e22'), tile: 1.5, wall: DARKW, ceil: hex('#3a2410'), trim: hex('#4a2a10'),
      gaps: [{ side: 'e', a: -20, b: -16, h: 4.2 }] });
    // Regal-Textur auf allen Waenden
    const BOOKC = ['#8a2a2a', '#2a4a8a', '#2a6a3a', '#8a6a2a', '#5a2a6a', '#3a3a3a', '#a8883a', '#6a1a1a', '#1a4a5a'];
    const shelfTex = repeatTexture((c, w, h) => {
      c.fillStyle = '#3a200a'; c.fillRect(0, 0, w, h);
      const rows = 4, rh = h / rows;
      let seed = 3; const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let k = 0; k < rows; k++) {
        const y0 = k * rh + 10, y1 = (k + 1) * rh - 14;
        let x = 6;
        while (x < w - 10) {
          const bw = 12 + rr() * 16, bh = (y1 - y0) * (0.72 + rr() * 0.28), col = BOOKC[Math.floor(rr() * BOOKC.length)];
          if (rr() < 0.06) { x += bw * 1.4; continue; }
          c.fillStyle = col; c.fillRect(x, y1 - bh, bw - 2, bh);
          c.fillStyle = 'rgba(255,230,140,.55)'; c.fillRect(x + 2, y1 - bh + 10, bw - 6, 3); c.fillRect(x + 2, y1 - 16, bw - 6, 3);
          c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + bw - 5, y1 - bh, 3, bh);
          x += bw;
        }
        c.fillStyle = '#5a3414'; c.fillRect(0, (k + 1) * rh - 14, w, 14);
        c.fillStyle = '#7a4a1c'; c.fillRect(0, (k + 1) * rh - 14, w, 3);
      }
      c.fillStyle = '#4a2a10'; c.fillRect(0, 0, 8, h); c.fillRect(w - 8, 0, 8, h);
    });
    K.wallTex(shelfTex, 'w', Z0, Z1, 0.7, H - 0.7, X0, Z0, X1, Z1);
    K.wallTex(shelfTex, 'e', Z0, Z1, 0.7, H - 0.7, X0, Z0, X1, Z1);
    K.wallTex(shelfTex, 'n', X0, X1, 0.7, H - 0.7, X0, Z0, X1, Z1);
    K.wallTex(shelfTex, 's', X0, -3.2, 0.7, H - 0.7, X0, Z0, X1, Z1); K.wallTex(shelfTex, 's', 3.2, X1, 0.7, H - 0.7, X0, Z0, X1, Z1);
    K.wallTex(shelfTex, 's', -3.2, 3.2, 8, H - 0.7, X0, Z0, X1, Z1);
    // Galerien auf 8 m und 16 m (Westen, Norden, Osten) mit Gelaender und Stuetzen
    const RAIL = { top: hex('#8a5a2a'), side: hex('#6a4218') };
    for (const [y, d] of [[8, 3.5], [16, 3]]) {
      L.block(X0 + d / 2, y - 0.4, (Z0 + Z1 - 3) / 2, d, 0.8, Z1 - 3 - Z0, WOOD, 'gallery');
      L.block(X1 - d / 2, y - 0.4, (Z0 + Z1 - 3) / 2, d, 0.8, Z1 - 3 - Z0, WOOD, 'gallery');
      L.block(0, y - 0.4, Z0 + d / 2, (X1 - X0) - 2 * d, 0.8, d, WOOD, 'gallery');
      const gaps = y === 8 ? { w: [0, 5.5], e: [-31.5, -28.5], n: [-99, -98] } : { w: [-99, -98], e: [-31.5, -28.5], n: [-3.2, 3.2] };
      const railZ = (x, a, b) => { if (b - a > 0.2) L.block(x, y + 0.5, (a + b) / 2, 0.25, 1, b - a, RAIL, 'rail'); };
      const railX = (z, a, b) => { if (b - a > 0.2) L.block((a + b) / 2, y + 0.5, z, b - a, 1, 0.25, RAIL, 'rail'); };
      const cz = (v) => clamp(v, Z0 + d, Z1 - 3), cx = (v) => clamp(v, X0 + d, X1 - d);
      railZ(X0 + d, Z0 + d, cz(gaps.w[0])); railZ(X0 + d, cz(gaps.w[1]), Z1 - 3);
      railZ(X1 - d, Z0 + d, cz(gaps.e[0])); railZ(X1 - d, cz(gaps.e[1]), Z1 - 3);
      railX(Z0 + d, X0 + d, cx(gaps.n[0])); railX(Z0 + d, cx(gaps.n[1]), X1 - d);
      for (let z = Z1 - 6; z > Z0 + d; z -= 11) for (const x of [X0 + d - 0.3, X1 - d + 0.3]) L.block(x, (y - 0.8) / 2 + (y === 16 ? 4 : 0), z, 0.6, y === 16 ? 7.2 : y - 0.8, 0.6, WOOD, 'post');
    }
    // Buecher-Treppe vom Boden auf die untere Galerie (Westen)
    const bookStack = (x, z, top) => {
      L.solid(x - 1.5, 0, z - 1.5, x + 1.5, top, z + 1.5, 'books');
      let y = 0, k = 0;
      while (y < top - 0.01) {
        const th = Math.min(1.3, top - y), col = hex(BOOKC[(k * 3 + Math.round(Math.abs(x))) % BOOKC.length]);
        box(g, M4.from(x + (k % 2 ? 0.12 : -0.1), y + th / 2, z, (k % 3 - 1) * 0.05), 3, th, 3, { top: col, side: col });
        box(g, M4.from(x + (k % 2 ? 0.12 : -0.1), y + th / 2, z + 0.06, (k % 3 - 1) * 0.05), 2.8, th - 0.24, 3, hex('#f4ecd0'));
        y += th; k++;
      }
    };
    [-6, -8.4, -10.8, -13.2, -15.6, -18].forEach((x, i) => bookStack(x, 3, 1.3 * (i + 1)));
    // Buecher-Aufzug an der Ostseite (8 m <-> 16 m)
    const lift = L.mover(18.75, 0, -30, 3, 0.6, 3, { top: hex('#c8a040'), side: hex('#8a6a2a') }, (t) => [0, 11.8 + 4.1 * Math.sin(t * 0.6), 0], 'lift');
    // schwebende Buecher von der oberen Galerie zum Lesepult
    const FLY = [[0, 18.2, -46], [-3.5, 20.4, -41.5], [1.5, 22.6, -37]];
    const flying = FLY.map(([x, y, z], k) => L.mover(x, y - 0.35, z, 3, 0.7, 3, { top: hex(BOOKC[k + 1]), side: hex(BOOKC[k + 1]) }, (t) => [0, Math.sin(t * 1.3 + k) * 0.3, 0], 'book'));
    L.block(0, 24.4, -30.5, 7, 0.8, 6, WOOD, 'reading');
    cyl(g, M4.from(0, 0, -30.5), 0.8, 1, 24, 10, hex('#5a3414'));
    // das verbotene Buch: aufgeschlagen, leuchtende Seiten
    for (const s of [-1, 1]) box(gw, M4.from(s * 1.1, 25.1, -31, 0, 0.35, s * -0.15), 2, 0.12, 1.6, hex('#fff6c8'));
    box(g, M4.from(0, 24.95, -31), 4.6, 0.14, 1.9, hex('#6a1a3a'));
    K.star('bibliothek', [0, 26.6, -30.5]);
    // Lesetische mit Lampen, Globen, Sessel, Rosettenfenster, Teppich
    for (const [x, z] of [[-8, -8], [8, -8], [-8, -20], [8, -20]]) {
      L.block(x, 0.9, z, 4, 0.2, 2.2, WOOD, 'table');
      for (const dx of [-1.7, 1.7]) for (const dz of [-0.9, 0.9]) box(g, M4.from(x + dx, 0.4, z + dz), 0.15, 0.8, 0.15, DARKW.side);
      cyl(g, M4.from(x + 1, 1, z), 0.06, 0.06, 0.6, 5, C.gold);
      sphere(gw, M4.from(x + 1, 1.7, z), 0.35, 0.25, 0.35, 8, 4, hex('#7aff9a'), true, 0, Math.PI / 2);
      box(g, M4.from(x - 0.8, 1.08, z + 0.2, 0.3), 0.9, 0.15, 0.7, hex('#8a2a2a'));
    }
    for (const [x, z] of [[-18, -40], [17, 3]]) {
      sphere(g, M4.from(x, 2.4, z), 1, 1, 1, 12, 8, (i, j) => ((i + j) % 3 ? hex('#3a6ac8') : hex('#4a9a3a')), true);
      cyl(g, M4.from(x, 0, z), 0.12, 0.5, 1.4, 8, DARKW.side);
      L.solid(x - 0.9, 0, z - 0.9, x + 0.9, 3.4, z + 0.9, 'globe');
    }
    disc(gw, M4.from(0, 21, Z0 + 0.2), 3.4, 16, [hex('#ff6a8a'), hex('#ffd24a'), hex('#6ac8ff'), hex('#7aff9a')]);
    for (let k = 0; k < 8; k++) box(g, M4.from(Math.cos(k * Math.PI / 4) * 1.7, 21 + Math.sin(k * Math.PI / 4) * 1.7, Z0 + 0.27, 0, 0, k * Math.PI / 4), 3.4, 0.14, 0.06, hex('#3a2410'));
    box(g, M4.from(0, 0.06, -14), 10, 0.04, 18, hex('#6a1a2a'));
    for (let i = 0; i < 18; i++) { const x = lerp(-20, 20, r()), z = lerp(-48, 5, r()); if (Math.abs(x) < 7 && z > -34) continue; box(g, M4.from(x, 0.25, z, r() * 3), 1.4, 0.5, 1, hex(BOOKC[i % BOOKC.length])); }
    // Geheimzimmer hinter dem Attrappen-Regal (Ostwand)
    K.ground(X1 + 1.5, -24, X1 + 11, -12, hex('#5a3a5a'), hex('#4a2e4a'), 0, 1.5);
    K.ground(X1, -20, X1 + 1.5, -16, hex('#5a3a5a'), hex('#4a2e4a'), 0, 1.5);
    L.block(X1 + 6.25, 3, -24.75, 11.5, 6, 1.5, DARKW, 'bigwall'); L.block(X1 + 6.25, 3, -11.25, 11.5, 6, 1.5, DARKW, 'bigwall');
    L.block(X1 + 11.75, 3, -18, 1.5, 6, 12, DARKW, 'bigwall'); L.block(X1 + 6.25, 6.5, -18, 12, 1, 14, { top: hex('#3a2410'), side: hex('#3a2410') }, 'roof');
    K.item(MESH.chest, [X1 + 8, 0, -18], CHEST_TAKE('\u{1F4D6} Geheimzimmer: +10 Münzen!'), 1.8);
    K.coinRing(X1 + 6, 1.1, -18, 2.5, 8);
    box(gw, M4.from(X1 + 4, 1.4, -23.8), 0.3, 0.6, 0.3, hex('#fff2a8'));
    K.talker(18, 0, -10, 'Schild', ['Leise bitte! Und nicht alle Regale sind echt … manche sind nur aufgemalt.']);
    L.drawSolid = () => {
      for (const m of flying) { const b = m.b; draw(MESH.cube, M4.from((b.min[0] + b.max[0]) / 2, b.max[1] - 0.35, (b.min[2] + b.max[2]) / 2 + 0.05, 0, 0, 0, 2.7, 0.5, 2.9), { tint: [0.96, 0.93, 0.82, 1] }); }
    };
    // Muenzen
    K.coinLine([-6, 2.4, 3], [-18, 9, 3], 6);
    K.coinLine([-22, 9.1, -6], [-22, 9.1, -46], 6); K.coinLine([-18, 9.1, -50], [18, 9.1, -50], 7); K.coinLine([22, 17.1, -8], [22, 17.1, -46], 6);
    for (const [x, y, z] of FLY) L.coin('yellow', x, y + 1.2, z);
    K.talker(-4, 0, 5, 'Schild', [
      '★ BIBLIOTHEK ★\nGanz oben liegt das VERBOTENE BUCH – und darauf ein Stern.',
      'Über die Bücherstapel links kommst du auf die untere Galerie. Rechts fährt ein Bücher-Aufzug nach oben.',
      'Von der oberen Galerie führen schwebende Bücher zum Lesepult. Nicht runterschauen!',
    ]);
    K.roomExit(0, Z1);
    L.enemies.push(makeBat(-10, 12, -30, '#6a4a2a'), makeBat(12, 20, -40, '#6a4a2a'), makeBat(0, 22, -38, '#6a4a2a'), makeBat(-14, 6, -6, '#6a4a2a'));
    L.enemies.push(makeHopper(-12, -40, 3, '#e8e0c8'), makeHopper(10, -35, 3, '#e8e0c8'), makeHopper(-22, -30, 10, '#e8e0c8'), makeHopper(22, -20, 18, '#e8e0c8'));
    L.enemies.push(makeSpiky(0, -44, 3, '#3a5a2a'), makeSpiky(-14, -14, 3, '#3a5a2a'), makeGrummel(12, -2), makeGrummel(0, -26));
    // ── Leben ──
    K.life.glows(-22, -46, 22, 7, 22, { y: 1, yr: 10, col: '#ffe0a0', s: 0.6, speed: 0.3 });
    K.life.critters('mouse', -20, -16, 20, 7, 4, { speed: 1 });
    K.life.drifts(-20, -44, 20, 6, 8, { y0: 0, y1: 20, col: '#f4f0e0', s: 1.1, speed: 0.5 });
    K.life.npc(7, 3, 'Bibliothekarin Silbe', ['Leise bitte, die Bücher schlafen.',
      'Das verbotene Buch steht ganz oben. Klettern ist erlaubt.'], { cat: 1, r: 4, tint: '#ffd8a0', mix: 0.3 });
    L.finish();
    return L;
  }

  /* ─────────── Schloss-Raum: Aquarium ───────────
     Ein riesiges Becken mit Glaswaenden. Die Rampe fuehrt auf den Rundgang, von dort geht es
     kopfueber ins Wasser. Unten steht ein Mini-Schloss — der Stern liegt drinnen. */
  function buildAquarium() {
    const L = new Level({ name: 'Aquarium', spawn: [0, 0, 6], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#0e2a44'), fogNear: 45, fogFar: 150, light: v3.norm([0.2, -0.9, -0.35]), sky: null, dim: 0.95 });
    const K = roomKit(L), g = K.g, gw = K.glow, r = K.rnd;
    const X0 = -32, X1 = 32, Z0 = -64, Z1 = 10, H = 20;
    K.shell(X0, Z0, X1, Z1, H, { floorA: hex('#dfe8f0'), floorB: hex('#c8d8e8'), tile: 2, wall: { top: hex('#1a4a6a'), side: hex('#2a5a7a') }, ceil: hex('#12344e'), trim: hex('#e8e0c8') });
    const TX0 = -22, TX1 = 22, TZ0 = -52, TZ1 = -12, WY = 8.5, GH = 9;
    // Glaswaende (fest) + Rahmen
    const FR = { top: hex('#c8d0d8'), side: hex('#8a96a4') };
    L.solid(TX0 - 0.3, 0, TZ0 - 0.3, TX1 + 0.3, GH, TZ0, 'glass'); L.solid(TX0 - 0.3, 0, TZ1, TX1 + 0.3, GH, TZ1 + 0.3, 'glass');
    L.solid(TX0 - 0.3, 0, TZ0, TX0, GH, TZ1, 'glass'); L.solid(TX1, 0, TZ0, TX1 + 0.3, GH, TZ1, 'glass');
    for (let x = TX0; x <= TX1 + 0.01; x += 8.8) for (const z of [TZ0 - 0.15, TZ1 + 0.15]) box(g, M4.from(x, GH / 2, z), 0.4, GH, 0.4, FR);
    for (let z = TZ0; z <= TZ1 + 0.01; z += 10) for (const x of [TX0 - 0.15, TX1 + 0.15]) box(g, M4.from(x, GH / 2, z), 0.4, GH, 0.4, FR);
    box(g, M4.from(0, GH, TZ0 - 0.15), TX1 - TX0 + 0.6, 0.3, 0.5, FR); box(g, M4.from(0, GH, TZ1 + 0.15), TX1 - TX0 + 0.6, 0.3, 0.5, FR);
    box(g, M4.from(TX0 - 0.15, GH, (TZ0 + TZ1) / 2), 0.5, 0.3, TZ1 - TZ0, FR); box(g, M4.from(TX1 + 0.15, GH, (TZ0 + TZ1) / 2), 0.5, 0.3, TZ1 - TZ0, FR);
    box(g, M4.from(0, 0.3, TZ1 + 0.4), TX1 - TX0 + 0.8, 0.6, 0.6, FR);
    L.waters.push({ x0: TX0, x1: TX1, z0: TZ0, z1: TZ1, y: WY });
    // Sandboden, Felsen, Korallen, Seetang
    L.checker(TX0, TZ0, TX1, TZ1, 0.06, 2, hex('#e8d49a'), hex('#dcc68a'));
    const coral = (x, z) => {
      const kind = Math.floor(r() * 3), c = [hex('#ff6a8a'), hex('#ff9a3a'), hex('#b86aff'), hex('#ffd24a'), hex('#4ad8c8')][Math.floor(r() * 5)];
      if (kind === 0) for (let k = 0; k < 4; k++) cyl(g, M4.from(x, 0, z, k * 1.6, 0.35 * (k % 2 ? 1 : -1), 0.3 * (k - 1.5)), 0.2, 0.12, 1.5 + r(), 5, c);
      else if (kind === 1) sphere(g, M4.from(x, 0.3, z), 0.9, 0.65, 0.9, 8, 5, (i, j) => ((i + j) % 2 ? c : shade(c, 0.8)), false);
      else for (let k = 0; k < 5; k++) cyl(g, M4.from(x + (k - 2) * 0.3, 0, z + (k % 2) * 0.3), 0.14, 0.2, 0.9 + k * 0.3, 6, c);
    };
    for (let i = 0; i < 45; i++) { const x = lerp(TX0 + 1, TX1 - 1, r()), z = lerp(TZ0 + 1, TZ1 - 1, r()); if (Math.abs(x) < 8 && z < -24 && z > -40) continue; coral(x, z); }
    for (let i = 0; i < 30; i++) {
      const x = lerp(TX0 + 1, TX1 - 1, r()), z = lerp(TZ0 + 1, TZ1 - 1, r()), h = 2 + r() * 4;
      if (Math.abs(x) < 7 && z < -25 && z > -39) continue;
      for (let k = 0; k < 3; k++) box(g, M4.from(x + Math.sin(k * 2) * 0.15, h * (k + 0.5) / 3, z, r() * TAU, 0, (r() - 0.5) * 0.4), 0.35, h / 3 + 0.1, 0.06, shade(hex('#3f9a3a'), 0.8 + r() * 0.4));
    }
    [[-16, -46], [15, -18], [-17, -20], [16, -44]].forEach(([x, z]) => K.rock(x, 0, z, 2.2, hex('#7a8a9a')));
    // Mini-Schloss in der Mitte: Tuer im Sueden, drinnen der Stern
    const MC = { top: hex('#f0e8d8'), side: hex('#e0d4bc') };
    L.block(-3.25, 2, -27, 3.5, 4, 0.8, MC, 'mini'); L.block(3.25, 2, -27, 3.5, 4, 0.8, MC, 'mini'); L.block(0, 3.5, -27, 3, 1, 0.8, MC, 'mini');
    L.block(0, 2, -37, 10, 4, 0.8, MC, 'mini'); L.block(-4.6, 2, -32, 0.8, 4, 10, MC, 'mini'); L.block(4.6, 2, -32, 0.8, 4, 10, MC, 'mini');
    L.block(0, 4.2, -32, 10, 0.4, 10.8, { top: hex('#d8342b'), side: hex('#b8261f') }, 'mini');
    for (const [x, z] of [[-5, -27], [5, -27], [-5, -37], [5, -37]]) { cyl(g, M4.from(x, 0, z), 1.1, 1.1, 5.5, 10, MC.side, MC.top); cyl(g, M4.from(x, 5.5, z), 1.4, 0, 2.2, 10, hex('#d8342b')); }
    for (let x = -4; x <= 4; x += 2) box(g, M4.from(x, 4.7, -26.8), 1, 0.6, 0.6, MC);
    K.star('aquarium', [0, 1.6, -32]);
    K.item(MESH.chest, [15, 0.06, -30], CHEST_TAKE('\u{1F9DC} Aquarium-Schatz: +10 Münzen!'), 2);
    // Rundgang oben (9,5 m) und Rampe hinauf
    const WALK = { top: hex('#b8c4d0'), side: hex('#7a8a9a') }, WT = WY + 1;
    L.block(-23.8, WT - 0.4, (TZ0 - 3 + TZ1 + 3) / 2, 3, 0.8, TZ1 - TZ0 + 6, WALK, 'walk');
    L.block(TX1 + 0.3 + 1.85, WT - 0.4, (TZ0 - 3 + TZ1 + 3) / 2, 3.7, 0.8, TZ1 - TZ0 + 6, WALK, 'walk');
    L.block(0, WT - 0.4, TZ0 - 1.65, TX1 - TX0 + 0.6, 0.8, 3, WALK, 'walk');
    L.block(0, WT - 0.4, TZ1 + 1.65, TX1 - TX0 + 0.6, 0.8, 3, WALK, 'walk');
    for (let z = TZ0 - 2; z <= TZ1 + 2; z += 8) for (const x of [TX0 - 1.8, TX1 + 2.1]) box(g, M4.from(x, (WT - 0.8) / 2, z), 0.5, WT - 0.8, 0.5, WALK);
    K.ramp(26, -42, 30, -10, 0, WT, 'z-', WALK);
    L.block(28, (WT + 1) / 2, -42.3, 4, WT + 1, 0.6, WALK, 'curb');
    for (const [x0, z0, x1, z1] of [[TX0 - 3.3, TZ0 - 3.15, TX0 - 3.2, TZ1 + 3.15], [TX0 - 3.3, TZ0 - 3.25, TX1 + 4, TZ0 - 3.15]]) L.solid(x0, WT, z0, x1, WT + 1, z1, 'rail');
    box(g, M4.from(TX0 - 3.25, WT + 1, (TZ0 + TZ1) / 2), 0.1, 0.1, TZ1 - TZ0 + 6.3, C.gold); box(g, M4.from(0.35, WT + 1, TZ0 - 3.2), TX1 - TX0 + 7.3, 0.1, 0.1, C.gold);
    // Wal-Modell unter der Decke, Bullaugen, Baenke, Pflanzen
    const WHALE = hex('#3a6a9a'), BELLY = hex('#d8e4ee');
    const WM = M4.from(-8, 15.5, -4, 0.3);
    sphere(g, WM, 2.2, 1.8, 6, 14, 8, (i, j) => (j > 4 ? BELLY : WHALE), true);
    for (const s of [-1, 1]) {
      g.tri(P(WM, 0, 0.1, -5.6), P(WM, s * 2.6, 0.9, -7.4), P(WM, 0, -0.2, -6.6), WHALE);
      box(g, M4.mul(WM, M4.from(s * 2.2, -0.6, 1.2, 0, 0, s * 0.5)), 1.8, 0.2, 0.9, WHALE);
      sphere(g, M4.mul(WM, M4.from(s * 1.35, 0.4, 4.6)), 0.18, 0.18, 0.1, 6, 4, C.black, true);
    }
    for (const x of [-9.5, -6.5]) cyl(g, M4.from(x, 16.5, -4), 0.03, 0.03, H - 16.5, 4, hex('#aaaaaa'));
    for (const z of [0, -20, -40, -56]) for (const [x, ry] of [[X0 + 0.1, Math.PI / 2], [X1 - 0.1, -Math.PI / 2]]) {
      cyl(g, M4.mul(M4.from(x, 6, z, ry), M4.from(0, 0, 0, 0, Math.PI / 2)), 1.4, 1.4, 0.2, 16, C.gold);
      disc(gw, M4.mul(M4.from(x, 6, z, ry), M4.from(0, 0, 0.22)), 1.15, 16, hex('#3a8ac8'));
    }
    for (const x of [-12, 12]) { L.block(x, 0.5, 2, 5, 1, 1.2, { top: hex('#6a4a2a'), side: hex('#5a3a1a') }, 'bench'); }
    for (const [x, z] of [[-28, 6], [28, 6], [-28, -60], [28, -60]]) { cyl(g, M4.from(x, 0, z), 0.7, 0.9, 1.2, 8, hex('#3a6a9a')); for (let k = 0; k < 5; k++) box(g, M4.from(x, 1.8, z, k * 1.25, 0.4), 0.2, 1.8, 0.5, C.leaf); }
    // Fische, Blasen, Tafeln
    const schools = [[0, 3, -20, 6, 0.6], [-10, 5, -40, 5, -0.5], [10, 2.5, -44, 4, 0.7], [0, 6.5, -32, 9, -0.35]];
    L.drawSolid = () => {
      for (const [cx, cy, cz, rr, w] of schools) {
        for (let i = 0; i < 7; i++) {
          const a = clock * w + i * 0.4, rad = rr + Math.sin(i * 1.7) * 1.2;
          draw(MESH.fish, M4.from(cx + Math.cos(a) * rad, cy + Math.sin(clock * 1.3 + i) * 0.4 + (i % 3) * 0.5, cz + Math.sin(a) * rad, -a + (w > 0 ? 0 : Math.PI)), { lit: 0.8, tint: i % 2 ? undefined : [0.4, 0.7, 1, 0.5] });
        }
      }
      const a = clock * 0.25;
      draw(MESH.fish, M4.from(Math.cos(a) * 13, 4, -32 + Math.sin(a) * 13, -a, 0, 0, 5), { lit: 0.8, tint: [0.6, 0.6, 0.7, 0.6] });
    };
    L.update = (dt) => {
      if (parts.length < 90 && Math.random() < dt * 12) {
        const v = [[-16, -20], [16, -44], [-6, -46]][Math.floor(Math.random() * 3)];
        parts.push({ p: [v[0] + (Math.random() - 0.5) * 0.6, 0.3, v[1] + (Math.random() - 0.5) * 0.6], v: [0, 2.2, 0], life: 3.6, max: 3.6, s: 0.14, col: [0.85, 0.95, 1], g: -0.1, rot: 0 });
      }
    };
    L.drawAlpha = () => {
      const GL = [0.7, 0.9, 1, 1];
      draw(MESH.cube, M4.from(0, GH / 2, TZ1 + 0.15, 0, 0, 0, TX1 - TX0, GH, 0.04), { tint: GL, alpha: 0.16, lit: 0 });
      draw(MESH.cube, M4.from(0, GH / 2, TZ0 - 0.15, 0, 0, 0, TX1 - TX0, GH, 0.04), { tint: GL, alpha: 0.16, lit: 0 });
      draw(MESH.cube, M4.from(TX0 - 0.15, GH / 2, (TZ0 + TZ1) / 2, 0, 0, 0, 0.04, GH, TZ1 - TZ0), { tint: GL, alpha: 0.16, lit: 0 });
      draw(MESH.cube, M4.from(TX1 + 0.15, GH / 2, (TZ0 + TZ1) / 2, 0, 0, 0, 0.04, GH, TZ1 - TZ0), { tint: GL, alpha: 0.16, lit: 0 });
    };
    K.coinRing(0, 6, -32, 7, 10); K.coinLine([28, 2.4, -14], [28, 9.6, -38], 5); K.coinLine([-20, 3, -14], [-20, 3, -50], 6);
    K.talker(5, 0, 6, 'Schild', [
      '★ AQUARIUM ★\nBitte nicht an die Scheibe klopfen.',
      'Rechts führt eine Rampe auf den Rundgang. Von dort kannst du ins Becken springen – tauchen mit Z/Shift, auftauchen mit A.',
      'Im Mini-Schloss auf dem Grund liegt ein Stern. Der Eingang ist vorne. Vorsicht vor den Quallen und Seeigeln!',
    ]);
    K.roomExit(0, Z1);
    L.enemies.push(makeGhost(-8, 2.5, -20, 4, 0.4), makeGhost(10, 4, -44, 5, -0.35));
    L.enemies.push(makeSpiky(-12, -30, 3, '#3a2a4a'), makeSpiky(12, -22, 3, '#3a2a4a'), makeSpiky(-6, -48, 3, '#3a2a4a'));
    L.enemies.push(makeHopper(-24, -30, 12, '#6ac8ff'), makeHopper(0, -54, 12, '#6ac8ff'), makeHopper(-20, 0, 3, '#6ac8ff'), makeHopper(20, 2, 3, '#ff8ab0'));
    L.enemies.push(makeGrummel(-26, -4, 3), makeGrummel(26, -58, 3));
    // ── Leben ──
    K.life.fish(TX0 + 3, TZ0 + 3, TX1 - 3, TZ1 - 3, WY, 10, { col: '#ffb13f', jump: false, depth: 5 });
    K.life.fish(TX0 + 3, TZ0 + 3, TX1 - 3, TZ1 - 3, WY, 5, { col: '#6ad8e8', jump: false, depth: 4, s: 0.7, speed: 1.4 });
    K.life.smoke(0, 1.5, -32, 7, { col: '#bfe8ff', speed: 1.4, rise: 6.5, s: 0.7 });
    K.life.critters('crab', -26, -8, 26, 8, 3, { speed: 0.7 });
    K.life.npc(9, 3, 'Meeresbiologin Perla', ['Im Becken steht ein kleines Schloss. Da will jeder mal rein.',
      'Die Luftblasen tragen dich nach oben.'], { cat: 0, r: 4, tint: '#6ad8e8', mix: 0.35 });
    L.finish();
    return L;
  }

  /* ─────────── Schloss-Raum: Musikzimmer ───────────
     Ein Riesenklavier im Boden: wer die Melodie auf dem Notenblatt mit den Fuessen spielt,
     bekommt einen Stern. Trommeln federn auf die Orgel-Empore und den Balkon, schwebende
     Noten verbinden beide. */
  function buildMusik() {
    const L = new Level({ name: 'Musikzimmer', spawn: [0, 0, 6], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#1e0e2a'), fogNear: 45, fogFar: 150, light: v3.norm([0.25, -0.9, -0.3]), sky: null, dim: 0.9 });
    const K = roomKit(L), g = K.g, gw = K.glow, r = K.rnd;
    const X0 = -30, X1 = 30, Z0 = -58, Z1 = 10, H = 18;
    K.shell(X0, Z0, X1, Z1, H, { floorA: hex('#4a2a5a'), floorB: hex('#3e224c'), tile: 2, wall: { top: hex('#3a1a4a'), side: hex('#5a2a6a') }, ceil: hex('#2a1236'), trim: C.gold });
    // Tapete: goldene Notenlinien
    const paper = repeatTexture((c, w, h) => {
      c.fillStyle = '#5a2a6a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(242,194,48,.35)'; c.lineWidth = 3;
      for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(0, 180 + k * 22); c.lineTo(w, 180 + k * 22); c.stroke(); }
      c.fillStyle = 'rgba(242,194,48,.5)'; c.font = '90px serif';
      ['♪', '♫', '♩', '♬'].forEach((n, i) => c.fillText(n, 30 + i * 120, 260 - (i % 2) * 40));
    });
    for (const side of ['w', 'e']) K.wallTex(paper, side, Z0, Z1, 0.7, H - 0.7, X0, Z0, X1, Z1, 6, 6);
    // ── Das Riesenklavier ──
    const WHITE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24], NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'H', 'c', 'd', 'e', 'f', 'g', 'a', 'h', "c'"];
    const freq = (st) => 261.63 * Math.pow(2, st / 12);
    const KZ0 = -16, KZ1 = -4, keys = [];
    WHITE.forEach((st, i) => {
      const x = -21 + i * 3;
      const b = L.block(x, 0.25, (KZ0 + KZ1) / 2, 2.9, 0.5, KZ1 - KZ0, { top: hex('#f4f0e8'), side: hex('#d8d0c0') }, 'note:w' + i);
      b.freq = freq(st); b.idx = i; b.cx = x; keys.push(b);
    });
    [0, 1, 3, 4, 5, 7, 8, 10, 11, 12].forEach((i) => {
      const x = -21 + i * 3 + 1.5;
      const b = L.block(x, 0.7, KZ0 + 3.5, 1.7, 1.4, 7, { top: hex('#1a1a1e'), side: hex('#2a2a30') }, 'note:b' + i);
      b.freq = freq(WHITE[i] + 1); b.idx = -1; b.cx = x; keys.push(b);
    });
    box(g, M4.from(0, 0.8, KZ0 - 0.8), 48, 1.6, 1.6, { top: hex('#1a1a1e'), side: hex('#2a2a30') });
    L.solid(-24, 0, KZ0 - 1.6, 24, 1.6, KZ0, 'piano');
    box(g, M4.from(0, 1.65, KZ0 - 0.9), 46, 0.1, 1.2, hex('#b8261f'));
    // Tastenbeschriftung
    const atlas = labelTexture((c, w, h) => {
      c.fillStyle = '#f4f0e8'; c.fillRect(0, 0, w, h);
      c.font = '700 44px "Comic Sans MS", "Comic Neue", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      NAMES.forEach((n, i) => { c.fillStyle = ['#d8342b', '#ff8a3a', '#e0b020', '#3aa04a', '#2a8ad8', '#6a4ac8', '#c83ab0'][i % 7]; c.fillText(n, 34 + (i % 8) * 64, 34 + Math.floor(i / 8) * 64); });
    }, 512, 128);
    const capGeo = new Geo();
    WHITE.forEach((st, i) => {
      const x = -21 + i * 3, z = KZ1 - 1.6, u0 = ((i % 8) * 64 + 4) / 512, v0 = (Math.floor(i / 8) * 64 + 4) / 128, u1 = u0 + 56 / 512, v1 = v0 + 56 / 128;
      capGeo.quad([x - 1.1, 0.56, z + 1.1], [x + 1.1, 0.56, z + 1.1], [x + 1.1, 0.56, z - 1.1], [x - 1.1, 0.56, z - 1.1], C.white, [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]);
    });
    const capMesh = upload(capGeo);
    // Notenblatt an der Nordwand: "Alle meine Entchen" (Volkslied)
    const MEL = [0, 1, 2, 3, 4, 4, 5, 5, 5, 5, 4];
    const sheetTex = labelTexture((c, w, h) => {
      c.fillStyle = '#f8f0dc'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#c8a040'; c.lineWidth = 14; c.strokeRect(7, 7, w - 14, h - 14);
      c.fillStyle = '#3a1a4a'; c.textAlign = 'center'; c.font = '700 54px "Comic Sans MS", "Comic Neue", sans-serif';
      c.fillText('♪ Alle meine Entchen ♪', w / 2, 80);
      c.strokeStyle = '#3a1a4a'; c.lineWidth = 3;
      for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(60, 170 + k * 26); c.lineTo(w - 60, 170 + k * 26); c.stroke(); }
      MEL.forEach((n, i) => {
        const x = 110 + i * 78, y = 300 - n * 13;
        c.fillStyle = ['#d8342b', '#ff8a3a', '#e0b020', '#3aa04a', '#2a8ad8', '#6a4ac8', '#c83ab0'][n];
        c.beginPath(); c.ellipse(x, y, 17, 12, -0.4, 0, TAU); c.fill();
        c.fillRect(x + 13, y - 70, 5, 70);
        c.font = '700 44px "Comic Sans MS", "Comic Neue", sans-serif'; c.fillText(NAMES[n], x, 400);
      });
      c.fillStyle = '#5a2a6a'; c.font = '700 34px "Comic Sans MS", "Comic Neue", sans-serif';
      c.fillText('Spiel die Melodie mit den Füßen – von Taste zu Taste hüpfen!', w / 2, 470);
    }, 1024, 512);
    const sheetMesh = build((gg) => planeGeo(gg, I4, 16, 8, 1, 1, C.white));
    L.decals.push({ mesh: sheetMesh, model: M4.from(0, 10.5, Z0 + 0.32), tex: sheetTex });
    box(g, M4.from(0, 10.5, Z0 + 0.1), 16.8, 8.8, 0.15, C.gold);
    // Melodie erkennen
    let mIdx = 0, lastKey = null;
    const flash = new Map();
    L.update = () => {
      const gb = pl.grounded ? pl.groundBox : null;
      const onKey = gb && (gb.tag || '').startsWith('note:') ? gb : null;
      if (onKey && (onKey !== lastKey || pl.landT === time)) {
        Snd.note(onKey.freq); flash.set(onKey, clock);
        burst([onKey.cx, 1.6, -9], 5, { spread: 1.5, up: 3, life: .6, size: .16, cols: [[1, .8, .3], [.8, .5, 1]], grav: 2 });
        if (onKey.idx === MEL[mIdx]) {
          mIdx++;
          toast('♪ ' + MEL.slice(0, mIdx).map((n) => NAMES[n]).join(' '));
          if (mIdx === MEL.length) {
            mIdx = 0;
            spawnStar('musik', L, [0, 4.5, -10]);
            Dialog.show('Musikzimmer', ['BRAVO! Die ganze Melodie – fehlerfrei!', 'Über dem Klavier schwebt jetzt ein Stern.']);
          }
        } else if (mIdx > 0) {
          mIdx = onKey.idx === MEL[0] ? 1 : 0;
          Snd.deny(); toast('♪ Schiefer Ton – nochmal von vorn');
        }
      }
      lastKey = onKey;
    };
    // ── Trommeln (federn), Orgel-Empore (Ost) und Balkon (West) ──
    const drum = (x, z, rad, top, bounce, col) => {
      cyl(g, M4.from(x, 0, z), rad, rad, top - 0.2, 14, col, hex('#f4ecd8'));
      for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; box(g, M4.from(x + Math.cos(a) * rad, top / 2, z + Math.sin(a) * rad, -a + (k % 2 ? 0.4 : -0.4)), 0.06, top, 0.06, C.gold); }
      cyl(g, M4.from(x, top - 0.2, z), rad + 0.08, rad + 0.08, 0.2, 14, C.gold, hex('#f4ecd8'));
      const b = L.solid(x - rad * 0.8, 0, z - rad * 0.8, x + rad * 0.8, top, z + rad * 0.8, 'bouncy'); b.bounce = bounce; b.drum = true;
    };
    drum(24, -36, 2.2, 1.3, 82, hex('#d8342b')); drum(-24, -36, 2.2, 1.3, 92, hex('#2a6ad8'));
    drum(16, 0, 1.6, 1, 60, hex('#e0b020')); drum(-16, 0, 1.6, 1, 60, hex('#3aa04a'));
    L.onLand = (gb) => { if (gb.drum) Snd.drum(); };
    const LOFT = { top: hex('#7a4a1c'), side: hex('#5a3414') };
    L.block(24, 4.5, -51, 12, 9, 14, LOFT, 'loft');                  // Orgel-Empore Ost, 9 m
    L.block(-24, 6, -51, 12, 12, 14, LOFT, 'loft');                  // Balkon West, 12 m
    for (const [x0, x1] of [[18, 30], [-30, -18]]) box(g, M4.from((x0 + x1) / 2, x0 > 0 ? 9.5 : 12.5, -44.1), 12, 1, 0.2, C.gold);
    // Orgel: Pfeifen an der Nordwand ueber der Empore
    for (let k = 0; k < 11; k++) {
      const x = 19 + k * 1, hgt = 3 + Math.abs(5 - k) * -0.5 + 5;
      cyl(g, M4.from(x, 9, Z0 + 0.8), 0.4, 0.4, hgt, 8, k % 2 ? hex('#d8d8e0') : C.gold);
      cyl(g, M4.from(x, 9 + hgt, Z0 + 0.8), 0.4, 0, 0.5, 8, hex('#b8b8c0'));
    }
    L.block(24, 10, -49, 5, 2, 2, { top: hex('#3a1a0a'), side: hex('#5a2a14') }, 'organ');
    box(g, M4.from(24, 11.05, -48.3), 4.4, 0.1, 0.8, C.white);
    K.item(MESH.chest, [27, 9, -54], CHEST_TAKE('\u{1F3BC} Orgel-Empore: +10 Münzen!'), 1.8);
    K.item(MESH.chest, [-27, 12, -54], CHEST_TAKE('\u{1F3BA} Balkon: +10 Münzen!'), 1.8);
    // Grammophon auf dem Balkon
    box(g, M4.from(-22, 12.6, -54), 1.6, 1.2, 1.6, hex('#6a3a14'));
    cyl(g, M4.mul(M4.from(-22, 13.4, -54), M4.from(0, 0, 0, 0, -0.6)), 0.15, 1.6, 2.4, 14, C.gold);
    // schwebende Noten zwischen Empore und Balkon
    const NOTES = [[13.5, 9.8], [8, 10.4], [2.5, 11], [-3, 11.6], [-8.5, 12.2], [-14, 12.8]];
    const noteMovers = NOTES.map(([x, top], k) => { const m = L.mover(x, top - 0.3, -50, 3, 0.6, 3, C.black, (t) => [0, Math.sin(t * 1.4 + k) * 0.35, 0], 'note'); m.hidden = true; return m; });
    // Harfe, Notenstaender, Metronom, Discokugel, Scheinwerfer
    for (let k = 0; k < 9; k++) box(g, M4.from(-26 + k * 0.3, 0.5 + (1 + k * 0.35) / 2, -10), 0.04, 1 + k * 0.35, 0.04, hex('#f4e8a0'));
    box(g, M4.from(-24.8, 2.4, -10, 0, 0, 0.95), 0.2, 4, 0.2, C.gold); L.solid(-26.2, 0, -10.3, -23.4, 4, -9.7, 'harp');
    for (const [x, z] of [[-10, 2], [-4, 3], [4, 3], [10, 2]]) { cyl(g, M4.from(x, 0, z), 0.05, 0.05, 1.5, 4, hex('#2a2a2a')); box(g, M4.from(x, 1.6, z, 0, -0.4), 0.9, 0.05, 0.6, C.white); }
    const disco = build((gg) => sphere(gg, I4, 1.2, 1.2, 1.2, 12, 8, (i, j) => ((i + j) % 2 ? hex('#e8e8f0') : hex('#9a9aa8')), false));
    L.drawSolid = () => {
      draw(capMesh, I4, { tex: atlas });
      for (const m of noteMovers) {
        const b = m.b, x = (b.min[0] + b.max[0]) / 2, y = b.max[1], z = (b.min[2] + b.max[2]) / 2;
        draw(MESH.ball, M4.from(x, y - 0.55, z, 0, 0, 0.4, 1.7, 0.7, 1.3), { tint: [0.08, 0.06, 0.12, 1], shine: 0.5 });
        draw(MESH.cube, M4.from(x + 1.35, y + 1.2, z, 0, 0, 0, 0.18, 3.2, 0.18), { tint: [0.08, 0.06, 0.12, 1] });
        draw(MESH.cube, M4.from(x + 1.9, y + 2.4, z, 0, 0, -0.6, 1.2, 0.2, 0.18), { tint: [0.08, 0.06, 0.12, 1] });
      }
      draw(disco, M4.from(0, H - 2.2, -24, clock * 0.8), { shine: 0.9, lit: 1 });
      const sw = Math.sin(clock * 2.2) * 0.5;
      draw(MESH.rod, M4.mul(M4.from(-27, 1, 2, 0, 0, sw), M4.from(0, 0, 0, 0, 0, 0, 0.1, 3, 0.1)));
    };
    box(g, M4.from(-27, 0.8, 2), 1.8, 1.6, 1.2, hex('#6a3a14')); L.solid(-27.9, 0, 1.4, -26.1, 1.6, 2.6, 'metronome');
    L.drawAlpha = () => {
      for (const [k, t] of flash) {
        const f = 1 - (clock - t) / 0.5;
        if (f <= 0) { flash.delete(k); continue; }
        draw(MESH.cube, M4.from(k.cx, k.max[1] + 0.03, (k.min[2] + k.max[2]) / 2, 0, 0, 0, k.max[0] - k.min[0], 0.05, k.max[2] - k.min[2]), { tint: [1, 0.85, 0.3, 1], alpha: 0.6 * f, lit: 0 });
      }
      for (let k = 0; k < 6; k++) {
        const a = clock * 0.5 + k * TAU / 6;
        draw(MESH.ball, M4.from(Math.cos(a) * 10, 0.08, -24 + Math.sin(a) * 10, 0, 0, 0, 2.2, 0.02, 2.2), { tint: [[1, 0.3, 0.7], [0.3, 0.8, 1], [1, 0.9, 0.3]][k % 3].concat(1), alpha: 0.35, lit: 0 });
      }
    };
    K.coinLine([-21, 1.6, -8], [21, 1.6, -8], 8); K.coinLine([24, 4, -38], [24, 8, -42], 3); K.coinLine([-24, 4.5, -38], [-24, 11, -42], 3);
    for (const [x, top] of NOTES) L.coin('yellow', x, top + 1.3, -50);
    K.talker(5, 0, 6, 'Schild', [
      '★ MUSIKZIMMER ★\nDas Klavier im Boden ist echt. Stell dich drauf!',
      'An der Wand hängt ein NOTENBLATT. Spiel die Melodie Ton für Ton mit den Füßen – für doppelte Töne einfach nochmal auf dieselbe Taste springen.',
      'Die großen Trommeln federn: rechts auf die Orgel-Empore, links auf den Balkon. Dazwischen schweben Noten.',
    ]);
    K.roomExit(0, Z1);
    L.enemies.push(makeBat(-8, 8, -30, '#8a3ab0'), makeBat(10, 9, -34, '#8a3ab0'), makeBat(0, 13, -48, '#8a3ab0'));
    L.enemies.push(makeHopper(-14, -26, 3, '#ffd21f'), makeHopper(14, -30, 3, '#ffd21f'), makeHopper(24, -52, 12, '#ffd21f'), makeHopper(-10, -40, 3, '#ff7ae0'));
    L.enemies.push(makeSpiky(-6, -34, 3, '#5a2a7a'), makeSpiky(6, -44, 3, '#5a2a7a'), makeGrummel(-20, -20), makeGrummel(20, -22));
    // ── Leben ──
    K.life.butterflies(-26, -48, 26, 6, 10, { mesh: 'note', y: 2, yr: 8, cols: ['#ffd21f', '#ff7ae0', '#8ad8ff'], speed: 0.8 });
    K.life.glows(-26, -48, 26, 6, 14, { y: 1, yr: 8, col: '#ff7ae0', s: 0.7 });
    K.life.npc(9, 3, 'Kapellmeister Klang', ['Die Melodie des Schlosses hat fünf Töne.',
      'Trittst du sie in der richtigen Reihenfolge, gibt es einen Stern.'], { cat: 0, r: 4, tint: '#ff7ae0', mix: 0.35 });
    L.finish();
    return L;
  }

  /* ─────────── Schloss-Raum: Spielzimmer ───────────
     Alles riesig: Buchstabenwuerfel als Treppe, eine Spielzeugeisenbahn zum Mitfahren,
     ein Teddy zum Beklettern, ein Flummi, und ganz oben im Regal der Stern. */
  function buildSpiel() {
    const L = new Level({ name: 'Spielzimmer', spawn: [0, 0, 6], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#e8d8f8'), fogNear: 60, fogFar: 180, light: v3.norm([-0.35, -0.85, -0.3]), sky: null, dim: 1 });
    const K = roomKit(L), g = K.g, gw = K.glow, r = K.rnd;
    const X0 = -32, X1 = 32, Z0 = -66, Z1 = 10, H = 26;
    K.shell(X0, Z0, X1, Z1, H, { floorA: hex('#8ad0f0'), floorB: hex('#f0a8c8'), tile: 4, wall: { top: hex('#fff0c8'), side: hex('#fff0c8') }, ceil: hex('#c8e0ff'), trim: hex('#ff8ab0') });
    const wallpaper = repeatTexture((c, w, h) => {
      c.fillStyle = '#fff0c8'; c.fillRect(0, 0, w, h);
      const star = (x, y, r2, col) => { c.fillStyle = col; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r2 * 0.45 : r2; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.fill(); };
      star(90, 110, 42, '#ffd24a'); star(380, 300, 34, '#ff8ab0'); star(210, 420, 28, '#8ad0f0');
      c.fillStyle = '#ffffff'; for (const [x, y] of [[300, 90], [110, 330]]) { for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x + k * 36, y, 30, 0, TAU); c.fill(); } }
      c.fillStyle = '#c8a8ff'; c.beginPath(); c.arc(440, 450, 26, 0, TAU); c.fill(); c.fillStyle = '#fff0c8'; c.beginPath(); c.arc(452, 440, 22, 0, TAU); c.fill();
    });
    for (const side of ['w', 'e', 'n']) K.wallTex(wallpaper, side, side === 'n' ? X0 : Z0, side === 'n' ? X1 : Z1, 0.7, H - 0.7, X0, Z0, X1, Z1, 8, 8);
    // Buchstabenwuerfel: Atlas mit Buchstaben, Wuerfel in Bonbonfarben
    const LET = 'GLAPPA★♥123';
    const cubeAtlas = labelTexture((c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      c.font = '900 92px Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      [...LET].forEach((ch, i) => { const x = (i % 4) * 128 + 64, y = Math.floor(i / 4) * 128 + 64; c.strokeStyle = '#555'; c.lineWidth = 8; c.strokeRect(x - 58, y - 58, 116, 116); c.fillStyle = '#333'; c.fillText(ch, x, y + 4); });
    }, 512, 512);
    const cubeGeo = new Geo();
    const CUBEC = ['#ff6a6a', '#ffd24a', '#6ad86a', '#6ab0ff', '#c88aff', '#ff9a3a'];
    let cubeN = 0;
    const letterCube = (x, y, z, s) => {
      const col = hex(CUBEC[cubeN % CUBEC.length]), li = cubeN % LET.length; cubeN++;
      const u0 = ((li % 4) * 128 + 4) / 512, v0 = (Math.floor(li / 4) * 128 + 4) / 512, u1 = u0 + 120 / 512, v1 = v0 + 120 / 512, uv = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
      const hs = s / 2;
      const q = (a, b, c2, d) => cubeGeo.quad(a, b, c2, d, col, uv);
      q([x - hs, y, z + hs], [x + hs, y, z + hs], [x + hs, y + s, z + hs], [x - hs, y + s, z + hs]);
      q([x + hs, y, z - hs], [x - hs, y, z - hs], [x - hs, y + s, z - hs], [x + hs, y + s, z - hs]);
      q([x + hs, y, z + hs], [x + hs, y, z - hs], [x + hs, y + s, z - hs], [x + hs, y + s, z + hs]);
      q([x - hs, y, z - hs], [x - hs, y, z + hs], [x - hs, y + s, z + hs], [x - hs, y + s, z - hs]);
      q([x - hs, y + s, z + hs], [x + hs, y + s, z + hs], [x + hs, y + s, z - hs], [x - hs, y + s, z - hs]);
    };
    const column = (x, z, n, s = 2.6) => { for (let k = 0; k < n; k++) letterCube(x, k * s, z, s); L.solid(x - s / 2, 0, z - s / 2, x + s / 2, n * s, z + s / 2, 'cube'); };
    [[-8, -44], [-11, -47.5], [-14, -51], [-17, -54.5], [-20, -58]].forEach(([x, z], i) => column(x, z, i + 1));
    column(8, -6, 1); column(10.8, -6, 1); letterCube(9.4, 2.6, -6, 2.6); L.solid(8.1, 2.6, -7.3, 10.7, 5.2, -4.7, 'cube'); column(20, -20, 2); column(-24, 0, 1);
    const cubeMesh = upload(cubeGeo);
    // Regal ganz oben an der Nordwand, darauf Spielzeug und der Stern
    L.block(0, 13.6, -63, 64, 0.8, 6, { top: hex('#e8b870'), side: hex('#c89050') }, 'shelf');
    for (let x = -28; x <= 28; x += 14) { box(g, M4.from(x, 12, -65.2), 0.6, 3, 1.6, hex('#c89050')); }
    for (const [x, c1] of [[-6, '#d8342b'], [8, '#2a6ad8'], [20, '#3aa04a']]) {
      L.block(x, 14.8, -62.5, 3, 1.6, 1.8, { top: hex(c1), side: shade(hex(c1), 0.8) }, 'toy');
      for (const dx of [-1, 1]) for (const dz of [-0.95, 0.95]) cyl(g, M4.mul(M4.from(x + dx, 14.35, -62.5 + dz), M4.from(0, 0, 0, 0, Math.PI / 2)), 0.45, 0.45, 0.2, 10, hex('#1a1a1a'));
      box(g, M4.from(x - 0.3, 16, -62.5), 1.6, 0.9, 1.6, hex('#bfe8ff'));
    }
    sphere(g, M4.from(-14, 15.2, -62), 1.1, 1, 1, 10, 8, hex('#ffd24a'), true); sphere(g, M4.from(-13.2, 16.3, -61.6), 0.6, 0.6, 0.6, 10, 8, hex('#ffd24a'), true);
    cyl(g, M4.mul(M4.from(-12.6, 16.2, -61.3), M4.from(0, 0, 0, 0, Math.PI / 2)), 0.25, 0.1, 0.5, 8, hex('#ff8a1a'));
    L.solid(-15.1, 14, -63.1, -12.6, 16.8, -60.9, 'toy');
    K.star('spiel', [-26, 16.2, -62.5]);
    K.coinLine([-20, 15.2, -61], [26, 15.2, -61], 10);
    // Spielzeugeisenbahn: drei Wagen im Kreis, zum Mitfahren
    const TC = [0, -26], TR = 12, TW = 0.3, cars = [];
    for (let k = 0; k < 64; k++) {
      const a = k / 64 * TAU;
      for (const rr of [TR - 0.9, TR + 0.9]) box(g, M4.from(TC[0] + Math.cos(a) * rr, 0.12, TC[1] + Math.sin(a) * rr, -a), 0.12, 0.12, TAU * rr / 64 + 0.05, hex('#8a8a94'));
      if (k % 2 === 0) box(g, M4.from(TC[0] + Math.cos(a) * TR, 0.05, TC[1] + Math.sin(a) * TR, -a), 2.6, 0.1, 0.4, hex('#8a5a2a'));
    }
    const CARC = ['#d8342b', '#2a6ad8', '#e0b020'];
    for (let k = 0; k < 3; k++) {
      const m = L.mover(TC[0] + TR, 0.9, TC[1], 2.6, 1.8, 2.6, hex(CARC[k]), (t) => { const a = t * TW - k * 0.3; return [Math.cos(a) * TR - TR, 0, Math.sin(a) * TR]; }, 'train');
      m.hidden = true; m.k = k; cars.push(m);
    }
    // Flummi in der Mitte des Gleises (federt hoch)
    sphere(g, M4.from(0, 0, -26), 3, 2.2, 3, 16, 8, (i, j) => ((i >> 1) % 2 ? hex('#ff4a6a') : hex('#ffffff')), true, 0, Math.PI / 2);
    const ball = L.solid(-2.2, 0, -28.2, 2.2, 2.1, -23.8, 'bouncy'); ball.bounce = 100;
    // Teddy (beklettern!), Wachsmalstifte, Schaukelpferd, Bauklotz-Burg
    const TB = hex('#b8834a'), TBL = hex('#e8c89a');
    sphere(g, M4.from(22, 3.6, -44), 4, 4, 3.5, 16, 10, TB, true);
    sphere(g, M4.from(22, 3.6, -40.8), 2.6, 2.8, 0.8, 12, 8, TBL, true);
    sphere(g, M4.from(22, 9.4, -44), 2.8, 2.6, 2.6, 16, 10, TB, true);
    sphere(g, M4.from(22, 9.0, -41.6), 1.2, 0.9, 0.8, 10, 6, TBL, true);
    sphere(g, M4.from(22, 9.3, -40.9), 0.35, 0.25, 0.2, 8, 5, hex('#3a2010'), true);
    for (const s of [-1, 1]) {
      sphere(g, M4.from(22 + s * 2, 11.6, -44), 1, 1, 0.6, 10, 6, TB, true);
      sphere(g, M4.from(22 + s * 1.1, 10.2, -41.7), 0.28, 0.32, 0.2, 8, 5, C.black, true);
      sphere(g, M4.from(22 + s * 4.4, 4.2, -42.5), 1.3, 2.4, 1.3, 10, 8, TB, true);
      sphere(g, M4.from(22 + s * 2.2, 1.2, -39.8), 1.4, 1.2, 2.4, 10, 8, TB, true);
      L.solid(22 + s * 2.2 - 1.3, 0, -42, 22 + s * 2.2 + 1.3, 2.3, -37.6, 'teddy');
      L.solid(22 + s * 4.4 - 1.1, 0, -43.6, 22 + s * 4.4 + 1.1, 6.2, -41.4, 'teddy');
    }
    L.solid(18.5, 0, -47.2, 25.5, 7.2, -41, 'teddy'); L.solid(19.6, 7.2, -46.2, 24.4, 11.8, -42, 'teddy');
    L.solid(19.5, 0, -41.6, 24.5, 4.6, -40, 'teddy'); L.solid(20.3, 7.2, -42.2, 23.7, 9.5, -41, 'teddy');
    box(g, M4.from(22, 7.1, -41.6), 3.4, 0.5, 0.6, hex('#d8342b'));
    K.coinLine([22, 3.2, -38.5], [22, 13, -44], 4);
    [[-28, -20, 4, '#d8342b'], [-28, -26, 6, '#2a6ad8'], [-28, -32, 8, '#3aa04a'], [-28, -38, 10, '#e0b020'], [-28, -44, 12, '#c83ab0']].forEach(([x, z, hgt, c1]) => {
      cyl(g, M4.from(x, 0, z), 1.2, 1.2, hgt, 8, hex(c1), shade(hex(c1), 1.15));
      cyl(g, M4.from(x, hgt, z), 1.2, 0.2, 1.4, 8, shade(hex(c1), 1.15));
      box(g, M4.from(x, hgt * 0.5, z), 2.46, hgt * 0.3, 2.46, shade(hex(c1), 0.8));
      L.solid(x - 1.1, 0, z - 1.1, x + 1.1, hgt, z + 1.1, 'crayon');
      L.coin('yellow', x, hgt + 2.2, z);
    });
    // Burg aus Bauklotzen (Suedosten)
    const BK = [hex('#ff6a6a'), hex('#6ab0ff'), hex('#ffd24a'), hex('#6ad86a')];
    for (const [x, z] of [[20, -2], [28, -2], [20, 6], [28, 6]]) { L.block(x, 3, z, 2.4, 6, 2.4, BK[(x + z) & 3], 'tower'); cyl(g, M4.from(x, 6, z), 1.6, 0, 2, 4, BK[(x + z + 1) & 3]); }
    L.block(24, 1.5, -2, 5.6, 3, 1, BK[1], 'wall'); L.block(24, 1.5, 6, 5.6, 3, 1, BK[2], 'wall'); L.block(20, 1.5, 2, 1, 3, 5.6, BK[3], 'wall');
    K.coinRing(24.5, 1.1, 2, 1.6, 6);
    // Kreisel, Mobile, Gummiente am Eingang
    const top = build((gg) => { cyl(gg, I4, 0.1, 2, 1.6, 12, hex('#ff6a6a')); cyl(gg, M4.from(0, 1.6, 0), 2, 0.3, 1, 12, hex('#6ab0ff')); cyl(gg, M4.from(0, 2.6, 0), 0.25, 0.25, 1, 6, hex('#ffd24a')); });
    L.solid(-13, 0, -13, -9, 3, -9, 'toy');
    sphere(g, M4.from(-22, 1.2, 4), 1.6, 1.2, 1.4, 12, 8, hex('#ffd24a'), true); sphere(g, M4.from(-21.2, 2.7, 4.3), 0.9, 0.9, 0.9, 10, 8, hex('#ffd24a'), true);
    cyl(g, M4.mul(M4.from(-20.4, 2.6, 4.6), M4.from(0, 0, 0, 0.6, Math.PI / 2)), 0.3, 0.12, 0.6, 8, hex('#ff8a1a'));
    L.solid(-23.6, 0, 2.6, -20.4, 2.4, 5.4, 'toy');
    L.drawSolid = () => {
      draw(cubeMesh, I4, { tex: cubeAtlas });
      for (const m of cars) {
        const b = m.b, x = (b.min[0] + b.max[0]) / 2, z = (b.min[2] + b.max[2]) / 2, a = time * TW - m.k * 0.3;
        const W = M4.from(x, 0, z, -a);
        draw(MESH.cube, M4.mul(W, M4.from(0, 1.05, 0, 0, 0, 0, 2.4, 1.3, 2.4)), { tint: hex(CARC[m.k]).concat(1) });
        for (const dx of [-0.9, 0.9]) for (const dz of [-1.25, 1.25]) draw(MESH.rod, M4.mul(W, M4.from(dx, 0.35, dz, 0, Math.PI / 2, 0, 0.6, 0.2, 0.6)), { tint: [0.1, 0.1, 0.1, 1] });
        if (m.k === 0) {
          draw(MESH.rod, M4.mul(W, M4.from(0, 1.7, 0.7, 0, 0, 0, 0.5, 1.3, 0.5)), { tint: [0.15, 0.15, 0.18, 1] });
          draw(MESH.cube, M4.mul(W, M4.from(0, 2.3, -0.6, 0, 0, 0, 2.2, 1, 1.1)), { tint: [0.9, 0.85, 0.2, 1] });
        }
      }
      draw(top, M4.from(-11, 0.2, -11, clock * 6, 0.08 * Math.sin(clock * 2), 0));
      for (let k = 0; k < 6; k++) {
        const a = clock * 0.3 + k * TAU / 6, x = Math.cos(a) * 4, z = -26 + Math.sin(a) * 4;
        draw(MESH.rod, M4.from(x, H - 4, z, 0, 0, 0, 0.03, 4, 0.03), { tint: [0.9, 0.9, 0.9, 1] });
        draw(k % 2 ? MESH.star : MESH.ball, M4.from(x, H - 4.4, z, clock + k, 0, 0, k % 2 ? 0.9 : 0.5), { tint: k % 2 ? undefined : [0.8, 0.7, 1, 1], lit: 0.6 });
      }
    };
    K.coinLine([-6, 3.7, -44], [-20, 14.1, -58], 5);
    K.coinRing(0, 1.1, -26, 12, 16);
    K.talker(5, 0, 6, 'Schild', [
      '★ SPIELZIMMER ★\nHier bist DU das Spielzeug.',
      'Die Buchstabenwürfel links bilden eine Treppe bis ins REGAL unter der Decke. Ganz links im Regal wartet ein Stern.',
      'Die Eisenbahn fährt im Kreis – aufspringen erlaubt! Der Flummi in der Mitte federt ordentlich.',
    ]);
    K.roomExit(0, Z1);
    L.enemies.push(makeGrummel(-10, -10), makeGrummel(12, -12), makeGrummel(-14, -34), makeGrummel(24, 2, 3));
    L.enemies.push(makeBomb(10, -40), makeBomb(-20, -24));
    L.enemies.push(makeHopper(-6, 0, 3, '#ff6a6a'), makeHopper(6, -50, 3, '#6ab0ff'), makeHopper(-24, -52, 3, '#6ad86a'), makeHopper(0, -62, 16, '#ffd24a'), makeHopper(14, -62, 16, '#c88aff'));
    L.enemies.push(makeSpiky(-16, -18, 3, '#d8342b'), makeSpiky(16, -30, 3, '#d8342b'));
    L.enemies.push(makeBat(0, 10, -40, '#ff8ab0'), makeBat(-20, 16, -58, '#ff8ab0'));
    // ── Leben ──
    K.life.butterflies(-28, -58, 28, 6, 5, { mesh: 'drone', y: 3, yr: 8, cols: ['#ff5fa2'], speed: 1.1 });
    K.life.critters('mouse', -26, -16, 26, 6, 5, { speed: 1.3, col: '#ffd2e8' });
    K.life.smoke(-10, 2, -4, 8, { col: '#dff2ff', speed: 1.2, rise: 6, s: 0.8 });
    K.life.npc(10, 3, 'Spielzeug-Wächter Bolle', ['Die Bauklötze tragen dich. Der Teddy auch.',
      'Ganz oben im Regal liegt ein Stern.'], { cat: 2, r: 4, tint: '#ffd2e8', mix: 0.35 });
    L.finish();
    return L;
  }

  /* ─────────── Schloss-Raum: Sternwarte ───────────
     Auf dem Dach unter freiem Himmel: ein grosses Planetenmodell, dessen Planeten als
     Plattformen kreisen, darueber die Sonne und das Okular des Teleskops mit dem Stern. */
  function buildSternwarte() {
    const L = new Level({ name: 'Sternwarte', spawn: [0, 0, 1.5], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#0a0820'), fogNear: 160, fogFar: 460, light: v3.norm([-0.4, -0.7, -0.5]), sky: 'space', dim: 0.92, voidY: -25 });
    const K = kit(L), g = K.g, gw = K.glow, r = K.rnd;
    const STONE = { top: hex('#6a6478'), side: hex('#5a5468') };
    L.solid(-22, -2, -34, 22, 0, 10, 'ground');
    L.checker(-22, -34, 22, 10, 0, 4, hex('#3a3450'), hex('#443e5a'));
    box(g, M4.from(0, -31, -12), 44, 58, 44, { top: STONE.top, side: hex('#4a4458') });                // Turm darunter
    for (let y = -4; y > -60; y -= 6) box(g, M4.from(0, y, -12), 44.3, 0.6, 44.3, hex('#3a3448'));
    // Sternbilder auf dem Boden (leuchtend)
    const constel = [[[-16, 4], [-12, 0], [-8, 2], [-6, -3], [-10, -6]], [[8, -26], [12, -22], [16, -26], [14, -30], [10, -30], [8, -26]], [[14, 4], [17, 0], [15, -4], [19, -6]]];
    for (const line of constel) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
        box(gw, M4.from((a[0] + b[0]) / 2, 0.06, (a[1] + b[1]) / 2, Math.atan2(dx, dz)), 0.08, 0.02, l, hex('#8ac8ff'));
      }
      for (const [x, z] of line) starGeo(gw, M4.from(x, 0.07, z, 0, -Math.PI / 2), 0.4, 0.01, hex('#ffe680'));
    }
    // Gelaender rundherum (man kann drueberspringen), Laternen
    const RAIL = { top: C.gold, side: hex('#b08a3a') };
    for (const [x, z, sx, sz] of [[0, -33.8, 44, 0.4], [-21.8, -12, 0.4, 44], [21.8, -12, 0.4, 44]]) L.block(x, 0.5, z, sx, 1, sz, RAIL, 'rail');
    L.block(-13.4, 0.5, 9.8, 17.2, 1, 0.4, RAIL, 'rail'); L.block(13.4, 0.5, 9.8, 17.2, 1, 0.4, RAIL, 'rail');
    for (const [x, z] of [[-21.5, -33.5], [21.5, -33.5], [-21.5, 9.5], [21.5, 9.5], [-21.5, -12], [21.5, -12]]) K.lamp(x, z, 0, hex('#bfe0ff'), hex('#2a2a3a'));
    // Treppenhaus mit der Tuer zurueck
    L.block(-5.5, 3, 7.5, 3, 6, 5, STONE, 'bigwall'); L.block(5.5, 3, 7.5, 3, 6, 5, STONE, 'bigwall');
    L.block(0, 5, 7.5, 8, 2, 5, STONE, 'bigwall'); L.block(0, 3, 9.75, 14, 6, 0.5, STONE, 'bigwall');
    L.block(0, 6.3, 7.5, 14.4, 0.6, 5.4, { top: hex('#4a3a6a'), side: hex('#3a2a5a') }, 'roof');
    castleDoor(L, 0, 0, 5, Math.PI, { w: 3.6, h: 4, arch: false, plaque: plaqueTex('Schlosshalle', '\u{1F3F0}', '#ffd21f'), torches: true });
    L.door = { pos: [0, 0, 3.6], to: 'hall', label: 'Zurück in die Halle', back: true };
    L.solid(-1.8, 0, 4.5, 1.8, 4, 5, 'exitdoor');
    // ── Das Planetenmodell ──
    const OX = 0, OZ = -12;
    cyl(g, M4.from(OX, 0, OZ), 2.4, 2.8, 1, 16, hex('#6a5a8a'));
    cyl(g, M4.from(OX, 0, OZ), 0.5, 0.5, 10.5, 10, C.gold);
    L.solid(OX - 1.4, 0, OZ - 1.4, OX + 1.4, 1, OZ + 1.4, 'orrery'); L.solid(OX - 0.5, 0, OZ - 0.5, OX + 0.5, 10, OZ + 0.5, 'orrery');
    sphere(gw, M4.from(OX, 10.1, OZ), 2.2, 2.2, 2.2, 18, 12, hex('#ffd24a'), true);
    L.solid(OX - 1.5, 11.3, OZ - 1.5, OX + 1.5, 12.3, OZ + 1.5, 'sun');
    const PLANETS = [
      { r: 13.5, top: 2.4, w: 0.2, size: 1.6, col: '#c8683a', ring: false },
      { r: 10.5, top: 4.9, w: -0.26, size: 1.5, col: '#3a8ad8', ring: false, moon: true },
      { r: 7.5, top: 7.4, w: 0.32, size: 1.5, col: '#d8b86a', ring: true },
      { r: 4.5, top: 9.9, w: -0.4, size: 1.3, col: '#7ad8c8', ring: false },
    ];
    const pms = PLANETS.map((P, k) => {
      const m = L.mover(OX + P.r, P.top - 0.5, OZ, 3, 1, 3, C.white, (t) => { const a = t * P.w + k * 1.7; return [Math.cos(a) * P.r - P.r, 0, Math.sin(a) * P.r]; }, 'planet');
      m.hidden = true; m.P = P;
      return m;
    });
    const planetMeshes = PLANETS.map((P) => build((gg) => {
      sphere(gg, I4, P.size, P.size, P.size, 16, 10, (i, j) => ((j + (i >> 2)) % 3 ? hex(P.col) : shade(hex(P.col), 0.8)), true);
      if (P.ring) for (let i = 0; i < 24; i++) { const a0 = i / 24 * TAU, a1 = (i + 1) / 24 * TAU; gg.quad([Math.cos(a0) * 2.2, 0, Math.sin(a0) * 2.2], [Math.cos(a1) * 2.2, 0, Math.sin(a1) * 2.2], [Math.cos(a1) * 2.9, 0, Math.sin(a1) * 2.9], [Math.cos(a0) * 2.9, 0, Math.sin(a0) * 2.9], i % 2 ? hex('#e8d8a8') : hex('#c8b888')); }
    }));
    // Okular-Plattform am Teleskop, darauf der Stern
    L.block(OX, 14.1, OZ - 5.3, 4, 0.8, 3, { top: hex('#6a5a8a'), side: C.gold }, 'eyepiece');
    K.star('sternwarte', [OX, 16.6, OZ - 5.3]);
    const TUBE = M4.from(OX, 15.2, OZ - 7, 0, -0.8);
    cyl(g, TUBE, 1.3, 2.1, 20, 16, hex('#3a3a5a'));
    cyl(g, M4.mul(TUBE, M4.from(0, 20, 0)), 2.2, 2.2, 0.8, 16, C.gold);
    disc(gw, M4.mul(TUBE, M4.from(0, 20.85, 0, 0, -Math.PI / 2)), 1.9, 16, hex('#8ac8ff'));
    for (let k = 0; k < 4; k++) cyl(g, M4.mul(TUBE, M4.from(0, 3 + k * 4.5, 0)), 1.45 + k * 0.18, 1.45 + k * 0.18, 0.3, 16, C.gold);
    cyl(g, M4.from(OX, 0, OZ - 18), 1.2, 1.6, 24.6, 10, hex('#4a4a6a'));
    box(g, M4.from(OX, 25, OZ - 18), 5, 1.2, 3, hex('#4a4a6a'));
    L.solid(OX - 1.6, 0, OZ - 19.6, OX + 1.6, 25, OZ - 16.4, 'mount');
    // Kuppel hinter dem Teleskop (halb offen)
    for (let k = 0; k < 10; k++) {
      if (k === 4 || k === 5) continue;
      const a0 = Math.PI + k / 10 * Math.PI, a1 = Math.PI + (k + 1) / 10 * Math.PI;
      for (let j = 0; j < 6; j++) {
        const t0 = j / 6 * Math.PI / 2, t1 = (j + 1) / 6 * Math.PI / 2, R2 = 9, cz = OZ - 20;
        const pt = (a, t) => [OX + Math.cos(a) * Math.cos(t) * R2, Math.sin(t) * R2, cz + Math.sin(a) * Math.cos(t) * R2 * 0.6];
        g.quad(pt(a0, t0), pt(a1, t0), pt(a1, t1), pt(a0, t1), (j + k) % 2 ? hex('#c8c0d8') : hex('#b0a8c4'));
      }
    }
    // Armillarsphaere, Baenke, kleine Fernrohre
    const arm = build((gg) => { for (const [rx, rz] of [[0, 0], [Math.PI / 2, 0], [0, Math.PI / 2]]) for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; box(gg, M4.mul(M4.from(0, 0, 0, 0, rx, rz), M4.from(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5, -a)), 0.1, 0.1, 0.42, C.gold); } });
    cyl(g, M4.from(-14, 0, -24), 0.3, 0.5, 2, 8, hex('#6a5a8a')); L.solid(-14.6, 0, -24.6, -13.4, 2, -23.4, 'pedestal');
    for (const [x, z, ry] of [[-14, 4, 0], [14, 4, 0], [-16, -18, Math.PI / 2]]) { L.block(x, 0.5, z, ry ? 1.2 : 4, 1, ry ? 4 : 1.2, { top: hex('#6a4a2a'), side: hex('#5a3a1a') }, 'bench'); }
    for (const [x, z] of [[18, -28], [-18, -30], [18, 6]]) {
      for (const k of [0, 1, 2]) { const a = k / 3 * TAU; box(g, M4.mul(M4.from(x + Math.cos(a) * 0.4, 0.8, z + Math.sin(a) * 0.4, -a), M4.from(0, 0, 0, 0, 0.3)), 0.08, 1.7, 0.08, hex('#3a3a3a')); }
      cyl(g, M4.mul(M4.from(x, 1.7, z), M4.from(0, 0, 0, 0.8, -0.9)), 0.2, 0.28, 1.6, 8, C.gold);
    }
    L.drawSolid = () => {
      for (const m of pms) {
        const b = m.b, x = (b.min[0] + b.max[0]) / 2, z = (b.min[2] + b.max[2]) / 2, P = m.P;
        draw(planetMeshes[pms.indexOf(m)], M4.from(x, P.top - P.size, z, clock * 0.8), { shine: 0.3, lit: 0.9 });
        // Arm vom Mast zum Planeten
        const dx = x - OX, dz = z - OZ, l = Math.hypot(dx, dz);
        draw(MESH.cube, M4.from(OX + dx / 2, P.top - P.size - 0.3, OZ + dz / 2, Math.atan2(dx, dz), 0, 0, 0.12, 0.12, l), { tint: [0.95, 0.75, 0.2, 1] });
        if (P.moon) { const a = clock * 1.4; draw(MESH.ball, M4.from(x + Math.cos(a) * 2.6, P.top - 1, z + Math.sin(a) * 2.6, 0, 0, 0, 0.45), { tint: [0.85, 0.85, 0.8, 1] }); }
      }
      draw(arm, M4.from(-14, 3.6, -24, clock * 0.3, 0.3, 0));
    };
    L.drawAlpha = () => {
      draw(MESH.ball, M4.from(OX, 10.1, OZ, 0, 0, 0, 3.2 + Math.sin(clock * 2) * 0.15), { tint: [1, 0.85, 0.3, 1], alpha: 0.18, lit: 0 });
    };
    for (const P of PLANETS) K.coinRing(OX, P.top + 1.3, OZ, P.r, 8);
    K.coinRing(0, 1.1, -26, 3, 6);
    K.talker(9, 0, 3, 'Schild', [
      '★ STERNWARTE ★\nDer beste Blick über das ganze Schloss – und darüber hinaus.',
      'Das PLANETENMODELL dreht sich: Spring von Planet zu Planet nach innen und oben, bis auf die Sonne.',
      'Von der Sonne geht es zum OKULAR des großen Teleskops. Dort wartet ein Stern. Nicht übers Geländer fallen!',
    ]);
    L.enemies.push(makeBat(-8, 8, -12, '#2a2a6a'), makeBat(8, 11, -16, '#2a2a6a'), makeBat(0, 15, -4, '#2a2a6a'), makeBat(-16, 5, 2, '#2a2a6a'));
    L.enemies.push(makeSpiky(-12, -28, 3, '#3a3a8a'), makeSpiky(14, -2, 3, '#3a3a8a'), makeHopper(-10, 2, 3, '#b8a8ff'), makeHopper(12, -30, 3, '#b8a8ff'));
    // ── Leben ──
    K.life.glows(-20, -30, 20, 8, 22, { y: 0.5, yr: 9, col: '#bfe0ff', s: 0.8, speed: 0.5 });
    K.life.drifts(-20, -30, 20, 8, 8, { y0: 0, y1: 16, col: '#ffe98a', s: 0.9, glow: true, speed: 0.7 });
    K.life.npc(-8, 3, 'Sterngucker Kosmo', ['Durch das Teleskop sieht man mehr als Sterne.',
      'Die Planeten tragen dich, wenn du im Takt springst.'], { cat: 3, r: 4, tint: '#bfe0ff', mix: 0.35 });
    L.finish();
    return L;
  }

  /* ═══════════ Das groessere Schloss: Halle, Keller, Schlosshof, Obergeschoss ═══════════
     Die Halle ist die Drehscheibe. Jedes Gemaelde haengt in einem eigenen Zimmer hinter einer Tuer
     (Erdgeschoss, Keller, Schlosshof, Obergeschoss). HOME sagt fuer jeden Ort, wohin "zurueck" fuehrt. */
  const HUBS = {
    hall: { name: 'Schlosshalle', icon: '\u{1F3F0}' }, keller: { name: 'Kellergewölbe', icon: '\u{1F56F}\u{FE0F}' },
    og: { name: 'Obergeschoss', icon: '\u{1F451}' }, hof: { name: 'Schlosshof', icon: '\u{26F2}' },
  };
  const HOME = {
    // Welten hinter den Bildern -> ihr Bilderzimmer
    terminal: 'bild_terminal', video: 'bild_video', bounce: 'bild_bounce', spuk: 'bild_spuk', uhrwerk: 'bild_uhrwerk',
    fraktal: 'bild_fraktal', pilz: 'bild_pilz', neon: 'bild_neon', desert: 'bild_desert',
    // Zimmer -> der Flur, von dem aus man sie betritt
    bild_terminal: 'hall', bild_pilz: 'hall', bild_bounce: 'hall', bild_video: 'hall', bibliothek: 'hall', musik: 'hall',
    spiel: 'hall', sternwarte: 'hall', keller: 'hall', hof: 'hall', og: 'hall',
    verlies: 'keller', aquarium: 'keller', bild_desert: 'keller', bild_neon: 'keller',
    bild_spuk: 'hof', bild_uhrwerk: 'og', bild_fraktal: 'og',
    gym: 'garden',
  };
  let buildingKey = null;   // welches Level gerade gebaut wird (fuer die Rueckweg-Tuer)

  // Steinfigur der gewaehlten Katze, die einen Arm hochreckt (Halle, Schlosshof)
  function drawCatStatue(base, ST) {
    const G = CAT, RG = G.rig;
    const part = (key, tx, ty, tz, rx2, rz2) => draw(G[key], M4.mul(base, M4.from(tx, ty, tz, 0, rx2, rz2)), ST);
    part('leg', -RG.legX, RG.legY, 0, 0, 0); part('leg', RG.legX, RG.legY, 0, 0, 0);
    part('body', 0, RG.bodyY, 0, 0, 0); part('tail', 0, RG.tailY, RG.tailZ, -1.85, 0.3);
    part('arm', -RG.armX, RG.armY, 0, 0, -0.14); part('arm', RG.armX, RG.armY, 0, -2.9, 0.4);
    part('head', 0, RG.headY, RG.headZ, 0, 0);
  }
  // Senkrechte Wandflaeche von (x0,z0) nach (x1,z1); die Vorderseite zeigt links der Laufrichtung (+x -> +z)
  const wallQuad = (g, x0, z0, x1, z1, y0, y1, col) => g.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], col);
  // Kronleuchter an einer Kette von der Decke
  function chandelierAt(g, gw, x, y, z, top, s = 1) {
    cyl(g, M4.from(x, y, z), 0.05, 0.05, top - y, 4, hex('#2a2a2a'));
    cyl(g, M4.from(x, y - 0.2 * s, z), 2 * s, 1.6 * s, 0.35 * s, 14, C.gold);
    cyl(g, M4.from(x, y - 1.2 * s, z), 0.25 * s, 1.1 * s, 1 * s, 10, C.gold);
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * TAU, cx = x + Math.cos(a) * 1.8 * s, cz = z + Math.sin(a) * 1.8 * s;
      cyl(g, M4.from(cx, y + 0.15 * s, cz), 0.07, 0.07, 0.4 * s, 5, hex('#f4ecd8'));
      cyl(gw, M4.from(cx, y + 0.15 * s + 0.4 * s, cz), 0.07, 0, 0.25, 5, hex('#ffd878'));
    }
  }
  // Bogenfenster (leuchtend) auf einer Wand; ry dreht die Vorderseite in den Raum
  function archWindow(g, gw, x, y, z, ry, w = 2.2, h = 3, glass = '#dff0ff', frame = '#5a4a3a') {
    const m = M4.from(x, y, z, ry);
    box(gw, m, w, h, 0.05, hex(glass));
    disc(gw, M4.mul(m, M4.from(0, h / 2, 0.01)), w / 2, 12, hex(glass), 0, Math.PI);
    box(g, M4.mul(m, M4.from(0, 0.2, 0.05)), 0.12, h + w / 2 - 0.4, 0.06, hex(frame));
    box(g, M4.mul(m, M4.from(0, 0.3, 0.05)), w, 0.12, 0.06, hex(frame));
    box(g, M4.mul(m, M4.from(0, -h / 2 - 0.15, 0.2)), w + 0.4, 0.25, 0.4, C.stone);
  }
  // Zahnrad (Achse = lokales z), fuer Uhrenkammer und Deko
  const gearCache = {};
  function gearMesh(R, col) {
    const k = R + col;
    return gearCache[k] || (gearCache[k] = build((g) => {
      const c = hex(col), dk = shade(c, 0.7), teeth = Math.max(8, Math.round(R * 7));
      cyl(g, M4.from(0, 0, -0.15, 0, Math.PI / 2), R, R, 0.3, teeth * 2, c, shade(c, 1.1));
      for (let i = 0; i < teeth; i++) { const a = i / teeth * TAU; box(g, M4.from(Math.cos(a) * (R + 0.18), Math.sin(a) * (R + 0.18), 0, 0, 0, a), 0.4, 0.34, 0.3, c); }
      cyl(g, M4.from(0, 0, -0.25, 0, Math.PI / 2), R * 0.28, R * 0.28, 0.5, 10, dk);
      for (let i = 0; i < 4; i++) box(g, M4.from(0, 0, 0.17, 0, 0, i * Math.PI / 4), R * 1.6, 0.18, 0.06, dk);
    }));
  }
  // Schild, dessen Text erst beim Lesen entsteht (zeigt z. B. den aktuellen Sternstand)
  function liveSign(K, L, x, z, speaker, fn) {
    K.talker(x, 0, z, speaker, []);
    Object.defineProperty(L.talkers[L.talkers.length - 1], 'text', { get: fn });
  }

  /* ─────────── Bilderzimmer ───────────
     Wie im grossen Vorbild haengt das Gemaelde an der Stirnwand gegenueber der Tuer; eingerichtet
     ist jedes Zimmer im Stil seiner Welt. Die Sterntafel am Teppich zeigt die Sterne dieser Welt. */
  const DESERT_PD = { name: 'Wüstenstadt', bg: 'desert', level: 'desert' };
  function worldStarLines(world) {
    const where = (world === 'desert' ? DESERT_PD : PAINTINGS.find((q) => q.level === world)).name;
    const ids = Object.keys(STARS).filter((id) => STARS[id].where === where);
    const got = ids.filter((id) => state.stars[id]).length;
    return [`★ ${where.toUpperCase()} ★\nHinter diesem Bild: ${got} von ${ids.length} Sternen gefunden.`,
      ids.map((id) => (state.stars[id] ? '★ ' : '☆ ') + STARS[id].name).join('\n'),
      'Zum Hineinspringen: Anlauf nehmen und ins Bild springen!'];
  }
  const PAINT_ROOMS = {
    terminal: {
      name: 'Rechnerraum', icon: '\u{1F4BE}', col: '#3fff6a', fog: '#0c1a12', floorA: '#28382e', floorB: '#1e2c24',
      wall: '#d8d0b4', ceil: '#4a4a44', trim: '#8a8470', carpet: '#1a6a2a', torch: '#3fff6a',
      deco(K, L, D) {
        const g = K.g, gw = K.glow, r = K.rnd, BEIGE = { top: hex('#ece4cc'), side: hex('#d8cfb4') }, GREEN = hex('#2aff5a');
        // Leiterbahnen im Boden
        for (let i = 0; i < 16; i++) {
          const s = r() < 0.5 ? -1 : 1, x0 = s * (2.8 + r() * 3), z = lerp(D.Z0 + 4, D.Z1 - 3, r()), len = 1.5 + r() * 4;
          box(gw, M4.from(x0 + s * len / 2, 0.02, z), len, 0.02, 0.08, GREEN);
          box(gw, M4.from(x0 + s * len, 0.02, z - 0.7), 0.08, 0.02, 1.4, GREEN);
          box(gw, M4.from(x0, 0.03, z), 0.26, 0.03, 0.26, hex('#8affa0'));
        }
        // Schreibtische mit Rechnern an beiden Seitenwaenden
        for (const s of [-1, 1]) for (const z of [-7, -15, -23]) {
          const x = s * (D.X1 - 1.3);
          L.block(x, 0.55, z, 2, 1.1, 3.4, { top: hex('#8a6a42'), side: hex('#6a4a2a') }, 'desk');
          box(g, M4.from(x + s * 0.1, 1.45, z - 0.7), 1.2, 0.7, 1.4, BEIGE);
          box(g, M4.from(x + s * 0.2, 2.1, z + 0.6), 1.1, 1.2, 1.3, BEIGE);
          box(gw, M4.from(x - s * 0.36, 2.12, z + 0.6), 0.04, 0.9, 1.0, hex('#06240c'));
          for (let k = 0; k < 4; k++) box(gw, M4.from(x - s * 0.39, 2.42 - k * 0.2, z + 0.32 + (k % 2) * 0.12), 0.02, 0.08, 0.4 + (k % 3) * 0.12, hex('#3fff6a'));
          box(g, M4.from(x - s * 0.55, 1.13, z + 0.5), 0.5, 0.06, 1.2, hex('#bdb49a'));
          L.coin('yellow', x - s * 0.3, 1.9, z - 0.7);
        }
        // Serverschraenke neben der Tuer, mit Leuchtdioden
        for (const s of [-1, 1]) {
          const x = s * (D.X1 - 1.6);
          L.block(x, 2.2, D.Z1 - 1, 2.4, 4.4, 1.6, { top: hex('#2a2a32'), side: hex('#1a1a22') }, 'rack');
          for (let yy = 0; yy < 7; yy++) for (let k = 0; k < 5; k++) {
            const c = ['#3fff6a', '#ffb13f', '#3fa8ff', '#3fff6a', '#ff3f3f'][(yy * 5 + k * 3) % 5];
            box(gw, M4.from(x - 0.8 + k * 0.32, 0.8 + yy * 0.5, D.Z1 - 1.82), 0.12, 0.08, 0.04, hex(c));
          }
        }
        // Riesendiskette an der Stirnwand
        box(g, M4.from(9.5, 1.7, D.Z0 + 0.6, 0, 0.12), 3.2, 3.4, 0.25, hex('#2a4ad8'));
        box(g, M4.from(9.5, 2.9, D.Z0 + 0.78, 0, 0.12), 1.8, 0.9, 0.05, hex('#c8ccd8'));
        box(g, M4.from(9.5, 1.3, D.Z0 + 0.72, 0, 0.12), 2.4, 1.6, 0.05, C.white);
        L.solid(7.9, 0, D.Z0, 11.1, 3.4, D.Z0 + 1, 'floppy');
        K.life.drifts(D.X0, D.Z0, D.X1, D.Z1, 18, { y0: 0, y1: D.H, col: '#3fff6a', s: 0.6, glow: true, speed: 0.5 });
        K.life.npc(6, -11, 'Hackerin Bit', ['Psst! Hinter dem Bild liegt das TERMINAL-TAL.',
          'Da steht eine Riesentastatur auf der Wiese. Wer mit den Füßen das richtige Wort tippt, bekommt einen Stern.',
          'Aber Vorsicht: Das Tal ist verseucht! VIREN teilen sich, wenn man sie haut – erst die zwei Kleinen machen sie ganz kaputt.',
          'Dazu Computerwürmer, Software-Bugs, Spam-Mails und Pop-up-Fenster. Draufspringen oder Hechtsprung hilft gegen alles.'], { cat: 2, r: 4, tint: '#8affa0', mix: 0.3 });
        L.enemies.push(makeBug(-7, -20, 3));   // ein Bug hat sich schon bis hierher durchgefressen
      },
    },
    video: {
      name: 'Hafensaal', icon: '\u{1F30A}', col: '#6ac8ff', fog: '#0e2438', floorA: '#e8f0f8', floorB: '#9ac8e8',
      wall: '#2a6a9a', ceil: '#1a4a6a', trim: '#e8e0c8', carpet: '#1a5aa8', torch: '#8ae8ff',
      floor(K, L, D) {
        // Boden mit einem Becken an der Ostseite
        const A = hex('#e8f0f8'), B = hex('#9ac8e8'), PX0 = 5, PX1 = 11, PZ0 = -22, PZ1 = -8, BED = -3;
        K.ground(D.X0, D.Z0, PX0, D.Z1, A, B, 0, 2); K.ground(PX1, D.Z0, D.X1, D.Z1, A, B, 0, 2);
        K.ground(PX0, D.Z0, PX1, PZ0, A, B, 0, 2); K.ground(PX0, PZ1, PX1, D.Z1, A, B, 0, 2);
        L.solid(PX0, BED - 6, PZ0, PX1, BED, PZ1, 'ground');
        L.checker(PX0, PZ0, PX1, PZ1, BED, 1.5, hex('#e8d49a'), hex('#dcc68a'));
        const TILE = hex('#3a9ad8');
        wallQuad(K.g, PX0, PZ1, PX0, PZ0, BED, 0, TILE); wallQuad(K.g, PX1, PZ0, PX1, PZ1, BED, 0, TILE);
        wallQuad(K.g, PX0, PZ0, PX1, PZ0, BED, 0, TILE); wallQuad(K.g, PX1, PZ1, PX0, PZ1, BED, 0, TILE);
        const RIM = { top: hex('#f4f0e4'), side: hex('#c8c0a8') };
        L.block((PX0 + PX1) / 2, 0.2, PZ0 - 0.3, PX1 - PX0 + 1.2, 0.4, 0.6, RIM, 'rim');
        L.block((PX0 + PX1) / 2, 0.2, PZ1 + 0.3, PX1 - PX0 + 1.2, 0.4, 0.6, RIM, 'rim');
        L.block(PX0 - 0.3, 0.2, (PZ0 + PZ1) / 2, 0.6, 0.4, PZ1 - PZ0, RIM, 'rim');
        L.block(PX1 + 0.3, 0.2, (PZ0 + PZ1) / 2, 0.6, 0.4, PZ1 - PZ0, RIM, 'rim');
        L.waters.push({ x0: PX0, x1: PX1, z0: PZ0, z1: PZ1, y: -0.25, tint: [0.2, 0.6, 0.95, 0.6] });
        K.life.fish(PX0 + 0.5, PZ0 + 0.5, PX1 - 0.5, PZ1 - 0.5, -0.25, 5);
        for (const z of [-19, -15, -11]) L.coin('yellow', 8, -2, z);
      },
      deco(K, L, D) {
        const g = K.g, gw = K.glow, WOOD = hex('#8a5a2a'), BRASS = hex('#d8aa4a');
        // Steuerrad an der Westwand
        const wm = M4.from(D.X0 + 0.3, 4.6, -14, Math.PI / 2);
        for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; box(g, M4.mul(wm, M4.from(Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0, 0, 0, a)), 0.2, 0.55, 0.2, WOOD); }
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * TAU;
          box(g, M4.mul(wm, M4.from(0, 0, 0, 0, 0, a)), 0.14, 2.6, 0.14, WOOD);
          box(g, M4.mul(wm, M4.from(-Math.sin(a) * 1.75, Math.cos(a) * 1.75, 0, 0, 0, a)), 0.16, 0.6, 0.16, shade(WOOD, 0.8));
        }
        cyl(g, M4.mul(wm, M4.from(0, 0, -0.1, 0, Math.PI / 2)), 0.35, 0.35, 0.3, 10, BRASS);
        // Bullaugen mit Meerblick
        for (const [x, z, ry] of [[D.X0 + 0.1, -5, Math.PI / 2], [D.X0 + 0.1, -23, Math.PI / 2], [D.X1 - 0.1, -4, -Math.PI / 2], [D.X1 - 0.1, -26, -Math.PI / 2]]) {
          const m = M4.from(x, 4.4, z, ry);
          disc(gw, m, 0.9, 16, hex('#3aa8f0'));
          for (let k = 0; k < 3; k++) sphere(gw, M4.mul(m, M4.from(-0.3 + k * 0.3, -0.2 + (k % 2) * 0.35, 0.02)), 0.14, 0.06, 0.02, 6, 3, hex('#ffb13f'), true);
          for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; box(g, M4.mul(m, M4.from(Math.cos(a) * 1, Math.sin(a) * 1, 0.05, 0, 0, a)), 0.2, 0.5, 0.14, BRASS); }
        }
        // Rettungsring ueber dem Becken
        const rm = M4.from(D.X1 - 0.15, 4, -15, -Math.PI / 2);
        for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; box(g, M4.mul(rm, M4.from(Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0.1, 0, 0, a)), 0.34, 0.32, 0.3, (k >> 2) % 2 ? C.white : hex('#e52521')); }
        // Anker neben dem Bild
        const ax = -9.5, az = D.Z0 + 0.7, IRON = hex('#3a3a44');
        box(g, M4.from(ax, 2.2, az), 0.3, 3.6, 0.3, IRON); box(g, M4.from(ax, 3.7, az), 1.6, 0.26, 0.26, IRON);
        for (const s of [-1, 1]) box(g, M4.from(ax + s * 0.7, 0.75, az, 0, 0, s * 0.9), 0.28, 1.6, 0.28, IRON);
        cyl(g, M4.from(ax, 4, az, 0, Math.PI / 2), 0.35, 0.35, 0.1, 10, IRON);
        L.solid(ax - 1.2, 0, az - 0.4, ax + 1.2, 4.2, az + 0.4, 'anchor');
        // Strandecke: Sand, Palme im Kuebel, Liegestuhl, Sonnenschirm
        g.quad([D.X0, 0.04, -2], [-5, 0.04, -2], [-5, 0.04, -9], [D.X0, 0.04, -9], hex('#ecd8a0'));
        cyl(g, M4.from(-10.5, 0, -26), 0.9, 1.1, 1, 10, hex('#b8683a'));
        L.solid(-11.5, 0, -27, -9.5, 1, -25, 'pot');
        K.palm(-10.5, -26, 1, 5.5);
        box(g, M4.from(-8.5, 0.5, -5, 0.3, -0.5), 1.1, 0.08, 2.2, hex('#ff7a3a'));
        cyl(g, M4.from(-10.5, 0, -6), 0.06, 0.06, 2.8, 5, C.white);
        for (let k = 0; k < 8; k++) {   // Schirm: rot-weisse Bahnen
          const a0 = k / 8 * TAU, a1 = (k + 1) / 8 * TAU;
          g.tri([-10.5, 3.4, -6], [-10.5 + Math.cos(a1) * 1.8, 2.6, -6 + Math.sin(a1) * 1.8], [-10.5 + Math.cos(a0) * 1.8, 2.6, -6 + Math.sin(a0) * 1.8], k % 2 ? C.white : hex('#e52521'));
        }
        L.coin('yellow', -7, 1.1, -4); L.coin('yellow', -9, 1.1, -8);
        K.life.glows(D.X0, D.Z0, D.X1, D.Z1, 10, { y: 1, yr: 6, col: '#8ae8ff', s: 0.6, speed: 0.4 });
        K.life.npc(-5, -12, 'Matrosin Möwe', ['Ahoi! Hinter dem Bild liegt die VIDEO-BUCHT.',
          'Das Leuchtfeuer dort ist aus, und in der Senke liegt ein altes Wrack. Viel Glück!'], { cat: 0, r: 3, tint: '#bfe8ff', mix: 0.35 });
      },
    },
    bounce: {
      name: 'Eissaal', icon: '\u{2744}\u{FE0F}', col: '#aee8ff', fog: '#b8cce0', floorA: '#dff4ff', floorB: '#b8e0f8', dim: 1,
      wall: '#8ab8e0', ceil: '#6a98c8', trim: '#f4fbff', carpet: '#3a7ad8', torch: '#9af0ff',
      floor(K, L, D) {
        // Neben dem Teppich ist der Boden spiegelglatt
        L.solid(D.X0, -8, D.Z0, -2.4, 0, D.Z1, 'ice'); L.solid(2.4, -8, D.Z0, D.X1, 0, D.Z1, 'ice');
        L.solid(-2.4, -8, D.Z0, 2.4, 0, D.Z1, 'ground');
        L.checker(D.X0, D.Z0, D.X1, D.Z1, 0, 2, hex('#dff4ff'), hex('#bfe6fa'));
        for (let i = 0; i < 26; i++) { const x = (K.rnd() < 0.5 ? -1 : 1) * lerp(3, D.X1 - 1, K.rnd()), z = lerp(D.Z0 + 2, D.Z1 - 2, K.rnd()); box(K.glow, M4.from(x, 0.015, z, K.rnd() * 3), 1.6, 0.01, 0.06, hex('#ffffff')); }
      },
      deco(K, L, D) {
        const g = K.g, gw = K.glow, SNOW = hex('#f6fbff'), ICE = hex('#bfefff'), r = K.rnd;
        // Schneemann mit Hut
        const sx = -7.5, sz = -15;
        sphere(g, M4.from(sx, 1.1, sz), 1.3, 1.2, 1.3, 12, 8, SNOW, true);
        sphere(g, M4.from(sx, 2.8, sz), 0.95, 0.9, 0.95, 12, 8, SNOW, true);
        sphere(g, M4.from(sx, 4.1, sz), 0.7, 0.68, 0.7, 12, 8, SNOW, true);
        for (const s of [-1, 1]) sphere(g, M4.from(sx + s * 0.25, 4.25, sz + 0.62), 0.08, 0.08, 0.05, 6, 4, C.black, true);
        cyl(g, M4.from(sx, 4.05, sz + 0.6, 0, Math.PI / 2), 0.1, 0, 0.6, 6, hex('#ff8a2a'));
        for (let k = 0; k < 3; k++) sphere(g, M4.from(sx, 2.4 + k * 0.4, sz + 0.9), 0.08, 0.08, 0.05, 6, 4, C.black, true);
        cyl(g, M4.from(sx, 4.6, sz), 0.75, 0.75, 0.08, 12, C.black); cyl(g, M4.from(sx, 4.68, sz), 0.48, 0.45, 0.8, 12, C.black);
        cyl(g, M4.from(sx, 4.72, sz), 0.49, 0.49, 0.16, 12, hex('#e52521'));
        box(g, M4.from(sx, 3.45, sz, 0, 0, 0), 1.9, 0.26, 1.9, hex('#e52521'));
        for (const s of [-1, 1]) box(g, M4.from(sx + s * 1.4, 3.1, sz, 0, 0, s * 0.7), 0.1, 1.4, 0.1, hex('#6b4214'));
        L.solid(sx - 1.3, 0, sz - 1.3, sx + 1.3, 5.4, sz + 1.3, 'snowman');
        // Verschneite Tannen, Eiskristalle, Schneewehen
        for (const [x, z, h] of [[-10.5, -26, 6], [10.5, -26, 6.5], [10.5, -2, 5]]) K.pine(x, z, 0, h, true);
        for (const [x, z, h] of [[8, -10, 2.4], [9.5, -18, 3], [-10.5, -6, 2.2], [-3.6, -24, 1.8]]) { K.crystal(x, 0, z, h, ICE, r() * 3); L.solid(x - 0.5, 0, z - 0.5, x + 0.5, h, z + 0.5, 'crystal'); }
        for (let i = 0; i < 12; i++) {
          const side = i % 4, t = lerp(0.1, 0.9, r()), x = side === 0 ? D.X0 : side === 1 ? D.X1 : lerp(D.X0, D.X1, t), z = side > 1 ? (side === 2 ? D.Z0 : D.Z1) : lerp(D.Z0, D.Z1, t);
          if (Math.abs(x) < 4.5 && side === 3) continue;
          sphere(g, M4.from(x, 0, z), 1.2 + r(), 0.5 + r() * 0.4, 1.2 + r(), 10, 4, SNOW, true, 0, Math.PI / 2);
        }
        // Eiszapfen an der Decke
        for (let x = D.X0 + 0.8; x < D.X1; x += 1.3) for (const z of [D.Z0 + 0.3, D.Z1 - 0.3]) cyl(gw, M4.from(x, D.H, z, 0, Math.PI), 0.14, 0, 0.5 + r() * 0.9, 5, ICE);
        for (let z = D.Z0 + 0.8; z < D.Z1; z += 1.3) for (const x of [D.X0 + 0.3, D.X1 - 0.3]) cyl(gw, M4.from(x, D.H, z, 0, Math.PI), 0.14, 0, 0.5 + r() * 0.9, 5, ICE);
        // Schlitten
        for (const s of [-1, 1]) box(g, M4.from(7 + s * 0.6, 0.12, -6), 0.12, 0.2, 2.6, hex('#8a2a1a'));
        box(g, M4.from(7, 0.5, -6), 1.5, 0.12, 2.2, hex('#b8763a'));
        K.coinLine([6, 1.1, -24], [6, 1.1, -12], 5); K.coinLine([-5, 1.1, -24], [-5, 1.1, -20], 3);
        K.life.drifts(D.X0, D.Z0, D.X1, D.Z1, 40, { y0: 0, y1: D.H, col: '#ffffff', s: 0.7, speed: 0.6 });
        K.life.npc(-4, -6, 'Schneekatze Flocke', ['Brrr! Hinter dem Bild liegt der BOUNCE-BERG.',
          'Neben dem Teppich ist der Boden spiegelglatt. Schlittern macht Spaß – Bremsen nicht.'], { cat: 1, r: 2.5, tint: '#e8f4ff', mix: 0.45 });
      },
    },
    spuk: {
      name: 'Geisterkapelle', icon: '\u{1F47B}', col: '#c8a8ff', fog: '#140a24', floorA: '#3a2a4a', floorB: '#2a1e36', d: 34, dim: 0.72,
      wall: '#4a3a5a', ceil: '#1e1428', trim: '#6a5a7a', carpet: '#5a1a3a', torch: '#b88aff',
      deco(K, L, D) {
        const g = K.g, gw = K.glow, r = K.rnd, WOOD = { top: hex('#4a2a1a'), side: hex('#3a2014') };
        // Kirchenbaenke, Kerzenstaender am Gang
        for (let z = -7; z > D.Z0 + 8; z -= 3.6) for (const s of [-1, 1]) {
          L.block(s * 6, 0.45, z, 6, 0.9, 1, WOOD, 'bench');
          box(g, M4.from(s * 6, 1.35, z + 0.45), 6, 1, 0.14, WOOD.side);
          if (Math.round(z) % 2) {
            cyl(g, M4.from(s * 3.3, 0, z), 0.08, 0.06, 1.6, 5, hex('#2a2a32'));
            cyl(g, M4.from(s * 3.3, 1.6, z), 0.1, 0.1, 0.35, 6, hex('#f4ecd8'));
            cyl(gw, M4.from(s * 3.3, 1.95, z), 0.09, 0, 0.3, 5, hex('#ffcf6a'));
          }
        }
        // Orgel an der Ostwand
        for (let i = 0; i < 13; i++) {
          const z = -23 + i * 0.95, h = 4 + Math.sin(i / 12 * Math.PI) * 4;
          cyl(g, M4.from(D.X1 - 0.8, 1.6, z), 0.36, 0.36, h, 8, i % 2 ? hex('#c8c0b0') : hex('#d8aa4a'));
          cyl(g, M4.from(D.X1 - 0.8, 1.4, z), 0.2, 0.36, 0.3, 8, hex('#2a2a32'));
        }
        L.block(D.X1 - 1, 0.8, -17.3, 2, 1.6, 13, WOOD, 'organ');
        // Spitzbogenfenster im Westen, violett leuchtend
        for (const z of [-9, -19, -29]) {
          const m = M4.from(D.X0 + 0.08, 4.8, z, Math.PI / 2);
          box(gw, m, 2, 4, 0.05, hex('#6a3aa8'));
          gw.tri(P(m, -1, 2, 0), P(m, 1, 2, 0), P(m, 0, 3.4, 0), hex('#8a5ad8'));
          box(g, M4.mul(m, M4.from(0, 0.4, 0.05)), 0.1, 4.8, 0.06, hex('#1a1020')); box(g, M4.mul(m, M4.from(0, 0.6, 0.05)), 2, 0.1, 0.06, hex('#1a1020'));
        }
        // Kuerbisse mit leuchtenden Gesichtern, Spinnweben
        for (const [x, z] of [[-10.5, -3], [10.5, -3], [-9, D.Z0 + 2], [3.8, D.Z0 + 3]]) {
          sphere(g, M4.from(x, 0.55, z), 0.75, 0.6, 0.75, 10, 6, (i) => (i % 2 ? hex('#ff8a1a') : hex('#e8701a')), true);
          cyl(g, M4.from(x, 1.05, z), 0.08, 0.06, 0.3, 5, hex('#3a6a2a'));
          for (const s of [-1, 1]) gw.tri([x + s * 0.3, 0.75, z + 0.72], [x + s * 0.1, 0.75, z + 0.74], [x + s * 0.2, 0.92, z + 0.73], hex('#ffd24a'));
          L.solid(x - 0.7, 0, z - 0.7, x + 0.7, 1.1, z + 0.7, 'pumpkin');
        }
        for (const [x, z, sx, sz] of [[D.X0, D.Z1, 1, -1], [D.X1, D.Z1, -1, -1], [D.X0, D.Z0, 1, 1], [D.X1, D.Z0, -1, 1]]) {
          for (let k = 0; k < 5; k++) g.tri([x + sx * 0.3, D.H - 0.3, z + sz * (0.3 + k * 0.5)], [x + sx * (0.3 + k * 0.5), D.H - 0.3, z + sz * 0.3], [x + sx * 0.3, D.H - 0.3 - k * 0.5, z + sz * 0.3], hex('#d8d8e8'));
        }
        K.coinLine([0, 1.1, -8], [0, 1.1, -24], 5);
        L.enemies.push(makeGhost(-6, 1.8, -15, 3, 0.5), makeGhost(6, 1.8, -24, 3, -0.45));
        K.life.glows(D.X0, D.Z0, D.X1, D.Z1, 14, { y: 1, yr: 7, col: '#b88aff', s: 0.8, speed: 0.3 });
        K.life.npc(-4, -4, 'Küster Knarz', ['Hinter dem Bild wartet SPUK-HOME, das alte Herrenhaus.',
          'Dort gibt es eine Wand, die lügt, fünf Kürbislichter – und Geister, jede Menge Geister.'], { cat: 3, r: 2, tint: '#8a7a9a', mix: 0.4 });
      },
    },
    uhrwerk: {
      name: 'Uhrenkammer', icon: '\u{23F0}', col: '#ffd27a', fog: '#2a1a0c', floorA: '#8a5a2a', floorB: '#6a4420',
      wall: '#6a4a2a', ceil: '#3a2614', trim: '#d8aa4a', carpet: '#7a1a1a', torch: '#ffcf7a', h: 12,
      deco(K, L, D) {
        const g = K.g, gw = K.glow;
        // Zahnraeder an den Seitenwaenden drehen sich gegeneinander
        for (const s of [-1, 1]) {
          const x = s * (D.X1 - 0.35), ry = s < 0 ? Math.PI / 2 : -Math.PI / 2;
          [[-9, 6.5, 2.3, 0.35, '#d8aa4a'], [-14.6, 8.4, 1.4, -0.58, '#b88a3a'], [-21, 5.6, 2.8, 0.29, '#c89a4a'], [-26.4, 8.6, 1.2, -0.68, '#d8aa4a']].forEach(([z, y, R, w, col], i) => {
            K.anim(gearMesh(R, col), (t) => M4.from(x, y, z, ry, 0, t * w * s + i));
          });
        }
        // Standuhr an der Ostwand mit echter Uhrzeit
        const cx = D.X1 - 1, cz = -3.5, WOOD = { top: hex('#5a3014'), side: hex('#6a3a1a') };
        L.block(cx, 2.4, cz, 1.4, 4.8, 1.6, WOOD, 'clock');
        box(g, M4.from(cx, 5.05, cz), 1.6, 0.5, 1.9, WOOD); box(g, M4.from(cx, 5.45, cz), 1.2, 0.3, 1.4, C.gold);
        const face = M4.from(cx - 0.72, 4, cz, -Math.PI / 2);
        disc(gw, face, 0.6, 20, hex('#fff6dc'));
        for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; box(g, M4.mul(face, M4.from(Math.sin(a) * 0.5, Math.cos(a) * 0.5, 0.02, 0, 0, -a)), 0.04, 0.12, 0.02, hex('#2a1a0a')); }
        box(gw, M4.from(cx - 0.71, 2, cz), 0.03, 2, 0.9, hex('#3a2a18'));
        // Grosses Pendel unter der Decke
        const pend = build((gg) => {
          box(gg, M4.from(0, -3.2, 0), 0.14, 6.4, 0.14, C.gold);
          cyl(gg, M4.from(0, -7, -0.2, 0, Math.PI / 2), 1.1, 1.1, 0.4, 16, C.gold, hex('#ffe08a'));
        });
        K.anim(pend, (t) => M4.from(-6.5, D.H, -18, 0, 0, Math.sin(t * 1.7) * 0.45));
        // Wanduhren im Westen, jede zeigt eine andere Zeit
        for (const [z, y, rr, a1, a2] of [[-6, 10.4, 0.7, 1, 4], [-12, 10.8, 0.5, 2.5, 0.3], [-18, 10.2, 0.8, 5, 3], [-24, 10.6, 0.6, 3.6, 1.2]]) {
          const m = M4.from(D.X0 + 0.2, y, z, Math.PI / 2);
          disc(gw, m, rr, 16, hex('#fff2d0'));
          for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; box(g, M4.mul(m, M4.from(Math.cos(a) * rr, Math.sin(a) * rr, 0.02, 0, 0, a)), 0.12, rr * 0.45, 0.1, C.gold); }
          box(g, M4.mul(m, M4.from(Math.sin(a1) * rr * 0.3, Math.cos(a1) * rr * 0.3, 0.05, 0, 0, -a1)), 0.06, rr * 0.6, 0.03, C.black);
          box(g, M4.mul(m, M4.from(Math.sin(a2) * rr * 0.4, Math.cos(a2) * rr * 0.4, 0.06, 0, 0, -a2)), 0.04, rr * 0.8, 0.03, C.black);
        }
        // Sanduhren, lose Zahnraeder
        for (const [x, z] of [[-9, -4], [-10.5, -9]]) {
          cyl(g, M4.from(x, 0, z), 0.5, 0.5, 0.12, 8, C.gold); cyl(g, M4.from(x, 1.4, z), 0.5, 0.5, 0.12, 8, C.gold);
          cyl(gw, M4.from(x, 0.12, z), 0.42, 0.05, 0.64, 8, hex('#ffe0a0')); cyl(gw, M4.from(x, 0.76, z), 0.05, 0.42, 0.64, 8, hex('#e8f0ff'));
          L.solid(x - 0.5, 0, z - 0.5, x + 0.5, 1.52, z + 0.5, 'hourglass');
        }
        const hm = build((gg) => box(gg, M4.from(0, 0.2, 0), 0.06, 0.4, 0.02, C.black)), mm = build((gg) => box(gg, M4.from(0, 0.27, 0), 0.04, 0.54, 0.02, C.black));
        L.drawSolid = () => {
          const d = new Date(), mi = d.getMinutes() + d.getSeconds() / 60, hr = (d.getHours() % 12) + mi / 60;
          draw(hm, M4.mul(face, M4.from(0, 0, 0.04, 0, 0, -hr / 12 * TAU)), { lit: 0.3 });
          draw(mm, M4.mul(face, M4.from(0, 0, 0.06, 0, 0, -mi / 60 * TAU)), { lit: 0.3 });
        };
        K.coinRing(-6.5, 1.1, -18, 2.2, 6);
        K.life.drifts(D.X0, D.Z0, D.X1, D.Z1, 14, { y0: 0, y1: D.H, col: '#ffd27a', s: 0.5, glow: true, speed: 0.4 });
        K.life.npc(5, -8, 'Uhrmacher Tick', ['Tick … tack … Hinter dem Bild tickt das SUCH-UHRWERK.',
          'Drei Lupen hat dort jemand verlegt. Und ganz oben auf dem Uhrwerk soll ein Stern liegen.'], { cat: 0, r: 3, tint: '#ffd27a', mix: 0.35 });
      },
    },
    fraktal: {
      name: 'Regenbogensaal', icon: '\u{1F308}', col: '#ff9aff', fog: '#2a0a3a', floorA: '#16163a', floorB: '#22224a', dim: 0.9,
      wall: '#1a1a40', ceil: '#0a0a20', trim: '#8a5cff', carpet: '#8a5cff', torch: '#ff9aff', h: 12,
      sky: 'fractal', open: 1.4, trip: 0.7,   // statt Waenden und Decke: ein lebendiger Fraktal-Himmel ringsum
      deco(K, L, D) {
        const g = K.g, gw = K.glow, r = K.rnd, RB = ['#ff3b3b', '#ff9a2e', '#ffe14a', '#4cd964', '#3aa0ff', '#8a5cff'];
        // Regenbogen-Teppich und ein Regenbogen, der sich ueber den Gang spannt
        RB.forEach((c, i) => {
          const x0 = -2 + i * 4 / 6;
          gw.quad([x0, 0.07, D.Z1], [x0 + 4 / 6, 0.07, D.Z1], [x0 + 4 / 6, 0.07, D.Z0 + 3.2], [x0, 0.07, D.Z0 + 3.2], hex(c));
          const rr = 6 - i * 0.4;
          for (let k = 0; k < 18; k++) { const a = (k + 0.5) / 18 * Math.PI; box(gw, M4.from(Math.cos(a) * rr, Math.sin(a) * rr, -16, 0, 0, a), 0.38, rr * Math.PI / 18 + 0.05, 0.3, hex(c)); }
        });
        // Schwebende Wuerfel
        for (let i = 0; i < 9; i++) {
          const c = RB[i % 6], mesh = build((gg) => box(gg, I4, 1, 1, 1, hex(c))), x = (i % 2 ? 1 : -1) * lerp(4, 10, r()), z = lerp(D.Z0 + 4, D.Z1 - 4, r()), y = 3 + r() * 5, s = 0.5 + r() * 0.6, ph = r() * 6;
          K.anim(mesh, (t) => M4.from(x, y + Math.sin(t * 0.9 + ph) * 0.5, z, t * 0.7 + ph, t * 0.5, 0, s), { lit: 0 });
        }
        // Regenbogenstufen an der Westwand hinauf zu einem Sims mit Muenzen
        [[-7.5, 1, -6], [-9.5, 2.1, -9.5], [-7.5, 3.2, -13], [-9.5, 4.3, -16.5], [-7.5, 5.4, -20]].forEach(([x, top, z], i) => {
          K.plat(x, top, z, 2.4, 2.4, { top: hex(RB[i]), side: shade(hex(RB[i]), 0.7) });
        });
        L.block(D.X0 + 1.2, 6.2, -24.5, 2.4, 0.8, 6, { top: hex('#8a5cff'), side: hex('#5a3aa8') }, 'ledge');
        K.coinLine([D.X0 + 1.2, 7.4, -22], [D.X0 + 1.2, 7.4, -27], 4);
        for (const [x, z, h, c] of [[9, -8, 2.6, '#ff9aff'], [10.5, -22, 3.2, '#8ae8ff'], [-10.5, -3, 2, '#ffe14a']]) { K.crystal(x, 0, z, h, hex(c)); L.solid(x - 0.6, 0, z - 0.6, x + 0.6, h, z + 0.6, 'crystal'); }
        K.life.glows(D.X0, D.Z0, D.X1, D.Z1, 18, { y: 1, yr: 9, col: '#ff9aff', s: 0.7, speed: 0.5 });
        K.life.npc(5, -6, 'Mathematikerin Mandel', ['Hinter dem Bild wächst der MANDELBROT-REGENBOGEN.',
          'Je näher man hinsieht, desto mehr gibt es zu sehen. Und zu springen. Ein Teppich fliegt dort auch herum.'], { cat: 2, r: 3, tint: '#ffb8ff', mix: 0.35 });
      },
    },
    pilz: {
      name: 'Pilzzimmer', icon: '\u{1F344}', col: '#ff6a5a', fog: '#10261a', floorA: '#3a6a2a', floorB: '#2e5a22', dim: 0.88,
      wall: '#4a3a24', ceil: '#2a1e10', trim: '#6a4a2a', carpet: '#8a2a1a', torch: '#9aff8a', h: 13,
      deco(K, L, D) {
        const g = K.g, gw = K.glow, r = K.rnd, STEM = hex('#f4ecd8'), CAP = hex('#d6232a');
        // Riesenpilze: die roten federn wie Trampoline (links hinauf auf den hohen Pilz, rechts aufs Brett)
        const shroom = (x, z, top, R, bouncy, cap = CAP) => {
          cyl(g, M4.from(x, 0, z), R * 0.32, R * 0.26, top - R * 0.5, 10, STEM);
          sphere(g, M4.from(x, top - R * 0.6, z), R, R * 0.6, R, 14, 6, cap, true, 0, Math.PI / 2);
          for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + r(), q = R * (0.35 + (k % 2) * 0.3); sphere(g, M4.from(x + Math.cos(a) * q, top - R * 0.6 + R * 0.6 * Math.sqrt(Math.max(0, 1 - (q / R) ** 2)) - 0.05, z + Math.sin(a) * q), R * 0.15, R * 0.07, R * 0.15, 6, 3, C.white, true); }
          L.solid(x - R * 0.3, 0, z - R * 0.3, x + R * 0.3, top - 0.5, z + R * 0.3, 'stem');
          const b = L.solid(x - R * 0.72, top - 0.6, z - R * 0.72, x + R * 0.72, top, z + R * 0.72, bouncy ? 'bouncy' : 'shroomtop');
          if (bouncy) b.bounce = 66;
        };
        shroom(-7.5, -14, 2.3, 2.2, true); shroom(7.6, -17, 3, 2.4, true); shroom(-8, -21.5, 8, 2.6, false, hex('#e8701a'));
        // Hohes Brett an der Ostwand: vom rechten Trampolin aus erreichbar
        L.block(D.X1 - 1.3, 7.6, -16, 2.6, 0.4, 7, { top: hex('#8a5a2a'), side: hex('#6a4420') }, 'shelf');
        for (const z of [-13, -19]) box(g, M4.from(D.X1 - 1.3, 6.9, z, 0, 0, 0.6), 0.2, 1.2, 0.2, hex('#6a4420'));
        K.coinLine([D.X1 - 1.2, 8.8, -13.5], [D.X1 - 1.2, 8.8, -18.5], 3);
        K.item(MESH.chest, [D.X1 - 1.2, 7.8, -19], CHEST_TAKE('\u{1F344} Pilzschatz: +10 Münzen!'), 1.8);
        K.coinRing(-8, 9.4, -21.5, 1.4, 5);
        // Kleine Leuchtpilze, Ranken von der Decke
        for (let i = 0; i < 22; i++) {
          const x = (r() < 0.5 ? -1 : 1) * lerp(3, D.X1 - 0.8, r()), z = lerp(D.Z0 + 1, D.Z1 - 1, r()), s = 0.3 + r() * 0.4;
          cyl(g, M4.from(x, 0, z), s * 0.25, s * 0.2, s * 1.2, 5, STEM);
          sphere(gw, M4.from(x, s * 1.2, z), s, s * 0.55, s, 8, 4, r() < 0.5 ? hex('#6affd0') : hex('#b8ff6a'), true, 0, Math.PI / 2);
        }
        for (let i = 0; i < 26; i++) {
          const x = lerp(D.X0 + 0.5, D.X1 - 0.5, r()), z = lerp(D.Z0 + 0.5, D.Z1 - 0.5, r()), len = 1 + r() * 3;
          box(g, M4.from(x, D.H - len / 2, z, r() * 3, 0, (r() - 0.5) * 0.3), 0.08, len, 0.3, shade(hex('#3f9a3a'), 0.7 + r() * 0.5));
        }
        K.life.glows(D.X0, D.Z0, D.X1, D.Z1, 20, { y: 0.5, yr: 8, col: '#b8ff6a', s: 0.7, speed: 0.4 });
        K.life.critters('frog', -10, -26, 10, 0, 3, { speed: 0.8 });
        K.life.npc(4.5, -6, 'Pilzsammlerin Morchel', ['Hinter dem Bild liegt der PILZWALD.',
          'Die großen roten Pilze hier federn! Vom linken kommst du auf den hohen Pilz, vom rechten aufs Brett an der Wand.'], { cat: 1, r: 2.5, tint: '#ffb0a0', mix: 0.35 });
      },
    },
    neon: {
      name: 'Kellerdisko', icon: '\u{1FAA9}', col: '#ff3fb0', fog: '#10001e', floorA: '#1a0a2a', floorB: '#2a0a3a', dim: 0.62, noCarpet: true,
      wall: '#1a0a2a', ceil: '#0a0014', trim: '#ff3fb0', carpet: '#ff3fb0', torch: '#3ff0ff', h: 12,
      deco(K, L, D) {
        const g = K.g, gw = K.glow, r = K.rnd, NEON = ['#ff3fb0', '#3ff0ff', '#ffe14a', '#7aff5a', '#b86aff', '#ff8a3a'];
        // Neonroehren an beiden Seitenwaenden
        for (const s of [-1, 1]) for (const [y, c] of [[2.6, 0], [8.4, 1]]) box(gw, M4.from(s * (D.X1 - 0.12), y, (D.Z0 + D.Z1) / 2), 0.1, 0.16, D.Z1 - D.Z0 - 2, hex(NEON[(c + (s > 0 ? 1 : 0)) % 2]));
        for (const s of [-1, 1]) for (let k = 0; k < 8; k++) { const z = -4 - k * 3.2; box(gw, M4.from(s * (D.X1 - 0.12), 5.5, z, 0, (k % 2 ? 1 : -1) * 0.9), 0.1, 0.16, 3.6, hex(NEON[2 + (k % 3)])); }
        // Boxen und DJ-Pult
        for (const s of [-1, 1]) {
          L.block(s * 9, 1.6, D.Z0 + 2, 2.4, 3.2, 1.8, { top: hex('#1a1a22'), side: hex('#101016') }, 'speaker');
          for (const y of [0.9, 2.3]) { disc(g, M4.from(s * 9, y, D.Z0 + 2.92), 0.7, 14, hex('#3a3a44')); disc(gw, M4.from(s * 9, y, D.Z0 + 2.94), 0.22, 10, hex(NEON[s > 0 ? 0 : 1])); }
        }
        L.block(D.X1 - 1.8, 0.65, -14, 2.2, 1.3, 5, { top: hex('#2a2a32'), side: hex('#1a1a22') }, 'djdesk');
        for (const z of [-15.3, -12.7]) { cyl(g, M4.from(D.X1 - 1.8, 1.3, z), 0.8, 0.8, 0.06, 14, hex('#101014')); cyl(gw, M4.from(D.X1 - 1.8, 1.36, z), 0.12, 0.12, 0.03, 8, hex('#ff3fb0')); }
        for (let k = 0; k < 6; k++) box(gw, M4.from(D.X1 - 2.6, 1.32, -14.8 + k * 0.32), 0.14, 0.04, 0.14, hex(NEON[k]));
        // Leuchtschrift an der Westwand
        const sign = labelTexture((c, w, h) => {
          c.fillStyle = '#12001e'; c.fillRect(0, 0, w, h);
          c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'italic 900 88px Arial Black, sans-serif';
          c.shadowColor = '#ff3fb0'; c.shadowBlur = 24; c.fillStyle = '#ff9ae0'; c.fillText('GLAPPA', w / 2, h * 0.36);
          c.shadowColor = '#3ff0ff'; c.fillStyle = '#aefcff'; c.fillText('DISCO', w / 2, h * 0.74);
        }, 512, 256);
        L.decals.push({ mesh: MESH.plaque, model: M4.from(D.X0 + 0.14, 6.6, -16, Math.PI / 2, 0, 0, 2.2, 3.2, 1), tex: sign });
        // Spiegelkugel mit Lichtkegeln
        const ball = build((gg) => sphere(gg, I4, 1, 1, 1, 14, 10, (i, j) => ((i + j) % 2 ? hex('#e8ecf4') : hex('#9aa4b8')), false));
        const BY = D.H - 2.4, BZ = -16;
        cyl(g, M4.from(0, BY + 1, BZ), 0.04, 0.04, D.H - BY - 1, 4, hex('#aaaaaa'));
        K.anim(ball, (t) => M4.from(0, BY, BZ, t * 0.8, 0, 0, 1.1), { shine: 0.9, lit: 1 });
        const tiles = [];
        for (let i = 0; i < 8; i++) for (let j = 0; j < 9; j++) tiles.push([-7 + i * 2, -8 - j * 2, i, j]);
        L.drawSolid = () => {
          const beat = Math.floor(clock * 2.2);
          for (const [x, z, i, j] of tiles) {
            const c = hex(NEON[(i * 3 + j * 5 + beat) % 6]), on = ((i + j + beat) % 3) !== 0;
            draw(MESH.cube, M4.from(x, 0.04, z, 0, 0, 0, 1.9, 0.08, 1.9), { tint: on ? [c[0], c[1], c[2], 1] : [c[0] * 0.25, c[1] * 0.25, c[2] * 0.25, 1], lit: 0 });
          }
        };
        L.drawAlpha = () => {
          for (let k = 0; k < 6; k++) {
            const a = clock * 0.6 + k / 6 * TAU, rr = 5 + Math.sin(clock * 0.8 + k) * 2.5, spot = [Math.cos(a) * rr, 0.06, BZ + Math.sin(a) * rr], top = [0, BY, BZ];
            const ax = v3.sub(top, spot), len = v3.len(ax), yA = v3.norm(ax), xA = v3.norm(v3.cross(yA, [0, 0, 1])), zA = v3.cross(xA, yA), c = hex(NEON[k]);
            draw(MESH.beam, M4.mul(M4.basis(spot, xA, yA, zA), M4.from(0, 0, 0, 0, 0, 0, 1.1, len, 1.1)), { lit: 0, alpha: 0.13, tint: [c[0], c[1], c[2], 1] });
          }
        };
        K.coinRing(0, 1.1, -16, 5, 8);
        K.life.glows(D.X0, D.Z0, D.X1, D.Z1, 24, { y: 0.5, yr: 9, col: '#ff3fb0', s: 0.7, speed: 0.8 });
        K.life.butterflies(D.X0 + 2, D.Z0 + 2, D.X1 - 2, D.Z1 - 2, 8, { mesh: 'note', y: 2, yr: 6, cols: ['#ff3fb0', '#3ff0ff', '#ffe14a'], speed: 0.8 });
        K.life.npc(D.X1 - 3.8, -14, 'DJ Miez', ['Willkommen in der KELLERDISKO! Hinter dem Bild wartet der NEON-GARTEN.',
          'Dort musst du in einer Disco-Zeit vier Ecken antanzen. Übung macht die Meisterkatze!'], { cat: 2, r: 1.2, tint: '#ff9ae0', mix: 0.4 });
      },
    },
    desert: {
      name: 'Sandkammer', icon: '\u{1F3DC}\u{FE0F}', col: '#ffd080', fog: '#3a2a14', floorA: '#e8d09a', floorB: '#dcc08a',
      wall: '#c9a574', ceil: '#8a6a44', trim: '#b08a5a', carpet: '#a83a1a', torch: '#ffb13f', h: 12,
      deco(K, L, D) {
        const g = K.g, gw = K.glow, r = K.rnd, SAND = { top: hex('#dcbc8c'), side: hex('#c9a574') };
        // Fries mit eigenen Bildzeichen (Katze, Stern, Auge, Welle, Sonne, Pyramide)
        const frieze = repeatTexture((c, w, h) => {
          c.fillStyle = '#c9a574'; c.fillRect(0, 0, w, h);
          c.strokeStyle = '#6a4a2a'; c.fillStyle = '#6a4a2a'; c.lineWidth = 6;
          c.fillRect(0, 10, w, 8); c.fillRect(0, h - 18, w, 8);
          c.translate(0, (h - 180) / 2);
          const cx = [40, 125, 210, 295, 380, 465];
          c.beginPath(); c.arc(cx[0], 90, 26, 0, TAU); c.moveTo(cx[0] - 22, 72); c.lineTo(cx[0] - 12, 50); c.lineTo(cx[0] - 4, 66); c.moveTo(cx[0] + 22, 72); c.lineTo(cx[0] + 12, 50); c.lineTo(cx[0] + 4, 66); c.stroke();
          c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 12 : 30; c.lineTo(cx[1] + Math.cos(a) * rr, 90 + Math.sin(a) * rr); } c.closePath(); c.stroke();
          c.beginPath(); c.ellipse(cx[2], 90, 32, 16, 0, 0, TAU); c.stroke(); c.beginPath(); c.arc(cx[2], 90, 8, 0, TAU); c.fill();
          c.beginPath(); for (let k = 0; k < 3; k++) { c.moveTo(cx[3] - 30, 70 + k * 18); c.quadraticCurveTo(cx[3] - 15, 60 + k * 18, cx[3], 70 + k * 18); c.quadraticCurveTo(cx[3] + 15, 80 + k * 18, cx[3] + 30, 70 + k * 18); } c.stroke();
          c.beginPath(); c.arc(cx[4], 90, 16, 0, TAU); c.stroke(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; c.moveTo(cx[4] + Math.cos(a) * 22, 90 + Math.sin(a) * 22); c.lineTo(cx[4] + Math.cos(a) * 32, 90 + Math.sin(a) * 32); } c.stroke();
          c.beginPath(); c.moveTo(cx[5] - 32, 118); c.lineTo(cx[5], 60); c.lineTo(cx[5] + 32, 118); c.closePath(); c.stroke();
        }, 512, 256);
        for (const side of ['w', 'e']) K.wallTex(frieze, side, D.Z0 + 1, D.Z1 - 1, 5, 7, D.X0, D.Z0, D.X1, D.Z1, 5.6, 2);
        // Sandsteinsaeulen, Tonkruege, Palmen
        for (const s of [-1, 1]) for (const z of [-6, -14, -22]) {
          K.column(s * 9.5, z, 0, D.H, 0.7, hex('#dcbc8c'));
          box(g, M4.from(s * 9.5, 4, z), 1.5, 0.4, 1.5, hex('#3a8aa8'));
        }
        for (const [x, z] of [[-11.8, -3], [-12, -9.5], [11.8, -10], [12, -18.5], [-11.9, -18]]) {
          cyl(g, M4.from(x, 0, z), 0.45, 0.6, 0.6, 8, hex('#c8683a')); cyl(g, M4.from(x, 0.6, z), 0.6, 0.3, 0.7, 8, hex('#b8582a'));
          cyl(g, M4.from(x, 1.3, z), 0.3, 0.36, 0.2, 8, hex('#8a3a1a'));
          L.solid(x - 0.6, 0, z - 0.6, x + 0.6, 1.5, z + 0.6, 'jar');
        }
        cyl(g, M4.from(10.5, 0, -26), 0.9, 1.1, 1, 10, hex('#b8683a')); L.solid(9.5, 0, -27, 11.5, 1, -25, 'pot'); K.palm(10.5, -26, 1, 5.5);
        // Kleine Stufenpyramide: oben liegen Muenzen
        [[6, 1], [4, 2], [2, 3]].forEach(([s, top]) => L.block(-9.4, top - 0.5, -26, s, 1, s, SAND, 'pyramid'));
        K.coinRing(-9.4, 4.2, -26, 0.6, 4);
        // Sand rieselt durch Risse in der Decke
        for (const [x, z] of [[5, -9], [-4.5, -19], [6.5, -24]]) {
          K.fall(x, z, D.H, 0, 0.35, 'x', { speed: 4, col: [...hex('#e8c888'), 1] });
          sphere(g, M4.from(x, 0, z), 1.1, 0.45, 1.1, 10, 4, hex('#e0c088'), true, 0, Math.PI / 2);
        }
        K.coinLine([4, 1.1, -5], [4, 1.1, -13], 4);
        K.life.critters('beetle', -11, -24, 11, 0, 4, { speed: 0.9 });
        K.life.drifts(D.X0, D.Z0, D.X1, D.Z1, 12, { y0: 0, y1: D.H, col: '#e8c888', s: 0.5, speed: 0.3 });
        K.life.npc(-5, -8, 'Karawanen-Kater Kasim', ['Salam! Hinter dem Bild liegt die WÜSTENSTADT.',
          'Auf dem Wachturm und auf der Pyramide soll je ein Stern liegen. Und im Sand goldene Skarabäen.'], { cat: 3, r: 3, tint: '#ffd8a0', mix: 0.35 });
      },
    },
  };
  function buildPaintRoom(world) {
    const R = PAINT_ROOMS[world];
    const pd = world === 'desert' ? DESERT_PD : PAINTINGS.find((q) => q.level === world);
    const n = world === 'desert' ? 9 : PAINTINGS.indexOf(pd) + 1;
    const X1 = (R.w || 26) / 2, X0 = -X1, Z0 = -(R.d || 30), Z1 = 4, H = R.h || 11;
    const L = new Level({ name: R.name, spawn: [0, 0, Z1 - 3], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex(R.fog), fogNear: R.open ? 60 : 40, fogFar: R.open ? 220 : 150, light: v3.norm([0.3, -0.85, -0.4]), sky: R.sky || null, dim: R.dim ?? 0.9, trip: R.trip || 0 });
    const K = roomKit(L), g = K.g, D = { X0, X1, Z0, Z1, H };
    K.shell(X0, Z0, X1, Z1, H, { noFloor: !!R.floor, floorA: hex(R.floorA), floorB: hex(R.floorB), tile: R.tile || 2,
      wall: { top: hex(R.wall), side: hex(R.wall) }, ceil: hex(R.ceil), trim: hex(R.trim), openAbove: R.open });
    if (R.floor) R.floor(K, L, D);
    // Teppich von der Tuer zum Bild
    if (!R.noCarpet) {
      g.quad([-2.4, 0.03, Z1], [2.4, 0.03, Z1], [2.4, 0.03, Z0 + 3], [-2.4, 0.03, Z0 + 3], C.gold);
      g.quad([-2, 0.05, Z1], [2, 0.05, Z1], [2, 0.05, Z0 + 3.2], [-2, 0.05, Z0 + 3.2], hex(R.carpet));
    }
    // Das Gemaelde an der Stirnwand, darueber das Namensschild
    const S = 1.25, PY = 4.2;
    const pt = { ...pd, n, x: 0, y: PY, z: Z0 + 0.02, axis: 'x', scale: S, wallTag: 'paintwall', rip: null,
      model: M4.from(0, PY, Z0 + 0.27, 0, 0, 0, S), frame: M4.from(0, PY, Z0 + 0.22, 0, 0, 0, S) };
    ArtGen.request(pt, pd.bg, n, pd.name);
    L.paintings = [pt];
    L.solid(-3.4 * S, 0, Z0 - 0.3, 3.4 * S, PY + 3 * S, Z0 + 0.02, 'paintwall');
    L.decals.push({ mesh: MESH.plaque, model: M4.from(0, PY + 3.75 * S, Z0 + 0.12, 0, 0, 0, 1.6), tex: plaqueTex(pd.name, R.icon, R.col) });
    for (const s of [-1, 1]) {
      K.column(s * 5.6, Z0 + 1.6, 0, H, 0.55, hex(R.trim));
      K.torch(s * 5.6, 5.2, Z0 + 2.3, 0, hex(R.torch));
    }
    // Sterntafel: welche Sterne dieser Welt hat man schon?
    liveSign(K, L, -3.6, Z1 - 7, 'Sterntafel', () => worldStarLines(world));
    K.roomExit(0, Z1);
    R.deco(K, L, D);
    L.finish();
    return L;
  }

  // Gewoelberippe: halber Ellipsenbogen quer ueber einen Gang (nur Deko)
  function arcRib(g, cx, y0, z, rx, ry, col, n = 14, th = 0.7, axis = 'x') {
    for (let k = 0; k < n; k++) {
      const a = (k + 0.5) / n * Math.PI, tx = -rx * Math.sin(a), ty = ry * Math.cos(a), len = Math.hypot(tx, ty) * Math.PI / n + 0.06;
      const u = Math.cos(a) * rx, y = y0 + Math.sin(a) * ry, rz = Math.atan2(-tx, ty);
      if (axis === 'x') box(g, M4.from(cx + u, y, z, 0, 0, rz), th, len, th, col);
      else box(g, M4.from(cx, y, z + u, -Math.PI / 2, 0, rz), th, len, th, col);
    }
  }

  /* ─────────── Kellergewoelbe ───────────
     Unter der Halle: eine Treppe hinab in einen langen Gewoelbegang. In der Mitte fliesst eine
     Wasserrinne (Fische, Muenzen am Grund, drei Stege), am Nordende speit ein steinerner Katzenkopf
     das Wasser hinein. Vier Tueren: Verlies, Wuestenstadt, Aquarium und die Kellerdisko. */
  function buildKeller() {
    const L = new Level({ name: 'Kellergewölbe', spawn: [0, 3, 3.6], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#1a120a'), fogNear: 30, fogFar: 130, light: v3.norm([0.3, -0.9, -0.3]), sky: null, dim: 0.8 });
    const K = roomKit(L), g = K.g, gw = K.glow, r = K.rnd;
    const X0 = -12, X1 = 12, Z0 = -78, Z1 = 8, H = 12;
    const FA = hex('#5a5048'), FB = hex('#4a423a'), STONE = { top: hex('#6a5e54'), side: hex('#5a4e44') }, RIB = hex('#4a4038');
    K.shell(X0, Z0, X1, Z1, H, { noFloor: true, wall: { top: hex('#4a4038'), side: hex('#5e5248') }, ceil: hex('#2e2620'), trim: hex('#3e362f') });
    // Boden; in der Mitte die Wasserrinne
    const CZ0 = -70, CZ1 = -10, BED = -2.8;
    K.ground(X0, CZ1, X1, Z1, FA, FB, 0, 2); K.ground(X0, Z0, X1, CZ0, FA, FB, 0, 2);
    K.ground(X0, CZ0, -2, CZ1, FA, FB, 0, 2); K.ground(2, CZ0, X1, CZ1, FA, FB, 0, 2);
    L.solid(-2, BED - 6, CZ0, 2, BED, CZ1, 'ground');
    L.checker(-2, CZ0, 2, CZ1, BED, 2, hex('#3a4a44'), hex('#32403a'));
    const CW = hex('#4a4a42');
    wallQuad(g, -2, CZ1, -2, CZ0, BED, 0, CW); wallQuad(g, 2, CZ0, 2, CZ1, BED, 0, CW);
    wallQuad(g, -2, CZ0, 2, CZ0, BED, 0, CW); wallQuad(g, 2, CZ1, -2, CZ1, BED, 0, CW);
    for (const s of [-1, 1]) box(g, M4.from(s * 2.25, 0.06, (CZ0 + CZ1) / 2), 0.5, 0.12, CZ1 - CZ0, hex('#7a6e62'));
    L.waters.push({ x0: -2, x1: 2, z0: CZ0, z1: CZ1, y: -0.45, tint: [0.2, 0.5, 0.45, 0.65] });
    for (const z of [-24, -40, -54]) K.bridge(-2.6, z - 1.4, 2.6, z + 1.4, 0.3);
    // Treppe hinab vom Absatz an der Tuer
    L.block(0, 1.5, 5, 8, 3, 6, STONE, 'landing');
    K.stairs(0, -4, 0, 6, 0.5, 1, 8, 'z+', STONE);
    for (const s of [-1, 1]) L.block(s * 4.2, 3.5, 5, 0.4, 1, 6, { top: C.gold, side: hex('#8a6a3a') }, 'rail');
    K.roomExit(0, Z1, 3);
    // Tueren
    hubDoor(L, X0, 0, -24, 'e', 'verlies', 'Verlies', '\u{1F480}', '#ff8a3a');
    hubDoor(L, X0, 0, -54, 'e', 'bild_desert', 'Wüstenstadt', '\u{1F3DC}\u{FE0F}', '#ffd080');
    hubDoor(L, X1, 0, -24, 'w', 'aquarium', 'Aquarium', '\u{1F420}', '#6ac8ff');
    hubDoor(L, X1, 0, -54, 'w', 'bild_neon', 'Neon-Garten', '\u{1FAA9}', '#ff3fb0');
    // Gewoelbe: Rippenboegen, Wandpfeiler, Fackeln
    const nearDoor = (z) => Math.abs(z + 24) < 4.5 || Math.abs(z + 54) < 4.5;
    for (let z = -6; z > Z0; z -= 8) {
      arcRib(g, 0, 6.5, z, X1 - 0.3, H - 6.8, RIB);
      if (nearDoor(z)) continue;
      for (const x of [X0 + 0.5, X1 - 0.5]) L.block(x, 3.25, z, 1, 6.5, 1.2, { top: RIB, side: RIB }, 'pillar');
    }
    for (let z = -10; z > Z0; z -= 8) if (!nearDoor(z)) { K.torch(X0 + 0.25, 4.2, z, Math.PI / 2); K.torch(X1 - 0.25, 4.2, z, -Math.PI / 2); }
    // Wasserspeier: steinerner Katzenkopf am Nordende der Rinne
    L.block(0, 2.2, -72, 4.6, 4.4, 4, STONE, 'spout');
    for (const s of [-1, 1]) {
      cyl(g, M4.from(s * 1.3, 4.4, -71.2), 0.8, 0, 1.3, 4, STONE.side);
      box(gw, M4.from(s * 0.85, 3.1, -69.97), 0.55, 0.32, 0.05, hex('#ffd24a'));
      for (let k = 0; k < 3; k++) box(g, M4.from(s * (1.3 + k * 0.1), 1.95 - k * 0.18, -69.96, 0, 0, s * (0.2 - k * 0.2)), 0.9, 0.06, 0.04, hex('#2a2420'));
    }
    box(g, M4.from(0, 2.4, -69.97), 0.5, 0.36, 0.05, hex('#3a2a2a'));
    box(g, M4.from(0, 1.55, -69.96), 1.3, 0.5, 0.05, hex('#1a1210'));
    K.fall(0, -69.8, 1.5, -0.45, 1.1, 'x', { speed: 7 });
    // Weinkeller im Norden: liegende Faesser in Regalen, Kisten, eine Schatztruhe
    for (const s of [-1, 1]) {
      L.block(s * 7.5, 1.9, Z0 + 1, 7, 3.8, 1.8, { top: hex('#5a3a1a'), side: hex('#4a2a14') }, 'rack');
      for (let row = 0; row < 2; row++) for (let k = 0; k < 4; k++) {
        const m = M4.from(s * 7.5 - 2.6 + k * 1.75, 0.95 + row * 1.8, Z0 + 1.95, 0, Math.PI / 2);
        cyl(g, m, 0.8, 0.8, 0.3, 10, hex('#6a4428'), hex('#8a5a30'));
        cyl(g, M4.mul(m, M4.from(0, 0.3, 0)), 0.3, 0.3, 0.04, 8, hex('#3a2a18'));
      }
    }
    for (const [x, z, s] of [[-9.5, -73, 1.4], [-8.2, -74.4, 1], [9.2, -72.5, 1.3], [-9, 3, 1.4], [9.6, 1.5, 1.2], [8.4, 4.2, 1]]) L.block(x, s / 2, z, s, s, s, { top: hex('#b8864a'), side: hex('#9a6a34') }, 'crate');
    K.item(MESH.chest, [6, 0, -75], CHEST_TAKE('\u{1F56F}\u{FE0F} Kellerschatz: +10 Münzen!'), 1.8);
    // Muenzen: auf den Stegen, am Grund der Rinne, im Weinkeller
    for (const z of [-24, -40, -54]) L.coin('yellow', 0, 1.5, z);
    K.coinLine([0, -2, -16], [0, -2, -64], 6);
    K.coinLine([-5, 1.1, -74], [5, 1.1, -74], 4);
    K.talker(-5.5, 0, -7, 'Schild', [
      '★ KELLERGEWÖLBE ★\nHier unten liegen vier Türen.',
      'Links: das VERLIES und das Bild zur WÜSTENSTADT. Rechts: das AQUARIUM und die KELLERDISKO mit dem Bild zum NEON-GARTEN.',
      'In der Wasserrinne schwimmen Fische – und am Grund liegen Münzen. Über die Stege kommt man trocken hinüber.',
    ]);
    L.enemies.push(makeBat(-6, 6, -34, '#5a3a2a'), makeBat(6, 7, -62, '#5a3a2a'), makeGrummel(-8, -66));
    // ── Leben ──
    K.life.fish(-1.8, CZ0 + 1, 1.8, CZ1 - 1, -0.45, 7, { jump: false });
    K.life.critters('mouse', X0 + 1, -76, X1 - 1, -6, 5, { speed: 1.2 });
    K.life.glows(X0, Z0, X1, Z1, 14, { y: 1, yr: 6, col: '#ffb13f', s: 0.6, speed: 0.3 });
    K.life.drifts(X0, Z0, X1, Z1, 10, { y0: 0, y1: 10, col: '#8a7a6a', s: 0.6, speed: 0.4 });
    K.life.npc(6, -8, 'Kellermeister Moos', ['Willkommen im Keller! Hier unten ist es kühl – und nass.',
      'Das Wasser in der Rinne kommt aus dem Brunnen im Schlosshof. Sagt man jedenfalls.',
      'Ganz hinten im Weinkeller steht eine Truhe. Die hat noch keiner aufgemacht. Glaub ich.'], { cat: 3, r: 3, tint: '#b8a898', mix: 0.35 });
    L.finish();
    return L;
  }

  /* ─────────── Obergeschoss ───────────
     Hinter der Sterntuer: eine lange Galerie mit Ruestungen, Fenstern und zwei Bilderzimmern
     (Such-Uhrwerk, Mandelbrot-Regenbogen). Durch den Bogen am Ende geht es in den hohen Turm:
     eine Treppe windet sich an drei Waenden hinauf bis zur Finale-Tuer — und zum Turm-Stern. */
  function buildOG() {
    const L = new Level({ name: 'Obergeschoss', spawn: [0, 0, 4.5], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#2a1a10'), fogNear: 70, fogFar: 200, light: v3.norm([-0.3, -0.85, -0.4]), sky: null, dim: 0.95, voidY: -20 });
    const K = roomKit(L), g = K.g, gw = K.glow, r = K.rnd;
    const X1 = 11, Z0 = -50, Z1 = 8, H = 12;
    const TX = 16, TZ0 = -84, TZ1 = -52, TH = 34;
    const WALL = { top: hex('#e8d8b0'), side: hex('#efdcae') }, TRIM = hex('#8a5a2a'), MET = hex('#b8c0cc'), DK = hex('#6a7280');
    K.shell(-X1, Z0, X1, Z1, H, { floorA: C.floorA, floorB: C.floorB, tile: 3, wall: WALL, ceil: hex('#7a4f22'), trim: TRIM, gaps: [{ side: 'n', a: -4, b: 4, h: 8 }] });
    K.shell(-TX, TZ0, TX, TZ1, TH, { floorA: hex('#b8b0a0'), floorB: hex('#a8a090'), tile: 4, wall: { top: hex('#c8bca8'), side: hex('#d8ccb4') },
      ceil: hex('#3a2a4a'), trim: hex('#8a7a6a'), gaps: [{ side: 's', a: -4, b: 4, h: 8 }] });
    K.ground(-4, TZ1, 4, Z0, C.floorA, C.floorB, 0, 2);   // Schwelle im Bogen
    // Teppich durch die ganze Galerie bis in den Turm
    g.quad([-2.6, 0.03, Z1], [2.6, 0.03, Z1], [2.6, 0.03, -60], [-2.6, 0.03, -60], C.gold);
    g.quad([-2.2, 0.05, Z1], [2.2, 0.05, Z1], [2.2, 0.05, -59.8], [-2.2, 0.05, -59.8], C.carpet);
    for (let z = Z1 - 2; z > -58; z -= 4) starGeo(g, M4.from(0, 0.06, z, 0, -Math.PI / 2), 0.5, 0.005, C.gold);
    K.roomExit(0, Z1);
    // Tueren zu den Bilderzimmern
    hubDoor(L, -X1, 0, -16, 'e', 'bild_uhrwerk', 'Such-Uhrwerk', '\u{23F0}', '#ffd27a');
    hubDoor(L, X1, 0, -16, 'w', 'bild_fraktal', 'Mandelbrot-Regenbogen', '\u{1F308}', '#ff9aff');
    // Ritterruestungen mit Hellebarde
    const armor = (x, z, face) => {
      const M = M4.from(x, 0, z, face), T = (m) => M4.mul(M, m);
      box(g, T(M4.from(0, 0.3, 0)), 1.4, 0.6, 1.2, C.stone);
      for (const s of [-1, 1]) { box(g, T(M4.from(s * 0.22, 1.25, 0)), 0.3, 1.3, 0.34, MET); box(g, T(M4.from(s * 0.22, 0.68, 0.08)), 0.34, 0.16, 0.5, DK); }
      box(g, T(M4.from(0, 2.4, 0)), 0.9, 1.1, 0.55, MET);
      box(g, T(M4.from(0, 2.5, 0.29)), 0.46, 0.6, 0.04, hex('#a8161b'));
      starGeo(g, T(M4.from(0, 2.52, 0.33)), 0.18, 0.02, C.gold);
      for (const s of [-1, 1]) { sphere(g, T(M4.from(s * 0.55, 2.85, 0)), 0.26, 0.2, 0.3, 8, 5, MET, true); box(g, T(M4.from(s * 0.6, 2.2, 0.05)), 0.24, 1, 0.26, MET); }
      sphere(g, T(M4.from(0, 3.3, 0)), 0.34, 0.4, 0.36, 10, 6, MET, true);
      box(g, T(M4.from(0, 3.3, 0.3)), 0.42, 0.08, 0.1, DK);
      cyl(g, T(M4.from(0, 3.62, -0.05)), 0.07, 0.03, 0.55, 5, hex('#c8161b'));
      cyl(g, T(M4.from(0.78, 0.6, 0.25)), 0.05, 0.05, 3.9, 5, hex('#6b4214'));
      box(g, T(M4.from(0.78, 4.3, 0.25)), 0.06, 0.7, 0.5, MET); box(g, T(M4.from(0.78, 4.75, 0.25)), 0.06, 0.3, 0.12, MET);
      L.solid(x - 0.75, 0, z - 0.75, x + 0.75, 3.8, z + 0.75, 'armor');
    };
    for (const z of [-3, -29, -41]) { armor(-X1 + 1.3, z, Math.PI / 2); armor(X1 - 1.3, z, -Math.PI / 2); }
    // Fenster, Fahnen, Kronleuchter
    for (const s of [-1, 1]) {
      const x = s * (X1 - 0.04), ry = s < 0 ? Math.PI / 2 : -Math.PI / 2;
      for (const z of [3, -8, -24, -35, -46]) archWindow(g, gw, x, 6.8, z, ry, 2, 2.8, '#cfe6ff');
      for (const z of [-2.5, -29.5, -40.5]) {
        const m = M4.from(x - s * 0.08, 8.5, z, ry);
        box(g, m, 1.8, 3.6, 0.04, hex('#2a4ad8'));
        g.tri(P(m, -0.9, -1.8, 0.03), P(m, 0.9, -1.8, 0.03), P(m, 0, -2.5, 0.03), hex('#2a4ad8'));
        starGeo(g, M4.mul(m, M4.from(0, 0.3, 0.05)), 0.5, 0.02, C.gold);
      }
    }
    for (const z of [0, -22, -42]) chandelierAt(g, gw, 0, 9.5, z, H);
    for (const z of [6, -20, -44]) box(g, M4.from(0, H - 0.4, z), X1 * 2, 0.8, 0.7, hex('#5a3a18'));
    // ── Der Turm ──
    const STEP = { top: hex('#c8b8a0'), side: hex('#9a8a74') }, LAND = { top: hex('#a88a6a'), side: hex('#8a7a64') };
    K.stairs(TX - 1.75, TZ1 - 3, 0, 20, 0.4, 1.2, 3.5, 'z-', STEP);                  // Ostwand: 0 -> 8
    L.block(TX - 1.75, 4, -81.5, 3.5, 8, 5, LAND, 'landing');
    K.stairs(TX - 3.5, TZ0 + 1.75, 8, 20, 0.4, 1.2, 3.5, 'x-', STEP);                // Nordwand: 8 -> 16
    L.block(-TX + 2.25, 12, -81.5, 4.5, 8, 5, LAND, 'landing');
    for (let i = 0; i < 20; i++) {                                                   // Westwand: 16 -> 24, mit Luecke
      if (i >= 8 && i <= 10) continue;
      const top = 16 + 0.4 * (i + 1), zc = -79 + (i + 0.5) * 1.2;
      L.block(-TX + 1.75, (16 + top) / 2, zc, 3.5, top - 16, 1.2, STEP, 'stair');
    }
    L.block(0, 23.6, TZ1 - 1.75, TX * 2, 0.8, 3.5, LAND, 'balcony');                 // Balkon ueber dem Bogen
    for (let x = -12.2; x < TX; x += 1.4) cyl(g, M4.from(x, 24, TZ1 - 3.4), 0.1, 0.1, 1, 5, C.gold);
    L.block(1.75, 25.05, TZ1 - 3.4, 28.5, 0.1, 0.2, { top: C.gold, side: C.gold }, 'rail');
    L.solid(-12.5, 24, TZ1 - 3.55, TX, 25.1, TZ1 - 3.25, 'rail');
    // Finale-Tuer oben
    castleDoor(L, 0, 24, TZ1, Math.PI, { w: 4.4, h: 5, plaque: plaqueTex('Finale', '\u{1F451}', '#ffd21f'), torches: true, wood: hex('#8a1a1a') });
    const fin = { end: true, label: 'Durch die Finale-Tür', pos: [0, 24, TZ1 - 1.4] };
    L.doors.push(fin);
    L.solid(-2.2, 24, TZ1 - 0.5, 2.2, 29, TZ1, 'door').door = fin;
    L.endSpot = { pos: [0, 24, TZ1 - 2.2], face: Math.PI };
    K.star('turm', [12.5, 25.6, TZ1 - 1.75]);
    // Turm-Deko: Stern im Boden, riesiger Sternleuchter, Fenster, Fackeln an der Treppe
    starGeo(g, M4.from(0, 0.04, -68, 0, -Math.PI / 2), 7, 0.01, C.gold);
    starGeo(g, M4.from(0, 0.05, -68, 0, -Math.PI / 2), 5.4, 0.01, hex('#a8161b'));
    cyl(g, M4.from(0, 20.5, -68), 0.07, 0.07, TH - 20.5, 4, hex('#2a2a2a'));
    const bigStar = build((gg) => { starGeo(gg, I4, 2.4, 0.5, hex('#ffd24a')); });
    K.anim(bigStar, (t) => M4.from(0, 18, -68, t * 0.35), { lit: 0 });
    // Fenster nur dort, wo keine Treppe davor liegt (Ost: Treppe 0-8 m, West: 16-24 m)
    for (const z of [-62, -74]) for (const y of [13, 21.5, 29.5]) archWindow(g, gw, TX - 0.04, y, z, -Math.PI / 2, 2, 3, '#d8c8ff');
    for (const z of [-64, -72]) for (const y of [7.5, 29.5]) archWindow(g, gw, -TX + 0.04, y, z, Math.PI / 2, 2, 3, '#d8c8ff');
    // Steinbaender rund um den Turm, Fahnen ueber der Nordtreppe
    const BAND = hex('#a89880');
    for (const y of [8, 16, 24, 32]) {
      box(g, M4.from(0, y, TZ0 + 0.1), TX * 2, 0.35, 0.2, BAND);
      for (const s of [-1, 1]) box(g, M4.from(s * (TX - 0.1), y, (TZ0 + TZ1) / 2), 0.2, 0.35, TZ1 - TZ0, BAND);
    }
    box(g, M4.from(0, 16, TZ1 - 0.1), TX * 2, 0.35, 0.2, BAND);
    for (const x of [-8, 0, 8]) {
      const m = M4.from(x, 25, TZ0 + 0.08);
      box(g, m, 2.2, 6, 0.04, hex('#2a4ad8'));
      g.tri(P(m, -1.1, -3, 0.03), P(m, 1.1, -3, 0.03), P(m, 0, -3.9, 0.03), hex('#2a4ad8'));
      starGeo(g, M4.mul(m, M4.from(0, 1, 0.05)), 0.7, 0.02, C.gold);
    }
    for (const [x, y, z, ry] of [[TX - 0.25, 5, -64, -Math.PI / 2], [TX - 0.25, 9, -76, -Math.PI / 2], [6, 13, TZ0 + 0.25, 0], [-6, 16, TZ0 + 0.25, 0],
      [-TX + 0.25, 20, -74, Math.PI / 2], [-TX + 0.25, 24, -62, Math.PI / 2]]) K.torch(x, y, z, ry);
    // Muenzen entlang der Treppe
    K.coinLine([TX - 1.75, 2.2, -58], [TX - 1.75, 8.2, -76], 5);
    K.coinLine([10, 10.2, TZ0 + 1.75], [-8, 16.2, TZ0 + 1.75], 5);
    K.coinLine([-TX + 1.75, 18.2, -76], [-TX + 1.75, 23.8, -58], 5);
    K.coinRing(0, 1.1, -68, 3, 8);
    L.enemies.push(makeBat(0, 10, -68, '#3a2a5a'), makeBat(-8, 18, -72, '#3a2a5a'), makeBat(8, 21, -60, '#3a2a5a'));
    K.talker(4.2, 0, 0, 'Schild', [
      '★ OBERGESCHOSS ★\nNur wer 4 Sterne hat, kommt hier herauf.',
      'Links wartet das Bild zum SUCH-UHRWERK, rechts das zum MANDELBROT-REGENBOGEN.',
      'Am Ende der Galerie steht der TURM. Die Treppe führt ganz nach oben zur FINALE-TÜR – und zu einem Stern.',
    ]);
    // ── Leben ──
    K.life.glows(-X1, Z0, X1, Z1, 10, { y: 1, yr: 8, col: '#ffdba0', s: 0.6, speed: 0.3 });
    K.life.glows(-TX, TZ0, TX, TZ1, 16, { y: 2, yr: 26, col: '#ffe98a', s: 0.8, speed: 0.4 });
    K.life.critters('mouse', -9, -48, 9, 4, 3, { speed: 1 });
    K.life.npc(-4, -32, 'Hofdame Glimmer', ['Das Obergeschoss! Hierher kommen nur Sterne-Sammler.',
      'Die Treppe im Turm hat eine Lücke. Wer sich traut, springt einfach drüber!'], { cat: 1, r: 4, tint: '#ffd0f0', mix: 0.3 });
    K.life.npc(-6, -64, 'Turmwächterin Hella', ['Ganz oben im Turm ist die Finale-Tür.',
      'Und auf dem Balkon glänzt ein Stern. Den hat noch niemand geholt.'], { cat: 3, r: 3, tint: '#c8d8ff', mix: 0.3 });
    L.finish();
    return L;
  }

  /* ─────────── Schlosshof ───────────
     Innenhof unter Abendhimmel (Idee aus dem grossen Vorbild, eigener Aufbau): in der Mitte ein
     achteckiger Brunnen, auf dessen Sockel eine Steinfigur einen Stern hochreckt. Um den Brunnen
     spuken sechs schuechterne Geister — sind alle besiegt, erscheint an der Statue ein Stern.
     Ost und West: Kreuzgaenge (Dach begehbar). Im Norden die Geisterkapelle mit dem Spuk-Bild. */
  function buildHof() {
    const L = new Level({ name: 'Schlosshof', spawn: [0, 0, 5.5], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#c88a90'), fogNear: 90, fogFar: 300, light: v3.norm([-0.35, -0.6, 0.7]), sky: 'sunset' });
    const K = roomKit(L), g = K.g, gw = K.glow, r = K.rnd;
    const X0 = -34, X1 = 34, Z0 = -66, Z1 = 10, WH = 16;
    const FX = 0, FZ = -26, R = 8, RIM = 0.9, SQ = R + RIM, RY = 0.7, WY = -0.3, BED = -3.2;
    const GA = hex('#4aa83a'), GB = hex('#3f9a32'), PAVE = hex('#c8bca4'), STONE = { top: hex('#e0d8c4'), side: hex('#b8ae98') };
    // Rasen mit Loch fuer das Brunnenbecken
    K.ground(X0, Z0, X1, FZ - R, GA, GB); K.ground(X0, FZ + R, X1, Z1, GA, GB);
    K.ground(X0, FZ - R, FX - R, FZ + R, GA, GB); K.ground(FX + R, FZ - R, X1, FZ + R, GA, GB);
    // Mauern rundum mit Zinnen, erleuchteten Fenstern und Ecktuermen
    const WALLC = { top: hex('#d8c8a4'), side: hex('#efdcae') };
    L.block(X0 - 1, WH / 2, (Z0 + Z1) / 2, 2, WH, Z1 - Z0 + 4, WALLC, 'bigwall'); L.block(X1 + 1, WH / 2, (Z0 + Z1) / 2, 2, WH, Z1 - Z0 + 4, WALLC, 'bigwall');
    L.block(0, WH / 2, Z0 - 1, X1 - X0 + 4, WH, 2, WALLC, 'bigwall'); L.block(0, WH / 2, Z1 + 1, X1 - X0 + 4, WH, 2, WALLC, 'bigwall');
    for (let x = X0; x <= X1; x += 3) for (const z of [Z0 - 1, Z1 + 1]) box(g, M4.from(x, WH + 0.6, z), 1.6, 1.2, 2.2, WALLC);
    for (let z = Z0; z <= Z1; z += 3) for (const x of [X0 - 1, X1 + 1]) box(g, M4.from(x, WH + 0.6, z), 2.2, 1.2, 1.6, WALLC);
    for (const [x, z] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) {
      cyl(g, M4.from(x, 0, z), 4, 4, WH + 6, 14, hex('#e8d8b4'));
      cyl(g, M4.from(x, WH + 6, z), 4.8, 0, 6, 14, C.roof);
      L.solid(x - 3.5, 0, z - 3.5, x + 3.5, WH + 6, z + 3.5, 'tower');
    }
    for (const y of [9.5, 13]) {
      for (let x = X0 + 6; x < X1 - 4; x += 6) { if (Math.abs(x) < 10 && y < 12) continue; archWindow(g, gw, x, y, Z1 - 0.04, Math.PI, 1.4, 2, '#ffd88a'); archWindow(g, gw, x, y, Z0 + 0.04, 0, 1.4, 2, '#ffd88a'); }
      for (let z = Z0 + 6; z < Z1 - 4; z += 6) { archWindow(g, gw, X0 + 0.04, y, z, Math.PI / 2, 1.4, 2, '#ffd88a'); archWindow(g, gw, X1 - 0.04, y, z, -Math.PI / 2, 1.4, 2, '#ffd88a'); }
    }
    K.roomExit(0, Z1);
    // ── Der Brunnen: achteckiges Becken in quadratischer Steinfassung ──
    L.solid(FX - R, BED - 6, FZ - R, FX + R, BED, FZ + R, 'ground');
    for (const [x0, z0, x1, z1] of [[-SQ, R, SQ, SQ], [-SQ, -SQ, SQ, -R], [-SQ, -R, -R, R], [R, -R, SQ, R]]) L.solid(FX + x0, BED, FZ + z0, FX + x1, RY, FZ + z1, 'rim');
    const aOct = R * Math.tan(Math.PI / 8), DIAG = R * Math.SQRT2, NST = 6, dS = (R - aOct) / NST;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < NST; k++) {
      const u0 = aOct + k * dS, u1 = u0 + dS, xa = DIAG - (u0 + u1) / 2;
      L.solid(FX + Math.min(sx * xa, sx * R), BED, FZ + Math.min(sz * u0, sz * u1), FX + Math.max(sx * xa, sx * R), RY, FZ + Math.max(sz * u0, sz * u1), 'rim');
    }
    const Rv = R / Math.cos(Math.PI / 8), oct = [];
    for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; oct.push([Rv * Math.cos(a), Rv * Math.sin(a)]); }
    const W3 = (p, y) => [FX + p[0], y, FZ + p[1]];
    const triUp = (a, b, c, col) => { const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]); if (ny >= 0) g.tri(a, b, c, col); else g.tri(a, c, b, col); };
    const onX = (p) => Math.abs(Math.abs(p[0]) - R) < 0.01;
    const outP = (p) => (onX(p) ? [Math.sign(p[0]) * SQ, p[1]] : [p[0], Math.sign(p[1]) * SQ]);
    for (let k = 0; k < 8; k++) {
      const A = oct[k], B = oct[(k + 1) % 8], mid = Math.PI / 4 + k * Math.PI / 4, cx = Math.round(Math.cos(mid)), cz = Math.round(Math.sin(mid));
      const Ao = outP(A), Bo = outP(B), top = STONE.top;
      if (cx && cz) {
        const Co = [cx * SQ, cz * SQ];
        triUp(W3(A, RY), W3(B, RY), W3(Bo, RY), top); triUp(W3(A, RY), W3(Bo, RY), W3(Co, RY), top); triUp(W3(A, RY), W3(Co, RY), W3(Ao, RY), top);
      } else { triUp(W3(A, RY), W3(B, RY), W3(Bo, RY), top); triUp(W3(A, RY), W3(Bo, RY), W3(Ao, RY), top); }
      wallQuad(g, FX + A[0], FZ + A[1], FX + B[0], FZ + B[1], BED, RY, hex('#8ab8c8'));      // Beckenwand innen
    }
    for (const [x0, z0, x1, z1] of [[SQ, SQ, SQ, -SQ], [SQ, -SQ, -SQ, -SQ], [-SQ, -SQ, -SQ, SQ], [-SQ, SQ, SQ, SQ]]) wallQuad(g, FX + x0, FZ + z0, FX + x1, FZ + z1, 0, RY, STONE.side);
    disc(g, M4.from(FX, BED + 0.01, FZ, 0, -Math.PI / 2), Rv, 8, [hex('#3a7ab8'), hex('#2e6aa8')], Math.PI / 8, Math.PI / 8 + TAU);
    L.waters.push({ x0: FX - R, x1: FX + R, z0: FZ - R, z1: FZ + R, y: WY, tint: [0.25, 0.6, 0.95, 0.55], mesh: MESH.waterOct });
    // Sockel mit Statue: die Steinfigur reckt einen Stern in die Hoehe
    const PT = 1.4, ST_Y = 2.2;
    L.block(FX, (BED + PT) / 2, FZ, 5, PT - BED, 5, STONE, 'pedestal');
    box(g, M4.from(FX, PT - 0.1, FZ), 5.4, 0.2, 5.4, STONE.top);
    L.block(FX, (PT + ST_Y) / 2, FZ, 2.6, ST_Y - PT, 2.6, STONE, 'pedestal');
    L.solid(FX - 0.85, ST_Y, FZ - 0.75, FX + 0.85, ST_Y + 3.8, FZ + 0.75, 'statue');
    const plaque = labelTexture((c, w, h) => {
      c.fillStyle = '#b8ae98'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#8a8270'; c.lineWidth = 10; c.strokeRect(10, 10, w - 20, h - 20);
      c.fillStyle = '#5a5244'; c.font = '700 64px "Comic Sans MS", "Comic Neue", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('★ GLAPPO ★', w / 2, h / 2 + 4);
    }, 512, 176);
    L.decals.push({ mesh: MESH.plaque, model: M4.from(FX, 0.55, FZ + 2.53, 0, 0, 0, 0.9), tex: plaque });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(g, M4.from(FX + sx * 2.35, 0.9, FZ + sz * 2.35, Math.atan2(sx, sz), Math.PI / 2 - 0.3), 0.14, 0.14, 0.6, 6, hex('#8a8270'));
    const stoneStar = build((gg) => starGeo(gg, I4, 0.8, 0.22, hex('#d8d0c0')));
    const STAT = { tint: [0.76, 0.74, 0.7, 0.9], lit: 1 };
    L.drawSolid = () => {
      const base = M4.from(FX, ST_Y, FZ, 0, 0, 0, 1.9);
      drawCatStatue(base, STAT);
      const RG = CAT.rig, hand = M4.point(M4.mul(base, M4.from(RG.armX, RG.armY, 0, 0, -2.9, 0.4)), [0, -0.62, 0]);
      draw(stoneStar, M4.from(hand[0], hand[1] + 0.75, hand[2]), STAT);
    };
    // Wasserspiele: vier Speier am Sockel, dazu Gischt
    L.update = (dt) => {
      if (parts.length > 150) return;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (Math.random() > dt * 22) continue;
        const sp = 1.9 + Math.random() * 0.5;
        parts.push({ p: [FX + sx * 2.6, 1.05, FZ + sz * 2.6], v: [sx * sp * 0.7, 2.6 + Math.random() * 0.8, sz * sp * 0.7], life: 0.8, max: 0.8, s: 0.09,
          col: Math.random() < 0.5 ? [0.75, 0.9, 1] : [1, 1, 1], g: 9.8, rot: Math.random() * 6 });
      }
    };
    // ── Wege, Rasen, Baeume, Baenke, Laternen ──
    const pave = (x0, z0, x1, z1) => g.quad([x0, 0.02, z1], [x1, 0.02, z1], [x1, 0.02, z0], [x0, 0.02, z0], PAVE);
    pave(-2.5, FZ + SQ, 2.5, Z1); pave(-2.5, Z0 + 7, 2.5, FZ - SQ);
    pave(X0 + 8, FZ - 2.5, FX - SQ, FZ + 2.5); pave(FX + SQ, FZ - 2.5, X1 - 8, FZ + 2.5);
    pave(FX - SQ - 2.4, FZ - SQ - 2.4, FX + SQ + 2.4, FZ - SQ); pave(FX - SQ - 2.4, FZ + SQ, FX + SQ + 2.4, FZ + SQ + 2.4);
    pave(FX - SQ - 2.4, FZ - SQ, FX - SQ, FZ + SQ); pave(FX + SQ, FZ - SQ, FX + SQ + 2.4, FZ + SQ);
    for (const [x, z] of [[-17, -8], [17, -8], [-17, -45], [17, -45]]) K.tree(x, z, 0, 4.5);
    for (const [x, z] of [[-12, 4], [12, 4], [-20, -16], [20, -16], [-20, -37], [20, -37]]) K.bush(x, z, 0, 1);
    K.flowers(X0 + 9, FZ - 20, X1 - 9, Z1 - 2, 140, 0, ['#ff5fa2', '#ffe14a', '#ffffff', '#8a7bff'], [[-3, -70, 3, 12], [-14, FZ - 14, 14, FZ + 14], [-26, FZ - 3, 26, FZ + 3]]);
    for (const [x, z, ry] of [[-6, FZ + SQ + 5, 0], [6, FZ + SQ + 5, 0], [-6, FZ - SQ - 5, 0], [6, FZ - SQ - 5, 0]]) {
      L.block(x, 0.45, z, 3.2, 0.9, 1, { top: hex('#8a5a2a'), side: hex('#6a4420') }, 'bench');
      box(g, M4.from(x, 1.2, z + (z > FZ ? 0.45 : -0.45), ry), 3.2, 0.7, 0.12, hex('#6a4420'));
    }
    for (const [x, z] of [[-4, FZ + SQ + 3], [4, FZ + SQ + 3], [-4, FZ - SQ - 3], [4, FZ - SQ - 3], [-4, 2], [4, 2]]) K.lamp(x, z, 0, hex('#ffe9a8'));
    // Kreuzgaenge im Osten und Westen: Saeulen, Boegen, begehbares Dach
    for (const s of [-1, 1]) {
      const xc = s * 30, xi = s * 26.4;
      L.block(xc, 6.6, -26, 8, 0.8, 64, { top: hex('#a8866a'), side: hex('#c8b89a') }, 'arcade');
      g.quad([s * 26, 0.02, 6], [s * 34, 0.02, 6], [s * 34, 0.02, -58], [s * 26, 0.02, -58], PAVE);
      for (let z = 5; z >= -57; z -= 6.2) {
        K.column(xi, z, 0, 6.2, 0.42, hex('#e8dcc0'));
        if (z - 6.2 >= -57.1) arcRib(g, xi, 3.9, z - 3.1, 2.6, 2.3, hex('#e8dcc0'), 9, 0.5, 'z');
      }
      K.coinLine([xc, 7.9, -6], [xc, 7.9, -46], 5);
    }
    // ── Geisterkapelle im Norden (Tuer zum Bild von Spuk-Home) ──
    const CH = { top: hex('#6a5a7a'), side: hex('#8a7a98') }, CZ = Z0 + 3.5;
    L.block(0, 7, CZ, 18, 14, 7, CH, 'chapel');
    const RF = hex('#3a2a4a');
    g.quad([-9.6, 14, CZ + 3.8], [0, 20.5, CZ + 3.8], [0, 20.5, CZ - 3.8], [-9.6, 14, CZ - 3.8], RF);
    g.quad([0, 20.5, CZ + 3.8], [9.6, 14, CZ + 3.8], [9.6, 14, CZ - 3.8], [0, 20.5, CZ - 3.8], RF);
    g.tri([-9, 14, CZ + 3.5], [9, 14, CZ + 3.5], [0, 20.1, CZ + 3.5], CH.side);
    box(g, M4.from(0, 22, CZ), 3, 4, 3, CH); cyl(g, M4.from(0, 24, CZ, Math.PI / 4), 2.4, 0, 3.5, 4, RF);
    box(gw, M4.from(0, 22, CZ + 1.52), 1, 1.8, 0.05, hex('#ffd24a'));
    hubDoor(L, 0, 0, CZ + 3.5, 's', 'bild_spuk', 'Spuk-Home', '\u{1F47B}', '#c8a8ff');
    const RC = ['#8a3ad8', '#3a8ad8', '#d83a8a', '#3ad8a8'];
    disc(gw, M4.from(0, 10.2, CZ + 3.55), 2.1, 16, RC.map(hex));
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; box(g, M4.from(Math.cos(a) * 2.2, 10.2 + Math.sin(a) * 2.2, CZ + 3.6, 0, 0, a), 0.3, 0.9, 0.2, CH.top); }
    for (const s of [-1, 1]) {
      const m = M4.from(s * 6, 6, CZ + 3.55);
      box(gw, m, 1.6, 4, 0.05, hex('#6a3aa8')); gw.tri(P(m, -0.8, 2, 0), P(m, 0.8, 2, 0), P(m, 0, 3.2, 0), hex('#8a5ad8'));
    }
    // kleine Grabsteine neben der Kapelle
    for (const [x, z] of [[-14, -57], [-17, -55], [-20, -58], [14, -57], [17.5, -55.5]]) {
      box(g, M4.from(x, 0.7, z), 1.2, 1.4, 0.3, hex('#8a8a92'));
      cyl(g, M4.from(x, 1.4, z, 0, Math.PI / 2), 0.6, 0.6, 0.3, 10, hex('#8a8a92'));
      starGeo(g, M4.from(x, 1, z + 0.17), 0.22, 0.02, hex('#5a5a64'));
      L.solid(x - 0.6, 0, z - 0.2, x + 0.6, 2, z + 0.2, 'grave');
    }
    // ── Die sechs Brunnengeister ──
    let hunted = 0;
    L.onDefeat = (e) => {
      if (!e.hunt) return;
      e.t = 1e9; hunted++;
      toast(`\u{1F47B} Brunnengeister: ${hunted} / 6`);
      if (hunted === 6) {
        spawnStar('hof', L, [FX, PT + 1.3, FZ + 1.9]);
        setTimeout(() => Dialog.show('???', ['Huuuh … die Geister sind fort.', 'Am Sockel der Statue glitzert jetzt ein Stern!']), 600);
      }
    };
    [[0, -11], [12, -18], [12, -34], [0, -41], [-12, -34], [-12, -18]].forEach(([x, z], i) => {
      L.enemies.push(Object.assign(makeShyGhost(FX + x, 1.3, z, 2.5, (i % 2 ? 1 : -1) * 0.5, i * 1.1, { leash: 26 }), { hunt: true }));
    });
    // Muenzen: rund um den Brunnen, am Grund des Beckens
    K.coinRing(FX, 1.9, FZ, SQ + 1.4, 10);
    for (const [x, z] of [[-5, -4], [5, 4], [-4, 5], [4, -5]]) L.coin('yellow', FX + x, -2.3, FZ + z);
    K.talker(-4.6, 0, 5, 'Schild', [
      '★ SCHLOSSHOF ★\nDer Brunnen mit der Statue ist das Herz des Schlosses.',
      'Um den Brunnen spuken SECHS GEISTER. Sie sind schüchtern: Wer sie ansieht, dem zeigen sie nur ihre Hände – dann geht jeder Schlag durch sie hindurch.',
      'Im Norden steht die GEISTERKAPELLE. Dort hängt das Bild zu Spuk-Home.',
    ]);
    // ── Leben ──
    K.life.fish(FX - 6, FZ - 6, FX + 6, FZ + 6, WY, 5, { jump: true });
    K.life.glows(X0 + 8, Z0 + 8, X1 - 8, Z1 - 2, 30, { y: 0.5, yr: 4, col: '#fff2a0', s: 0.7, speed: 0.4 });
    K.life.butterflies(-24, -56, 24, 4, 6, { y: 0.5, yr: 3, cols: ['#e8e0ff', '#ffd8f0'], speed: 0.7 });
    K.life.birds(5, { col: '#2a1a3a', y: 30, r: 0.8 });
    K.life.critters('frog', 11, -44, 24, -32, 2, { speed: 0.7 }); K.life.critters('frog', -24, -20, -11, -8, 2, { speed: 0.7 });
    K.life.npc(12, -4, 'Gärtnerin Rosa', ['Pssst … siehst du die Geister um den Brunnen?',
      'Schau sie an, dann halten sie sich die Augen zu und werden ganz durchsichtig. Treffen kann man sie dann nicht.',
      'Dreh ihnen den Rücken zu und lass sie herankommen – dann blitzschnell umdrehen und zuhauen! Oder draufspringen.',
      'Sind alle sechs fort, erscheint an der Statue ein Stern. Viel Glück!'], { cat: 0, r: 4, tint: '#ffd0a8', mix: 0.3 });
    L.finish();
    return L;
  }

  /* ─────────── Bewegungs-Gym (Testlevel, nur ueber ?gym) ───────────
     Leere Graubox mit 1-m-Raster und Messlatten: hier wird das Moveset getunt,
     bevor Level darauf gebaut werden. */
  function buildGym() {
    const L = new Level({ name: 'Bewegungs-Gym', spawn: [0, 0, 30], spawnFace: Math.PI, spawnYaw: 0,
      fog: hex('#dfe6ee'), fogNear: 90, fogFar: 260, light: v3.norm([0.35, -0.85, -0.4]), sky: 'day' });
    const K = kit(L), g = K.g, gw = K.glow;
    const X0 = -60, X1 = 60, Z0 = -80, Z1 = 40, LINE = hex('#8a93a3');
    K.ground(X0, Z0, X1, Z1, hex('#c8ccd2'), hex('#bcc1c8'), 0, 1);
    K.bounds(X0, Z0, X1, Z1);
    // alle 5 m eine dunklere Linie, damit man Weiten abzaehlen kann
    for (let x = X0; x <= X1; x += 5) g.quad([x - 0.04, 0.01, Z1], [x + 0.04, 0.01, Z1], [x + 0.04, 0.01, Z0], [x - 0.04, 0.01, Z0], LINE);
    for (let z = Z0; z <= Z1; z += 5) g.quad([X0, 0.01, z + 0.04], [X1, 0.01, z + 0.04], [X1, 0.01, z - 0.04], [X0, 0.01, z - 0.04], LINE);
    // Messlatte: Streifen alle 1 m, rot alle 5 m (bis 12 m)
    const pole = (x, z) => {
      for (let y = 0; y < 12; y++) box(g, M4.from(x, y + 0.5, z), 0.3, 1, 0.3, y % 5 === 4 ? hex('#e8413a') : y % 2 ? hex('#ffffff') : hex('#2a2e36'));
      L.solid(x - 0.15, 0, z - 0.15, x + 0.15, 12, z + 0.15, 'post');
    };
    pole(-5, 20); pole(5, 20);
    K.talker(-3, 0, 26, 'Schild', [
      '★ BEWEGUNGS-GYM ★\nTestgelände für das Moveset. Boden: 1-m-Raster, dunkle Linien alle 5 m.',
      'Die Messlatten sind 12 m hoch: weiß/schwarz je 1 m, rot bei 5 und 10 m.',
    ]);
    L.finish();
    return L;
  }

  /* ═══════════ Himmel: eine Kuppel pro Stimmung ═══════════
     Wird erst gebaut, wenn ein Level ihn braucht, und dann wiederverwendet. */
  const SKIES = {
    day:    { top: '#2a6fe8', mid: '#76bcff', hor: '#cdeeff', below: '#9fd0f0', clouds: 9, cloud: '#ffffff', cloudLo: '#dde9f8', sun: '#fff6c0', dir: [0.33, 0.78, 0.28], size: 22 },
    desert: { top: '#3a80dc', mid: '#86c0ee', hor: '#f6e2b8', below: '#e8cf9a', clouds: 4, cloud: '#fff8ec', cloudLo: '#f0dcc0', sun: '#fffbe0', dir: [0.25, 0.85, 0.3], size: 28 },
    sunset: { top: '#23265e', mid: '#b24a86', hor: '#ffb070', below: '#d86a48', clouds: 8, cloud: '#ffc8a0', cloudLo: '#9a4a86', sun: '#ffe070', dir: [0, 0.1, -1], size: 44 },
    snow:   { top: '#6a8ab8', mid: '#a8c0dc', hor: '#eef3fa', below: '#dde6f0', clouds: 14, cloud: '#f4f8ff', cloudLo: '#c8d4e4', sun: '#ffffff', dir: [-0.3, 0.6, -0.5], size: 16 },
    night:  { top: '#07051a', mid: '#221245', hor: '#4a2a6a', below: '#150c28', clouds: 5, cloud: '#3a2a5a', cloudLo: '#241840', stars: 280, moon: '#fff4c0', dir: [-0.4, 0.5, -0.6], size: 22 },
    brass:  { top: '#35251c', mid: '#8a5a30', hor: '#e8b068', below: '#6a4428', clouds: 10, cloud: '#c89060', cloudLo: '#7a5030', sun: '#ffd890', dir: [0.5, 0.22, -0.7], size: 34 },
    space:  { top: '#02010a', mid: '#140a3a', hor: '#3a1a6a', below: '#0a1030', clouds: 0, stars: 520, planet: '#8ad0ff', dir: [0.6, 0.35, -0.6], size: 40 },
    forest: { top: '#17385a', mid: '#3a7a8a', hor: '#b0dcb4', below: '#2a5a3a', clouds: 6, cloud: '#e0f0e8', cloudLo: '#8ab0a0', stars: 50, sun: '#fff0c0', dir: [-0.5, 0.25, -0.6], size: 22 },
    synth:  { top: '#080018', mid: '#360a58', hor: '#ff3fa0', below: '#18002c', clouds: 0, stars: 300, synthSun: true, dir: [0, 0.13, -1], size: 70 },
  };
  const skyCache = {};
  function skyMesh(name) {
    if (skyCache[name]) return skyCache[name];
    const S = SKIES[name] || SKIES.day;
    const top = hex(S.top), mid = hex(S.mid), hor = hex(S.hor), below = hex(S.below);
    const mixc = (a, b, t) => v3.add(v3.scale(a, 1 - t), v3.scale(b, t));
    const colAt = (th) => {
      const k = th / Math.PI;
      if (k < 0.35) return mixc(top, mid, k / 0.35);
      if (k < 0.5) return mixc(mid, hor, (k - 0.35) / 0.15);
      return mixc(hor, below, Math.min(1, (k - 0.5) * 2.5));
    };
    let seed = name.length * 977 + 13;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    skyCache[name] = build((g) => {
      const R = 380, su = 24, sv = 24;
      const pt = (t, p, r = R) => [r * Math.sin(t) * Math.cos(p), r * Math.cos(t), r * Math.sin(t) * Math.sin(p)];
      for (let j = 0; j < sv; j++) {
        const ta = j / sv * Math.PI, tb = (j + 1) / sv * Math.PI;
        for (let i = 0; i < su; i++) {
          const pa = i / su * TAU, pb = (i + 1) / su * TAU;
          g.quad(pt(ta, pa), pt(ta, pb), pt(tb, pb), pt(tb, pa), [colAt(ta), colAt(ta), colAt(tb), colAt(tb)]);
        }
      }
      // Sterne: kleine Dreiecke oberhalb des Horizonts
      for (let i = 0; i < (S.stars || 0); i++) {
        const t = Math.acos(1 - rnd() * 0.95), p = rnd() * TAU, s = 0.7 + rnd() * 1.4;
        const c = pt(t, p, 360), n = v3.norm(c), u = v3.norm(v3.cross(n, [0, 1, 0.001])), w = v3.cross(n, u);
        const col = rnd() < 0.15 ? hex('#ffd8a0') : rnd() < 0.2 ? hex('#a8c8ff') : C.white;
        g.tri(v3.add(c, v3.scale(u, s)), v3.add(c, v3.scale(w, s)), v3.sub(c, v3.scale(u, s)), col);
        g.tri(v3.sub(c, v3.scale(u, s)), v3.sub(c, v3.scale(w, s)), v3.add(c, v3.scale(u, s)), col);
      }
      const dir = v3.norm(S.dir), cpos = v3.scale(dir, 340);
      const ux = v3.norm(v3.cross([0, 1, 0], dir)), uy = v3.cross(dir, ux);
      const facing = M4.basis(cpos, ux, uy, v3.scale(dir, -1));
      if (S.sun) disc(g, facing, S.size, 20, hex(S.sun));
      if (S.moon) {
        disc(g, facing, S.size, 20, hex(S.moon));
        disc(g, M4.mul(facing, M4.from(S.size * 0.35, S.size * 0.2, 1)), S.size * 0.9, 20, top);   // Sichel
      }
      if (S.planet) {
        disc(g, facing, S.size, 24, hex(S.planet));
        disc(g, M4.mul(facing, M4.from(-S.size * 0.25, S.size * 0.2, 0.5)), S.size * 0.55, 16, hex('#c8ecff'));
        for (let i = 0; i < 32; i++) {   // Ring
          const a0 = i / 32 * TAU, a1 = (i + 1) / 32 * TAU, r0 = S.size * 1.45, r1 = S.size * 1.8;
          const q = (a, r) => M4.point(facing, [Math.cos(a) * r, Math.sin(a) * r * 0.32, 2]);
          g.quad(q(a0, r0), q(a1, r0), q(a1, r1), q(a0, r1), i % 2 ? hex('#e8d8ff') : hex('#b8a8e8'));
        }
      }
      if (S.synthSun) {
        // Gestreifte Retro-Sonne, unten orange, oben gelb
        const Rs = S.size;
        for (let k = 0; k < 16; k++) {
          const y0 = -Rs + (k / 16) * 2 * Rs, y1 = -Rs + ((k + 1) / 16) * 2 * Rs;
          if (k < 8 && k % 2 === 1) continue;
          const w0 = Math.sqrt(Math.max(0, Rs * Rs - y0 * y0)), w1 = Math.sqrt(Math.max(0, Rs * Rs - y1 * y1));
          const cA = mixc(hex('#ff3f7a'), hex('#ffe45a'), k / 15), cB = mixc(hex('#ff3f7a'), hex('#ffe45a'), (k + 1) / 15);
          g.quad(M4.point(facing, [-w0, y0, 0]), M4.point(facing, [w0, y0, 0]), M4.point(facing, [w1, y1, 0]), M4.point(facing, [-w1, y1, 0]), [cA, cA, cB, cB]);
        }
      }
      for (let i = 0; i < (S.clouds || 0); i++) {
        const a = i / S.clouds * TAU + 0.4 + rnd() * 0.3, r = 300, y = 55 + rnd() * 60;
        const m = M4.from(Math.cos(a) * r, y, Math.sin(a) * r, -a);
        const cc = hex(S.cloud), cl = hex(S.cloudLo);
        for (let k = 0; k < 4; k++) sphere(g, M4.mul(m, M4.from((k - 1.5) * 16, (k % 2) * 6, 0)), 18, 10, 12, 8, 5, (ii, jj) => (jj > 3 ? cl : cc));
      }
    });
    return skyCache[name];
  }

  /* ═══════════ Skybox: pro Welt ein gemalter Himmel ═══════════
     Ein Shader malt den Himmel einmal in die sechs Seiten einer Wuerfeltextur — Farbverlauf,
     Wolken mit Licht und Schatten, Berge am Horizont, Sterne, Milchstrasse, Mond, Nebel, ...
     Beim Zeichnen wird dann nur noch die Textur in Blickrichtung abgelesen (billig). */
  const Skybox = (() => {
    const THEME = { day: 0, desert: 1, sunset: 2, snow: 3, night: 4, brass: 5, space: 6, forest: 7, synth: 8 };
    const SIZE = 512;
    const GEN = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uFace; uniform float uSize; uniform float uTheme; uniform vec3 uSun; uniform vec3 uFogC;
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s / 0.984; }
float fbm4(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.03 + vec3(4.1, 2.3, 7.7); a *= 0.5; } return s / 0.9375; }
float ridged(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * (1.0 - abs(n3(p) * 2.0 - 1.0)); p = p * 2.1 + vec3(3.3, 1.1, 5.5); a *= 0.5; } return s / 0.97; }
vec3 faceDir(vec2 st) {
  vec2 uv = st * 2.0 - 1.0; vec3 d;
  if (uFace < 0.5) d = vec3(1.0, -uv.y, -uv.x);
  else if (uFace < 1.5) d = vec3(-1.0, -uv.y, uv.x);
  else if (uFace < 2.5) d = vec3(uv.x, 1.0, uv.y);
  else if (uFace < 3.5) d = vec3(uv.x, -1.0, -uv.y);
  else if (uFace < 4.5) d = vec3(uv.x, -uv.y, 1.0);
  else d = vec3(-uv.x, -uv.y, -1.0);
  return normalize(d);
}
float azi(vec3 d) { return atan(d.z, d.x); }
// Hoehe (als Sinus der Elevation) einer Bergkette ueber dem Horizont, nahtlos rundum
float ridge(vec3 d, float seed, float base, float amp, float freq) {
  vec2 c = normalize(d.xz + 1e-5);
  return base + amp * (fbm4(vec3(c * freq, seed)) - 0.45) * 2.2;
}
float stars(vec3 d, float cells, float dens) {
  vec3 q = d * cells, id = floor(q), f = fract(q) - 0.5;
  float h = h3(id + 3.1);
  if (h < 1.0 - dens) return 0.0;
  vec3 off = (vec3(h3(id + 1.7), h3(id + 4.3), h3(id + 7.9)) - 0.5) * 0.5;
  return smoothstep(0.32, 0.0, length(f - off)) * (0.45 + 0.55 * h3(id + 9.1));
}
// Wolkenschicht in Perspektive, mit Selbstschatten Richtung Sonne
vec4 clouds(vec3 d, float cover, float scale, vec3 lit, vec3 shade, float seed, float soft) {
  if (d.y < 0.005) return vec4(0.0);
  vec2 p = d.xz / (d.y + 0.07) * scale;
  float n = fbm(vec3(p, seed));
  float c = smoothstep(cover, cover + soft, n);
  vec2 sd = normalize(uSun.xz + 1e-4);
  float n2 = fbm(vec3(p + sd * 0.22, seed));
  float sh = clamp((n2 - n) * 3.2 + 0.45, 0.0, 1.0);
  return vec4(mix(lit, shade, sh), c * smoothstep(0.0, 0.14, d.y));
}
vec3 over(vec3 base, vec4 layer) { return mix(base, layer.rgb, layer.a); }
vec3 grad3(float e, vec3 hor, vec3 mid, vec3 zen, float m) {
  e = max(e, 0.0);
  return e < m ? mix(hor, mid, e / m) : mix(mid, zen, clamp((e - m) / (1.0 - m), 0.0, 1.0));
}
vec3 sunDisc(vec3 col, vec3 d, vec3 sc, float size, float glow, float glowK) {
  float s = dot(d, uSun);
  col += sc * pow(max(s, 0.0), glowK) * glow;
  col = mix(col, sc * 1.1, smoothstep(1.0 - size * 1.15, 1.0 - size, s));
  return col;
}
vec3 haze(vec3 col, vec3 d, float k, float w) { return mix(col, uFogC, exp(-abs(d.y) * k) * w); }

vec3 skyDay(vec3 d) {
  vec3 col = grad3(d.y, vec3(0.74, 0.88, 1.0), vec3(0.42, 0.66, 0.98), vec3(0.14, 0.38, 0.9), 0.35);
  col = sunDisc(col, d, vec3(1.0, 0.97, 0.85), 0.012, 0.35, 12.0);
  col += vec3(1.0, 0.95, 0.8) * pow(max(dot(d, uSun), 0.0), 600.0) * 0.8;
  if (d.y > 0.0) {
    vec2 p = d.xz / (d.y + 0.1);
    float ci = fbm4(vec3(p.x * 0.25, p.y * 2.0, 7.0));
    col = mix(col, vec3(1.0), smoothstep(0.55, 0.85, ci) * 0.35 * smoothstep(0.05, 0.3, d.y));
  }
  col = over(col, clouds(d, 0.5, 1.5, vec3(1.0), vec3(0.68, 0.74, 0.86), 1.0, 0.22));
  float r1 = ridge(d, 11.0, 0.045, 0.05, 3.0), r2 = ridge(d, 23.0, 0.012, 0.035, 6.0);
  if (d.y < r1) col = mix(vec3(0.5, 0.64, 0.82), col, 0.25);
  if (d.y < r2) col = mix(vec3(0.34, 0.54, 0.44), vec3(0.5, 0.64, 0.8), 0.35);
  return haze(col, d, 22.0, 0.45);
}
vec3 skyDesert(vec3 d) {
  vec3 col = grad3(d.y, vec3(0.98, 0.86, 0.66), vec3(0.6, 0.76, 0.95), vec3(0.18, 0.42, 0.86), 0.3);
  col = sunDisc(col, d, vec3(1.0, 0.98, 0.88), 0.014, 0.5, 18.0);
  col = over(col, clouds(d, 0.66, 1.1, vec3(1.0, 0.98, 0.94), vec3(0.85, 0.78, 0.72), 3.0, 0.3));
  float m = ridge(d, 5.0, 0.03, 0.06, 4.0);
  m = floor(m * 60.0) / 60.0;                                        // Tafelberge: flache Kuppen
  if (d.y < m) col = mix(vec3(0.78, 0.48, 0.3), col, 0.3);
  float dn = 0.012 + 0.012 * sin(azi(d) * 9.0 + 1.3) + 0.008 * sin(azi(d) * 23.0);
  if (d.y < dn) col = mix(vec3(0.92, 0.74, 0.48), col, 0.15);
  return haze(col, d, 26.0, 0.55);
}
vec3 skySunset(vec3 d) {
  vec3 col = grad3(d.y, vec3(1.0, 0.6, 0.34), vec3(0.72, 0.3, 0.5), vec3(0.1, 0.1, 0.32), 0.28);
  float s = dot(d, uSun);
  col += vec3(1.0, 0.55, 0.25) * pow(max(s, 0.0), 6.0) * 0.45;
  col = sunDisc(col, d, vec3(1.0, 0.86, 0.45), 0.035, 0.8, 40.0);
  vec4 c = clouds(d, 0.52, 1.0, vec3(1.0, 0.66, 0.46), vec3(0.42, 0.22, 0.44), 5.0, 0.2);
  c.rgb = mix(c.rgb, vec3(1.0, 0.8, 0.5), pow(max(s, 0.0), 8.0) * 0.6);
  col = over(col, c);
  if (d.y < 0.0) {
    vec3 sea = mix(vec3(0.34, 0.2, 0.36), vec3(0.08, 0.14, 0.3), clamp(-d.y * 6.0, 0.0, 1.0));
    vec2 hd = normalize(d.xz + 1e-5), sh = normalize(uSun.xz + 1e-5);
    float strk = pow(max(dot(hd, sh), 0.0), 220.0) * (0.55 + 0.45 * sin(-d.y * 900.0 + fbm4(vec3(hd * 20.0, 1.0)) * 6.0));
    col = sea + vec3(1.0, 0.7, 0.35) * strk * 0.9;
  }
  return haze(col, d, 30.0, 0.35);
}
vec3 skySnow(vec3 d) {
  vec3 col = grad3(d.y, vec3(0.9, 0.93, 0.98), vec3(0.66, 0.76, 0.9), vec3(0.4, 0.54, 0.76), 0.35);
  col = sunDisc(col, d, vec3(1.0, 1.0, 0.96), 0.01, 0.3, 10.0);
  col = over(col, clouds(d, 0.42, 0.9, vec3(0.99, 0.99, 1.0), vec3(0.72, 0.77, 0.86), 9.0, 0.35));
  vec2 c = normalize(d.xz + 1e-5);
  float r = 0.02 + 0.1 * (ridged(vec3(c * 3.0, 4.0)) - 0.55);
  if (d.y < r) {
    float snow = smoothstep(r - 0.03, r - 0.012, d.y) + step(0.62, fbm4(vec3(c * 30.0, d.y * 40.0)));
    col = mix(vec3(0.46, 0.52, 0.64), vec3(0.96, 0.98, 1.0), clamp(snow, 0.0, 1.0));
    col = mix(col, vec3(0.8, 0.85, 0.94), 0.35);
  }
  float r2 = 0.0 + 0.05 * (ridged(vec3(c * 6.0, 8.0)) - 0.5);
  if (d.y < r2) col = mix(vec3(0.62, 0.68, 0.78), vec3(0.97, 0.98, 1.0), smoothstep(r2 - 0.02, r2, d.y));
  return haze(col, d, 20.0, 0.5);
}
vec3 skyNight(vec3 d) {
  vec3 col = grad3(d.y, vec3(0.2, 0.11, 0.32), vec3(0.08, 0.05, 0.2), vec3(0.015, 0.015, 0.07), 0.3);
  vec3 axis = normalize(vec3(0.35, 0.55, 0.76));
  float band = exp(-pow(dot(d, axis), 2.0) * 28.0);
  col += vec3(0.3, 0.26, 0.5) * band * (0.35 + 0.65 * fbm(d * 6.0)) * smoothstep(-0.05, 0.3, d.y);
  float st = stars(d, 70.0, 0.05) + stars(d, 150.0, 0.08) * 0.6 + band * stars(d, 260.0, 0.25) * 0.5;
  col += vec3(1.0, 0.96, 0.9) * st * smoothstep(-0.02, 0.1, d.y);
  float s = dot(d, uSun);
  col += vec3(0.6, 0.55, 0.8) * pow(max(s, 0.0), 30.0) * 0.35;
  if (s > 0.9975) {
    vec3 t1 = normalize(cross(uSun, vec3(0.0, 1.0, 0.0))), t2 = cross(t1, uSun);
    vec2 q = vec2(dot(d, t1), dot(d, t2)) / 0.07;
    float cr = fbm4(vec3(q * 3.0, 2.0));
    col = mix(col, mix(vec3(1.0, 0.96, 0.8), vec3(0.72, 0.68, 0.6), smoothstep(0.45, 0.7, cr)), smoothstep(1.0, 0.9, length(q)));
  }
  col = over(col, clouds(d, 0.6, 1.2, vec3(0.42, 0.34, 0.62), vec3(0.12, 0.08, 0.22), 13.0, 0.25) * vec4(1.0, 1.0, 1.0, 0.8));
  float h = ridge(d, 17.0, 0.02, 0.05, 4.0);
  if (d.y < h) col = vec3(0.07, 0.04, 0.12);
  return haze(col, d, 26.0, 0.4);
}
vec3 skyBrass(vec3 d) {
  vec3 col = grad3(d.y, vec3(0.98, 0.7, 0.42), vec3(0.72, 0.44, 0.26), vec3(0.24, 0.15, 0.12), 0.35);
  col = sunDisc(col, d, vec3(1.0, 0.88, 0.62), 0.05, 0.6, 5.0);
  float smog = fbm(vec3(d.x * 2.0, d.y * 18.0, d.z * 2.0));
  col = mix(col, vec3(0.86, 0.6, 0.38), smoothstep(0.45, 0.8, smog) * 0.55 * smoothstep(0.5, 0.0, d.y));
  float a = azi(d) / 6.2831853 * 46.0, cell = floor(a), fr = fract(a), hh = h3(vec3(cell, 1.0, 3.0));
  float sky = 0.035 + 0.03 * h3(vec3(cell, 5.0, 1.0));
  float chim = (hh > 0.62 && abs(fr - 0.5) < 0.11) ? 0.07 + 0.08 * h3(vec3(cell, 9.0, 2.0)) : 0.0;
  float top = max(sky, chim);
  if (d.y < top) col = mix(vec3(0.24, 0.14, 0.1), col, 0.35);
  if (chim > 0.0) {
    float sm = fbm4(vec3(a * 0.6, d.y * 25.0 - 3.0, 7.0));
    col = mix(col, vec3(0.62, 0.52, 0.46), smoothstep(0.5, 0.75, sm) * smoothstep(chim, chim + 0.02, d.y) * smoothstep(chim + 0.25, chim, d.y) * 0.8);
  }
  return haze(col, d, 16.0, 0.5);
}
vec3 skySpace(vec3 d) {
  vec3 col = vec3(0.01, 0.01, 0.04);
  float n1 = fbm(d * 2.2 + vec3(3.0)), n2 = fbm(d * 3.1 + vec3(9.0));
  col += vec3(0.42, 0.12, 0.55) * pow(n1, 3.0) * 1.4 + vec3(0.1, 0.45, 0.7) * pow(n2, 4.0) * 1.6;
  col += vec3(0.9, 0.3, 0.5) * pow(max(fbm(d * 5.0 + vec3(1.0)) - 0.35, 0.0), 2.0) * 1.2;
  float st = stars(d, 60.0, 0.06) + stars(d, 130.0, 0.12) * 0.7 + stars(d, 240.0, 0.2) * 0.4;
  vec3 sc = mix(vec3(1.0, 0.9, 0.8), vec3(0.7, 0.8, 1.0), h3(floor(d * 60.0)));
  col += sc * st;
  vec3 P = uSun; float s = dot(d, P);
  if (s > 0.93) {
    vec3 t1 = normalize(cross(P, vec3(0.0, 1.0, 0.0))), t2 = cross(t1, P);
    vec2 q = vec2(dot(d, t1), dot(d, t2)) / 0.21;
    vec2 rq = vec2(q.x, (q.y + q.x * 0.25) * 3.4);
    float rr = length(rq), pr = length(q);
    bool front = rq.y < 0.0;
    vec3 ringC = mix(vec3(0.9, 0.82, 0.62), vec3(0.62, 0.52, 0.72), 0.5 + 0.5 * sin(rr * 40.0));
    float ring = smoothstep(1.32, 1.42, rr) * smoothstep(2.05, 1.95, rr) * (0.62 + 0.38 * sin(rr * 26.0)) * (1.0 - 0.5 * smoothstep(1.62, 1.66, rr) * smoothstep(1.72, 1.68, rr));
    if (!front && ring > 0.0) col = mix(col, ringC, ring * 0.9);
    if (pr < 1.0) {
      float z = sqrt(1.0 - pr * pr);
      vec3 nrm = normalize(vec3(q, z));
      float lam = clamp(dot(nrm, normalize(vec3(-0.5, 0.4, 0.75))), 0.0, 1.0);
      vec3 pc = mix(vec3(0.45, 0.72, 0.95), vec3(0.8, 0.9, 1.0), 0.5 + 0.5 * sin(q.y * 14.0 + fbm4(vec3(q * 3.0, 1.0)) * 4.0));
      col = pc * (0.15 + 0.95 * lam);
    }
    if (front && ring > 0.0) col = mix(col, ringC, ring * 0.9);
  }
  return col;
}
vec3 skyForest(vec3 d) {
  vec3 col = grad3(d.y, vec3(0.98, 0.78, 0.6), vec3(0.36, 0.62, 0.66), vec3(0.06, 0.16, 0.3), 0.3);
  col = sunDisc(col, d, vec3(1.0, 0.92, 0.72), 0.03, 0.55, 10.0);
  col += vec3(1.0, 0.97, 0.9) * stars(d, 90.0, 0.05) * smoothstep(0.35, 0.8, d.y);
  col = over(col, clouds(d, 0.58, 1.1, vec3(1.0, 0.86, 0.74), vec3(0.4, 0.5, 0.6), 21.0, 0.25));
  float a = azi(d);
  for (int L = 0; L < 2; L++) {
    float fl = float(L), cellsN = 90.0 + fl * 70.0, x = (a / 6.2831853 + 0.5) * cellsN, cell = floor(x), fr = fract(x);
    float hh = 0.03 + 0.05 * h3(vec3(cell, fl, 4.0)) - fl * 0.012;
    float tree = hh * (1.0 - abs(fr - 0.5) * 2.0) + 0.015 - fl * 0.01;
    if (d.y < tree) col = fl < 0.5 ? mix(vec3(0.2, 0.36, 0.34), col, 0.35) : vec3(0.06, 0.14, 0.1);
  }
  col += vec3(0.8, 1.0, 0.4) * stars(d, 120.0, 0.04) * smoothstep(0.1, 0.04, d.y) * step(0.0, d.y) * 1.5;
  return haze(col, d, 30.0, 0.3);
}
vec3 skySynth(vec3 d) {
  vec3 col = grad3(d.y, vec3(1.0, 0.24, 0.6), vec3(0.34, 0.04, 0.5), vec3(0.02, 0.0, 0.09), 0.25);
  col += vec3(1.0) * (stars(d, 80.0, 0.06) + stars(d, 160.0, 0.08) * 0.5) * smoothstep(0.15, 0.4, d.y);
  float s = dot(d, uSun);
  if (s > 0.955) {
    vec3 t1 = normalize(cross(uSun, vec3(0.0, 1.0, 0.0))), t2 = cross(t1, uSun);
    vec2 q = vec2(dot(d, t1), dot(d, t2)) / 0.3;
    if (length(q) < 1.0) {
      float gap = (q.y < 0.1) ? step(0.55, fract(q.y * 7.0 - 0.3)) : 1.0;
      col = mix(col, mix(vec3(1.0, 0.25, 0.55), vec3(1.0, 0.9, 0.3), clamp(q.y * 0.5 + 0.5, 0.0, 1.0)), gap);
    }
  }
  col += vec3(1.0, 0.35, 0.7) * pow(max(s, 0.0), 12.0) * 0.4;
  float r = 0.02 + 0.07 * (ridged(vec3(normalize(d.xz + 1e-5) * 3.0, 6.0)) - 0.5);
  if (d.y < r && d.y > 0.0) {
    col = vec3(0.1, 0.0, 0.18);
    col += vec3(0.2, 1.0, 1.0) * smoothstep(0.005, 0.0, abs(d.y - r)) + vec3(1.0, 0.3, 0.8) * 0.25 * smoothstep(r - 0.03, r, d.y);
  }
  if (d.y <= 0.0) {
    vec2 p = d.xz / max(-d.y, 0.02);
    float gx = smoothstep(0.0, 0.05, abs(fract(p.x * 0.5) - 0.5) - 0.44), gz = smoothstep(0.0, 0.05, abs(fract(p.y * 0.5) - 0.5) - 0.44);
    float fade = clamp(-d.y * 4.0, 0.0, 1.0);
    col = vec3(0.07, 0.0, 0.14) + vec3(0.2, 0.9, 1.0) * max(gx, gz) * (0.3 + 0.7 * fade) * 0.9;
  }
  return haze(col, d, 40.0, 0.25);
}
void main() {
  vec3 d = faceDir(gl_FragCoord.xy / uSize);
  vec3 col;
  if (uTheme < 0.5) col = skyDay(d);
  else if (uTheme < 1.5) col = skyDesert(d);
  else if (uTheme < 2.5) col = skySunset(d);
  else if (uTheme < 3.5) col = skySnow(d);
  else if (uTheme < 4.5) col = skyNight(d);
  else if (uTheme < 5.5) col = skyBrass(d);
  else if (uTheme < 6.5) col = skySpace(d);
  else if (uTheme < 7.5) col = skyForest(d);
  else col = skySynth(d);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
    const DRAW_VS = 'attribute vec2 aP; varying vec2 vP; void main() { vP = aP; gl_Position = vec4(aP, 0.0, 1.0); }';
    const DRAW_FS = `precision mediump float; varying vec2 vP; uniform samplerCube uSky; uniform mat3 uRot; uniform vec2 uTan;
void main() { vec3 v = normalize(vec3(vP.x * uTan.x, vP.y * uTan.y, -1.0)); gl_FragColor = vec4(textureCube(uSky, uRot * v).rgb, 1.0); }`;
    /* Lebendiger Fraktal-Himmel (Mandelbrot-Regenbogen), jedes Bild neu gerechnet:
       1) HYPERRAUM — ein volumetrisches Fraktal, das direkt aus der 3D-Blickrichtung waechst.
          Dadurch gibt es keine Spiegelkanten und keine "Wuerfelecken": es sieht aus wie ein Raum
          hinter dem Raum, durch den man langsam treibt.
       2) MANDELBULB — das Mandelbrot in 3D: ein riesiger, langsam rotierender Koerper mit echtem
          Licht und Normalen, dessen Potenz atmet (er formt sich dabei immer wieder um).
       Gerechnet wird in ein kleines Bild (hoechstens 300 Zeilen) und dann weich hochgezogen. */
    const FRAC_FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vP; uniform mat3 uRot; uniform vec2 uTan; uniform float uTime;
vec3 pal(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// Hyperraum: gefaltetes Kaliset, entlang des Strahls aufsummiert (Nebel aus Fraktalstaub)
vec3 hyper(vec3 rd, float t) {
  vec3 acc = vec3(0.0), ro = vec3(1.3, 0.9, -0.4 + t * 0.035);
  float fade = 1.0, s = 0.14;
  for (int i = 0; i < 12; i++) {
    vec3 p = ro + rd * s;
    p = abs(vec3(2.1) - mod(p, vec3(4.2)));
    float prev = 0.0, a = 0.0;
    for (int j = 0; j < 10; j++) {
      p = abs(p) / max(dot(p, p), 0.02) - (0.53 + 0.035 * sin(t * 0.23));
      float l = length(p);
      a += abs(l - prev);
      prev = l;
    }
    a = a * a * a * 0.00035;
    acc += fade * pal(s * 0.5 + t * 0.07) * a;
    fade *= 0.76;
    s += 0.21;
  }
  // dunkler Grund, damit die Fraktalfaeden leuchten statt alles zu ueberstrahlen
  return vec3(0.04, 0.01, 0.1) + acc * 0.32;
}
// Abstandsfunktion des Mandelbulb (3D-Mandelbrot)
float bulbDE(vec3 p, float power, out float trap) {
  vec3 z = p; float dr = 1.0, r = 0.0; trap = 1e9;
  for (int i = 0; i < 7; i++) {
    r = length(z);
    if (r > 2.2 || r < 1e-5) break;
    float th = acos(clamp(z.z / r, -1.0, 1.0)) * power;
    float ph = atan(z.y, z.x) * power;
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    float zr = pow(r, power);
    z = zr * vec3(sin(th) * cos(ph), sin(th) * sin(ph), cos(th)) + p;
    trap = min(trap, dot(z, z));
  }
  return 0.5 * log(max(r, 1.0001)) * r / dr;
}
void main() {
  vec3 rd = normalize(uRot * normalize(vec3(vP.x * uTan.x, vP.y * uTan.y, -1.0)));
  float t = uTime;
  vec3 col = hyper(rd, t);
  // Der Bulb haengt in einer festen Himmelsrichtung; der Strahl wird in seine Koordinaten gedreht
  vec3 ro = -normalize(vec3(0.34, 0.45, -0.82)) * 5.0;
  float b = dot(-ro, rd), cc = dot(ro, ro) - 6.76, disc = b * b - cc;
  if (disc > 0.0) {
    float sq = sqrt(disc), tn = max(b - sq, 0.0), tf = b + sq;
    float power = 7.0 + 1.6 * sin(t * 0.13);
    mat2 ry = rot(t * 0.12), rx = rot(0.45 + 0.25 * sin(t * 0.07));
    float dist = tn, glow = 0.0, trap = 1.0, hit = -1.0, tr, steps = 0.0;
    for (int i = 0; i < 56; i++) {
      vec3 lp = ro + rd * dist;
      lp.xz = ry * lp.xz; lp.yz = rx * lp.yz;
      float d = bulbDE(lp * 0.78, power, trap) / 0.78;
      glow += exp(-d * 6.0) * 0.022;
      steps += 1.0;
      if (d < 0.0025 + dist * 0.0016) { hit = dist; break; }
      dist += max(d, 0.004);
      if (dist > tf) break;
    }
    vec3 bc = pal(sqrt(max(trap, 0.0)) * 1.15 + t * 0.15) * 1.2;
    if (hit > 0.0) {
      vec3 lp = ro + rd * hit;
      lp.xz = ry * lp.xz; lp.yz = rx * lp.yz;
      vec2 e = vec2(0.0028, 0.0);
      vec3 n = normalize(vec3(
        bulbDE((lp + e.xyy) * 0.78, power, tr) - bulbDE((lp - e.xyy) * 0.78, power, tr),
        bulbDE((lp + e.yxy) * 0.78, power, tr) - bulbDE((lp - e.yxy) * 0.78, power, tr),
        bulbDE((lp + e.yyx) * 0.78, power, tr) - bulbDE((lp - e.yyx) * 0.78, power, tr)));
      vec3 ld = normalize(vec3(0.5, 0.75, 0.3));
      float dif = max(dot(n, ld), 0.0), fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
      float ao = clamp(1.0 - steps / 46.0, 0.25, 1.0);            // enge Stellen bleiben dunkler
      vec3 sur = bc * (0.08 + 0.95 * dif) * ao + fres * pal(t * 0.3 + 0.45) * 0.75;
      sur += pal(t * 0.6 + n.y * 0.7) * pow(max(dot(reflect(rd, n), ld), 0.0), 20.0) * 0.55;
      col = mix(col, sur, 0.97);
    }
    col += bc * glow * 0.55;
  }
  col = mix(vec3(dot(col, vec3(0.3333))), col, 1.25);
  col = col / (1.0 + col * 0.55);   // sanfter Helligkeitsdeckel statt harter Ueberstrahlung
  gl_FragColor = vec4(clamp(col * 1.35, 0.0, 1.0), 1.0);
}`;
    const BLIT_FS = `precision mediump float; varying vec2 vP; uniform sampler2D uT;
void main() { gl_FragColor = vec4(texture2D(uT, vP * 0.5 + 0.5).rgb, 1.0); }`;
    let fracP = null, blitP = null, fracFbo = null, fracTex = null, fracW = 0, fracH = 0;
    function drawFractal(view, proj) {
      if (fracP === null) {
        try {
          fracP = mkProg(DRAW_VS, FRAC_FS); blitP = mkProg(DRAW_VS, BLIT_FS);
          fracFbo = gl.createFramebuffer(); fracTex = gl.createTexture();
        } catch (e) { fracP = false; console.warn('[glappa64] Fraktal-Himmel aus:', e.message); }
        gl.useProgram(MAIN);
      }
      if (!fracP) return false;
      const vp = gl.getParameter(gl.VIEWPORT);
      const th2 = Math.max(64, Math.min(300, vp[3])), tw2 = Math.max(64, Math.round(th2 * vp[2] / Math.max(1, vp[3])));
      if (tw2 !== fracW || th2 !== fracH) {
        fracW = tw2; fracH = th2;
        gl.bindTexture(gl.TEXTURE_2D, fracTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fracW, fracH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fracFbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fracTex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { fracP = false; console.warn('[glappa64] Fraktal-Himmel aus: Framebuffer'); }
      }
      if (!fracP) { Post.rebind(); return false; }
      // 1) Fraktal in das kleine Bild rechnen
      gl.bindFramebuffer(gl.FRAMEBUFFER, fracFbo);
      gl.viewport(0, 0, fracW, fracH);
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.useProgram(fracP);
      bindTri();
      const V = view;
      gl.uniformMatrix3fv(gl.getUniformLocation(fracP, 'uRot'), false, new Float32Array([V[0], V[4], V[8], V[1], V[5], V[9], V[2], V[6], V[10]]));
      gl.uniform2f(gl.getUniformLocation(fracP, 'uTan'), 1 / proj[0], 1 / proj[5]);
      gl.uniform1f(gl.getUniformLocation(fracP, 'uTime'), reduceMotion ? 20 : (clock % 3000) * 0.7);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 2) weich auf das Ziel ziehen
      Post.rebind();
      gl.useProgram(blitP);
      bindTri();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fracTex);
      gl.uniform1i(gl.getUniformLocation(blitP, 'uT'), 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
      gl.useProgram(MAIN);
      restoreAttribs();
      return true;
    }
    let genP = null, drawP = null, tri = null, fb = null, failed = false;
    const MAIN = prog;
    const cache = new Map();
    function mkProg(vs, fs) {
      const p = gl.createProgram();
      const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); gl.attachShader(p, s); };
      mk(gl.VERTEX_SHADER, vs); mk(gl.FRAGMENT_SHADER, fs);
      gl.bindAttribLocation(p, 0, 'aP');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    }
    function setup() {
      if (genP || failed) return !failed;
      try {
        genP = mkProg(DRAW_VS, GEN); drawP = mkProg(DRAW_VS, DRAW_FS);
        tri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        fb = gl.createFramebuffer();
      } catch (e) { failed = true; console.warn('[glappa64] Skybox aus:', e.message); }
      gl.useProgram(MAIN);
      return !failed;
    }
    // Nur Attribut 0 darf aktiv sein (sonst meckert WebGL ueber Attribute ohne Puffer); danach wieder alles fuer das Hauptprogramm an
    function bindTri() {
      for (let i = 1; i < 8; i++) gl.disableVertexAttribArray(i);
      gl.bindBuffer(gl.ARRAY_BUFFER, tri); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }
    function restoreAttribs() { for (const l of Object.values(A)) if (l >= 0) gl.enableVertexAttribArray(l); }
    function make(name, fog) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
      for (let f = 0; f < 6; f++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA, SIZE, SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.useProgram(genP);
      const sun = v3.norm((SKIES[name] || SKIES.day).dir);
      gl.uniform1f(gl.getUniformLocation(genP, 'uSize'), SIZE);
      gl.uniform1f(gl.getUniformLocation(genP, 'uTheme'), THEME[name] ?? 0);
      gl.uniform3fv(gl.getUniformLocation(genP, 'uSun'), sun);
      gl.uniform3fv(gl.getUniformLocation(genP, 'uFogC'), fog);
      const uFace = gl.getUniformLocation(genP, 'uFace');
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.viewport(0, 0, SIZE, SIZE);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      bindTri();
      for (let f = 0; f < 6; f++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, t, 0);
        gl.uniform1f(uFace, f);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(MAIN);
      restoreAttribs();
      return t;
    }
    return {
      // true = gezeichnet; false = bitte die alte Himmelskuppel nehmen
      draw(name, fog, view, proj) {
        if (!setup()) return false;
        if (name === 'fractal') return drawFractal(view, proj);
        const key = name + '|' + fog.join(',');
        let t = cache.get(key);
        if (!t) {
          if (cache.size >= 3) { const [k0, t0] = cache.entries().next().value; gl.deleteTexture(t0); cache.delete(k0); }
          t = make(name, fog); cache.set(key, t);
          Post.rebind();
        }
        gl.useProgram(drawP);
        gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
        bindTri();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
        gl.uniform1i(gl.getUniformLocation(drawP, 'uSky'), 1);
        const V = view;
        gl.uniformMatrix3fv(gl.getUniformLocation(drawP, 'uRot'), false, new Float32Array([V[0], V[4], V[8], V[1], V[5], V[9], V[2], V[6], V[10]]));
        gl.uniform2f(gl.getUniformLocation(drawP, 'uTan'), 1 / proj[0], 1 / proj[5]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.activeTexture(gl.TEXTURE0);
        gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
        gl.useProgram(MAIN);
        restoreAttribs();
        return true;
      },
      THEME,
      // Test-Haken: eine Seite erzeugen und ein Pixel zuruecklesen
      probe(name, fog, face = 4) {
        if (!setup()) return 'setup failed';
        const t = make(name, fog);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, t, 0);
        const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER), px = new Uint8Array(4);
        gl.readPixels(SIZE / 2, SIZE * 0.7, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { st, complete: st === gl.FRAMEBUFFER_COMPLETE, px: [...px], err: gl.getError() };
      },
    };
  })();

  /* ═══════════ Bildfilter: Konsolen-Aufloesung + Roehrenfernseher ═══════════
     Die Szene landet erst in einem kleinen Bild (240 Zeilen wie damals, intern
     2x2-fach gerendert = Kantenglaettung), dann malt ein Shader sie auf den
     Bildschirm: 'crt' als gewoelbte Roehre mit Zeilen, Maske und Glow,
     'n64' weich hochgezogen wie am Flachbild-Fernseher, 'aus' = scharf wie vorher. */
  const Post = (() => {
    const LINES = 240, SS = 2;
    let fbo = null, tex = null, depth = null, pp = null, tri = null, failed = false, active = false;
    let sfbo = null, stex = null, sdepth = null, sw = 0, sh = 0, signOn = false;
    let vw = 0, vh = 0, tw = 0, th = 0;
    const PU = {};
    const VS2 = 'attribute vec2 aP; varying vec2 vUV; void main() { vUV = aP * 0.5 + 0.5; gl_Position = vec4(aP, 0.0, 1.0); }';
    const FS2 = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUV;
uniform sampler2D uScene; uniform vec2 uV; uniform vec2 uOut; uniform float uCrt; uniform float uTime;
uniform sampler2D uSigns; uniform float uSignOn;
// Schilder + Gemaelde in voller Aufloesung: nur dort, wo sie im kleinen Bild wirklich sichtbar sind (Alpha 0 = markiert)
vec3 signs(vec3 col, vec2 uv) {
  if (uSignOn < 0.5) return col;
  vec4 sg = texture2D(uSigns, uv);
  float mk = (1.0 - texture2D(uScene, uv).a) * sg.a;
  return mix(col, sg.rgb, clamp(mk * 1.15, 0.0, 1.0));
}
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
// ein Konsolen-Bildpunkt: genau zwischen 2x2 Texeln abgetastet (= Mittelwert), dann 15-Bit-Farbe mit Raster-Dither
vec3 px(vec2 i) {
  vec3 c = texture2D(uScene, (i + 0.5) / uV).rgb;
  return floor(c * 31.0 + bayer4(i)) / 31.0;
}
// Strahl laeuft ueber eine Zeile: etwas schaerfer als linear, Rot/Blau leicht versetzt (Konvergenzfehler)
vec3 row(vec2 i, float fx) {
  vec3 a = px(i), b = px(i + vec2(1.0, 0.0));
  vec3 f = clamp(vec3(fx + 0.16, fx, fx - 0.16), 0.0, 1.0);
  return mix(a, b, mix(f, f * f * (3.0 - 2.0 * f), 0.6));
}
void main() {
  vec2 uv = vUV;
  float edge = 1.0;
  if (uCrt > 0.5) {
    vec2 q = uv * 2.0 - 1.0;
    q *= vec2(1.0 + q.y * q.y * 0.045, 1.0 + q.x * q.x * 0.06);
    uv = q * 0.5 + 0.5;
    vec2 hp = q * 0.5 * uOut;
    float r = 0.04 * uOut.y;
    float sd = length(max(abs(hp) - (uOut * 0.5 - r), 0.0)) - r;
    edge = clamp(0.5 - sd, 0.0, 1.0);
  }
  vec2 p = uv * uV - 0.5;
  vec2 i = floor(p), f = p - i;
  vec3 col;
  if (uCrt > 0.5) {
    vec3 a = row(i, f.x), b = row(i + vec2(0.0, 1.0), f.x);
    // Leuchtspur je Farbkanal: helle Zeilen werden breiter, dunkle schmal (typische Zeilenstruktur)
    vec3 sa = mix(vec3(0.27), vec3(0.47), a), sb = mix(vec3(0.27), vec3(0.47), b);
    float da = f.y, db = 1.0 - f.y;
    col = (a * exp(-da * da / (sa * sa)) + b * exp(-db * db / (sb * sb))) * 1.45;
    col = mix(vec3(dot(col, vec3(0.3, 0.55, 0.15))), col, 0.88);
    // scharfe Schilder, mit leichter Zeilenstruktur, damit sie nicht wie aufgeklebt wirken
    col = signs(col, uv) * (0.93 + 0.07 * cos(f.y * 6.2832));
    // Glow: helles Licht blutet etwas in die Nachbarschaft
    vec3 glo = (texture2D(uScene, (p + vec2(1.4, 0.9) + 0.5) / uV).rgb + texture2D(uScene, (p + vec2(-1.4, 0.9) + 0.5) / uV).rgb
      + texture2D(uScene, (p + vec2(1.4, -0.9) + 0.5) / uV).rgb + texture2D(uScene, (p + vec2(-1.4, -0.9) + 0.5) / uV).rgb) * 0.25;
    col += glo * glo * 0.1;
    // Streifenmaske (Leuchtstoff-Triaden)
    float s = mod(floor(gl_FragCoord.x), 3.0);
    vec3 m = vec3(0.86);
    if (s < 1.0) m.r = 1.08; else if (s < 2.0) m.g = 1.08; else m.b = 1.08;
    col *= m * 1.07;
    col *= pow(clamp(16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y), 0.0, 1.0), 0.13);
    col *= 1.0 + (fract(sin(dot(gl_FragCoord.xy + uTime * 61.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.035;
    col *= edge;
  } else {
    col = mix(mix(px(i), px(i + vec2(1.0, 0.0)), f.x), mix(px(i + vec2(0.0, 1.0)), px(i + vec2(1.0, 1.0)), f.x), f.y);
    col = signs(col, uv);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
    function setup() {
      if (pp || failed) return !failed;
      try {
        const p = gl.createProgram();
        const mk = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); };
        mk(gl.VERTEX_SHADER, VS2); mk(gl.FRAGMENT_SHADER, FS2);
        gl.bindAttribLocation(p, 0, 'aP');
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        pp = p;
        ['uScene', 'uV', 'uOut', 'uCrt', 'uTime', 'uSigns', 'uSignOn'].forEach((n) => { PU[n] = gl.getUniformLocation(pp, n); });
        tri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        fbo = gl.createFramebuffer(); tex = gl.createTexture(); depth = gl.createRenderbuffer();
      } catch (e) { failed = true; console.warn('[glappa64] Bildfilter aus:', e.message); }
      gl.useProgram(prog);
      return !failed;
    }
    function resize(w, h) {
      tw = w * SS; th = h * SS; vw = w; vh = h;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindTexture(gl.TEXTURE_2D, whiteTex);
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, tw, th);   // in der Praxis 24 Bit Tiefe (16 Bit reicht bei 900 Einheiten Sicht nicht)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { failed = true; console.warn('[glappa64] Bildfilter aus: Framebuffer unvollstaendig'); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    return {
      // vor dem Zeichnen: Ziel binden (klein oder direkt der Bildschirm)
      begin(w, h) {
        active = state.filter !== 'aus' && setup();
        if (active) {
          const k = LINES / Math.min(w, h), nw = Math.max(32, Math.round(w * k)), nh = Math.max(32, Math.round(h * k));
          if (nw !== vw || nh !== vh) resize(nw, nh);
          if (failed) active = false;
        }
        this.rebind();
        return active;
      },
      rebind() {
        gl.bindFramebuffer(gl.FRAMEBUFFER, active ? fbo : null);
        if (active) gl.viewport(0, 0, tw, th); else gl.viewport(0, 0, canvas.width, canvas.height);
      },
      // Schilder-Ebene: fn zeichnet Schilder/Gemaelde noch einmal in voller Aufloesung (durchsichtiger Grund)
      signs(w, h, fn) {
        signOn = false;
        if (!active) return;
        try {
          if (!sfbo) { sfbo = gl.createFramebuffer(); stex = gl.createTexture(); sdepth = gl.createRenderbuffer(); }
          if (sw !== w || sh !== h) {
            sw = w; sh = h;
            gl.bindTexture(gl.TEXTURE_2D, stex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
            gl.bindTexture(gl.TEXTURE_2D, whiteTex);
            gl.bindRenderbuffer(gl.RENDERBUFFER, sdepth);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
            gl.bindFramebuffer(gl.FRAMEBUFFER, sfbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, stex, 0);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, sdepth);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Schilder-Ebene unvollstaendig');
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, sfbo);
          gl.viewport(0, 0, w, h);
          gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          fn();
          signOn = true;
        } catch (e) { sw = -1; }
        this.rebind();
      },
      // nach dem Zeichnen: kleines Bild auf den Bildschirm bringen
      end(w, h) {
        if (!active) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
        gl.useProgram(pp);
        for (let i = 1; i < 8; i++) gl.disableVertexAttribArray(i);
        gl.bindBuffer(gl.ARRAY_BUFFER, tri); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(PU.uScene, 0);
        gl.uniform2f(PU.uV, vw, vh);
        gl.uniform2f(PU.uOut, w, h);
        gl.uniform1f(PU.uCrt, state.filter === 'crt' ? 1 : 0);
        gl.uniform1f(PU.uTime, reduceMotion ? 0 : clock % 100);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, signOn ? stex : whiteTex);
        gl.uniform1i(PU.uSigns, 1); gl.uniform1f(PU.uSignOn, signOn ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, whiteTex);
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(prog);
        for (const l of Object.values(A)) if (l >= 0) gl.enableVertexAttribArray(l);
      },
      get info() { return { active, failed, vw, vh, tw, th, filter: state.filter }; },
    };
  })();

  /* ═══════════ Gegner-Daten ═══════════ */
  function makeGrummel(x, z, fromY) {
    return { type: 'grummel', home: [x, z], pos: [x, 0, z], fromY, face: Math.random() * TAU, speed: 0, state: 'walk', t: 0, wander: 0, anim: 0, targetFace: null };
  }
  function makeBomb(x, z, fromY) {
    return { type: 'bomb', home: [x, z], pos: [x, 0, z], fromY, face: Math.random() * TAU, speed: 0, state: 'walk', t: 0, wander: 0, anim: 0, targetFace: null };
  }
  function makeToaster(x, z) {
    return { type: 'toast', home: [x, z], pos: [x, 0, z], face: 0, vel: [0, 0], speed: 0, tired: 0, state: 'run', t: 0, anim: 0, cool: 0, seed: Math.random() * 9, wander: 0 };
  }
  // Rollende Kugel: rollt einen Weg aus [x, z]-Punkten entlang, versinkt am Ende und startet neu
  function makeRoller(path, o = {}) {
    return { type: 'roller', path, seg: 0, along: 0, r: o.r || 1.3, v: o.speed || 7, gap: o.gap ?? 1.2, tint: o.tint || null,
      pos: [path[0][0], 0, path[0][1]], vy: 0, face: 0, roll: 0, state: 'wait', t: o.delay || 0, scale: 0, home: path[0].slice(), anim: 0 };
  }
  // Geist: kreist um einen Punkt und wabert auf und ab
  function makeGhost(cx, cy, cz, rad = 4, w = 0.6, ph = 0) {
    return { type: 'ghost', c: [cx, cy, cz], rad, w, ph, pos: [cx + rad, cy, cz], face: 0, state: 'float', t: 0, home: [cx, cz], anim: ph };
  }
  // Schuechterner Geist: schleicht sich an, wenn man wegschaut (siehe updShyGhost)
  function makeShyGhost(cx, cy, cz, rad = 4, w = 0.5, ph = 0, o = {}) {
    return Object.assign(makeGhost(cx, cy, cz, rad, w, ph), { shy: true, hide: 1, vel: [0, 0, 0], leash: o.leash ?? 22, chase: o.chase ?? 3.6, minY: o.minY ?? 0.3 });
  }
  // Stachi: stachelige Kugel — draufspringen tut weh, nur Hauen, Treten oder Hechtsprung hilft
  function makeSpiky(x, z, fromY, col = '#c8402a') {
    return { type: 'spiky', home: [x, z], pos: [x, 0, z], fromY, col, face: Math.random() * TAU, speed: 0, state: 'walk', t: 0, wander: 0, anim: 0, targetFace: null };
  }
  // Flatterling: kreist in der Luft und stuerzt sich auf Glappo herab
  function makeBat(x, y, z, col = '#5a2a7a') {
    return { type: 'bat', home: [x, z], hy: y, pos: [x, y, z], col, face: 0, state: 'fly', t: 0, anim: Math.random() * 9, vel: [0, 0, 0], cool: 1 + Math.random() * 2 };
  }
  // Hopsi: huepfender Wackelpudding, springt auf Glappo zu
  function makeHopper(x, z, fromY, col = '#4cd964') {
    return { type: 'hopper', home: [x, z], pos: [x, 0, z], fromY, col, face: Math.random() * TAU, speed: 0, vy: 0, air: false, state: 'walk', t: Math.random(), anim: 0, targetFace: null, wander: 0 };
  }

  // Virus: schwebt, verfolgt Glappo und teilt sich beim ersten Treffer in zwei Mini-Viren
  // (liefert ein Array: das Virus und seine zwei schlafenden Kinder)
  function makeVirus(x, z, fromY) {
    const v = { type: 'virus', gen: 0, s: 1, home: [x, z], pos: [x, 0, z], fromY, face: 0, state: 'float', t: 0, anim: Math.random() * 9, vel: [0, 0, 0], inv: 0, kids: [] };
    for (let i = 0; i < 2; i++) v.kids.push({ type: 'virus', gen: 1, s: 0.55, home: [x, z], pos: [x, 0, z], fromY, face: 0, state: 'off', t: 0, anim: Math.random() * 9, vel: [0, 0, 0], inv: 0, parent: v });
    return [v, ...v.kids];
  }
  // Computerwurm: Kopf mit Wuerfel-Segmenten, die seiner Spur folgen
  function makeWorm(x, z, fromY, n = 7) {
    return { type: 'worm', home: [x, z], pos: [x, 0, z], fromY, face: Math.random() * TAU, speed: 0, state: 'walk', t: 0, wander: 0, anim: 0, targetFace: null, trail: [], segs: [], n };
  }
  // Pop-up-Fenster: versteckt, bis Glappo naeher kommt — dann springt es auf und verfolgt ihn
  function makePopup(x, z, fromY, v = 0) {
    return { type: 'popup', home: [x, z], pos: [x, 0, z], fromY, face: 0, state: 'hide', t: 0, anim: Math.random() * 9, vel: [0, 0, 0], open: 0, v };
  }
  // Spam-Mail fliegt wie ein Flatterling, Software-Bug laeuft wie ein Grummel
  const makeSpam = (x, y, z) => Object.assign(makeBat(x, y, z, '#ffffff'), { skin: 'mail' });
  const makeBug = (x, z, fromY) => Object.assign(makeGrummel(x, z, fromY), { skin: 'bug' });

  /* ═══════════ Kollisionshelfer ═══════════ */
  function groundAt(L, x, z, fromY, r = 0.3) {
    let best = -Infinity;
    for (const b of near(L, x, z)) {
      if (b.min[1] > fromY) continue;
      const nx = clamp(x, b.min[0], b.max[0]), nz = clamp(z, b.min[2], b.max[2]);
      if ((x - nx) * (x - nx) + (z - nz) * (z - nz) > r * r) continue;
      const t = b.slope ? topAt(b, x, z) : b.max[1];
      if (t > fromY) continue;
      if (t > best) best = t;
    }
    return best;
  }
  // Kreis (Radius r, Hoehe h) aus Quadern schieben; Quader mit Oberkante <= stepTop werden ignoriert
  function pushOut(L, p, r, h, stepTop, skip) {
    let hit = null;
    for (let it = 0; it < 2; it++) {
      for (const b of near(L, p[0], p[2])) {
        if ((!b.slope && b.max[1] <= stepTop) || b.min[1] >= p[1] + h) continue;
        if (skip && skip(b)) continue;
        const nx = clamp(p[0], b.min[0], b.max[0]), nz = clamp(p[2], b.min[2], b.max[2]);
        let dx = p[0] - nx, dz = p[2] - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (b.slope && topAt(b, nx, nz) <= stepTop) continue;
        if (d2 < 1e-10) {
          const pen = [p[0] - b.min[0], b.max[0] - p[0], p[2] - b.min[2], b.max[2] - p[2]];
          const k = pen.indexOf(Math.min(...pen));
          dx = k === 0 ? -1 : k === 1 ? 1 : 0; dz = k === 2 ? -1 : k === 3 ? 1 : 0;
          if (k === 0) p[0] = b.min[0] - r; else if (k === 1) p[0] = b.max[0] + r;
          else if (k === 2) p[2] = b.min[2] - r; else p[2] = b.max[2] + r;
        } else {
          const d = Math.sqrt(d2); dx /= d; dz /= d;
          p[0] = nx + dx * r; p[2] = nz + dz * r;
        }
        hit = { n: [dx, 0, dz], b };
      }
    }
    return hit;
  }
  function rayBox(o, d, b, maxT) {
    let t0 = 0, t1 = maxT;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < b.min[i] || o[i] > b.max[i]) return Infinity; continue; }
      let ta = (b.min[i] - o[i]) / d[i], tb = (b.max[i] - o[i]) / d[i];
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return Infinity;
    }
    return t0 > 0 ? t0 : Infinity;
  }
  const dist2D = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

  /* ═══════════ Partikel ═══════════ */
  const parts = [];
  function burst(pos, n, o) {
    for (let i = 0; i < n; i++) {
      if (parts.length > 160) parts.shift();
      const a = Math.random() * TAU, s = (o.spread || 3) * (0.3 + Math.random() * 0.7);
      const life = (o.life || .5) * (0.6 + Math.random() * 0.6);
      parts.push({ p: [pos[0], pos[1], pos[2]], v: [Math.cos(a) * s, (o.up || 2) + Math.random() * (o.upRand || 1), Math.sin(a) * s],
        life, max: life, s: (o.size || .2) * (0.6 + Math.random() * 0.8), col: o.cols[i % o.cols.length], g: o.grav ?? 12, rot: Math.random() * 6 });
    }
  }
  const dust = (p, n = 6) => burst([p[0], p[1] + 0.15, p[2]], n, { spread: 3, up: 1.2, upRand: 1, life: .45, size: .26, cols: [[.96, .94, .86], [.85, .82, .74]], grav: 3 });
  const sparkle = (p) => burst(p, 10, { spread: 3.5, up: 3, upRand: 3, life: .5, size: .14, cols: [[1, .9, .3], [1, 1, 1], [1, .75, .1]], grav: 6 });
  // Zweiter Sprung: flacher Ring, der nach aussen laeuft — so sieht man den Doppelsprung sofort
  const jumpRing = (p) => burst([p[0], p[1] + 0.12, p[2]], 12, { spread: 6, up: 0.5, upRand: 0.5, life: .42, size: .2, cols: [[1, 1, .94], [.86, .92, 1]], grav: 1.4 });

  /* ═══════════ Eingabe: Tastatur, Maus, Touch, Controller ═══════════ */
  const Input = (() => {
    const keys = new Set();
    const touch = { mx: 0, my: 0, a: false, b: false, c: false, z: false };
    let mdx = 0, mdy = 0, wheel = 0, prev = {};
    const st = { device: 'keyboard', padName: '' };
    const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    addEventListener('keydown', (e) => {
      keys.add(e.code);
      st.device = 'keyboard';
      if (GAME_KEYS.has(e.code) && mode !== 'pause' && mode !== 'ending') e.preventDefault();
    });
    addEventListener('keyup', (e) => keys.delete(e.code));
    addEventListener('blur', () => { keys.clear(); mouseHeld = false; });

    // Maus einfangen (Pointer Lock): ein Klick ins Spiel faengt die Maus, ESC gibt sie wieder frei.
    // Solange sie gefangen ist, dreht jede Mausbewegung die Kamera — ganz ohne Ziehen.
    // Wo der Browser das nie erlaubt (eingebettete Ansichten), bleibt es beim Ziehen mit der Maus
    let lockBroken = false, lockErrs = 0;
    const lockable = () => !lockBroken && !!canvas.requestPointerLock && !matchMedia('(pointer: coarse)').matches;
    const locked = () => document.pointerLockElement === canvas;
    function lock() {
      if (!lockable() || locked()) return;
      try {
        const r = canvas.requestPointerLock();
        if (r && r.catch) r.catch((err) => { if (err && /WrongDocument|NotSupported/.test(err.name)) lockBroken = true; });
      } catch (err) { lockBroken = true; }
    }
    document.addEventListener('pointerlockerror', () => { if (++lockErrs >= 2) lockBroken = true; });
    function unlock() { if (locked() && document.exitPointerLock) document.exitPointerLock(); }
    document.addEventListener('mousemove', (e) => {
      if (!locked()) return;
      mdx += (e.movementX || 0) * 0.7; mdy += (e.movementY || 0) * 0.7;
    });
    let lockLostT = -1e9;
    document.addEventListener('pointerlockchange', () => {
      const on = locked();
      if (on) lockErrs = 0;
      document.body.classList.toggle('mouse-locked', on);
      if (!on) {
        mouseHeld = false; lockLostT = performance.now();
        if (mode === 'play' && !Dialog.open) openPause();   // ESC: Maus frei und Pause
      }
    });

    // Kamera per Ziehen (Finger auf der 3D-Flaeche, Maus ohne Pointer Lock)
    let drag = null;
    let clicks = 0, mouseHeld = false;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) {
        // erster Klick ins Spiel faengt nur die Maus (kein Schlag ins Leere)
        if (!locked() && lockable() && mode === 'play') { lock(); return; }
        clicks++; mouseHeld = true; st.device = 'keyboard';
        return;
      }
      if (e.pointerType === 'mouse' && locked()) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('dragging');
    });
    addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse' && e.button === 0) mouseHeld = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      mdx += e.clientX - drag.x; mdy += e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const endDrag = (e) => { if (drag && e.pointerId === drag.id) { drag = null; canvas.classList.remove('dragging'); } };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', (e) => { wheel += e.deltaY; e.preventDefault(); }, { passive: false });

    // Touch-Knueppel + Knoepfe
    const stick = $('#stick'), knob = $('#stickKnob');
    let stickId = null;
    const moveStick = (e) => {
      const r = stick.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      touch.mx = dx; touch.my = dy;
      knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
    };
    stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e); });
    const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; touch.mx = touch.my = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);
    document.querySelectorAll('.tbtn').forEach((b) => {
      const k = b.dataset.btn;
      const on = (e) => { e.preventDefault(); touch[k] = true; b.classList.add('pressed'); };
      const off = () => { touch[k] = false; b.classList.remove('pressed'); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
    });
    addEventListener('touchstart', () => {
      st.device = 'touch';
      if ($('#touch').hidden) $('#touch').hidden = false;
    }, { passive: true });

    addEventListener('gamepadconnected', (e) => {
      st.device = 'pad';
      st.padName = (e.gamepad.id || 'Controller').replace(/\(.*?\)/g, '').trim().slice(0, 32);
      toast('🎮 ' + (st.padName || 'Controller') + ' verbunden');
    });

    const dz = (v) => (Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8);
    function poll() {
      const k = (c) => keys.has(c);
      let mx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
      let my = (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0);
      let cx = (k('KeyE') ? 1 : 0) - (k('KeyQ') ? 1 : 0), cy = 0;
      let jump = k('Space') || k('KeyJ');
      let action = k('KeyF') || k('KeyB') || k('Enter') || k('KeyK') || mouseHeld;
      // Z-Taste (Shift/X): am Boden hocken (Weitsprung/Rueckwaertssalto), in der Luft stampfen.
      // C: am Boden nach oben schauen, in der Luft ebenfalls stampfen.
      let look = k('KeyC');
      let z = k('ShiftLeft') || k('ShiftRight') || k('KeyX');
      let pause = k('Escape') || k('KeyP');
      let start = k('Enter') || k('Space');

      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const pad of pads) {
        if (!pad || !pad.connected) continue;
        const bt = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
        const lx = dz(pad.axes[0] || 0), ly = dz(pad.axes[1] || 0), rx = dz(pad.axes[2] || 0), ry = dz(pad.axes[3] || 0);
        let used = false;
        if (lx || ly) { mx = lx; my = ly; used = true; }
        if (bt(14) || bt(15) || bt(12) || bt(13)) { mx = (bt(15) ? 1 : 0) - (bt(14) ? 1 : 0); my = (bt(13) ? 1 : 0) - (bt(12) ? 1 : 0); used = true; }
        if (rx || ry) { cx += rx; cy += ry; used = true; }
        if (bt(4)) { cx -= 1; used = true; }
        if (bt(5)) { cx += 1; used = true; }
        const any = bt(0) || bt(1) || bt(2) || bt(3) || bt(6) || bt(7) || bt(9);
        jump = jump || bt(0);                 // A / Kreuz
        action = action || bt(1) || bt(2);    // B, X
        look = look || bt(3);                 // Y = nach oben schauen
        z = z || bt(6) || bt(7);              // LT/RT = Z-Taste
        pause = pause || bt(9);               // Start
        start = start || bt(0) || bt(9);
        if (used || any) st.device = 'pad';
        break;
      }
      mx += touch.mx; my += touch.my;
      jump = jump || touch.a; action = action || touch.b; look = look || touch.c; z = z || touch.z; start = start || touch.a;

      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      const out = {
        mx, my, cx: clamp(cx, -1, 1), cy: clamp(cy, -1, 1), mdx, mdy, wheel,
        jump, action, z, look, pause,
        jumpP: jump && !prev.jump, actionP: (action && !prev.action) || clicks > 0, zP: z && !prev.z, lookP: look && !prev.look,
        pauseP: pause && !prev.pause, startP: start && !prev.start,
      };
      prev = { jump, action, z, look, pause, start };
      mdx = mdy = wheel = 0; clicks = 0;
      return out;
    }
    return { poll, st, lock, unlock, locked, get lockLostT() { return lockLostT; } };
  })();

  /* ═══════════ Spieler ═══════════
     Bewegung nach dem Vorbild der 64er-Steuerung (eigene Umsetzung).
     Werte sind in "Einheiten pro Frame bei 30 FPS" gedacht: Glappo ist 2,2 m
     gross ≙ 160 Einheiten, also 1 E/F = 0,4125 m/s. Die Physik rechnet trotzdem
     mit 120 Schritten pro Sekunde, alles ist in stetige Raten umgerechnet. */
  const UF = 0.4125;               // 1 Einheit/Frame in m/s
  const UFF = UF * 30;             // 1 Einheit/Frame pro Frame in m/s²
  const R = 0.45, PH = 2.2, STEP_UP = 0.55;
  const GRAV = 4 * UFF, TERMINAL = 75 * UF;
  const RUN = 32 * UF;             // Hoechsttempo am Boden (13,2 m/s)
  const AIR_DRAG = 32 * UF, LONG_DRAG = 48 * UF;
  const TURN_RATE = 16;            // Drehen am Boden (rad/s): Kehrtwende in 0,2 s
  // Direkte Steuerung (Wunsch "sehr responsive"): volles Tempo nach ~0,15 s, Stillstand nach ~0,1 s
  const GROUND_ACC = 90, GROUND_BRAKE = 130, OVER_BRAKE = 45, SKID_BRAKE = 90;   // m/s²
  const CHAIN_WINDOW = 0.2;        // Doppel-/Dreifachsprung: so kurz nach der Landung A druecken
  const LONG_WINDOW = 0.18;        // Weitsprung: Z und A duerfen so weit auseinander liegen (Reihenfolge egal)
  const CHUTE_MAX = 17, CHUTE_ACC = 10;   // Rutschbahn: Hoechsttempo (m/s) und Beschleunigung
  const pl = {
    pos: [0, 0, 0], vel: [0, 0, 0], push: [0, 0, 0], face: 0, speed: 0, side: 0, grounded: true, coyote: 0,
    action: 'ground', landFrom: '', landT: -9, jumpBuf: 0, holdGrace: 0, skid: false, crouch: false, hold: null,
    flip: 0, pound: 0, invuln: 0, hurtT: 0, wall: null, wallT: -9, inWater: false, walk: 0, squash: 1,
    punchT: 0, lookT: 0, looking: false, dead: false, frozen: 0, entering: 0,
    groundBox: null, knock: 0, h: 2.2, crawl: false, forceCrouch: false, boostCool: 0, carry: [0, 0],
    waterObj: null, waterJump: false, swimPh: 0, strokeT: -9, ledgeCool: 0, hangBox: null, hangN: null, hangT: 0,
    climbK: 0, climbDur: 0.5, climbFrom: null, climbTo: null, appearT: -9,
    punchN: 0, punchDur: 0.26, comboT: -9,
  };
  const CROUCH_H = 1.1, CRAWL = 8 * 0.4125;   // geduckt passt Glappo unter 1,1 m hohe Durchgaenge
  function headBlocked(L, p) {
    for (const b of near(L, p[0], p[2])) {
      if (b.min[1] >= p[1] + PH || topAt(b, p[0], p[2]) <= p[1] + CROUCH_H + 0.02) continue;
      const nx = clamp(p[0], b.min[0], b.max[0]), nz = clamp(p[2], b.min[2], b.max[2]);
      if ((p[0] - nx) ** 2 + (p[2] - nz) ** 2 < R * R) return true;   // gleicher Radius wie die Wandkollision
    }
    return false;
  }
  let time = 0, mode = 'title', cur = null, uiCool = 0;
  let sunDone = false, blueTimer = 0, blueTick = 0;
  const levels = {};
  const towardZero = (v, d) => (v > 0 ? Math.max(0, v - d) : Math.min(0, v + d));

  function airborne(action, vy, speed) {
    pl.action = action; pl.vel[1] = vy; pl.speed = speed; pl.side = 0; pl.flip = 0;
    pl.grounded = false; pl.coyote = 0; pl.skid = false; pl.crouch = false; pl.jumpBuf = 0; pl.waterJump = false;
  }

  /* ─── Kantengriff: im Fallen an Kanten festhalten, hochziehen oder loslassen ─── */
  const NO_GRAB = new Set(['bound', 'exitdoor', 'portal', 'roof', 'citywall', 'awning', 'bouncy', 'mover', 'raft', 'piston',
    'fractal', 'hand', 'slider', 'carpet', 'rail', 'chute', 'tree', 'palm', 'sign', 'stem', 'gate', 'kbd', 'snowhat']);
  function columnClear(L, x, z, y0, y1, r) {
    for (const b of near(L, x, z)) {
      if (b.min[1] >= y1 || topAt(b, x, z) <= y0) continue;
      const cx = clamp(x, b.min[0], b.max[0]), cz = clamp(z, b.min[2], b.max[2]);
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
    }
    return true;
  }
  function tryLedgeGrab(L) {
    const p = pl.pos, fx = Math.sin(pl.face), fz = Math.cos(pl.face);
    let best = null;
    for (const b of near(L, p[0], p[2])) {
      if (b.slope || NO_GRAB.has(b.tag) || (b.tag || '').startsWith('key:')) continue;
      const top = b.max[1], rel = top - p[1];
      if (rel < 1.35 || rel > 2.3) continue;
      if (b.max[0] - b.min[0] < 0.6 && b.max[2] - b.min[2] < 0.6) continue;
      const nx = clamp(p[0], b.min[0], b.max[0]), nz = clamp(p[2], b.min[2], b.max[2]);
      let dx = p[0] - nx, dz = p[2] - nz;
      const d = Math.hypot(dx, dz);
      if (d > R + 0.3 || d < 1e-4) continue;
      dx /= d; dz /= d;
      if (-(fx * dx + fz * dz) < 0.5) continue;
      const ix = clamp(nx - dx * 0.5, b.min[0] + 0.05, b.max[0] - 0.05), iz = clamp(nz - dz * 0.5, b.min[2] + 0.05, b.max[2] - 0.05);
      if (!columnClear(L, ix, iz, top + 0.05, top + 1.2, 0.2)) continue;
      if (!columnClear(L, nx + dx * (R + 0.02), nz + dz * (R + 0.02), top - 1.95, top - 0.05, R * 0.6)) continue;
      if (!best || top < best.top) best = { b, top, n: [dx, 0, dz], nx, nz };
    }
    if (!best) return false;
    pl.action = 'hang'; pl.hangBox = best.b; pl.hangN = best.n; pl.hangT = 0;
    pl.pos = [best.nx + best.n[0] * (R + 0.02), best.top - 1.95, best.nz + best.n[2] * (R + 0.02)];
    pl.face = Math.atan2(-best.n[0], -best.n[2]);
    pl.vel = [0, 0, 0]; pl.speed = 0; pl.side = 0; pl.push = [0, 0, 0]; pl.flip = 0;
    pl.grounded = false; pl.waterJump = false; pl.squash = 0.9;
    Snd.grab(); rumble(0.25, 60);
    return true;
  }
  function dropLedge() {
    const n = pl.hangN || [0, 0, 0];
    pl.pos[0] += n[0] * 0.18; pl.pos[2] += n[2] * 0.18;
    pl.action = 'fall'; pl.vel = [0, 0, 0]; pl.speed = 0; pl.ledgeCool = 0.45; pl.hangBox = null;
  }
  function updateLedge(dt, inp, lock) {
    const b = pl.hangBox, n = pl.hangN, p = pl.pos, L = cur;
    if (!b || b.min[1] < -9000) { dropLedge(); return; }
    if (pl.action === 'hang') {
      pl.hangT += dt;
      if (lock) return;
      const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
      const wx = cy * inp.mx + sy * inp.my, wz = -sy * inp.mx + cy * inp.my;
      const toward = -(wx * n[0] + wz * n[2]);
      if (pl.hangT > 0.12 && (inp.jumpP || toward > 0.5)) {
        const top = b.max[1];
        const tx = clamp(p[0] - n[0] * (R + 0.55), b.min[0] + R * 0.5, b.max[0] - R * 0.5);
        const tz = clamp(p[2] - n[2] * (R + 0.55), b.min[2] + R * 0.5, b.max[2] - R * 0.5);
        if (!columnClear(L, tx, tz, top + 0.05, top + CROUCH_H, R * 0.8)) {
          if (inp.jumpP) Snd.deny();
          return;
        }
        pl.action = 'climb'; pl.climbK = 0; pl.climbDur = inp.jumpP ? 0.3 : 0.5;
        pl.climbFrom = p.slice(); pl.climbTo = [tx, top, tz];
        Snd.climb();
      } else if (inp.zP || (pl.hangT > 0.3 && toward < -0.6)) {
        dropLedge();
      }
      return;
    }
    pl.climbK = Math.min(1, pl.climbK + dt / pl.climbDur);
    const k = pl.climbK, up = smooth(Math.min(1, k / 0.6)), fwd = smooth(clamp((k - 0.45) / 0.55, 0, 1));
    p[1] = lerp(pl.climbFrom[1], pl.climbTo[1], up);
    p[0] = lerp(pl.climbFrom[0], pl.climbTo[0], fwd);
    p[2] = lerp(pl.climbFrom[2], pl.climbTo[2], fwd);
    if (k >= 1) {
      pl.action = 'ground'; pl.grounded = true; pl.groundBox = b; pl.hangBox = null;
      pl.vel = [0, 0, 0]; pl.speed = 0; pl.landT = time; pl.landFrom = 'climb'; pl.inWater = false; pl.squash = 0.85;
      // passt man stehend nicht hin, geht es geduckt weiter
      pl.h = columnClear(L, p[0], p[2], p[1] + 0.05, p[1] + PH, R * 0.7) ? PH : CROUCH_H;
    }
  }
  // Abprallen von Gegnern: mit gehaltenem Sprung hoeher
  function bounceOff(vyUnits) {
    const held = Input.st.lastJumpHeld;
    airborne(held ? 'jump' : 'bounce', (vyUnits ?? (held ? 50 : 30)) * UF, pl.speed);
    pl.holdGrace = 0;
  }

  function updatePlayer(dt, inp) {
    const L = cur, p = pl.pos, prevY = p[1];
    pl.invuln = Math.max(0, pl.invuln - dt);
    pl.hurtT = Math.max(0, pl.hurtT - dt);
    pl.punchT = Math.max(0, pl.punchT - dt);
    pl.frozen = Math.max(0, pl.frozen - dt);
    pl.jumpBuf = Math.max(0, pl.jumpBuf - dt);
    pl.holdGrace = Math.max(0, pl.holdGrace - dt);
    pl.knock = Math.max(0, pl.knock - dt);
    pl.boostCool = Math.max(0, pl.boostCool - dt);
    pl.ledgeCool = Math.max(0, pl.ledgeCool - dt);
    const lock = pl.dead || pl.hurtT > 0 || pl.frozen > 0 || pl.entering > 0 || pl.knock > 0;
    if (pl.action === 'hang' || pl.action === 'climb') { pl.carry = [0, 0]; updateLedge(dt, inp, lock); return; }
    const gbBefore = pl.grounded ? pl.groundBox : null;
    const water = pl.inWater;
    pl.looking = !lock && inp.look && pl.grounded && !inp.z;
    // Aufstehen geht nur, wenn ueber dem Kopf Platz ist
    pl.forceCrouch = pl.grounded && pl.h < PH && headBlocked(L, p);

    // Stick-Richtung relativ zur Kamera
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    const wx = cy * inp.mx + sy * inp.my, wz = -sy * inp.mx + cy * inp.my;
    let mag = Math.min(1, Math.hypot(wx, wz));
    if (lock || pl.looking || pl.action === 'pound') mag = 0;
    const moving = mag > 0.05;
    const intended = moving ? Math.atan2(wx, wz) : pl.face;
    const dYaw = angDiff(pl.face, intended);
    // Weitsprung-Fenster: Z-Druck am Boden merken (Z kurz vor A zaehlt auch, wenn Z schon wieder los ist)
    if (inp.zP && pl.grounded) pl.zDownT = time;
    // Leerlauf: wer lange nichts tut, dem wird langweilig (Umschauen, Strecken, ... Einschlafen)
    const busy = lock || moving || inp.jump || inp.action || inp.z || inp.look || !pl.grounded || pl.action !== 'ground' ||
      pl.crouch || pl.hold || water || pl.punchT > 0 || Math.abs(pl.speed) > 0.3;
    if (busy && pl.idleT > IDLE_SLEEP) Snd.blip();   // aufgewacht
    pl.idleT = busy ? 0 : (pl.idleT || 0) + dt;

    // In tiefem Wasser vom Grund abheben (ausser beim Tauchen mit Z)
    if (pl.grounded && water && pl.waterObj && p[1] < pl.waterObj.y - 1.75 && !inp.z) {
      pl.grounded = false; pl.groundBox = null; pl.vel[1] = 2.5; pl.action = 'swim';
    }
    // Rutschbahn: wer sie betritt, rutscht auf dem Bauch bergab
    const chute = pl.grounded && pl.groundBox ? pl.groundBox.chute : null;
    if (chute && pl.action !== 'slide' && !pl.dead) { pl.action = 'slide'; pl.skid = false; pl.crouch = false; }
    if (pl.grounded && pl.action === 'slide') {
      // Bauchrutscher: bremst langsam ab, leicht lenkbar; A = Abrollen nach vorn
      pl.side = 0; pl.crouch = false; pl.skid = false; pl.crawl = false;
      if (chute) {
        // bergab beschleunigen; der Stick lenkt quer zur Bahn
        const down = Math.atan2(chute[0], chute[1]);
        const lat = !lock && moving ? Math.sin(angDiff(down, intended)) * mag : 0;
        pl.face += clamp(angDiff(pl.face, down + lat * 0.75), -4.2 * dt, 4.2 * dt);
        pl.speed = Math.min(CHUTE_MAX, Math.max(pl.speed, 4) + CHUTE_ACC * dt);
      } else {
        if (!lock && moving) pl.face += clamp(dYaw, -1.8 * dt, 1.8 * dt);
        pl.speed = Math.max(0, pl.speed - (pl.groundBox && pl.groundBox.tag === 'ice' ? 3 : 12) * dt);
      }
      if (pl.speed > 2 && Math.random() < dt * 22) dust(p, 1);
      if (!lock && (inp.jumpP || pl.jumpBuf > 0)) {
        airborne('rollout', 11, Math.max(pl.speed * 0.85, 5)); Snd.jump(2); dust(p, 5);
      } else if (pl.speed < 0.8 && !chute) {
        pl.action = 'ground'; pl.frozen = Math.max(pl.frozen, 0.18); pl.squash = 0.8;
      }
    } else if (pl.grounded) {
      pl.side = 0;
      pl.crouch = ((!lock && inp.z) || pl.forceCrouch) && !water;
      const gtag = pl.groundBox ? pl.groundBox.tag : '';
      const icy = gtag === 'ice', fr = icy ? 0.16 : 1;
      const top = RUN * mag * (water ? 0.5 : 1);
      // Kehrtwende: Stick deutlich zurueck (> ~100°) bei Tempo -> rutschen
      if (!pl.crouch && !pl.skid && moving && Math.abs(dYaw) > 1.75 && pl.speed >= 16 * UF) pl.skid = true;
      pl.crawl = false;
      if (pl.skid) {
        pl.speed = Math.max(0, pl.speed - (icy ? 2.5 * UFF * fr : SKID_BRAKE) * dt);
        if (!moving || pl.crouch) pl.skid = false;
        else if (pl.speed <= 0.3) { pl.skid = false; pl.face = intended; }
      } else if (pl.crouch) {
        if (moving && !lock && Math.abs(pl.speed) <= CRAWL + 0.4) {
          // Krabbeln: langsam, geduckt, dreht gemaechlich
          pl.crawl = true;
          pl.face += clamp(dYaw, -TURN_RATE * 0.6 * dt, TURN_RATE * 0.6 * dt);
          pl.speed += clamp(CRAWL * mag - pl.speed, -14 * dt, 14 * dt);
        } else {
          pl.speed = towardZero(pl.speed, UFF * fr * dt);     // Hock-Rutscher rollt aus
        }
      } else if (moving) {
        // langsam dreht Glappo fast sofort, im vollen Lauf in engem Bogen
        const turn = icy ? TURN_RATE * 0.3 : TURN_RATE * (pl.speed < 4 ? 2.2 : 1);
        pl.face += clamp(dYaw, -turn * dt, turn * dt);
        if (icy) {
          if (pl.speed < top) pl.speed = Math.min(top, pl.speed + (1.1 * UFF - pl.speed * 30 / 43) * 0.35 * dt);
          else pl.speed = Math.max(top, pl.speed - UFF * fr * dt);
        } else if (pl.speed < top) pl.speed = Math.min(top, Math.max(0, pl.speed) + GROUND_ACC * dt);
        else pl.speed = Math.max(top, pl.speed - OVER_BRAKE * dt);
      } else {
        pl.speed = towardZero(pl.speed, (icy ? UFF * fr : GROUND_BRAKE) * dt);   // anhalten (auf Eis rutscht es weiter)
      }

      // Springen vom Boden — auch ein Druck kurz vor der Landung zaehlt
      if (!lock && (inp.jumpP || pl.jumpBuf > 0)) {
        if (!inp.jumpP) pl.holdGrace = 0.3;                   // gepuffert: nicht als "losgelassen" werten
        const f = Math.max(0, pl.speed) / UF;                 // Tempo in E/F
        const chain = time - pl.landT <= CHAIN_WINDOW ? pl.landFrom : '';
        const wantLong = (pl.crouch || time - (pl.zDownT ?? -9) < LONG_WINDOW) && pl.speed >= 10 * UF;
        pl.jumpT = time; pl.jumpSpeed = Math.max(0, pl.speed);
        if (water) {
          airborne('jump', 13, pl.speed); pl.waterJump = true; Snd.splash();
        } else if (pl.skid) {
          pl.face = intended; airborne('sideflip', 62 * UF, 8 * UF); Snd.jump(3);
        } else if (wantLong) {
          airborne('long', 30 * UF, Math.min(pl.speed * 1.5, 48 * UF)); Snd.jump(2);
        } else if (pl.crouch && Math.abs(pl.speed) < 1.5) {
          airborne('backflip', 62 * UF, -16 * UF); Snd.jump(3);
        } else if (chain === 'double' && pl.speed > 20 * UF) {
          airborne('triple', 69 * UF, pl.speed * 0.8); Snd.jump(3);
        } else if (chain === 'jump' || chain === 'fall' || chain === 'sideflip') {
          airborne('double', (52 + 0.25 * f) * UF, pl.speed * 0.8); Snd.jump(2); jumpRing(p);
        } else {
          airborne('jump', (42 + 0.25 * f) * UF, pl.speed * 0.8); Snd.jump(1);
        }
        if (!water) dust(p, 5);
      }
    } else if (water && !pl.waterJump && pl.waterObj) {
      // ── Schwimmen: lenken, Zug mit A, Z taucht, an der Oberflaeche treiben ──
      pl.skid = false; pl.crouch = false;
      if (pl.action !== 'swim') { pl.action = 'swim'; pl.flip = 0; pl.side = 0; }
      const surfY = pl.waterObj.y - 1.45;
      if (!lock) pl.face += clamp(dYaw, -3.6 * dt, 3.6 * dt);
      const want = moving && !lock ? 4.8 * mag : 0;
      if (pl.speed > 4.8) pl.speed = Math.max(want, pl.speed - 3.2 * dt);
      else pl.speed += clamp(want - pl.speed, -4 * dt, 5 * dt);
      pl.side = 0;
      const atSurface = p[1] > surfY - 0.45;
      let acc;
      if (!lock && inp.z) acc = -11 - pl.vel[1] * 2.5;
      else if (!lock && inp.jump && !atSurface) acc = 10 - pl.vel[1] * 2.5;
      else acc = clamp((surfY - p[1]) * 10, -12, 12) - pl.vel[1] * 3.2;
      pl.vel[1] += acc * dt;
      if (!lock && inp.jumpP) {
        if (atSurface) {
          // kraeftiger Sprung aus dem Wasser
          airborne('jump', 14.5, Math.max(pl.speed, 3) * 0.9); pl.waterJump = true;
          Snd.splash(); Snd.jump(2);
          burst([p[0], pl.waterObj.y, p[2]], 16, { spread: 4, up: 6, upRand: 3, life: .7, size: .2, cols: [[.75, .9, 1], [1, 1, 1]], grav: 16 });
        } else {
          pl.vel[1] = Math.max(pl.vel[1], 3.5); pl.speed = Math.min(pl.speed + 2.6, 7.5);
          pl.strokeT = clock; Snd.stroke();
          burst([p[0], p[1] + 1.4, p[2]], 6, { spread: 1, up: 1.5, upRand: 1.5, life: .9, size: .12, cols: [[.85, .95, 1]], grav: -3 });
        }
      }
      pl.swimPh += dt * (2.4 + pl.speed * 1.2);
      if (atSurface && pl.speed > 1.5 && Math.random() < dt * 10) {
        burst([p[0] + Math.sin(pl.face) * 0.6, pl.waterObj.y + 0.05, p[2] + Math.cos(pl.face) * 0.6], 2, { spread: 1.5, up: 0.8, life: .5, size: .16, cols: [[.9, .97, 1]], grav: 3 });
      } else if (!atSurface && Math.random() < dt * 3) {
        burst([p[0], p[1] + 1.8, p[2]], 1, { spread: 0.3, up: 1.2, life: 1.2, size: .1, cols: [[.85, .95, 1]], grav: -2 });
      }
    } else {
      pl.skid = false; pl.crouch = false;
      if (pl.waterJump && water && pl.vel[1] < 0) pl.waterJump = false;
      if (pl.action === 'pound') {
        pl.pound += dt; pl.speed = 0; pl.side = 0;
        pl.vel[1] = pl.pound < 0.3 ? 0 : -50 * UF;
      } else {
        // Luftsteuerung: vor/zurueck beschleunigen, seitlich driften und sanft in Stickrichtung drehen.
        // Ohne Stick bremst es spuerbar (nur Weitsprung/Hechtsprung behalten ihren Schwung).
        const keep = pl.action === 'long' || pl.action === 'dive' || pl.action === 'bounce';
        pl.speed = towardZero(pl.speed, (moving || keep ? 0.35 * UFF : 10) * dt);
        pl.side = 0;
        if (moving && !lock && pl.action !== 'knock' && pl.action !== 'bonk' && pl.action !== 'dive') {
          if (pl.action !== 'long') pl.face += clamp(dYaw, -3.2 * dt, 3.2 * dt);
          const dY = angDiff(pl.face, intended);
          pl.speed += 2.3 * UFF * Math.cos(dY) * mag * dt;
          pl.side = Math.sin(dY) * mag * 16 * UF;
        }
        if (pl.speed > (pl.action === 'long' || pl.action === 'dive' ? LONG_DRAG : AIR_DRAG)) pl.speed -= UFF * dt;
        if (pl.speed < -16 * UF) pl.speed += 2 * UFF * dt;
        // A losgelassen, waehrend es noch schnell nach oben geht: Sprung kappen
        if ((pl.action === 'jump' || pl.action === 'double') && !inp.jump && pl.holdGrace <= 0 && pl.vel[1] > 20 * UF) pl.vel[1] /= 4;
      }
      if (!lock && inp.jumpP && !water) {
        if (time - pl.wallT < 0.2 && pl.wall && pl.action !== 'pound') {
          const n = pl.wall;
          pl.face = Math.atan2(n[0], n[2]);
          airborne('wallkick', 62 * UF, 24 * UF);
          pl.wallT = -9;
          Snd.jump(2); dust([p[0] - n[0] * R, p[1] + 1, p[2] - n[2] * R], 6); rumble(0.25, 60);
        } else if (pl.coyote > 0) {
          airborne('jump', (42 + 0.25 * Math.max(0, pl.speed) / UF) * UF, pl.speed * 0.8); Snd.jump(1);
        } else {
          pl.jumpBuf = 0.1;
        }
      }
      if (!lock && (inp.zP || inp.lookP) && pl.action !== 'pound' && !water) {
        const since = time - (pl.jumpT ?? -9), fresh = since < LONG_WINDOW && ['jump', 'double', 'triple'].includes(pl.action);
        if (fresh && inp.zP && pl.action !== 'triple' && pl.jumpSpeed >= 10 * UF) {
          // Z kam einen Tick nach A: gemeint war ein Weitsprung, kein Stampfer
          airborne('long', 30 * UF, Math.min(pl.jumpSpeed * 1.5, 48 * UF)); Snd.jump(2);
        } else if (!fresh) {
          pl.action = 'pound'; pl.pound = 0; pl.speed = 0; pl.side = 0; pl.vel[1] = 0;
          Snd.press();
        }
      }
    }
    // Schwerkraft
    if (!pl.grounded && pl.action !== 'pound' && pl.action !== 'swim') {
      pl.vel[1] = Math.max(pl.vel[1] - GRAV * (water ? 0.55 : 1) * dt, water ? -8 : -TERMINAL);
    }
    if (pl.action === 'swim') pl.vel[1] = clamp(pl.vel[1], -5, 6);

    // Bewegen + Kollision
    const sf = Math.sin(pl.face), cf = Math.cos(pl.face);
    const vx = sf * pl.speed + cf * pl.side + pl.push[0] + pl.carry[0], vz = cf * pl.speed - sf * pl.side + pl.push[2] + pl.carry[1];
    const kd = Math.pow(0.02, dt); pl.push[0] *= kd; pl.push[2] *= kd;
    p[0] += vx * dt; p[2] += vz * dt; p[1] += pl.vel[1] * dt;
    pl.h = pl.grounded && (pl.crouch || pl.action === 'slide') ? CROUCH_H : PH;
    const hit = pushOut(L, p, R, pl.h, Math.max(prevY, p[1]) + (pl.grounded ? STEP_UP : 0.15));
    if (hit && chute && pl.action === 'slide') {
      // An der Bande der Rutschbahn entlanggleiten statt abprallen
      const n = hit.n, fx = Math.sin(pl.face), fz = Math.cos(pl.face), d = fx * n[0] + fz * n[2];
      if (d < 0) { pl.face = Math.atan2(fx - n[0] * d * 1.15, fz - n[2] * d * 1.15); pl.speed *= 1 + d * 0.25; }
    } else if (hit) {
      const into = -(vx * hit.n[0] + vz * hit.n[2]);
      onWallHit(hit, into);
      // In der Luft gegen eine hohe Wand
      if (!pl.grounded && !pl.entering && hit.b.max[1] > p[1] + 1.2 && pl.action !== 'pound' && pl.action !== 'bonk' && into > 8 * UF) {
        pl.wall = hit.n; pl.wallT = time;          // Wandsprung-Fenster geht auf
        if (into > 16 * UF || pl.action === 'long' || pl.action === 'dive') {
          // BONK: mit Wucht dagegen -> abprallen, Sternchen sehen, hinfallen
          pl.face = Math.atan2(-hit.n[0], -hit.n[2]);
          pl.action = 'bonk'; pl.speed = -Math.max(5, into * 0.45); pl.side = 0; pl.flip = 0;
          pl.vel[1] = Math.min(pl.vel[1], 4);
          Snd.bonk(); rumble(0.6, 160); cam.shake = Math.max(cam.shake, 0.25);
          burst([p[0] - hit.n[0] * R, p[1] + 1.7, p[2] - hit.n[2] * R], 10, { spread: 3, up: 3, upRand: 2, life: .6, size: .16, cols: [[1, .95, .3], [1, 1, 1]], grav: 4 });
        } else {
          pl.speed = Math.min(pl.speed, 0); pl.side = 0;   // langsam: nur abrutschen
        }
      } else if (pl.grounded && pl.action === 'slide' && into > 5 && hit.b.max[1] > p[1] + 0.8) {
        // Bauchrutscher gegen die Wand: kurzer Aufprall, Sternchen, kurz benommen
        pl.face = Math.atan2(-hit.n[0], -hit.n[2]);
        pl.action = 'ground'; pl.speed = -3; pl.side = 0; pl.frozen = Math.max(pl.frozen, 0.45); pl.squash = 0.7;
        Snd.bonk(); rumble(0.4, 120); cam.shake = Math.max(cam.shake, 0.18);
        burst([p[0] - hit.n[0] * R, p[1] + 0.9, p[2] - hit.n[2] * R], 8, { spread: 3, up: 3, upRand: 2, life: .5, size: .14, cols: [[1, .95, .3], [1, 1, 1]], grav: 4 });
      }
    }
    if (pl.vel[1] > 0) {
      for (const b of near(L, p[0], p[2])) {
        if (b.min[1] < prevY + pl.h - 0.05 || b.min[1] > p[1] + pl.h) continue;
        const nx = clamp(p[0], b.min[0], b.max[0]), nz = clamp(p[2], b.min[2], b.max[2]);
        if ((p[0] - nx) ** 2 + (p[2] - nz) ** 2 > (R * 0.7) ** 2) continue;
        p[1] = b.min[1] - pl.h; pl.vel[1] = 0;
        Snd.stomp();
        break;
      }
    }
    let gy = -Infinity, gb = null;
    const reach = Math.max(prevY, p[1]) + (pl.grounded ? STEP_UP : 0.05);
    for (const b of near(L, p[0], p[2])) {
      if (b.min[1] > reach) continue;
      const nx = clamp(p[0], b.min[0], b.max[0]), nz = clamp(p[2], b.min[2], b.max[2]);
      if ((p[0] - nx) ** 2 + (p[2] - nz) ** 2 > (R * 0.75) ** 2) continue;
      const t = b.slope ? topAt(b, p[0], p[2]) : b.max[1];
      if (t <= reach && t > gy) { gy = t; gb = b; }
    }
    const was = pl.grounded;
    if (pl.vel[1] <= 0 && gy > -Infinity && p[1] <= gy + (was ? 0.5 : 0.001)) {
      const impact = pl.vel[1];
      p[1] = gy; pl.vel[1] = 0; pl.grounded = true; pl.groundBox = gb;
      if (!was) onLand(gb, impact);
    } else {
      if (was) { pl.coyote = 0.06; pl.action = 'fall'; }
      pl.grounded = false; pl.groundBox = null;
    }
    pl.coyote = Math.max(0, pl.coyote - dt);
    // Wer von einer fahrenden Plattform abspringt oder herunterfaellt, behaelt ihren Schwung
    if (pl.grounded) pl.carry = [0, 0];
    else if (gbBefore && gbBefore.mover) pl.carry = [gbBefore.mover.vel[0], gbBefore.mover.vel[2]];

    // Laufband + Schwungpfeile
    if (pl.grounded && pl.groundBox) {
      const gb2 = pl.groundBox;
      if (gb2.tag === 'conveyor') { p[0] += gb2.dir[0] * dt; p[2] += gb2.dir[1] * dt; }
      if (gb2.tag === 'boost' && pl.boostCool <= 0 && !lock) {
        pl.face = Math.atan2(gb2.dir[0], gb2.dir[1]); pl.speed = Math.max(pl.speed, 28); pl.skid = false;
        pl.boostCool = 0.35; Snd.whoosh(); rumble(0.3, 120);
        burst([p[0], p[1] + 0.3, p[2]], 8, { spread: 2, up: 1, life: .4, size: .2, cols: [[.3, 1, 1], [1, .3, .9]], grav: 0 });
      }
      if (gb2.tag === 'lava' && !pl.dead) burnPlayer();
    }

    // Wasserflaechen
    let inside = null;
    for (const w of L.waters) {
      if (p[0] > w.x0 && p[0] < w.x1 && p[2] > w.z0 && p[2] < w.z1 && p[1] < w.y) { inside = w; break; }
    }
    if (inside && !pl.inWater) {
      Snd.splash();
      burst([p[0], inside.y, p[2]], 12, { spread: 4, up: 5, upRand: 3, life: .6, size: .2, cols: [[.7, .85, 1], [1, 1, 1]], grav: 16 });
    }
    pl.inWater = !!inside;
    if (inside) pl.waterObj = inside;
    else if (pl.action === 'swim') pl.action = 'fall';
    if (!pl.grounded && pl.ledgeCool <= 0 && !lock && !pl.entering
        && (pl.vel[1] <= 1.5 || pl.action === 'swim') && !['pound', 'bonk', 'knock', 'long', 'dive'].includes(pl.action)
        && (pl.action !== 'swim' || moving)) {
      if (tryLedgeGrab(L)) return;
    }
    if (p[1] < (L.voidY ?? -25)) { hurtPlayer(2, p); respawn(); }

    // Animation
    pl.walk += dt * (pl.grounded ? Math.abs(pl.speed) * 1.1 : 0);
    pl.squash += ((pl.crouch ? 0.7 : 1) - pl.squash) * Math.min(1, dt * 12);
    const flipRate = { triple: 9, backflip: 8, sideflip: 9, rollout: 11 }[pl.action];
    // Rutschen gegen eine Wand: abrupt stoppen (ausser in der Rutschbahn)
    if (pl.grounded && pl.action === 'slide' && !chute && hit && hit.b.max[1] > p[1] + 0.6) {
      pl.speed = 0; pl.action = 'ground'; pl.frozen = Math.max(pl.frozen, 0.25); Snd.stomp(); cam.shake = Math.max(cam.shake, 0.15);
    }
    if (flipRate) pl.flip = Math.min(TAU, pl.flip + dt * flipRate);
  }

  function onLand(gb, impact) {
    const from = pl.action;
    pl.waterJump = false;
    pl.landT = time; pl.landFrom = from;
    pl.action = 'ground'; pl.flip = 0;
    pl.squash = impact < -20 ? 0.62 : 0.8;
    if (from === 'pound') {
      cam.shake = 0.35; rumble(0.6, 160); Snd.stomp();
      burst([pl.pos[0], pl.pos[1] + .1, pl.pos[2]], 14, { spread: 6, up: 1.5, upRand: 1, life: .5, size: .3, cols: [[.96, .94, .86]], grav: 2 });
      for (const e of cur.enemies) {
        if (dist2D(e.pos, pl.pos) < 2.8 && Math.abs(e.pos[1] - pl.pos[1]) < 1.6) {
          if (e.type === 'grummel') squashGrummel(e);
          if (e.type === 'hopper') defeat(e);
          if (e.type === 'spiky' && e.state === 'walk') hurtPlayer(2, e.pos, true);
          if (e.type === 'bomb' && e.state !== 'gone') e.state = 'lit', e.t = Math.min(e.t || 9, 0.3);
        }
      }
    } else if (from === 'dive') {
      // Hechtsprung endet im Bauchrutscher
      pl.action = 'slide'; pl.squash = 0.75;
      dust(pl.pos, 7); Snd.stomp();
    } else if (from === 'bonk') {
      // nach dem Bonk kurz auf dem Hosenboden liegen
      pl.knock = 0.55; pl.speed = 0; pl.squash = 0.6;
      dust(pl.pos, 8); Snd.stomp();
    } else if (impact < -14) {
      dust(pl.pos, 6);
    }
    if (gb && gb.tag === 'switch') pressSwitch();
    // Markisen, Seerosen, Pilze ... federn wie ein Trampolin
    if (gb && (gb.tag === 'awning' || gb.tag === 'bouncy')) {
      const power = gb.bounce || 75;
      airborne('bounce', (from === 'pound' ? power + 10 : power) * UF, pl.speed);
      pl.squash = 0.6; pl.knock = 0;
      Snd.boing(); rumble(0.2, 80);
    }
    if (gb && cur.onLand) cur.onLand(gb, from);
  }

  function onWallHit(hit, into) {
    const L = cur, p = pl.pos;
    if (pl.dead || pl.entering) return;
    // Burgtor / Hallentuer: reinlaufen reicht
    if (into > 3 && pl.grounded && ((hit.b.tag === 'keep' && Math.abs(p[0]) < 2.3 && p[1] < 1 && p[2] > -39) || hit.b.tag === 'exitdoor')) {
      useDoor();
      return;
    }
    if (into > 3 && pl.grounded && hit.b.door) { useDoor(hit.b.door); return; }
    if (into > 3 && pl.grounded && hit.b.tag === 'stardoor' && state.doorOpen && L.starDoor && L.starDoor.open >= 1) { useStarDoor(); return; }
    // Ins Gemaelde springen
    if (L.paintings && !pl.grounded && into > 1.5) {
      const mid = p[1] + 1.1;
      for (const pt of L.paintings) {
        const s = pt.scale || 1;
        if (pt.wallTag !== hit.b.tag || Math.abs(paintAlong(pt, p)) > 2.7 * s || mid < pt.y - 2.6 * s || mid > pt.y + 2.6 * s) continue;
        enterPainting(pt, p, mid);
        return;
      }
    }
  }
  // Gemaelde liegen an Seitenwaenden (entlang z) oder an der Galerie-Front (entlang x)
  const paintAlong = (pt, p) => (pt.axis === 'x' ? p[0] - pt.x : p[2] - pt.z);
  const paintAway = (pt, p) => (pt.axis === 'x' ? Math.abs(p[2] - pt.z) : Math.abs(p[0] - pt.x));
  const paintLocalX = (pt, p) => (pt.axis === 'x' ? p[0] - pt.x : pt.wallTag === 'wallL' ? -(p[2] - pt.z) : p[2] - pt.z) / (pt.scale || 1);

  function hurtPlayer(n, from, strong) {
    if (pl.invuln > 0 || pl.dead) return;
    if (pl.hold) dropHold(false);
    run.health = Math.max(0, run.health - n);
    pl.invuln = 1.6; pl.hurtT = 0.45; pl.action = 'knock'; pl.skid = false; pl.crouch = false; pl.side = 0;
    const dx = pl.pos[0] - from[0], dz = pl.pos[2] - from[2], d = Math.hypot(dx, dz) || 1;
    const f = strong ? 14 : 8;
    pl.push = [dx / d * f, 0, dz / d * f]; pl.vel[1] = strong ? 13 : 8; pl.grounded = false; pl.speed = 0;
    Snd.hurt(); rumble(strong ? 1 : 0.7, strong ? 400 : 220); Power.render(true);
    if (run.health <= 0) loseLife();
  }
  // Heisser Boden (Lava, Laser): Aua, und hoch in die Luft — in der Luft darf man zurueck lenken
  function burnPlayer() {
    const p = pl.pos;
    if (pl.invuln <= 0) hurtPlayer(3, [p[0] - Math.sin(pl.face), p[1], p[2] - Math.cos(pl.face)]);
    if (pl.dead) return;
    pl.action = 'fall'; pl.grounded = false; pl.groundBox = null; pl.vel[1] = 19; pl.speed = 0; pl.push = [0, 0, 0];
    Snd.burn(); rumble(0.7, 200);
    burst([p[0], p[1] + 0.3, p[2]], 16, { spread: 3, up: 5, upRand: 3, life: .6, size: .25, cols: [[1, .5, .1], [1, .85, .2], [.3, .3, .3]], grav: 4 });
  }
  function loseLife() {
    pl.dead = true;
    run.lives = Math.max(0, run.lives - 1);
    renderHud('lives');
    setTimeout(() => {
      mode = 'iris';
      Iris.close(null, null, 700).then(() => {
        run.health = 8; Power.render();
        pl.dead = false; pl.invuln = 1;
        respawn();
        return Iris.open(null, null, 600);
      }).then(() => {
        mode = 'play';
        if (run.lives > 0) {
          Dialog.show('Wolki', [`Autsch! Ein Leben weg – du hast noch ${run.lives}.`]);
        } else {
          run.lives = 4; renderHud('lives');
          Dialog.show('Wolki', ['GAME OVER … aber Wolki hat ein Herz.', 'Hier sind 4 neue Leben. Nicht verraten!']);
        }
      });
    }, 900);
  }
  function respawn() {
    const L = cur;
    if (pl.hold) { pl.hold.held = false; pl.hold.state = 'walk'; pl.hold.t = 0; pl.hold = null; }
    pl.pos = (L.respawnAt || L.spawn).slice(); pl.vel = [0, 0, 0]; pl.push = [0, 0, 0]; pl.speed = 0; pl.carry = [0, 0];
    pl.face = L.spawnFace; cam.yaw = L.spawnYaw; cam.snap = true;
    pl.grounded = true; pl.action = 'ground'; pl.flip = 0; pl.side = 0; pl.skid = false; pl.inWater = false;
    pl.waterJump = false; pl.hangBox = null; pl.knock = 0;
  }

  /* ═══════════ Muenzen, Sterne, Schalter ═══════════ */
  function collectCoin(L, c) {
    c.taken = true;
    sparkle(c.pos);
    if (c.kind === 'red') {
      run.red++;
      Snd.red(run.red);
      popNumber(c.pos, run.red);
      if (run.red === 8) {
        setTimeout(() => {
          spawnStar('red', levels.garden, [levels.garden.marker[0], 2.4, levels.garden.marker[2]]);
          Dialog.show('Wolki', ['Alle 8 roten Münzen! Über der Sternmarke mitten im Garten ist ein Stern erschienen.']);
        }, 700);
      }
    } else if (c.kind === 'blue') Snd.blue();
    else Snd.coin();
    addCoins(c.kind === 'red' ? 2 : c.kind === 'blue' ? 5 : 1);
  }
  function addCoins(n) {
    const before = run.coins;
    run.coins += n;
    if (run.health < 8) { run.health = Math.min(8, run.health + n); Power.render(); }
    renderHud('coins');
    if (before < 50 && run.coins >= 50) {
      const p = pl.pos;
      setTimeout(() => spawnStar('coins', cur, [p[0] + Math.sin(pl.face) * 2.5, p[1] + 2.8, p[2] + Math.cos(pl.face) * 2.5]), 400);
    }
  }
  function spawnStar(id, L, pos) {
    if (L.stars.some((s) => s.id === id && !s.gone)) return;
    L.stars.push({ id, pos: pos.slice(), y0: pos[1], t: 0, ghost: !!state.stars[id], gone: false });
    if (L === cur) Snd.starAppear();
  }
  function collectStar(L, s) {
    s.gone = true;
    const isNew = !state.stars[s.id];
    state.stars[s.id] = true; save();
    renderHud('stars');
    mode = 'starget';
    // Schrift Buchstabe fuer Buchstabe (jeder ploppt versetzt auf und wippt danach)
    const txt = isNew ? 'DU HAST EINEN STERN!' : 'DEN HAST DU SCHON!', tEl = $('#starGetText');
    tEl.setAttribute('aria-label', txt);
    tEl.replaceChildren(...[...txt].map((ch, i) => {
      const sp = document.createElement('span');
      sp.textContent = ch === ' ' ? ' ' : ch; sp.style.setProperty('--d', (0.35 + i * 0.035).toFixed(3) + 's'); sp.setAttribute('aria-hidden', 'true');
      return sp;
    }));
    $('#starGetName').textContent = STARS[s.id].name;
    StarFx.start(s.pos, isNew);
    Snd.starGet(); rumble(0.5, 300);
    pl.speed = 0;
    setTimeout(() => {
      $('#starGet').hidden = true;
      if (mode === 'starget') mode = 'play';
      if (!isNew) return;
      const n = starCount();
      let lines;
      if (n >= STAR_TOTAL) lines = ['ALLE STERNE! Du hast wirklich jeden Winkel gefunden.'].concat(state.doorOpen ? [] : ['Die Sterntür oben auf der Galerie wartet auf dich.']);
      else if (n === 4) lines = ['WAHNSINN! Das war der vierte Stern!', 'Die Sterntür oben auf der Galerie der Schlosshalle lässt sich jetzt öffnen.'];
      else lines = [`Stern Nummer ${n}!` + (n < 4 ? ` Noch ${4 - n}, dann gibt die Sterntür nach.` : '')];
      Dialog.show('Wolki', lines);
    }, StarFx.DUR * 1000);
  }
  function pressSwitch() {
    const sw = cur.blueSwitch;
    if (!sw || sw.pressed) return;
    const blues = cur.coins.filter((c) => c.kind === 'blue');
    if (blues.every((c) => c.taken)) return;
    sw.pressed = true; sw.solid.max[1] = 0.15;
    Snd.press(); rumble(0.3, 80);
    blues.forEach((c) => { if (!c.taken) { c.hidden = false; sparkle(c.pos); } });
    blueTimer = 12; blueTick = 0;
  }
  function updateSwitch(dt) {
    const L = levels.garden, sw = L.blueSwitch;
    if (blueTimer <= 0) return;
    blueTimer -= dt; blueTick -= dt;
    if (blueTick <= 0) { blueTick = blueTimer < 3 ? 0.25 : 0.5; if (cur === L) Snd.tick(blueTimer < 3); }
    const blues = L.coins.filter((c) => c.kind === 'blue');
    if (blueTimer <= 0 || blues.every((c) => c.taken)) {
      blueTimer = 0;
      blues.forEach((c) => { if (!c.taken) c.hidden = true; });
      setTimeout(() => { if (!blues.every((c) => c.taken)) { sw.pressed = false; sw.solid.max[1] = 0.6; } }, 1500);
    }
  }

  /* ═══════════ Gegner-Logik ═══════════ */
  function wanderTo(e, dt, speed) {
    e.wander -= dt;
    const hx = e.home[0] - e.pos[0], hz = e.home[1] - e.pos[2];
    if (Math.hypot(hx, hz) > 8) e.targetFace = Math.atan2(hx, hz);
    else if (e.wander <= 0) { e.wander = 1.5 + Math.random() * 2.5; e.targetFace = Math.random() * TAU; }
    if (e.targetFace != null) e.face += clamp(angDiff(e.face, e.targetFace), -2 * dt, 2 * dt);
    e.speed = speed;
  }
  function moveEntity(e, dt, r) {
    const L = cur;
    const nx = e.pos[0] + Math.sin(e.face) * e.speed * dt, nz = e.pos[2] + Math.cos(e.face) * e.speed * dt;
    const gy = groundAt(L, nx, nz, e.pos[1] + 0.6, 0.2);
    if (gy < e.pos[1] - 1) { e.targetFace = e.face + Math.PI; e.face += Math.PI * dt * 4; return; }   // Kante: umdrehen
    e.pos[0] = nx; e.pos[2] = nz;
    const hit = pushOut(L, e.pos, r, 1.3, e.pos[1] + 0.6);
    if (hit) e.targetFace = Math.atan2(hit.n[0], hit.n[2]) + (Math.random() - 0.5);
    const g2 = groundAt(L, e.pos[0], e.pos[2], e.pos[1] + 0.6, 0.2);
    if (g2 > -Infinity) e.pos[1] = g2;
  }
  /* ─── Knallkisten tragen: aufheben (Hechtsprung oder Aktionstaste), ueber dem Kopf
     halten, werfen oder absetzen. Der Zuender laeuft dabei weiter — zu langes Halten knallt. ─── */
  function canPick(e) { return e && e.type === 'bomb' && e.state !== 'gone' && !e.held && (e.thrown || 0) <= 0; }
  function bombInReach() {
    if (pl.hold || pl.dead || pl.entering) return null;
    let best = null, bd = 2.8;
    for (const e of cur.enemies) {
      if (!canPick(e)) continue;
      const d = dist2D(e.pos, pl.pos);
      if (d < bd && Math.abs(e.pos[1] - pl.pos[1]) < 1.8) { bd = d; best = e; }
    }
    return best;
  }
  function pickUp(e) {
    if (!canPick(e) || pl.hold) return;
    pl.hold = e; e.held = true; e.speed = 0; e.targetFace = null;
    if (e.state === 'walk') { e.state = 'lit'; e.t = 3.6; } else e.t = Math.max(e.t, 2.2);
    Snd.grab(); Snd.fuse(); rumble(0.2, 60);
  }
  function throwHold() {
    const e = pl.hold;
    if (!e) return;
    pl.hold = null; e.held = false;
    e.face = pl.face;
    e.speed = 16 + Math.max(0, pl.speed) * 0.45;
    e.vy = 7.5 + Math.max(0, pl.vel[1]) * 0.3;
    e.thrown = 1.6;
    e.t = Math.min(e.t, 1.6);
    pl.punchT = 0; pl.punchN = 0;
    Snd.whoosh();
  }
  function dropHold(soft) {
    const e = pl.hold;
    if (!e) return;
    pl.hold = null; e.held = false; e.thrown = 0; e.speed = 0;
    const d = soft ? 1.1 : 0.6;
    e.pos[0] = pl.pos[0] + Math.sin(pl.face) * d;
    e.pos[2] = pl.pos[2] + Math.cos(pl.face) * d;
    const gy = groundAt(cur, e.pos[0], e.pos[2], e.pos[1] + 1, 0.3);
    e.pos[1] = gy === -Infinity ? pl.pos[1] : gy;
    Snd.stomp();
  }
  function squashGrummel(e) {
    if (e.state !== 'walk') return;
    e.state = 'squash'; e.t = 0.6;
    Snd.stomp(); rumble(0.3, 80);
    sparkle([e.pos[0], e.pos[1] + 1, e.pos[2]]);
    setTimeout(() => { Snd.coin(); addCoins(1); }, 120);
  }
  function updGrummel(e, dt) {
    if (e.state === 'dead') { e.t -= dt; if (e.t <= 0) { e.state = 'walk'; e.pos = [e.home[0], groundAt(cur, e.home[0], e.home[1], e.fromY ?? 50), e.home[1]]; } return; }
    if (e.state === 'squash') { e.t -= dt; if (e.t <= 0) { e.state = 'dead'; e.t = 9; } return; }
    const p = pl.pos, dx = p[0] - e.pos[0], dz = p[2] - e.pos[2], d = Math.hypot(dx, dz), dy = p[1] - e.pos[1];
    if (d < 9 && Math.abs(dy) < 3 && !pl.dead) {
      e.face += clamp(angDiff(e.face, Math.atan2(dx, dz)), -3 * dt, 3 * dt);
      e.speed = 3.4;
    } else wanderTo(e, dt, 1.6);
    moveEntity(e, dt, 0.8);
    e.anim += dt * e.speed * 3;
    if (d < R + 0.8 && dy > -1.4 && dy < 1.6 && !pl.dead) {
      if (pl.action === 'dive' || pl.action === 'slide' || pl.action === 'rollout') {
        squashGrummel(e); cam.shake = Math.max(cam.shake, 0.15);
      } else if ((pl.vel[1] < -1 && dy > 0.55) || pl.action === 'pound') {
        squashGrummel(e);
        bounceOff();
      } else hurtPlayer(1, e.pos);
    }
  }
  function updBomb(e, dt) {
    if (e.state === 'gone') { e.t -= dt; if (e.t <= 0) { e.state = 'walk'; e.pos = [e.home[0], groundAt(cur, e.home[0], e.home[1], e.fromY ?? 50), e.home[1]]; } return; }
    if (e.held) {                                   // ueber dem Kopf getragen
      e.pos[0] = pl.pos[0] + Math.sin(pl.face) * 0.08;
      e.pos[1] = pl.pos[1] + (pl.crawl ? 1.1 : 1.95);
      e.pos[2] = pl.pos[2] + Math.cos(pl.face) * 0.08;
      e.face = pl.face; e.speed = 0; e.anim += dt * 5;
      e.t -= dt;
      if (e.t <= 0) { pl.hold = null; e.held = false; explode(e); }
      return;
    }
    if (e.thrown > 0) {                             // geworfen: fliegt im Bogen und knallt beim Aufschlag
      e.thrown -= dt; e.t -= dt; e.anim += dt * 9;
      e.vy -= 34 * dt;
      const nx = e.pos[0] + Math.sin(e.face) * e.speed * dt, nz = e.pos[2] + Math.cos(e.face) * e.speed * dt;
      const ny = e.pos[1] + e.vy * dt;
      const gy = groundAt(cur, nx, nz, Math.max(e.pos[1], ny) + 0.8, 0.25);
      const wall = pushOut(cur, [nx, ny, nz], 0.55, 1.1, ny + 0.5);
      const hitEnemy = cur.enemies.some((o) => o !== e && o.state !== 'gone' && o.state !== 'dead' && dist2D(o.pos, [nx, 0, nz]) < 1.3 && Math.abs(o.pos[1] - ny) < 1.6);
      e.pos[0] = nx; e.pos[2] = nz; e.pos[1] = ny;
      if (gy > -Infinity && ny <= gy + 0.05) { e.pos[1] = gy; explode(e); return; }
      if (wall || hitEnemy || e.thrown <= 0 || e.t <= 0) { explode(e); return; }
      return;
    }
    const p = pl.pos, dx = p[0] - e.pos[0], dz = p[2] - e.pos[2], d = Math.hypot(dx, dz), dy = p[1] - e.pos[1];
    if (e.state === 'walk') {
      wanderTo(e, dt, 1.2);
      if (d < 6.5 && Math.abs(dy) < 3 && !pl.dead) { e.state = 'lit'; e.t = 2.6; Snd.fuse(); }
    } else {
      e.t -= dt;
      e.face += clamp(angDiff(e.face, Math.atan2(dx, dz)), -4 * dt, 4 * dt);
      e.speed = d > 1.3 ? 4.3 : 0;
      if (e.t <= 0) { explode(e); return; }
    }
    moveEntity(e, dt, 0.8);
    e.anim += dt * (e.speed + 1) * 3;
    if (d < R + 0.85 && dy > -1.4 && dy < 1.9 && !pl.dead) {
      if ((pl.vel[1] < -1 && dy > 0.8) || pl.action === 'pound') {
        bounceOff(55);   // von oben drauf: Zuender kurz, und hoch genug raus aus dem Knall
        Snd.stomp();
        if (e.state === 'walk') { e.state = 'lit'; Snd.fuse(); }
        e.t = Math.min(e.t || 9, 0.45);
      } else if (!pl.hold) {
        pickUp(e);                                   // beruehren mit freien Haenden = aufheben (auch im Hechtsprung)
      } else {
        e.pos[0] -= Math.sin(e.face) * 0.8; e.pos[2] -= Math.cos(e.face) * 0.8;   // Hände voll: nur wegschubsen
        e.speed = 0;
      }
    }
  }
  function explode(e) {
    e.state = 'gone'; e.t = 8;
    const c = [e.pos[0], e.pos[1] + 0.8, e.pos[2]];
    burst(c, 26, { spread: 9, up: 6, upRand: 5, life: .8, size: .55, cols: [[1, .85, .2], [1, .45, .05], [.9, .15, .05], [.3, .3, .3]], grav: 8 });
    Snd.boom(); cam.shake = Math.max(cam.shake, 0.7); rumble(1, 420);
    const pc = [pl.pos[0], pl.pos[1] + 1.1, pl.pos[2]];
    if (v3.len(v3.sub(pc, c)) < 3.6) hurtPlayer(3, e.pos, true);
    // Umstehende Gegner bekommen den Knall ab; andere Kisten zuenden mit kurzer Verzoegerung
    for (const o of cur.enemies) {
      if (o === e || o.state === 'gone' || o.state === 'dead') continue;
      if (dist2D(o.pos, e.pos) > 4.2 || Math.abs(o.pos[1] - e.pos[1]) > 3) continue;
      if (o.type === 'bomb') { if (!o.held) { o.state = 'lit'; o.t = Math.min(o.t || 9, 0.25); } }
      else if (o.type === 'grummel') squashGrummel(o);
      else if (o.type === 'spiky' || o.type === 'hopper' || o.type === 'toast' || o.type === 'bat') defeat(o);
      else if (o.type === 'virus') splitVirus(o);
      else if (o.type === 'worm') crashWorm(o);
      else if (o.type === 'popup') closePopup(o);
    }
    for (const o of cur.enemies) {
      if (v3.len(v3.sub(o.pos, e.pos)) >= 3.6) continue;
      if (o.type === 'grummel') squashGrummel(o);
      else if (o.type === 'spiky' || o.type === 'hopper' || o.type === 'bat') defeat(o);
    }
  }
  function updRoller(e, dt) {
    if (e.state === 'wait') {
      e.t -= dt; e.scale = 0;
      if (e.t <= 0) {
        e.state = 'roll'; e.seg = 0; e.along = 0; e.vy = 0;
        const s = e.path[0], gy = groundAt(cur, s[0], s[1], 200, 0.1);
        e.pos = [s[0], gy > -Infinity ? gy : 0, s[1]];
      }
      return;
    }
    if (e.state === 'sink') {
      e.t -= dt; e.scale = Math.max(0, e.t / 0.5);
      if (e.t <= 0) { e.state = 'wait'; e.t = e.gap; }
      return;
    }
    e.scale = Math.min(1, e.scale + dt * 2.5);
    let move = e.v * dt;
    while (move > 0 && e.seg < e.path.length - 1) {
      const a = e.path[e.seg], b = e.path[e.seg + 1], rest = Math.hypot(b[0] - a[0], b[1] - a[1]) - e.along;
      if (move < rest) { e.along += move; move = 0; } else { move -= rest; e.seg++; e.along = 0; }
    }
    if (e.seg >= e.path.length - 1) { e.state = 'sink'; e.t = 0.5; return; }
    const a = e.path[e.seg], b = e.path[e.seg + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = e.along / len;
    const x = lerp(a[0], b[0], k), z = lerp(a[1], b[1], k);
    e.face = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const gy = groundAt(cur, x, z, e.pos[1] + 0.9, 0.1);
    e.pos[0] = x; e.pos[2] = z;
    if (gy > -Infinity && e.pos[1] <= gy + 0.3) { e.pos[1] = gy; e.vy = 0; }
    else { e.vy -= GRAV * dt; e.pos[1] = Math.max(gy, e.pos[1] + e.vy * dt); }
    e.roll += e.v * dt / e.r;
    e.anim += dt;
    const c = [e.pos[0], e.pos[1] + e.r, e.pos[2]], pc = [pl.pos[0], pl.pos[1] + 1.1, pl.pos[2]];
    if (!pl.dead && v3.len(v3.sub(pc, c)) < e.r * e.scale + 0.65) hurtPlayer(2, e.pos, true);
  }
  function updGhost(e, dt) {
    if (e.shy) { updShyGhost(e, dt); return; }
    if (e.state === 'gone') { e.t -= dt; if (e.t <= 0) e.state = 'float'; return; }
    const a = e.ph + time * e.w;
    e.pos = [e.c[0] + Math.cos(a) * e.rad, e.c[1] + Math.sin(time * 1.7 + e.ph) * 0.4, e.c[2] + Math.sin(a) * e.rad];
    e.face = Math.atan2(-Math.sin(a) * e.w, Math.cos(a) * e.w);
    e.anim += dt;
    const p = pl.pos, d = Math.hypot(p[0] - e.pos[0], p[2] - e.pos[2]), dy = p[1] - e.pos[1];
    if (d < R + 0.9 && dy > -1.9 && dy < 1.7 && !pl.dead) {
      const fromAbove = pl.vel[1] < -1 && dy > 0.6;
      if (['dive', 'slide', 'rollout', 'pound'].includes(pl.action) || fromAbove) {
        poofGhost(e);
        if (fromAbove || pl.action === 'pound') bounceOff();
      } else hurtPlayer(1, e.pos);
    }
  }
  /* Schuechterner Geist (Schlosshof): wer ihn ansieht, dem haelt er die Haende vor die Augen und wird
     durchsichtig — dann ist er nicht zu treffen. Dreht man ihm den Ruecken zu, schleicht er heran.
     Trick: weggucken, kommen lassen, blitzschnell umdrehen und hauen (oder draufspringen). */
  let booT = -9;
  function updShyGhost(e, dt) {
    if (e.state === 'gone') {
      e.t -= dt;
      if (e.t <= 0) { e.state = 'float'; e.hide = 1; e.pos = [e.c[0] + e.rad, e.c[1], e.c[2]]; }
      return;
    }
    const p = pl.pos, dx = e.pos[0] - p[0], dz = e.pos[2] - p[2], d = Math.hypot(dx, dz) || 1, dy = p[1] - e.pos[1];
    const seen = !pl.dead && d < 26 && (dx * Math.sin(pl.face) + dz * Math.cos(pl.face)) / d > 0.6;
    const was = e.hide || 0;
    e.hide = clamp(was + (seen ? dt / 0.55 : -dt / 0.85), 0, 1);
    e.anim += dt;
    const leash = Math.hypot(p[0] - e.c[0], p[2] - e.c[2]) < e.leash;
    let tx, ty, tz, sp;
    if (seen) sp = 0;
    else if (leash && !pl.dead && !pl.entering) { tx = p[0]; ty = p[1] + 0.5; tz = p[2]; sp = e.chase; }
    else { const a = e.ph + time * e.w; tx = e.c[0] + Math.cos(a) * e.rad; ty = e.c[1]; tz = e.c[2] + Math.sin(a) * e.rad; sp = 2.4; }
    e.vel = e.vel || [0, 0, 0];
    if (sp > 0) {
      const ddx = tx - e.pos[0], ddy = ty - e.pos[1], ddz = tz - e.pos[2], l = Math.hypot(ddx, ddy, ddz) || 1;
      const k = Math.min(1, dt * 2.5);
      e.vel[0] += (ddx / l * sp - e.vel[0]) * k; e.vel[1] += (ddy / l * sp - e.vel[1]) * k; e.vel[2] += (ddz / l * sp - e.vel[2]) * k;
      e.face = Math.atan2(-dx, -dz);
      if (was > 0.65 && e.hide <= 0.65 && leash && time - booT > 1.5) { booT = time; Snd.boo(); }
    } else {
      const k = Math.min(1, dt * 3);
      e.vel[0] -= e.vel[0] * k; e.vel[1] -= e.vel[1] * k; e.vel[2] -= e.vel[2] * k;
      e.face += angDiff(e.face, Math.atan2(dx, dz)) * Math.min(1, dt * 6);   // dreht sich weg
    }
    e.pos[0] += e.vel[0] * dt; e.pos[1] += e.vel[1] * dt; e.pos[2] += e.vel[2] * dt;
    e.pos[1] = Math.max(e.pos[1], e.minY ?? -0.2) + Math.sin(time * 1.7 + e.ph) * 0.004;
    if (e.hide > 0.65 || pl.dead) return;
    if (d < R + 0.9 && dy > -1.9 && dy < 1.7) {
      const fromAbove = pl.vel[1] < -1 && dy > 0.6;
      if (['dive', 'slide', 'rollout', 'pound'].includes(pl.action) || fromAbove) {
        poofGhost(e);
        if (fromAbove || pl.action === 'pound') bounceOff();
      } else hurtPlayer(1, e.pos);
    }
  }
  function poofGhost(e) {
    e.state = 'gone'; e.t = 10;
    Snd.poof(); rumble(0.3, 80);
    burst([e.pos[0], e.pos[1] + 1, e.pos[2]], 14, { spread: 3, up: 2, upRand: 2, life: .6, size: .22, cols: [[1, 1, 1], [.85, .8, 1]], grav: -1 });
    setTimeout(() => { Snd.coin(); addCoins(1); }, 150);
    if (cur.onDefeat) cur.onDefeat(e);
  }
  // Besiegt: Puff, Muenze, nach einer Weile kommt er an seinem Zuhause wieder
  function defeat(e, cols) {
    if (e.state === 'dead' || e.state === 'gone') return;
    e.state = e.type === 'bat' ? 'gone' : 'dead'; e.t = 10;
    Snd.poof(); Snd.stomp(); rumble(0.3, 80);
    const c = hex(e.col || '#ffffff');
    burst([e.pos[0], e.pos[1] + 0.8, e.pos[2]], 14, { spread: 3.5, up: 3, upRand: 2, life: .55, size: .2, cols: cols || [c, [1, 1, 1], [1, .9, .4]], grav: 6 });
    setTimeout(() => { Snd.coin(); addCoins(1); }, 150);
    if (cur.onDefeat) cur.onDefeat(e);
  }
  function respawnHome(e, dt) {
    e.t -= dt;
    if (e.t > 0) return true;
    e.state = e.type === 'bat' ? 'fly' : 'walk';
    const gy = groundAt(cur, e.home[0], e.home[1], e.fromY ?? 50);
    e.pos = [e.home[0], e.type === 'bat' ? e.hy : (gy > -Infinity ? gy : 0), e.home[1]];
    e.vy = 0; e.air = false;
    return true;
  }
  function updSpiky(e, dt) {
    if (e.state === 'dead') { respawnHome(e, dt); return; }
    const p = pl.pos, dx = p[0] - e.pos[0], dz = p[2] - e.pos[2], d = Math.hypot(dx, dz), dy = p[1] - e.pos[1];
    if (d < 8 && Math.abs(dy) < 3 && !pl.dead) {
      e.face += clamp(angDiff(e.face, Math.atan2(dx, dz)), -2.4 * dt, 2.4 * dt);
      e.speed = 2.8;
    } else wanderTo(e, dt, 1.3);
    moveEntity(e, dt, 0.85);
    e.anim += dt * (e.speed + 0.5) * 2.5;
    if (d < R + 0.85 && dy > -1.4 && dy < 1.7 && !pl.dead) {
      if (['dive', 'slide', 'rollout'].includes(pl.action)) { defeat(e); cam.shake = Math.max(cam.shake, 0.15); }
      else if (pl.vel[1] < -1 && dy > 0.5) { hurtPlayer(2, e.pos, true); pl.vel[1] = 14; }   // Autsch, Stacheln!
      else hurtPlayer(1, e.pos);
    }
  }
  function updBat(e, dt) {
    if (e.state === 'gone') { respawnHome(e, dt); return; }
    e.anim += dt;
    e.cool = Math.max(0, e.cool - dt);
    const p = pl.pos, pc = [p[0], p[1] + 1.1, p[2]];
    if (e.state === 'fly') {
      const a = e.anim * 0.9;
      const want = [e.home[0] + Math.cos(a) * 3.5, e.hy + Math.sin(e.anim * 2.3) * 0.5, e.home[1] + Math.sin(a) * 3.5];
      for (let i = 0; i < 3; i++) e.pos[i] += (want[i] - e.pos[i]) * Math.min(1, dt * 2.5);
      e.face = Math.atan2(-Math.sin(a), Math.cos(a));
      const hd = Math.hypot(p[0] - e.home[0], p[2] - e.home[1]);
      if (e.cool <= 0 && hd < 10 && p[1] < e.hy + 1 && p[1] > e.hy - 9 && !pl.dead) {
        e.state = 'swoop'; e.t = 1.6;
        const v = v3.sub(pc, e.pos), l = v3.len(v) || 1;
        e.vel = v3.scale(v, 9.5 / l);
        e.face = Math.atan2(v[0], v[2]);
        Snd.whoosh();
      }
    } else if (e.state === 'swoop') {
      e.t -= dt;
      // leicht nachlenken, dann wieder hoch
      const v = v3.sub(pc, e.pos), l = v3.len(v) || 1;
      e.vel = v3.add(v3.scale(e.vel, 1 - dt * 1.5), v3.scale(v, (9.5 / l) * dt * 1.5));
      e.pos = v3.add(e.pos, v3.scale(e.vel, dt));
      const gy = groundAt(cur, e.pos[0], e.pos[2], e.pos[1] + 0.5, 0.2);
      if (e.pos[1] < gy + 0.6) e.pos[1] = gy + 0.6;
      if (e.t <= 0) { e.state = 'rise'; }
    } else {
      e.pos[1] += (e.hy - e.pos[1]) * Math.min(1, dt * 1.6);
      e.pos[0] += (e.home[0] - e.pos[0]) * Math.min(1, dt * 0.8);
      e.pos[2] += (e.home[1] - e.pos[2]) * Math.min(1, dt * 0.8);
      if (Math.abs(e.pos[1] - e.hy) < 0.4) { e.state = 'fly'; e.cool = 2.5; }
    }
    const d = v3.len(v3.sub(pc, [e.pos[0], e.pos[1], e.pos[2]]));
    if (d < 1.25 && !pl.dead) {
      const fromAbove = pl.vel[1] < -1 && p[1] + 0.4 > e.pos[1];
      if (fromAbove || ['dive', 'pound', 'rollout'].includes(pl.action)) { defeat(e); if (fromAbove) bounceOff(); }
      else { hurtPlayer(1, e.pos); if (e.state === 'swoop') e.state = 'rise'; }
    }
  }
  function updHopper(e, dt) {
    if (e.state === 'dead') { respawnHome(e, dt); return; }
    if (e.state === 'squash') { e.t -= dt; if (e.t <= 0) { e.state = 'dead'; e.t = 10; } return; }
    const p = pl.pos, dx = p[0] - e.pos[0], dz = p[2] - e.pos[2], d = Math.hypot(dx, dz), dy = p[1] - e.pos[1];
    e.anim += dt;
    if (!e.air) {
      e.t -= dt; e.speed = 0;
      if (e.t <= 0) {
        const chase = d < 11 && Math.abs(dy) < 4 && !pl.dead;
        if (chase) e.face = Math.atan2(dx, dz);
        else {
          const hx = e.home[0] - e.pos[0], hz = e.home[1] - e.pos[2];
          e.face = Math.hypot(hx, hz) > 7 ? Math.atan2(hx, hz) : Math.random() * TAU;
        }
        e.vy = chase ? 10.5 : 8; e.speed = chase ? 4.5 : 2.2; e.air = true;
        e.t = 0.55 + Math.random() * 0.5;
      }
    } else {
      e.vy -= 30 * dt;
      const nx = e.pos[0] + Math.sin(e.face) * e.speed * dt, nz = e.pos[2] + Math.cos(e.face) * e.speed * dt;
      const ahead = groundAt(cur, nx, nz, e.pos[1] + 0.6, 0.2);
      if (ahead > e.pos[1] - 1.5) { e.pos[0] = nx; e.pos[2] = nz; }         // nicht ueber Kanten ins Nichts
      e.pos[1] += e.vy * dt;
      pushOut(cur, e.pos, 0.7, 1.2, e.pos[1] + 0.4);
      const gy = groundAt(cur, e.pos[0], e.pos[2], e.pos[1] + 0.6, 0.2);
      if (e.vy < 0 && e.pos[1] <= gy) { e.pos[1] = gy; e.air = false; e.vy = 0; }
      if (e.pos[1] < (cur.voidY ?? -25)) { e.state = 'dead'; e.t = 6; }
    }
    if (d < R + 0.75 && dy > -1.4 && dy < 1.6 && !pl.dead) {
      if (['dive', 'slide', 'rollout'].includes(pl.action)) defeat(e);
      else if ((pl.vel[1] < -1 && dy > 0.45) || pl.action === 'pound') { e.state = 'squash'; e.t = 0.45; Snd.stomp(); bounceOff(); setTimeout(() => { Snd.coin(); addCoins(1); }, 120); if (cur.onDefeat) cur.onDefeat(e); }
      else hurtPlayer(1, e.pos);
    }
  }
  // gemeinsamer Schwebe-Antrieb: Geschwindigkeit weich auf das Ziel lenken
  function steerTo(e, tx, ty, tz, sp, dt, k = 2.5) {
    const dx = tx - e.pos[0], dy = ty - e.pos[1], dz = tz - e.pos[2], l = Math.hypot(dx, dy, dz) || 1, a = Math.min(1, dt * k);
    const f = Math.min(sp, l * 3);
    e.vel[0] += (dx / l * f - e.vel[0]) * a; e.vel[1] += (dy / l * f - e.vel[1]) * a; e.vel[2] += (dz / l * f - e.vel[2]) * a;
    e.pos[0] += e.vel[0] * dt; e.pos[1] += e.vel[1] * dt; e.pos[2] += e.vel[2] * dt;
  }
  const attacking = () => ['dive', 'slide', 'rollout', 'pound'].includes(pl.action);
  function updVirus(e, dt) {
    if (e.state === 'off') return;
    if (e.state === 'gone') {
      e.t -= dt;
      if (e.t <= 0 && e.kids.every((k) => k.state === 'off')) { e.state = 'float'; e.pos = [e.home[0], e.baseY + 1.2, e.home[1]]; e.vel = [0, 0, 0]; e.inv = 0.6; }
      return;
    }
    if (e.baseY == null) e.baseY = e.pos[1];
    e.anim += dt; e.inv = Math.max(0, e.inv - dt);
    const p = pl.pos, hover = 0.95 * e.s + 0.25 * Math.sin(e.anim * 2.1);
    const near = Math.hypot(p[0] - e.home[0], p[2] - e.home[1]) < 13 && Math.abs(p[1] - e.baseY) < 5 && !pl.dead && !pl.entering;
    if (near) steerTo(e, p[0], p[1] + hover, p[2], e.gen ? 4 : 2.7, dt, e.inv > 0 ? 0.6 : 2.5);
    else steerTo(e, e.home[0] + Math.cos(e.anim * 0.5) * 2.5, e.baseY + 1.2 + hover, e.home[1] + Math.sin(e.anim * 0.5) * 2.5, 1.8, dt);
    pushOut(cur, e.pos, 0.55 * e.s, 1.1 * e.s, e.pos[1]);
    const gy = groundAt(cur, e.pos[0], e.pos[2], e.pos[1] + 0.8, 0.2);
    if (gy > -Infinity && e.pos[1] < gy + 0.45 * e.s) { e.pos[1] = gy + 0.45 * e.s; e.vel[1] = Math.max(0, e.vel[1]); }
    e.face = Math.atan2(p[0] - e.pos[0], p[2] - e.pos[2]);
    if (e.inv > 0 || pl.dead) return;
    const d = Math.hypot(p[0] - e.pos[0], p[1] + 1 - e.pos[1], p[2] - e.pos[2]);
    if (d < 0.95 + 0.62 * e.s) {
      const fromAbove = pl.vel[1] < -1 && p[1] + 0.3 > e.pos[1];
      if (fromAbove || attacking()) { splitVirus(e); if (fromAbove || pl.action === 'pound') bounceOff(); }
      else hurtPlayer(1, e.pos);
    }
  }
  function splitVirus(e) {
    if (e.state !== 'float' || e.inv > 0) return;
    Snd.split(); rumble(0.3, 80);
    burst([e.pos[0], e.pos[1], e.pos[2]], 14, { spread: 4, up: 2, upRand: 2, life: .6, size: .18, cols: e.gen ? [[1, .35, .75], [1, .85, .95]] : [[.35, .85, .3], [.85, 1, .35]], grav: 4 });
    setTimeout(() => { Snd.coin(); addCoins(1); }, 150);
    if (e.gen === 0) {
      e.state = 'gone'; e.t = 12;
      e.kids.forEach((k, i) => {
        const s = i ? 1 : -1;
        k.state = 'float'; k.pos = e.pos.slice(); k.baseY = e.baseY; k.home = [e.pos[0], e.pos[2]]; k.inv = 0.7;
        k.vel = [Math.cos(e.face) * s * 6, 4, -Math.sin(e.face) * s * 6];
      });
    } else e.state = 'off';
    if (cur.onDefeat) cur.onDefeat(e);
  }
  function updWorm(e, dt) {
    if (e.state === 'dead') { respawnHome(e, dt); if (e.state === 'walk') e.trail = []; return; }
    if (e.state === 'crash') { e.t -= dt; if (e.t <= 0) { e.state = 'dead'; e.t = 11; } return; }
    const p = pl.pos, dx = p[0] - e.pos[0], dz = p[2] - e.pos[2], d = Math.hypot(dx, dz), dy = p[1] - e.pos[1];
    if (d < 10 && Math.abs(dy) < 3 && !pl.dead) { e.face += clamp(angDiff(e.face, Math.atan2(dx, dz)), -2.2 * dt, 2.2 * dt); e.speed = 3.6; }
    else wanderTo(e, dt, 2);
    moveEntity(e, dt, 0.55);
    e.anim += dt * (e.speed + 1) * 2;
    if (!e.trail.length) for (let i = 0; i <= e.n * 4; i++) e.trail.push([e.pos[0] - Math.sin(e.face) * i * 0.25, e.pos[1], e.pos[2] - Math.cos(e.face) * i * 0.25]);
    const last = e.trail[0];
    if (Math.hypot(last[0] - e.pos[0], last[2] - e.pos[2]) > 0.25) { e.trail.unshift(e.pos.slice()); if (e.trail.length > e.n * 4 + 1) e.trail.pop(); }
    e.segs = [];
    for (let i = 1; i <= e.n; i++) e.segs.push(e.trail[Math.min(e.trail.length - 1, i * 4)]);
    if (pl.dead) return;
    for (const q of [e.pos, ...e.segs]) {
      const qd = Math.hypot(p[0] - q[0], p[2] - q[2]), qy = p[1] - q[1];
      if (qd > R + 0.55 || qy < -1.4 || qy > 1.5) continue;
      if (attacking()) crashWorm(e);
      else if (pl.vel[1] < -1 && qy > 0.4) { crashWorm(e); bounceOff(); }
      else hurtPlayer(1, q);
      break;
    }
  }
  function crashWorm(e) {
    if (e.state !== 'walk') return;
    e.state = 'crash'; e.t = 1; e.crashT = time;
    Snd.stomp(); Snd.beep(); rumble(0.35, 100);
    for (const q of [e.pos, ...e.segs]) burst([q[0], q[1] + 0.4, q[2]], 4, { spread: 3, up: 3, life: .5, size: .2, cols: [[.4, 1, .35], [.8, 1, .6]], grav: 8 });
    setTimeout(() => { Snd.coin(); addCoins(2); }, 150);
    if (cur.onDefeat) cur.onDefeat(e);
  }
  function updPopup(e, dt) {
    if (e.baseY == null) e.baseY = e.pos[1];
    if (e.state === 'gone') { e.t -= dt; if (e.t <= 0) { e.state = 'hide'; e.open = 0; e.pos = [e.home[0], e.baseY + 1.6, e.home[1]]; e.vel = [0, 0, 0]; } return; }
    e.anim += dt;
    const p = pl.pos, hd = Math.hypot(p[0] - e.home[0], p[2] - e.home[1]);
    const want = hd < 11 && Math.abs(p[1] - e.baseY) < 5 && !pl.dead && !pl.entering;
    if (e.state === 'hide') {
      e.open = Math.max(0, e.open - dt * 3);
      steerTo(e, e.home[0], e.baseY + 1.6, e.home[1], 3, dt);
      if (want && e.open <= 0) { e.state = 'chase'; e.v = (e.v + 1) % POPUPS.length; Snd.popup(); }
      return;
    }
    e.open = Math.min(1, e.open + dt * 3.5);
    if (hd > 17 || pl.dead) { e.state = 'hide'; return; }
    steerTo(e, p[0], p[1] + 1.5 + Math.sin(e.anim * 2.4) * 0.3, p[2], 3.3, dt, 1.8);
    e.face = Math.atan2(p[0] - e.pos[0], p[2] - e.pos[2]);
    if (e.open < 0.8 || pl.dead) return;
    const d = Math.hypot(p[0] - e.pos[0], p[1] + 1.1 - e.pos[1], p[2] - e.pos[2]);
    if (d < 1.45) {
      const fromAbove = pl.vel[1] < -1 && p[1] + 0.2 > e.pos[1];
      if (fromAbove || attacking()) { closePopup(e); if (fromAbove || pl.action === 'pound') bounceOff(); }
      else { hurtPlayer(1, e.pos); e.vel = v3.scale(e.vel, -1.5); }
    }
  }
  function closePopup(e) {
    if (e.state !== 'chase') return;
    e.state = 'gone'; e.t = 9;
    Snd.poof(); Snd.press(); rumble(0.25, 60);
    burst(e.pos.slice(), 16, { spread: 4, up: 2, upRand: 2, life: .5, size: .2, cols: [[.75, .75, .75], [0, 0, .55], [1, 1, 1]], grav: 6 });
    setTimeout(() => { Snd.coin(); addCoins(1); }, 150);
    if (cur.onDefeat) cur.onDefeat(e);
  }
  function updToast(e, dt) {
    const L = cur;
    e.cool = Math.max(0, e.cool - dt);
    const p = pl.pos, dx = e.pos[0] - p[0], dz = e.pos[2] - p[2], d = Math.hypot(dx, dz) || 1, dy = p[1] - e.pos[1];
    let ax = 0, az = 0, maxV = 2.2;
    if (e.state === 'caught') {
      e.t -= dt; e.vel[0] *= 0.8; e.vel[1] *= 0.8;
      if (e.t <= 0) e.state = 'run';
    } else if (d < 10 && Math.abs(dy) < 3) {
      ax = dx / d; az = dz / d;
      // Richtung Hallenmitte, wenn nah an Wand oder Treppe
      const ex = Math.abs(e.pos[0]) / 21, ez = Math.abs(e.pos[2] - 4) / 14;
      const edge = Math.max(ex, ez);
      if (edge > 0.75) {
        const cx = -e.pos[0], cz = 4 - e.pos[2], cl = Math.hypot(cx, cz) || 1, k = (edge - 0.75) * 5;
        ax += cx / cl * k; az += cz / cl * k;
      }
      const zig = Math.sin(time * 2.6 + e.seed) * 0.7, ca = Math.cos(zig), sa = Math.sin(zig);
      const rx = ax * ca - az * sa; az = ax * sa + az * ca; ax = rx;
      const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
      e.tired += dt;
      maxV = e.tired > 6 ? 6.5 : 11.5;   // Glappo laeuft 13,2 m/s
    } else {
      e.tired = Math.max(0, e.tired - dt * 0.5);
      e.wander -= dt;
      if (e.wander <= 0) { e.wander = 1 + Math.random() * 2; e.wdir = Math.random() * TAU; }
      ax = Math.sin(e.wdir || 0) * 0.4; az = Math.cos(e.wdir || 0) * 0.4;
    }
    e.vel[0] += ax * 34 * dt; e.vel[1] += az * 34 * dt;
    const v = Math.hypot(e.vel[0], e.vel[1]);
    if (v > maxV) { e.vel[0] *= maxV / v; e.vel[1] *= maxV / v; }
    e.pos[0] += e.vel[0] * dt; e.pos[2] += e.vel[1] * dt;
    const hit = pushOut(L, e.pos, 0.75, 1.4, e.pos[1] + 0.3);
    if (hit) {
      const vn = e.vel[0] * hit.n[0] + e.vel[1] * hit.n[2];
      if (vn < 0) { e.vel[0] -= hit.n[0] * vn * 1.4; e.vel[1] -= hit.n[2] * vn * 1.4; }
    }
    if (v > 0.3) e.face = Math.atan2(e.vel[0], e.vel[1]);
    e.speed = v;
    e.anim += dt * (v * 2.2 + 1);
    if (e.state === 'run' && e.cool <= 0 && d < R + 1 && Math.abs(dy) < 1.8 && !pl.dead) catchToast(e);
  }
  function catchToast(e) {
    e.state = 'caught'; e.t = 5; e.cool = 14;
    Snd.beep(); rumble(0.4, 120);
    pl.speed = 0;
    const had = !!state.stars.toast;
    Dialog.show('Toasti', had
      ? ['Pling! Schon wieder erwischt …', 'Na gut, hier ist nochmal ein Stern. Nur zum Angucken!']
      : ['PLING! Hey, lass los – ich bin doch noch gar nicht fertig getoastet!', 'Na gut, du warst schneller. Hier, nimm diesen Stern. Noch ganz warm!'],
      () => { e.tired = 0; spawnStar('toast', cur, [e.pos[0], e.pos[1] + 2.8, e.pos[2]]); });
  }

  /* ═══════════ Interaktionen ═══════════ */
  function readSign() {
    if (cur.sign.text) { Dialog.show('Schild', cur.sign.text); return; }
    Dialog.show('Schild', [
      '★ DAS GEHEIME SCHLOSS ★\nIn diesem Schloss sind 4 Sterne versteckt.',
      '1) ACHT ROTE MÜNZEN liegen im Garten: auf dem Stufenhügel, der Steinsäule, dem Pilz, der Wolke, im Burggraben, hinterm Schloss, über den Steinen und ganz hinten in einer Ecke.',
      'Die WOLKE erreichst du nur mit einem DREIFACHSPRUNG: loslaufen und dreimal im Takt springen.',
      '2) FÜNFZIG MÜNZEN geben einen Stern. Grummel zahlen Münzen, und der blaue Schalter spuckt blaue Münzen aus – einfach draufspringen.',
      '3) In der Schlosshalle flitzt TOASTI herum. Fang ihn!',
      '4) Und wer im SONNENSTRAHL der Halle nach OBEN schaut (C / Y), sieht mehr.',
      'Das Schloss ist groß: Jedes Bild hängt in einem EIGENEN ZIMMER. Die Türen der Halle führen hin – und in den KELLER, in den SCHLOSSHOF mit dem Geisterbrunnen und in viele weitere Räume.',
      'Mit 4 Sternen öffnet sich die STERNTÜR oben auf der Galerie. Dahinter liegt das OBERGESCHOSS mit dem großen Turm.',
    ]);
  }
  function useDoor(d = cur.door) {
    if (mode !== 'play' || pl.entering || !d) return;
    Snd.door();
    if (d.end) { openEnding(); return; }
    if (d.back) { leaveBack(); return; }
    transition(() => enterLevel(d.to, d.spawn, d.face, d.yaw));
  }
  // "Zurueck" fuehrt dorthin, von wo man hereinkam (HOME): direkt vor dessen Tuer bzw. vor das Bild
  function backSpot(key) {
    const hk = HOME[key] || 'hall', H = getLevel(hk);
    const bs = H.backSpots && H.backSpots[key];
    if (bs) return { level: hk, pos: bs.pos.slice(), face: bs.face };
    const hd = H.doors.find((d) => d.to === key);
    if (hd) return { level: hk, pos: hd.ret.slice(), face: hd.retFace };
    const pt = (H.paintings || []).find((q) => q.level === key);
    if (pt) {
      const gy = groundAt(H, pt.x, pt.z + 3.8, pt.y + 4, 0.3);
      return { level: hk, pos: [pt.x, gy > -Infinity ? gy : 0, pt.z + 3.8], face: 0 };
    }
    return { level: hk, pos: H.spawn.slice(), face: H.spawnFace };
  }
  function leaveBack() {
    const s = backSpot(cur.key);
    transition(() => enterLevel(s.level, s.pos, s.face, s.face));
  }
  // Die Sterntuer oben auf der Galerie: mit 4 Sternen geht sie auf, dahinter liegt das Obergeschoss
  function useStarDoor() {
    const sd = cur.starDoor, n = starCount(), miss = 4 - n;
    if (sd.opening || mode !== 'play') return;
    if (state.doorOpen && sd.open >= 1) { Snd.door(); transition(() => enterLevel('og')); return; }
    if (miss > 0) {
      Snd.deny();
      Dialog.show('Sterntür', ['Diese Tür öffnet sich erst mit ★ 4.', `Du hast ${n}. Dir fehl${miss === 1 ? 't' : 'en'} noch ${miss} Stern${miss === 1 ? '' : 'e'}.`]);
      return;
    }
    sd.opening = true; state.doorOpen = true; save();
    Snd.door(); rumble(0.4, 600);
    pl.frozen = 1.6;
    setTimeout(() => {
      sd.opening = false; sd.open = 1;
      if (cur.starDoor === sd && mode === 'play') transition(() => enterLevel('og'));
    }, 1500);
  }
  function openEnding() {
    mode = 'iris'; Input.unlock();
    Iris.close(null, null, 700).then(() => {
      $('#ending').hidden = false;
      mode = 'ending';
      $('#btnEndBack').focus({ preventScroll: true });
      return Iris.open(null, null, 600);
    });
  }
  /* ─── Eintauchen ins Gemaelde: kleine Cutscene ───
     0,00 s  Glappo leuchtet auf, loest sich in Funken auf; Kinobalken, magischer Klang
     0,00-0,95 s  Kamera schwebt vor das Bild
     0,95-2,20 s  Kamera faehrt hinein, das Bild wirbelt, die Funken tauchen ein
     1,72 s  helle Blende in den Farben des Bildes, danach die neue Welt */
  const Cine = { active: null };
  const MagicFade = (() => {
    const el = $('#magicFade');
    let hideT = 0;
    return {
      on(tint) {
        clearTimeout(hideT);
        el.style.setProperty('--mf', tint[1] + '55');
        el.style.setProperty('--mf2', tint[1]);
        el.classList.remove('out');
        el.hidden = false;
        void el.offsetWidth;
        el.classList.add('on');
      },
      off() {
        el.classList.add('out');
        el.classList.remove('on');
        hideT = setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 900);
      },
      hide() { clearTimeout(hideT); el.classList.remove('on', 'out'); el.hidden = true; },
    };
  })();
  const lerpv = (a2, b2, k) => [lerp(a2[0], b2[0], k), lerp(a2[1], b2[1], k), lerp(a2[2], b2[2], k)];
  function enterPainting(pt, p, y) {
    if (Cine.active) return;
    const sc = pt.scale || 1;
    const center = M4.point(pt.model, [0, 0.325, 0]);
    const n = v3.norm(M4.dir(pt.model, [0, 0, 1]));
    const right = v3.norm(v3.cross([0, 1, 0], n)), up = v3.cross(n, right);
    const tint = ART_TINT[pt.bg] || ['#3a1a6a', '#ffe680'];
    pl.entering = 1; pl.speed = 0; pl.side = 0; pl.push = [0, 0, 0]; pl.vel = [0, 0, 0];
    pt.rip = { x: paintLocalX(pt, p), y: (y - pt.y) / sc, t0: clock, amp: 0.45 };
    const body = [pl.pos[0], pl.pos[1] + 1.2, pl.pos[2]];
    const glow = hex(tint[1]);
    const cols = [[1, 1, 1], [1, 0.9, 0.45], glow, [0.75, 1, 0.8], glow];
    const sparks = [];
    for (let i = 0; i < 70; i++) {
      const a2 = [body[0] + (Math.random() - 0.5) * 0.8, body[1] + (Math.random() - 0.5) * 2.0, body[2] + (Math.random() - 0.5) * 0.8];
      const ang = Math.random() * TAU, rr = (0.25 + Math.random() * 0.75) * 1.9 * sc;
      const b2 = v3.add(v3.add(center, v3.scale(n, 0.06)), v3.add(v3.scale(right, Math.cos(ang) * rr), v3.scale(up, Math.sin(ang) * rr * 0.75)));
      const mid = lerpv(a2, b2, 0.5);
      const c2 = v3.add(v3.add(mid, v3.scale(n, 1 + Math.random() * 2.2)), v3.add(v3.scale(right, (Math.random() - 0.5) * 3.5), [0, Math.random() * 2.2, 0]));
      sparks.push({ a: a2, b: b2, c: c2, delay: Math.random() * 0.38, dur: 0.75 + Math.random() * 0.75, size: 0.05 + Math.random() * 0.08, col: cols[i % cols.length], rot: Math.random() * 6 });
    }
    Cine.active = { pt, t: 0, center, n, right, sc, tint, from: cam.pos.slice(), fromT: cam.tgt.slice(), sparks, faded: false, done: false, rip2: false };
    mode = 'cine';
    document.body.classList.add('cine');
    burst(body, 10, { spread: 3, up: 2, upRand: 3, life: .5, size: .1, cols: [[1, 1, 1], [1, .9, .4], glow], grav: 0 });
    Snd.magic(); rumble(0.3, 350);
    if (!pt.level) {
      // Merken, wo es nach dem Webseiten-Besuch weitergeht (vor dem Portal)
      const gy = groundAt(cur, pt.x, pt.z + 3.8, pt.y + 4, 0.3);
      pendingReturn = { level: cur.key, pos: [pt.x, gy > -Infinity ? gy : pl.pos[1], pt.z + 3.8], face: 0 };
      try { sessionStorage.setItem('glappa64-return', JSON.stringify(pendingReturn)); } catch (e) {}
    }
  }
  function updateCine(dt) {
    const c = Cine.active;
    if (!c) return;
    c.t += dt;
    const t = c.t, pt = c.pt;
    pt.swirl = reduceMotion ? 0 : smooth(clamp((t - 0.7) / 1.4, 0, 1));
    if (!c.rip2 && t > 0.95) { c.rip2 = true; pt.rip = { x: 0, y: 0, t0: clock, amp: 0.3 }; }
    if (!c.faded && t > 1.72) { c.faded = true; MagicFade.on(c.tint); }
    if (!c.done && t > 2.2) {
      c.done = true;
      if (!pt.level) { location.href = new URL(pt.href, location.href).href; return; }
      pt.swirl = 0; pt.rip = null;
      Cine.active = null;
      document.body.classList.remove('cine');
      enterLevel(pt.level);
      mode = 'play';
      pl.appearT = clock;
      MagicFade.off();
      Snd.arrive();
      burst([pl.pos[0], pl.pos[1] + 1.1, pl.pos[2]], 22, { spread: 4, up: 3, upRand: 3, life: .8, size: .15, cols: [[1, 1, 1], [1, .9, .45], hex(c.tint[1])], grav: 2 });
    }
  }
  function cineCamera() {
    const c = Cine.active, t = c.t;
    const far = v3.add(c.center, v3.add(v3.scale(c.n, 7.5 * c.sc), [0, 0.45 * c.sc, 0]));
    const near = v3.add(c.center, v3.scale(c.n, 0.45 * c.sc));
    let pos, look, roll = 0;
    if (reduceMotion) {
      pos = c.from; look = c.center;
    } else if (t < 0.95) {
      const k = smooth(t / 0.95);
      pos = lerpv(c.from, far, k); look = lerpv(c.fromT, c.center, k);
    } else {
      const k = clamp((t - 0.95) / 1.25, 0, 1), e = k * k;
      pos = lerpv(far, near, e); look = c.center; roll = e * 0.4;
    }
    cam.pos = pos;
    const upv = v3.norm(v3.add(v3.scale([0, 1, 0], Math.cos(roll)), v3.scale(c.right, Math.sin(roll))));
    cam.view = M4.lookAt(pos, look, upv);
  }
  function drawCineSparks() {
    const c = Cine.active;
    if (!c) return;
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const bez = (sp, k) => {
      const u = 1 - k;
      return [u * u * sp.a[0] + 2 * u * k * sp.c[0] + k * k * sp.b[0], u * u * sp.a[1] + 2 * u * k * sp.c[1] + k * k * sp.b[1], u * u * sp.a[2] + 2 * u * k * sp.c[2] + k * k * sp.b[2]];
    };
    for (const sp of c.sparks) {
      const k = (c.t - sp.delay) / sp.dur;
      if (k <= 0 || k >= 1) continue;
      const e = k * k * (3 - 2 * k);
      const grow = Math.min(1, k / 0.12), fade = Math.min(1, k / 0.2) * (1 - Math.pow(k, 4));
      for (let tr = 0; tr < 4; tr++) {
        const kk = Math.max(0, e - tr * 0.035);
        const q = bez(sp, kk), sz = sp.size * grow * (1 - tr * 0.22);
        draw(MESH.cube, M4.from(q[0], q[1], q[2], sp.rot + clock * 6, sp.rot, clock * 3, sz), { tint: [sp.col[0], sp.col[1], sp.col[2], 1], alpha: fade * (0.7 - tr * 0.16), lit: 0 });
      }
      const q = bez(sp, e);
      draw(MESH.ball, M4.from(q[0], q[1], q[2], 0, 0, 0, sp.size * 1.7 * grow), { tint: [sp.col[0], sp.col[1], sp.col[2], 1], alpha: 0.08 * fade, lit: 0 });
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
  function sunTrigger() {
    if (sunDone) return;
    sunDone = true; pl.frozen = 1.2;
    Snd.sun(); rumble(0.3, 400);
    const fl = document.createElement('div');
    fl.className = 'white-flash';
    document.body.appendChild(fl);
    setTimeout(() => fl.remove(), 1200);
    setTimeout(() => {
      Dialog.show('???', ['Du schaust nach oben ins Sonnenlicht … und fühlst dich plötzlich ganz leicht!', 'Da oben im Strahl glitzert etwas.'], () => {
        const s = cur.sun.spot;
        spawnStar('sun', cur, [s[0], 3, s[2]]);
        setTimeout(() => { sunDone = false; }, 4000);
      });
    }, 500);
  }
  function interactable() {
    const L = cur, p = pl.pos;
    if (pl.hold) return { label: 'Werfen', act: throwHold };
    if (!pl.grounded || pl.dead || pl.entering) return null;
    const bomb = bombInReach();
    if (bomb) return { label: 'Aufheben', act: () => pickUp(bomb) };
    if (L.sign && dist2D(p, L.sign.pos) < 2.8) return { label: 'Lesen', act: readSign };
    if (L.door && dist2D(p, L.door.pos) < 3.2 && Math.abs(p[1] - L.door.pos[1]) < 1.5) return { label: L.door.label, act: () => useDoor() };
    for (const d of L.doors) if (dist2D(p, d.pos) < 3 && Math.abs(p[1] - d.pos[1]) < 1.5) return { label: d.label, act: () => useDoor(d) };
    for (const t of L.talkers) {
      if (dist2D(p, t.pos) < 2.8 && Math.abs(p[1] - t.pos[1]) < 2) return { label: t.speaker === 'Schild' ? 'Lesen' : 'Reden', act: () => Dialog.show(t.speaker, t.text) };
    }
    if (L.starDoor && dist2D(p, L.starDoor.pos) < 4.5 && p[1] > 4) return { label: 'Sterntür', act: useStarDoor };
    if (L.sun && dist2D(p, L.sun.spot) < L.sun.r) return { label: 'Nach oben schauen', btn: 'look' };
    if (L.paintings) {
      for (const pt of L.paintings) {
        if (Math.abs(paintAlong(pt, p)) < 3 * (pt.scale || 1) && paintAway(pt, p) < 4.5 && Math.abs(p[1] - (pt.y - 2.6 * (pt.scale || 1))) < 1.6) return { label: 'Reinspringen: ' + pt.name, btn: 'jump' };
      }
    }
    return null;
  }
  // Trifft alles vor Glappo in Reichweite; liefert true bei einem Treffer
  function hitInFront(range, kick) {
    const fx = Math.sin(pl.face), fz = Math.cos(pl.face);
    let hit = false;
    for (const e of cur.enemies) {
      if (e.state === 'dead' || e.state === 'gone' || e.state === 'squash' || e.state === 'off' || e.state === 'crash' || e.type === 'roller') continue;
      if (e.shy && e.hide > 0.65) continue;   // durchsichtig: der Schlag geht durch
      if (e.type === 'popup' && e.state !== 'chase') continue;
      // beim Wurm zaehlt das naechste Segment
      const q = e.type === 'worm' ? [e.pos, ...e.segs].reduce((a, b) => (dist2D(b, pl.pos) < dist2D(a, pl.pos) ? b : a)) : e.pos;
      const dx = q[0] - pl.pos[0], dz = q[2] - pl.pos[2], d = Math.hypot(dx, dz);
      if (d > range || Math.abs(q[1] - pl.pos[1]) > (e.type === 'popup' ? 2.4 : 1.6) || (dx * fx + dz * fz) / (d || 1) < 0.25) continue;
      hit = true;
      if (e.type === 'grummel') squashGrummel(e);
      else if (e.type === 'ghost') poofGhost(e);
      else if (e.type === 'spiky' || e.type === 'bat' || e.type === 'hopper') defeat(e);
      else if (e.type === 'virus') splitVirus(e);
      else if (e.type === 'worm') crashWorm(e);
      else if (e.type === 'popup') closePopup(e);
      else if (e.type === 'bomb') { e.state = 'lit'; e.t = Math.min(e.t || 9, 1.2); e.face += Math.PI; e.pos[0] += fx * (kick ? 2.5 : 1.2); e.pos[2] += fz * (kick ? 2.5 : 1.2); Snd.fuse(); }
    }
    if (hit) {
      const fp = [pl.pos[0] + fx * 0.9, pl.pos[1] + (kick ? 0.8 : 1.3), pl.pos[2] + fz * 0.9];
      burst(fp, 10, { spread: 3, up: 1.5, upRand: 2, life: .35, size: .15, cols: [[1, 1, 1], [1, .9, .4]], grav: 2 });
      cam.shake = Math.max(cam.shake, kick ? 0.25 : 0.15); rumble(kick ? 0.6 : 0.4, 90);
    }
    return hit;
  }
  function startDive() {
    const air = !pl.grounded;
    airborne('dive', air ? Math.max(Math.min(pl.vel[1], 6), 3) : 7, Math.max(pl.speed, 13) + (air ? 1.5 : 3));
    pl.punchT = 0;
    Snd.dive(); if (!air) dust(pl.pos, 5);
  }
  function attack() {
    const a = pl.action;
    if (['hang', 'climb', 'pound', 'bonk', 'dive', 'slide', 'knock', 'swim'].includes(a) || pl.knock > 0 || pl.hurtT > 0) return;
    if (!pl.grounded) {
      if (pl.inWater) return;
      if (Math.abs(pl.speed) > 4) startDive();
      else if (pl.punchT <= 0) { pl.punchN = 3; pl.punchDur = pl.punchT = 0.34; pl.comboT = time; Snd.punch(3); hitInFront(2.4, true); }
      return;
    }
    if (pl.speed > 8.5 && !pl.crouch && !pl.crawl) { startDive(); return; }
    // Kombo: 1 = rechter Schlag, 2 = linker Schlag (Doppelschlag), 3 = Tritt
    const combo = pl.punchN > 0 && pl.punchN < 3 && time - pl.comboT < 0.55;
    if (pl.punchT > 0.1 && !combo) return;
    pl.punchN = combo ? pl.punchN + 1 : 1;
    pl.comboT = time;
    pl.punchDur = pl.punchT = pl.punchN === 3 ? 0.36 : 0.24;
    pl.speed = Math.max(pl.speed, pl.punchN === 3 ? 4.5 : 3);
    Snd.punch(pl.punchN);
    hitInFront(pl.punchN === 3 ? 2.6 : 2.2, pl.punchN === 3);
  }

  /* ═══════════ Kamera ═══════════ */
  // Nur grosse Waende und Gebaeude halten die Kamera auf; kleine Plattformen, Kisten usw. nicht
  const CAM_HIT = new Set(['keep', 'tower', 'wall', 'wallL', 'wallR', 'wallN', 'wallS', 'balcony', 'pillar', 'house', 'citywall',
    'terrace', 'pc', 'monitor', 'manor', 'cliff', 'lighthouse', 'clocktower', 'trunk', 'hedge', 'crypt', 'gate', 'exitdoor',
    'mountain', 'pyramid', 'clockwall', 'hull', 'cabin', 'bigwall', 'roof', 'glass']);
  const cam = { yaw: 0, pitch: 0.34, dist: 12, pos: [0, 6, 20], tgt: [0, 1.6, 0], manual: 0, shake: 0, view: I4, proj: I4, snap: true, look: 0 };
  function updateCamera(dt, inp) {
    if (Cine.active) { cineCamera(); return; }
    if (mode === 'title') {
      const a = time * 0.09;
      cam.tgt = [0, 10, -36];
      cam.pos = [Math.sin(a) * 64, 20 + Math.sin(time * 0.2) * 4, -36 + Math.cos(a) * 64];
      cam.view = M4.lookAt(cam.pos, cam.tgt, [0, 1, 0]);
      return;
    }
    const playing = mode === 'play' && !Dialog.open;
    if (playing) {
      cam.yaw -= inp.cx * 2.8 * dt + inp.mdx * 0.006;
      cam.pitch = clamp(cam.pitch + inp.cy * 1.8 * dt + inp.mdy * 0.004, -0.15, 1.2);
      cam.dist = clamp(cam.dist + inp.wheel * 0.01, 5, 22);
      if (Math.abs(inp.cx) + Math.abs(inp.cy) > 0.05 || inp.mdx || inp.mdy) cam.manual = 1.5;
      cam.manual -= dt;
      if (cam.manual <= 0 && pl.speed > 3 && !pl.dead) {
        const diff = angDiff(cam.yaw, pl.face + Math.PI);
        if (Math.abs(diff) < 2.3) cam.yaw += diff * Math.min(1, dt * 0.9 * pl.speed / RUN);
      }
    }
    const want = [pl.pos[0], pl.pos[1] + 1.6, pl.pos[2]];
    if (cam.snap) { cam.tgt = want.slice(); cam.snap = false; }
    const k = Math.min(1, dt * 10), ky = Math.min(1, dt * (pl.grounded || pl.inWater ? 7 : 2.2));
    cam.tgt[0] += (want[0] - cam.tgt[0]) * k;
    cam.tgt[2] += (want[2] - cam.tgt[2]) * k;
    cam.tgt[1] += (want[1] - cam.tgt[1]) * ky;
    if (cam.tgt[1] - want[1] > 3.5) cam.tgt[1] = want[1] + 3.5;
    if (want[1] - cam.tgt[1] > 5) cam.tgt[1] = want[1] - 5;
    cam.look += ((pl.looking ? 1 : 0) - cam.look) * Math.min(1, dt * 5);
    const pitch = lerp(cam.pitch, -0.5, cam.look), dist = lerp(cam.dist, 3.2, cam.look);
    const cp = Math.cos(pitch);
    const dir = [Math.sin(cam.yaw) * cp, Math.sin(pitch), Math.cos(cam.yaw) * cp];
    let t = dist;
    for (const b of cur.solids) {
      if (!CAM_HIT.has(b.tag)) continue;
      const h = rayBox(cam.tgt, dir, b, t);
      if (h < t) t = Math.max(1.2, h - 0.35);
    }
    const pos = [cam.tgt[0] + dir[0] * t, cam.tgt[1] + dir[1] * t, cam.tgt[2] + dir[2] * t];
    const gy = groundAt(cur, pos[0], pos[2], pos[1] + 0.6, 0.1);
    if (pos[1] < gy + 0.5) pos[1] = gy + 0.5;
    if (cam.shake > 0 && !reduceMotion) {
      pos[0] += (Math.random() - 0.5) * cam.shake; pos[1] += (Math.random() - 0.5) * cam.shake;
      cam.shake = Math.max(0, cam.shake - dt * 1.6);
    }
    cam.pos = pos;
    const look = [cam.tgt[0], cam.tgt[1] + cam.look * 4, cam.tgt[2]];
    cam.view = M4.lookAt(pos, look, [0, 1, 0]);
  }
  function toScreen(p) {
    const v = M4.point(cam.view, p);
    if (v[2] > -0.1) return null;
    const x = cam.proj[0] * v[0] / -v[2], y = cam.proj[5] * v[1] / -v[2];
    return [(x * 0.5 + 0.5) * innerWidth, (-y * 0.5 + 0.5) * innerHeight];
  }

  /* ═══════════ Einblendungen ═══════════ */
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'prompt outlined';
    el.style.cssText = 'bottom:auto;top:64px;z-index:880';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }
  function showCourse(name) {
    document.querySelectorAll('.course-name').forEach((old) => old.remove());
    const el = document.createElement('div');
    el.className = 'course-name outlined';
    el.textContent = name;
    const s = document.createElement('small');
    s.className = 'outlined';
    s.textContent = '★ ' + starCount() + ' / ' + STAR_TOTAL;
    el.appendChild(s);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2900);
  }
  function popNumber(pos, n) {
    const s = toScreen(pos);
    if (!s) return;
    const el = document.createElement('div');
    el.className = 'pop-num outlined';
    el.style.left = s[0] + 'px'; el.style.top = s[1] + 'px'; el.style.color = '#ff4040';
    el.textContent = n;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }
  const promptEl = $('#prompt');
  let promptKey = '';
  function updatePrompt(it) {
    const dev = Input.st.device;
    let key = '';
    if (it) {
      const btn = it.btn === 'look' ? (dev === 'pad' ? 'Y' : 'C') : it.btn === 'jump' ? (dev === 'pad' || dev === 'touch' ? 'A' : '␣') : (dev === 'pad' || dev === 'touch' ? 'B' : 'F');
      key = btn + '\n' + it.label;
    }
    if (key === promptKey) return;
    promptKey = key;
    if (!key) { promptEl.hidden = true; return; }
    const [btn, label] = key.split('\n');
    const b = document.createElement('b');
    b.textContent = btn;
    promptEl.replaceChildren(b, document.createTextNode(label));
    promptEl.hidden = false;
  }

  /* ═══════════ Level wechseln, Titel, Pause, Ende ═══════════ */
  // Welten werden erst beim ersten Betreten gebaut
  const BUILDERS = {
    garden: buildGarden, hall: buildHall, desert: buildDesert, terminal: buildTerminal, video: buildVideo,
    bounce: buildBounce, spuk: buildSpuk, uhrwerk: buildUhrwerk, fraktal: buildFraktal, pilz: buildPilz, neon: buildNeon,
    verlies: buildVerlies, bibliothek: buildBibliothek, aquarium: buildAquarium, musik: buildMusik, spiel: buildSpiel, sternwarte: buildSternwarte,
    keller: buildKeller, og: buildOG, hof: buildHof, gym: buildGym,
  };
  for (const w of Object.keys(PAINT_ROOMS)) BUILDERS['bild_' + w] = () => buildPaintRoom(w);
  function getLevel(key) {
    if (!levels[key]) {
      buildingKey = key;
      const L = BUILDERS[key]();
      buildingKey = null;
      L.key = key;
      for (const e of L.enemies) {
        const gy = groundAt(L, e.pos[0], e.pos[2], e.fromY ?? 60);
        if (gy > -Infinity) e.pos[1] = gy;
      }
      levels[key] = L;
    }
    return levels[key];
  }
  function enterLevel(name, pos, face, yaw) {
    if (pl.hold) { pl.hold.held = false; pl.hold.state = 'walk'; pl.hold.t = 0; pl.hold = null; }
    cur = getLevel(name);
    pl.pos = (pos || cur.spawn).slice(); pl.vel = [0, 0, 0]; pl.push = [0, 0, 0]; pl.speed = 0; pl.carry = [0, 0];
    cur.respawnAt = null;
    pl.face = face ?? cur.spawnFace; cam.yaw = yaw ?? cur.spawnYaw; cam.snap = true; cam.manual = 0;
    pl.grounded = true; pl.inWater = false; pl.entering = 0; pl.action = 'ground'; pl.flip = 0; pl.side = 0; pl.skid = false;
    pl.knock = 0; pl.groundBox = null; pl.h = PH; pl.waterJump = false; pl.hangBox = null; pl.ledgeCool = 0;
    parts.length = 0;
    // Feste Sterne stehen immer da (schon gesammelt -> als blasser Stern)
    for (const fs of cur.fixedStars) {
      const s = cur.stars.find((x) => x.id === fs.id);
      const fresh = { gone: false, ghost: !!state.stars[fs.id], t: 1, pos: fs.pos.slice(), y0: fs.pos[1] };
      if (!s) cur.stars.push(Object.assign({ id: fs.id }, fresh));
      else if (s.gone) Object.assign(s, fresh);
    }
    showCourse(cur.name);
  }
  let pendingReturn = null;
  function transition(fn) {
    mode = 'iris';
    const s = toScreen([pl.pos[0], pl.pos[1] + 1.1, pl.pos[2]]) || [innerWidth / 2, innerHeight / 2];
    Iris.close(s[0], s[1], 600)
      .then(() => { fn(); return Iris.open(null, null, 650); })
      .then(() => { if (mode === 'iris') mode = 'play'; });
  }
  const titleEl = $('#titleScreen');
  function start() {
    if (mode !== 'title') return;
    mode = 'iris';
    Input.lock();   // Maus einfangen (der Start-Klick zaehlt als Geste)
    Snd.unlock(); Snd.start();
    const b = $('#pressStart').getBoundingClientRect();
    Iris.close(b.left + b.width / 2, b.top + b.height / 2, 600).then(() => {
      titleEl.hidden = true;
      // Kommt man von einer Webseite zurueck, geht es vor dem Portal in derselben Welt weiter
      let ret = null;
      try { ret = JSON.parse(sessionStorage.getItem('glappa64-return') || 'null'); sessionStorage.removeItem('glappa64-return'); } catch (e) { ret = null; }
      if (ret && BUILDERS[ret.level] && Array.isArray(ret.pos)) { enterLevel(ret.level, ret.pos, ret.face || 0, ret.face || 0); pl.appearT = clock + 0.5; }
      else enterLevel(/[?&]gym\b/.test(location.search) ? 'gym' : 'garden');   // ?gym = Testlevel fuers Moveset
      if (state.music) Snd.music(true);
      return Iris.open(null, null, 700);
    }).then(() => { mode = 'play'; setTimeout(intro, 1300); });
  }
  function intro() {
    if (mode !== 'play' || Dialog.open) return;
    const dev = Input.st.device;
    if (!state.intro) {
      state.intro = true; save();
      Dialog.show('Wolki', [
        'Hallo! Ich bin Wolki, deine Kamerawolke. Willkommen im geheimen 3D-Schloss von Glappa!',
        'Du bist Glappo. ' + (dev === 'pad'
          ? 'Linker Stick = laufen, A = springen, B = Schlag (zweimal = Doppelschlag, im Lauf = Hechtsprung), rechter Stick = Kamera.'
          : dev === 'touch'
            ? 'Links laufen, A springen, B lesen und hauen – zum Umsehen einfach übers Bild wischen.'
            : 'WASD = laufen, Leertaste = springen, Linksklick = Schlag (zweimal = Doppelschlag, im Lauf = Hechtsprung), Maus bewegen = Kamera. ESC gibt die Maus frei, ein Klick ins Bild fängt sie wieder. Ein Controller geht auch!'),
        'Dreimal im Takt springen ergibt einen Dreifachsprung. ' + (dev === 'pad'
          ? 'Im Lauf LT/RT + A = Weitsprung, im Stand LT/RT + A = Rückwärtssalto, in der Luft LT/RT = Stampfer.'
          : dev === 'touch'
            ? 'Im Lauf Z + A = Weitsprung, im Stand Z + A = Rückwärtssalto, in der Luft Z = Stampfer.'
            : 'Im Lauf Shift + Leertaste = Weitsprung, im Stand Shift + Leertaste = Rückwärtssalto, in der Luft Shift = Stampfer.'),
        'Lies das Schild vor der Brücke – da steht, wo die 4 Sterne versteckt sind. Pause mit ' + (dev === 'pad' ? 'Start' : dev === 'touch' ? 'dem Pause-Knopf oben' : 'Esc') + '. Los geht\'s!',
      ]);
    } else {
      const n = starCount();
      Dialog.show('Wolki', [n >= STAR_TOTAL ? 'Willkommen zurück, Sterne-Profi! Alle Sterne gehören dir.' : `Willkommen zurück! Du hast ${n} von ${STAR_TOTAL} Sternen.`]);
    }
  }
  function openPause() {
    if (mode !== 'play' || Dialog.open) return;
    mode = 'pause'; Input.unlock();
    Snd.pause(); Snd.music(false);
    $('#pauseCourse').textContent = `${cur.name} · ★ ${starCount()} / ${STAR_TOTAL} · Münzen ${run.coins}`;
    const ul = $('#starList');
    ul.replaceChildren();
    for (const [id, s] of Object.entries(STARS)) {
      const li = document.createElement('li'), sp = document.createElement('span');
      if (state.stars[id]) li.className = 'got';
      sp.textContent = state.stars[id] ? s.name : `${s.name} (${s.where})`;
      li.appendChild(sp); ul.appendChild(li);
    }
    $('#btnLeave').hidden = cur.key === 'garden' || cur.key === 'hall';
    $('#btnLeave').textContent = HOME[cur.key] && HUBS[HOME[cur.key]] ? 'Zurück: ' + HUBS[HOME[cur.key]].name : 'Zurück ins Schloss';
    $('#pause').hidden = false;
    CatPick.open();
    FilterPick.sync();
    $('#btnResume').focus({ preventScroll: true });
  }
  function closePause() {
    if (mode !== 'pause') return;
    $('#pause').hidden = true;
    mode = 'play'; uiCool = 0.12;
    Input.lock();
    Snd.pause();
    if (state.music) Snd.music(true);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function closeEnding() {
    mode = 'iris'; Input.lock();
    Iris.close(null, null, 500).then(() => {
      $('#ending').hidden = true;
      // weiter vor der Tuer, durch die es zum Ende ging (oben im Turm)
      if (cur.endSpot) enterLevel(cur.key, cur.endSpot.pos, cur.endSpot.face, cur.endSpot.face + Math.PI);
      else enterLevel('hall', [0, 5, -24], 0, Math.PI);
      return Iris.open(null, null, 600);
    }).then(() => { mode = 'play'; });
  }
  function resetGame() {
    if (!confirm('Spielstand wirklich löschen? Alle Sterne sind dann weg.')) return;
    try { localStorage.removeItem(KEY); sessionStorage.removeItem('glappa64-return'); } catch (e) {}
    location.reload();
  }
  let pauseNav = 0;
  function handleUI(inp) {
    if (mode === 'title') { if (inp.startP) start(); return; }
    if (Dialog.open) {
      if (inp.jumpP || inp.actionP || inp.startP) Dialog.advance();
      inp.jumpP = inp.actionP = inp.zP = inp.lookP = false;
      uiCool = 0.12;
      return;
    }
    if (mode === 'play' && inp.pauseP) { openPause(); return; }
    if (mode === 'pause') {
      // Figur wechseln: Stick / Steuerkreuz / Pfeiltasten links-rechts (je Druck ein Schritt)
      const dir = inp.mx > 0.6 ? 1 : inp.mx < -0.6 ? -1 : 0;
      const onCard = document.activeElement && document.activeElement.classList.contains('cat-card');
      if (dir && dir !== pauseNav && !onCard) CatPick.step(dir);
      pauseNav = dir;
      if (inp.lookP) FilterPick.step(1);
    }
    if (mode === 'pause' && (inp.pauseP || (Input.st.device === 'pad' && inp.actionP)) && performance.now() - Input.lockLostT > 350) { closePause(); return; }
    if (mode === 'ending' && Input.st.device === 'pad' && inp.jumpP) closeEnding();
  }

  /* ═══════════ Spielschritt ═══════════ */
  const STEP_DT = 1 / 120;
  // Bewegliche Plattformen verschieben und mitfahrende Spieler mitnehmen
  function updateMovers(L, dt) {
    for (const m of L.movers) {
      const o = m.fn(time);
      const d = [o[0] - m.off[0], o[1] - m.off[1], o[2] - m.off[2]];
      m.off = o;
      m.vel = [d[0] / dt, d[1] / dt, d[2] / dt];
      for (let i = 0; i < 3; i++) { m.b.min[i] = m.base[i] + o[i] - m.half[i]; m.b.max[i] = m.base[i] + o[i] + m.half[i]; }
      if (pl.grounded && pl.groundBox === m.b) { pl.pos[0] += d[0]; pl.pos[1] += d[1]; pl.pos[2] += d[2]; }
    }
    for (const k of L.blinkers) {
      const ph = (((time / k.period + k.phase) % 1) + 1) % 1;
      const on = ph < k.on;
      k.warn = on && ph > k.on - 0.14;
      if (on !== k.visible) {
        k.visible = on;
        k.b.min[1] = on ? k.y[0] : -9999; k.b.max[1] = on ? k.y[1] : -9998;
      }
    }
  }
  function step(dt, inp) {
    time += dt;
    Input.st.lastJumpHeld = inp.jump;
    updateMovers(cur, dt);
    updatePlayer(dt, inp);
    const L = cur;
    if (L.update) L.update(dt);
    for (const it of L.items) {
      if (it.taken || pl.dead) continue;
      if (v3.len(v3.sub(it.pos, [pl.pos[0], pl.pos[1] + 0.8, pl.pos[2]])) < it.r) {
        it.taken = true;
        sparkle([it.pos[0], it.pos[1] + 1, it.pos[2]]);
        it.onTake(it);
      }
    }
    for (const e of L.enemies) {
      if (e.type === 'grummel') updGrummel(e, dt);
      else if (e.type === 'bomb') updBomb(e, dt);
      else if (e.type === 'roller') updRoller(e, dt);
      else if (e.type === 'ghost') updGhost(e, dt);
      else if (e.type === 'spiky') updSpiky(e, dt);
      else if (e.type === 'bat') updBat(e, dt);
      else if (e.type === 'hopper') updHopper(e, dt);
      else if (e.type === 'virus') updVirus(e, dt);
      else if (e.type === 'worm') updWorm(e, dt);
      else if (e.type === 'popup') updPopup(e, dt);
      else updToast(e, dt);
    }
    if (!pl.dead && !pl.entering) {
      const cx = pl.pos[0], cy = pl.pos[1] + 1.1, cz = pl.pos[2];
      for (const c of L.coins) {
        if (c.taken || c.hidden) continue;
        const dx = c.pos[0] - cx, dy = c.pos[1] - cy, dz = c.pos[2] - cz;
        if (dx * dx + dy * dy * 0.5 + dz * dz < 1.7) collectCoin(L, c);
      }
      for (const s of L.stars) {
        if (s.gone || s.t < 0.9) continue;
        if (v3.len(v3.sub(s.pos, [cx, cy, cz])) < 1.9) { collectStar(L, s); break; }
      }
    }
    if (L.sun && pl.looking && dist2D(pl.pos, L.sun.spot) < L.sun.r) {
      pl.lookT += dt;
      if (pl.lookT > 1.1) { pl.lookT = 0; sunTrigger(); }
    } else pl.lookT = 0;
    updateSwitch(dt);
    if (inp.actionP && !pl.dead && pl.frozen <= 0 && !pl.entering) {
      if (pl.hold) throwHold();                      // in der Luft und im Lauf: werfen
      else {
        const it = interactable();
        if (it && it.act) it.act();
        else attack();
      }
    }
    if (inp.zP && pl.hold && pl.grounded) dropHold(true);
    if (pl.entering) pl.entering += dt;
  }
  function ambient(dt) {
    for (const L of Object.values(levels)) for (const s of L.stars) s.t += dt;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0) { parts.splice(i, 1); continue; }
      q.v[1] -= q.g * dt;
      q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
    }
    if (mode === 'play' && !Dialog.open) Life.update(cur, Math.min(dt, 0.05));
    const sd = levels.hall.starDoor;
    if (sd.opening || (state.doorOpen && starCount() >= 4 && sd.open > 0)) sd.open = Math.min(1, sd.open + dt / 1.3);
  }

  /* ═══════════ Zeichnen ═══════════ */
  const SHADOW_TINT = [0, 0, 0, 1];
  const UNDERWATER = hex('#1a5a8a');
  let clock = 0;
  // Wasserfall: durchscheinender Vorhang, Schaumstreifen laufen nach unten, unten Gischt
  function drawFall(f) {
    const H = f.top - f.bot, ax = f.axis === 'x', my = (f.top + f.bot) / 2;
    draw(MESH.cube, M4.from(f.x, my, f.z, 0, 0, 0, ax ? f.w : 0.3, H, ax ? 0.3 : f.w), { tint: f.col || [0.55, 0.8, 1, 1], alpha: 0.5, lit: 0 });
    const n = Math.round(f.w * 1.6);
    for (let i = 0; i < n; i++) {
      const u = (((i * 0.618) % 1) - 0.5) * (f.w - 0.5), k = (clock * (f.speed || 9) / H + i * 0.37) % 1;
      const len = Math.min(2.4, H * 0.25), y = f.top - k * (H - len) - len / 2;
      draw(MESH.cube, M4.from(f.x + (ax ? u : 0), y, f.z + (ax ? 0 : u), 0, 0, 0, ax ? 0.3 : 0.4, len, ax ? 0.4 : 0.3),
        { tint: [1, 1, 1, 1], alpha: 0.55 * Math.sin(k * Math.PI), lit: 0 });
    }
    for (let i = 0; i < 5; i++) {
      const u = (i / 4 - 0.5) * f.w * 0.8, s = 0.9 + Math.sin(clock * 5 + i * 1.7) * 0.35;
      draw(MESH.ball, M4.from(f.x + (ax ? u : 0), f.bot + 0.2, f.z + (ax ? 0 : u), 0, 0, 0, s, s * 0.6, s), { tint: [1, 1, 1, 1], alpha: 0.35, lit: 0 });
    }
  }
  function shadowAt(x, y, z, size) {
    const gy = groundAt(cur, x, z, y + 0.2, 0.25);
    if (gy === -Infinity) return;
    const k = 1 - clamp((y - gy) / 14, 0, 0.6);
    draw(MESH.shadow, M4.from(x, gy + 0.04, z, 0, 0, 0, size * k), { tint: SHADOW_TINT, alpha: 0.32, lit: 0 });
  }
  let faceLast = 0, turnRate = 0;
  function drawPlayer() {
    const cine = Cine.active;
    // Eintauchen: aufleuchten, in die Laenge ziehen, verschwinden (die Funken fliegen ins Bild)
    let dissolve = 0;
    if (cine) {
      dissolve = clamp(cine.t / 0.38, 0, 1);
      if (dissolve >= 1) return;
    }
    if (pl.invuln > 0 && !pl.dead && !cine && Math.floor(clock * 14) % 2) return;
    const p = pl.pos;
    const appear = clamp((clock - pl.appearT) / 0.55, 0, 1);
    const ek = appear < 1 ? Math.max(0.02, 1 - Math.pow(1 - appear, 3) + Math.sin(appear * Math.PI) * 0.2) : 1;
    const sq = pl.squash, sx = 1 / Math.sqrt(sq);
    const a = pl.action;
    let spin = (a === 'pound' && pl.pound < 0.3 ? pl.pound / 0.3 * TAU : 0) + dissolve * dissolve * 9;
    let rx = 0, rz = 0, dy = 0;
    const lying = pl.knock > 0, swim = a === 'swim' && !pl.grounded;
    const swim01 = swim ? clamp(pl.speed / 4.8, 0, 1) : 0;
    if (a === 'triple') rx = pl.flip;
    else if (a === 'backflip') rx = -pl.flip;
    else if (a === 'sideflip') rz = pl.flip;
    else if (a === 'long') rx = 1.15;
    else if (a === 'dive') rx = 1.45;
    else if (a === 'slide') { rx = 1.52; dy = -0.78; }
    else if (a === 'rollout') rx = pl.flip;
    else if (a === 'bonk') rx = -0.55;
    else if (a === 'double') rx = clamp(-pl.vel[1] * 0.016, -0.3, 0.42);
    else if (swim) { rx = lerp(0.25, 1.35, swim01); dy = swim01 * 0.35 + Math.sin(pl.swimPh * 0.5) * 0.05; }
    else if (a === 'climb') rx = Math.sin(pl.climbK * Math.PI) * 0.55;
    else if (lying) { rx = -1.3; dy = -0.72; }
    else if (pl.crawl) { rx = 1.2; dy = -0.62; }
    else if (pl.skid) rx = -0.35;
    let stretch = 1 + dissolve * 0.6, thin = 1 - dissolve * 0.6;
    if (a === 'double') { const k = clamp(pl.vel[1] * 0.012, -0.12, 0.16); stretch += k; thin -= k * 0.55; }
    // Schlag schnell raus, langsamer zurueck
    const pk = pl.punchT > 0 && pl.punchN > 0 ? 1 - pl.punchT / pl.punchDur : -1;
    const pExt = pk < 0 ? 0 : pk < 0.35 ? smooth(pk / 0.35) : 1 - smooth((pk - 0.35) / 0.65) * 0.85;
    let twist = 0;
    if (pk >= 0) {
      if (pl.punchN === 1) twist = -0.3 * Math.sin(Math.PI * pk);
      else if (pl.punchN === 2) twist = 0.35 * Math.sin(Math.PI * pk);
      else { twist = -0.7 * pExt; rx -= 0.32 * pExt; dy += 0.1 * Math.sin(Math.PI * pk); }   // Tritt: zurueck lehnen, Hueftdrehung
    }
    const run01 = clamp(Math.abs(pl.speed) / RUN, 0, 1), sw = Math.sin(pl.walk);
    // Drehrate merken: daraus kommen Kurvenlage, Kopfblick und Schweifschwung
    const dF = angDiff(faceLast, pl.face);
    faceLast = pl.face;
    turnRate = turnRate * 0.82 + dF * 18;
    const turn = clamp(turnRate, -1.2, 1.2);
    const free = pl.grounded && !lying && !pl.crawl && !pl.crouch && !swim && a !== 'slide' && a !== 'dive';
    if (free) { rx += 0.2 * run01 * run01; rz += -turn * 0.22 * run01; }
    // Leerlauf-Animationen (siehe idleState): Drehung/Hocke hier, Glieder weiter unten
    const idle = free && run01 < 0.05 && !pl.hold && pk < 0 && !cine ? idleState(pl.idleT || 0) : null;
    const env = idle ? idle.env : 0;
    if (idle && idle.kind === 'chase') { spin += smooth(idle.k) * TAU * 2; dy += Math.abs(Math.sin(idle.k * Math.PI * 8)) * 0.1 * env; }
    if (idle && idle.kind === 'stretch') { stretch += 0.07 * env; thin -= 0.035 * env; dy += 0.06 * env; }
    if (idle && idle.kind === 'sleep') { dy -= 0.46 * env; rx -= 0.14 * env; }
    const base = M4.mul(M4.from(p[0], p[1] + 1.1 + dy, p[2], pl.face + spin + twist, rx, rz),
      M4.from(0, -1.1, 0, 0, 0, 0, sx * ek * thin, sq * ek * stretch, sx * ek * thin));
    let legL, legR, armL, armR, armOut = 0.2, headTilt = 0;
    let tailRx = -1.85 + run01 * 0.35, tailRz = Math.sin(clock * 2.3) * 0.3;
    if (lying) {
      legL = -1.1; legR = -0.7; armL = armR = -2.8; armOut = 1.2; headTilt = 0.4;
    } else if (a === 'hang') {
      const s2 = Math.sin(clock * 2.2);
      armL = armR = -3.05; armOut = 0.22; legL = -0.12 + s2 * 0.1; legR = 0.08 - s2 * 0.1; headTilt = -0.35;
      tailRx = -2.6; tailRz = s2 * 0.4;
    } else if (a === 'climb') {
      const k = pl.climbK;
      armL = armR = lerp(-3.05, -0.4, smooth(k)); armOut = 0.25 + Math.sin(k * Math.PI) * 0.5;
      legL = -Math.sin(k * Math.PI) * 1.5; legR = -Math.sin(Math.min(1, k * 1.2) * Math.PI) * 1.1; headTilt = -0.2;
    } else if (swim) {
      // Treten auf der Stelle <-> Brustschwimmen; ein A-Zug zieht die Arme kraeftig durch
      const ph = pl.swimPh, stroke = clamp(1 - (clock - pl.strokeT) / 0.55, 0, 1);
      const tA = -1.35 + Math.sin(ph) * 0.35, tOut = 0.95 + Math.cos(ph) * 0.35;
      const sK = 0.5 + 0.5 * Math.sin(ph - stroke * 3);
      const bA = lerp(-3.0, -0.7, Math.max(sK, stroke)), bOut = 0.25 + Math.sin(Math.max(sK, stroke) * Math.PI) * 1.15;
      armL = lerp(tA, bA, swim01); armR = lerp(-1.35 - Math.sin(ph) * 0.35, bA, swim01); armOut = lerp(tOut, bOut, swim01);
      legL = Math.sin(ph * (1.2 + swim01)) * (0.35 + swim01 * 0.15); legR = -legL;
      headTilt = -swim01 * 1.0;
      tailRx = lerp(-1.3, -2.7, swim01); tailRz = Math.sin(ph * 1.3) * 0.55;
    } else if (pl.grounded && pl.crawl) {
      const c = Math.sin(pl.walk * 2.4);
      armL = -1.3 + c * 0.5; armR = -1.3 - c * 0.5; legL = 0.7 - c * 0.45; legR = 0.7 + c * 0.45; armOut = 0.15; headTilt = -0.9;
      tailRx = -2.4;
    } else if (pl.grounded && pl.crouch) {
      legL = legR = -0.5; armL = armR = -0.6; armOut = 0.4;
    } else if (a === 'bonk') {
      legL = -0.9; legR = -0.5; armL = armR = -2.7; armOut = 1;
    } else if (pl.grounded && pl.skid) {
      legL = -0.6; legR = -0.2; armL = armR = -1.2; armOut = 0.9;
    } else if (pl.grounded) {
      legL = sw * 0.95 * run01; legR = -legL; armL = -legL * 0.8; armR = legL * 0.8;
      if (run01 < 0.05) { armOut = 0.12 + Math.sin(clock * 2) * 0.03; }
      tailRz += sw * 0.25 * run01;
    } else if (a === 'pound') {
      legL = legR = -1.2; armL = armR = -0.4; armOut = 1.1;
    } else if (a === 'long') {
      legL = legR = 0.9; armL = armR = -1.7; armOut = 0.15; tailRx = -2.9;
    } else if (a === 'dive' || a === 'slide') {
      armL = armR = -3.05; armOut = 0.18; legL = 0.25; legR = 0.15; headTilt = -1.1; tailRx = -3.0;
      if (a === 'slide') { const w = Math.sin(clock * 18) * 0.08 * clamp(pl.speed / 10, 0, 1); armOut += w; legL += w; }
    } else if (a === 'triple' || a === 'backflip' || a === 'sideflip' || a === 'rollout') {
      legL = legR = -1.3; armL = armR = -0.5; armOut = 0.6;
    } else if (a === 'double') {
      // Zweiter Sprung: Hocke mit angezogenen Knien, Arme hoch — beim Fallen streckt sich alles wieder
      const up = clamp(pl.vel[1] / 16, -1, 1), tuck = clamp(0.4 + up * 0.8, 0, 1);
      legL = -1.5 * tuck - 0.1; legR = -1.2 * tuck + 0.14;
      armL = armR = -2.5 - 0.5 * tuck; armOut = 0.3 + 0.6 * tuck;
      headTilt = 0.2 * up;
      tailRx = -2.5 + (1 - tuck) * 0.9; tailRz += Math.sin(clock * 7) * 0.14;
    } else {
      legL = -0.7; legR = 0.35; armL = armR = -2.4; armOut = 0.5; tailRx = -1.3 + clamp(pl.vel[1] * 0.04, -0.6, 0.4);
    }
    if (pl.hold && !lying && !swim) {               // Kiste ueber dem Kopf: beide Arme hoch
      armL = armR = -3.02; armOut = 0.24; headTilt = Math.min(headTilt, -0.1);
      tailRx = -2.2;
    }
    if (pk >= 0) {
      if (pl.punchN === 1) { armR = lerp(armR ?? 0, -1.62, pExt); armL = lerp(armL ?? 0, 0.35, pExt); }
      else if (pl.punchN === 2) { armL = lerp(armL ?? 0, -1.62, pExt); armR = lerp(armR ?? 0, 0.35, pExt); }
      else {
        legR = lerp(legR ?? 0, -1.75, pExt); legL = lerp(legL ?? 0, 0.25, pExt);
        armL = lerp(armL ?? 0, -0.9, pExt); armR = lerp(armR ?? 0, 0.7, pExt); armOut = lerp(armOut, 0.9, pExt);
        tailRx = lerp(tailRx, -1.1, pExt);
      }
    }
    // Leerlauf: Glieder, Kopf und Lider je nach Animation
    let armOutR = null, headYawAdd = 0, lidK = 0;
    if (idle) {
      const e = env, s = Math.sin;
      if (idle.kind === 'look') {                       // Umschauen: erst links, dann rechts
        headYawAdd = s(idle.k * TAU) * 0.85 * e; headTilt -= 0.12 * e; tailRz += s(clock * 3) * 0.3 * e;
      } else if (idle.kind === 'stretch') {             // Strecken und Gaehnen: Arme hoch, Kopf in den Nacken
        armL = armR = lerp(armL, -2.95, e); armOut = lerp(armOut, 0.55, e); headTilt -= 0.5 * e;
        tailRx = lerp(tailRx, -2.7, e); lidK = smooth((e - 0.55) / 0.35);
      } else if (idle.kind === 'paw') {                 // Pfote putzen: rechte Pfote ans Gesicht, lecken
        armR = lerp(armR, -2.3 + s(clock * 9) * 0.14 * e, e); armOutR = lerp(armOut, -0.5, e);
        headTilt += 0.32 * e; headYawAdd = -0.3 * e; lidK = 0.6 * e; tailRz += s(clock * 1.7) * 0.4 * e;
      } else if (idle.kind === 'chase') {               // Schwanz jagen: dreht sich im Kreis, huepft
        headYawAdd = 0.75 * e; tailRz += s(clock * 12) * 0.6 * e; armOut = lerp(armOut, 0.85, e); armL = armR = lerp(armL, -0.9, e);
        legL = lerp(legL, -0.35 * Math.abs(s(idle.k * Math.PI * 8)), e); legR = lerp(legR, 0.2, e);
      } else if (idle.kind === 'sleep') {               // Einschlafen: hinsetzen, Kopf sinkt, Augen zu
        legL = legR = -1.45 * e; armL = armR = -0.35 * e; armOut = lerp(armOut, 0.4, e);
        headTilt += 0.42 * e + s(clock * 1.1) * 0.03 * e; tailRx = lerp(tailRx, -1.25, e); tailRz = lerp(tailRz, 1.0, e);
        lidK = e > 0.6 ? 1 : 0;
      }
    }
    if (mode === 'starget' && pl.grounded) { armR = -2.95; armOutR = 0.35; armL = -0.4; headTilt -= 0.3; }   // Siegerpose
    if (pl.looking) headTilt = -0.55;
    const bob = pl.grounded ? Math.abs(sw) * 0.05 * run01 + Math.sin(clock * 2.2) * 0.012 : 0;
    const glowK = dissolve > 0 ? dissolve : appear < 1 ? (1 - appear) * 0.9 : 0;
    const FIG = { shine: 0.06, rim: 0.16 + glowK * 1.6, lit: 0.78, tint: glowK > 0 ? [1, 1, 0.92, glowK] : undefined };
    const G = CAT, RG = G.rig, GLOW = { lit: 0, tint: FIG.tint };
    const part = (key, tx, ty, tz, rx2, rz2, o = FIG, ry2 = 0, sc = 1) => {
      const m = M4.mul(base, M4.from(tx, ty + bob, tz, ry2, rx2, rz2, sc, sc, sc));
      draw(G[key], m, o);
      if (G.glow[key]) draw(G.glow[key], m, GLOW);
      return m;
    };
    part('leg', -RG.legX, RG.legY - bob, 0, legL, 0);
    part('leg', RG.legX, RG.legY - bob, 0, legR, 0);
    // Atmen im Stand: der Koerper hebt und senkt sich ganz leicht
    const sleeping = idle && idle.kind === 'sleep';
    const breathe = pl.grounded && run01 < 0.05 && !lying ? 1 + Math.sin(clock * (sleeping ? 1.1 : 1.7)) * (sleeping ? 0.035 : 0.016) : 1;
    part('body', 0, RG.bodyY, 0, 0, 0, FIG, 0, breathe);
    // Schweif schwingt in Kurven nach aussen
    part('tail', 0, RG.tailY, RG.tailZ, tailRx, tailRz + turn * 0.35);
    part('arm', -RG.armX, RG.armY, 0, armL, -armOut);
    part('arm', RG.armX, RG.armY, 0, armR, armOutR ?? armOut);
    // Kopf schaut leicht in die Kurve; alle paar Sekunden ein Ohrenzucken
    const twitch = Math.max(0, Math.sin(clock * 0.41)) > 0.995 ? Math.sin(clock * 40) * 0.08 : 0;
    const headOpt = { shine: 0.14, rim: FIG.rim, lit: 0.78, tint: FIG.tint };
    // im Stand schaut der Kopf ein Stueck zur Kamera, im Lauf in die Kurve
    const toCam = angDiff(pl.face, Math.atan2(cam.pos[0] - p[0], cam.pos[2] - p[2]));
    const headYaw = (run01 < 0.06 && pl.grounded && !lying ? clamp(toCam, -0.55, 0.55) * 0.5 * (1 - env) : clamp(turn * 0.25, -0.35, 0.35)) + headYawAdd;
    const headM = part('head', 0, RG.headY, RG.headZ, headTilt, Math.sin(clock * 1.3) * 0.05 + twitch, headOpt, headYaw);
    // Blinzeln: das Lid wird in der Hoehe aufgezogen (beim Gaehnen/Schlafen bleibt es zu)
    const bl = swim || lying ? 0 : Math.max(blinkAt(clock, 0), lidK);
    if (G.lids && bl > 0.02) draw(G.lids, M4.mul(headM, M4.from(0, 0, 0, 0, 0, 0, 1, bl, 1)), headOpt);
    // Schlaf-Zs steigen aus dem Kopf auf
    if (sleeping && env > 0.6 && clock - zzzT > 1.3) { zzzT = clock; zzz.push({ t0: clock, p: M4.point(headM, [0.2, 0.35, 0]) }); }
    for (let i = zzz.length - 1; i >= 0; i--) {
      const zq = zzz[i], age = clock - zq.t0;
      if (age > 2.6 || !sleeping) { zzz.splice(i, 1); continue; }
      const x = zq.p[0] + Math.sin(age * 2.2) * 0.25 + age * 0.2, y = zq.p[1] + age * 0.75, z = zq.p[2];
      const sc = (0.1 + age * 0.09) * Math.min(1, age * 4) * Math.min(1, (2.6 - age) * 3);
      draw(MESH.zee, M4.from(x, y, z, Math.atan2(cam.pos[0] - x, cam.pos[2] - z), 0, Math.sin(age * 3) * 0.2, sc), { lit: 0, tint: [0.85, 0.9, 1, 1] });
    }
  }
  const zzz = [];
  let zzzT = -9;
  /* Leerlauf-Abfolge: nach 3 s alle 4 s eine Animation (Umschauen, Strecken, Pfote putzen,
     Schwanz jagen), ab 19 s schlaeft Glappo ein. env blendet jede Animation weich ein und aus. */
  const IDLE_START = 3, IDLE_CYCLE = 4, IDLE_SLEEP = 19, IDLE_KINDS = ['look', 'stretch', 'paw', 'chase'];
  function idleState(t) {
    if (t < IDLE_START) return null;
    if (t >= IDLE_SLEEP) { const k = Math.min(1, (t - IDLE_SLEEP) / 1.4); return { kind: 'sleep', k, env: smooth(k) }; }
    const u = t - IDLE_START, k = (u % IDLE_CYCLE) / IDLE_CYCLE;
    return { kind: IDLE_KINDS[Math.floor(u / IDLE_CYCLE) % IDLE_KINDS.length], k, env: smooth(Math.min(k, 1 - k) / 0.18) };
  }
  // Figur im Stand (fuer die Vorschau im Pausenmenue); winkt, wenn sie ausgewaehlt ist
  function drawCatIdle(G, base, t, waving) {
    const RG = G.rig, FIG = { shine: 0.06, rim: 0.16, lit: 0.78 }, GLOW = { lit: 0 };
    const bob = Math.sin(t * 2.2) * 0.012;
    const part = (key, tx, ty, tz, rx2, rz2, o = FIG, ry2 = 0, sc = 1) => {
      const m = M4.mul(base, M4.from(tx, ty + bob, tz, ry2, rx2, rz2, sc, sc, sc));
      draw(G[key], m, o);
      if (G.glow[key]) draw(G.glow[key], m, GLOW);
      return m;
    };
    const wave = waving ? Math.sin(t * 7) * 0.35 : 0;
    part('leg', -RG.legX, RG.legY - bob, 0, 0, 0);
    part('leg', RG.legX, RG.legY - bob, 0, 0, 0);
    part('body', 0, RG.bodyY, 0, 0, 0);
    part('tail', 0, RG.tailY, RG.tailZ, -1.85, Math.sin(t * 2.3) * 0.3);
    part('arm', -RG.armX, RG.armY, 0, 0, -0.14);
    part('arm', RG.armX, RG.armY, 0, waving ? -2.7 : 0, waving ? 0.5 + wave : 0.14);
    const hOpt = { shine: 0.14, rim: 0.16, lit: 0.78 };
    const hm = part('head', 0, RG.headY, RG.headZ, 0, Math.sin(t * 1.3) * 0.05 + wave * 0.2, hOpt);
    const bl2 = blinkAt(t, 1);
    if (G.lids && bl2 > 0.02) draw(G.lids, M4.mul(hm, M4.from(0, 0, 0, 0, 0, 0, 1, bl2, 1)), hOpt);
  }
  /* ═══════════ Figurenwahl im Pausenmenue ═══════════
     Vier Karten mit echter 3D-Vorschau: gerendert in einen eigenen Bildpuffer und von dort
     in die kleinen Karten-Canvas kopiert. Die ausgewaehlte Figur dreht sich und winkt. */
  const CatPick = (() => {
    const SIZE = 192, root = $('#catPick');
    let fb = null, ok = false, px = null, img = null, t = 0, built = false;
    const cards = [];
    function setup() {
      if (fb) return ok;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIZE, SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SIZE, SIZE);
      fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      px = new Uint8Array(SIZE * SIZE * 4);
      img = new ImageData(new Uint8ClampedArray(px.buffer), SIZE, SIZE);
      return ok;
    }
    function paint(i) {
      const c = cards[i];
      if (!c || !ok) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.viewport(0, 0, SIZE, SIZE);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const proj = M4.persp(0.62, 1, 0.3, 40);
      proj[5] = -proj[5];                         // kopfueber rendern: readPixels liest von unten nach oben
      const eye = [0, 1.35, 3.9], sel = i === catIdx;
      gl.uniformMatrix4fv(U.uProj, false, proj);
      gl.uniformMatrix4fv(U.uView, false, M4.lookAt(eye, [0, 1.08, 0], [0, 1, 0]));
      gl.uniform3fv(U.uLight, v3.norm([-0.45, -0.75, -0.55]));
      gl.uniform3fv(U.uFogCol, [0, 0, 0]);
      gl.uniform2f(U.uFog, 1e5, 2e5);
      gl.uniform3fv(U.uCam, eye);
      gl.uniform1f(U.uDim, 1);
      const turn = sel ? 0.45 + Math.sin(t * 0.9) * 0.75 : 0.45;
      drawCatIdle(CATS[i], M4.from(0, 0, 0, turn), sel ? t : 0, sel);
      gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      c.ctx.putImageData(img, 0, 0);
    }
    function sync() {
      cards.forEach((c, i) => {
        c.el.setAttribute('aria-checked', String(i === catIdx));
        c.el.tabIndex = i === catIdx ? 0 : -1;
      });
    }
    function choose(i, sound = true) {
      const prev = catIdx;
      setCat(i);
      sync();
      if (sound) { Snd.unlock(); Snd.coin(); }
      paint(prev); paint(catIdx);
    }
    function build() {
      if (built) return;
      built = true;
      CATS.forEach((cat, i) => {
        const el = document.createElement('button');
        el.type = 'button'; el.className = 'cat-card'; el.setAttribute('role', 'radio');
        const cv = document.createElement('canvas');
        cv.width = cv.height = SIZE; cv.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.textContent = cat.name;
        el.append(cv, name);
        el.addEventListener('click', () => choose(i));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); choose(catIdx + 1); cards[catIdx].el.focus(); }
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); choose(catIdx - 1); cards[catIdx].el.focus(); }
        });
        root.appendChild(el);
        cards.push({ el, ctx: cv.getContext('2d') });
      });
    }
    return {
      open() {
        build(); sync();
        if (!setup()) return;
        t = 0;
        CATS.forEach((_, i) => paint(i));
      },
      tick(dt) { t += dt; paint(catIdx); },
      step(dir) { choose(catIdx + dir); },
    };
  })();
  // Bildfilter im Pause-Menue: drei Knoepfe, Auswahl bleibt gespeichert
  const FilterPick = (() => {
    const root = $('#filterPick');
    const ORDER = ['crt', 'n64', 'aus'];
    function sync() {
      for (const b of root.querySelectorAll('[data-filter]')) b.setAttribute('aria-checked', String(b.dataset.filter === state.filter));
      document.body.classList.toggle('fx-crt', state.filter === 'crt');
    }
    function set(f) { if (!ORDER.includes(f)) return; state.filter = f; save(); sync(); }
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-filter]'); if (b) set(b.dataset.filter); });
    root.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      set(ORDER[(ORDER.indexOf(state.filter) + d + ORDER.length) % ORDER.length]);
      root.querySelector(`[data-filter="${state.filter}"]`).focus();
    });
    sync();
    return { sync, set, step(d) { set(ORDER[(ORDER.indexOf(state.filter) + d + ORDER.length) % ORDER.length]); } };
  })();
  function drawEnemy(e) {
    const [x, y, z] = e.pos;
    if (e.type === 'grummel' && e.skin === 'bug') {
      if (e.state === 'dead') return;
      const squash = e.state === 'squash', W = M4.from(x, y + (squash ? 0 : Math.abs(Math.sin(e.anim * 2)) * 0.05), z, e.face, 0, 0, squash ? 1.2 : 1, squash ? 0.3 : 1, squash ? 1.2 : 1);
      draw(MESH.bug, W);
      if (!squash) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
        const sw = Math.sin(e.anim * 2 + k * 2.1 + (s > 0 ? Math.PI : 0)) * 0.35;
        draw(MESH.bugLeg, M4.mul(W, M4.from(s * 0.55, 0.35, 0.35 - k * 0.45, s * (Math.PI / 2 - 0.3) + sw, 0.35)));
      }
    } else if (e.type === 'grummel') {
      if (e.state === 'dead') return;
      const squash = e.state === 'squash';
      const hop = squash ? 0 : Math.abs(Math.sin(e.anim)) * 0.12;
      draw(MESH.grummel, M4.from(x, y + hop, z, e.face, 0, 0, squash ? 1.25 : 1, squash ? 0.26 : 1 + Math.sin(e.anim * 2) * 0.04, squash ? 1.25 : 1));
      if (!squash) {
        const s = Math.sin(e.anim) * 0.25;
        draw(MESH.foot, M4.mul(M4.from(x, y, z, e.face), M4.from(-0.4, 0, s)));
        draw(MESH.foot, M4.mul(M4.from(x, y, z, e.face), M4.from(0.4, 0, -s)));
      }
    } else if (e.type === 'bomb') {
      if (e.state === 'gone') return;
      const lit = e.state === 'lit';
      const flash = lit && Math.floor(clock * (e.t < 1 ? 16 : 7)) % 2;
      const W = M4.from(x, y + Math.abs(Math.sin(e.anim)) * 0.08, z, e.face, 0, Math.sin(e.anim) * 0.05);
      draw(MESH.bomb, W, { tint: flash ? [1, 1, 1, 0.6] : undefined });
      if (lit) draw(MESH.spark, M4.mul(W, M4.from(0, 1.98, 0, 0, 0, 0, 0.8 + Math.random() * 0.7)), { lit: 0 });
    } else if (e.type === 'roller') {
      if (e.state === 'wait') return;
      const r = e.r * e.scale;
      draw(MESH.roller, M4.from(x, y + r, z, e.face, e.roll, 0, r), { tint: e.tint || undefined, shine: 0.35 });
    } else if (e.type === 'ghost') {
      return;   // Geister kommen durchsichtig im zweiten Durchgang
    } else if (e.type === 'spiky') {
      if (e.state === 'dead') return;
      const wob = Math.sin(e.anim) * 0.08;
      draw(variantMesh('spiky', e.col), M4.from(x, y + Math.abs(Math.sin(e.anim)) * 0.06, z, e.face, 0, wob));
      const s = Math.sin(e.anim) * 0.2;
      draw(MESH.foot, M4.mul(M4.from(x, y, z, e.face), M4.from(-0.36, 0, s)));
      draw(MESH.foot, M4.mul(M4.from(x, y, z, e.face), M4.from(0.36, 0, -s)));
    } else if (e.type === 'bat' && e.skin === 'mail') {
      if (e.state === 'gone') return;
      const flap = Math.sin(e.anim * (e.state === 'swoop' ? 20 : 11));
      const W = M4.from(x, y + Math.abs(flap) * 0.08, z, e.face, e.state === 'swoop' ? 0.35 : 0, Math.sin(e.anim * 1.3) * 0.15);
      draw(MESH.mail, W);
      draw(MESH.mailFlap, M4.mul(W, M4.from(0, 0.06, 0.05, 0, 0.15 + Math.abs(flap) * 0.9)));
    } else if (e.type === 'virus') {
      if (e.state === 'off' || e.state === 'gone') return;
      const s = e.s * (1 + Math.sin(e.anim * 5) * 0.04), blink = e.inv > 0 && Math.floor(clock * 16) % 2;
      if (!blink) draw(e.gen ? VIRUS_MINI : VIRUS_BIG, M4.from(x, y, z, e.face, Math.sin(e.anim * 1.7) * 0.15, Math.sin(e.anim * 1.1) * 0.2, s), { shine: 0.25 });
    } else if (e.type === 'worm') {
      if (e.state === 'dead') return;
      const crash = e.state === 'crash', ck = crash ? (time - e.crashT) / 0.9 : 0;
      const hop = (k) => Math.abs(Math.sin(e.anim - k * 0.7)) * 0.18;
      e.segs.forEach((q, i) => {
        const k = i + 1, sc = (1 - i / (e.n * 1.6)) * (crash ? clamp(1 - (ck * 1.4 - (e.n - i) / e.n), 0, 1) : 1);
        if (sc <= 0.02) return;
        const nx = (e.segs[i - 1] || e.pos);
        draw(MESH.wormSeg, M4.from(q[0], q[1] + 0.4 * sc + hop(k), q[2], Math.atan2(nx[0] - q[0], nx[2] - q[2]), 0, 0, sc), { tint: i % 2 ? [0.6, 1, 0.5, 0.15] : undefined });
      });
      const hs = crash ? clamp(1 - ck * 1.4, 0, 1) : 1;
      if (hs > 0.02) draw(MESH.wormHead, M4.from(x, y + 0.45 * hs + hop(0), z, e.face, 0, Math.sin(e.anim) * 0.08, hs));
    } else if (e.type === 'popup') {
      if (e.state === 'gone' || e.open <= 0.01) return;
      const k = e.open, sc = k < 1 ? Math.sin(k * Math.PI * 0.5) * (1 + Math.sin(k * Math.PI) * 0.25) : 1;
      const W = M4.from(x, y, z, e.face, 0, Math.sin(e.anim * 2.2) * 0.06, sc);
      draw(MESH.popWin, W);
      drawSign(MESH.popFront, M4.mul(W, M4.from(0, 0, 0.075)), { tex: popupTexture(e.v), lit: 0.95 });
    } else if (e.type === 'bat') {
      if (e.state === 'gone') return;
      const W = M4.from(x, y, z, e.face), flap = Math.sin(e.anim * (e.state === 'swoop' ? 22 : 13)) * 0.7;
      draw(variantMesh('bat', e.col), W);
      const wing = variantMesh('wing', e.col);
      draw(wing, M4.mul(W, M4.from(0.25, 0.05, 0, 0, 0, flap)));
      draw(wing, M4.mul(W, M4.from(-0.25, 0.05, 0, 0, 0, -flap, -1, 1, 1)));
    } else if (e.type === 'hopper') {
      if (e.state === 'dead') return;
      const sq = e.state === 'squash' ? 0.25 : e.air ? 1 + clamp(e.vy * 0.03, -0.15, 0.25) : 0.85 + Math.abs(Math.sin(e.anim * 6)) * 0.05;
      draw(variantMesh('hopper', e.col), M4.from(x, y, z, e.face, 0, 0, 1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)), { shine: 0.5 });
    } else {
      const bounce = Math.abs(Math.sin(e.anim * 2)) * (e.speed > 1 ? 0.2 : 0.05);
      const W = M4.from(x, y + bounce, z, e.face, 0, Math.sin(e.anim * 2) * 0.06);
      draw(MESH.toaster, W);
      draw(MESH.toast, M4.mul(W, M4.from(-0.25, 1.22 + Math.max(0, Math.sin(e.anim * 3)) * 0.35, 0)));
      draw(MESH.toast, M4.mul(W, M4.from(0.25, 1.22 + Math.max(0, Math.sin(e.anim * 3 + 2)) * 0.35, 0)));
    }
  }
  // Schilder/Gemaelde: im kleinen Bild mit Alpha 0 markiert und fuer die scharfe Ebene gemerkt
  let signMark = 1;
  const signQueue = [];
  // Trip-Staerke der Welt (Wabern + Farbwellen); Schilder und Glappo selbst bleiben ruhig
  let curTrip = 0;
  const setTrip = (v) => { if (U.uTrip) gl.uniform1f(U.uTrip, v); };
  function drawSign(mesh, model, o) {
    if (curTrip) setTrip(0);
    draw(mesh, model, signMark ? o : { ...o, alpha: 0 });
    if (curTrip) setTrip(curTrip);
    if (!signMark) signQueue.push([mesh, model, o]);
  }
  function render() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(innerWidth * dpr)), h = Math.max(1, Math.round(innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    signMark = Post.begin(w, h) ? 0 : 1;
    signQueue.length = 0;
    const L = cur;
    // Unter Wasser: blauer, dichter Nebel
    let fogCol = L.fog, fogN = L.fogNear, fogF = L.fogFar;
    for (const wv of L.waters) {
      if (cam.pos[0] > wv.x0 && cam.pos[0] < wv.x1 && cam.pos[2] > wv.z0 && cam.pos[2] < wv.z1 && cam.pos[1] < wv.y) {
        fogCol = UNDERWATER; fogN = 1; fogF = 42;
      }
    }
    gl.clearColor(fogCol[0], fogCol[1], fogCol[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    cam.proj = M4.persp(0.95, w / h, 0.5, 900);
    gl.uniformMatrix4fv(U.uProj, false, cam.proj);
    gl.uniformMatrix4fv(U.uView, false, cam.view);
    gl.uniform3fv(U.uLight, L.light);
    gl.uniform3fv(U.uFogCol, fogCol);
    gl.uniform3fv(U.uCam, cam.pos);
    gl.uniform1f(U.uDim, L.dim ?? 1);
    curTrip = reduceMotion ? 0 : (L.trip || 0);
    setTrip(curTrip);
    if (U.uTime) gl.uniform1f(U.uTime, clock % 1000);
    if (L.sky && fogF > 100 && !Skybox.draw(L.sky, L.fog, cam.view, cam.proj)) {
      gl.uniform2f(U.uFog, 1e5, 2e5);
      gl.depthMask(false);
      draw(skyMesh(L.sky), M4.from(cam.pos[0], cam.pos[1], cam.pos[2]), { lit: 0 });
      gl.depthMask(true);
    }
    gl.uniform2f(U.uFog, fogN, fogF);
    draw(L.mesh, I4, { detail: 1 });
    if (L.glowMesh) draw(L.glowMesh, I4, { lit: 0 });
    for (const m of L.movers) if (!m.hidden) draw(m.mesh, M4.from(m.base[0] + m.off[0], m.base[1] + m.off[1], m.base[2] + m.off[2]), { detail: 1 });
    for (const k of L.blinkers) {
      if (k.visible && !(k.warn && Math.floor(clock * 14) % 2)) draw(k.mesh, M4.from(k.pos[0], k.pos[1], k.pos[2]), { lit: 0.3 });
    }
    for (const it of L.items) {
      if (!it.taken) draw(it.mesh, M4.from(it.pos[0], it.pos[1] + 0.2 + Math.sin(clock * 2) * 0.15, it.pos[2], clock * 1.4), { shine: 0.5, rim: 0.3 });
    }
    for (const an of L.anims) draw(an.mesh, an.fn(clock), an.o);
    Life.drawOpaque(L);
    if (L.drawSolid) L.drawSolid();
    for (const d of L.decals) drawSign(d.mesh, d.model, { tex: d.tex, lit: 0.9 });

    // Level-Extras (undurchsichtig)
    if (L.blueSwitch) {
      const sw = L.blueSwitch, ch = sw.pressed ? 0.15 : 0.6;
      draw(MESH.cube, M4.from(sw.pos[0], 0.05, sw.pos[2], 0, 0, 0, 2, 0.1, 2), { tint: [0.1, 0.14, 0.45, 1] });
      draw(MESH.cube, M4.from(sw.pos[0], ch / 2, sw.pos[2], 0, 0, 0, 1.5, ch, 1.5), { tint: [0.2, 0.45, 1, 1] });
    }
    if (L.paintings) {
      for (const pt of L.paintings) {
        if (!pt.noFrame) draw(MESH.frame, pt.frame);
        if (pt.rip && clock - pt.rip.t0 > 4) pt.rip = null;
        if (!pt.rip && mode === 'play' && Math.abs(paintAlong(pt, pl.pos)) < 3.5 && paintAway(pt, pl.pos) < 3.2 && pl.pos[1] < pt.y + 2) {
          pt.rip = { x: paintLocalX(pt, pl.pos), y: (pl.pos[1] + 1.1 - pt.y) / (pt.scale || 1), t0: clock, amp: 0.1 };
        }
        const rip = pt.rip ? [pt.rip.x, pt.rip.y, clock - pt.rip.t0, reduceMotion ? 0 : pt.rip.amp] : null;
        drawSign(MESH.painting, pt.model, { tex: pt.tex, lit: 0, rip, art: pt.art ? clock + 1 : 0, swirl: pt.swirl || 0 });
      }
    }
    if (L.starDoor) {
      const sd = L.starDoor, o = smooth(sd.open);
      draw(MESH.doorLeaf, M4.from(-3, 5, sd.pos[2] + 0.45, -o * 1.6));
      draw(MESH.doorLeaf, M4.from(3, 5, sd.pos[2] + 0.45, Math.PI + o * 1.6));
    }
    for (const c of L.coins) {
      if (c.taken || c.hidden) continue;
      if (c.kind === 'blue' && blueTimer < 3 && Math.floor(clock * 8) % 2) continue;
      draw(MESH.coin[c.kind], M4.from(c.pos[0], c.pos[1] + Math.sin(clock * 2 + c.spin) * 0.08, c.pos[2], clock * 3.2 + c.spin), { lit: 0.55 });
    }
    for (const s of L.stars) {
      if (s.gone) continue;
      const k = smooth(s.t / 0.9);
      s.pos[1] = s.y0 - 2 * (1 - k) + (s.t > 0.9 ? Math.sin(clock * 2.4) * 0.15 : 0);
      draw(MESH.star, M4.from(s.pos[0], s.pos[1], s.pos[2], clock * 2.6, 0, 0, 1.1 * Math.max(0.05, k)),
        { lit: 0.45, tint: s.ghost ? [0.55, 0.75, 1, 0.55] : undefined });
    }
    for (const e of L.enemies) drawEnemy(e);
    if (curTrip) setTrip(0);
    drawPlayer();
    if (curTrip) setTrip(curTrip);

    // Durchsichtiges
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-2, -2);
    if (!pl.entering) shadowAt(pl.pos[0], pl.pos[1], pl.pos[2], 0.75);
    for (const e of L.enemies) {
      if (e.state === 'dead' || e.state === 'gone' || e.state === 'wait' || e.state === 'off' || e.state === 'hide') continue;
      shadowAt(e.pos[0], e.pos[1], e.pos[2], e.type === 'toast' ? 0.9 : e.type === 'roller' ? e.r * e.scale : e.type === 'bat' ? 0.6 : 1);
    }
    for (const s of L.stars) if (!s.gone) shadowAt(s.pos[0], s.pos[1], s.pos[2], 0.9);
    if (L.marker && !L.stars.some((s) => s.id === 'red') && run.red < 8) {
      draw(MESH.marker, M4.from(L.marker[0], L.marker[1], L.marker[2], clock * 0.4), { lit: 0, alpha: 0.35 + Math.sin(clock * 3) * 0.1 });
    }
    if (L.sun) {
      draw(MESH.shadow, M4.from(L.sun.spot[0], 0.05, L.sun.spot[2], 0, 0, 0, L.sun.r), { tint: [1, 0.97, 0.72, 1], alpha: 0.42 + Math.sin(clock * 2) * 0.06, lit: 0 });
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    for (const wv of L.waters) {
      draw(wv.mesh || MESH.water, M4.from((wv.x0 + wv.x1) / 2, wv.y + Math.sin(clock * 1.5) * 0.04, (wv.z0 + wv.z1) / 2, 0, 0, 0, (wv.x1 - wv.x0) / 2, 1, (wv.z1 - wv.z0) / 2), { alpha: wv.alpha || 0.62, lit: 0.5, tint: wv.tint });
    }
    for (const k of L.blinkers) if (!k.visible) draw(k.mesh, M4.from(k.pos[0], k.pos[1], k.pos[2]), { alpha: 0.12, lit: 0 });
    for (const e of L.enemies) {
      if (e.type !== 'ghost' || e.state === 'gone') continue;
      const wob = Math.sin(e.anim * 3) * 0.08, hide = e.hide || 0;
      const GM = M4.from(e.pos[0], e.pos[1] + 0.25, e.pos[2], e.face, wob * 0.5, wob);
      draw(MESH.ghost, GM, { alpha: 0.78 * (1 - 0.7 * hide), lit: 0.45, rim: 0.4 });
      // schuechtern: Haende vor die Augen
      if (hide > 0.05) for (const s of [-1, 1]) {
        draw(MESH.ball, M4.mul(GM, M4.from(s * lerp(0.8, 0.25, hide), lerp(0.78, 1.1, hide), lerp(0.15, 0.78, hide), 0, 0, 0, 0.22, 0.18, 0.16)), { tint: [0.97, 0.95, 1, 1], alpha: 0.8 * (1 - 0.55 * hide), lit: 0.5 });
      }
    }
    for (const f of L.falls) drawFall(f);
    Life.drawGlow(L);
    if (L.drawAlpha) L.drawAlpha();
    if (L.beamModel) draw(MESH.beam, L.beamModel, { lit: 0, alpha: 0.16 + Math.sin(clock * 1.7) * 0.03 });
    if (L.starDoor) {
      const sd = L.starDoor;
      draw(MESH.emblem, M4.from(0, 9.3, sd.pos[2] + 0.72), { tex: sd.emblem, lit: 0, alpha: 1 - smooth(sd.open * 2.5) });
    }
    for (const s of L.stars) {
      if (s.gone) continue;
      draw(MESH.ball, M4.from(s.pos[0], s.pos[1], s.pos[2], 0, 0, 0, 1.7 + Math.sin(clock * 5) * 0.1), { tint: s.ghost ? [0.6, 0.8, 1, 1] : [1, 0.95, 0.5, 1], alpha: 0.16, lit: 0 });
    }
    drawCineSparks();
    for (const q of parts) {
      const k = q.life / q.max;
      draw(MESH.cube, M4.from(q.p[0], q.p[1], q.p[2], q.rot + clock * 4, q.rot, 0, q.s * (0.4 + k * 0.6)), { tint: [q.col[0], q.col[1], q.col[2], 1], alpha: Math.min(1, k * 1.6), lit: 0.2 });
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    // Schilder und Gemaelde noch einmal scharf (nur mit Bildfilter; dort sind sie sonst kaum lesbar)
    if (signMark === 0 && signQueue.length) {
      if (curTrip) setTrip(0);
      Post.signs(w, h, () => { for (const [m, M, o] of signQueue) draw(m, M, o); });
      if (curTrip) setTrip(curTrip);
    }
    Post.end(w, h);
  }

  /* ═══════════ Hauptschleife ═══════════ */
  const titleStarCtx = $('#titleStar').getContext('2d');
  let last = performance.now(), acc = 0, forced = null;
  const NO_INPUT = { mx: 0, my: 0, cx: 0, cy: 0, mdx: 0, mdy: 0, wheel: 0, jump: false, action: false, z: false, look: false, pause: false,
    jumpP: false, actionP: false, zP: false, lookP: false, pauseP: false, startP: false };
  const EDGES = ['jumpP', 'actionP', 'zP', 'lookP'];
  const pend = { jumpP: false, actionP: false, zP: false, lookP: false };
  function frame(now, manualDt) {
    const dt = manualDt ?? Math.min(0.05, Math.max(0, (now - last) / 1000));
    if (manualDt == null) last = now;
    clock += dt;
    const inp = forced ? Object.assign({}, NO_INPUT, forced) : Input.poll();
    if (forced) forced = Object.assign({}, forced, { jumpP: false, actionP: false, zP: false, lookP: false, pauseP: false, startP: false });
    uiCool = Math.max(0, uiCool - dt);
    handleUI(inp);
    if (uiCool > 0) EDGES.forEach((k) => { inp[k] = false; });
    if (mode === 'play' && !Dialog.open) {
      // Tastendruecke festhalten, bis ein Physikschritt sie verarbeitet hat:
      // bei Bildschirmen ueber 120 Hz gibt es Frames ohne Schritt, dort ging
      // der Sprung frueher einfach verloren.
      EDGES.forEach((k) => { pend[k] = pend[k] || inp[k]; });
      acc += dt;
      while (acc >= STEP_DT && mode === 'play' && !Dialog.open) {
        EDGES.forEach((k) => { inp[k] = pend[k]; pend[k] = false; });
        step(STEP_DT, inp);
        acc -= STEP_DT;
      }
      EDGES.forEach((k) => { inp[k] = false; });
    } else {
      acc = 0;
      EDGES.forEach((k) => { pend[k] = false; });
    }
    ambient(dt);
    updateCine(dt);
    updateCamera(dt, inp);
    ArtGen.pump(64);
    render();
    if (mode === 'pause') CatPick.tick(dt);
    updatePrompt(mode === 'play' && !Dialog.open ? interactable() : null);
    if (!titleEl.hidden) StarGfx.draw(titleStarCtx, 400, 400, clock, { size: 0.36, speed: 1.8 });
    StarFx.draw();
    if (manualDt == null) requestAnimationFrame(frame);
  }

  /* ═══════════ Knoepfe + Lebenszyklus ═══════════ */
  const syncButtons = () => {
    $('#btnSfx').setAttribute('aria-pressed', String(state.sfx));
    $('#btnMusic').setAttribute('aria-pressed', String(state.music));
  };
  const blurAfter = (fn) => (e) => { fn(e); if (e.currentTarget.blur) e.currentTarget.blur(); };
  $('#pressStart').addEventListener('click', start);
  $('#btnSfx').addEventListener('click', blurAfter(() => { state.sfx = !state.sfx; save(); syncButtons(); Snd.unlock(); Snd.coin(); }));
  $('#btnMusic').addEventListener('click', blurAfter(() => {
    state.music = !state.music; save(); syncButtons();
    Snd.unlock(); Snd.music(state.music && mode !== 'title' && mode !== 'pause');
  }));
  $('#btnPause').addEventListener('click', blurAfter(() => { if (mode === 'pause') closePause(); else openPause(); }));
  $('#btnResume').addEventListener('click', closePause);
  $('#btnReset').addEventListener('click', resetGame);
  $('#btnLeave').addEventListener('click', () => { closePause(); leaveBack(); });
  $('#btnEndBack').addEventListener('click', closeEnding);
  $('#btnEndReset').addEventListener('click', resetGame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { Snd.music(false); if (mode === 'play' && !Dialog.open) openPause(); }
  });
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    Iris.hide();
    try { sessionStorage.removeItem('glappa64-return'); } catch (err) {}
    if (pl.entering && pendingReturn) {
      if (Cine.active) { Cine.active.pt.swirl = 0; Cine.active.pt.rip = null; Cine.active = null; }
      document.body.classList.remove('cine');
      MagicFade.hide();
      pl.entering = 0;
      pl.pos = pendingReturn.pos.slice(); pl.vel = [0, 0, 0]; pl.speed = 0;
      pl.face = pendingReturn.face; cam.yaw = pendingReturn.face; cam.snap = true;
      pl.appearT = clock;
      mode = 'play';
    }
  });

  /* ═══════════ Los ═══════════ */
  getLevel('garden');
  getLevel('hall');
  if (state.doorOpen && starCount() >= 4) levels.hall.starDoor.open = 1;
  cur = levels.garden;
  respawn();
  syncButtons();
  renderHud();
  // 90er-Besucherzaehler (zaehlt ehrlich nur die eigenen Besuche in diesem Browser)
  try {
    const visits = (parseInt(localStorage.getItem('glappa64-visits') || '0', 10) || 0) + 1;
    localStorage.setItem('glappa64-visits', String(visits));
    $('#visitCount').textContent = String(visits).padStart(6, '0');
  } catch (e) { /* ohne Speicher bleibt 000001 */ }
  $('#pressStart').focus({ preventScroll: true });
  requestAnimationFrame(frame);

  // Test-Haken (?debug): Zustand ansehen, Frames von Hand weiterschalten
  if (/[?&]debug\b/.test(location.search)) {
    window.g64 = {
      state, run, pl, cam, levels, Dialog, get cur() { return cur; }, get mode() { return mode; }, set mode(v) { mode = v; }, Cine, enterPainting,
      start, enterLevel, spawnStar, openPause, closePause, groundAt,
      // input weglassen = echte Eingabe (Tastatur/Controller) abfragen
      advance(sec, input) { forced = input || null; const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) frame(0, 1 / 60); forced = null; },
      // ein einzelner Frame mit beliebiger Dauer (z. B. 1/144 fuer schnelle Monitore)
      frameDt(dt, input) { forced = input || null; frame(0, dt); forced = null; },
      renderOnce() { render(); },
      ArtGen, CATS, setCat, get cat() { return CAT; }, Skybox, Post, FilterPick, get clock() { return clock; }, blinkAt,
    };
  }
})();
