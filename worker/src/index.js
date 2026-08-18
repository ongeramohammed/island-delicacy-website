import { ValidationError, buildSquarePaymentLinkRequest, validateCheckout } from './checkout.js';

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));
}

function corsOrigin(request, env) {
  const origin = request.headers.get('Origin');
  return origin && allowedOrigins(env).has(origin) ? origin : null;
}

function responseHeaders(origin, extra = {}) {
  return {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    ...extra,
  };
}

function json(data, status, origin, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders(origin, extra) });
}

function squareBase(environment) {
  if (environment === 'sandbox') return 'https://connect.squareupsandbox.com';
  if (environment === 'production') return 'https://connect.squareup.com';
  throw new Error('SQUARE_ENVIRONMENT must be sandbox or production');
}

function validSquareCheckoutUrl(value, environment) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return environment === 'sandbox'
      ? url.hostname === 'sandbox.square.link'
      : url.hostname === 'square.link' || url.hostname === 'checkout.square.site';
  } catch {
    return false;
  }
}

export async function handleRequest(request, env, fetchImpl = fetch, now = new Date()) {
  const url = new URL(request.url);
  const origin = corsOrigin(request, env);

  if (request.method === 'GET' && url.pathname === '/health') {
    return json({ ok: true, environment: env.SQUARE_ENVIRONMENT || 'unconfigured' }, 200, origin);
  }

  if (url.pathname !== '/api/checkout') return json({ error: 'Not found.' }, 404, origin);

  if (request.method === 'OPTIONS') {
    if (!origin) return json({ error: 'Origin not allowed.' }, 403, null);
    return new Response(null, {
      status: 204,
      headers: responseHeaders(origin, {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
      }),
    });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin, { Allow: 'POST, OPTIONS' });
  if (!origin) return json({ error: 'Origin not allowed.' }, 403, null);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return json({ error: 'Content-Type must be application/json.' }, 415, origin);
  }
  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
    return json({ error: 'Checkout is not configured.' }, 503, origin);
  }

  try {
    const raw = await request.text();
    if (raw.length > 20_000) return json({ error: 'Order request is too large.' }, 413, origin);
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return json({ error: 'Order request is not valid JSON.' }, 400, origin);
    }

    const order = validateCheckout(input, now);
    const squareRequest = buildSquarePaymentLinkRequest(order, env, crypto.randomUUID());
    const environment = env.SQUARE_ENVIRONMENT || 'sandbox';
    const upstream = await fetchImpl(`${squareBase(environment)}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Square-Version': env.SQUARE_API_VERSION || '2026-07-15',
      },
      body: JSON.stringify(squareRequest),
    });

    if (!upstream.ok) {
      await upstream.arrayBuffer();
      return json({ error: 'Square checkout is temporarily unavailable. Please use the text-order fallback.' }, 502, origin);
    }

    const result = await upstream.json();
    const paymentLink = result?.payment_link;
    if (!paymentLink || !validSquareCheckoutUrl(paymentLink.url, environment)) {
      return json({ error: 'Square checkout returned an invalid link. Please use the text-order fallback.' }, 502, origin);
    }

    return json({
      url: paymentLink.url,
      orderId: paymentLink.order_id,
      paymentLinkId: paymentLink.id,
      environment,
    }, 200, origin);
  } catch (error) {
    if (error instanceof ValidationError) return json({ error: error.message, code: error.code }, 400, origin);
    return json({ error: 'Checkout could not be created. Please use the text-order fallback.' }, 500, origin);
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};