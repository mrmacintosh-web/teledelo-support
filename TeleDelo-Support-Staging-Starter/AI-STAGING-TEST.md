# TeleDelo AI Help Center — safe staging test

This implements **real Cloudflare Workers AI answers** within the existing Help Center search UI. It does **not** connect to Angel's subscriber backend yet. Only approved staging testers who have signed in with a **verified email link** may use the AI endpoint; all other requests fail closed.

## Where it lives

- The single existing Help Center page: `/help/`
- The existing customer login: `/help/requests/`
- The existing support Worker: `POST /help/api/ai/ask`
- Approved troubleshooting guidance in `src/support-knowledge.mjs` (review draft only; do not treat as approved production knowledge)
- Cloudflare Workers AI binding `AI`, using `@cf/google/gemma-4-26b-a4b-it`
- Human escalation uses the existing ticket form (ticket is not created without submission)

## Configure AI for **staging only**, after review

In Codespaces, save your existing local `wrangler.jsonc` settings. It contains the staging D1 UUID, Cloudflare Access settings, email sender, and Turnstile site key; do **not** replace it with the GitHub placeholder file.

Switch to branch `feature/subscriber-support-ai-foundation`:

```bash
cd /workspaces/teledelo-support/TeleDelo-Support-Staging-Starter
git status --short
git fetch origin
git switch feature/subscriber-support-ai-foundation
```

In your **local existing** `wrangler.jsonc`, add a root-level Workers AI binding (not inside `vars`):

```json
"ai": { "binding": "AI", "remote": true }
```

Under the existing `"vars"` object add:

```json
"SUPPORT_AUTH_MODE": "staging",
"SUPPORT_AI_ENABLED": "true"
```

Keep `"ENVIRONMENT": "staging"`, `"STAFF_EMAILS"`, `"PUBLIC_ORIGIN"`, Cloudflare Access, D1, Email Sending and existing Turnstile settings unchanged. No model API key is necessary: Cloudflare uses the account binding. Do **not** add a live `teledelo.com` route.

```bash
npm test
npm run verify:staging
npm run db:staging   # Applies migration 0002_ai_answer_feedback.sql to staging D1
npm run deploy:staging
```

## Test the real AI

1. Open `https://teledelo-support-staging.yashsunderraj.workers.dev/help/requests/`.
2. Sign in with an email included exactly in the staging `STAFF_EMAILS` list (receive email link, then complete login).
3. Open `https://teledelo-support-staging.yashsunderraj.workers.dev/help/` **in the same browser session**.
4. Enter `My calls aren't coming through` in the existing large search bar, then press **Ask AI**.
5. Confirm that you get the AI-generated answer below the search bar. Try the **Related help guides** buttons; they must open existing TeleDelo guides, not external AI-provided links.
6. Select **Yes** or **No** under **Was this answer helpful?** and confirm the thank-you message. One answer can only be rated once; the D1 table stores only an answer ID, salted verified-user hash, rating and timestamps, never the question or AI text.
7. Use **Talk to our team** to open a draft ticket with the question and best-matched category already selected. Verify that the ticket is **not** submitted until you explicitly fill out and send the form.
8. Try again in a private browser window (without signing in). AI must return **401**. A signed-in address not on `STAFF_EMAILS` must return **403**. Do not attempt to use an actual paying customer's account for staging.

## Precautions and expenses

- AI responses are generated from **draft** general help guides and may be wrong. Angel must approve product facts before a public beta.
- Don't put real customer details, call recordings, private billing information, passwords, or payment-card numbers into tests.
- AI requests are limited to 20 per approved tester per rolling 24 hours in the existing D1 throttle table. This is a staging limit, not a substitute for a production-wide cost budget.
- Helpful/unhelpful votes are linked to random per-answer IDs and a salted user hash. Records older than 30 days are deleted by the existing Worker cron job. Voting requires migration `0002_ai_answer_feedback.sql`; without it, the AI still answers but the feedback buttons do not display.
- Workers AI usage is billed separately from the Workers Paid base subscription, subject to Cloudflare's daily free allocation and model prices.
- If you need to stop AI without rolling back the entire site, set `"SUPPORT_AI_ENABLED": "false"` and redeploy.
- Once Angel confirms production account/session/subscription architecture, replace `SUPPORT_AUTH_MODE=staging` with the reviewed `subscriber` integration. **Do not deploy subscriber mode until all ticket APIs are scoped by trusted business membership.**

## Blockers to production

Authoritative paid-subscription checks from the existing TeleDelo backend, per-business D1 ownership, approved AI knowledge base, privacy/consent, global budgets and abuse protection, and a reviewed `teledelo.com/help` route that does not overwrite the main app.
