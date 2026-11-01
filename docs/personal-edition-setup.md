# Personal edition setup

The personal edition is a customer-owned studio using each user's own Higgsfield
API key. No recurring BRIX subscription fee is configured. Hosting, Supabase,
email and provider API usage remain the customer's own service costs. This is
source delivery, not a preconfigured hosted service.

## Install and select the edition

Use a supported Node.js release compatible with Next.js 16 and pnpm. Start in
the extracted `brix-personal` folder:

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
```

For a source checkout, copy `editions/personal.env.example` instead. Keep
`BRIX_EDITION=personal` and `APP_BACKEND=supabase`. The personal edition is the
default, but setting it explicitly prevents an accidental mode change.

Set the production `APP_URL` to the customer's public HTTPS origin. Never copy
another customer's `.env.local`, Supabase keys or deployment metadata.

## Configure the customer's backend once

1. Create the customer's own Supabase project. Add its project URL and public
   publishable key to `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Store its server secret only in
   `SUPABASE_SECRET_KEY` on the server.
2. Apply these migrations in order using the project's SQL editor or a reviewed
   Supabase migration workflow:
   `supabase/migrations/202610130001_brix_byok.sql`,
   `supabase/migrations/202610130002_runtime.sql`,
   `supabase/migrations/202610130003_admin_catalog.sql`.
   Apply them only to the new customer's project. Back up before later upgrades.
3. Verify the migrations created the private `brix-media` Storage bucket and its
   ownership policies. Keep it private. Users must only read their own accounts,
   connections, jobs and media through verified sessions and signed URLs.
4. Configure Supabase Auth's site URL and allowed redirect URLs for the customer's
   localhost and production origins. Keep email confirmation enabled. Verify
   signup, verification, login, recovery and logout using controlled test accounts.
   Do not treat a configuration check as proof these flows work.
5. Create a Resend key and verify the customer's sending domain. Set
   `AUTH_RESEND_KEY` and `EMAIL_FROM`, such as a sender at that verified domain.
   Confirm delivery to an intended recipient outside the owner's test mailbox.
   BRIX's password signup/recovery flow sends its prepared links through Resend.
6. Generate independent secrets. Use `openssl rand -hex 32` separately for
   `API_KEY_ENCRYPTION_SECRET`, `HF_WEBHOOK_SECRET` and `CRON_SECRET`. Store them
   in the customer's secret manager. Never put secrets in `NEXT_PUBLIC_*` values.
   Keep the encryption secret stable and securely backed up. Replacing it without
   a migration makes previously encrypted provider keys unreadable.
7. Set `HF_WEBHOOK_BASE_URL` to the customer's public HTTPS origin and make
   `/api/webhooks/higgsfield` reachable for signed provider callbacks. Deploy the
   reconciliation endpoint `/api/cron/reconcile` and configure its authenticated
   schedule using `CRON_SECRET`. `vercel.json` supplies a schedule for Vercel;
   other hosts need an equivalent scheduler. Check capacity and provider limits
   before increasing its frequency. Local callbacks need an HTTPS tunnel.
8. Set support details and, when required, `ADMIN_EMAILS`. Confirm privileged
   catalog/template changes still require the authenticated admin role. A public
   branding value is never an authorization control.

Do not set an owner-wide `HF_CREDENTIALS` value in this edition. A user saves their
complete copied Higgsfield API key through Account after logging in. It stays
encrypted on the server. A missing or invalid user key must stop generation and
must never fall back to an agency key.

## Branding

Set `NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_BRAND_INITIALS`,
`NEXT_PUBLIC_BRAND_ACCENT` and `NEXT_PUBLIC_SUPPORT_EMAIL`. The accent is a quoted
six-digit hex color in the env file. Use a short initial mark. Also set server
`SUPPORT_EMAIL` for server-side messages where applicable. Public variables are
compiled into the frontend, so rebuild after changes. Review transactional email
copy, legal pages and existing BRIX artwork separately before client launch.

## Run and check

```sh
pnpm exec tsx scripts/check-personal-setup.ts
pnpm dev
```

Open `/image` or `/video`. The catalog is served at `/api/catalog`. The setup
check only inspects local configuration presence and shape. It prints variable
names and problems, never their values. It does not test credentials, contact
services, provision anything, create accounts, send email or generate media.

For production, set the same environment values on the hosting platform and run:

```sh
pnpm build
pnpm start
```

A build includes the client-secret check. Server secrets must never appear in
client bundles. A clean build is not proof of hosted database policies, mail
configuration, webhook delivery or provider affordability.

## Catalog, quotes and upgrades

Compatible provider models and their supported fields are discovered through the
live catalog path without adding one source file per new model. Automatic refresh
must still validate provider schemas and reject unsupported inputs. Preserve the
last verified catalog on a feed outage, show stale status, and block paid requests
whose schema or price cannot be verified. Review the current implementation and
its tests before making a broader provider-compatibility claim.

Public rates and deals are reference information. A published maximum discount
does not prove this API account qualifies. Use authenticated estimates when
available, with settings, owned media and duration included. Unknown costs must
stay unknown instead of being replaced with a generic minimum rate. The API does
not provide a verified wallet balance in this delivery, so the provider dashboard
remains the place to check available API balance.

A newly discovered compatible model should not need a manual application upgrade.
An upgrade is needed if the provider changes its API contract, schema format,
authentication or pricing semantics, or when security fixes and application
changes are shipped. Provider compatibility is not a promise that every future
model can run without review. Before an upgrade, back up the database and secret
configuration, read release notes, apply reviewed migrations, rebuild, and run the
ownership, quote and lifecycle checks in `docs/editions-handover.md`.

## November1 update

Apply the November1 migrations before using OpenRouter connections. OpenRouter and Higgsfield keys are provider-separated and encrypted per user. User keys never fall back to studio-funded keys. Nano Banana estimates use official token schedules with current endpoint rates. OpenRouter actual usage cost is stored separately and shown in generation details. GPT output-only calculations are clearly distinguished from total quotes. The Provider pricing button is removed from the personal pricing page.
