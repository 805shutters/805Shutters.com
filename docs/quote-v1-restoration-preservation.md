# Quote V1 restoration and preservation

Quote V1 is the only desktop and mobile CRM quoting workspace in this change. Its existing
builder, saved-price, share-link, customer contract, signature, totals, deposit, balance, and
whole-quote version behavior remain connected.

Quote V2 is disconnected from normal CRM navigation, not deleted. Its source, API routes,
migrations, immutable price snapshots, event history, send preparations, import requests,
custom overrides, reprice audits, catalog records, wholesale records, customer details,
signatures, and totals remain intact.

No migration in this change deletes, rewrites, or converts customer or quote records.

## Read-only gap audit

Run:

```sh
npm run audit:quote-v1-preservation
```

The default output contains counts only. Add `-- --details` for quote IDs/numbers and preserved
fact flags. The audit distinguishes:

- complete V1 configuration;
- partial V1 configuration;
- absent legacy configuration (usually older pre-current-CRM records); and
- a V2 import gap, meaning a preserved V2 quote has no CRM/V1 link.

Missing configuration is never inferred or fabricated. Customer contact, signature state,
contract status, saved totals, deposits, and balances are audited separately so available
historical facts remain usable even when product configuration is genuinely absent.

The audit requires a service-role key because its cross-table reads must not weaken production
row-level security. It performs only `select` and exact-count operations.
