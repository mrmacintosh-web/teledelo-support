# TeleDelo subscriber-only Help Center + optional AI — integration proposal

**Status:** Review branch only. Not deployed or connected to Angel's calling/auth/billing backend.
**Owner:** Help Center integration and UX; Angel approves the main-backend contract.
**Existing staging Worker:** Keep its current Cloudflare Access admin auth, D1, email, Turnstile, and customer email-link flow until the new path passes tests.

## 1. What changes for paying customers?

- Customer signs in once with the **existing TeleDelo account** (no extra Help Center password or email-code login).
- Main backend confirms the authenticated user belongs to a business **currently entitled to subscriber support**.
- Support Worker receives a **server-verified user ID, verified email, permitted business IDs, and display names**. It does not decide subscription status from client input or trust a browser's claims.
- Customers only see tickets belonging to their selected authorized business. Team members with the appropriate business membership may share a business's tickets, according to the authorization policy Angel approves.
- Staff dashboard continues to use **Cloudflare Access**, separate from customer sign-in.
- New Help Center choice: **Ask TeleDelo AI** (optional, clear disclosure) or **Contact Support** (human ticket), with a way to contact a person at any point.

### Do not just remove CAPTCHA

Turnstile can be removed from customer ticket and login forms *after* subscriber-only server-side authentication and authorization are live and tested. Continue to protect every mutation and AI endpoint with per-user / per-business / per-IP rate limits, budgets, abuse monitoring, CSRF protection, request size limits, and a way to re-enable challenge protection. Keep Turnstile on public/unauthenticated surfaces as appropriate. The current staging implementation still requires Turnstile and should not be altered during this review.

## 2. Proposed main backend contract (Angel's part)

A **read-only endpoint** at:

`GET https://teledelo.com/auth/support/entitlements`

It must authenticate the browser's existing **HttpOnly, Secure, Path=/ session cookie**, check business membership and subscription using the backend's own database/billing records, and return `Cache-Control: no-store`.

**401** if the user is not signed in; **403** if the user is signed in but has no eligible active paid business; **200** with the following strict data contract if signed in:

```json
{
  "user": {
    "id": "stable-internal-user-id",
    "email": "verified@example.com",
    "email_verified": true
  },
  "businesses": [
    {
      "id": "stable-internal-business-id",
      "name": "Example HVAC",
      "subscription_status": "active",
      "support_eligible": true
    }
  ]
}
```

The backend—not support code—must compute `support_eligible` from authoritative subscription and membership state. An `active` status AND the explicit boolean `support_eligible: true` are required. Do not send password hashes, payment details, call transcripts, session IDs, API keys, or other unnecessary account information.

A starter adapter is supplied in `src/subscriber-entitlements.mjs`: it forwards the existing browser cookie **only to an explicitly configured first-party HTTPS endpoint** and validates the response; it rejects unauthenticated, invalid, disabled, or failed responses. This is **not invoked by the current Worker**. It is a contract proposal, not a completed integration.

**Questions Angel needs to settle before enabling:**

1. Where is the actual authentication backend deployed? Is the session cookie scoped to `teledelo.com` with `Path=/`, and can it be verified by `/auth/support/entitlements`?
2. Is the main backend able to expose the endpoint above without intercepting the help Worker route? It must not redirect to an HTML login page for API calls.
3. What are the rules for multiple businesses, additional staff members, trials, billing grace periods, canceled plans, and support-history access after cancellation?
4. Confirm the authenticated user/account ID and business ID are stable and immutable.
5. Which document/knowledge-base entries are approved to show to an AI assistant, and how should human escalation be routed/monitored?
6. Which outbound support email address is monitored and when? Confirm support reply/retention policy.

The existing demo frontend calls `/auth/login` and `/auth/me`, but those calls **do not demonstrate paid subscription authorization**. The real main backend is not available in the connected GitHub repositories, so it has not been modified.

## 3. Customer-scoped D1 / session changes (integration stage)

**Before switching auth mode**, add a reviewed D1 migration with immutable `customer_user_id` and `customer_business_id` on tickets. Keep email as contact metadata, not the security boundary. Every customer ticket list, detail, reply, and AI call must obtain identity from the verified backend and enforce selected business membership on the server. Do not let someone view another business's ticket by guessing its reference. Disable existing public email magic-link sign-in when production subscriber auth is active (but leave it available for isolated staging tests only until cutover). Do not migrate existing test tickets into production.

For customers with multiple eligible businesses, display a business selector and verify the chosen business ID against the fresh trusted entitlement response on **every relevant request**. Do not grant access based on a URL parameter alone.

## 4. AI support — proposed opt-in experience

**Search bar design (now implemented in this review branch):**
- Keep the existing `How can we help?` headline and the same large search field.
- Typing continues to filter ordinary help-guide cards; pressing **Enter** or **Ask AI** sends the question to `POST /help/api/ai/ask`.
- The AI answer appears **under the existing search bar** as concise, readable suggested steps, with **Contact support** and **Ask another question** actions. Human contact pre-fills the customer's question for review; it never creates a ticket without submission.
- The user sees an AI disclosure, privacy warning, and clear error fallback. Answer rendering uses text, not injected HTML.
- The production endpoint stays disabled until `SUPPORT_AUTH_MODE=subscriber`, `SUPPORT_AI_ENABLED=true`, a valid first-party `SUPPORT_ENTITLEMENTS_URL`, `RATE_LIMIT_SALT`, D1, and a Workers AI binding named `AI` are configured. **Do not enable production subscriber mode until Angel's backend review, ticket scoping, and product knowledge approval.** An isolated **staging-only** test mode is now also available to approved staff who sign in through the existing verified email-link session; see `AI-STAGING-TEST.md`.
- Current knowledge is a **draft subset of the Help Center guides**, in `src/support-knowledge.mjs`. Angel must approve and maintain that content before launch; the AI cannot verify real-time account data.
- The server verifies the browser's existing login and an eligible paid business before inference, uses a consent flag, applies 20-questions-per-24-hours per verified user, and returns a friendly fallback when the model is unavailable.
- For isolated staging testing, see `AI-STAGING-TEST.md` and bind `"ai":{"binding":"AI","remote":true}`. It calls `@cf/google/gemma-4-26b-a4b-it` (a currently supported model) through Workers AI. Production should use a separately reviewed binding and keep AI disabled until auth and ticket scoping pass. Workers AI inference has separate pricing/limits.

- Show **Ask TeleDelo AI** / **Contact Support**. AI must be labeled as AI.
- Start with **approved troubleshooting guides only** (read-only), not live calls, voicemail, recordings, invoices, account settings, or credentials.
- If unsure or customer wants a person, clearly offer **Contact Support**; let the user transfer their question into a human ticket with review/consent. Do not pretend a ticket was created until the ticket API confirms success.
- Do not automatically close, resolve, or send a human ticket to AI. Do not let AI issue refunds, change business settings, modify phone routing, or claim to have checked the account.
- Ask explicit opt-in before passing a customer's message to the AI service; publish the relevant privacy and data retention disclosures. Redact/avoid unnecessary sensitive data. Treat help-document content as untrusted reference text.
- Launch with hard per-user limits, short input lengths, approved-document grounding, escalation thresholds, monitoring, cost alerts, and a feature kill switch.
- `src/support-ai-policy.mjs` supplies a **disabled-by-default policy**. It has no model binding, no live AI endpoint, and no customer UI yet.

**Suggested implementation after auth approval:** Cloudflare Workers AI via `env.AI` (or a provider selected by the team). Usage may incur inference charges beyond the $5/month Workers base plan. Model selection and approved knowledge must be reviewed; do not ship default hallucination-prone general chat.

## 5. Staging, rollout and rollback

1. Angel agrees on eligibility contract and first-party endpoint; verify a logged-out session returns 401 and a noneligible signed-in account returns 403.
2. Add server-side subscriber auth gate for public `/help`, `/help/requests`, API and new AI endpoint. Keep staff routes under Access; protect both direct URL and API requests.
3. Add D1 business/user scoping with tests for cross-account/cross-business access. Verify existing sample tickets do not leak by email.
4. Remove customer email-link login and customer-facing Turnstile only **in the subscriber-auth mode**; retain rate limiting and security telemetry.
5. Test the same-domain cookie/session on an approved TeleDelo staging hostname; the `workers.dev` origin cannot automatically receive `teledelo.com` cookies.
6. Add AI as an **opt-in beta** after authentication and approved knowledge tests, with a human escalation path and cost ceiling.
7. Both founders review UX, privacy, billing/cancel behavior, operational ownership, and rollback. Create separate production Worker/D1 config. Route only the approved Help Center paths without overwriting main-site routes. Keep Fastmail as operational fallback.

**Rollback:** Set feature flags off / remove new Worker route, keep existing backend auth and calling routes untouched. Do not automatically enable public support ticket forms while identity verification is broken.

## 6. Security / repository note

The connected GitHub repository is currently reported as **public** by the GitHub API, even though setup originally requested a private repository. Confirm GitHub → Settings → General → Danger Zone → Change repository visibility before storing anything sensitive. Never commit support API keys, Cloudflare secrets, session cookies, customer data, or test email login links.
