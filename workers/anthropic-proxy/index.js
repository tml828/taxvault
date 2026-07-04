/**
 * TaxVault — Anthropic API Proxy
 *
 * Keeps the Anthropic API key server-side. The browser sends requests here;
 * this worker adds the Authorization header and forwards to api.anthropic.com.
 *
 * Deploy: wrangler deploy
 * Set secret: wrangler secret put ANTHROPIC_API_KEY
 *
 * The TaxVault app's ANTHROPIC_PROXY_URL constant must point to this worker's URL.
 */

const ANTHROPIC_API = 'https://api.anthropic.com';
const ALLOWED_ORIGIN = 'https://tml828.github.io';  // update if domain changes

// Allowed API paths — whitelist only what the app uses
const ALLOWED_PATHS = [
  '/v1/messages',
];

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, env);
    }

    const url = new URL(request.url);

    // Only allow configured paths
    if (!ALLOWED_PATHS.includes(url.pathname)) {
      return corsResponse(JSON.stringify({ error: 'Not found' }), 404, env);
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405, env);
    }

    // Enforce origin in production
    const origin = request.headers.get('Origin') || '';
    if (env.ENFORCE_ORIGIN === 'true' && origin !== ALLOWED_ORIGIN) {
      return corsResponse(JSON.stringify({ error: 'Forbidden' }), 403, env);
    }

    // Validate body is JSON
    let body;
    try {
      body = await request.text();
      JSON.parse(body); // validate
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid JSON body' }), 400, env);
    }

    // Forward to Anthropic
    const upstream = new Request(`${ANTHROPIC_API}${url.pathname}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': request.headers.get('anthropic-version') || '2023-06-01',
        // Do NOT forward anthropic-dangerous-direct-browser-access — not needed server-side
      },
      body,
    });

    let response;
    try {
      response = await fetch(upstream);
    } catch (err) {
      return corsResponse(
        JSON.stringify({ error: 'Upstream fetch failed', detail: err.message }),
        502,
        env,
      );
    }

    const responseBody = await response.text();

    return corsResponse(responseBody, response.status, env, {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    });
  },
};

function corsResponse(body, status, env, extraHeaders = {}) {
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, anthropic-version',
    'Access-Control-Max-Age': '86400',
    ...extraHeaders,
  };
  return new Response(body, { status, headers });
}
