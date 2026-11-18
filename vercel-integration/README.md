# TeleDelo Vercel gateway

The existing Vercel application keeps the homepage, pricing, login, dashboard, and onboarding. The gateway forwards only public Help Center and intake paths to the existing TeleDelo Support Worker. Staff uses the existing Cloudflare Access hostname directly. The browser stays on the website hostname, including on API requests.

## Add to the TeleDelo Vercel project

1. Copy `api/support-edge.mjs` and the two `lib/support-*.mjs` modules to the corresponding directories in the actual website project.
2. Merge `vercel.routes.json` into the existing `vercel.json`. Put these exact rewrites before any catch-all or filesystem fallback. Replace older rewrites for these same paths that point at local HTML or Python-backed APIs. Remove the old Vercel waitlist and privacy function deployments once their routing has been retired so their direct URLs cannot accept submissions. Leave unrelated site, dashboard, pricing, authentication, and onboarding rules intact.
3. Set the following on a fixed staging Vercel preview domain first. Keep preview and production secrets distinct. Use Node 22 or newer.

| Variable | Value |
|---|---|
| `SUPPORT_PUBLIC_ORIGIN` | Exact browser origin, such as the fixed staging Vercel alias. Use `https://teledelo.com` only during an approved production rollout. |
| `SUPPORT_WORKER_ORIGIN` | HTTPS origin of the existing Worker. The existing public staging URL has no trailing path in this variable. Production uses its separately approved Cloudflare upstream hostname. |
| `SUPPORT_PROXY_SECRET` | A separate randomly generated secret of at least 32 characters. Store the same value securely on Vercel and the corresponding Worker. |

Set `SUPPORT_PUBLIC_ORIGIN` on the Worker to the same exact Vercel origin. Add the website hostname to the existing Turnstile widget in the appropriate environment. For a production cutover, update the Worker's `PUBLIC_ORIGIN` to the public website and configure `SUPPORT_STAFF_ORIGIN` and `INTAKE_STAFF_ORIGIN` to the separate Access-protected hostname.

The gateway signs the effective public origin, path, timestamp, and Vercel-provided client IP. The Worker uses that context for CSRF, Turnstile hostname validation, and throttling. It forwards only the existing `td_support_session` cookie for Help Center API requests. Account session cookies stay in the account application. If Angel enables subscriber-mode AI on the public domain later, review the entitlement authentication handoff with that backend before enabling it through this gateway.

Vercel should use its normal DNS records. Have Cloudflare manage DNS and use the Vercel project's verified records and HTTPS settings when the owner approves cutover. The gateway requires Vercel's platform-set `x-vercel-forwarded-for` for per-client limits. A missing address shares a conservative fallback limit. Configure the apex as canonical before enabling forms if using a second public alias. Existing direct staff paths do not pass through the gateway.

Add a footer link to `/privacy-request` in the Vercel website and the approved Privacy Policy. Consult the project-specific instructions in [the Cloudflare integration guide](../TELEDELO-CLOUDFLARE-REVIEW.md).

## Preview and rollback

On the fixed Vercel preview domain, open each public route, exercise ticket sign-in/logout, and confirm `/dashboard`, login, and onboarding use the existing Vercel app. A POST from another origin must fail and private intake records must stay under Cloudflare Access. Verify plans survive the rewrite query string. If a route fails, revert the Vercel project to its prior deployment, restore its previous routing configuration, and disable the new intake flag in the Worker independently.
