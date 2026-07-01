/* glappa-search.js — Bilder-Suche: Dateiformat-Filter fuer SearXNG.
 *
 * Wird (wie glappa-style.css) per Apache mod_substitute in jede HTML-Response
 * von search.glappa.de injiziert: <script defer src='/glappa-search.js'> direkt
 * vor </body>. Liegt auf dem VPS unter /var/www/search-static/glappa-search.js
 * und ist erreichbar als https://search.glappa.de/glappa-search.js.
 *
 * Warum client-seitig?  Unsere SearXNG laeuft als unveraenderter Docker-Container
 * (kein Fork) — die gesamte Glappa-Anpassung passiert per Injection. Einen
 * "Dateiformat"-Filter, der zuverlaessig ueber ALLE Bild-Engines hinweg
 * funktioniert, gibt es in SearXNG nicht. Darum filtern wir hier die bereits
 * gerenderten Bild-Ergebnisse direkt im Browser: jedes Bild-Ergebnis traegt im
 * aeusseren <a href="..."> die echte Vollbild-URL (result.img_src) inkl. Datei-
 * Endung — daraus leiten wir das Format ab.
 *
 * Feature: Dropdown "Dateiformat" in der Filterzeile der Bilder-Suche. Auswahl:
 * Alle Formate (Default) + jedes gaengige Bildformat einzeln (inkl. GIF). Die
 * Wahl bleibt per localStorage ueber Seitenwechsel/Paginierung erhalten.
 *
 * Vanilla-JS, keine Abhaengigkeiten. Idempotent (mehrfaches Laden schadet nicht).
 */
(function () {
  "use strict";

  var LS_KEY = "glappa_img_format";
  var SELECT_ID = "glappa-format-select";

  /* Auswahl: value = kanonisches Format, label = Anzeige.
   * "Alle Formate" zeigt alles, jeder andere Eintrag filtert hart auf genau
   * dieses Format. Reihenfolge: Alle, GIF (extra gewuenscht), dann der Rest. */
  var OPTIONS = [
    { val: "all",  label: "★ Alle Formate" },
    { val: "gif",  label: "GIF" },
    { val: "jpg",  label: "JPG / JPEG" },
    { val: "png",  label: "PNG" },
    { val: "webp", label: "WebP" },
    { val: "svg",  label: "SVG" },
    { val: "bmp",  label: "BMP" },
    { val: "tiff", label: "TIFF" },
    { val: "ico",  label: "ICO" },
    { val: "avif", label: "AVIF" },
    { val: "heic", label: "HEIC / HEIF" }
  ];

  /* Bekannte Bild-Endungen -> kanonisches Format. Endungen, die hier NICHT
   * auftauchen (z.B. .php, .aspx einer dynamisch generierten Bild-URL), werden
   * NICHT als Format gewertet -> wir probieren dann die naechste Quelle. */
  var EXT_MAP = {
    gif: "gif",
    jpg: "jpg", jpeg: "jpg", jpe: "jpg", jfif: "jpg", pjpeg: "jpg",
    png: "png", apng: "png",
    webp: "webp",
    svg: "svg", svgz: "svg",
    bmp: "bmp", dib: "bmp",
    tif: "tiff", tiff: "tiff",
    ico: "ico",
    avif: "avif",
    heic: "heic", heif: "heic"
  };

  function savedFormat() {
    try {
      var v = window.localStorage.getItem(LS_KEY);
      // nur gueltige Werte akzeptieren
      for (var i = 0; i < OPTIONS.length; i++) {
        if (OPTIONS[i].val === v) return v;
      }
    } catch (e) { /* localStorage evtl. blockiert */ }
    return "all";
  }

  function storeFormat(v) {
    try { window.localStorage.setItem(LS_KEY, v); } catch (e) { /* ignore */ }
  }

  /* Filter NUR zeigen, wenn echte Bild-Ergebnisse gerendert sind — d.h. der
   * Nutzer hat wirklich auf "Bilder" gesucht. SearXNG rendert Bild-Treffer
   * immer als <article class="result-images">. Auf der Startseite (Index) und
   * bei Nicht-Bild-Kategorien gibt es diese Elemente nicht -> kein Filter. */
  function hasImageResults() {
    return !!document.querySelector("article.result-images");
  }

  /* Eine evtl. ueber SearXNGs image_proxy verpackte URL auspacken
   * (/image_proxy?url=<encoded-echte-url>&...) -> echte Ziel-URL. */
  function unwrapProxy(u) {
    if (!u) return u;
    if (/image_proxy/i.test(u)) {
      var m = u.match(/[?&]url=([^&]+)/i);
      if (m) {
        try { return decodeURIComponent(m[1]); } catch (e) { /* ignore */ }
      }
    }
    return u;
  }

  /* Datei-Endung aus einer URL ziehen -> kanonisches Format oder null. */
  function formatFromUrl(u) {
    if (!u || u === "#") return null;
    u = unwrapProxy(u);
    // Query + Hash fuer die Endungs-Erkennung am Pfad-Ende abschneiden
    var path = u.split("#")[0].split("?")[0];
    var m = path.match(/\.([a-z0-9]{2,5})$/i);
    if (m) {
      var f = EXT_MAP[m[1].toLowerCase()];
      if (f) return f;
    }
    // Fallback: Format-Hint im Query-String (?fm=webp, &format=jpg, &f=png)
    var q = u.toLowerCase();
    var qm = q.match(/[?&](?:fm|format|f|type|ext)=([a-z0-9]{2,5})/);
    if (qm && EXT_MAP[qm[1]]) return EXT_MAP[qm[1]];
    return null;
  }

  /* Format aus dem "Image formats:"-Label / Detail-Text ableiten. */
  function formatFromText(article) {
    var el = article.querySelector(".result-format, .result-images-labels");
    var t = (el ? el.textContent : "").toLowerCase();
    if (!t) return null;
    if (/\bgif\b/.test(t)) return "gif";
    if (/\bjpe?g\b|\bjfif\b/.test(t)) return "jpg";
    if (/\bpng\b/.test(t)) return "png";
    if (/\bwebp\b/.test(t)) return "webp";
    if (/\bsvg\b/.test(t)) return "svg";
    if (/\bbmp\b/.test(t)) return "bmp";
    if (/\btiff?\b/.test(t)) return "tiff";
    if (/\bico\b/.test(t)) return "ico";
    if (/\bavif\b/.test(t)) return "avif";
    if (/\bhei[cf]\b/.test(t)) return "heic";
    return null;
  }

  /* Format eines Bild-Ergebnisses bestimmen (gecached pro Article). */
  function detectFormat(article) {
    if (article.dataset.glappaFmt) {
      return article.dataset.glappaFmt === "?" ? null : article.dataset.glappaFmt;
    }

    var fmt = null;
    var urls = [];
    var i, el;

    // Reihenfolge wichtig: aeusseres <a> = result.img_src (echte Vollbild-URL),
    // danach die Detail-Quelle, zuletzt Thumbnails (proxied).
    var anchors = article.querySelectorAll("a[href]");
    for (i = 0; i < anchors.length; i++) urls.push(anchors[i].getAttribute("href"));
    var imgs = article.querySelectorAll("img");
    for (i = 0; i < imgs.length; i++) {
      urls.push(imgs[i].getAttribute("src"));
      urls.push(imgs[i].getAttribute("data-src"));
    }

    for (i = 0; i < urls.length; i++) {
      fmt = formatFromUrl(urls[i]);
      if (fmt) break;
    }
    if (!fmt) fmt = formatFromText(article);

    article.dataset.glappaFmt = fmt || "?";
    return fmt;
  }

  function shortLabel(val) {
    for (var i = 0; i < OPTIONS.length; i++) {
      if (OPTIONS[i].val === val) return OPTIONS[i].label.replace(/^★\s*/, "");
    }
    return val;
  }

  /* Filter auf alle Bild-Ergebnisse anwenden + Zaehler aktualisieren.
   * WICHTIG: display per setProperty(..., "important") setzen — die Theme-
   * Regel fuer die Kacheln ist `display: inline-block !important`, ein einfaches
   * style.display = "none" wuerde dagegen verlieren. */
  function applyFilter() {
    var sel = savedFormat();
    var articles = document.querySelectorAll("article.result-images");
    var total = articles.length;
    var shown = 0;

    for (var i = 0; i < articles.length; i++) {
      var art = articles[i];
      var show = true;
      if (sel !== "all") show = (detectFormat(art) === sel);

      if (show) {
        art.style.removeProperty("display");
        art.removeAttribute("data-glappa-hidden");
        shown++;
      } else {
        art.style.setProperty("display", "none", "important");
        art.setAttribute("data-glappa-hidden", "1");
      }
    }

    updateCount(sel, shown, total);
  }

  function updateCount(sel, shown, total) {
    var badge = document.querySelector(".glappa-format-count");
    if (!badge) return;
    if (sel === "all" || total === 0) {
      badge.textContent = "";
    } else {
      badge.textContent = "nur " + shortLabel(sel) + ": " + shown + "/" + total;
    }
  }

  /* Dropdown bauen (einmalig) und in die Filterzeile haengen. */
  function buildDropdown() {
    if (document.getElementById(SELECT_ID)) return document.getElementById(SELECT_ID).closest(".glappa-format-filter");

    var filters = document.querySelector(".search_filters");
    if (!filters) {
      // Fallback: eine Filterzeile im Such-Formular anlegen
      var form = document.getElementById("search");
      if (!form) return null;
      filters = document.createElement("div");
      filters.className = "search_filters";
      form.appendChild(filters);
    }

    var wrap = document.createElement("div");
    wrap.className = "glappa-format-filter";

    var label = document.createElement("label");
    label.className = "glappa-format-label";
    label.setAttribute("for", SELECT_ID);
    label.textContent = "Dateiformat:";

    // KEIN name -> wird nicht mit dem Formular an SearXNG gesendet (reiner
    // Client-Filter). KEINE Theme-IDs (#language etc.) -> kein Auto-Submit.
    var select = document.createElement("select");
    select.id = SELECT_ID;
    select.setAttribute("aria-label", "Dateiformat der Bilder");

    var cur = savedFormat();
    for (var i = 0; i < OPTIONS.length; i++) {
      var opt = document.createElement("option");
      opt.value = OPTIONS[i].val;
      opt.textContent = OPTIONS[i].label;
      if (OPTIONS[i].val === cur) opt.selected = true;
      select.appendChild(opt);
    }

    select.addEventListener("change", function () {
      storeFormat(select.value);
      applyFilter();
    });

    var count = document.createElement("span");
    count.className = "glappa-format-count";

    label.appendChild(select);
    wrap.appendChild(label);
    wrap.appendChild(count);

    // Vorne einsortieren, damit "Dateiformat" links der anderen Filter steht.
    filters.insertBefore(wrap, filters.firstChild);
    return wrap;
  }

  /* Dropdown bauen + Filter anwenden — aber NUR auf der Bilder-Ergebnisseite. */
  function ensureUI() {
    if (!hasImageResults()) return;
    if (!buildDropdown()) return;
    applyFilter();
  }

  var rafPending = false;
  function scheduleEnsure() {
    if (rafPending) return;
    rafPending = true;
    window.requestAnimationFrame(function () {
      rafPending = false;
      ensureUI();
    });
  }

  function init() {
    ensureUI();

    // Sicherheitsnetz: falls die Ergebnisliste asynchron (nach-)gerendert wird,
    // erneut pruefen/anwenden. Beobachtet werden NUR die Ergebnis-Container —
    // die Filterzeile (wo das Dropdown sitzt) liegt ausserhalb, daher keine
    // Selbst-Ausloese-Schleife. childList meldet keine Attribut-Aenderungen,
    // applyFilter setzt nur Styles/data-* -> kein Retrigger.
    var target = document.getElementById("results") || document.getElementById("urls");
    if (target && window.MutationObserver) {
      var mo = new MutationObserver(function (mutations) {
        for (var m = 0; m < mutations.length; m++) {
          if (mutations[m].addedNodes && mutations[m].addedNodes.length) {
            scheduleEnsure();
            return;
          }
        }
      });
      mo.observe(target, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
