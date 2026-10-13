# Current BRIX backend

APP_BACKEND=supabase uses Supabase Auth, Postgres, private Storage, and each user's
encrypted Higgsfield API connection. Never fall back to the owner's shared key.
Use lib/supabase for lifecycle and storage, verified user.id for ownership, and
server-only service RPCs for privileged writes. Do not call user.objectId or the
legacy MongoDB, Stripe, BRIX credit ledger, or shared higgsfield() in this mode.
Every private action must still requireUser and scope by the verified user ID.
Effect/template admin writes requireAdmin. Never send API secrets to a client.

The original contract below applies to APP_BACKEND=legacy. Preserve that mode.

# BRIX — contract for coding agents

BRIX is a credit-metered AI image/video studio on the Higgsfield REST API,
scaffolded from `higgsfield-ai/app-templates` (studio). Read `README.md`,
`docs/decisions.md` and `docs/model-catalog.md` before changing behaviour.

## Layout

- `app/(site)` marketing pages (expanded nav + footer) · `app/(studio)` full-height
  workspaces (generators, library) · `app/(app)` scrolling signed-in pages
  (account, billing, admin) · `app/api` route handlers · `app/actions` server actions.
- `generation/catalog/models/*.ts` — one file per model family; the barrel is
  generated (`pnpm models`). Never hand-edit `models.generated.ts`.
- `lib/higgsfield` (server-only platform client), `lib/generations` (submit,
  finalize, reconcile, cancel, library), `lib/billing` (price, ledger, Stripe),
  `lib/db`, `lib/storage` (R2 / local), `lib/uploads.ts`, `auth.ts`.
- `components/generator` (panel, dock, canvas, picker), `components/studio`
  (template primitives: prompt box, gallery, lightbox, asset library),
  `components/site`, `components/billing`, `components/library`, `components/admin`.

## Invariants — preserve these

- **Server only:** the platform key, Stripe/Resend/R2 secrets and model paths.
  `lib/higgsfield/**` imports `server-only`. Request paths and bodies come from
  the catalog (`toPlatform`), never from the client.
- **Every server action / route handler** calls `auth()` (via `requireUser`)
  and scopes queries by `userId`; other users' ids are 404, not 403.
- **Credits change only through `lib/billing/ledger.ts`**, inside transactions,
  never below zero, idempotent on `{reason, refType, refId, bucket}`.
- **Prices come from `priceFor`/`quoteRequest`** on the server; the client's
  number is display only.
- **Finalize is the only path to a terminal status**; it re-fetches the status
  (webhook payloads are untrusted) and refunds failed/nsfw/canceled once.
- **Poll our DB, not the platform:** the browser polls
  `GET /api/generations/status`; never poll through a server action.
- **Model files cite their docs URLs**; never invent endpoints, fields or enums.
- Generating and failed tiles stay in feeds; loaded media never unmounts on fast scroll.
- Dark only; lime is reserved for the Generate CTA and active states; every
  visible control works (remove what can't); no `any`, `@ts-ignore`,
  `@ts-expect-error`.

## Definition of done for a change

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` pass; E2E
(`pnpm test:e2e`) passes against a running stack; docs updated when a default
or contract changes.
