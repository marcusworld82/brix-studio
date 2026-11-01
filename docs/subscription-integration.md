# Subscription edition integration

The `/subscription` route is a frontend demonstration. It imports no provider,
Supabase, authentication, payment, database or server generation code. Its only
persistence is versioned `brix.subscription.demo.v1` browser localStorage.
Corrupt or unsupported data restores defaults. Storage denial leaves the tab usable.
The local profile and admin controls are simulations, not security boundaries.

All plan prices, base costs, markups and credits are draft examples. Model names
are illustrative presets, not claims about a live provider's capabilities.
Existing reference media is explicitly labeled and never presented as output.
Simulating previews creates only a prompt/cost history row and deducts local demo
credits. Plan selection changes the local allowance, preserving previous usage.
No actual monthly refresh, expiry, rollover, renewal or purchase exists here.

## Screen decisions

The studio's question is: what would this prompt cost in credits? Its quote sits
beside its settings and above the simulation action. Existing BRIX blue is kept
on the primary action and usage bar. The flat dark app direction uses existing
BRIX fonts, a quiet workspace shell, a reference canvas, and computed balances.
The product-specific element is the editable cost-to-credit preview. History
starts empty and all totals are calculated from saved local preview rows.
No invented clients, revenue, sales or generated results are shown.

Design source: project DESIGN.md creative brief and taste-skill app-screen run.
The existing BRIX brand takes precedence over the drawn neutral-only palette.
A successful Jev judgment returned 0.89 for the proposed flow clearly excluding
paid production actions. This was one input to the design, not a security test.

## Future adapters

`lib/subscription/adapters.ts` defines contracts for accounts, ledger, server
quotes and payment redirects. None has an implementation. Replace the demo state
at the feature boundary instead of promoting localStorage values into real balances.
Existing personal edition per-user API credentials remain a separate ownership model.

1. Supabase Auth must verify identity on the server for every private request.
   Scope account, storage, ledger and job reads by the verified user ID. Apply RLS
   to every private table. Never accept a user ID, plan entitlement, admin flag,
   price, credit balance or quote amount from the client as authority.
2. Monthly allocation policy needs approval before launch: billing periods,
   rollover, expiry, upgrade proration, downgrade timing, delinquency and refunds.
   Create subscription, plan version, allocation bucket, credit ledger, reservation,
   provider job and payment event tables. Store integer credits, fixed-precision
   monetary amounts, immutable price versions and timestamped quote inputs.
3. Create server quotes from validated provider schemas and authenticated estimates.
   Validate asset ownership and inputs, include input hash, expiry and price version,
   then reserve credits transactionally from that quote. Concurrent requests must
   never spend below zero. Do not trust the frontend estimate or demo markup.
4. Server-only owner-funded provider keys must be encrypted or held in secret
   storage. Never include them in the client, localStorage, logs or release archive.
   Check provider balance and limits before submitting real work. Personal edition
   keys must never fall back to the owner's subscription key.
5. Verified payment webhooks are the source of subscription entitlements. Checkout
   completion in a browser cannot grant credits. Enforce unique provider event IDs
   and one allocation per subscription billing-period ID. Replay and out-of-order
   events must not double grant credits or regress an account's current state.
6. Use an idempotency key for every reserve, submit, settle, cancel and refund.
   Bind keys to verified user, job and input hash. Provider job submission needs a
   durable outbox/reconciliation path for timeouts and process crashes so retries
   do not submit twice. A unique job reference enforces exactly-once credit effects.
7. Re-fetch provider terminal status before settling. Failed, rejected, canceled
   and unsupported jobs refund the reservation once under the approved policy.
   Reconcile provider cost changes and abandoned reservations without losing user
   funds. Payment refunds and generation-credit refunds are separate ledgers.
8. Admin writes require server authorization, audit records and approved price
   versions. This public local demo is not suitable for administering live prices.
   Validate any checkout or portal redirect against allowed payment-provider origins.

## Launch checks still required

Real account email configuration and auth flows, ownership/RLS tests, simultaneous
credit spend tests, webhook signature/replay checks, rollback/refund scenarios,
provider reconciliation, billing tax/currency policies, monitoring, retention rules,
and approved customer-facing prices. Do not advertise a live subscription until
these integrations and checks exist.

## Local verification

`pnpm exec vitest run tests/subscription-demo.test.ts` checks quote arithmetic,
invalid storage, duplicate rows, overdrafts and plan changes. `pnpm typecheck`
checks integration with the existing application. Inspect `/subscription` at 320,
390, 768 and 1440 pixels, and exercise studio settings, account/session, plan panel,
admin save/discard/reset, history export and browser reload. No network request
should perform generation, billing, account creation or private data access.

Build verification (November 1, 2026): all six focused unit tests and scoped
ESLint passed. Chrome browser checks covered all five views at 320, 390, 768 and
1440 pixels with no horizontal overflow. Simulation, persisted history after
reload, JSON export, plan selection, admin save, profile save, demo sign out/in,
video settings, reset and corrupt-storage recovery passed with no page errors.
The first full typecheck encountered concurrent edits in the live catalog; the
next encountered an unfinished published-cost test import outside this feature.
The root build owner must rerun full checks after those parallel edits finish.
