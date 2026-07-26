# Lotus three-product cart evidence receipt

This receipt references a private authenticated Lotus portal capture taken on
2026-07-22. The image is deliberately not copied into source control. The
visible `Sign Out` control confirmed that the capture came from the signed-in
dealer experience. The cart was labeled `CODEX PRICING TEST — DO NOT ORDER` and
was not submitted.

- Evidence classification: `portal_dealer_observation`
- SHA-256: `74d2088c10e7317b5e3614c74242f4d9648ed4d8ef35f621bbfbde1641d04915`
- Byte length: `133336`
- Cart total: $156.26
- Items:
  - CAMX3560W, custom 1-inch aluminum, 32 x 55 — portal dealer price $27.84.
    This matches the official dealer-book amount. Customer MSRP was not shown.
  - CFCX4872W, custom 2-inch faux wood, Soft White, 48 x 72 — portal cart price
    $105.00 versus official dealer-book cost $53.97. The price basis or source
    conflict is unresolved, so this observation is quarantined and is not used
    to infer customer retail.
  - VS4372SCWH, stock 3.5-inch vertical, White, 43 x 72 — portal dealer price
    $23.42. The current V2 catalog has no supported stock-SKU pricing route for
    this item. Customer MSRP was not shown.

These observations do not exactly match the dimensions and programs of the
three source-controlled Lotus comparison cases. They are preserved separately
and are not used as case-level parity evidence. No customer MSRP is inferred
from any displayed dealer amount.

No credential, dealer-account identifier, customer name, email, phone number,
address, session value, or authenticated portal URL is retained in this
receipt.
