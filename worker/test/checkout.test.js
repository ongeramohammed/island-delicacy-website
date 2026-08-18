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
      ['Jerk Chicken', '1', 2000, 'Sides: Steamed Cabbage + Sweet Plantains · Note: no carrots'],
      ['Chicken Rasta Pasta', '2', 2200, 'Sides: Rice & Peas + Steamed Cabbage · Note: light spice'],
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