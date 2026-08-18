# Island Delicacy checkout Worker

This Cloudflare Worker creates Square-hosted checkout links for the static order page. Prices, allowed sides, pickup-date rules, names, and phone numbers are validated again at the edge; the browser never receives a Square access token.

## Environments

- Default: `island-delicacy-checkout-sandbox`
- Production: `island-delicacy-checkout` via `--env production`

The production environment is separate and must not be enabled in `js/menu.js` until the Sandbox flow passes and Shantay approves real-money cutover.

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