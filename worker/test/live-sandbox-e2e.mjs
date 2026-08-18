import { handleRequest } from '../src/index.js';
import { earliestPickupDate } from '../src/checkout.js';

const required = ['SQUARE_ACCESS_TOKEN', 'SQUARE_LOCATION_ID'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const environment = {
  SQUARE_ACCESS_TOKEN: process.env.SQUARE_ACCESS_TOKEN,
  SQUARE_LOCATION_ID: process.env.SQUARE_LOCATION_ID,
  SQUARE_ENVIRONMENT: 'sandbox',
  SQUARE_API_VERSION: '2026-07-15',
  ALLOWED_ORIGINS: 'https://islanddelicacy.com',
  CHECKOUT_REDIRECT_URL: 'https://islanddelicacy.com/order/?paid=1&sandbox=1',
};

const payload = {
  lines: [
    {
      id: 'jerk',
      qty: 1,
      sides: ['Steamed Cabbage', 'Sweet Plantains'],
      meat: 'meat',
      note: 'Automated Sandbox checkout verification',
    },
    { id: 'side-rice-and-peas', qty: 1 },
  ],
  date: earliestPickupDate(new Date()),
  name: 'Island Delicacy Sandbox QA',
  phone: '619-555-0100',
};

const request = new Request('https://worker.invalid/api/checkout', {
  method: 'POST',
  headers: {
    Origin: 'https://islanddelicacy.com',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const response = await handleRequest(request, environment);
const body = await response.json().catch(() => ({}));
const output = {
  worker_http_status: response.status,
  environment: body.environment || null,
  order_id_present: Boolean(body.orderId),
  payment_link_id_present: Boolean(body.paymentLinkId),
  checkout_hostname: null,
  checkout_reachable_status: null,
  square_order_query_status: null,
  square_total_cents: null,
  square_line_items: [],
  pickup_date: payload.date,
  expected_total_cents: 3500,
  raw_secret_emitted: false,
};

if (body.url) {
  const url = new URL(body.url);
  output.checkout_hostname = url.hostname;
  const checkoutResponse = await fetch(url, { redirect: 'manual' });
  output.checkout_reachable_status = checkoutResponse.status;
}

if (body.orderId) {
  const orderResponse = await fetch(
    `https://connect.squareupsandbox.com/v2/orders/${encodeURIComponent(body.orderId)}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        Accept: 'application/json',
        'Square-Version': '2026-07-15',
      },
    },
  );
  output.square_order_query_status = orderResponse.status;
  const orderBody = await orderResponse.json().catch(() => ({}));
  const squareOrder = orderBody.order || {};
  output.square_total_cents = squareOrder.total_money?.amount ?? null;
  output.square_line_items = (squareOrder.line_items || []).map((line) => ({
    name: line.name,
    quantity: line.quantity,
    unit_price_cents: line.base_price_money?.amount ?? null,
  }));
}

console.log(JSON.stringify(output, null, 2));
if (
  response.status !== 200
  || output.checkout_hostname !== 'sandbox.square.link'
  || output.square_order_query_status !== 200
  || output.square_total_cents !== output.expected_total_cents
) {
  throw new Error(`Sandbox checkout verification failed with safe code ${body.code || response.status}`);
}
