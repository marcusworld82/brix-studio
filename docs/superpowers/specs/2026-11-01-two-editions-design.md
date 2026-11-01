# BRIX two editions

## Creative Brief
Audience: customers buying their own branded AI studio, and subscribers using Marcus's studio.
Situation: the existing BRIX uses per-user API keys, fixed model definitions, and authenticated dollar quotes. Some metered models cannot yet quote a fixed amount.
Objective: ship a maintained personal edition and a separate subscription frontend without paid backend behavior.
Offer: a rebrandable personal studio, plus a future monthly credit service.
Problem: buyers should not need Marcus to add each new provider model or price change.
Audience shift: understand current generation cost, connect their own key or use the clearly labeled subscription demo.
Hero: the generation workspace and its current model inputs.
Creative world: existing BRIX dark, blue studio with visible reference media and mobile controls.
Angle: one generator foundation, distinct ownership and billing paths.
Originality wrap: customer branding settings and a live model catalog with price freshness.
Visual hook: the selected model, reference and dollar quote remain together.
Text hook: Your studio. Your API key.
Spoken hook: not applicable.
Structure: edition overview, working personal studio, separate subscription workspace and admin screens.
Proof: current project source and live provider catalogs verified. Future subscriptions, markup defaults and public sales prices are demonstrations until supplied and connected.
Format: working Next.js application plus separate deployment configurations and customer release archive.
CTA: connect an API key in the personal edition, explore plans in the subscription demo.
Risks: public provider feeds are not a guaranteed API contract; unsupported schema changes need fail-closed handling. Account discounts require authenticated estimates. API wallet access remains unavailable with API keys alone.
Test hypothesis: a newly discovered compatible schema appears without a source edit, and changed settings never reuse a stale dollar quote.
Status: build requested by Marcus; demo financial values are not approved sales prices.

## Architecture decisions
Keep existing Supabase ownership, encrypted credentials and job lifecycle. Add a server-owned refreshed catalog and schema-aware model definitions, paired with a generic live model form. Validate all provider inputs on the server and sign only owned media. Retain the current catalog and last verified data on feed outages, visibly mark stale prices, and prevent generation when price or schema is unverified.

Use authenticated provider estimates first. Public pricing/deals are reference data and must never be presented as a guaranteed account discount. Source-duration pricing needs trustworthy uploaded video duration. Do not charge a generic minimum advertised rate.

Subscription scope: functional frontend interactions, editable draft plans and model markups, credit-cost preview, demo studio/library/settings and integration checklist. Keep demo data visibly labeled, isolated from real jobs and private data. Backend adapters and schema plan are supplied for future Supabase/payment integration. No backend provisioning or real subscription billing in this task.

Branding: name, logo initials, accent and support details through deployment configuration. Delivery: source, sanitized customer package, environment example, setup/upgrade guide and honest readiness checklist. Each independent customer deployment needs backend and email configuration once.

## Acceptance
- Existing private upload and generation flow preserved.
- Current model discovery and field schemas refresh without rebuilding.
- Compatible new model fixture appears and validates through the live catalog path.
- Dollar quote refreshes on all settings and media changes, including duration.
- Missing permissions, schema, stale data or unavailable pricing cannot silently submit a paid job.
- Public deals update automatically, with eligibility and freshness labels.
- Subscription screens work without Supabase, Stripe or provider credentials; no paid jobs or checkouts are possible.
- Admin demo can edit plans and markup and see credit-price calculations.
- TypeScript, lint, focused tests, full suite, build/client-secret checks and browser checks at phone/desktop widths.
- Customer release contains no .env.local, runtime credentials, personal uploads, .git or deployment identifiers.
