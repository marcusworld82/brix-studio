# BRIX: user-owned Higgsfield API access

Confirmed product requirement, 2026-10-13. This describes the requested architecture, not completed implementation.

## User flow

Email sign-in -> connect Higgsfield API credentials -> choose a model -> generate using that user's Higgsfield API balance.

No Higgsfield subscription sign-in is part of this flow. The email account identifies the BRIX user. The API connection authorizes generation on that user's provider account.

## What the shared services do

- MongoDB stores BRIX accounts, login sessions, connected-key records, and generation history. Users do not need MongoDB accounts. The local database must be hosted before deploying the full app.
- Media storage keeps reference uploads and saved outputs. Users do not need separate storage accounts. Persistent storage is a BRIX service, separate from each user's generation API balance.
- Resend sends email login links. The connected test sender currently reaches only the owner's Resend account email. Other recipients require a verified sending domain.

## Required code changes

The current app is an owner-funded credit studio. It is not yet a user-key studio.

- Add an authenticated connection page and server actions to save, replace, inspect masked status, and remove a user's connection.
- Encrypt API credentials on the server. Never return the raw credentials to the browser, other users, public pages, or logs.
- Scope each connection to the authenticated user. A missing connection must stop generation, never fall back to the owner's key.
- Route generation submission, estimate, uploads, cancellation, status checks, and reconciliation through the correct user connection.
- Preserve which connection submitted an in-flight job so reconnecting a different provider account does not strand or misroute it.
- Stop charging BRIX generation credits in user-key mode. Show provider cost estimates where available. Any separate fee for BRIX access is a different product decision and is not assumed here.
- Update account controls, pricing text, generation errors, and tests to match user-key access.

## Existing code touchpoints

- `lib/higgsfield/client.ts`: shared environment-key client.
- `lib/generations/submit.ts`: price guard, BRIX credit debit, and shared-key submission.
- `lib/uploads.ts`: shared-key upload tickets.
- `lib/generations/{finalize,reconcile,cancel}.ts`: shared-key lifecycle operations.
- `lib/db/collections.ts`: account and generation records.
- `app/(app)/account/page.tsx` and `components/site/top-nav.tsx`: credit-based account interface.

## Release boundaries

Do not publish this as a working user-key studio until credential isolation and the full lifecycle are implemented and tested, hosted database and media storage are connected, and email sign-in works for intended recipients. Do not represent a successful owner-only test email as public email delivery.
