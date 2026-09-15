# Fall Fest menu: pre-implementation UI contract

Stage: isolated preview branch; no public publishing authorized. User explicitly selected HTML with the generated flyer's seasonal styling, and a cleaner evergreen canopy wrap without added foliage.

## Lightweight design lock
Primary visitor: phone user coming from a QR or homepage feature. Three-second takeaway: Island Delicacy at Home Church Fall Fest, when/where, and a clearly labeled event menu with $35/$25 meal prices and included drink. The event must not masquerade as normal preorder checkout.

Chosen composition: illustrated forest-green event masthead with exact logo, live expressive cream/gold heading and an isolated plate illustration; then a clean white typographic menu, not product cards. Desktop uses two columns for event introduction/photo, followed by menu list plus compact sides/drinks column. Mobile puts title/date/menu jump first, reduces decorative artwork, and shows all four prices without horizontal scrolling. Tablet transitions at 760px. An all-poster image page was rejected because menu text must remain real HTML. A shop-card/cart design was rejected because this is a distinct event menu, not an authorized event checkout build.

Frames:
- Desktop 1440x1000: slim logo navigation; green two-column event introduction; white two-column menu; venue/directions and pricing context.
- Mobile 390x844 and 320x780: slim logo navigation; live heading/date and menu-jump CTA; contained plate; stacked live menu rows; simple sides/drinks; directions.
- Menu anchor/detail: four named meals, full prices, included drink, sides list, drink-only price. No fabricated flavor/allergen/portion claims or choice rules.

## Exact copy
Home Church Fall Fest. Saturday, October 31, 2026. 5:30–8:30 PM Pacific. 766 28th St, San Diego, CA 92102. Rides & candy for the kids! Oxtail $35; Curry Chicken $25; Jerk Chicken $25; Barbi-fried Chicken $25. Sides: Rice and peas, White rice, Plantains, Vegetables. Each meal includes a drink. Drink only $6. Prices shown apply to this event. Regular preorder menu and event menus are priced separately.

## States and boundaries
Menu is static readable HTML, functional without JS. Client-side enhancement labels the event upcoming/happening/past, hides homepage/connection promotions at event end, and retains a clearly archived event menu afterward. No checkout/payment requests or changes to worker/order/menu logic. Links to the normal menu clearly say regular preorder menu. No ordering-by-phone CTA added to this event page. Exact social-profile destinations have not been verified: do not fabricate or ship fake social buttons. Connect preview includes only known website/menu/catering and active-event links; social completion is a documented gate. No production QR released until the hub is published and destinations verified.

## Implementation guardrails
New CSS namespaced or confined to standalone event/connect pages. Homepage gets only a compact noncompeting feature link, not a seasonal replacement. Exact logo remains separate; food imagery illustrative. Images/fonts local so page can render without third-party font availability. Touch targets at least 44px, visible focus, readable contrast, semantic headings and list. Reduced-motion handling; no unnecessary animation or popup. No horizontal overflow at 320/390/768/1440.

## Acceptance
Run actual browser checks for all routes, anchors, directions URL, asset loading, no console/page errors, no checkout traffic, upcoming/live/expired states and no-JS menu. Run existing unit and homepage tests; do not modify tests to hide a regression. Capture desktop/mobile/menu/detail/home/connect screenshots. Confirm original regular-menu/order/worker bytes unchanged. Save a self-contained event HTML preview and clear release notes. Canopy visual concept only; no supplier file/order/publication.
