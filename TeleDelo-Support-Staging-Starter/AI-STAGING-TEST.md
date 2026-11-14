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

### Add a second tester WITHOUT adding staff privileges

Edit your existing local `wrangler.jsonc`, inside the existing `"vars"` object (not below its closing bracket), and add:

```json
"STAGING_TEST_EMAILS": "angel@example.com,second-tester@example.com"
```

Use real addresses for your testers, and put a comma after the previous property. **Do not replace the `STAFF_EMAILS` value or add testing-only people to it.** They must not gain staff access simply to test the customer portal. `STAGING_TEST_EMAILS` and `STAFF_EMAILS` both permit using the staging customer's email-link sign-in and support forms; only `STAFF_EMAILS` can pass the staff backend allowlist (which also requires Cloudflare Access).

Check the config's JSON syntax before deployment:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('wrangler.jsonc','utf8')); console.log('valid JSON')"
npm test && npm run deploy:staging
```

The new tester visits `/help/requests/`, requests a sign-in link with their **own** email (and completes Turnstile), then opens `/help/` in that same browser. Never send them your session cookie or email login link. Production does not accept `STAGING_TEST_EMAILS` as proof of being a subscriber.

```bash
npm test
npm run verify:staging
npm run db:staging   # Applies migration 0002_ai_answer_feedback.sql to staging D1
npm run deploy:staging
```

## Test the real AI

1. Open `https://teledelo-support-staging.yashsunderraj.workers.dev/help/requests/`.
2. Sign in with an email included exactly in `STAFF_EMAILS` or `STAGING_TEST_EMAILS` (receive email link, then complete login).
3. Open `https://teledelo-support-staging.yashsunderraj.workers.dev/help/` **in the same browser session**.
4. Enter `My calls aren't coming through` in the existing large search bar, then press **Ask AI**.
5. Confirm that you get the AI-generated answer below the search bar. Try the **Related help guides** buttons; they must open existing TeleDelo guides, not external AI-provided links.
6. Select **Yes** or **No** under **Was this answer helpful?** and confirm the thank-you message. One answer can only be rated once; the D1 table stores only an answer ID, salted verified-user hash, rating and timestamps, never the question or AI text.
7. Use **Talk to our team** to open a draft ticket with the question and best-matched category already selected. Verify that the ticket is **not** submitted until you explicitly fill out and send the form.
8. Try again in a private browser window (without signing in). AI must return **401**. A signed-in address on neither `STAFF_EMAILS` nor `STAGING_TEST_EMAILS` must return **403**. Do not attempt to use an actual paying customer's account for staging.

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

## Staff AI feedback dashboard

After staging migration + deployment, staff can visit **`/help/admin/`** (existing Cloudflare Access protected staff inbox). The **AI feedback** section appears above Requests and shows, for the **last 30 days**:
- Helpful votes (Yes) and how many distinct users selected Yes at least once
- Not helpful votes (No) and how many distinct users selected No at least once
- Helpful rate = Yes votes / (Yes + No votes)
- Total ratings and total distinct users who submitted a rating

The same person may vote on several different AI answers, and may choose both Yes and No on different answers, so **vote counts are not headcounts**, and Yes/No distinct-user counts must not be added together. The dashboard requires the existing staff Cloudflare Access JWT, loads only aggregated counts, and reveals no individual user identity or question.

Use **Refresh** to update the statistics without leaving the ticket inbox. Before the `0002_ai_answer_feedback.sql` migration is applied, the section reports feedback is unavailable rather than displaying misleading zeroes.

Direct D1 diagnostic (staging only, for authorized developers):

```bash
npx wrangler d1 execute teledelo-support-staging --remote --command "SELECT rating, COUNT(*) AS votes, COUNT(DISTINCT user_key_hash) AS distinct_voters FROM ai_answer_feedback WHERE rating IS NOT NULL AND rated_at >= unixepoch() - 30*86400 GROUP BY rating"
```

## Export complete local source for Angel's coding assistant

After pulling the latest review branch, run:

```bash
node scripts/export-handoff.mjs
```

The script writes `TeleDelo-Support-Integration-Handoff.zip` to the **repository root** (one directory above this starter folder). Download it using Codespaces Explorer. It archives **only committed GitHub source files**, including `INTEGRATION-HANDOFF.md`, all Help Center UI, Worker/D1 code, migrations and tests. It does **not** include your locally modified `wrangler.jsonc`, local secrets, `node_modules` or D1 data.

Tell Angel's AI to begin with `INTEGRATION-HANDOFF.md` and to inspect the latest **main TeleDelo backend**, not to assume current Help Center email sign-in is production-ready.
