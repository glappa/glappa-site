/* glappa-theme.js — Design-Umschalter fuer search.glappa.de.
 *
 * Wird (wie glappa-style.css) per Apache mod_substitute / nginx sub_filter in
 * jede HTML-Response injiziert — als SYNCHRONES Script direkt vor </head>,
 * damit das gespeicherte Theme VOR dem ersten Rendern greift (kein kurzes
 * Aufblitzen des falschen Looks).
 *
 * Drei Modi (localStorage "glappa_theme", gilt pro Browser):
 *   "retro" (Default) — der 90er-Neon-Look (glappa-style.css)
 *   "dark"            — clean & uebersichtlich, dunkel (natives SearXNG-Dark)
 *   "light"           — clean & uebersichtlich, hell  (natives SearXNG-Light)
 *
 * Mechanik: Apache/nginx injizieren IMMER beide Stylesheets:
 *   <link id="glappa-css-clean" href="/glappa-clean.css">  (ohne data-attr inert)
 *   <link id="glappa-css-retro" href="/glappa-style.css">
 * Dieses Script schaltet per link.disabled um und setzt zusaetzlich
 * html[data-glappa-theme] sowie die native simple-theme-Klasse
 * (theme_light/theme_dark), sodass SearXNGs eingebaute Hell/Dunkel-Palette
 * (inkl. Einstellungsseite, Dialoge, Tabellen) automatisch mitzieht.
 *
 * Ohne JavaScript: beide Links bleiben aktiv -> Retro gewinnt (bisheriges
 * Verhalten), die Clean-CSS ist ohne data-Attribut komplett wirkungslos.
 *
 * Auf /preferences (Zahnrad oben rechts) haengt das Script zusaetzlich ein
 * "Design"-Panel mit den drei Modi ganz oben in die Einstellungen —
 * Umschalten wirkt sofort, ohne Reload.
 *
 * Vanilla-JS, keine Abhaengigkeiten. Idempotent.
 */
(function () {
  "use strict";

  var LS_KEY = "glappa_theme";
  var DEFAULT_MODE = "retro";
  var PANEL_ID = "glappa-theme-panel";

  var THEMES = [
    { val: "dark",  icon: "🌙",       name: "Dunkel",     desc: "Sehr übersichtlich — ruhiger dunkler Modus" },
    { val: "light", icon: "☀️",       name: "Hell",       desc: "Sehr übersichtlich — klarer heller Modus" },
    { val: "retro", icon: "🌈",       name: "90er Retro", desc: "Neon, Sterne & Comic Sans — der Glappa-Klassiker" }
  ];

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

  /* Theme scharf schalten: data-Attribut + native Theme-Klasse setzen und die
   * beiden injizierten Stylesheets per .disabled umschalten. Laeuft einmal
   * synchron im <head> (vor dem ersten Paint) und danach bei jedem Wechsel
   * im Design-Panel (sofort, ohne Reload). */
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

    var retroCss = document.getElementById("glappa-css-retro");
    var cleanCss = document.getElementById("glappa-css-clean");
    if (retroCss) { retroCss.disabled = (mode !== "retro"); }
    if (cleanCss) { cleanCss.disabled = (mode === "retro"); }
  }

  /* ── Design-Panel auf der Einstellungsseite (/preferences) ──────────── */

  function onPreferencesPage() {
    return /\/preferences\/?$/.test(window.location.pathname);
  }

  function markActive(panel, mode) {
    var opts = panel.querySelectorAll(".gt-option");
    for (var i = 0; i < opts.length; i++) {
      var active = (opts[i].getAttribute("data-theme") === mode);
      if (active) { opts[i].className = "gt-option gt-active"; }
      else        { opts[i].className = "gt-option"; }
      var radio = opts[i].querySelector("input");
      if (radio) { radio.checked = active; }
    }
  }

  function buildOption(theme, panel) {
    var label = document.createElement("label");
    label.className = "gt-option";
    label.setAttribute("data-theme", theme.val);

    var input = document.createElement("input");
    input.type = "radio";
    input.name = "glappa_theme_choice";
    input.value = theme.val;
    /* KEIN form-Attribut/keine Theme-Namen -> wird nie mit dem
     * SearXNG-Einstellungsformular abgeschickt (reiner Client-Schalter). */
    input.addEventListener("change", function () {
      if (!input.checked) { return; }
      storeMode(theme.val);
      applyMode(theme.val);
      markActive(panel, theme.val);
    });

    var icon = document.createElement("span");
    icon.className = "gt-icon";
    icon.textContent = theme.icon;

    var text = document.createElement("span");
    text.className = "gt-text";
    var name = document.createElement("strong");
    name.className = "gt-name";
    name.textContent = theme.name;
    var desc = document.createElement("span");
    desc.className = "gt-desc";
    desc.textContent = theme.desc;
    text.appendChild(name);
    text.appendChild(desc);

    label.appendChild(input);
    label.appendChild(icon);
    label.appendChild(text);
    return label;
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) { return; }

    var panel = document.createElement("fieldset");
    panel.id = PANEL_ID;
    panel.className = "glappa-theme-panel";

    var legend = document.createElement("legend");
    legend.textContent = "🎨 Design";
    panel.appendChild(legend);

    var hint = document.createElement("p");
    hint.className = "gt-hint";
    hint.textContent = "Wie soll die Glappa-Suche aussehen? Gilt sofort und wird in diesem Browser gespeichert.";
    panel.appendChild(hint);

    var wrap = document.createElement("div");
    wrap.className = "gt-options";
    for (var i = 0; i < THEMES.length; i++) {
      wrap.appendChild(buildOption(THEMES[i], panel));
    }
    panel.appendChild(wrap);
    markActive(panel, savedMode());

    /* Ganz oben in die Einstellungen: nach der Seiten-Ueberschrift, wenn es
     * eine gibt, sonst als allererstes Element. Fallback-Kette, damit es
     * auch nach einem SearXNG-Update mit anderem DOM noch auftaucht. */
    var container = document.getElementById("main_preferences")
                 || document.querySelector("main")
                 || document.body;
    var h1 = container.querySelector("h1");
    if (h1 && h1.parentNode === container) {
      container.insertBefore(panel, h1.nextSibling);
    } else {
      container.insertBefore(panel, container.firstChild);
    }
  }

  function initPanel() {
    if (!onPreferencesPage()) { return; }
    buildPanel();
  }

  /* 1) Theme SOFORT anwenden — Script laeuft synchron im <head>.
   * URL-Parameter gewinnt gegen localStorage und wird uebernommen. */
  var initialMode = urlMode();
  if (initialMode) { storeMode(initialMode); } else { initialMode = savedMode(); }
  applyMode(initialMode);

  /* 2) Panel erst bauen, wenn die Seite steht. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPanel);
  } else {
    initPanel();
  }

  /* 3) Wechsel in einem anderen Tab live uebernehmen. */
  window.addEventListener("storage", function (ev) {
    if (ev.key !== LS_KEY) { return; }
    var mode = savedMode();
    applyMode(mode);
    var panel = document.getElementById(PANEL_ID);
    if (panel) { markActive(panel, mode); }
  });
})();
