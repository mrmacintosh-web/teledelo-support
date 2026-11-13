# Review checkpoints — Angel + Yash

Based on the founder's revised support plan dated November 11, 2026:

1. **For pilots, Fastmail is the primary support channel.** Publish only a real monitored address, decide who covers it, and avoid promising 24/7 support.
2. **Staging release is distinct from production approval.** A help form is not live-ready until real delivery to Fastmail and customer confirmation are tested.
3. **Scope:** first priority is public guides, a ticket form and staff queue. The existing code has more functions (customer portal, extra statuses, notifications), which are not reason to launch them early.
4. **Keep separate infrastructure.** `teledelo-support-staging` is its own Worker and D1 database. Never reuse calling product authentication, billing or its database. Shared Cloudflare DNS may still be an availability dependency.
5. **Test:** staff Access JWT validation, account ownership, Turnstile, notification failures, original homepage unaffected, static routes `/help` and `/help/*`, and a documented rollback.
6. **Production:** require both founder approvals; review privacy and retention, backup/recovery, actual email sending costs and the effect of proxying `teledelo.com` before adding any routing rule.

This starter does not create or change any Cloudflare resources. It exists for local code review and future staging deployment.
