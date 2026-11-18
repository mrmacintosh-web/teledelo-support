import { sha } from './utils.mjs';
import { hmacKey, proxyMessage, verify } from './support-proxy-contract.mjs';

export const now = () => Math.floor(Date.now() / 1000);

export async function readForm(req) {
  if (req.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || !req.body) {
    throw new Error('JSON required');
  }
  if (Number(req.headers.get('Content-Length')) > 12000) throw new Error('Request too large');
  const reader = req.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0;
  let body = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 12000) throw new Error('Request too large');
      body += decoder.decode(value, { stream: true });
    }
    const result = JSON.parse(body + decoder.decode());
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Object required');
    return result;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function originMatches(req) {
  return req.headers.get('Origin') === new URL(req.url).origin;
}

export async function checkCaptcha(env, token, req, action) {
  if (!env.TURNSTILE_SECRET || typeof token !== 'string' || !token || token.length > 2048) return false;
  const ip = req.headers.get('CF-Connecting-IP');
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, ...(ip && { remoteip: ip }) }),
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return false;
  const result = await res.json();
  const usingLocalTestKey = env.ENVIRONMENT === 'local' && env.TURNSTILE_SITE_KEY === '1x00000000000000000000AA';
  return result.success === true && (!action || usingLocalTestKey ||
    (result.action === action && result.hostname === new URL(req.url).hostname));
}

export async function takeRateLimit(env, scope, identifier, max, period = 3600) {
  const key = await sha(scope + '|' + env.RATE_LIMIT_SALT + '|' + identifier);
  const time = now();
  const result = await env.DB.prepare(`
    INSERT INTO throttle_events(id,scope,key_hash,created_at)
    SELECT ?,?,?,? WHERE (
      SELECT count(*) FROM throttle_events WHERE scope=? AND key_hash=? AND created_at>?
    ) < ?
  `).bind(crypto.randomUUID(), scope, key, time, scope, key, time - period, max).run();
  return result.meta.changes === 1;
}

export function queue(env, template, to, reference, payload, identifier, recordTable, verificationStartedAt) {
  const checkVersion = verificationStartedAt ? ' AND verification_started_at=?' : '';
  const gate = recordTable ? ` WHERE EXISTS (SELECT 1 FROM ${recordTable} WHERE reference=?${checkVersion})` : '';
  const args = [
    crypto.randomUUID(), identifier, to, template, JSON.stringify({ reference, ...payload }), now(), now(),
  ];
  return env.DB.prepare(`
    INSERT OR IGNORE INTO email_outbox (id,dedupe_key,recipient,template,payload_json,status,attempts,available_at,created_at)
    SELECT ?,?,?,?,?,'pending',0,?,?${gate}
  `).bind(...args, ...(recordTable ? [reference] : []), ...(verificationStartedAt ? [verificationStartedAt] : []));
}

// Only a configured Vercel gateway can provide the effective public URL and client IP.
export async function browserRequest(req, env) {
  const signature = req.headers.get('X-TD-Support-Signature');
  if (!signature) return req;
  const time = req.headers.get('X-TD-Support-Time');
  const ip = req.headers.get('X-TD-Support-IP') || '';
  const origin = req.headers.get('X-TD-Support-Origin');
  if (!env.SUPPORT_PROXY_SECRET || env.SUPPORT_PROXY_SECRET.length < 32 ||
      !env.SUPPORT_PUBLIC_ORIGIN || origin !== env.SUPPORT_PUBLIC_ORIGIN ||
      !/^\d{10}$/.test(time || '') || Math.abs(now() - Number(time)) > 60 ||
      (ip && !/^[\da-f.:]{2,45}$/i.test(ip))) return null;
  const url = new URL(req.url);
  const path = url.pathname + url.search;
  const key = await hmacKey(env.SUPPORT_PROXY_SECRET);
  if (!await verify(key, proxyMessage({ time, origin, ip, method: req.method, path }), signature)) return null;
  const headers = new Headers(req.headers);
  headers.delete('Cf-Access-Jwt-Assertion');
  headers.delete('CF-Connecting-IP');
  if (ip) headers.set('CF-Connecting-IP', ip);
  return new Request(origin + path, { method: req.method, headers, body: req.body, duplex: 'half' });
}
