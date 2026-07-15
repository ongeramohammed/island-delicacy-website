# Square Setup — Owner's Guide (for Shantay)

This is the human checklist for connecting your Square account to the ordering website. You do the Square Dashboard parts; the developer (or AI agent) does the code parts. Nothing here requires coding.

**The plan, in one sentence:** customers build their order on the website, press one button, and land on a Square payment page with every plate already listed — you get the money in Square and a note telling you what to cook, for which day, and who to text.

---

## Step 1 — Get your Square account ready (~15 min)

1. Sign in at **squareup.com/dashboard** (create a free account if needed — choose "Food & Beverage").
2. Finish identity verification and **link your bank account** (Settings → Bank Accounts). Payouts don't work without this.
3. Under **Account & Settings → Business information**, make sure the business name is **Island Delicacy** and the receipt contact is **(929) 742-4202 / islanddelicacy@outlook.com** — this is what customers see on receipts.

## Step 2 — Enter your menu (~30 min, one time)

Go to **Items & Orders → Items** and create these 12 items with exactly these names and prices (the website matches them by name):

- Jerk Chicken — $20
- Curry Chicken — $20
- Fried Chicken — $20
- Barbi Fried Chicken — $20
- Brown Stew Chicken — $20
- Oxtail — $25
- Curry Goat — $25
- Chicken Rasta Pasta — $22
- Shrimp Rasta Pasta — $25
- Oxtail Rasta Pasta — $28
- Curry Shrimp — $25
- Escovitch Fish — $30

Then create these **modifier sets** (Items → Modifiers):

1. **"Pick 2 sides"** — options: Steamed Cabbage, Sweet Plantains, Rasta Pasta (all $0). Set it to require **exactly 2** choices. Attach to every plate EXCEPT the three Rasta Pastas. (Rice & peas comes with these plates automatically — don't make it a modifier.)
2. **"Pick 2 sides (rasta pasta)"** — options: Steamed Cabbage, Sweet Plantains, Rice & Peas (all $0), require exactly 2. Attach to the three Rasta Pasta plates only — **rasta pasta plates don't include rice & peas**, so it's offered as a side choice instead.
3. **"Extra meat"** — optional, one of: Extra meat **$10.00** / Extra oxtail **$12.00**. Attach to all 12 items.
4. **"Plate note"** — a free-text note/special-request field if your Square plan supports it (customers type things like "no carrots"). Otherwise order notes carry it from the website.

Also create four standalone **"Side · …" items at $5.00 each** (Steamed Cabbage, Sweet Plantains, Rasta Pasta, Rice & Peas) — the website lets customers order sides on their own, no plate needed.

Don't add Stew Peas, bowls, tacos, or breakfast — those aren't orderable yet.

## Step 3 — First version: payment links (gets you live this week)

1. Open each item and click **Create payment link** (or use Online Checkout → Payment Links).
2. Copy all 12 plate link URLs (plus the 4 side-only items) into one message and **send them to your developer/agent** — they paste them into the site.
3. How it works while this version is live: an order with **one** kind of plate goes straight to Square payment. An order that mixes **several different plates** comes to you as a **text message** with the full order — you reply with a payment link or take payment however you prefer. This limitation goes away in Step 4.

## Step 4 — Full version: real cart checkout (the good one)

For the website to send a whole mixed order to one Square payment page, the developer needs two things from your Square account. Get them from **developer.squareup.com/apps** (sign in with the same Square login, click **+ Create your first application**, name it "Island Delicacy Website"):

1. **Access Token** — in the app, under **Credentials**. There are two tabs: **Sandbox** (fake money, for testing) and **Production** (real money). Send the developer the **Sandbox** one first; only send the **Production** token after you've seen a test order work end-to-end.
2. **Location ID** — under **Locations** in the same app page.

⚠️ Treat the Production access token like your bank password. Send it privately (not in a group chat), and if it ever leaks, go back to that page and click **Replace token**.

When this version is live, every order — any mix of plates — lands in **Square Dashboard → Orders** with a note like: *"Pickup Thu Jul 16 · Maria G. · (619) 555-0182"* and each plate's sides listed.

## Step 5 — Your daily routine

- **Each morning (before 11 AM):** open the Square app → check today's paid orders → text each customer their pickup time from (929) 742-4202.
- **Set how many plates you can make:** in Square, set each item's **inventory count** for the day (Items → item → Manage stock). When something hits 0, Square stops selling it even if the website is a step behind.
- **Pausing orders** (vacation, sold out for the week): mark all items as sold out in Square, and tell the developer to flip the site's "ordering paused" note if you want the site to say so too.
- **Refunds:** Square Dashboard → Transactions → select payment → Refund. Full or partial.

## What Square costs

No monthly fee for any of this. Square keeps a processing fee per online payment (currently ~2.9% + 30¢ — check squareup.com/pricing). On a $25 plate that's about $1.03.

## Quick reference — who does what

- **You:** items, prices, modifiers, inventory counts, payment links, tokens, refunds, texting customers.
- **Developer/agent:** everything in the code, the checkout button, the cart→Square connection, testing with fake money before real money.

Questions the developer might ask you: "Are these prices still right?" · "Confirm the sides list" · "Ready to switch from test mode to real payments?" — those are your calls.
