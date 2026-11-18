// Return true only for successful requests that queue notification emails.
// The D1 outbox remains the source of truth. Cron retries anything not sent.
export function shouldDispatchNotifications(request, response) {
  if (request.method !== 'POST' || !response || response.status < 200 || response.status >= 300) return false;
  const pathname = new URL(request.url).pathname.replace(/\/$/, '') || '/';
  return pathname === '/help/api/tickets' ||
    (/^\/(waitlist|demo|privacy-request)\/api$/.test(pathname) && response.status === 201) ||
    /^\/help\/admin\/intake\/privacy\/api\/PR-[\w-]{16}$/.test(pathname) ||
    /^\/help\/api\/tickets\/TD-[A-F0-9]{10}\/reply$/.test(pathname) ||
    /^\/help\/admin\/api\/tickets\/TD-[A-F0-9]{10}\/(?:reply|status)$/.test(pathname);
}
