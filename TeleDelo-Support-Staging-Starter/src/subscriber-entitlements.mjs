// Proposed adapter for TeleDelo's existing account/subscription backend.
// NOT connected to the live support routes. Angel must implement/review
// the server-side contract before this can authorize customer access.
// Never accept a customer email, business ID, plan, or eligibility from a browser form.

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeSubscriberEntitlements(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const user = data.user;
  if (!user || typeof user !== 'object') return null;
  const userId = String(user.id || '').trim();
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!userId || userId.length > 128 || !emailPattern.test(email) ||
      email.length > 180 || user.email_verified !== true ||
      !Array.isArray(data.businesses)) return null;

  const businesses = [];
  for (const value of data.businesses) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const id = String(value.id || '').trim();
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (!id || id.length > 128 || !name || name.length > 180) continue;
    // Both server-computed support eligibility and active paid status are required.
    if (value.support_eligible !== true || value.subscription_status !== 'active') continue;
    if (!businesses.some(b => b.id === id)) {
      businesses.push({ id, name });
    }
  }
  return { userId, email, businesses };
}

export function authorizeSubscriberBusiness(identity, businessId) {
  if (!identity || !Array.isArray(identity.businesses)) return null;
  if (typeof businessId !== 'string' || businessId.length > 128) return null;
  return identity.businesses.find(b => b.id === businessId) || null;
}

export function trustedEntitlementEndpoint(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const url = new URL(rawUrl);
    // Only the first-party TeleDelo backend may authenticate support users.
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.port || url.search || url.hash ||
        !(url.hostname === 'teledelo.com' || url.hostname.endsWith('.teledelo.com')) ||
        url.pathname !== '/auth/support/entitlements') return null;
    return url.toString();
  } catch { return null; }
}

export async function resolveSubscriberFromBackend(request, env, fetchImpl = fetch) {
  const url = trustedEntitlementEndpoint(env?.SUPPORT_ENTITLEMENTS_URL);
  if (!url) return {ok:false, reason:'not_configured'};
  const cookies = request.headers.get('cookie');
  if (!cookies) return {ok:false, reason:'sign_in_required'};
  try {
    const result = await fetchImpl(url, {
      method:'GET',
      headers: { 'accept':'application/json', 'cookie':cookies,
        'x-teledelo-support-request':'1' },
      redirect:'manual', cache:'no-store'
    });
    if (result.status === 401) return {ok:false, reason:'sign_in_required'};
    if (result.status === 403) return {ok:false, reason:'subscription_required'};
    if (result.status !== 200 ||
        !(result.headers.get('content-type') || '').includes('application/json'))
      return {ok:false, reason:'backend_unavailable'};
    const body = await result.text();
    if (body.length > 32768) return {ok:false, reason:'backend_unavailable'};
    const identity = normalizeSubscriberEntitlements(JSON.parse(body));
    if (!identity) return {ok:false, reason:'backend_invalid'};
    if (identity.businesses.length === 0) return {ok:false, reason:'subscription_required'};
    return {ok:true, identity};
  } catch {
    // Fail closed; never grant support access when eligibility cannot be checked.
    return {ok:false, reason:'backend_unavailable'};
  }
}
