import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ValidationError,
  buildSquarePaymentLinkRequest,
  earliestPickupDate,
  validateCheckout,
} from '../src/checkout.js';

const baseOrder = {
  lines: [
    {
      id: 'jerk',
      qty: 1,
      sides: ['Steamed Cabbage', 'Sweet Plantains'],
      meat: false,
      note: 'light spice',
    },
  ],
  date: '2026-08-05',
  name: 'Test Customer',
  phone: '(619) 555-0100',
};

test('10 AM Pacific cutoff advances the earliest pickup date', () => {
  assert.equal(earliestPickupDate(new Date('2026-08-04T16:59:00Z')), '2026-08-05');
  assert.equal(earliestPickupDate(new Date('2026-08-04T17:00:00Z')), '2026-08-06');
});

test('validates normal and rasta-pasta side sets', () => {
  assert.throws(
    () => validateCheckout({ ...baseOrder, lines: [{ ...baseOrder.lines[0], sides: ['Rice & Peas', 'Steamed Cabbage'] }] }, new Date('2026-08-04T16:00:00Z')),
    (error) => error instanceof ValidationError && error.code === 'INVALID_SIDES',
  );

  const rasta = validateCheckout({
    ...baseOrder,
    lines: [{ id: 'chicken-rasta-pasta', qty: 1, sides: ['Rice & Peas', 'Steamed Cabbage'], meat: false, note: '' }],
  }, new Date('2026-08-04T16:00:00Z'));
  assert.deepEqual(rasta.lines[0].sides, ['Rice & Peas', 'Steamed Cabbage']);
});

test('prices every item server-side and treats extras as once per configured line', () => {
  const order = validateCheckout({
    lines: [
      { id: 'jerk', qty: 2, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: 'meat', note: ' no carrots  ' },
      { id: 'oxtail', qty: 1, sides: ['Rasta Pasta', 'Sweet Plantains'], meat: 'oxtail', note: '' },
      { id: 'side-steamed-cabbage', qty: 2 },
    ],
    date: '2026-08-05',
    name: 'Test Customer',
    phone: '+1 619 555 0100',
    total: 1,
  }, new Date('2026-08-04T16:00:00Z'));

  assert.equal(order.totalCents, 9700);
  assert.equal(order.phone, '+16195550100');
  assert.equal(order.lines[0].note, 'no carrots');

  const request = buildSquarePaymentLinkRequest(order, {
    SQUARE_LOCATION_ID: 'TEST_LOCATION',
    CHECKOUT_REDIRECT_URL: 'https://islanddelicacy.com/order/?paid=1&sandbox=1',
  }, 'idem-test');

  assert.equal(request.idempotency_key, 'idem-test');
  assert.equal(request.order.location_id, 'TEST_LOCATION');
  assert.deepEqual(
    request.order.line_items.map((line) => [line.name, line.quantity, line.base_price_money.amount]),
    [
      ['Jerk Chicken', '2', 2000],
      ['Extra meat · Jerk Chicken', '1', 1000],
      ['Oxtail', '1', 2500],
      ['Extra oxtail · Oxtail', '1', 1200],
      ['Side · Steamed Cabbage', '2', 500],
    ],
  );
  assert.equal(request.pre_populated_data.buyer_phone_number, '+16195550100');
  assert.match(request.payment_note, /Pickup 2026-08-05 · Test Customer · \+16195550100/);
});

test('preserves multiple configured plates and sides-only items in one Square checkout', () => {
  const order = validateCheckout({
    ...baseOrder,
    lines: [
      { id: 'jerk', qty: 1, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: false, note: 'no carrots' },
      { id: 'chicken-rasta-pasta', qty: 2, sides: ['Rice & Peas', 'Steamed Cabbage'], meat: 'oxtail', note: 'light spice' },
      { id: 'side-rasta-pasta', qty: 3 },
    ],
  }, new Date('2026-08-04T16:00:00Z'));

  assert.equal(order.totalCents, 9100);
  const request = buildSquarePaymentLinkRequest(order, {
    SQUARE_LOCATION_ID: 'TEST_LOCATION',
    CHECKOUT_REDIRECT_URL: 'https://islanddelicacy.com/order/?paid=1&sandbox=1',
  }, 'idem-multi');
  assert.deepEqual(
    request.order.line_items.map((line) => [line.name, line.quantity, line.base_price_money.amount, line.note || '']),
    [
      ['Jerk Chicken', '1', 2000, 'Includes: Rice & Peas · Sides: Steamed Cabbage + Sweet Plantains · Leave off / requests: no carrots'],
      ['Chicken Rasta Pasta', '2', 2200, 'Includes: No rice & peas (rasta pasta) · Sides: Rice & Peas + Steamed Cabbage · Leave off / requests: light spice'],
      ['Extra oxtail · Chicken Rasta Pasta', '1', 1200, 'For 2 × Chicken Rasta Pasta'],
      ['Side · Rasta Pasta', '3', 500, ''],
    ],
  );
});

test('enforces the 30-item pickup-day request limit and 20-line payload limit', () => {
  assert.throws(
    () => validateCheckout({ ...baseOrder, lines: [
      { id: 'side-steamed-cabbage', qty: 10 },
      { id: 'side-sweet-plantains', qty: 10 },
      { id: 'side-rasta-pasta', qty: 10 },
      { id: 'side-rice-and-peas', qty: 1 },
    ] }, new Date('2026-08-04T16:00:00Z')),
    (error) => error instanceof ValidationError && error.code === 'ORDER_TOO_LARGE',
  );
  assert.throws(
    () => validateCheckout({ ...baseOrder, lines: Array.from({ length: 21 }, () => ({ id: 'side-steamed-cabbage', qty: 1 })) }, new Date('2026-08-04T16:00:00Z')),
    (error) => error instanceof ValidationError && error.code === 'TOO_MANY_LINES',
  );
});

test('rejects late, malformed, and incomplete orders', () => {
  assert.throws(
    () => validateCheckout({ ...baseOrder, date: '2026-08-05' }, new Date('2026-08-04T17:00:00Z')),
    (error) => error instanceof ValidationError && error.code === 'PICKUP_TOO_EARLY',
  );
  assert.throws(
    () => validateCheckout({ ...baseOrder, phone: '123' }, new Date('2026-08-04T16:00:00Z')),
    (error) => error instanceof ValidationError && error.code === 'INVALID_PHONE',
  );
  assert.throws(
    () => validateCheckout({ ...baseOrder, lines: [] }, new Date('2026-08-04T16:00:00Z')),
    (error) => error instanceof ValidationError && error.code === 'EMPTY_ORDER',
  );
});

test('every Square plate line states the included base item so nothing depends on memory', () => {
  const order = validateCheckout({
    lines: [
      { id: 'jerk', qty: 1, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: false, note: '' },
      { id: 'oxtail-rasta-pasta', qty: 1, sides: ['Rice & Peas', 'Sweet Plantains'], meat: false, note: '' },
    ],
    date: '2026-08-05', name: 'Test Customer', phone: '(619) 555-0100',
  }, new Date('2026-08-04T16:00:00Z'));

  const request = buildSquarePaymentLinkRequest(order, {
    SQUARE_LOCATION_ID: 'TEST_LOCATION', CHECKOUT_REDIRECT_URL: 'https://islanddelicacy.com/order/?paid=1',
  }, 'idem-includes');

  assert.deepEqual(request.order.line_items.map((line) => line.note), [
    'Includes: Rice & Peas · Sides: Steamed Cabbage + Sweet Plantains',
    'Includes: No rice & peas (rasta pasta) · Sides: Rice & Peas + Sweet Plantains',
  ]);
  // No plate line may omit the Includes clause, whichever way it reads.
  for (const line of request.order.line_items) assert.match(line.note, /^Includes: /);
});

test('a maximum-length leave-off request survives whole and stays inside Square note limits', () => {
  const note = 'x'.repeat(200);
  const order = validateCheckout({
    lines: [{ id: 'oxtail-rasta-pasta', qty: 1, sides: ['Rice & Peas', 'Steamed Cabbage'], meat: 'oxtail', note }],
    date: '2026-08-05', name: 'Test Customer', phone: '(619) 555-0100',
  }, new Date('2026-08-04T16:00:00Z'));

  const request = buildSquarePaymentLinkRequest(order, {
    SQUARE_LOCATION_ID: 'TEST_LOCATION', CHECKOUT_REDIRECT_URL: 'https://islanddelicacy.com/order/?paid=1',
  }, 'idem-longnote');

  const plateNote = request.order.line_items[0].note;
  assert.ok(plateNote.endsWith(`Leave off / requests: ${note}`), 'the request must not be truncated');
  // Square caps OrderLineItem.note at 500 characters; the longest note we can build
  // is the rasta-pasta prefix plus a full 200-character request.
  assert.ok(plateNote.length < 500, `note length ${plateNote.length} must stay under the Square 500-char limit`);
  assert.deepEqual(request.order.line_items.map((line) => line.name), ['Oxtail Rasta Pasta', 'Extra oxtail · Oxtail Rasta Pasta']);
});

test('side-only lines stay identifiable, correctly priced, and carry no plate customization', () => {
  const order = validateCheckout({
    lines: [{ id: 'side-rice-and-peas', qty: 4 }, { id: 'side-sweet-plantains', qty: 1 }],
    date: '2026-08-05', name: 'Test Customer', phone: '(619) 555-0100',
  }, new Date('2026-08-04T16:00:00Z'));

  assert.equal(order.totalCents, 2500);
  const request = buildSquarePaymentLinkRequest(order, {
    SQUARE_LOCATION_ID: 'TEST_LOCATION', CHECKOUT_REDIRECT_URL: 'https://islanddelicacy.com/order/?paid=1',
  }, 'idem-sides');
  assert.deepEqual(request.order.line_items, [
    { name: 'Side · Rice & Peas', quantity: '4', base_price_money: { amount: 500, currency: 'USD' } },
    { name: 'Side · Sweet Plantains', quantity: '1', base_price_money: { amount: 500, currency: 'USD' } },
  ]);
});

test('the client cannot set a price or smuggle an invalid side combination past the server', () => {
  const order = validateCheckout({
    lines: [{ id: 'jerk', qty: 1, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: false, note: '', priceCents: 1, price: 1 }],
    date: '2026-08-05', name: 'Test Customer', phone: '(619) 555-0100', totalCents: 1,
  }, new Date('2026-08-04T16:00:00Z'));
  assert.equal(order.totalCents, 2000, 'server pricing must ignore any client-supplied price');

  for (const sides of [['Rice & Peas', 'Steamed Cabbage'], ['Steamed Cabbage'], ['Steamed Cabbage', 'Steamed Cabbage'], ['Steamed Cabbage', 'Macaroni Pie']]) {
    assert.throws(
      () => validateCheckout({ lines: [{ id: 'jerk', qty: 1, sides, meat: false, note: '' }], date: '2026-08-05', name: 'Test Customer', phone: '(619) 555-0100' }, new Date('2026-08-04T16:00:00Z')),
      (error) => error instanceof ValidationError && error.code === 'INVALID_SIDES',
      `sides ${JSON.stringify(sides)} must be rejected`,
    );
  }
});

test('a 20-line / 30-item order keeps every plate a separate Square line with its own note', () => {
  const lines = Array.from({ length: 15 }, (_, index) => ({
    id: 'jerk', qty: 2,
    sides: index % 2 ? ['Steamed Cabbage', 'Rasta Pasta'] : ['Steamed Cabbage', 'Sweet Plantains'],
    meat: false, note: `leave off item ${index}`,
  }));
  const order = validateCheckout({ lines, date: '2026-08-05', name: 'Test Customer', phone: '(619) 555-0100' }, new Date('2026-08-04T16:00:00Z'));
  assert.equal(order.totalCents, 60000);

  const request = buildSquarePaymentLinkRequest(order, {
    SQUARE_LOCATION_ID: 'TEST_LOCATION', CHECKOUT_REDIRECT_URL: 'https://islanddelicacy.com/order/?paid=1',
  }, 'idem-dense');
  assert.equal(request.order.line_items.length, 15, 'identical-looking plates must not be merged');
  assert.equal(new Set(request.order.line_items.map((line) => line.note)).size, 15);
  assert.equal(request.order.line_items[0].note, 'Includes: Rice & Peas · Sides: Steamed Cabbage + Sweet Plantains · Leave off / requests: leave off item 0');
  assert.equal(request.order.line_items[13].note, 'Includes: Rice & Peas · Sides: Steamed Cabbage + Rasta Pasta · Leave off / requests: leave off item 13');
  assert.equal(request.order.line_items[14].note, 'Includes: Rice & Peas · Sides: Steamed Cabbage + Sweet Plantains · Leave off / requests: leave off item 14');
});
