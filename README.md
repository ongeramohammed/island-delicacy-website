# Island Delicacy Website

Static GitHub Pages site for Island Delicacy, a preorder-only Jamaican/Caribbean food business in San Diego.

## Pages

- `/` — photo hero, weekly menu preview, preorder explanation, testimonials
- `/order/` — single-page preorder flow with Pacific 10:00 AM cutoff logic
- `/catering/` — catering packages and inquiry form
- `/about/` — Shantay Cole owner story
- `/faq/` — preorder/payment/contact FAQ

The legacy `.html` files remain as `noindex` compatibility redirects so old bookmarks keep working. All primary navigation, canonical metadata, Open Graph URLs, and sitemap entries use the clean routes.

## Ordering rules implemented

- No same-day plates.
- Orders close at 10:00 AM America/Los_Angeles for next-day pickup; after 10 AM the earliest date is the day after tomorrow.
- Customers select a pickup date only; the site repeatedly says Island Delicacy will text to set pickup time.
- Most plates include rice & peas plus two sides; Rasta Pasta plates offer rice & peas as one of the side choices instead.
- Extra meat is $10, extra oxtail is $12, and standalone sides can be ordered for $5 each without a plate.
- Plate notes support up to 200 characters and are included in the checkout/text-order summary.
- Contact routes to `(929) 742-4202` and `islanddelicacy@outlook.com`.
- No Stew Peas are listed.
- Bowls, tacos and breakfast are shown only in a non-orderable “Coming soon — text to request” strip.

## Square payment links

`js/menu.js` contains the menu data and `window.SQUARE_LINKS`. Paste Shantay's real Square Payment Link URL for each item ID when available. Until then, the checkout button opens a prefilled SMS order to the business line.

See `square/SQUARE_SETUP_HUMAN.md` for the owner checklist and `square/SQUARE_SETUP_AGENT.md` for the future Cloudflare Worker + Square Checkout API plan. Never commit Square credentials; use local environment files or deployment secrets.

## Catering form

The catering form uses a documented `mailto:` fallback to `islanddelicacy@outlook.com`. If a Formspree endpoint is added later, replace the submit handler in `js/main.js` with the endpoint POST.

## Local preview

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`. Clean routes such as `/order/` work because each route is backed by a directory `index.html`.
