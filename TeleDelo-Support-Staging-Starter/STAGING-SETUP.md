# TeleDelo — Staging Setup (Phase 1)

This is a standalone support application. It **does not use** the main TeleDelo backend, calling infrastructure, application login, or production database. No live domain routes are configured here.

## Scope approved for first stage

- Continue using the existing monitored **Fastmail** address for pilot support and as the published fallback. Agree between founders who monitors it during the disclosed support hours.
- Build and test the public Help Center request form **only after** successful email delivery is verified.
- Build the staff inbox on a separate, protected staging URL; test with fictional business and ticket data only.
- Defer launch of the public customer portal and production `/help` route until email ownership, isolation, and security tests pass.

## Local setup

Requirements: Node.js 22+, Cloudflare account permissions for Workers and D1, a new D1 database created specifically for this support system. **Never paste Cloudflare API tokens, app passwords or Turnstile secrets into chat.**

```bash
npm install
npm test
npx wrangler login
npx wrangler d1 create teledelo-support-staging
```

Copy the *new staging D1 database ID* returned by that command into `wrangler.jsonc` at `REPLACE_WITH_STAGING_D1_UUID`.

```bash
npm run db:local
npm run db:staging
```

At this stage you can develop locally, but ticket submission and customer login intentionally do not work until email delivery, Turnstile and `PUBLIC_ORIGIN` have been configured. This is a safety feature.

## Staging hostname and access

You can initially deploy to the staging Worker `workers.dev` URL for public page checks. Staff login should use a custom staging hostname such as `support-staging.teledelo.com` protected with a dedicated **Cloudflare Access** application. Use that exact hostname for `PUBLIC_ORIGIN` and Turnstile configuration when ready.

1. Create a staging-only Cloudflare Access application protecting `/help/admin*` on the staging hostname.
2. Add your exact founder/staff addresses to its access policy.
3. Configure `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `STAFF_EMAILS` in `wrangler.jsonc`. The Worker also checks signed Access JWTs and an allowlist.
4. Create a Turnstile widget for the staging hostname; set `TURNSTILE_SITE_KEY` (nonsecret) and store the actual key with `npx wrangler secret put TURNSTILE_SECRET`.
5. Generate a long random salt and store with `npx wrangler secret put RATE_LIMIT_SALT`.
6. Configure Cloudflare Email Sending only if available and approved. Verify the sender domain without replacing Fastmail's existing MX records. Set `FROM_EMAIL` and `STAFF_NOTIFY_EMAIL` to real configured accounts. If not available, adapt `src/email.mjs` to another transactional provider and retest. Do not simulate successful customer emails.
7. Set `PUBLIC_ORIGIN` to your real staging origin. This is used to build sign-in links.

> The current Worker includes a `send_email` binding that requires Email Sending configuration for live mail. If that feature is not available, remove/replace the binding as part of an explicitly reviewed email-provider change, not by silently disabling verification.

```bash
npm run verify:staging
npm run deploy:staging
```

The local verifier only checks configuration shape. It cannot prove email delivery, DNS, authentication, or correct Cloudflare account settings.

## Staging test checklist

- [ ] Help Center opens and works on phone and desktop.
- [ ] `/help/api/health` returns an OK from the new D1 database.
- [ ] An invalid or incomplete request is rejected.
- [ ] A valid **fictional** ticket gets a reference, D1 record, and actual confirmation email.
- [ ] The staff member receives a separate new-ticket alert.
- [ ] Staff Access denies anyone not on the approved allowlist.
- [ ] Staff can view a ticket, reply, and change status.
- [ ] Customer must verify email before seeing tickets; changing a ticket number must not reveal another customer's details.
- [ ] A used or expired sign-in link is rejected.
- [ ] Internal notes are not visible to customers.
- [ ] Retried notifications do not normally send duplicates; exceptional at-least-once delivery behavior is documented.
- [ ] Bad Turnstile tokens and excessive repeat submissions are rejected.
- [ ] Fastmail support correspondence still arrives as expected.

**No production domain changes:** the Worker deliberately has no `routes` or `custom_domain` and no access to TeleDelo's existing production D1 database.

## After Phase 1

Only after staging tests should customer self-service, notification delivery and `/help` route mapping be proposed for production review. For production, use a **new separate D1 database** and a distinct Worker/Access configuration. `wrangler.production.EXAMPLE.jsonc` is a nonactive reference and has no route settings.

Current Cloudflare references:
- https://developers.cloudflare.com/d1/configuration/environments/
- https://developers.cloudflare.com/workers/configuration/routing/routes/
- https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
