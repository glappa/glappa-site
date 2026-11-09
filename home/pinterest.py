"""Findet die Original-Mediendateien hinter einem Pinterest-Link.

Warum es das neben yt-dlp gibt: yt-dlp hat zwar einen Pinterest-Extraktor,
der kennt aber nur Videos. Bei einem Bild-Pin bricht er mit "No video formats
found" ab - und Bilder und GIFs sind der groesste Teil von Pinterest. Dieses
Modul loest einen Pin vollstaendig auf; app.py laesst Videos danach weiter von
yt-dlp holen (das kann HLS, Tonspuren und die MP3-Umwandlung) und laedt nur
Bilder und GIFs selbst.

Pinterest liefert die Pin-Daten als JSON - entweder ueber den internen
Resource-Endpoint oder eingebettet im HTML (``__PWS_DATA__``). Beides wird
hier abgeklopft, danach werden die Medien-URLs eingesammelt und sortiert.

Gewachsen an echten Pins; die Fallen, die dabei auftauchten, stehen jeweils
an Ort und Stelle: erfundene Bildadressen bei GIF-Pins, dieselbe Datei in
sechs Qualitaetsstufen, die Seitenreihenfolge von Idea-Pins und
Groessenangaben, die sich auf das Original statt auf die Variante beziehen.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Iterator
from urllib.parse import urlparse

import requests

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

BASE_HEADERS = {
    "User-Agent": UA,
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}

#  /pin/123456789/   oder   /pin/mein-slug--123456789/
PIN_ID_RE = re.compile(r"/pin/(?:[^/?#]*?--)?(\d{5,})")
ANY_PIN_RE = re.compile(r"/pin/(\d{5,})")

# Hosts, von denen wir Medien laden (Whitelist, damit der Web-Proxy
# nicht als offener Proxy fuer beliebige Adressen missbraucht werden kann)
ALLOWED_MEDIA_HOSTS = ("pinimg.com", "pinterest.com", "pinterest.de")

VIDEO_QUALITY_ORDER = [
    "V_1080P",
    "V_720P",
    "V_EXP7",
    "V_EXP6",
    "V_EXP5",
    "V_EXP4",
    "V_EXP3",
    "V_480P",
    "V_360P",
    "V_HLSV4",
    "V_HLSV3_WEB",
    "V_HLSV3_MOBILE",
]

# Notfallsuche im HTML: nur echte Inhaltspfade, damit nicht aus Versehen
# Pinterests eigene Oberflaechengrafiken (Logo, Favicon) eingesammelt werden.
MEDIA_URL_RE = re.compile(
    r"https://[a-z0-9\-]+\.pinimg\.com/(?:originals|videos)/"
    r"[^\s\"'<>\\]+?\.(?:mp4|m3u8|gif|jpg|jpeg|png|webp)"
)

# Grafiken der Pinterest-Oberflaeche liegen auf s.pinimg.com bzw. unter /webapp/.
AVATAR_RE = re.compile(r"/(?:30x30|45x45|60x60|75x75)(?:_RS)?/")

# Der Hash im Dateinamen identifiziert den Inhalt, unabhaengig von Qualitaet
# und Container: .../720p/82/a1/c3/82a1c340....mp4 und .../hls/.../82a1c340....m3u8
HASH_RE = re.compile(r"/([0-9a-f]{8,40})(?:_[a-z0-9]{1,4})?\.[a-z0-9]{2,5}$", re.I)

# Der Pfadabschnitt /720p/ nennt die kurze Kante der Variante
TIER_RE = re.compile(r"/(\d{3,4})p/", re.I)


def is_content_media(url: str) -> bool:
    """True nur fuer echte Pin-Inhalte - keine Logos, Favicons, Profilbilder."""
    parts = urlparse(url)
    host = parts.netloc.lower().split(":")[0]
    if not host.endswith("pinimg.com") or host == "s.pinimg.com":
        return False
    return "/webapp/" not in parts.path and not AVATAR_RE.search(parts.path)


class PinterestError(RuntimeError):
    """Pin konnte nicht gelesen werden."""


@dataclass
class Media:
    """Eine herunterladbare Datei."""

    url: str
    kind: str  # "video" | "gif" | "image"
    width: int = 0
    height: int = 0
    label: str = ""
    thumbnail: str = ""
    duration_ms: int = 0

    @property
    def ext(self) -> str:
        last = urlparse(self.url).path.rsplit("/", 1)[-1]
        ext = last.rsplit(".", 1)[-1].lower() if "." in last else ""
        if ext in ("m4v", "mov"):
            return "mp4"
        if ext in ("mp4", "webm", "gif", "jpg", "jpeg", "png", "webp", "m3u8"):
            return ext
        return {"video": "mp4", "gif": "gif", "image": "jpg"}.get(self.kind, "bin")

    @property
    def is_hls(self) -> bool:
        return self.ext == "m3u8"

    @property
    def resolution(self) -> str:
        return f"{self.width}x{self.height}" if self.width and self.height else ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "kind": self.kind,
            "width": self.width,
            "height": self.height,
            "label": self.label,
            "thumbnail": self.thumbnail,
            "ext": self.ext,
            "is_hls": self.is_hls,
            "resolution": self.resolution,
            "duration_ms": self.duration_ms,
        }


@dataclass
class Pin:
    """Ein aufgeloester Pin mit allen gefundenen Medien."""

    pin_id: str
    url: str
    title: str
    description: str
    media: list[Media]

    @property
    def best(self) -> Media | None:
        """Die interessanteste Datei (Video > GIF > groesstes Bild)."""
        return self.media[0] if self.media else None

    def as_dict(self) -> dict[str, Any]:
        return {
            "pin_id": self.pin_id,
            "url": self.url,
            "title": self.title,
            "description": self.description,
            "media": [m.as_dict() for m in self.media],
        }


# ---------------------------------------------------------------- URL-Handling

def is_pinterest_url(url: str) -> bool:
    """Nur echte Pinterest-Adressen akzeptieren.

    Wichtig: ``pinterest`` muss der eigentliche Domainname sein. Sonst wuerde
    eine nachgemachte Adresse wie ``pinterest.boese.com`` durchrutschen.
    """
    host = urlparse(url if "//" in url else "https://" + url).netloc.lower()
    host = host.split("@")[-1].split(":")[0].strip(".")
    if host == "pin.it" or host.endswith(".pin.it"):
        return True
    labels = host.split(".")
    if len(labels) >= 2 and labels[-2] == "pinterest":
        return True  # pinterest.com, de.pinterest.com
    # Laendergruppen wie pinterest.co.uk oder pinterest.com.au
    return len(labels) >= 3 and labels[-3] == "pinterest" and labels[-2] in ("co", "com")


def media_host_allowed(url: str) -> bool:
    if not url.startswith(("http://", "https://")):
        return False
    host = urlparse(url).netloc.lower().split("@")[-1].split(":")[0]
    return any(host == h or host.endswith("." + h) for h in ALLOWED_MEDIA_HOSTS)


def normalise_url(url: str) -> str:
    url = url.strip().strip("<>\"'")
    if not url:
        raise PinterestError("Leerer Link.")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def extract_pin_id(url: str) -> str | None:
    m = PIN_ID_RE.search(url) or ANY_PIN_RE.search(url)
    return m.group(1) if m else None


def resolve_short_link(url: str, session: requests.Session) -> str:
    """pin.it-Kurzlinks und Weiterleitungen auf die echte Pin-URL bringen."""
    r = session.get(url, headers=BASE_HEADERS, allow_redirects=True, timeout=20)
    if extract_pin_id(r.url):
        return r.url
    # Manche Kurzlinks leiten per JS oder Meta-Tag weiter -> im HTML nachsehen.
    m = ANY_PIN_RE.search(r.text or "")
    if m:
        return "https://www.pinterest.com/pin/%s/" % m.group(1)
    raise PinterestError(
        "Aus diesem Link liess sich kein einzelner Pin ermitteln. "
        "Bitte den Link zu einem Pin verwenden, z. B. "
        "https://de.pinterest.com/pin/785244885074520948/"
    )


# ------------------------------------------------------------- Daten besorgen

def _api_headers(pin_url: str) -> dict[str, str]:
    headers = dict(BASE_HEADERS)
    headers.update(
        {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": pin_url,
            "X-Requested-With": "XMLHttpRequest",
            "X-APP-VERSION": "ab1af2a",
            "X-Pinterest-AppState": "active",
            "X-Pinterest-PWS-Handler": "www/pin/[id].js",
        }
    )
    return headers


def _fetch_via_api(pin_id: str, session: requests.Session) -> dict[str, Any] | None:
    """Pin ueber den internen JSON-Endpoint holen."""
    pin_url = "https://www.pinterest.com/pin/%s/" % pin_id
    options = {
        "options": {
            "id": pin_id,
            "field_set_key": "unauth_react_main_pin",
            "noFetchContext": False,
        },
        "context": {},
    }
    params = {
        "source_url": "/pin/%s/" % pin_id,
        "data": json.dumps(options, separators=(",", ":")),
    }
    try:
        r = session.get(
            "https://www.pinterest.com/resource/PinResource/get/",
            params=params,
            headers=_api_headers(pin_url),
            timeout=25,
        )
        if r.status_code != 200:
            return None
        data = r.json()
    except (requests.RequestException, ValueError):
        return None
    pin = (data.get("resource_response") or {}).get("data")
    return pin if isinstance(pin, dict) else None


def _fetch_via_html(pin_url: str, session: requests.Session) -> tuple[Any, str]:
    """Pin-Seite laden und das eingebettete JSON zurueckgeben."""
    r = session.get(pin_url, headers=BASE_HEADERS, timeout=25)
    html = r.text or ""
    if r.status_code >= 400 and not html:
        raise PinterestError("Pinterest antwortete mit HTTP %s." % r.status_code)

    for script_id in ("__PWS_DATA__", "__PWS_INITIAL_PROPS__", "initial-state"):
        pattern = r'<script[^>]+id="%s"[^>]*>(.*?)</script>' % re.escape(script_id)
        m = re.search(pattern, html, re.S)
        if not m:
            continue
        try:
            return json.loads(m.group(1)), html
        except ValueError:
            continue
    return None, html


# ----------------------------------------------------- Medien aus JSON sammeln

def _walk(node: Any, limit: int = 400_000) -> Iterator[dict]:
    """Alle Dicts in einer verschachtelten JSON-Struktur durchlaufen.

    In der Reihenfolge des Dokuments: die Seiten eines Idea-Pins sollen in
    ihrer Erzaehlreihenfolge herauskommen, nicht von hinten. Der Stapel gibt
    das zuletzt Eingefuegte zuerst zurueck, deshalb gehen die Kinder
    rueckwaerts hinein.
    """
    stack = [node]
    seen = 0
    while stack and seen < limit:
        cur = stack.pop()
        seen += 1
        if isinstance(cur, dict):
            yield cur
            stack.extend(reversed(list(cur.values())))
        elif isinstance(cur, list):
            stack.extend(reversed(cur))


def _tier_size(url: str, width: int, height: int) -> tuple[int, int]:
    """Echte Groesse einer Videovariante aus ihrem Pfad ableiten.

    Pinterest gibt in ``video_list`` die Groesse des Originals an, nicht die der
    einzelnen Variante. Hinter ``/videos/mc/720p/`` eines 1080x1920-Idea-Pins
    liegt aber eine 720x1280-Datei. Der Pfad nennt die kurze Kante, daraus
    laesst sich seitenverhaeltnistreu die wahre Groesse rechnen.
    """
    found = TIER_RE.search(urlparse(url).path)
    if not found or not width or not height:
        return width, height
    short_side = int(found.group(1))
    if min(width, height) <= short_side:
        return width, height
    scale = short_side / min(width, height)
    return round(width * scale), round(height * scale)


def _videos_from_video_list(video_list: dict) -> list[Media]:
    out: list[Media] = []
    for key, variant in video_list.items():
        if not isinstance(variant, dict):
            continue
        url = variant.get("url")
        if not isinstance(url, str) or not url.startswith("http"):
            continue
        label = str(key).replace("V_", "").replace("_", " ").strip()
        width, height = _tier_size(
            url, int(variant.get("width") or 0), int(variant.get("height") or 0)
        )
        out.append(
            Media(
                url=url,
                kind="video",
                width=width,
                height=height,
                label=label or "Video",
                thumbnail=variant.get("thumbnail") or "",
                duration_ms=int(variant.get("duration") or 0),
            )
        )
    return out


def _upgrade_pinimg(url: str) -> str:
    """i.pinimg.com-Thumbnails auf /originals/ hochziehen."""
    return re.sub(r"/\d+x\d*/", "/originals/", url, count=1)


def _best_image(images: dict) -> Media | None:
    """Aus einem ``images``-Dict die Originalaufloesung heraussuchen."""
    candidates: list[Media] = []
    for key, val in images.items():
        if not isinstance(val, dict):
            continue
        url = val.get("url")
        if not isinstance(url, str) or not url.startswith("http"):
            continue
        is_gif = url.split("?")[0].lower().endswith(".gif")
        candidates.append(
            Media(
                url=url,
                kind="gif" if is_gif else "image",
                width=int(val.get("width") or 0),
                height=int(val.get("height") or 0),
                label="Original" if key == "orig" else str(key),
            )
        )
    if not candidates:
        return None
    for c in candidates:
        if c.label == "Original":
            return c
    return max(candidates, key=lambda m: m.width * m.height)


def collect_media(pin: Any, html: str = "") -> list[Media]:
    """Alle herunterladbaren Dateien eines Pin-Objekts zusammentragen."""
    found: list[Media] = []

    for node in _walk(pin):
        # 1) Videos - deckt normale Video-Pins und Idea-Pin-Seiten ab
        video_list = node.get("video_list")
        if isinstance(video_list, dict):
            found.extend(_videos_from_video_list(video_list))

        # 2) Bilder und GIFs
        images = node.get("images")
        if isinstance(images, dict):
            best = _best_image(images)
            if best:
                found.append(best)
        elif isinstance(images, list):
            for entry in images:
                if isinstance(entry, dict) and isinstance(entry.get("url"), str):
                    found.append(
                        Media(
                            url=entry["url"],
                            kind="image",
                            width=int(entry.get("width") or 0),
                            height=int(entry.get("height") or 0),
                            label="Slide",
                        )
                    )

        # 3) Direkte URL-Felder (GIF-Embeds, Carousel, Cover-Bilder)
        node_type = str(node.get("type") or node.get("block_type") or "")
        for key in (
            "image_large_url",
            "image_medium_url",
            "image_orig_url",
            "image_url",
            "gif_url",
            "src",
            "url",
        ):
            val = node.get(key)
            if not isinstance(val, str) or not val.startswith("http"):
                continue
            low = val.split("?")[0].lower()
            if key in ("src", "url") and "pinimg.com" not in low:
                continue
            if low.endswith(".gif"):
                found.append(Media(url=val, kind="gif", label="GIF"))
            elif low.endswith((".mp4", ".m4v", ".webm")):
                found.append(Media(url=val, kind="video", label=node_type or "Video"))
            elif low.endswith((".jpg", ".jpeg", ".png", ".webp")):
                found.append(Media(url=_upgrade_pinimg(val), kind="image", label="Bild"))

    # 4) Notfall: direkt im HTML nach Medien-URLs suchen
    if not found and html:
        for m in MEDIA_URL_RE.finditer(html):
            url = m.group(0)
            low = url.lower()
            if low.endswith(".mp4"):
                kind = "video"
            elif low.endswith(".gif"):
                kind = "gif"
            else:
                kind = "image"
            found.append(Media(url=url, kind=kind, label="aus HTML"))

    return rank(found)


def content_key(media: Media) -> tuple[str, str]:
    """Identitaet des Inhalts - dieselbe Datei in anderer Qualitaet faellt zusammen.

    Pinterest liefert jedes Video mehrfach: als 720p-MP4, als mehrere kleinere
    expMp4-Stufen und als HLS-Playlist. Alle tragen denselben Hash im
    Dateinamen, nur Pfad und Suffix unterscheiden sich - bei einem Idea-Pin mit
    acht Seiten waren das sonst achtundvierzig Eintraege statt acht.

    GIF und Bild gelten dabei als dieselbe Sache: bei einem GIF-Pin tauchen
    beide mit demselben Hash auf, denn aus dem JPG-Vorschaubild wird eine
    ``/originals/....jpg``-Adresse gerechnet, die es gar nicht gibt - das
    Original ist ja das GIF. Die Sortierung stellt das GIF davor, das
    erfundene JPG faellt weg.
    """
    path = urlparse(media.url).path
    found = HASH_RE.search(path)
    group = "standbild" if media.kind in ("gif", "image") else media.kind
    return (group, found.group(1).lower() if found else path.lower())


def rank(items: list[Media]) -> list[Media]:
    """Duplikate entfernen und sortieren: Video > GIF > Bild, gross zuerst."""
    kind_rank = {"video": 0, "gif": 1, "image": 2}

    def sort_key(m: Media) -> tuple:
        quality_key = "V_" + m.label.replace(" ", "_").upper()
        try:
            quality = VIDEO_QUALITY_ORDER.index(quality_key)
        except ValueError:
            quality = 50
        return (
            kind_rank.get(m.kind, 3),
            1 if m.is_hls else 0,           # echte Dateien vor HLS-Playlists
            quality,                         # Pinterests eigene Stufenfolge
            -(m.width * m.height),           # danach: grosse Aufloesung zuerst
        )

    ordered = sorted((m for m in items if is_content_media(m.url)), key=sort_key)

    # Sortiert heisst: die beste Variante einer Datei kommt zuerst. Der Rest
    # derselben Datei faellt weg, die Reihenfolge der Idea-Pin-Seiten bleibt.
    best: dict[tuple[str, str], Media] = {}
    for m in ordered:
        best.setdefault(content_key(m), m)
    return list(best.values())


# ------------------------------------------------------------------ Hauptpfad

def _pin_title(pin: dict) -> str:
    for key in ("grid_title", "title", "seo_title", "closeup_unified_title"):
        val = pin.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    for key in ("description", "seo_description"):
        val = pin.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip().splitlines()[0][:80]
    return ""


def _find_pin_dict(data: Any, pin_id: str) -> dict | None:
    """Im eingebetteten JSON das Pin-Objekt zu einer ID finden."""
    best: dict | None = None
    for node in _walk(data):
        if str(node.get("id") or "") != pin_id:
            continue
        if any(k in node for k in ("images", "videos", "story_pin_data", "carousel_data")):
            if best is None or len(node) > len(best):
                best = node
    return best


def resolve(url: str, session: requests.Session | None = None) -> Pin:
    """Einen Pinterest-Link in einen :class:`Pin` mit Medienliste aufloesen."""
    session = session or requests.Session()
    url = normalise_url(url)
    if not is_pinterest_url(url):
        raise PinterestError("Das sieht nicht nach einem Pinterest-Link aus.")

    pin_id = extract_pin_id(url)
    if pin_id is None:
        url = resolve_short_link(url, session)
        pin_id = extract_pin_id(url)
    if pin_id is None:
        raise PinterestError("Keine Pin-ID im Link gefunden.")

    pin_url = "https://www.pinterest.com/pin/%s/" % pin_id

    # Weg 1: interner JSON-Endpoint (schnell und vollstaendig)
    pin: Any = _fetch_via_api(pin_id, session)
    media = collect_media(pin) if pin else []

    # Weg 2: HTML-Seite auswerten
    if not media:
        data, html = _fetch_via_html(pin_url, session)
        found = _find_pin_dict(data, pin_id) if data is not None else None
        if found is None and not pin:
            # Die Seite enthaelt diesen Pin gar nicht - dann hier abbrechen,
            # statt irgendwelche anderen Bilder der Seite einzusammeln.
            raise PinterestError(
                "Dieser Pin wurde nicht gefunden. Moeglicherweise ist er "
                "geloescht, privat oder nur fuer angemeldete Nutzer sichtbar."
            )
        pin = found or pin
        media = collect_media(pin or {}, html)

    if not media:
        raise PinterestError(
            "Zu diesem Pin liess sich keine Mediendatei finden."
        )

    pin = pin if isinstance(pin, dict) else {}
    description = pin.get("description")
    return Pin(
        pin_id=pin_id,
        url=pin_url,
        title=_pin_title(pin),
        description=description.strip() if isinstance(description, str) else "",
        media=media,
    )
