import assert from 'node:assert/strict';
import test from 'node:test';

import { handleRequest } from '../src/index.js';

const env = {
  SQUARE_ACCESS_TOKEN: 'test-token-not-a-real-secret',
  SQUARE_LOCATION_ID: 'TEST_LOCATION',
  SQUARE_ENVIRONMENT: 'sandbox',
  SQUARE_API_VERSION: '2026-07-15',
  ALLOWED_ORIGINS: 'https://islanddelicacy.com,http://localhost:8000',
  CHECKOUT_REDIRECT_URL: 'https://islanddelicacy.com/order/?paid=1&sandbox=1',
};

const payload = {
  lines: [{ id: 'jerk', qty: 1, sides: ['Steamed Cabbage', 'Sweet Plantains'], meat: false, note: '' }],
  date: '2026-08-05',
  name: 'Test Customer',
  phone: '619-555-0100',
};

function request(path, options = {}) {
  return new Request(`https://worker.example${path}`, {
    headers: { Origin: 'https://islanddelicacy.com', 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
}

test('health and CORS preflight never expose secrets', async () => {
  const health = await handleRequest(request('/health', { method: 'GET' }), env);
  assert.equal(health.status, 200);
  const text = await health.text();
  assert.match(text, /"environment":"sandbox"/);
  assert.doesNotMatch(text, /test-token/);

  const preflight = await handleRequest(request('/api/checkout', { method: 'OPTIONS' }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://islanddelicacy.com');
});

test('rejects a browser origin outside the allowlist', async () => {
  const response = await handleRequest(request('/api/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
  }), env, async () => { throw new Error('Square must not be called'); }, new Date('2026-08-04T16:00:00Z'));
  assert.equal(response.status, 403);
});

test('creates a sandbox Square payment link through the upstream API', async () => {
  let upstreamRequest;
  const fakeFetch = async (input, init) => {
    upstreamRequest = { input, init };
    return Response.json({ payment_link: { id: 'PL123', order_id: 'ORDER123', url: 'https://sandbox.square.link/u/test' } });
  };
  const response = await handleRequest(request('/api/checkout', { method: 'POST', body: JSON.stringify(payload) }), env, fakeFetch, new Date('2026-08-04T16:00:00Z'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://islanddelicacy.com');
  assert.deepEqual(await response.json(), { url: 'https://sandbox.square.link/u/test', orderId: 'ORDER123', paymentLinkId: 'PL123', environment: 'sandbox' });
  assert.equal(upstreamRequest.input, 'https://connect.squareupsandbox.com/v2/online-checkout/payment-links');
  assert.equal(upstreamRequest.init.headers.Authorization, 'Bearer test-token-not-a-real-secret');
  assert.equal(JSON.parse(upstreamRequest.init.body).order.line_items[0].base_price_money.amount, 2000);
});

test('returns a safe 502 when Square rejects a request', async () => {
  const fakeFetch = async () => Response.json({ errors: [{ category: 'AUTHENTICATION_ERROR', code: 'UNAUTHORIZED', detail: 'sensitive upstream detail' }] }, { status: 401 });
  const response = await handleRequest(request('/api/checkout', { method: 'POST', body: JSON.stringify(payload) }), env, fakeFetch, new Date('2026-08-04T16:00:00Z'));
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.match(text, /Square checkout is temporarily unavailable/);
  assert.doesNotMatch(text, /sensitive upstream detail|UNAUTHORIZED/);
});

test('production uses Square production and accepts only a production payment link', async () => {
  const productionEnv = {
    ...env,
    SQUARE_ENVIRONMENT: 'production',
    ALLOWED_ORIGINS: 'https://islanddelicacy.com',
    CHECKOUT_REDIRECT_URL: 'https://islanddelicacy.com/order/?paid=1',
  };
  let upstreamUrl;
  const fakeFetch = async (input) => {
    upstreamUrl = input;
    return Response.json({ payment_link: { id: 'PRODPL', order_id: 'PRODORDER', url: 'https://square.link/u/test' } });
  };
  const response = await handleRequest(request('/api/checkout', { method: 'POST', body: JSON.stringify(payload) }), productionEnv, fakeFetch, new Date('2026-08-04T16:00:00Z'));
  assert.equal(response.status, 200);
  assert.equal(upstreamUrl, 'https://connect.squareup.com/v2/online-checkout/payment-links');
  assert.deepEqual(await response.json(), { url: 'https://square.link/u/test', orderId: 'PRODORDER', paymentLinkId: 'PRODPL', environment: 'production' });
});