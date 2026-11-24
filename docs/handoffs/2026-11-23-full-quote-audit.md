# Full quoting audit — November23 afternoon

## Authority and goal
Mike: walk through the entire quote system, audit it, and ensure it works as last Friday. Continue fixing confirmed failures through production under current AGENTS. Preserve customer/signed records and pricing policies. No real customer sends, signatures or payments as tests. Use explicitly labeled internal test drafts; archive them afterwards.

## Plan
- Complete: creation repair c00d50c5 deployed to production dpl_EHyLmtzMVUbg1Tc2RNeozaCk5ESN; DB migration20261124001554;11,277 tests/typecheck/build pass; actual New quote created805-ATP, now archived.
- In progress: inventory actual routes, schema compatibility and change history against Friday baseline58e22944 (before Friday evening live-pricing cutover).
- Remaining: test both creation paths; products/options/dimensions; authoritative calculation; edits/save/reopen; selection/copy/alternatives; contract artwork/preview; delivery preparation and signature/payment safeguards; draft archival/deletion; mobile/iPad access.
- Remaining: repair confirmed failures, focused regression and full required checks, scoped commit/push/deploy, verify live. Performance tuning remains separate unless needed to repair a functional failure.

## Known leads
Production sales_quotes lacks deleted_at; quote-list retries without it, while deleteSalesQuote writes deleted_at/deleted_by/deleted_by_user_id. Must reproduce and review additive migration before any live change. Existing test drafts0592/0593 lack exact catalog programs; do not claim automatic current pricing for them. Tiffany0598 was independently sent by time of afternoon browser inspection; do not alter it.

## Evidence boundaries
100 generated IDs and RPC draft/side mark/idempotency tested transactionally with fixtures rolled back. UI internal805-ATP proves legacy New quote path; no real customer rows touched. Earlier preview/contract checks did not establish whole-system health. Distinguish source tests, live read-only checks, internal live mutations and untested external consequences.

## Live audit fixtures
805-KWW: INTERNAL AUDIT November Verification, created through New Norman quote. Side mark Verification805-KWW. Only this and own805-ATP may be mutated during audit; archive when finished.

## Confirmed audit findings and repair scope
- New Norman quote805-KWW and copied alternative805-UZK are internal fixtures only; no contacts/delivery/signature/payment. Real UI add line, dimensions36x48, mount, P001 smooth color, valance, quantity2, line copy and Copy Current work; saved contract renders official pencil artwork and matching totals.
- Discount regression reproduced live: 10% selection persisted but authoritative unit183.67/line367.34 stayed unchanged. sourceCostPlusRetail resets discount to0. Repair applies existing merchandise-only per-unit discount convention after cost-plus calculation; preserves $125/line base policy, manufacturer costs, once charges, installation and shipping. Cost-floor remains enforced. Focused quantity1/2/3 tests pass. This audit defect is not attributed to Sunday performance release.
- Soft-delete API references three absent production columns. Transactional reproduction caught undefined_column with no row change. Forward additive migration repeats original July nullable-marker/index migration; no data backfill, grant/RLS/trigger change, or deletion. PGlite verifies idempotent schema repair, retention of lines and signed contracts, filter and restoration. Safety review: default NULL leaves all current rows visible, partial index includes all existing rows; freeze trigger protects financial/structural fields but allows operational tombstones.
- Actual production core create/mutate/revise/price/import/custom/accept/delivery RPCs all exist. Presence alone is not functional proof.

- Onyx fully configured Basswood:36x48, window-size ZFine four sides produces38x50 billable14sqft ×$35=$490. Default Standard Tilt rejected by current-assortment label parser; explicit C Front Center succeeds. Added Standard Tilt->C and Offset Tilt->O aliases only; ambiguous Invisible Tilt remains blocked. Fully configured builder integration test confirms same total and no selection mutation.
- Soft-delete migration applied as20261124003231. All517 quotes remain, zero deleted. Global before/after financial fingerprint differed while the internal shutter line was still repricing, so it is not used as an unchanged-data proof. Migration contains no UPDATE/DELETE; PGlite establishes row preservation.
- All four live-lookup flags remain false. Read-only delivery capability, contract preview and recipient guard work. No actual messages, acceptance/signatures or payment transactions performed.

## Verification before release
Final full suite:11,284 passed,37 skipped (928 files passed). Typecheck and production build pass. Tests cover both supported source-cost-plus products, quantity rounding and cost-floor behavior, actual PostgreSQL nullable tombstones, full configured Onyx tilt compatibility; existing suite covers manufacturer catalog boundaries, order constraints, contract artwork, delivery projection, signature freeze, partial acceptance and payment idempotency. External delivery/signing/charging is deliberately not exercised live.
Read-only historical check found two already-sent native quotes805-0528 and805-0398 with selected10% and snapshot0%. Their originals are preserved, require separate owner-reviewed revised quote; no active native draft matching this issue outside audit fixtures. This is not a claim that all older non-native discounts are broken.
