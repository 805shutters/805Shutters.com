# Quote pricing migration preflight — 2026-09-21

Target: Supabase `evuxqsaucmvgyuvjpqlo`. Read-only production inspection via `pg_proc`, `pg_get_functiondef`, `information_schema.columns`, `pg_constraint`, and migration history. No production migrations or customer records were changed by this agent.

## Reviewed application order

Apply these exact repository files, in order; do not run all outstanding migrations:

1. `supabase/migrations/20260621010000_add_quote_builder_details_and_wholesale.sql` — live `crm_quote_designs` is missing both `details` and `wholesale_unit_price`. Adds the two columns with `IF NOT EXISTS`; native customer preparation references both.
2. `supabase/migrations/20260914231500_customer_installation_shipping_snapshots.sql` — creates six customer-charge/control/adjustment helpers, updates protected-key detection, defines native preparation, replaces manual setter. All helper definitions and native preparation are absent live. Existing manual setter is the September 12 version.
3. `supabase/migrations/20260914232000_customer_quote_adjustment_rounding.sql` — replaces the preceding adjustment function with cent rounding at each step; do not omit this intermediate file.
4. `supabase/migrations/20260914232500_preserve_unchanged_manual_quote_snapshots.sql` — replaces the catalog saver with unchanged-manual preservation and fixed-charge totals. Calls helpers from steps 2–3.
5. `supabase/migrations/20260921120000_manual_customer_installation_policy.sql` — Lotus increment. Requires the protected-key `customercharges` entry, fixed-charge catalog block and manual wrapper from steps 2–4 / existing September 11 migration.
6. `supabase/migrations/20260921121000_custom_mode_customer_installation_policy.sql` — Lotus Custom Mode increment; the custom override ledger exists live.
7. `supabase/migrations/20260921214000_allow_explicit_unknown_quote_cost.sql` — this increment. Guarded edits to catalog saver and native preparation, retaining all preceding changes. Also persists service-only `staffPricingError` to `options_json.authoritative_price_error` on failure and removes it on successful calculation.

Do not rerun September 11 `staff_line_price_overrides`: its rename is already applied. September 12 `line_price_contract_totals` is also recorded/applied. The September 10 native snapshot function is fully superseded by step 2 and is not a required separate predecessor. September 10 delivery/acceptance/audit migrations are absent but not prerequisites for draft pricing or native preparation; this review does not claim delivery is deployed.

## Verified live dependencies and independent defects

Existing: sales quote/line/design tables; snapshots/events; custom overrides; line-price override/event ledgers; V2 draft requests/customer-send preparations; CRM quote/job/line/design/profile tables; customer JSON safe-configuration/protected-key functions. `save_quote_v2_pricing_batch(uuid,bigint,text,uuid,jsonb)` is the existing wrapper around the renamed catalog function.

Missing helpers: `quote_customer_charges`, `quote_customer_price_with_charges`, `quote_control_number`, `quote_customer_adjustments`, `quote_customer_adjusted_total`. `prepare_native_quote_customer_snapshot(uuid,bigint,text,text,uuid,text,jsonb)` is also absent. All are supplied by step 2. Live `quote_v2_structure_is_protected_key` lacks new customer-charge keys.

Cost-null defects are separate from helper absence: live catalog saver requires all cost amounts numeric; `sales_quote_v2_price_snapshots.internal_landed_cost_total` and `crm_quotes.materials_cost` are NOT NULL. Step 7 permits null only with explicit current quote-policy evidence, adds CHECK constraints guarding null admission, and keeps known retail identity/quantity/arithmetic checks. Root landed cost stays null, known component/wholesale values survive, mixed quote aggregates and profit stay null. Customer preparation preserves unknown costs without exposing private cost/error fields. Existing rows and immutable snapshots are not rewritten.

`crm_quotes.materials_cost` null admission additionally requires native metadata `quote_cost_status=unresolved` and `quotePricingPolicy=grid_options_quote_v1`. Existing nullable `sales_quotes.product_cost` / `manufacturer_cost` need no schema alteration. New snapshot null admission requires both policy markers, catalog date >=2026-09-21, explicit unresolved/incomplete status, null landed total and each component amount either nonnegative numeric or explicit null. Complete or historical snapshots retain strict previous checks.

Function definition MD5 values observed before migration:

| Function | MD5 |
|---|---|
| save_quote_v2_catalog_pricing_batch | 589f7228d434af5d1b963fb873e92c67 |
| save_quote_v2_pricing_batch | ae217e2ab45278ab6c1c627d1696d434 |
| set_sales_quote_line_price | 2256daefcd3ee90c8516ac2fbe3e1da6 |
| quote_v2_structure_is_protected_key | 98be269e22a8a262c7c6f98bfefff6b1 |
| quote_v2_customer_json_has_protected_key | 16cee5ec62817c2670bddb3d8cd1b149 |
| quote_v2_customer_safe_configuration | 0df8c976fb34fbc20f3d1b911cc29345 |

## Verification

25 database tests passed across native snapshot, manual line price, and exact migration-sequence fixtures; TypeScript passed. The sequence fixture executes the historical helpers/saver, both new manual migrations, then the cost-null migration. Tests call real catalog/wrapper RPCs and native customer preparation, save/reopen retail amounts, retain null unknown costs, retain known merchandise costs, preserve historical snapshots/manual selections, validate mixed known/unknown totals, reject unmarked/negative/string/historical cost exceptions, preserve sent-quote guard/idempotency, and prove a saved missing-grid error clears after successful repricing without entering customer output.

After parent application: verify function presence, both new CHECK constraints/column nullability, service-only permissions and exact patch markers. Then invoke the existing authorized draft recovery/price route with fresh revision and server-selected catalog; verify selected IDs/options unchanged, retail amounts saved and reopened, truthful unknown-cost status, and customer preview. This agent has not applied the sequence or verified production recovery.
