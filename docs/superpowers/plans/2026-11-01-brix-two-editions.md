# BRIX Two Editions Implementation Plan

> **For agentic workers:** Use the assigned independent scopes for catalog and subscription UI; root integrates generation, pricing, packaging and verification.

**Goal:** Complete the rebrandable BYOK edition with automatic models and cost previews, plus a separate subscription frontend prepared for later backend integration.

**Architecture:** Preserve existing Supabase ownership and generation lifecycle. A refreshed public catalog supplies model definitions and schemas; an authenticated quote remains the main price authority. Subscription demo state and actions remain isolated from real accounts and provider submission.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind, Supabase, Zod, Ajv, Vitest.

**Spec:** docs/superpowers/specs/2026-11-01-two-editions-design.md

## Global Constraints

- No credentials in client bundles or release archives.
- No paid generation, checkout or subscription backend provisioning for testing.
- No owner-key fallback in the personal edition.
- Published maximum discounts do not establish customer eligibility.
- Demo plans, credits, balances and usage are labeled demonstrations.
- Preserve existing static workspace as an optional fallback.

## Review Focus

- Provider schema changes and conditional/nested inputs must validate before submission.
- Price responses arriving after changed inputs must not enable an old quote.
- Media in any dynamic field must belong to the verified caller.
- Provider outages must retain useful catalog data and clearly identify stale metadata.
- Demo subscription routes must not create real jobs or read server credentials.

## Tasks

- [ ] Catalog: implement live metadata, bounded refresh, schema loading/validation, snapshot fallback and read-only sync command. Tests cover new models, upstream failures, invalid schemas and conditional constraints.
- [ ] Personal UI: add automatic model studio and public pricing/deals view; render scalar/media/JSON inputs using provider schema, preserve library/history and static workspace. Quote current inputs with cancellation and stale-result protection.
- [ ] Submission: validate dynamic model inputs, resolve only owned references, obtain and recheck current dollar quotes. Add clearly labeled published formula estimates only for verified supported formulas with trusted source duration. Tests cover ownership, changed price, invalid input and unavailable estimates.
- [ ] Subscription: independent /subscription frontend, demo plans/studio/history/account/admin, editable markup and credits, validated local persistence, typed future adapters and integration guide. No real billing or generation.
- [ ] Distribution: edition config, rebranding settings, sanitized customer export, setup and backend-readiness checks. Keep customer backend configuration one-time and document API/feed maintenance limits.
- [ ] Verify: typecheck, lint, focused/new tests, full tests, builds, client-secret scan, mobile/desktop browser checks, no paid jobs; review the combined change.
- [ ] Deliver: deploy verified editions or provide tested previews, save handover, Notion project/Tasks/Rules/Tools/SOP and linked Obsidian Wiki note.

## Rulings

Marcus supplied the intended editions and explicitly requests a build. Implementation proceeds using the existing stack and disclosed defaults; no further design approval is inferred for actual subscription prices or commercial launch. Subscription finance values remain draft examples.

The native worktree tool did not return or create a checkout. Its waiting call was terminated; a Git worktree was created at the user-requested canonical project location instead. The existing main checkout and production configuration remain separate during implementation.
