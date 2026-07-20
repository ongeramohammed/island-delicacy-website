# Square Backend Setup — Instructions for a Coding Agent

**Audience:** an autonomous coding agent (Hermes, Codex, Claude Code, etc.) with access to the repo `github.com/ongeramohammed/island-delicacy-website` and, for Phase 2, a Cloudflare account.
**Goal:** wire the static ordering site to the owner's Square account so customers can pay real money. The site stays static (GitHub Pages); any server logic lives in a single Cloudflare Worker.
**Owner inputs you must request and never invent:** Square access token, Square Location ID, real payment-link URLs. Flag missing inputs and stop — do not stub with fake live URLs.

---

## Context you need

- The current static flow supports one plate line plus any number of $5 side-only lines. A static per-item payment link cannot represent every valid combination, so unsupported carts fall back to SMS. Phase 1 below is a degraded-but-shippable stopgap; Phase 2 is the correct implementation.
- Cutoff rule: orders close **10:00 AM America/Los_Angeles** for next-day pickup. The site enforces this client-side; Square does not need to know about it, but the order note must carry the pickup date.
- Contact for order confirmations: Square's receipt + the owner texts the customer from (929) 742-4202. No email automation needed.
- Business owner: Shantay Cole. Do not use any personal phone number anywhere in code.

## Menu data (single source of truth)

Create these in Square exactly (names and prices must match the site):

| id (site) | Square item name | Price |
|---|---|---|
| jerk | Jerk Chicken | $20 |
| curry-chicken | Curry Chicken | $20 |
| fried-chicken | Fried Chicken | $20 |
| barbi-fried-chicken | Barbi Fried Chicken | $20 |
| brown-stew-chicken | Brown Stew Chicken | $20 |
| oxtail | Oxtail | $25 |
| curry-goat | Curry Goat | $25 |
| chicken-rasta-pasta | Chicken Rasta Pasta | $22 |
| shrimp-rasta-pasta | Shrimp Rasta Pasta | $25 |
| oxtail-rasta-pasta | Oxtail Rasta Pasta | $28 |
| curry-shrimp | Curry Shrimp | $25 |
| escovitch-fish | Escovitch Fish | $30 |

Side-only items (orderable with no plate, $5.00 each): Side · Steamed Cabbage, Side · Sweet Plantains, Side · Rasta Pasta, Side · Rice & Peas.

Modifiers:
- **"Pick 2 sides"** — required, exactly 2 selections: Steamed Cabbage / Sweet Plantains / Rasta Pasta ($0 each). Applies to every plate EXCEPT rasta pastas. Rice & peas is always included on these plates — not a modifier.
- **"Pick 2 sides (rasta pasta)"** — required, exactly 2 selections: Steamed Cabbage / Sweet Plantains / Rice & Peas ($0 each). Applies to the three Rasta Pasta plates only — rasta pasta plates do NOT include rice & peas; it's a selectable side for them instead.
- **"Extra meat"** — optional, single-select: Extra meat +$10.00 / Extra oxtail +$12.00. All plates.
- **Plate note** — free-text per line (e.g. "no carrots"); carry it in the Square line-item note.

Catalog creation can be done by the owner in the Dashboard (see SQUARE_SETUP_HUMAN.md) or by you via the Catalog API (`POST /v2/catalog/batch-upsert`) if you're given an access token. Prefer letting the owner do it in the Dashboard — she then owns the catalog.

---

## Phase 1 — no backend (ship day one)

Static per-item Square payment links. Works for single-plate orders; multi-plate orders fall back to SMS.

1. Owner generates one payment link per plate in Square Dashboard (Items → item → Create payment link) and provides the 12 URLs. Side-only combinations continue to use SMS until Phase 2.
2. In `js/main.js`, populate:
   ```js
   const SQUARE_LINKS = { jerk: 'https://square.link/u/…', oxtail: '…', /* all 12 */ };
   ```
3. Checkout button behavior:
   - Cart has exactly ONE line: open `SQUARE_LINKS[id]`. Append `?note=` details if the link supports it; otherwise instruct the customer (confirmation copy) that sides/date were sent by text. Also fire the prefilled SMS (below) so the owner still gets full order details — Square's link only captures item + qty reliably.
   - Cart includes side-only items, or its `SQUARE_LINKS` entry is missing: fall back to `sms:+19297424202?&body=<urlencoded order summary>` with lines like `2x Oxtail (cabbage, plantains, extra meat) — $60`, pickup date, name. Button label in this case: "TEXT ORDER — WE'LL SEND A PAYMENT LINK".
4. Do not fake a "paid" confirmation in Phase 1 — after opening the link/SMS, show the recap screen with copy "Complete payment in the Square tab — your order isn't locked in until it's paid."

## Phase 2 — Cloudflare Worker + Square Checkout API (correct)

One Worker endpoint that turns the cart into a real Square-hosted checkout with all line items.

1. **Worker** `POST /api/checkout` (deploy with wrangler; route it on a subdomain, e.g. `order-api.islanddelicacy.com`, CORS-allow `https://islanddelicacy.com`):
   - Request body: `{ lines: [{ id, qty, sides: [..], meat: false|'meat'|'oxtail', note: string }], date: 'YYYY-MM-DD', name, phone }`. A line may also be a side-only item (`id: 'side-…'`, no sides array).
   - Validate: known ids, qty 1–10, exactly 2 sides per plate line (rasta pasta plates may include 'Rice & Peas'; others may not), note ≤ 200 chars, date ≥ earliest eligible (recompute the 10 AM America/Los_Angeles cutoff server-side — do not trust the client), phone plausible.
   - **Price server-side** from a hardcoded price map (never trust client totals). Side-only line = 500 cents. Extra meat = +1000 cents; extra oxtail = +1200 cents per line.
   - Call Square `POST /v2/online-checkout/payment-links` with `order.line_items[]` (name, quantity, `base_price_money`, and a per-line `note` carrying the sides/extra), plus an order-level note: `Pickup {date} · {name} · {phone}`. Set `checkout_options.redirect_url` to `https://islanddelicacy.com/order/?paid=1`.
   - Secrets: `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID` as Worker secrets (`wrangler secret put`). Never commit them. Use Square **Sandbox** credentials + `connect.squareupsandbox.com` until the owner approves go-live, then switch to production values.
   - Response: `{ url }`. On Square error, return 502 with a safe message; the site falls back to the Phase-1 SMS path.
2. **Site changes:** checkout button calls the Worker, redirects to the returned `url`. On return with `?paid=1`, show the confirmation screen. Keep the SMS fallback for fetch/Worker failure.
3. **Inventory (optional, after checkout works):** add Worker route `GET /api/counts` → Square Inventory API (`POST /v2/inventory/counts/batch-retrieve`), cache 60 s, return `{ id: remaining }`. Site hydrates the "N LEFT" chips from it; graceful fallback to "LIMITED DAILY". Owner sets daily counts in the Square app each morning.
4. **Webhook (optional):** `payment.updated` webhook → Worker → decrement is unnecessary if the owner tracks inventory in Square itself. Skip unless asked.

## Test checklist (do all before telling the owner it's live)

- [ ] Sandbox: single plate, 2 sides, qty 1 → Square checkout shows correct item, price, note.
- [ ] Sandbox/API: several plate lines, one with extra meat and one with extra oxtail, plus side-only items → all line items present, total correct to the cent.
- [ ] Order note contains pickup date, name, phone.
- [ ] After 10:00 AM PT, the earliest selectable date is day-after-tomorrow, and the Worker rejects a submitted "tomorrow" date.
- [ ] Redirect back to `?paid=1` shows the confirmation screen with the customer's phone number.
- [ ] Worker down / fetch fails → SMS fallback opens with a complete, readable order summary.
- [ ] No secret appears in the repo, in `js/`, or in any client-visible response.

## Do NOT

- Do not put the Square access token in client-side JS under any circumstance.
- Do not compute prices from the DOM or trust the client's total.
- Do not enable same-day pickup or add discount codes.
- Do not create Square items for Stew Peas, bowls, tacos, or breakfast.
- Do not commit any Square access token — the repo is PUBLIC. `.env` in `.gitignore` before first commit; tokens live only in Worker secrets (`wrangler secret put`). Ship a `.env.example` with empty placeholders and enable GitHub secret scanning + push protection.
- Do not send anything to a personal phone number; business line only: (929) 742-4202.
