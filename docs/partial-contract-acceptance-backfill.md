# Partial contract acceptance and historical backfill

The public `/quote/[token]` acceptance path now partitions a “Purchase some”
decision atomically:

- selected line-item rows stay on the signed/current quote and job;
- unselected line-item rows move with their original design ids and price
  snapshots intact; partially selected quantities copy those snapshots verbatim
  into a new future quote and separate quoted/follow-up job without repricing;
- the current quote, current job, bookkeeping row, signed customer contract, and
  future customer contract each receive totals derived from their own line rows;
- both quotes and jobs carry reciprocal `meta.partial_acceptance` linkage.

The future quote deliberately does not share `quote_group_id` with the signed
quote. Quote groups are mutually exclusive alternatives and enforce one signed
version; the remaining items are a future opportunity, not an alternative to the
contract the customer already signed.

## Existing signed contracts

Migration `20260728120000_partition_partial_quote_acceptance.sql` does not scan
or mutate historical rows. Historical correction is an explicit, one-record
operation through the server-only
`backfillPartialPublicQuoteAcceptance(...)` function. There is no public/admin
HTTP route for it.

Before a repair:

1. Export or otherwise retain the existing `crm_quotes`,
   `crm_quote_line_items`, `crm_quote_designs`, `crm_customer_contracts`,
   `crm_quote_bookkeeping_entries`, and `crm_jobs` rows.
2. Read the signed contract snapshot and verify its exact selected line ids,
   signed timestamp, and customer-facing total.
3. Run the code path first against a database copy. Confirm selected and
   unselected rooms, quantities, manufacturer, selected design ids,
   `price_breakdown`, wholesale snapshots, current/future totals, and customer
   linkage.
4. Invoke `backfillPartialPublicQuoteAcceptance` with the exact quote id/token,
   selected line ids, existing `signed_at`, and signed-contract total.

The operation fails closed if the signature timestamp, stored
`meta.signed_selection.lineItemIds`, or signed contract total differs. On an
approved repair it retains the pre-partition quote financial fields under
`meta.partial_acceptance.pre_partition`, leaves the existing signed customer
contract untouched, adds the future customer-file contract, and records a CRM
activity named `partial_acceptance.backfill`.

For Maggie Moore contract `805-0161`, the signed PDF/customer contract total of
`$813.74` is the amount guard. The selected line-item ids and exact `signed_at`
must still be read from production immediately before any approved repair. Do
not infer them from room names, the `$3,499` header, or the `$2,156.42` deposit
field. No production repair is part of this code change.
