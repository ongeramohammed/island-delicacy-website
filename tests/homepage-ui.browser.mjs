/*
 * Deterministic browser coverage for the locked homepage direction.
 *
 * Serves the repository over plain HTTP and drives the real homepage in Chromium
 * at 1440x900, 768x1024 and 390x844, asserting the contract recorded in
 * TASK-20260831-05 / design/homepage-direction-lock.md: a source-driven plate
 * board rendered 1:1, no type over any photograph, exactly one solid primary
 * CTA, live cutoff truth, the real owner portrait, working routes, and the
 * accessibility floor at every breakpoint.
 *
 * Playwright is not a dependency of this repository. Point PLAYWRIGHT_MODULE at an
 * installed copy, or set it in the environment before running:
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/homepage-ui.browser.mjs
 *
 * The homepage never reaches checkout, so no Square request is possible here.
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
const VIEWPORTS = [{ w: 1440, h: 900 }, { w: 768, h: 1024 }, { w: 390, h: 844 }];

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

const results = [];
function check(name, fn) {
  return Promise.resolve().then(fn).then(
    () => { results.push({ name, ok: true }); console.log(`  ok  ${name}`); },
    (error) => { results.push({ name, ok: false, error }); console.log(`  FAIL ${name}\n       ${error.message.split('\n')[0]}`); },
  );
}

/** Walk the page so every lazy image below the fold actually loads. */
async function settle(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 200));
  });
  await page.waitForLoadState('networkidle');
}

const { chromium } = await import(PLAYWRIGHT);
const { server, base } = await serve();
const browser = await chromium.launch();

// ---------------------------------------------------------------- content truth
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await settle(page);

  await check('the plate board is rendered from window.ISLAND_MENU, not from markup', async () => {
    const rendered = await page.$$eval('[data-menu-preview] .home-plate', (els) => els.map((el) => ({
      name: el.querySelector('.home-plate-name').textContent.trim(),
      price: el.querySelector('.home-plate-price').textContent.trim(),
      note: el.querySelector('.home-plate-note').textContent.trim(),
      href: new URL(el.getAttribute('href'), location.origin).pathname,
      src: new URL(el.querySelector('img').getAttribute('src'), location.origin).pathname,
    })));
    assert.equal(rendered.length, 4, 'the locked board is exactly four plates');
    const source = await page.evaluate(() => window.ISLAND_MENU);
    for (const card of rendered) {
      const item = source.find((i) => i.name === card.name);
      assert.ok(item, `${card.name} must exist in window.ISLAND_MENU`);
      assert.equal(card.price, `$${item.price}`, `${card.name} price must come from source`);
      assert.equal(card.note, item.note, `${card.name} note must come from source`);
      assert.equal(card.src, item.image, `${card.name} photo must come from source`);
      assert.equal(card.href, '/order/', 'every plate is an order entry point');
    }
    // The static document must not contain the menu strings at all.
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    const shipped = await page.evaluate(() => fetch('/').then((r) => r.text()));
    for (const item of source) {
      assert.ok(!shipped.includes(item.name), `index.html must not hard-code "${item.name}"`);
      assert.ok(!shipped.includes(`$${item.price}`), `index.html must not hard-code $${item.price}`);
    }
    assert.ok(html.includes('home-plate'), 'the board renders into the document');
  });

  await check('the plate count and price range are computed from the menu source', async () => {
    const shown = (await page.textContent('[data-menu-range]')).trim();
    const expected = await page.evaluate(() => {
      const prices = window.ISLAND_MENU.map((i) => i.price);
      return `${window.ISLAND_MENU.length} plates · $${Math.min(...prices)}–$${Math.max(...prices)}`;
    });
    assert.equal(shown, expected);
    assert.match(shown, /^12 plates .* \$20.*\$30$/u, 'the summary must state the real menu shape');
  });

  await check('the stale pre-launch Square copy is gone and the truthful flow is described', async () => {
    const text = await page.evaluate(() => document.body.innerText);
    for (const stale of ['sold-out status once payment links', 'when Shantay adds them', 'prepared text order']) {
      assert.ok(!text.includes(stale), `stale copy still on the page: ${stale}`);
    }
    assert.match(text, /before anything is sent/, 'the review-before-pay promise must be stated');
    assert.match(text, /pay securely through Square/, 'the current Square reality must be stated');
    // "N left" as INVENTORY is prohibited; "9h 58m left to order" is the live
    // cutoff clock and is truthful, so match stock phrasing rather than the word.
    for (const claim of [/\b\d+\s+left\b/i, /sold\s?-?out/i, /only .{0,12}\bleft\b/i, /while supplies last/i, /selling fast/i]) {
      assert.ok(!claim.test(text), `the homepage claims inventory it does not track: ${claim}`);
    }
  });

  await check('the cutoff line is computed live and no pickup date is hard-coded', async () => {
    const line = (await page.textContent('[data-cutoff-line]')).trim();
    const bar = (await page.textContent('[data-cutoff-bar]')).trim();
    assert.match(line, /Order in the next \d+h \d+m for tomorrow\.|The 10 AM cutoff passed, so the earliest pickup is \w{3}, \w{3} \d+\./);
    assert.match(bar, /Ordering open — \d+h \d+m left|Today's 10 AM cutoff has passed/);
    const shipped = await page.evaluate(() => fetch('/').then((r) => r.text()));
    assert.ok(!/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d/.test(shipped),
      'the served document must not contain a baked pickup date');
    assert.ok(!/same-day|pickup today/i.test(await page.evaluate(() => document.body.innerText)),
      'the homepage must never promise same-day pickup');
  });

  await check('exactly one solid primary CTA, with catering clearly secondary', async () => {
    const solids = await page.$$eval('a.btn, button.btn', (els) => els
      .filter((el) => el.offsetWidth > 0)
      .map((el) => ({ cls: el.className, text: el.textContent.trim(), bg: getComputedStyle(el).backgroundColor }))
      .filter((el) => el.bg !== 'rgba(0, 0, 0, 0)' && el.bg !== 'transparent'));
    assert.equal(solids.length, 1, `exactly one filled button: ${JSON.stringify(solids)}`);
    assert.equal(solids[0].text, 'Start an order');
    const catering = await page.$$eval('a[href="/catering/"]', (els) => els.map((el) => ({
      text: el.textContent.trim(),
      nav: Boolean(el.closest('nav, .footer')),
    })));
    assert.ok(catering.some((c) => c.nav), 'catering must stay in the site navigation');
    const promoted = catering.filter((c) => !c.nav).map((c) => c.text);
    assert.ok(promoted.length >= 1, 'the homepage must offer a catering path outside the nav');
    assert.equal(new Set(promoted).size, promoted.length, `catering entries must not repeat word for word: ${JSON.stringify(promoted)}`);
    for (const text of promoted) {
      assert.ok(text !== solids[0].text, 'the catering path must not mimic the primary CTA copy');
    }
  });

  await check('every route, phone, text and email destination still resolves', async () => {
    const targets = await page.$$eval('a[href]', (els) => [...new Set(els.map((el) => el.getAttribute('href')))]);
    for (const expected of ['/order/', '/catering/', '/about/', '/faq/', '/', 'tel:+19297424202', 'sms:+19297424202', 'mailto:islanddelicacy@outlook.com']) {
      assert.ok(targets.includes(expected), `missing destination ${expected}`);
    }
    assert.ok(!targets.some((t) => t.includes('.html')), 'no legacy .html link may return');
    for (const route of ['/order/', '/catering/', '/about/', '/faq/']) {
      const response = await page.request.get(base + route);
      assert.equal(response.status(), 200, `${route} must still serve`);
    }
  });

  await check("Shantay's real portrait carries the owner story at its true 4:5 ratio", async () => {
    const portrait = await page.$eval('.home-owner-photo', (el) => ({
      src: new URL(el.getAttribute('src'), location.origin).pathname,
      natural: el.naturalWidth / el.naturalHeight,
      rendered: el.getBoundingClientRect().width / el.getBoundingClientRect().height,
      alt: el.alt,
      complete: el.complete && el.naturalWidth > 0,
    }));
    assert.equal(portrait.src, '/assets/gallery/shantay-owner.webp');
    assert.ok(portrait.complete, 'the owner portrait must actually load');
    assert.ok(Math.abs(portrait.natural - portrait.rendered) < 0.02, `portrait ratio drift: ${portrait.natural} vs ${portrait.rendered}`);
    assert.match(portrait.alt, /Shantay Cole/, 'the portrait needs a meaningful alt');
    const text = await page.textContent('.home-owner');
    assert.match(text, /Nothing held over, nothing frozen, nothing rushed/);
    assert.match(text, /Taught by Mom/);
  });

  await check('the three existing testimonials are reproduced without embellishment', async () => {
    const quotes = await page.$$eval('.home-proof p', (els) => els.map((el) => el.textContent.trim()));
    assert.deepEqual(quotes, [
      '“My husband kept raving about the Jamaican food he\'d been eating at work… this is the best Jamaican food I\'ve ever had.”',
      '“This was so good, thank you — everyone loved it.”',
      '“It was fire.”',
    ]);
  });

  await check('heading order is semantic: one h1, no skipped levels', async () => {
    const levels = await page.$$eval('h1,h2,h3,h4,h5,h6', (els) => els.map((el) => Number(el.tagName[1])));
    assert.equal(levels.filter((l) => l === 1).length, 1, 'exactly one h1');
    for (let i = 1; i < levels.length; i += 1) {
      assert.ok(levels[i] - levels[i - 1] <= 1, `heading level jumps from h${levels[i - 1]} to h${levels[i]}`);
    }
  });

  await check('the skip link is hidden until focused, then visible and on-screen', async () => {
    const before = await page.$eval('.skip-link', (el) => el.getBoundingClientRect().left);
    assert.ok(before < -1000, 'the skip link starts off-screen');
    await page.focus('.skip-link');
    const after = await page.$eval('.skip-link', (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, w: r.width, h: r.height };
    });
    assert.ok(after.left >= 0, 'focusing the skip link brings it on-screen');
    assert.ok(after.h >= 44, `skip link must meet the 44px floor, got ${after.h}`);
  });

  await check('the primary CTA keeps a visible focus indicator', async () => {
    await page.focus('[data-od-id="home-primary-order"]');
    const ring = await page.$eval('[data-od-id="home-primary-order"]', (el) => {
      const s = getComputedStyle(el);
      return { shadow: s.boxShadow, outline: s.outlineWidth };
    });
    assert.ok(ring.shadow !== 'none' || parseFloat(ring.outline) > 0, 'focus must be visible');
  });

  await page.close();
}

// ------------------------------------------------- geometry, imagery, a11y floor
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.url()} :: ${r.status()}`); });

  await page.goto(base + '/', { waitUntil: 'networkidle' });

  await check(`${vp.w}x${vp.h}: the fold carries a food photograph and the order CTA`, async () => {
    const fold = await page.evaluate(() => {
      const inFold = (r) => r.top < window.innerHeight && r.bottom > 0 && r.width > 0 && r.height > 0;
      const plate = [...document.images]
        .filter((i) => /\/assets\/menu\//.test(new URL(i.src).pathname))
        .map((i) => i.getBoundingClientRect())
        .filter(inFold)
        .sort((a, b) => b.width * b.height - a.width * a.height)[0];
      const cta = document.querySelector('[data-od-id="home-primary-order"]').getBoundingClientRect();
      return {
        plateVisible: plate ? Math.round(Math.min(plate.bottom, window.innerHeight) - Math.max(plate.top, 0)) : 0,
        plateWidth: plate ? Math.round(plate.width) : 0,
        ctaInFold: inFold(cta) && cta.bottom <= window.innerHeight,
        text: document.body.innerText,
      };
    });
    assert.ok(fold.ctaInFold, 'the primary CTA must be fully inside the first viewport');
    assert.ok(fold.plateVisible >= 180, `a real plate photo must be visible in the fold, saw ${fold.plateVisible}px`);
    assert.ok(fold.plateWidth >= 240, `the fold photograph must be dominant, saw ${fold.plateWidth}px wide`);
    // The four things a first-time visitor must learn in three seconds.
    assert.match(fold.text, /Caribbean/i);
    assert.match(fold.text, /San Diego/i);
    assert.match(fold.text, /preorder kitchen/i);
    assert.match(fold.text, /10 ?AM/i);
  });

  await settle(page);

  await check(`${vp.w}x${vp.h}: no horizontal overflow`, async () => {
    const geo = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
    assert.ok(geo.scrollW <= geo.clientW, `page scrolls sideways: ${geo.scrollW} > ${geo.clientW}`);
  });

  await check(`${vp.w}x${vp.h}: every plate photo renders square and undistorted`, async () => {
    const plates = await page.$$eval('.home-plate img', (els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        src: new URL(el.src).pathname, w: Math.round(r.width), h: Math.round(r.height),
        natural: el.naturalWidth / el.naturalHeight, attrW: el.getAttribute('width'), attrH: el.getAttribute('height'),
        loaded: el.complete && el.naturalWidth > 0,
      };
    }));
    assert.equal(plates.length, 4);
    for (const p of plates) {
      assert.ok(p.loaded, `${p.src} failed to load`);
      assert.equal(p.attrW, '1400', 'intrinsic width must be declared');
      assert.equal(p.attrH, '1400', 'intrinsic height must be declared');
      assert.equal(p.natural, 1, `${p.src} is not a square source photo`);
      assert.ok(Math.abs(p.w - p.h) <= 1, `${p.src} renders ${p.w}x${p.h} — the square photo was re-cropped`);
    }
  });

  await check(`${vp.w}x${vp.h}: no text is set over any photograph`, async () => {
    const collisions = await page.evaluate(() => {
      const photos = [...document.images]
        .filter((i) => /\/assets\/(menu|gallery)\//.test(new URL(i.src).pathname))
        .map((i) => i.getBoundingClientRect());
      const overlaps = (a, b) => a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 2 && a.bottom > b.top + 2;
      return [...document.querySelectorAll('body *')]
        .filter((el) => el.children.length === 0 && el.textContent.trim() && el.offsetWidth > 0)
        .filter((el) => photos.some((p) => overlaps(el.getBoundingClientRect(), p)))
        .map((el) => el.textContent.trim().slice(0, 40));
    });
    assert.deepEqual(collisions, [], `text sits on top of photography: ${JSON.stringify(collisions)}`);
  });

  await check(`${vp.w}x${vp.h}: every interactive target meets the 44px floor`, async () => {
    const small = await page.$$eval('a[href], button, input, select, summary', (els) => els
      .filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0)
      .map((el) => { const r = el.getBoundingClientRect(); return { label: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((el) => el.h < 44 || el.w < 44));
    assert.deepEqual(small, [], `undersized targets: ${JSON.stringify(small)}`);
  });

  await check(`${vp.w}x${vp.h}: no text is clipped by its container`, async () => {
    const clipped = await page.$$eval('body *', (els) => els
      .filter((el) => el.children.length === 0 && el.textContent.trim() && el.offsetWidth > 0)
      // Overflow only hides text when an ancestor actually clips it; tight display
      // leading overflows the line box harmlessly and must not be reported.
      .filter((el) => {
        if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return false;
        for (let node = el; node && node !== document.body; node = node.parentElement) {
          const o = getComputedStyle(node);
          if (o.overflow !== 'visible' || o.overflowX !== 'visible' || o.overflowY !== 'visible') return true;
        }
        return false;
      })
      .map((el) => el.textContent.trim().slice(0, 50)));
    assert.deepEqual(clipped, [], `clipped text: ${JSON.stringify(clipped)}`);
  });

  await check(`${vp.w}x${vp.h}: no console errors, no failed requests, no broken images`, async () => {
    const broken = await page.$$eval('img', (els) => els.filter((el) => el.complete && el.naturalWidth === 0).map((el) => el.src));
    assert.deepEqual(broken, [], `broken images: ${JSON.stringify(broken)}`);
    assert.deepEqual(consoleErrors, [], `console errors: ${JSON.stringify(consoleErrors)}`);
    assert.deepEqual(failedRequests, [], `failed requests: ${JSON.stringify(failedRequests)}`);
  });

  await page.close();
}

// ----------------------------------------------------------------- reduced motion
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await check('prefers-reduced-motion removes the board hover transform', async () => {
    await page.hover('.home-plate');
    const transform = await page.$eval('.home-plate', (el) => getComputedStyle(el).transform);
    assert.ok(transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)', `motion survived reduced-motion: ${transform}`);
  });
  await page.close();
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n# homepage checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length) { for (const f of failed) console.error(`\n${f.name}\n${f.error.stack}`); process.exit(1); }
