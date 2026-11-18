// Shared by the Vercel gateway and the existing Support Worker.
const encoder = new TextEncoder();

export async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function sign(key, value) {
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function verify(key, value, signature) {
  if (!/^[a-f0-9]{64}$/.test(signature || '')) return false;
  const bytes = Uint8Array.from(signature.match(/../g), byte => Number.parseInt(byte, 16));
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(value));
}

export function proxyMessage({ time, origin, ip, method, path }) {
  return JSON.stringify(['td-support-v1', time, origin, ip, method, path]);
}
