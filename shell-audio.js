/* shell-audio.js — VM-Ton im Browser ("sound passthrough").
 *
 * Gegenstueck zum Pulse-Abgriff in der Gast-VM (_docker/shellvm/
 * glappa-pulse.pa): dort liefert module-simple-protocol-tcp den Monitor
 * der virtuellen Soundkarte als rohen s16le-PCM-Strom (48 kHz stereo),
 * displaygate brueckt ihn per Ticket-Auth als WebSocket-Binaerstrom zum
 * Browser (?chan=audio — derselbe Endpunkt wie der VNC-Kanal, siehe
 * displaygate/server.py). Hier wird er in Float32 gewandelt und einem
 * AudioWorklet (shell-audio-worklet.js) zum Abspielen uebergeben.
 *
 * WARUM roher PCM statt Opus/MP3? Kein Encoder-Prozess in der VM noetig
 * (kein ffmpeg, keine Encode-Latenz) und der Browser braucht keine
 * MediaSource-/Codec-Weichen — nur Web Audio. Preis: ~1.5 MBit/s — aber
 * nur, waehrend in der VM WIRKLICH etwas spielt: der Null-Sink rendert
 * im Leerlauf nichts (live verifiziert), bei Stille ruht die Leitung.
 * "Ton: aus" schliesst den Kanal zusaetzlich komplett.
 *
 * Autoplay-Policy: Browser lassen Ton erst nach einer Nutzer-Geste auf
 * DIESER Seite zu. Der Auto-Start beim Desktop-Verbinden klappt meist
 * (Passwort getippt / Knopf geklickt = Geste) — wenn nicht, meldet
 * onState 'blockiert', und der naechste Klick auf den Ton-Knopf gibt
 * frei (toggle() macht dann resume statt stop).
 *
 * Verwendung (shell.html + desktop.html, klassisches Skript, global):
 *   var audio = GlappaVmAudio({
 *     authUrl:     '…/vnc-auth',            // wie beim VNC-Kanal
 *     wsBase:      'wss://…/api/shell/vnc', // wie beim VNC-Kanal
 *     getPassword: function () { return lastPw; },   // fuer das Einmal-Ticket
 *     onState:     function (state, detail) { … },
 *                  // state: aus | verbinde | an | blockiert | fehler
 *   });
 *   audio.start(); audio.toggle(); audio.stop();
 */
(function () {
  'use strict';

  window.GlappaVmAudio = function (opts) {
    let ws = null;
    let ctx = null;
    let node = null;
    let running = false;    // Ton-Kanal offen (WS + AudioContext stehen)
    let starting = false;
    let carry = null;       // Uint8Array-Rest eines unvollstaendigen Frames

    function setState(state, detail) {
      try { if (opts.onState) opts.onState(state, detail); } catch (e) {}
    }

    /* PCM-Bytes -> Float32 (interleaved) -> Worklet. TCP/WS-Chunks
       koennen mitten in einem 4-Byte-Frame (2 Kanaele x 16 Bit) enden —
       der Rest wandert in `carry` und kommt vor dem naechsten Chunk. */
    function onPcm(ev) {
      if (!node) return;
      let bytes = new Uint8Array(ev.data);
      if (carry && carry.length) {
        const merged = new Uint8Array(carry.length + bytes.length);
        merged.set(carry, 0);
        merged.set(bytes, carry.length);
        bytes = merged;
      }
      const usable = bytes.length - (bytes.length % 4);
      carry = usable < bytes.length ? bytes.slice(usable) : null;
      if (!usable) return;
      // bytes beginnt immer bei Offset 0 eines frischen ArrayBuffers
      // (WS-Frame oder merged) — Int16Array-Alignment passt also.
      const i16 = new Int16Array(bytes.buffer, 0, usable / 2);
      const f32 = new Float32Array(usable / 2);
      for (let i = 0; i < f32.length; i++) f32[i] = i16[i] / 32768;
      node.port.postMessage(f32, [f32.buffer]);
    }

    function openWs(ticket) {
      return new Promise(function (resolve, reject) {
        let settled = false;
        const sock = new WebSocket(opts.wsBase + '?ticket=' + encodeURIComponent(ticket) + '&chan=audio');
        sock.binaryType = 'arraybuffer';
        sock.onopen = function () { settled = true; ws = sock; resolve(); };
        sock.onmessage = onPcm;
        sock.onerror = function () {
          if (!settled) { settled = true; reject(new Error('Audio-Kanal fehlgeschlagen')); }
        };
        sock.onclose = function () {
          if (!settled) { settled = true; reject(new Error('Audio-Kanal abgelehnt')); return; }
          // Server-seitig beendet (Idle-Timeout, displaygate-Neustart, …)
          if (running && ws === sock) stop();
        };
      });
    }

    async function start() {
      if (running || starting) return;
      const pw = opts.getPassword && opts.getPassword();
      if (!pw || !opts.wsBase) return;
      starting = true;
      setState('verbinde');
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('Web Audio nicht verfuegbar');
        // sampleRate an den Strom anpassen (48 kHz, s. glappa-pulse.pa) —
        // der Browser resampled dann selbst auf die Hardware-Rate.
        ctx = new AC({ sampleRate: 48000 });
        if (!ctx.audioWorklet) throw new Error('AudioWorklet nicht verfuegbar');
        await ctx.audioWorklet.addModule('shell-audio-worklet.js');
        node = new AudioWorkletNode(ctx, 'glappa-pcm-player', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        node.connect(ctx.destination);
        // resume() darf scheitern (Autoplay-Policy) — dann laeuft der
        // Strom trotzdem schon, und der naechste Klick gibt nur noch frei.
        if (ctx.state === 'suspended') {
          try { await ctx.resume(); } catch (e) {}
        }

        // Eigenes Einmal-Ticket fuer den Audio-Kanal (das VNC-Ticket ist
        // beim ersten Gebrauch verbraucht) — gleiche Fehlerbehandlung wie
        // beim Desktop: erst Text lesen, dann selbst parsen.
        const r = await fetch(opts.authUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw }),
        });
        const body = await r.text();
        let data = null;
        try { data = JSON.parse(body); } catch (e) {}
        if (!data) throw new Error('Backend nicht erreichbar (HTTP ' + r.status + ')');
        if (!data.ok) throw new Error(data.msg || 'Ticket abgelehnt');

        await openWs(data.ticket);
        running = true;
        setState(ctx.state === 'running' ? 'an' : 'blockiert');
      } catch (e) {
        stopInternal();
        setState('fehler', e && e.message);
      } finally {
        starting = false;
      }
    }

    function stopInternal() {
      running = false;
      carry = null;
      if (ws) {
        const sock = ws;
        ws = null;
        sock.onclose = null;
        sock.onmessage = null;
        try { sock.close(); } catch (e) {}
      }
      node = null;
      if (ctx) {
        const c = ctx;
        ctx = null;
        try { c.close(); } catch (e) {}
      }
    }

    function stop() {
      stopInternal();
      setState('aus');
    }

    /* Knopf-Logik: aus -> starten; blockiert -> nur Autoplay freigeben;
       an -> Strom komplett beenden (spart auch die Bandbreite). */
    function toggle() {
      if (!running) {
        if (!starting) start();
        return;
      }
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(function () { setState('an'); }, function () {});
        return;
      }
      stop();
    }

    return {
      start: start,
      stop: stop,
      toggle: toggle,
      isRunning: function () { return running; },
    };
  };
})();
