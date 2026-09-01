// The one serialization the browser also uses. Merchant notes are not rebuilt here:
// a second formatter would be free to drift away from what the customer confirmed.
import OrderFormat from '../../js/order-format.js';

const PACIFIC_TIME_ZONE = 'America/Los_Angeles';
const MAX_DAYS_AHEAD = 30;

export const MENU = Object.freeze({
  jerk: { name: 'Jerk Chicken', priceCents: 2000, rastaPasta: false },
  'curry-chicken': { name: 'Curry Chicken', priceCents: 2000, rastaPasta: false },
  'fried-chicken': { name: 'Fried Chicken', priceCents: 2000, rastaPasta: false },
  'barbi-fried-chicken': { name: 'Barbi Fried Chicken', priceCents: 2000, rastaPasta: false },
  'brown-stew-chicken': { name: 'Brown Stew Chicken', priceCents: 2000, rastaPasta: false },
  oxtail: { name: 'Oxtail', priceCents: 2500, rastaPasta: false },
  'curry-goat': { name: 'Curry Goat', priceCents: 2500, rastaPasta: false },
  'chicken-rasta-pasta': { name: 'Chicken Rasta Pasta', priceCents: 2200, rastaPasta: true },
  'shrimp-rasta-pasta': { name: 'Shrimp Rasta Pasta', priceCents: 2500, rastaPasta: true },
  'oxtail-rasta-pasta': { name: 'Oxtail Rasta Pasta', priceCents: 2800, rastaPasta: true },
  'curry-shrimp': { name: 'Curry Shrimp', priceCents: 2500, rastaPasta: false },
  'escovitch-fish': { name: 'Escovitch Fish', priceCents: 3000, rastaPasta: false },
});

const SIDE_ONLY = Object.freeze({
  'side-steamed-cabbage': 'Steamed Cabbage',
  'side-sweet-plantains': 'Sweet Plantains',
  'side-rasta-pasta': 'Rasta Pasta',
  'side-rice-and-peas': 'Rice & Peas',
});

const STANDARD_SIDES = new Set(['Steamed Cabbage', 'Sweet Plantains', 'Rasta Pasta']);
const RASTA_SIDES = new Set(['Steamed Cabbage', 'Sweet Plantains', 'Rice & Peas']);
// Server-authoritative cents. tests/cross-surface-contract.test.mjs asserts these
// equal the dollar prices the customer is shown by the shared serializer.
const EXTRA_PRICES = Object.freeze({ meat: 1000, oxtail: 1200 });

export class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ValidationError(code, message);
}

function pacificParts(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function dateKeyFromParts(parts) {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function addCalendarDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function isRealIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function earliestPickupDate(now = new Date()) {
  const parts = pacificParts(now);
  return addCalendarDays(dateKeyFromParts(parts), parts.hour < 10 ? 1 : 2);
}

function cleanText(value, maxLength, field) {
  if (typeof value !== 'string') fail(`INVALID_${field.toUpperCase()}`, `${field} is required.`);
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > maxLength) fail(`INVALID_${field.toUpperCase()}`, `${field} is invalid.`);
  return cleaned;
}

function cleanOptionalText(value, maxLength, field) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') fail(`INVALID_${field.toUpperCase()}`, `${field} is invalid.`);
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length > maxLength) fail(`INVALID_${field.toUpperCase()}`, `${field} is too long.`);
  return cleaned;
}

function normalizePhone(value) {
  if (typeof value !== 'string') fail('INVALID_PHONE', 'phone is required.');
  let digits = value.replace(/\D/g, '');
  if (digits.length === 10) digits = `1${digits}`;
  if (digits.length !== 11 || !digits.startsWith('1')) fail('INVALID_PHONE', 'Enter a valid US phone number.');
  return `+${digits}`;
}

function validateQuantity(value) {
  if (!Number.isInteger(value) || value < 1 || value > 10) fail('INVALID_QUANTITY', 'Quantity must be from 1 to 10.');
  return value;
}

function validateSides(value, item) {
  if (!Array.isArray(value) || value.length !== 2 || new Set(value).size !== 2) fail('INVALID_SIDES', 'Each plate must have exactly two different sides.');
  const allowed = item.rastaPasta ? RASTA_SIDES : STANDARD_SIDES;
  if (!value.every((side) => typeof side === 'string' && allowed.has(side))) fail('INVALID_SIDES', 'One or more sides are not available for that plate.');
  return [...value];
}

function validateLine(line) {
  if (!line || typeof line !== 'object' || Array.isArray(line)) fail('INVALID_LINE', 'Each order line must be an object.');
  const id = typeof line.id === 'string' ? line.id : '';
  const qty = validateQuantity(line.qty);

  if (Object.hasOwn(SIDE_ONLY, id)) {
    return { kind: 'side', id, name: SIDE_ONLY[id], qty, priceCents: 500 };
  }

  const item = MENU[id];
  if (!item) fail('INVALID_ITEM', 'One or more order items are unavailable.');
  const meat = line.meat === false || line.meat == null || line.meat === '' ? false : line.meat;
  if (meat !== false && !Object.hasOwn(EXTRA_PRICES, meat)) fail('INVALID_EXTRA', 'The extra-meat selection is invalid.');
  return {
    kind: 'plate', id, name: item.name, qty, priceCents: item.priceCents,
    rastaPasta: item.rastaPasta,
    sides: validateSides(line.sides, item), meat,
    extraCents: meat ? EXTRA_PRICES[meat] : 0,
    note: cleanOptionalText(line.note, 200, 'note'),
  };
}

export function validateCheckout(input, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_REQUEST', 'The order request is invalid.');
  if (!Array.isArray(input.lines) || input.lines.length === 0) fail('EMPTY_ORDER', 'Add at least one item to the order.');
  if (input.lines.length > 20) fail('TOO_MANY_LINES', 'The order has too many separate lines.');

  const date = typeof input.date === 'string' ? input.date : '';
  if (!isRealIsoDate(date)) fail('INVALID_PICKUP_DATE', 'Choose a valid pickup date.');
  const earliest = earliestPickupDate(now);
  if (date < earliest) fail('PICKUP_TOO_EARLY', `The earliest available pickup date is ${earliest}.`);
  const today = dateKeyFromParts(pacificParts(now));
  if (date > addCalendarDays(today, MAX_DAYS_AHEAD)) fail('PICKUP_TOO_FAR', 'Pickup must be within the next 30 days.');

  const lines = input.lines.map(validateLine);
  const totalQuantity = lines.reduce((sum, line) => sum + line.qty, 0);
  if (totalQuantity > 30) fail('ORDER_TOO_LARGE', 'Please contact Island Delicacy for orders over 30 items.');
  const totalCents = lines.reduce((sum, line) => sum + (line.priceCents * line.qty) + (line.extraCents || 0), 0);

  return {
    lines,
    date,
    name: cleanText(input.name, 80, 'name'),
    phone: normalizePhone(input.phone),
    totalCents,
  };
}

function lineItem(name, quantity, amount, note = undefined) {
  const item = {
    name,
    quantity: String(quantity),
    base_price_money: { amount, currency: 'USD' },
  };
  if (note) item.note = note;
  return item;
}

export function buildSquarePaymentLinkRequest(order, env, idempotencyKey) {
  if (!env.SQUARE_LOCATION_ID) throw new Error('SQUARE_LOCATION_ID is not configured');
  const lineItems = [];

  for (const line of order.lines) {
    if (line.kind === 'side') {
      lineItems.push(lineItem(`Side · ${line.name}`, line.qty, line.priceCents));
      continue;
    }

    // Shantay reads exactly the words the customer confirmed — same labels, same
    // values, same answered-empty states — because this is the shared serializer.
    lineItems.push(lineItem(line.name, line.qty, line.priceCents, OrderFormat.merchantNote(line)));
    if (line.meat) {
      const extra = OrderFormat.EXTRAS[line.meat];
      lineItems.push(lineItem(`${extra.label} · ${line.name}`, 1, line.extraCents, `For ${OrderFormat.lineTitle(line)}`));
    }
  }

  return {
    idempotency_key: idempotencyKey,
    order: { location_id: env.SQUARE_LOCATION_ID, line_items: lineItems },
    checkout_options: {
      redirect_url: env.CHECKOUT_REDIRECT_URL,
      enable_coupon: false,
      enable_loyalty: false,
    },
    pre_populated_data: { buyer_phone_number: order.phone },
    payment_note: `Island Delicacy preorder · Pickup ${order.date} · ${order.name} · ${order.phone}`,
  };
}