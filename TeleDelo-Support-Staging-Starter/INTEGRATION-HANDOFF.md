# TeleDelo Help Center → existing TeleDelo backend
## Instructions for Angel and the coding AI integrating this project

**This is a source-code handoff, not a finished backend merge.** Preserve the functioning main TeleDelo application, its actual user records, payment/subscription rules, phone system, and sessions. Merge **only after reviewing the current main backend**; do not assume old prototype routes are still authoritative.

## Intended finished customer experience

- An existing eligible **paid TeleDelo user signs in once** on the main TeleDelo website.
- The **same login** grants access to `/help/` and `/help/requests/`; there is **no second Help Center magic-link login** in production.
- Help Center offers guides, optional AI search, related articles, Yes/No AI feedback, and a human-support ticket form.
- Tickets/replies are tied to an **immutable user ID and authorized business ID**. An owner/staff member sees only business tickets they are allowed to see.
- Staff managing tickets access `/help/admin/` through **Cloudflare Access**, independent of customer accounts.
- Development can continue on the separate Cloudflare staging Worker without exposing it to paying customers.

## Files to read first

1. `SUBSCRIBER-SUPPORT-INTEGRATION.md`: proposed entitlement API and phased authorization migration.
2. `src/subscriber-entitlements.mjs`: existing fail-closed entitlement response validation and HTTPS adapter (currently used by **AI only** in subscriber mode).
3. `src/worker.mjs`: support HTTP routes, D1 tickets, separate magic-link auth, Cloudflare Access protection of staff routes.
4. `src/support-ai-handler.mjs`, `src/support-ai-policy.mjs`, `src/support-knowledge.mjs`: guarded AI, no account inspection, draft knowledge, and feedback.
5. `public/help/`: full customer Help Center, requests portal, and staff dashboard.
6. `migrations/0001_tickets.sql` and `0002_ai_answer_feedback.sql`: independent support D1 schema.
7. `tests/`: existing regression tests and security expectations.

## Main-backend work — implement in this order

### 1. Find actual login, tenants and subscriptions

Inspect the latest TeleDelo backend and document:
- Session cookie name, domain, Secure/HttpOnly/SameSite/Path flags, expiration and login/logout flow.
- Stable user ID and verified primary email; owner/staff roles and business membership; one-user/multiple-business behavior.
- Authoritative billing/subscription status; definition of **eligible paid support** including trials, grace periods, delinquency and cancellations.
- Existing production origins and routing for `teledelo.com`, `www.teledelo.com`, API domain, and `/help/*`.

**Important:** a cookie for `teledelo.com` will NOT automatically reach the current `*.workers.dev` staging hostname. For production, proxy or route `/help/*` from the same trusted domain, OR mint a short-lived, audience-limited server-signed support assertion. Do not expose session tokens to JavaScript, accept browser-claimed account IDs, or disable SameSite protections.

### 2. Add the read-only entitlement contract

Proposed `GET https://teledelo.com/auth/support/entitlements`, using the **real backend's own verified session** (NOT a simulated email/JSON request). Return `Cache-Control: no-store`:
- HTTP 401: no authenticated session.
- HTTP 403: signed in but no eligible active paid business.
- HTTP 200 JSON:

```json
{
  "user": {
    "id": "stable-internal-user-id",
    "email": "verified@example.com",
    "email_verified": true
  },
  "businesses": [
    {
      "id": "stable-business-id",
      "name": "Example HVAC",
      "subscription_status": "active",
      "support_eligible": true
    }
  ]
}
```

**Backend must calculate membership AND paid entitlement** on every check from authoritative records. If the real architecture is incompatible with the proposed endpoint/path, adapt the support Worker with an equally secure, reviewed server-side identity interface. Do not assume the interface already exists.

### 3. Make *all* customer ticket routes business-scoped BEFORE any production cutover

Current ticket list/detail/reply routes still rely on the separate verified-email staging login. **Do not simply set `SUPPORT_AUTH_MODE=subscriber` and call this integration done**.

- Review schema migration for `tickets.customer_user_id`, `tickets.customer_business_id` and necessary indexed composite keys.
- Verify the selected business belongs to the authenticated user with eligible membership on *every* read/write, including ticket list, detail, reply, create, and any attachment endpoints.
- Email is for notifications only; never use an email-address match as authorization.
- Require explicit business selection when the account has multiple eligible businesses, and re-validate each request.
- Define whether additional business staff can see all tickets for their company or only those they personally created.
- Preserve existing ticket history only with explicit, verifiable mappings; do not import dummy staging tickets into production.
- Keep staff-side Cloudflare Access checks on `/help/admin/*`.
- Add test cases for cross-business access and expired/revoked memberships, including stale tabs.

### 4. Connect the frontend to the one TeleDelo login

- `public/help/index.html`: retain same styling and inline Ask AI interface.
- `public/help/requests/`: replace the separate email-link sign-in with session-aware entry to existing account login (or a safe `/login?next=/help/requests/` redirect).
- Show selected business name and contact email from the verified backend where appropriate; never let a form's email/business field override authenticated identity.
- Convert any unauthenticated/help form to a guarded subscriber form before dropping Turnstile. Keep rate limits, origin/CSRF protection and abuse controls.
- Human handoff must **not submit a ticket automatically**; it prefills a draft for customer approval.
- Allow support escalation if AI is unavailable, and do not let AI change billing/settings or view call transcripts.

### 5. Deploy with safe routing

- Keep staging as `teledelo-support-staging.yashsunderraj.workers.dev` with `SUPPORT_AUTH_MODE=staging`, Cloudflare D1 staging, and a separate `STAGING_TEST_EMAILS` allowlist.
- Deploy the production integration only after a distinct production D1/database, approvals, domain routing and keys are ready. Avoid pointing production at the staging DB.
- Avoid hijacking existing `/dashboard`, `/api`, login, or phone/call routes. Ensure `/help/api/ai/ask`, `/help/api/ai/feedback`, `/help/api/tickets`, `/help/admin/api/*`, and static assets all resolve correctly.
- Keep `STAFF_EMAILS` for **staff Cloudflare Access**, never add ordinary beta testers there. `STAGING_TEST_EMAILS` grants only temporary support-testing access.
- Do not merge uncommitted local `wrangler.jsonc`, `.dev.vars`, tokens, Cloudflare credentials, production IDs or customer data.

## Mandatory acceptance tests

1. Unauthenticated user: 401 or safe login redirect; no ticket, AI or feedback access.
2. Active paid user: can ask AI, rate only own answers, submit/view/reply to own permitted business tickets.
3. Other business user with a guessed ticket ID: 403/404; zero data leaked.
4. Signed-in user whose subscription is canceled or ineligible: denied according to agreed policy, with appropriate support/billing path.
5. Same email with multiple businesses: switching businesses does NOT reveal unauthorized tickets.
6. Employee with revoked business membership: loses access immediately on subsequent requests.
7. Main auth backend outage or unexpected redirect: fail closed, no spoofable fallback.
8. Cloudflare Access-protected staff dashboard: regular tester cannot enter staff API or read aggregated metrics without staff authorization.
9. AI question/feedback rate limits, 30-day retention, response disclosures, and human escalation continue working.
10. Test update/rollback and verify main dashboard/call handling remains unaffected.

## How to hand to Angel's coding assistant

Give the AI **this file plus the complete handoff ZIP**, then say:

> Integrate the included TeleDelo Help Center into the current TeleDelo backend, reusing its existing authenticated session and authoritative paid-subscription/business membership checks. First inspect the live source tree and summarize your plan and current auth/tenant schema. Implement an entitlement adapter and business-scoped ticket authorization before switching any production routes. Keep Cloudflare Access for the staff dashboard, existing support design, AI and feedback, and staging isolated. Do not invent missing backend endpoints or hardcode emails as paying subscribers. Provide migration scripts, tests, required environment variables, and a rollback plan. Do not deploy production without explicit approval.

**Nothing in this handoff authorizes a production deploy.**
