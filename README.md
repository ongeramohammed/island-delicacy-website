# Island Delicacy Website

Static GitHub Pages site for Island Delicacy, a preorder-only Jamaican/Caribbean food business in San Diego.

## Pages

- `index.html` — photo hero, weekly menu preview, preorder explanation, testimonials
- `order.html` — single-page preorder flow with Pacific 10:00 AM cutoff logic
- `catering.html` — catering packages and inquiry form
- `about.html` — Shantay Cole owner story
- `faq.html` — preorder/payment/contact FAQ

## Ordering rules implemented

- No same-day plates.
- Orders close at 10:00 AM America/Los_Angeles for next-day pickup; after 10 AM the earliest date is the day after tomorrow.
- Customers select a pickup date only; the site repeatedly says Island Delicacy will text to set pickup time.
- Contact routes to `(929) 742-4202` and `islanddelicacy@outlook.com`.
- No Stew Peas are listed.
- Bowls, tacos and breakfast are shown only in a non-orderable “Coming soon — text to request” strip.

## Square payment links

`js/menu.js` contains the menu data and `window.SQUARE_LINKS`. Paste Shantay's real Square Payment Link URL for each item ID when available. Until then, the checkout button opens a prefilled SMS order to the business line.

## Catering form

The catering form uses a documented `mailto:` fallback to `islanddelicacy@outlook.com`. If a Formspree endpoint is added later, replace the submit handler in `js/main.js` with the endpoint POST.

## Local preview

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
