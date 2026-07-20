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
        for required in ("noindex", expected, f"url=/{route}/", "location.search", "location.hash"):
            if required not in text:
                errors.append(f"{stub.name} missing redirect requirement: {required}")
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
            paths = ["/", *(f"/{route}/" for route in ROUTES), *(f"/{route}.html?fixture=1" for route in ROUTES)]
            for path in paths:
                with urllib.request.urlopen(base + path, timeout=5) as response:
                    body = response.read()
                    if response.status != 200 or len(body) < 100:
                        errors.append(f"HTTP check failed for {path}: {response.status}, {len(body)} bytes")
        finally:
            server.shutdown()
            thread.join(timeout=5)
    return errors


def main() -> int:
    errors = verify_files() + verify_http()
    if errors:
        print(f"FAIL: {len(errors)} clean-route issue(s)")
        for error in errors:
            print(f"- {error}")
        return 1
    print("PASS: 5 clean pages, 4 compatibility redirects, sitemap, local links/assets, and HTTP routes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
