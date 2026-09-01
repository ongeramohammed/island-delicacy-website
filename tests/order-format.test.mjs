/*
 * Exact serialization contract for what the customer is shown.
 *
 * js/order-format.js is the single source the sidebar ledger, the pre-Square review
 * sheet, the post-return receipt and the text-order fallback all render from, so
 * asserting it here pins customer-visible truth without needing a browser.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('../js/order-format.js');

// Synthetic fixtures only — no real customer names, phones or order references.
const JERK = { id: 'jerk', name: 'Jerk Chicken', unitPrice: 20, qty: 2, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: 'meat', note: 'No carrots, sauce on the side', rastaPasta: false };
const OXTAIL_PASTA = { id: 'oxtail-rasta-pasta', name: 'Oxtail Rasta Pasta', unitPrice: 28, qty: 1, sides: ['Rice & Peas', 'Steamed Cabbage'], meat: false, note: 'Extra gravy on the side please', rastaPasta: true };
const CURRY_GOAT = { id: 'curry-goat', name: 'Curry Goat', unitPrice: 25, qty: 1, sides: ['Sweet Plantains', 'Rasta Pasta'], meat: 'oxtail', note: '', rastaPasta: false };

const groupPairs = (line) => F.groupsFor(line).map((g) => [g.label, g.value, g.isEmpty]);

test('a standard plate states its included rice & peas, sides, extras and leave-off request', () => {
  const line = F.plateLine(JERK);
  assert.equal(line.lineTotal, 50); // 2 x $20 + $10 extra meat
  assert.deepEqual(groupPairs(line), [
    ['Includes', 'Rice & Peas', false],
    ['Your sides', 'Steamed Cabbage · Sweet Plantains', false],
    ['Extras', 'Extra meat (+$10)', false],
    ['Leave off / requests', 'No carrots, sauce on the side', false],
  ]);
  assert.equal(F.lineTitle(line), '2 × Jerk Chicken');
});

test('a rasta-pasta plate states the ABSENCE of rice & peas rather than omitting the row', () => {
  const line = F.plateLine(OXTAIL_PASTA);
  assert.equal(line.lineTotal, 28);
  assert.deepEqual(groupPairs(line), [
    ['Includes', 'No rice & peas — rasta pasta plate', true],
    ['Your sides', 'Rice & Peas · Steamed Cabbage', false],
    ['Extras', 'None', true],
    ['Leave off / requests', 'Extra gravy on the side please', false],
  ]);
});

test('empty extras and empty notes are answered, never blank', () => {
  const groups = F.groupsFor(F.plateLine(CURRY_GOAT));
  const extras = groups.find((g) => g.key === 'extras');
  const leaveOff = groups.find((g) => g.key === 'leaveOff');
  assert.equal(extras.value, 'Extra oxtail (+$12)');
  assert.equal(leaveOff.value, 'Nothing — cook it as it comes');
  assert.equal(leaveOff.isEmpty, true);
  for (const group of groups) assert.notEqual(group.value.trim(), '');
});

test('an incomplete plate says what is still owed instead of reading as finished', () => {
  const none = F.groupsFor(F.plateLine({ ...JERK, sides: [] })).find((g) => g.key === 'sides');
  assert.equal(none.value, 'Choose 2 sides');
  assert.equal(none.isEmpty, true);

  const one = F.groupsFor(F.plateLine({ ...JERK, sides: ['Steamed Cabbage'] })).find((g) => g.key === 'sides');
  assert.equal(one.value, 'Steamed Cabbage · choose 1 more side');
  assert.equal(one.isEmpty, true);
});

test('side-only lines are priced and labelled as sides, not as plates', () => {
  const line = F.sideLine('Sweet Plantains', 2);
  assert.equal(line.lineTotal, 10);
  assert.equal(F.lineTitle(line), '2 × Side · Sweet Plantains');
  assert.deepEqual(groupPairs(line), [['Sides only', 'No plate — $5 each', false]]);
});

test('multiple differently configured plates stay independent in one model', () => {
  const model = F.orderModel({
    plates: [JERK, OXTAIL_PASTA, CURRY_GOAT],
    sideOnly: ['Sweet Plantains', 'Sweet Plantains'],
    date: '2026-09-02', dateLabel: 'Wed, Sep 2', name: 'Marcus Dell', phone: '(619) 555-0147',
  });

  assert.equal(model.totalDollars, 125); // 50 + 28 + 37 + 10
  assert.equal(model.lineCount, 4);
  assert.equal(model.itemCount, 6);
  assert.equal(F.countLabel(model), '4 lines · 6 items');

  // No cross-contamination: each plate keeps its own sides, extra and note.
  assert.deepEqual(model.lines.map((l) => l.sides || null), [
    ['Steamed Cabbage', 'Sweet Plantains'],
    ['Rice & Peas', 'Steamed Cabbage'],
    ['Sweet Plantains', 'Rasta Pasta'],
    null,
  ]);
  assert.deepEqual(model.lines.map((l) => l.meat ?? null), ['meat', false, 'oxtail', null]);
  assert.deepEqual(model.lines.map((l) => l.note ?? null), ['No carrots, sauce on the side', 'Extra gravy on the side please', '', null]);
  assert.deepEqual(model.lines.map((l) => l.rastaPasta ?? null), [false, true, false, null]);
});

test('repeated side-only picks collapse into one quantified line, matching the Square payload', () => {
  assert.deepEqual(F.collapseSides(['Sweet Plantains', 'Rice & Peas', 'Sweet Plantains']), [
    { name: 'Sweet Plantains', qty: 2 },
    { name: 'Rice & Peas', qty: 1 },
  ]);
  const model = F.orderModel({ plates: [], sideOnly: ['Sweet Plantains', 'Rice & Peas', 'Sweet Plantains'] });
  assert.deepEqual(model.lines.map(F.lineTitle), ['2 × Side · Sweet Plantains', '1 × Side · Rice & Peas']);
  assert.equal(model.totalDollars, 15);
});

test('a long but valid note is shown in full, not truncated or hidden', () => {
  const note = 'Please leave off the bell peppers and the carrots, keep the scotch bonnet on the side, and if you can make the gravy a little lighter than usual that would be perfect';
  assert.ok(note.length <= 200 && note.length > 140);
  const groups = F.groupsFor(F.plateLine({ ...JERK, note }));
  assert.equal(groups.find((g) => g.key === 'leaveOff').value, note);
  assert.ok(F.textFallback(F.orderModel({ plates: [{ ...JERK, note }] })).includes(note));
});

test('a 30-item / 20-line order keeps every selection distinct', () => {
  const plates = Array.from({ length: 15 }, (_, i) => ({
    ...JERK, qty: 2, note: `Leave off item ${i}`, sides: i % 2 ? ['Steamed Cabbage', 'Rasta Pasta'] : ['Steamed Cabbage', 'Sweet Plantains'],
  }));
  const model = F.orderModel({ plates, sideOnly: [] });
  assert.equal(model.lineCount, 15);
  assert.equal(model.itemCount, 30);
  const notes = model.lines.map((l) => F.groupsFor(l).find((g) => g.key === 'leaveOff').value);
  assert.equal(new Set(notes).size, 15, 'every leave-off request must survive as its own value');
});

test('the receipt is privacy-minimized and still shows the exact submitted order', () => {
  const model = F.orderModel({
    plates: [JERK, OXTAIL_PASTA], sideOnly: ['Sweet Plantains'],
    date: '2026-09-02', dateLabel: 'Wed, Sep 2', name: 'Marcus Dell', phone: '(619) 555-0147',
  });
  const receipt = F.receiptFor(model, { orderRef: 'SYNTHETIC-ORDER-REF', environment: 'sandbox', submittedAt: '2026-09-01T17:00:00.000Z' });

  assert.equal(receipt.firstName, 'Marcus');
  assert.equal(receipt.phoneLast4, '0147');
  assert.equal(receipt.orderRef, 'SYNTHETIC-ORDER-REF');
  assert.equal(receipt.totalDollars, 83);

  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /Dell/, 'surname must not be persisted');
  assert.doesNotMatch(serialized, /555-0147|6195550147/, 'the full phone number must not be persisted');
  assert.doesNotMatch(serialized, /square\.link|squareup|token|secret|card/i, 'no payment data or secrets');
  assert.deepEqual(Object.keys(receipt).sort(), ['date', 'dateLabel', 'environment', 'firstName', 'lines', 'orderRef', 'phoneLast4', 'submittedAt', 'totalDollars', 'v']);

  // Rehydrating the stored receipt reproduces the same customer-visible truth.
  const restored = F.modelFromReceipt(JSON.parse(serialized));
  assert.equal(restored.totalDollars, model.totalDollars);
  assert.deepEqual(restored.lines.map(F.lineTitle), model.lines.map(F.lineTitle));
  assert.deepEqual(restored.lines.map(groupPairs), model.lines.map(groupPairs));
});

test('the text fallback carries the same grouped truth and the same total as the review sheet', () => {
  const model = F.orderModel({
    plates: [JERK, OXTAIL_PASTA], sideOnly: ['Sweet Plantains', 'Sweet Plantains'],
    date: '2026-09-02', dateLabel: 'Wed, Sep 2', name: 'Marcus Dell', phone: '(619) 555-0147',
  });
  assert.equal(F.textFallback(model), [
    'Island Delicacy preorder',
    'Pickup: Wed, Sep 2',
    'Name: Marcus Dell',
    'Phone: (619) 555-0147',
    '',
    '2 × Jerk Chicken — $50',
    '  Includes: Rice & Peas',
    '  Your sides: Steamed Cabbage · Sweet Plantains',
    '  Extras: Extra meat (+$10)',
    '  Leave off / requests: No carrots, sauce on the side',
    '',
    '1 × Oxtail Rasta Pasta — $28',
    '  Includes: No rice & peas — rasta pasta plate',
    '  Your sides: Rice & Peas · Steamed Cabbage',
    '  Extras: None',
    '  Leave off / requests: Extra gravy on the side please',
    '',
    '2 × Side · Sweet Plantains — $10',
    '  Sides only: No plate — $5 each',
    '',
    'Total: $88',
    "We'll text to set the pickup time.",
  ].join('\n'));
});

test('the group vocabulary is fixed, so every surface uses the same words', () => {
  assert.deepEqual(F.LABELS, {
    includes: 'Includes',
    sides: 'Your sides',
    extras: 'Extras',
    leaveOff: 'Leave off / requests',
    sidesOnly: 'Sides only',
  });
});

test('the merchant note is the customer groups joined — not a second formatter', () => {
  // Same labels, same values, same answered-empty states as the review sheet.
  assert.equal(F.merchantNote(JERK),
    'Includes: Rice & Peas | Your sides: Steamed Cabbage · Sweet Plantains | Extras: Extra meat (+$10) | Leave off / requests: No carrots, sauce on the side');
  assert.equal(F.merchantNote(OXTAIL_PASTA),
    'Includes: No rice & peas — rasta pasta plate | Your sides: Rice & Peas · Steamed Cabbage | Extras: None | Leave off / requests: Extra gravy on the side please');

  // It is literally groupsFor() joined, so the two can never drift apart.
  for (const plate of [JERK, OXTAIL_PASTA, CURRY_GOAT]) {
    const fromGroups = F.groupsFor(F.plateLine(plate))
      .map((g) => `${g.label}: ${g.value}`)
      .join(F.MERCHANT_GROUP_SEPARATOR);
    assert.equal(F.merchantNote(plate), fromGroups);
  }

  // The group separator cannot be confused with the separator inside a value.
  assert.equal(F.MERCHANT_GROUP_SEPARATOR, ' | ');
  assert.ok(!F.merchantNote(JERK).split(' | ')[1].includes(' | '));

  // A side-only line has no plate customization to state.
  assert.equal(F.merchantNote(F.sideLine('Rice & Peas', 4)), '');
});

test('the worst-case merchant note stays well inside the Square 500-character limit', () => {
  // Longest Includes (rasta pasta) + longest side pair + an extra + a full 200-char note.
  const note = 'x'.repeat(200);
  const worst = F.merchantNote({
    kind: 'plate', rastaPasta: true, meat: 'oxtail',
    sides: ['Steamed Cabbage', 'Sweet Plantains'], note,
  });
  assert.ok(worst.endsWith(`${F.LABELS.leaveOff}: ${note}`));
  assert.ok(worst.length < 500, `worst-case merchant note is ${worst.length} characters`);
});
