# Permanent Events navigation: scoped UI contract

Request: Bruce wants an always-on Events tab for Shantay, featuring the current event/flyer and a home for future pop-ups. Extend the existing site, not its checkout or branding. Use the approved brush flyer unchanged; event facts are authoritative from the existing Fall Fest HTML.

## Locked lightweight composition
Reuse existing black/cream/gold website header, footer, Archivo typography, buttons and container widths. Keep seasonal brush/botanical artwork within the flyer and existing dedicated menu page, not the permanent site chrome. No generic card grid for a single real event, fake upcoming dates or empty filters.

Desktop/default frame:
```
Home / Order / Catering / EVENTS / About / FAQ   [Order]
Events & Pop-Ups
Find Island Delicacy at local pop-ups and community events in San Diego.
-------------------------------------------------------------
[Upcoming event]                   [Approved portrait flyer]
Home Church Fall Fest              [full aspect ratio]
Saturday October 31, 2026           [click to open flyer PDF]
5:30–8:30 PM Pacific
766 28th St, San Diego CA 92102
[View event menu] [Get directions]
Event-specific pricing note
```
Mobile frame: established MENU drawer includes Events; title -> live date/location -> primary menu action -> directions -> flyer. No horizontally squeezed columns or text baked into the only source of event facts. Flyer maintains its full aspect ratio.
Detail frame: reuse `/events/home-church-fall-fest/` unchanged except a visible Events return link. Its live HTML menu remains primary for prices; QR hub gains a permanent Events link.

## Visibility and states
Always visible: Events in global navigation and footer, event date/time/location, menu and flyer links. No new checkout or API calls.
Secondary: pricing separation note, directions, flyer PDF. No public internal QA/source text.
Upcoming/live/ended: timezone-explicit dates; ongoing event label updates; after end, never advertise it as upcoming, keep flyer/menu under Past events and show a truthful no-upcoming-date notice. Empty future calendar keeps Events navigation. No-JS shows explicit date/year and neutral 'Event calendar' rather than an unbounded 'Upcoming' assertion. No fabricated event lineup.

## Acceptance
Events route and permanent navigation work at320/390/768/1024/1440px. Menu drawer entry is usable. No horizontal overflow, nav collisions, console errors or missing images. Visible current-state link plus no-JS readability; expiry boundary tests use Pacific-offset event timestamps. PDF is byte-identical to approved single-flyer export; responsive poster is derived from approved PNG without crop. Test every main navigation route plus QR hub and return link. Existing regular menu/cart code, backend, prices, checkout and event prices remain unchanged. Run existing unit, homepage, order UI, event tests and new Events browser tests. Inspect actual desktop/mobile renders. Release only scoped requested changes; verify public URL/assets after deployment and record rollback commit.
