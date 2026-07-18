// Zurueck-Pfeil oben links auf allen LibreSpeed-Seiten (glappa-Anpassung).
//
// Wird NICHT ins Vendor-HTML geforkt: docker-compose mountet diese Datei nach
// /speedtest/glappa-back.js (der Image-Entrypoint kopiert alle *.js von dort
// ins Webroot), und das compose-command haengt vor dem Entrypoint per sed ein
// <script src=glappa-back.js> vor jedes </body>. Uebersteht Image-Updates,
// solange es einen Entrypoint unter /entrypoint.sh und </body>-Tags gibt.
//
// Verhalten: kam der Besucher von derselben Domain (Home oder Werkzeuge),
// geht es echt ZURUECK (history.back() — "wo man davor war"). Direktbesucher
// ohne Vorgeschichte landen auf der Werkzeuge-Seite.
(function () {
  if (document.getElementById('glappa-back')) return;

  // LibreSpeed schaltet per prefers-color-scheme zwischen hell/dunkel um —
  // der Pfeil muss mitziehen, sonst ist er in einem der Modi unsichtbar.
  var css = document.createElement('style');
  css.textContent =
    '#glappa-back{position:fixed;top:10px;left:10px;z-index:9999;' +
    'width:44px;height:44px;display:block;text-align:center;' +
    'font:bold 24px/44px system-ui,-apple-system,sans-serif;' +
    'text-decoration:none;color:#222;background:rgba(0,0,0,0.07);' +
    'border:1px solid rgba(0,0,0,0.35);border-radius:8px;' +
    'transition:background 0.15s;}' +
    '#glappa-back:hover{background:rgba(0,0,0,0.16);}' +
    '@media (prefers-color-scheme: dark){' +
    '#glappa-back{color:#e6e6e6;background:rgba(255,255,255,0.10);' +
    'border-color:rgba(255,255,255,0.35);}' +
    '#glappa-back:hover{background:rgba(255,255,255,0.22);color:#fff;}}';

  var a = document.createElement('a');
  a.id = 'glappa-back';
  a.href = '/home/werkzeuge.html';
  a.title = 'Zurueck zu den GLAPPA-Werkzeugen';
  a.setAttribute('aria-label', 'Zurueck');
  a.innerHTML = '←';
  a.addEventListener('click', function (e) {
    try {
      var ref = document.referrer ? new URL(document.referrer) : null;
      if (history.length > 1 && ref && ref.host === location.host) {
        e.preventDefault();
        history.back();
      }
    } catch (err) { /* Fallback: normaler href */ }
  });

  function mount() {
    document.head.appendChild(css);
    document.body.appendChild(a);
  }
  // Script steht direkt vor </body> — body existiert also schon; der
  // DOMContentLoaded-Zweig ist nur Gurt-und-Hosentraeger.
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
