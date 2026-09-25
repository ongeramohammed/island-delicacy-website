# Island Delicacy Website

Website for Island Delicacy, a preorder-only Jamaican and Caribbean food business in San Diego. Live at [islanddelicacy.com](https://islanddelicacy.com).

Customers build their plates on the order page, check a full review of the order, then pay through Square-hosted checkout or send the order as a prefilled text. The site is static HTML, CSS and JavaScript on GitHub Pages with no build step. The one server piece is a small Cloudflare Worker in `worker/` that creates the Square checkout links.

## Pages

| URL | What it is |
| --- | --- |
| `/` | Home: hero, featured plates, how preorder works, owner section, catering trays, customer quotes |
| `/order/` | Preorder builder: plates, sides, extras, notes, pickup date, review sheet and checkout |
| `/catering/` | Tray options and catering inquiry form |
| `/events/` | Events and pop-ups, with the current event and its flyer |
| `/events/home-church-fall-fest/` | Home Church Fall Fest event menu |
| `/connect/` | Menu and links hub |
| `/about/` | Shantay Cole's story |
| `/faq/` | Preorder, pickup, payment and contact FAQ |

Each route is a folder with an `index.html`. The older `.html` files at the root are `noindex` redirects so old bookmarks keep working. Navigation, canonical tags, Open Graph URLs and `sitemap.xml` all use the clean routes.

## Ordering rules

- No same-day plates. Orders close at 10:00 AM Pacific for next-day pickup; after 10 AM the earliest pickup is the day after tomorrow.
- Customers choose a pickup date only. Island Delicacy texts them to set the pickup time.
- Most plates include rice & peas plus two sides. Rasta Pasta plates offer rice & peas as one of the side choices instead.
- Extra meat is $10, extra oxtail is $12, and sides can be ordered on their own for $5 each.
- Plate notes are limited to 200 characters and carry through to the review, receipt, text order and Square note.
- Bowls, tacos and breakfast appear only in a "Coming soon, text to request" strip and can't be ordered online.
- No Stew Peas are listed.
- Contact goes to (929) 742-4202 and islanddelicacy@outlook.com.

## Checkout

`js/menu.js` holds the menu (`window.ISLAND_MENU`), side photos, optional per-item Square Payment Links (`window.SQUARE_LINKS`, currently empty) and the checkout endpoints (`window.ISLAND_CHECKOUT`).

On the order page, the main button opens a review sheet; only Confirm inside that sheet can create a payment link. Payment then goes the first way that's available:

1. **Checkout Worker.** The Worker checks prices, sides, pickup-date rules, name and phone again and returns a Square-hosted checkout link. The normal order page uses the production Worker; adding `?sandbox=1` to the order page URL uses the Sandbox Worker.
2. **Square Payment Link** from `window.SQUARE_LINKS`, for a single plate with no other items.
3. **Text order.** A prefilled SMS to the business line.

When the customer comes back from Square, the order page shows their submitted receipt from `sessionStorage`. The review sheet, receipt, text order and Square line note are all rendered by `js/order-format.js`, so they can't disagree.

The Worker has its own README at [`worker/README.md`](worker/README.md) covering environments, local testing, secrets and deploys. `square/SQUARE_SETUP_HUMAN.md` is the owner's Square checklist and `square/SQUARE_SETUP_AGENT.md` is the developer plan. Never commit Square credentials: `.env.example` and `worker/.dev.vars.example` show the variable names only.

## Catering inquiries

The catering form doesn't post to a server. It builds the inquiry and lets the customer send it by text, Gmail or Outlook, or copy it to paste anywhere.

## Photos and brand assets

- The 12 orderable plates and 4 side choices each have their own 1400×1400 WebP photo in `assets/menu/`.
- The homepage features Oxtail, Jerk Chicken, Curry Goat and Shrimp Rasta Pasta.
- Order-page thumbnails open a tap-to-enlarge lightbox; `Esc` closes it.
- Event artwork, the approved flyer and font licenses are in `assets/events/fall-fest/`, with provenance notes.
- `BRAND-IMAGE-GUIDE.md` covers photo priorities and visual style for future updates. `design/` holds the UI notes for the events pages.
- Original multi-megabyte source images and the design-tool prototype stay outside this public repo.

## Local preview

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. Clean routes such as `/order/` work because each one is a folder with an `index.html`. Port 8000 is one of the local origins the Sandbox Worker accepts, so `?sandbox=1` checkout can be tested locally.

## Tests

```bash
python3 scripts/verify_clean_urls.py   # clean routes, redirects, 16 menu photos, local assets, local HTTP responses
npm test                               # order formatting and browser-vs-Square note contract
cd worker && npm test                  # checkout Worker unit tests
```

The browser tests (`npm run test:ui`, `test:home`, `test:events`, `test:fall-fest`) use Playwright, which is not a dependency of this repo. `test:ui` and `test:home` read its location from `PLAYWRIGHT_MODULE`.

`.github/workflows/verify-clean-urls.yml` runs the route check, both Node tests and the Worker tests on every push to `main` and on pull requests.

## Deployment

GitHub Pages publishes the `main` branch from the repo root, and `CNAME` points it at `islanddelicacy.com`. There is no build step. The Worker deploys separately with Wrangler (see `worker/README.md`).

## Maintainer

Built and maintained by [Bruce Works](https://bruceworks.net) with [@ongeramohammed](https://github.com/ongeramohammed), who owns this repository.
