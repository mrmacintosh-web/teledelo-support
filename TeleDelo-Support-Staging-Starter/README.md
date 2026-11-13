# TeleDelo independent support — staging starter

Start with **[STAGING-SETUP.md](STAGING-SETUP.md)**. This package is configured for an isolated Cloudflare staging Worker and its own D1 database, with no production routes.

Read the staging guide before running Wrangler commands. The app includes the public Help Center, customer ticket system, and staff inbox, but **none of these are deployed or approved for real customer data yet**.

# TeleDelo Independent Support Center

**Standalone Cloudflare Workers + D1 application.** This code does not import or call TeleDelo's existing application, calling backend, billing system, dashboard session, or database.

This is a deployment-ready **implementation draft for staging and review**, not an already deployed service. The project was locally syntax-tested and its database-backed ticket flows were tested with an in-memory SQLite compatibility harness. A full Wrangler deployment and live email delivery could not be tested in this environment because npm package registry access and Cloudflare account access were unavailable.

## Contents

- `public/help/` — the approved simple Help Center, with an actual ticket submission form
- `public/help/requests/` — passwordless customer ticket portal
- `public/help/admin/` — separate staff ticket inbox
- `src/worker.mjs` — independent API, customer sessions, Cloudflare Access verification, notifications
- `src/email.mjs` — branded transactional notices, with **no dot** after TeleDelo and the slogan **“Your phone, answered.”**
- `migrations/0001_tickets.sql` — tickets, messages, sessions, email queue, throttles and audit events
- `tests/` — local integration tests

## Architecture

```
customer browser --> teledelo.com/help/* --> independent Cloudflare Worker
                                        |--> static guides & portals
                                        |--> D1 (new database)
                                        |--> Turnstile
                                        |--> Email Sending --> customer & staff inboxes
staff browser --> Cloudflare Access --> /help/admin* --> Worker verifies signed Access JWT
```

The main `teledelo.com` site continues to be served by its existing host. The independent Worker must **only** be routed to the `/help` path. A failure of the main TeleDelo backend should not stop this support system (unless common DNS/Cloudflare infrastructure fails).

## Security model

- Public help guides require no account.
- Unauthenticated ticket submissions require Turnstile and per-IP throttling. The email in a submission is **not** treated as proof of ownership.
- To read tickets, customers request a **15-minute, one-use email login link**. Clicking **Continue** on the emailed link page consumes the one-use link and establishes a random, 7-day, HttpOnly, Secure cookie. Just opening the link does not consume it, protecting against automatic email link scanners.
- Tickets are always queried by the verified email from that session. Guessing or changing a ticket number will not grant access.
- Staff pages and API live under `/help/admin*`; protect them using a Cloudflare Access application **and** signed-JWT verification inside the Worker (including on the `workers.dev` URL).
- D1 is not exposed directly to browsers; all reads and writes are done by the Worker.
- No card details, passwords, or verification codes should be put into support tickets.
- Branded email notifications are queued in D1, retried, and sent by a cron job every five minutes. Email is at-least-once: an exceptional crash after sending can cause a duplicate notice.
- Direct customer sign-in emails are sent immediately. If sending fails, the login request fails rather than falsely reporting a working link.
- State-changing APIs check the exact same-origin `Origin` header and require JSON.

### Before production, review further

Customer email-link ownership is tied to the supplied email address, not a paid TeleDelo subscription. The team should publish a privacy/retention policy, evaluate mail deliverability, consider abuse of the public form, and set alerts for cron failures. Avoid storing sensitive call transcripts or billing details in tickets by default.

