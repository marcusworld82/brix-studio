# BRIX corrected edition handover

Canonical checkout: ~/Marcus/40 PRODUCTS/BRIX/studio. Development branch: feat/brix-subscription-correction. November1 correction replaces the rejected separate subscription demo with the same complete BRIX studio. The personal pricing page no longer includes the Provider pricing link.

Personal: BRIX_EDITION=personal, APP_BACKEND=supabase. Users save their own Higgsfield and OpenRouter keys in Account. Subscription: BRIX_EDITION=subscription, APP_BACKEND=supabase. Users see studio credits. Only the owner allowlisted email can use Admin provider keys and model price settings. Both editions share the same UI and private media infrastructure. Stripe key placeholder is owner-only and unconnected as requested.

Read docs/personal-edition-setup.md and docs/subscription-integration.md for complete setup. Original GitHub plan amounts are unchanged. No provider-specific unlimited or free promotions are promised by BRIX.

## Database and deployment

Apply all migrations through 202611010003_platform_connections in order in the intended BRIX project. New private tables and service RPCs are unavailable to browser roles. Supabase Auth needs redirect origins for each deployment. Do not change existing account passwords or reset the owner. Reuse verified email/password authentication.

Build with pnpm build; client-secret scan is part of the command. Run pnpm exec vitest run --maxWorkers=2 on machines running other apps to avoid database-test startup resource contention. Run pnpm typecheck and pnpm lint. Review actual phone and desktop pages.

Export: pnpm editions:export --out ../deliveries/2026-11-01-corrected. Archives include source, public assets, edition env examples, migrations, guides and file hashes. They exclude env values, .git, .vercel, runtime uploads, node_modules, test fixtures, private notes and deployment identifiers. Each customer needs its own backend/sender configuration once; no owner keys are shipped.

## Known operation boundaries

Unknown prices stay unavailable. Provider maximum discounts are not account entitlements. Higgsfield API wallet access is still unavailable. OpenRouter final usage cost is distinct from an estimated total. GPT input-dependent configurations may expose only a verified output cost range rather than a total.

Never automatically retry a paid provider POST after an uncertain response. Review provider history for pending provider_review rows. Definitive failure and cancellation refunds are idempotent. Terminal settlement retries do not call providers. Stripe refunds create owner review flags rather than silently removing already-used credits.

Stripe activation, real card payments and paid-generation acceptance tests remain deferred to explicit owner setup/authorization. This delivery does not claim those live transactions were exercised.

Personal OpenRouter token-priced models can be submitted only after per-request usage billing consent. The server binds that consent to the current provider pricing fingerprint and exact inputs, and rechecks before the paid POST. The displayed output-only range is not called a total. Subscription mode still requires a numeric studio credit quote. No such consent was exercised against a real provider during testing.
