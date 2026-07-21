#!/usr/bin/env python3
"""Verify clean GitHub Pages routes and compatibility redirects."""

from __future__ import annotations

import http.server
import re
import socketserver
import threading
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTES = ("order", "catering", "about", "faq")
FULL_PAGES = (ROOT / "index.html", *(ROOT / route / "index.html" for route in ROUTES))
ATTR = re.compile(r'(?:href|src)="([^"]+)"')


def local_target_exists(target: str) -> bool:
    path = target.split("?", 1)[0].split("#", 1)[0]
    if path == "/":
        return (ROOT / "index.html").is_file()
    if path.endswith("/"):
        return (ROOT / path.lstrip("/") / "index.html").is_file()
    return (ROOT / path.lstrip("/")).is_file()


def verify_files() -> list[str]:
    errors: list[str] = []
    for page in FULL_PAGES:
        if not page.is_file():
            errors.append(f"missing full page: {page.relative_to(ROOT)}")
            continue
        text = page.read_text(encoding="utf-8")
        route = "" if page.parent == ROOT else f"{page.parent.name}/"
        canonical = f"https://islanddelicacy.com/{route}"
        for required in (
            f'<link rel="canonical" href="{canonical}">',
            f'<meta property="og:url" content="{canonical}">',
        ):
            if required not in text:
                errors.append(f"metadata mismatch in {page.relative_to(ROOT)}: {required}")
        for target in ATTR.findall(text):
            if ".html" in target:
                errors.append(f"legacy .html link in {page.relative_to(ROOT)}: {target}")
            if target.startswith("/") and not target.startswith("//") and not local_target_exists(target):
                errors.append(f"missing local target in {page.relative_to(ROOT)}: {target}")
        if page.parent != ROOT:
            for pattern in ('href="css/', 'src="assets/', 'src="js/'):
                if pattern in text:
                    errors.append(f"nested relative asset in {page.relative_to(ROOT)}: {pattern}")

    menu_js = (ROOT / "js" / "menu.js").read_text(encoding="utf-8")
    main_js = (ROOT / "js" / "main.js").read_text(encoding="utf-8")
    css = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
    menu_assets = sorted(set(re.findall(r"['\"](/assets/menu/[^'\"]+\.webp)['\"]", menu_js)))
    if len(menu_assets) != 16:
        errors.append(f"expected 16 unique menu photos, found {len(menu_assets)}")
    if "assets/gallery/dish-" in menu_js or "assets/gallery/dish-" in css:
        errors.append("legacy placeholder dish image still referenced")
    for required in ("window.SIDE_IMAGES", "data-menu-lightbox", "data-zoom-item"):
        if required not in menu_js + main_js:
            errors.append(f"menu photography integration missing: {required}")
    if "../assets/menu/jerk-chicken.webp" not in css:
        errors.append("homepage hero is not using the new menu photography")
    for target in menu_assets:
        asset = ROOT / target.lstrip("/")
        if not asset.is_file():
            errors.append(f"missing menu photo: {target}")
        elif asset.stat().st_size > 750_000:
            errors.append(f"menu photo exceeds 750 KB performance budget: {target}")
    for forbidden in ("*.zip", "*.dc.html"):
        for artifact in ROOT.rglob(forbidden):
            if ".git" not in artifact.parts:
                errors.append(f"prototype/archive must not ship: {artifact.relative_to(ROOT)}")

    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    if ".html" in sitemap:
        errors.append("sitemap.xml still contains .html")
    for route in ROUTES:
        expected = f"https://islanddelicacy.com/{route}/"
        if expected not in sitemap:
            errors.append(f"sitemap missing {expected}")
        stub = ROOT / f"{route}.html"
        if not stub.is_file():
            errors.append(f"missing compatibility redirect: {stub.name}")
            continue
        text = stub.read_text(encoding="utf-8")
        for required in (
            "noindex",
            expected,
            f"location.pathname === '/{route}.html'",
            f"location.replace('/{route}/'",
            "location.search",
            "location.hash",
        ):
            if required not in text:
                errors.append(f"{stub.name} missing redirect requirement: {required}")
        if "http-equiv=\"refresh\"" in text:
            errors.append(f"{stub.name} still has an unconditional meta refresh (redirect-loop risk)")
    return errors


def verify_order_design() -> list[str]:
    """Fixed side cards, plate-grid breakpoints, and truthful daily-cap wording."""
    errors: list[str] = []
    css = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
    main_js = (ROOT / "js" / "main.js").read_text(encoding="utf-8")
    menu_js = (ROOT / "js" / "menu.js").read_text(encoding="utf-8")
    order_html = (ROOT / "order" / "index.html").read_text(encoding="utf-8")

    for required, why in (
        (".side-list{display:flex;flex-wrap:wrap;gap:12px", "side list must be a wrapping flex row"),
        ("label.side-option{display:block;flex:0 0 auto;width:172px", "side cards must be fixed 172px"),
        (".side-option>img{width:150px;height:96px", "side photos must be fixed 150x96"),
        (".order-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))", "plate grid must auto-fill (3 columns at desktop widths)"),
        (".cap-chip{", "daily-cap chip style missing"),
    ):
        if required not in css:
            errors.append(f"styles.css design requirement missing ({why}): {required}")
    if re.search(r"\.side-list\{grid-template-columns", css):
        errors.append("styles.css still forces side-list grid columns (stretched cards)")
    if ".order-grid,.faq-grid{grid-template-columns:1fr}" not in css:
        errors.append("styles.css missing single-column plate grid at mobile breakpoint")

    if 'width="150" height="96"' not in main_js:
        errors.append('main.js side images must declare intrinsic width="150" height="96"')
    if 'width="64" height="64"' not in main_js:
        errors.append('main.js plate thumbs must declare intrinsic width="64" height="64"')
    if "DAILY MAX" not in main_js:
        errors.append("main.js plate cards must label caps as 'N DAILY MAX'")
    for name, text in (("main.js", main_js), ("menu.js", menu_js), ("order/index.html", order_html), ("styles.css", css)):
        if re.search(r"\bLEFT\b", text):
            errors.append(f"{name} claims live inventory ('LEFT' wording is prohibited)")
    return errors


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        pass


def verify_http() -> list[str]:
    errors: list[str] = []
    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(ROOT), **kwargs)
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        try:
            menu_js = (ROOT / "js" / "menu.js").read_text(encoding="utf-8")
            image_paths = sorted(set(re.findall(r"['\"](/assets/menu/[^'\"]+\.webp)['\"]", menu_js)))
            paths = ["/", *(f"/{route}/" for route in ROUTES), *(f"/{route}.html?fixture=1" for route in ROUTES), *image_paths]
            for path in paths:
                with urllib.request.urlopen(base + path, timeout=5) as response:
                    body = response.read()
                    if response.status != 200 or len(body) < 100:
                        errors.append(f"HTTP check failed for {path}: {response.status}, {len(body)} bytes")
                    if path.endswith(".webp") and response.headers.get_content_type() != "image/webp":
                        errors.append(f"wrong image content type for {path}: {response.headers.get_content_type()}")
        finally:
            server.shutdown()
            thread.join(timeout=5)
    return errors


def main() -> int:
    errors = verify_files() + verify_order_design() + verify_http()
    if errors:
        print(f"FAIL: {len(errors)} clean-route issue(s)")
        for error in errors:
            print(f"- {error}")
        return 1
    print("PASS: clean routes, 16 optimized menu photos, side imagery, lightbox hooks, sitemap, assets, and HTTP routes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
