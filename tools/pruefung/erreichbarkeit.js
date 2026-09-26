/* ERREICHBARKEITS-PRUEFUNG fuer SUPER GLAPPA 64 (Entwicklerwerkzeug, nicht Teil des Spiels).

   Wozu: Nach jeder Physik-Aenderung (Sprunghoehen, Tempo) pruefen, ob Sterne oder Muenzen unerreichbar werden.
   Vergleicht die Welten mit der ALTEN und der NEUEN Bewegungstabelle und meldet nur, was vorher ging und jetzt nicht.

   Benutzung (lokaler Server, siehe UEBERGABE_GLAPPA64.md):
     1. Datei temporaer nach secret/ kopieren (die Seite darf nur Skripte vom selben Ursprung laden)
     2. glappa64.html?debug oeffnen, ins Spiel gehen, dann in der Konsole:
          await new Promise(r => { const s = document.createElement('script'); s.src = '__reach_tmp.js'; s.onload = r; document.body.appendChild(s); });
          for (const k of ['garden','desert','pilz' ...]) { g64.enterLevel(k); console.log(k, __reach(g64.levels[k]).filter(s => s.alt && !s.neu)); }
     3. OLD/NEW unten auf die MOVES-Tabellen vorher/nachher setzen ([hoehe, weite] aus g64.measure()).
     4. Kopie in secret/ wieder loeschen.

   Grenzen (bekannt, 2026-09-25): Kastenmodell ohne Waende/Decken, Rampen gelten als Klotz, Mover stehen auf
   Ruheposition, keine Wandsprung-Schaechte. Treffer daher IMMER mit echter Physik (g64.advance) gegenpruefen -
   2026-09-25 waren 8 von 8 Muenzen-Treffern Fehlalarme (Rampe), 0 von 20 Sternen betroffen. */
/* Differenzielle Erreichbarkeitspruefung: welche festen Sterne gehen durch die neue Physik verloren?
   Grobes Modell (keine Waende, keine beweglichen Plattformen in Bewegung, keine Wandsprung-Schaechte),
   aber mit ALT und NEU identisch - gemeldet wird nur, was vorher ging und jetzt nicht mehr. */
(() => {
  const OLD = { jump: [2.96, 0], runJump: [4.21, 13.7], double: [7.11, 24.91], triple: [8.06, 34.15],
    backflip: [6.5, 2.21], sideflip: [6.5, 13.63], long: [1.5, 11.03], dive: [0.47, 4.4], rollout: [1.18, 6.81] };
  const NEW = { jump: [2.18, 0], runJump: [2.95, 7.74], double: [4.35, 9.7], triple: [5.95, 11.52],
    backflip: [4.8, 2.21], sideflip: [4.8, 7.74], long: [2.24, 14.93], dive: [0.47, 4.32], rollout: [1.18, 5.7] };
  const UF = 0.4125, G_HI = 2.3;
  const NO_GRAB = new Set(['bound', 'exitdoor', 'portal', 'roof', 'citywall', 'awning', 'bouncy', 'mover', 'raft', 'piston',
    'fractal', 'hand', 'slider', 'carpet', 'rail', 'chute', 'tree', 'palm', 'sign', 'stem', 'gate', 'kbd', 'snowhat']);

  // Hoehe ueber dem Absprung bei Weite x (Parabel mit Gipfel h bei d/2; hinter d faellt sie weiter)
  function yAt(h, d, x) { const u = x / d; return 4 * h * u * (1 - u); }
  // hoechster Punkt der Bahn irgendwo in [g, g+w]
  function best(h, d, g, w) {
    if (d < 1) return g <= 1.5 ? h : -Infinity;          // Stand-Sprung: nur direkt daneben
    const a = d / 2;
    if (g <= a && g + w >= a) return h;
    return g > a ? yAt(h, d, g) : yAt(h, d, g + w);
  }
  function spring(power, air) {                        // Federn: Hoehe fest, Weite haengt an der Luftgrenze
    const p = power + 10, t = p / 60;                  // mit Stampfer, Flugzeit bis zur Absprunghoehe
    return [p * p * UF / 240, t * air(t)];
  }
  const airOld = (t) => 13.2 + 5.88 * t;               // alter Luftschub lief ueber die Grenze davon
  const airNew = () => 11.14;

  function gapRect(a, b) {
    const dx = Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0]);
    const dz = Math.max(0, a.min[2] - b.max[2], b.min[2] - a.max[2]);
    return Math.hypot(dx, dz);
  }

  function solve(L, M, air) {
    const nodes = L.solids.filter((b) => b.tag !== 'bound' && b.max[0] - b.min[0] > 0.2 && b.max[2] - b.min[2] > 0.2)
      .map((b) => ({ min: b.min, max: b.max, top: b.max[1], grab: !NO_GRAB.has(b.tag), bounce: b.bounce, tag: b.tag }));
    const stars = (L.fixedStars || []).map((s) => ({ star: s.id, min: [s.pos[0] - 1.2, 0, s.pos[2] - 1.2],
      max: [s.pos[0] + 1.2, s.pos[1] - 3.0, s.pos[2] + 1.2], top: s.pos[1] - 3.0, grab: false }))
      .concat((L.coins || []).filter((c) => !c.hidden).map((c, i) => ({ star: 'muenze#' + i + '(' + (c.kind || '') + ' ' + c.pos.map((v) => v.toFixed(1)).join(',') + ')',
        min: [c.pos[0] - 1.0, 0, c.pos[2] - 1.0], max: [c.pos[0] + 1.0, c.pos[1] - 2.9, c.pos[2] + 1.0], top: c.pos[1] - 2.9, grab: false })));
    const all = nodes.concat(stars);
    const moves = Object.values(M);
    const sp = L.spawn;
    // Start: hoechste Flaeche unter dem Spawnpunkt
    let start = null;
    for (const n of nodes) {
      if (sp[0] >= n.min[0] && sp[0] <= n.max[0] && sp[2] >= n.min[2] && sp[2] <= n.max[2] && n.top <= sp[1] + 0.6)
        if (!start || n.top > start.top) start = n;
    }
    if (!start) return null;
    const seen = new Set([start]), q = [start];
    while (q.length) {
      const a = q.shift();
      const mv = a.bounce ? moves.concat([spring(a.bounce, air)]) : moves;
      for (const b of all) {
        if (seen.has(b)) continue;
        const g = gapRect(a, b), dh = b.top - a.top;
        const w = Math.min(b.max[0] - b.min[0], b.max[2] - b.min[2]);
        let ok = dh <= 0.55 && g < 0.05;                 // einfach hinuebergehen/hinunterlaufen
        for (const [h, d] of mv) {
          if (ok) break;
          const y = best(h, d, g, w);
          if (y >= dh || (b.grab && y + G_HI >= dh)) ok = true;
        }
        if (ok) { seen.add(b); q.push(b); }
      }
    }
    return stars.map((s) => ({ id: s.star, ok: seen.has(s) }));
  }

  window.__reach = function (L) {
    const a = solve(L, OLD, airOld), b = solve(L, NEW, airNew);
    if (!a) return { fehler: 'kein Startboden' };
    return a.map((s, i) => ({ id: s.id, alt: s.ok, neu: b[i].ok }));
  };
})();
