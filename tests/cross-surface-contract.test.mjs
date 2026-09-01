/*
 * Cross-surface contract: the Square merchant note and the customer-facing surfaces
 * must come from ONE serialization.
 *
 * DESIGN-LOCK decision 1 makes js/order-format.js the single source for the sidebar,
 * the review sheet, the return receipt, the text fallback AND the Square line note.
 * These tests fail if the Worker ever grows a second formatter, if its vocabulary
 * drifts from what the customer confirmed, or if the two sides of the app disagree
 * about menu shape, allowed sides or extra pricing.
 *
 * Server-side validation and pricing stay authoritative in worker/src/checkout.js;
 * this file asserts agreement, it does not move authority.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { MENU, ValidationError, buildSquarePaymentLinkRequest, validateCheckout } from '../worker/src/checkout.js';

const require = createRequire(import.meta.url);
const F = require('../js/order-format.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-08-04T16:00:00Z'); // before the 10:00 Pacific cutoff
const PICKUP = '2026-08-05';
const ENV = { SQUARE_LOCATION_ID: 'TEST_LOCATION', CHECKOUT_REDIRECT_URL: 'https://islanddelicacy.com/order/?paid=1' };

// Synthetic fixtures only — no real customer names, phones or order references.
const CUSTOMER = { name: 'Test Customer', phone: '(619) 555-0100' };

function squareLines(lines) {
  const order = validateCheckout({ lines, date: PICKUP, ...CUSTOMER }, NOW);
  return { order, request: buildSquarePaymentLinkRequest(order, ENV, 'idem-contract') };
}

/** What the customer was shown for the same configured plate. */
function customerNote(plate) {
  return F.merchantNote({
    kind: 'plate',
    sides: plate.sides,
    meat: plate.meat === undefined ? false : plate.meat,
    note: plate.note || '',
    rastaPasta: MENU[plate.id].rastaPasta,
  });
}

/** Every plate line's Square note must equal the shared serializer, exactly. */
function assertNotesMatchSharedSerializer(plates, label) {
  const { request } = squareLines(plates);
  const plateItems = request.order.line_items.filter((item) => !item.name.startsWith('Side · ') && !item.name.includes(' · '));
  const expected = plates.filter((p) => MENU[p.id]).map(customerNote);
  assert.deepEqual(plateItems.map((item) => item.note), expected, `${label}: Square notes must equal the shared serializer output`);
  for (const note of plateItems.map((item) => item.note)) {
    assert.ok(note.length < 500, `${label}: note length ${note.length} must stay under the Square 500-char limit`);
  }
  return request;
}

// --------------------------------------------------------------------------
// The Worker must not contain a second formatter at all
// --------------------------------------------------------------------------

test('the Worker holds no independent customization formatter', () => {
  const source = readFileSync(path.join(ROOT, 'worker/src/checkout.js'), 'utf8');
  assert.match(source, /import OrderFormat from '\.\.\/\.\.\/js\/order-format\.js'/, 'the Worker must import the shared serializer');
  assert.match(source, /OrderFormat\.merchantNote\(line\)/, 'plate notes must come from the shared serializer');

  // No customization vocabulary may be rebuilt inside the Worker. Side NAMES may still
  // appear, but only as validation identifiers — server-side validation stays
  // authoritative and self-contained, so those two lines are allowed and pinned below.
  for (const literal of ['Includes', 'Sides:', 'Your sides', 'Leave off', 'Extra meat', 'Extra oxtail', 'No rice', 'rasta pasta plate', 'Nothing —']) {
    assert.ok(!source.includes(literal), `worker/src/checkout.js must not re-declare the literal ${JSON.stringify(literal)}`);
  }
  // The formatter used to live in buildSquarePaymentLinkRequest. That function must now
  // contain no customization vocabulary and no side names of its own at all.
  const builder = source.slice(source.indexOf('export function buildSquarePaymentLinkRequest'));
  // (payment_note is order-level metadata — pickup/name/phone — not plate customization,
  // so it legitimately stays here; only per-plate customization text is forbidden.)
  for (const literal of ['Rice & Peas', 'Steamed Cabbage', 'Sweet Plantains', 'Rasta Pasta', 'rasta', "join('", 'Includes', 'Sides']) {
    assert.ok(!builder.includes(literal),
      `buildSquarePaymentLinkRequest must not build customization text itself (found ${JSON.stringify(literal)})`);
  }
  // The extra-meat label and the "For N × Plate" back-reference also come from the shared module.
  assert.match(source, /OrderFormat\.EXTRAS\[line\.meat\]/);
  assert.match(source, /OrderFormat\.lineTitle\(line\)/);
});

test('menu shape, allowed sides and extra pricing agree across the two surfaces', () => {
  const menuJs = readFileSync(path.join(ROOT, 'js/menu.js'), 'utf8');
  const mainJs = readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');

  // Every browser menu item exists server-side with the same name, price and rasta flag.
  const browserItems = [...menuJs.matchAll(/\{id:'([^']+)', name:'([^']+)', price:(\d+), category:'([^']+)'/g)]
    .map(([, id, name, price, category]) => ({ id, name, price: Number(price), rastaPasta: category === 'Rasta Pasta' }));
  assert.equal(browserItems.length, Object.keys(MENU).length, 'the two menus must have the same number of plates');
  for (const item of browserItems) {
    const server = MENU[item.id];
    assert.ok(server, `${item.id} is offered in the browser but unknown to the Worker`);
    assert.equal(server.name, item.name, `${item.id}: name must match`);
    assert.equal(server.priceCents, item.price * 100, `${item.id}: price must match`);
    assert.equal(server.rastaPasta, item.rastaPasta, `${item.id}: rasta-pasta classification must match, or Includes would lie`);
  }

  // Allowed side sets must match, or the customer could build a plate the server rejects.
  const sideList = (name) => new Set(mainJs.match(new RegExp(`const ${name} = \\[([^\\]]+)\\]`))[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')));
  assert.deepEqual([...sideList('DEFAULT_SIDES')].sort(), ['Rasta Pasta', 'Steamed Cabbage', 'Sweet Plantains']);
  assert.deepEqual([...sideList('RASTA_SIDES')].sort(), ['Rice & Peas', 'Steamed Cabbage', 'Sweet Plantains']);

  // Extra cents charged must equal the extra dollars the customer was shown.
  const checkoutJs = readFileSync(path.join(ROOT, 'worker/src/checkout.js'), 'utf8');
  const cents = JSON.parse(checkoutJs.match(/EXTRA_PRICES = Object\.freeze\((\{[^}]+\})\)/)[1].replace(/(\w+):/g, '"$1":'));
  for (const [key, extra] of Object.entries(F.EXTRAS)) {
    assert.equal(cents[key], extra.price * 100, `extra "${key}": Square charges ${cents[key]}c but the customer is shown $${extra.price}`);
  }
});

// --------------------------------------------------------------------------
// The ten required boundaries
// --------------------------------------------------------------------------

test('boundary: a standard plate', () => {
  const request = assertNotesMatchSharedSerializer(
    [{ id: 'jerk', qty: 1, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: false, note: '' }], 'standard');
  assert.equal(request.order.line_items[0].note,
    'Includes: Rice & Peas | Your sides: Steamed Cabbage · Sweet Plantains | Extras: None | Leave off / requests: Nothing — cook it as it comes');
});

test('boundary: a rasta-pasta plate states the absence of rice & peas', () => {
  const request = assertNotesMatchSharedSerializer(
    [{ id: 'oxtail-rasta-pasta', qty: 1, sides: ['Rice & Peas', 'Steamed Cabbage'], meat: false, note: '' }], 'rasta-pasta');
  assert.match(request.order.line_items[0].note, /^Includes: No rice & peas — rasta pasta plate \| /);
});

test('boundary: multi-plate — each line keeps its own note', () => {
  const plates = [
    { id: 'jerk', qty: 2, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: false, note: 'no carrots' },
    { id: 'curry-goat', qty: 1, sides: ['Sweet Plantains', 'Rasta Pasta'], meat: false, note: 'extra gravy' },
    { id: 'chicken-rasta-pasta', qty: 1, sides: ['Rice & Peas', 'Steamed Cabbage'], meat: false, note: '' },
  ];
  const request = assertNotesMatchSharedSerializer(plates, 'multi-plate');
  const notes = request.order.line_items.map((item) => item.note);
  assert.equal(new Set(notes).size, 3, 'three differently configured plates must produce three different notes');
});

test('boundary: side-only lines carry no plate customization on either surface', () => {
  const { request } = squareLines([{ id: 'side-rice-and-peas', qty: 4 }, { id: 'side-sweet-plantains', qty: 1 }]);
  assert.deepEqual(request.order.line_items.map((item) => [item.name, item.quantity, item.note]), [
    ['Side · Rice & Peas', '4', undefined],
    ['Side · Sweet Plantains', '1', undefined],
  ]);
  // And the shared serializer agrees that a side line has no merchant note.
  assert.equal(F.merchantNote({ kind: 'side', name: 'Rice & Peas', qty: 4 }), '');
  // The customer still sees a labelled group for it, from the same module.
  assert.deepEqual(F.groupsFor(F.sideLine('Rice & Peas', 4)).map((g) => [g.label, g.value]), [['Sides only', 'No plate — $5 each']]);
});

test('boundary: an extra is named by the shared label and back-references its plate', () => {
  const plates = [{ id: 'oxtail', qty: 2, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: 'oxtail', note: '' }];
  const { request } = squareLines(plates);
  assert.deepEqual(request.order.line_items.map((item) => [item.name, item.quantity, item.base_price_money.amount, item.note]), [
    ['Oxtail', '2', 2500, customerNote(plates[0])],
    ['Extra oxtail · Oxtail', '1', 1200, 'For 2 × Oxtail'],
  ]);
  // Both strings are derived, not typed: label from EXTRAS, back-reference from lineTitle.
  assert.equal(request.order.line_items[1].name, `${F.EXTRAS.oxtail.label} · ${MENU.oxtail.name}`);
  assert.equal(request.order.line_items[1].note, `For ${F.lineTitle({ kind: 'plate', qty: 2, name: MENU.oxtail.name })}`);
  assert.match(request.order.line_items[0].note, /Extras: Extra oxtail \(\+\$12\)/);
});

test('boundary: an exclusion request reaches Square under the same label the customer read', () => {
  const plates = [{ id: 'jerk', qty: 1, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: false, note: 'No carrots, sauce on the side' }];
  const request = assertNotesMatchSharedSerializer(plates, 'exclusion');
  assert.ok(request.order.line_items[0].note.endsWith(`${F.LABELS.leaveOff}: No carrots, sauce on the side`));
});

test('boundary: an exact 200-character note survives whole and stays under the Square limit', () => {
  const note = 'x'.repeat(200);
  assert.equal(note.length, 200);
  // The worst case for total length is a rasta-pasta plate: the longest Includes value.
  const plates = [{ id: 'oxtail-rasta-pasta', qty: 1, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: 'oxtail', note }];
  const request = assertNotesMatchSharedSerializer(plates, '200-char note');
  const merchantNote = request.order.line_items[0].note;
  assert.ok(merchantNote.endsWith(`${F.LABELS.leaveOff}: ${note}`), 'the request must not be truncated');
  assert.ok(merchantNote.length < 500, `worst-case note length ${merchantNote.length} must stay under 500`);
  // 201 characters is rejected before it can reach Square at all.
  assert.throws(
    () => validateCheckout({ lines: [{ ...plates[0], note: 'x'.repeat(201) }], date: PICKUP, ...CUSTOMER }, NOW),
    (error) => error instanceof ValidationError && error.code === 'INVALID_NOTE',
  );
});

test('boundary: invalid sides are rejected server-side and never reach the serializer', () => {
  for (const sides of [
    ['Rice & Peas', 'Steamed Cabbage'], // not allowed on a standard plate
    ['Steamed Cabbage'],
    ['Steamed Cabbage', 'Steamed Cabbage'],
    ['Steamed Cabbage', 'Macaroni Pie'],
    ['Steamed Cabbage', 'Sweet Plantains', 'Rasta Pasta'],
  ]) {
    assert.throws(
      () => validateCheckout({ lines: [{ id: 'jerk', qty: 1, sides, meat: false, note: '' }], date: PICKUP, ...CUSTOMER }, NOW),
      (error) => error instanceof ValidationError && error.code === 'INVALID_SIDES',
      `sides ${JSON.stringify(sides)} must be rejected`,
    );
  }
  // Server pricing stays authoritative: a client-supplied price is ignored.
  const { order } = squareLines([{ id: 'jerk', qty: 1, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: false, note: '', priceCents: 1 }]);
  assert.equal(order.totalCents, 2000);
});

test('boundary: a 20-line order keeps 20 independently serialized notes', () => {
  const plates = Array.from({ length: 20 }, (_, i) => ({
    id: i % 3 === 0 ? 'chicken-rasta-pasta' : 'jerk',
    qty: 1,
    sides: i % 3 === 0 ? ['Rice & Peas', 'Steamed Cabbage'] : ['Steamed Cabbage', 'Sweet Plantains'],
    meat: false,
    note: `request ${i}`,
  }));
  const request = assertNotesMatchSharedSerializer(plates, '20-line');
  assert.equal(request.order.line_items.length, 20, 'identical-looking plates must not be merged');
  assert.equal(new Set(request.order.line_items.map((i) => i.note)).size, 20);
  // 21 lines is the boundary the server refuses.
  assert.throws(
    () => validateCheckout({ lines: [...plates, plates[0]], date: PICKUP, ...CUSTOMER }, NOW),
    (error) => error instanceof ValidationError && error.code === 'TOO_MANY_LINES',
  );
});

test('boundary: exactly 30 items serialize consistently, and 31 is refused', () => {
  const plates = Array.from({ length: 15 }, (_, i) => ({
    id: 'jerk', qty: 2, meat: false,
    sides: i % 2 ? ['Steamed Cabbage', 'Rasta Pasta'] : ['Steamed Cabbage', 'Sweet Plantains'],
    note: `leave off item ${i}`,
  }));
  const { order } = squareLines(plates);
  assert.equal(order.lines.reduce((sum, line) => sum + line.qty, 0), 30);
  assertNotesMatchSharedSerializer(plates, '30-item');

  // The same 30 items described to the customer produce the same per-plate truth.
  const model = F.orderModel({
    plates: plates.map((p) => ({ ...p, name: MENU[p.id].name, unitPrice: MENU[p.id].priceCents / 100, rastaPasta: MENU[p.id].rastaPasta })),
    sideOnly: [],
  });
  assert.equal(model.itemCount, 30);
  assert.deepEqual(model.lines.map(F.merchantNote), plates.map(customerNote));

  assert.throws(
    () => validateCheckout({ lines: [...plates, { id: 'side-rice-and-peas', qty: 1 }], date: PICKUP, ...CUSTOMER }, NOW),
    (error) => error instanceof ValidationError && error.code === 'ORDER_TOO_LARGE',
  );
});
