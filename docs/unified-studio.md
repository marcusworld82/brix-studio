# Unified studio and manual model pricing

Marcus's November 1 Loom corrections supersede the older split between the
guided picker and the live model workspace. The later recording
`8abd05569b81448081c092aa62904e22` refines the layout by surface.

## Studio contract

- Image and Video each have one workspace. Keep the existing BRIX starter canvas.
  Video uses a left control panel on desktop, with inputs and model settings in
  that panel. Image uses a bottom composer with compact inline parameter controls.
  Do not add a guided/live mode switch or a separate model-settings dialog.
- On narrow phones, video controls must remain full-width and reachable without
  horizontal page overflow. Advanced inputs can expand within their control area;
  ordinary dropdowns and the model/media pickers are not settings-window substitutes.
- Custom Kling 3 shot cards use the API's real prompt and duration fields. BRIX
  requires their lengths to match the duration being priced, so per-second quotes
  cannot represent a different timeline. This is an app price-consistency rule,
  informed by Kling's native contract; HF does not repeat the cross-field rule.
- The public provider catalog supplies every available API operation to the
  appropriate picker. An operation is not the same as a model family.
- Refresh model definitions on selection. Derive settings, required fields,
  reference types and limits from the current model schema. Server validation
  remains authoritative. Do not apply one model's limits to another model.
- Reference attachment and prompt mentions are different features. Only submit
  special reference tokens when the selected provider documents their meaning.
  Unsupported mention syntax must not be presented as a working model feature.
- Higgsfield's Marketing Studio Flare and Sunburst pages identify the underlying
  models as GPT Image 2.5. Use those readable names without changing API paths.
- Native Kling 4.0 reference-to-video mentions use `@image_1` and `@video_1`.
  In video-edit, the source is `@video_1` and extra videos start at `@video_2`.
  Keep mentions bound to the same files after removal and reject dangling
  references on the server. Other models still support the attachment shortcut
  when their prompt-token mapping has not been verified.
- Personal accounts use their own provider keys. Subscription generation uses
  owner-managed keys and a server-validated credit quote.

## Admin pricing contract

- Keep pricing and provider configuration behind the owner admin check.
- List all current models with Image/Video filters and search. Preserve saved
  models that have disappeared from discovery so their prices can be reviewed.
- The owner chooses each model's customer price and its billing unit. Do not
  silently price new models with a default markup.
- Compare provider cost and customer revenue for the same quantity. Clearly
  distinguish published list prices, starting rates and authenticated quotes.
  Published maximum discounts are not proof of account eligibility.
- Show gross profit before payment fees and overhead. Credit face value is not
  necessarily realized subscription revenue. Plan and billing-interval economics
  must be identified when used in a margin calculation.
- Unknown provider cost means unknown profit. Do not replace it with zero.
- Recheck the model price and quantity on the server before reserving credits.
  Changed prices require a fresh user quote. Stripe remains unconnected.

## Wallet limitation

The public documentation checked November 1 describes `GET /models/usage` for
estimated spending analytics. It explicitly says results can lag and are not a
billing record. It does not document a current prepaid-wallet balance endpoint.
Zapier can call an available endpoint, but cannot supply a missing wallet API.
Do not label an inferred or manually maintained balance as a live wallet balance.

## Upfront price limitation

Higgsfield's GPT Image 2.5 Flare and Sunburst estimate calls currently return
token-rate descriptions instead of numeric totals. Their public metadata does
not specify enough input/output tokenization and rounding details for a verified
full pre-generation total. Do not substitute OpenRouter's calculation for
Higgsfield billing. Personal requests without a reliable quote stay blocked.
Subscription requests can use an explicit owner-set customer credit price;
unknown provider cost still means unknown margin.

Sources:

- https://docs.higgsfield.ai/docs/llms.txt
- https://docs.higgsfield.ai/docs/enterprise/usage-and-billing.md
- https://open.higgsfield.ai/explore
- https://open.higgsfield.ai/pricing
- https://open.higgsfield.ai/models/marketing-studio/image/flare/playground
- https://open.higgsfield.ai/models/marketing-studio/image/sunburst/playground
- https://open.higgsfield.ai/models/kling-video/v4.0/reference-to-video/api-reference
- https://open.higgsfield.ai/models/kling-video/v4.0/video-edit/api-reference
- https://help.zapier.com/hc/en-us/articles/44391646192397-Ways-to-make-API-requests-in-Zapier

## Verification

Apply reviewed migrations `202611010001` through `202611010004` in order to the
BRIX database before saving new provider keys or manual model prices. The fourth
migration adds explicit billing units and atomically rechecks price versions and
quantities. Until it is applied, the model pricing table is readable but saving
stays disabled. Do not apply these migrations to a different project.

Verify full catalog visibility, changing settings and media limits, model switch
cleanup, no workspace mode switch, responsive bottom controls, private reference
ownership, admin denial for regular accounts, and server-side manual price units.
Do not spend provider credits or run real card transactions during these checks.
Live database activation is a separate check from a passing local migration test.
