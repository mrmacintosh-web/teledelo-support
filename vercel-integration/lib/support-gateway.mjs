import { isIP } from 'node:net';
import { hmacKey, proxyMessage, sign } from './support-proxy-contract.mjs';

const routes = new Set([
  '/help', '/help/requests', '/waitlist', '/demo', '/privacy-request', '/privacy-request/verify', '/calculator',
  '/waitlist/api', '/waitlist/api/config', '/demo/api', '/demo/api/config',
  '/privacy-request/api', '/privacy-request/api/config', '/privacy-request/api/verify',
]);

export function allowedPath(path) {
  return routes.has(path.replace(/\/$/, '')) ||
    /^\/help\/api\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/?$/.test(path) ||
    /^\/(?:help\/assets|intake-assets)\/[a-zA-Z0-9_.-]+$/.test(path);
}

function httpsOrigin(value) {
  try {
    const origin = new URL(value);
    return origin.origin === value && origin.protocol === 'https:' ? origin : null;
  } catch { return null; }
}

function problem(status, message) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function requestPath(url) {
  const original = url.pathname === '/api/support-edge' ? url.searchParams.get('td_path') : url.pathname;
  return original && allowedPath(original) ? original : null;
}

function supportCookie(header) {
  const match = /(?:^|;\s*)td_support_session=([\w-]{43})(?:;|$)/.exec(header || '');
  return match ? 'td_support_session=' + match[1] : '';
}

async function boundedBody(request) {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  let bytes = 0;
  const chunks = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, bytes);
      bytes += value.length;
      if (bytes > 12000) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
}

export function createSupportGateway(env = process.env, transport = fetch) {
  return async request => {
    const url = new URL(request.url);
    const path = requestPath(url);
    if (!path) return problem(404, 'This route could not be found.');
    if (!['GET', 'HEAD', 'POST'].includes(request.method)) return problem(405, 'Method not allowed.');
    const origin = httpsOrigin(env.SUPPORT_PUBLIC_ORIGIN);
    const upstream = httpsOrigin(env.SUPPORT_WORKER_ORIGIN);
    if (!origin || !upstream || origin.origin === upstream.origin || env.SUPPORT_PROXY_SECRET?.length < 32 ||
      !env.SUPPORT_PROXY_SECRET || url.origin !== origin.origin) {
      return problem(503, 'This TeleDelo service is temporarily unavailable.');
    }
    const posted = request.method === 'POST';
    if (posted && request.headers.get('origin') !== origin.origin) return problem(403, 'Invalid request origin.');
    if (posted && Number(request.headers.get('content-length')) > 12000) return problem(413, 'Request too large.');

    const body = posted ? await boundedBody(request).catch(() => null) : undefined;
    if (body === null) return problem(413, 'Request too large or invalid.');

    url.searchParams.delete('td_path');
    const target = new URL(path + url.search, upstream);
    const time = String(Math.floor(Date.now() / 1000));
    const forwarded = request.headers.get('x-vercel-forwarded-for') || '';
    const ip = isIP(forwarded) ? forwarded : '';
    const headers = new Headers();
    if (posted) {
      headers.set('origin', origin.origin);
      const type = request.headers.get('content-type');
      if (type) headers.set('content-type', type);
    }
    if (path.startsWith('/help/api/')) {
      const cookie = supportCookie(request.headers.get('cookie'));
      if (cookie) headers.set('cookie', cookie);
    }
    const key = await hmacKey(env.SUPPORT_PROXY_SECRET);
    headers.set('X-TD-Support-Time', time);
    headers.set('X-TD-Support-Origin', origin.origin);
    headers.set('X-TD-Support-IP', ip);
    headers.set('X-TD-Support-Signature', await sign(key,
      proxyMessage({ time, origin: origin.origin, ip, method: request.method, path: target.pathname + target.search })));

    try {
      const response = await transport(target, {
        method: request.method,
        headers,
        body,
        duplex: 'half',
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
      const result = new Headers();
      for (const name of ['Content-Type', 'Content-Security-Policy', 'Referrer-Policy', 'Permissions-Policy',
        'X-Content-Type-Options', 'X-Frame-Options', 'X-Robots-Tag', 'Retry-After']) {
        const value = response.headers.get(name);
        if (value) result.set(name, value);
      }
      const isAsset = /^\/(help\/assets|intake-assets)\//.test(path);
      result.set('Cache-Control', isAsset && response.ok ? 'public, max-age=300' : 'no-store');
      for (const cookie of response.headers.getSetCookie()) {
        if (path.startsWith('/help/api/') && /^td_support_session=[\w-]*; Path=\/help; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/.test(cookie)) {
          result.append('Set-Cookie', cookie);
        }
      }
      const redirect = response.headers.get('location');
      if (redirect) {
        const next = new URL(redirect, target);
        if (![upstream.origin, origin.origin].includes(next.origin) || !allowedPath(next.pathname)) {
          return problem(502, 'This TeleDelo service is temporarily unavailable.');
        }
        result.set('Location', next.pathname + next.search);
      }
      return new Response(response.body, { status: response.status, headers: result });
    } catch {
      return problem(502, 'This TeleDelo service is temporarily unavailable. Please try again.');
    }
  };
}
