/* glappa-theme.js — Design-Umschalter fuer search.glappa.de.
 *
 * ARBEITSTEILUNG (Umbau 2026-07-15, Fix "Zwischenzustand" bei Besuchern):
 *   1. Ein INLINE-Bootstrap (per Apache mod_substitute / nginx sub_filter
 *      direkt vor </head> injiziert, siehe apache/search.glappa.de.conf bzw.
 *      nginx-search-local.conf) liest localStorage SYNCHRON vor dem ersten
 *      Paint und schreibt GENAU EIN Stylesheet-<link> (Retro ODER Clean)
 *      per document.write. Frueher wurden IMMER beide Sheets verlinkt und
 *      ein externes Script schaltete nachtraeglich um — bei langsamem Netz
 *      renderte die Seite dann mit BEIDEN aktiven Sheets (Retro-Layout +
 *      Dark-Farben gemischt). Mit dem Bootstrap gibt es diesen Moment nicht
 *      mehr. Ohne JavaScript laedt ein <noscript>-Fallback Retro (Default).
 *   2. DIESES Script laeuft defer (unkritisch fuers Rendering) und liefert
 *      nur noch: den Umschalter in den Einstellungen + Live-Umschalten +
 *      Sync ueber Tabs (storage) und Zurueck-Button (bfcache/pageshow).
 *
 * Drei Modi (localStorage "glappa_theme", gilt pro Browser):
 *   "retro" (Default) — der 90er-Neon-Look (glappa-style.css)
 *   "dark"            — clean & uebersichtlich, dunkel (natives SearXNG-Dark)
 *   "light"           — clean & uebersichtlich, hell  (natives SearXNG-Light)
 *
 * Der Umschalter sitzt auf /preferences im Tab "Benutzeroberflaeche" als
 * kompaktes Dropdown IN der nativen "Designstil"-Zeile — er ersetzt dort das
 * native simple_style-Select (dessen Wert wir ohnehin ueberstimmen) und
 * erbt so automatisch die native Optik. Faellt auf eine eigene Zeile im
 * selben Markup-Stil zurueck, falls ein SearXNG-Update die Zeile umbaut.
 * Wechsel wirkt sofort, ohne Reload.
 *
 * Vanilla-JS, keine Abhaengigkeiten. Idempotent.
 */
(function () {
  "use strict";

  var LS_KEY = "glappa_theme";
  var DEFAULT_MODE = "retro";
  var SELECT_ID = "glappa-theme-select";

  var THEMES = [
    { val: "retro", label: "🌈 90er Retro" },
    { val: "dark",  label: "🌙 Dunkel" },
    { val: "light", label: "☀️ Hell" }
  ];

  /* Die beiden umschaltbaren Stylesheets. Der Bootstrap schreibt nur das
   * jeweils aktive — das andere legt applyMode() bei Bedarf inert nach,
   * damit Live-Umschalten ohne Reload funktioniert. */
  var LINKS = {
    retro: { id: "glappa-css-retro", href: "/glappa-style.css" },
    clean: { id: "glappa-css-clean", href: "/glappa-clean.css" }
  };

  function isValid(v) {
    for (var i = 0; i < THEMES.length; i++) { if (THEMES[i].val === v) return true; }
    return false;
  }

  function savedMode() {
    try {
      var v = window.localStorage.getItem(LS_KEY);
      if (isValid(v)) return v;
    } catch (e) { /* localStorage evtl. blockiert */ }
    return DEFAULT_MODE;
  }

  function storeMode(v) {
    try { window.localStorage.setItem(LS_KEY, v); } catch (e) { /* ignore */ }
  }

  /* URL-Override: ?glappa_theme=retro|dark|light schaltet den Modus um und
   * merkt ihn sich (praktisch zum Verlinken/Testen, z.B. aus dem Terminal). */
  function urlMode() {
    var m = window.location.search.match(/[?&]glappa_theme=(retro|dark|light)(?:&|$)/);
    return m ? m[1] : null;
  }

  /* Stylesheet-Link holen oder — falls der Bootstrap nur das andere
   * geschrieben hat — inert (media="not all") nachlegen. */
  function ensureLink(which) {
    var spec = LINKS[which];
    var link = document.getElementById(spec.id);
    if (!link) {
      link = document.createElement("link");
      link.id = spec.id;
      link.rel = "stylesheet";
      link.setAttribute("media", "not all");
      link.href = spec.href;
      (document.head || document.documentElement).appendChild(link);
    }
    return link;
  }

  /* Ein Stylesheet an-/abschalten — BULLETPROOF ueber drei Wege gleichzeitig:
   * IDL-Property, disabled-Content-Attribut UND media-Attribut.
   * Grund (Live-Bug 2026-07-14, Firefox): .disabled allein geht verloren,
   * wenn es gesetzt wird, waehrend das Stylesheet noch LAEDT. Das media-
   * Attribut ("not all" = aus, "all" = an) wertet jede Engine in jedem
   * Ladezustand neu aus. */
  function setSheet(link, on) {
    if (!link) { return; }
    link.disabled = !on;
    if (on) {
      link.removeAttribute("disabled");
      link.setAttribute("media", "all");
    } else {
      link.setAttribute("disabled", "");
      link.setAttribute("media", "not all");
    }
  }

  /* Theme scharf schalten: data-Attribut + native Theme-Klasse setzen und
   * die Stylesheets umschalten. Laeuft beim Wechsel im Umschalter sofort,
   * ohne Reload — den Erst-Zustand hat schon der Inline-Bootstrap gesetzt. */
  function applyMode(mode) {
    var root = document.documentElement;
    root.setAttribute("data-glappa-theme", mode);

    /* Natives simple-theme mitziehen: "hell" -> Light, alles andere (retro
     * basiert auf dunklen Overrides) -> Dark. Die aktuelle SearXNG-Version
     * nutzt BINDESTRICH-Klassen (html.theme-dark, Light = :root-Default,
     * verifiziert gegen sxng-ltr.min.css); aeltere Versionen nutzten
     * theme_dark mit Unterstrich. Wir entfernen beide Schreibweisen und
     * setzen beide neu — unbekannte Klassen sind wirkungslos, so ueberlebt
     * der Umschalter Container-Updates in beide Richtungen. */
    var native = (mode === "light") ? "light" : "dark";
    root.className = root.className
      .replace(/(^|\s)theme[_-](auto|light|dark|black)(?=\s|$)/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim() + " theme-" + native + " theme_" + native;
    root.style.colorScheme = native; /* native Form-Controls + Scrollbars */

    setSheet(ensureLink("retro"), mode === "retro");
    setSheet(ensureLink("clean"), mode !== "retro");
  }

  /* ── Umschalter auf der Einstellungsseite (/preferences) ────────────── */

  function onPreferencesPage() {
    return /\/preferences\/?$/.test(window.location.pathname);
  }

  function syncSelect(mode) {
    var sel = document.getElementById(SELECT_ID);
    if (sel) { sel.value = mode; }
  }

  var DESC_TEXT = "Design der Glappa-Suche: 90er Retro, Dunkel oder Hell — " +
                  "gilt sofort und wird in diesem Browser gespeichert.";

  function buildSelect() {
    var select = document.createElement("select");
    select.id = SELECT_ID;
    select.setAttribute("aria-label", "Design der Glappa-Suche");
    /* KEIN name-Attribut -> wird nie mit dem SearXNG-Einstellungsformular
     * abgeschickt (reiner Client-Schalter). */
    for (var i = 0; i < THEMES.length; i++) {
      var opt = document.createElement("option");
      opt.value = THEMES[i].val;
      opt.textContent = THEMES[i].label;
      select.appendChild(opt);
    }
    select.value = savedMode();
    select.addEventListener("change", function () {
      if (!isValid(select.value)) { return; }
      storeMode(select.value);
      applyMode(select.value);
    });
    return select;
  }

  function buildSwitcher() {
    if (document.getElementById(SELECT_ID)) { return; }
    var select = buildSelect();

    /* Bevorzugt: die native "Designstil"-Zeile kapern. Das simple_style-
     * Select wird versteckt (bleibt im Formular, damit "Speichern" sich
     * nicht veraendert), unser Dropdown nimmt seinen Platz ein und erbt
     * automatisch die native Optik der Einstellungszeilen. */
    var nativeSel = document.querySelector('#main_preferences select[name="simple_style"]')
                 || document.querySelector('select[name="simple_style"]');
    if (nativeSel) {
      nativeSel.style.display = "none";
      nativeSel.parentNode.insertBefore(select, nativeSel);
      var row = nativeSel.parentNode;
      while (row && row.tagName !== "FIELDSET") { row = row.parentNode; }
      var desc = row ? row.querySelector(".description") : null;
      if (desc) { desc.textContent = DESC_TEXT; }
      return;
    }

    /* Fallback (SearXNG-Update hat die Zeile umgebaut): eigene Zeile im
     * selben Markup-Stil (fieldset > legend + .value + .description) ganz
     * oben in die Einstellungen haengen. */
    var fs = document.createElement("fieldset");
    fs.id = "glappa-theme-row";
    var legend = document.createElement("legend");
    legend.textContent = "Designstil";
    var value = document.createElement("div");
    value.className = "value";
    value.appendChild(select);
    var desc2 = document.createElement("div");
    desc2.className = "description";
    desc2.textContent = DESC_TEXT;
    fs.appendChild(legend);
    fs.appendChild(value);
    fs.appendChild(desc2);

    var container = document.getElementById("main_preferences")
                 || document.querySelector("main")
                 || document.body;
    var h1 = container.querySelector("h1");
    if (h1 && h1.parentNode === container) {
      container.insertBefore(fs, h1.nextSibling);
    } else {
      container.insertBefore(fs, container.firstChild);
    }
  }

  function initSwitcher() {
    if (!onPreferencesPage()) { return; }
    buildSwitcher();
  }

  /* 1) Modus uebernehmen. Der Inline-Bootstrap hat das Theme schon vor dem
   * ersten Paint gesetzt — hier nur: URL-Override persistieren und beide
   * Links fuers Live-Umschalten bereitstellen (idempotent). */
  var initialMode = urlMode();
  if (initialMode) { storeMode(initialMode); } else { initialMode = savedMode(); }
  applyMode(initialMode);

  /* 2) Umschalter erst bauen, wenn die Seite steht. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSwitcher);
  } else {
    initSwitcher();
  }

  /* 3) Wechsel in einem anderen Tab live uebernehmen. */
  window.addEventListener("storage", function (ev) {
    if (ev.key !== LS_KEY) { return; }
    var mode = savedMode();
    applyMode(mode);
    syncSelect(mode);
  });

  /* 4) bfcache: der Zurueck-Button stellt Seiten eingefroren wieder her —
   * dort laeuft kein Script erneut und das Theme kann inzwischen gewechselt
   * worden sein. pageshow mit persisted=true faengt genau das ab. */
  window.addEventListener("pageshow", function (ev) {
    if (!ev.persisted) { return; }
    var mode = savedMode();
    applyMode(mode);
    syncSelect(mode);
  });
})();
