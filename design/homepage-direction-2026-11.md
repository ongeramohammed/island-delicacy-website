# Homepage direction, November 2026

Bruce Works redesigned the homepage on 2026-11-21. Bruce liked a restaurant homepage he'd seen and wanted Island Delicacy's to "look more legit", then approved the mockup ("let's publish it for her"). This replaces the August 2026 board-only homepage lock.

## What the page does
- **Hero:** five photos of her plates fill the screen and slowly crossfade like a muted video. It's pure CSS with a Pause button, and it stops on one still photo for people who ask for reduced motion. Under the headline are three actions: Order for <earliest day>, See the menu, Catering trays. The live cutoff line sits below them.
- **How preorder works:** three steps that keep the truthful checkout wording: "before anything is sent" and "pay securely through Square".
- **Menu strip:** a swipe row of all 12 plates. Names, prices and notes come from `window.ISLAND_MENU` (`hydrateMenuStrip()` in `js/main.js`), so the homepage can't drift from the order page. A "best seller" or "chef pick" note becomes a flag on the photo.
- **Rest of the page:** Shantay's section (approved portrait, her own words), a catering panel with the tray prices from `/catering/`, a kitchen photo grid, the two real customer quotes, and contact and pickup details.
- **Phones:** a Call / Order bar stays at the bottom of the screen. The nav uses the same `data-menu-toggle` drawer and `.footer` Events link as every other page.
- **Events:** the event banner slot (`data-fall-feature`, `js/fall-fest.js`) stays and shows itself only while an event is current.

## Photos
- Hero, `kitchen-takeout` and the menu strip are her real plates, from Bruce's July 2026 photos, relit on a dark table. The food, dishes and portions were kept as they were.
- `trays`, `kitchen-pot`, `kitchen-grill`, `kitchen-plantains`, `kitchen-plate` and `kitchen-pickup` are made-up scenes of dishes she sells. Swap them for real shots when there's a cook-day shoot.

## Checks
- `scripts/verify_clean_urls.py` (`verify_homepage`) holds the homepage contract in CI.
- `tests/homepage-ui.browser.mjs` covers it in Chromium at 1440, 768 and 390.
