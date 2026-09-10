# Native quote customer delivery: source repair and remaining integration

Inspected against origin/main `039b8f5e`, September 10, 2026. This report does not claim native quote delivery is complete.

## Implemented repair

`assertHistoricalSalesQuoteMutationAllowed` checks `sales_quote_v2_draft_requests` for a server-marked V2 quote before historical contract mutation. The receipt table is service-role-only, append-only, and has a unique quote ID. `create_quote_v2_draft` creates the quote and receipt in the same transaction; the mobile creation wrapper uses that function. The marker alone is deliberately insufficient because historical restores also carry it.

A native creation receipt stops the historical send, send-as-is, payment-link, mark-sold, communication-mirror, resync, and missing-mirror restoration paths before writes. A quote group is checked in full before contact changes or the first mirror write. Ordinary historical quotes need no receipt lookup; marked historical quotes with no native receipt retain the existing workflow. A lookup failure is an explicit 502, never evidence of historical origin. Existing public quote reads, links, signatures, stored prices, native draft creation, structural editing, authoritative pricing, copying, and the separate guarded preparation route are unchanged.

This closes a server-side bypass that UI-disabled send buttons did not protect. It deliberately does not enable native delivery, reprice a quote, change workflow markers, migrate records, or alter a saved customer contract. Historical mutations now depend on receipt-table availability only for marked rows, so verify that migration/table with the production service role before release.

## Proven source gaps

1. `resolveSalesQuoteCustomerWorkflow` always chooses historical V1. The historical mirror sorts designs, selects the first, projects all saved designs as `price_status: ok`, and may reconcile the source total. It does not use native `selected_design_id` and immutable selected pricing snapshots. A native draft reaching it could lose its authoritative selection and pricing meaning.
2. `prepareSalesQuoteV2CustomerSend` and `prepare_quote_v2_customer_send` provide revision/catalog validation, customer-safe projection, locked snapshot comparison, and atomic preparation. They require source `draft` + `priced`; they persist a draft mirror and immutable preparation, but leave source lifecycle editable and deliver nothing. Sending a mirror afterward without a lifecycle reservation permits source edits while the provider call is in progress.
3. The preparation RPC can replace an existing draft mirror and rejects a non-draft mirror, but does not distinguish native receipt provenance from a historical quote marked V2. Its runtime gate remains `QUOTE_V2_CUSTOMER_SEND_PREPARATION=enabled-after-v2-send-preparation-migration`. This is a preparation gate, not delivery authorization or proof of deployment.
4. Public acceptance supports subset partitioning in CRM. `syncLinkedSalesQuoteSignature` then updates linked sales status, signature, and total through the service role, which the database permits. It does not reconcile native selected line/snapshot ownership, revision, or V2 lifecycle with the partition. The same unchanged original native snapshot can therefore outlive a different accepted total unless integration explicitly handles the transition.
5. Preparation metadata uses `source_sales_quote_id`; historical public selection/total paths commonly use `mts_quote_id` and legacy metadata. These formats cannot simply be relabeled without tracing their behavior. The existing source-signature resolver separately recognizes the `quote:<UUID>` external ID.
6. JavaScript preparation supports the `custom-override-v1` snapshot shape, while the atomic SQL preparation checks authoritative engine selections/status. Verify and reconcile Custom Mode support in the transaction before advertising it as deliverable.

## Finite remaining work

- Read-only production audit: classify marked sales quotes by immutable draft receipts, historical typed `crm_quotes.meta.target_sales_quote_id`, existing mirrors, preparation receipts, share tokens, signatures, group membership, and current selected snapshot identity. Ambiguous or overlapping provenance must remain protected. Verify applied migrations, receipt access, and runtime gate independently; an unavailable query is not an empty audit.
- Implement a native-only transactional delivery reservation tied to actor, expected revision, immutable preparation, recipients, channels, and idempotency key. Preserve existing mirror identity and customer token; reject historical signed/sent mirrors. Prevent source structural/pricing edits during delivery and make retry/provider uncertainty explicit.
- Connect the reservation to delivery and persist actual per-channel outcomes without pretending that preparation means sent. Preserve the frozen customer payload for retries and resends; never regenerate it through legacy pricing or create a second quote/token.
- Integrate native acceptance, any subset/future-quote partition, signature synchronization, V2 lifecycle, and payment handoff against that frozen version. Preserve all historical acceptance and payment paths and immutable contract records.
- Cover grouped alternatives, exact selected-design ownership, custom/manual prices, invalid/stale snapshots, delivery failures/retries, concurrency, accepted subsets, existing tokens/signatures, and customer-safe output with transaction and API tests.
- Verify the actual native preview → save → reload → prepare → delivery → acceptance/payment handoff using controlled records and test/provider destinations before a native send cutover. No real customer send or signature/payment mutation was performed for this repair.

Credentials alone do not complete this work: both source integration and database/provider verification remain necessary. The immediate patch is a containment repair with a concrete source error, not a completed customer-send feature.

## Local validation

Focused guard, historical mirror, public quote, selected snapshot, atomic preparation, and Custom Mode tests: 6 files / 122 tests passed. TypeScript and production build passed (262 generated pages). No live database, customer delivery, signature, or payment mutation was performed. The build emitted the existing multiple-lockfile workspace-root warning.
