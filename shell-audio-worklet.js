/* shell-audio-worklet.js — AudioWorklet-Prozessor fuer den VM-Ton.
 *
 * Gegenstueck zu shell-audio.js (dort steht die Gesamt-Architektur des
 * Sound-Passthrough). Bekommt vom Hauptthread fertige Float32Arrays
 * (interleaved stereo, 48 kHz) per port.postMessage und spielt sie ab.
 *
 * Eigene Datei statt Blob-URL: audioWorklet.addModule() laedt ein echtes
 * same-origin-Skript in JEDEM Browser zuverlaessig — Blob-/Data-URLs
 * waren dafuer historisch je nach Browser wackelig.
 *
 * Puffer-Strategie ("Jitter-Buffer"):
 *  - PRIME (~150 ms): erst wenn so viel im Puffer liegt, faengt die
 *    Ausgabe an — faengt Netz-Schwankungen ab, ohne fuehlbare Latenz.
 *  - Unterlauf: Stille ausgeben und neu anpuffern (sonst knackt es im
 *    Takt jedes einzelnen fehlenden Pakets).
 *  - MAX (~1 s): laeuft der Puffer voller (Tab war throttled, Netz-
 *    Burst), aelteste Chunks verwerfen — lieber ein kurzer Sprung als
 *    dauerhaft hinterherhinkender Ton.
 */
class GlappaPcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];        // Float32Arrays, interleaved stereo (L R L R …)
    this.offset = 0;         // Lese-Offset (in Samples) im ersten Chunk
    this.queued = 0;         // ungelesene interleaved Samples insgesamt
    this.primed = false;
    // sampleRate ist im Worklet-Scope global (Rate des AudioContext).
    this.PRIME = Math.round(sampleRate * 2 * 0.15);   // ~150 ms Vorlauf
    this.MAX   = sampleRate * 2;                       // ~1 s Obergrenze

    this.port.onmessage = (e) => {
      const a = e.data;
      if (!a || !a.length) return;
      this.chunks.push(a);
      this.queued += a.length;
      // Ueberlauf: ganze alte Chunks verwerfen (grob, aber ein Chunk ist
      // nur wenige ms — genauer lohnt die Buchhaltung nicht).
      while (this.queued > this.MAX && this.chunks.length > 1) {
        this.queued -= (this.chunks[0].length - this.offset);
        this.chunks.shift();
        this.offset = 0;
      }
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out.length > 1 ? out[1] : out[0];

    if (!this.primed) {
      if (this.queued >= this.PRIME) {
        this.primed = true;
      } else {
        L.fill(0);
        if (R !== L) R.fill(0);
        return true;
      }
    }

    let i = 0;
    while (i < L.length) {
      const c = this.chunks[0];
      if (!c) break;
      if (this.offset >= c.length) {
        this.chunks.shift();
        this.offset = 0;
        continue;
      }
      // Chunk-Laengen sind immer ganze Frames (Vielfache von 2 Samples,
      // stellt der Hauptthread sicher) — offset+1 existiert also.
      L[i] = c[this.offset];
      R[i] = c[this.offset + 1];
      this.offset += 2;
      this.queued -= 2;
      i++;
    }
    if (i < L.length) {
      for (; i < L.length; i++) { L[i] = 0; R[i] = 0; }
      this.primed = false;   // Unterlauf -> erst wieder anpuffern
    }
    return true;
  }
}

registerProcessor('glappa-pcm-player', GlappaPcmPlayer);
