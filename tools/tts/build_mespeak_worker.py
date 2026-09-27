"""Baut secret/vendor/mespeak-de-worker.js: meSpeak (eSpeak) + Konfiguration + deutsche Stimme als Web-Worker.

Der Worker nimmt {id, text, pitch, speed, variant} und antwortet mit {id, pcm: Float32Array, sr}.
Quelle: npm-Paket mespeak 2.0.2 (meSpeak 1.9.6), unveraendert eingebettet (GPL v3, siehe
secret/vendor/mespeak-de-worker.LICENSE.txt).

Aufruf:
    npm pack mespeak@2.0.2 && tar -xzf mespeak-2.0.2.tgz
    python tools/tts/build_mespeak_worker.py package
"""
import io
import json
import os
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else 'package'   # entpacktes npm-Paket
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'secret', 'vendor', 'mespeak-de-worker.js')

espeak = io.open(os.path.join(SRC, 'src', 'ESpeak.js'), encoding='latin-1').read()   # Latin-1 nur in Kommentaren
index = io.open(os.path.join(SRC, 'src', 'index.js'), encoding='utf-8').read()
config = json.load(io.open(os.path.join(SRC, 'src', 'mespeak_config.json'), encoding='utf-8'))
voice = json.load(io.open(os.path.join(SRC, 'voices', 'de.json'), encoding='utf-8'))

head = '''/* meSpeak 1.9.6 (Modular eSpeak) als Web-Worker fuer SUPER GLAPPA 64 - nur Deutsch.
   eSpeak (c) Jonathan Duddington u. a., speak.js (c) Alon Zakai, meSpeak (c) Norbert Landsteiner.
   Lizenz: GNU General Public License v3 (https://www.gnu.org/licenses/gpl-3.0.html).
   Quellen: https://github.com/mikolalysenko/mespeak (npm "mespeak" 2.0.2), http://www.masswerk.at/mespeak,
   https://github.com/espeak-ng/espeak-ng. Unveraendert eingebettet; neu ist nur die Worker-Huelle am Ende.
   Nachricht rein: {id, text, pitch, speed, variant}  ->  raus: {id, pcm: Float32Array, sr} oder {id, error}. */
'''

body = head + '''(function () {
  var ESpeakMod = { exports: {} };
  (function (module, exports) {
''' + espeak + '''
  })(ESpeakMod, ESpeakMod.exports);
  var MeMod = { exports: {} };
  (function (module, exports, require) {
''' + index + '''
  })(MeMod, MeMod.exports, function (p) { if (p === './ESpeak.js') return ESpeakMod.exports; throw new Error('require ' + p); });
  var meSpeak = MeMod.exports;
  meSpeak.loadConfig(''' + json.dumps(config, separators=(',', ':')) + ''');
  meSpeak.loadVoice(''' + json.dumps(voice, separators=(',', ':')) + ''');

  // WAV (16 Bit, mono) -> Float32
  function pcmOf(bytes) {
    var u = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    var sr = dv.getUint32(24, true), p = 12;
    while (p + 8 <= u.length) {
      var id = String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]), len = dv.getUint32(p + 4, true);
      if (id === 'data') {
        var n = Math.min(len, u.length - p - 8) >> 1, out = new Float32Array(n);
        for (var i = 0; i < n; i++) out[i] = dv.getInt16(p + 8 + i * 2, true) / 32768;
        return { pcm: out, sr: sr };
      }
      p += 8 + len + (len & 1);
    }
    return null;
  }
  self.onmessage = function (e) {
    var d = e.data || {};
    try {
      var wav = meSpeak.speak(String(d.text || ''), { rawdata: 'array', pitch: d.pitch, speed: d.speed, variant: d.variant, amplitude: 100 });
      var r = wav && pcmOf(wav);
      if (!r) throw new Error('keine Audiodaten');
      self.postMessage({ id: d.id, pcm: r.pcm, sr: r.sr }, [r.pcm.buffer]);
    } catch (err) {
      self.postMessage({ id: d.id, error: String(err && err.message || err) });
    }
  };
  self.postMessage({ ready: true });
})();
'''
os.makedirs(os.path.dirname(OUT), exist_ok=True)
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(body)
print(os.path.normpath(OUT), len(body.encode('utf-8')), 'Bytes')
