# Installation prerequisite reconciliation

A sold scope with confirmed full installation can complete its missing Ordered and
Shipped workflow checks. Payment and the financial Closed filter alone cannot.
The shared operations projection applies this rule to the dashboard and Job Status,
including future installations. It preserves direct order/shipment evidence and
labels inferred completion as "Completed from installation". No event dates,
tracking numbers, invoices, costs, or payments are fabricated.

The rule requires exact-scope installation evidence, no conflicts, no open service
issue, no explicit reopening, complete source loads, and no physical/scope blockers.
A missing technical measure remains a review exception. Financial-only prerequisites
do not invalidate a confirmed physical installation. Every read re-evaluates these
conditions, so a later partial report or return visit suppresses inferred checks.

## Historical batch

Batch `historical-workflow-20260923-v1` records the reviewed source IDs, affected
product groups/records and steps, original installation evidence, reconciliation
time, and rule `installed-prerequisites-v1` in
`crm_jobs.meta.workflow_reconciliation[sourceId]`. Reconciliation time is not a
shipment or order date. The projection reads this provenance only after current
evidence passes the same rule; the annotation never overrides conflicting evidence.

The private operational report contains the before snapshot, row-level candidates,
exceptions, apply SQL, and rollback SQL. Those customer records are not committed.
The apply transaction checks job, quote, and product versions before changes,
locks the scoped rows, and is idempotent for the batch ID. Only job metadata is
written: quote updates can enqueue installer delivery and are deliberately avoided.

Rollback consists of reverting the source change (to restore prior projection)
and removing only this batch's metadata entries using the saved rollback SQL.
The rollback preserves other metadata and later reconciliation batches. Actual
shipment dates and financial records never change.

## Verification

Compare all six dashboard counts, confirm corrected installed jobs leave the
Ordered/Shipped attention lists, inspect the evidence label in Job Status, and
confirm batch membership and installer outbox counts. Unverified paid jobs and
conflicting completion records stay on the private review list.
