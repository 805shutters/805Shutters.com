# Canonical Ken payoff obligations

Each CRM contract owns one persisted payoff obligation. Unique source aliases resolve quote, verified upstream quote, and bookkeeping identifiers before ledger projection and payment allocation. Drafts only claim their own identity, so copied upstream references on additional quotes cannot hold an existing sold contract. A separate sold contract keeps its own obligation; conflicting sold-contract aliases are held for review.

A manual entry joins a sold contract only through an exact job link with one compatible contract total. Names, phone numbers, and amounts alone never merge records. Ambiguous sources are excluded with an audit reason. Existing aliases cannot silently move to a new obligation after source relinking. Resolving a hold requires an audited identity reconciliation, not a readiness override.

The service-role-only v3/v2 payment transaction takes the same advisory lock as identity refresh, rejects duplicate canonical obligations, rechecks historical canonical allocations and remaining entitlement, and returns the original payment for a repeated request ID. It accepts partial allocations within the remaining entitlement. Direct inserts, updates, deletes, truncation, and the unguarded legacy RPC are denied to exposed roles. Historical payments and customer receipts are retained unchanged.

The application resolves old selection keys server-side, fails closed on unavailable identity/history, and returns conflicts for blocked, duplicate, paid, or stale selections. Staff and read-only Ken views use the same canonical projection and exclusion audit.

## Verification

`src/lib/crm/ken-payoff-identity.test.ts` covers Leila's quote/manual pair, partial/already-paid aliases, distinct contracts, missing identity, and holds. `ken-payoff-identity.database.test.ts` executes the migration and covers SQL caps, atomic rejection, retries, historical metadata, ambiguity, alias relinking, and every exposed role's bypass denial. Backend regressions cover legacy endpoints. A separate local PostgreSQL two-connection test verifies that overlapping source-key submissions serialize and leave one payment/allocation.

Production rollout snapshots source records and verifies unchanged checksums for Ken payments, allocations, and customer receipts. No customer receipt or actual Ken payment is merged or deleted.
