# Payables manual-payment workflow

The Payables page records a payment that a user confirms was completed outside the CRM. It does not initiate, configure, recommend, or link to a transfer service.

## Reconciliation rules

- A payment record is scoped to one exact payable person and to exact payable item keys selected from that person's current ledger.
- The server re-reads the ledger and rejects stale, missing, already-paid, duplicated, or mismatched item keys.
- Amounts must be positive, may not exceed the selected current balance, and must equal the allocation total after any recorded advance is applied.
- Ken records require a payment date, an allowed manual method, and a unique request ID. A supplied reference must also be unique among Ken manual-payment records.
- The payment method, reference, notes, selected item keys, allocation amounts, request ID, and confirmed-record marker are retained in audit metadata.
- Recording a Ken payment reconciles the same Ken payable and business-buyout ledgers atomically. The database function is service-role only and performs no external payment action.

## All-time job summary

Each payable profile displays an all-time job summary independently of current amount due and advances. Jobs are deduplicated only by stable CRM job ID, quote ID, or source row ID; names, phone numbers, and other fuzzy identity fields are never merged.

- **Sold**: every distinct qualifying sold job under the established payable rules, including jobs already completed or paid in full.
- **Active sold**: a qualifying sold job that is not completed and is not represented as paid in full.
- **Closed sold**: a qualifying sold job that is completed or paid in full.

Active sold and Closed sold partition Sold, so their counts and qualifying payable-value totals reconcile to the Sold count and total. Jessica's summary includes only rows whose exact `salesOwner` is Jessica. If the source data is unavailable, the UI says the summary is unavailable rather than displaying a fabricated zero.

Historical accuracy remains limited by the stable IDs, statuses, sales-owner attribution, and payable inputs stored on historical CRM rows. This release does not rewrite historical jobs, balances, advances, or payments.
