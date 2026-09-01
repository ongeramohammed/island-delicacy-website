# Island Delicacy checkout Worker

This Cloudflare Worker creates Square-hosted checkout links for the static order page. Prices, allowed sides, pickup-date rules, names, and phone numbers are validated again at the edge; the browser never receives a Square access token.

## Environments

- Default: `island-delicacy-checkout-sandbox`
- Production: `island-delicacy-checkout` via `--env production`

The production environment is separate and must not be enabled in `js/menu.js` until the Sandbox flow passes and Shantay approves real-money cutover.

## What the customer is guaranteed to see, and what Square may show

These are deliberately separate, and only the first is a guarantee.

**Guaranteed by this site.** Before any payment link is created, the order page shows
a review sheet listing every plate with `Includes`, `Your sides`, `Extras` and
`Leave off / requests`, plus the pickup date, name, phone and total. After Square
returns, the same order is re-rendered from a privacy-minimized `sessionStorage`
receipt. Both surfaces and the text-order fallback render from `js/order-format.js`,
so they cannot disagree. This is covered by `tests/order-ui.browser.mjs`.

**Not guaranteed.** Whether Square's hosted checkout renders `OrderLineItem.note` to
the buyer is **unverified**. We send it — every plate line carries
`Includes: … · Sides: … · Leave off / requests: …` so the kitchen ticket and the
Square dashboard are unambiguous — but no claim is made about the buyer-facing
Square page. Do not tell a customer "you can check your sides on Square." The
first-party review sheet exists precisely so that customer visibility does not
depend on Square's UI. If Square's rendering is ever confirmed, document the
evidence here before relying on it.

## Local test

Copy `.dev.vars.example` to `.dev.vars`, fill it locally, and keep it untracked.

```sh
npm install
npm test
npm run dev
```

## Deploy secrets

Set secrets without placing values in shell history or source files:

```sh
npx wrangler secret put SQUARE_ACCESS_TOKEN --env=""
npx wrangler secret put SQUARE_LOCATION_ID --env=""

npx wrangler secret put SQUARE_ACCESS_TOKEN --env production
npx wrangler secret put SQUARE_LOCATION_ID --env production
```

Then deploy and verify `/health` before adding the returned Worker URL to `window.ISLAND_CHECKOUT`:

```sh
npm run deploy:sandbox
npm run deploy:production
```

Production deployment does not itself activate the site. The public order page uses the production Worker only after `window.ISLAND_CHECKOUT.production` is intentionally populated.