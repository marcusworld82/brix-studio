# Two-edition handover

Canonical managed checkout: `~/Marcus/40 PRODUCTS/BRIX/studio`.
Development branch: `feat/brix-two-editions`.

| Edition | Environment | Entry | Current scope |
| --- | --- | --- | --- |
| Personal | `BRIX_EDITION=personal`, `APP_BACKEND=supabase` | `/image`, `/video` | Customer-owned backend and per-user Higgsfield API keys. Backend setup and hosted acceptance checks required. |
| Subscription | `BRIX_EDITION=subscription` | `/subscription` | Frontend demo with browser-local state. No payment, real account or generation connection. |

Both archives share the application source. The chosen environment selects its
behavior; these are not two independent implementations. Do not assume dormant
legacy routes or adapters are licensed, configured or appropriate to expose.
Deploy only the edition's intended public surfaces and verify route boundaries.

## Delivery commands

From the canonical checkout:

```sh
node scripts/export-editions.mjs --out /tmp/brix-delivery
```

This creates `brix-personal.tar.gz` and `brix-subscription.tar.gz`. Each includes
an edition-specific `.env.example`, README, current application source, curated
tracked public media, database migrations, setup docs and a SHA-256 file manifest.
The exporter uses Git's tracked and nonignored source inventory with explicit
allowlists. Edition env examples are included explicitly even before staging.
It rejects symlinks, credential patterns and deployment identifiers, audits the
archive paths, and removes its temporary staging folder. It never reads runtime
env values or private credential files.

Excluded: real env files, `.git`, `.vercel`, `node_modules`, `.next`, `.data`,
private uploads, customer media, private notes, internal project instructions,
test fixtures, internal tests, screenshots, browser recordings and deployment
metadata. Only already tracked curated public assets are included. New public
assets need review and staging before export. A full audit still requires checking
the archive manifest and running the extracted application in a fresh folder.
Do not represent a filename/pattern scan as proof that arbitrary source contains
no sensitive material.

To inspect the archives without executing their code:

```sh
tar -tzf /tmp/brix-delivery/brix-personal.tar.gz
tar -tzf /tmp/brix-delivery/brix-subscription.tar.gz
```

Use `editions/personal.env.example` and `editions/subscription.env.example` in the
source checkout. They must be tracked; if a local ignore pattern hides them:

```sh
git add -f editions/personal.env.example editions/subscription.env.example
```

No credentials should be staged. Final customer exports should be regenerated
from the reviewed branch after all intended source changes have been staged.

## Customer startup

In the extracted edition folder:

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm exec tsx scripts/check-personal-setup.ts
pnpm dev
```

Personal customers fill their own configuration following
`docs/personal-edition-setup.md`. Each customer needs their own Supabase Auth,
database migrations, private media bucket, verified Resend sender, production
origin, encryption secret and signed webhook/reconciliation configuration once.
Users then connect their own API key through Account. No shared agency provider
key should be supplied. Hosted service costs are separate from BRIX's personal
edition, which has no configured recurring subscription fee.

Subscription demo customers need no Supabase or payment setup. Keep the supplied
`BRIX_EDITION=subscription` value. Admin controls edit only local draft numbers.
All sample plans are illustrative, not approved commercial offers. Clearing the
browser's localStorage resets the demo; it does not affect any real account.
See `docs/subscription-integration.md` before connecting a backend later.

Production commands are `pnpm build` then `pnpm start`. Set environment values on
the production host, not in a public folder. Rebuild after changing public branding
variables. Keep the existing base `.env.example` in the repository; exports replace
their own root copy with the correct edition template.

## Acceptance still required for each customer

- Hosted signup, verification, password recovery, login and logout reach the
  intended recipient and correct customer origin.
- Two users cannot access each other's encrypted API keys, media, jobs or history.
  Supabase RLS and private Storage policies are enabled and tested.
- Quotes refresh when model, prompt, settings or media duration changes. Unknown,
  stale or unsupported pricing cannot submit a paid job. Public discounts remain
  labeled as references until account eligibility is verified. Wallet balance is
  not reported as known when the provider API does not supply it.
- A missing user connection cannot use an owner key. Provider callbacks are
  authenticated, terminal status is rechecked, and the reconciliation schedule
  completes or safely resolves jobs. Any paid smoke test requires explicit owner
  authorization and a current estimate.
- Personal and subscription edition boundaries work in a clean production build.
  Subscription loads without private backend configuration and cannot create a
  real account, charge a card or submit a paid provider request.
- The final source, archive inventory, client-secret check and customer branding,
  support contacts, legal pages and email sender have been reviewed.

In the development checkout, run the full lint, typecheck, test and build commands
before final delivery. Internal tests and fixture artifacts are deliberately
excluded from customer archives. Results from the development checkout do not
replace the customer's hosted checks above. No archive is called ready to sell
until those checks and commercial decisions have been completed.

## Maintenance

Compatible catalog additions refresh without a manual deployment per model.
Manual upgrades remain necessary when provider contracts break, security fixes
ship, or the application changes. Preserve encrypted credentials and their
original encryption secret during upgrades. Keep secrets outside archives and
back up the database before applying migrations. Do not promise support for
unverified future provider models or assume a public deal applies to an account.

## Verification on November 1, 2026

- Full suite: 545 tests passed, 100 existing skips. TypeScript and ESLint passed.
- Personal production build and client-secret scan passed.
- Extracted subscription archive installed with frozen lockfile and built without
  provider, database or payment credentials; client-secret scan passed. Its
  production-mode demo redirected `/` to `/subscription`, blocked generation and
  quote API requests with 503, and showed editable admin controls.
- Browser checks on image, video, pricing and subscription pages at 390px and
  1440px: no horizontal overflow or page errors. Agent also checked subscription
  at 320px and 768px.
- Read-only authenticated Soul 2 Standard estimate returned $0.004. No paid
  generation was submitted during this build.
- Live public feeds returned 89 modes, 17 image and 72 video, with fresh schemas.
- Dynamic-form history reuse restores saved inputs. Guided templates remain in
  the guided workspace. Live forms do not expose incompatible template saving.

Per-customer hosted acceptance remains required after that customer's environment
is configured. The subscription backend remains future work as requested.
