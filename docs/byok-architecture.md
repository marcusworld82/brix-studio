# BRIX: user-owned Higgsfield API access

Confirmed product requirement, 2026-10-13. This describes the requested architecture, not completed implementation.

## Supabase decision

Marcus selected Supabase for the database and media storage and requested a new
BRIX project in the LAZY MONEY WORLD organization. Do not use or modify the
existing project named kingcollins82@gmail.com's Project.

The migration in `supabase/migrations/202610130001_brix_byok.sql` and connection
helpers in `lib/supabase/` are prepared but not activated. The app still uses
its legacy backend. Supabase project creation is awaiting dashboard sign-in;
the connector's advertised project cost check is unavailable. Do not claim a
completed migration or public deployment until the real project is configured,
the app's auth and data paths are migrated, and end-to-end checks pass.

## User flow

Email sign-in -> connect Higgsfield API credentials -> choose a model -> generate using that user's Higgsfield API balance.

No Higgsfield subscription sign-in is part of this flow. The email account identifies the BRIX user. The API connection authorizes generation on that user's provider account.

## What the shared services do

- Supabase Postgres stores BRIX accounts, connected-key records, and generation history. Supabase Auth is the intended identity and session source for the new backend. Users do not need Supabase accounts.
- Supabase Storage keeps reference uploads and saved outputs in a private bucket with per-user folders. Users do not need separate storage accounts. Persistent storage is a BRIX service, separate from each user's generation API balance.
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

## Prepared security checks

- API credentials use AES-256-GCM encryption with the owner ID authenticated
  as associated data. Ciphertexts copied to another account cannot be decrypted.
- Credentials are in a private schema. Only service-role RPCs can write or read
  encrypted values; authenticated clients receive masked connection status.
- Replacing a connection archives the prior version. Existing generation records
  pin the exact version used to submit so background processing stays on the
  correct provider account.
- Profiles, project lists, generation history, and upload metadata use row-level
  security. Users cannot grant themselves admin rights or write generation states.
- `tests/supabase-schema.test.ts` runs the migration in local PostgreSQL via PGlite
  with Supabase auth/storage primitives stubbed. This validates SQL and database
  access rules, not hosted email delivery or Storage HTTP behavior.
