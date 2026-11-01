# BRIX subscription edition

BRIX_EDITION=subscription uses the same home, image/video studio, uploads, library, templates, account login and navigation as the personal edition. The rejected separate demo and browser-local financial state have been removed. /pricing uses the screenshot-inspired four-tier comparison in BRIX blues. Original repository plan prices remain Starter12/month, Plus35/month, Ultra89/month, with annual monthly equivalents9.60/28/71.20 USD. Teams is contact-only, with no invented shared workspace or unlimited entitlement.

## Backend setup

Set APP_BACKEND=supabase and configure normal Supabase/Auth/Resend variables using editions/subscription.env.example. Apply all migrations in order. The three November1 migrations add personal OpenRouter keys, service-only subscription ledger/Stripe event handlers and private platform keys. Never run them against another project's database.

Authenticate with the existing verified owner email and password. ADMIN_EMAILS is the authoritative owner allowlist when configured. /admin?tab=providers stores encrypted studio Higgsfield/OpenRouter keys. These are separate from personal API connections, never sent to subscribers, and pinned per job. /admin?tab=pricing edits markup, value per credit, and a fixed full-request credit price for each model. A fixed price overrides automatic markup for that model, including the requested batch count. Model list refreshes from both provider catalogs.

Stripe remains unconnected by Marcus's explicit instruction. The owner-only Pricing screen contains a disabled key placeholder. No live checkout, card charge or credits are fabricated. Later activation requires STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, six recurring plan price IDs and three top-up price IDs. Checkout verifies Stripe price currency, amount and interval against plan defaults. Owner needs to configure the customer portal and signed webhook endpoint /api/webhooks/stripe. Changing a plan constant alone cannot change a Stripe price.

## Credit lifecycle

Fresh server quotes derive model cost and admin markup or configured fixed credit price. The SQL transaction verifies the pricing version and exact credit amount, locks the account, reserves credits and creates the private job idempotently. No client balance, user-supplied plan or client credit amount is authoritative. Concurrency follows the trusted plan and media surface. Each terminal failure refunds once. Completed output and credit settlement are independent so a settlement outage cannot turn a successful paid request into a failed/refunded job.

Annual payment grants the first monthly allowance. The reconciliation cron calls refillSubscriptionAllowances() for later anchored monthly grants. Each period is unique and replay-safe. Credit grants are additive in this implementation. Prorated plan-change invoices do not grant another full allowance. Refunded payments create an owner billing-review flag, with no unsafe automatic clawback.

Cron also retries only unsettled terminal reservations, oldest first. A paid POST is never automatically retried. Ambiguous provider outcomes remain marked for review, preserving the reservation until an actual terminal status is known. OpenRouter's synchronous image endpoint cannot automatically recover image bytes lost during an uncertain transport failure; owner review of provider usage is required.

## Provider pricing

Higgsfield authenticated estimate is preferred, with supported verified formula estimates as fallback. OpenRouter Nano Banana estimates use current pinned endpoint rates and official token schedules. Returned usage.cost is saved separately as actual API cost. GPT Image2/2.5's verified output calculator is exposed as output-only information when total input/dimensions are not reliably bound. Unknown totals are not claimed as exact quotes.

No Stripe payments or paid media generation are performed by setup/build tests. Verify signup, owner admin access, ordinary-user denial, ownership, provider credentials, quotes, credit races, webhook replays and reconciliation before paid activation.

Personal OpenRouter token-priced models can be submitted only after per-request usage billing consent. The server binds that consent to the current provider pricing fingerprint and exact inputs, and rechecks before the paid POST. The displayed output-only range is not called a total. Subscription mode still requires a numeric studio credit quote. No such consent was exercised against a real provider during testing.
