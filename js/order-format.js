/*
 * Island Delicacy — single source of truth for how a preorder is described.
 *
 * DESIGN-LOCK decision 1: the builder sidebar, the pre-Square review sheet, the
 * post-return receipt and the text-order fallback must never disagree, so all four
 * render from the model this file produces. Nothing here touches the DOM or the
 * network, which is what lets it be asserted exactly from Node.
 *
 * Values returned here are plain text. Callers escape before inserting into HTML.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.IslandOrderFormat = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RICE_AND_PEAS = 'Rice & Peas';
  var SIDE_ONLY_PRICE = 5;

  // Group labels are a fixed vocabulary. They appear verbatim in the sidebar, the
  // review sheet, the return receipt and the text fallback.
  var LABELS = {
    includes: 'Includes',
    sides: 'Your sides',
    extras: 'Extras',
    leaveOff: 'Leave off / requests',
    sidesOnly: 'Sides only',
  };

  // Empty is answered, never blank (DESIGN-LOCK decision 3).
  var EMPTY = {
    includes: 'No rice & peas — rasta pasta plate',
    extras: 'None',
    leaveOff: 'Nothing — cook it as it comes',
  };

  var EXTRAS = {
    meat: { label: 'Extra meat', price: 10 },
    oxtail: { label: 'Extra oxtail', price: 12 },
  };

  // Merchant notes join the SAME groups the customer saw. Values already use ' · '
  // internally (between sides), so groups are separated by a token that cannot
  // collide with one, keeping a kitchen ticket unambiguous at a glance.
  var MERCHANT_GROUP_SEPARATOR = ' | ';

  function extraFor(meat) {
    return meat && Object.prototype.hasOwnProperty.call(EXTRAS, meat) ? EXTRAS[meat] : null;
  }

  function extraPrice(meat) {
    var extra = extraFor(meat);
    return extra ? extra.price : 0;
  }

  /** "Extra oxtail (+$12)", or '' when no extra is selected. */
  function extraText(meat) {
    var extra = extraFor(meat);
    return extra ? extra.label + ' (+$' + extra.price + ')' : '';
  }

  function plateTotal(line) {
    return (Number(line.unitPrice) * Number(line.qty)) + extraPrice(line.meat);
  }

  /**
   * Normalize one configured plate into the shape every surface renders from.
   * `rastaPasta` is carried on the line so a receipt restored from sessionStorage
   * is self-sufficient and never has to re-look-up the menu.
   */
  function plateLine(input) {
    var note = typeof input.note === 'string' ? input.note.trim() : '';
    var line = {
      kind: 'plate',
      id: input.id,
      name: input.name,
      qty: Number(input.qty) || 1,
      unitPrice: Number(input.unitPrice != null ? input.unitPrice : input.price) || 0,
      sides: Array.isArray(input.sides) ? input.sides.slice() : [],
      meat: input.meat || false,
      note: note,
      rastaPasta: Boolean(input.rastaPasta),
    };
    line.lineTotal = plateTotal(line);
    return line;
  }

  function sideLine(name, qty) {
    var count = Number(qty) || 1;
    return { kind: 'side', name: name, qty: count, unitPrice: SIDE_ONLY_PRICE, lineTotal: SIDE_ONLY_PRICE * count };
  }

  /** "2 × Jerk Chicken" / "2 × Side · Sweet Plantains" */
  function lineTitle(line) {
    return line.qty + ' × ' + (line.kind === 'side' ? 'Side · ' + line.name : line.name);
  }

  /**
   * The labelled groups for one line. Every group is always present, so a customer
   * never has to work out whether a missing row means "none" or "we forgot".
   * `isEmpty` lets the UI style the answered-empty case as quiet italic.
   */
  function groupsFor(line) {
    if (line.kind === 'side') {
      return [{ key: 'sidesOnly', label: LABELS.sidesOnly, value: 'No plate — $' + SIDE_ONLY_PRICE + ' each', isEmpty: false }];
    }
    var extras = extraText(line.meat);
    return [
      {
        key: 'includes',
        label: LABELS.includes,
        value: line.rastaPasta ? EMPTY.includes : RICE_AND_PEAS,
        isEmpty: Boolean(line.rastaPasta),
      },
      {
        key: 'sides',
        // While a plate is still being built, show what is already picked AND what is
        // still owed, so the sidebar never reads as if a half-configured plate is done.
        label: LABELS.sides,
        value: line.sides.length === 2 ? line.sides.join(' · ')
          : line.sides.length === 1 ? line.sides[0] + ' · choose 1 more side'
            : 'Choose 2 sides',
        isEmpty: line.sides.length !== 2,
      },
      { key: 'extras', label: LABELS.extras, value: extras || EMPTY.extras, isEmpty: !extras },
      { key: 'leaveOff', label: LABELS.leaveOff, value: line.note || EMPTY.leaveOff, isEmpty: !line.note },
    ];
  }

  /**
   * The Square `OrderLineItem.note` for one configured plate.
   *
   * This is deliberately `groupsFor()` joined — not a second formatter. Shantay reads
   * the exact words the customer read, and there is no independent literal that can
   * drift away from the review sheet or the receipt. Side-only lines get no note:
   * the Square line name ("Side · Rice & Peas") already carries their whole truth.
   */
  function merchantNote(input) {
    if (!input || input.kind === 'side') return '';
    return groupsFor(plateLine(input))
      .map(function (group) { return group.label + ': ' + group.value; })
      .join(MERCHANT_GROUP_SEPARATOR);
  }

  /** ['A','B','A'] -> [{name:'A',qty:2},{name:'B',qty:1}], first-appearance order. */
  function collapseSides(sideOnly) {
    var counts = {};
    var order = [];
    (sideOnly || []).forEach(function (side) {
      if (!Object.prototype.hasOwnProperty.call(counts, side)) { counts[side] = 0; order.push(side); }
      counts[side] += 1;
    });
    return order.map(function (side) { return { name: side, qty: counts[side] }; });
  }

  /**
   * Build the whole order model.
   * `plates` are already-normalized-or-raw plate inputs; `sideOnly` is an array of
   * side names (repeats allowed, they are collapsed into quantities the same way
   * the checkout payload collapses them).
   */
  function orderModel(input) {
    var plates = (input.plates || []).map(plateLine);
    var sides = collapseSides(input.sideOnly).map(function (entry) { return sideLine(entry.name, entry.qty); });
    var lines = plates.concat(sides);
    return {
      lines: lines,
      date: input.date || '',
      dateLabel: input.dateLabel || '',
      name: input.name || '',
      phone: input.phone || '',
      lineCount: lines.length,
      itemCount: lines.reduce(function (sum, line) { return sum + line.qty; }, 0),
      totalDollars: lines.reduce(function (sum, line) { return sum + line.lineTotal; }, 0),
    };
  }

  /** "4 lines · 6 items" */
  function countLabel(model) {
    return model.lineCount + (model.lineCount === 1 ? ' line · ' : ' lines · ') + model.itemCount + (model.itemCount === 1 ? ' item' : ' items');
  }

  function lastFour(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : '';
  }

  function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || '';
  }

  /**
   * Privacy-minimized receipt for sessionStorage.
   * Keeps exactly what the customer needs to recognise their own order on return.
   * Deliberately omits: full phone, full name, the Square checkout URL, the payment
   * link id, and anything resembling payment data or a secret.
   */
  function receiptFor(model, extra) {
    var meta = extra || {};
    return {
      v: 1,
      lines: model.lines,
      date: model.date,
      dateLabel: model.dateLabel,
      totalDollars: model.totalDollars,
      firstName: firstName(model.name),
      phoneLast4: lastFour(model.phone),
      orderRef: meta.orderRef || '',
      environment: meta.environment || '',
      submittedAt: meta.submittedAt || '',
    };
  }

  /** Rebuild a renderable model from a stored receipt without re-reading the menu. */
  function modelFromReceipt(receipt) {
    var lines = Array.isArray(receipt && receipt.lines) ? receipt.lines : [];
    return {
      lines: lines,
      date: receipt.date || '',
      dateLabel: receipt.dateLabel || '',
      name: receipt.firstName || '',
      phone: '',
      lineCount: lines.length,
      itemCount: lines.reduce(function (sum, line) { return sum + line.qty; }, 0),
      totalDollars: Number(receipt.totalDollars) || 0,
    };
  }

  /**
   * The text-order fallback. Carries the same grouped plate truth and the same total
   * as the review sheet, so a customer who falls back to SMS is not downgraded.
   */
  function textFallback(model) {
    var out = ['Island Delicacy preorder', 'Pickup: ' + (model.dateLabel || model.date), 'Name: ' + model.name, 'Phone: ' + model.phone, ''];
    model.lines.forEach(function (line) {
      out.push(lineTitle(line) + ' — $' + line.lineTotal);
      groupsFor(line).forEach(function (group) { out.push('  ' + group.label + ': ' + group.value); });
      out.push('');
    });
    out.push('Total: $' + model.totalDollars);
    out.push("We'll text to set the pickup time.");
    return out.join('\n');
  }

  return {
    RICE_AND_PEAS: RICE_AND_PEAS,
    SIDE_ONLY_PRICE: SIDE_ONLY_PRICE,
    LABELS: LABELS,
    EMPTY: EMPTY,
    EXTRAS: EXTRAS,
    extraPrice: extraPrice,
    extraText: extraText,
    plateLine: plateLine,
    sideLine: sideLine,
    collapseSides: collapseSides,
    lineTitle: lineTitle,
    groupsFor: groupsFor,
    merchantNote: merchantNote,
    MERCHANT_GROUP_SEPARATOR: MERCHANT_GROUP_SEPARATOR,
    orderModel: orderModel,
    countLabel: countLabel,
    receiptFor: receiptFor,
    modelFromReceipt: modelFromReceipt,
    textFallback: textFallback,
  };
}));
