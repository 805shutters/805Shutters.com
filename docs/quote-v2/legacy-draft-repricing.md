# Quote V2 legacy-draft repricing

This workflow converts an existing **unsent legacy draft** only after a staff
user explicitly previews and confirms the complete V2 result. It never silently
reprices legacy quotes, sent quotes, or historical snapshots.

## 1. Preview

`POST /api/crm/sales-quotes/:id/v2/legacy-reprice/preview`

```json
{
  "expectedRevision": 0,
  "idempotencyKey": "legacy-preview:<unique request id>",
  "selectedDesigns": [
    { "lineItemId": "<uuid>", "designId": "<uuid>" }
  ]
}
```

The caller must explicitly identify exactly one saved design for every one to
40 line items. The server reloads the quote, reconstructs every selection, and
runs the same quote-wide V2 engine used for normal pricing. An unsupported,
incomplete, future-dated, stale, or unpriceable line returns `canApply: false`
and no applicable preview identity.

A successful preview records append-only proof containing hashes, identities,
the legacy and proposed retail totals, and a 30-minute expiry. It does not alter
the quote, its selected designs, totals, lifecycle, or legacy ownership.

## 2. Apply

`POST /api/crm/sales-quotes/:id/v2/legacy-reprice/apply`

```json
{
  "expectedRevision": 0,
  "idempotencyKey": "legacy-apply:<unique request id>",
  "previewId": "<uuid from preview>",
  "previewDigest": "sha256:<digest from preview>",
  "confirmation": "APPLY_V2_REPRICE"
}
```

The server reloads and reprices the quote again. The atomic database function
then locks the quote and independently verifies:

- unsent legacy-draft lifecycle;
- authenticated preview owner;
- expected revision and unexpired preview;
- an exact database-state hash covering the quote, lines, and designs;
- the exact selected-design map;
- the exact quote-wide pricing-batch hash; and
- an unused or identically replayed idempotency key.

Only then does one transaction mark the quote V2, persist immutable retail and
protected-cost snapshots, recompute selected-design-only totals, append the
pricing event, and append the preview-to-event conversion audit. Any failure
rolls the complete transaction back to the unchanged legacy draft.

Customer/API responses are allow-list projections. Dealer cost, landed cost,
freight cost, factors, multiplier, and margin are excluded.

## Rollout boundary

The migration is source-controlled only. It has not been applied to production,
and the existing production-send cutover guard remains disabled. Apply the V2
persistence migrations only after the full catalog, portal-parity, backup, and
rollback gates are approved.
