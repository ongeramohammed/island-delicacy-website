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
        ("label.side-option{position:relative;display:block;flex:0 0 auto;width:172px", "side cards must be fixed 172px and contain their visually hidden inputs"),
        (".side-option>img{width:150px;height:96px", "side photos must be fixed 150x96"),
        (".order-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:28px;align-items:start;max-width:1400px}", "desktop order layout must provide enough width for contained three-column meal cards"),
        (".order-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:1fr", "plate grid must render three equal-width desktop columns with equal-height rows"),
        (".choice{padding:10px;min-height:142px;height:100%;min-width:0;overflow:hidden", "plate cards must be equal-height and clip local overflow"),
        (".choice-title{display:grid;grid-template-columns:minmax(0,1fr) auto", "plate titles and prices need a non-overflowing grid"),
        (".choice-title span:first-child{min-width:0;overflow-wrap:anywhere", "long meal names must wrap inside their cards"),
        (".cap-chip{", "daily-cap chip style missing"),
        (".side-option input{position:absolute;inset:0;z-index:2;width:100%;height:100%;margin:0;padding:0;opacity:0", "side checkboxes must remain accessible full-card controls while visually hidden"),
        (".side-option:has(input:checked){border:1.5px dashed #E0A52A;background:rgba(224,165,42,.12)}", "selected side cards must match the quiet selected extra-meat chip style"),
    ):
        if required not in css:
            errors.append(f"styles.css design requirement missing ({why}): {required}")
    if re.search(r"\.side-list\{grid-template-columns", css):
        errors.append("styles.css still forces side-list grid columns (stretched cards)")
    selected_side_rule = re.search(r"\.side-option:has\(input:checked\)\{([^}]*)\}", css)
    if selected_side_rule and any(token in selected_side_rule.group(1) for token in ("box-shadow", "outline")):
        errors.append("selected side cards must not use a glow or outline")
    if ".order-grid,.faq-grid{grid-template-columns:1fr}" not in css:
        errors.append("styles.css missing single-column plate grid at mobile breakpoint")

    if 'width="150" height="96"' not in main_js:
        errors.append('main.js side images must declare intrinsic width="150" height="96"')
    if 'width="64" height="64"' not in main_js:
        errors.append('main.js plate thumbs must declare intrinsic width="64" height="64"')
    if "LIMITED DAILY" not in main_js:
        errors.append("main.js plate cards must avoid unsupported per-item caps and say 'LIMITED DAILY'")
    for required in (
        "data-add-plate",
        "data-remove-plate",
        "state.cart",
        "30 plates per pickup day",
        "90 plates across the week",
    ):
        if required not in main_js and required not in order_html:
            errors.append(f"multi-plate/capacity requirement missing: {required}")
    for name, text in (("main.js", main_js), ("menu.js", menu_js), ("order/index.html", order_html), ("styles.css", css)):
        if re.search(r"\bLEFT\b", text):
            errors.append(f"{name} claims live inventory ('LEFT' wording is prohibited)")
    return errors


def verify_order_clarity() -> list[str]:
    """Grouped plate summary, a review before Square, and an exact return receipt."""
    errors: list[str] = []
    css = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
    main_js = (ROOT / "js" / "main.js").read_text(encoding="utf-8")
    order_html = (ROOT / "order" / "index.html").read_text(encoding="utf-8")
    checkout_js = (ROOT / "worker" / "src" / "checkout.js").read_text(encoding="utf-8")

    fmt = ROOT / "js" / "order-format.js"
    if not fmt.is_file():
        errors.append("missing js/order-format.js: every customer-facing surface must share one serialization")
        return errors
    fmt_js = fmt.read_text(encoding="utf-8")

    # The fixed group vocabulary, shared by sidebar, review sheet, receipt and text fallback.
    for label in ("'Includes'", "'Your sides'", "'Extras'", "'Leave off / requests'", "'Sides only'"):
        if label not in fmt_js:
            errors.append(f"order-format.js is missing the fixed group label {label}")
    for answered in ("No rice & peas — rasta pasta plate", "Nothing — cook it as it comes", "'None'"):
        if answered not in fmt_js:
            errors.append(f"order-format.js must answer an empty group rather than leaving it blank: {answered}")

    if '<script src="/js/order-format.js' not in order_html:
        errors.append("order/index.html must load js/order-format.js before js/main.js")
    if order_html.index("order-format.js") > order_html.index("/js/main.js"):
        errors.append("js/order-format.js must be loaded before js/main.js")

    # The review is a hard gate: the builder button opens it, only Confirm can pay.
    for required, why in (
        ("data-review-dialog", "the pre-Square review dialog must exist in the markup"),
        ('role="dialog"', "the review must be an actual dialog for assistive technology"),
        ('aria-modal="true"', "the review dialog must be modal"),
        ("data-review-confirm", "the review needs an explicit Confirm action"),
        ("data-review-close", "the review needs an explicit Edit/close action"),
        ("data-receipt-lines", "the Square return must render the submitted order lines"),
        ("data-receipt-total", "the Square return must render the submitted total"),
    ):
        if required not in order_html:
            errors.append(f"order/index.html missing order-clarity requirement ({why}): {required}")

    if "addEventListener('click', openReview)" not in main_js:
        errors.append("main.js: the summary checkout button must open the review, never fetch directly")
    if "addEventListener('click', confirmAndPay)" not in main_js:
        errors.append("main.js: only the review Confirm button may start checkout")
    if "fetch(" in main_js and "async function confirmAndPay()" not in main_js:
        errors.append("main.js: the checkout fetch must live in confirmAndPay, behind the review")
    for required in ("function openReview()", "function closeReview()", "function reviewKeydown(", "reviewOpener"):
        if required not in main_js:
            errors.append(f"main.js missing review focus/keyboard contract: {required}")
    if "'Escape'" not in main_js:
        errors.append("main.js: the review dialog must close on Escape")
    if "receiptFor" not in main_js or "modelFromReceipt" not in main_js:
        errors.append("main.js must store and re-render the privacy-minimized receipt")
    if "phoneLast4" not in fmt_js:
        errors.append("the stored receipt must keep only the last four phone digits")

    # Merchant truth comes from the SAME serializer the customer read — one source,
    # never a second formatter in the Worker (DESIGN-LOCK decision 1).
    if "import OrderFormat from '../../js/order-format.js'" not in checkout_js:
        errors.append("worker/src/checkout.js must import the shared serializer, not rebuild customization text")
    if "OrderFormat.merchantNote(line)" not in checkout_js:
        errors.append("worker/src/checkout.js must build Square plate notes with OrderFormat.merchantNote")
    if "OrderFormat.EXTRAS[line.meat]" not in checkout_js or "OrderFormat.lineTitle(line)" not in checkout_js:
        errors.append("worker/src/checkout.js must take the extra label and plate back-reference from the shared serializer")
    for forbidden in ("Includes:", "Sides:", "Leave off", "Extra meat", "Extra oxtail", "No rice"):
        if forbidden in checkout_js:
            errors.append(f"worker/src/checkout.js re-declares customization vocabulary that must come from the shared serializer: {forbidden}")
    if "merchantNote" not in fmt_js or "MERCHANT_GROUP_SEPARATOR" not in fmt_js:
        errors.append("js/order-format.js must own the merchant-note serialization")

    # The Square return must land the customer ON the receipt, not below the builder.
    main_index = order_html.index("<main data-order-app>")
    if order_html.index("data-confirmation") < main_index:
        errors.append("order/index.html: the return receipt must live inside <main>")
    if order_html.index("data-confirmation") > order_html.index("order-layout"):
        errors.append("order/index.html: the return receipt must precede the order builder so a returning customer lands on it")
    for required, why in (
        ("return-panel", "the return receipt needs its own landing panel"),
        ('tabindex="-1"', "the return panel must be focusable so keyboard users land on it"),
        ("order-return-restart", "a returning customer needs a truthful way back to ordering"),
    ):
        if required not in order_html:
            errors.append(f"order/index.html missing return-mode requirement ({why}): {required}")
    if "body.return-mode .page-hero" not in css or "body.return-mode .order-layout" not in css:
        errors.append("styles.css must hide the hero and builder in return mode")
    if "classList.add('return-mode')" not in main_js:
        errors.append("main.js must switch the page into return mode rather than leave the receipt below the fold")
    if "focusReturnPanel" not in main_js:
        errors.append("main.js must focus the return receipt on arrival")

    for required, why in (
        (".ticket-spec{display:grid;grid-template-columns:98px minmax(0,1fr)", "plate specs must be a two-column labelled list"),
        (".ticket-spec dd.is-empty{", "answered-empty values need their own quiet treatment"),
        ("body.review-open{overflow:hidden}", "the page behind the review must not scroll"),
        (".review-scroll{flex:1 1 auto;min-height:0;overflow-y:auto", "the review body must scroll independently so the total and pay button stay pinned"),
        (".review-close:focus-visible", "every review control needs a visible focus ring"),
        (".review-confirm:focus-visible", "every review control needs a visible focus ring"),
    ):
        if required not in css:
            errors.append(f"styles.css missing order-clarity requirement ({why}): {required}")

    if not (ROOT / "tests" / "order-format.test.mjs").is_file():
        errors.append("missing tests/order-format.test.mjs")
    if not (ROOT / "tests" / "order-ui.browser.mjs").is_file():
        errors.append("missing tests/order-ui.browser.mjs")
    if not (ROOT / "tests" / "cross-surface-contract.test.mjs").is_file():
        errors.append("missing tests/cross-surface-contract.test.mjs")
    return errors


def verify_catering() -> list[str]:
    """Approved tray pricing and catering copy must be present and current."""
    errors: list[str] = []
    html = (ROOT / "catering" / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
    main_js = (ROOT / "js" / "main.js").read_text(encoding="utf-8")
    for required in (
        "TRAY PRICING",
        "Half tray feeds 8–10 · full tray feeds 16–20",
        "Jerk Chicken", "$120", "$220",
        "Oxtail", "$200", "$380",
        "Chicken Rasta Pasta", "$140", "$260",
        "Steamed Cabbage", "$50", "$95",
        "BUILD-YOUR-SPREAD", "from $600",
        "3+ trays, custom menu, setup included.",
        "sms:+19297424202",
        "Preorder early so the quote is fast and fair — book at least 48 hours ahead.",
        "data-date-picker",
        "Open event date calendar",
        "data-catering-gmail",
        "data-catering-outlook",
        "data-catering-copy",
        "Nothing has been sent yet.",
    ):
        if required not in html:
            errors.append(f"catering/index.html missing approved content: {required}")
    for forbidden in ("from $500", "$15 larger-order fee", "Delivery wording", "Opening your email app now as a mailto fallback"):
        if forbidden in html:
            errors.append(f"catering/index.html still contains obsolete copy: {forbidden}")
    for required in (".tray-pricing{", ".tray-card{", ".spread-banner{", ".date-picker-button{", ".catering-send-options{"):
        if required not in css:
            errors.append(f"styles.css missing catering layout hook: {required}")
    for required in ("dateInput.showPicker", "mail.google.com/mail/", "outlook.live.com/mail/", "navigator.clipboard.writeText"):
        if required not in main_js:
            errors.append(f"main.js missing catering interaction hook: {required}")
    return errors


def verify_about() -> list[str]:
    """Shantay's story must credit her mother—not the Navy—for teaching her to cook."""
    errors: list[str] = []
    html = (ROOT / "about" / "index.html").read_text(encoding="utf-8")
    for required in (
        "Taught by Mom. Made with care. San Diego.",
        "Shantay Cole learned to cook from her mother",
        "Navy culinary specialist strengthened the discipline and consistency",
        "a love of cooking that started at home",
        "/assets/gallery/shantay-owner.webp",
        'width="1200" height="1500"',
        "/css/styles.css?v=20260818-shantay-photo-1",
    ):
        if required not in html:
            errors.append(f"about/index.html missing approved story correction: {required}")
    for forbidden in ("learned to cook in the Navy", "Navy-trained"):
        if forbidden in html:
            errors.append(f"about/index.html still misattributes Shantay's cooking origin: {forbidden}")
    portrait = ROOT / "assets" / "gallery" / "shantay-owner.webp"
    if not portrait.is_file():
        errors.append("about portrait is missing: assets/gallery/shantay-owner.webp")
    elif portrait.stat().st_size > 250_000:
        errors.append("about portrait exceeds the 250 KB performance budget")
    css = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
    if ".owner-photo{width:100%;height:auto;" not in css:
        errors.append("about portrait must scale responsively instead of using intrinsic pixel height")
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
    errors = verify_files() + verify_order_design() + verify_order_clarity() + verify_catering() + verify_about() + verify_http()
    if errors:
        print(f"FAIL: {len(errors)} clean-route issue(s)")
        for error in errors:
            print(f"- {error}")
        return 1
    print("PASS: clean routes, 16 optimized menu photos, side imagery, lightbox hooks, sitemap, assets, HTTP routes, grouped order summary, pre-Square review, and return receipt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
