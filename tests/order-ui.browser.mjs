/*
 * Deterministic browser coverage for the order-clarity chain.
 *
 * Serves the repository over plain HTTP, drives the real /order/ page in Chromium and
 * asserts the behaviours the customer depends on: a grouped summary, a review that
 * happens strictly BEFORE any checkout request, edit-from-review, the confirmed
 * payload, the Square-return receipt, the text fallback, multi-plate isolation,
 * keyboard/focus behaviour, and geometry at 390x844 / 768x1024 / 1440x900.
 *
 * Playwright is not a dependency of this repository. Point PLAYWRIGHT_MODULE at an
 * installed copy, or set it in the environment before running:
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/order-ui.browser.mjs
 *
 * No real Square order is ever created: every checkout request is intercepted.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE
  || '/home/bruce/open-design/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };

function serve() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

// Synthetic fixtures only.
const PLATES = [
  { id: 'jerk', sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: 'meat', qty: 2, note: 'No carrots, sauce on the side' },
  { id: 'oxtail-rasta-pasta', sides: ['Rice & Peas', 'Steamed Cabbage'], meat: null, qty: 1, note: 'Extra gravy on the side please' },
  { id: 'curry-goat', sides: ['Sweet Plantains', 'Rasta Pasta'], meat: 'oxtail', qty: 1, note: '' },
];
const CUSTOMER = { name: 'Marcus Dell', phone: '(619) 555-0147' };

async function addPlate(page, plate) {
  await page.click(`[data-item="${plate.id}"]`);
  for (const side of plate.sides) await page.check(`[data-side-options] input[name="side"][value="${side}"]`, { force: true });
  if (plate.note) await page.fill('#plateNote', plate.note);
  if (plate.meat) await page.click(`[data-meat="${plate.meat}"]`);
  for (let i = 1; i < plate.qty; i += 1) await page.click('[data-qty-plus]');
  await page.click('[data-add-plate]');
}

/**
 * Watch every navigation the page attempts, without touching production code.
 * window.location is not redefinable in Chromium, so this reads the intent from CDP
 * and aborts the outbound Square request — no real checkout is ever reached.
 */
async function watchNavigation(page) {
  const events = { checkoutRequests: [], alerts: [], navigations: [] };
  const client = await page.context().newCDPSession(page);
  await client.send('Page.enable');
  client.on('Page.frameRequestedNavigation', (e) => { if (!e.url.startsWith('http://127.0.0.1')) events.navigations.push(e.url); });
  page.on('dialog', (d) => { events.alerts.push(d.message()); d.accept(); });
  // square.link is stubbed, never contacted: the hand-off completes deterministically
  // and no real Square checkout page is ever loaded.
  await page.route('**square.link**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Square checkout (stubbed by the test harness)</title>' }));
  return events;
}

async function waitForNavigation(events, match, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const hit = events.navigations.find((url) => url.startsWith(match));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`no navigation starting with ${match}; saw ${JSON.stringify(events.navigations)}`);
}

/** Builds the standard 4-line / 6-item synthetic order and records checkout attempts. */
async function buildOrder(page, base, { plates = PLATES, sides = ['Sweet Plantains', 'Sweet Plantains'] } = {}) {
  const events = await watchNavigation(page);
  await page.route('**/api/checkout', async (route) => {
    events.checkoutRequests.push(JSON.parse(route.request().postData() || '{}'));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://square.link/u/synthetic-test', orderId: 'SYNTHETIC-ORDER-REF', paymentLinkId: 'SYNTHETIC-LINK', environment: 'production' }) });
  });
  await page.goto(`${base}/order/`, { waitUntil: 'domcontentloaded' });
  for (const plate of plates) await addPlate(page, plate);
  for (const side of sides) await page.click(`[data-add-side="${side}"]`);
  await page.fill('#customerName', CUSTOMER.name);
  await page.fill('#customerPhone', CUSTOMER.phone);
  return events;
}

const results = [];
function check(name, fn) { return Promise.resolve().then(fn).then(() => { results.push({ name, ok: true }); console.log(`  ok  ${name}`); }, (error) => { results.push({ name, ok: false, error }); console.log(`  FAIL ${name}\n       ${error.message.split('\n')[0]}`); }); }

const { server, base } = await serve();
const { chromium } = await import(PLAYWRIGHT);
const browser = await chromium.launch();

// --------------------------------------------------------------------------
// 1. Grouped summary, review chronology, edit, payload, receipt, fallback
// --------------------------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const events = await buildOrder(page, base);

  await check('the sidebar groups every plate under Includes / Your sides / Extras / Leave off', async () => {
    const labels = await page.$$eval('[data-summary-lines] .ticket:first-of-type .ticket-spec dt', (els) => els.map((e) => e.textContent));
    assert.deepEqual(labels, ['Includes', 'Your sides', 'Extras', 'Leave off / requests']);
    const values = await page.$$eval('[data-summary-lines] .ticket:first-of-type .ticket-spec dd', (els) => els.map((e) => e.textContent));
    assert.deepEqual(values, ['Rice & Peas', 'Steamed Cabbage · Sweet Plantains', 'Extra meat (+$10)', 'No carrots, sauce on the side']);
    assert.equal(await page.textContent('[data-total]'), '$125');
  });

  await check('a rasta-pasta plate shows the absence of rice & peas rather than hiding the row', async () => {
    const text = await page.$eval('[data-od-id="order-line-oxtail-rasta-pasta-1"]', (el) => el.textContent);
    assert.match(text, /Includes/);
    assert.match(text, /No rice & peas — rasta pasta plate/);
  });

  await check('multiple differently configured plates stay independent in the summary', async () => {
    const sides = await page.$$eval('[data-summary-lines] .ticket', (els) => els.map((el) => {
      const dts = [...el.querySelectorAll('dt')].map((d) => d.textContent);
      const i = dts.indexOf('Your sides');
      return i < 0 ? null : el.querySelectorAll('dd')[i].textContent;
    }));
    assert.deepEqual(sides, ['Steamed Cabbage · Sweet Plantains', 'Steamed Cabbage · Rice & Peas', 'Sweet Plantains · Rasta Pasta', null]);
  });

  await check('the primary button opens the review and creates NO checkout request', async () => {
    assert.equal((await page.textContent('[data-checkout]')).trim(), 'REVIEW YOUR ORDER →');
    await page.click('[data-checkout]');
    await page.waitForSelector('[data-review-dialog]', { state: 'visible' });
    assert.equal(events.checkoutRequests.length, 0, 'no payment link may be created before confirmation');
  });

  await check('the review reprints every plate, the pickup details and the exact total', async () => {
    const titles = await page.$$eval('[data-review-lines] .ticket-name', (els) => els.map((e) => e.textContent));
    assert.deepEqual(titles, ['2 × Jerk Chicken', '1 × Oxtail Rasta Pasta', '1 × Curry Goat', '2 × Side · Sweet Plantains']);
    assert.equal(await page.textContent('[data-review-total]'), '$125');
    assert.equal(await page.textContent('[data-review-count]'), '4 lines · 6 items');
    const pickup = await page.textContent('[data-review-pickup]');
    assert.match(pickup, /Marcus Dell/);
    assert.match(pickup, /\(619\) 555-0147/);
    const leaveOff = await page.$$eval('[data-review-lines] .ticket-spec dd', (els) => els.map((e) => e.textContent));
    assert.ok(leaveOff.includes('Nothing — cook it as it comes'), 'an unanswered request must be stated, not blank');
  });

  await check('focus enters the dialog, is trapped, and Escape restores focus to the opener', async () => {
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-od-id')), 'order-review-dialog');
    // Tab forward past the last control wraps back to the first.
    const order = [];
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement.getAttribute('data-od-id') || document.activeElement.className));
      assert.ok(await page.evaluate(() => document.querySelector('[data-review-dialog]').contains(document.activeElement)), 'focus must not escape the dialog');
    }
    assert.ok(order.includes('order-review-confirm'), `confirm button must be reachable by keyboard, saw ${JSON.stringify(order)}`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-review-dialog]', { state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-od-id')), 'order-review-open');
    assert.equal(events.checkoutRequests.length, 0);
  });

  await check('Edit order closes the review with the order intact and still unsent', async () => {
    await page.click('[data-checkout]');
    await page.waitForSelector('[data-review-dialog]', { state: 'visible' });
    await page.click('[data-od-id="order-review-edit"]');
    await page.waitForSelector('[data-review-dialog]', { state: 'hidden' });
    assert.equal(await page.textContent('[data-total]'), '$125');
    assert.equal(events.checkoutRequests.length, 0);
    // The customer really can edit: removing a plate updates the total.
    await page.click('[data-od-id="order-line-curry-goat-2"] .ticket-remove');
    assert.equal(await page.textContent('[data-total]'), '$88');
  });

  await check('Confirm sends exactly the reviewed order and stores a privacy-minimized receipt', async () => {
    await page.click('[data-checkout]');
    await page.waitForSelector('[data-review-dialog]', { state: 'visible' });
    await page.click('[data-od-id="order-review-confirm"]');
    await waitForNavigation(events, 'https://square.link/');
    await page.waitForURL(/^https:\/\/square\.link\//);

    assert.equal(events.checkoutRequests.length, 1, 'exactly one payment link is created, and only after Confirm');
    const payload = events.checkoutRequests[0];
    assert.deepEqual(payload.lines, [
      { id: 'jerk', qty: 2, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: 'meat', note: 'No carrots, sauce on the side' },
      { id: 'oxtail-rasta-pasta', qty: 1, sides: ['Steamed Cabbage', 'Rice & Peas'], meat: false, note: 'Extra gravy on the side please' },
      { id: 'side-sweet-plantains', qty: 2 },
    ]);
    assert.equal(payload.name, 'Marcus Dell');
    assert.deepEqual(events.navigations, ['https://square.link/u/synthetic-test'], 'the only outbound navigation is the Square link we were handed');

    // The tab is now on the stubbed square.link document, so come back to our own
    // origin to read what was stored for the customer.
    await page.goto(`${base}/order/`, { waitUntil: 'domcontentloaded' });
    const receipt = await page.evaluate(() => JSON.parse(sessionStorage.getItem('islandDelicacyLastOrder')));
    assert.equal(receipt.firstName, 'Marcus');
    assert.equal(receipt.phoneLast4, '0147');
    assert.equal(receipt.orderRef, 'SYNTHETIC-ORDER-REF');
    assert.equal(receipt.totalDollars, 88);
    const raw = JSON.stringify(receipt);
    assert.doesNotMatch(raw, /Dell|555-0147|square\.link/, 'no surname, full phone or checkout URL may be persisted');
  });

  await check('the Square return shows the exact submitted order, not a generic message', async () => {
    await page.goto(`${base}/order/?paid=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-od-id="order-return-receipt"]:not(.hidden)');
    const titles = await page.$$eval('[data-receipt-lines] .ticket-name', (els) => els.map((e) => e.textContent));
    assert.deepEqual(titles, ['2 × Jerk Chicken', '1 × Oxtail Rasta Pasta', '2 × Side · Sweet Plantains']);
    const body = await page.textContent('[data-od-id="order-return-receipt"]');
    assert.match(body, /Includes/);
    assert.match(body, /Rice & Peas/);
    assert.match(body, /No rice & peas — rasta pasta plate/);
    assert.match(body, /Leave off \/ requests/);
    assert.match(body, /No carrots, sauce on the side/);
    assert.match(body, /Extra meat \(\+\$10\)/);
    assert.match(body, /SYNTHETIC-ORDER-REF/);
    assert.match(body, /ending 0147/);
    assert.equal(await page.textContent('[data-receipt-total]'), '$88');
    assert.doesNotMatch(body, /555-0147/, 'the return page must not reprint the full phone number');
  });
  await page.close();
}

// --------------------------------------------------------------------------
// 2. Text fallback when Square cannot create a link
// --------------------------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const events = await watchNavigation(page);
  await page.route('**/api/checkout', (route) => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Square checkout is temporarily unavailable.' }) }));
  await page.goto(`${base}/order/`, { waitUntil: 'domcontentloaded' });
  for (const plate of PLATES.slice(0, 2)) await addPlate(page, plate);
  await page.fill('#customerName', CUSTOMER.name);
  await page.fill('#customerPhone', CUSTOMER.phone);

  await check('a failed Square call opens a text order carrying the same grouped truth and total', async () => {
    await page.click('[data-checkout]');
    await page.waitForSelector('[data-review-dialog]', { state: 'visible' });
    await page.click('[data-od-id="order-review-confirm"]');
    const sms = decodeURIComponent(await waitForNavigation(events, 'sms:'));
    assert.match(sms, /^sms:\+19297424202/);
    for (const expected of [
      '2 × Jerk Chicken — $50',
      '  Includes: Rice & Peas',
      '  Your sides: Steamed Cabbage · Sweet Plantains',
      '  Extras: Extra meat (+$10)',
      '  Leave off / requests: No carrots, sauce on the side',
      '1 × Oxtail Rasta Pasta — $28',
      '  Includes: No rice & peas — rasta pasta plate',
      '  Leave off / requests: Extra gravy on the side please',
      'Total: $78',
    ]) assert.ok(sms.includes(expected), `text fallback must contain ${JSON.stringify(expected)}`);
    assert.equal(events.alerts.length, 1);
    assert.match(events.alerts[0], /text order/i);
    assert.match(events.alerts[0], /Nothing has been charged/i, 'the fallback alert must be honest about the route');
    assert.ok(await page.isHidden('[data-review-dialog]'), 'the review closes when the flow hands off to SMS');
  });
  await page.close();
}

// --------------------------------------------------------------------------
// 3. Required viewport geometry, with a dense 20-line/30-item review
// --------------------------------------------------------------------------
for (const vp of [{ w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1440, h: 900 }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  await buildOrder(page, base);

  await check(`${vp.w}x${vp.h}: no horizontal overflow and the review fits the viewport`, async () => {
    const beforeReview = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
    assert.ok(beforeReview.scrollW <= beforeReview.clientW, `builder overflows horizontally: ${beforeReview.scrollW} > ${beforeReview.clientW}`);

    await page.click('[data-checkout]');
    await page.waitForSelector('[data-review-dialog]', { state: 'visible' });
    const geo = await page.evaluate(() => {
      const dialog = document.querySelector('[data-review-dialog]');
      const rect = dialog.getBoundingClientRect();
      const confirm = document.querySelector('[data-od-id="order-review-confirm"]').getBoundingClientRect();
      return {
        scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        vh: window.innerHeight, vw: window.innerWidth,
        confirmH: confirm.height, confirmW: confirm.width, confirmBottom: confirm.bottom, confirmTop: confirm.top,
      };
    });
    assert.ok(geo.scrollW <= geo.clientW, 'the open review must not create horizontal overflow');
    assert.ok(geo.top >= -0.5 && geo.bottom <= geo.vh + 0.5, `dialog must stay on-canvas (top ${geo.top}, bottom ${geo.bottom}, vh ${geo.vh})`);
    assert.ok(geo.left >= -0.5 && geo.right <= geo.vw + 0.5, 'dialog must stay within the viewport width');
    // The pay action is pinned: it is on screen without scrolling the sheet.
    assert.ok(geo.confirmTop >= 0 && geo.confirmBottom <= geo.vh + 0.5, `Confirm must be visible without scrolling (${geo.confirmTop}–${geo.confirmBottom} in ${geo.vh})`);
    assert.ok(geo.confirmH >= 44, `Confirm touch target height ${geo.confirmH} must be at least 44px`);
  });

  await check(`${vp.w}x${vp.h}: every control in the review meets the 44px touch target floor`, async () => {
    const small = await page.$$eval('[data-review-dialog] button', (els) => els
      .filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0)
      .map((el) => ({ id: el.dataset.odId || el.className, w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((el) => el.w < 44 || el.h < 44));
    assert.deepEqual(small, [], `undersized review controls: ${JSON.stringify(small)}`);
  });
  await page.close();
}

// Dense 20-line / 30-item review at the phone viewport — the hardest geometry case.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const dense = Array.from({ length: 10 }, (_, i) => ({
    id: i % 2 ? 'brown-stew-chicken' : 'jerk', qty: 3,
    sides: i % 2 ? ['Steamed Cabbage', 'Rasta Pasta'] : ['Steamed Cabbage', 'Sweet Plantains'],
    meat: null, note: `Leave off request number ${i + 1}`,
  }));
  await buildOrder(page, base, { plates: dense, sides: [] });

  await check('390x844: a dense 30-item review keeps every selection and keeps the total pinned', async () => {
    assert.equal(await page.textContent('[data-total]'), '$600');
    await page.click('[data-checkout]');
    await page.waitForSelector('[data-review-dialog]', { state: 'visible' });
    const tickets = await page.$$eval('[data-review-lines] .ticket', (els) => els.length);
    assert.equal(tickets, 10, 'no line may be hidden or merged');
    const notes = await page.$$eval('[data-review-lines] .ticket-spec', (els) => els.map((dl) => {
      const dts = [...dl.querySelectorAll('dt')].map((d) => d.textContent);
      return dl.querySelectorAll('dd')[dts.indexOf('Leave off / requests')].textContent;
    }));
    assert.equal(new Set(notes).size, 10, 'every leave-off request must survive distinctly');
    assert.equal(await page.textContent('[data-review-count]'), '10 lines · 30 items');

    const geo = await page.evaluate(() => {
      const d = document.querySelector('[data-review-dialog]').getBoundingClientRect();
      const c = document.querySelector('[data-od-id="order-review-confirm"]').getBoundingClientRect();
      const scroll = document.querySelector('[data-review-lines]');
      return { bottom: d.bottom, vh: window.innerHeight, confirmBottom: c.bottom, scrollable: scroll.scrollHeight > scroll.clientHeight, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
    });
    assert.ok(geo.scrollable, 'a dense order must scroll inside the sheet, not push the page');
    assert.ok(geo.bottom <= geo.vh + 0.5, `dialog bottom ${geo.bottom} must stay within ${geo.vh}`);
    assert.ok(geo.confirmBottom <= geo.vh + 0.5, 'the pay action stays pinned and visible at 30 items');
    assert.ok(geo.scrollW <= geo.clientW, 'no horizontal overflow at 30 items');
  });

  await check('390x844: no summary text is clipped by its container', async () => {
    await page.keyboard.press('Escape');
    const clipped = await page.$$eval('[data-summary-lines] .ticket-spec dd, [data-summary-lines] .ticket-name', (els) => els
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .map((el) => el.textContent.slice(0, 60)));
    assert.deepEqual(clipped, [], `clipped summary text: ${JSON.stringify(clipped)}`);
  });
  await page.close();
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n# browser checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) { for (const f of failed) console.error(`\n${f.name}\n${f.error.stack}`); process.exit(1); }
