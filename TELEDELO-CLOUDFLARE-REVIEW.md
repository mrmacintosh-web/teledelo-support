# TeleDelo Cloudflare and Vercel integration

This branch extends the existing TeleDelo Support Worker and its D1 binding. The Help Center, support tickets, signed support sessions, staff inbox, AI staging gate, Cloudflare Email Sending binding, D1 email outbox, and five-minute cron are carried forward. The new pages reuse the existing TeleDelo marketing assets and calculator. The supplied demo landing page already had a sample call, and now also has a demo request form. The original site attachment is a local visual reference.

| Public path | Form/API | D1 |
|---|---|---|
| `/help` | Existing support APIs | Existing `tickets` and `ticket_messages` |
| `/waitlist` | `POST /waitlist/api` | `waitlist_entries` |
| `/demo` | `POST /demo/api` | `demo_requests` |
| `/privacy-request` | `POST /privacy-request/api` and mailbox proof under `/privacy-request/verify` | `privacy_requests` |
| `/calculator` | Static with three waitlist links | No writes |

The waitlist and calculator use Lite at $69/month with 250 minutes and business-hours coverage, TeleDelo at $199/month with 1,000 minutes and business-hours plus after-hours coverage, and Pro at $499/month with one 3,000-minute pool shared by up to three businesses. The calculator includes only the confirmed $0.29/minute standard overage when entered. Edit the marketing catalog in the primary website first, then sync the Worker snapshot and static markup. The branch test checks the displayed prices and waitlist allowances.

## Email routing

| Form | Staff recipient | Department notice |
|---|---|---|
| Support | Existing `STAFF_NOTIFY_EMAIL`, configured in staging as `support@teledelo.com` | Existing support template |
| Privacy | `privacy@teledelo.com` | **TeleDelo — New Privacy Request** with reference, request type, UTC submission time, and initial review status |
| Waitlist | `hello@teledelo.com` | **TeleDelo — New Waitlist Registration** with business name, selected plan, UTC submission time, and reference |
| Demo | `hello@teledelo.com`, plus approved addresses configured in `DEMO_FOUNDER_EMAILS` | **TeleDelo — New Demo Request** with business name, selected demonstration topic, UTC submission time, and reference |

Contact information, private notes, and optional demo notes stay in restricted D1 storage. Applicant messages reuse the Cloudflare binding and branded HTML and plain text. The privacy receipt includes a mailbox verification link. Waitlist receipts are transactional communications for the requested waitlist.

The D1 transaction stores the request and queues its emails together. Waitlist repeats are deduplicated by email, and demo and privacy retries use normalized request fingerprints. A unique keyed outbox record and atomic send claims prevent duplicate email from repeated submissions. The existing dispatcher retries transient failures, and retains failed rows for authorized operational follow-up. If the provider accepts the message immediately before a crash or fails ambiguously, a retry can still deliver a second message. The binding offers no provider-level deduplication guarantee.

## Configure the existing Worker

Use the verified environment's existing bindings and settings as the base. The checked-in Wrangler configuration has a placeholder D1 UUID. Do not deploy that starter config verbatim against an existing environment. Preserve active D1, AI, Email Sending, Assets, Turnstile, Cloudflare Access, secret bindings, and cron. Snapshot the active Worker version ID first.

| Setting | Purpose |
|---|---|
| `INTAKE_ENABLED` | Starts disabled. Enable only after access, policy, email, and retention are configured. |
| `INTAKE_PRIVACY_POLICY_URL` | Approved HTTPS Privacy Policy URL. Required for waitlist consent. Add a link from the approved policy to `/privacy-request`. The draft remains outside the deployable assets. |
| `WAITLIST_RETENTION_DAYS`, `DEMO_RETENTION_DAYS`, `PRIVACY_RETENTION_DAYS` | Owner-approved retention intervals. Required to enable each intake. Scheduled cleanup removes expired closed intake rows, their audit rows, and associated outbox records. Active cases require an authorized disposition decision. Align D1 backups and Time Travel with approved handling. |
| `INTAKE_ACCESS_AUD`, `INTAKE_STAFF_EMAILS` | Separate Access audience and exact email allowlist for the waitlist and demo inboxes. |
| `PRIVACY_ACCESS_AUD`, `PRIVACY_STAFF_EMAILS` | Distinct Access audience and privacy-only reviewers. The general Help Center inbox and its staff audience do not grant privacy access. |
| `INTAKE_STAFF_ORIGIN`, `SUPPORT_STAFF_ORIGIN` | HTTPS hosts serving the respective Access-protected staff paths. Set these before proxying public traffic. |
| `PRIVACY_VERIFY_SECRET` | Worker-only random secret of at least 32 characters. Rotating it invalidates outstanding links. |
| `SUPPORT_PUBLIC_ORIGIN`, `SUPPORT_PROXY_SECRET` | Match the environment-specific Vercel gateway origin and shared secret. |
| `INTAKE_STAGING_MAILBOX` | Approved staging sink for departmental notifications. The existing `STAGING_TEST_EMAILS` and `STAFF_EMAILS` continue to limit fictional submitters. |
| `INTAKE_STAGING_NOTIFICATION_MODE` | Default sends new staff notices to the staging sink. Set to `departments` for the approved inbox acceptance test only. Receipts go to approved test addresses. |
| `DEMO_FOUNDER_EMAILS` | Comma-separated approved demo recipients. Keep unset until both addresses are confirmed. |

Continue to use the current approved `EMAIL` binding, `FROM_EMAIL`, Turnstile site key and secret, and rate-limit salt. Restrict Cloudflare dashboard/D1 access to authorized operators. Give separate Access policies path coverage for `/help/admin/intake/privacy*` and the waitlist plus demo paths, including their APIs, on an approved Access hostname. Keep the existing support Access application and audience in place. Confirm the more specific path receives the appropriate Access JWT.

Staff paths are `/help/admin/intake/privacy`, `/help/admin/intake/waitlist`, and `/help/admin/intake/demo`. Privacy request verification checks possession of a short-lived, request-specific mailbox link. The confirmation screen requires an explicit submit, and the link token stays in the URL fragment until that action. A privacy reviewer must complete TeleDelo's approved proportionate identity-verification procedure before recording that check. Fulfillment is a staff status record created after approved handling. The application never discloses, corrects, or deletes underlying customer information on form submission. Outstanding mailbox links can be reissued by authorized privacy staff. Define the approved identity process and retention policy before giving anyone live access.

## Run and release

From `TeleDelo-Support-Staging-Starter` with Node 22+:

```sh
npm ci
npm test
npm run db:local
npx wrangler dev --local --port 8790
```

For visual review use `http://localhost:8790/help/`, `/waitlist?plan=pro`, `/demo`, `/privacy-request`, and `/calculator`. The checked-in configuration keeps submissions disabled. The integration suite uses local Miniflare D1 and a simulated provider for fictional requests, including outage and retry.

On staging use a private config copied from the existing staging deployment, with the actual staging D1 ID, existing public origin, and all of the live bindings carried forward. Apply `0003_public_intake.sql` to that staging DB through `wrangler d1 migrations apply DB --remote --config <private-staging-config>`. Confirm target and migration history before running. The file adds tables and indexes and does not update ticket data. Upload a version with intake disabled, smoke-test public/protected paths, and confirm the unchanged support settings and cron before enabling the new forms.

Use the [Vercel gateway guide](vercel-integration/README.md) for the fixed preview alias. To test real email, send one fictional request of each kind with approved test email addresses and use a reviewer with access to each approved recipient inbox. First use the staging sink and then coordinate the short departmental acceptance-test window. Confirm each applicant receipt, the departmental subject and payload, D1 row and outbox status, and the absence of duplicate mail. Keep receipt provider acceptance and actual mailbox receipt separate in evidence.

For rollback disable `INTAKE_ENABLED` and return the existing staging Worker to its verified prior version. The additive tables can stay in place. Revert the Vercel deployment independently and coordinate any outstanding staging intake notifications before rolling back to code that lacks their templates.

## Verification and staging handoff

| Check | Result |
|---|---|
| Node test suite | 46 passed, including the prior 38 support, security, and AI staging tests. |
| D1 | All three migrations applied in Wrangler locally. The new migration also applied to the existing staging DB. The three new tables and original tickets table were confirmed from staging schema metadata. |
| Local intake flow | Real local D1 with mocked Turnstile, Access certificates, and Email Sending. Verified departmental content and recipients, applicant receipts, duplicate requests, provider outage and recovery, rate limits, privacy authorization and verification, and closed-case retention. |
| Browser | Chromium checked all five pages at 320, 375, 390, 768, 1024, and 1440 px locally and on staging. Eight WCAG-tagged axe scans passed per environment on the four marketing pages at desktop and mobile widths. Tested calculator computations, overage, invalid input, reset, and plan-specific waitlist links. |
| Staging | The public pages and required tested assets returned HTTP 200. Existing support health/config was ready and an invalid support submission returned HTTP 400. Anonymous staff access went to Cloudflare Access. New intake POSTs returned HTTP 503 because collection is paused. |
| Vercel | The signed gateway was tested locally against the Worker, including same-origin POSTs, path allowlisting, and the slash handling for Help Center assets. No TeleDelo project was visible in the authorized Vercel account, so no Vercel preview or custom-domain route was deployed. |
| Live collection and delivery | Pending. The staging Worker kept the real Email Sending binding and the existing support destination. New form delivery was simulated locally. No new test mail was sent or received in real inboxes during this run. |

[Desktop and mobile contact sheet](review/contact-sheet.jpg). The Dropbox ZIP includes the full screenshots from the local Worker and the deployed staging Worker. The local contact sheet uses fictional settings and a stubbed Turnstile widget.

Staging review URL: [Existing TeleDelo Help Center staging Worker](https://teledelo-support-staging.yashsunderraj.workers.dev/help/). Public paths also include `/waitlist?plan=pro`, `/demo`, `/privacy-request`, and `/calculator`. Active staging version is `cdb5ad17-82d0-4e66-ac08-0c990174f0b2`. Its immediate rollback target is `8ff9f20f-d496-4ad3-887a-8b6d1200d723`. The active scheduled trigger remained `*/5 * * * *`.

Before enabling staging intake collection, set the approved policy URL, retention, and separate Cloudflare Access audiences and reviewer lists. Configure the approved staging sink and any authorized founder addresses. Then run the fictional submission and inbox acceptance tests. Before production cutover, apply the routing on the correct Vercel project, enroll its hostname in the approved Turnstile widget, verify the matching gateway secret and routing, and obtain production release approval. Production Worker, DNS, and customer records were outside the staging change.
